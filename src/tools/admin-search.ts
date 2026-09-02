import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PowerShellProvider } from "../clients/powershell-provider.js";

// PowerShell-based message search — works without EWS/Graph (admin PowerShell only)
export function registerSearchTools(server: McpServer, ps: PowerShellProvider) {
  server.tool(
    "exchange_search_mailbox",
    "Search mailbox messages via Search-Mailbox (PowerShell, on-prem, no EWS). EstimateResultOnly by default; set -DeleteContent/$false to avoid deletion. Requires Mailbox Search role.",
    {
      identity: z.string().describe("Mailbox identity (e.g. devlabadmin@devlab2025.local)"),
      searchQuery: z.string().describe("Search query (e.g. subject:test, from:alice, kind:email)"),
      estimateOnly: z.boolean().optional().describe("If true (default), only estimate result count, don't copy/delete"),
      targetMailbox: z.string().optional().describe("For Search-Mailbox copy target"),
      targetFolder: z.string().optional(),
    },
    async ({ identity, searchQuery, estimateOnly, targetMailbox, targetFolder }) => {
      const est = estimateOnly !== false;
      let cmd = `Search-Mailbox -Identity "${identity}" -SearchQuery '${searchQuery.replace(/'/g, "''")}'`;
      if (est) cmd += ` -EstimateResultOnly`;
      else {
        if (targetMailbox) cmd += ` -TargetMailbox "${targetMailbox}"`;
        if (targetFolder) cmd += ` -TargetFolder "${targetFolder}"`;
      }
      const data = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );


}
