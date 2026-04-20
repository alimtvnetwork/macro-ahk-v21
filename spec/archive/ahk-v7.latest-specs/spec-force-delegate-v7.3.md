# Force Up / Force Down — Delegation Spec v7.3

## Overview

When the user presses **Force Up** or **Force Down** (from the MacroLoop controller on a project tab), AHK must:
1. Find or create the Settings tab for that project
2. Ensure the combo controller (combo.js) is running there
3. Trigger the combo action (up or down)
4. Wait for the controller to signal completion
5. Return to the original project tab

## Dedicated Log File

All Force Up/Down actions write to **`force_delegate.log`** (in the script directory).
Every entry includes:
- Timestamp
- Step number and name
- What action is being taken (key press, tab switch, JS injection, etc.)
- **Why** the action is being taken
- Result of the action

Format:
```
[2025-02-21 14:32:01] STEP 1/7: CLOSE DEVTOOLS
  ACTION: Send F12
  WHY: DevTools may be open from previous operation — need clean slate for keyboard input
  RESULT: DevTools closed, waited 300ms
```

---

## Flow Diagram

```
┌─────────────────────────────────────┐
│  Signal received: DELEGATE_DOWN     │
│  (from clipboard or title signal)   │
└──────────────┬──────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  STEP 1: CLOSE DEVTOOLS             │
│  Send F12 if devToolsOpened=true     │
│  WHY: Clean slate for tab switching  │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  STEP 2: REMEMBER STARTING TAB      │
│  Store WinGetTitle() as startTitle   │
│  WHY: Need to return here after done │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  STEP 3: EXTRACT PROJECT ID         │
│  From: embeddedUrl → title → URL bar │
│  WHY: Need project ID to build the  │
│       settings URL if tab is missing │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  STEP 4: FIND SETTINGS TAB          │
│  Ctrl+Tab loop (max N tabs)         │
│  Check each tab title for "Settings"│
│  or "settings" or "/settings"       │
│  WHY: Settings tab has the combo    │
│       controller for this project   │
└──────┬──────────────┬────────────────┘
       │              │
  Tab FOUND      Tab NOT FOUND
       │              │
       ▼              ▼
┌──────────┐   ┌──────────────────────┐
│ Stay on  │   │ STEP 4b: OPEN NEW   │
│ this tab │   │  Ctrl+T → paste URL  │
│          │   │  → Enter → wait load │
│          │   │  WHY: No settings tab│
│          │   │  exists, must create │
│          │   │  one for this project│
│          │   │  SKIP TO STEP 5b     │
│          │   │  (inject, no check)  │
└──────┬───┘   └──────────┬───────────┘
       │                  │
       ▼                  │
┌──────────────────────┐  │
│ STEP 5a: CHECK IF    │  │
│ CONTROLLER EXISTS    │  │
│ getElementById(      │  │
│   scriptMarkerId)    │  │
│ WHY: If combo.js is  │  │
│ already running, we  │  │
│ just send the key —  │  │
│ no need to re-inject │  │
└──┬───────────┬───────┘  │
   │           │          │
 EXISTS    NOT EXISTS     │
   │           │          │
   ▼           ▼          │
┌────────┐ ┌──────────────┤
│STEP 5a1│ │STEP 5b:      │
│ SEND   │ │INJECT combo  │
│ KEY    │ │.js (full     │◄────┘
│Ctrl+Alt│ │injection)    │
│+Up/Down│ │WHY: No       │
│WHY: The│ │controller    │
│combo   │ │exists yet,   │
│ctrl is │ │need to load  │
│already │ │it first, then│
│running │ │it auto-runs  │
│just    │ │the direction │
│trigger │ │              │
└──┬─────┘ └──────┬───────┘
   │              │
   ▼              ▼
┌──────────────────────────────────────┐
│  STEP 6: WAIT FOR COMPLETION        │
│  Poll for progress element ID:      │
│    "__combo_progress_status__"       │
│  Read data-status via clipboard     │
│  (navigator.clipboard.writeText)    │
│  Poll every 500ms, max 30 attempts  │
│  (+ 400ms per inject = ~27s max)    │
│  WHY: The combo action takes time   │
│  (clicking transfer, selecting,     │
│  confirming). Must wait for it to   │
│  finish before switching tabs.      │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  STEP 7: RETURN TO PROJECT TAB      │
│  Ctrl+Shift+Tab loop (max N tabs)   │
│  Check title: isProject && !isSettings│
│  WHY: Go back to where we started   │
│       so the MacroLoop can continue │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  STEP 8: CLEANUP & DONE             │
│  Clear clipboard, reset flags       │
│  Log: "Delegate complete"           │
└──────────────────────────────────────┘
```

---

## Detailed Step Breakdown

### STEP 1: Close DevTools (if open)
- **Action:** `SendKey("{F12}")` + `Sleep(300)`
- **Why:** DevTools steals keyboard focus. If it's open, Ctrl+Tab won't switch tabs — it'll switch DevTools panels instead.
- **Skip if:** `devToolsOpened = false`
- **Log:** `STEP 1: Closing DevTools (was open=true) → F12 sent, 300ms wait`

### STEP 2: Remember Starting Tab
- **Action:** `startTitle := WinGetTitle("ahk_exe " browserExe)`
- **Why:** After the combo completes on the Settings tab, we need to return to this exact tab. The title is our identifier.
- **Log:** `STEP 2: Stored start title: "My Project - Lovable" (first 80 chars)`

### STEP 3: Extract Project ID
- **Action:** Try extracting UUID from `embeddedUrl`, then `startTitle`, then address bar (`GetCurrentUrl()`)
- **Why:** If we need to open a new Settings tab, we must construct the URL: `https://lovable.dev/projects/{id}/settings?tab=...`
- **Fail condition:** If no project ID found → increment failure counter, abort, log error.
- **Log:** `STEP 3: Project ID extracted from title: "abc12345-..."`

### STEP 4: Find Settings Tab
- **Action:** `Ctrl+Tab` in a loop (max `delegateMaxTabSearch` tabs). For each tab, call `GetTabInfoFromTitle(projectId)` and check `tabInfo.isSettings`.
- **Why:** The combo controller lives on the Settings page. We need to find it.
- **Loop-back detection:** If we see `startTitle` again, we've cycled through all tabs.
- **Log per tab:** `STEP 4: Tab 3 title="Settings - Lovable" → isSettings=YES → FOUND`

### STEP 4b: Open New Settings Tab (only if STEP 4 fails)
- **Action:** `Ctrl+T` → paste settings URL → `Enter` → `Sleep(2500)` for page load
- **Why:** No existing Settings tab found. Must open one.
- **Important:** Since we just opened a fresh page, there is **no controller** — skip STEP 5a and go directly to STEP 5b (inject).
- **Log:** `STEP 4b: No Settings tab found → opening new: https://lovable.dev/projects/abc.../settings?tab=general`

### STEP 5a: Check if Controller Exists (only if STEP 4 found existing tab)
- **Action:** `InjectJS("document.getElementById('scriptMarkerId') ? ...")`
  - Signal result via temporary title marker: `__AHK_CTRL_FOUND__` or `__AHK_CTRL_MISSING__`
  - Read `WinGetTitle()` after 400ms
  - Clean marker immediately after reading
- **Why:** If the Settings tab already has combo.js running, we just send the keyboard shortcut. No need to re-inject 40KB of JS.
- **Log:** `STEP 5a: getElementById('combo-ctrl') → FOUND`

### STEP 5a1: Send Shortcut Key (controller exists)
- **Action:** `SendKey("^!{Up}")` or `SendKey("^!{Down}")`
- **Why:** The combo controller is listening for `Ctrl+Alt+Up/Down`. Sending this triggers the combo action.
- **Log:** `STEP 5a1: Controller exists → sending Ctrl+Alt+Down`

### STEP 5b: Full Injection (controller missing OR new tab)
- **Action:** Call `RunCombo(direction)` which reads `combo.js`, replaces placeholders, and injects via DevTools.
- **Why:** No controller exists on this page. We must inject the full combo.js script. The script auto-runs the direction on load.
- **Log:** `STEP 5b: Controller NOT found → full combo.js injection (42KB), direction=down`

### STEP 6: Wait for Completion ✅ (Phase 2 — implemented, updated to clipboard)
- **Action:** Poll a DOM element with ID `__combo_progress_status__` every 500ms (max 30 attempts ≈ 27 seconds with 400ms inject overhead per poll).
  - Inject JS that reads `data-status` attribute and writes it to the **clipboard** via `navigator.clipboard.writeText()`
  - AHK reads `A_Clipboard` after 400ms
  - Break on `done` or `error`
- **Why:** The combo action is async (clicks buttons, waits for dialogs, confirms). We must wait for it to finish before switching back — otherwise we'd leave mid-action.
- **Channel:** Uses **clipboard** (not title) to avoid visible title flickering.
- **Timeout:** After 30 attempts (~27s), log warning and proceed anyway.
- **Cleanup:** After polling completes, reset status element to `idle` and clear clipboard.
- **Log:** `STEP 6: Poll 3/30 → status="in_progress"` ... `STEP 6: Poll 7/30 → status="done" → Completed!`

### STEP 7: Return to Project Tab
- **Action:** `Ctrl+Shift+Tab` loop (previous tab). Check `GetTabInfoFromTitle()` for `isProject && !isSettings`.
- **Why:** Return to where we started so the MacroLoop can continue its cycle.
- **Log:** `STEP 7: Tab 2 → isProject=YES, isSettings=NO → FOUND original tab`

### STEP 8: Cleanup
- **Action:** Clear clipboard, reset `isHandlingDelegate`, reset `consecutiveDelegateFailures`.
- **Log:** `STEP 8: Delegate complete. Clipboard cleared. Direction=down.`

---

## Changes Required in combo.js

The combo controller must add a **progress status element** to the DOM:

```html
<span id="__combo_progress_status__" style="display:none">idle</span>
```

States:
- `idle` — no action running
- `in_progress` — combo action is executing (clicking transfer, selecting, confirming)
- `done` — combo action completed successfully
- `error` — combo action failed

The combo.js `__comboSwitch(direction)` function must:
1. Set status to `in_progress` at the start
2. Set status to `done` on success
3. Set status to `error` on failure

---

## Changes Required in AHK (Delegate.ahk)

1. **Add dedicated logging** — `ForceDelegateLog(step, action, why, result)` writes to `force_delegate.log`
2. **Add STEP 6** (wait for completion) — currently missing entirely
3. **Add STEP 4b → STEP 5b shortcut** — if we opened a new tab, skip controller check
4. **Remove** title marker cleanup complexity — use a single, clean pattern

---

## Implementation Phases

### Phase 1: Dedicated Logging ✅
- Created `ForceDelegateLog()` function in `Includes/MacroLoop/ForceDelegateLog.ahk`
- Added log calls to every step in `HandleDelegate()`
- File: `force_delegate.log` in script directory

### Phase 2: Progress Status Element in combo.js ✅
- Added `__combo_progress_status__` hidden `<div>` in `placeMarker()` with `data-status="idle"`
- Added `setProgressStatus(status)` helper — sets `data-status` and `textContent`
- `runComboSwitch()` → sets `in_progress` at start
- `waitForConfirmButton()` → sets `done` on successful confirm click
- `handleStepFailure()` → sets `error` when all retries exhausted
- AHK Step 6 polls via **clipboard** (`navigator.clipboard.writeText`): 30 polls × (400ms inject + 500ms wait) ≈ 27s max
- Resets status to `idle` and clears clipboard after polling completes

### Phase 3: Rewrite HandleDelegate with STEP 6 ✅
- Implemented the 8-step flow exactly as specified
- Added STEP 4b → 5b shortcut (new tab = always inject)
- Added STEP 6 polling for completion status
- Used dedicated logging throughout

### Phase 4: Test & Verify
- Test with existing Settings tab + controller → should reuse (STEP 5a1)
- Test with existing Settings tab + no controller → should inject (STEP 5b)
- Test with no Settings tab → should create + inject (STEP 4b + 5b)
- Test return to project tab (STEP 7)
- Review `force_delegate.log` for clarity
