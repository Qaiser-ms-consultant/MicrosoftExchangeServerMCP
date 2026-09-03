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
      cmd += ` | Select-Object DisplayName,PrimarySmtpAddress,ExchangeGuid,WhenSoftDeleted | Select-Object -First 20`;
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
      const d = await ps.invokeJson(identity ? `Get-MailboxRestoreRequest -Identity "${identity}" | Select-Object Identity,Status,PercentComplete` : `Get-MailboxRestoreRequest | Select-Object Identity,Status,PercentComplete | Select-Object -First 20`);
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
    { identity: z.string().optional().describe("Mailbox or request identity, e.g. devlabadmin@devlab2025.local or devlabadmin\\Import1"), mailbox: z.string().optional() },
    async ({ identity, mailbox }) => {
      let cmd: string;
      if (identity) cmd = `Get-MailboxImportRequest -Identity "${identity}" | Select-Object Identity,Mailbox,Status,PercentComplete,FilePath`;
      else if (mailbox) cmd = `Get-MailboxImportRequest -Mailbox "${mailbox}" | Select-Object Identity,Status,PercentComplete,FilePath | Select-Object -First 20`;
      else cmd = `Get-MailboxImportRequest | Select-Object Identity,Mailbox,Status,PercentComplete | Select-Object -First 20`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_get_mailbox_import_request_statistics",
    "Get import request statistics (Get-MailboxImportRequestStatistics) — detailed progress",
    { identity: z.string().describe("Import request identity, e.g. devlabadmin\\Import1") },
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
}
