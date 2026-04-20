# V7.4 Issue Tracker

## Overview
v7.4 introduced Bearer Token UI, Enhanced Fetch Logging, Clear All Data, and Enum-Style Static Classes. This file tracks known issues, edge cases, and follow-ups discovered after release.

---

## Issue #1: ValidateEnums() does not halt on failure

**Status**: ✅ FIXED (v7.4)  
**Severity**: Low — validation logged the error but automation continued  
**Discovered**: 2026-02-21  

### Description
`ValidateEnums()` catches broken enum includes and logs to `error.txt`, but did not stop the script. If an enum class failed to load, subsequent code referencing it (e.g., `ProgressStatus.DONE` in Delegate.ahk) would crash with an unhelpful "class not found" error instead of the clear startup diagnostic.

### Fix
After logging all failures, `ValidateEnums()` now shows a `MsgBox` ("OC Icon!" style — OK/Cancel with warning icon, matching the version mismatch dialog pattern). OK exits via `ExitApp`; Cancel allows continuing anyway for debugging.

---

## Issue #2: Bearer token input has no validation

**Status**: ✅ FIXED (v7.4)  
**Severity**: Low — user could save empty or malformed tokens  
**Discovered**: 2026-02-21  

### Description
The Save button in the controller UI stored whatever was in the password input to `localStorage`, including empty strings or whitespace-only values. An empty saved token overrides the cookie-session fallback, causing silent auth failures.

### Fix
Token save now validates: rejects empty/whitespace-only values and tokens shorter than 10 characters. Both cases show a red warning in the title label (⚠ empty! / ⚠ too short!) that auto-clears after 2.5s, and log a warning.

---

## Issue #3: Clear All Data does not reset bearer token input field

**Status**: ✅ FIXED (v7.4 — already present in code)  
**Severity**: Low — UI showed stale token after clearing  
**Discovered**: 2026-02-21  

### Description
"Clear All Data" removes `ahk_bearer_{projectId}` from `localStorage` but did not clear the password input element.

### Fix
Already implemented: the Clear All handler includes `document.getElementById('ahk-bearer-token-input').value = '';` (combo.js line 1966). No additional changes needed.

---

## Issue #4: Confirm button text scan matches "Save Token" instead of "Confirm transfer"

**Status**: ✅ FIXED (v7.4)  
**Severity**: Medium — combo switch silently fails to confirm the transfer  
**Discovered**: 2026-02-21  

### Description
When the Confirm button XPath fails (common after DOM changes), `findElement` falls back to Method 2 (text scan) using `indexOf` substring matching against `['Confirm', 'Confirm transfer', 'Save']`. The broad `"Save"` entry matched the "Save Token" button in the bearer token UI, causing the flow to click the wrong button. This triggered the token validation rejection (`WARN: Rejected empty/whitespace-only token`) and never actually confirmed the transfer.

### Fix
1. Removed `"Save"` from the Confirm descriptor's `textMatch` list (too broad).
2. Reordered to `['Confirm transfer', 'Confirm']` (most specific first).
3. Added `textMatchExact: true` to the Confirm descriptor, forcing strict equality (`===`) instead of `indexOf` substring matching.
4. Added the `textMatchExact` flag to `findElement`'s Method 2 — any descriptor can now opt into exact-match mode to prevent false positives.

---

## Follow-ups

| # | Description | Priority |
|---|-------------|----------|
| F1 | ~~ExitApp on enum validation failure (Issue #1)~~ | ✅ Done |
| F2 | ~~Token format validation (min length, reject empty)~~ | ✅ Done |
| F3 | ~~Sync Clear All button with bearer token input state~~ | ✅ Done (already implemented) |
| F4 | Add unit-style test for `ValidateEnums()` — verify each class member resolves | Nice-to-have |
| F5 | ~~Add `textMatchExact` flag to findElement + apply to Confirm descriptor~~ | ✅ Done |
