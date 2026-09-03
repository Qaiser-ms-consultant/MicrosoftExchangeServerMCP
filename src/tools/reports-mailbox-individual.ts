import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PowerShellProvider } from "../clients/powershell-provider.js";

export function registerIndividualMailboxReports(server: McpServer, ps: PowerShellProvider) {
  server.tool(
    "report.mailbox_detail",
    "Individual Mailbox Report — comprehensive per-mailbox (identity) — Get-Mailbox + Statistics + Permissions + OOF + Hold + Quota",
    { identity: z.string().describe("Mailbox identity, e.g. devlabadmin@devlab2025.local") },
    async ({ identity }) => {
      const id = identity.replace(/'/g, "''");
      const [mbx, stats, oof, hold, perms] = await Promise.all([
        ps.invokeJson(`Get-Mailbox -Identity '${id}' | Select-Object DisplayName,PrimarySmtpAddress,RecipientTypeDetails,Database,ServerName,OrganizationalUnit,WhenCreated | Select-Object -First 1`).catch(() => []),
        ps.invokeJson(`Get-MailboxStatistics -Identity '${id}' | Select-Object DisplayName,ItemCount,TotalItemSize,TotalDeletedItemSize,LastLogonTime,Database | Select-Object -First 1`).catch(() => []),
        ps.invokeJson(`Get-MailboxAutoReplyConfiguration -Identity '${id}' | Select-Object AutoReplyState,StartTime,EndTime | Select-Object -First 1`).catch(() => []),
        ps.invokeJson(`Get-Mailbox -Identity '${id}' | Select-Object LitigationHoldEnabled,InPlaceHolds,RetentionHoldEnabled | Select-Object -First 1`).catch(() => []),
        ps.invokeJson(`Get-MailboxPermission -Identity '${id}' | Where-Object { $_.User -notlike "NT AUTHORITY*" } | Select-Object User,AccessRights | Select-Object -First 5`).catch(() => []),
      ]);
      return { content: [{ type: "text", text: JSON.stringify({ mailbox: (mbx as any[])[0] ?? null, statistics: (stats as any[])[0] ?? null, oof: (oof as any[])[0] ?? null, hold: (hold as any[])[0] ?? null, permissions: perms }, null, 2) }] };
    },
  );

  server.tool(
    "report.mailbox_health_individual",
    "Individual Mailbox Health — per-mailbox health (quota, hold, InboxRules, folder permissions)",
    { identity: z.string() },
    async ({ identity }) => {
      const id = identity.replace(/'/g, "''");
      const [quota, rules, health] = await Promise.all([
        ps.invokeJson(`Get-Mailbox -Identity '${id}' | Select-Object ProhibitSendQuota,IssueWarningQuota,UseDatabaseQuotaDefaults | Select-Object -First 1`).catch(() => []),
        ps.invokeJson(`Get-InboxRule -Mailbox '${id}' | Select-Object Name,Enabled | Select-Object -First 5`).catch(() => []),
        ps.invokeJson(`Get-MailboxStatistics -Identity '${id}' | Select-Object StorageLimitStatus,TotalItemSize | Select-Object -First 1`).catch(() => []),
      ]);
      return { content: [{ type: "text", text: JSON.stringify({ quota: (quota as any[])[0], rules, health: (health as any[])[0] }, null, 2) }] };
    },
  );

  server.tool(
    "report.mailbox_compliance_individual",
    "Individual Compliance — per-mailbox LitigationHold, InPlaceHold, RetentionPolicy, Journal, Audit",
    { identity: z.string() },
    async ({ identity }) => {
      const id = identity.replace(/'/g, "''");
      const [hold, retention, audit] = await Promise.all([
        ps.invokeJson(`Get-Mailbox -Identity '${id}' | Select-Object LitigationHoldEnabled,InPlaceHolds | Select-Object -First 1`).catch(() => []),
        ps.invokeJson(`Get-Mailbox -Identity '${id}' | Select-Object RetentionPolicy,RetentionHoldEnabled | Select-Object -First 1`).catch(() => []),
        ps.invokeJson(`Search-MailboxAuditLog -Identity '${id}' -ShowDetails -ResultSize 5 | Select-Object Operation,LogonType | Select-Object -First 5`).catch(() => []),
      ]);
      return { content: [{ type: "text", text: JSON.stringify({ hold: (hold as any[])[0], retention: (retention as any[])[0], recentAudit: audit }, null, 2) }] };
    },
  );

  server.tool(
    "report.mailbox_forwarding_individual",
    "Individual Forwarding — per-mailbox ForwardingAddress/SmtpAddress, DeliverToMailboxAndForward, plus InboxRules forwarding",
    { identity: z.string() },
    async ({ identity }) => {
      const id = identity.replace(/'/g, "''");
      const [fwd, rules] = await Promise.all([
        ps.invokeJson(`Get-Mailbox -Identity '${id}' | Select-Object ForwardingAddress,ForwardingSmtpAddress,DeliverToMailboxAndForward | Select-Object -First 1`).catch(() => []),
        ps.invokeJson(`Get-InboxRule -Mailbox '${id}' | Where-Object { $_.ForwardTo -ne $null -or $_.RedirectTo -ne $null } | Select-Object Name,ForwardTo,RedirectTo | Select-Object -First 5`).catch(() => []),
      ]);
      return { content: [{ type: "text", text: JSON.stringify({ forwarding: (fwd as any[])[0], inboxForwardingRules: rules }, null, 2) }] };
    },
  );

  server.tool(
    "report.mailbox_permissions_individual",
    "Individual Permissions — per-mailbox FullAccess, SendAs, SendOnBehalf, Folder Permissions, Delegates",
    { identity: z.string() },
    async ({ identity }) => {
      const id = identity.replace(/'/g, "''");
      const [full, sendAs, folder] = await Promise.all([
        ps.invokeJson(`Get-MailboxPermission -Identity '${id}' | Where-Object { $_.AccessRights -like "*FullAccess*" } | Select-Object User,AccessRights | Select-Object -First 10`).catch(() => []),
        ps.invokeJson(`Get-RecipientPermission -Identity '${id}' | Select-Object Trustee,AccessRights | Select-Object -First 10`).catch(() => []),
        ps.invokeJson(`Get-MailboxFolderPermission -Identity '${id}:\\Calendar' -ErrorAction SilentlyContinue | Select-Object User,AccessRights | Select-Object -First 10`).catch(() => []),
      ]);
      return { content: [{ type: "text", text: JSON.stringify({ fullAccess: full, sendAs, calendar: folder }, null, 2) }] };
    },
  );

  server.tool(
    "report.mailbox_client_access_individual",
    "Individual Client Access — per-mailbox CAS: OWA, MAPI, ActiveSync, POP/IMAP, EWS, OOF",
    { identity: z.string() },
    async ({ identity }) => {
      const id = identity.replace(/'/g, "''");
      const [cas, oof, devices] = await Promise.all([
        ps.invokeJson(`Get-CASMailbox -Identity '${id}' | Select-Object OWAEnabled,MAPIEnabled,ActiveSyncEnabled,PopEnabled,ImapEnabled,EwsEnabled | Select-Object -First 1`).catch(() => []),
        ps.invokeJson(`Get-MailboxAutoReplyConfiguration -Identity '${id}' | Select-Object AutoReplyState | Select-Object -First 1`).catch(() => []),
        ps.invokeJson(`Get-MobileDevice -Mailbox '${id}' | Select-Object FriendlyName,DeviceType,LastSuccessSync | Select-Object -First 5`).catch(() => []),
      ]);
      return { content: [{ type: "text", text: JSON.stringify({ cas: (cas as any[])[0], oof: (oof as any[])[0], devices }, null, 2) }] };
    },
  );

  server.tool(
    "report.mailbox_size_individual",
    "Individual Mailbox Size — per-mailbox ItemCount, TotalItemSize, Deleted, Quota vs Usage",
    { identity: z.string() },
    async ({ identity }) => {
      const id = identity.replace(/'/g, "''");
      const [stats, quota] = await Promise.all([
        ps.invokeJson(`Get-MailboxStatistics -Identity '${id}' | Select-Object DisplayName,ItemCount,TotalItemSize,TotalDeletedItemSize,Database | Select-Object -First 1`).catch(() => []),
        ps.invokeJson(`Get-Mailbox -Identity '${id}' | Select-Object ProhibitSendQuota,IssueWarningQuota,ProhibitSendReceiveQuota | Select-Object -First 1`).catch(() => []),
      ]);
      return { content: [{ type: "text", text: JSON.stringify({ statistics: (stats as any[])[0], quota: (quota as any[])[0] }, null, 2) }] };
    },
  );

  server.tool(
    "report.mailbox_activity_individual",
    "Individual Activity — per-mailbox LastLogon, LastLoggedOnUser, InboxRules count, Mobile last sync (legacy)",
    { identity: z.string() },
    async ({ identity }) => {
      const id = identity.replace(/'/g, "''");
      const [stats, rules, mobile] = await Promise.all([
        ps.invokeJson(`Get-MailboxStatistics -Identity '${id}' | Select-Object LastLogonTime,LastLoggedOnUserAccount | Select-Object -First 1`).catch(() => []),
        ps.invokeJson(`Get-InboxRule -Mailbox '${id}' | Measure-Object | Select-Object -ExpandProperty Count`).catch(() => 0),
        ps.invokeJson(`Get-MobileDevice -Mailbox '${id}' | Select-Object -First 1 | Select-Object LastSuccessSync | Select-Object -First 1`).catch(() => []),
      ]);
      return { content: [{ type: "text", text: JSON.stringify({ lastActivity: (stats as any[])[0], inboxRulesCount: rules, lastMobileSync: (mobile as any[])[0] ?? null }, null, 2) }] };
    },
  );

  server.tool(
    "report.mailbox_activity",
    "Mailbox Activity — useful per-mailbox statistics: Messages received, Messages sent, Internal, External, Average daily, Peak sending/receiving day, Last activity, Last logon (via MessageTrackingLog + Statistics, 30-day window) — legacy alias for mailflow profile",
    {
      identity: z.string().describe("Mailbox SMTP address, e.g. devlabadmin@devlab2025.local"),
      days: z.number().optional().describe("Window in days, default 30"),
    },
    async ({ identity, days }) => {
      const d = days ?? 30;
      const addr = identity.replace(/'/g, "''");
      const [sent, recv, stats] = await Promise.all([
        ps.invokeJson(`Get-MessageTrackingLog -ResultSize 500 -Start (Get-Date).AddDays(-${d}) -Sender '${addr}' -EventId SEND | Measure-Object | Select-Object -ExpandProperty Count`).catch(() => 0),
        ps.invokeJson(`Get-MessageTrackingLog -ResultSize 500 -Start (Get-Date).AddDays(-${d}) -Recipients '${addr}' -EventId DELIVER | Measure-Object | Select-Object -ExpandProperty Count`).catch(() => 0),
        ps.invokeJson(`Get-MailboxStatistics -Identity '${addr}' | Select-Object LastLogonTime,LastLoggedOnUserAccount,ItemCount | Select-Object -First 1`).catch(() => []),
      ]);
      const sentCount = typeof sent === "number" ? sent : Number((sent as any)?.Count ?? sent) || 0;
      const recvCount = typeof recv === "number" ? recv : Number((recv as any)?.Count ?? recv) || 0;
      const internal = await ps.invokeJson(`Get-MessageTrackingLog -ResultSize 200 -Start (Get-Date).AddDays(-${d}) -Sender '${addr}' | Where-Object { $_.Recipients -like "*@devlab2025.local*" } | Measure-Object | Select-Object -ExpandProperty Count`).catch(() => 0);
      const internalCount = typeof internal === "number" ? internal : 0;
      const externalSent = Math.max(0, sentCount - (internalCount as number));
      const avgDaily = d ? (sentCount + recvCount) / d : 0;
      const peakSend = await ps.invokeJson(`Get-MessageTrackingLog -ResultSize 200 -Start (Get-Date).AddDays(-${d}) -Sender '${addr}' -EventId SEND | Group-Object { $_.Timestamp.ToString("yyyy-MM-dd") } | Sort-Object Count -Descending | Select-Object Name,Count -First 1`).catch(() => []);
      const peakRecv = await ps.invokeJson(`Get-MessageTrackingLog -ResultSize 200 -Start (Get-Date).AddDays(-${d}) -Recipients '${addr}' -EventId DELIVER | Group-Object { $_.Timestamp.ToString("yyyy-MM-dd") } | Sort-Object Count -Descending | Select-Object Name,Count -First 1`).catch(() => []);
      const lastActivity = await ps.invokeJson(`Get-MessageTrackingLog -ResultSize 10 -Sender '${addr}' -Start (Get-Date).AddDays(-${d}) | Sort-Object Timestamp -Descending | Select-Object Timestamp,EventId,Recipients | Select-Object -First 1`).catch(() => []);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                mailbox: identity,
                windowDays: d,
                messagesReceived: recvCount,
                messagesSent: sentCount,
                internalMessages: internalCount,
                externalMessages: externalSent,
                averageDailyMessages: Math.round(avgDaily * 10) / 10,
                peakSendingDay: (peakSend as any[])[0] ?? null,
                peakReceivingDay: (peakRecv as any[])[0] ?? null,
                lastActivity: (lastActivity as any[])[0] ?? null,
                lastLogon: (stats as any[])[0]?.LastLogonTime ?? null,
                lastLoggedOnUser: (stats as any[])[0]?.LastLoggedOnUserAccount ?? null,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    "report.mailflow_profile",
    "Mail Flow Profile — For an individual mailbox: Sending (Messages/day, Recipients/message, External recipients, Top recipient domains, Average message size, Largest messages) + Receiving (Top senders, Top domains, Message volume, Average size) + AI insight (e.g. 72% outbound external)",
    {
      identity: z.string().describe("Mailbox SMTP address"),
      days: z.number().optional().describe("Window in days, default 30"),
    },
    async ({ identity, days }) => {
      const d = days ?? 30;
      const addr = identity.replace(/'/g, "''");
      const domain = (identity.split("@")[1] ?? "devlab2025.local").replace(/'/g, "''");
      const [sentLogs, recvLogs, stats] = await Promise.all([
        ps.invokeJson(`Get-MessageTrackingLog -ResultSize 500 -Start (Get-Date).AddDays(-${d}) -Sender '${addr}' -EventId SEND | Select-Object Timestamp,Recipients,TotalBytes,MessageSubject | Select-Object -First 200`).catch(() => []),
        ps.invokeJson(`Get-MessageTrackingLog -ResultSize 500 -Start (Get-Date).AddDays(-${d}) -Recipients '${addr}' -EventId DELIVER | Select-Object Timestamp,Sender,TotalBytes | Select-Object -First 200`).catch(() => []),
        ps.invokeJson(`Get-MailboxStatistics -Identity '${addr}' | Select-Object LastLogonTime | Select-Object -First 1`).catch(() => []),
      ]);
      const sentArr = sentLogs as any[];
      const recvArr = recvLogs as any[];
      const messagesPerDay = d ? +(sentArr.length / d).toFixed(1) : 0;
      const recipientsPerMessage =
        sentArr.length ? +(sentArr.reduce((sum: number, m: any) => sum + String(m.Recipients ?? "").split(",").filter(Boolean).length, 0) / sentArr.length).toFixed(2) : 0;
      let externalCount = 0;
      const domainCounts: Record<string, number> = {};
      let totalBytesSent = 0;
      let largest: any[] = [];
      for (const m of sentArr) {
        const recips = String(m.Recipients ?? "").split(";").flatMap((s) => s.split(",")).map((s) => s.trim()).filter(Boolean);
        for (const r of recips) {
          const dom = r.split("@")[1]?.toLowerCase();
          if (dom) domainCounts[dom] = (domainCounts[dom] ?? 0) + 1;
          if (dom && dom !== domain.toLowerCase()) externalCount++;
        }
        const b = Number(m.TotalBytes ?? 0);
        totalBytesSent += b;
        largest.push({ subject: m.MessageSubject, bytes: b, recipients: m.Recipients });
      }
      largest = largest.sort((a, b) => b.bytes - a.bytes).slice(0, 5);
      const topRecipientDomains = Object.entries(domainCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([dom, cnt]) => ({ domain: dom, count: cnt }));
      const totalRecipients = sentArr.reduce((sum: number, m: any) => sum + String(m.Recipients ?? "").split(",").filter(Boolean).length, 0);
      const avgSize = sentArr.length ? Math.round(totalBytesSent / sentArr.length) : 0;
      const externalPct = sentArr.length ? Math.round((externalCount / Math.max(1, totalRecipients)) * 100) : 0;

      const senderCounts: Record<string, number> = {};
      const recvDomainCounts: Record<string, number> = {};
      let totalRecvBytes = 0;
      for (const m of recvArr) {
        const s = String(m.Sender ?? "");
        if (s) senderCounts[s] = (senderCounts[s] ?? 0) + 1;
        const dom = s.split("@")[1]?.toLowerCase();
        if (dom) recvDomainCounts[dom] = (recvDomainCounts[dom] ?? 0) + 1;
        totalRecvBytes += Number(m.TotalBytes ?? 0);
      }
      const topSenders = Object.entries(senderCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([s, c]) => ({ sender: s, count: c }));
      const topDomainsRecv = Object.entries(recvDomainCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([d, c]) => ({ domain: d, count: c }));
      const avgRecvSize = recvArr.length ? Math.round(totalRecvBytes / recvArr.length) : 0;

      const aiInsight = externalPct >= 70 ? `${externalPct}% of this mailbox's outbound messages are sent to external domains.` : `${100 - externalPct}% internal, ${externalPct}% external — balanced.`;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                mailbox: identity,
                windowDays: d,
                sending: {
                  messagesPerDay,
                  totalSent: sentArr.length,
                  recipientsPerMessage,
                  externalRecipients: externalCount,
                  externalPercent: `${externalPct}%`,
                  topRecipientDomains,
                  averageMessageSize: avgSize ? `${(avgSize / 1024).toFixed(1)} KB` : "N/A",
                  averageMessageSizeBytes: avgSize,
                  largestMessages: largest.map((m) => ({ ...m, size: m.bytes ? `${(m.bytes / 1024).toFixed(1)} KB` : "N/A" })),
                },
                receiving: {
                  topSenders,
                  topDomains: topDomainsRecv,
                  messageVolume: recvArr.length,
                  averageSize: avgRecvSize ? `${(avgRecvSize / 1024).toFixed(1)} KB` : "N/A",
                  averageSizeBytes: avgRecvSize,
                },
                lastLogon: (stats as any[])[0]?.LastLogonTime ?? null,
                ai: aiInsight,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
