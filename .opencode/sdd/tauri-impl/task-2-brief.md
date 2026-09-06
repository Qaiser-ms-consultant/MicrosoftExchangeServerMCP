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
