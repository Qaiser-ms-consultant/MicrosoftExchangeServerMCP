# Exchange MCP Server — Microsoft Exchange Server On-Premise

> **Model Context Protocol (MCP) server for Exchange Server on-premise administration, monitoring & troubleshooting** — EWS + REST + PowerShell Remoting, admin-first, lab & production ready.

[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-1.x-blueviolet)](https://modelcontextprotocol.io)
[![Exchange](https://img.shields.io/badge/Exchange-2013%20%7C%202016%20%7C%202019%20%7C%20SE-blue)](https://learn.microsoft.com/en-us/exchange/exchange-server)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**For:** Exchange admins who want AI assistants (OpenCode, Claude Desktop, Cursor, etc.) to run **real Exchange Management Shell tasks** — recipient provisioning, transport troubleshooting, DAG/health monitoring — against **on-premise Exchange**, not Exchange Online.

---

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
  - [Lab (Self-Signed Cert) vs Production](#lab-self-signed-cert-vs-production)
  - [Auth](#auth)
  - [All Options](#all-options)
- [Connect to Clients](#connect-to-clients)
  - [OpenCode](#opencode)
  - [Claude Desktop](#claude-desktop)
  - [Cursor / Any MCP Client](#cursor--any-mcp-client)
  - [HTTP / Docker (Remote)](#http--docker-remote)
- [Tools Reference](#tools-reference)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Security Notes](#security-notes)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **40 admin tools** (active by default) mapped to **Exchange Management Shell** & **EAC** feature areas ([docs](https://learn.microsoft.com/en-us/exchange/exchange-server)): Recipients, Mail Flow, Servers/Databases/DAG, Monitoring/Troubleshooting. 13 mailbox tools optional.
- **Multi-version:** 2013 / 2016 / 2019 / SE (auto-detect, REST preferred on 2016+, EWS fallback, PowerShell for admin).
- **Multi-auth:** Basic (lab), OAuth 2.0 via ADFS/Azure AD (`client_credentials`), Certificate mTLS (`pfx`/`pem`).
- **Multi-transport:** `stdio` for local clients, `http`/`SSE` for remote/Docker.
- **Lab-friendly:** `insecure`/`rejectUnauthorized: false` for self-signed lab certs (e.g. `https://exchange.lab.local`) with production-strict default.
- **No secrets in repo:** `config.yaml` gitignored, env-var expansion (`${VAR}`) supported.

---

## Prerequisites

- **Node.js ≥ 20** (`node -v`)
- **Exchange Server** 2013+ on-prem with network reachability:
  - EWS: `https://<host>/EWS/Exchange.asmx` (often `443`)
  - REST (2016+): `https://<host>/api/v2.0`
  - PowerShell Remoting: `https://<host>/PowerShell` (WinRM `/PowerShell` virtual directory, 443/5986)
- Credentials with **appropriate RBAC roles** (e.g. `Organization Management`, `Recipient Management`, `View-Only Configuration` + `Transport Queues` for `Get-Queue`). Minimal roles per cmdlet: `Get-ManagementRole -Cmdlet Get-Queue` etc.

---

## Quick Start

```bash
git clone https://github.com/<your-org>/exchange-mcp-server.git
cd exchange-mcp-server
npm install

# 1. Configure (generic example → your environment)
cp config.example.yaml config.yaml          # edit endpoint, username, password
# or cp config.production.yaml.example config.yaml  # production template
# Edit: endpoint, username, password, insecure flag

# 2. Build & run
npm run build
npm start                                    # stdio (default)
# or: node dist/server.js --config=./config.yaml --transport=http  # http :3000

# 3. Verify
npm test                                     # 4/4
npx @modelcontextprotocol/inspector node dist/server.js --config=./config.yaml
# Open inspector URL, confirm tools list

# 4. Connect a client (see below), then ask:
#   "list mailboxes with exchange_list_mailboxes"
#   "show queue health on MAIL01 with exchange_get_queue"
```

---

## Configuration

Copy one of the examples and edit `config.yaml` (gitignored — never commit secrets):

- `config.example.yaml` — generic (`https://mail.contoso.com`, `insecure: false`, example user `admin@contoso.com`)
- `config.production.yaml.example` — production template; lab variant commented inside

```yaml
# config.yaml
exchange:
  endpoint: https://mail.contoso.com       # or https://exchange.lab.local for lab
  version: auto                           # 2013|2016|2019|auto
  provider: auto                          # ews|rest|powershell|auto
  ewsPath: /EWS/Exchange.asmx
  restPath: /api/v2.0
  powershellUri: https://mail.contoso.com/PowerShell
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
  enableAdminTools: true                  # admin-only by default
  enableMailboxTools: false               # set true to enable mail/calendar/contacts tools
```

### Lab (Self-Signed Cert) vs Production

| Environment | `exchange.insecure` | `tls.rejectUnauthorized` | How |
|---|---|---|---|
| **Lab** (self-signed, e.g. `exchange.lab.local`) | `true` | `false` | `src/utils/tls.ts:1` creates `https.Agent({ rejectUnauthorized: false })` for EWS/REST/PowerShell/OAuth |
| **Production** (public cert, e.g. `mail.contoso.com`) | `false` | `true` | Strict verification (default) |

Also via env: `EXCHANGE_INSECURE=true`. Server logs `insecure=true [DEV: self-signed allowed]` at startup (`src/server.ts:44`).

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

### All Options

Env overrides (highest priority): `EXCHANGE_ENDPOINT`, `EXCHANGE_VERSION`, `EXCHANGE_PROVIDER`, `AUTH_METHOD`, `EXCHANGE_PASSWORD`, `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `MCP_TRANSPORT`, `PORT`, `ENABLE_ADMIN_TOOLS`, `ENABLE_MAILBOX_TOOLS`, `EXCHANGE_INSECURE`.

Load order: `defaults` < `config.yaml` (or `--config=path`, then `config.yml`/`config.json`/`config.example.yaml` fallback) < env vars. YAML values support `${ENV}` expansion (`src/config.ts:1`).

---

## Connect to Clients

### OpenCode

`~/.config/opencode/opencode.jsonc` (`C:\Users\<you>\.config\opencode\opencode.jsonc` on Windows):

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

Or with env:

```json
{
  "mcp": {
    "exchange": {
      "type": "local",
      "command": ["node", "D:/ProjMachsol/MCP/ExchangeServer/dist/server.js"],
      "enabled": true,
      "environment": {
        "EXCHANGE_ENDPOINT": "https://mail.contoso.com",
        "AUTH_METHOD": "basic",
        "EXCHANGE_PASSWORD": "yourPassword",
        "EXCHANGE_INSECURE": "false"
      }
    }
  }
}
```

Verify: `opencode mcp list` → `✓ exchange connected`. Restart OpenCode TUI.

### Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "exchange": {
      "command": "node",
      "args": ["D:/ProjMachsol/MCP/ExchangeServer/dist/server.js", "--config=D:/ProjMachsol/MCP/ExchangeServer/config.yaml"]
    }
  }
}
```

Restart Claude Desktop. Tools appear in `🔨` panel.

### Cursor / Any MCP Client

Stdio command: `node /absolute/path/to/dist/server.js --config=/absolute/path/to/config.yaml`

### HTTP / Docker (Remote)

```bash
# config.yaml: server.transport: http, port: 3000
node dist/server.js --transport=http --config=./config.yaml
# or
docker compose up --build
curl http://localhost:3000/health  # {"status":"ok","endpoint":"..."}
```

Remote MCP URL: `http://localhost:3000/sse` (type `remote` in client config).

---

## Tools Reference

**Admin — active by default** (`enableAdminTools: true`, 40 tools):

| Group | Cmdlet Base | Tools |
|---|---|---|
| **Recipients** (13) — EAC Recipients | `Get/Set/New-Mailbox`, `Get-MailboxStatistics/Permission`, `Get-DistributionGroup*`, `Get-MailContact/User`, `Get-CASMailbox` | `exchange_list_mailboxes`, `exchange_get_mailbox`, `exchange_get_mailbox_statistics`, `exchange_get_mailbox_permissions`, `exchange_create_mailbox`, `exchange_set_mailbox`, `exchange_remove_mailbox`, `exchange_list_distribution_groups`, `exchange_get_distribution_group_member`, `exchange_list_dynamic_distribution_groups`, `exchange_list_mail_contacts`, `exchange_list_mail_users`, `exchange_get_cas_mailbox` |
| **Mail Flow / Transport** (10) — EAC Mail flow | `Get-TransportRule`, `Get-Send/ReceiveConnector`, `Get-Accepted/RemoteDomain`, `Get-Queue/Digest`, `Retry/Suspend-Queue`, `Get-MessageTrackingLog` | `exchange_get_transport_rules`, `exchange_list_send_connectors`, `exchange_list_receive_connectors`, `exchange_list_accepted_domains`, `exchange_list_remote_domains`, `exchange_get_queue`, `exchange_get_queue_digest`, `exchange_retry_queue`, `exchange_suspend_queue`, `exchange_get_message_tracking_log` |
| **Servers / DB / DAG / Certs** (9) — EAC Servers + HA | `Get-ExchangeServer`, `Get-MailboxDatabase*`, `Get-DatabaseAvailabilityGroup`, `Get-ExchangeCertificate`, `Get-*VirtualDirectory`, `Get-TransportService` | `exchange_list_servers`, `exchange_get_server`, `exchange_list_mailbox_databases`, `exchange_get_mailbox_database`, `exchange_get_database_copy_status`, `exchange_get_dag`, `exchange_get_exchange_certificate`, `exchange_get_virtual_directory`, `exchange_get_transport_service` |
| **Monitoring / Troubleshooting** (8) — Managed Availability | `Get-ServerHealth`, `Get-HealthReport`, `Test-Service/Replication/MailflowHealth`, `Get-ServerComponentState`, `Get-MonitoringItemIdentity`, `Get-RoleGroup`, `Search-AdminAuditLog` | `exchange_get_server_health`, `exchange_get_health_report`, `exchange_test_service_health`, `exchange_test_replication_health`, `exchange_get_server_component_state`, `exchange_get_monitoring_item`, `exchange_test_mailflow`, `exchange_get_role_groups`, `exchange_search_admin_audit_log` |

**Mailbox — disabled by default** (`enableMailboxTools: false`):

`exchange_list_messages`, `exchange_get_message`, `exchange_send_message`, `exchange_reply_message`, `exchange_forward_message`, `exchange_delete_message`, `exchange_move_message`, `exchange_search_messages`, `exchange_list_calendar_events`, `exchange_create_calendar_event`, `exchange_get_availability`, `exchange_list_contacts`, `exchange_list_tasks` (`src/tools/mail-tools.ts:1`, `calendar-tools.ts:1`, `contact-tools.ts:1`)

Enable: set `server.enableMailboxTools: true` or `ENABLE_MAILBOX_TOOLS=true`.

Resources: `exchange://folders` (`src/resources/folder-resource.ts:1`). Prompts: `triage-inbox`, `schedule-meeting` (`src/prompts/index.ts:1`).

---

## Examples

**Admin (PowerShell-backed):**

```
"Show mailbox stats for admin@contoso.com"  → exchange_get_mailbox_statistics
"List queues on MAIL01 with >100 messages"      → exchange_get_queue { server: "MAIL01", filter: "MessageCount -gt 100" }
"Track email from sender@contoso.com today"       → exchange_get_message_tracking_log { sender: "sender@contoso.com", start: "2026-09-02T00:00:00Z" }
"Is DAG healthy?"                                → exchange_get_database_copy_status { identity: "*" } + exchange_get_server_health { server: "MAIL01" }
"Check cert expiry"                              → exchange_get_exchange_certificate
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
| `PowerShell auth failed` / `401` | Check user, domain, password; verify `powershellUri` and that account has RBAC role (`Get-ManagementRoleAssignment`) |
| `Cmdlet not allowed: X` | Add cmdlet to `ALLOWED_CMDLETS` in `src/clients/powershell-provider.ts:7` |
| `certificate has expired / self-signed` | Set `exchange.insecure: true` / `rejectUnauthorized: false` for lab (`src/utils/tls.ts:1`) or install valid cert for prod |
| `opencode mcp list` shows `✗` | `npm run build`, check path in `opencode.jsonc`, restart OpenCode |
| Queues always empty | Works only on-prem; `Get-Queue` requires Mailbox/Edge role + `Transport Queues` role |

Debug: `npx @modelcontextprotocol/inspector node dist/server.js --config=./config.yaml` then `Get-ServerHealth` etc. Logs via `src/server.ts:44` + `LOG_LEVEL` (future).

---

## Development

```bash
npm install
npm run dev          # tsx watch stdio
npm test             # vitest
npm run build        # tsc → dist/
npx @modelcontextprotocol/inspector node dist/server.js --config=./config.yaml
```

Structure: `src/server.ts:1` (MCP wiring) · `src/config.ts:1` · `src/auth/*` (basic/oauth/cert) · `src/clients/*` (ews/rest/powershell + `exchange-client.ts:1` auto-fallback) · `src/tools/admin-*` · `src/resources/*` · `src/utils/tls.ts:1`.

Design spec: `docs/superpowers/specs/2026-09-02-exchange-mcp-design.md`.

---

## Security Notes

- Never commit `config.yaml` (gitignored) or `.env` containing passwords/certs. Use `config.example.yaml` as template.
- Admin tools are **powerful** (create/remove mailboxes, transport rules). Gate with `enableAdminTools` and RBAC. Allowlist in `src/clients/powershell-provider.ts:7` prevents arbitrary cmdlet execution — add only needed cmdlets.
- Prefer OAuth/Certificate over Basic in production. Use valid certs (`insecure: false`).
- `src/auth/oauth-auth.ts:1` caches tokens in-memory; `src/auth/cert-auth.ts:1` uses `https.Agent` with `pfx`/`cert`.

---

## Contributing

PRs welcome — especially for additional Exchange cmdlets, tests, and deployment recipes (K8s, systemd). Please run `npm run build && npm test` and do not commit `config.yaml`/`*.pfx`.

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgements

Built on [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk), against [Exchange Server documentation](https://learn.microsoft.com/en-us/exchange/exchange-server) & [Exchange PowerShell](https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/?view=exchange-ps).
