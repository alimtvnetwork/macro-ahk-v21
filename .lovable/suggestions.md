# Suggestions

> Single source of truth. The previous tracker at `.lovable/memory/suggestions/01-suggestions-tracker.md` (S-001 … S-055) is preserved and remains the historical archive for IDs and completion notes. New suggestions land here.

---

## Active Suggestions

### Round-trip files (file:save → file:list → file:delete) and grouped-kv in the SDK self-test
- **Status:** Pending
- **Priority:** Medium
- **Description:** Extend `standalone-scripts/marco-sdk/src/self-test.ts` to exercise the file-storage and grouped-kv handlers with the same set/get/delete pattern as the new KV round-trip, so every project-scoped storage surface is health-checked on every page load.
- **Added:** 2026-04-20 (session v2.166.0)

### Surface latest sdkSelfTest + kv-roundtrip results in the popup
- **Status:** Pending
- **Priority:** Medium
- **Description:** Show ✅/❌ + last-run timestamp in the popup so users see SDK health without opening DevTools.
- **Added:** 2026-04-20

### Vitest tests for `assertBindable` + `BindError`
- **Status:** Pending
- **Priority:** Medium
- **Description:** Cover INSERT / UPDATE / SELECT / DELETE column inference and verify the Proxy throws `BindError` on undefined params via `db.run`, `db.exec`, and `db.prepare(...).bind()`/.run() paths.
- **Added:** 2026-04-20

### Vitest tests for handler-guards regression suite
- **Status:** Pending
- **Priority:** Medium
- **Description:** Call `handleKvGet`, `handleGkvList`, `handleFileSave`, `handleProjectApi` with payloads missing each required field; assert clean `{ isOk:false, errorMessage }` responses (no SQLite throw).
- **Added:** 2026-04-20

### Hook `BindError` into the global Errors panel reporter
- **Status:** Pending
- **Priority:** Low
- **Description:** Any future undefined-bind escape should auto-land in the Errors panel with column + SQL preview, not just the message-router log.
- **Added:** 2026-04-20

### Audit remaining 8 SQLite-backed handlers for handler-guards adoption
- **Status:** Pending
- **Priority:** Medium
- **Description:** `prompt-handler.ts`, `library-handler.ts`, `settings-handler.ts`, `project-handler.ts`, `project-config-handler.ts`, `script-config-handler.ts`, `updater-handler.ts`, `run-stats-handler.ts` — apply `handler-guards` everywhere a payload field reaches `db.run` / `db.exec` / `stmt.bind`. The new `wrapDatabaseWithBindSafety` will surface any miss with a precise `BindError`.
- **Added:** 2026-04-20

### S-021 — Chrome Extension Test Coverage Expansion (carry-over)
- **Status:** Pending
- **Priority:** Medium
- **Description:** Deeper integration tests; target 900+ tests. Originally tracked as S-021 in `memory/suggestions/01-suggestions-tracker.md`.
- **Added:** 2026-03-14

### S-055 — P Store Backend API Implementation (carry-over)
- **Status:** Pending
- **Priority:** High
- **Description:** P Store frontend spec exists but no backend API. Define and implement the server-side API or a mock service. F-025 — 100% failure until backend exists.
- **Added:** 2026-04-05

---

## Implemented Suggestions

### SDK self-test KV round-trip (set → get → verify-equals → delete → verify-cleared)
- **Implemented:** 2026-04-20 — v2.166.0
- **Notes:** `standalone-scripts/marco-sdk/src/self-test.ts` now logs a follow-up `[sdkSelfTest:kv-roundtrip] PASS/FAIL` line via `NamespaceLogger`. Split into `runSdkSelfTest` + helpers (`checkShape`, `checkMeta`, `checkKvListSync`) and `runKvRoundTrip` + helpers (`hasFullKvSurface`, `tryStep`, `verifyGetEquals`, `verifyGetCleared`, `reportRoundTrip`) to satisfy zero-warning lint policy.

### Global SQLite bind-safety net via `wrapDatabaseWithBindSafety`
- **Implemented:** 2026-04-20 — v2.165.0
- **Notes:** New `src/background/sqlite-bind-safety.ts` exports `assertBindable(sql, params)` + typed `BindError` (param index, inferred column name, SQL preview) and a Proxy wrapper applied at `db-manager.buildManager()` and `project-db-manager.getProjectDb()`. Replaces the cryptic sql.js "tried to bind a value of an unknown type (undefined)" with a precise diagnostic.

### Audit SQLite handlers for missing-field guards
- **Implemented:** 2026-04-20 — v2.164.0
- **Notes:** New `src/background/handlers/handler-guards.ts` (validators `requireProjectId` / `requireKey` / `requireSlug` / `requireField`, binders `bindOpt` / `bindReq`, `safeBind`). Refactored `kv-handler.ts`, `grouped-kv-handler.ts`, `file-storage-handler.ts`, `project-api-handler.ts`, `logging-handler.ts`, `user-script-log-handler.ts`, `error-handler.ts`. Returns `{ isOk:false, errorMessage }` instead of crashing sql.js.

### SDK runtime self-test (sync surface)
- **Implemented:** 2026-04-20 — v2.161.0–v2.163.0
- **Notes:** `runSdkSelfTest()` validates `RiseupAsiaMacroExt.Projects.RiseupMacroSdk` namespace, `.meta`, shape (13 sub-namespaces), and that `.kv.list()` returns a Promise without throwing. Logs `[sdkSelfTest] PASS — Projects.RiseupMacroSdk vX.Y.Z (5 checks)` via `NamespaceLogger`.

### Build-time check for relative spec/ markdown links
- **Implemented:** 2026-04-20
- **Notes:** Added validator that scans `spec/**.md` for relative links and fails the build when targets are missing. Prevents silent rot of cross-spec references.

### Spec 11/63 + developer-guide updates for `RiseupMacroSdk` self-namespace
- **Implemented:** 2026-04-20
- **Notes:** Documents the SDK as the self-registered namespace and the stub-vs-full distinction.
