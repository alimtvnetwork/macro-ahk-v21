# V7.1 Improvement Plan: Force Up/Down Optimization & Workspace Observer

**Created**: 2026-02-20  
**Status**: ✅ COMPLETE (all 5 phases done, v7.1.4 hotfix applied)

---

## ⚠️ CRITICAL WARNING (from Issue #1 v7.0)

**NEVER remove the F12 close/reopen cycle in `JsInject.ahk`.**  
The `else` branch MUST do: `F12` → `Sleep(300)` → `Ctrl+Shift+J` → `Sleep(consoleOpenDelayMs)`.  
Skipping F12 (the "fast-path" optimization from v6.56) breaks all sequential script injections.  
See `specs/spec-issues-v7.0.md` Issue #1 for full root cause.

---

## Overview

Five areas of improvement identified from user testing:

| # | Area | Severity | Status |
|---|------|----------|--------|
| 1 | Force Up/Down is extremely slow | High | ✅ Done |
| 2 | Settings tab: skip re-injection if combo.js present | High | ✅ Done |
| 3 | Project tab return: skip re-injection if macro-looping.js present | High | ✅ Done |
| 4 | Workspace name not always visible (observer broken) | Medium | ✅ Done |
| 5 | All keystrokes must go through SendKey (audit) | Low | ✅ Done (already clean) |

---

## Phase 1: Reduce Force Up/Down Delay (HandleDelegate optimization)

**Problem**: `HandleDelegate()` in `MacroLoop.ahk` takes 5-10+ seconds due to cumulative `Sleep()` calls and redundant operations.

**Current timing breakdown** (worst case):
| Step | Operation | Delay |
|------|-----------|-------|
| 0 | Close DevTools (F12) | 500ms |
| 1 | GetCurrentUrl (Ctrl+L, Ctrl+C, Esc) | ~600ms |
| 2 | Tab search (N × delegateTabSwitchDelayMs) | N × 300ms |
| 3 | Focus page (Sleep + Escape + F6) | 1000ms |
| 4 | Probe combo.js (InjectJS + Sleep) | ~1500ms |
| 4b | Poll combo completion | up to 3000ms |
| 5a | Close DevTools again | 500ms |
| 5b | Return tab search | N × 300ms |
| 6 | Force DevTools reset | 300ms |
| 6b | Probe macro-looping.js | 800ms |
| **Total** | | **~8-12s** |

**Optimizations**:

### 1a. Use embedded URL from title signal (skip GetCurrentUrl)
- Force buttons already set URL in title via `dispatchDelegateSignal()`.
- `HandleDelegate` already checks `embeddedUrl` parameter — ensure Force buttons always provide it.
- **Saves**: ~600ms (no Ctrl+L/Ctrl+C/Esc dance)

### 1b. Reduce Sleep values where safe
- Step 0: F12 close → reduce from 500ms to 300ms
- Step 3: Focus page sequence → reduce from 1000ms total to 500ms
- Step 4: Probe sleep → reduce from 500ms to 300ms
- Step 5a: F12 close → reduce from 500ms to 300ms
- Step 6b: Probe sleep → reduce from 800ms to 500ms
- **Saves**: ~1200ms

### 1c. Skip DevTools close in Step 0 if not open
- Check `devToolsOpened` flag before sending F12.
- **Saves**: 300ms when DevTools is already closed

### 1d. Early exit on combo probe success
- If combo.js is found and executed (Step 4 probe succeeds), immediately proceed to return — no need for full poll.
- Reduce poll timeout from 3s to 2s.

**Files to modify**:
- `Includes/MacroLoop.ahk` → `HandleDelegate()` function

**Status**: ⬜ Pending

---

## Phase 2: Smart Settings Tab Detection (skip re-injection)

**Problem**: When Force Up/Down switches to the settings tab, `HandleDelegate` always opens DevTools to probe/inject combo.js (~1.5-3s overhead). If `combo.js` is already injected on that tab, it should just trigger it via keyboard shortcut with ZERO DevTools overhead.

**Solution implemented (v7.1.2): Shortcut-first approach**

1. **Step 3 (new)**: Send `Ctrl+Alt+Up` or `Ctrl+Alt+Down` keystroke directly to the settings tab
   - combo.js already has a `keydown` listener for these shortcuts (line 1888-1944)
   - The listener calls `window.__comboSwitch(direction)` which sets `__COMBO_COMPLETE__` in title on finish
   - **Zero DevTools overhead** — no F12, no Ctrl+Shift+J, no paste, no execute
2. **Step 3b**: Poll title for `__COMBO_COMPLETE__` for up to 2s (8 × 250ms)
3. **Step 4 (fallback)**: If shortcut produced no completion signal:
   - Open DevTools, probe for `window.__comboSwitch`, execute if found
   - If probe also fails → full `RunComboSafe()` injection (40KB)

**Performance gain**: When combo.js is already loaded (common case after first delegation):
- Before: ~1.5-2s (DevTools open + probe inject + execute + close)
- After: ~0.25-0.5s (keystroke + first poll hit)
- **Saves**: ~1-1.5s per delegation cycle

**Files modified**:
- `Includes/MacroLoop.ahk` → `HandleDelegate()` Steps 3-4 rewritten

**Status**: ✅ Done

**Root cause**: `WorkspaceNavXPath=` was empty in `config.ini` (line 141). Without a valid XPath, `startWorkspaceObserver()` returned early and never installed the MutationObserver.

**Fix applied**:
1. `macro-looping.js` → `startWorkspaceObserver()`: Added auto-discovery fallback via CSS selectors when XPath is empty/broken
2. `macro-looping.js` → `fetchWorkspaceNameFromNav()`: Same auto-discovery fallback
3. `macro-looping.js` → `autoDiscoverWorkspaceNavElement()`: New function that scans nav area for workspace name candidates
4. Added DOM removal detection in observer — restarts if element is removed by SPA re-render
5. Added progressive retry with backoff (up to 10 retries, 3-15s intervals)
6. `config.ini` → Added comment explaining auto-discovery fallback

---

## Phase 3: Smart Project Tab Return (skip re-injection)

**Problem**: When returning to the project tab after combo, `HandleDelegate` Step 6 probes for `macro-looping.js`. If the probe fails (timeout/focus issues), it falls through to `EmbedMacroLoopScript()` which does a FULL re-injection (40KB + 1000ms sleep), **stopping the running loop** due to the teardown-and-replace pattern.

**User expectation**: If macro-looping.js is already on the project tab (which it should be — we just came from there), just call `__delegateComplete()` and leave everything as-is. Do NOT stop, re-inject, or restart.

**Solution implemented (v7.1.3): Conditional DevTools + loop state preservation**

1. **Step 5**: Only close DevTools (`F12`) if it was actually opened during Steps 3-4
   - If the shortcut-first path (Phase 2) succeeded, DevTools was never opened → skip F12 → **saves 300ms**
2. **Step 6**: Streamlined probe with state preservation:
   - Single probe attempt → if `__AHK_LOOP_PROBED__` → done, loop untouched ✓
   - If no result → one retry with full DevTools reset
   - If retry fails or `__AHK_LOOP_MISSING__` → full re-injection BUT:
     - **Saves `macroLoopRunning` and `macroLoopDirection` before re-injection**
     - After `EmbedMacroLoopScript()` + `__delegateComplete()`, **restores loop state** by calling `__loopStart(savedDirection)`
     - Loop is never permanently stopped by delegation

**Performance gain** (common case: macro-looping.js present):
- Before: probe + cleanup marker injection + potential re-injection = ~1.5-2.5s
- After: probe + cleanup = ~0.5s, no re-injection needed
- Step 5 F12 skip (when shortcut path used): saves additional 300ms

**Files modified**:
- `Includes/MacroLoop.ahk` → `HandleDelegate()` Steps 5-6 rewritten

**Status**: ✅ Done

---

## Phase 4: Always-Visible Workspace Name (MutationObserver fix)

**Problem**: The workspace name should ALWAYS be visible in the MacroLoop controller status bar, even when the loop is stopped. The MutationObserver (`startWorkspaceObserver`) is installed at init, but the user reports it's not working.

**Root cause candidates**:
1. The nav element (`WorkspaceNavXPath`) might not exist yet when `startWorkspaceObserver()` runs at init
2. The observer retry logic (`setTimeout(startWorkspaceObserver, 5000)`) might fail silently
3. `updateUI()` inside the observer callback might not update the status label when `state.running === false`

**Verification steps**:
- Check `updateStatus()` — does it show `state.workspaceName` when `state.running === false`? YES (line 1004-1054), it uses `wsFragment` in both running and stopped states.
- The observer IS installed (line 2174-2175), retries if nav not found.

**Likely fix**: The `CONFIG.WORKSPACE_NAV_XPATH` placeholder might not be replaced by AHK. Need to verify the placeholder replacement in `EmbedMacroLoopScript()`.

**Additional requirement**: On workspace change event:
1. ✅ Log to workspace history (already done, line 463-464)
2. ✅ Check free credit (already done, line 478 `triggerCreditCheckOnWorkspaceChange()`)
3. ✅ Show "WS Changed" indicator (already done, line 467-472)
4. ⬜ Ensure workspace name updates in status even when stopped

**Files to modify**:
- `macro-looping.js` → verify observer init and `updateStatus()`
- `Includes/MacroLoop.ahk` → verify `WORKSPACE_NAV_XPATH` placeholder replacement in `EmbedMacroLoopScript()`

**Status**: ⬜ Pending

---

## Phase 5: SendKey Audit (all keystrokes logged)

**Problem**: Some places in `.ahk` files might still use raw `Send()` instead of `SendKey()`.

**Audit result (v7.1.3)**: ✅ All `.ahk` files already use `SendKey()`. The only raw `Send()` is inside `SendKey()` itself (`Utils.ahk` line 295) — the intended wrapper. **No changes needed.**

**Files audited**:
- `Includes/MacroLoop.ahk` — ✅ all `SendKey()`
- `Includes/Combo.ahk` — ✅ all `SendKey()`
- `Includes/JsInject.ahk` — ✅ all `SendKey()`
- `Includes/Gmail.ahk` — ✅ no raw `Send()`
- `Automator.ahk` — ✅ no raw `Send()` (only comments referencing it)

**Rule**: Every keyboard shortcut MUST go through `SendKey(key, context)` which logs the keystroke with function name and line number via `LogKeyPress()`.

**Status**: ✅ Done (already clean)

---

## V7.1.4 Hotfix: Critical Bug Fixes

**Applied**: 2026-02-20  
**Issues fixed**: See `specs/spec-issues-v7.1.md` for full details.

| # | Bug | Severity | Fix |
|---|-----|----------|-----|
| 1 | HandleDelegate crash: missing `global macroLoopRunning, macroLoopDirection` | Critical | Added global declarations |
| 2 | Settings tab never reused (hasProjectId always false — UUIDs not in titles) | High | Relaxed tab matching: accept isSettings alone as fallback |
| 3 | `__delegateComplete not defined` warning in CallLoopFunction | Low | Added `window.` prefix to typeof checks |

---

## Implementation Order

1. **Phase 4** first (quick fix, high visibility) — workspace name always visible
2. **Phase 1** (biggest impact) — reduce Force Up/Down delay
3. **Phase 2** (medium impact) — smart settings tab detection
4. **Phase 3** (medium impact) — smart project tab return
5. **Phase 5** (low priority) — SendKey audit

---

## V7.2 Refactor: MacroLoop Modular Split

**Applied**: 2026-02-20

Split the monolithic `MacroLoop.ahk` (1032 lines) into 8 focused submodules under `Includes/MacroLoop/`:

| File | Responsibility | ~Lines |
|------|---------------|--------|
| `Globals.ahk` | State variables (`macroLoopRunning`, etc.) | 8 |
| `Helpers.ahk` | `ExtractProjectId`, `CallLoopFunction`, `OpenDevToolsIfNeeded` | 70 |
| `TabSearch.ahk` | `GetTabInfoFromTitle` | 35 |
| `Routing.ahk` | `HandleSmartShortcut`, `GetCurrentUrl` | 130 |
| `Embed.ahk` | `EmbedMacroLoopScript` (placeholder replacement + injection) | 100 |
| `SignalPoll.ahk` | `CheckClipboardForDelegate` (timer callback) | 90 |
| `Delegate.ahk` | `HandleDelegate` + extracted sub-functions | 320 |
| `Lifecycle.ahk` | `ToggleMacroLoop`, `StopMacroLoop`, `AdjustLoopInterval` | 150 |

`HandleDelegate` was further decomposed into: `FindSettingsTab`, `OpenNewSettingsTab`, `TriggerCombo`, `ReturnToProjectTab`, `SmartProjectReturn`, `ReInjectAndRestoreLoop`.

`MacroLoop.ahk` is now an orchestrator with `#Include` directives only.

---

## Notes

- All changes must preserve the F12→Ctrl+Shift+J injection cycle (see WARNING above)
- All changes must be tested with sequential injection (xpath-utils.js + combo.js/macro-looping.js)
- Force buttons trigger `forceSwitch()` in JS which sets `state.isDelegating` and calls `dispatchDelegateSignal()` — this writes to both document.title and clipboard
