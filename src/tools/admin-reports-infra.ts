import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PowerShellProvider } from "../clients/powershell-provider.js";

export function registerInfraReports(server: McpServer, ps: PowerShellProvider) {
  server.tool("report.exchange_environment_overview", "Exchange Environment Overview — servers, roles, versions, CUs, DAGs, DBs, connectors (high-level)", {}, async () => {
    const [servers, dags, dbs, send] = await Promise.all([
      ps.invokeJson(`Get-ExchangeServer | Select-Object Name,Fqdn,ServerRole,Edition,AdminDisplayVersion | Select-Object -First 10`).catch(() => []),
      ps.invokeJson(`Get-DatabaseAvailabilityGroup | Select-Object Name,WitnessServer,OperationalServers | Select-Object -First 5`).catch(() => []),
      ps.invokeJson(`Get-MailboxDatabase | Select-Object Name,Server,Mounted,DatabaseSize | Select-Object -First 10`).catch(() => []),
      ps.invokeJson(`Get-SendConnector | Select-Object Name,AddressSpaces | Select-Object -First 5`).catch(() => []),
    ]);
    return { content: [{ type: "text", text: JSON.stringify({ servers, dags, databases: dbs, sendConnectors: send, generatedAt: new Date().toISOString() }, null, 2) }] };
  });

  server.tool("report.exchange_server_inventory", "Exchange Server Inventory — all servers and configuration", {}, async () => {
    const d = await ps.invokeJson(`Get-ExchangeServer | Select-Object Name,Fqdn,ServerRole,Site,Edition,AdminDisplayVersion,ExchangeVersion | Select-Object -First 20`);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("report.exchange_version_and_cu", "Exchange Version & CU Report — server versions and cumulative updates", {}, async () => {
    const d = await ps.invokeJson(`Get-ExchangeServer | Select-Object Name,AdminDisplayVersion,ExchangeVersion | Sort-Object AdminDisplayVersion | Select-Object -First 20`);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("report.exchange_build_compliance", "Build Compliance — compare servers against required CU/security baseline", { requiredCU: z.string().optional().describe("e.g. 15.2.1748.10, default checks for oldest vs newest") }, async ({ requiredCU }) => {
    const servers = await ps.invokeJson(`Get-ExchangeServer | Select-Object Name,AdminDisplayVersion | Select-Object -First 20`);
    const versions = servers.map((s: any) => String(s.AdminDisplayVersion ?? "")).filter(Boolean);
    const unique = [...new Set(versions)];
    const compliant = requiredCU ? servers.map((s: any) => ({ ...s, _compliant: String(s.AdminDisplayVersion).includes(requiredCU!) })) : servers;
    return { content: [{ type: "text", text: JSON.stringify({ requiredCU: requiredCU ?? "(no baseline, showing variance)", uniqueVersions: unique, servers: compliant, note: unique.length > 1 ? "BUILD DRIFT: servers on different CUs" : "All servers same build" }, null, 2) }] };
  });

  server.tool("report.server_role_report", "Server Role Report — Mailbox, Edge, Client Access config", {}, async () => {
    const d = await ps.invokeJson(`Get-ExchangeServer | Select-Object Name,ServerRole,IsMailboxServer,IsClientAccessServer,IsHubTransportServer,IsUnifiedMessagingServer | Select-Object -First 20`);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("report.exchange_topology", "Exchange Topology — servers, sites, DAGs, databases and relationships", {}, async () => {
    const [servers, sites, dags, dbs] = await Promise.all([
      ps.invokeJson(`Get-ExchangeServer | Select-Object Name,Site,ServerRole | Select-Object -First 20`).catch(() => []),
      ps.invokeJson(`Get-AdSite | Select-Object Name,HubSiteEnabled | Select-Object -First 10`).catch(() => []),
      ps.invokeJson(`Get-DatabaseAvailabilityGroup | Select-Object Name,Servers | Select-Object -First 10`).catch(() => []),
      ps.invokeJson(`Get-MailboxDatabase | Select-Object Name,Server,MasterServerOrAvailabilityGroup,EcpUrl | Select-Object -First 10`).catch(() => []),
    ]);
    return { content: [{ type: "text", text: JSON.stringify({ servers, adSites: sites, dags, databases: dbs }, null, 2) }] };
  });

  server.tool("report.exchange_organization_configuration", "Organization-wide Exchange settings (Get-OrganizationConfig)", {}, async () => {
    const d = await ps.invokeJson(`Get-OrganizationConfig | Select-Object Name,ActivityBasedAuthenticationTimeoutInterval,DefaultPublicFolderAgeLimit,HierarchicalAddressBookRoot | Select-Object -First 1`);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("report.ad_site_exchange_mapping", "AD Site / Exchange Mapping — servers mapped to AD sites", {}, async () => {
    const d = await ps.invokeJson(`Get-ExchangeServer | Select-Object Name,Fqdn,Site | Select-Object -First 20`);
    const sites = await ps.invokeJson(`Get-AdSite | Select-Object Name,AssociatedHubSite | Select-Object -First 10`).catch(() => []);
    return { content: [{ type: "text", text: JSON.stringify({ exchangeServersBySite: d, adSites: sites }, null, 2) }] };
  });

  server.tool("report.exchange_server_os", "Windows OS versions/builds (Get-CimInstance Win32_OperatingSystem)", { server: z.string().optional() }, async ({ server }) => {
    const base = `Get-CimInstance Win32_OperatingSystem | Select-Object CSName,Caption,Version,BuildNumber,OSArchitecture,LastBootUpTime`;
    const cmd = server ? `Invoke-Command -ComputerName "${server}" -ScriptBlock { ${base} }` : base;
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("report.exchange_server_hardware", "Hardware — CPU, RAM, disks, NICs (Win32_Processor/PhysicalMemory/LogicalDisk/NetAdapter)", { server: z.string().optional() }, async ({ server }) => {
    const base = `
$cpu = Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed
$ram = Get-CimInstance Win32_PhysicalMemory | Measure-Object -Property Capacity -Sum | Select-Object @{N='TotalRAM_GB';E={[math]::Round($_.Sum/1GB,1)}}
$disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,Size,FreeSpace,FileSystem
$nics = Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object { $_.IPAddress -ne $null } | Select-Object Description,IPAddress -First 3
[PSCustomObject]@{CPU=$cpu; RAM=$ram; Disks=$disks; NICs=$nics} | Select-Object CPU,RAM,Disks,NICs
`;
    const cmd = server ? `Invoke-Command -ComputerName "${server}" -ScriptBlock { ${base} }` : base;
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("report.exchange_virtualization", "VM/physical deployment (Win32_ComputerSystem Model, Hyper-V detection)", { server: z.string().optional() }, async ({ server }) => {
    const base = `Get-CimInstance Win32_ComputerSystem | Select-Object Name,Manufacturer,Model,SystemType,TotalPhysicalMemory; Get-CimInstance Win32_BIOS | Select-Object SerialNumber`;
    const hyperV = `Get-Service vmms -ErrorAction SilentlyContinue | Select-Object Name,Status; Get-CimInstance Win32_BaseBoard | Select-Object Product`;
    const cmd = server ? `Invoke-Command -ComputerName "${server}" -ScriptBlock { ${base}; ${hyperV} }` : `${base}; ${hyperV}`;
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("report.exchange_server_uptime", "Server uptime and reboot history (Win32_OperatingSystem LastBootUpTime + System event 1074)", { server: z.string().optional() }, async ({ server }) => {
    const base = `Get-CimInstance Win32_OperatingSystem | Select-Object CSName,LastBootUpTime,@{N='UptimeDays';E={((Get-Date)-$_.LastBootUpTime).Days}}; Get-WinEvent -FilterHashtable @{LogName='System'; Id=1074} -MaxEvents 5 -ErrorAction SilentlyContinue | Select-Object TimeCreated,Message | Select-Object -First 5`;
    const cmd = server ? `Invoke-Command -ComputerName "${server}" -ScriptBlock { ${base} }` : base;
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("report.exchange_service_status", "Exchange services and states (Get-Service MSExchange*)", { server: z.string().optional() }, async ({ server }) => {
    const base = `Get-Service MSExchange* | Select-Object Name,Status,StartType | Sort-Object Name`;
    const cmd = server ? `Invoke-Command -ComputerName "${server}" -ScriptBlock { ${base} }` : base;
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("report.exchange_dependency", "AD/DNS/certificate/network dependencies", { server: z.string().optional() }, async ({ server }) => {
    const deps = await Promise.all([
      ps.invokeJson(`Get-ExchangeServer | Select-Object -First 1 | Select-Object Name | ForEach-Object { Test-ServiceHealth | Select-Object Server,Role,RequiredServicesRunning | Select-Object -First 5 }`).catch(() => []),
      ps.invokeJson(`Get-ExchangeCertificate | Where-Object { $_.NotAfter -lt (Get-Date).AddDays(30) } | Select-Object Subject,NotAfter,Services | Select-Object -First 5`).catch(() => []),
      ps.invokeJson(`Resolve-DnsName -Name ${server ?? "devex02.devlab2025.local"} -ErrorAction SilentlyContinue | Select-Object Name,IPAddress | Select-Object -First 5`).catch(() => []),
    ]);
    return { content: [{ type: "text", text: JSON.stringify({ serviceHealth: deps[0], expiringCerts: deps[1], dns: deps[2] }, null, 2) }] };
  });

  server.tool("report.exchange_infrastructure_summary", "High-level environment inventory (report.exchange_infrastructure_summary)", {}, async () => {
    const [servers, dbs, dags, certs, queues] = await Promise.all([
      ps.invokeJson(`Get-ExchangeServer | Measure-Object | Select-Object -ExpandProperty Count`).catch(() => 0),
      ps.invokeJson(`Get-MailboxDatabase | Measure-Object | Select-Object -ExpandProperty Count`).catch(() => 0),
      ps.invokeJson(`Get-DatabaseAvailabilityGroup | Measure-Object | Select-Object -ExpandProperty Count`).catch(() => 0),
      ps.invokeJson(`Get-ExchangeCertificate | Measure-Object | Select-Object -ExpandProperty Count`).catch(() => 0),
      ps.invokeJson(`Get-Queue | Measure-Object | Select-Object -ExpandProperty Count`).catch(() => 0),
    ]);
    const summary = {
      totalServers: servers,
      totalDatabases: dbs,
      totalDAGs: dags,
      totalCertificates: certs,
      totalQueues: queues,
      generatedAt: new Date().toISOString(),
      note: "For details use report.exchange_environment_overview, report.exchange_server_inventory, etc.",
    };
    return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
  });
}
