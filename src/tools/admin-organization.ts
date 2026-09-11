import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PowerShellProvider } from "../clients/powershell-provider.js";

export function registerOrganizationTools(server: McpServer, ps: PowerShellProvider) {
  server.tool(
    "organization.get_config",
    "Get organization-wide Exchange settings (Get-OrganizationConfig) — standalone, not just report wrapper",
    {},
    async () => {
      const d = await ps.invokeJson(`Get-OrganizationConfig | Select-Object Name,ActivityBasedAuthenticationTimeoutInterval,DefaultPublicFolderAgeLimit,HierarchicalAddressBookRoot,IsDehydrated,CustomerFeedbackEnabled | Select-Object -First 1`);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "organization.get_info",
    "Get organization info alias (same as get_config)",
    {},
    async () => {
      const d = await ps.invokeJson(`Get-OrganizationConfig | Select-Object DisplayName,Name,Guid | Select-Object -First 1`);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_get_adserversettings",
    "View AD DS session settings (Get-ADServerSettings) — replaces Exchange 2007 AdminSessionADSettings. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/get-adserversettings",
    {},
    async () => {
      const d = await ps.invokeJson(`Get-ADServerSettings`);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_get_adsite",
    "Display AD site configuration (Get-ADSite) — sites and routing costs. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/get-adsite",
    {
      identity: z.string().optional().describe("Site name or GUID, e.g. Default-First-Site-Name. Omit to list all sites."),
      domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com"),
    },
    async ({ identity, domainController }) => {
      const esc = (s: string) => s.replace(/'/g, "''");
      let cmd = `Get-ADSite`;
      if (identity) cmd += ` -Identity '${esc(identity)}'`;
      if (domainController) cmd += ` -DomainController '${esc(domainController)}'`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_set_adsite",
    "Configure Exchange settings of an AD site (Set-ADSite) — e.g. mark a hub site. PartnerId omitted (internal Microsoft use). See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/set-adsite",
    {
      identity: z.string().describe("Site name, GUID, or DN, e.g. Default-First-Site-Name"),
      hubSiteEnabled: z.boolean().optional().describe("Site acts as a hub site (default $false)"),
      inboundMailEnabled: z.boolean().optional().describe("Exchange servers in the site receive incoming mail (default $true; $false after failover/maintenance)"),
      domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com"),
    },
    async ({ identity, hubSiteEnabled, inboundMailEnabled, domainController }) => {
      const esc = (s: string) => s.replace(/'/g, "''");
      let cmd = `Set-ADSite -Identity '${esc(identity)}'`;
      if (hubSiteEnabled !== undefined) cmd += ` -HubSiteEnabled $${hubSiteEnabled ? "true" : "false"}`;
      if (inboundMailEnabled !== undefined) cmd += ` -InboundMailEnabled $${inboundMailEnabled ? "true" : "false"}`;
      if (domainController) cmd += ` -DomainController '${esc(domainController)}'`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_get_domaincontroller",
    "List domain controllers (Get-DomainController) — used by EAC to populate DC fields. Credential omitted (interactive Get-Credential not MCP-safe); runs under session credentials. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/get-domaincontroller",
    {
      domainName: z.string().optional().describe("Domain FQDN, e.g. corp.contoso.com (DomainController set)"),
      forest: z.string().optional().describe("Root domain FQDN for forest scope (GlobalCatalog set)"),
      globalCatalog: z.boolean().optional().describe("List global catalog servers only (GlobalCatalog set)"),
    },
    async ({ domainName, forest, globalCatalog }) => {
      const esc = (s: string) => s.replace(/'/g, "''");
      let cmd = `Get-DomainController`;
      if (globalCatalog) cmd += ` -GlobalCatalog`;
      if (forest) cmd += ` -Forest '${esc(forest)}'`;
      if (domainName) cmd += ` -DomainName '${esc(domainName)}'`;
      const d = await ps.invokeJson(`${cmd} | Select-Object Name,ADSite,Forest,IsGlobalCatalog,CurrentDomainController`);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_get_organizationalunit",
    "List organizational units (Get-OrganizationalUnit) — used by EAC to populate OU fields. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/get-organizationalunit",
    {
      identity: z.string().optional().describe("OU/domain identity (name, canonical name, DN, GUID), e.g. 'North America'. Cannot combine with searchText."),
      searchText: z.string().optional().describe("Search OU names for this string, e.g. 'Executives'. Cannot combine with identity/singleNodeOnly."),
      singleNodeOnly: z.boolean().optional().describe("First-level children only beneath Identity (Identity set)"),
      includeContainers: z.boolean().optional().describe("Include containers in results"),
      resultSize: z.number().min(1).max(10000).optional().describe("Max rows (default 1000 server-side)"),
      domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com (on-prem only)"),
    },
    async ({ identity, searchText, singleNodeOnly, includeContainers, resultSize, domainController }) => {
      const esc = (s: string) => s.replace(/'/g, "''");
      if (identity && searchText) throw new Error("identity and searchText are separate parameter sets — provide one or neither");
      if (searchText && singleNodeOnly) throw new Error("singleNodeOnly belongs to the Identity set — omit it with searchText");
      let cmd = `Get-OrganizationalUnit`;
      if (identity) cmd += ` -Identity '${esc(identity)}'`;
      if (searchText) cmd += ` -SearchText '${esc(searchText)}'`;
      if (singleNodeOnly) cmd += ` -SingleNodeOnly`;
      if (includeContainers) cmd += ` -IncludeContainers`;
      if (resultSize !== undefined) cmd += ` -ResultSize ${resultSize}`;
      if (domainController) cmd += ` -DomainController '${esc(domainController)}'`;
      const d = await ps.invokeJson(`${cmd} | Select-Object Name,DistinguishedName,CanonicalName,Guid`);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_get_trust",
    "Return external and forest trusts (Get-Trust) — used by EAC to populate recipient fields. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/get-trust",
    {
      domainName: z.string().optional().describe("Restrict trusts to this domain, e.g. Contoso.com. Omit for all trusts."),
    },
    async ({ domainName }) => {
      const esc = (s: string) => s.replace(/'/g, "''");
      let cmd = `Get-Trust`;
      if (domainName) cmd += ` -DomainName '${esc(domainName)}'`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_get_userprincipalnamessuffix",
    "View UPN suffixes in the forest (Get-UserPrincipalNamesSuffix) — suffixes created in AD Domains and Trusts. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/get-userprincipalnamessuffix",
    {
      organizationalUnit: z.string().optional().describe("OU/domain filter (name, canonical name, DN, GUID) via Get-OrganizationalUnit values. Omit for all suffixes."),
    },
    async ({ organizationalUnit }) => {
      const esc = (s: string) => s.replace(/'/g, "''");
      let cmd = `Get-UserPrincipalNamesSuffix`;
      if (organizationalUnit) cmd += ` -OrganizationalUnit '${esc(organizationalUnit)}'`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_set_adserversettings",
    "Manage AD DS session settings (Set-ADServerSettings) — session recipient scope and preferred DCs. RunspaceServerSettings (script-object Instance set) omitted. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/set-adserversettings",
    {
      preferredServer: z.string().optional().describe("Preferred DC FQDN for this session (SingleDC set)"),
      recipientViewRoot: z.string().optional().describe("Recipient scope OU as <domain FQDN>/<OU tree>, e.g. 'contoso.com/Marketing Users'"),
      viewEntireForest: z.boolean().optional().describe("Scope session to the entire forest ($true clears RecipientViewRoot)"),
      configurationDomainController: z.string().optional().describe("Config DC FQDN for Exchange config reads (FullParams set)"),
      preferredGlobalCatalog: z.string().optional().describe("Preferred GC FQDN for recipient reads, e.g. gc1.contoso.com"),
      setPreferredDomainControllers: z.string().optional().describe("Comma-separated preferred DC FQDNs for AD reads in this session"),
    },
    async ({ preferredServer, recipientViewRoot, viewEntireForest, configurationDomainController, preferredGlobalCatalog, setPreferredDomainControllers }) => {
      const esc = (s: string) => s.replace(/'/g, "''");
      const qlist = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean).map((x) => `'${esc(x)}'`).join(",");
      let cmd = `Set-ADServerSettings`;
      if (preferredServer) cmd += ` -PreferredServer '${esc(preferredServer)}'`;
      if (recipientViewRoot) cmd += ` -RecipientViewRoot '${esc(recipientViewRoot)}'`;
      if (viewEntireForest !== undefined) cmd += ` -ViewEntireForest $${viewEntireForest ? "true" : "false"}`;
      if (configurationDomainController) cmd += ` -ConfigurationDomainController '${esc(configurationDomainController)}'`;
      if (preferredGlobalCatalog) cmd += ` -PreferredGlobalCatalog '${esc(preferredGlobalCatalog)}'`;
      if (setPreferredDomainControllers) cmd += ` -SetPreferredDomainControllers ${qlist(setPreferredDomainControllers)}`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );
}
