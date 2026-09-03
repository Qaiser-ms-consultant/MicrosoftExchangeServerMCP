# Exchange Desktop — Custom Admin + Model Providers + Prompt/Output/Logs — Design Spec

**Date:** 2026-09-03
**Mode:** Option A, Production, file-based `${EXCHANGE_PASSWORD}` / `${OPENAI_API_KEY}`, 12 providers, Electron, dashboard+cards, real-time streaming, triple connectivity (Model + MCP + Exchange via MCP)

## 1. Goal
Standalone desktop (beyond OpenCode/Claude Code) that lets an Exchange admin: pick a model provider from 12, pick model, enter API key (file-based, no keychain), save config, type a prompt, see human-friendly output, view real-time logs, and test connectivity to model, MCP server, and backend Exchange through MCP.

Success: `git clone → npm install → npm run build → npx electron .` → Admin tab: enter `devex02.devlab2025.local` + `devlabadmin` + `EXCHANGE_PASSWORD` → Model tab: pick Anthropic → pick claude-3-5-sonnet → enter key → Test shows 3× green (Model 200, MCP 200 tools, Exchange PowerShell 200 + EWS 200) → Prompt “Tell me everything about devlabadmin@devlab2025.local” → Output shows Executive Summary 74/100 with 🔴🟠🟢 findings + Recommended Actions (from `src/tools/ai-tellmeeverything.ts:8`).

## 2. Architecture
- **Electron** (main: Node, spawns `ExchangeClient` at `src/clients/exchange-client.ts:1` directly, no separate `node dist/server.js` process for stdio low latency; also supports `http://localhost:3000/sse` at `src/server.ts:71` for multi-client)
- **Renderer:** React + TypeScript + Tailwind + shadcn/ui + Monaco (prompt) + Recharts (gauges for Health 82/100)
- **State:** `~/.config/exchange-desktop/config.yaml` (same shape as `config.example.yaml:2`, file-based `${VAR}`) + `~/.config/exchange-desktop/config.json` for model providers (12)
- **IPC:** `exchange-mcp:*` channels (invokeTool, listTools, getConfig, setConfig, testConnectivity) with zod validation

## 3. Components
### 3.1 Admin Tab
- Exchange form (endpoint FQDN, powershellUri, insecure toggle, auth method radio Basic/OAuth/Cert, username/domain) — writes `config.yaml` + tests both PowerShell + EWS via `src/cli/doctor.ts:1` logic, shows `Exchange targets — endpoint=... | ha=[...]`.

### 3.2 Model Provider Section (12)
- Dropdown: OpenAI, Anthropic, Google, Azure OpenAI, AWS Bedrock, Ollama, Mistral, Cohere, Groq, Together, OpenRouter, Custom OpenAI-compatible. On select, `GET /v1/models` populates model dropdown. Fields: API Key (masked), Base URL (custom/local), Save (writes `~/.config/exchange-desktop/config.json` with `${OPENAI_API_KEY}` file-based), Test button → ListModels.

### 3.3 Prompt / Output
- Prompt: Monaco editor (system + user), variables `{{mailbox}}`, history SQLite, templates `triage-inbox`/`schedule-meeting` from `src/prompts/index.ts:1`, plus `ai.ask_exchange` front-door autocomplete.
- Output: Human-friendly — `ai.tell_me_everything` renders Health 74/100 gauge + Findings 🔴🟠🟢 + Recommended Actions; `report.*` renders Markdown tables + Export CSV/PDF; Raw JSON collapsible; streaming via MCP notifications.

### 3.4 Logs Tab
- 3 sub-tabs: `MCP Logs` (stderr `Exchange targets — ...` + `HA failover` at `src/utils/ha.ts:1` real-time via `webContents.send`), `PowerShell Transcript` (raw `Invoke-Command` JSON), `Audit Log` (`logs/mcp-audit.jsonl` for `Disable-Mailbox` etc.), level filter, search, tail -f, Export.

### 3.5 Connectivity Triple Check (New Requirement)
- Unified Connectivity tab + `npx exchange-mcp doctor` enhancement (`src/cli/doctor.ts:1`):
  - Model: `POST https://api.openai.com/v1/models` with `${API_KEY}` (file-based) → `200` + model list
  - MCP Server: `GET http://localhost:3000/health` or stdio `McpServer['_registeredTools']` count 200
  - Exchange via MCP: `exchange_test_connection { target: "all" }` → `GET https://<fqdn>/PowerShell` + `POST` EWS SOAP `FindItem` (`https://<fqdn>/EWS/Exchange.asmx`) + `GET /owa` with `https.Agent { rejectUnauthorized: <insecure> }` + WinRM `Test-WSMan`

## 4. Other Components (Requested)
- Tool Explorer + Favorites: Searchable tree of 200 tools (grouped as in `README.md:386` Tools Reference — 8 groups + AI 22 + Reports 80+), with per-tool schema and “Add to Prompt”.
- Prompt History & Templates: SQLite + `ai.ask_exchange` front-door.
- Health Dashboard header: `ai.exchange_executive_summary` 82/100 live.
- Settings & Updates: `electron-updater`, `Check for updates`, `Reset config`.
- Security: file-based `${VAR}` only, no `keytar` per requirement.

## 5. Rollout
- v1 (4 weeks): Electron scaffold + Admin (file-based) + Model Provider (12) + Prompt/Output + Logs (real-time) + Triple connectivity. Reuses `src/config.ts:1`, `src/clients/*`, `src/utils/ha.ts:1` directly.
- Testing: `npm run build` + `npm test` + Playwright for Electron.
