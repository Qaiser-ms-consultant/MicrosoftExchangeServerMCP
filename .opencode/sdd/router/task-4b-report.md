# Task 4b Report — Rust router parity (route_query)

Branch: tauri-impl
File: tauri-client/src-tauri/src/main.rs (only file committed)
SHA: 18ce8edb6754e9f7a3b69b2db21345ad9df4419d
Commit: "fix: Rust router parity for write arms, NDR and trace subject"

## Changes
1. NDR arm: replaced over-matching `prompt.contains("5.")` with `extract_ndr_code(prompt).is_some()`. Added verbatim `extract_ndr_code` helper (token scan, trim non-alnum except '.', exactly 2 dots, leading digit). Arm builds `{"code": code}` or `{}` and returns `mailflow.get_ndr_details` (read-only).
2. Trace arm: kept position in rule order. Added verbatim `extract_quoted` helper (first matched single/double quote pair). Args start from `json!({})`, insert `sender` from `email.clone()` if present, insert `subject` from `extract_quoted(prompt).filter(non-empty)` if present. Returns `mailflow.get_message_trace` (read-only).
3. Write arms inserted immediately before the `ai.tell_me_everything` fallback, in order: `server.restart_service` (parses word after "service", confirm=true), `mailbox.new_move_request` (identity from email, write), `mailbox.set_quota` (identity from email, write), `database.new_repair_request` (empty args, write), `mailbox.add_permission` (identity + SendAs vs FullAccess, write). All verbatim per spec.

## Self-review (no cargo available)
- Read final `route_query` (lines ~425-525) after edits.
- Borrow/move: `email: Option<String>` was previously moved by `email.map(...)` in trace arm and by `if let Some(e) = email` in permission/statistics arms, which would not compile once later write arms + fallback also use `email`. Fixed by converting all non-final uses to `email.clone()` (trace, permission-read, statistics-read, move, quota, permission-write); final fallback keeps by-value `if let Some(e) = email` as the last use. `obj` closure only borrows; `prompt: &str` reused by `extract_ndr_code`/`extract_quoted`/restart parsing without moves. No `mut email` needed.
- `trace_args` starts as `json!({})` (Object) so `trace_args["sender"]/["subject"]` index-assign compiles via `Value: IndexMut`.
- `extract_quoted(...).filter(|s| !s.is_empty())`: `filter` receives `&String`, `is_empty()` resolves via deref — compiles.
- Restart `name` chain: `split_whitespace` over `&str`, `skip_while` + `nth(1)` + `trim_matches` + `filter` yields `Option<String>` — compiles; `m: serde_json::Map` insertions typed `String`/`Bool` — compiles.
- Rule order preserved: read arms unchanged and in original positions; trace modified in place; new write arms only before fallback; fallback + `None` tail unchanged.

## Concerns
- Could not run `cargo check`/`cargo test` (cargo unavailable here); verification is manual read-through only.
- `extract_ndr_code` requires exactly 2 dots and leading digit, so bare "5.7.1" with trailing punctuation is trimmed correctly, but codes embedded without whitespace (e.g. "(5.7.1)") rely on trim; codes split across tokens won't match — matches spec verbatim.
- `extract_quoted` returns the first quote-pair span even if unbalanced later; empty quotes (`""`) are filtered out for subject — per spec.
- Write-arm `targetDatabase`/`user`/`database` required-arg gaps are handled downstream by `write_required_args` needsInfo flow; no extra parsing added per spec.
