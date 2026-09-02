# Microsoft Exchange Server On-Premise MCP — Design Spec

**Date:** 2026-09-02  
**Status:** Approved  
**Language:** TypeScript / Node.js

## 1. Purpose

Model Context Protocol (MCP) server that exposes Microsoft Exchange Server on-premise capabilities (mail, calendar, contacts, tasks, admin) to LLM clients (Claude Desktop, etc.) with support for multiple Exchange versions, multiple APIs, multiple auth methods, and flexible deployment.

## 2. Requirements

- **Exchange versions:** 2013 / 2016 / 2019+ (auto-detect, fallback)
- **APIs:** EWS (SOAP), REST API v2.0, PowerShell Remoting (Exchange Management Shell)
- **Auth:** Basic Auth, OAuth 2.0 (Azure AD / ADFS — client credentials, auth code, device code), Certificate (PFX/PEM)
- **Capabilities:** Full CRUD + Admin (mail, calendar, contacts, tasks, mailbox mgmt, distribution groups, transport rules, permissions)
- **Deployment:** stdio (local), HTTP/SSE (remote/on-prem service), Docker/K8s

## 3. Architecture Overview

```
MCP Client (Claude) <--stdio|HTTP/SSE--> MCP Server (TypeScript, @modelcontextprotocol/sdk)
                                           |
                                           +--> ExchangeClient (facade + provider selection)
                                           |       +--> EWSProvider (node-ews / ews-javascript-api)
                                           |       +--> RestProvider (axios, REST v2.0)
                                           |       +--> PowerShellProvider (node-powershell / WinRM)
                                           +--> AuthManager (basic / oauth / cert + token cache)
                                           +--> Config (YAML/JSON + env overrides)
                                           +--> Tools (20+), Resources (folders/calendars), Prompts
```

- Provider selection: `auto` prefers REST on 2016/2019, falls back to EWS, routes admin to PowerShell.
- Transports: `StdioServerTransport` for local, `SseServerTransport`/`StreamableHTTP` for remote.
- Config precedence: defaults < YAML/JSON file < env vars.

## 4. Core Components

### 4.1 ExchangeClient

Unified interface:

```ts
interface ExchangeClient {
  listMessages(folder: string, opts: PaginationOpts): Promise<Message[]>
  getMessage(id: string): Promise<Message>
  sendMessage(msg: SendMessageInput): Promise<string>
  replyMessage(id: string, body: string): Promise<void>
  forwardMessage(id: string, to: string[]): Promise<void>
  deleteMessage(id: string): Promise<void>
  moveMessage(id: string, folder: string): Promise<void>
  searchMessages(query: string, opts: SearchOpts): Promise<Message[]>
  // calendar, contacts, tasks, admin ...
}
```

Provider pattern with normalized DTOs; pagination transparent (max 1000/request); attachment streaming (>10MB via streaming).

### 4.2 AuthManager

- `BasicAuthProvider` — username/password, NTLM option.
- `OAuthProvider` — MSAL-style flows, token cache + refresh, ADFS authority support.
- `CertAuthProvider` — PFX/PEM, mutual TLS.
- Interface: `getAuthHeader(): Promise<string>`; retries on 401 with refresh.

### 4.3 MCP Surface

**Tools (25):**

- Mail (8): `exchange_list_messages`, `exchange_get_message`, `exchange_send_message`, `exchange_reply_message`, `exchange_forward_message`, `exchange_delete_message`, `exchange_move_message`, `exchange_search_messages`
- Calendar (6): `exchange_list_calendar_events`, `exchange_get_calendar_event`, `exchange_create_calendar_event`, `exchange_update_calendar_event`, `exchange_delete_calendar_event`, `exchange_get_availability`
- Contacts (5): `exchange_list_contacts`, `exchange_get_contact`, `exchange_create_contact`, `exchange_update_contact`, `exchange_delete_contact`
- Tasks (3): `exchange_list_tasks`, `exchange_create_task`, `exchange_update_task`
- Admin (6, gated): `exchange_list_mailboxes`, `exchange_get_mailbox`, `exchange_create_mailbox`, `exchange_list_distribution_groups`, `exchange_get_transport_rules`, `exchange_set_mailbox_permissions`

**Resources:** `exchange://folders/{id}`, `exchange://calendars/{id}`, `exchange://addressbooks/{id}`

**Prompts:** `triage-inbox`, `schedule-meeting`

All tools validated with `zod`.

### 4.4 Provider Details

- **EWSProvider:** `ews-javascript-api` or `node-ews`, SOAP, handles 2013+ universally, NTLM via `httpntlm`.
- **RestProvider:** `axios` against `https://<host>/api/v2.0/me/...`, preferred on 2016/2019.
- **PowerShellProvider:** `node-powershell` or WinRM (5985/5986), constrained to allowlisted cmdlets (`Get-Mailbox`, `New-Mailbox`, `Get-DistributionGroup`, `Get-TransportRule`, etc.).

## 5. Data Flow

```
MCP tool call -> zod validation -> ExchangeClient -> AuthManager.getAuthHeader()
                                   -> select provider (auto/forced)
                                   -> API call (+ retry)
                                   -> normalize response -> MCP result
```

- Auto selection: REST attempt → EWS fallback → error.
- Retry: exponential backoff, 3 attempts, only on transient (429, 5xx, network).
- Degradation: if REST fails with 404/501, retry via EWS.

## 6. Error Handling

Structured codes: `AUTH_FAILED`, `NOT_FOUND`, `RATE_LIMITED`, `SERVER_ERROR`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

```ts
class ExchangeError extends Error {
  code: ErrorCode
  provider: string
  exchangeVersion?: string
  requestId?: string
  cause?: unknown
}
```

Detailed context per error; 401 triggers token refresh once.

## 7. Configuration

```yaml
exchange:
  endpoint: https://mail.contoso.local
  version: auto
  provider: auto
auth:
  method: oauth
  oauth: { authority, clientId, clientSecret, tenantId, scope }
  basic: { username, password, domain }
  certificate: { pfxPath, passphrase }
server:
  transport: stdio
  port: 3000
  enableAdminTools: false
logging: { level: info, file: ./logs/mcp.log }
```

Env overrides: `EXCHANGE_ENDPOINT`, `AUTH_METHOD`, `OAUTH_CLIENT_ID`, etc.

## 8. Security

- No credential logging; secrets via env/file refs, 0600 cache file or OS keychain.
- Admin tools disabled by default; require explicit flag.
- Cmdlet allowlist for PowerShell; zod validation on all inputs.
- Mutual TLS option for cert auth.

## 9. Project Structure

```
src/
  server.ts
  config.ts
  errors.ts
  auth/
    auth-manager.ts
    basic-auth.ts
    oauth-auth.ts
    cert-auth.ts
  clients/
    exchange-client.ts
    ews-provider.ts
    rest-provider.ts
    powershell-provider.ts
    types.ts
  tools/
    mail-tools.ts
    calendar-tools.ts
    contact-tools.ts
    task-tools.ts
    admin-tools.ts
  resources/
    folder-resource.ts
  prompts/
    index.ts
```

## 10. Testing

- **Unit:** vitest, mocked providers, zod validation, AuthManager flows.
- **Integration:** against Exchange test lab (optional, gated by env `EXCHANGE_TEST_ENDPOINT`).
- **Contract:** MCP inspector (`@modelcontextprotocol/inspector`) compliance.

## 11. Deployment

- **Local:** `npx exchange-mcp --config ./config.yaml` via Claude Desktop `mcpServers` stdio entry.
- **Remote:** `node dist/server.js --transport http --port 3000` behind reverse proxy, SSE/StreamableHTTP.
- **Docker:** `node:20-alpine`, multi-stage build, `docker-compose.yml`.
- Scripts: `build`, `start`, `dev`, `test`, `lint`, `inspector`.

## 12. Implementation Phases

1. Scaffolding (deps, tsconfig, eslint)
2. AuthManager
3. EWSProvider
4. RestProvider
5. PowerShellProvider
6. MCP server + tools/resources
7. Hardening, tests, Docker, docs
