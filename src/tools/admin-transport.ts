import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PowerShellProvider } from "../clients/powershell-provider.js";

// Mail flow — EAC Mail flow + Transport (per docs/exchange Server mail flow)
export function registerTransportAdminTools(server: McpServer, ps: PowerShellProvider) {
  server.tool("exchange_get_transport_rules", "Get transport (mail flow) rules", {}, async () => {
    const data = await ps.getTransportRules();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_list_send_connectors", "List Send connectors", {}, async () => {
    const data = await ps.invokeJson("Get-SendConnector");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_list_receive_connectors", "List Receive connectors (optionally per server)", { server: z.string().optional() }, async ({ server }) => {
    const data = await ps.invokeJson(server ? `Get-ReceiveConnector -Server "${server}"` : "Get-ReceiveConnector");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_list_accepted_domains", "List accepted domains", {}, async () => {
    const data = await ps.invokeJson("Get-AcceptedDomain");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_list_remote_domains", "List remote domains", {}, async () => {
    const data = await ps.invokeJson("Get-RemoteDomain");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_get_queue", "Get transport queues (Get-Queue) — key for troubleshooting mail flow", {
    server: z.string().optional().describe("Mailbox/Edge server name"), filter: z.string().optional().describe("PowerShell filter, e.g. MessageCount -gt 100"),
  }, async ({ server, filter }) => {
    let cmd = "Get-Queue";
    if (server) cmd += ` -Server "${server}"`;
    if (filter) cmd += ` -Filter {${filter}}`;
    const data = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_get_queue_digest", "Get queue digest across DAG (Get-QueueDigest) — DAG-wide, may timeout if no DAG; falls back to Get-Queue", { dag: z.string().optional() }, async ({ dag }) => {
    try {
      const data = await ps.invokeJson(dag ? `Get-QueueDigest -Dag "${dag}" | Select-Object -First 10` : `Get-QueueDigest | Select-Object -First 10`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    } catch {
      const fallback = await ps.invokeJson(`Get-Queue | Select-Object Identity,MessageCount | Select-Object -First 10`);
      return { content: [{ type: "text", text: JSON.stringify({ note: "Get-QueueDigest not available (no DAG) — fallback to Get-Queue", data: fallback }, null, 2) }] };
    }
  });

  server.tool("exchange_retry_queue", "Retry a queue (troubleshooting)", { identity: z.string().describe("Queue identity, e.g. Server\\Submission"), server: z.string().optional() }, async ({ identity, server }) => {
    const cmd = server ? `Retry-Queue -Identity "${identity}" -Server "${server}"` : `Retry-Queue -Identity "${identity}"`;
    await ps.invoke(cmd);
    return { content: [{ type: "text", text: `Retried ${identity}` }] };
  });

  server.tool("exchange_suspend_queue", "Suspend a queue", { identity: z.string() }, async ({ identity }) => {
    await ps.invoke(`Suspend-Queue -Identity "${identity}" -Confirm:$false`);
    return { content: [{ type: "text", text: `Suspended ${identity}` }] };
  });

  server.tool("exchange_get_message_tracking_log", "Search message tracking logs (troubleshooting delivery)", {
    server: z.string().optional(), sender: z.string().optional(), recipients: z.string().optional(), messageSubject: z.string().optional(), start: z.string().optional().describe("ISO datetime"), end: z.string().optional(), resultSize: z.number().optional(),
  }, async (p) => {
    let cmd = "Get-MessageTrackingLog";
    if (p.server) cmd += ` -Server "${p.server}"`;
    if (p.sender) cmd += ` -Sender "${p.sender}"`;
    if (p.recipients) cmd += ` -Recipients "${p.recipients}"`;
    if (p.messageSubject) cmd += ` -MessageSubject "${p.messageSubject}"`;
    if (p.start) cmd += ` -Start "${p.start}"`;
    if (p.end) cmd += ` -End "${p.end}"`;
    cmd += ` -ResultSize ${p.resultSize ?? 10}`;
    const data = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });
}
