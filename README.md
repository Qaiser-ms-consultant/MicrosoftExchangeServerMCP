# Exchange MCP Server — Microsoft Exchange Server On-Premise

> Model Context Protocol server for Exchange Server on-premise administration, monitoring and troubleshooting — PowerShell Remoting, EWS and REST, with AI-powered insights.

[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-1.x-blueviolet)](https://modelcontextprotocol.io)
[![Exchange](https://img.shields.io/badge/Exchange-2013%20%7C%202016%20%7C%202019%20%7C%20SE-blue)](https://learn.microsoft.com/en-us/exchange/exchange-server)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

Exchange administrators can use AI assistants such as OpenCode, Claude Code, Cursor and others to run real Exchange Management Shell tasks — mailbox provisioning, transport troubleshooting, database and DAG health — directly against on-premise Exchange.

---

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Connect to Clients](#connect-to-clients)
- [Tools Reference](#tools-reference)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Security Notes](#security-notes)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **200 tools** covering Exchange Management Shell and the Exchange Admin Center: Recipients, Mail Flow, Servers, Databases, DAG, Monitoring, Compliance, Client Access, Certificates, Security, Logs and Reports, plus Organization, Diagnostics and AI.
- **AI Suite (24 tools)** — executive summary, root cause analysis, anomaly detection, capacity forecast, cleanup advisor and more. Generates narrative insights from live data without requiring an external API key.
- **Reports (80+ tools)** — mailbox, database, DAG, mail flow, infrastructure and compliance reports.
- **Multiple Exchange versions:** 2013, 2016, 2019 and Subscription Edition with automatic detection.
- **Multiple authentication methods:** Basic, OAuth 2.0 via ADFS or Azure AD, and Certificate.
- **Multiple transports:** stdio for local clients and HTTP/SSE for remote or Docker deployments.
- **Support for self-signed certificates** in lab environments with strict validation in production.

---

## Prerequisites

- Node.js 20 or later
- Exchange Server 2013 or later, reachable over the network:
  - EWS: `https://<host>/EWS/Exchange.asmx`
  - REST (2016 or later): `https://<host>/api/v2.0`
  - PowerShell Remoting: `https://<host>/PowerShell` — must use the fully qualified domain name. Verify with `Get-PowerShellVirtualDirectory` and `Test-WSMan <host>`.
- Windows is recommended for PowerShell-based tools, which use PowerShell Remoting with support for self-signed certificates. On Linux or macOS, PowerShell tools require a custom wrapper.
- An account with appropriate RBAC roles, such as Organization Management or Recipient Management. To check required roles for a cmdlet, run `Get-ManagementRole -Cmdlet Get-Queue`.

---

## Quick Start

```bash
git clone https://github.com/<your-org>/exchange-mcp-server.git
cd exchange-mcp-server
npm install

# 1. Configure
npm run build
npx exchange-mcp init
# Prompts for Exchange host, username and password environment variable.
# Tests both PowerShell and EWS connectivity and writes config.yaml.
# Alternatively: cp config.example.yaml config.yaml and edit manually.

# 2. Build and run
npm run build
npm start                                    # stdio transport (default)
# or: node dist/server.js --config=./config.yaml --transport=http  # http on port 3000

# 3. Verify
npm test
npx @modelcontextprotocol/inspector node dist/server.js --config=./config.yaml
# Open the inspector URL and confirm 200 tools are listed.

# 4. Connect a client (see below) and try:
#   "list mailboxes with exchange_list_mailboxes"
#   "show queue health on MAIL01 with exchange_get_queue"
```

### Simplest Install — Wizard and Auto-Patch

```bash
# After git clone, npm install and npm run build:
npx exchange-mcp init
# Creates config.yaml with file-based password reference and tests connectivity.

npx exchange-mcp add --client opencode,claude-code
# Patches client configuration files and creates backups.

npx exchange-mcp doctor  # Tests both PowerShell and EWS endpoints
opencode mcp list        # Should show connected
claude mcp list          # Should show connected
```

---

## Configuration

### Config File

Copy an example and edit `config.yaml`. This file is ignored by git, so secrets are never committed:

- `config.example.yaml` — generic example using `https://mail.contoso.com`
- `config.production.yaml.example` — production template with lab variant in comments

```yaml
# config.yaml
exchange:
  endpoint: https://mail.contoso.com       # or https://exchange.lab.local for lab
  version: auto                           # 2013, 2016, 2019 or auto
  provider: auto                          # ews, rest, powershell or auto
  ewsPath: /EWS/Exchange.asmx
  restPath: /api/v2.0
  powershellUri: https://mail.contoso.com/PowerShell  # Must be https://<fqdn>/PowerShell
  insecure: false                         # true for lab with self-signed certificate
  tls:
    rejectUnauthorized: true              # false for lab
    allowSelfSigned: false

auth:
  method: basic                           # basic, oauth or certificate
  basic:
    username: admin@contoso.com
    password: "${EXCHANGE_PASSWORD}"     # Use an environment variable
    domain: CONTOSO
  oauth:
    authority: https://adfs.contoso.local/adfs
    clientId: "${OAUTH_CLIENT_ID}"
    clientSecret: "${OAUTH_CLIENT_SECRET}"
  certificate:
    pfxPath: ./cert.pfx
    passphrase: "${CERT_PASSPHRASE}"

server:
  transport: stdio                        # stdio or http
  port: 3000
  host: 0.0.0.0
```

### Lab with Self-Signed Certificate vs Production

| Environment | insecure | rejectUnauthorized | Notes |
|---|---|---|---|
| Lab with self-signed certificate, for example `exchange.lab.local` | `true` | `false` | Allows self-signed certificates for EWS, REST and PowerShell |
| Production with valid certificate, for example `mail.contoso.com` | `false` | `true` | Strict validation (default) |

You can also set `EXCHANGE_INSECURE=true` or `EXCHANGE_POWERSHELL_URL=https://<fqdn>/PowerShell` as environment variables. On startup the server logs whether insecure mode is enabled and which endpoints are in use.

Lab example:

```yaml
exchange:
  endpoint: https://exchange.lab.local
  powershellUri: https://exchange.lab.local/PowerShell
  insecure: true
  tls: { rejectUnauthorized: false, allowSelfSigned: true }
```

### Authentication

**Basic (simple, suitable for lab):**
```yaml
auth: { method: basic, basic: { username: admin@lab.local, password: '...', domain: LAB } }
```

**OAuth 2.0 (ADFS or Azure AD, client credentials flow):**
```yaml
auth:
  method: oauth
  oauth:
    authority: https://adfs.contoso.local/adfs
    clientId: your-client-id
    clientSecret: your-secret
    scope: https://mail.contoso.local/.default
```

**Certificate (mutual TLS):**
```yaml
auth: { method: certificate, certificate: { pfxPath: ./cert.pfx, passphrase: '...' } }
```

### All Options

| Setting | Environment Variable | Default | Description |
|---|---|---|---|
| `exchange.endpoint` | `EXCHANGE_ENDPOINT` | `https://mail.contoso.local` | Base URL including scheme and host |
| `exchange.powershellUri` | `EXCHANGE_POWERSHELL_URL` or `EXCHANGE_SERVER` | `https://mail.contoso.local/PowerShell` | Full PowerShell remoting URL. Setting `EXCHANGE_SERVER` automatically configures both endpoint and PowerShell URI |
| `exchange.insecure` | `EXCHANGE_INSECURE` | `false` | Set to `true` to allow self-signed certificates |
| `exchange.tls.rejectUnauthorized` | — | `true` | Set to `false` for lab environments |
| `auth.method` | `AUTH_METHOD` | `basic` | `basic`, `oauth` or `certificate` |
| `auth.basic.password` | `EXCHANGE_PASSWORD` | — | — |
| `auth.oauth.clientId` | `OAUTH_CLIENT_ID` | — | — |
| `server.transport` | `MCP_TRANSPORT` | `stdio` | `stdio` or `http` |
| `server.port` | `PORT` | `3000` | HTTP port when using http transport |

Configuration is loaded in the following order: defaults, then `config.yaml` (or the file specified with `--config`), then environment variables. Values in YAML may reference environment variables using `${VAR}` syntax.

---

## Connect to Clients

All clients support either stdio for local use (one client per server process) or HTTP for shared or remote use. Always build first with `npm run build` and use an absolute path to the config file.

### OpenCode

File: `~/.config/opencode/opencode.jsonc` (on Windows: `C:\Users\<you>\.config\opencode\opencode.jsonc`)

With config file:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "exchange": {
      "type": "local",
      "command": ["node", "/absolute/path/to/dist/server.js", "--config=/absolute/path/to/config.yaml"],
      "enabled": true
    }
  }
}
```

With environment variables:

```json
{
  "mcp": {
    "exchange": {
      "type": "local",
      "command": ["node", "/absolute/path/to/dist/server.js"],
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

Verify with `opencode mcp list`, which should show connected. Restart the OpenCode interface after changes.

### Claude Code (CLI)

```bash
# Add server
claude mcp add exchange -- node /absolute/path/to/dist/server.js --config=/absolute/path/to/config.yaml

# With environment variables
claude mcp add exchange --env EXCHANGE_ENDPOINT=https://mail.contoso.com --env EXCHANGE_PASSWORD=yourPassword -- node /absolute/path/to/dist/server.js

# List or remove
claude mcp list
claude mcp remove exchange
```

Restart the Claude Code session and run `/mcp` to see available tools.

### Claude Desktop

File: `claude_desktop_config.json`
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

Restart Claude Desktop. For lab environments with self-signed certificates, set `EXCHANGE_INSECURE` to `true`.

### Cursor

File: `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project)

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

You can also add the server through the Cursor user interface. Restart Cursor after changes.

### Codex (OpenAI)

File: `~/.codex/config.toml` or `~/.config/codex/config.json`

```toml
[mcp_servers.exchange]
command = "node"
args = ["/absolute/path/to/dist/server.js", "--config=/absolute/path/to/config.yaml"]
```

### Windsurf

File: `~/.codeium/windsurf/mcp_config.json` (check Windsurf documentation for the exact path)

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

### VS Code

Requires an MCP extension. Create `.vscode/mcp.json`:

```json
{
  "servers": {
    "exchange": {
      "command": "node",
      "args": ["/absolute/path/to/dist/server.js", "--config=/absolute/path/to/config.yaml"]
    }
  }
}
```

Reload the window after changes.

### Generic Client

**Stdio (local, one client at a time):**
```bash
node /absolute/path/to/dist/server.js --config=/absolute/path/to/config.yaml
```

**HTTP / SSE (shared, remote or Docker):**
```bash
# Set server.transport to http in config.yaml
node dist/server.js --transport=http --config=./config.yaml
# or
docker compose up --build
curl http://localhost:3000/health
```

Remote client configuration:

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

Note that stdio servers are per-client. Use HTTP mode when multiple clients need to share the same server.

**Inspector (for testing):**
```bash
npx @modelcontextprotocol/inspector node dist/server.js --config=./config.yaml
```

---

## Tools Reference — 200 tools

| Group | Description | Tools |
|---|---|---|
| **Recipients** | Mailboxes, distribution groups and contacts | `exchange_list_mailboxes`, `exchange_get_mailbox`, `exchange_get_mailbox_statistics`, `exchange_get_mailbox_permissions`, `exchange_create_mailbox`, `exchange_set_mailbox`, `exchange_remove_mailbox`, `exchange_list_distribution_groups`, `exchange_get_distribution_group_member`, `exchange_list_dynamic_distribution_groups`, `exchange_list_mail_contacts`, `exchange_list_mail_users`, `exchange_get_cas_mailbox` |
| **Mail Flow and Transport** | Send and receive connectors, queues, transport rules and tracking logs | `exchange_get_transport_rules`, `exchange_list_send_connectors`, `exchange_list_receive_connectors`, `exchange_list_accepted_domains`, `exchange_list_remote_domains`, `exchange_get_queue`, `exchange_get_queue_digest`, `exchange_retry_queue`, `exchange_suspend_queue`, `mailflow.resume_queue`, `exchange_get_message_tracking_log`, `mailflow.get_message_trace`, `mailflow.get_ndr_details`, `mailflow.test_smtp_connectivity` |
| **Servers, Databases, DAG and Certificates** | Exchange servers, mailbox databases, availability groups and certificates | `exchange_list_servers`, `server.list`, `exchange_get_server`/`server.get_info`, `exchange_list_mailbox_databases`/`database.list`, `exchange_get_mailbox_database`, `exchange_get_database_copy_status`, `database.mount`/`dismount`/`move_active`/`suspend`/`resume`/`add`/`remove_copy`/`new_repair_request`/`get_backup_status`/`get_whitespace_and_growth`, `exchange_get_dag`/`dag.list`, `exchange_get_exchange_certificate`, `certificate.get_expiring`, `exchange_get_virtual_directory`, `exchange_get_transport_service` |
| **Monitoring and Health** | Managed availability and server health | `exchange_get_server_health`, `exchange_get_health_report`, `exchange_test_service_health`, `exchange_test_replication_health`, `exchange_get_server_component_state`, `exchange_get_monitoring_item`, `exchange_test_mailflow`, `exchange_get_role_groups`, `exchange_search_admin_audit_log`, `exchange_test_connection`, `server.get_services_status`, `server.restart_service`, `server.get_event_log_errors`, `server.get_performance_counters`, `server.get_disk_space`, `server.get_uptime`, `server.run_healthchecker` |
| **Compliance, Hold and Mailbox Features** | Litigation hold, retention, journaling and mailbox settings | `exchange_get_litigation_hold`, `exchange_set_litigation_hold`, `exchange_get_inplace_hold`, `exchange_get_retention_policy`, `exchange_get_journal_rule`, `exchange_get_oof`, `exchange_set_oof`, `exchange_get_inbox_rules`, `exchange_get_mailbox_folder_permission`, `exchange_get_archive_status`, `exchange_get_mailbox_quota`, `exchange_get_mobile_device`, `exchange_get_public_folder` |
| **Search, Mailbox and Recovery** | Mailbox search and recovery | `exchange_search_mailbox`, `mailbox.get_folder_statistics`, `mailbox.set_quota`, `mailbox.new_move_request`, `exchange_disable_mailbox`, `exchange_connect_mailbox`, `exchange_undo_softdeleted_mailbox`, `exchange_get_softdeleted_mailbox`, `exchange_enable_mailbox`, `exchange_restore_recoverable_items`, `exchange_new_mailbox_restore_request`, `exchange_new_mailbox_import_request` |
| **Client Access, Certificates, Security, Logs and Reports** | Virtual directories, certificates, security and logs | `clientaccess.get_virtual_directories`, `certificate.get_expiring`, `security.get_role_group_members`, `log.tail_transport_log`, `report.generate_health_summary` and others |
| **Mailbox (EWS and REST)** | Email, calendar, contacts and tasks via EWS and REST | `exchange_list_messages`, `exchange_get_message`, `exchange_send_message`, `exchange_reply_message`, `exchange_forward_message`, `exchange_delete_message`, `exchange_move_message`, `exchange_search_messages`, `exchange_list_calendar_events`, `exchange_create_calendar_event`, `exchange_get_availability`, `exchange_list_contacts`, `exchange_list_tasks` |

### AI Suite — 24 tools

| Tool | Purpose |
|---|---|
| `ai.exchange_executive_summary` | Overall health score and critical warnings with recommendations |
| `ai.root_cause_analysis` | Investigates queue growth and identifies likely root cause |
| `ai.anomaly_detection` | Detects unusual sending volume and other anomalies |
| `ai.capacity_forecast` | Forecasts database and mailbox capacity |
| `ai.cleanup_recommendation` | Identifies inactive mailboxes and recoverable storage |
| `ai.mailbox_cleanup_advisor` | Per-mailbox cleanup analysis with quota and growth details |
| `ai.tell_me_everything` | Comprehensive mailbox analysis with health score and findings |
| `ai.security_risk_report` | Correlates forwarding, volume and protocol risks |
| `ai.permission_risk_report` | Finds excessive permissions |
| `ai.compromised_account_detection` | Detects potentially compromised accounts |
| `ai.mail_flow_intelligence` | Analyzes mail flow volume and trends |
| `ai.ndr_intelligence` | Groups non-delivery reports by cause |
| `ai.configuration_risk` | Scans for risky configuration |
| `ai.migration_advisor` | Assesses migration readiness |
| `ai.migration_prioritization` | Recommends migration batches |
| `ai.migration_eta` | Estimates migration completion time |
| `ai.ask_exchange` | Natural language interface to reports |
| `ai.comparative_report` | Compares servers, databases or time periods |
| `ai.change_impact_report` | Analyzes impact of configuration changes |
| `ai.what_if_analysis` | Forecasts impact of moving mailboxes |
| `ai.incident_report` | Generates incident summaries |
| `ai.daily_report` | Daily health brief |
| `ai.things_you_should_know` | Proactive alerts |
| `ai.management_report` | Executive dashboard |

### Reports — 80+ tools

Reports cover mailbox inventory and size, database growth and whitespace, DAG health, mail flow volume and non-delivery reports, infrastructure inventory, server hardware and other areas. All reports are available through the `report.*` namespace, for example `report.mailbox_inventory`, `report.database_growth_forecast`, `report.exchange_environment_overview`, and via `npx exchange-mcp doctor` for connectivity.

---

## Examples

**Administration:**

```
"Show mailbox stats for admin@contoso.com"  → exchange_get_mailbox_statistics
"List queues on MAIL01 with more than 100 messages"  → exchange_get_queue { server: "MAIL01", filter: "MessageCount -gt 100" }
"Track email from sender@contoso.com today"  → exchange_get_message_tracking_log { sender: "sender@contoso.com", start: "2026-09-02T00:00:00Z" }
"Is the DAG healthy?"  → exchange_get_database_copy_status { identity: "*" }
"Check certificate expiry"  → exchange_get_exchange_certificate
"Test connectivity"  → exchange_test_connection { target: "powershell" }
```

**AI Reports:**

```
"Executive summary" → ai.exchange_executive_summary
"Root cause of queue 3452" → ai.root_cause_analysis { "domain": "example.com" }
"Anomaly — who is spamming?" → ai.anomaly_detection
"Capacity forecast" → ai.capacity_forecast
"Cleanup — recover space" → ai.cleanup_recommendation
"Who is compromised?" → ai.compromised_account_detection
"Can I migrate 2013 to 2019?" → ai.migration_advisor { "targetVersion": "Exchange 2019" }
"Ask Exchange" → ai.ask_exchange { "query": "Show me all mailboxes over 50 GB" }
"What if I move 500 mailboxes?" → ai.what_if_analysis { "sourceDB": "DB01", "targetDB": "DB05", "count": 500 }
"Tell me everything about this mailbox" → ai.tell_me_everything { "identity": "user@company.com" }
"Mailbox cleanup for user" → ai.mailbox_cleanup_advisor { "identity": "user@company.com" }
```

**Mailbox:**

```
"List inbox top 5" → exchange_list_messages { folder: "inbox", top: 5 }
"Send meeting invite" → exchange_create_calendar_event { subject: "...", start: "...", attendees: [...] }
```

---

## Troubleshooting

| Issue | Solution |
|---|---|
| `EISDIR: illegal operation on a directory` | The config path points to a directory. Remove it and run `cp config.example.yaml config.yaml`. |
| `Basic auth requires username and password` | Add `auth.basic.username` and `password` in `config.yaml` or set `EXCHANGE_PASSWORD`. |
| `Tool ... is already registered` | Duplicate registration. Ensure you are running the latest build with `npm run build`. |
| `PowerShell auth failed` with 401 | Verify username, domain and password and that the account has the required RBAC role. For Basic authentication, run `Set-PowerShellVirtualDirectory -BasicAuthentication:$true` on the Exchange server. |
| `PowerShell error 404` | The PowerShell URL is incorrect. It must be `https://<fqdn>/PowerShell` with capital P and S. Set `EXCHANGE_POWERSHELL_URL` or `EXCHANGE_SERVER` and verify with `Get-PowerShellVirtualDirectory` and `Test-WSMan`. |
| `PowerShell error 415` | The server expects WS-Management. This build uses PowerShell Remoting with `New-PSSession` on Windows. Run the MCP on Windows for PowerShell tools. |
| `Cmdlet not allowed` | Add the cmdlet to the allow list. |
| `Certificate has expired or is self-signed` | For lab environments, set `exchange.insecure: true`. For production, install a valid certificate. |
| `opencode mcp list` shows disconnected or `claude mcp list` fails | Run `npm run build`, verify the absolute path in the client configuration and restart the client. |
| Queues always empty | `Get-Queue` requires the Mailbox or Edge Transport role and the Transport Queues role. |

For further diagnostics, run:

```bash
npx @modelcontextprotocol/inspector node dist/server.js --config=./config.yaml
npx exchange-mcp doctor --endpoint https://mail.contoso.com
```

---

## Development

```bash
npm install
npm run dev          # watch mode with tsx
npm test             # run tests
npm run build        # compile TypeScript to dist/
npx @modelcontextprotocol/inspector node dist/server.js --config=./config.yaml
```

Project structure: server and configuration, authentication, Exchange clients (EWS, REST, PowerShell), tools, resources and utilities.

---

## Security Notes

- Never commit `config.yaml` or files containing passwords or certificates. Use `config.example.yaml` as a template.
- Administrative tools are powerful. Exchange RBAC still applies, and an allow list prevents arbitrary cmdlet execution.
- Prefer OAuth or Certificate authentication in production and use valid certificates.
- OAuth tokens are cached in memory and certificate authentication uses HTTPS agents with `pfx` or `cert` options.
- PowerShell Remoting uses `SkipCACheck` only when `insecure` is enabled for lab environments.

---

## Contributing

Contributions are welcome, especially for additional Exchange cmdlets, tests and deployment recipes. Please run `npm run build` and `npm test` before submitting and do not commit `config.yaml` or `*.pfx` files.

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgements

Built on the Model Context Protocol TypeScript SDK and the Exchange Server and Exchange PowerShell documentation.
