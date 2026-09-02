import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PowerShellProvider } from "../clients/powershell-provider.js";

// Servers / Databases / DAG / Certificates — EAC Servers + High Availability (per docs)
export function registerServerAdminTools(server: McpServer, ps: PowerShellProvider) {
  server.tool("exchange_list_servers", "List Exchange servers (Get-ExchangeServer)", {}, async () => {
    const data = await ps.invokeJson("Get-ExchangeServer");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_get_server", "Get Exchange server details", { identity: z.string() }, async ({ identity }) => {
    const data = await ps.invokeJson(`Get-ExchangeServer -Identity "${identity}"`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_list_mailbox_databases", "List mailbox databases", { includePreExchange2013: z.boolean().optional() }, async () => {
    const data = await ps.invokeJson("Get-MailboxDatabase -IncludePreExchange2013:$false");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_get_mailbox_database", "Get mailbox database details", { identity: z.string() }, async ({ identity }) => {
    const data = await ps.invokeJson(`Get-MailboxDatabase -Identity "${identity}"`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_get_database_copy_status", "Get database copy status (DAG health)", { identity: z.string().optional().describe("DB name or * for all"), server: z.string().optional() }, async ({ identity, server }) => {
    let cmd = "Get-MailboxDatabaseCopyStatus";
    if (identity) cmd += ` -Identity "${identity}"`;
    if (server) cmd += ` -Server "${server}"`;
    const data = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_get_dag", "Get Database Availability Groups (DAGs)", { identity: z.string().optional() }, async ({ identity }) => {
    const data = await ps.invokeJson(identity ? `Get-DatabaseAvailabilityGroup -Identity "${identity}"` : "Get-DatabaseAvailabilityGroup");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_get_exchange_certificate", "Get Exchange certificates (expiry monitoring)", { server: z.string().optional() }, async ({ server }) => {
    const data = await ps.invokeJson(server ? `Get-ExchangeCertificate -Server "${server}"` : "Get-ExchangeCertificate");
    return { content: [{ type: "text", text: JSON.stringify(data.map((c: any) => ({ Thumbprint: c.Thumbprint, Subject: c.Subject, NotAfter: c.NotAfter, Services: c.Services, Issuer: c.Issuer })), null, 2) }] };
  });

  server.tool("exchange_get_virtual_directory", "Get virtual directories (OWA/ECP/EWS/ActiveSync/MAPI)", { type: z.enum(["owa", "ecp", "ews", "activesync", "mapi"]).optional(), server: z.string().optional() }, async ({ type, server }) => {
    const map: Record<string, string> = { owa: "Get-OwaVirtualDirectory", ecp: "Get-EcpVirtualDirectory", ews: "Get-WebServicesVirtualDirectory", activesync: "Get-ActiveSyncVirtualDirectory", mapi: "Get-MapiVirtualDirectory" };
    const cmdlet = type ? map[type] : "Get-OwaVirtualDirectory";
    let cmd = cmdlet;
    if (server) cmd += ` -Server "${server}"`;
    const data = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_get_transport_service", "Get Transport service config", { server: z.string().optional() }, async ({ server }) => {
    const data = await ps.invokeJson(server ? `Get-TransportService -Identity "${server}"` : "Get-TransportService");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });
}
