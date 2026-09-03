import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PowerShellProvider } from "../clients/powershell-provider.js";

export function registerDagMailflowReports(server: McpServer, ps: PowerShellProvider) {
  const wrap = (name: string, desc: string, cmd: string) => (server as any).tool(name, desc, async () => ({ content: [{ type: "text", text: JSON.stringify(await ps.invokeJson(cmd), null, 2) }] }));
  // DAG
  wrap("report.dag_overview", "DAG topology (Get-DatabaseAvailabilityGroup)", `Get-DatabaseAvailabilityGroup | Select-Object Name,WitnessServer,Servers,OperationalServers | Select-Object -First 10`);
  wrap("report.dag_health", "Overall DAG health (Test-ReplicationHealth)", `Test-ReplicationHealth | Select-Object Server,Check,Result | Select-Object -First 20`);
  wrap("report.dag_member_health", "Member status (Get-DatabaseAvailabilityGroup -Status)", `Get-DatabaseAvailabilityGroup -Status | Select-Object Name,Servers,OperationalServers | Select-Object -First 10`);
  wrap("report.database_copy_status", "Copy status (Get-MailboxDatabaseCopyStatus)", `Get-MailboxDatabaseCopyStatus | Select-Object Identity,Status,CopyQueueLength | Select-Object -First 20`);
  wrap("report.copy_queue_length", "Replication queues (CopyQueueLength)", `Get-MailboxDatabaseCopyStatus | Select-Object Identity,CopyQueueLength | Sort-Object CopyQueueLength -Descending | Select-Object -First 10`);
  wrap("report.replay_queue_length", "Replay queues", `Get-MailboxDatabaseCopyStatus | Select-Object Identity,ReplayQueueLength | Sort-Object ReplayQueueLength -Descending | Select-Object -First 10`);
  wrap("report.content_index_status", "Index health (ContentIndexState)", `Get-MailboxDatabaseCopyStatus | Select-Object Identity,ContentIndexState,ContentIndexErrorMessage | Select-Object -First 20`);
  wrap("report.active_database_distribution", "Active DBs per server", `Get-MailboxDatabaseCopyStatus | Where-Object { $_.ActiveCopy } | Group-Object ActiveCopy | Select-Object Name,Count`);
  wrap("report.activation_preference", "Preferred servers (ActivationPreference)", `Get-MailboxDatabaseCopyStatus | Select-Object Identity,ActivationPreference | Select-Object -First 20`);
  wrap("report.dag_network_configuration", "DAG networks (Get-DatabaseAvailabilityGroupNetwork)", `Get-DatabaseAvailabilityGroupNetwork | Select-Object Name,Subnets,Interfaces | Select-Object -First 10`);
  wrap("report.dag_failover_history", "Failover events (WinEvent System)", `Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='MSExchange*'} -MaxEvents 10 -ErrorAction SilentlyContinue | Select-Object TimeCreated,Id,Message | Select-Object -First 10`);
  wrap("report.database_activation_history", "Activation/deactivation (Get-MailboxDatabaseCopyStatus history)", `Get-MailboxDatabaseCopyStatus | Select-Object Identity,ActiveCopy,Status | Select-Object -First 20`);
  wrap("report.failed_database_copies", "Unhealthy copies (Status -ne Healthy)", `Get-MailboxDatabaseCopyStatus | Where-Object { $_.Status -ne "Mounted" -and $_.Status -ne "Healthy" } | Select-Object Identity,Status | Select-Object -First 20`);
  wrap("report.replication_latency", "Replication performance (CopyQueueLength trend)", `Get-MailboxDatabaseCopyStatus | Select-Object Identity,CopyQueueLength,ReplayQueueLength | Sort-Object CopyQueueLength -Descending | Select-Object -First 10`);
  wrap("report.dag_capacity", "Storage/compute distribution (Get-MailboxDatabase | Group Server)", `Get-MailboxDatabase | Group-Object Server | Select-Object Name,Count`);
  wrap("report.dag_load_balance", "Active DB distribution (load balance)", `Get-MailboxDatabaseCopyStatus | Where-Object { $_.ActiveCopy } | Group-Object { $_.Identity.ToString().Split('\\')[1] } | Select-Object Name,Count`);
  wrap("report.ha_readiness", "Whether environment is ready for failure (Test-ReplicationHealth + witness)", `Test-ReplicationHealth | Select-Object Server,Check,Result | Where-Object { $_.Result -eq "Failed" } | Select-Object -First 10`);
  wrap("report.single_point_of_failure", "Potential HA weaknesses (single DB copy, no DAG)", `Get-MailboxDatabase | Where-Object { (Get-MailboxDatabaseCopyStatus -Identity $_.Name | Measure-Object).Count -eq 1 } | Select-Object Name | Select-Object -First 10`);
  // Mailflow
  wrap("report.mail_flow_overview", "Total inbound/outbound/internal mail (MessageTracking last 24h)", `Get-MessageTrackingLog -ResultSize 100 -Start (Get-Date).AddHours(-24) | Group-Object EventId | Select-Object Name,Count | Sort-Object Count -Descending | Select-Object -First 10`);
  wrap("report.message_volume", "Messages per hour/day/month (group by hour)", `Get-MessageTrackingLog -ResultSize 100 -Start (Get-Date).AddHours(-24) | Group-Object { $_.Timestamp.ToString("yyyy-MM-dd HH:00") } | Select-Object Name,Count | Sort-Object Name | Select-Object -First 20`);
  wrap("report.inbound_mail", "External → Exchange (RECEIVE)", `Get-MessageTrackingLog -ResultSize 50 -EventId RECEIVE | Where-Object { $_.ConnectorId -notlike "*Internal*" } | Select-Object Timestamp,Sender,Recipients | Select-Object -First 10`);
  wrap("report.outbound_mail", "Exchange → external (SEND)", `Get-MessageTrackingLog -ResultSize 50 -EventId SEND | Select-Object Timestamp,Sender,Recipients | Select-Object -First 10`);
  wrap("report.internal_mail", "Internal → internal", `Get-MessageTrackingLog -ResultSize 50 | Where-Object { $_.Source -eq "STOREDRIVER" } | Select-Object Timestamp,Sender | Select-Object -First 10`);
  wrap("report.top_senders", "Highest-volume senders", `Get-MessageTrackingLog -ResultSize 200 -Start (Get-Date).AddDays(-1) | Group-Object Sender | Sort-Object Count -Descending | Select-Object Name,Count -First 10`);
  wrap("report.top_recipients", "Highest-volume recipients", `Get-MessageTrackingLog -ResultSize 200 -Start (Get-Date).AddDays(-1) | Group-Object {$_.Recipients} | Sort-Object Count -Descending | Select-Object Name,Count -First 10`);
  wrap("report.top_external_domains", "Most contacted domains", `Get-MessageTrackingLog -ResultSize 200 | ForEach-Object { ($_.Recipients -split "@")[1] } | Group-Object | Sort-Object Count -Descending | Select-Object Name,Count -First 10`);
  wrap("report.message_tracking", "Message lifecycle (EventId timeline)", `Get-MessageTrackingLog -ResultSize 20 | Select-Object Timestamp,EventId,Source,Sender,Recipients | Select-Object -First 20`);
  wrap("report.message_delivery_status", "Delivered/pending/failed (EventId: DELIVER,SEND,FAIL)", `Get-MessageTrackingLog -ResultSize 100 | Group-Object EventId | Select-Object Name,Count`);
  wrap("report.delivery_latency", "Time taken to deliver (DEFER vs SEND delta)", `Get-MessageTrackingLog -ResultSize 20 | Select-Object Timestamp,EventId,MessageSubject | Select-Object -First 20`);
  wrap("report.smtp_response_report", "SMTP response codes (SourceContext)", `Get-MessageTrackingLog -ResultSize 50 | Select-Object SourceContext | Select-Object -First 10`);
  wrap("report.ndr_report", "Non-delivery reports (FAIL + NDR)", `Get-MessageTrackingLog -ResultSize 50 -EventId FAIL | Select-Object Timestamp,Recipients,SourceContext | Select-Object -First 10`);
  wrap("report.ndr_trend", "NDR frequency over time", `Get-MessageTrackingLog -ResultSize 100 -EventId FAIL | Group-Object { $_.Timestamp.ToString("yyyy-MM-dd") } | Select-Object Name,Count | Sort-Object Name`);
  wrap("report.top_ndr_causes", "Most common failures (SourceContext)", `Get-MessageTrackingLog -ResultSize 100 -EventId FAIL | Group-Object SourceContext | Sort-Object Count -Descending | Select-Object Name,Count -First 10`);
  wrap("report.ndr_by_domain", "Problematic external domains (NDR)", `Get-MessageTrackingLog -ResultSize 100 -EventId FAIL | ForEach-Object { ($_.Recipients -split "@")[1] } | Group-Object | Sort-Object Count -Descending | Select-Object Name,Count -First 10`);
  wrap("report.ndr_by_sender", "Users generating NDRs", `Get-MessageTrackingLog -ResultSize 100 -EventId FAIL | Group-Object Sender | Sort-Object Count -Descending | Select-Object Name,Count -First 10`);
  wrap("report.deferred_messages", "Delayed messages (DEFER)", `Get-MessageTrackingLog -ResultSize 20 -EventId DEFER | Select-Object Timestamp,Sender,Recipients | Select-Object -First 10`);
  wrap("report.queue_report", "Current queues (Get-Queue)", `Get-Queue | Select-Object Identity,Status,MessageCount,NextHopDomain | Select-Object -First 20`);
  wrap("report.queue_growth", "Queue growth trends (snapshot)", `Get-Queue | Select-Object Identity,MessageCount,Velocity | Select-Object -First 10`);
  wrap("report.queue_aging", "Oldest queued messages (Get-Queue -Include | Get-Message)", `Get-Queue | Select-Object Identity,MessageCount,LastRetryTime | Select-Object -First 10`);
  wrap("report.retry_report", "Messages repeatedly retrying (RetryCount)", `Get-Queue | Where-Object { $_.MessageCount -gt 0 } | Select-Object Identity,MessageCount,Status | Select-Object -First 10`);
  wrap("report.message_size_distribution", "Message size analysis (TotalItemSize)", `Get-MessageTrackingLog -ResultSize 50 | Select-Object TotalBytes | Measure-Object -Property TotalBytes -Average -Maximum | Select-Object Count,Average,Maximum`);
  wrap("report.large_message_report", "Large emails (>10MB)", `Get-MessageTrackingLog -ResultSize 100 | Where-Object { $_.TotalBytes -gt 10MB } | Select-Object Timestamp,Sender,TotalBytes | Select-Object -First 10`);
  wrap("report.attachment_analysis", "Attachment volumes/types (HasAttachments)", `Get-MessageTrackingLog -ResultSize 50 | Where-Object { $_.HasAttachments } | Select-Object MessageSubject,Sender | Select-Object -First 10`);
  wrap("report.mail_flow_by_connector", "Connector traffic (ConnectorId)", `Get-MessageTrackingLog -ResultSize 100 | Group-Object ConnectorId | Select-Object Name,Count | Sort-Object Count -Descending | Select-Object -First 10`);
  wrap("report.send_connector_usage", "Outbound connector usage", `Get-SendConnector | Select-Object Name,AddressSpaces | Select-Object -First 10`);
  wrap("report.receive_connector_usage", "Inbound connector usage", `Get-ReceiveConnector | Select-Object Name,Bindings,PermissionGroups | Select-Object -First 10`);
  wrap("report.smtp_traffic", "SMTP traffic analysis (EventId SEND/RECEIVE)", `Get-MessageTrackingLog -ResultSize 100 | Group-Object EventId | Select-Object Name,Count`);
}
