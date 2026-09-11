import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PowerShellProvider } from "../clients/powershell-provider.js";

// Client Access (Batch 1: Get-* reads) — per
// https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/?view=exchange-ps#client-access
// All read-only via invokeJson, single-quote escaping, no confirm.

function esc(s: string): string {
  return s.replace(/'/g, "''");
}

function dcSuffix(domainController?: string): string {
  return domainController ? ` -DomainController '${esc(domainController)}'` : "";
}

export function registerClientAccessTools(server: McpServer, ps: PowerShellProvider) {
  server.tool("exchange_get_clientaccessrule", "View client access rules (Get-ClientAccessRule) — connection allow/block rules. Functional in Exchange 2019+. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/get-clientaccessrule", {
    identity: z.string().optional().describe("Rule name, DN, or GUID. Omit to list all rules."),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com"),
  }, async ({ identity, domainController }) => {
    let cmd = `Get-ClientAccessRule`;
    if (identity) cmd += ` -Identity '${esc(identity)}'`;
    cmd += dcSuffix(domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_get_imapsettings", "View IMAP4 frontend service settings (Get-ImapSettings). See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/get-imapsettings", {
    server: z.string().optional().describe("Exchange server name, e.g. MBX01. Omit for local server."),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com"),
  }, async ({ server, domainController }) => {
    let cmd = `Get-ImapSettings`;
    if (server) cmd += ` -Server '${esc(server)}'`;
    cmd += dcSuffix(domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_get_mailboxcalendarconfiguration", "Show mailbox calendar settings (Get-MailboxCalendarConfiguration) — workdays, working hours, week start. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/get-mailboxcalendarconfiguration", {
    identity: z.string().describe("Mailbox (alias, email, DN...), e.g. kai"),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com (on-prem only)"),
  }, async ({ identity, domainController }) => {
    let cmd = `Get-MailboxCalendarConfiguration -Identity '${esc(identity)}'`;
    cmd += dcSuffix(domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_get_mailboxmessageconfiguration", "View Outlook on the web settings for a mailbox (Get-MailboxMessageConfiguration). Credential omitted (interactive Get-Credential not MCP-safe). See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/get-mailboxmessageconfiguration", {
    identity: z.string().describe("Mailbox (alias, email...), e.g. tony@contoso.com"),
    domainController: z.string().optional().describe("FQDN, e.g. DC1 (on-prem only)"),
    readFromDomainController: z.boolean().optional().describe("Read from a DC in the user's domain instead of a possibly stale GC"),
  }, async ({ identity, domainController, readFromDomainController }) => {
    let cmd = `Get-MailboxMessageConfiguration -Identity '${esc(identity)}'`;
    cmd += dcSuffix(domainController);
    if (readFromDomainController) cmd += ` -ReadFromDomainController`;
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_get_mailboxregionalconfiguration", "View mailbox regional settings (Get-MailboxRegionalConfiguration) — date/time format, timezone, language. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/get-mailboxregionalconfiguration", {
    identity: z.string().describe("Mailbox, e.g. 'Marcelo Teixeira'"),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com (on-prem only)"),
    verifyDefaultFolderNameLanguage: z.boolean().optional().describe("Verify default folder names are localized (populates DefaultFolderNameMatchingUserLanguage)"),
  }, async ({ identity, domainController, verifyDefaultFolderNameLanguage }) => {
    let cmd = `Get-MailboxRegionalConfiguration -Identity '${esc(identity)}'`;
    cmd += dcSuffix(domainController);
    if (verifyDefaultFolderNameLanguage) cmd += ` -VerifyDefaultFolderNameLanguage`;
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_get_mailboxspellingconfiguration", "Retrieve OWA spelling checker settings (Get-MailboxSpellingConfiguration) — CheckBeforeSend, DictionaryLanguage, IgnoreMixedDigits. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/get-mailboxspellingconfiguration", {
    identity: z.string().describe("Mailbox, e.g. Tony"),
    domainController: z.string().optional().describe("FQDN, e.g. DC1 (on-prem only)"),
  }, async ({ identity, domainController }) => {
    let cmd = `Get-MailboxSpellingConfiguration -Identity '${esc(identity)}'`;
    cmd += dcSuffix(domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_get_outlookprovider", "Get Outlook provider global settings from AutoDiscoverConfig (Get-OutlookProvider) — EXCH/EXPR/WEB. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/get-outlookprovider", {
    identity: z.string().optional().describe("Provider, e.g. WEB (EXCH/EXPR/WEB). Omit to list all."),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com"),
  }, async ({ identity, domainController }) => {
    let cmd = `Get-OutlookProvider`;
    if (identity) cmd += ` -Identity '${esc(identity)}'`;
    cmd += dcSuffix(domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_get_owamailboxpolicy", "View OWA mailbox policies (Get-OwaMailboxPolicy). See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/get-owamailboxpolicy", {
    identity: z.string().optional().describe("Policy name, DN, or GUID, e.g. Executives. Omit to list all."),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com (on-prem only)"),
  }, async ({ identity, domainController }) => {
    let cmd = `Get-OwaMailboxPolicy`;
    if (identity) cmd += ` -Identity '${esc(identity)}'`;
    cmd += dcSuffix(domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_get_popsettings", "View POP3 frontend service configuration (Get-PopSettings). See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/get-popsettings", {
    server: z.string().optional().describe("Exchange server, e.g. MBX01. Omit for local server."),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com"),
  }, async ({ server, domainController }) => {
    let cmd = `Get-PopSettings`;
    if (server) cmd += ` -Server '${esc(server)}'`;
    cmd += dcSuffix(domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  // Batch 2a writes: proxies, export, New-/Remove- (confirm-gated in desktop)

  server.tool("exchange_disable_pushnotificationproxy", "Disable the push notification proxy (Disable-PushNotificationProxy) — stops relaying on-premises mailbox event notifications via Microsoft 365. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/disable-pushnotificationproxy", {}, async () => {
    await ps.invoke(`Disable-PushNotificationProxy -Confirm:$false`);
    return { content: [{ type: "text", text: `Disabled push notification proxy` }] };
  });

  server.tool("exchange_enable_pushnotificationproxy", "Enable the push notification proxy (Enable-PushNotificationProxy) — relay on-premises mailbox event notifications via Microsoft 365 (also needs OAuth). See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/enable-pushnotificationproxy", {
    organization: z.string().optional().describe("Microsoft 365 org domain, e.g. contoso.onmicrosoft.com"),
    uri: z.string().optional().describe("Push service endpoint (default https://outlook.office365.com/PushNotifications)"),
  }, async ({ organization, uri }) => {
    let cmd = `Enable-PushNotificationProxy`;
    if (organization) cmd += ` -Organization '${esc(organization)}'`;
    if (uri) cmd += ` -Uri '${esc(uri)}'`;
    cmd += ` -Confirm:$false`;
    await ps.invoke(cmd);
    return { content: [{ type: "text", text: `Enabled push notification proxy${organization ? ` for ${organization}` : ""}` }] };
  });

  server.tool("exchange_export_autodiscoverconfig", "Create/update the Autodiscover SCP pointer in a target forest (Export-AutoDiscoverConfig). Credentials omitted (interactive Get-Credential not MCP-safe); runs under session credentials. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/export-autodiscoverconfig", {
    targetForestDomainController: z.string().describe("Target forest/DC, e.g. contoso.com or dc.contoso.com"),
    deleteConfig: z.boolean().optional().describe("Delete the SCP configuration instead of creating it"),
    multipleExchangeDeployments: z.boolean().optional().describe("Exchange is deployed in multiple connected forests (writes accepted domains to the SCP)"),
    preferredSourceFqdn: z.string().optional().describe("Source FQDN for the Autodiscover pointer SCP"),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com"),
  }, async ({ targetForestDomainController, deleteConfig, multipleExchangeDeployments, preferredSourceFqdn, domainController }) => {
    let cmd = `Export-AutoDiscoverConfig -TargetForestDomainController '${esc(targetForestDomainController)}'`;
    if (deleteConfig !== undefined) cmd += ` -DeleteConfig $${deleteConfig ? "true" : "false"}`;
    if (multipleExchangeDeployments !== undefined) cmd += ` -MultipleExchangeDeployments $${multipleExchangeDeployments ? "true" : "false"}`;
    if (preferredSourceFqdn) cmd += ` -PreferredSourceFqdn '${esc(preferredSourceFqdn)}'`;
    cmd += dcSuffix(domainController);
    cmd += ` -Confirm:$false`;
    await ps.invoke(cmd);
    return { content: [{ type: "text", text: `Exported Autodiscover config to ${targetForestDomainController}` }] };
  });

  server.tool("exchange_new_clientaccessrule", "Create a client access rule (New-ClientAccessRule) — allow/block client connections by protocol/IP/user. 2019+ only. IMPORTANT: keep a RemotePowerShell allow rule first or you can lock yourself out. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/new-clientaccessrule", {
    name: z.string().describe("Unique rule name, e.g. AllowRemotePS"),
    action: z.string().describe("AllowAccess or DenyAccess (doc Example 1 uses Allow)"),
    anyOfProtocols: z.string().optional().describe("Comma-separated, e.g. RemotePowerShell (2019+: ExchangeAdminCenter, RemotePowerShell only). NOT quoted."),
    anyOfClientIPAddressesOrRanges: z.string().optional().describe("Comma-separated IPs/ranges/CIDR, e.g. 192.168.1.0/24"),
    exceptAnyOfClientIPAddressesOrRanges: z.string().optional().describe("Exception IPs/ranges/CIDR"),
    usernameMatchesAnyOfPatterns: z.string().optional().describe("Comma-separated DOMAIN\\user patterns (*jeff* — leading * only)"),
    exceptUsernameMatchesAnyOfPatterns: z.string().optional().describe("Exception user patterns"),
    userRecipientFilter: z.string().optional().describe("OPATH filter, e.g. \"City -eq 'Redmond'\""),
    priority: z.number().optional().describe("0 = highest; must be unique"),
    enabled: z.boolean().optional().describe("Default $true"),
    scope: z.enum(["Users", "All"]).optional(),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com"),
  }, async ({ name, action, anyOfProtocols, anyOfClientIPAddressesOrRanges, exceptAnyOfClientIPAddressesOrRanges, usernameMatchesAnyOfPatterns, exceptUsernameMatchesAnyOfPatterns, userRecipientFilter, priority, enabled, scope, domainController }) => {
    const bare = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean).join(",");
    const qlist = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean).map((x) => `'${esc(x)}'`).join(",");
    let cmd = `New-ClientAccessRule -Name '${esc(name)}' -Action ${action}`;
    if (anyOfProtocols) cmd += ` -AnyOfProtocols ${bare(anyOfProtocols)}`;
    if (anyOfClientIPAddressesOrRanges) cmd += ` -AnyOfClientIPAddressesOrRanges ${qlist(anyOfClientIPAddressesOrRanges)}`;
    if (exceptAnyOfClientIPAddressesOrRanges) cmd += ` -ExceptAnyOfClientIPAddressesOrRanges ${qlist(exceptAnyOfClientIPAddressesOrRanges)}`;
    if (usernameMatchesAnyOfPatterns) cmd += ` -UsernameMatchesAnyOfPatterns ${qlist(usernameMatchesAnyOfPatterns)}`;
    if (exceptUsernameMatchesAnyOfPatterns) cmd += ` -ExceptUsernameMatchesAnyOfPatterns ${qlist(exceptUsernameMatchesAnyOfPatterns)}`;
    if (userRecipientFilter) cmd += ` -UserRecipientFilter "${userRecipientFilter.replace(/"/g, '""')}"`;
    if (priority !== undefined) cmd += ` -Priority ${priority}`;
    if (enabled !== undefined) cmd += ` -Enabled $${enabled ? "true" : "false"}`;
    if (scope) cmd += ` -Scope ${scope}`;
    cmd += dcSuffix(domainController);
    cmd += ` -Confirm:$false`;
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_new_outlookprovider", "Create an AutoDiscoverConfig object (New-OutlookProvider). See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/new-outlookprovider", {
    name: z.string().describe("Object name, e.g. MyOABUrl"),
    domainController: z.string().optional().describe("DC that writes to AD, e.g. DC1"),
  }, async ({ name, domainController }) => {
    let cmd = `New-OutlookProvider -Name '${esc(name)}'`;
    cmd += dcSuffix(domainController);
    cmd += ` -Confirm:$false`;
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_new_owamailboxpolicy", "Create an OWA mailbox policy (New-OwaMailboxPolicy) — configure with exchange_set_owamailboxpolicy. Takes ~60min to take effect (IIS reset forces it). See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/new-owamailboxpolicy", {
    name: z.string().describe("Policy name, e.g. Corporate"),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com (on-prem only)"),
  }, async ({ name, domainController }) => {
    let cmd = `New-OwaMailboxPolicy -Name '${esc(name)}'`;
    cmd += dcSuffix(domainController);
    cmd += ` -Confirm:$false`;
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_remove_clientaccessrule", "Remove a client access rule (Remove-ClientAccessRule) — 2019+ only. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/remove-clientaccessrule", {
    identity: z.string().describe("Rule name, DN, or GUID"),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com"),
  }, async ({ identity, domainController }) => {
    let cmd = `Remove-ClientAccessRule -Identity '${esc(identity)}'`;
    cmd += dcSuffix(domainController);
    cmd += ` -Confirm:$false`;
    await ps.invoke(cmd);
    return { content: [{ type: "text", text: `Removed client access rule ${identity}` }] };
  });

  server.tool("exchange_remove_outlookprovider", "Delete an AutoDiscoverConfig object (Remove-OutlookProvider). See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/remove-outlookprovider", {
    identity: z.string().describe("Object name, e.g. 'Test Object'"),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com"),
  }, async ({ identity, domainController }) => {
    let cmd = `Remove-OutlookProvider -Identity '${esc(identity)}'`;
    cmd += dcSuffix(domainController);
    cmd += ` -Confirm:$false`;
    await ps.invoke(cmd);
    return { content: [{ type: "text", text: `Removed Outlook provider ${identity}` }] };
  });

  server.tool("exchange_remove_owamailboxpolicy", "Remove an OWA mailbox policy (Remove-OwaMailboxPolicy) — takes ~60min to take effect. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/remove-owamailboxpolicy", {
    identity: z.string().describe("Policy name/DN/GUID, e.g. Executives"),
    force: z.boolean().optional().describe("Hide warnings (programmatic use)"),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com (on-prem only)"),
  }, async ({ identity, force, domainController }) => {
    let cmd = `Remove-OwaMailboxPolicy -Identity '${esc(identity)}'`;
    cmd += dcSuffix(domainController);
    if (force) cmd += ` -Force`;
    cmd += ` -Confirm:$false`;
    await ps.invoke(cmd);
    return { content: [{ type: "text", text: `Removed OWA mailbox policy ${identity}` }] };
  });

  // Batch 2b writes: Set-* (confirm-gated in desktop; no -Confirm on the
  // cmdlet except Set-ClientAccessRule, which has a built-in pause)

  const bool = (v: boolean) => (v ? "$true" : "$false");
  const qlist = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean).map((x) => `'${esc(x)}'`).join(",");
  const bare = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean).join(",");

  server.tool("exchange_set_casmailbox", "Configure client access settings on a mailbox (Set-CASMailbox) — ActiveSync/OWA/POP/IMAP/MAPI/EWS toggles. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/set-casmailbox", {
    identity: z.string().describe("Mailbox, e.g. adam@contoso.com"),
    owaEnabled: z.boolean().optional(),
    activeSyncEnabled: z.boolean().optional(),
    popEnabled: z.boolean().optional(),
    imapEnabled: z.boolean().optional(),
    mapiEnabled: z.boolean().optional(),
    mapiHttpEnabled: z.boolean().optional().describe("MAPI over HTTP"),
    ewsEnabled: z.boolean().optional(),
    ecpEnabled: z.boolean().optional().describe("Exchange admin center / Control Panel"),
    owaforDevicesEnabled: z.boolean().optional().describe("Legacy OWA app on mobile devices"),
    activeSyncDebugLogging: z.boolean().optional().describe("48h online / 72h on-prem, then reverts"),
    activeSyncMailboxPolicy: z.string().optional().describe("EAS mailbox policy name/DN/GUID"),
    owaMailboxPolicy: z.string().optional().describe("OWA mailbox policy name/DN/GUID"),
    mapiBlockOutlookRpcHttp: z.boolean().optional().describe("Block Outlook Anywhere"),
    mapiBlockOutlookNonCachedMode: z.boolean().optional().describe("Require Cached Exchange Mode"),
    mapiBlockOutlookExternalConnectivity: z.boolean().optional().describe("Remove external URLs from Autodiscover"),
    ewsApplicationAccessPolicy: z.enum(["EnforceAllowList", "EnforceBlockList"]).optional(),
    displayName: z.string().optional(),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com (on-prem only)"),
  }, async (p) => {
    let cmd = `Set-CASMailbox -Identity '${esc(p.identity)}'`;
    if (p.owaEnabled !== undefined) cmd += ` -OWAEnabled ${bool(p.owaEnabled)}`;
    if (p.activeSyncEnabled !== undefined) cmd += ` -ActiveSyncEnabled ${bool(p.activeSyncEnabled)}`;
    if (p.popEnabled !== undefined) cmd += ` -PopEnabled ${bool(p.popEnabled)}`;
    if (p.imapEnabled !== undefined) cmd += ` -ImapEnabled ${bool(p.imapEnabled)}`;
    if (p.mapiEnabled !== undefined) cmd += ` -MAPIEnabled ${bool(p.mapiEnabled)}`;
    if (p.mapiHttpEnabled !== undefined) cmd += ` -MapiHttpEnabled ${bool(p.mapiHttpEnabled)}`;
    if (p.ewsEnabled !== undefined) cmd += ` -EwsEnabled ${bool(p.ewsEnabled)}`;
    if (p.ecpEnabled !== undefined) cmd += ` -ECPEnabled ${bool(p.ecpEnabled)}`;
    if (p.owaforDevicesEnabled !== undefined) cmd += ` -OWAforDevicesEnabled ${bool(p.owaforDevicesEnabled)}`;
    if (p.activeSyncDebugLogging !== undefined) cmd += ` -ActiveSyncDebugLogging ${bool(p.activeSyncDebugLogging)}`;
    if (p.activeSyncMailboxPolicy) cmd += ` -ActiveSyncMailboxPolicy '${esc(p.activeSyncMailboxPolicy)}'`;
    if (p.owaMailboxPolicy) cmd += ` -OwaMailboxPolicy '${esc(p.owaMailboxPolicy)}'`;
    if (p.mapiBlockOutlookRpcHttp !== undefined) cmd += ` -MAPIBlockOutlookRpcHttp ${bool(p.mapiBlockOutlookRpcHttp)}`;
    if (p.mapiBlockOutlookNonCachedMode !== undefined) cmd += ` -MAPIBlockOutlookNonCachedMode ${bool(p.mapiBlockOutlookNonCachedMode)}`;
    if (p.mapiBlockOutlookExternalConnectivity !== undefined) cmd += ` -MAPIBlockOutlookExternalConnectivity ${bool(p.mapiBlockOutlookExternalConnectivity)}`;
    if (p.ewsApplicationAccessPolicy) cmd += ` -EwsApplicationAccessPolicy ${p.ewsApplicationAccessPolicy}`;
    if (p.displayName) cmd += ` -DisplayName '${esc(p.displayName)}'`;
    cmd += dcSuffix(p.domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_set_clientaccessrule", "Modify a client access rule (Set-ClientAccessRule) — 2019+ only, built-in pause skipped. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/set-clientaccessrule", {
    identity: z.string().describe("Rule name, DN, or GUID"),
    action: z.string().optional().describe("AllowAccess or DenyAccess"),
    anyOfProtocols: z.string().optional().describe("Comma-separated (2019+: ExchangeAdminCenter, RemotePowerShell). NOT quoted."),
    anyOfClientIPAddressesOrRanges: z.string().optional().describe("Comma-separated IPs/ranges/CIDR"),
    exceptAnyOfClientIPAddressesOrRanges: z.string().optional().describe("Exception IPs/ranges/CIDR"),
    usernameMatchesAnyOfPatterns: z.string().optional().describe("Comma-separated DOMAIN\\user patterns"),
    exceptUsernameMatchesAnyOfPatterns: z.string().optional().describe("Exception user patterns"),
    userRecipientFilter: z.string().optional().describe("OPATH filter, e.g. \"City -eq 'Redmond'\""),
    priority: z.number().optional(),
    enabled: z.boolean().optional(),
    scope: z.enum(["Users", "All"]).optional(),
    name: z.string().optional().describe("Rename the rule"),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com"),
  }, async (p) => {
    let cmd = `Set-ClientAccessRule -Identity '${esc(p.identity)}'`;
    if (p.action) cmd += ` -Action ${p.action}`;
    if (p.anyOfProtocols) cmd += ` -AnyOfProtocols ${bare(p.anyOfProtocols)}`;
    if (p.anyOfClientIPAddressesOrRanges) cmd += ` -AnyOfClientIPAddressesOrRanges ${qlist(p.anyOfClientIPAddressesOrRanges)}`;
    if (p.exceptAnyOfClientIPAddressesOrRanges) cmd += ` -ExceptAnyOfClientIPAddressesOrRanges ${qlist(p.exceptAnyOfClientIPAddressesOrRanges)}`;
    if (p.usernameMatchesAnyOfPatterns) cmd += ` -UsernameMatchesAnyOfPatterns ${qlist(p.usernameMatchesAnyOfPatterns)}`;
    if (p.exceptUsernameMatchesAnyOfPatterns) cmd += ` -ExceptUsernameMatchesAnyOfPatterns ${qlist(p.exceptUsernameMatchesAnyOfPatterns)}`;
    if (p.userRecipientFilter) cmd += ` -UserRecipientFilter "${p.userRecipientFilter.replace(/"/g, '""')}"`;
    if (p.priority !== undefined) cmd += ` -Priority ${p.priority}`;
    if (p.enabled !== undefined) cmd += ` -Enabled ${bool(p.enabled)}`;
    if (p.scope) cmd += ` -Scope ${p.scope}`;
    if (p.name) cmd += ` -Name '${esc(p.name)}'`;
    cmd += dcSuffix(p.domainController);
    cmd += ` -Confirm:$false`;
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_set_imapsettings", "Modify the IMAP4 frontend service (Set-ImapSettings) — bindings, cert, logging, limits. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/set-imapsettings", {
    server: z.string().optional().describe("Exchange server, e.g. MBX01. Omit for local server."),
    banner: z.string().optional().describe("Greeting text for connecting clients"),
    protocolLogEnabled: z.boolean().optional(),
    logFileLocation: z.string().optional().describe("E.g. C:\\Imap4Logging"),
    logPerFileSizeQuota: z.string().optional().describe("E.g. 2MB (0 = roll by LogFileRollOverSettings)"),
    logFileRollOverSettings: z.string().optional().describe("Hourly, Daily, Weekly, Monthly"),
    unencryptedOrTLSBindings: z.string().optional().describe("Comma-separated IP:Port, e.g. 10.0.0.0:143"),
    sslBindings: z.string().optional().describe("Comma-separated IP:Port for SSL/TLS"),
    x509CertificateName: z.string().optional().describe("Cert FQDN, e.g. mail.contoso.com"),
    maxConnections: z.number().optional(),
    maxConnectionsPerUser: z.number().optional(),
    maxConnectionFromSingleIP: z.number().optional(),
    authenticatedConnectionTimeout: z.string().optional().describe("dd.hh:mm:ss, 00:00:30 to 1:00:00"),
    preAuthenticatedConnectionTimeout: z.string().optional().describe("dd.hh:mm:ss"),
    loginType: z.string().optional().describe("PlainTextLogin, PlainTextAuthentication, SecureLogin"),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com"),
  }, async (p) => {
    let cmd = `Set-ImapSettings`;
    if (p.server) cmd += ` -Server '${esc(p.server)}'`;
    if (p.banner) cmd += ` -Banner '${esc(p.banner)}'`;
    if (p.protocolLogEnabled !== undefined) cmd += ` -ProtocolLogEnabled ${bool(p.protocolLogEnabled)}`;
    if (p.logFileLocation) cmd += ` -LogFileLocation '${esc(p.logFileLocation)}'`;
    if (p.logPerFileSizeQuota) cmd += ` -LogPerFileSizeQuota '${esc(p.logPerFileSizeQuota)}'`;
    if (p.logFileRollOverSettings) cmd += ` -LogFileRollOverSettings ${p.logFileRollOverSettings}`;
    if (p.unencryptedOrTLSBindings) cmd += ` -UnencryptedOrTLSBindings ${qlist(p.unencryptedOrTLSBindings)}`;
    if (p.sslBindings) cmd += ` -SSLBindings ${qlist(p.sslBindings)}`;
    if (p.x509CertificateName) cmd += ` -X509CertificateName '${esc(p.x509CertificateName)}'`;
    if (p.maxConnections !== undefined) cmd += ` -MaxConnections ${p.maxConnections}`;
    if (p.maxConnectionsPerUser !== undefined) cmd += ` -MaxConnectionsPerUser ${p.maxConnectionsPerUser}`;
    if (p.maxConnectionFromSingleIP !== undefined) cmd += ` -MaxConnectionFromSingleIP ${p.maxConnectionFromSingleIP}`;
    if (p.authenticatedConnectionTimeout) cmd += ` -AuthenticatedConnectionTimeout '${esc(p.authenticatedConnectionTimeout)}'`;
    if (p.preAuthenticatedConnectionTimeout) cmd += ` -PreAuthenticatedConnectionTimeout '${esc(p.preAuthenticatedConnectionTimeout)}'`;
    if (p.loginType) cmd += ` -LoginType ${p.loginType}`;
    cmd += dcSuffix(p.domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_set_mailboxcalendarconfiguration", "Modify mailbox calendar settings for OWA (Set-MailboxCalendarConfiguration). See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/set-mailboxcalendarconfiguration", {
    identity: z.string().describe("Mailbox, e.g. peter@contoso.com"),
    remindersEnabled: z.boolean().optional(),
    workingHoursTimeZone: z.string().optional().describe("E.g. 'Pacific Standard Time'"),
    workingHoursStartTime: z.string().optional().describe("E.g. 07:00:00"),
    workingHoursEndTime: z.string().optional().describe("E.g. 17:00:00"),
    workDays: z.string().optional().describe("Comma-separated days, e.g. Monday,Tuesday,Wednesday,Thursday,Friday"),
    weekStartDay: z.string().optional().describe("Sunday..Saturday"),
    showWeekNumbers: z.boolean().optional(),
    timeIncrement: z.string().optional().describe("FifteenMinutes or ThirtyMinutes"),
    defaultReminderTime: z.string().optional().describe("dd.hh:mm:ss, e.g. 00:15:00"),
    firstWeekOfYear: z.string().optional().describe("FirstDay, FirstFourDayWeek, FirstFullWeek"),
    conversationalSchedulingEnabled: z.boolean().optional(),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com (on-prem only)"),
  }, async (p) => {
    let cmd = `Set-MailboxCalendarConfiguration -Identity '${esc(p.identity)}'`;
    if (p.remindersEnabled !== undefined) cmd += ` -RemindersEnabled ${bool(p.remindersEnabled)}`;
    if (p.workingHoursTimeZone) cmd += ` -WorkingHoursTimeZone '${esc(p.workingHoursTimeZone)}'`;
    if (p.workingHoursStartTime) cmd += ` -WorkingHoursStartTime '${esc(p.workingHoursStartTime)}'`;
    if (p.workingHoursEndTime) cmd += ` -WorkingHoursEndTime '${esc(p.workingHoursEndTime)}'`;
    if (p.workDays) cmd += ` -WorkDays ${bare(p.workDays)}`;
    if (p.weekStartDay) cmd += ` -WeekStartDay ${p.weekStartDay}`;
    if (p.showWeekNumbers !== undefined) cmd += ` -ShowWeekNumbers ${bool(p.showWeekNumbers)}`;
    if (p.timeIncrement) cmd += ` -TimeIncrement ${p.timeIncrement}`;
    if (p.defaultReminderTime) cmd += ` -DefaultReminderTime '${esc(p.defaultReminderTime)}'`;
    if (p.firstWeekOfYear) cmd += ` -FirstWeekOfYear ${p.firstWeekOfYear}`;
    if (p.conversationalSchedulingEnabled !== undefined) cmd += ` -ConversationalSchedulingEnabled ${bool(p.conversationalSchedulingEnabled)}`;
    cmd += dcSuffix(p.domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_set_mailboxmessageconfiguration", "Configure OWA settings for a mailbox (Set-MailboxMessageConfiguration) — signatures, format, reading pane. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/set-mailboxmessageconfiguration", {
    identity: z.string().describe("Mailbox, e.g. kai@contoso.com"),
    alwaysShowBcc: z.boolean().optional(),
    alwaysShowFrom: z.boolean().optional(),
    autoAddSignature: z.boolean().optional(),
    hideDeletedItems: z.boolean().optional().describe("Hide deleted messages in Conversation view"),
    emptyDeletedItemsOnLogoff: z.boolean().optional(),
    showConversationAsTree: z.boolean().optional(),
    readReceiptResponse: z.string().optional().describe("DoNotAutomaticallySend, AlwaysSend, NeverSend"),
    emailComposeMode: z.string().optional().describe("Inline or SeparateForm"),
    defaultFormat: z.string().optional().describe("Html or PlainText"),
    signatureText: z.string().optional().describe("Plain-text signature"),
    signatureHtml: z.string().optional().describe("HTML signature"),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com (on-prem only)"),
  }, async (p) => {
    let cmd = `Set-MailboxMessageConfiguration -Identity '${esc(p.identity)}'`;
    if (p.alwaysShowBcc !== undefined) cmd += ` -AlwaysShowBcc ${bool(p.alwaysShowBcc)}`;
    if (p.alwaysShowFrom !== undefined) cmd += ` -AlwaysShowFrom ${bool(p.alwaysShowFrom)}`;
    if (p.autoAddSignature !== undefined) cmd += ` -AutoAddSignature ${bool(p.autoAddSignature)}`;
    if (p.hideDeletedItems !== undefined) cmd += ` -HideDeletedItems ${bool(p.hideDeletedItems)}`;
    if (p.emptyDeletedItemsOnLogoff !== undefined) cmd += ` -EmptyDeletedItemsOnLogoff ${bool(p.emptyDeletedItemsOnLogoff)}`;
    if (p.showConversationAsTree !== undefined) cmd += ` -ShowConversationAsTree ${bool(p.showConversationAsTree)}`;
    if (p.readReceiptResponse) cmd += ` -ReadReceiptResponse ${p.readReceiptResponse}`;
    if (p.emailComposeMode) cmd += ` -EmailComposeMode ${p.emailComposeMode}`;
    if (p.defaultFormat) cmd += ` -DefaultFormat ${p.defaultFormat}`;
    if (p.signatureText) cmd += ` -SignatureText '${esc(p.signatureText)}'`;
    if (p.signatureHtml) cmd += ` -SignatureHtml '${esc(p.signatureHtml)}'`;
    cmd += dcSuffix(p.domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_set_mailboxregionalconfiguration", "Modify mailbox regional settings (Set-MailboxRegionalConfiguration) — language, date/time format, timezone. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/set-mailboxregionalconfiguration", {
    identity: z.string().describe("Mailbox, e.g. 'Marcelo Teixeira'"),
    language: z.string().optional().describe("Culture code, e.g. pt-br (use DateFormat/TimeFormat $null via 'null' on invalid-format errors)"),
    dateFormat: z.string().optional().describe("E.g. d/M/yyyy — pass 'null' for $null"),
    timeFormat: z.string().optional().describe("E.g. H:mm — pass 'null' for $null"),
    timeZone: z.string().optional().describe("E.g. 'Pacific Standard Time'"),
    localizeDefaultFolderName: z.boolean().optional().describe("Localize default folder names to the language"),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com (on-prem only)"),
  }, async (p) => {
    const nullish = (s: string) => (s.toLowerCase() === "null" || s === "$null" ? "$null" : `'${esc(s)}'`);
    let cmd = `Set-MailboxRegionalConfiguration -Identity '${esc(p.identity)}'`;
    if (p.language) cmd += ` -Language '${esc(p.language)}'`;
    if (p.dateFormat) cmd += ` -DateFormat ${nullish(p.dateFormat)}`;
    if (p.timeFormat) cmd += ` -TimeFormat ${nullish(p.timeFormat)}`;
    if (p.timeZone) cmd += ` -TimeZone '${esc(p.timeZone)}'`;
    if (p.localizeDefaultFolderName) cmd += ` -LocalizeDefaultFolderName`;
    cmd += dcSuffix(p.domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_set_mailboxspellingconfiguration", "Modify OWA spelling checker options (Set-MailboxSpellingConfiguration). See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/set-mailboxspellingconfiguration", {
    identity: z.string().describe("Mailbox, e.g. kai"),
    checkBeforeSend: z.boolean().optional(),
    dictionaryLanguage: z.string().optional().describe("E.g. EnglishUnitedStates, GermanPostReform, Spanish"),
    ignoreMixedDigits: z.boolean().optional().describe("Ignore words containing numbers"),
    ignoreUppercase: z.boolean().optional().describe("Ignore all-uppercase words (acronyms)"),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com (on-prem only)"),
  }, async (p) => {
    let cmd = `Set-MailboxSpellingConfiguration -Identity '${esc(p.identity)}'`;
    if (p.checkBeforeSend !== undefined) cmd += ` -CheckBeforeSend ${bool(p.checkBeforeSend)}`;
    if (p.dictionaryLanguage) cmd += ` -DictionaryLanguage ${p.dictionaryLanguage}`;
    if (p.ignoreMixedDigits !== undefined) cmd += ` -IgnoreMixedDigits ${bool(p.ignoreMixedDigits)}`;
    if (p.ignoreUppercase !== undefined) cmd += ` -IgnoreUppercase ${bool(p.ignoreUppercase)}`;
    cmd += dcSuffix(p.domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_set_outlookprovider", "Set Autodiscover global settings (Set-OutlookProvider). See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/set-outlookprovider", {
    identity: z.string().describe("Provider, e.g. msExchAutoDiscoverConfig (EXCH/EXPR/WEB)"),
    certPrincipalName: z.string().optional().describe("TLS cert principal for external Outlook Anywhere"),
    name: z.string().optional().describe("Friendly name for the config object"),
    outlookProviderFlags: z.string().optional().describe("ServerExclusiveConnect, ExternalClientsRequireSSL, InternalClientsRequireSSL, None (recommended)"),
    requiredClientVersions: z.string().optional().describe("E.g. '14.0.7012.1000, 2020-01-01T12:00:00Z'"),
    server: z.string().optional().describe("Mailbox server for Outlook Anywhere clients"),
    ttl: z.number().optional().describe("Hours settings are valid (default 1; 0 = no rediscovery)"),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com"),
  }, async (p) => {
    let cmd = `Set-OutlookProvider -Identity '${esc(p.identity)}'`;
    if (p.certPrincipalName) cmd += ` -CertPrincipalName '${esc(p.certPrincipalName)}'`;
    if (p.name) cmd += ` -Name '${esc(p.name)}'`;
    if (p.outlookProviderFlags) cmd += ` -OutlookProviderFlags ${p.outlookProviderFlags}`;
    if (p.requiredClientVersions) cmd += ` -RequiredClientVersions '${esc(p.requiredClientVersions)}'`;
    if (p.server) cmd += ` -Server '${esc(p.server)}'`;
    if (p.ttl !== undefined) cmd += ` -TTL ${p.ttl}`;
    cmd += dcSuffix(p.domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_set_owamailboxpolicy", "Configure an OWA mailbox policy (Set-OwaMailboxPolicy) — takes ~60min to take effect (IIS reset forces it). See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/set-owamailboxpolicy", {
    identity: z.string().describe("Policy, e.g. Default"),
    calendarEnabled: z.boolean().optional(),
    tasksEnabled: z.boolean().optional(),
    contactsEnabled: z.boolean().optional(),
    notesEnabled: z.boolean().optional(),
    rulesEnabled: z.boolean().optional(),
    junkEmailEnabled: z.boolean().optional(),
    changePasswordEnabled: z.boolean().optional(),
    delegateAccessEnabled: z.boolean().optional().describe("Delegates opening the mailbox in OWA"),
    activeSyncIntegrationEnabled: z.boolean().optional().describe("EAS settings inside OWA"),
    allowedFileTypes: z.string().optional().describe("Comma-separated extensions, e.g. .doc,.pdf"),
    blockedFileTypes: z.string().optional().describe("Comma-separated extensions"),
    name: z.string().optional().describe("Rename the policy"),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com (on-prem only)"),
  }, async (p) => {
    let cmd = `Set-OwaMailboxPolicy -Identity '${esc(p.identity)}'`;
    if (p.calendarEnabled !== undefined) cmd += ` -CalendarEnabled ${bool(p.calendarEnabled)}`;
    if (p.tasksEnabled !== undefined) cmd += ` -TasksEnabled ${bool(p.tasksEnabled)}`;
    if (p.contactsEnabled !== undefined) cmd += ` -ContactsEnabled ${bool(p.contactsEnabled)}`;
    if (p.notesEnabled !== undefined) cmd += ` -NotesEnabled ${bool(p.notesEnabled)}`;
    if (p.rulesEnabled !== undefined) cmd += ` -RulesEnabled ${bool(p.rulesEnabled)}`;
    if (p.junkEmailEnabled !== undefined) cmd += ` -JunkEmailEnabled ${bool(p.junkEmailEnabled)}`;
    if (p.changePasswordEnabled !== undefined) cmd += ` -ChangePasswordEnabled ${bool(p.changePasswordEnabled)}`;
    if (p.delegateAccessEnabled !== undefined) cmd += ` -DelegateAccessEnabled ${bool(p.delegateAccessEnabled)}`;
    if (p.activeSyncIntegrationEnabled !== undefined) cmd += ` -ActiveSyncIntegrationEnabled ${bool(p.activeSyncIntegrationEnabled)}`;
    if (p.allowedFileTypes) cmd += ` -AllowedFileTypes ${qlist(p.allowedFileTypes)}`;
    if (p.blockedFileTypes) cmd += ` -BlockedFileTypes ${qlist(p.blockedFileTypes)}`;
    if (p.name) cmd += ` -Name '${esc(p.name)}'`;
    cmd += dcSuffix(p.domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_set_popsettings", "Modify the POP3 frontend service (Set-PopSettings) — bindings, cert, logging, limits. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/set-popsettings", {
    server: z.string().optional().describe("Exchange server, e.g. MBX01. Omit for local server."),
    banner: z.string().optional().describe("Greeting text for connecting clients"),
    protocolLogEnabled: z.boolean().optional(),
    logFileLocation: z.string().optional().describe("E.g. C:\\Pop3Logging"),
    logPerFileSizeQuota: z.string().optional().describe("E.g. 2MB (0 = roll by LogFileRollOverSettings)"),
    logFileRollOverSettings: z.string().optional().describe("Hourly, Daily, Weekly, Monthly"),
    unencryptedOrTLSBindings: z.string().optional().describe("Comma-separated IP:Port, e.g. 10.0.0.0:110"),
    sslBindings: z.string().optional().describe("Comma-separated IP:Port for SSL/TLS"),
    x509CertificateName: z.string().optional().describe("Cert FQDN, e.g. mail.contoso.com"),
    maxConnections: z.number().optional(),
    maxConnectionsPerUser: z.number().optional(),
    messageRetrievalSortOrder: z.string().optional().describe("Ascending or Descending"),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com"),
  }, async (p) => {
    let cmd = `Set-PopSettings`;
    if (p.server) cmd += ` -Server '${esc(p.server)}'`;
    if (p.banner) cmd += ` -Banner '${esc(p.banner)}'`;
    if (p.protocolLogEnabled !== undefined) cmd += ` -ProtocolLogEnabled ${bool(p.protocolLogEnabled)}`;
    if (p.logFileLocation) cmd += ` -LogFileLocation '${esc(p.logFileLocation)}'`;
    if (p.logPerFileSizeQuota) cmd += ` -LogPerFileSizeQuota '${esc(p.logPerFileSizeQuota)}'`;
    if (p.logFileRollOverSettings) cmd += ` -LogFileRollOverSettings ${p.logFileRollOverSettings}`;
    if (p.unencryptedOrTLSBindings) cmd += ` -UnencryptedOrTLSBindings ${qlist(p.unencryptedOrTLSBindings)}`;
    if (p.sslBindings) cmd += ` -SSLBindings ${qlist(p.sslBindings)}`;
    if (p.x509CertificateName) cmd += ` -X509CertificateName '${esc(p.x509CertificateName)}'`;
    if (p.maxConnections !== undefined) cmd += ` -MaxConnections ${p.maxConnections}`;
    if (p.maxConnectionsPerUser !== undefined) cmd += ` -MaxConnectionsPerUser ${p.maxConnectionsPerUser}`;
    if (p.messageRetrievalSortOrder) cmd += ` -MessageRetrievalSortOrder ${p.messageRetrievalSortOrder}`;
    cmd += dcSuffix(p.domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  // Batch 3: Test-* connectivity (read-only diagnostics; first use may
  // require New-TestCasConnectivityUser.ps1 on the server)

  server.tool("exchange_test_calendarconnectivity", "Test anonymous calendar sharing (Test-CalendarConnectivity) — Logon/CalendarICS/CalendarHTML scenarios. Best in 2010; later use Managed Availability probes. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/test-calendarconnectivity", {
    clientAccessServer: z.string().optional().describe("CAS server, e.g. MBX01. Omit to test all OWA vdirs."),
    mailboxServer: z.string().optional().describe("Backend Mailbox server under test"),
    testType: z.enum(["Internal", "External"]).optional(),
    virtualDirectoryName: z.string().optional().describe("OWA vdir name to test"),
    monitoringContext: z.boolean().optional().describe("Include SCOM monitoring events/counters"),
    resetTestAccountCredentials: z.boolean().optional().describe("Force test-account password reset"),
  }, async (p) => {
    let cmd = `Test-CalendarConnectivity`;
    if (p.clientAccessServer) cmd += ` -ClientAccessServer '${esc(p.clientAccessServer)}'`;
    if (p.mailboxServer) cmd += ` -MailboxServer '${esc(p.mailboxServer)}'`;
    if (p.testType) cmd += ` -TestType ${p.testType}`;
    if (p.virtualDirectoryName) cmd += ` -VirtualDirectoryName '${esc(p.virtualDirectoryName)}'`;
    if (p.monitoringContext) cmd += ` -MonitoringContext`;
    if (p.resetTestAccountCredentials) cmd += ` -ResetTestAccountCredentials`;
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_test_clientaccessrule", "Test which client access rules match a connection (Test-ClientAccessRule) — 2019+ only. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/test-clientaccessrule", {
    authenticationType: z.string().describe("E.g. BasicAuthentication (Adfs/Basic/CertificateBased/NonBasic/OAuth)"),
    protocol: z.string().describe("E.g. OutlookWebApp (see New-ClientAccessRule protocols)"),
    remoteAddress: z.string().describe("Client IP, e.g. 172.17.17.26"),
    remotePort: z.number().describe("Client TCP port, e.g. 443"),
    user: z.string().describe("User, e.g. julia@contoso.com"),
  }, async ({ authenticationType, protocol, remoteAddress, remotePort, user }) => {
    const cmd = `Test-ClientAccessRule -AuthenticationType ${authenticationType} -Protocol ${protocol} -RemoteAddress '${esc(remoteAddress)}' -RemotePort ${remotePort} -User '${esc(user)}'`;
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_test_ecpconnectivity", "Test EAC connectivity (Test-EcpConnectivity) — Logon/Sign in scenarios. Best in 2010; later use Managed Availability probes. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/test-ecpconnectivity", {
    clientAccessServer: z.string().optional().describe("CAS server, e.g. Server01"),
    mailboxServer: z.string().optional().describe("Backend Mailbox server under test"),
    testType: z.enum(["Internal", "External"]).optional(),
    virtualDirectoryName: z.string().optional().describe("EAC vdir name to test"),
    monitoringContext: z.boolean().optional(),
    resetTestAccountCredentials: z.boolean().optional(),
    trustAnySSLCertificate: z.boolean().optional().describe("Accept untrusted CA certs (internal URLs)"),
    timeout: z.number().optional().describe("Seconds, 0-3600 (default 30, use 5+)"),
  }, async (p) => {
    let cmd = `Test-EcpConnectivity`;
    if (p.clientAccessServer) cmd += ` -ClientAccessServer '${esc(p.clientAccessServer)}'`;
    if (p.mailboxServer) cmd += ` -MailboxServer '${esc(p.mailboxServer)}'`;
    if (p.testType) cmd += ` -TestType ${p.testType}`;
    if (p.virtualDirectoryName) cmd += ` -VirtualDirectoryName '${esc(p.virtualDirectoryName)}'`;
    if (p.monitoringContext) cmd += ` -MonitoringContext`;
    if (p.resetTestAccountCredentials) cmd += ` -ResetTestAccountCredentials`;
    if (p.trustAnySSLCertificate) cmd += ` -TrustAnySSLCertificate`;
    if (p.timeout !== undefined) cmd += ` -Timeout ${p.timeout}`;
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_test_imapconnectivity", "Test IMAP4 connectivity (Test-ImapConnectivity) — logon + send/receive. MailboxCredential omitted (interactive). See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/test-imapconnectivity", {
    clientAccessServer: z.string().optional().describe("CAS server, e.g. Contoso12"),
    mailboxServer: z.string().optional().describe("Backend server hosting the active DB copy"),
    connectionType: z.enum(["Plaintext", "Ssl", "Tls"]).optional(),
    lightMode: z.boolean().optional().describe("Logon-only test (skip send/receive)"),
    monitoringContext: z.boolean().optional(),
    trustAnySSLCertificate: z.boolean().optional(),
    resetTestAccountCredentials: z.boolean().optional(),
    perConnectionTimeout: z.number().optional().describe("Seconds per connection, 0-120"),
    portClientAccessServer: z.number().optional().describe("Port (default 143)"),
    timeout: z.number().optional().describe("Seconds, 0-3600 (default 180, use 5+)"),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com"),
  }, async (p) => {
    let cmd = `Test-ImapConnectivity`;
    if (p.clientAccessServer) cmd += ` -ClientAccessServer '${esc(p.clientAccessServer)}'`;
    if (p.mailboxServer) cmd += ` -MailboxServer '${esc(p.mailboxServer)}'`;
    if (p.connectionType) cmd += ` -ConnectionType ${p.connectionType}`;
    if (p.lightMode) cmd += ` -LightMode`;
    if (p.monitoringContext) cmd += ` -MonitoringContext`;
    if (p.trustAnySSLCertificate) cmd += ` -TrustAnySSLCertificate`;
    if (p.resetTestAccountCredentials) cmd += ` -ResetTestAccountCredentials`;
    if (p.perConnectionTimeout !== undefined) cmd += ` -PerConnectionTimeout ${p.perConnectionTimeout}`;
    if (p.portClientAccessServer !== undefined) cmd += ` -PortClientAccessServer ${p.portClientAccessServer}`;
    if (p.timeout !== undefined) cmd += ` -Timeout ${p.timeout}`;
    cmd += dcSuffix(p.domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_test_outlookconnectivity", "Test end-to-end Outlook connectivity via Managed Availability probes (Test-OutlookConnectivity, Probe set for 2013+; 2010 Protocol/RPC sets omitted). See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/test-outlookconnectivity", {
    probeIdentity: z.string().describe("Probe, e.g. OutlookMapiHttp.Protocol\\OutlookMapiHttpSelfTestProbe (see Get-MonitoringItemIdentity outlook*probe)"),
    mailboxId: z.string().optional().describe("Target mailbox (default: probe test account)"),
    runFromServerId: z.string().optional().describe("Server to run the probe from"),
    hostname: z.string().optional().describe("Protocol endpoint target"),
    timeOutSeconds: z.number().optional().describe("Probe timeout (default 30)"),
  }, async (p) => {
    let cmd = `Test-OutlookConnectivity -ProbeIdentity '${esc(p.probeIdentity)}'`;
    if (p.mailboxId) cmd += ` -MailboxId '${esc(p.mailboxId)}'`;
    if (p.runFromServerId) cmd += ` -RunFromServerId '${esc(p.runFromServerId)}'`;
    if (p.hostname) cmd += ` -Hostname '${esc(p.hostname)}'`;
    if (p.timeOutSeconds !== undefined) cmd += ` -TimeOutSeconds ${p.timeOutSeconds}`;
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_test_popconnectivity", "Test POP3 connectivity (Test-PopConnectivity) — logon + receive. MailboxCredential omitted (interactive). See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/test-popconnectivity", {
    clientAccessServer: z.string().optional().describe("CAS server, e.g. Contoso12"),
    mailboxServer: z.string().optional().describe("Backend server hosting the active DB copy"),
    connectionType: z.enum(["Plaintext", "Ssl", "Tls"]).optional(),
    lightMode: z.boolean().optional().describe("Logon-only test"),
    monitoringContext: z.boolean().optional(),
    trustAnySSLCertificate: z.boolean().optional(),
    resetTestAccountCredentials: z.boolean().optional(),
    perConnectionTimeout: z.number().optional().describe("Seconds per connection, 0-120"),
    portClientAccessServer: z.number().optional().describe("Port (default 110)"),
    timeout: z.number().optional().describe("Seconds, 0-3600 (default 180, use 5+)"),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com"),
  }, async (p) => {
    let cmd = `Test-PopConnectivity`;
    if (p.clientAccessServer) cmd += ` -ClientAccessServer '${esc(p.clientAccessServer)}'`;
    if (p.mailboxServer) cmd += ` -MailboxServer '${esc(p.mailboxServer)}'`;
    if (p.connectionType) cmd += ` -ConnectionType ${p.connectionType}`;
    if (p.lightMode) cmd += ` -LightMode`;
    if (p.monitoringContext) cmd += ` -MonitoringContext`;
    if (p.trustAnySSLCertificate) cmd += ` -TrustAnySSLCertificate`;
    if (p.resetTestAccountCredentials) cmd += ` -ResetTestAccountCredentials`;
    if (p.perConnectionTimeout !== undefined) cmd += ` -PerConnectionTimeout ${p.perConnectionTimeout}`;
    if (p.portClientAccessServer !== undefined) cmd += ` -PortClientAccessServer ${p.portClientAccessServer}`;
    if (p.timeout !== undefined) cmd += ` -Timeout ${p.timeout}`;
    cmd += dcSuffix(p.domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_test_powershellconnectivity", "Test remote PowerShell vdir connectivity (Test-PowerShellConnectivity, Identity set; URL set needs interactive creds — use exchange_test_connection for URI checks). See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/test-powershellconnectivity", {
    clientAccessServer: z.string().optional().describe("CAS server, e.g. MBX2"),
    testType: z.enum(["Internal", "External"]).optional(),
    virtualDirectoryName: z.string().optional().describe("E.g. 'PowerShell (Default Web Site)'"),
    authentication: z.string().optional().describe("Default, Basic, Credssp, Digest, Kerberos, Negotiate"),
    mailboxServer: z.string().optional().describe("Backend Mailbox server under test"),
    monitoringContext: z.boolean().optional(),
    resetTestAccountCredentials: z.boolean().optional(),
    trustAnySSLCertificate: z.boolean().optional().describe("Skip cert check"),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com"),
  }, async (p) => {
    let cmd = `Test-PowerShellConnectivity`;
    if (p.clientAccessServer) cmd += ` -ClientAccessServer '${esc(p.clientAccessServer)}'`;
    if (p.testType) cmd += ` -TestType ${p.testType}`;
    if (p.virtualDirectoryName) cmd += ` -VirtualDirectoryName '${esc(p.virtualDirectoryName)}'`;
    if (p.authentication) cmd += ` -Authentication ${p.authentication}`;
    if (p.mailboxServer) cmd += ` -MailboxServer '${esc(p.mailboxServer)}'`;
    if (p.monitoringContext) cmd += ` -MonitoringContext`;
    if (p.resetTestAccountCredentials) cmd += ` -ResetTestAccountCredentials`;
    if (p.trustAnySSLCertificate) cmd += ` -TrustAnySSLCertificate`;
    cmd += dcSuffix(p.domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_test_webservicesconnectivity", "Test EWS connectivity (Test-WebServicesConnectivity) — Autodiscover SOAP + GetFolder/ConvertID. Identity omitted (requires interactive MailboxCredential). See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/test-webservicesconnectivity", {
    clientAccessServer: z.string().optional().describe("CAS server, e.g. MBX01"),
    autoDiscoverServer: z.string().optional().describe("CAS server used for Autodiscover (mutually exclusive with clientAccessServer)"),
    lightMode: z.boolean().optional().describe("ConvertId test instead of GetFolder"),
    monitoringContext: z.boolean().optional(),
    trustAnySSLCertificate: z.boolean().optional(),
  }, async (p) => {
    let cmd = `Test-WebServicesConnectivity`;
    if (p.clientAccessServer) cmd += ` -ClientAccessServer '${esc(p.clientAccessServer)}'`;
    if (p.autoDiscoverServer) cmd += ` -AutoDiscoverServer '${esc(p.autoDiscoverServer)}'`;
    if (p.lightMode) cmd += ` -LightMode`;
    if (p.monitoringContext) cmd += ` -MonitoringContext`;
    if (p.trustAnySSLCertificate) cmd += ` -TrustAnySSLCertificate`;
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
}
