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
      const data = await ps.invokeJson(`Get-InboxRule -Mailbox "${mailbox}" | Select-Object Name,Enabled,Priority,ForwardTo,ForwardAsAttachmentTo,RedirectTo,MoveToFolder,Description`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "exchange_get_mailbox_folder_permission",
    "Get mailbox folder permissions (Get-MailboxFolderPermission) — e.g. Calendar sharing. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/get-mailboxfolderpermission",
    { identity: z.string().describe("MailboxFolderId, e.g. admin@contoso.com:\\Calendar") },
    async ({ identity }) => {
      const data = await ps.invokeJson(`Get-MailboxFolderPermission -Identity '${identity.replace(/'/g, "''")}' | Select-Object FolderName,User,AccessRights`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "exchange_disable_inboxrule",
    "Disable an Inbox rule (Disable-InboxRule) — removes Outlook client-side rules as a side effect. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/disable-inboxrule",
    {
      identity: z.string().describe("Rule name or RuleIdentity, e.g. MoveAnnouncements"),
      mailbox: z.string().optional().describe("Mailbox, e.g. Joe@Contoso.com"),
      force: z.boolean().optional().describe("Hide the Outlook client-rules warning"),
      alwaysDeleteOutlookRulesBlob: z.boolean().optional().describe("Hide the OWA/PowerShell rules warning"),
      domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com (on-prem only)"),
    },
    async ({ identity, mailbox, force, alwaysDeleteOutlookRulesBlob, domainController }) => {
      const esc = (s: string) => s.replace(/'/g, "''");
      let cmd = `Disable-InboxRule -Identity '${esc(identity)}'`;
      if (mailbox) cmd += ` -Mailbox '${esc(mailbox)}'`;
      if (force) cmd += ` -Force`;
      if (alwaysDeleteOutlookRulesBlob) cmd += ` -AlwaysDeleteOutlookRulesBlob`;
      if (domainController) cmd += ` -DomainController '${esc(domainController)}'`;
      cmd += ` -Confirm:$false`;
      await ps.invoke(cmd);
      return { content: [{ type: "text", text: `Disabled Inbox rule ${identity}` }] };
    },
  );

  server.tool(
    "exchange_enable_inboxrule",
    "Enable an Inbox rule (Enable-InboxRule) — removes Outlook client-side rules as a side effect. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/enable-inboxrule",
    {
      identity: z.string().describe("Rule name or RuleIdentity, e.g. 'Move To Junk Mail'"),
      mailbox: z.string().optional().describe("Mailbox, e.g. 'User 1'"),
      force: z.boolean().optional().describe("Hide the Outlook client-rules warning"),
      alwaysDeleteOutlookRulesBlob: z.boolean().optional().describe("Hide the OWA/PowerShell rules warning"),
      domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com (on-prem only)"),
    },
    async ({ identity, mailbox, force, alwaysDeleteOutlookRulesBlob, domainController }) => {
      const esc = (s: string) => s.replace(/'/g, "''");
      let cmd = `Enable-InboxRule -Identity '${esc(identity)}'`;
      if (mailbox) cmd += ` -Mailbox '${esc(mailbox)}'`;
      if (force) cmd += ` -Force`;
      if (alwaysDeleteOutlookRulesBlob) cmd += ` -AlwaysDeleteOutlookRulesBlob`;
      if (domainController) cmd += ` -DomainController '${esc(domainController)}'`;
      cmd += ` -Confirm:$false`;
      await ps.invoke(cmd);
      return { content: [{ type: "text", text: `Enabled Inbox rule ${identity}` }] };
    },
  );

  server.tool(
    "exchange_set_inboxrule",
    "Modify an Inbox rule (Set-InboxRule) — conditions, exceptions, actions. Removes Outlook client-side rules as a side effect. Cloud-only params omitted. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/set-inboxrule",
    {
      identity: z.string().optional().describe("Rule name or RuleIdentity (required unless mailbox+name given)"),
      mailbox: z.string().optional().describe("Mailbox, e.g. chris@contoso.com"),
      name: z.string().optional().describe("Rule name (rename or address by name with mailbox)"),
      priority: z.number().optional(),
      from: z.string().optional().describe("Comma-separated senders"),
      subjectContainsWords: z.string().optional().describe("Comma-separated subject keywords"),
      bodyContainsWords: z.string().optional().describe("Comma-separated body keywords"),
      hasAttachment: z.boolean().optional(),
      markAsRead: z.boolean().optional(),
      markImportance: z.string().optional().describe("High, Normal, Low"),
      moveToFolder: z.string().optional().describe("Target folder as alias:\\Folder"),
      copyToFolder: z.string().optional().describe("Copy target folder as alias:\\Folder"),
      forwardTo: z.string().optional().describe("Forwarding recipient address"),
      redirectTo: z.string().optional().describe("Redirect recipient address"),
      deleteMessage: z.boolean().optional(),
      stopProcessingRules: z.boolean().optional(),
      force: z.boolean().optional().describe("Hide the Outlook client-rules warning"),
      domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com (on-prem only)"),
    },
    async (p) => {
      const esc = (s: string) => s.replace(/'/g, "''");
      const qlist = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean).map((x) => `'${esc(x)}'`).join(",");
      if (!p.identity && !p.name) throw new Error("identity or name is required (Set-InboxRule -Identity / -Name)");
      let cmd = `Set-InboxRule`;
      if (p.identity) cmd += ` -Identity '${esc(p.identity)}'`;
      if (p.mailbox) cmd += ` -Mailbox '${esc(p.mailbox)}'`;
      if (p.name) cmd += ` -Name '${esc(p.name)}'`;
      if (p.priority !== undefined) cmd += ` -Priority ${p.priority}`;
      if (p.from) cmd += ` -From ${qlist(p.from)}`;
      if (p.subjectContainsWords) cmd += ` -SubjectContainsWords ${qlist(p.subjectContainsWords)}`;
      if (p.bodyContainsWords) cmd += ` -BodyContainsWords ${qlist(p.bodyContainsWords)}`;
      if (p.hasAttachment !== undefined) cmd += ` -HasAttachment $${p.hasAttachment ? "true" : "false"}`;
      if (p.markAsRead !== undefined) cmd += ` -MarkAsRead $${p.markAsRead ? "true" : "false"}`;
      if (p.markImportance) cmd += ` -MarkImportance ${p.markImportance}`;
      if (p.moveToFolder) cmd += ` -MoveToFolder '${esc(p.moveToFolder)}'`;
      if (p.copyToFolder) cmd += ` -CopyToFolder '${esc(p.copyToFolder)}'`;
      if (p.forwardTo) cmd += ` -ForwardTo '${esc(p.forwardTo)}'`;
      if (p.redirectTo) cmd += ` -RedirectTo '${esc(p.redirectTo)}'`;
      if (p.deleteMessage !== undefined) cmd += ` -DeleteMessage $${p.deleteMessage ? "true" : "false"}`;
      if (p.stopProcessingRules !== undefined) cmd += ` -StopProcessingRules $${p.stopProcessingRules ? "true" : "false"}`;
      if (p.force) cmd += ` -Force`;
      if (p.domainController) cmd += ` -DomainController '${esc(p.domainController)}'`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_remove_inboxrule",
    "Remove an Inbox rule (Remove-InboxRule) — removes Outlook client-side rules as a side effect. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/remove-inboxrule",
    {
      identity: z.string().describe("Rule name or RuleIdentity, e.g. ProjectA-MoveToFolderA"),
      mailbox: z.string().optional().describe("Mailbox, e.g. Joe@Contoso.com"),
      force: z.boolean().optional().describe("Hide the Outlook client-rules warning"),
      domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com (on-prem only)"),
    },
    async ({ identity, mailbox, force, domainController }) => {
      const esc = (s: string) => s.replace(/'/g, "''");
      let cmd = `Remove-InboxRule -Identity '${esc(identity)}'`;
      if (mailbox) cmd += ` -Mailbox '${esc(mailbox)}'`;
      if (force) cmd += ` -Force`;
      if (domainController) cmd += ` -DomainController '${esc(domainController)}'`;
      cmd += ` -Confirm:$false`;
      await ps.invoke(cmd);
      return { content: [{ type: "text", text: `Removed Inbox rule ${identity}` }] };
    },
  );

  server.tool(
    "exchange_add_mailboxfolderpermission",
    "Add folder-level permissions (Add-MailboxFolderPermission) — roles (Owner/Editor/Reviewer...) or individual rights. Cloud-only delegate flags omitted. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/add-mailboxfolderpermission",
    {
      identity: z.string().describe("MailboxFolderId, e.g. ayla@contoso.com:\\Marketing"),
      user: z.string().describe("Grantee (mailbox/mail user/security group), e.g. ed@contoso.com"),
      accessRights: z.string().describe("Comma-separated roles/rights, e.g. Owner or Editor"),
      domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com (on-prem only)"),
    },
    async ({ identity, user, accessRights, domainController }) => {
      const esc = (s: string) => s.replace(/'/g, "''");
      const rights = accessRights.split(",").map((x) => x.trim()).filter(Boolean).join(",");
      let cmd = `Add-MailboxFolderPermission -Identity '${esc(identity)}' -User '${esc(user)}' -AccessRights ${rights}`;
      if (domainController) cmd += ` -DomainController '${esc(domainController)}'`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_remove_mailboxfolderpermission",
    "Remove folder-level permissions (Remove-MailboxFolderPermission) — removes ALL rights of the user on the folder (no selective removal; use Set- to modify). See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/remove-mailboxfolderpermission",
    {
      identity: z.string().describe("MailboxFolderId, e.g. kim@contoso.com:\\Training"),
      user: z.string().optional().describe("User whose rights are removed (required unless resetDelegateUserCollection)"),
      resetDelegateUserCollection: z.boolean().optional().describe("Clear corrupted delegate info on the Calendar (downgrades delegates to Editor)"),
      domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com (on-prem only)"),
    },
    async ({ identity, user, resetDelegateUserCollection, domainController }) => {
      const esc = (s: string) => s.replace(/'/g, "''");
      if (!user && !resetDelegateUserCollection) throw new Error("user or resetDelegateUserCollection is required");
      let cmd = `Remove-MailboxFolderPermission -Identity '${esc(identity)}'`;
      if (user) cmd += ` -User '${esc(user)}'`;
      if (resetDelegateUserCollection) cmd += ` -ResetDelegateUserCollection`;
      if (domainController) cmd += ` -DomainController '${esc(domainController)}'`;
      cmd += ` -Confirm:$false`;
      await ps.invoke(cmd);
      return { content: [{ type: "text", text: `Removed folder permission on ${identity}${user ? ` for ${user}` : ""}` }] };
    },
  );

  server.tool(
    "exchange_set_mailboxfolderpermission",
    "Modify folder-level permissions (Set-MailboxFolderPermission) — replaces the user's existing rights on the folder. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/set-mailboxfolderpermission",
    {
      identity: z.string().describe("MailboxFolderId, e.g. ayla@contoso.com:\\Marketing"),
      user: z.string().describe("Grantee, e.g. ed@contoso.com"),
      accessRights: z.string().describe("Comma-separated roles/rights replacing existing, e.g. Owner"),
      domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com (on-prem only)"),
    },
    async ({ identity, user, accessRights, domainController }) => {
      const esc = (s: string) => s.replace(/'/g, "''");
      const rights = accessRights.split(",").map((x) => x.trim()).filter(Boolean).join(",");
      let cmd = `Set-MailboxFolderPermission -Identity '${esc(identity)}' -User '${esc(user)}' -AccessRights ${rights}`;
      if (domainController) cmd += ` -DomainController '${esc(domainController)}'`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_get_mailboxfolder",
    "View folders in a mailbox (Get-MailboxFolder) — own mailbox only (MyBaseOptions role); admins cannot target other mailboxes. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/get-mailboxfolder",
    {
      identity: z.string().optional().describe("Folder path, e.g. :\\Inbox. Omit for root folders."),
      getChildren: z.boolean().optional().describe("First-level subfolders only (mutually exclusive with recurse)"),
      recurse: z.boolean().optional().describe("Parent folder + all subfolder levels"),
      mailFolderOnly: z.boolean().optional().describe("Mail folders only"),
      resultSize: z.number().min(1).max(10000).optional().describe("Max rows (default 1000 server-side)"),
      domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com (on-prem only)"),
    },
    async ({ identity, getChildren, recurse, mailFolderOnly, resultSize, domainController }) => {
      const esc = (s: string) => s.replace(/'/g, "''");
      if (getChildren && recurse) throw new Error("getChildren and recurse are mutually exclusive");
      let cmd = `Get-MailboxFolder`;
      if (identity) cmd += ` -Identity '${esc(identity)}'`;
      if (getChildren) cmd += ` -GetChildren`;
      if (recurse) cmd += ` -Recurse`;
      if (mailFolderOnly) cmd += ` -MailFolderOnly`;
      if (resultSize !== undefined) cmd += ` -ResultSize ${resultSize}`;
      if (domainController) cmd += ` -DomainController '${esc(domainController)}'`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_new_mailboxfolder",
    "Create a folder in a mailbox (New-MailboxFolder) — own mailbox only (MyBaseOptions role). See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/new-mailboxfolder",
    {
      name: z.string().describe("New folder name, e.g. Personal"),
      parent: z.string().describe("Parent path, e.g. :\\Inbox (or :\\ for root)"),
      domainController: z.string().optional().describe("FQDN (on-prem only)"),
    },
    async ({ name, parent, domainController }) => {
      const esc = (s: string) => s.replace(/'/g, "''");
      let cmd = `New-MailboxFolder -Name '${esc(name)}' -Parent '${esc(parent)}'`;
      if (domainController) cmd += ` -DomainController '${esc(domainController)}'`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_get_sweeprule",
    "View Sweep rules (Get-SweepRule) — scheduled Inbox-cleaning rules. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/get-sweeprule",
    {
      identity: z.string().optional().describe("RuleId value, e.g. x2hlsdpGmUifjFgxxGIOJw=="),
      mailbox: z.string().optional().describe("Filter by mailbox, e.g. julia@contoso.com"),
      provider: z.string().optional().describe("Filter by provider (default Exchange16 for OWA-created)"),
      bypassScopeCheck: z.boolean().optional(),
      domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com (on-prem only)"),
    },
    async ({ identity, mailbox, provider, bypassScopeCheck, domainController }) => {
      const esc = (s: string) => s.replace(/'/g, "''");
      let cmd = `Get-SweepRule`;
      if (identity) cmd += ` -Identity '${esc(identity)}'`;
      if (mailbox) cmd += ` -Mailbox '${esc(mailbox)}'`;
      if (provider) cmd += ` -Provider '${esc(provider)}'`;
      if (bypassScopeCheck) cmd += ` -BypassScopeCheck`;
      if (domainController) cmd += ` -DomainController '${esc(domainController)}'`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_new_sweeprule",
    "Create a Sweep rule (New-SweepRule) — keep-latest / keep-for-days auto-cleanup. KeepLatest and KeepForDays are mutually exclusive (one required). See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/new-sweeprule",
    {
      name: z.string().describe("Rule name, e.g. 'From Michelle'"),
      provider: z.string().describe("Provider (default Exchange16 for OWA)"),
      mailbox: z.string().optional().describe("Mailbox, e.g. 'Felipe Apodaca'"),
      sender: z.string().optional().describe("Sender filter, e.g. michelle@fabrikam.com"),
      keepLatest: z.number().optional().describe("Keep N newest matching messages"),
      keepForDays: z.number().optional().describe("Keep matching messages N days"),
      sourceFolder: z.string().optional().describe("MailboxFolderId to sweep (default Inbox)"),
      destinationFolder: z.string().optional().describe("Move target (default Deleted Items)"),
      systemCategory: z.string().optional(),
      enabled: z.boolean().optional().describe("Default $true"),
      exceptIfFlagged: z.boolean().optional().describe("Skip flagged messages (on-prem only)"),
      exceptIfPinned: z.boolean().optional().describe("Skip pinned messages (on-prem only)"),
      domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com (on-prem only)"),
    },
    async (p) => {
      const esc = (s: string) => s.replace(/'/g, "''");
      if (p.keepLatest !== undefined && p.keepForDays !== undefined) throw new Error("keepLatest and keepForDays are mutually exclusive");
      if (p.keepLatest === undefined && p.keepForDays === undefined) throw new Error("one of keepLatest or keepForDays is required");
      let cmd = `New-SweepRule -Name '${esc(p.name)}' -Provider ${p.provider}`;
      if (p.mailbox) cmd += ` -Mailbox '${esc(p.mailbox)}'`;
      if (p.sender) cmd += ` -Sender '${esc(p.sender)}'`;
      if (p.keepLatest !== undefined) cmd += ` -KeepLatest ${p.keepLatest}`;
      if (p.keepForDays !== undefined) cmd += ` -KeepForDays ${p.keepForDays}`;
      if (p.sourceFolder) cmd += ` -SourceFolder '${esc(p.sourceFolder)}'`;
      if (p.destinationFolder) cmd += ` -DestinationFolder '${esc(p.destinationFolder)}'`;
      if (p.systemCategory) cmd += ` -SystemCategory ${p.systemCategory}`;
      if (p.enabled !== undefined) cmd += ` -Enabled $${p.enabled ? "true" : "false"}`;
      if (p.exceptIfFlagged !== undefined) cmd += ` -ExceptIfFlagged $${p.exceptIfFlagged ? "true" : "false"}`;
      if (p.exceptIfPinned !== undefined) cmd += ` -ExceptIfPinned $${p.exceptIfPinned ? "true" : "false"}`;
      if (p.domainController) cmd += ` -DomainController '${esc(p.domainController)}'`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_set_sweeprule",
    "Modify a Sweep rule (Set-SweepRule). See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/set-sweeprule",
    {
      identity: z.string().describe("RuleId, e.g. x2hlsdpGmUifjFgxxGIOJw=="),
      mailbox: z.string().optional(),
      name: z.string().optional(),
      provider: z.string().optional(),
      sender: z.string().optional(),
      keepLatest: z.number().optional(),
      keepForDays: z.number().optional(),
      sourceFolder: z.string().optional(),
      destinationFolder: z.string().optional(),
      systemCategory: z.string().optional(),
      enabled: z.boolean().optional(),
      exceptIfFlagged: z.boolean().optional(),
      exceptIfPinned: z.boolean().optional(),
      domainController: z.string().optional().describe("FQDN (on-prem only)"),
    },
    async (p) => {
      const esc = (s: string) => s.replace(/'/g, "''");
      if (p.keepLatest !== undefined && p.keepForDays !== undefined) throw new Error("keepLatest and keepForDays are mutually exclusive");
      let cmd = `Set-SweepRule -Identity '${esc(p.identity)}'`;
      if (p.mailbox) cmd += ` -Mailbox '${esc(p.mailbox)}'`;
      if (p.name) cmd += ` -Name '${esc(p.name)}'`;
      if (p.provider) cmd += ` -Provider ${p.provider}`;
      if (p.sender) cmd += ` -Sender '${esc(p.sender)}'`;
      if (p.keepLatest !== undefined) cmd += ` -KeepLatest ${p.keepLatest}`;
      if (p.keepForDays !== undefined) cmd += ` -KeepForDays ${p.keepForDays}`;
      if (p.sourceFolder) cmd += ` -SourceFolder '${esc(p.sourceFolder)}'`;
      if (p.destinationFolder) cmd += ` -DestinationFolder '${esc(p.destinationFolder)}'`;
      if (p.systemCategory) cmd += ` -SystemCategory ${p.systemCategory}`;
      if (p.enabled !== undefined) cmd += ` -Enabled $${p.enabled ? "true" : "false"}`;
      if (p.exceptIfFlagged !== undefined) cmd += ` -ExceptIfFlagged $${p.exceptIfFlagged ? "true" : "false"}`;
      if (p.exceptIfPinned !== undefined) cmd += ` -ExceptIfPinned $${p.exceptIfPinned ? "true" : "false"}`;
      if (p.domainController) cmd += ` -DomainController '${esc(p.domainController)}'`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_remove_sweeprule",
    "Remove a Sweep rule (Remove-SweepRule). See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/remove-sweeprule",
    {
      identity: z.string().describe("RuleId, e.g. x2hlsdpGmUifjFgxxGIOJw=="),
      mailbox: z.string().optional(),
      domainController: z.string().optional().describe("FQDN (on-prem only)"),
    },
    async ({ identity, mailbox, domainController }) => {
      const esc = (s: string) => s.replace(/'/g, "''");
      let cmd = `Remove-SweepRule -Identity '${esc(identity)}'`;
      if (mailbox) cmd += ` -Mailbox '${esc(mailbox)}'`;
      if (domainController) cmd += ` -DomainController '${esc(domainController)}'`;
      cmd += ` -Confirm:$false`;
      await ps.invoke(cmd);
      return { content: [{ type: "text", text: `Removed Sweep rule ${identity}` }] };
    },
  );

  server.tool(
    "exchange_enable_sweeprule",
    "Enable a Sweep rule (Enable-SweepRule). See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/enable-sweeprule",
    {
      identity: z.string().describe("RuleId, e.g. x2hlsdpGmUifjFgxxGIOJw=="),
      mailbox: z.string().optional(),
      domainController: z.string().optional().describe("FQDN (on-prem only)"),
    },
    async ({ identity, mailbox, domainController }) => {
      const esc = (s: string) => s.replace(/'/g, "''");
      let cmd = `Enable-SweepRule -Identity '${esc(identity)}'`;
      if (mailbox) cmd += ` -Mailbox '${esc(mailbox)}'`;
      if (domainController) cmd += ` -DomainController '${esc(domainController)}'`;
      await ps.invoke(cmd);
      return { content: [{ type: "text", text: `Enabled Sweep rule ${identity}` }] };
    },
  );

  server.tool(
    "exchange_disable_sweeprule",
    "Disable a Sweep rule (Disable-SweepRule). See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/disable-sweeprule",
    {
      identity: z.string().describe("RuleId, e.g. x2hlsdpGmUifjFgxxGIOJw=="),
      mailbox: z.string().optional(),
      domainController: z.string().optional().describe("FQDN (on-prem only)"),
    },
    async ({ identity, mailbox, domainController }) => {
      const esc = (s: string) => s.replace(/'/g, "''");
      let cmd = `Disable-SweepRule -Identity '${esc(identity)}'`;
      if (mailbox) cmd += ` -Mailbox '${esc(mailbox)}'`;
      if (domainController) cmd += ` -DomainController '${esc(domainController)}'`;
      await ps.invoke(cmd);
      return { content: [{ type: "text", text: `Disabled Sweep rule ${identity}` }] };
    },
  );

  server.tool(
    "exchange_get_mailbox_permission",
    "Alias: Get mailbox permissions (already in recipients, exposed for completeness)",
    { identity: z.string() },
    async ({ identity }) => {
      const data = await ps.invokeJson(`Get-MailboxPermission -Identity "${identity}" | Select-Object User,AccessRights,Deny`);
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
        : `Get-Mailbox -ResultSize 20 | Select-Object DisplayName,ArchiveStatus,ArchiveDatabase`;
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
      const cmd = mailbox ? `Get-MobileDevice -Mailbox "${mailbox}" | Select-Object FriendlyName,DeviceType,DeviceModel,LastSuccessSync` : `Get-MobileDevice -ResultSize 20 | Select-Object FriendlyName,DeviceType,Mailbox`;
      const data = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "exchange_get_public_folder",
    "Get public folders — Get-PublicFolder (hierarchy)",
    { identity: z.string().optional().describe("PF identity, e.g. \\ or \\Marketing") },
    async ({ identity }) => {
      const cmd = identity ? `Get-PublicFolder -Identity "${identity}" | Select-Object Name,Identity,MailEnabled` : `Get-PublicFolder -Identity "\\" -Recurse | Select-Object Name,Identity`;
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
