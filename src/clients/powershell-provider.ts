import axios from "axios";
import type { AppConfig } from "../config.js";
import type { AuthManager } from "../auth/auth-manager.js";
import { ExchangeError } from "../errors.js";
import { getHttpsAgent } from "../utils/tls.js";

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
  // Legacy compat
  "Get-ADPermission",
]);

export class PowerShellProvider {
  private endpoint: string;

  constructor(
    private config: AppConfig,
    private auth: AuthManager,
  ) {
    this.endpoint = config.exchange.powershellUri;
  }

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
    if (this.shouldUseWinRM()) {
      // On Windows, Exchange requires proper WSMan/PSRP (WinRM), not plain HTTP POST — use WinRM exclusively
      return this.invokeViaWinRM<T>(command);
    }
    // Non-Windows fallback: Exchange PowerShell remoting is WSMan/PSRP over SOAP (not plain POST).
    // This HTTP path will return 415 Unsupported Media Type unless the server exposes a custom
    // HTTP wrapper. Prefer running the MCP on Windows with WinRM (Basic + SkipCACheck).
    const authHeader = await this.auth.getAuthHeader();
    const extra = await this.auth.getExtraOptions();
    const httpsAgent = await getHttpsAgent(this.config, (extra as any).httpsAgent);
    try {
      const res = await axios.post(this.endpoint, command, {
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
      if (res.status === 401) throw new ExchangeError({ message: `PowerShell auth failed (401) at ${this.endpoint}. Check auth method: Exchange PowerShell virtual directory defaults to Kerberos/NTLM (Negotiate), not Basic. Enable Basic on the PowerShell vdir or use Kerberos/NTLM via WinRM, and verify user/domain.`, code: "AUTH_FAILED", provider: "powershell" });
      if (res.status === 403) throw new ExchangeError({ message: `PowerShell permission denied (403) at ${this.endpoint}. Verify RBAC role (e.g. Organization Management) for user.`, code: "PERMISSION_DENIED", provider: "powershell" });
      if (res.status === 404) throw new ExchangeError({ message: `PowerShell endpoint not found (404) at ${this.endpoint}. Misconfigured EXCHANGE_SERVER / EXCHANGE_POWERSHELL_URL. Must be http(s)://<exchange-fqdn>/PowerShell (case-sensitive). Current: endpoint=${this.config.exchange.endpoint}, powershellUri=${this.endpoint}. Fix: set EXCHANGE_POWERSHELL_URL=https://<fqdn>/PowerShell or EXCHANGE_SERVER=<fqdn>. Also verify: 1) Get-PowerShellVirtualDirectory | fl InternalUrl,ExternalUrl 2) Test-WSMan <host> 3) WinRM enabled (Enable-PSRemoting) 4) https vs http (try https://<host>/PowerShell vs http://<host>/PowerShell) 5) ECP vdir is /ecp, PowerShell is /PowerShell (capital P/S).`, code: "NOT_FOUND", provider: "powershell" });
      if (res.status >= 400) throw new ExchangeError({ message: `PowerShell error ${res.status} at ${this.endpoint}: ${typeof res.data === "string" ? res.data.slice(0, 800) : JSON.stringify(res.data).slice(0, 800)}`, code: "SERVER_ERROR", provider: "powershell" });
      return res.data as T;
    } catch (err) {
      if (err instanceof ExchangeError) throw err;
      const msg = (err as Error).message ?? String(err);
      if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND") || msg.includes("ETIMEDOUT")) {
        throw new ExchangeError({ message: `PowerShell connection failed to ${this.endpoint}: ${msg}. Verify host/port reachable, firewall, WinRM listener (winrm enumerate winrm/config/listener), and that Exchange PowerShell vdir exists. Try EXCHANGE_POWERSHELL_URL=https://<fqdn>:443/PowerShell or http://<fqdn>:80/PowerShell.`, code: "SERVER_ERROR", provider: "powershell", cause: err });
      }
      throw new ExchangeError({ message: `PowerShell invoke failed at ${this.endpoint}: ${msg}`, code: "SERVER_ERROR", provider: "powershell", cause: err });
    }
  }

  private async invokeViaWinRM<T>(command: string): Promise<T> {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    const user = this.config.auth.basic!.username.includes("@") ? this.config.auth.basic!.username : `${this.config.auth.basic!.domain ?? ""}\\${this.config.auth.basic!.username}`;
    const pass = this.config.auth.basic!.password.replace(/'/g, "''");
    // Escape command for embedding: ensure no stray ' terminates string — command is inside ScriptBlock { }, single quotes safe
    const psCommand = `
$ErrorActionPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'
$sec = ConvertTo-SecureString '${pass}' -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential('${user.replace(/'/g, "''")}', $sec)
$opt = New-PSSessionOption -SkipCACheck -SkipCNCheck -SkipRevocationCheck
$uri = '${this.endpoint.replace(/'/g, "''")}'
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
      const { stdout, stderr } = await execFileAsync("powershell", ["-NoProfile", "-Command", psCommand], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
      if (stderr && stderr.includes("error") && !stdout.trim()) throw new Error(stderr);
      const out = stdout.trim();
      if (!out) return [] as unknown as T;
      // stdout is JSON from ConvertTo-Json
      return out as unknown as T;
    } catch (err: any) {
      const msg = err.stdout ?? err.stderr ?? err.message ?? String(err);
      if (msg.includes("401") || msg.toLowerCase().includes("auth")) throw new ExchangeError({ message: `WinRM auth failed at ${this.endpoint}: ${msg.slice(0, 600)}`, code: "AUTH_FAILED", provider: "powershell", cause: err });
      if (msg.includes("404") || msg.toLowerCase().includes("not found")) throw new ExchangeError({ message: `WinRM endpoint not found (404) at ${this.endpoint}: ${msg.slice(0, 600)}`, code: "NOT_FOUND", provider: "powershell", cause: err });
      throw new ExchangeError({ message: `WinRM invoke failed at ${this.endpoint}: ${msg.slice(0, 800)}`, code: "SERVER_ERROR", provider: "powershell", cause: err });
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

  // Recipients — use Select -First instead of -ResultSize + complex Select due to PSRP serialization quirk with PrimarySmtpAddress
  async listMailboxes(filter?: string, recipientType?: string, resultSize: number = 20): Promise<any[]> {
    let cmd = "Get-Mailbox";
    if (filter) cmd += ` -Filter {Name -like "*${filter}*"} `;
    if (recipientType) cmd += ` -RecipientTypeDetails ${recipientType}`;
    // Use pipeline -First for reliable serialization (avoids 415/empty with -ResultSize + Select)
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
