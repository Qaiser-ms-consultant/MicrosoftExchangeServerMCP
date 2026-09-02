import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerPrompts(server: McpServer) {
  server.prompt(
    "triage-inbox",
    "Triage inbox: summarize unread messages and suggest actions",
    { folder: z.string().optional().describe("Folder to triage") },
    async ({ folder }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Triage the ${folder ?? "inbox"} folder: list the 10 most recent unread messages, summarize each in one line, and suggest whether to reply, archive, or delete. Use exchange_list_messages and exchange_search_messages.`,
          },
        },
      ],
    }),
  );

  server.prompt(
    "schedule-meeting",
    "Schedule a meeting with attendees",
    {
      subject: z.string().describe("Meeting subject"),
      attendees: z.string().describe("Comma-separated emails"),
    },
    async ({ subject, attendees }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Schedule a meeting "${subject}" with ${attendees}. First check availability with exchange_get_availability, then create with exchange_create_calendar_event.`,
          },
        },
      ],
    }),
  );
}
