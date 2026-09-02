import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PowerShellProvider } from "../clients/powershell-provider.js";

// Monitoring & Troubleshooting — per docs/high-availability/managed-availability + queues
export function registerMonitoringTools(server: McpServer, ps: PowerShellProvider) {
  server.tool("exchange_get_server_health", "Get server health (Get-ServerHealth) — Managed Availability health sets", {
    server: z.string().describe("Server FQDN"), healthSet: z.string().optional(),
  }, async ({ server, healthSet }) => {
    const cmd = healthSet ? `Get-ServerHealth -Identity "${server}" -HealthSet "${healthSet}"` : `Get-ServerHealth -Identity "${server}"`;
    const data = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_get_health_report", "Get health report (Get-HealthReport) — rollup per server/DAG", {
    server: z.string().optional(), healthSet: z.string().optional(),
  }, async ({ server, healthSet }) => {
    let cmd = server ? `Get-HealthReport -Identity "${server}"` : "Get-HealthReport";
    if (healthSet) cmd += ` -HealthSet "${healthSet}"`;
    const data = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_test_service_health", "Test service health (Test-ServiceHealth) — checks required services", { server: z.string().optional() }, async ({ server }) => {
    const data = await ps.invokeJson(server ? `Test-ServiceHealth -Server "${server}"` : "Test-ServiceHealth");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_test_replication_health", "Test replication health (DAG — Test-ReplicationHealth)", { server: z.string().optional() }, async ({ server }) => {
    const data = await ps.invokeJson(server ? `Test-ReplicationHealth -Identity "${server}"` : "Test-ReplicationHealth");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_get_server_component_state", "Get server component states (ServerWideOffline, etc.)", { server: z.string() }, async ({ server }) => {
    const data = await ps.invokeJson(`Get-ServerComponentState -Identity "${server}"`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_get_monitoring_item", "Get monitoring items (probes/monitors/responders) for a health set", { server: z.string(), healthSet: z.string().optional() }, async ({ server, healthSet }) => {
    const cmd = healthSet ? `Get-MonitoringItemIdentity -Server "${server}" -HealthSet "${healthSet}"` : `Get-MonitoringItemIdentity -Server "${server}"`;
    const data = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_test_mailflow", "Test mailflow (Test-Mailflow)", {
    sourceMailbox: z.string().optional(), targetMailbox: z.string().optional(),
  }, async ({ sourceMailbox, targetMailbox }) => {
    let cmd = "Test-Mailflow";
    if (sourceMailbox) cmd += ` -SourceMailboxServer "${sourceMailbox}"`;
    if (targetMailbox) cmd += ` -TargetMailboxServer "${targetMailbox}"`;
    const data = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_get_role_groups", "List role groups (RBAC — Permissions)", {}, async () => {
    const data = await ps.invokeJson("Get-RoleGroup");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_search_admin_audit_log", "Search admin audit log (compliance)", {
    startDate: z.string().optional(), endDate: z.string().optional(), userIds: z.string().optional(), resultSize: z.number().optional(),
  }, async ({ startDate, endDate, userIds, resultSize }) => {
    let cmd = "Search-AdminAuditLog";
    if (startDate) cmd += ` -StartDate "${startDate}"`;
    if (endDate) cmd += ` -EndDate "${endDate}"`;
    if (userIds) cmd += ` -UserIds "${userIds}"`;
    cmd += ` -ResultSize ${resultSize ?? 20}`;
    const data = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });
}
