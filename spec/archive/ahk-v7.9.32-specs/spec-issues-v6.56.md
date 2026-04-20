# v6.56 - Force Up/Down Speed + Workspace Observer + SendKey Refactor

## Status: ✅ ALL DONE

---

## Issue 1: Force Up/Down is extremely slow (~42 seconds per delegation)

### Observed Timeline (from activity log 08:05:13 → 08:05:55)
| Step | Time | Duration | What happens |
|------|------|----------|-------------|
| 0 | 08:05:13 | 12s | `HandleDelegate` START → F12 close DevTools (500ms), then URL extraction FAILS (embeddedUrl empty), fallback GetCurrentUrl also fails → failure counter incremented |
| 1 | 08:05:25 | 4s | Second attempt: tab search with GetCurrentUrl on EACH tab (Ctrl+L, Ctrl+C, Escape per tab × 2 tabs) |
| 2 | 08:05:29 | 5s | Focus page, probe combo.js (NOT found → full RunComboSafe with F12+Ctrl+Shift+J cycle per injection) |
| 3 | 08:05:34 | 6s | Combo runs + hardcoded 3000ms wait |
| 4 | 08:05:40 | 1s | Return to project tab (1 tab switch + GetCurrentUrl) |
| 5 | 08:05:41 | 9s | Probe macro-looping.js (NOT found → full 84KB re-injection: xpath-utils.js 25KB + macro-looping.js 84KB) |
| 6 | 08:05:50 | 5s | CallLoopFunction(__delegateComplete) + signal cleanup (2 more InjectJS calls) |
| **TOTAL** | | **~42s** | |

### Root Causes
1. **Every InjectJS call takes ~1.3s minimum** (F12 close 300ms + Ctrl+Shift+J open 800ms + paste 200ms + enter 200ms = 1.5s). When DevTools is "already open", it does a close-reopen cycle every time.
2. **GetCurrentUrl takes ~600ms** (Ctrl+L 100ms + Ctrl+C 100ms + ClipWait + Escape 50ms + browser activate 150ms).
3. **Tab search** calls GetCurrentUrl for EACH tab = 600ms × N tabs.
4. **Probe failures cascade**: If the combo.js probe fails (MISSING), it triggers RunComboSafe which does ANOTHER full injection cycle. If macro-looping.js probe fails (MISSING), it triggers a 110KB full re-injection.
5. **Post-combo wait is a hardcoded 3000ms** regardless of whether combo finished.
6. **Signal cleanup** after delegate complete does 2 more InjectJS calls (2.6s overhead).

### Speed Optimization Plan

#### A. Eliminate unnecessary InjectJS calls in HandleDelegate
- **Signal cleanup at end**: Instead of 2 separate InjectJS calls (title cleanup + __delegateComplete), combine into ONE InjectJS call.
- **Probe cleanup**: The probe marker cleanup InjectJS is separate — combine with subsequent action.

#### B. Use title-based tab identification instead of GetCurrentUrl
- **Instead of Ctrl+L/Ctrl+C/Escape per tab**, read `WinGetTitle()` which is instant (no keyboard automation).
- Lovable tab titles contain the project name + path. Settings tabs have "Settings" in the title.
- **New function `GetTabIdentityFromTitle()`**: Reads WinGetTitle, checks for project ID and settings keywords.
- **Fallback**: Only use GetCurrentUrl if title-based detection fails.

#### C. Skip tab search when settings tab position is known
- After first successful delegation, cache the relative tab position (e.g., "settings is +1 tab from project").
- On subsequent delegations, try the cached position first, verify via title, fall back to search only if wrong.

#### D. Reduce InjectViaDevTools overhead for subsequent calls
- The close-reopen cycle (F12 + Ctrl+Shift+J = 1.1s) on every call when DevTools is "already open" is excessive.
- **Alternative**: Just use Ctrl+Shift+J directly (it auto-focuses the console input). Only F12+reopen if the previous inject failed.
- Add a `InjectJSFast()` variant that skips the close-reopen when we're confident DevTools console is still focused.

#### E. Reduce post-combo wait
- Instead of hardcoded 3000ms, poll for combo completion via title marker (check every 300ms, max 3s).

---

## Issue 2: On settings tab, check if combo.js is already injected → just delegate the shortcut

### Current Behavior
- HandleDelegate always uses InjectJS for the combo probe → slow
- If combo.js IS found, it calls `__comboSwitch(direction)` via the probe itself (good)
- If combo.js NOT found, it calls `RunComboSafe()` which does full injection

### Problem
- The probe itself takes ~2.5s (InjectJS + read title + cleanup InjectJS)
- Even when combo.js IS found, we still spend 2.5s on the probe overhead

### Fix Plan
1. **First**: Switch to settings tab
2. **Probe combo.js** via title marker (combine probe + execution in one InjectJS):
   ```
   if(typeof __comboSwitch==='function'){
     __comboSwitch('up');
     document.title='__AHK_COMBO_DONE__'+document.title;
   } else {
     document.title='__AHK_COMBO_MISSING__'+document.title;
   }
   ```
3. If DONE → skip RunComboSafe entirely, proceed to return
4. If MISSING → RunComboSafe (unavoidable full injection)
5. **Reduce post-combo wait**: Instead of 3000ms fixed, check title for `__AHK_COMBO_DONE__` marker

---

## Issue 3: On return to project tab, should NOT re-inject if macro-looping.js exists

### Current Behavior (from activity log)
- Probe at Step 6b returns `__AHK_LOOP_MISSING__` even though macro-looping.js WAS injected
- This triggers a full 110KB re-injection (xpath-utils 25KB + macro-looping 84KB)
- The re-injection tears down the existing instance (including loop state)

### Root Cause Analysis
- The probe checks `typeof window.__delegateComplete === 'function'`
- After RunComboSafe on the settings tab, DevTools context may have changed
- When AHK returns to project tab and injects the probe, the probe may execute in the wrong context (settings tab's DevTools still active?)
- **Key insight from logs**: The probe result shows `MISSING` — meaning `__delegateComplete` genuinely doesn't exist on the page. But the full re-injection at line 759 SUCCEEDS, meaning the project tab IS the right tab. This suggests the probe JS failed to execute or executed in wrong context.

### Fix Plan
1. **After returning to project tab**: Do NOT immediately probe. Instead:
   - Close DevTools completely (F12)
   - Wait 300ms
   - Open DevTools fresh on THIS tab (Ctrl+Shift+J)
   - Wait 800ms
   - THEN inject probe
2. **If probe still fails**: The v6.55 retry mechanism handles this
3. **If PROBED**: Just call `__delegateComplete` — no re-injection needed, no state disruption
4. **Critical**: When macro-looping.js is re-injected, it tears down the old instance (stops loop, removes UI, rebuilds). This is destructive. The goal is to AVOID this.

---

## Issue 4: Refactor AHK — Create `SendKey()` wrapper that logs every keystroke

### Current Pattern (repetitive)
```autohotkey
LogKeyPress("^l", "Focus address bar")
Send("^l")
```

### Proposed Pattern
```autohotkey
SendKey("^l", "Focus address bar")
; Internally calls LogKeyPress + Send in one function
```

### Implementation
```autohotkey
; In Utils.ahk
SendKey(key, context := "") {
    LogKeyPress(key, context)
    Send(key)
}
```

### Scope
- Add `SendKey()` to Utils.ahk
- Refactor ALL existing `LogKeyPress() + Send()` pairs in:
  - MacroLoop.ahk (HandleDelegate, GetCurrentUrl, ToggleMacroLoop)
  - JsInject.ahk (InjectViaDevTools)
  - Any other files with this pattern

---

## Issue 5: Workspace name MutationObserver — always visible, even when loop is stopped

### Current Behavior
- Workspace name only updates during active loop cycles (runCycle → fetchWorkspaceName)
- v6.55 added fetchWorkspaceNameFromNav() but it only runs in refreshStatus() which is DISABLED (v6.51)
- The auto-check timer was disabled because it opens the project dialog constantly

### User Requirement
- Workspace name MUST be visible in the controller AT ALL TIMES
- Even when loop is stopped
- Changes should be detected immediately via MutationObserver (not polling)

### Fix Plan (in macro-looping.js)

#### A. Add MutationObserver on WorkspaceNavXPath element
```javascript
function startWorkspaceObserver() {
  var navXpath = CONFIG.WORKSPACE_NAV_XPATH;
  if (!navXpath || navXpath.indexOf('__') === 0) return;
  
  var navEl = getByXPath(navXpath);
  if (!navEl) {
    log('Cannot start workspace observer: nav element not found', 'warn');
    // Retry after 5s (element may not be in DOM yet)
    setTimeout(startWorkspaceObserver, 5000);
    return;
  }
  
  // Initial read
  var name = (navEl.textContent || '').trim();
  if (name && name !== state.workspaceName) {
    var oldName = state.workspaceName;
    state.workspaceName = name;
    if (oldName && oldName !== name) {
      addWorkspaceChangeEntry(oldName, name);
    }
    updateUI();
  }
  
  // Watch for text changes
  var observer = new MutationObserver(function(mutations) {
    var newName = (navEl.textContent || '').trim();
    if (newName && newName !== state.workspaceName) {
      var oldName = state.workspaceName;
      state.workspaceName = newName;
      log('Workspace changed (observer): "' + oldName + '" → "' + newName + '"', 'success');
      
      // 1. Log to workspace history
      if (oldName) addWorkspaceChangeEntry(oldName, newName);
      
      // 2. Update UI label (shows "Workspace Changed" indicator)
      updateUI();
      
      // 3. Check free credit on workspace change
      triggerCreditCheckOnWorkspaceChange();
    }
  });
  
  observer.observe(navEl, { childList: true, characterData: true, subtree: true });
  log('Workspace MutationObserver installed on nav element', 'success');
}
```

#### B. On workspace change → check free credit
```javascript
function triggerCreditCheckOnWorkspaceChange() {
  log('Workspace changed — checking free credit...', 'check');
  // Open project dialog, check credit, close
  var opened = ensureProjectDialogOpen();
  if (!opened) return;
  pollForDialogReady(function() {
    state.hasFreeCredit = checkSystemBusy();
    state.isIdle = !state.hasFreeCredit;
    state.lastStatusCheck = Date.now();
    closeProjectDialog();
    updateUI();
  });
}
```

#### C. On workspace change → log "Workspace Changed" label
- Add a `state.workspaceJustChanged` flag
- In `updateStatus()`: show a temporary "⚡ WS Changed" indicator
- Clear after 10 seconds or next cycle

---

## Issue 6: Version bump to 6.56

- Update `config.ini` ScriptVersion from 6.54 to 6.56

---

## Phased Implementation Plan

---

### Phase 1: SendKey() Refactor (Issue 4) — Foundation
**Status**: ✅ DONE
**Files**: `Includes/Utils.ahk`, `Includes/JsInject.ahk`, `Includes/MacroLoop.ahk`

**Steps**:
1. Add `SendKey(key, context)` function to `Utils.ahk` (after `LogKeyPress`)
2. Refactor `JsInject.ahk` — replace all `LogKeyPress() + Send()` pairs with `SendKey()`
   - Line 54-55: `LogKeyPress("^+j"...) + Send("^+j")` → `SendKey("^+j", "Open DevTools Console (first time)")`
   - Line 64-65: `LogKeyPress("{F12}"...) + Send("{F12}")` → `SendKey("{F12}", "Close DevTools (to reset focus)")`
   - Line 68-69: `LogKeyPress("^+j"...) + Send("^+j")` → `SendKey("^+j", "Reopen DevTools Console")`
   - Line 77-78: `LogKeyPress("^v"...) + Send("^v")` → `SendKey("^v", "Paste JS code into console")`
   - Line 82-83: `LogKeyPress("{Enter}"...) + Send("{Enter}")` → `SendKey("{Enter}", "Execute pasted JS code")`
3. Refactor `MacroLoop.ahk` — replace all `LogKeyPress() + Send()` pairs with `SendKey()`
   - `GetCurrentUrl()`: lines 126-127, 129-130, 135-136
   - `HandleDelegate()`: lines 415-416, 457-458, 491-492, 498-499, 502-503, 519-520, 524-525, 567 (Send F12), 574-575
4. Verify: grep for remaining `LogKeyPress.*\n.*Send` patterns to ensure none missed

**Deliverable**: All keystroke sends go through `SendKey()` — single source of truth for logging.

---

### Phase 2: InjectJS Speed Optimization (Issue 1A+D) — Reduce per-injection overhead
**Status**: ✅ DONE
**Files**: `Includes/JsInject.ahk`

**Steps**:
1. Modify `InjectViaDevTools()` — when `devToolsOpened=true`, send ONLY `Ctrl+Shift+J` (no F12 close first). Ctrl+Shift+J already auto-focuses the console input even if DevTools is open.
   - Remove the F12 close (saves 300ms)
   - Remove the 300ms sleep after F12
   - Keep the 800ms sleep after Ctrl+Shift+J
   - **Net savings: ~600ms per subsequent injection call**
2. Add error recovery: if an injection fails (detected by title marker absence), set `devToolsOpened := false` so next call does the full F12+reopen sequence
3. Reduce `consoleOpenDelayMs` default from 800 to 500 for subsequent calls (first call keeps 800)

**Deliverable**: Each InjectJS call after the first drops from ~1.3s to ~0.7s. Over 8+ inject calls in HandleDelegate, saves ~5s total.

---

### Phase 3: Title-Based Tab Identification (Issue 1B) — Eliminate GetCurrentUrl in tab search
**Status**: ✅ DONE
**Files**: `Includes/MacroLoop.ahk`

**Steps**:
1. Add `GetTabInfoFromTitle()` function:
   ```autohotkey
   GetTabInfoFromTitle() {
       title := WinGetTitle("ahk_exe " browserExe)
       result := { isSettings: false, isProject: false, hasProjectId: false, title: title }
       result.isSettings := InStr(title, "Settings") || InStr(title, "settings")
       result.isProject := InStr(title, "Lovable") || InStr(title, "lovable")
       if (projectId != "")
           result.hasProjectId := InStr(title, SubStr(projectId, 1, 8))
       return result
   }
   ```
2. Refactor `HandleDelegate()` Step 2 (settings tab search):
   - Replace `GetCurrentUrl()` per tab with `GetTabInfoFromTitle()` (instant, no keyboard)
   - Only fall back to `GetCurrentUrl()` if title-based detection is inconclusive
3. Refactor `HandleDelegate()` Step 5b (return to project tab):
   - Same approach: use `WinGetTitle()` instead of `GetCurrentUrl()` for each tab

**Deliverable**: Tab search drops from ~600ms/tab to ~10ms/tab. For 2-tab search: 1.2s → 0.02s.

---

### Phase 4: Combo Probe + Execution Optimization (Issue 2 + Issue 1E)
**Status**: ✅ DONE
**Files**: `Includes/MacroLoop.ahk`

**What was done**:
1. Combined probe + execution + done signal into ONE InjectJS call (eliminated separate cleanup InjectJS, saves ~1.3s)
2. When combo.js already present: probe calls `__comboSwitch()` directly AND sets `__AHK_COMBO_DONE__` marker — no separate RunComboSafe or 3s wait
3. Replaced hardcoded 3000ms post-combo wait with polling loop (check title every 300ms for `__COMBO_COMPLETE__` or `__AHK_COMBO_FAILED__`, max 3s)
4. Deferred combo marker cleanup to the signal cleanup at end of HandleDelegate (combined with delegate signal cleanup)
5. Updated error-path signal cleanup to also clear combo markers

**Deliverable**: When combo.js exists: ~2.5s probe + 3s wait → ~1.5s total. When missing: saves ~2s on post-wait via polling.

---

### Phase 5: Fix Return Probe (Issue 3) — Prevent unnecessary full re-injection
**Status**: ✅ DONE
**Files**: `Includes/MacroLoop.ahk`

**What was done**:
1. Added explicit F12 close + 300ms wait before probing on return to project tab — ensures DevTools context is reset from settings tab
2. Combined probe + `__delegateComplete()` + signal cleanup into ONE InjectJS call — when script is found, all three happen in a single injection (~2.6s saved)
3. On retry failure, added F12 force-close before retry to guarantee fresh DevTools context
4. Fallback paths (re-injection) still call `__delegateComplete` + signal cleanup separately (unavoidable)
5. Removed the separate `CallLoopFunction("__delegateComplete")` and signal cleanup InjectJS calls from the happy path

**Deliverable**: Probe reliably detects existing script on project tab. Happy path saves ~4s (eliminated 3 separate InjectJS calls).

---

### Phase 6: Workspace MutationObserver (Issue 5) — Always-on workspace name
**Status**: ✅ DONE
**Files**: `macro-looping.js`

**Steps**:
1. Add `startWorkspaceObserver()` function that:
   - Finds the nav element via `CONFIG.WORKSPACE_NAV_XPATH`
   - Does initial read → sets `state.workspaceName`
   - Installs `MutationObserver` with `{ childList: true, characterData: true, subtree: true }`
   - On change: updates state, logs to workspace history, calls `triggerCreditCheckOnWorkspaceChange()`
   - Retries every 5s if element not found
2. Add `triggerCreditCheckOnWorkspaceChange()`:
   - Opens project dialog, checks credit bar, closes dialog, updates UI
3. Add `state.workspaceJustChanged` flag + temporary "⚡ WS Changed" indicator in `updateStatus()`
4. Call `startWorkspaceObserver()` at initialization (after `createUI()`)
5. Remove dependency on `refreshStatus()` for workspace name — observer handles it

**Deliverable**: Workspace name always visible. Changes detected instantly. Credit check auto-triggered on change.

---

### Phase 7: Version Bump + Final Cleanup (Issue 6)
**Status**: ✅ DONE
**Files**: `config.ini`, `spec-issues-v6.56.md`

**Steps**:
1. Update `config.ini` ScriptVersion from 6.54 to 6.56
2. Update spec status for all issues to ✅ DONE
3. Final review of all changes

**Deliverable**: v6.56 release-ready.

---

## Expected Speed Improvement
| Step | Before | After | Savings |
|------|--------|-------|---------|
| DevTools F12+reopen per inject | 1.3s | 0.7s (skip F12 close) | ~0.6s per call × ~8 calls = ~5s |
| Tab search (2 tabs) | 1.2s | 0.02s (title-based) | ~1.2s |
| Probe combo.js + execution | 2.5s + 3s wait | 1.5s (combined, poll) | ~4s |
| Return probe | 2.5s | 1.5s (clean DevTools reset) | ~1s |
| Signal cleanup | 2.6s | 0s (combined with delegateComplete) | ~2.6s |
| Full re-injection (when skipped) | 9s | 0s | ~9s |
| **TOTAL (happy path)** | **~42s** | **~6-10s** | **~32s** |

## Files Modified Per Phase
| Phase | Utils.ahk | JsInject.ahk | MacroLoop.ahk | macro-looping.js | config.ini |
|-------|-----------|-------------|---------------|-----------------|------------|
| 1 | ✅ | ✅ | ✅ | | |
| 2 | | ✅ | | | |
| 3 | | | ✅ | | |
| 4 | | | ✅ | | |
| 5 | | | ✅ | | |
| 6 | | | | ✅ | |
| 7 | | | | | ✅ |
