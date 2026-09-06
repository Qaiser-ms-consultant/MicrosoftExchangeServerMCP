# Task 1 Report — Query router module + unit tests

- Branch: tauri-impl
- Commit: 496b98c8ad8861f785aebc0088fdd3027ab3b337 ("feat: keyword query router with tests")
- Files: `src/desktop/queryRouter.ts` (new), `tests/queryRouter.test.ts` (new, verbatim from plan)

## What I did
1. Wrote `tests/queryRouter.test.ts` verbatim from the plan (Task 1 Step 1).
2. Ran `npx vitest run tests/queryRouter.test.ts` — confirmed RED: suite failed to load with "Failed to load url ../src/desktop/queryRouter.js ... Does the file exist?" (missing module, as expected).
3. Wrote `src/desktop/queryRouter.ts` from the plan (Task 1 Step 3), then applied two minimal fixes (see Concerns) because the verbatim code failed 2 tests.
4. Ran `npx vitest run tests/queryRouter.test.ts` — GREEN: 27/27 pass.
5. Committed only the two files: `git add src/desktop/queryRouter.ts tests/queryRouter.test.ts && git commit -m "feat: keyword query router with tests"`.

## Test output
- RED (before implementation): 1 failed suite, 0 tests collected — "Failed to load url ../src/desktop/queryRouter.js".
- Verbatim implementation: 25 passed / 2 failed of 27:
  - "routes dismount as a write needing confirm": got `{ identity: "database DB01" }`, expected `{ identity: "DB01" }`.
  - "routes queue retry as a write needing confirm": got `{ tool: "exchange_get_queue", ... }`, expected `{ tool: "exchange_retry_queue", ... }`.
- Final (after fixes): `Test Files 1 passed; Tests 27 passed (27)`.

## Commit SHA
496b98c8ad8861f785aebc0088fdd3027ab3b337

## Concerns / deviations from plan
1. **Verbatim router did not pass.** Two minimal fixes in `src/desktop/queryRouter.ts` only (test file untouched, still verbatim):
   - Queue read rule now guards write intents: `&& !has("retry", "suspend")`, so "retry queue ..." / "suspend queue ..." reach the write branches instead of matching `exchange_get_queue` first.
   - `dismount`/`mount` branches strip a leading "database " from `afterWord(...)` (`raw?.replace(/^database\s+/i, "")`), so "dismount database DB01" yields `{ identity: "DB01" }`. Applied to `mount` too for symmetry (untested).
2. **Test count is 27, not 26.** The plan says "26/26 PASS" but the verbatim test file contains 27 tests (2 extractIdentity + 25 routeQuery). Final result is 27/27 PASS.
3. Interfaces as required are exported: `RouteResult`, `HelpRoute`, `Route`, `extractIdentity`, `routeQuery`. Note the plan's Interfaces line says `routeQuery` returns `RouteResult | HelpRoute` while the implementation exports a `Route` alias — compatible.
4. Only the two task files were staged/committed; untracked `.opencode/sdd/tauri-impl/*` files were left alone. This report is untracked at `.opencode/sdd/router/task-1-report.md` (not committed, per instructions).
