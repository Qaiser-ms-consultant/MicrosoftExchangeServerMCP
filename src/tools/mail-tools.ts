import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ExchangeClient } from "../clients/exchange-client.js";

export function registerMailTools(server: McpServer, client: ExchangeClient) {
  server.tool(
    "exchange_list_messages",
    "List messages in a mailbox folder (inbox, sentitems, drafts, etc.)",
    { folder: z.string().optional().describe("Folder id, default inbox"), top: z.number().min(1).max(100).optional(), skip: z.number().optional() },
    async ({ folder, top, skip }) => {
      const msgs = await client.listMessages(folder ?? "inbox", { top, skip });
      return { content: [{ type: "text", text: JSON.stringify(msgs, null, 2) }] };
    },
  );

  server.tool(
    "exchange_get_message",
    "Get a single message by id",
    { id: z.string().describe("Message id") },
    async ({ id }) => {
      const msg = await client.getMessage(id);
      return { content: [{ type: "text", text: JSON.stringify(msg, null, 2) }] };
    },
  );

  server.tool(
    "exchange_send_message",
    "Send an email message",
    {
      to: z.array(z.string()).describe("Recipients"),
      cc: z.array(z.string()).optional(),
      bcc: z.array(z.string()).optional(),
      subject: z.string(),
      body: z.string(),
      bodyType: z.enum(["Text", "HTML"]).optional(),
      importance: z.enum(["Low", "Normal", "High"]).optional(),
    },
    async (input) => {
      const id = await client.sendMessage(input);
      return { content: [{ type: "text", text: `Message sent: ${id}` }] };
    },
  );

  server.tool(
    "exchange_reply_message",
    "Reply to a message (sends a reply, does not modify original)",
    { id: z.string().describe("Original message id"), body: z.string().describe("Reply body") },
    async ({ id, body }) => {
      // Exchange reply is send + reference; simplified as send with subject Re:
      const orig = await client.getMessage(id);
      await client.sendMessage({ to: [orig.from], subject: `Re: ${orig.subject}`, body, bodyType: "HTML" });
      return { content: [{ type: "text", text: "Reply sent" }] };
    },
  );

  server.tool(
    "exchange_forward_message",
    "Forward a message to recipients",
    { id: z.string(), to: z.array(z.string()) },
    async ({ id, to }) => {
      const orig = await client.getMessage(id);
      await client.sendMessage({ to, subject: `Fw: ${orig.subject}`, body: orig.body, bodyType: orig.bodyType });
      return { content: [{ type: "text", text: "Forwarded" }] };
    },
  );

  server.tool(
    "exchange_delete_message",
    "Delete a message (moves to Deleted Items)",
    { id: z.string() },
    async ({ id }) => {
      await client.deleteMessage(id);
      return { content: [{ type: "text", text: "Deleted" }] };
    },
  );

  server.tool(
    "exchange_move_message",
    "Move a message to another folder",
    { id: z.string(), folder: z.string().describe("Destination folder id") },
    async ({ id, folder }) => {
      await client.moveMessage(id, folder);
      return { content: [{ type: "text", text: `Moved to ${folder}` }] };
    },
  );

  server.tool(
    "exchange_search_messages",
    "Search messages by query (subject/body)",
    { query: z.string(), top: z.number().optional(), folder: z.string().optional() },
    async ({ query, top, folder }) => {
      const msgs = await client.searchMessages(query, { top, folder });
      return { content: [{ type: "text", text: JSON.stringify(msgs, null, 2) }] };
    },
  );
}
