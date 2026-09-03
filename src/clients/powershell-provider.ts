import axios from "axios";
import type { AppConfig } from "../config.js";
import type { AuthManager } from "../auth/auth-manager.js";
import { ExchangeError } from "../errors.js";
import { getHttpsAgent } from "../utils/tls.js";
import { withHA, getHAServers } from "../utils/ha.js";

const ALLOWED_CMDLETS = new Set([
  // Recipients
  "Get-Mailbox", "New-Mailbox", "Set-Mailbox", "Remove-Mailbox", "Enable-Mailbox", "Disable-Mailbox",
  "Get-MailboxStatistics", "Get-MailboxPermission", "Add-MailboxPermission", "Remove-MailboxPermission",
  "Get-Recipient", "Get-User", "Get-MailUser", "Get-MailContact", "Get-Contact",
  "Get-DistributionGroup", "New-DistributionGroup", "Set-DistributionGroup", "Remove-DistributionGroup",
  "Get-DistributionGroupMember", "Add-DistributionGroupMember", "Remove-DistributionGroupMember",
  "Get-DynamicDistributionGroup", "Get-UnifiedGroup",
  "Get-CASMailbox", "Set-CASMailbox",
  // Databases / Servers / DAG
  "Get-MailboxDatabase", "Get-MailboxDatabaseCopyStatus", "Get-DatabaseAvailabilityGroup", "Get-DatabaseAvailabilityGroupNetwork",
  "Get-ExchangeServer", "Get-ServerHealth", "Get-HealthReport", "Get-ServerComponentState", "Get-ServerMonitoringOverride",
  "Get-MonitoringItemIdentity", "Get-ExchangeCertificate", "Get-ClientAccessService", "Get-TransportService", "Get-FrontendTransportService",
  "Get-OwaVirtualDirectory", "Get-EcpVirtualDirectory", "Get-WebServicesVirtualDirectory", "Get-ActiveSyncVirtualDirectory", "Get-MapiVirtualDirectory",
  "Get-PowerShellVirtualDirectory",
  "Test-ServiceHealth", "Test-ReplicationHealth", "Test-Mailflow", "Test-MAPIConnectivity",
  // Mail flow
  "Get-TransportRule", "New-TransportRule", "Set-TransportRule", "Remove-TransportRule",
  "Get-SendConnector", "Get-ReceiveConnector", "Get-AcceptedDomain", "Get-RemoteDomain", "Get-EmailAddressPolicy",
  "Get-Queue", "Get-QueueDigest", "Retry-Queue", "Suspend-Queue", "Resume-Queue",
  "Get-MessageTrackingLog", "Get-MessageTrace", "Get-TransportConfig",
  // Permissions / Compliance
  "Get-RoleGroup", "Get-ManagementRoleAssignment", "Get-RoleAssignmentPolicy", "Get-ManagementRole",
  "Search-AdminAuditLog", "Search-MailboxAuditLog", "Get-JournalRule",
  // Message search (PowerShell alternative to EWS/Graph for on-prem)
  "Search-Mailbox", "Get-MessageTrackingLog", "Get-MessageTrace",
  // Public folders / Mobile
  "Get-PublicFolder", "Get-PublicFolderMailbox", "Get-MobileDevice", "Get-MobileDeviceMailboxPolicy", "Get-PublicFolderStatistics",
  // Compliance / OOF / Features
  "Get-MailboxAutoReplyConfiguration", "Set-MailboxAutoReplyConfiguration",
  "Get-InboxRule", "Get-MailboxFolderPermission", "Get-MailboxPermission",
  "Get-RetentionPolicy", "Get-RetentionPolicyTag", "Get-JournalRule",
  "Get-MailboxJunkEmailConfiguration", "Get-MailboxSearch",
  // Extended server/mailflow/database/dag/report/log
  "Get-Service", "Restart-Service", "Get-WinEvent", "Get-EventLog", "Get-Counter", "Get-PSDrive", "Get-CimInstance", "Get-WmiObject", "Get-ChildItem", "Test-NetConnection", "Resolve-DnsName",
  "Get-MailboxDatabase", "Mount-Database", "Dismount-Database", "Move-ActiveMailboxDatabase", "Suspend-MailboxDatabaseCopy", "Resume-MailboxDatabaseCopy", "Add-MailboxDatabaseCopy", "Remove-MailboxDatabaseCopy", "New-MailboxRepairRequest", "Get-MailboxRepairRequest",
  "Get-DatabaseAvailabilityGroup", "Set-MailboxDatabaseCopy", "Test-ReplicationHealth",
  "Get-MailboxFolderStatistics", "Get-MoveRequest", "New-MoveRequest", "Resume-MoveRequest", "Add-MailboxPermission", "Remove-MailboxPermission", "New-DistributionGroup", "Set-DistributionGroup", "Remove-DistributionGroup", "Add-DistributionGroupMember", "Remove-DistributionGroupMember", "New-MailContact", "Set-MailContact", "Remove-MailContact",
  "Get-OwaVirtualDirectory", "Test-OwaConnectivity", "Enable-ExchangeCertificate", "Import-ExchangeCertificate", "New-ExchangeCertificate", "Search-MailboxAuditLog", "Get-DlpPolicy", "Test-MAPIConnectivity",
  // Mailbox lifecycle / recovery
  "Disable-Mailbox", "Connect-Mailbox", "Undo-SoftDeletedMailbox", "Get-Mailbox", "Remove-Mailbox", "Restore-RecoverableItems",
  "Get-CASMailbox", "Set-CASMailbox", "Get-MailboxRestoreRequest", "New-MailboxRestoreRequest", "New-MailboxImportRequest", "Get-MailboxImportRequest",
  // Infra reports + diagnostics
  "Get-OrganizationConfig", "Get-AdSite", "Get-ADPermission", "Get-CimInstance", "Get-WmiObject", "Test-ExchangeSearch", "Get-MoveRequestStatistics",
]);

export class PowerShellProvider {
  private get endpoint(): string {
    return this.config.exchange.powershellUri;
  }
  // For HA logging
  get haServers(): string[] {
    return getHAServers(this.config);
  }

  constructor(
    private config: AppConfig,
    private auth: AuthManager,
  ) {}

  private assertAllowed(cmdlet: string) {
    const base = cmdlet.trim().split(/\s+/)[0].replace(/-.*/, (m) => m).split("|")[0].trim();
    // Extract first cmdlet token before space/pipe
    const token = cmdlet.trim().split(/[\s|;]/)[0];
    if (!ALLOWED_CMDLETS.has(token)) {
      throw new ExchangeError({ message: `Cmdlet not allowed: ${token}`, code: "PERMISSION_DENIED", provider: "powershell" });
    }
  }

  // Try WinRM via local PowerShell first (Windows, handles self-signed + Basic correctly), fallback to HTTP POST
  private shouldUseWinRM(): boolean {
    return process.platform === "win32" && !!this.config.auth.basic?.username && !!this.config.auth.basic?.password;
  }

  async invoke<T>(command: string): Promise<T> {
    this.assertAllowed(command);
    // HA: try each backend smartly (failover/round_robin) — getHAServers() returns [powershellUri] or servers list
    return withHA(this.config, (url) => this.invokeForUrl<T>(command, url), {
      isRetryable: (err: unknown) => {
        const e = err as ExchangeError;
        return e?.code === "SERVER_ERROR" || e?.code === "NOT_FOUND" || String((e as any)?.message ?? "").includes("WinRM");
      },
    });
  }

  private async invokeForUrl<T>(command: string, url: string): Promise<T> {
    if (this.shouldUseWinRM()) {
      return this.invokeViaWinRMForUrl<T>(command, url);
    }
    // Non-Windows fallback: Exchange PowerShell remoting is WSMan/PSRP over SOAP (not plain POST).
    const authHeader = await this.auth.getAuthHeader();
    const extra = await this.auth.getExtraOptions();
    const httpsAgent = await getHttpsAgent(this.config, (extra as any).httpsAgent);
    try {
      const res = await axios.post(url, command, {
        headers: {
          "Content-Type": "application/soap+xml;charset=UTF-8",
          Authorization: authHeader,
          "User-Agent": "ExchangeMCP-WSMan",
          ...(extra.headers ?? {}),
        },
        // @ts-ignore
        httpsAgent,
        validateStatus: () => true,
      });
      if (res.status === 401) throw new ExchangeError({ message: `PowerShell auth failed (401) at ${url}. Check auth method: Exchange PowerShell virtual directory defaults to Kerberos/NTLM (Negotiate), not Basic. Enable Basic on the PowerShell vdir or use Kerberos/NTLM via WinRM, and verify user/domain.`, code: "AUTH_FAILED", provider: "powershell" });
      if (res.status === 403) throw new ExchangeError({ message: `PowerShell permission denied (403) at ${url}. Verify RBAC role (e.g. Organization Management) for user.`, code: "PERMISSION_DENIED", provider: "powershell" });
      if (res.status === 404) throw new ExchangeError({ message: `PowerShell endpoint not found (404) at ${url}. Misconfigured EXCHANGE_SERVER / EXCHANGE_POWERSHELL_URL. Must be http(s)://<exchange-fqdn>/PowerShell (case-sensitive). Current: endpoint=${this.config.exchange.endpoint}, powershellUri=${url}. Fix: set EXCHANGE_POWERSHELL_URL=https://<fqdn>/PowerShell or EXCHANGE_SERVER=<fqdn>. Also verify: 1) Get-PowerShellVirtualDirectory | fl InternalUrl,ExternalUrl 2) Test-WSMan <host> 3) WinRM enabled (Enable-PSRemoting) 4) https vs http (try https://<host>/PowerShell vs http://<host>/PowerShell) 5) ECP vdir is /ecp, PowerShell is /PowerShell (capital P/S).`, code: "NOT_FOUND", provider: "powershell" });
      if (res.status >= 400) throw new ExchangeError({ message: `PowerShell error ${res.status} at ${url}: ${typeof res.data === "string" ? res.data.slice(0, 800) : JSON.stringify(res.data).slice(0, 800)}`, code: "SERVER_ERROR", provider: "powershell" });
      return res.data as T;
    } catch (err) {
      if (err instanceof ExchangeError) throw err;
      const msg = (err as Error).message ?? String(err);
      if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND") || msg.includes("ETIMEDOUT")) {
        throw new ExchangeError({ message: `PowerShell connection failed to ${url}: ${msg}. Verify host/port reachable, firewall, WinRM listener (winrm enumerate winrm/config/listener), and that Exchange PowerShell vdir exists. Try EXCHANGE_POWERSHELL_URL=https://<fqdn>:443/PowerShell or http://<fqdn>:80/PowerShell.`, code: "SERVER_ERROR", provider: "powershell", cause: err });
      }
      throw new ExchangeError({ message: `PowerShell invoke failed at ${url}: ${msg}`, code: "SERVER_ERROR", provider: "powershell", cause: err });
    }
  }

  private isHeavyHealthCommand(command: string): boolean {
    return /Get-(ServerHealth|HealthReport|ServerComponentState|MonitoringItemIdentity|QueueDigest)|report\.generate_health_summary/i.test(command);
  }

  private async invokeViaWinRMForUrl<T>(command: string, url: string): Promise<T> {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    const user = this.config.auth.basic!.username.includes("@") ? this.config.auth.basic!.username : `${this.config.auth.basic!.domain ?? ""}\\${this.config.auth.basic!.username}`;
    const pass = this.config.auth.basic!.password.replace(/'/g, "''");
    const isHeavy = this.isHeavyHealthCommand(command);
    const timeout = isHeavy ? 60000 : 30000;
    // Escape command for embedding: ensure no stray ' terminates string — command is inside ScriptBlock { }, single quotes safe
    const psCommand = `
$ErrorActionPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'
$sec = ConvertTo-SecureString '${pass}' -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential('${user.replace(/'/g, "''")}', $sec)
$opt = New-PSSessionOption -SkipCACheck -SkipCNCheck -SkipRevocationCheck -OperationTimeout 60000
$uri = '${url.replace(/'/g, "''")}'
try {
  $sess = New-PSSession -ConfigurationName Microsoft.Exchange -ConnectionUri $uri -Credential $cred -Authentication Basic -AllowRedirection -SessionOption $opt -ErrorAction Stop
  $result = Invoke-Command -Session $sess -ScriptBlock { ${command} }
  # Exchange returns objects with nested properties — serialize locally (remote ConvertTo-Json not available in constrained endpoint)
  $json = $result | ConvertTo-Json -Depth 5 -Compress -ErrorAction SilentlyContinue 2>$null
  if (-not $json) { $json = "[]" }
  Write-Output $json
  Remove-PSSession $sess -ErrorAction SilentlyContinue
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
`;
    try {
      const { stdout, stderr } = await execFileAsync("powershell", ["-NoProfile", "-Command", psCommand], { timeout, maxBuffer: 10 * 1024 * 1024 });
      if (stderr && stderr.includes("error") && !stdout.trim()) throw new Error(stderr);
      const out = stdout.trim();
      if (!out) return [] as unknown as T;
      // stdout is JSON from ConvertTo-Json
      return out as unknown as T;
    } catch (err: any) {
      const msg = err.stdout ?? err.stderr ?? err.message ?? String(err);
      if (msg.includes("401") || msg.toLowerCase().includes("auth")) throw new ExchangeError({ message: `WinRM auth failed at ${url}: ${msg.slice(0, 600)}`, code: "AUTH_FAILED", provider: "powershell", cause: err });
      if (msg.includes("404") || msg.toLowerCase().includes("not found")) throw new ExchangeError({ message: `WinRM endpoint not found (404) at ${url}: ${msg.slice(0, 600)}`, code: "NOT_FOUND", provider: "powershell", cause: err });
      throw new ExchangeError({ message: `WinRM invoke failed at ${url}: ${msg.slice(0, 800)}`, code: "SERVER_ERROR", provider: "powershell", cause: err });
    }
  }

  async invokeJson(command: string): Promise<any[]> {
    // For WinRM, don't pipe ConvertTo-Json inside remote (Exchange constrained endpoint lacks it) — handled in invokeViaWinRM
    if (this.shouldUseWinRM()) {
      const data = await this.invoke<string>(command);
      return normalizePsJson(typeof data === "string" ? data : JSON.stringify(data));
    }
    const cmd = command.includes("ConvertTo-Json") ? command : `${command} | ConvertTo-Json -Depth 4`;
    const data = await this.invoke<any>(cmd);
    return normalizePsJson(data);
  }

  // Recipients — fixed OPATH quoting + wildcard handling (Option A)
  async listMailboxes(filter?: string, recipientType?: string, resultSize: number = 20): Promise<any[]> {
    if (filter) {
      const raw = filter.trim();
      // If filter already contains wildcard (*), use as-is (e.g. Ali*), else wrap with *filter*
      const pattern = raw.includes("*") ? raw : `*${raw}*`;
      const escPattern = escapePsSingle(pattern);
      const filterCmd = `Get-Mailbox -Filter "Name -like '${escPattern}'"`;
      const base = recipientType ? `${filterCmd} -RecipientTypeDetails ${recipientType}` : filterCmd;
      const cmd = `${base} | Select-Object DisplayName,PrimarySmtpAddress,RecipientType,Name,Identity | Select-Object -First ${resultSize}`;
      const result = await this.invokeJson(cmd);
      if (result.length > 0) return result;
      // Fallback 1: ANR (handles Ali* prefix well)
      const anrPattern = escapePsSingle(raw.replace(/\*/g, ""));
      if (anrPattern) {
        const anr = await this.invokeJson(`Get-Mailbox -Anr "${anrPattern}" | Select-Object DisplayName,PrimarySmtpAddress,RecipientType,Name,Identity | Select-Object -First ${resultSize}`).catch(() => []);
        if (anr.length > 0) return anr;
      }
      // Fallback 2: client-side Where-Object
      const wherePattern = escapePsSingle(pattern);
      return this.invokeJson(`Get-Mailbox -ResultSize 100 | Where-Object { $_.Name -like '${wherePattern}' } | Select-Object DisplayName,PrimarySmtpAddress,RecipientType,Name,Identity | Select-Object -First ${resultSize}`);
    }
    let cmd = "Get-Mailbox";
    if (recipientType) cmd += ` -RecipientTypeDetails ${recipientType}`;
    cmd += ` | Select-Object DisplayName,PrimarySmtpAddress,RecipientType,Name,Identity | Select-Object -First ${resultSize}`;
    return this.invokeJson(cmd);
  }

  async getMailbox(identity: string): Promise<any> {
    const arr = await this.invokeJson(`Get-Mailbox -Identity '${escapePsSingle(identity)}' | Select-Object DisplayName,PrimarySmtpAddress,RecipientType,Name,Alias,Identity,OrganizationalUnit,Database,ServerName | Select-Object -First 1`);
    if (!arr.length) throw new ExchangeError({ message: `Mailbox ${identity} not found`, code: "NOT_FOUND", provider: "powershell" });
    return arr[0];
  }

  async getMailboxStatistics(identity: string): Promise<any> {
    const arr = await this.invokeJson(`Get-MailboxStatistics -Identity '${escapePsSingle(identity)}' | Select-Object DisplayName,ItemCount,TotalItemSize,LastLogonTime,Database | Select-Object -First 1`);
    if (!arr.length) throw new ExchangeError({ message: `Statistics for ${identity} not found`, code: "NOT_FOUND", provider: "powershell" });
    return arr[0];
  }

  async listDistributionGroups(filter?: string): Promise<any[]> {
    return this.invokeJson(filter ? `Get-DistributionGroup -Filter {Name -like "*${filter}*"} -ResultSize 20` : "Get-DistributionGroup -ResultSize 20");
  }

  async getTransportRules(): Promise<any[]> {
    return this.invokeJson("Get-TransportRule");
  }

  // Generic passthrough for new tools
  async getAll(type: string, extra = ""): Promise<any[]> {
    return this.invokeJson(`${type} ${extra}`.trim());
  }
}

function escapePs(s: string): string {
  return s.replace(/"/g, '`"').replace(/\$/g, '`$');
}
function escapePsSingle(s: string): string {
  return s.replace(/'/g, "''");
}

function normalizePsJson(data: any): any[] {
  if (!data) return [];
  if (typeof data === "string") {
    const trimmed = data.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // Sometimes PS returns multiple JSON objects concatenated
      try {
        const fixed = `[${trimmed.replace(/}\s*{/g, "},{")}]`;
        const parsed = JSON.parse(fixed);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return [];
      }
    }
  }
  return Array.isArray(data) ? data : [data];
}
