import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PowerShellProvider } from "../clients/powershell-provider.js";

export function registerDatabaseReports(server: McpServer, ps: PowerShellProvider) {
  const wrap = (name: string, desc: string, cmd: string) => (server as any).tool(name, desc, async () => ({ content: [{ type: "text", text: JSON.stringify(await ps.invokeJson(cmd), null, 2) }] }));
  wrap("report.database_inventory", "All mailbox databases", `Get-MailboxDatabase | Select-Object Name,Server,EdbFilePath,LogFolderPath,Mounted | Select-Object -First 20`);
  wrap("report.database_size", "EDB/log sizes (DatabaseSize, AvailableNewMailboxSpace)", `Get-MailboxDatabase | Select-Object Name,DatabaseSize,AvailableNewMailboxSpace | Select-Object -First 20`);
  wrap("report.database_growth", "Historical growth (current size trend)", `Get-MailboxDatabase | Select-Object Name,DatabaseSize,LastFullBackup | Select-Object -First 20`);
  wrap("report.database_growth_forecast", "Projected future size (based on whitespace)", `Get-MailboxDatabase | Select-Object Name,DatabaseSize,AvailableNewMailboxSpace | ForEach-Object { $size=[double]($_.DatabaseSize.ToString().Split('(')[1].Split(' ')[0].Replace(',','')); [PSCustomObject]@{DB=$_.Name; SizeGB=[math]::Round($size/1GB,1)} } | Select-Object -First 10`);
  wrap("report.database_free_space", "Disk capacity (Get-PSDrive / LogicalDisk)", `Get-WmiObject Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,FreeSpace,Size | Select-Object -First 10`);
  wrap("report.database_whitespace", "Internal database whitespace (AvailableNewMailboxSpace)", `Get-MailboxDatabase | Select-Object Name,AvailableNewMailboxSpace | Select-Object -First 20`);
  wrap("report.database_mailbox_distribution", "Mailboxes per DB", `Get-MailboxDatabase | ForEach-Object { [PSCustomObject]@{DB=$_.Name; Count=(Get-Mailbox -Database $_.Name -ResultSize 1000 | Measure-Object).Count} } | Select-Object -First 20`);
  wrap("report.database_health", "Mounted/failed/healthy (Get-MailboxDatabaseCopyStatus)", `Get-MailboxDatabaseCopyStatus | Select-Object Identity,Status,ActiveCopy | Select-Object -First 20`);
  wrap("report.database_copy_health", "DAG copy status (alias)", `Get-MailboxDatabaseCopyStatus | Select-Object Identity,Status,CopyQueueLength,ReplayQueueLength | Select-Object -First 20`);
  wrap("report.content_index_health", "Search indexing (ContentIndexState)", `Get-MailboxDatabaseCopyStatus | Select-Object Identity,ContentIndexState | Select-Object -First 20`);
  wrap("report.database_backup_status", "Last successful backup (LastFullBackup)", `Get-MailboxDatabase | Select-Object Name,LastFullBackup,BackupInProgress | Select-Object -First 20`);
  wrap("report.database_restore_readiness", "Recovery/backup readiness (CircularLoggingEnabled, BackgroundDatabaseMaintenance)", `Get-MailboxDatabase | Select-Object Name,CircularLoggingEnabled,BackgroundDatabaseMaintenance | Select-Object -First 20`);
  wrap("report.transaction_log_report", "Log generation/consumption (Get-ChildItem logs)", `Get-ChildItem "C:\\Program Files\\Microsoft\\Exchange Server\\V15\\Mailbox\\*\*.log" -ErrorAction SilentlyContinue | Measure-Object | Select-Object Count`);
  wrap("report.log_growth_report", "Abnormal log growth (log count trend)", `Get-MailboxDatabase | Select-Object Name,LogFolderPath | Select-Object -First 10`);
  wrap("report.database_io_report", "Disk performance (Get-Counter PhysicalDisk)", `Get-Counter "\\PhysicalDisk(*)\\Avg. Disk sec/Read" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CounterSamples | Select-Object Path,CookedValue | Select-Object -First 10`);
  wrap("report.database_performance", "DB-related performance indicators", `Get-Counter "\\MSExchange Database(*)\I/O Database Reads Average Latency" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CounterSamples | Select-Object -First 5`);
  wrap("report.database_availability", "Historical availability (Mounted vs Dismounted)", `Get-MailboxDatabaseCopyStatus | Group-Object Status | Select-Object Name,Count`);
  wrap("report.database_activation_preference", "DAG activation configuration (ActivationPreference)", `Get-MailboxDatabaseCopyStatus | Select-Object Identity,ActivationPreference | Select-Object -First 20`);
  wrap("report.database_failover_history", "DB activation events (Get-WinEvent System 1074)", `Get-WinEvent -FilterHashtable @{LogName='System'; Id=1074} -MaxEvents 10 -ErrorAction SilentlyContinue | Select-Object TimeCreated,Message | Select-Object -First 10`);
  wrap("report.database_maintenance", "Maintenance configuration/status (BackgroundDatabaseMaintenance, IsExcludedFromProvisioning)", `Get-MailboxDatabase | Select-Object Name,BackgroundDatabaseMaintenance,IsExcludedFromProvisioning,IsExcludedFromProvisioningReason | Select-Object -First 10`);
  wrap("report.database_quota_distribution", "Mailbox quotas by DB (ProhibitSendQuota)", `Get-Mailbox -ResultSize 20 | Select-Object DisplayName,Database,ProhibitSendQuota | Select-Object -First 20`);
  wrap("report.database_utilization", "Capacity utilization (Used vs Free)", `Get-MailboxDatabase | Select-Object Name,DatabaseSize,AvailableNewMailboxSpace | Select-Object -First 10`);
  wrap("report.database_capacity_forecast", "When capacity becomes critical (forecast based on 10% free threshold)", `Get-WmiObject Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,Size,FreeSpace,@{N='DaysUntilFull';E={'N/A'}} | Select-Object -First 10`);
}
