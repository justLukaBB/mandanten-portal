---
phase: 12-row-management
plan: 01
subsystem: admin-creditor-table
tags: [row-add, inline-edit, german-fields, frontend, backend]
dependency_graph:
  requires: [11-inline-cell-editing/11-01]
  provides: [add-creditor-row-ui, german-field-post-support]
  affects: [src/admin/components/UserDetailView.tsx, server/controllers/adminClientCreditorController.js]
tech_stack:
  added: []
  patterns: [unsaved-row-state, ref-for-async-state-read, optimistic-ui-transition]
key_files:
  created: []
  modified:
    - src/admin/components/UserDetailView.tsx
    - server/controllers/adminClientCreditorController.js
decisions:
  - "Use React.useRef to read newRows state in async handleNewRowSave (avoids stale closure over state)"
  - "POST fires only when glaeubiger_name is non-empty on blur — all other fields optional"
  - "New rows use plain <input> elements (not EditableCell) since no creditorId available pre-POST"
  - "After green flash (1000ms), row removed from newRows and creditor appears in regular table via final_creditor_list"
metrics:
  duration: 5m
  completed: 2026-02-17
  tasks_completed: 1
  files_modified: 2
---

# Phase 12 Plan 01: Add Creditor Row (Hinzufuegen Button) Summary

Inline add-row UX for the Glaeubiger-Tabelle: red Hinzufuegen button appends new empty rows with plain inputs, POSTs to add-creditor on blur when glaeubiger_name is filled, then transitions to a normal EditableCell row after a green flash.

## What Was Built

### Backend Changes (adminClientCreditorController.js)

Extended the `addCreditor` method to accept German field names alongside English ones:

- Added destructuring of 8 German field names from `req.body`: `glaeubiger_name`, `glaeubiger_adresse`, `glaeubigervertreter_name`, `glaeubigervertreter_adresse`, `forderungbetrag`, `email_glaeubiger`, `email_glaeubiger_vertreter`, `dokumenttyp`
- Changed validation: `if (!sender_name && !glaeubiger_name)` — accepts either
- `resolvedName = sender_name || glaeubiger_name` used as the canonical name
- German fields added to `newCreditor` using undefined-guard spread pattern (matching `updateCreditor`)
- `id` already returned in response — no change needed

### Frontend Changes (UserDetailView.tsx)

1. **Imports**: Added `PlusIcon` to heroicons import; changed `{ API_BASE_URL }` to `api, { API_BASE_URL }` (default + named import)

2. **NewCreditorRow interface**: Defined before component with `tempId`, `fields`, `saving`, `saved`, `savedId?`, `error?`

3. **State**: `newRows: NewCreditorRow[]` state + `newRowsRef` to read state in async handlers

4. **handleNewRowFieldChange**: Updates `fields` object in the matching row

5. **handleNewRowSave**: Reads current row from ref (avoids stale closure), checks guards (no glaeubiger_name, already saving/saved), POSTs to `/api/admin/clients/${userId}/add-creditor`, appends creditor to `user.final_creditor_list` on success, removes from `newRows` after 1000ms green flash

6. **Hinzufuegen button**: Added between AI Re-Dedup and Export buttons — red-800 bg with PlusIcon

7. **New row rendering**: Renders after existing creditor rows — 11 `<input>` fields + 1 `<select>` for needs_manual_review, blue tint when pending, green tint when saved, red tint on error; 2 read-only cells show 0/N/A

8. **"Keine Daten" fallback**: Updated to only show when both `final_creditor_list` is empty AND `newRows` is empty

## Verification Results

1. Backend `addCreditor` accepts `glaeubiger_name` as alternative — confirmed via grep (11 occurrences)
2. `Hinzufügen` button renders in table header at line 1635-1636
3. New rows render with blue tint and input fields — implemented in `newRows.map()`
4. POST fires only when `glaeubiger_name` is non-empty on blur — guard in `handleNewRowSave`
5. After POST, row transitions to normal row — via `setUser` append + `setTimeout` removal
6. Multiple new rows can be added simultaneously — each has unique `tempId`
7. No new TypeScript/ESLint errors introduced (pre-existing curly rule violations unchanged)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added curly braces to inline `if` guards in handleNewRowSave**
- **Found during:** Task 1 verification
- **Issue:** ESLint `curly` rule enforced project-wide; three single-line guards caused new build failures
- **Fix:** Changed `if (!x) return;` to `if (!x) { return; }` in `handleNewRowSave`
- **Files modified:** `src/admin/components/UserDetailView.tsx`
- **Commit:** 93126b6

**2. [Rule 1 - Design] Used React.useRef instead of direct state read in async handler**
- **Found during:** Task 1 implementation
- **Issue:** `handleNewRowSave` is async — reading `newRows` state directly would capture stale closure
- **Fix:** Added `newRowsRef` (kept in sync via `useEffect`) so async handler always reads current row values
- **Files modified:** `src/admin/components/UserDetailView.tsx`

## Self-Check: PASSED

- FOUND: `src/admin/components/UserDetailView.tsx`
- FOUND: `server/controllers/adminClientCreditorController.js`
- FOUND: `.planning/phases/12-row-management/12-01-SUMMARY.md`
- FOUND commit: 93126b6
