# Performance Audit V2 — Full Extension & Macro Controller

**Date**: 2026-03-21  
**Updated**: 2026-03-28  
**Scope**: Chrome extension React UI + macro controller (01-macro-looping.js → TypeScript modules)  
**Status**: All fixes complete ✅

---

## A. Macro Controller Issues — All Resolved ✅

> Migrated from monolithic JS to TypeScript modules. All MC issues resolved during migration + dedicated fix passes.
> **innerHTML reduction**: ~79 → 52 assignments (−34%). Hot paths now use textContent/style mutations.

### MC-01 — ✅ RESOLVED (was CRITICAL)

**Dual countdown systems cause redundant DOM updates**

**Resolution**: State countdown interval (`loop-engine.ts:357`) only decrements `state.countdown` — no `updateStatus()` call. Badge tick (`countdown.ts:40`) uses direct `textContent`/`style` mutations with `lastCountdownVal` dirty check. Countdown excluded from status fingerprint hash. **Zero hot-path DOM rebuilds per tick.**

---

### MC-02 — ✅ RESOLVED (was HIGH)

**168 `innerHTML` assignments, many in hot paths**

**Resolution**: `updateStatus()` uses pre-created sub-elements (`marco-status-line`, `marco-progress-container`, `marco-credit-container`) updated via `textContent`/`style` mutations, guarded by dirty-flag hash (`_lastStatusKey`). `updateRecordIndicator()` uses `ensureRecordChildren()` pattern. `updateButtons()` delegates to namespace call. Performance counters track skip rate via `statusRenderStats`. **52 innerHTML remain — all cold-path or cached.**

---

### MC-03 — ✅ RESOLVED (was HIGH)

**`updateStatus()` generates credit bar HTML every call**

**Resolution**: Two-layer cache in `ui-updaters.ts`. Layer 1: `window._creditBarCache` stores rendered HTML keyed by `lastCheckedAt|workspaceName` — `renderCreditBar()` only runs when data changes. Layer 2: `creditContainer.dataset.cacheKey` prevents redundant `innerHTML` assignments. **Credit bars regenerate once per API fetch (~30s+).**

---

### MC-04 — ✅ RESOLVED (was MEDIUM)

**SPA persistence MutationObserver on `document.body`**

**Resolution**: Observer in `startup.ts` scoped to `<main>` or `#root` (narrowest available container) with `childList: true` only — no `subtree`. Fast short-circuit via `getElementById` checks. `visibilitychange` listener added as fallback safety net for tab-switch re-injection.

---

### MC-05 — ✅ RESOLVED (was MEDIUM)

**Auth indicator polls every 2000ms**

**Resolution**: Poll interval increased from 2000ms to 10000ms in `sections.ts`. Auth panel visibility rarely changes, so 10s polling is sufficient.

---

### MC-06 — ✅ RESOLVED (was MEDIUM)

**384 `for` loops with nested DOM queries in workspace list**

**Resolution**: `renderLoopWorkspaceList()` in `ws-selection-ui.ts` builds all items into a `DocumentFragment`, then performs a single `listEl.innerHTML = ''; listEl.appendChild(frag)` operation. Event delegation used where applicable.

---

### MC-07 — ✅ RESOLVED (was LOW)

**Log rendering rebuilds full HTML on each call**

**Resolution**: `updateActivityLogUI()` in `logging.ts` tracks `_logRenderedCount` and appends only new entries via `DocumentFragment` + `insertBefore`. Full rebuild only occurs on FIFO trim (`didTrim` flag).

---

### MC-08 — ✅ RESOLVED (was LOW)

**Remaining innerHTML in cold paths**

**Resolution**: 21 `innerHTML` assignments replaced with `textContent` across `database-modal.ts`, `database-schema-tab.ts`, `database-json-tab.ts`, `save-prompt.ts`, and `prompt-manager.ts`. Container clears converted from `innerHTML = ''` to `textContent = ''`.

---

## B. Chrome Extension React UI Issues

### EXT-01 — ✅ RESOLVED (was HIGH)

**Framer Motion used for simple transitions**

**Resolution**: `framer-motion` fully removed from dependencies. All animations replaced with CSS3 `@keyframes` and `transition` utilities defined in `index.css` (line 423+) and Tailwind config (fade-in, scale-in, slide-in-right). Zero JS animation overhead.

---

### EXT-02 — ✅ RESOLVED (was MEDIUM)

**DiagnosticsPanel auto-refresh every 10s**

**Resolution**: `DiagnosticsPanel.tsx` (lines 94-109) uses a `visibilitychange` listener to pause polling when the tab is hidden and resume when visible. Cleanup removes listener and clears interval.

---

### EXT-03 — ✅ RESOLVED (was LOW)

**MonacoEditor loaded eagerly**

**Resolution**: `LazyMonacoCodeEditor.tsx` wraps `MonacoCodeEditor` in `React.lazy()` + `Suspense` with a shimmer fallback. All consumers import from `./LazyMonacoCodeEditor`. Monaco (~2MB) only loads when a code editor tab is opened.

---

## C. Fix Status Summary

| # | ID | Issue | Status | Impact |
|---|-----|-------|--------|--------|
| 1 | MC-01 | Countdown DOM rebuild | ✅ Done | **Critical** — eliminated 1 full DOM rebuild/sec |
| 2 | MC-02 | Hot-path innerHTML → textContent | ✅ Done | **High** — zero innerHTML in hot paths |
| 3 | MC-03 | Credit bar HTML caching | ✅ Done | **High** — regenerates only on API fetch |
| 4 | MC-04 | Narrow MutationObserver scope | ✅ Done | **Medium** — no subtree observation |
| 5 | MC-05 | Auth indicator poll interval | ✅ Done | **Medium** — 2s → 10s |
| 6 | MC-06 | DocumentFragment batch DOM | ✅ Done | **Medium** — single DOM operation |
| 7 | MC-07 | Incremental log appending | ✅ Done | **Low** — append-only with FIFO guard |
| 8 | MC-08 | Cold-path innerHTML cleanup | ✅ Done | **Low** — 21 assignments converted |
| 9 | EXT-01 | Replace framer-motion | ✅ Done | **High** — 32KB bundle removed |
| 10 | EXT-02 | Conditional diagnostics refresh | ✅ Done | **Medium** — visibility-gated polling |
| 11 | EXT-03 | Lazy-load Monaco | ✅ Done | **Low** — deferred ~2MB until needed |

---

## D. Metrics

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| innerHTML assignments | ~79 | 52 | −34% |
| textContent assignments | ~312 | 351 | +12% |
| Hot-path innerHTML | ~8 | 0 | −100% |
| Countdown DOM rebuilds/sec | ~2 | 0 | −100% |
| Auth poll interval | 2s | 10s | −80% |
| MutationObserver scope | body+subtree | main/childList | Narrowed |
