# Strictly Avoid — Hard Prohibitions

> The project's "never do this" list. Every entry is rooted in a real failure or design constraint. Do not re-introduce.

## Storage & backend

- **Supabase (any form):** No SDK, no auth, no tokens, no client storage keys. Storage stack is sql.js + OPFS + chrome.storage.local only. See: `.lovable/memory/constraints/no-supabase` (memory index).
- **localStorage for roles or admin checks:** Privilege escalation vector. Use server-validated role tables only.
- **Binding `undefined` to SQLite:** Always coerce via `bindOpt()` / `bindReq()` from `src/background/handlers/handler-guards.ts`. The `wrapDatabaseWithBindSafety()` Proxy now throws a typed `BindError` if anything slips through. See: `.lovable/solved-issues/10-sqlite-undefined-bind-crashes.md`.

## Reliability

- **Recursive retry / exponential backoff:** Banned. Sequential fail-fast only. See: `.lovable/memory/constraints/no-retry-policy.md`.
- **CI build notifications (email or otherwise):** Never. See memory: `constraints/no-ci-notifications`.
- **Touching `skipped/` or `.release/`:** Read-only archives. See memory: `constraints/skipped-folders`.

## Type safety & code quality

- **`unknown` outside `CaughtError`:** Function params must use designed types. See: `.lovable/memory/standards/` (unknown-usage-policy).
- **Bare `log()` for errors:** Always use `RiseupAsiaMacroExt.Logger.error()` (or `NamespaceLogger.error()` in SDK code). See memory: `standards/error-logging-via-namespace-logger.md`.
- **Swallowed errors:** Every `catch` must log via the namespace logger; never `catch {}` with no diagnostic.
- **HARD ERROR logs without exact path / missing item / reasoning:** CODE RED. See memory: `constraints/file-path-error-logging-code-red.md`.

## UI

- **Light-mode theme or theme toggles:** Dark-only enforced. See memory: `preferences/dark-only-theme`.
- **Custom color classes (`text-white`, `bg-black`, etc.) in components:** Use semantic tokens from `index.css` + `tailwind.config.ts`. All colors HSL.
- **`<noscript><img></noscript>` inside `<head>`:** HTML5-invalid; place pixel fallbacks inside `<body>`.

## Versioning

- **Bumping one version file in isolation:** All of `chrome-extension/manifest.json`, `src/shared/constants.ts`, every `standalone-scripts/*/src/instruction.ts`, `macro-controller/src/shared-state.ts`, and the SDK `index.ts` literal must move together. See memory: `workflow/versioning-policy`.

## Folder structure

- **`.lovable/memories/` (with trailing `s`):** Wrong path. Canonical is `.lovable/memory/`.
- **Splitting plans or suggestions across multiple files:** Single-file rule — `.lovable/plan.md`, `.lovable/suggestions.md`.
- **Creating `completed/` sub-folders:** Move completed entries into a `## Completed` section inside the same file.
