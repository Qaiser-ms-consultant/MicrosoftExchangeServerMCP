# Task 4 Report — Rust mirror (router + envelope)

Commit: `e4539222ea415ec937295394daa6c7ed23537a2e`
Branch: `tauri-impl`
File modified (only): `tauri-client/src-tauri/src/main.rs` (+120/−27)

## What was done
1. **Step 1 (verbatim from plan):** Extended `AskArgs` with `confirmed: bool`, `tool: Option<String>`, `args: Option<serde_json::Value>` (all `#[serde(default)]`). Added `write_required_args`, `has_any`, `route_query`, `after_word` helpers verbatim. Kept existing `extract_identity` untouched (used by `route_query`); kept `spawn_mcp_locked` / `ensure_mcp_initialized` / `mcp_rpc` / `read_matching_response` helpers untouched.
2. **Step 2 (verbatim from plan):** Replaced `ask_exchange` body with the envelope version: empty-prompt guard, MCP alive+init block, explicit tool+args passthrough (write=true), `route_query` with help envelope fallback, `needsInfo`/`needsConfirm` gate with `args` echoed, `confirm:true` injection on confirmed writes, `{prompt, tool, result}` return with JSON-parse fallback to raw string.
3. No changes to `Cargo.toml` (std + serde/serde_json only, no new crates). No other files touched.

## Self-review findings
- **Tuple shape:** every `route_query` arm returns `Some((String, Value, bool))` (`.into()` infers `String` from the return type); guarded permission/statistic arms fall through when no email, matching TS fall-through order. `None` = help. ✓
- **`write_required_args` vs TS `WRITE_REQUIRED_ARGS`:** all 9 TS keys covered with identical required-field lists (mount/dismount/retry/suspend→`identity`; restart_service→`name`; new_move_request→`identity,targetDatabase`; set_quota→`identity`; new_repair_request→`database`; add_permission→`identity,user`). ✓
- **Envelope keys vs Task 2:** help `{prompt, tool, result}`; needsInfo `{prompt, tool, args, needsInfo, missing, result}`; needsConfirm `{prompt, tool, args, needsConfirm, result}`; success `{prompt, tool, result}`. Matches Task 2 (including the Task 3 adjustment note that `args` is echoed). ✓
- **Move semantics:** `if let Some(t) = args.tool` partially moves only `tool`; later uses of `args.args`/`args.confirmed` are disjoint fields — legal Rust. `mut rpc_args` only mutated in the confirmed-write branch (`as_object_mut` guarded, so non-object args pass through unchanged — same as plan). ✓

## Concerns
1. **`cargo` could not be run here (not available in this environment) — CI must compile this.** Self-reviewed types by hand instead; risk is low but nonzero (e.g. closure type inference on `obj`, `trim_matches` closure signature).
2. **Intentional TS↔Rust divergence (plan's verbatim code, not my deviation):** the Rust mirror omits several TS write arms — `server.restart_service`, `mailbox.new_move_request`, `mailbox.set_quota`, `database.new_repair_request`, `mailbox.add_permission` — so those prompts fall through to `ai.tell_me_everything`/help in Tauri but route to confirm-gated writes in Electron. Also NDR detection uses `prompt.contains("5.")` + whitespace-token scan instead of the TS `NDR_RE` regex, and the trace arm drops the quoted-subject extraction. Flagging for Task 5 / follow-up parity work.
3. **`missing` check uses `as_str()` only:** a required arg supplied as a non-string JSON value counts as missing (verbatim from plan; TS checks `=== undefined || === ""`). Edge case, unlikely in practice.
4. **`after_word` returns rest-of-string** (may include trailing words, e.g. `dismount database DB01` → `database DB01` as identity). Same behavior as TS `afterWord`; callers must tolerate it.
