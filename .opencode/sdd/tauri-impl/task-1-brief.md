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
