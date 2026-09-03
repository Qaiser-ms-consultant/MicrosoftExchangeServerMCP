import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PowerShellProvider } from "../clients/powershell-provider.js";

export function registerRemainingReports(server: McpServer, ps: PowerShellProvider) {
  const wrap = (name: string, desc: string, cmd: string) => (server as any).tool(name, desc, async () => ({ content: [{ type: "text", text: JSON.stringify(await ps.invokeJson(cmd), null, 2) }] }));

  // Connector reports
  wrap("report.send_connector_inventory", "All send connectors", `Get-SendConnector | Select-Object Name,AddressSpaces,SourceTransportServers | Select-Object -First 20`);
  wrap("report.receive_connector_inventory", "All receive connectors", `Get-ReceiveConnector | Select-Object Name,Server,Bindings | Select-Object -First 20`);
  wrap("report.connector_configuration", "Detailed connector settings", `Get-SendConnector | Select-Object Name,Enabled,RequireTLS | Select-Object -First 10`);
  wrap("report.connector_permission_report", "Who/what can use connectors", `Get-ReceiveConnector | Select-Object Name,PermissionGroups | Select-Object -First 10`);
  wrap("report.anonymous_relay_report", "Anonymous relay configuration (PermissionGroups AnonymousUsers)", `Get-ReceiveConnector | Where-Object { $_.PermissionGroups -like "*AnonymousUsers*" } | Select-Object Name,RemoteIPRanges | Select-Object -First 10`);
  wrap("report.open_relay_risk_report", "Potential relay risks (anonymous + External relays)", `Get-ReceiveConnector | Where-Object { $_.PermissionGroups -match "Anonymous" } | Select-Object Name,Bindings | Select-Object -First 10`);
  wrap("report.connector_usage", "Traffic through connectors (MessageTracking)", `Get-MessageTrackingLog -ResultSize 50 | Group-Object ConnectorId | Select-Object Name,Count -First 10`);
  wrap("report.connector_error_report", "Connector failures (FAIL)", `Get-MessageTrackingLog -ResultSize 50 -EventId FAIL | Select-Object ConnectorId,Recipients | Select-Object -First 10`);
  wrap("report.connector_certificate_usage", "TLS certificates per connector", `Get-ExchangeCertificate | Where-Object { $_.Services -like "*SMTP*" } | Select-Object Subject,Services,NotAfter | Select-Object -First 10`);
  wrap("report.smtp_authentication", "Authenticated SMTP usage (Auth)", `Get-MessageTrackingLog -ResultSize 50 | Where-Object { $_.ConnectorId -like "*Client*" } | Select-Object Sender | Select-Object -First 10`);
  wrap("report.connector_ip_restrictions", "Allowed/blocked IPs (RemoteIPRanges)", `Get-ReceiveConnector | Select-Object Name,RemoteIPRanges | Select-Object -First 10`);
  wrap("report.connector_configuration_comparison", "Compare connectors (diff)", `Get-SendConnector | Select-Object Name,Enabled | Sort-Object Name | Select-Object -First 10`);
  wrap("report.connector_drift", "Configuration changes (AdminAuditLog)", `Search-AdminAuditLog -ResultSize 20 | Where-Object { $_.CmdletName -like "*Connector*" } | Select-Object ObjectModified,CmdletName | Select-Object -First 10`);

  // Security
  wrap("report.exchange_security_overview", "Overall security posture (certs + auth + external access)", `Get-ExchangeCertificate | Measure-Object | Select-Object Count; Get-OrganizationConfig | Select-Object Name | Out-Null; Write-Output "See cert/auth reports"`);
  wrap("report.authentication_configuration", "Authentication methods (Get-OrganizationConfig, virtual dirs)", `Get-PowerShellVirtualDirectory | Select-Object Name,BasicAuthentication,WindowsAuthentication | Select-Object -First 5`);
  wrap("report.tls_configuration", "TLS settings (Get-TransportConfig TLS)", `Get-TransportConfig | Select-Object TLSReceiveDomainSecureList,TLSSendDomainSecureList | Select-Object -First 1`);
  wrap("report.certificate_inventory", "Certificates (Get-ExchangeCertificate)", `Get-ExchangeCertificate | Select-Object Subject,NotAfter,Services | Select-Object -First 20`);
  wrap("report.certificate_expiry", "Expiring certificates (30 days)", `Get-ExchangeCertificate | Where-Object { $_.NotAfter -lt (Get-Date).AddDays(30) } | Select-Object Subject,NotAfter | Select-Object -First 20`);
  wrap("report.certificate_service_mapping", "Certificate → Exchange service", `Get-ExchangeCertificate | Select-Object Thumbprint,Services,Subject | Select-Object -First 20`);
  wrap("report.external_access", "Internet-facing services (ExternalUrl)", `Get-OwaVirtualDirectory | Select-Object Name,ExternalUrl | Select-Object -First 10`);
  wrap("report.owa_exposure", "OWA configuration", `Get-OwaVirtualDirectory | Select-Object Name,ExternalUrl,InternalUrl | Select-Object -First 10`);
  wrap("report.ecp_exposure", "ECP configuration", `Get-EcpVirtualDirectory | Select-Object Name,ExternalUrl | Select-Object -First 10`);
  wrap("report.ews_exposure", "EWS configuration", `Get-WebServicesVirtualDirectory | Select-Object Name,ExternalUrl | Select-Object -First 10`);
  wrap("report.activesync_exposure", "ActiveSync", `Get-ActiveSyncVirtualDirectory | Select-Object Name,ExternalUrl | Select-Object -First 10`);
  wrap("report.pop_imap_exposure", "Legacy protocols (POP/IMAP)", `Get-PopSettings | Select-Object Name,UnencryptedOrTLSBindings; Get-ImapSettings | Select-Object Name`);
  wrap("report.smtp_auth_usage", "SMTP AUTH users (Client Submit)", `Get-MessageTrackingLog -ResultSize 50 | Where-Object { $_.ConnectorId -like "*Client*" } | Select-Object Sender -First 10`);
  wrap("report.external_forwarding", "External forwarding (ForwardingSmtpAddress)", `Get-Mailbox -ResultSize 20 | Where-Object { $_.ForwardingSmtpAddress -ne $null } | Select-Object DisplayName,ForwardingSmtpAddress | Select-Object -First 20`);
  wrap("report.full_access_permissions", "Full Access assignments", `Get-Mailbox -ResultSize 10 | ForEach-Object { Get-MailboxPermission -Identity $_.Identity | Where-Object { $_.AccessRights -like "*FullAccess*" } | Select-Object Identity,User } | Select-Object -First 20`);
  wrap("report.send_as_permissions", "Send As", `Get-RecipientPermission -Trustee "NT AUTHORITY\\SELF" -ErrorAction SilentlyContinue | Select-Object Identity,Trustee -First 10`);
  wrap("report.send_on_behalf", "Send on Behalf (GrantSendOnBehalfTo)", `Get-Mailbox -ResultSize 20 | Where-Object { $_.GrantSendOnBehalfTo -ne $null } | Select-Object DisplayName,GrantSendOnBehalfTo | Select-Object -First 20`);
  wrap("report.admin_role_membership", "Exchange RBAC (Get-RoleGroup)", `Get-RoleGroup | Select-Object Name,Members | Select-Object -First 20`);
  wrap("report.privileged_users", "High-privilege accounts (Organization Management)", `Get-RoleGroupMember -Identity "Organization Management" | Select-Object Name | Select-Object -First 20`);
  wrap("report.transport_rule_security", "Risky transport rules (Block/Redirect)", `Get-TransportRule | Where-Object { $_.Actions -like "*Reject*" } | Select-Object Name,Priority | Select-Object -First 10`);
  wrap("report.receive_connector_security", "Relay/authentication (ReceiveConnector)", `Get-ReceiveConnector | Select-Object Name,AuthMechanism,PermissionGroups | Select-Object -First 10`);
  wrap("report.anonymous_access", "Anonymous configuration", `Get-ReceiveConnector | Where-Object { $_.PermissionGroups -match "Anonymous" } | Select-Object Name | Select-Object -First 10`);
  wrap("report.legacy_protocol_usage", "POP/IMAP/basic auth-type exposure (Get-CASMailbox)", `Get-CASMailbox -ResultSize 20 | Where-Object { $_.PopEnabled -or $_.ImapEnabled } | Select-Object Identity,PopEnabled,ImapEnabled | Select-Object -First 20`);
  wrap("report.suspicious_mailbox_activity", "Unusual activity (audit)", `Search-MailboxAuditLog -Identity devlabadmin@devlab2025.local -ShowDetails -ResultSize 10 | Select-Object Operation,LogonType | Select-Object -First 10`);
  wrap("report.mass_sending", "Potential compromised account (top senders)", `Get-MessageTrackingLog -ResultSize 200 -Start (Get-Date).AddHours(-1) | Group-Object Sender | Sort-Object Count -Descending | Select-Object Name,Count -First 10`);
  wrap("report.account_compromise_indicators", "Behavioral indicators (multiple NDR + mass send)", `Get-MessageTrackingLog -ResultSize 100 -EventId FAIL | Group-Object Sender | Sort-Object Count -Descending | Select-Object Name,Count -First 10`);

  // Transport Rule reports
  wrap("report.transport_rule_inventory", "Transport Rule Inventory", `Get-TransportRule | Select-Object Name,Priority,State | Select-Object -First 20`);
  wrap("report.rule_priority", "Rule Priority", `Get-TransportRule | Sort-Object Priority | Select-Object Name,Priority | Select-Object -First 20`);
  wrap("report.rule_action_analysis", "Rule Action Analysis", `Get-TransportRule | Select-Object Name,Actions | Select-Object -First 10`);
  wrap("report.rule_condition_analysis", "Rule Condition Analysis", `Get-TransportRule | Select-Object Name,Conditions | Select-Object -First 10`);
  wrap("report.rules_blocking_messages", "Rules Blocking Messages (Reject)", `Get-TransportRule | Where-Object { $_.Actions -match "Reject" } | Select-Object Name | Select-Object -First 10`);
  wrap("report.rules_redirecting_messages", "Rules Redirecting", `Get-TransportRule | Where-Object { $_.Actions -match "Redirect" } | Select-Object Name | Select-Object -First 10`);
  wrap("report.rules_modifying_messages", "Rules Modifying", `Get-TransportRule | Where-Object { $_.Actions -match "ApplyHtmlDisclaimer" } | Select-Object Name | Select-Object -First 10`);
  wrap("report.rules_adding_disclaimers", "Rules Adding Disclaimers", `Get-TransportRule | Where-Object { $_.Actions -match "Disclaimer" } | Select-Object Name | Select-Object -First 10`);
  wrap("report.rules_with_external_recipients", "Rules with External Recipients", `Get-TransportRule | Where-Object { $_.SentToScope -eq "NotInOrganization" } | Select-Object Name | Select-Object -First 10`);
  wrap("report.rules_with_exceptions", "Rules with Exceptions", `Get-TransportRule | Where-Object { $_.Exceptions } | Select-Object Name | Select-Object -First 10`);
  wrap("report.disabled_rules", "Disabled Rules", `Get-TransportRule | Where-Object { $_.State -eq "Disabled" } | Select-Object Name | Select-Object -First 10`);
  wrap("report.duplicate_rules", "Duplicate Rules (same name/priority)", `Get-TransportRule | Group-Object Priority | Where-Object { $_.Count -gt 1 } | Select-Object Name,Count`);
  wrap("report.conflicting_rules", "Conflicting Rules", `Get-TransportRule | Select-Object Name,Priority,State | Select-Object -First 20`);
  wrap("report.rule_complexity", "Rule Complexity (conditions count)", `Get-TransportRule | Select-Object Name,@{N='ConditionCount';E={($_.Conditions | Measure-Object).Count}} | Sort-Object ConditionCount -Descending | Select-Object -First 10`);
  wrap("report.rule_configuration_drift", "Configuration Drift (AdminAuditLog for rules)", `Search-AdminAuditLog -ResultSize 20 | Where-Object { $_.CmdletName -like "*TransportRule*" } | Select-Object ObjectModified,Caller | Select-Object -First 10`);
  wrap("report.recently_modified_rules", "Recently Modified", `Get-TransportRule | Sort-Object WhenChanged -Descending | Select-Object Name,WhenChanged | Select-Object -First 10`);
  wrap("report.potentially_dangerous_rules", "Potentially Dangerous (External forward + Delete)", `Get-TransportRule | Where-Object { $_.Actions -match "Redirect" -and $_.SentToScope -eq "NotInOrganization" } | Select-Object Name | Select-Object -First 10`);

  // Permission reports
  wrap("report.mailbox_full_access", "Mailbox Full Access (Get-MailboxPermission)", `Get-Mailbox -ResultSize 10 | ForEach-Object { Get-MailboxPermission -Identity $_.Identity | Where-Object { $_.AccessRights -eq "FullAccess" } | Select-Object Identity,User } | Select-Object -First 20`);
  wrap("report.send_as", "Send As (Get-RecipientPermission)", `Get-Mailbox -ResultSize 10 | ForEach-Object { Get-RecipientPermission -Identity $_.Identity | Where-Object { $_.Trustee -ne "NT AUTHORITY\\SELF" } | Select-Object Identity,Trustee } | Select-Object -First 20`);
  wrap("report.send_on_behalf", "Send on Behalf", `Get-Mailbox -ResultSize 20 | Where-Object { $_.GrantSendOnBehalfTo } | Select-Object DisplayName,GrantSendOnBehalfTo | Select-Object -First 20`);
  wrap("report.calendar_permissions", "Calendar Permissions (Get-MailboxFolderPermission)", `Get-Mailbox -ResultSize 5 | ForEach-Object { Get-MailboxFolderPermission -Identity "$($_.Identity):\\Calendar" -ErrorAction SilentlyContinue | Select-Object Identity,User,AccessRights } | Select-Object -First 20`);
  wrap("report.folder_permissions", "Folder Permissions", `Get-MailboxFolderPermission -Identity "devlabadmin@devlab2025.local:\\Inbox" -ErrorAction SilentlyContinue | Select-Object User,AccessRights | Select-Object -First 10`);
  wrap("report.shared_mailbox_delegates", "Shared Mailbox Delegates", `Get-Mailbox -RecipientTypeDetails SharedMailbox -ResultSize 10 | ForEach-Object { Get-MailboxPermission -Identity $_.Identity | Select-Object Identity,User } | Select-Object -First 20`);
  wrap("report.resource_delegates", "Resource Delegates (Room)", `Get-Mailbox -RecipientTypeDetails RoomMailbox -ResultSize 10 | ForEach-Object { Get-CalendarProcessing -Identity $_.Identity | Select-Object Identity,ResourceDelegates } | Select-Object -First 10`);
  wrap("report.distribution_group_ownership", "Distribution Group Ownership (ManagedBy)", `Get-DistributionGroup -ResultSize 20 | Select-Object Name,ManagedBy | Select-Object -First 20`);
  wrap("report.distribution_group_membership", "Distribution Group Membership", `Get-DistributionGroup -ResultSize 5 | ForEach-Object { Get-DistributionGroupMember -Identity $_.Identity | Select-Object Name | Select-Object -First 5 } | Select-Object -First 20`);
  wrap("report.dynamic_distribution_groups", "Dynamic Distribution Groups", `Get-DynamicDistributionGroup -ResultSize 20 | Select-Object Name,RecipientFilter | Select-Object -First 20`);
  wrap("report.mailbox_delegation_changes", "Delegation Changes (AdminAuditLog)", `Search-AdminAuditLog -ResultSize 20 | Where-Object { $_.CmdletName -like "*Permission*" } | Select-Object ObjectModified,Caller | Select-Object -First 10`);
  wrap("report.excessive_permissions", "Excessive Permissions (>3 delegates)", `Get-Mailbox -ResultSize 20 | ForEach-Object { $c=(Get-MailboxPermission -Identity $_.Identity | Measure-Object).Count; [PSCustomObject]@{Mailbox=$_.DisplayName; Count=$c} } | Where-Object { $_.Count -gt 3 } | Select-Object -First 10`);
  wrap("report.external_delegation", "External Delegation (User outside org)", `Get-Mailbox -ResultSize 20 | ForEach-Object { Get-MailboxPermission -Identity $_.Identity | Where-Object { $_.User -like "*@*" -and $_.User -notlike "*contoso*" } | Select-Object Identity,User } | Select-Object -First 20`);
  wrap("report.admin_rbac_roles", "Admin RBAC Roles (Get-ManagementRole)", `Get-ManagementRole | Select-Object Name,RoleType | Select-Object -First 20`);
  wrap("report.custom_rbac_roles", "Custom RBAC Roles", `Get-ManagementRole | Where-Object { $_.IsEndUserRole -eq $false } | Select-Object Name | Select-Object -First 20`);
  wrap("report.role_group_membership", "Role Group Membership (Get-RoleGroupMember)", `Get-RoleGroup -ResultSize 20 | ForEach-Object { Get-RoleGroupMember -Identity $_.Identity | Select-Object Name | Select-Object -First 5 } | Select-Object -First 20`);
  wrap("report.privileged_access_analysis", "Privileged Access Analysis", `Get-RoleGroupMember -Identity "Organization Management" | Select-Object Name | Select-Object -First 20`);

  // Client Access
  wrap("report.owa_usage", "OWA Usage (Get-LogonStatistics OWA)", `Get-Mailbox -ResultSize 10 | ForEach-Object { Get-MailboxStatistics -Identity $_.Identity | Select-Object DisplayName,LastClientAccessTime } | Select-Object -First 10`);
  wrap("report.outlook_mapi_usage", "Outlook/MAPI Usage (MAPIEnabled)", `Get-CASMailbox -ResultSize 20 | Where-Object { $_.MAPIEnabled } | Select-Object Identity | Select-Object -First 20`);
  wrap("report.activesync_usage", "ActiveSync Usage", `Get-CASMailbox -ResultSize 20 | Where-Object { $_.ActiveSyncEnabled } | Select-Object Identity | Select-Object -First 20`);
  wrap("report.ews_usage", "EWS Usage (EwsEnabled)", `Get-CASMailbox -ResultSize 20 | Select-Object Identity,EwsEnabled | Select-Object -First 20`);
  wrap("report.pop_usage", "POP Usage", `Get-CASMailbox -ResultSize 20 | Where-Object { $_.PopEnabled } | Select-Object Identity | Select-Object -First 20`);
  wrap("report.imap_usage", "IMAP Usage", `Get-CASMailbox -ResultSize 20 | Where-Object { $_.ImapEnabled } | Select-Object Identity | Select-Object -First 20`);
  wrap("report.smtp_auth_usage", "SMTP AUTH Usage", `Get-CASMailbox -ResultSize 20 | Where-Object { $_.SmtpClientAuthenticationDisabled -eq $false } | Select-Object Identity | Select-Object -First 20`);
  wrap("report.client_version_report", "Client Version Report (OWA/MAPI)", `Get-Mailbox -ResultSize 10 | ForEach-Object { Get-MailboxStatistics -Identity $_.Identity | Select-Object DisplayName,ClientVersion } | Select-Object -First 10`);
  wrap("report.outlook_version_distribution", "Outlook Version Distribution", `Get-MailboxStatistics -Server DEVEX02 | Group-Object ClientVersion | Select-Object Name,Count | Select-Object -First 10`);
  wrap("report.mobile_device_inventory", "Mobile Device Inventory", `Get-MobileDevice -ResultSize 20 | Select-Object FriendlyName,DeviceType | Select-Object -First 20`);
  wrap("report.mobile_device_os_distribution", "Mobile Device OS Distribution", `Get-MobileDevice -ResultSize 50 | Group-Object DeviceOS | Select-Object Name,Count | Sort-Object Count -Descending | Select-Object -First 10`);
  wrap("report.activesync_device_associations", "ActiveSync Device Associations", `Get-Mailbox -ResultSize 10 | ForEach-Object { Get-MobileDevice -Mailbox $_.Identity | Select-Object Mailbox,DeviceType } | Select-Object -First 20`);
  wrap("report.inactive_mobile_devices", "Inactive Mobile Devices (30d)", `Get-MobileDevice -ResultSize 50 | Where-Object { $_.LastSuccessSync -lt (Get-Date).AddDays(-30) } | Select-Object FriendlyName,LastSuccessSync | Select-Object -First 20`);
  wrap("report.client_connectivity", "Client Connectivity (Test-OwaConnectivity)", `Test-OwaConnectivity -ErrorAction SilentlyContinue | Select-Object Result,Latency | Select-Object -First 5`);
  wrap("report.authentication_failures", "Authentication Failures (WinEvent Security 4625)", `Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4625} -MaxEvents 10 -ErrorAction SilentlyContinue | Select-Object TimeCreated,Message | Select-Object -First 10`);
  wrap("report.protocol_error_report", "Protocol Error Report (EventLog Application)", `Get-WinEvent -FilterHashtable @{LogName='Application'; Level=2} -MaxEvents 10 -ErrorAction SilentlyContinue | Select-Object TimeCreated,Id,Message | Select-Object -First 10`);
  wrap("report.legacy_protocol_usage", "Legacy Protocol Usage (POP/IMAP)", `Get-CASMailbox -ResultSize 50 | Where-Object { $_.PopEnabled -or $_.ImapEnabled } | Select-Object Identity | Select-Object -First 20`);

  // Performance
  wrap("report.cpu_utilization", "CPU Utilization (Get-Counter Processor)", `Get-Counter "\\Processor(_Total)\\% Processor Time" -SampleInterval 1 -MaxSamples 1 | Select-Object -ExpandProperty CounterSamples | Select-Object CookedValue`);
  wrap("report.memory_utilization", "Memory Utilization", `Get-Counter "\\Memory\\Available MBytes" | Select-Object -ExpandProperty CounterSamples | Select-Object CookedValue`);
  wrap("report.disk_utilization", "Disk Utilization (Get-PSDrive)", `Get-PSDrive -PSProvider FileSystem | Select-Object Name,Used,Free | Select-Object -First 10`);
  wrap("report.disk_latency", "Disk Latency (Avg Disk sec/Read)", `Get-Counter "\\PhysicalDisk(*)\\Avg. Disk sec/Read" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CounterSamples | Select-Object -First 5`);
  wrap("report.disk_iops", "Disk IOPS", `Get-Counter "\\PhysicalDisk(*)\\Disk Reads/sec" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CounterSamples | Select-Object -First 5`);
  wrap("report.network_utilization", "Network Utilization", `Get-Counter "\\Network Interface(*)\\Bytes Total/sec" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CounterSamples | Select-Object -First 5`);
  wrap("report.exchange_service_performance", "Exchange Service Performance (MSExchangeIS)", `Get-Counter "\\MSExchangeIS\\RPC Requests" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CounterSamples | Select-Object -First 5`);
  wrap("report.rpc_mapi_performance", "RPC/MAPI Performance", `Get-Counter "\\MSExchangeIS\\RPC Averaged Latency" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CounterSamples | Select-Object -First 5`);
  wrap("report.owa_performance", "OWA Performance (IIS)", `Get-Counter "\\Web Service(*)\\Current Connections" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CounterSamples | Select-Object -First 5`);
  wrap("report.ews_performance", "EWS Performance", `Get-Counter "\\MSExchangeWS\\Requests/sec" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CounterSamples | Select-Object -First 5`);
  wrap("report.activesync_performance", "ActiveSync Performance", `Get-Counter "\\MSExchange ActiveSync\\Requests/sec" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CounterSamples | Select-Object -First 5`);
  wrap("report.smtp_performance", "SMTP Performance", `Get-Counter "\\MSExchangeTransport Queues(_total)\\Messages Queued For Delivery" | Select-Object -ExpandProperty CounterSamples | Select-Object CookedValue`);
  wrap("report.database_io", "Database I/O (Database Reads Latency)", `Get-Counter "\\MSExchange Database(*)\I/O Database Reads Average Latency" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CounterSamples | Select-Object -First 5`);
  wrap("report.transaction_log_io", "Transaction Log I/O", `Get-Counter "\\MSExchange Database(*)\Log Record Stalls/sec" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CounterSamples | Select-Object -First 5`);
  wrap("report.server_load", "Server Load (CPU + Memory)", `Get-Counter "\\Processor(_Total)\\% Processor Time", "\\Memory\\Available MBytes" | Select-Object -ExpandProperty CounterSamples | Select-Object Path,CookedValue`);
  wrap("report.peak_usage", "Peak Usage (Get-MailboxStatistics peak)", `Get-Mailbox -ResultSize 10 | Get-MailboxStatistics | Sort-Object TotalItemSize -Descending | Select-Object DisplayName,TotalItemSize | Select-Object -First 5`);
  wrap("report.performance_trend", "Performance Trend (Get-Counter sampled)", `Get-Counter "\\Processor(_Total)\\% Processor Time" -SampleInterval 1 -MaxSamples 3 | Select-Object -ExpandProperty CounterSamples | Select-Object CookedValue`);
  wrap("report.performance_anomaly", "Performance Anomaly (Queue >100)", `Get-Queue | Where-Object { $_.MessageCount -gt 100 } | Select-Object Identity,MessageCount | Select-Object -First 10`);

  // Config
  wrap("report.exchange_configuration_snapshot", "Exchange Configuration Snapshot (Organization + Transport)", `Get-OrganizationConfig | Select-Object Name; Get-TransportConfig | Select-Object MaxSendSize | Select-Object -First 1`);
  wrap("report.configuration_baseline", "Configuration Baseline (Get-ExchangeServer)", `Get-ExchangeServer | Select-Object Name,AdminDisplayVersion | Select-Object -First 10`);
  wrap("report.configuration_drift", "Configuration Drift (AdminAuditLog last 24h)", `Search-AdminAuditLog -ResultSize 20 -StartDate (Get-Date).AddDays(-1) | Select-Object ObjectModified,Caller | Select-Object -First 10`);
  wrap("report.server_configuration_comparison", "Server Configuration Comparison", `Get-ExchangeServer | Select-Object Name,AdminDisplayVersion | Sort-Object AdminDisplayVersion | Select-Object -First 10`);
  wrap("report.database_configuration_comparison", "Database Configuration Comparison", `Get-MailboxDatabase | Select-Object Name,EdbFilePath,LogFolderPath | Select-Object -First 10`);
  wrap("report.connector_configuration_comparison", "Connector Configuration Comparison", `Get-SendConnector | Select-Object Name,Enabled | Select-Object -First 10`);
  wrap("report.virtual_directory_configuration", "Virtual Directory Configuration", `Get-OwaVirtualDirectory | Select-Object Name,InternalUrl,ExternalUrl | Select-Object -First 10`);
  wrap("report.authentication_configuration", "Authentication Configuration", `Get-PowerShellVirtualDirectory | Select-Object Name,BasicAuthentication,WindowsAuthentication | Select-Object -First 5`);
  wrap("report.organization_configuration", "Organization Configuration (Get-OrganizationConfig)", `Get-OrganizationConfig | Select-Object Name,ActivityBasedAuthenticationTimeoutInterval | Select-Object -First 1`);
  wrap("report.accepted_domains", "Accepted Domains", `Get-AcceptedDomain | Select-Object Name,DomainName | Select-Object -First 20`);
  wrap("report.remote_domains", "Remote Domains", `Get-RemoteDomain | Select-Object Name,DomainName | Select-Object -First 20`);
  wrap("report.email_address_policies", "Email Address Policies", `Get-EmailAddressPolicy | Select-Object Name,Enabled,Priority | Select-Object -First 10`);
  wrap("report.address_lists", "Address Lists", `Get-AddressList | Select-Object Name | Select-Object -First 20`);
  wrap("report.global_address_list", "Global Address List", `Get-GlobalAddressList | Select-Object Name | Select-Object -First 10`);
  wrap("report.offline_address_book", "Offline Address Book", `Get-OfflineAddressBook | Select-Object Name,Version | Select-Object -First 10`);
  wrap("report.retention_policies", "Retention Policies", `Get-RetentionPolicy | Select-Object Name | Select-Object -First 20`);
  wrap("report.mobile_policies", "Mobile Policies (ActiveSync mailbox policy)", `Get-MobileDeviceMailboxPolicy | Select-Object Name | Select-Object -First 10`);
  wrap("report.throttling_policies", "Throttling Policies", `Get-ThrottlingPolicy | Select-Object Name | Select-Object -First 10`);
  wrap("report.sharing_policies", "Sharing Policies", `Get-SharingPolicy | Select-Object Name | Select-Object -First 10`);
  wrap("report.federation_configuration", "Federation Configuration", `Get-FederatedOrganizationIdentifier | Select-Object AccountNamespace,Enabled | Select-Object -First 5`);
  wrap("report.audit_configuration", "Audit Configuration (AdminAuditLogConfig)", `Get-AdminAuditLogConfig | Select-Object AdminAuditLogEnabled,LogLevel | Select-Object -First 1`);

  // Migration
  wrap("report.migration_overview", "Migration Overview (Get-MigrationBatch)", `Get-MigrationBatch | Select-Object Identity,Status,TotalCount | Select-Object -First 20`);
  wrap("report.mailbox_migration_status", "Mailbox Migration Status (Get-MoveRequest)", `Get-MoveRequest | Select-Object Identity,Status,PercentComplete | Select-Object -First 20`);
  wrap("report.completed_migrations", "Completed Migrations", `Get-MoveRequest | Where-Object { $_.Status -eq "Completed" } | Select-Object Identity | Select-Object -First 20`);
  wrap("report.in_progress_migrations", "In-Progress Migrations", `Get-MoveRequest | Where-Object { $_.Status -eq "InProgress" } | Select-Object Identity | Select-Object -First 20`);
  wrap("report.failed_migrations", "Failed Migrations", `Get-MoveRequest | Where-Object { $_.Status -eq "Failed" } | Select-Object Identity | Select-Object -First 20`);
  wrap("report.stalled_migrations", "Stalled Migrations", `Get-MoveRequest | Where-Object { $_.StatusDetail -like "*Stalled*" } | Select-Object Identity | Select-Object -First 20`);
  wrap("report.suspended_migrations", "Suspended Migrations", `Get-MoveRequest | Where-Object { $_.Status -eq "Suspended" } | Select-Object Identity | Select-Object -First 20`);
  wrap("report.migration_batch_status", "Migration Batch Status", `Get-MigrationBatch | Select-Object Identity,Status | Select-Object -First 20`);
  wrap("report.migration_queue", "Migration Queue", `Get-MoveRequest | Group-Object Status | Select-Object Name,Count`);
  wrap("report.migration_speed", "Migration Speed (BytesTransferred)", `Get-MoveRequestStatistics | Select-Object Identity,BytesTransferred,PercentComplete | Select-Object -First 10`);
  wrap("report.migration_eta", "Migration ETA (Estimated)", `Get-MoveRequestStatistics | Select-Object Identity,Status,PercentComplete | Select-Object -First 10`);
  wrap("report.migration_error_analysis", "Migration Error Analysis", `Get-MoveRequest | Where-Object { $_.Status -eq "Failed" } | Select-Object Identity,FailureType | Select-Object -First 10`);
  wrap("report.mailbox_source_server", "Mailbox → Source Server", `Get-MoveRequest | Select-Object Identity,SourceDatabase | Select-Object -First 20`);
  wrap("report.mailbox_target_server", "Mailbox → Target Server", `Get-MoveRequest | Select-Object Identity,TargetDatabase | Select-Object -First 20`);
  wrap("report.cross_version_distribution", "Cross-Version Mailbox Distribution", `Get-ExchangeServer | Group-Object AdminDisplayVersion | Select-Object Name,Count`);
  wrap("report.migration_readiness", "Migration Readiness (Test-MigrationServerAvailability)", `Test-MigrationServerAvailability -ExchangeRemoteMove -RemoteServer "mail.contoso.com" -ErrorAction SilentlyContinue | Select-Object Result | Select-Object -First 5`);
  wrap("report.migration_blockers", "Migration Blockers (Failed)", `Get-MoveRequest | Where-Object { $_.Status -eq "Failed" } | Select-Object Identity,Message | Select-Object -First 10`);
  wrap("report.mailboxes_not_ready_for_migration", "Mailboxes Not Ready", `Get-Mailbox -ResultSize 20 | Where-Object { $_.IsMailboxEnabled -eq $false } | Select-Object DisplayName | Select-Object -First 20`);
  wrap("report.migration_dependency_report", "Migration Dependency Report", `Get-MigrationBatch | Select-Object Identity,SourceEndpoint | Select-Object -First 10`);
  wrap("report.post_migration_validation", "Post-Migration Validation (Get-MailboxStatistics)", `Get-Mailbox -ResultSize 10 | Get-MailboxStatistics | Select-Object DisplayName,ItemCount | Select-Object -First 10`);
  wrap("report.migration_rollback_readiness", "Migration Rollback Readiness", `Get-MoveRequest | Select-Object Identity,Protect | Select-Object -First 10`);

  // Audit
  wrap("report.exchange_admin_audit", "Exchange Admin Audit (Search-AdminAuditLog)", `Search-AdminAuditLog -ResultSize 20 | Select-Object Caller,ObjectModified,CmdletName | Select-Object -First 20`);
  wrap("report.configuration_changes", "Configuration Changes (last 24h)", `Search-AdminAuditLog -ResultSize 50 -StartDate (Get-Date).AddDays(-1) | Select-Object Caller,CmdletName | Select-Object -First 20`);
  wrap("report.mailbox_changes", "Mailbox Changes", `Search-AdminAuditLog -ResultSize 50 | Where-Object { $_.CmdletName -like "*Mailbox*" } | Select-Object Caller,ObjectModified | Select-Object -First 10`);
  wrap("report.permission_changes", "Permission Changes", `Search-AdminAuditLog -ResultSize 50 | Where-Object { $_.CmdletName -like "*Permission*" } | Select-Object Caller | Select-Object -First 10`);
  wrap("report.transport_rule_changes", "Transport Rule Changes", `Search-AdminAuditLog -ResultSize 50 | Where-Object { $_.CmdletName -like "*TransportRule*" } | Select-Object Caller | Select-Object -First 10`);
  wrap("report.connector_changes", "Connector Changes", `Search-AdminAuditLog -ResultSize 50 | Where-Object { $_.CmdletName -like "*Connector*" } | Select-Object Caller | Select-Object -First 10`);
  wrap("report.database_changes", "Database Changes", `Search-AdminAuditLog -ResultSize 50 | Where-Object { $_.CmdletName -like "*Database*" } | Select-Object Caller | Select-Object -First 10`);
  wrap("report.server_changes", "Server Changes", `Search-AdminAuditLog -ResultSize 50 | Where-Object { $_.CmdletName -like "*ExchangeServer*" } | Select-Object Caller | Select-Object -First 10`);
  wrap("report.rbac_changes", "RBAC Changes", `Search-AdminAuditLog -ResultSize 50 | Where-Object { $_.CmdletName -like "*Role*" } | Select-Object Caller | Select-Object -First 10`);
  wrap("report.recent_administrative_actions", "Recent Administrative Actions", `Search-AdminAuditLog -ResultSize 20 | Select-Object RunDate,Caller,CmdletName | Sort-Object RunDate -Descending | Select-Object -First 20`);
  wrap("report.changes_by_administrator", "Changes by Administrator", `Search-AdminAuditLog -ResultSize 100 | Group-Object Caller | Select-Object Name,Count | Sort-Object Count -Descending | Select-Object -First 10`);
  wrap("report.changes_by_date", "Changes by Date", `Search-AdminAuditLog -ResultSize 100 | Group-Object { $_.RunDate.ToString("yyyy-MM-dd") } | Select-Object Name,Count | Sort-Object Name | Select-Object -First 20`);
  wrap("report.before_after_configuration", "Before/After Configuration (CmdletParameters)", `Search-AdminAuditLog -ResultSize 20 | Select-Object CmdletName,CmdletParameters | Select-Object -First 10`);
  wrap("report.unauthorized_changes", "Unauthorized/Unexpected Changes (non-admin caller)", `Search-AdminAuditLog -ResultSize 50 | Where-Object { $_.Caller -notlike "*admin*" } | Select-Object Caller,CmdletName | Select-Object -First 10`);
  wrap("report.configuration_drift_audit", "Configuration Drift (AdminAuditLog drift)", `Search-AdminAuditLog -ResultSize 50 -StartDate (Get-Date).AddDays(-7) | Group-Object CmdletName | Select-Object Name,Count | Sort-Object Count -Descending | Select-Object -First 10`);

  // Health Dashboard
  wrap("report.exchange_health_dashboard", "Exchange Health Dashboard (rolled-up)", `Get-HealthReport | Select-Object HealthSet,AlertValue | Where-Object { $_.AlertValue -ne "Healthy" } | Select-Object -First 10`);
  wrap("report.server_health", "Server Health (Get-ServerHealth)", `Get-ServerHealth | Select-Object HealthSet,AlertValue | Where-Object { $_.AlertValue -ne "Healthy" } | Select-Object -First 10`);
  wrap("report.database_health", "Database Health (Get-MailboxDatabaseCopyStatus)", `Get-MailboxDatabaseCopyStatus | Where-Object { $_.Status -ne "Mounted" } | Select-Object Identity,Status | Select-Object -First 10`);
  wrap("report.dag_health", "DAG Health (Test-ReplicationHealth)", `Test-ReplicationHealth | Where-Object { $_.Result -eq "Failed" } | Select-Object Server,Check | Select-Object -First 10`);
  wrap("report.mail_flow_health", "Mail Flow Health (Get-Queue)", `Get-Queue | Where-Object { $_.MessageCount -gt 50 } | Select-Object Identity,MessageCount | Select-Object -First 10`);
  wrap("report.transport_health", "Transport Health (Get-TransportService)", `Get-TransportService | Select-Object Name,ExternalDNSAdapterEnabled | Select-Object -First 5`);
  wrap("report.service_health", "Service Health (Test-ServiceHealth)", `Test-ServiceHealth | Select-Object Server,ServicesNotRunning | Select-Object -First 10`);
  wrap("report.certificate_health", "Certificate Health (expiring 30d)", `Get-ExchangeCertificate | Where-Object { $_.NotAfter -lt (Get-Date).AddDays(30) } | Select-Object Subject,NotAfter | Select-Object -First 10`);
  wrap("report.disk_health", "Disk Health (Get-PSDrive Free <10%)", `Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Free -and $_.Used -and ($_.Free/($_.Free+$_.Used) -lt 0.1) } | Select-Object Name,Free,Used | Select-Object -First 10`);
  wrap("report.ad_connectivity", "AD Connectivity (Get-ADServerSettings)", `Get-ADServerSettings | Select-Object DefaultGlobalCatalog,PreferredGlobalCatalog | Select-Object -First 5`);
  wrap("report.dns_health", "DNS Health (Resolve-DnsName)", `Resolve-DnsName -Name "mail.contoso.com" -ErrorAction SilentlyContinue | Select-Object Name,IPAddress | Select-Object -First 5`);
  wrap("report.smtp_health", "SMTP Health (Test-NetConnection 25)", `Test-NetConnection -ComputerName "mail.contoso.com" -Port 25 -WarningAction SilentlyContinue | Select-Object TcpTestSucceeded`);
  wrap("report.client_connectivity", "Client Connectivity (Test-OwaConnectivity)", `Test-OwaConnectivity -ErrorAction SilentlyContinue | Select-Object Result | Select-Object -First 5`);
  wrap("report.search_content_index_health", "Search/Content Index Health (ContentIndexState)", `Get-MailboxDatabaseCopyStatus | Select-Object Identity,ContentIndexState | Where-Object { $_.ContentIndexState -ne "Healthy" } | Select-Object -First 10`);
  wrap("report.backup_health", "Backup Health (LastFullBackup >7d)", `Get-MailboxDatabase | Where-Object { $_.LastFullBackup -lt (Get-Date).AddDays(-7) } | Select-Object Name,LastFullBackup | Select-Object -First 10`);
  wrap("report.overall_health_score", "Overall Exchange Health Score (0-100, based on failed checks)", `Get-HealthReport | Group-Object AlertValue | Select-Object Name,Count`);
}
