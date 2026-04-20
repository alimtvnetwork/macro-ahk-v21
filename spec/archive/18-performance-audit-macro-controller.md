# Performance Audit: Macro Controller (01-macro-looping.js)

**Date**: 2026-03-21  
**File size**: 8,541 lines / 389 KB  
**Status**: Audit complete — fixes pending

---

## Summary

The macro controller is a single 389KB JavaScript file with 8 `setInterval` timers, 2 `MutationObserver` instances, 21 event listeners, and 34 `innerHTML` assignments. Several patterns cause unnecessary CPU usage and DOM thrashing.

---

## Issues Found

### P1 — HIGH: `updateUI()` rebuilds workspace dropdown on every call

**Location**: `updateUI()` (line 4294) → `populateLoopWorkspaceDropdown()` (line 3184) → `renderLoopWorkspaceList()` (line 3018)

**Problem**: `updateUI()` is called on every state change, countdown tick, observer mutation, and status refresh. Each call re-renders the entire workspace dropdown list (up to 160 workspaces), including credit bar HTML generation. This involves:
- Clearing `innerHTML` of the list container
- Creating DOM elements for every workspace
- Calling `renderCreditBar()` for each workspace (complex SVG/HTML generation)
- Re-querying `loopCreditState.perWorkspace` array

**Impact**: DOM thrashing, layout recalculations, GC pressure from abandoned DOM nodes.

**Fix**: Only re-render workspace list when workspace data actually changes (use a dirty flag or hash comparison).

---

### P2 — HIGH: Countdown badge updates every 500ms via `setInterval`

**Location**: `startCountdownTick()` (line 5837)

**Problem**: A 500ms interval updates countdown badge text and color. Each tick updates DOM properties even if the countdown value hasn't changed.

**Fix**: Use `requestAnimationFrame` or increase interval to 1000ms (countdown shows seconds, so 500ms gives no visual benefit). Add dirty check: skip DOM update if countdown value hasn't changed.

---

### P3 — MEDIUM: Auth indicator polls every 2000ms

**Location**: Line 7189 — `setInterval(function() { ... }, 2000)`

**Problem**: Polls DOM via `document.getElementById('marco-auth-panel')` every 2 seconds to update a menu icon that's rarely visible.

**Fix**: Replace with event-driven update — set the icon when auth panel is shown/hidden instead of polling. Or increase interval to 10s.

---

### P4 — MEDIUM: `refreshStatus()` opens/closes project dialog every 5s

**Location**: `startStatusRefresh()` (line 5040) — interval set to `TIMING.WS_CHECK_INTERVAL` (default 5000ms)

**Problem**: When the loop is NOT running, `refreshStatus()` fires every 5 seconds and:
1. Runs `fetchWorkspaceNameFromNav()` (XPath evaluation)
2. Opens the project dialog (`ensureProjectDialogOpen`)
3. Polls for dialog readiness (`pollForDialogReady`)
4. Reads credit status
5. Closes the dialog

This is extremely disruptive (dialog flickering) and CPU-heavy.

**Fix**: Increase to 30s or 60s when idle. Only open dialog when explicitly needed (manual Check or credit fetch).

---

### P5 — MEDIUM: SPA persistence MutationObserver watches all of `document.body`

**Location**: Line 8497 — `observer.observe(document.body, { childList: true, subtree: true })`

**Problem**: Watches ALL DOM mutations on the entire page body. Every React re-render, animation frame, or third-party script DOM update triggers the callback. The callback has a debounce (good) but still runs `getElementById` checks on every mutation batch.

**Fix**: Narrow the observer scope to a specific parent container instead of `document.body`. Or use a less aggressive check (e.g., `visibilitychange` event + periodic poll).

---

### P6 — LOW: `renderCreditBar()` generates complex inline HTML per workspace

**Location**: `renderCreditBar()` (line 1082)

**Problem**: Each credit bar generates a multi-segment HTML string with inline styles, gradients, and tooltips. With 160 workspaces, this produces ~50KB of HTML per render.

**Fix**: Cache rendered HTML per workspace and only regenerate when credit values change. Use CSS classes instead of inline styles.

---

### P7 — LOW: `log()` function may accumulate large arrays

**Location**: Activity log storage

**Problem**: All log entries are stored in memory arrays. Long sessions can accumulate thousands of entries.

**Fix**: Add FIFO cap (e.g., keep last 500 entries). Already partially implemented in stats storage but verify log arrays are capped.

---

### P8 — LOW: 34 `innerHTML` assignments

**Problem**: Each `innerHTML` assignment forces the browser to parse HTML, destroying and recreating DOM nodes. Some are in hot paths (updateStatus, updateButtons).

**Fix**: For simple text updates, use `textContent`. For complex HTML that doesn't change structure, use targeted `textContent`/`style` updates on existing elements.

---

## Recommended Fix Priority

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| 1 | P1: Dirty-flag workspace dropdown | Medium | High — eliminates biggest DOM thrash |
| 2 | P4: Reduce idle refresh interval | Low | High — stops dialog open/close spam |
| 3 | P2: 1s countdown + dirty check | Low | Medium — reduces tick overhead |
| 4 | P3: Event-driven auth indicator | Low | Low — minor CPU save |
| 5 | P5: Narrow MutationObserver scope | Medium | Medium — fewer callback invocations |
| 6 | P8: textContent over innerHTML | Medium | Low — incremental improvement |
| 7 | P6: Cache credit bar HTML | Medium | Low — only matters with many workspaces |
| 8 | P7: Log array FIFO cap | Low | Low — prevents memory leaks in long sessions |
