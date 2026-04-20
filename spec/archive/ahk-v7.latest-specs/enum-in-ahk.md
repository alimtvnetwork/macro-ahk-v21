# Enum Pattern in AHK v2

AHK v2 has no native `enum` keyword. We simulate enums using **static classes** — a class with only `static` properties acts as a read-only namespace of named constants.

## Why?

- **No magic strings** — typos become runtime errors instead of silent bugs
- **Autocomplete** — editors with AHK v2 support suggest `ProgressStatus.` members
- **Single source of truth** — change a value in one place, it updates everywhere
- **Self-documenting** — reading `ProgressStatus.DONE` is clearer than `"done"`

## Pattern

```ahk
; Define the "enum"
class ProgressStatus {
    static IDLE        := "idle"
    static IN_PROGRESS := "in_progress"
    static DONE        := "done"
    static ERROR       := "error"
    static TIMEOUT     := "timeout"
}

; Usage — compare against enum members, never raw strings
if (clipStatus = ProgressStatus.DONE) {
    ; handle done
}
if (clipStatus = ProgressStatus.ERROR) {
    ; handle error
}
```

## Existing Enum-Style Classes

| Class | File | Purpose |
|-------|------|---------|
| `ProgressStatus` | `Config/Constants/ProgressStatus.ahk` | Combo.js polling states |
| `ProgressStatus` | `Config/Constants/ProgressStatus.ahk` | Combo.js polling states (`IDLE`, `IN_PROGRESS`, `DONE`, `ERROR`, `TIMEOUT`) |
| `LogLevel` | `Config/Constants/LogLevel.ahk` | Log severity levels (`INFO`, `WARN`, `ERROR`, `DEBUG`) |
| `AuthMode` | `Config/Constants/AuthMode.ahk` | Authentication modes (`COOKIE_SESSION`, `TOKEN`) |
| `Sec` | `Config/Constants/Sections.ahk` | INI section names |
| `GeneralKey` / `GeneralDef` | `Config/Constants/General*.ahk` | General config keys & defaults |
| `HotkeyKey` / `HotkeyDef` | `Config/Constants/Hotkey*.ahk` | Hotkey config keys & defaults |
| `TimingKey` / `TimingDef` | `Config/Constants/Timing*.ahk` | Timing config keys & defaults |
| `ComboKey` / `ComboDef` | `Config/Constants/Combo*.ahk` | ComboSwitch config keys & defaults |
| `LoopKey` / `LoopDef` | `Config/Constants/Loop*.ahk` | MacroLoop config keys & defaults |
| `CreditKey` / `CreditDef` | `Config/Constants/Credit*.ahk` | Credit status keys & defaults |
| `GmailKey` / `GmailDef` | `Config/Constants/Gmail*.ahk` | Gmail config keys & defaults |
| `ElemKey` | `Config/Constants/ElementKeys.ahk` | DOM element key names |
| `CommonDef` | `Config/Constants/CommonDefaults.ahk` | Shared default values |

## Rules

1. **Always use the class reference** — never inline the string value
2. **Keep values lowercase** — AHK string comparison is case-insensitive by default, but consistency matters
3. **Add new members** to the class when new states are introduced
4. **Document the class** in this table when creating a new one
5. **Include the file** in `Config/Constants.ahk` orchestrator
