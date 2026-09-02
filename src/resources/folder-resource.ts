import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ExchangeClient } from "../clients/exchange-client.js";

export function registerResources(server: McpServer, client: ExchangeClient) {
  server.resource(
    "exchange-folders",
    "exchange://folders",
    { description: "List mailbox folders (inbox, calendar, contacts, etc.)", mimeType: "application/json" },
    async (uri) => {
      // Exchange well-known folders
      const folders = [
        { id: "inbox", name: "Inbox" },
        { id: "sentitems", name: "Sent Items" },
        { id: "drafts", name: "Drafts" },
        { id: "deleteditems", name: "Deleted Items" },
        { id: "calendar", name: "Calendar" },
        { id: "contacts", name: "Contacts" },
        { id: "tasks", name: "Tasks" },
        { id: "junkemail", name: "Junk Email" },
      ];
      return { contents: [{ uri: uri.href, text: JSON.stringify(folders, null, 2), mimeType: "application/json" }] };
    },
  );
}
