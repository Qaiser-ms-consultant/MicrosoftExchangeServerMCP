import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PowerShellProvider } from "../clients/powershell-provider.js";

export function registerDiagnosticsExtended(server: McpServer, ps: PowerShellProvider) {
  server.tool(
    "diagnostics.test_exchange_search",
    "Test Exchange Search content index (Test-ExchangeSearch) — validates search is healthy for mailbox/database",
    { mailbox: z.string().optional().describe("Mailbox identity, e.g. devlabadmin@devlab2025.local"), database: z.string().optional() },
    async ({ mailbox, database }) => {
      let cmd = "Test-ExchangeSearch";
      if (mailbox) cmd += ` -MailboxDatabase "${database ?? ""}"`;
      if (mailbox) cmd = `Test-ExchangeSearch -Identity "${mailbox}"`;
      else if (database) cmd = `Test-ExchangeSearch -MailboxDatabase "${database}"`;
      const d = await ps.invokeJson(`${cmd} | Select-Object Identity,ResultFound,SearchTime | Select-Object -First 5`);
      return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
    },
  );

  server.tool(
    "migration.get_moverequest_statistics",
    "Get MoveRequest statistics with polling (Get-MoveRequestStatistics) — for migration ETA and content index (poll until PercentComplete)",
    { identity: z.string().optional().describe("MoveRequest identity, e.g. alias\\MoveRequest"), poll: z.boolean().optional() },
    async ({ identity, poll }) => {
      const base = identity ? `Get-MoveRequestStatistics -Identity "${identity}"` : `Get-MoveRequestStatistics | Select-Object Identity,Status,PercentComplete,BytesTransferred | Select-Object -First 10`;
      const select = ` | Select-Object Identity,Status,PercentComplete,BytesTransferred,Message,FailureType | Select-Object -First 10`;
      const cmd = identity ? `${base} | Select-Object Identity,Status,PercentComplete,BytesTransferred,Message | Select-Object -First 1` : `${base} | Select-Object Identity,Status,PercentComplete | Select-Object -First 10`;
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
