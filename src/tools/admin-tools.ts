import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ExchangeClient } from "../clients/exchange-client.js";

export function registerAdminTools(_server: McpServer, _client: ExchangeClient) {
  // Legacy stub — consolidated into admin-recipients.ts / admin-transport.ts
  // Kept for backwards compat, no tools registered here
}
