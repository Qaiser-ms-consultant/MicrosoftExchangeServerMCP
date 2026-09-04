# Agent Query Router + Human-Friendly Output — Design

## Goal
Let the desktop app answer any sort of Exchange prompt (version, queues,
health, databases, certificates, NDRs, mailbox analysis, …) by routing the
free-text prompt to the right read-only MCP tool, and render every result as
a human-friendly card with collapsible raw JSON underneath.

## Architecture Overview
- **Router (`src/desktop/queryRouter.ts`, new):** pure function
  `routeQuery(prompt) -> {tool, args} | {help: true}`. Keyword rules,
  first match wins, no network, no API key. Unit-tested with vitest.
- **Desktop backend (`src/desktop/main.ts`, modify `exchange:ask`):**
  `routeQuery` → `ensureMcpInitialized()` → `tools/call {name, args}` →
  parse `content[0].text` JSON → return `{prompt, tool, result}`.
  The `help` route returns example queries without touching the backend.
- **Tauri backend (`tauri-client/src-tauri/src/main.rs`, mirror):** same
  routing table duplicated in Rust (documented duplication — Rust cannot
  import TS), same `{prompt, tool, result}` envelope.
- **Renderer (`src/desktop/renderer/index.html` + Tauri copy, modify):**
  `renderResult(tool, data)` switch with one formatter per routed tool plus
  a recursive generic fallback; every render appends a `<details>` raw-JSON
  block. Copy/Export continue to use the visible card text.

## Routing Table (first match wins, all tools verified to exist)
- `version|cu|cumulative|build|patch` → `report.exchange_version_and_cu` {}
- `queue|delayed|stuck|backlog|mailflow|pending mail` → `exchange_get_queue` {}
- `health|healthy|unhealthy` → `exchange_get_health_report` {}
- `database|databases` with `list` → `database.list` {}
- `whitespace|growth|storage|disk usage|size of database` → `database.get_whitespace_and_growth` {}
- `backup` → `database.get_backup_status` {}
- `dag` → `dag.list` {}
- `cert|certificate|expir` → `exchange_get_exchange_certificate` {}
- `disk space|disk free` → `server.get_disk_space` {}
- `uptime|reboot|last boot` → `server.get_uptime` {}
- `service` with `status|running` → `server.get_services_status` {}
- `connector` → `exchange_list_send_connectors` {}
- `transport rule` → `exchange_get_transport_rules` {}
- `server` with `list` → `exchange_list_servers` {}
- `topology` → `report.exchange_topology` {}
- `overview|environment` → `report.exchange_environment_overview` {}
- `ndr|bounce|bounced` or NDR code regex `\d\.\d+\.\d+` → `mailflow.get_ndr_details` {code?}
- `trace|tracking|delivery status` → `mailflow.get_message_trace` {sender?, recipient?, subject?} (emails extracted via email regex; quoted text as subject)
- `permission|access|fullaccess|sendas` + email → `exchange_get_mailbox_permissions` {identity}
- `statistic|how big|item count|last logon` + email → `exchange_get_mailbox_statistics` {identity}
- email regex match (fallback) → `ai.tell_me_everything` {identity}
- else → help result (no backend call; card lists example queries)

Write operations are INCLUDED via a two-step confirm flow (safety gate):
- Write intents routed (all verified to exist): `mailbox.new_move_request`
  {identity, targetDatabase}, `database.mount`/`database.dismount`
  {identity, confirm}, `exchange_retry_queue`/`exchange_suspend_queue`
  {identity, server?}, `mailbox.add_permission`/`mailbox.remove_permission`
  {identity, user, accessRights}, `server.restart_service`
  {name, server?, confirm}, `mailbox.set_quota` {identity, quotas…},
  `database.new_repair_request` {database, …}, `exchange_create_mailbox`
  (arg-heavy — see missing-info rule below).
- `exchange:ask` payload gains `{prompt, confirmed?, tool?, args?}`.
  Router returns `{tool, args, write: true}` for write intents.
- If `write && !confirmed`: backend returns a preview envelope
  `{needsConfirm: true, tool, args, description}` WITHOUT calling the tool.
  The card shows the planned action + parameters with a Confirm/Cancel
  pair; Confirm re-invokes `askExchange({prompt, confirmed: true, tool,
  args})`, which skips re-routing and passes `confirm: true` through.
- Missing required args (e.g. no target database, no user for permission):
  backend returns `{needsInfo: true, tool, missing: [...]}` and the card
  lists exactly what to add to the prompt. No partial writes ever execute.

## Rendering (renderResult)
Covers every MCP tool result and every AI report. Two layers:
- **Shaped formatters** for known envelopes (all render title + sections):
  - Version/CU → server table (name, version, CU, status pill).
  - Queues → queue table (identity, count, status) + totals row.
  - Health → health-set list with Healthy/Unhealthy pills.
  - Any `ai.*` report envelope (`executiveSummary` + `findings` +
    `recommendedActions`, incl. `ai.tell_me_everything`,
    `ai.analyze_mailbox`, cleanup/migration advisors) → summary header +
    findings list + recommendations list.
  - Databases/certs/backups/disk → tables with size/expiry highlighting.
  - NDR → code explanation card.
  - `{needsConfirm: true, …}` → amber action-preview card with parameter
    table + Confirm/Cancel buttons.
  - `{needsInfo: true, …}` → prompt card listing the missing parameters.
  - Help route → example-query list card.
- **Universal exact-output fallback:** anything not matched above renders
  the byte-exact MCP `content[0].text` in a scrollable `<pre>` — no
  truncation, no reformatting — so no query can ever produce an empty or
  broken card.
- Every shaped render also appends a `<details><summary>Raw JSON</summary>
  <pre>…` block with the exact output.
- Escaping: all tool-supplied strings HTML-escaped before insertion
  (exact-output `<pre>` uses `textContent`, never `innerHTML`).

## Security Considerations
- Writes only execute after explicit in-card Confirm; the preview shows the
  exact tool + parameters first. Destructive tools also forward
  `confirm: true` to the tool itself where supported.
- Missing-argument rule guarantees no write runs with guessed parameters.
- Identity/email extraction uses regexes; values are passed as tool
  arguments, never interpolated into shell commands (tools use
  parameterized PowerShell quoting already).
- Renderer escapes all backend strings to prevent HTML injection
  (exact-output uses `textContent`).

## Testing Strategy
1. Vitest unit tests for `routeQuery`: one case per rule + email fallback + help fallback. Runnable locally.
2. `scripts/tauri-frontend-check.cjs` extended: new card IDs present, `node --check` clean.
3. `npm run build` + existing vitest suite must stay green.
4. Rust compile + `cargo test` deferred to CI (no toolchain here).

## Migration Steps
1. Add `src/desktop/queryRouter.ts` (read + write intents, arg extractors,
   confirm/missing-info envelopes) + `tests/queryRouter.test.ts`.
2. Rewire `exchange:ask` in `src/desktop/main.ts` to the new envelope
   `{prompt, tool, result, needsConfirm?, needsInfo?}`.
3. Add `renderResult` + shaped formatters + confirm/info/help cards +
   exact-output fallback to the renderer; sync Tauri copy + shim.
4. Mirror router + envelope in Rust `main.rs`.
5. Extend smoke test, run all checks, commit, relaunch desktop app.

## Open Questions
- None blocking. Future: LLM-based routing as opt-in (needs provider key);
  out of scope for this spec.

---
*Spec authored on 2026-09-04. Approved design: keyword router + formatted summary with collapsible raw JSON.*
