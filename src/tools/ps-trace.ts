import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PowerShellProvider } from "../clients/powershell-provider.js";

export function registerPsTrace(server: McpServer, ps: PowerShellProvider) {
  server.tool(
    "exchange_get_ps_trace",
    "Last PowerShell commands executed by the MCP server — powers the desktop PowerShell Trace tab. Take semantics: returns the buffered commands and clears the buffer, so clear-then-run-then-read isolates one query.",
    {},
    async () => {
      const entries = ps.takeTrace();
      return { content: [{ type: "text", text: JSON.stringify(entries, null, 2) }] };
    },
  );
}
