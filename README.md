# Exchange MCP Server — Microsoft Exchange Server On-Premise

> **Model Context Protocol (MCP) server for Exchange Server on-premise administration, monitoring & troubleshooting** — EWS + REST + PowerShell Remoting, admin-first, lab & production ready.

[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-1.x-blueviolet)](https://modelcontextprotocol.io)
[![Exchange](https://img.shields.io/badge/Exchange-2013%20%7C%202016%20%7C%202019%20%7C%20SE-blue)](https://learn.microsoft.com/en-us/exchange/exchange-server)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**For:** Exchange admins who want AI assistants (OpenCode, Claude Code/Desktop, Cursor, Codex, Windsurf, VS Code, etc.) to run **real Exchange Management Shell tasks** — recipient provisioning, transport troubleshooting, DAG/health monitoring — against **on-premise Exchange**, not Exchange Online.

---

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
  - [Simplest Install — Wizard + Auto-Patch](#simplest-install--wizard--auto-patch)
- [Configuration (MCP Server)](#configuration-mcp-server)
  - [Config File](#config-file)
  - [Lab (Self-Signed Cert) vs Production](#lab-self-signed-cert-vs-production)
  - [Auth](#auth)
  - [All Options & Env Vars](#all-options--env-vars)
- [Connect to Clients (MCP Clients)](#connect-to-clients-mcp-clients)
  - [OpenCode](#opencode)
  - [Claude Code (CLI)](#claude-code-cli)
  - [Claude Desktop](#claude-desktop)
  - [Cursor](#cursor)
  - [Codex (OpenAI)](#codex-openai)
  - [Windsurf](#windsurf)
  - [VS Code (MCP Extension)](#vs-code-mcp-extension)
  - [Generic / Any MCP Client (stdio vs HTTP)](#generic--any-mcp-client-stdio-vs-http)
- [Tools Reference](#tools-reference)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Security Notes](#security-notes)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **187 tools — all open, no gating** — mapped to **Exchange Management Shell** & **EAC** ([docs](https://learn.microsoft.com/en-us/exchange/exchange-server)): Recipients, Mail Flow, Servers/DB/DAG, Monitoring, Compliance (LitigationHold/OOF/Retention), ClientAccess, Certificates, Security, Logs & Reports. See [Tools Reference](#tools-reference).
- **Multi-version:** 2013 / 2016 / 2019 / SE (auto-detect, REST preferred on 2016+, EWS fallback, PowerShell via WinRM on Windows).
- **Multi-auth:** Basic (lab), OAuth 2.0 via ADFS/Azure AD (`client_credentials`), Certificate mTLS (`pfx`/`pem`).
- **Multi-transport:** `stdio` for local clients, `http`/`SSE` for remote/Docker/shared.
- **Lab-friendly:** `insecure`/`rejectUnauthorized: false` for self-signed lab certs (e.g. `https://exchange.lab.local`) + WinRM `SkipCACheck`; production-strict by default.
- **No secrets in repo:** `config.yaml` gitignored, env-var expansion (`${VAR}`) supported.

---

## Prerequisites

- **Node.js ≥ 20** (`node -v`)
- **Exchange Server** 2013+ on-prem with network reachability:
  - EWS: `https://<host>/EWS/Exchange.asmx` (often `443`)
  - REST (2016+): `https://<host>/api/v2.0`
  - PowerShell Remoting: `https://<host>/PowerShell` (WinRM `/PowerShell` virtual directory, 443/5986) — must be `https://<fqdn>/PowerShell` (capital P/S). Verify: `Get-PowerShellVirtualDirectory | fl InternalUrl,ExternalUrl,*Auth*` and `Test-WSMan <host>`
- **Windows host recommended** for PowerShell tools (uses `New-PSSession` WinRM with `Basic` + `SkipCACheck` for self-signed). On Linux/macOS, PowerShell tools fall back to HTTP POST (requires custom wrapper — 415 otherwise).
- Credentials with **appropriate RBAC roles** (e.g. `Organization Management`, `Recipient Management`, `View-Only Configuration` + `Transport Queues` for `Get-Queue`). Check: `Get-ManagementRole -Cmdlet Get-Queue` etc.

---

## Quick Start

```bash
git clone https://github.com/<your-org>/exchange-mcp-server.git
cd exchange-mcp-server
npm install

# 1. Configure — Option A: Wizard (recommended, Production file-based)
npm run build
npx exchange-mcp init
# Prompts: Exchange FQDN (mail.contoso.com), Username, Password env var (EXCHANGE_PASSWORD), insecure? No
# Tests both PowerShell + EWS (https://<fqdn>/PowerShell + /EWS/Exchange.asmx), writes config.yaml with
# password: "${EXCHANGE_PASSWORD}" — then set: export EXCHANGE_PASSWORD='...' (or $env:EXCHANGE_PASSWORD in PowerShell)
# Or manually: cp config.example.yaml config.yaml && edit

# 2. Build & run
npm run build
npm start                                    # stdio (default)
# or: node dist/server.js --config=./config.yaml --transport=http  # http :3000

# 3. Verify (tests PowerShell + EWS)
npx exchange-mcp doctor --endpoint https://mail.contoso.com  # both targets
npm test                                     # 4/4
npx @modelcontextprotocol/inspector node dist/server.js --config=./config.yaml
# Open inspector URL, confirm 187 tools

# 4. Connect a client (see below), then ask:
#   "list mailboxes with exchange_list_mailboxes"
#   "show queue health on MAIL01 with exchange_get_queue"
```

### Simplest Install — Wizard + Auto-Patch (Production, file-based)

```bash
# After git clone + npm install + npm run build:
npx exchange-mcp init
# → creates config.yaml with ${EXCHANGE_PASSWORD}, tests PowerShell + EWS

npx exchange-mcp add --client opencode,claude-code
# → patches ~/.config/opencode/opencode.jsonc and ~/.claude.json (or runs `claude mcp add`)
# → backup *.bak.YYYYMMDD

npx exchange-mcp doctor  # re-tests both endpoints
opencode mcp list        # ✓ exchange connected
claude mcp list          # ✓ exchange connected
```

---

## Configuration (MCP Server)

### Config File

Copy one of the examples and edit `config.yaml` (gitignored — never commit secrets):

- `config.example.yaml` — generic (`https://mail.contoso.com`, `insecure: false`, example user `admin@contoso.com`)
- `config.production.yaml.example` — production template; lab variant commented inside

```yaml
# config.yaml — all 187 tools are always enabled (no enableAdminTools/enableMailboxTools gating)
exchange:
  endpoint: https://mail.contoso.com       # or https://exchange.lab.local for lab
  version: auto                           # 2013|2016|2019|auto
  provider: auto                          # ews|rest|powershell|auto
  ewsPath: /EWS/Exchange.asmx
  restPath: /api/v2.0
  powershellUri: https://mail.contoso.com/PowerShell  # CRITICAL: https://<fqdn>/PowerShell
  insecure: false                         # lab self-signed: true, prod: false
  tls:
    rejectUnauthorized: true              # lab: false, prod: true
    allowSelfSigned: false

auth:
  method: basic                           # basic|oauth|certificate
  basic:
    username: admin@contoso.com
    password: "${EXCHANGE_PASSWORD}"     # or 'yourPassword' — use env var for secrets
    domain: CONTOSO
  oauth:
    authority: https://adfs.contoso.local/adfs
    clientId: "${OAUTH_CLIENT_ID}"
    clientSecret: "${OAUTH_CLIENT_SECRET}"
  certificate:
    pfxPath: ./cert.pfx
    passphrase: "${CERT_PASSPHRASE}"

server:
  transport: stdio                        # stdio|http
  port: 3000
  host: 0.0.0.0
```

### Lab (Self-Signed Cert) vs Production

| Environment | `exchange.insecure` | `tls.rejectUnauthorized` | How |
|---|---|---|---|
| **Lab** (self-signed, e.g. `exchange.lab.local`) | `true` | `false` | `src/utils/tls.ts:1` creates `https.Agent({ rejectUnauthorized: false })` for EWS/REST/PowerShell/OAuth + WinRM `SkipCACheck` |
| **Production** (public cert, e.g. `mail.contoso.com`) | `false` | `true` | Strict verification (default) |

Also via env: `EXCHANGE_INSECURE=true` or `EXCHANGE_POWERSHELL_URL=https://<fqdn>/PowerShell`. Server logs `insecure=true [DEV: self-signed allowed]` at startup (`src/server.ts:44`) and `Exchange targets — endpoint=... | powershellUri=...` for 404 diagnostics.

Lab example:
```yaml
exchange:
  endpoint: https://exchange.lab.local
  powershellUri: https://exchange.lab.local/PowerShell
  insecure: true
  tls: { rejectUnauthorized: false, allowSelfSigned: true }
```

### Auth

**Basic (lab, simple):**
```yaml
auth: { method: basic, basic: { username: admin@lab.local, password: '...', domain: LAB } }
# or env: EXCHANGE_PASSWORD / AUTH_METHOD
```

**OAuth 2.0 (ADFS/Azure AD, `client_credentials`):**
```yaml
auth:
  method: oauth
  oauth:
    authority: https://adfs.contoso.local/adfs
    clientId: your-client-id
    clientSecret: your-secret
    scope: https://mail.contoso.local/.default
```

**Certificate (mTLS):**
```yaml
auth: { method: certificate, certificate: { pfxPath: ./cert.pfx, passphrase: '...' } }
# or certPath + keyPath for PEM
```

### All Options & Env Vars

| Config Path | Env Override | Default | Desc |
|---|---|---|---|
| `exchange.endpoint` | `EXCHANGE_ENDPOINT` | `https://mail.contoso.local` | Base URL (scheme+host) |
| `exchange.powershellUri` | `EXCHANGE_POWERSHELL_URL` / `EXCHANGE_SERVER` | `https://mail.contoso.local/PowerShell` | Full PowerShell URI — use `EXCHANGE_SERVER=<fqdn>` to auto-set both |
| `exchange.insecure` | `EXCHANGE_INSECURE` | `false` | `true` = allow self-signed |
| `exchange.tls.rejectUnauthorized` | — | `true` | `false` for lab |
| `auth.method` | `AUTH_METHOD` | `basic` | `basic|oauth|certificate` |
| `auth.basic.password` | `EXCHANGE_PASSWORD` | — | — |
| `auth.oauth.clientId` | `OAUTH_CLIENT_ID` | — | — |
| `server.transport` | `MCP_TRANSPORT` | `stdio` | `stdio|http` |
| `server.port` | `PORT` | `3000` | HTTP port |

Load order: `defaults` < `config.yaml` (or `--config=path`, then `config.yml`/`config.json`/`config.example.yaml` fallback) < env vars. YAML values support `${ENV}` expansion (`src/config.ts:1`).

---

## Connect to Clients (MCP Clients)

> All clients use **stdio** for local (one client per server process) or **HTTP** for shared/remote. Build first: `npm run build`. Config file path must be **absolute**.

### OpenCode

**File:** `~/.config/opencode/opencode.jsonc` (`C:\Users\<you>\.config\opencode\opencode.jsonc` on Windows)

**Stdio (recommended):**
```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "exchange": {
      "type": "local",
      "command": ["node", "D:/ProjMachsol/MCP/ExchangeServer/dist/server.js", "--config=D:/ProjMachsol/MCP/ExchangeServer/config.yaml"],
      "enabled": true
    }
  }
}
```

**With env (no config file):**
```json
{
  "mcp": {
    "exchange": {
      "type": "local",
      "command": ["node", "D:/ProjMachsol/MCP/ExchangeServer/dist/server.js"],
      "enabled": true,
      "environment": {
        "EXCHANGE_ENDPOINT": "https://mail.contoso.com",
        "EXCHANGE_POWERSHELL_URL": "https://mail.contoso.com/PowerShell",
        "AUTH_METHOD": "basic",
        "EXCHANGE_PASSWORD": "yourPassword",
        "EXCHANGE_INSECURE": "false"
      }
    }
  }
}
```

Verify: `opencode mcp list` → `✓ exchange connected`. Restart OpenCode TUI. Test: prompt `run exchange_test_connection`.

### Claude Code (CLI)

**CLI:** `claude` (Anthropic Claude Code)

```bash
# Add server (stdio):
claude mcp add exchange -- node /absolute/path/to/dist/server.js --config=/absolute/path/to/config.yaml

# Or with env:
claude mcp add exchange --env EXCHANGE_ENDPOINT=https://mail.contoso.com --env EXCHANGE_PASSWORD=yourPassword -- node /absolute/path/to/dist/server.js

# List / remove:
claude mcp list
claude mcp remove exchange

# Config file: ~/.claude.json  (managed by CLI, or edit manually)
# {
#   "mcpServers": {
#     "exchange": {
#       "command": "node",
#       "args": ["/absolute/path/to/dist/server.js", "--config=/absolute/path/to/config.yaml"]
#     }
#   }
# }
```

Restart `claude` session. Run `/mcp` to see tools, or prompt `use exchange_list_mailboxes`.

### Claude Desktop

**File:** `claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "exchange": {
      "command": "node",
      "args": ["/absolute/path/to/dist/server.js", "--config=/absolute/path/to/config.yaml"],
      "env": {
        "EXCHANGE_INSECURE": "false"
      }
    }
  }
}
```

Restart Claude Desktop. Tools appear in `🔨` panel. For self-signed lab, add `"EXCHANGE_INSECURE": "true"` to `env`.

### Cursor

**File:** `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project)

```json
{
  "mcpServers": {
    "exchange": {
      "command": "node",
      "args": ["/absolute/path/to/dist/server.js", "--config=/absolute/path/to/config.yaml"]
    }
  }
}
```

Or via Cursor UI: `Cursor Settings → Features → MCP Servers → Add new global MCP server` → paste above.

Restart Cursor. Check `View → Output → MCP` for logs.

### Codex (OpenAI)

**File:** `~/.codex/config.toml` (Codex CLI) or `~/.config/codex/config.json`

**TOML:**
```toml
[mcp_servers.exchange]
command = "node"
args = ["/absolute/path/to/dist/server.js", "--config=/absolute/path/to/config.yaml"]
# env = { EXCHANGE_INSECURE = "false" }  # if needed
```

**JSON alternative (`config.json`):**
```json
{
  "mcpServers": {
    "exchange": {
      "command": "node",
      "args": ["/absolute/path/to/dist/server.js", "--config=/absolute/path/to/config.yaml"]
    }
  }
}
```

Run `codex --help` → MCP section, or `codex mcp list` if available.

### Windsurf

**File:** `~/.codeium/windsurf/mcp_config.json` (or `~/.windsurf/mcp.json` per version) — check Windsurf docs: `Windsurf → Settings → MCP`.

```json
{
  "mcpServers": {
    "exchange": {
      "command": "node",
      "args": ["/absolute/path/to/dist/server.js", "--config=/absolute/path/to/config.yaml"]
    }
  }
}
```

Restart Windsurf. Verify in `MCP Servers` panel.

### VS Code (MCP Extension)

**Prerequisite:** Install MCP extension (e.g. `MCP` by Anthropic or `Claude Dev`).

**File:** `.vscode/mcp.json` (project) or `~/.vscode/mcp.json` (user) or via `settings.json`:

```json
// .vscode/mcp.json
{
  "servers": {
    "exchange": {
      "command": "node",
      "args": ["/absolute/path/to/dist/server.js", "--config=/absolute/path/to/config.yaml"],
      "env": {
        "EXCHANGE_INSECURE": "false"
      }
    }
  }
}
```

Or `settings.json`:
```json
{
  "mcp.servers": {
    "exchange": {
      "command": "node",
      "args": ["/absolute/path/to/dist/server.js", "--config=/absolute/path/to/config.yaml"]
    }
  }
}
```

Reload VS Code (`Developer: Reload Window`). Check `MCP: Show Installed Servers` command.

### Generic / Any MCP Client (stdio vs HTTP)

**Stdio (local, one client at a time):**
```bash
node /absolute/path/to/dist/server.js --config=/absolute/path/to/config.yaml
# Client config: command = "node", args = ["/path/dist/server.js", "--config=/path/config.yaml"]
```

**HTTP / SSE (shared, remote, Docker):**
```bash
# Server: set transport http
# config.yaml: server.transport: http, port: 3000
node dist/server.js --transport=http --config=./config.yaml
# or
docker compose up --build
curl http://localhost:3000/health  # {"status":"ok","endpoint":"https://mail.contoso.com"}
```

Client (remote type):
```json
{
  "mcpServers": {
    "exchange": {
      "type": "http",
      "url": "http://localhost:3000/sse"
    }
  }
}
```

For OpenCode remote:
```json
{
  "mcp": {
    "exchange": {
      "type": "remote",
      "url": "http://localhost:3000/sse",
      "enabled": true
    }
  }
}
```

> Note: `stdio` servers are **per-client** — two clients cannot share the same `node` process. Use `http` mode for multi-client or Docker.

**Inspector (test any server):**
```bash
npx @modelcontextprotocol/inspector node dist/server.js --config=./config.yaml
# Open http://localhost:6274 → List Tools → Try exchange_test_connection
```

---

## Tools Reference — 187 tools (all open, no gating)

| Group | Cmdlet Base | Tools |
|---|---|---|
| **Recipients** (13) — EAC Recipients | `Get/Set/New-Mailbox`, `Get-MailboxStatistics/Permission`, `Get-DistributionGroup*`, `Get-MailContact/User`, `Get-CASMailbox` | `exchange_list_mailboxes`, `exchange_get_mailbox`, `exchange_get_mailbox_statistics`, `exchange_get_mailbox_permissions`, `exchange_create_mailbox` (now with `password` + `shared/room/equipment`), `exchange_set_mailbox`, `exchange_remove_mailbox`, `exchange_list_distribution_groups`, `exchange_get_distribution_group_member`, `exchange_list_dynamic_distribution_groups`, `exchange_list_mail_contacts`, `exchange_list_mail_users`, `exchange_get_cas_mailbox` |
| **Mail Flow / Transport** (13) — EAC Mail flow | `Get-TransportRule`, `Get-Send/ReceiveConnector`, `Get-Accepted/RemoteDomain`, `Get-Queue/Digest`, `Retry/Suspend/Resume-Queue`, `Get-MessageTrackingLog/Trace` | `exchange_get_transport_rules`, `exchange_list_send_connectors`, `exchange_list_receive_connectors`, `exchange_list_accepted_domains`, `exchange_list_remote_domains`, `exchange_get_queue`, `exchange_get_queue_digest`, `exchange_retry_queue`, `exchange_suspend_queue`, `mailflow.resume_queue`, `exchange_get_message_tracking_log`, `mailflow.get_message_trace`, `mailflow.get_ndr_details`, `mailflow.test_smtp_connectivity` |
| **Servers / DB / DAG / Certs** (18) — EAC Servers + HA | `Get-ExchangeServer`, `Get-MailboxDatabase*`, `Get-DatabaseAvailabilityGroup`, `Get-ExchangeCertificate`, `Get-*VirtualDirectory`, `Get-TransportService` | `exchange_list_servers`, `server.list`, `exchange_get_server`/`server.get_info`, `exchange_list_mailbox_databases`/`database.list`, `exchange_get_mailbox_database`, `exchange_get_database_copy_status`/`database.get_copy_status`, `database.mount`/`dismount`/`move_active`/`suspend/resume/add/remove_copy`/`new_repair_request`/`get_backup_status`/`get_whitespace_and_growth`, `exchange_get_dag`/`dag.list`/`get_info`/`get_witness_status`/`set_activation_policy`/`simulate_failover_check`, `exchange_get_exchange_certificate`, `certificate.get_expiring`/`enable_services`, `exchange_get_virtual_directory`/`clientaccess.get_virtual_directories`, `exchange_get_transport_service` |
| **Monitoring / Health** (14) — Managed Availability + `server.*` | `Get-ServerHealth`, `Get-HealthReport`, `Test-Service/Replication/MailflowHealth`, `Get-ServerComponentState`, `Get-MonitoringItemIdentity`, `Get-Service`, `Get-WinEvent`, `Get-Counter`, `Get-WmiObject`, `HealthChecker.ps1` | `exchange_get_server_health`, `exchange_get_health_report`, `exchange_test_service_health`, `exchange_test_replication_health`, `exchange_get_server_component_state`, `exchange_get_monitoring_item`, `exchange_test_mailflow`, `exchange_get_role_groups`, `exchange_search_admin_audit_log`, `exchange_test_connection`, `server.get_services_status`, `server.restart_service`, `server.get_event_log_errors`, `server.get_performance_counters`, `server.get_disk_space`, `server.get_uptime`, `server.run_healthchecker` |
| **Compliance / Hold / OOF** (17) — Holds & Mailbox Features | `Get/Set-Mailbox` LitigationHold, `Get-MailboxSearch`, `Get/Set-MailboxAutoReplyConfiguration`, `Get-InboxRule`, `Get-MailboxFolderPermission`, `Get-RetentionPolicy*` | `exchange_get_litigation_hold`, `exchange_set_litigation_hold`, `exchange_get_inplace_hold`, `exchange_get_retention_policy`/`_tag`, `exchange_get_journal_rule`, `exchange_get_mailbox_junk_config`, `exchange_get_oof`, `exchange_set_oof`, `exchange_get_inbox_rules`, `exchange_get_mailbox_folder_permission`, `exchange_get_archive_status`, `exchange_get_mailbox_quota`, `exchange_get_mobile_device`, `exchange_get_public_folder`, `exchange_get_transport_config` |
| **Search / Mailbox / Groups** (8) | `Search-Mailbox`, `Get-MessageTrackingLog`, `New-MoveRequest`, `Get-MailboxFolderStatistics` | `exchange_search_mailbox`, `exchange_get_message_tracking_log`, `mailbox.get_folder_statistics`, `mailbox.set_quota`, `mailbox.new_move_request`/`get_move_request_status`, `mailbox.add/remove_permission`, `group.new`/`add_member`, `contact.list` |
| **ClientAccess / Certs / Security / Logs / Reports** (15) | `Test-OwaConnectivity`, `Resolve-DnsName`, `Enable-ExchangeCertificate`, `Search-MailboxAuditLog`, `Get-PublicFolderStatistics`, `Get-ChildItem` logs | `clientaccess.get_virtual_directories`, `clientaccess.test_owa`, `clientaccess.get_autodiscover_info`, `certificate.get_expiring`, `certificate.enable_services`, `security.get_role_group_members`, `security.get_mailbox_audit_log`, `publicfolder.get_statistics`, `log.tail_transport_log`/`tail_iis_log`, `report.generate_health_summary`/`mailbox_size_report`/`certificate_expiry_report` |
| **Mailbox (EWS/REST)** (13) — optional but now also open | `EWS`, `REST` | `exchange_list_messages`, `exchange_get_message`, `exchange_send_message`, `exchange_reply_message`, `exchange_forward_message`, `exchange_delete_message`, `exchange_move_message`, `exchange_search_messages`, `exchange_list_calendar_events`, `exchange_create_calendar_event`, `exchange_get_availability`, `exchange_list_contacts`, `exchange_list_tasks` (`src/tools/mail-tools.ts:1`, `calendar-tools.ts:1`, `contact-tools.ts:1`) |

All 187 tools always enabled. Resources: `exchange://folders` (`src/resources/folder-resource.ts:1`). Prompts: `triage-inbox`, `schedule-meeting` (`src/prompts/index.ts:1`). Previous gating via `enableAdminTools`/`enableMailboxTools` removed (still accepted in YAML for backward compat but ignored).

---

## Examples

**Admin (PowerShell-backed):**

```
"Show mailbox stats for admin@contoso.com"  → exchange_get_mailbox_statistics
"List queues on MAIL01 with >100 messages"      → exchange_get_queue { server: "MAIL01", filter: "MessageCount -gt 100" }
"Track email from sender@contoso.com today"       → exchange_get_message_tracking_log { sender: "sender@contoso.com", start: "2026-09-02T00:00:00Z" }
"Is DAG healthy?"                                → exchange_get_database_copy_status { identity: "*" } + exchange_get_server_health { server: "MAIL01" }
"Check cert expiry"                              → exchange_get_exchange_certificate
"Test connectivity (404 debug)"                  → exchange_test_connection { target: "powershell" }
```

**Mailbox (if enabled):**

```
"List inbox top 5" → exchange_list_messages { folder: "inbox", top: 5 }
"Send meeting invite" → exchange_create_calendar_event { subject: "...", start: "...", attendees: [...] }
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `EISDIR: illegal operation on a directory` | `config.yaml` was a directory — delete it and `cp config.example.yaml config.yaml` |
| `Basic auth requires username and password` | Add `auth.basic.username`/`password` in `config.yaml` or env `EXCHANGE_PASSWORD` |
| `Tool ... is already registered` | Remove duplicate registration (fixed in `src/tools/admin-tools.ts:1` stub) |
| `PowerShell auth failed` / `401` | Check user, domain, password; verify `powershellUri` and that account has RBAC role (`Get-ManagementRoleAssignment`); for Basic, enable `Set-PowerShellVirtualDirectory -BasicAuthentication:$true` |
| `PowerShell error 404` | Wrong `powershellUri` — must be `https://<fqdn>/PowerShell` (capital P/S). Set `EXCHANGE_POWERSHELL_URL` or `EXCHANGE_SERVER=<fqdn>`, verify `Get-PowerShellVirtualDirectory`, `Test-WSMan` |
| `PowerShell error 415` | HTTP POST with wrong Content-Type — fixed via WinRM on Windows (`src/clients/powershell-provider.ts:56` uses `New-PSSession` with `SkipCACheck`). Run MCP on Windows for PowerShell tools. |
| `Cmdlet not allowed: X` | Add cmdlet to `ALLOWED_CMDLETS` in `src/clients/powershell-provider.ts:7` |
| `certificate has expired / self-signed` | Set `exchange.insecure: true` / `rejectUnauthorized: false` for lab (`src/utils/tls.ts:1`) or install valid cert for prod |
| `opencode mcp list` shows `✗` / `claude mcp list` fails | `npm run build`, check absolute path in client config, restart client |
| `exchange_test_connection` shows 404 | Copy suggested fix: `EXCHANGE_POWERSHELL_URL=https://<fqdn>/PowerShell` |
| Queues always empty | Works only on-prem; `Get-Queue` requires Mailbox/Edge role + `Transport Queues` role |

Debug: `npx @modelcontextprotocol/inspector node dist/server.js --config=./config.yaml` then `Get-ServerHealth` etc. Logs via `src/server.ts:44` (`Exchange targets — ...`).

---

## Development

```bash
npm install
npm run dev          # tsx watch stdio
npm test             # vitest
npm run build        # tsc → dist/
npx @modelcontextprotocol/inspector node dist/server.js --config=./config.yaml
```

Structure: `src/server.ts:1` (MCP wiring) · `src/config.ts:1` · `src/auth/*` (basic/oauth/cert) · `src/clients/*` (ews/rest/powershell + `exchange-client.ts:1` auto-fallback + `powershell-provider.ts:56` WinRM) · `src/tools/admin-*` · `src/resources/*` · `src/utils/tls.ts:1`.

Design spec: `docs/superpowers/specs/2026-09-02-exchange-mcp-design.md`.

---

## Security Notes

- Never commit `config.yaml` (gitignored) or `.env` containing passwords/certs. Use `config.example.yaml` as template.
- Admin tools are **powerful** (create/remove mailboxes, transport rules, `server.restart_service`, `database.mount` etc.). RBAC still enforced by Exchange; allowlist in `src/clients/powershell-provider.ts:7` prevents arbitrary cmdlet execution — add only needed cmdlets.
- Prefer OAuth/Certificate over Basic in production. Use valid certs (`insecure: false`).
- `src/auth/oauth-auth.ts:1` caches tokens in-memory; `src/auth/cert-auth.ts:1` uses `https.Agent` with `pfx`/`cert`.
- WinRM on Windows uses `PSSessionOption -SkipCACheck` when `insecure: true` — only for lab.

---

## Contributing

PRs welcome — especially for additional Exchange cmdlets, tests, and deployment recipes (K8s, systemd). Please run `npm run build && npm test` and do not commit `config.yaml`/`*.pfx`.

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgements

Built on [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk), against [Exchange Server documentation](https://learn.microsoft.com/en-us/exchange/exchange-server) & [Exchange PowerShell](https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/?view=exchange-ps).
