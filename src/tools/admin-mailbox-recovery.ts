import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PowerShellProvider } from "../clients/powershell-provider.js";

export function registerMailboxRecoveryTools(server: McpServer, ps: PowerShellProvider) {
  server.tool(
    "exchange_disable_mailbox",
    "Disable mailbox (Disable-Mailbox) — removes Exchange attributes but keeps AD user; mailbox becomes soft-deleted/disconnected",
    { identity: z.string().describe("User identity, e.g. user@contoso.com or GUID"), confirm: z.boolean().optional().describe("confirm:true required") },
    async ({ identity, confirm }) => {
      if (!confirm) throw new Error("confirm:true required — disables mailbox, data becomes recoverable for retention period");
      await ps.invokeJson(`Disable-Mailbox -Identity '${identity.replace(/'/g, "''")}' -Confirm:$false`);
      return { content: [{ type: "text", text: `Disabled mailbox ${identity} (soft-deleted, recoverable)` }] };
    },
  );

  server.tool(
    "exchange_connect_mailbox",
    "Connect a disconnected/soft-deleted mailbox to an AD user (Connect-Mailbox) — recovery or reattach",
    {
      identity: z.string().describe("Mailbox GUID or disconnected mailbox identity (from Get-Mailbox -SoftDeletedMailbox)"),
      user: z.string().describe("Target AD user identity to connect to"),
      database: z.string().optional().describe("Database holding disconnected mailbox"),
      alias: z.string().optional(),
    },
    async ({ identity, user, database, alias }) => {
      let cmd = `Connect-Mailbox -Identity '${identity.replace(/'/g, "''")}' -User "${user}"`;
      if (database) cmd += ` -Database "${database}"`;
      if (alias) cmd += ` -Alias "${alias}"`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_undo_softdeleted_mailbox",
    "Undo soft-deleted mailbox (Undo-SoftDeletedMailbox) — restores soft-deleted mailbox to active state",
    {
      identity: z.string().describe("Soft-deleted mailbox identity (GUID or WindowsLiveID)"),
      windowsLiveID: z.string().optional().describe("Target WindowsLiveID if merging"),
    },
    async ({ identity, windowsLiveID }) => {
      let cmd = `Undo-SoftDeletedMailbox -SoftDeletedObject "${identity}" -Confirm:$false`;
      if (windowsLiveID) cmd += ` -WindowsLiveID "${windowsLiveID}"`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_get_softdeleted_mailbox",
    "List soft-deleted / disconnected mailboxes — Get-Mailbox -SoftDeletedMailbox or Get-MailboxStatistics disconnected",
    { filter: z.string().optional(), database: z.string().optional() },
    async ({ filter, database }) => {
      let cmd = `Get-Mailbox -SoftDeletedMailbox -ResultSize 20`;
      if (filter) cmd += ` -Filter {Name -like "*${filter}*"} `;
      if (database) cmd += ` -Database "${database}"`;
      cmd += ` | Select-Object DisplayName,PrimarySmtpAddress,ExchangeGuid,WhenSoftDeleted`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_enable_mailbox",
    "Enable mailbox for existing AD user (Enable-Mailbox) — creates mailbox for user without one",
    { identity: z.string().describe("AD user identity"), database: z.string().optional(), alias: z.string().optional() },
    async ({ identity, database, alias }) => {
      let cmd = `Enable-Mailbox -Identity '${identity.replace(/'/g, "''")}'`;
      if (database) cmd += ` -Database "${database}"`;
      if (alias) cmd += ` -Alias "${alias}"`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_restore_recoverable_items",
    "Restore deleted items from Recoverable Items (Restore-RecoverableItems) — restores purged items",
    { identity: z.string().describe("Mailbox to restore into"), subjectContains: z.string().optional(), filterItemType: z.string().optional().describe("IPM.Note* etc.") },
    async ({ identity, subjectContains, filterItemType }) => {
      let cmd = `Restore-RecoverableItems -Identity "${identity}"`;
      if (subjectContains) cmd += ` -SubjectContains "${subjectContains}"`;
      if (filterItemType) cmd += ` -FilterItemType "${filterItemType}"`;
      cmd += ` -Confirm:$false`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_new_mailbox_restore_request",
    "Create restore request (New-MailboxRestoreRequest) — from recovery DB or soft-deleted",
    { sourceDatabase: z.string(), sourceStoreMailbox: z.string().describe("GUID of source mailbox"), targetMailbox: z.string().describe("Target mailbox identity"), allowLegacyDNMismatch: z.boolean().optional() },
    async ({ sourceDatabase, sourceStoreMailbox, targetMailbox, allowLegacyDNMismatch }) => {
      let cmd = `New-MailboxRestoreRequest -SourceDatabase "${sourceDatabase}" -SourceStoreMailbox "${sourceStoreMailbox}" -TargetMailbox "${targetMailbox}"`;
      if (allowLegacyDNMismatch) cmd += ` -AllowLegacyDNMismatch`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_get_mailbox_restore_request",
    "Get restore request status (Get-MailboxRestoreRequest)",
    { identity: z.string().optional() },
    async ({ identity }) => {
      const d = await ps.invokeJson(identity ? `Get-MailboxRestoreRequest -Identity "${identity}" | Select-Object Identity,Status,PercentComplete` : `Get-MailboxRestoreRequest | Select-Object Identity,Status,PercentComplete`);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_new_mailbox_import_request",
    "Create import request from PST (New-MailboxImportRequest) — imports PST file into mailbox. PST must be on UNC share accessible by Exchange Trusted Subsystem.",
    {
      mailbox: z.string().describe("Target mailbox identity"),
      filePath: z.string().describe("UNC path to PST, e.g. \\\\server\\share\\file.pst"),
      targetRootFolder: z.string().optional().describe("Target folder, e.g. Recovered"),
      isArchive: z.boolean().optional().describe("Import into archive mailbox"),
      name: z.string().optional().describe("Request name"),
    },
    async ({ mailbox, filePath, targetRootFolder, isArchive, name }) => {
      let cmd = `New-MailboxImportRequest -Mailbox "${mailbox}" -FilePath "${filePath}"`;
      if (targetRootFolder) cmd += ` -TargetRootFolder "${targetRootFolder}"`;
      if (isArchive) cmd += ` -IsArchive`;
      if (name) cmd += ` -Name "${name}"`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_get_mailbox_import_request",
    "Get import request status (Get-MailboxImportRequest)",
    { identity: z.string().optional().describe("Mailbox or request identity, e.g. admin@contoso.com or admin\\Import1"), mailbox: z.string().optional() },
    async ({ identity, mailbox }) => {
      let cmd: string;
      if (identity) cmd = `Get-MailboxImportRequest -Identity "${identity}" | Select-Object Identity,Mailbox,Status,PercentComplete,FilePath`;
      else if (mailbox) cmd = `Get-MailboxImportRequest -Mailbox "${mailbox}" | Select-Object Identity,Status,PercentComplete,FilePath`;
      else cmd = `Get-MailboxImportRequest | Select-Object Identity,Mailbox,Status,PercentComplete`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_get_mailbox_import_request_statistics",
    "Get import request statistics (Get-MailboxImportRequestStatistics) — detailed progress",
    { identity: z.string().describe("Import request identity, e.g. admin\\Import1") },
    async ({ identity }) => {
      const d = await ps.invokeJson(`Get-MailboxImportRequestStatistics -Identity "${identity}" | Select-Object Identity,Status,PercentComplete,BytesTransferred,EstimatedTransferSize`);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_remove_mailbox_import_request",
    "Remove import request (Remove-MailboxImportRequest) — cleanup after import",
    { identity: z.string().describe("Request identity") },
    async ({ identity }) => {
      await ps.invokeJson(`Remove-MailboxImportRequest -Identity "${identity}" -Confirm:$false`);
      return { content: [{ type: "text", text: `Removed import request ${identity}` }] };
    },
  );

  // Batch 3 (#mailboxes): request lifecycle Set/Suspend/Resume/Remove +
  // statistics, service email channel, drafts, calendar cleanup, MAPI test.
  // Mailbox Import Export RBAC role required for *-MailboxExportRequest,
  // *-MailboxImportRequest, Get-RecoverableItems.

  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

  server.tool(
    "exchange_set_mailboxexportrequest",
    "Change export request options (Set-MailboxExportRequest) — recover failed exports, e.g. raise BadItemLimit. Mailbox Import Export role required. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/set-mailboxexportrequest",
    {
      identity: z.string().describe("Request identity, e.g. Ayla\\MailboxExport1"),
      badItemLimit: z.string().optional().describe("Int or unlimited, e.g. 10 (51+ needs acceptLargeDataLoss)"),
      largeItemLimit: z.string().optional().describe("Int or unlimited (51+ needs acceptLargeDataLoss)"),
      acceptLargeDataLoss: z.boolean().optional(),
      batchName: z.string().optional(),
      priority: z.string().optional().describe("Lowest..Emergency (default Normal)"),
      completedRequestAgeLimit: z.string().optional().describe("Keep completed N days, e.g. 30"),
      requestExpiryInterval: z.string().optional().describe("dd.hh:mm:ss or Unlimited"),
      rehomeRequest: z.boolean().optional().describe("Move request to the mailbox database (debugging)"),
      domainController: z.string().optional(),
    },
    async (p) => {
      let cmd = `Set-MailboxExportRequest -Identity ${q(p.identity)}`;
      if (p.badItemLimit) cmd += ` -BadItemLimit ${p.badItemLimit}`;
      if (p.largeItemLimit) cmd += ` -LargeItemLimit ${p.largeItemLimit}`;
      if (p.acceptLargeDataLoss) cmd += ` -AcceptLargeDataLoss`;
      if (p.batchName) cmd += ` -BatchName ${q(p.batchName)}`;
      if (p.priority) cmd += ` -Priority ${p.priority}`;
      if (p.completedRequestAgeLimit) cmd += ` -CompletedRequestAgeLimit ${p.completedRequestAgeLimit}`;
      if (p.requestExpiryInterval) cmd += ` -RequestExpiryInterval ${p.requestExpiryInterval}`;
      if (p.rehomeRequest) cmd += ` -RehomeRequest`;
      if (p.domainController) cmd += ` -DomainController ${q(p.domainController)}`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_suspend_mailboxexportrequest",
    "Suspend an export request (Suspend-MailboxExportRequest) — resume with exchange_resume_mailboxexportrequest. Built-in pause skipped.",
    {
      identity: z.string().describe("Request identity, e.g. Ayla\\MailboxExport1"),
      suspendComment: z.string().optional().describe("Why suspended, e.g. 'Resume after 22:00'"),
      domainController: z.string().optional(),
    },
    async ({ identity, suspendComment, domainController }) => {
      let cmd = `Suspend-MailboxExportRequest -Identity ${q(identity)}`;
      if (suspendComment) cmd += ` -SuspendComment ${q(suspendComment)}`;
      if (domainController) cmd += ` -DomainController ${q(domainController)}`;
      cmd += ` -Confirm:$false`;
      await ps.invoke(cmd);
      return { content: [{ type: "text", text: `Suspended export request ${identity}` }] };
    },
  );

  server.tool(
    "exchange_resume_mailboxexportrequest",
    "Resume a suspended/failed export request (Resume-MailboxExportRequest)",
    {
      identity: z.string().describe("Request identity, e.g. kweku\\export"),
      domainController: z.string().optional(),
    },
    async ({ identity, domainController }) => {
      let cmd = `Resume-MailboxExportRequest -Identity ${q(identity)}`;
      if (domainController) cmd += ` -DomainController ${q(domainController)}`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_remove_mailboxexportrequest",
    "Remove a completed/partial export request (Remove-MailboxExportRequest) — completed requests are NOT auto-cleared. PST content already exported is kept.",
    {
      identity: z.string().optional().describe("Request identity, e.g. Ayla\\MailboxExport1 (mutually exclusive with requestGuid+requestQueue)"),
      requestGuid: z.string().optional().describe("MRS-debug set: request GUID (needs requestQueue)"),
      requestQueue: z.string().optional().describe("MRS-debug set: database (needs requestGuid)"),
      force: z.boolean().optional().describe("Hide warnings (2016+)"),
      domainController: z.string().optional(),
    },
    async ({ identity, requestGuid, requestQueue, force, domainController }) => {
      let cmd: string;
      if (requestGuid || requestQueue) {
        if (!requestGuid || !requestQueue) throw new Error("requestGuid and requestQueue must be used together (MRS-debug set)");
        cmd = `Remove-MailboxExportRequest -RequestGuid ${q(requestGuid)} -RequestQueue ${q(requestQueue)}`;
      } else {
        if (!identity) throw new Error("identity or requestGuid+requestQueue is required");
        cmd = `Remove-MailboxExportRequest -Identity ${q(identity)}`;
      }
      if (force) cmd += ` -Force`;
      if (domainController) cmd += ` -DomainController ${q(domainController)}`;
      cmd += ` -Confirm:$false`;
      await ps.invoke(cmd);
      return { content: [{ type: "text", text: `Removed export request ${identity ?? requestGuid}` }] };
    },
  );

  server.tool(
    "exchange_get_mailboxexportrequeststatistics",
    "Detailed export request stats (Get-MailboxExportRequestStatistics) — name/mailbox/status detail. Mailbox Import Export role required.",
    {
      identity: z.string().optional().describe("Request identity, e.g. Tony\\MailboxExport1"),
      requestQueue: z.string().optional().describe("MRS-debug: database (mutually exclusive with identity)"),
      requestGuid: z.string().optional().describe("MRS-debug: request GUID (needs requestQueue)"),
      includeReport: z.boolean().optional().describe("Troubleshooting detail"),
      diagnostic: z.boolean().optional().describe("CSS-support-level detail"),
      diagnosticArgument: z.string().optional(),
      reportOnly: z.boolean().optional().describe("Encoded report entries only (2016+)"),
      domainController: z.string().optional(),
    },
    async ({ identity, requestQueue, requestGuid, includeReport, diagnostic, diagnosticArgument, reportOnly, domainController }) => {
      let cmd: string;
      if (requestQueue) {
        if (identity) throw new Error("identity and requestQueue are mutually exclusive");
        cmd = `Get-MailboxExportRequestStatistics -RequestQueue ${q(requestQueue)}`;
        if (requestGuid) cmd += ` -RequestGuid ${q(requestGuid)}`;
      } else {
        if (!identity) throw new Error("identity or requestQueue is required");
        cmd = `Get-MailboxExportRequestStatistics -Identity ${q(identity)}`;
      }
      if (includeReport) cmd += ` -IncludeReport`;
      if (diagnostic) cmd += ` -Diagnostic`;
      if (diagnosticArgument) cmd += ` -DiagnosticArgument ${q(diagnosticArgument)}`;
      if (reportOnly) cmd += ` -ReportOnly`;
      if (domainController) cmd += ` -DomainController ${q(domainController)}`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_set_mailboximportrequest",
    "Change import request options (Set-MailboxImportRequest) — recover failed imports. Mailbox Import Export role required. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/set-mailboximportrequest",
    {
      identity: z.string().describe("Request identity, e.g. Kweku\\Import"),
      badItemLimit: z.string().optional().describe("Int or unlimited, e.g. 5"),
      largeItemLimit: z.string().optional().describe("Int or unlimited (51+ needs acceptLargeDataLoss, on-prem)"),
      acceptLargeDataLoss: z.boolean().optional(),
      batchName: z.string().optional(),
      priority: z.string().optional().describe("Lowest..Emergency (on-prem)"),
      completedRequestAgeLimit: z.string().optional(),
      requestExpiryInterval: z.string().optional().describe("dd.hh:mm:ss or Unlimited"),
      rehomeRequest: z.boolean().optional().describe("Debugging (on-prem)"),
      domainController: z.string().optional().describe("On-prem Identity/Rehome sets"),
    },
    async (p) => {
      let cmd = `Set-MailboxImportRequest -Identity ${q(p.identity)}`;
      if (p.badItemLimit) cmd += ` -BadItemLimit ${p.badItemLimit}`;
      if (p.largeItemLimit) cmd += ` -LargeItemLimit ${p.largeItemLimit}`;
      if (p.acceptLargeDataLoss) cmd += ` -AcceptLargeDataLoss`;
      if (p.batchName) cmd += ` -BatchName ${q(p.batchName)}`;
      if (p.priority) cmd += ` -Priority ${p.priority}`;
      if (p.completedRequestAgeLimit) cmd += ` -CompletedRequestAgeLimit ${p.completedRequestAgeLimit}`;
      if (p.requestExpiryInterval) cmd += ` -RequestExpiryInterval ${p.requestExpiryInterval}`;
      if (p.rehomeRequest) cmd += ` -RehomeRequest`;
      if (p.domainController) cmd += ` -DomainController ${q(p.domainController)}`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_suspend_mailboximportrequest",
    "Suspend an import request (Suspend-MailboxImportRequest) — built-in pause skipped. No longer supported in Exchange Online (use network upload).",
    {
      identity: z.string().describe("Request identity, e.g. Ayla\\MailboxImport1"),
      suspendComment: z.string().optional(),
      domainController: z.string().optional().describe("On-prem only"),
    },
    async ({ identity, suspendComment, domainController }) => {
      let cmd = `Suspend-MailboxImportRequest -Identity ${q(identity)}`;
      if (suspendComment) cmd += ` -SuspendComment ${q(suspendComment)}`;
      if (domainController) cmd += ` -DomainController ${q(domainController)}`;
      cmd += ` -Confirm:$false`;
      await ps.invoke(cmd);
      return { content: [{ type: "text", text: `Suspended import request ${identity}` }] };
    },
  );

  server.tool(
    "exchange_resume_mailboximportrequest",
    "Resume a suspended/failed import request (Resume-MailboxImportRequest)",
    {
      identity: z.string().describe("Request identity, e.g. kweku\\MailboxImport1"),
      domainController: z.string().optional().describe("On-prem only"),
    },
    async ({ identity, domainController }) => {
      let cmd = `Resume-MailboxImportRequest -Identity ${q(identity)}`;
      if (domainController) cmd += ` -DomainController ${q(domainController)}`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_get_mailboxrestorerequeststatistics",
    "Detailed restore request stats (Get-MailboxRestoreRequestStatistics) — name/mailbox/status/percent. On-prem Identity set; cloud DiagnosticInfo/IncludeSkippedItems omitted.",
    {
      identity: z.string().optional().describe("Alias\\Name, e.g. Tony\\MailboxRestore1"),
      requestQueue: z.string().optional().describe("MRS-debug: database (mutually exclusive with identity)"),
      requestGuid: z.string().optional().describe("MRS-debug: request GUID (needs requestQueue)"),
      includeReport: z.boolean().optional(),
      diagnostic: z.boolean().optional().describe("CSS-support-level detail (on-prem)"),
      diagnosticArgument: z.string().optional().describe("On-prem only"),
      reportOnly: z.boolean().optional(),
      domainController: z.string().optional().describe("On-prem only"),
    },
    async ({ identity, requestQueue, requestGuid, includeReport, diagnostic, diagnosticArgument, reportOnly, domainController }) => {
      let cmd: string;
      if (requestQueue) {
        if (identity) throw new Error("identity and requestQueue are mutually exclusive");
        cmd = `Get-MailboxRestoreRequestStatistics -RequestQueue ${q(requestQueue)}`;
        if (requestGuid) cmd += ` -RequestGuid ${q(requestGuid)}`;
      } else {
        if (!identity) throw new Error("identity or requestQueue is required");
        cmd = `Get-MailboxRestoreRequestStatistics -Identity ${q(identity)}`;
      }
      if (includeReport) cmd += ` -IncludeReport`;
      if (diagnostic) cmd += ` -Diagnostic`;
      if (diagnosticArgument) cmd += ` -DiagnosticArgument ${q(diagnosticArgument)}`;
      if (reportOnly) cmd += ` -ReportOnly`;
      if (domainController) cmd += ` -DomainController ${q(domainController)}`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_set_mailboxrestorerequest",
    "Change restore request options (Set-MailboxRestoreRequest) — recover failed restores. Internal/RemoteHostName/cloud-only params omitted. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/set-mailboxrestorerequest",
    {
      identity: z.string().describe("Alias\\Name, e.g. Ayla\\MailboxRestore1"),
      badItemLimit: z.string().optional().describe("Int or unlimited, e.g. 10 (on-prem)"),
      largeItemLimit: z.string().optional().describe("Int or unlimited (on-prem)"),
      acceptLargeDataLoss: z.boolean().optional(),
      batchName: z.string().optional(),
      priority: z.string().optional().describe("Lowest..Emergency (on-prem)"),
      completedRequestAgeLimit: z.string().optional(),
      requestExpiryInterval: z.string().optional().describe("dd.hh:mm:ss or Unlimited"),
      rehomeRequest: z.boolean().optional().describe("Move request DB (on-prem debugging)"),
      domainController: z.string().optional().describe("On-prem only"),
    },
    async (p) => {
      let cmd = `Set-MailboxRestoreRequest -Identity ${q(p.identity)}`;
      if (p.badItemLimit) cmd += ` -BadItemLimit ${p.badItemLimit}`;
      if (p.largeItemLimit) cmd += ` -LargeItemLimit ${p.largeItemLimit}`;
      if (p.acceptLargeDataLoss) cmd += ` -AcceptLargeDataLoss`;
      if (p.batchName) cmd += ` -BatchName ${q(p.batchName)}`;
      if (p.priority) cmd += ` -Priority ${p.priority}`;
      if (p.completedRequestAgeLimit) cmd += ` -CompletedRequestAgeLimit ${p.completedRequestAgeLimit}`;
      if (p.requestExpiryInterval) cmd += ` -RequestExpiryInterval ${p.requestExpiryInterval}`;
      if (p.rehomeRequest) cmd += ` -RehomeRequest`;
      if (p.domainController) cmd += ` -DomainController ${q(p.domainController)}`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_suspend_mailboxrestorerequest",
    "Suspend a restore request (Suspend-MailboxRestoreRequest) — built-in pause skipped.",
    {
      identity: z.string().describe("Alias\\Name, e.g. Ayla\\MailboxRestore1"),
      suspendComment: z.string().optional(),
      domainController: z.string().optional().describe("On-prem only"),
    },
    async ({ identity, suspendComment, domainController }) => {
      let cmd = `Suspend-MailboxRestoreRequest -Identity ${q(identity)}`;
      if (suspendComment) cmd += ` -SuspendComment ${q(suspendComment)}`;
      if (domainController) cmd += ` -DomainController ${q(domainController)}`;
      cmd += ` -Confirm:$false`;
      await ps.invoke(cmd);
      return { content: [{ type: "text", text: `Suspended restore request ${identity}` }] };
    },
  );

  server.tool(
    "exchange_resume_mailboxrestorerequest",
    "Resume a suspended/failed restore request (Resume-MailboxRestoreRequest)",
    {
      identity: z.string().describe("Alias\\Name, e.g. kweku\\RestoreFromDB01"),
      domainController: z.string().optional().describe("On-prem only"),
    },
    async ({ identity, domainController }) => {
      let cmd = `Resume-MailboxRestoreRequest -Identity ${q(identity)}`;
      if (domainController) cmd += ` -DomainController ${q(domainController)}`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_remove_mailboxrestorerequest",
    "Remove a completed/partial restore request (Remove-MailboxRestoreRequest) — RequestGuid set is MRS-debugging only.",
    {
      identity: z.string().optional().describe("Alias\\Name, e.g. Ayla\\MailboxRestore1 (mutually exclusive with requestGuid+requestQueue)"),
      requestGuid: z.string().optional().describe("MRS-debug: request GUID (needs requestQueue)"),
      requestQueue: z.string().optional().describe("MRS-debug: database (needs requestGuid, on-prem)"),
      force: z.boolean().optional(),
      domainController: z.string().optional().describe("On-prem only"),
    },
    async ({ identity, requestGuid, requestQueue, force, domainController }) => {
      let cmd: string;
      if (requestGuid || requestQueue) {
        if (!requestGuid || !requestQueue) throw new Error("requestGuid and requestQueue must be used together (MRS-debug set)");
        cmd = `Remove-MailboxRestoreRequest -RequestGuid ${q(requestGuid)} -RequestQueue ${q(requestQueue)}`;
      } else {
        if (!identity) throw new Error("identity or requestGuid+requestQueue is required");
        cmd = `Remove-MailboxRestoreRequest -Identity ${q(identity)}`;
      }
      if (force) cmd += ` -Force`;
      if (domainController) cmd += ` -DomainController ${q(domainController)}`;
      cmd += ` -Confirm:$false`;
      await ps.invoke(cmd);
      return { content: [{ type: "text", text: `Removed restore request ${identity ?? requestGuid}` }] };
    },
  );

  server.tool(
    "exchange_disable_serviceemailchannel",
    "Disable the .NET service channel for a user (Disable-ServiceEmailChannel) — deletes the receive folder under mailbox root. Built-in pause skipped.",
    {
      identity: z.string().describe("Mailbox, e.g. JeffHay"),
      domainController: z.string().optional(),
    },
    async ({ identity, domainController }) => {
      let cmd = `Disable-ServiceEmailChannel -Identity ${q(identity)}`;
      if (domainController) cmd += ` -DomainController ${q(domainController)}`;
      cmd += ` -Confirm:$false`;
      await ps.invoke(cmd);
      return { content: [{ type: "text", text: `Disabled service email channel for ${identity}` }] };
    },
  );

  server.tool(
    "exchange_enable_serviceemailchannel",
    "Enable the .NET service channel for a user (Enable-ServiceEmailChannel) — creates the 'Service E-mail' receive folder for disconnected-app forwarding.",
    {
      identity: z.string().describe("Mailbox, e.g. tony@contoso.com"),
      domainController: z.string().optional(),
    },
    async ({ identity, domainController }) => {
      let cmd = `Enable-ServiceEmailChannel -Identity ${q(identity)}`;
      if (domainController) cmd += ` -DomainController ${q(domainController)}`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_new_mailmessage",
    "Create a Draft message (New-MailMessage) — no recipients/send, lands in the runner's Drafts. No Mailbox param in current syntax (2010 examples predate it).",
    {
      subject: z.string().optional().describe("Message subject"),
      body: z.string().optional().describe("Message body (position 1)"),
      bodyFormat: z.string().optional().describe("PlainText (default), Rtf, Html"),
      domainController: z.string().optional().describe("On-prem only"),
    },
    async ({ subject, body, bodyFormat, domainController }) => {
      let cmd = `New-MailMessage`;
      if (subject) cmd += ` -Subject ${q(subject)}`;
      if (body) cmd += ` -Body ${q(body)}`;
      if (bodyFormat) cmd += ` -BodyFormat ${bodyFormat}`;
      if (domainController) cmd += ` -DomainController ${q(domainController)}`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_remove_calendarevents",
    "Cancel future organized meetings (Remove-CalendarEvents) — 2019+ on-prem; organizer meetings with attendees/resources only. Use previewOnly first. Max window 1825 days.",
    {
      identity: z.string().describe("Organizer mailbox, e.g. chris@contoso.com"),
      queryWindowInDays: z.number().describe("Days from start date (required, max 1825)"),
      cancelOrganizedMeetings: z.boolean().optional().describe("Required to actually cancel"),
      queryStartDate: z.string().optional().describe("Default today, e.g. 11-30-2025"),
      previewOnly: z.boolean().optional().describe("Preview with -Verbose, no changes"),
    },
    async ({ identity, queryWindowInDays, cancelOrganizedMeetings, queryStartDate, previewOnly }) => {
      let cmd = `Remove-CalendarEvents -Identity ${q(identity)}`;
      if (cancelOrganizedMeetings) cmd += ` -CancelOrganizedMeetings`;
      cmd += ` -QueryWindowInDays ${queryWindowInDays}`;
      if (queryStartDate) cmd += ` -QueryStartDate ${q(queryStartDate)}`;
      if (previewOnly) cmd += ` -PreviewOnly -Verbose`;
      cmd += ` -Confirm:$false`;
      await ps.invoke(cmd);
      return { content: [{ type: "text", text: previewOnly ? `Previewed cancellations for ${identity}` : `Cancelled future meetings for ${identity}` }] };
    },
  );

  server.tool(
    "exchange_get_recoverableitems",
    "View deleted items (Get-RecoverableItems) — pair with exchange_restore_recoverable_items. Mailbox Import Export role required. On-prem set; cloud PolicyTag/MaxParallelSize/SkipCount omitted.",
    {
      identity: z.string().describe("Mailbox, e.g. laura@contoso.com"),
      subjectContains: z.string().optional(),
      filterItemType: z.string().optional().describe("IPM.Note, IPM.Appointment, IPM.Contact, IPM.File, IPM.Task"),
      filterStartTime: z.string().optional().describe("LastModifiedTime from, e.g. '2/1/2018 12:00:00 AM'"),
      filterEndTime: z.string().optional(),
      entryID: z.string().optional().describe("Unique item EntryID"),
      lastParentFolderID: z.string().optional().describe("Pre-delete FolderID"),
      sourceFolder: z.string().optional().describe("DeletedItems, RecoverableItems (Deletions), PurgedItems (Purges)"),
      resultSize: z.number().min(1).max(10000).optional(),
    },
    async (p) => {
      let cmd = `Get-RecoverableItems -Identity ${q(p.identity)}`;
      if (p.subjectContains) cmd += ` -SubjectContains ${q(p.subjectContains)}`;
      if (p.filterItemType) cmd += ` -FilterItemType ${p.filterItemType}`;
      if (p.filterStartTime) cmd += ` -FilterStartTime ${q(p.filterStartTime)}`;
      if (p.filterEndTime) cmd += ` -FilterEndTime ${q(p.filterEndTime)}`;
      if (p.entryID) cmd += ` -EntryID ${q(p.entryID)}`;
      if (p.lastParentFolderID) cmd += ` -LastParentFolderID ${q(p.lastParentFolderID)}`;
      if (p.sourceFolder) cmd += ` -SourceFolder ${p.sourceFolder}`;
      if (p.resultSize !== undefined) cmd += ` -ResultSize ${p.resultSize}`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_test_mapiconnectivity",
    "Verify MAPI+LDAP logon to a mailbox/database/server (Test-MAPIConnectivity) — Identity/Database/Server are mutually exclusive; omit all for local SystemMailbox check.",
    {
      identity: z.string().optional().describe("Mailbox, e.g. midwest\\john"),
      database: z.string().optional().describe("Test SystemMailbox on this DB"),
      server: z.string().optional().describe("Test SystemMailboxes on this server, e.g. Server01"),
      archive: z.boolean().optional().describe("Test the archive instead"),
      includePassive: z.boolean().optional().describe("Include passive DB copies (Server set, on-prem)"),
      monitoringContext: z.boolean().optional().describe("SCOM events/counters, $true/$false (on-prem)"),
      perConnectionTimeout: z.number().optional().describe("Seconds per connection (default 10, on-prem)"),
      activeDirectoryTimeout: z.number().optional().describe("Seconds per AD op (default 15, on-prem)"),
      allConnectionsTimeout: z.number().optional().describe("Seconds total (default 90, on-prem)"),
      copyOnServer: z.string().optional().describe("DB copy holder (Server set, on-prem)"),
      domainController: z.string().optional().describe("On-prem only"),
    },
    async (p) => {
      const scopes = [p.identity, p.database, p.server].filter(Boolean);
      if (scopes.length > 1) throw new Error("identity, database and server are mutually exclusive");
      let cmd = `Test-MAPIConnectivity`;
      if (p.identity) cmd += ` -Identity ${q(p.identity)}`;
      if (p.database) cmd += ` -Database ${q(p.database)}`;
      if (p.server) cmd += ` -Server ${q(p.server)}`;
      if (p.archive) cmd += ` -Archive`;
      if (p.includePassive) cmd += ` -IncludePassive`;
      if (p.monitoringContext !== undefined) cmd += ` -MonitoringContext $${p.monitoringContext ? "true" : "false"}`;
      if (p.perConnectionTimeout !== undefined) cmd += ` -PerConnectionTimeout ${p.perConnectionTimeout}`;
      if (p.activeDirectoryTimeout !== undefined) cmd += ` -ActiveDirectoryTimeout ${p.activeDirectoryTimeout}`;
      if (p.allConnectionsTimeout !== undefined) cmd += ` -AllConnectionsTimeout ${p.allConnectionsTimeout}`;
      if (p.copyOnServer) cmd += ` -CopyOnServer ${q(p.copyOnServer)}`;
      if (p.domainController) cmd += ` -DomainController ${q(p.domainController)}`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );
}
