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
}
