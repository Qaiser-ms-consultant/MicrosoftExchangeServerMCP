import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ExchangeClient } from "../clients/exchange-client.js";

export function registerContactTools(server: McpServer, client: ExchangeClient) {
  server.tool("exchange_list_contacts", "List contacts", {}, async () => {
    const contacts = await client.listContacts();
    return { content: [{ type: "text", text: JSON.stringify(contacts, null, 2) }] };
  });

  server.tool("exchange_list_tasks", "List tasks", {}, async () => {
    const tasks = await client.listTasks();
    return { content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }] };
  });
}
