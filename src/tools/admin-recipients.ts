import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PowerShellProvider } from "../clients/powershell-provider.js";

// Recipient Administration — covers EAC Recipients + Permissions (per learn.microsoft.com Exchange admin center)
export function registerRecipientAdminTools(server: McpServer, ps: PowerShellProvider) {
  server.tool("exchange_list_mailboxes", "List mailboxes (admin) — supports filter and RecipientTypeDetails", {
    filter: z.string().optional().describe("Name filter (wildcard)"), recipientType: z.string().optional().describe("UserMailbox, SharedMailbox, RoomMailbox, EquipmentMailbox, etc."), resultSize: z.number().min(1).max(1000).optional(),
  }, async ({ filter, recipientType, resultSize }) => {
    const data = await ps.listMailboxes(filter, recipientType, resultSize ?? 20);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_get_mailbox", "Get mailbox details by identity", { identity: z.string() }, async ({ identity }) => {
    const data = await ps.getMailbox(identity);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_get_mailbox_statistics", "Get mailbox statistics (size, item count, last logon, DB) — troubleshooting storage/quota", { identity: z.string() }, async ({ identity }) => {
    const data = await ps.getMailboxStatistics(identity);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_get_mailbox_permissions", "Get mailbox permissions (FullAccess, SendAs, etc.)", { identity: z.string() }, async ({ identity }) => {
    const data = await ps.invokeJson(`Get-MailboxPermission -Identity "${identity}"`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_create_mailbox", "Create mailbox (New-Mailbox) — user/shared/room", {
    name: z.string(), alias: z.string().optional(), userPrincipalName: z.string().optional(), shared: z.boolean().optional().describe("Create shared mailbox"), room: z.boolean().optional(),
    database: z.string().optional(),
  }, async ({ name, alias, userPrincipalName, shared, room, database }) => {
    let cmd = `New-Mailbox -Name "${name}"`;
    if (alias) cmd += ` -Alias "${alias}"`;
    if (userPrincipalName) cmd += ` -UserPrincipalName "${userPrincipalName}"`;
    if (shared) cmd += ` -Shared`;
    if (room) cmd += ` -Room`;
    if (database) cmd += ` -Database "${database}"`;
    const data = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_set_mailbox", "Set mailbox properties (prohibitSendQuota, retention, etc.)", {
    identity: z.string(), prohibitSendQuota: z.string().optional(), issueWarningQuota: z.string().optional(), customAttribute1: z.string().optional(),
  }, async ({ identity, prohibitSendQuota, issueWarningQuota, customAttribute1 }) => {
    let cmd = `Set-Mailbox -Identity "${identity}"`;
    if (prohibitSendQuota) cmd += ` -ProhibitSendQuota "${prohibitSendQuota}"`;
    if (issueWarningQuota) cmd += ` -IssueWarningQuota "${issueWarningQuota}"`;
    if (customAttribute1) cmd += ` -CustomAttribute1 "${customAttribute1}"`;
    const data = await ps.invokeJson(cmd + " -PassThru");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_remove_mailbox", "Remove mailbox (disable/delete)", { identity: z.string(), permanent: z.boolean().optional() }, async ({ identity, permanent }) => {
    const verb = permanent ? "Remove-Mailbox" : "Disable-Mailbox";
    const data = await ps.invoke(`${verb} -Identity "${identity}" -Confirm:$false | ConvertTo-Json`);
    return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_list_distribution_groups", "List distribution groups", { filter: z.string().optional() }, async ({ filter }) => {
    const data = await ps.listDistributionGroups(filter);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_get_distribution_group_member", "Get distribution group members", { identity: z.string() }, async ({ identity }) => {
    const data = await ps.invokeJson(`Get-DistributionGroupMember -Identity "${identity}"`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_list_dynamic_distribution_groups", "List dynamic distribution groups", {}, async () => {
    const data = await ps.invokeJson("Get-DynamicDistributionGroup -ResultSize 20");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_list_mail_contacts", "List mail contacts", { resultSize: z.number().optional() }, async ({ resultSize }) => {
    const data = await ps.invokeJson(`Get-MailContact -ResultSize ${resultSize ?? 20}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_list_mail_users", "List mail users", { resultSize: z.number().optional() }, async ({ resultSize }) => {
    const data = await ps.invokeJson(`Get-MailUser -ResultSize ${resultSize ?? 20}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_get_cas_mailbox", "Get Client Access mailbox settings (ActiveSync, OWA, MAPI)", { identity: z.string() }, async ({ identity }) => {
    const data = await ps.invokeJson(`Get-CASMailbox -Identity "${identity}"`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });
}
