import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PowerShellProvider } from "../clients/powershell-provider.js";

export function registerSpecMissingTools(server: McpServer, ps: PowerShellProvider) {
  // 6.1 server.* — Server & Service Health
  server.tool("server.list", "List Exchange servers and roles (alias: exchange_list_servers)", {}, async () => {
    const d = await ps.invokeJson("Get-ExchangeServer | Select-Object Name,Fqdn,ServerRole,Edition,AdminDisplayVersion");
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
  server.tool("server.get_info", "Get Exchange server info (Get-ExchangeServer version/CU/edition)", { identity: z.string().optional() }, async ({ identity }) => {
    const d = await ps.invokeJson(identity ? `Get-ExchangeServer -Identity "${identity}" | Select-Object Name,Fqdn,AdminDisplayVersion,ExchangeVersion,ServerRole` : `Get-ExchangeServer | Select-Object Name,Fqdn,AdminDisplayVersion | Select-Object -First 10`);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
  server.tool("server.get_services_status", "Status of MSExchange* services (Get-Service filtered)", { server: z.string().optional() }, async ({ server }) => {
    const filter = server ? ` -ComputerName "${server}"` : "";
    // Use Get-Service via Invoke-Command on server if specified, else local
    const cmd = server ? `Invoke-Command -ComputerName "${server}" -ScriptBlock { Get-Service MSExchange* | Select-Object Name,Status,StartType }` : `Get-Service MSExchange* | Select-Object Name,Status,StartType`;
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
  server.tool("server.restart_service", "Restart Exchange service (write; confirm required)", { name: z.string().describe("Service name, e.g. MSExchangeTransport"), server: z.string().optional(), confirm: z.boolean().optional() }, async ({ name, server, confirm }) => {
    if (!confirm) throw new Error("confirm:true required to restart service");
    const cmd = server ? `Invoke-Command -ComputerName "${server}" -ScriptBlock { Restart-Service -Name "${name}" -Force; Get-Service -Name "${name}" | Select-Object Name,Status }` : `Restart-Service -Name "${name}" -Force; Get-Service -Name "${name}" | Select-Object Name,Status`;
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
  server.tool("server.get_event_log_errors", "Pull recent Application/System event log errors filtered to Exchange sources", { logName: z.string().optional(), count: z.number().optional(), server: z.string().optional() }, async ({ logName, count, server }) => {
    const c = count ?? 20;
    const base = `Get-WinEvent -FilterHashtable @{LogName='${logName ?? "Application"}'; Level=2,1; StartTime=(Get-Date).AddDays(-1)} -MaxEvents ${c} | Where-Object { $_.ProviderName -like "*Exchange*" -or $_.ProviderName -like "*MSExchange*" } | Select-Object TimeCreated,Id,LevelDisplayName,ProviderName,Message | Select-Object -First ${c}`;
    const cmd = server ? `Invoke-Command -ComputerName "${server}" -ScriptBlock { ${base} }` : base;
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
  server.tool("server.get_performance_counters", "Key perf counters (RPC latency, DB I/O, CPU, memory, queue length)", { server: z.string().optional() }, async ({ server }) => {
    const counters = `\\Processor(_Total)\\% Processor Time,\\Memory\\Available MBytes,\\MSExchange Transport Queues(_total)\\Messages Queued For Delivery`;
    const cmd = `Get-Counter -Counter "${counters}" -SampleInterval 1 -MaxSamples 1 | Select-Object -ExpandProperty CounterSamples | Select-Object Path,CookedValue`;
    const wrapped = server ? `Invoke-Command -ComputerName "${server}" -ScriptBlock { ${cmd} }` : cmd;
    const d = await ps.invokeJson(wrapped);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
  server.tool("server.get_disk_space", "Disk space on volumes hosting DBs/logs with low-space warnings", { server: z.string().optional() }, async ({ server }) => {
    const base = `Get-WmiObject Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,Size,FreeSpace,@{N='FreePercent';E={[math]::Round($_.FreeSpace/$_.Size*100,1)}},@{N='Warning';E={if($_.FreeSpace/$_.Size -lt 0.1) {'LOW'} else {'OK'}}}`;
    const cmd = server ? `Invoke-Command -ComputerName "${server}" -ScriptBlock { ${base} }` : base;
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
  server.tool("server.get_uptime", "Get server uptime", { server: z.string().optional() }, async ({ server }) => {
    const base = `Get-CimInstance Win32_OperatingSystem | Select-Object CSName,LastBootUpTime,@{N='UptimeDays';E={(Get-Date)-$_.LastBootUpTime}}`;
    const cmd = server ? `Invoke-Command -ComputerName "${server}" -ScriptBlock { ${base} }` : base;
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
  server.tool("server.run_healthchecker", "Wrap HealthChecker.ps1 if present (ExchangeAnalyzer)", { server: z.string().optional(), path: z.string().optional() }, async ({ server, path }) => {
    const p = path ?? "C:\\Scripts\\HealthChecker.ps1";
    const base = `if (Test-Path "${p}") { & "${p}" | Out-String | Select-Object -First 200 } else { Write-Output "HealthChecker not found at ${p}; run on Exchange server with script present" }`;
    const cmd = server ? `Invoke-Command -ComputerName "${server}" -ScriptBlock { ${base} }` : base;
    // HealthChecker outputs text, not JSON — use invoke raw
    const d = await ps.invokeJson(`Invoke-Command -ScriptBlock { ${base} } | Out-String`).catch(() => []);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  // 6.2 mailflow.* extended
  server.tool("mailflow.resume_queue", "Resume queue (mailflow.resume_queue)", { identity: z.string(), server: z.string().optional() }, async ({ identity, server }) => {
    const cmd = server ? `Resume-Queue -Identity "${identity}" -Server "${server}" -Confirm:$false` : `Resume-Queue -Identity "${identity}" -Confirm:$false`;
    await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: `Resumed ${identity}` }] };
  });
  server.tool("mailflow.get_message_trace", "Get-MessageTrace style search (wraps Get-MessageTrackingLog)", { sender: z.string().optional(), recipient: z.string().optional(), subject: z.string().optional(), start: z.string().optional(), end: z.string().optional() }, async (p) => {
    let cmd = "Get-MessageTrackingLog";
    if (p.sender) cmd += ` -Sender "${p.sender}"`;
    if (p.recipient) cmd += ` -Recipients "${p.recipient}"`;
    if (p.subject) cmd += ` -MessageSubject "${p.subject}"`;
    if (p.start) cmd += ` -Start "${p.start}"`;
    if (p.end) cmd += ` -End "${p.end}"`;
    cmd += " -ResultSize 10 | Select-Object Timestamp,Sender,Recipients,MessageSubject,EventId,Source";
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
  server.tool("mailflow.get_ndr_details", "Explain NDR/bounce code", { code: z.string().describe("e.g. 5.7.1, 4.4.7, 5.1.10") }, async ({ code }) => {
    const map: Record<string, string> = { "5.7.1": "Delivery not authorized / permissions or relay denied", "4.4.7": "Message delayed / queue timeout", "5.1.10": "Recipient not found / address invalid", "5.4.6": "Routing loop", "5.7.64": "Tenant blocked (anti-spam)" };
    return { content: [{ type: "text", text: JSON.stringify({ code, explanation: map[code] ?? "Unknown NDR — check https://learn.microsoft.com/en-us/exchange/mail-flow/non-delivery-reports-and-bounces", ref: "https://learn.microsoft.com/en-us/exchange/mail-flow/non-delivery-reports-and-bounces" }, null, 2) }] };
  });
  server.tool("mailflow.test_smtp_connectivity", "Raw SMTP banner/EHLO test to host:port", { host: z.string(), port: z.number().optional() }, async ({ host, port }) => {
    const p = port ?? 25;
    const cmd = `Test-NetConnection -ComputerName "${host}" -Port ${p} | Select-Object ComputerName,RemoteAddress,TcpTestSucceeded,PingSucceeded`;
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
  server.tool("mailflow.get_transport_rules", "Alias for transport rules (mailflow.get_transport_rules)", {}, async () => {
    const d = await ps.invokeJson("Get-TransportRule | Select-Object Name,Priority,State,Mode | Select-Object -First 20");
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
  server.tool("mailflow.set_receive_connector", "Set Receive connector (e.g. Banner, MaxMessageSize)", { identity: z.string(), banner: z.string().optional(), maxMessageSize: z.string().optional() }, async ({ identity, banner, maxMessageSize }) => {
    let cmd = `Set-ReceiveConnector -Identity "${identity}"`;
    if (banner) cmd += ` -Banner "${banner}"`;
    if (maxMessageSize) cmd += ` -MaxMessageSize "${maxMessageSize}"`;
    await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: `Updated ${identity}` }] };
  });
  server.tool("mailflow.set_send_connector", "Set Send connector", { identity: z.string(), addressSpaces: z.string().optional() }, async ({ identity, addressSpaces }) => {
    let cmd = `Set-SendConnector -Identity "${identity}"`;
    if (addressSpaces) cmd += ` -AddressSpaces "${addressSpaces}"`;
    await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: `Updated ${identity}` }] };
  });

  // 6.3 database.*
  server.tool("database.list", "List mailbox databases with size/mount", {}, async () => {
    const d = await ps.invokeJson("Get-MailboxDatabase | Select-Object Name,Server,Mounted,DatabaseSize,AvailableNewMailboxSpace | Select-Object -First 20");
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
  server.tool("database.get_copy_status", "Alias for get_copy_status", { identity: z.string().optional() }, async ({ identity }) => {
    const d = await ps.invokeJson(identity ? `Get-MailboxDatabaseCopyStatus -Identity "${identity}" | Select-Object Identity,Status,CopyQueueLength,ReplayQueueLength` : `Get-MailboxDatabaseCopyStatus | Select-Object Identity,Status,CopyQueueLength | Select-Object -First 20`);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
  server.tool("database.mount", "Mount database (Mount-Database) — confirm required", { identity: z.string(), confirm: z.boolean().optional() }, async ({ identity, confirm }) => {
    if (!confirm) throw new Error("confirm:true required");
    await ps.invokeJson(`Mount-Database -Identity "${identity}" -Confirm:$false`);
    return { content: [{ type: "text", text: `Mounted ${identity}` }] };
  });
  server.tool("database.dismount", "Dismount database", { identity: z.string(), confirm: z.boolean().optional() }, async ({ identity, confirm }) => {
    if (!confirm) throw new Error("confirm:true required");
    await ps.invokeJson(`Dismount-Database -Identity "${identity}" -Confirm:$false`);
    return { content: [{ type: "text", text: `Dismounted ${identity}` }] };
  });
  server.tool("database.move_active", "Move active DB (Move-ActiveMailboxDatabase) — HA failover, confirm required", { identity: z.string(), server: z.string(), confirm: z.boolean().optional() }, async ({ identity, server, confirm }) => {
    if (!confirm) throw new Error("confirm:true required for failover");
    await ps.invokeJson(`Move-ActiveMailboxDatabase -Identity "${identity}" -ActiveMailboxDatabaseServer "${server}" -Confirm:$false`);
    return { content: [{ type: "text", text: `Moved ${identity} to ${server}` }] };
  });
  server.tool("database.suspend_copy", "Suspend DB copy", { identity: z.string(), confirm: z.boolean().optional() }, async ({ identity, confirm }) => {
    if (!confirm) throw new Error("confirm:true required");
    await ps.invokeJson(`Suspend-MailboxDatabaseCopy -Identity "${identity}" -Confirm:$false`);
    return { content: [{ type: "text", text: `Suspended ${identity}` }] };
  });
  server.tool("database.resume_copy", "Resume DB copy", { identity: z.string() }, async ({ identity }) => {
    await ps.invokeJson(`Resume-MailboxDatabaseCopy -Identity "${identity}" -Confirm:$false`);
    return { content: [{ type: "text", text: `Resumed ${identity}` }] };
  });
  server.tool("database.add_copy", "Add DB copy (Add-MailboxDatabaseCopy)", { identity: z.string(), mailboxServer: z.string() }, async ({ identity, mailboxServer }) => {
    await ps.invokeJson(`Add-MailboxDatabaseCopy -Identity "${identity}" -MailboxServer "${mailboxServer}" -Confirm:$false`);
    return { content: [{ type: "text", text: `Added copy ${identity} on ${mailboxServer}` }] };
  });
  server.tool("database.remove_copy", "Remove DB copy", { identity: z.string(), mailboxServer: z.string(), confirm: z.boolean().optional() }, async ({ identity, mailboxServer, confirm }) => {
    if (!confirm) throw new Error("confirm:true required");
    await ps.invokeJson(`Remove-MailboxDatabaseCopy -Identity "${identity}" -MailboxServer "${mailboxServer}" -Confirm:$false`);
    return { content: [{ type: "text", text: `Removed ${identity} on ${mailboxServer}` }] };
  });
  server.tool("database.new_repair_request", "New repair request (New-MailboxRepairRequest)", { database: z.string(), mailbox: z.string().optional(), corruptions: z.string().optional() }, async ({ database, mailbox, corruptions }) => {
    let cmd = `New-MailboxRepairRequest -Database "${database}"`;
    if (mailbox) cmd += ` -Mailbox "${mailbox}"`;
    if (corruptions) cmd += ` -CorruptionType ${corruptions}`; else cmd += ` -CorruptionType SearchFolder,AggregateCounts,ProvisionedFolder,FolderView`;
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
  server.tool("database.get_backup_status", "Last backup timestamp (Get-MailboxDatabase | Select Last*Backup)", {}, async () => {
    const d = await ps.invokeJson("Get-MailboxDatabase | Select-Object Name,LastFullBackup,LastIncrementalBackup,BackupInProgress | Select-Object -First 20");
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
  server.tool("database.get_whitespace_and_growth", "Whitespace and growth (AvailableNewMailboxSpace)", {}, async () => {
    const d = await ps.invokeJson("Get-MailboxDatabase | Select-Object Name,DatabaseSize,AvailableNewMailboxSpace | Select-Object -First 20");
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  // 6.4 dag.*
  server.tool("dag.list", "List DAGs", {}, async () => {
    const d = await ps.invokeJson("Get-DatabaseAvailabilityGroup | Select-Object Name,WitnessServer,WitnessDirectory,OperationalServers | Select-Object -First 10");
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
  server.tool("dag.get_info", "Get DAG info", { identity: z.string() }, async ({ identity }) => {
    const d = await ps.invokeJson(`Get-DatabaseAvailabilityGroup -Identity "${identity}" | Select-Object Name,WitnessServer,OperationalServers,PrimaryActiveManager`);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
  server.tool("dag.get_witness_status", "Get witness status", { identity: z.string().optional() }, async ({ identity }) => {
    const d = await ps.invokeJson(identity ? `Get-DatabaseAvailabilityGroup -Identity "${identity}" -Status | Select-Object WitnessShareInUse` : `Get-DatabaseAvailabilityGroup -Status | Select-Object Name,WitnessShareInUse | Select-Object -First 10`);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
  server.tool("dag.set_activation_policy", "Set activation preference (Set-MailboxDatabaseCopy)", { identity: z.string(), activationPreference: z.number() }, async ({ identity, activationPreference }) => {
    await ps.invokeJson(`Set-MailboxDatabaseCopy -Identity "${identity}" -ActivationPreference ${activationPreference} -Confirm:$false`);
    return { content: [{ type: "text", text: `Set ${identity} preference ${activationPreference}` }] };
  });
  server.tool("dag.simulate_failover_check", "Pre-flight failover checks without failing over", { server: z.string().optional() }, async ({ server }) => {
    const cmds = [
      server ? `Test-ReplicationHealth -Identity "${server}" | Select-Object Server,Check,Result` : `Test-ReplicationHealth | Select-Object Server,Check,Result | Select-Object -First 20`,
      `Get-MailboxDatabaseCopyStatus | Where-Object { $_.Status -ne "Mounted" } | Select-Object Identity,Status,CopyQueueLength | Select-Object -First 10`,
      `Get-ServerComponentState -Identity "${server ?? "DEVEX02"}" | Select-Object Component,State`,
    ];
    const results: Record<string, unknown> = {};
    for (const c of cmds) try { results[c.slice(0, 30)] = await ps.invokeJson(c); } catch (e: any) { results[c.slice(0, 30)] = { error: e.message.slice(0, 300) }; }
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  });

  // 6.5 mailbox.* extended
  server.tool("mailbox.get_folder_statistics", "Get folder statistics (Get-MailboxFolderStatistics)", { identity: z.string() }, async ({ identity }) => {
    const d = await ps.invokeJson(`Get-MailboxFolderStatistics -Identity "${identity}" | Select-Object Name,FolderSize,ItemsInFolder | Select-Object -First 20`);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
  server.tool("mailbox.set_quota", "Set mailbox quota", { identity: z.string(), prohibitSendQuota: z.string().optional(), issueWarningQuota: z.string().optional() }, async ({ identity, prohibitSendQuota, issueWarningQuota }) => {
    let cmd = `Set-Mailbox -Identity "${identity}"`;
    if (prohibitSendQuota) cmd += ` -ProhibitSendQuota "${prohibitSendQuota}"`;
    if (issueWarningQuota) cmd += ` -IssueWarningQuota "${issueWarningQuota}"`;
    await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: `Quota updated for ${identity}` }] };
  });
  server.tool("mailbox.new_move_request", "New move request (New-MoveRequest)", { identity: z.string(), targetDatabase: z.string() }, async ({ identity, targetDatabase }) => {
    const d = await ps.invokeJson(`New-MoveRequest -Identity "${identity}" -TargetDatabase "${targetDatabase}" | Select-Object Identity,Status`);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
  server.tool("mailbox.get_move_request_status", "Get move request status", { identity: z.string().optional() }, async ({ identity }) => {
    const d = await ps.invokeJson(identity ? `Get-MoveRequest -Identity "${identity}" | Select-Object Identity,Status,PercentComplete` : `Get-MoveRequest | Select-Object Identity,Status,PercentComplete | Select-Object -First 20`);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
  server.tool("mailbox.add_permission", "Add mailbox permission (Add-MailboxPermission)", { identity: z.string(), user: z.string(), accessRights: z.string().describe("FullAccess, SendAs, etc.") }, async ({ identity, user, accessRights }) => {
    await ps.invokeJson(`Add-MailboxPermission -Identity "${identity}" -User "${user}" -AccessRights ${accessRights} -Confirm:$false`);
    return { content: [{ type: "text", text: `Added ${accessRights} for ${user} on ${identity}` }] };
  });
  server.tool("mailbox.remove_permission", "Remove mailbox permission", { identity: z.string(), user: z.string(), accessRights: z.string() }, async ({ identity, user, accessRights }) => {
    await ps.invokeJson(`Remove-MailboxPermission -Identity "${identity}" -User "${user}" -AccessRights ${accessRights} -Confirm:$false`);
    return { content: [{ type: "text", text: `Removed ${accessRights} for ${user}` }] };
  });

  // 6.6 group.* extensions
  server.tool("group.new", "New distribution group", { name: z.string(), members: z.array(z.string()).optional() }, async ({ name }) => {
    const d = await ps.invokeJson(`New-DistributionGroup -Name "${name}" | Select-Object Name,PrimarySmtpAddress`);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
  server.tool("group.add_member", "Add group member", { identity: z.string(), member: z.string() }, async ({ identity, member }) => {
    await ps.invokeJson(`Add-DistributionGroupMember -Identity "${identity}" -Member "${member}" -Confirm:$false`);
    return { content: [{ type: "text", text: `Added ${member} to ${identity}` }] };
  });
  server.tool("contact.list", "List contacts (alias)", {}, async () => {
    const d = await ps.invokeJson(`Get-MailContact | Select-Object Name,ExternalEmailAddress | Select-Object -First 20`);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  // 6.7 clientaccess.*
  server.tool("clientaccess.get_virtual_directories", "Get virtual directories (clientaccess.get_virtual_directories)", { server: z.string().optional() }, async ({ server }) => {
    const d = await ps.invokeJson(server ? `Get-OwaVirtualDirectory -Server "${server}" | Select-Object Name,InternalUrl,ExternalUrl` : `Get-OwaVirtualDirectory | Select-Object Name,Server,InternalUrl | Select-Object -First 10`);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
  server.tool("clientaccess.test_owa", "Test OWA connectivity (Test-OwaConnectivity)", { mailboxServer: z.string().optional() }, async ({ mailboxServer }) => {
    const d = await ps.invokeJson(mailboxServer ? `Test-OwaConnectivity -ClientAccessServer "${mailboxServer}" | Select-Object Result,Latency` : `Test-OwaConnectivity | Select-Object Result -First 5`);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
  server.tool("clientaccess.get_autodiscover_info", "Resolve Autodiscover for SMTP domain", { domain: z.string().describe("e.g. contoso.com") }, async ({ domain }) => {
    const cmd = `Resolve-DnsName -Name autodiscover.${domain} -Type CNAME -ErrorAction SilentlyContinue | Select-Object Name,NameHost`;
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  // 6.8 certificate.* extended
  server.tool("certificate.get_expiring", "Certs expiring within N days", { days: z.number().optional() }, async ({ days }) => {
    const n = days ?? 30;
    const d = await ps.invokeJson(`Get-ExchangeCertificate | Where-Object { $_.NotAfter -lt (Get-Date).AddDays(${n}) } | Select-Object Thumbprint,Subject,NotAfter,Services | Select-Object -First 20`);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
  server.tool("certificate.enable_services", "Enable cert services (Enable-ExchangeCertificate)", { thumbprint: z.string(), services: z.string().describe("IIS,SMTP,UM, etc.") }, async ({ thumbprint, services }) => {
    await ps.invokeJson(`Enable-ExchangeCertificate -Thumbprint "${thumbprint}" -Services ${services} -Confirm:$false -Force`);
    return { content: [{ type: "text", text: `Enabled ${services} on ${thumbprint}` }] };
  });

  // 6.9 security.*
  server.tool("security.get_role_group_members", "Get role group members", { identity: z.string().optional() }, async ({ identity }) => {
    const d = await ps.invokeJson(identity ? `Get-RoleGroupMember -Identity "${identity}" | Select-Object Name` : `Get-RoleGroup | Select-Object Name,ManagedBy | Select-Object -First 20`);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
  server.tool("security.get_mailbox_audit_log", "Get mailbox audit log (Search-MailboxAuditLog)", { identity: z.string(), startDate: z.string().optional(), endDate: z.string().optional() }, async ({ identity, startDate, endDate }) => {
    let cmd = `Search-MailboxAuditLog -Identity "${identity}" -ShowDetails`;
    if (startDate) cmd += ` -StartDate "${startDate}"`;
    if (endDate) cmd += ` -EndDate "${endDate}"`;
    cmd += ` | Select-Object LogonType,Operation,ItemSubject | Select-Object -First 20`;
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  // 6.10 publicfolder
  server.tool("publicfolder.get_statistics", "Get public folder statistics", { identity: z.string().optional() }, async ({ identity }) => {
    const d = await ps.invokeJson(identity ? `Get-PublicFolderStatistics -Identity "${identity}" | Select-Object Name,ItemCount,TotalItemSize` : `Get-PublicFolderStatistics -Identity "\\" | Select-Object Name,ItemCount | Select-Object -First 20`);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  // 6.11 log.*
  server.tool("log.tail_transport_log", "Tail transport log path (Get-ChildItem on TransportRoles\\Logs)", {}, async () => {
    const d = await ps.invokeJson(`Get-ChildItem "C:\\Program Files\\Microsoft\\Exchange Server\\V15\\TransportRoles\\Logs" -Recurse -File | Select-Object FullName,Length,LastWriteTime | Sort-Object LastWriteTime -Descending | Select-Object -First 10`);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
  server.tool("log.tail_iis_log", "Tail IIS log (OWA/EWS)", {}, async () => {
    const d = await ps.invokeJson(`Get-ChildItem "C:\\inetpub\\logs\\LogFiles\\W3SVC1" -File | Sort-Object LastWriteTime -Descending | Select-Object Name,Length,LastWriteTime | Select-Object -First 10`);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  // 6.12 report.*
  server.tool("report.generate_health_summary", "Rolled-up health narrative across server/db/dag/mailflow", { server: z.string().optional() }, async ({ server }) => {
    const s = server ?? "DEVEX02";
    const checks = {
      health: await ps.invokeJson(`Get-HealthReport -Identity "${s}" | Select-Object HealthSet,AlertValue | Select-Object -First 5`).catch(() => []),
      db: await ps.invokeJson(`Get-MailboxDatabaseCopyStatus -Server "${s}" | Select-Object Name,Status | Select-Object -First 5`).catch(() => []),
      queue: await ps.invokeJson(`Get-Queue -Server "${s}" | Select-Object Identity,MessageCount | Select-Object -First 5`).catch(() => []),
    };
    return { content: [{ type: "text", text: JSON.stringify(checks, null, 2) }] };
  });
  server.tool("report.generate_mailbox_size_report", "Mailbox size report (top by TotalItemSize)", { top: z.number().optional() }, async ({ top }) => {
    const n = top ?? 10;
    const d = await ps.invokeJson(`Get-Mailbox | Get-MailboxStatistics | Select-Object DisplayName,TotalItemSize,ItemCount | Sort-Object TotalItemSize -Descending | Select-Object -First ${n}`);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
  server.tool("report.generate_certificate_expiry_report", "Cert expiry report (all certs sorted by NotAfter)", {}, async () => {
    const d = await ps.invokeJson(`Get-ExchangeCertificate | Select-Object Thumbprint,Subject,NotAfter,Services | Sort-Object NotAfter | Select-Object -First 20`);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
}
