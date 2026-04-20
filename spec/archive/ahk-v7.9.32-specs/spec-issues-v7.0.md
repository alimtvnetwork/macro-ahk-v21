# V7.0 Issue Tracker

## Issue #1: ComboSwitch Completely Broken After v6.56 Fast-Path Optimization

**Status**: ✅ FIXED  
**Severity**: Critical — combo up/down completely non-functional  
**Discovered**: 2026-02-20  
**Fixed**: 2026-02-20  

### Symptoms
- Transfer button detection fails with all 5 methods (XPath, text scan, CSS, ARIA, proximity)
- combo.js never executes — no console output at all
- Only xpath-utils.js executes; combo.js paste goes nowhere

### Root Cause (TWO issues working together)

#### Root Cause #1: JsInject.ahk Fast-Path Lost Console Focus
In v6.56, the `else` branch of `InjectViaDevTools()` was "optimized" to skip the F12 close/reopen cycle:

```autohotkey
; v6.56 BROKEN fast path:
} else {
    SendKey("^+j", "Re-focus DevTools Console (fast path)")
    Sleep(500)
}
```

**Why this fails**: When DevTools is already open and the console has output from a previous injection (xpath-utils.js), sending `Ctrl+Shift+J` alone does NOT reliably focus the console input. The cursor may land on:
- The console output area (read-only)
- A different DevTools panel
- The autocomplete suggestion overlay

This means `Ctrl+V` pastes into **nowhere** — the combo.js code is silently lost.

**The working v6.55 approach** (now restored in v7.0):
```autohotkey
; v6.55 / v7.0 WORKING approach:
} else {
    SendKey("{F12}", "Close DevTools")
    Sleep(300)
    SendKey("^+j", "Reopen with Console focused")
    Sleep(consoleOpenDelayMs)
}
```

The F12→Ctrl+Shift+J cycle **guarantees** a fresh console with input focused because:
1. F12 fully closes DevTools (clean slate)
2. Ctrl+Shift+J opens a new Console panel with cursor in the input field

#### Root Cause #2: combo.js Config Placeholders Had No Fallbacks
The v7.0 `ELEMENTS` descriptors used config-driven placeholders exclusively:

```javascript
// v7.0 BROKEN — no fallbacks:
TRANSFER: {
    textMatch: splitPipe('__TRANSFER_TEXT_MATCH__'),  // returns null if unreplaced
    tag: cfgStr('__TRANSFER_TAG__'),                   // returns null if unreplaced
}
```

If AHK failed to replace these placeholders (or they were empty in config.ini), `splitPipe()` and `cfgStr()` returned `null`, disabling all non-XPath detection methods. In v6.55, these were hardcoded and always worked.

**Fix**: Added `||` fallback to v6.55 hardcoded values:
```javascript
// v7.0 FIXED — config with hardcoded fallbacks:
TRANSFER: {
    textMatch: splitPipe('__TRANSFER_TEXT_MATCH__') || ['Transfer', 'Transfer project'],
    tag: cfgStr('__TRANSFER_TAG__') || 'button',
}
```

### Why Both Causes Were Needed to Break It
- Root Cause #1 alone would break injection of ANY script (xpath-utils.js too)
- Root Cause #2 alone would only break detection if XPath also failed
- Together: combo.js was never injected (RC#1), AND if it had been, detection would fail without working XPaths (RC#2)

### Files Modified
| File | Change |
|------|--------|
| `Includes/JsInject.ahk` | Reverted to F12→Ctrl+Shift+J close/reopen cycle |
| `combo.js` | Added hardcoded fallback values to all ELEMENTS descriptors |

### Key Learnings

1. **NEVER optimize away the F12 close/reopen cycle in JsInject.ahk** — Ctrl+Shift+J alone is NOT reliable for refocusing an already-open console. The F12→Ctrl+Shift+J sequence is the ONLY guaranteed way to get a focused console input.

2. **Config-driven values MUST always have hardcoded fallbacks** — Any placeholder that might be empty or unreplaced must use `|| defaultValue` to fall back to known-working values from the previous stable version.

3. **Sequential injections (xpath-utils.js + combo.js) are the stress test** — The first injection works fine because DevTools opens fresh. The SECOND injection is where focus issues surface. Always test multi-script injection sequences.

4. **"Fast path" optimizations in keyboard automation are dangerous** — Saving 300ms by skipping F12 seems harmless but breaks the entire injection pipeline. Browser keyboard shortcuts have subtle focus behaviors that change depending on DevTools state, panel selection, and console output.

### Prevention Rules
- [ ] Any change to JsInject.ahk `else` branch MUST be tested with combo up/down (which injects 2 scripts sequentially)
- [ ] All ELEMENTS descriptor fields must have `|| hardcodedDefault` pattern
- [ ] Never assume Ctrl+Shift+J will focus console input when DevTools is already open
