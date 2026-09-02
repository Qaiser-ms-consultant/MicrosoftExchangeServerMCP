import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PowerShellProvider } from "../clients/powershell-provider.js";

// Mailbox Features — OOF, InboxRules, Folder Permissions, Archive, Quota (TechNet: Mailbox features)
export function registerMailboxFeatureTools(server: McpServer, ps: PowerShellProvider) {
  server.tool(
    "exchange_get_oof",
    "Get Out-of-Office (Automatic Replies) status — Get-MailboxAutoReplyConfiguration. Shows OOF enabled/scheduled/disabled, internal/external messages, duration.",
    { identity: z.string().describe("Mailbox identity") },
    async ({ identity }) => {
      const data = await ps.invokeJson(`Get-MailboxAutoReplyConfiguration -Identity "${identity}" | Select-Object Identity,AutoReplyState,StartTime,EndTime,ExternalAudience,InternalMessage,ExternalMessage`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "exchange_set_oof",
    "Set Out-of-Office — Set-MailboxAutoReplyConfiguration. AutoReplyState: Enabled, Disabled, Scheduled",
    {
      identity: z.string(),
      autoReplyState: z.enum(["Enabled", "Disabled", "Scheduled"]),
      internalMessage: z.string().optional(),
      externalMessage: z.string().optional(),
      externalAudience: z.enum(["None", "Known", "All"]).optional(),
      startTime: z.string().optional().describe("ISO datetime for Scheduled"),
      endTime: z.string().optional(),
    },
    async (p) => {
      let cmd = `Set-MailboxAutoReplyConfiguration -Identity "${p.identity}" -AutoReplyState ${p.autoReplyState}`;
      if (p.internalMessage) cmd += ` -InternalMessage "${p.internalMessage.replace(/"/g, '""')}"`;
      if (p.externalMessage) cmd += ` -ExternalMessage "${p.externalMessage.replace(/"/g, '""')}"`;
      if (p.externalAudience) cmd += ` -ExternalAudience ${p.externalAudience}`;
      if (p.startTime) cmd += ` -StartTime "${p.startTime}"`;
      if (p.endTime) cmd += ` -EndTime "${p.endTime}"`;
      await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: `OOF ${p.autoReplyState} for ${p.identity}` }] };
    },
  );

  server.tool(
    "exchange_get_inbox_rules",
    "Get inbox rules for a mailbox — Get-InboxRule",
    { mailbox: z.string().describe("Mailbox identity") },
    async ({ mailbox }) => {
      const data = await ps.invokeJson(`Get-InboxRule -Mailbox "${mailbox}" | Select-Object Name,Enabled,Priority,ForwardTo,ForwardAsAttachmentTo,RedirectTo,MoveToFolder,Description | Select-Object -First 20`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "exchange_get_mailbox_folder_permission",
    "Get mailbox folder permissions — Get-MailboxFolderPermission (e.g. Calendar sharing)",
    { identity: z.string().describe("MailboxFolderId, e.g. devlabadmin@devlab2025.local:\\Calendar") },
    async ({ identity }) => {
      const data = await ps.invokeJson(`Get-MailboxFolderPermission -Identity "${identity}" | Select-Object FolderName,User,AccessRights`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "exchange_get_mailbox_permission",
    "Alias: Get mailbox permissions (already in recipients, exposed for completeness)",
    { identity: z.string() },
    async ({ identity }) => {
      const data = await ps.invokeJson(`Get-MailboxPermission -Identity "${identity}" | Select-Object User,AccessRights,Deny | Select-Object -First 20`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "exchange_get_archive_status",
    "Get archive status — Get-Mailbox | Select ArchiveStatus, ArchiveDatabase, ArchiveQuota",
    { identity: z.string().optional() },
    async ({ identity }) => {
      const cmd = identity
        ? `Get-Mailbox -Identity "${identity}" | Select-Object DisplayName,ArchiveStatus,ArchiveDatabase,ArchiveName,ArchiveQuota,ArchiveWarningQuota`
        : `Get-Mailbox -ResultSize 20 | Select-Object DisplayName,ArchiveStatus,ArchiveDatabase | Select-Object -First 20`;
      const data = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "exchange_get_mailbox_quota",
    "Get mailbox quotas — ProhibitSendQuota, IssueWarningQuota, etc. (shows UseDatabaseQuotaDefaults)",
    { identity: z.string() },
    async ({ identity }) => {
      const data = await ps.invokeJson(`Get-Mailbox -Identity "${identity}" | Select-Object DisplayName,UseDatabaseQuotaDefaults,ProhibitSendQuota,ProhibitSendReceiveQuota,IssueWarningQuota,RulesQuota,RecoverableItemsQuota`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "exchange_get_mobile_device",
    "Get mobile devices for a mailbox — Get-MobileDevice (ActiveSync)",
    { mailbox: z.string().optional().describe("Mailbox identity, omit for all") },
    async ({ mailbox }) => {
      const cmd = mailbox ? `Get-MobileDevice -Mailbox "${mailbox}" | Select-Object FriendlyName,DeviceType,DeviceModel,LastSuccessSync` : `Get-MobileDevice -ResultSize 20 | Select-Object FriendlyName,DeviceType,Mailbox | Select-Object -First 20`;
      const data = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "exchange_get_public_folder",
    "Get public folders — Get-PublicFolder (hierarchy)",
    { identity: z.string().optional().describe("PF identity, e.g. \\ or \\Marketing") },
    async ({ identity }) => {
      const cmd = identity ? `Get-PublicFolder -Identity "${identity}" | Select-Object Name,Identity,MailEnabled` : `Get-PublicFolder -Identity "\\" -Recurse | Select-Object Name,Identity | Select-Object -First 20`;
      const data = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "exchange_get_transport_config",
    "Get organization transport config — Get-TransportConfig (max send size, etc.)",
    {},
    async () => {
      const data = await ps.invokeJson(`Get-TransportConfig | Select-Object MaxSendSize,MaxReceiveSize,MaxRecipientEnvelopeLimit,JournalingReportNdrTo`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );
}
