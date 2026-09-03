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
    "Individual Activity — per-mailbox LastLogon, LastLoggedOnUser, InboxRules count, Mobile last sync",
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
}
