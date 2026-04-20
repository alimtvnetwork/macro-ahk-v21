# Pending Issue: E2E Verification of React UI Unification

**Priority**: High  
**Spec**: `.lovable/memory/workflow/04-react-ui-unification-checklist.md` (Step 10)  
**Status**: Open  
**Created**: 2026-03-16

## Problem
React UI unification (Steps 1-9, 11-12) is code-complete but Step 10 (E2E verification) has never been run. Without manual verification in a real Chrome instance, regressions may exist.

## Verification Checklist
- [ ] Load extension in Chrome, verify popup opens and displays status
- [ ] Verify options page loads all tabs (projects, scripts, diagnostics, about)
- [ ] Verify project CRUD (create, edit, duplicate, delete, import/export)
- [ ] Verify script CRUD + toggle + injection
- [ ] Verify XPath recorder toggle
- [ ] Verify log export (JSON + ZIP)
- [ ] Verify SQLite bundle import/export
- [ ] Verify context menu actions
- [ ] Verify hot-reload poller still detects new builds
- [ ] Verify preview environment renders same UI with mock data
