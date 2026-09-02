import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ExchangeClient } from "../clients/exchange-client.js";

export function registerCalendarTools(server: McpServer, client: ExchangeClient) {
  server.tool(
    "exchange_list_calendar_events",
    "List calendar events (optionally filtered by start/end ISO datetimes)",
    { start: z.string().optional(), end: z.string().optional() },
    async ({ start, end }) => {
      const events = await client.listCalendarEvents(start, end);
      return { content: [{ type: "text", text: JSON.stringify(events, null, 2) }] };
    },
  );

  server.tool(
    "exchange_create_calendar_event",
    "Create a calendar event",
    {
      subject: z.string(),
      body: z.string().optional(),
      start: z.string().describe("ISO datetime"),
      end: z.string().describe("ISO datetime"),
      location: z.string().optional(),
      attendees: z.array(z.string()).optional(),
    },
    async (input) => {
      const id = await client.createCalendarEvent(input);
      return { content: [{ type: "text", text: `Event created: ${id}` }] };
    },
  );

  server.tool(
    "exchange_get_availability",
    "Get availability for attendees (free/busy) — EWS only, returns raw",
    {
      attendees: z.array(z.string()),
      start: z.string(),
      end: z.string(),
    },
    async ({ attendees, start, end }) => {
      // Placeholder — real impl would call EWS GetUserAvailability
      return {
        content: [{ type: "text", text: JSON.stringify({ attendees, start, end, note: "availability requires EWS GetUserAvailability — wire to EWSProvider" }, null, 2) }],
      };
    },
  );
}
