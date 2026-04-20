# v6.55 - Issue Analysis & Fix Spec (IMPLEMENTED)

## Status: Issue 2 ✅ DONE | Issue 3 ✅ DONE | Issue 1 ✅ DONE

### Current Broken Flow (what happens now)
1. User clicks **F-Up** or **F-Dn** in the MacroLoop controller
2. JS sets `state.isDelegating = true`, updates UI to show "SWITCHING..."
3. JS writes delegate signal to title + clipboard
4. AHK `CheckClipboardForDelegate()` detects signal
5. AHK `HandleDelegate()` runs: switches to settings tab, triggers combo
6. AHK returns to project tab
7. **Step 6b (Line 602-627 in MacroLoop.ahk)**: AHK probes for `window.__delegateComplete`
8. **BUT**: The probe uses `InjectJS()` which opens DevTools, pastes code, executes — this is correct
9. AHK reads the browser title to check for `__AHK_LOOP_PROBED__` or `__AHK_LOOP_MISSING__`
10. If probed → skips full injection, calls `__delegateComplete`
11. If missing → calls `EmbedMacroLoopScript()` (full ~50KB re-injection)

### Root Cause Analysis
The probe mechanism (Step 6b) in MacroLoop.ahk **already exists and is correct** (lines 598-627). The issue is:
- When the page hasn't changed (same tab, same project), `window.__delegateComplete` **should** exist
- If it doesn't exist, the page may have reloaded during tab switching, OR the probe itself failed
- **Actual root cause**: After `RunComboSafe(direction)` on the settings tab (Step 4, line 557), the code calls `Send("{F12}")` to close DevTools (line 567). Then it switches back to project tab. BUT `devToolsOpened` is reset to `false` at line 595. When `InjectJS(probeLoopJs)` is called at line 604, it will **reopen DevTools** on the project tab — this is a full keyboard automation sequence (Ctrl+Shift+J, paste, enter). If the timing is off or DevTools was already closed, the probe might fail to execute properly.
- **Secondary cause**: The `EmbedMacroLoopScript()` call at line 625 is the fallback — it's a ~50KB injection that takes 2-3 seconds. This is disruptive and often unnecessary.

### Expected Correct Flow (what should happen)
1. AHK returns to project tab
2. AHK resets `devToolsOpened := false` (forces fresh DevTools open on THIS tab)
3. AHK injects lightweight probe: `if(typeof window.__delegateComplete==='function'){document.title='__AHK_LOOP_PROBED__'...}`
4. AHK reads title:
   - **PROBED**: Skip injection, call `__delegateComplete` — **DONE** (~120 chars, <1s)
   - **MISSING**: Full `EmbedMacroLoopScript()` — only if genuinely needed
5. AHK calls `__delegateComplete` to resume the loop

### Implemented Fix (v6.55)
- **Increased probe sleep**: 500ms → 800ms for more reliable title signal detection
- **Added NO_RESULT detection**: When neither `__AHK_LOOP_PROBED__` nor `__AHK_LOOP_MISSING__` appears in the title, the probe injection itself failed (DevTools timing, focus issues)
- **Added retry-once logic**: On NO_RESULT, resets `devToolsOpened := false` and retries the probe once before falling back to full injection
- **Added diagnostic logging**: Logs raw probe title (first 120 chars) and explicit PROBED/MISSING/NO_RESULT flags for debugging
- **Safety fallback**: If retry also produces NO_RESULT, performs full `EmbedMacroLoopScript()` as a last resort

---

## Issue 2: Force Up/Down should show "FORCE UP" / "FORCE DOWN" in the UI status

### Current Behavior
- When user clicks F-Up/F-Dn, status shows just "SWITCHING..." (generic delegate status)
- No distinction between auto-delegation (from cycle) vs manual force

### Expected Behavior
1. User clicks **F-Up**: UI status shows `FORCE UP` (in a distinct color, e.g. orange)
2. User clicks **F-Dn**: UI status shows `FORCE DOWN`
3. The record indicator dot should also show `FORCE UP` or `FORCE DOWN` instead of just `SWITCHING`
4. When delegation completes, status returns to normal

### Root Cause
- `forceSwitch()` (line 1130) sets `state.isDelegating = true` but does NOT set any flag to indicate it was a FORCE action
- `updateStatus()` (line 850) and `updateRecordIndicator()` (line 914) both only check `state.isDelegating` — no force-specific state

### Proposed Fix (in macro-looping.js)
1. Add `state.forceDirection` field (null when not forcing, 'up'/'down' when forcing)
2. In `forceSwitch()`: set `state.forceDirection = direction`
3. In `delegateComplete()`: clear `state.forceDirection = null`
4. In `updateStatus()`: if `state.forceDirection`, show `FORCE UP` or `FORCE DOWN` instead of `SWITCHING...`
5. In `updateRecordIndicator()`: if `state.forceDirection`, show `FORCE UP`/`FORCE DOWN` with orange background

---

## Issue 3: Workspace name and credit status should be visible even when loop is stopped

### Current Behavior
- When loop is stopped, the status line shows: `[=] Stopped | Cycles: X | [Y/N] Credit`
- Workspace name IS shown in stopped state via `wsFragment` (line 854-857) — but only if `state.workspaceName` has been populated
- The `refreshStatus()` function (line 1164) runs on a timer and DOES update workspace name when loop is stopped
- **However**: `refreshStatus()` opens the project dialog every time to check — this is disruptive

### Root Cause
- Workspace name requires opening the project dialog because the XPath points to an element inside a Radix popover that only exists when the dialog is open
- **New requirement from user**: Workspace name should be updated WITHOUT clicking the project button

### Analysis: Can workspace name be fetched without opening the project dialog?
- The workspace name is typically displayed in the **navigation bar** or **sidebar** area as well
- On Lovable project pages, the workspace name appears in the top-left nav area
- **Alternative approach**: Look for workspace name in the page's persistent DOM (nav bar, breadcrumb, sidebar) instead of inside the project dialog popover
- This would eliminate the need to open/close the dialog just to read the workspace name

### Proposed Fix
1. **Keep existing dialog-based fetch as fallback** — works during active loop cycles
2. **Add a lightweight workspace name fetch** that reads from persistent DOM elements (nav, breadcrumb, sidebar) — use this for the auto-check timer when loop is stopped
3. **Ensure stopped state always shows**: workspace name + credit status (already partially working)
4. **New memory**: "Workspace name can be updated without clicking the project button by reading from persistent nav/sidebar elements"

### Steps to Implement
1. Identify the persistent DOM element that shows workspace name (outside the dialog)
2. Add a new function `fetchWorkspaceNameFromNav()` that reads from that element
3. In `refreshStatus()`, use `fetchWorkspaceNameFromNav()` instead of opening the dialog
4. Only open the dialog when credit status needs checking (less frequently)

---

## Implementation Order
1. **Issue 2** (UI feedback for Force) — smallest change, pure JS, no AHK changes
2. **Issue 3** (Workspace visible when stopped) — JS changes, may need new XPath config
3. **Issue 1** (Probe on return) — needs careful testing, AHK + JS coordination

## Version
These fixes will be released as **v6.55**.
