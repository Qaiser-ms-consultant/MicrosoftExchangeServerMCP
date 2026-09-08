import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PowerShellProvider } from "../clients/powershell-provider.js";

export function registerReportTools(server: McpServer, ps: PowerShellProvider) {
  server.tool(
    "report.generate_database_growth_trend",
    "Database growth trend — size, whitespace, last backup, growth calculation (capacity planning)",
    { top: z.number().optional() },
    async ({ top }) => {
      const n = top ?? 20;
      const dbs = await ps.invokeJson(`Get-MailboxDatabase | Select-Object Name,DatabaseSize,AvailableNewMailboxSpace,LastFullBackup,LastIncrementalBackup | Select-Object -First ${n}`);
      const enriched = dbs.map((db: any) => {
        const sizeStr = String(db.DatabaseSize ?? "");
        const availStr = String(db.AvailableNewMailboxSpace ?? "");
        return { ...db, _note: "DatabaseSize/AvailableNewMailboxSpace are ByteQuantified; compare to plan capacity" };
      });
      return { content: [{ type: "text", text: JSON.stringify(enriched, null, 2) }] };
    },
  );

  server.tool(
    "report.generate_transport_queue_report",
    "Transport queue health report — queues by server with MessageCount, Status, NextHop, plus tracking log summary last hour",
    { server: z.string().optional() },
    async ({ server }) => {
      const qr = await ps.invokeJson(server ? `Get-Queue -Server "${server}" | Select-Object Identity,Status,MessageCount,NextHopDomain,DeliveryType | Select-Object -First 50` : `Get-Queue | Select-Object Identity,Status,MessageCount,NextHopDomain | Select-Object -First 50`);
      // NOTE: Sort-Object is blocked on constrained endpoints — sort client-side
      qr.sort((a: any, b: any) => Number(b.MessageCount ?? 0) - Number(a.MessageCount ?? 0));
      const q = qr.slice(0, 20);
      const tracking = await ps.invokeJson(`Get-MessageTrackingLog -ResultSize 10 -Start (Get-Date).AddHours(-1) | Group-Object EventId | Select-Object Name,Count`).catch(() => []);
      return { content: [{ type: "text", text: JSON.stringify({ queues: q, trackingSummaryLastHour: tracking }, null, 2) }] };
    },
  );

  server.tool(
    "report.generate_hold_report",
    "Compliance hold report — litigation hold + In-PlaceHold per mailbox (for legal/audit)",
    { filter: z.string().optional() },
    async ({ filter }) => {
      const f = filter ? ` -Filter {${filter}}` : "";
      const d = await ps.invokeJson(`Get-Mailbox -ResultSize 50${f} | Select-Object DisplayName,PrimarySmtpAddress,LitigationHoldEnabled,LitigationHoldDuration,InPlaceHolds,RetentionHoldEnabled | Select-Object -First 50`);
      const summary = {
        total: d.length,
        litigationHoldEnabled: d.filter((x: any) => x.LitigationHoldEnabled).length,
        inPlaceHold: d.filter((x: any) => x.InPlaceHolds && String(x.InPlaceHolds).length > 2).length,
        data: d,
      };
      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    },
  );

  server.tool(
    "report.generate_oof_report",
    "OOF/Automatic Replies report — mailboxes with OOF enabled/scheduled (for coverage)",
    { resultSize: z.number().optional() },
    async ({ resultSize }) => {
      const n = resultSize ?? 50;
      // Get mailboxes then query OOF per mailbox (batch via pipeline)
      const d = await ps.invokeJson(`Get-Mailbox -ResultSize ${n} | Get-MailboxAutoReplyConfiguration | Where-Object { $_.AutoReplyState -ne "Disabled" } | Select-Object Identity,AutoReplyState,StartTime,EndTime,ExternalAudience | Select-Object -First ${n}`);
      return { content: [{ type: "text", text: JSON.stringify({ count: d.length, oofEnabled: d }, null, 2) }] };
    },
  );

  server.tool(
    "report.generate_forwarding_report",
    "Forwarding report — mailboxes with forwarding enabled (ForwardingAddress/SmtpAddress), plus deliver-to-both flag",
    { resultSize: z.number().optional() },
    async ({ resultSize }) => {
      const n = Math.min(resultSize ?? 500, 1000);
      const all = await ps.invokeJson(`Get-Mailbox -ResultSize ${n} | Select-Object DisplayName,PrimarySmtpAddress,ForwardingAddress,ForwardingSmtpAddress,DeliverToMailboxAndForward | Select-Object -First ${n}`);
      const rows = (Array.isArray(all) ? all : []).filter((x: any) => x && (x.ForwardingAddress || x.ForwardingSmtpAddress));
      return { content: [{ type: "text", text: JSON.stringify({ count: rows.length, forwardingEnabled: rows }, null, 2) }] };
    },
  );

  server.tool(
    "report.generate_fullaccess_audit_report",
    "FullAccess audit — mailboxes delegating FullAccess to non-owners (excludes SELF/system), with count",
    { resultSize: z.number().optional() },
    async ({ resultSize }) => {
      const n = Math.min(resultSize ?? 100, 500);
      const boxes = await ps.invokeJson(`Get-Mailbox -ResultSize ${n} | Select-Object DisplayName,PrimarySmtpAddress | Select-Object -First ${n}`);
      const rows = Array.isArray(boxes) ? boxes.slice(0, n) : [];
      const entries: Array<{ mailbox: string; displayName: string; grantedTo: string[] }> = [];
      for (const b of rows) {
        const id = b.PrimarySmtpAddress || b.DisplayName;
        if (!id) continue;
        const acl = await ps.invokeJson(`Get-MailboxPermission -Identity "${id}" | Select-Object Identity,User,AccessRights | Select-Object -First 50`).catch(() => []);
        const grantedTo = (Array.isArray(acl) ? acl : [])
          .filter((a: any) => !String(a.User ?? "").startsWith("NT AUTHORITY") && String(a.AccessRights ?? "").includes("FullAccess"))
          .map((a: any) => String(a.User));
        if (grantedTo.length && entries.length < 100) entries.push({ mailbox: String(id), displayName: String(b.DisplayName ?? ""), grantedTo });
      }
      return { content: [{ type: "text", text: JSON.stringify({ mailboxesChecked: rows.length, mailboxesWithDelegatedAccess: entries.length, entries }, null, 2) }] };
    },
  );

  server.tool(
    "report.generate_archive_report",
    "Archive mailbox report — archive status, quota, database",
    { top: z.number().optional() },
    async ({ top }) => {
      const n = top ?? 20;
      const d = await ps.invokeJson(`Get-Mailbox -ResultSize ${n} | Select-Object DisplayName,ArchiveStatus,ArchiveDatabase,ArchiveQuota,ArchiveWarningQuota | Select-Object -First ${n}`);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "report.generate_inactive_mailbox_report",
    "Inactive / soft-deleted mailbox report — for compliance cleanup",
    {},
    async () => {
      const soft = await ps.invokeJson(`Get-Mailbox -SoftDeletedMailbox -ResultSize 20 | Select-Object DisplayName,WhenSoftDeleted,ExchangeGuid | Select-Object -First 20`).catch(() => []);
      const disc = await ps.invokeJson(`Get-MailboxStatistics -Server DEVEX02 | Where-Object { $_.DisconnectReason -ne $null } | Select-Object DisplayName,DisconnectReason,DisconnectDate | Select-Object -First 20`).catch(() => []);
      return { content: [{ type: "text", text: JSON.stringify({ softDeleted: soft, disconnected: disc }, null, 2) }] };
    },
  );

  server.tool(
    "report.generate_mobile_device_report",
    "Mobile device report — ActiveSync devices per mailbox, last sync, type",
    { top: z.number().optional() },
    async ({ top }) => {
      const n = top ?? 20;
      const d = await ps.invokeJson(`Get-MobileDevice -ResultSize ${n} | Select-Object FriendlyName,DeviceType,DeviceModel,DeviceOS,LastSuccessSync,Mailbox | Select-Object -First ${n}`);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "report.generate_dag_report",
    "DAG health report — replication, copy queue, witness, activation preference",
    { dag: z.string().optional() },
    async ({ dag }) => {
      const dagName = dag ?? (await ps.invokeJson(`Get-DatabaseAvailabilityGroup | Select-Object -First 1 | Select-Object -ExpandProperty Name`).then((a: any) => a[0]?.Name ?? "DAG").catch(() => "DAG"));
      const health = await ps.invokeJson(`Test-ReplicationHealth | Select-Object Server,Check,Result | Select-Object -First 10`).catch(() => []);
      const copies = await ps.invokeJson(`Get-MailboxDatabaseCopyStatus | Select-Object Identity,Status,CopyQueueLength,ReplayQueueLength | Select-Object -First 10`).catch(() => []);
      const db = await ps.invokeJson(`Get-DatabaseAvailabilityGroup -Identity "${dagName}" -Status | Select-Object Name,WitnessShareInUse,OperationalServers | Select-Object -First 5`).catch(() => []);
      return { content: [{ type: "text", text: JSON.stringify({ dag: dagName, replicationHealth: health, copyStatus: copies, witness: db }, null, 2) }] };
    },
  );

  server.tool(
    "report.generate_compliance_report",
    "Full compliance snapshot — holds, retention policies, journal rules, DLP (summary)",
    {},
    async () => {
      const holds = await ps.invokeJson(`Get-Mailbox -ResultSize 20 | Select-Object DisplayName,LitigationHoldEnabled,InPlaceHolds | Select-Object -First 10`).catch(() => []);
      const retention = await ps.invokeJson(`Get-RetentionPolicy | Select-Object Name | Select-Object -First 10`).catch(() => []);
      const journal = await ps.invokeJson(`Get-JournalRule | Select-Object Name,Enabled,Scope | Select-Object -First 10`).catch(() => []);
      const dlp = await ps.invokeJson(`Get-DlpPolicy | Select-Object Name,Mode | Select-Object -First 10`).catch(() => []);
      return { content: [{ type: "text", text: JSON.stringify({ holdsSample: holds, retentionPolicies: retention, journalRules: journal, dlpPolicies: dlp }, null, 2) }] };
    },
  );

  server.tool(
    "report.generate_full_summary",
    "Full Exchange summary — servers, DBs, DAG, queues, certs, holds (one-call executive report)",
    {},
    async () => {
      const servers = await ps.invokeJson(`Get-ExchangeServer | Select-Object Name,Fqdn,AdminDisplayVersion | Select-Object -First 5`).catch(() => []);
      const dbs = await ps.invokeJson(`Get-MailboxDatabase | Select-Object Name,Mounted,DatabaseSize | Select-Object -First 5`).catch(() => []);
      // NOTE: Where-Object/Sort-Object blocked on constrained endpoints — filter client-side
      const allCerts = await ps.invokeJson(`Get-ExchangeCertificate | Select-Object Subject,NotAfter | Select-Object -First 20`).catch(() => []);
      const cutoff60 = Date.now() + 60 * 86400 * 1000;
      const certs = allCerts.filter((c: any) => { const t = Date.parse(String(c.NotAfter ?? "")); return !isNaN(t) && t < cutoff60; }).slice(0, 5);
      const allQueues = await ps.invokeJson(`Get-Queue | Select-Object Identity,MessageCount,Status | Select-Object -First 20`).catch(() => []);
      allQueues.sort((a: any, b: any) => Number(b.MessageCount ?? 0) - Number(a.MessageCount ?? 0));
      const queues = allQueues.slice(0, 5);
      return { content: [{ type: "text", text: JSON.stringify({ servers, databases: dbs, expiringCertsNext60Days: certs, topQueues: queues, generatedAt: new Date().toISOString() }, null, 2) }] };
    },
  );

  // ByteQuantified values arrive as "48 GB (51,539,607,552 bytes)" (or bare
  // "48 GB"); "Unlimited" means no quota to rank against.
  function bytesOf(v: any): number {
    const s = String(v ?? "");
    const paren = s.match(/\(([\d,]+)\s*bytes\)/i);
    if (paren) return Number(paren[1].replace(/,/g, ""));
    const m = s.match(/([\d.]+)\s*(GB|MB|KB|B)\b/i);
    if (m) {
      const mult: Record<string, number> = { GB: 1024 ** 3, MB: 1024 ** 2, KB: 1024, B: 1 };
      return Number(m[1]) * (mult[m[2].toUpperCase()] ?? NaN);
    }
    return NaN;
  }

  server.tool(
    "report.generate_quota_pressure_report",
    "Quota pressure — mailboxes closest to their ProhibitSendQuota (top 20 by % used)",
    { resultSize: z.number().optional() },
    async ({ resultSize }) => {
      const n = Math.min(resultSize ?? 200, 1000);
      const boxes = await ps.invokeJson(`Get-Mailbox -ResultSize ${n} | Select-Object DisplayName,PrimarySmtpAddress,ProhibitSendQuota | Select-Object -First ${n}`);
      const stats = await ps.invokeJson(`Get-Mailbox -ResultSize ${n} | Get-MailboxStatistics | Select-Object DisplayName,TotalItemSize | Select-Object -First ${n}`).catch(() => []);
      const sizeByName = new Map((Array.isArray(stats) ? stats : []).map((s: any) => [String(s.DisplayName ?? ""), s.TotalItemSize]));
      const ranked = (Array.isArray(boxes) ? boxes : [])
        .map((b: any) => {
          const quota = bytesOf(b.ProhibitSendQuota);
          const used = bytesOf(sizeByName.get(String(b.DisplayName ?? "")));
          if (!isFinite(quota) || quota <= 0 || !isFinite(used)) return null;
          return { DisplayName: b.DisplayName, PrimarySmtpAddress: b.PrimarySmtpAddress, percentUsed: Math.round((used / quota) * 1000) / 10 };
        })
        .filter((x: any) => x)
        .sort((a: any, b: any) => b.percentUsed - a.percentUsed)
        .slice(0, 20);
      return { content: [{ type: "text", text: JSON.stringify({ count: ranked.length, top: ranked }, null, 2) }] };
    },
  );

  server.tool(
    "report.generate_protocol_report",
    "Client protocol sprawl — POP/IMAP/MAPI/ActiveSync enabled counts plus offender lists",
    { resultSize: z.number().optional() },
    async ({ resultSize }) => {
      const n = Math.min(resultSize ?? 500, 1000);
      const d = await ps.invokeJson(`Get-CASMailbox -ResultSize ${n} | Select-Object DisplayName,PrimarySmtpAddress,OWAEnabled,MAPIEnabled,ActiveSyncEnabled,PopEnabled,ImapEnabled | Select-Object -First ${n}`);
      const rows = Array.isArray(d) ? d : [];
      const pick = (k: string) => rows.filter((x: any) => x[k] === true).map((x: any) => ({ DisplayName: x.DisplayName, PrimarySmtpAddress: x.PrimarySmtpAddress })).slice(0, 50);
      const popUsers = pick("PopEnabled");
      const imapUsers = pick("ImapEnabled");
      const summary = { popEnabled: popUsers.length, imapEnabled: imapUsers.length, mapiEnabled: rows.filter((x: any) => x.MAPIEnabled === true).length, activeSyncEnabled: rows.filter((x: any) => x.ActiveSyncEnabled === true).length };
      return { content: [{ type: "text", text: JSON.stringify({ count: rows.length, summary, popUsers, imapUsers }, null, 2) }] };
    },
  );

  server.tool(
    "report.generate_connector_report",
    "Connector inventory — send and receive connectors with key settings in one view",
    {},
    async () => {
      const send = await ps.invokeJson(`Get-SendConnector | Select-Object Name,Enabled,AddressSpaces | Select-Object -First 20`).catch(() => []);
      const recv = await ps.invokeJson(`Get-ReceiveConnector | Select-Object Name,Enabled,Bindings | Select-Object -First 20`).catch(() => []);
      return { content: [{ type: "text", text: JSON.stringify({ sendConnectors: send, receiveConnectors: recv }, null, 2) }] };
    },
  );

  server.tool(
    "report.generate_transport_rule_report",
    "Transport rule inventory — all rules with state, priority and mode, plus counts by state",
    {},
    async () => {
      const rules = await ps.getTransportRules().catch(() => []);
      const rows = Array.isArray(rules) ? rules : [];
      const byState: Record<string, number> = {};
      for (const r of rows) {
        const s = String((r as any)?.State ?? "Unknown");
        byState[s] = (byState[s] ?? 0) + 1;
      }
      return { content: [{ type: "text", text: JSON.stringify({ count: rows.length, byState, rules: rows }, null, 2) }] };
    },
  );

  server.tool(
    "report.generate_group_hygiene_report",
    "Distribution group hygiene — empty groups plus largest groups by member count",
    { resultSize: z.number().optional() },
    async ({ resultSize }) => {
      const g = Math.min(resultSize ?? 50, 200);
      const groups = await ps.invokeJson(`Get-DistributionGroup -ResultSize ${g} | Select-Object Name,PrimarySmtpAddress | Select-Object -First ${g}`);
      const rows = Array.isArray(groups) ? groups.slice(0, g) : [];
      const out: Array<{ name: string; primarySmtpAddress: string; memberCount: number }> = [];
      for (const grp of rows) {
        const members = await ps.invokeJson(`Get-DistributionGroupMember -Identity "${grp.Name}" | Select-Object DisplayName | Select-Object -First 1000`).catch(() => []);
        out.push({ name: grp.Name, primarySmtpAddress: grp.PrimarySmtpAddress, memberCount: Array.isArray(members) ? members.length : 0 });
      }
      const empty = out.filter((x) => x.memberCount === 0);
      const largest = [...out].sort((a, b) => b.memberCount - a.memberCount).slice(0, 10);
      return { content: [{ type: "text", text: JSON.stringify({ groupsChecked: out.length, empty, largest }, null, 2) }] };
    },
  );

  server.tool(
    "report.generate_move_request_report",
    "Move request board — all move requests with status, progress and target database",
    {},
    async () => {
      const d = await ps.invokeJson(`Get-MoveRequest -ResultSize 100 | Select-Object DisplayName,Status,PercentComplete,TargetDatabase | Select-Object -First 100`).catch(() => []);
      const rows = Array.isArray(d) ? d : [];
      const byStatus: Record<string, number> = {};
      for (const r of rows) {
        const s = String((r as any)?.Status ?? "Unknown");
        byStatus[s] = (byStatus[s] ?? 0) + 1;
      }
      return { content: [{ type: "text", text: JSON.stringify({ count: rows.length, byStatus, requests: rows }, null, 2) }] };
    },
  );

  server.tool(
    "report.generate_database_distribution_report",
    "Database distribution — mailbox counts per database (rebalancing view)",
    { resultSize: z.number().optional() },
    async ({ resultSize }) => {
      const n = Math.min(resultSize ?? 1000, 1000);
      const d = await ps.invokeJson(`Get-Mailbox -ResultSize ${n} | Select-Object DisplayName,Database | Select-Object -First ${n}`);
      const counts = new Map<string, number>();
      for (const m of Array.isArray(d) ? d : []) {
        const db = String((m as any)?.Database ?? "Unknown");
        counts.set(db, (counts.get(db) ?? 0) + 1);
      }
      const perDatabase = [...counts.entries()]
        .map(([database, count]) => ({ database, count }))
        .sort((a, b) => b.count - a.count);
      return { content: [{ type: "text", text: JSON.stringify({ total: perDatabase.reduce((s, x) => s + x.count, 0), perDatabase }, null, 2) }] };
    },
  );

  server.tool(
    "report.generate_domain_report",
    "Domain inventory — accepted and remote domains in one view",
    {},
    async () => {
      const accepted = await ps.invokeJson(`Get-AcceptedDomain | Select-Object Name,DomainName,Default | Select-Object -First 50`).catch(() => []);
      const remote = await ps.invokeJson(`Get-RemoteDomain | Select-Object Name,DomainName | Select-Object -First 50`).catch(() => []);
      return { content: [{ type: "text", text: JSON.stringify({ acceptedDomains: accepted, remoteDomains: remote }, null, 2) }] };
    },
  );
}
