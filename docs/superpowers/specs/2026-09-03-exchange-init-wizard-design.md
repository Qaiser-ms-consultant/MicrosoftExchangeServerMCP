# Exchange MCP Init Wizard — Design Spec

**Date:** 2026-09-03
**Mode:** Option A, Production, file-based `${EXCHANGE_PASSWORD}`, OpenCode + Claude Code, keep `git clone`

## 1. Goal
Make `git clone → cp config.example.yaml config.yaml → npx exchange-mcp init` → `npx exchange-mcp add --client opencode,claude-code` → `✓ exchange connected` one-click, with EWS + PowerShell connectivity tests.

Success: fresh clone + 2 commands + 3 prompts (FQDN, user, password env) → `opencode mcp list` and `claude mcp list` both connected, `exchange_test_connection` shows 200 for both `https://<fqdn>/PowerShell` and `https://<fqdn>/EWS/Exchange.asmx` (production `insecure:false` default, lab override via `EXCHANGE_INSECURE`).

## 2. Architecture
- Keep `src/server.ts:1` (128 tools always open), `src/config.ts:1` (aliases `EXCHANGE_POWERSHELL_URL`/`EXCHANGE_SERVER`), `src/utils/tls.ts:1` (self-signed), `src/tools/admin-diagnostics.ts:1` (diagnostics).
- New `src/cli/`:
  - `cli.ts` — commander entry, `bin: exchange-mcp` in `package.json:1`
  - `init.ts` — wizard (inquirer)
  - `patcher.ts` — OpenCode (`~/.config/opencode/opencode.jsonc:15` JSONC) + Claude Code (`claude mcp add` wrapper + `~/.claude.json` fallback)
  - `doctor.ts` — wraps diagnostics for both PowerShell and EWS

## 3. Components
### 3.1 Init Wizard
- Prompts: `Exchange FQDN` (default `mail.contoso.com`, validates `https://<fqdn>/PowerShell`), `Username` (`admin@contoso.com`), `Password env var` (default `EXCHANGE_PASSWORD`, writes `password: "${EXCHANGE_PASSWORD}"` and instructs `export EXCHANGE_PASSWORD=...`, file-based only per requirement, no keytar).
- Writes `config.yaml` with `insecure:false`, `tls.rejectUnauthorized:true` (production), generic `endpoint`/`powershellUri`.
- Tests sequentially: PowerShell `GET` + WinRM `Test-WSMan` dry-run, EWS `POST` SOAP `FindItem MaxEntriesReturned=1` with `httpsAgent` `rejectUnauthorized:false` only if `insecure:true` flip offered. If EWS 401 and PowerShell 200, warns `Set-WebServicesVirtualDirectory -BasicAuthentication:$true` vs using `exchange_search_mailbox` PowerShell alternative.

### 3.2 Patcher
- OpenCode: read `~/.config/opencode/opencode.jsonc` via `jsonc-parser`, backup `*.bak.YYYYMMDD`, merge `mcp.exchange` with `command: ["node", "<abs>/dist/server.js", "--config=<abs>/config.yaml"]`, write.
- Claude Code: try `claude mcp add exchange -- node <abs>/dist/server.js --config=<abs>/config.yaml` via `execFile`; fallback edit `~/.claude.json` `mcpServers.exchange`.
- Validates JSON before write, restores `.bak` on failure.

### 3.3 Doctor
- Calls `registerDiagnosticTools` logic for both targets: `powershell` (WinRM) and `ews` (SOAP). Prints `Exchange targets — ...` + per-target status/hint (404 → `Get-PowerShellVirtualDirectory`, 401 → `BasicAuthentication`, self-signed → `insecure`).

## 4. Data Flow
`init` → `loadConfig` → prompt → `getHttpsAgent` test with `insecure:false` → if self-signed error, re-test with `insecure:true` and offer flip → write file atomically → `patcher` edits client JSONCs with `deepMerge`.

## 5. Config
- `config.example.yaml:2` stays generic `mail.contoso.com`/`admin@contoso.com` with `insecure:false` — lab commented.
- `config.production.yaml.example` same.
- Secrets via `${EXCHANGE_PASSWORD}` file-based, `.gitignore:1` keeps `config.yaml` out.

## 6. Testing
- Unit: `tests/cli.test.ts` for `writeConfig` + patcher JSONC merge (mock FS).
- Manual: fresh clone on Windows `devex02.devlab2025.local` with `insecure:true` override and production `mail.contoso.com` dry-run.

## 7. Docs
- `README.md:60` Quick Start collapses to `git clone → npm install → cp config.example.yaml config.yaml → npm run init` + `npx exchange-mcp add --client opencode,claude-code`.

## 8. Rollout
- Keep `git clone` primary, `npx` works via `npm link` or after future `npm publish` (prep only, no publish now per requirement).
