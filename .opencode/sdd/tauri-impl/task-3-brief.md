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
