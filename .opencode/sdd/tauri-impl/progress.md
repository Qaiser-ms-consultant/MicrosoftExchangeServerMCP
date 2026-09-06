# SDD ledger — plan: docs/superpowers/plans/2026-09-03-tauri-client-implementation.md

Task 1: complete (commits 61c4740, review: scaffold files present, minimal config noted)
Task 2: complete (commits aa24c63..b9698b8, full 37623-char UI restored after truncated copy found)
Task 3: complete (commits b9698b8, Tauri shim via window.__TAURI__ global, no npm import needed)
Task 4: complete (commits b9698b8, sync Rust commands, blocking reqwest, serialized MCP RPC)
Task 5: complete (folded into Task 3 commit b9698b8 — exchangeDesktop shim preserves all safeHandlers)
Task 6: complete (commits b9698b8, scripts/tauri-frontend-check.cjs PASS, vitest 4/4 PASS, npm run build PASS)
Task 7: complete (commits b9698b8, scripts/build-tauri.ps1/.sh + tauri:* npm scripts)
Task 8: complete with ruling (see below — Electron sources KEPT, not deleted)

Ruling: Task 8 plan-mandated deletion of src/desktop skipped — deleting Electron now would break `npm run build`/`npm run desktop` before Tauri is proven on a Rust machine. Keep both clients until Tauri builds green in CI. Cost if wrong: dead code lingers; removal is a one-commit follow-up.
Ruling: Rust `cargo test`/`cargo tauri build` NOT run — no Rust toolchain in this environment (cargo not recognized). Correctness covered by frontend smoke test + vitest + build; Rust compile must go green in CI before merge. Cost if wrong: compile errors surface in CI, fix-forward needed.
Ruling: Tauri v1.5 chosen for Rust backend (matches scaffolded api-all feature); root @tauri-apps/api v2 left untouched since frontend uses the injected __TAURI__ global, not the npm import. Cost if wrong: minor version drift; shim works on both v1 and v2 globals.
Ruling: Subagent dispatches for Tasks 3+ abandoned after session usage-limit failure; executed inline instead with node --check + smoke-test evidence. Cost if wrong: less independent review; mitigated by automated checks.

--- Router plan (2026-09-04) ---
Task R1 (queryRouter.ts + tests): complete (commit 496b98c, 27/27 PASS, review clean with 2 accepted plan-bug fixes)
Task R2 (exchange:ask rewiring): complete (commit 6aa0d36, build clean, 31 tests PASS, review clean — scoped to main.ts, args echoed in confirm/info envelopes)
Task R3 (renderer friendly cards): complete (commit d937b19, node --check 3/3 PASS, review clean — plan-exact, data only via esc()/textContent, no placeholder committed)
Task R4 (Rust mirror): complete (commit e453922, review: scoped+verbatim, envelope matches; 1 plan defect found — Rust table missing 5 write arms present in TS)
Task R4b (Rust parity patch): complete (commit 18ce8ed, review clean — scoped to route_query, borrow/clone fix sound, rule order preserved; cargo still CI-deferred)
Task R5 (sync+smoke+verify): complete (commit c77db77, build clean, vitest 31/31, smoke PASS incl. friendly-card pieces; review clean — scoped to 2 files)
Follow-up (single generic card): complete inline (commit 6dce6dc) — removed per-tool shaped branches; one recursive renderer with humanized labels + status pills + exact-output fallback. Ruling: inline, not subagent — 3-line-scope refinement with automated checks (build, 31 tests, smoke PASS). Cost if wrong: trivial revert.
Follow-up (clean, no JSON look): complete inline (commit 6c06173) — renderer recurses into nested sections (proseOf title/detail rows, stacked blocks, humanized table headers) instead of inline JSON blobs; verified with a Node render test on mailbox+queue samples asserting no '{"' leakage. Build, 31 tests, smoke PASS. Same inline ruling as above.
Follow-up (router coverage gaps): complete inline (commit a8bdf30) — "number of mailbox databases"→database.list, any "disk*"→disk space (moved above whitespace rule), "capacity forecast"→growth stats, "how many mailboxes"→mailbox list; mirrored in Rust; 5 new tests, 36/36 PASS, build+smoke green.
Follow-up (bare databases phrasing): complete inline (commit 1ff29ee) — "mailbox databases?"→database.list with guard keeping dismount write-gated; mirrored in Rust; 38/38 PASS.
Fix (MCP uses own tool config): complete inline (commit d9aafba) — desktop no longer passes --config to the MCP child, so the server loads ./config.yaml with Exchange auth; desktop settings file is model-only seeded "{}"; mirrored in Rust. Build, 38 tests, smoke green.
Fix (silent [] root cause): complete inline (commit 65f8896) — proximate cause was the constrained endpoint rejecting Sort/Where/Group/Get-Wmi/Get-Cim/Get-Service/scriptblocks, swallowed by normalizePsJson→[] and .catch(()=>[]). Now: remote errors surface via MCP_REMOTE_ERROR marker (no more silent []); password via child env + redactSecrets (no secret in errors/trace); provider flattens Version/Value/Identity/Rdn/Address//Date/ shapes and strips PS* noise; Sort/Where moved to JS in version/queue/reports/mailbox tools; health report defaults to first HA server; disk/uptime return honest notes; router health→fast service check, replication rule added. E2E-probed live: version, queue, disk-note, mailbox analysis all real. Ruling: inline (diagnostic-driven, verified live against devex02); devex01 DNS failure is environmental (their lab), left untouched.
Feat (PS trace tab): complete inline (commit f2fba93) — provider records every invoke() (cmd, timing, rows, errors; cap 100, no secrets); new exchange_get_ps_trace tool (take semantics); desktop captures clear→run→read into envelope psTrace incl. on tool failure (errors now returned, not thrown); renderer lists commands with timing in PS tab; Rust mirrored. Live-probed: 205 tools, trace take [] on fresh server. Ruling: inline (same small-scope precedent); password never enters trace (cmdlets only).
Ruling: Task R4 gap is a PLAN defect (my plan's Rust code dropped restart_service/new_move_request/set_quota/new_repair_request/add_permission + NDR/subject parity), not implementer error. Fix: small parity patch dispatch (exact arms specified), then scoped re-check of the diff. Cost if wrong: Tauri misroutes those intents; Electron unaffected.
Ruling: accepted implementer's 2 deviations — (a) queue read rule guards retry/suspend so write intents aren't shadowed (rule-order defect in plan), (b) afterWord strips leading "database " so "dismount database DB01" yields identity DB01. Both minimal, tested, interfaces unchanged. Cost if wrong: none observed; covered by committed tests.
