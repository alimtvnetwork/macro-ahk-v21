# Spec: Workspace State Clobber Bug — v7.9

## Issue ID
`WS-STATE-CLOBBER-v7.9`

## Date
2026-02-21

## Severity
**High** — Causes incorrect UI state and potentially wrong workspace targeting in automated loops.

---

## Symptom

After a successful combo switch or API move to a different workspace (e.g., P07), the header (🚀/📍), NOW status line, and workspace list CURRENT marker would revert to showing the **first workspace** (P01) within ~2 seconds.

## Root Cause

Both `combo.js` and `macro-looping.js` contain an `autoDetectCurrentWorkspace()` function that queries the project API (`GET /projects/{id}`) to determine which workspace the project currently belongs to. This function has **three fallback paths** that fire when:

1. The API returns no `workspace_id` field
2. The returned `workspace_id` doesn't match any entry in the cached `perWorkspace` array
3. The API call fails entirely (network error, 401, etc.)

In **all three cases**, the fallback was:
```javascript
// BUG: Blindly overwrites with first workspace
state.workspaceName = perWs[0].fullName || perWs[0].name;
```

This **unconditionally clobbered** the workspace name that had just been correctly set by the switch/move success handler moments earlier.

### Timeline of the Bug

1. User triggers combo switch → success handler correctly sets `__wsCurrentName = "P07 ..."`
2. UI updates immediately (NOW line, header, workspace list) — **correct**
3. 2 seconds later, `checkCreditsStatus('comboSwitch')` fires → calls `autoDetectCurrentWorkspace()`
4. Project API returns a `workspace_id` that may not yet be updated (eventual consistency) or fails
5. Fallback fires: `__wsCurrentName = perWs[0]` → **"P01 ..."** — **WRONG**
6. `updateCreditDisplay()` re-renders header/NOW section with P01 data

## Fix

Changed all three fallback paths in both controllers to **preserve the existing workspace name** if one is already set:

```javascript
// FIXED: Only default to first if no existing state
if (!state.workspaceName) {
  state.workspaceName = perWs[0].fullName || perWs[0].name;
} else {
  log('Keeping existing: ' + state.workspaceName);
}
```

### Principle: "Known-Good State Wins"

When a user action (switch, move) produces a **deterministic outcome** (we know exactly which workspace we moved to), that state is authoritative. A subsequent API poll that fails or returns stale data must **never override** a known-good state with a guess.

## Files Changed

| File | Locations Fixed |
|------|----------------|
| `combo.js` | `autoDetectCurrentWorkspace()` — 3 fallback paths |
| `macro-looping.js` | `autoDetectCurrentWorkspace()` — 3 fallback paths |

## Prevention Checklist

For any future code that sets `__wsCurrentName` or `state.workspaceName`:

- [ ] **Never unconditionally overwrite** with a default/fallback if the value is already populated by a recent user action
- [ ] **Log whether existing state was preserved** vs. defaulted, for debugging
- [ ] **Treat user-action-set state as higher priority** than API-polled state
- [ ] **After any switch/move success**, verify that ALL UI sections update (header, status, workspace list CURRENT marker) — not just one

## Related Patterns

This is an instance of the **"stale poll overwrites fresh action"** anti-pattern, common in systems that combine:
- Immediate optimistic UI updates (from user actions)
- Delayed background polling (API refresh)

The fix follows the **optimistic update with poll-guard** pattern: background polls may update state, but only if no higher-priority source has set it more recently.
