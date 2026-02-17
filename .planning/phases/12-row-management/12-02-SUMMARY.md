---
phase: 12-row-management
plan: 02
subsystem: admin-creditor-table
tags: [row-delete, inline-confirm, hover-icon, frontend]
dependency_graph:
  requires: [12-row-management/12-01]
  provides: [delete-creditor-row-ui]
  affects: [src/admin/components/UserDetailView.tsx]
tech_stack:
  added: []
  patterns: [inline-confirm-state, group-hover-visibility, optimistic-removal]
key_files:
  created: []
  modified:
    - src/admin/components/UserDetailView.tsx
decisions:
  - "Trash icon hidden via opacity-0 / group-hover:opacity-100 — no JS state needed for visibility, pure CSS"
  - "deleteConfirmId replaces trash icon with Bestätigen/Abbrechen inline — no modal, no timeout"
  - "New rows get empty Aktion td to maintain column alignment (no creditorId available pre-POST)"
metrics:
  duration: 2m
  completed: 2026-02-17
  tasks_completed: 1
  files_modified: 1
---

# Phase 12 Plan 02: Inline Delete Creditor Row Summary

Inline delete UX for the Glaeubiger-Tabelle: trash icon appears on row hover, click enters inline confirmation state with red row highlight and Bestätigen/Abbrechen buttons, confirming sends DELETE request and removes the row from local state instantly.

## What Was Built

### Frontend Changes (UserDetailView.tsx)

1. **Import**: Added `TrashIcon` to the existing `@heroicons/react/24/outline` import list

2. **State**:
   - `deleteConfirmId: string | null` — tracks which creditor row is in confirm state
   - `deleteLoading: boolean` — disables buttons during DELETE API call

3. **handleDeleteCreditor**: Async function that calls `api.delete(/api/admin/clients/${userId}/creditors/${creditorId})`, filters the creditor from `user.final_creditor_list` on success, clears `deleteConfirmId`, and shows an alert on failure.

4. **"Aktion" column header**: Added as 14th `<th>` after Quell-Dokumente (`w-20` width)

5. **colSpan**: Updated from `13` to `14` in the "Keine Daten" fallback row

6. **`<tr>` class**: Added `group` class for Tailwind group-hover and conditional `bg-red-50` when `deleteConfirmId === c.id`:
   ```tsx
   className={`${deleteConfirmId === c.id ? 'bg-red-50' : 'hover:bg-gray-50'} group`}
   ```

7. **Delete cell `<td>`**: Added as last cell in each creditor row. Shows trash icon when not in confirm state (hidden via `opacity-0 group-hover:opacity-100`), shows Bestätigen + Abbrechen buttons when `deleteConfirmId === c.id`.

8. **New rows**: Added empty `<td>` in the new-row render (pre-POST rows have no creditorId so no delete button — they can be abandoned by not filling glaeubiger_name).

## Verification Results

1. `TrashIcon` — imported at line 21, used at line 1833
2. `Bestätigen` — in button at line 1817
3. `deleteConfirmId` — state at line 175, used in tr className at 1702, delete cell at 1810
4. `group-hover` — `group-hover:opacity-100` on trash icon button at line 1830
5. `Aktion` column header — at line 1694
6. `colSpan={14}` — at line 1988
7. TypeScript pre-existing config errors unchanged (unrelated to our changes)

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- FOUND: `src/admin/components/UserDetailView.tsx`
- FOUND commit: 3551003
- FOUND: `.planning/phases/12-row-management/12-02-SUMMARY.md`
