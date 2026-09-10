import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PowerShellProvider } from "../clients/powershell-provider.js";

// Recipient provisioning: creating mail-enabled objects (hybrid remote
// mailboxes, mail users/contacts, dynamic groups, export requests, inbox
// rules). All writes go through the desktop confirm gate + interactive form.

function q(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

function securePrelude(varName: string, password: string): string {
  return `$${varName} = ConvertTo-SecureString -String '${password.replace(/'/g, "''")}' -AsPlainText -Force; `;
}

export function registerProvisioningTools(server: McpServer, ps: PowerShellProvider) {
  server.tool("exchange_create_remote_mailbox", "Create a hybrid remote mailbox (New-RemoteMailbox) — on-prem mail user + cloud mailbox after DirSync. For UserMailbox, password is required (SecureString).", {
    name: z.string().describe("Display name"),
    userPrincipalName: z.string().describe("UPN, e.g. kim@contoso.com"),
    password: z.string().optional().describe("Initial password (required unless Shared/Room/Equipment). Will be converted to SecureString."),
    alias: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    remoteRoutingAddress: z.string().optional().describe("Cloud routing address, e.g. kim@contoso.mail.onmicrosoft.com (auto-calculated when mail flow is configured)"),
    onPremisesOU: z.string().optional().describe("OU DN for the on-prem mail user"),
    shared: z.boolean().optional().describe("Create shared remote mailbox"),
    room: z.boolean().optional().describe("Create room remote mailbox"),
    equipment: z.boolean().optional().describe("Create equipment remote mailbox"),
  }, async ({ name, userPrincipalName, password, alias, firstName, lastName, remoteRoutingAddress, onPremisesOU, shared, room, equipment }) => {
    const isSharedLike = !!(shared || room || equipment);
    if (!isSharedLike && !password) {
      throw new Error("Password is required for remote UserMailbox creation (New-RemoteMailbox -Password). Provide 'password' param, or set shared/room/equipment:true for resource mailboxes.");
    }
    let cmd = "";
    if (password && !isSharedLike) cmd += securePrelude("secPw", password);
    cmd += `New-RemoteMailbox -Name ${q(name)} -UserPrincipalName ${q(userPrincipalName)}`;
    if (password && !isSharedLike) cmd += " -Password $secPw";
    if (alias) cmd += ` -Alias ${q(alias)}`;
    if (firstName) cmd += ` -FirstName ${q(firstName)}`;
    if (lastName) cmd += ` -LastName ${q(lastName)}`;
    if (remoteRoutingAddress) cmd += ` -RemoteRoutingAddress ${q(remoteRoutingAddress)}`;
    if (onPremisesOU) cmd += ` -OnPremisesOrganizationalUnit ${q(onPremisesOU)}`;
    if (shared) cmd += " -Shared";
    if (room) cmd += " -Room";
    if (equipment) cmd += " -Equipment";
    const data = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_enable_remote_mailbox", "Mail-enable an existing AD user for hybrid cloud mailbox (Enable-RemoteMailbox)", {
    identity: z.string().describe("Existing AD user identity"),
    remoteRoutingAddress: z.string().optional().describe("Cloud routing address, e.g. kim@contoso.mail.onmicrosoft.com"),
    alias: z.string().optional(),
    shared: z.boolean().optional(),
    room: z.boolean().optional(),
    equipment: z.boolean().optional(),
  }, async ({ identity, remoteRoutingAddress, alias, shared, room, equipment }) => {
    let cmd = `Enable-RemoteMailbox -Identity '${identity.replace(/'/g, "''")}'`;
    if (remoteRoutingAddress) cmd += ` -RemoteRoutingAddress ${q(remoteRoutingAddress)}`;
    if (alias) cmd += ` -Alias ${q(alias)}`;
    if (shared) cmd += " -Shared";
    if (room) cmd += " -Room";
    if (equipment) cmd += " -Equipment";
    const data = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_create_mail_user", "Create a mail user (New-MailUser) — AD user with an external email address", {
    name: z.string().describe("Display name"),
    externalEmailAddress: z.string().describe("External target address, e.g. user@tailspintoys.com"),
    userPrincipalName: z.string().optional().describe("UPN for the new AD account"),
    password: z.string().optional().describe("Password for the new AD account (SecureString)"),
    alias: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    organizationalUnit: z.string().optional(),
  }, async ({ name, externalEmailAddress, userPrincipalName, password, alias, firstName, lastName, organizationalUnit }) => {
    let cmd = "";
    if (password) cmd += securePrelude("secPw", password);
    cmd += `New-MailUser -Name ${q(name)} -ExternalEmailAddress ${q(externalEmailAddress)}`;
    if (userPrincipalName) cmd += ` -UserPrincipalName ${q(userPrincipalName)}`;
    if (password) cmd += " -Password $secPw";
    if (alias) cmd += ` -Alias ${q(alias)}`;
    if (firstName) cmd += ` -FirstName ${q(firstName)}`;
    if (lastName) cmd += ` -LastName ${q(lastName)}`;
    if (organizationalUnit) cmd += ` -OrganizationalUnit ${q(organizationalUnit)}`;
    const data = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_enable_mail_user", "Mail-enable an existing AD user (Enable-MailUser)", {
    identity: z.string().describe("Existing AD user identity"),
    externalEmailAddress: z.string().describe("External target address"),
    alias: z.string().optional(),
  }, async ({ identity, externalEmailAddress, alias }) => {
    let cmd = `Enable-MailUser -Identity '${identity.replace(/'/g, "''")}' -ExternalEmailAddress ${q(externalEmailAddress)}`;
    if (alias) cmd += ` -Alias ${q(alias)}`;
    const data = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_create_mail_contact", "Create a mail contact (New-MailContact) — external person/org in the GAL", {
    name: z.string().describe("Display name"),
    externalEmailAddress: z.string().describe("External address messages are forwarded to"),
    alias: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    organizationalUnit: z.string().optional(),
  }, async ({ name, externalEmailAddress, alias, firstName, lastName, organizationalUnit }) => {
    let cmd = `New-MailContact -Name ${q(name)} -ExternalEmailAddress ${q(externalEmailAddress)}`;
    if (alias) cmd += ` -Alias ${q(alias)}`;
    if (firstName) cmd += ` -FirstName ${q(firstName)}`;
    if (lastName) cmd += ` -LastName ${q(lastName)}`;
    if (organizationalUnit) cmd += ` -OrganizationalUnit ${q(organizationalUnit)}`;
    const data = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_create_dynamic_distribution_group", "Create a dynamic distribution group (New-DynamicDistributionGroup) — membership by filter. Provide EITHER precanned IncludedRecipients (+ optional Conditional*) OR a custom RecipientFilter OPATH string, never both.", {
    name: z.string().describe("Group display name"),
    includedRecipients: z.string().optional().describe("Precanned type, e.g. MailboxUsers, MailContacts, MailGroups, MailUsers, Resources"),
    conditionalCompany: z.string().optional().describe("Precanned condition: Company equals"),
    conditionalDepartment: z.string().optional().describe("Precanned condition: Department equals"),
    recipientFilter: z.string().optional().describe("Custom OPATH filter, e.g. (RecipientTypeDetails -eq 'UserMailbox'). Max 2048 chars."),
    alias: z.string().optional(),
    organizationalUnit: z.string().optional(),
    recipientContainer: z.string().optional().describe("OU scope for membership evaluation"),
    primarySmtpAddress: z.string().optional(),
  }, async ({ name, includedRecipients, conditionalCompany, conditionalDepartment, recipientFilter, alias, organizationalUnit, recipientContainer, primarySmtpAddress }) => {
    const hasPrecanned = !!includedRecipients;
    const hasCustom = !!recipientFilter;
    if ((hasPrecanned && hasCustom) || (!hasPrecanned && !hasCustom)) {
      throw new Error("Provide EITHER IncludedRecipients (+ optional Conditional*) OR RecipientFilter, never both and never neither.");
    }
    let cmd = `New-DynamicDistributionGroup -Name ${q(name)}`;
    if (hasPrecanned) {
      cmd += ` -IncludedRecipients ${includedRecipients}`;
      if (conditionalCompany) cmd += ` -ConditionalCompany ${q(conditionalCompany)}`;
      if (conditionalDepartment) cmd += ` -ConditionalDepartment ${q(conditionalDepartment)}`;
    } else {
      if (recipientFilter!.length > 2048) throw new Error("RecipientFilter exceeds the 2048 character limit.");
      cmd += ` -RecipientFilter "${recipientFilter!.replace(/"/g, '""')}"`;
    }
    if (alias) cmd += ` -Alias ${q(alias)}`;
    if (organizationalUnit) cmd += ` -OrganizationalUnit ${q(organizationalUnit)}`;
    if (recipientContainer) cmd += ` -RecipientContainer ${q(recipientContainer)}`;
    if (primarySmtpAddress) cmd += ` -PrimarySmtpAddress ${q(primarySmtpAddress)}`;
    const data = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_create_mailbox_export_request", "Create a mailbox export request to PST (New-MailboxExportRequest). Requires the Mailbox Import Export RBAC role. PST path must be a UNC share.", {
    mailbox: z.string().describe("Source mailbox identity"),
    filePath: z.string().describe("UNC path to the target PST, e.g. \\\\SERVER01\\PST\\user.pst"),
    name: z.string().optional().describe("Request name (allows more than 10 requests per mailbox)"),
    isArchive: z.boolean().optional().describe("Export the archive mailbox instead of the primary"),
    includeFolders: z.string().optional().describe("Comma-separated folders, e.g. #Inbox#"),
    excludeFolders: z.string().optional().describe("Comma-separated folders to skip"),
    contentFilter: z.string().optional().describe("OPATH content filter, e.g. (Received -lt '01/01/2024')"),
    priority: z.enum(["Low", "Normal", "High"]).optional(),
  }, async ({ mailbox, filePath, name, isArchive, includeFolders, excludeFolders, contentFilter, priority }) => {
    let cmd = `New-MailboxExportRequest -Mailbox '${mailbox.replace(/'/g, "''")}' -FilePath '${filePath.replace(/'/g, "''")}'`;
    if (name) cmd += ` -Name ${q(name)}`;
    if (isArchive) cmd += " -IsArchive";
    if (includeFolders) cmd += ` -IncludeFolders ${includeFolders.split(",").map((f) => q(f.trim())).join(",")}`;
    if (excludeFolders) cmd += ` -ExcludeFolders ${excludeFolders.split(",").map((f) => q(f.trim())).join(",")}`;
    if (contentFilter) cmd += ` -ContentFilter "${contentFilter.replace(/"/g, '""')}"`;
    if (priority) cmd += ` -Priority ${priority}`;
    const data = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_get_mailbox_export_request", "Get mailbox export request status (Get-MailboxExportRequest)", {
    identity: z.string().optional().describe("Request identity, e.g. alias\\ExportName"),
    mailbox: z.string().optional().describe("Show all export requests for a mailbox"),
  }, async ({ identity, mailbox }) => {
    let cmd = "Get-MailboxExportRequest";
    if (identity) cmd += ` -Identity '${identity.replace(/'/g, "''")}'`;
    else if (mailbox) cmd += ` -Mailbox '${mailbox.replace(/'/g, "''")}'`;
    const data = await ps.invokeJson(`${cmd} | Select-Object Identity,Mailbox,Status,PercentComplete,FilePath`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_create_inbox_rule", "Create a server-side inbox rule (New-InboxRule) — conditions plus actions for a mailbox. Target folders must already exist.", {
    mailbox: z.string().describe("Mailbox identity"),
    name: z.string().describe("Rule name"),
    from: z.string().optional().describe("Sender address or domain to match"),
    subjectContainsWords: z.string().optional().describe("Comma-separated subject keywords"),
    bodyContainsWords: z.string().optional().describe("Comma-separated body keywords"),
    hasAttachment: z.boolean().optional(),
    moveToFolder: z.string().optional().describe("Target folder as alias:\\Folder, e.g. alice@contoso.com:\\Archive"),
    copyToFolder: z.string().optional().describe("Copy target folder as alias:\\Folder"),
    forwardTo: z.string().optional().describe("Forwarding recipient address"),
    markAsRead: z.boolean().optional(),
    markImportance: z.enum(["Low", "Normal", "High"]).optional(),
    deleteMessage: z.boolean().optional().describe("Delete the message (bypasses Deleted Items)"),
    stopProcessingRules: z.boolean().optional(),
  }, async ({ mailbox, name, from, subjectContainsWords, bodyContainsWords, hasAttachment, moveToFolder, copyToFolder, forwardTo, markAsRead, markImportance, deleteMessage, stopProcessingRules }) => {
    const mb = mailbox.replace(/'/g, "''");
    let cmd = `New-InboxRule -Mailbox '${mb}' -Name ${q(name)}`;
    if (from) cmd += ` -From ${q(from)}`;
    if (subjectContainsWords) cmd += ` -SubjectContainsWords ${subjectContainsWords.split(",").map((s) => q(s.trim())).join(",")}`;
    if (bodyContainsWords) cmd += ` -BodyContainsWords ${bodyContainsWords.split(",").map((s) => q(s.trim())).join(",")}`;
    if (hasAttachment) cmd += " -HasAttachment:$true";
    if (moveToFolder) cmd += ` -MoveToFolder ${q(moveToFolder)}`;
    if (copyToFolder) cmd += ` -CopyToFolder ${q(copyToFolder)}`;
    if (forwardTo) cmd += ` -ForwardTo ${q(forwardTo)}`;
    if (markAsRead) cmd += " -MarkAsRead:$true";
    if (markImportance) cmd += ` -MarkImportance ${markImportance}`;
    if (deleteMessage) cmd += " -DeleteMessage:$true";
    if (stopProcessingRules) cmd += " -StopProcessingRules:$true";
    const data = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_enable_mail_public_folder", "Mail-enable a public folder (Enable-MailPublicFolder) so it can receive email", {
    identity: z.string().describe("Public folder identity, e.g. \\Sales"),
  }, async ({ identity }) => {
    const data = await ps.invokeJson(`Enable-MailPublicFolder -Identity '${identity.replace(/'/g, "''")}'`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });
}
