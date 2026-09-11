import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PowerShellProvider } from "../clients/powershell-provider.js";

export function registerDiagnosticsExtended(server: McpServer, ps: PowerShellProvider) {
  server.tool(
    "diagnostics.test_exchange_search",
    "Test Exchange Search content index (Test-ExchangeSearch) — validates search is healthy for mailbox/database",
    { mailbox: z.string().optional().describe("Mailbox identity, e.g. admin@contoso.com"), database: z.string().optional() },
    async ({ mailbox, database }) => {
      let cmd = "Test-ExchangeSearch";
      if (mailbox) cmd += ` -MailboxDatabase "${database ?? ""}"`;
      if (mailbox) cmd = `Test-ExchangeSearch -Identity "${mailbox}"`;
      else if (database) cmd = `Test-ExchangeSearch -MailboxDatabase "${database}"`;
      const d = await ps.invokeJson(`${cmd} | Select-Object Identity,ResultFound,SearchTime`);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_dump_provisioningcache",
    "Dump provisioning cache keys for a server/application (Dump-ProvisioningCache) — diagnostic, rarely used for stale recipient provisioning data. Use keys with Reset-ProvisioningCache. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/dump-provisioningcache",
    {
      server: z.string().describe("FQDN of the server, e.g. EXSRV1.contoso.com"),
      application: z.string().describe("Application: Powershell, Powershell-LiveId, Powershell-Proxy, PowershellLiveId-Proxy, Ecp, Psws"),
      globalCache: z.boolean().optional().describe("Dump global cache keys (GlobalCache set, e.g. -GlobalCache)"),
      currentOrganization: z.boolean().optional().describe("Scope to current organization (OrganizationCache set)"),
      organizations: z.string().optional().describe("Comma-separated organizations (multi-tenant OrganizationCache set)"),
      cacheKeys: z.string().optional().describe("Comma-separated cache-key GUIDs (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx) to filter"),
    },
    async ({ server, application, globalCache, currentOrganization, organizations, cacheKeys }) => {
      const esc = (s: string) => s.replace(/'/g, "''");
      const qlist = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean).map((x) => `'${esc(x)}'`).join(",");
      const hasOrgScope = !!(currentOrganization || organizations);
      if (globalCache && hasOrgScope) throw new Error("globalCache cannot be combined with currentOrganization/organizations (GlobalCache vs OrganizationCache sets)");
      let cmd = `Dump-ProvisioningCache -Server '${esc(server)}' -Application '${esc(application)}'`;
      if (globalCache) cmd += ` -GlobalCache`;
      if (currentOrganization) cmd += ` -CurrentOrganization`;
      if (organizations) cmd += ` -Organizations ${qlist(organizations)}`;
      if (cacheKeys) cmd += ` -CacheKeys ${qlist(cacheKeys)}`;
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "exchange_reset_provisioningcache",
    "Clear the provisioning cache (Reset-ProvisioningCache) — diagnostic-only reset for stale recipient provisioning data. Get keys via exchange_dump_provisioningcache first. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/reset-provisioningcache",
    {
      server: z.string().describe("FQDN of the server, e.g. EXSRV1.contoso.com"),
      application: z.string().describe("Application: Powershell, Powershell-LiveId, Powershell-Proxy, PowershellLiveId-Proxy, Ecp, Psws"),
      globalCache: z.boolean().optional().describe("Clear all cache keys (GlobalCache set, e.g. -GlobalCache)"),
      currentOrganization: z.boolean().optional().describe("Reset current organization cache (OrganizationCache set)"),
      organizations: z.string().optional().describe("Comma-separated organizations (multi-tenant OrganizationCache set)"),
      cacheKeys: z.string().optional().describe("Comma-separated cache-key GUIDs (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx) to clear; omit with -GlobalCache to clear all"),
    },
    async ({ server, application, globalCache, currentOrganization, organizations, cacheKeys }) => {
      const esc = (s: string) => s.replace(/'/g, "''");
      const qlist = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean).map((x) => `'${esc(x)}'`).join(",");
      const hasOrgScope = !!(currentOrganization || organizations);
      if (globalCache && hasOrgScope) throw new Error("globalCache cannot be combined with currentOrganization/organizations (GlobalCache vs OrganizationCache sets)");
      let cmd = `Reset-ProvisioningCache -Server '${esc(server)}' -Application '${esc(application)}'`;
      if (globalCache) cmd += ` -GlobalCache`;
      if (currentOrganization) cmd += ` -CurrentOrganization`;
      if (organizations) cmd += ` -Organizations ${qlist(organizations)}`;
      if (cacheKeys) cmd += ` -CacheKeys ${qlist(cacheKeys)}`;
      cmd += ` -Confirm:$false`;
      await ps.invoke(cmd);
      return { content: [{ type: "text", text: `Reset provisioning cache on ${server} for ${application}` }] };
    },
  );

  server.tool(
    "migration.get_moverequest_statistics",
    "Get MoveRequest statistics with polling (Get-MoveRequestStatistics) — for migration ETA and content index (poll until PercentComplete)",
    { identity: z.string().optional().describe("MoveRequest identity, e.g. alias\\MoveRequest"), poll: z.boolean().optional() },
    async ({ identity, poll }) => {
      const base = identity ? `Get-MoveRequestStatistics -Identity "${identity}"` : `Get-MoveRequestStatistics | Select-Object Identity,Status,PercentComplete,BytesTransferred`;
      const select = ` | Select-Object Identity,Status,PercentComplete,BytesTransferred,Message,FailureType`;
      const cmd = identity ? `${base} | Select-Object Identity,Status,PercentComplete,BytesTransferred,Message | Select-Object -First 1` : `${base} | Select-Object Identity,Status,PercentComplete`;
      // If poll, loop 3 times with 2s delay (simple)
      if (poll && identity) {
        for (let i = 0; i < 3; i++) {
          const d = await ps.invokeJson(cmd);
          const pct = (d as any[])[0]?.PercentComplete;
          if (pct === 100) return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
      const d = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );
}
