# Tauri Desktop Client Design

## Goal
Replace the current Electron‑based desktop client with a lightweight, secure Tauri application while re‑using the existing HTML/Tailwind UI and preserving all MCP bridge functionality.

## Architecture Overview
- **Web UI**: The current `src/desktop/renderer` HTML, CSS (Tailwind CDN), and JavaScript are copied unchanged into `src` of the Tauri project. No UI rewrite is needed.
- **Rust Backend (`src-tauri/src/main.rs`)**: Implements Tauri commands that mirror the Electron IPC bridge (`askExchange`, `runDoctor`, `startMcp`, `loadConfig`, `saveConfig`, `testProvider`, `isMcpRunning`). Each command forwards the request to the already‑running MCP server via HTTP (e.g., `http://127.0.0.1:3000/...`).
- **MCP Auto‑Start**: On Tauri startup the Rust code spawns the MCP process (`npx exchange-mcp start`) and stores its PID. A command `is_mcp_running` reports readiness to the UI.
- **Config Handling**: Commands read/write `~/.config/exchange-desktop/config.yaml` using the `std::fs` API, matching the existing Electron `loadConfig`/`saveConfig` behavior.
- **Packaging**: `cargo tauri build` produces a ~10 MB installer (`.msi` for Windows, `.dmg` for macOS, `.AppImage` for Linux). No Node runtime is bundled.

## Files & Directory Layout
```
tauri-client/
├─ src/                     # Copied HTML/CSS/JS (renderer)
│   └─ index.html
├─ src-tauri/
│   ├─ Cargo.toml           # Rust crate manifest
│   └─ src/main.rs          # Tauri commands & MCP launch logic
├─ tauri.conf.json          # Tauri configuration (window size, icons, etc.)
└─ docs/superpowers/specs/2026-09-03-tauri-client-design.md  # This spec
```

## Command Mapping (UI ↔ Rust)
| UI Bridge Call | Tauri Command | Description |
|----------------|--------------|-------------|
| `window.exchangeDesktop.askExchange({prompt})` | `ask_exchange` | POST JSON to MCP `/ask` endpoint and return the result. |
| `window.exchangeDesktop.runDoctor({endpoint,insecure})` | `run_doctor` | Calls MCP doctor routine and returns diagnostics. |
| `window.exchangeDesktop.startMcp()` | `start_mcp` | Spawns MCP process, returns PID. |
| `window.exchangeDesktop.loadConfig()` | `load_config` | Reads YAML config file. |
| `window.exchangeDesktop.saveConfig(yaml)` | `save_config` | Writes YAML config file. |
| `window.exchangeDesktop.testProvider({provider,apiKey,baseUrl})` | `test_provider` | Validates provider connectivity. |
| `window.exchangeDesktop.isMcpRunning()` | `is_mcp_running` | Returns boolean indicating MCP health. |

## Security Considerations
- Tauri runs the webview in a sandbox; all native calls must be explicitly declared in `tauri.conf.json`.
- The Rust bridge only exposes the minimal set of commands listed above.
- The MCP process runs with the same permissions as before; the Tauri client does not elevate privileges.

## Testing Strategy
1. **Unit tests** for each Rust command using `cargo test` with a mock MCP server.
2. **Integration test**: launch the Tauri app in CI, verify that UI buttons trigger the expected RPC calls (use Playwright to click UI and capture console logs).
3. **Cross‑platform build verification**: run `cargo tauri build --target <platform>` for Windows/macOS/Linux.

## Migration Steps
1. Scaffold a new Tauri project (`cargo init --bin tauri-client` + `npm init tauri`).
2. Copy the existing renderer assets.
3. Implement the Rust commands mirroring the Electron bridge.
4. Update the HTML/JS to import `@tauri-apps/api` and replace `window.exchangeDesktop` calls with Tauri invocations.
5. Add auto‑start logic for MCP in `main.rs`.
6. Write CI scripts to build and test on all platforms.
7. Decommission the Electron build scripts.

## Open Questions
- Do we need any additional UI elements for MCP start‑up status (e.g., a spinner) that are not currently present?
- Should the config file location be configurable per‑user, or keep the existing `~/.config/exchange-desktop/config.yaml`?
- Any company policy regarding Rust toolchain version that we should lock to?

---
*Spec authored on 2026‑09‑03.*
