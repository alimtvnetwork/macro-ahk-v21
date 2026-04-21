# Memory: architecture/extension-error-management
Updated: 2026-04-21

## Multi-layered error reporting

The extension uses a multi-layered error management strategy:

1. **Non-critical fallbacks** use `console.debug` (no UI surface).
2. **Critical errors** are routed through `RiseupAsiaMacroExt.Logger.error()` and surfaced in the popup error count badge.
3. **Boot failures** are captured by `boot.ts`'s top-level `try/catch` and exposed via three signals:
   - `setBootStep("failed:<step>")` — names the failed phase
   - `setBootError(err)` — captures the underlying `Error.message` and stack
   - `BootFailureBanner` — renders the failed step + error message + step-specific recovery hint

## Boot failure surfacing (v2.171.0+)

- `boot-diagnostics.ts` exposes `getBootErrorMessage()` and `getBootErrorStack()` alongside the existing `getBootStep()`.
- `status-handler.ts` includes `bootError: string | null` in the `GET_STATUS` response.
- `BootFailureBanner.tsx` renders the underlying error in a monospace block plus a `getRecoveryHint()` derived from the failed step + error keywords (e.g. WASM load → "Rebuild and reload"; OPFS/storage → "Try clearing storage").

This eliminates the previous "boot failed but you can't see why" dead-end where users only saw the step name (`db-init`) without the cause (e.g., `Failed to fetch WASM at chrome-extension://…/wasm/sql-wasm.wasm`).

## Common db-init causes

- **WASM 404** — `wasm/sql-wasm.wasm` not present in the extension output (`chrome-extension/`). Check `viteStaticCopy` target in `vite.config.extension.ts` and the post-build `Manifest path validation` in `extension-build.ps1`.
- **OPFS unavailable** — `navigator.storage.getDirectory()` throws (rare; falls through to `chrome.storage.local`, then in-memory).
- **Schema migration failure** — A `migrateSchema()` step throws; the rollback path runs `migration.down()` and the manager remains in a degraded state.
