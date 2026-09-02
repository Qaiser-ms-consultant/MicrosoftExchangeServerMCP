import { z } from "zod";
import axios from "axios";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../config.js";
import { getHttpsAgent } from "../utils/tls.js";
import type { AuthManager } from "../auth/auth-manager.js";

export function registerDiagnosticTools(server: McpServer, config: AppConfig, auth: AuthManager) {
  server.tool(
    "exchange_test_connection",
    "Diagnose Exchange connectivity — tests endpoint reachability, PowerShell virtual directory, and auth. Use when all tools return 404.",
    {
      target: z.enum(["powershell", "ews", "rest", "all"]).optional().describe("Which endpoint to test, default all"),
    },
    async ({ target }) => {
      const t = target ?? "all";
      const results: Record<string, unknown> = {};
      const authHeader = await auth.getAuthHeader().catch((e) => `AUTH_ERROR: ${(e as Error).message}`);
      const extra = await auth.getExtraOptions().catch(() => ({}) as any);
      const httpsAgent = await getHttpsAgent(config, (extra as any)?.httpsAgent);

      const testUrl = async (url: string, label: string) => {
        try {
          const res = await axios.get(url, {
            // @ts-ignore
            httpsAgent,
            headers: typeof authHeader === "string" && !authHeader.startsWith("AUTH_ERROR") ? { Authorization: authHeader } : {},
            validateStatus: () => true,
            timeout: 8000,
          });
          return {
            url,
            status: res.status,
            statusText: (res as any).statusText,
            headers: Object.fromEntries(Object.entries(res.headers).slice(0, 8)),
            bodyPreview: typeof res.data === "string" ? res.data.slice(0, 500) : JSON.stringify(res.data).slice(0, 500),
            hint:
              res.status === 404
                ? `404 at ${url} — wrong host/port/path. Must be http(s)://<fqdn>/PowerShell (capital P/S). Check Get-PowerShellVirtualDirectory on Exchange. Try EXCHANGE_POWERSHELL_URL=https://<fqdn>/PowerShell or http://<fqdn>/PowerShell`
                : res.status === 401
                  ? `401 — auth failed. Exchange PowerShell vdir defaults to Kerberos/NTLM (Negotiate), not Basic. Run: Get-PowerShellVirtualDirectory | fl *Auth* ; Enable Basic with Set-PowerShellVirtualDirectory -BasicAuthentication:$true if using Basic.`
                  : res.status === 403
                    ? `403 — RBAC deny. Verify user in Organization Management.`
                    : undefined,
          };
        } catch (err: any) {
          return { url, error: err.message, code: err.code, hint: `Connection failed — verify host reachable, firewall, WinRM (winrm enumerate winrm/config/listener; Test-WSMan ${new URL(url).hostname})` };
        }
      };

      if (t === "powershell" || t === "all") results.powershell = await testUrl(config.exchange.powershellUri, "powershell");
      if (t === "ews" || t === "all") results.ews = await testUrl(`${config.exchange.endpoint.replace(/\/$/, "")}${config.exchange.ewsPath}`, "ews");
      if (t === "rest" || t === "all") results.rest = await testUrl(`${config.exchange.endpoint.replace(/\/$/, "")}${config.exchange.restPath}`, "rest");

      results.config = {
        endpoint: config.exchange.endpoint,
        powershellUri: config.exchange.powershellUri,
        ewsPath: config.exchange.ewsPath,
        restPath: config.exchange.restPath,
        insecure: !!(config.exchange.insecure || config.exchange.tls?.rejectUnauthorized === false),
        authMethod: config.auth.method,
        PowershellUrlEnvHint: "Set EXCHANGE_POWERSHELL_URL=https://<exchange-fqdn>/PowerShell or EXCHANGE_SERVER=<fqdn> to fix 404",
      };
      results.nextSteps = [
        "1) On Exchange server run: Get-PowerShellVirtualDirectory | Format-List Name,InternalUrl,ExternalUrl,*Authentication",
        "2) Test WinRM: Test-WSMan <exchange-host> ; winrm enumerate winrm/config/listener",
        "3) If 401, enable Basic or use Kerberos: Set-PowerShellVirtualDirectory -Identity \"Server\\\\PowerShell (Default Web Site)\" -BasicAuthentication $true -WindowsAuthentication $true ; iisreset",
        "4) Try http vs https: EXCHANGE_POWERSHELL_URL=http://<host>/PowerShell vs https://<host>/PowerShell",
        "5) Verify firewall: port 443 (https) / 80 (http) / 5985-5986 (WinRM) open",
      ];

      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );
}
