import { z } from "zod";
import { resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PowerShellProvider } from "../clients/powershell-provider.js";

export function registerMailboxReports(server: McpServer, ps: PowerShellProvider) {
  const wrap = (name: string, desc: string, cmd: string) => (server as any).tool(name, desc, async () => ({ content: [{ type: "text", text: JSON.stringify(await ps.invokeJson(cmd), null, 2) }] }));
  // Helper with params
  const add = (name: string, desc: string, schema: any, fn: (p: any) => Promise<string>) => (server as any).tool(name, desc, schema, async (p: any) => ({ content: [{ type: "text", text: JSON.stringify(await ps.invokeJson(await fn(p)), null, 2) }] }));

  wrap("report.mailbox_inventory", "Mailbox Inventory — All mailboxes", `Get-Mailbox -ResultSize 100 | Select-Object DisplayName,PrimarySmtpAddress,RecipientTypeDetails,Database,ServerName | Select-Object -First 100`);
  wrap("report.mailbox_distribution", "Mailboxes per server/database", `Get-Mailbox -ResultSize 100 | Group-Object Database | Select-Object Name,Count | Sort-Object Count -Descending | Select-Object -First 20`);
  wrap("report.mailbox_location", "User → DB → Server → DAG", `Get-Mailbox -ResultSize 20 | Select-Object DisplayName,Database,ServerName | ForEach-Object { $db=Get-MailboxDatabase $_.Database -ErrorAction SilentlyContinue; [PSCustomObject]@{User=$_.DisplayName; DB=$_.Database; Server=$_.ServerName; DAG=$db.MasterServerOrAvailabilityGroup} } | Select-Object -First 20`);
  wrap("report.mailbox_size", "Size and item count (Get-MailboxStatistics)", `Get-Mailbox -ResultSize 20 | Get-MailboxStatistics | Select-Object DisplayName,TotalItemSize,ItemCount,LastLogonTime | Sort-Object TotalItemSize -Descending | Select-Object -First 20`);
  wrap("report.largest_mailboxes", "Top N largest mailboxes", `Get-Mailbox -ResultSize 50 | Get-MailboxStatistics | Select-Object DisplayName,TotalItemSize,ItemCount | Sort-Object TotalItemSize -Descending | Select-Object -First 10`);
  wrap("report.smallest_mailboxes", "Small/inactive mailboxes", `Get-Mailbox -ResultSize 50 | Get-MailboxStatistics | Where-Object { $_.TotalItemSize.Value.ToBytes() -lt 10MB } | Select-Object DisplayName,TotalItemSize | Select-Object -First 10`);
  server.tool(
    "report.mailbox_growth",
    "Mailbox Growth Report — Current size, Size 7/30/90 days ago, Growth %, Growth rate, Projected size (via local history + linear trend, 30d window)",
    {
      identity: z.string().optional().describe("Mailbox identity, omit for top 20"),
      top: z.number().optional().describe("Top N mailboxes, default 20"),
    },
    async ({ identity, top }) => {
      const n = top ?? 20;
      const historyPath = resolve(process.cwd(), ".exchange-growth.json");
      const now = Date.now();
      const dayMs = 86400000;
      let history: Record<string, { date: string; bytes: number }[]> = {};
      try {
        if (existsSync(historyPath)) history = JSON.parse(readFileSync(historyPath, "utf-8"));
      } catch {}
      const parseBytes = (s: string): number => {
        if (!s) return 0;
        const m = s.match(/\(([\d,]+) bytes\)/);
        if (m) return parseInt(m[1].replace(/,/g, ""), 10);
        const g = s.match(/([\d.]+)\s*GB/i);
        if (g) return parseFloat(g[1]) * 1024 ** 3;
        const mb = s.match(/([\d.]+)\s*MB/i);
        if (mb) return parseFloat(mb[1]) * 1024 ** 2;
        return 0;
      };
      const formatBytes = (b: number) => {
        if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(2)} GB`;
        if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`;
        return `${b} bytes`;
      };
      const filter = identity ? ` -Identity '${identity.replace(/'/g, "''")}'` : "";
      const cmd = identity
        ? `Get-MailboxStatistics -Identity '${identity.replace(/'/g, "''")}' | Select-Object DisplayName,TotalItemSize,ItemCount | Select-Object -First 1`
        : `Get-Mailbox -ResultSize ${n} | Get-MailboxStatistics | Select-Object DisplayName,TotalItemSize,ItemCount | Select-Object -First ${n}`;
      const stats = await ps.invokeJson(cmd);
      const results: any[] = [];
      for (const s of stats as any[]) {
        const name = s.DisplayName as string;
        const curBytes = parseBytes(String(s.TotalItemSize ?? ""));
        const key = name;
        if (!history[key]) history[key] = [];
        history[key].push({ date: new Date(now).toISOString(), bytes: curBytes });
        // Keep last 90 days, one per day (dedup)
        const seen = new Set<string>();
        history[key] = history[key]
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .filter((e) => {
            const d = e.date.slice(0, 10);
            if (seen.has(d) && e !== history[key][history[key].length - 1]) return false;
            seen.add(d);
            return true;
          })
          .slice(-90);
        const findAgo = (days: number) => {
          const target = now - days * dayMs;
          let best: { bytes: number } | null = null;
          for (const e of history[key]) {
            if (new Date(e.date).getTime() <= target) best = e;
          }
          return best?.bytes ?? null;
        };
        const b7 = findAgo(7);
        const b30 = findAgo(30);
        const b90 = findAgo(90);
        const growth7 = b7 ? ((curBytes - b7) / b7) * 100 : null;
        const growth30 = b30 ? ((curBytes - b30) / b30) * 100 : null;
        const growthRatePerDay = b30 ? (curBytes - b30) / 30 : b7 ? (curBytes - b7) / 7 : 0;
        const projected30 = curBytes + growthRatePerDay * 30;
        const projected90 = curBytes + growthRatePerDay * 90;
        results.push({
          mailbox: name,
          currentSize: formatBytes(curBytes),
          currentBytes: curBytes,
          size7DaysAgo: b7 !== null ? formatBytes(b7) : "N/A (no history)",
          size30DaysAgo: b30 !== null ? formatBytes(b30) : "N/A",
          size90DaysAgo: b90 !== null ? formatBytes(b90) : "N/A",
          growthPercent7d: growth7 !== null ? `${growth7.toFixed(1)}%` : "N/A",
          growthPercent30d: growth30 !== null ? `${growth30.toFixed(1)}%` : "N/A",
          growthRate: `${formatBytes(Math.max(0, growthRatePerDay))}/day`,
          projectedSize30d: formatBytes(projected30),
          projectedSize90d: formatBytes(projected90),
          itemCount: s.ItemCount,
          note: history[key].length < 2 ? "Collecting history — run daily for accurate 7/30/90d deltas" : undefined,
        });
      }
      try {
        writeFileSync(historyPath, JSON.stringify(history, null, 2), "utf-8");
      } catch {}
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );
  wrap("report.fastest_growing_mailboxes", "Users consuming storage fastest (by TotalDeletedItemSize delta — snapshot)", `Get-Mailbox -ResultSize 20 | Get-MailboxStatistics | Select-Object DisplayName,TotalItemSize,TotalDeletedItemSize | Select-Object -First 20`);
  wrap("report.mailbox_quota", "Current usage vs quota (ProhibitSendQuota etc.)", `Get-Mailbox -ResultSize 20 | Select-Object DisplayName,ProhibitSendQuota,IssueWarningQuota,UseDatabaseQuotaDefaults | Select-Object -First 20`);
  wrap("report.mailboxes_near_quota", "Users approaching limits (80% usage)", `Get-Mailbox -ResultSize 50 | Get-MailboxStatistics | Where-Object { $_.StorageLimitStatus -like "*Warning*" } | Select-Object DisplayName,StorageLimitStatus,TotalItemSize | Select-Object -First 20`);
  wrap("report.mailbox_over_quota", "Users exceeding quota (ProhibitSend)", `Get-Mailbox -ResultSize 50 | Get-MailboxStatistics | Where-Object { $_.StorageLimitStatus -eq "ProhibitSend" } | Select-Object DisplayName,StorageLimitStatus | Select-Object -First 20`);
  wrap("report.mailbox_type", "User/shared/room/equipment/etc. distribution", `Get-Mailbox -ResultSize 100 | Group-Object RecipientTypeDetails | Select-Object Name,Count`);
  wrap("report.shared_mailbox", "Shared mailbox inventory", `Get-Mailbox -RecipientTypeDetails SharedMailbox -ResultSize 50 | Select-Object DisplayName,PrimarySmtpAddress | Select-Object -First 20`);
  wrap("report.room_mailbox", "Meeting rooms", `Get-Mailbox -RecipientTypeDetails RoomMailbox -ResultSize 20 | Select-Object DisplayName,ResourceCapacity | Select-Object -First 20`);
  wrap("report.equipment_mailbox", "Equipment resources", `Get-Mailbox -RecipientTypeDetails EquipmentMailbox -ResultSize 20 | Select-Object DisplayName | Select-Object -First 20`);
  wrap("report.arbitration_mailbox", "Arbitration/system mailboxes", `Get-Mailbox -Arbitration -ResultSize 20 | Select-Object DisplayName,ServerName | Select-Object -First 20`);
  wrap("report.discovery_mailbox", "Discovery mailboxes", `Get-Mailbox -RecipientTypeDetails DiscoveryMailbox -ResultSize 20 | Select-Object DisplayName | Select-Object -First 20`);
  wrap("report.archive_mailbox", "Archive status and size (already exists as report.generate_archive_report, alias)", `Get-Mailbox -ResultSize 20 | Select-Object DisplayName,ArchiveStatus,ArchiveDatabase | Select-Object -First 20`);
  wrap("report.mailbox_litigation_hold", "Hold-enabled mailboxes (LitigationHold)", `Get-Mailbox -ResultSize 50 | Where-Object { $_.LitigationHoldEnabled } | Select-Object DisplayName,LitigationHoldDuration | Select-Object -First 20`);
  wrap("report.mailbox_retention_policy", "Retention configuration per mailbox", `Get-Mailbox -ResultSize 20 | Select-Object DisplayName,RetentionPolicy,RetentionHoldEnabled | Select-Object -First 20`);
  wrap("report.mailbox_inactive", "No activity for X days", `Get-Mailbox -ResultSize 50 | Get-MailboxStatistics | Where-Object { $_.LastLogonTime -lt (Get-Date).AddDays(-30) } | Select-Object DisplayName,LastLogonTime | Select-Object -First 20`);
  wrap("report.mailbox_disabled_users", "Disabled AD accounts with mailboxes", `Get-Mailbox -ResultSize 50 | Where-Object { (Get-User $_.Identity -ErrorAction SilentlyContinue).UserAccountControl -match "AccountDisabled" } | Select-Object DisplayName | Select-Object -First 20`);
  wrap("report.orphaned_mailboxes", "Mailboxes without expected AD association (disconnected)", `Get-MailboxStatistics | Where-Object { $_.DisconnectReason -ne $null } | Select-Object DisplayName,DisconnectReason | Select-Object -First 20`);
  wrap("report.mailbox_database_distribution", "DB-level mailbox distribution", `Get-MailboxDatabase | ForEach-Object { [PSCustomObject]@{DB=$_.Name; Count=(Get-Mailbox -Database $_.Name -ResultSize 1000 | Measure-Object).Count} } | Select-Object -First 20`);
  wrap("report.mailbox_statistics", "Detailed mailbox statistics (alias)", `Get-Mailbox -ResultSize 10 | Get-MailboxStatistics | Select-Object DisplayName,ItemCount,TotalItemSize,LastLogonTime,Database | Select-Object -First 10`);
  wrap("report.mailbox_last_logon", "Last user access", `Get-Mailbox -ResultSize 20 | Get-MailboxStatistics | Select-Object DisplayName,LastLogonTime,LastLoggedOnUserAccount | Sort-Object LastLogonTime | Select-Object -First 20`);
  add("report.mailbox_creation_trend", "New mailboxes over time (WhenCreated)", { days: z.number().optional() }, async (p) => `Get-Mailbox -ResultSize 100 | Where-Object { $_.WhenCreated -gt (Get-Date).AddDays(-${p.days ?? 30}) } | Group-Object { $_.WhenCreated.ToString("yyyy-MM-dd") } | Select-Object Name,Count | Sort-Object Name`);
  add("report.mailbox_deletion_trend", "Deleted mailboxes (soft-deleted)", { days: z.number().optional() }, async (p) => `Get-Mailbox -SoftDeletedMailbox -ResultSize 50 | Where-Object { $_.WhenSoftDeleted -gt (Get-Date).AddDays(-${p.days ?? 30}) } | Select-Object DisplayName,WhenSoftDeleted | Select-Object -First 20`);
  wrap("report.mailbox_forwarding", "Internal/external forwarding (ForwardingAddress, ForwardingSmtpAddress)", `Get-Mailbox -ResultSize 50 | Where-Object { $_.ForwardingAddress -ne $null -or $_.ForwardingSmtpAddress -ne $null } | Select-Object DisplayName,ForwardingAddress,ForwardingSmtpAddress,DeliverToMailboxAndForward | Select-Object -First 20`);
  wrap("report.mailbox_delegation", "Delegates and permissions (FullAccess)", `Get-Mailbox -ResultSize 10 | ForEach-Object { Get-MailboxPermission -Identity $_.Identity | Where-Object { $_.User -notlike "NT AUTHORITY*" } | Select-Object Identity,User,AccessRights } | Select-Object -First 20`);
  wrap("report.mailbox_autoreply", "Out-of-office configuration (Get-MailboxAutoReplyConfiguration)", `Get-Mailbox -ResultSize 20 | Get-MailboxAutoReplyConfiguration | Where-Object { $_.AutoReplyState -ne "Disabled" } | Select-Object Identity,AutoReplyState | Select-Object -First 20`);
  wrap("report.mailbox_mobile_access", "ActiveSync-enabled users (Get-CASMailbox ActiveSyncEnabled)", `Get-CASMailbox -ResultSize 50 | Where-Object { $_.ActiveSyncEnabled } | Select-Object Identity,ActiveSyncEnabled | Select-Object -First 20`);
  wrap("report.mailbox_owa_access", "OWA-enabled users", `Get-CASMailbox -ResultSize 50 | Where-Object { $_.OWAEnabled } | Select-Object Identity | Select-Object -First 20`);
  wrap("report.mailbox_mapi_access", "MAPI-enabled users", `Get-CASMailbox -ResultSize 50 | Where-Object { $_.MAPIEnabled } | Select-Object Identity | Select-Object -First 20`);
  wrap("report.mailbox_pop_imap", "POP/IMAP-enabled users", `Get-CASMailbox -ResultSize 50 | Where-Object { $_.PopEnabled -or $_.ImapEnabled } | Select-Object Identity,PopEnabled,ImapEnabled | Select-Object -First 20`);
  wrap("report.mailbox_ews_usage", "EWS-enabled users (EwsEnabled)", `Get-CASMailbox -ResultSize 50 | Select-Object Identity,EwsEnabled | Select-Object -First 20`);
}
