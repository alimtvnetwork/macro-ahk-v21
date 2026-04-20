# V7.1 Issue Tracker

## Issue #1: HandleDelegate crashes — "local variable has not been assigned a value"

**Status**: ✅ FIXED (v7.1.4)  
**Severity**: Critical — crashes HandleDelegate, stops all delegation  
**Discovered**: 2026-02-20  

### Root Cause
`HandleDelegate()` uses `macroLoopRunning` and `macroLoopDirection` but these were **not declared `global`** → AHK v2 treats them as uninitialized locals → crash.

### Fix
Added `global macroLoopRunning, macroLoopDirection` to HandleDelegate.

---

## Issue #2: Force Down always opens new settings tab (never reuses existing)

**Status**: ✅ FIXED (v7.1.4)  
**Severity**: High — creates duplicate tabs on every delegation  
**Discovered**: 2026-02-20  

### Root Cause
`GetTabInfoFromTitle()` checks `hasProjectId` by looking for the UUID in the title. But Lovable titles show the project **NAME**, not UUID. So the exact match always failed.

### Fix
Relaxed matching: accept any `isSettings` tab as a valid match.

---

## Issue #3: `__delegateComplete not defined` console warning

**Status**: ✅ FIXED (v7.1.4 → replaced in v7.2)  
**Severity**: Low  

### Root Cause
`CallLoopFunction()` used `typeof` checks with bare variable names instead of `window.` prefix.

### Fix (v7.2)
**Removed entirely.** `CallLoopFunction()` now just calls `window.funcName()` directly — no `typeof`, no `console.warn`. If the function doesn't exist, it throws and gets caught by the caller.

---

## Issue #4: HandleDelegate over-engineered — v7.2 simplification

**Status**: ✅ FIXED (v7.2)  
**Severity**: High — code complexity causing bugs and confusion  
**Discovered**: 2026-02-20  

### Problem
The HandleDelegate flow had accumulated excessive complexity:
- **SmartProjectReturn**: Probed for `macro-looping.js` on return, re-injected if missing, retried with F12 reset
- **typeof probing**: Multiple `typeof window.__comboSwitch === 'function'` checks via title markers
- **Title marker circus**: `__AHK_COMBO_DONE__`, `__AHK_COMBO_MISSING__`, `__AHK_LOOP_PROBED__`, `__AHK_LOOP_MISSING__` — all cleaned up with regex
- **Shortcut-first + DevTools fallback**: Two-tier combo trigger with 2s polling loops

### Fix (v7.2 rewrite)
Replaced with a clean 7-step process:

1. **Close DevTools** if open (clean slate)
2. **Remember current tab** title for return
3. **Extract project ID** from embedded URL, title, or address bar
4. **Search existing tabs** for Settings (Ctrl+Tab loop, check title for "Settings")
5. **Check controller by `getElementById`** — if found, send shortcut; if not, inject combo.js
6. **Return to project tab** (Ctrl+Shift+Tab loop, find "project but not settings")
7. **Done** — clear clipboard, reset flags

### What was removed
- `SmartProjectReturn()` — deleted entirely
- `ReInjectAndRestoreLoop()` — deleted entirely
- `FindSettingsTab()` — inlined into HandleDelegate (simpler)
- `OpenNewSettingsTab()` — inlined into HandleDelegate
- `TriggerCombo()` — replaced with getElementById check + shortcut
- `ReturnToProjectTab()` — inlined into HandleDelegate
- All `__AHK_COMBO_DONE/MISSING__` title markers
- All `__AHK_LOOP_PROBED/MISSING__` title markers
- `typeof window.__comboSwitch` probing
- `typeof window.__delegateComplete` probing

### Result
Delegate.ahk went from **460 lines / 7 sub-functions** to **~190 lines / 0 sub-functions**. The flow is now linear and readable.
