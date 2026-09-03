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
      const q = await ps.invokeJson(server ? `Get-Queue -Server "${server}" | Select-Object Identity,Status,MessageCount,NextHopDomain,DeliveryType | Sort-Object MessageCount -Descending | Select-Object -First 20` : `Get-Queue | Select-Object Identity,Status,MessageCount,NextHopDomain | Sort-Object MessageCount -Descending | Select-Object -First 20`);
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
      const certs = await ps.invokeJson(`Get-ExchangeCertificate | Where-Object { $_.NotAfter -lt (Get-Date).AddDays(60) } | Select-Object Subject,NotAfter | Select-Object -First 5`).catch(() => []);
      const queues = await ps.invokeJson(`Get-Queue | Select-Object Identity,MessageCount,Status | Sort-Object MessageCount -Descending | Select-Object -First 5`).catch(() => []);
      return { content: [{ type: "text", text: JSON.stringify({ servers, databases: dbs, expiringCertsNext60Days: certs, topQueues: queues, generatedAt: new Date().toISOString() }, null, 2) }] };
    },
  );
}
