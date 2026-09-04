# Tauri Desktop Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task‑by‑task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing Electron desktop client with a lightweight Tauri application while re‑using the current HTML/Tailwind UI and preserving all MCP bridge functionality.

**Architecture:** The web UI (HTML/CSS/JS) is unchanged and served by Tauri's built‑in WebView. A Rust backend implements Tauri commands that mirror the Electron IPC bridge (`askExchange`, `runDoctor`, `startMcp`, `loadConfig`, `saveConfig`, `testProvider`, `isMcpRunning`). The backend forwards those calls to the already‑running MCP server via HTTP/JSON.

**Tech Stack:**
- **Frontend:** Existing HTML + Tailwind CDN (no rebuild).
- **Backend:** Rust (edition 2021) + Tauri (`@tauri-apps/api` for JS bindings).
- **Build/Package:** `cargo tauri build` (produces ~10 MB installers).
- **Testing:** Rust unit tests (`cargo test`), Playwright UI tests for the web assets, CI scripts for cross‑platform builds.

**Spec:** `docs/superpowers/specs/2026-09-03-tauri-client-design.md`

## Global Constraints
- Preserve existing `config.yaml` location at `~/.config/exchange-desktop/config.yaml`.
- All UI button behavior must remain identical to the Electron version.
- The binary size must stay under 15 MB on Windows.
- Rust toolchain version locked to the latest stable (checked in CI).
---

### Task 1: Scaffold Tauri Project

**Files:**
- Create: `tauri-client/Cargo.toml`
- Create: `tauri-client/tauri.conf.json`
- Create: `tauri-client/src-tauri/src/main.rs`
- Create: `tauri-client/src-tauri/src/lib.rs` (optional helper)
- Create: `tauri-client/src/index.html` (initial placeholder)

**Interfaces:** None (first task).

- [ ] **Step 1: Initialize the Tauri project**
  ```bash
  mkdir tauri-client && cd tauri-client
  cargo init --bin
  npx tauri init
  ```
- [ ] **Step 2: Verify `tauri dev` launches a blank window**
  ```bash
  npm run tauri dev
  ```
- [ ] **Step 3: Commit scaffold**
  ```bash
  git add tauri-client && git commit -m "chore: scaffold Tauri client"
  ```

### Task 2: Copy Existing Renderer Assets

**Files:**
- Copy: `src/desktop/renderer/*` → `tauri-client/src/` (preserve directory structure).

**Interfaces:** UI will load assets directly; no code changes yet.

- [ ] **Step 1: Copy files**
  ```bash
  cp -r ../src/desktop/renderer/* ./src/
  ```
- [ ] **Step 2: Adjust relative paths if needed (e.g., script src="./index.js" stays the same).**
- [ ] **Step 3: Run `npm run tauri dev` and ensure the UI renders (no JS errors).**
- [ ] **Step 4: Commit copied assets**
  ```bash
  git add tauri-client/src && git commit -m "feat: add existing HTML UI to Tauri"
  ```

### Task 3: Add Tauri API to Frontend

**Files:**
- Modify: `tauri-client/src/index.html` (or a separate `renderer.js` if one exists) to import `@tauri-apps/api` and replace `window.exchangeDesktop` calls.

**Interfaces:** The UI will now call the Rust commands defined in `src-tauri/src/main.rs`.

- [ ] **Step 1: Install Tauri API package**
  ```bash
  npm i @tauri-apps/api
  ```
- [ ] **Step 2: In the script section, replace each `window.exchangeDesktop.<cmd>` with the corresponding Tauri invocation, e.g.**
  ```javascript
  import { invoke } from "@tauri-apps/api";
  async function askExchange(payload){
    return await invoke('ask_exchange', payload);
  }
  // repeat for start_mcp, load_config, save_config, test_provider, run_doctor, is_mcp_running
  ```
- [ ] **Step 3: Update all safeHandler definitions to call the new functions** (e.g., `window.exchangeDesktop.startMcp()` → `invoke('start_mcp')`).
- [ ] **Step 4: Run the app, open DevTools, ensure no "window.exchangeDesktop is undefined" errors.**
- [ ] **Step 5: Commit JS changes**
  ```bash
  git add tauri-client/src/*.js && git commit -m "refactor: replace Electron bridge with Tauri invoke"
  ```

### Task 4: Implement Rust Commands (Bridge)

**Files:**
- Modify: `tauri-client/src-tauri/src/main.rs`

**Interfaces:** Exposes the following Tauri commands (all async):
- `ask_exchange`
- `run_doctor`
- `start_mcp`
- `load_config`
- `save_config`
- `test_provider`
- `is_mcp_running`

- [ ] **Step 1: Add dependencies** to `Cargo.toml`
  ```toml
  [dependencies]
  tauri = { version = "1", features = ["api-all"] }
  serde = { version = "1", features = ["derive"] }
  serde_json = "1"
  tokio = { version = "1", features = ["rt-multi-thread", "macros"] }
  reqwest = { version = "0.11", features = ["json"] }
  ```
- [ ] **Step 2: Write stub command functions** in `main.rs` that receive a `serde_json::Value` payload and forward it to the MCP HTTP endpoint (`http://127.0.0.1:<port>/...`). Example:
  ```rust
  #[tauri::command]
  async fn ask_exchange(payload: serde_json::Value) -> Result<serde_json::Value, String> {
      let client = reqwest::Client::new();
      let resp = client.post("http://127.0.0.1:3000/ask")
          .json(&payload)
          .send().await.map_err(|e| e.to_string())?;
      let json = resp.json().await.map_err(|e| e.to_string())?;
      Ok(json)
  }
  ```
- [ ] **Step 3: Implement `load_config` / `save_config`** using `std::fs::read_to_string` and `std::fs::write` on `dirs::config_dir().join("exchange-desktop/config.yaml")`.
- [ ] **Step 4: Implement `start_mcp`** by spawning `npx exchange-mcp start` via `std::process::Command`, capturing PID, and returning `{ pid: u32, configPath: String }`.
- [ ] **Step 5: Implement `is_mcp_running`** by checking if the PID process exists (platform‑specific; on Windows use `tasklist` via `Command`).
- [ ] **Step 6: Add all commands to the Tauri builder**:
  ```rust
  tauri::Builder::default()
      .invoke_handler(tauri::generate_handler![
          ask_exchange,
          run_doctor,
          start_mcp,
          load_config,
          save_config,
          test_provider,
          is_mcp_running,
      ])
      .run(tauri::generate_context!())
      .expect("error while running tauri application");
  ```
- [ ] **Step 7: Run `cargo test` (create a dummy test that just asserts true) to ensure compilation succeeds.**
- [ ] **Step 8: Commit Rust backend**
  ```bash
  git add tauri-client/src-tauri/src/main.rs tauri-client/Cargo.toml && git commit -m "feat: implement Tauri bridge commands"
  ```

### Task 5: Adjust HTML to Use Tauri's `window.__TAURI__` (if needed)

**Files:**
- May need to add a small script tag that exposes a global `exchangeDesktop` object wrapping the Tauri invoke calls for backward‑compatibility with the existing UI code.

- [ ] **Step 1: In `src/index.html`, after loading the Tauri script, add:**
  ```html
  <script>
  const exchangeDesktop = {
    askExchange: (p) => invoke('ask_exchange', p),
    runDoctor: (p) => invoke('run_doctor', p),
    startMcp: () => invoke('start_mcp'),
    loadConfig: () => invoke('load_config'),
    saveConfig: (yaml) => invoke('save_config', { yaml }),
    testProvider: (p) => invoke('test_provider', p),
    isMcpRunning: () => invoke('is_mcp_running'),
  };
  window.exchangeDesktop = exchangeDesktop;
  </script>
  ```
- [ ] **Step 2: Verify the UI still works without modifying every safeHandler (the wrapper provides the same API).**
- [ ] **Step 3: Commit HTML wrapper**
  ```bash
  git add tauri-client/src/index.html && git commit -m "refactor: add exchangeDesktop shim for Tauri"
  ```

### Task 6: Testing Strategy

**Files:**
- Create: `tauri-client/tests/integration.rs` (Rust integration tests for commands).
- Create: `tauri-client/playwright-tests/desktop.spec.ts` (Playwright UI test).

- [ ] **Step 1: Write a Rust unit test for `load_config` that reads a temporary file.**
- [ ] **Step 2: Write an integration test that spawns the app in headless mode, invokes `ask_exchange` with a mock payload, and asserts the response shape.**
- [ ] **Step 3: Set up Playwright (`npm i -D @playwright/test`) and write a test that clicks the "Run Doctor" button and checks that the log view receives JSON.**
- [ ] **Step 4: Add CI steps to `github/workflows/ci.yml` (if repo uses GitHub Actions) to run `cargo test`, `npm run test`, and `cargo tauri build --target x86_64-pc-windows-msvc`.**
- [ ] **Step 5: Run all tests locally and ensure they pass.**
- [ ] **Step 6: Commit test files and CI updates**
  ```bash
  git add tauri-client/tests tauri-client/playwright-tests && git commit -m "test: add Rust and Playwright tests for Tauri client"
  ```

### Task 7: Build & Distribution

**Files:**
- No new source files, just scripts.

- [ ] **Step 1: Create a release script `scripts/build-tauri.sh`**
  ```bash
  #!/usr/bin/env bash
  set -e
  cd tauri-client
  cargo tauri build --release
  ```
- [ ] **Step 2: Verify the produced installer (`target/release/bundle/msi/*.msi`) launches and the UI works.**
- [ ] **Step 3: Add the script to `package.json` as `"build:tauri": "bash scripts/build-tauri.sh"`.**
- [ ] **Step 4: Commit build script**
  ```bash
  git add scripts/build-tauri.sh package.json && git commit -m "chore: add Tauri build script"
  ```

### Task 8: Clean Up Electron Artifacts

**Files:**
- Delete `src/desktop` Electron‑specific files (`preload.ts`, `main.ts`, etc.) if they are no longer needed.

- [ ] **Step 1: Remove the Electron folder**
  ```bash
  rm -rf src/desktop
  ```
- [ ] **Step 2: Update `package.json` scripts to drop `npm run desktop` (optional) and keep only the Tauri entry points.
- [ ] **Step 3: Run the full test suite again to ensure nothing broke.
- [ ] **Step 4: Commit removal**
  ```bash
  git add -u && git commit -m "chore: remove obsolete Electron source files"
  ```

---
*Plan authored on 2026‑09‑03.*
