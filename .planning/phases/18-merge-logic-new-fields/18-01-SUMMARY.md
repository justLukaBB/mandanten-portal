---
phase: 18-merge-logic-new-fields
plan: "01"
subsystem: creditor-deduplication
tags: [merge-logic, deduplication, fastapi-fields, postfach, aktenzeichen]
dependency_graph:
  requires: [17-01]
  provides: [merge-logic-for-new-fields]
  affects: [mergeCreditorLists, deduplicateCreditors, deduplicateCreditorsStrict, deduplicateCreditorsFromDocuments]
tech_stack:
  added: []
  patterns: [longest-wins, OR-logic, creditor-merge]
key_files:
  created: []
  modified:
    - server/utils/creditorDeduplication.js
decisions:
  - "aktenzeichen_glaeubigervertreter uses longest-wins (not latest-wins) — preserves the most complete reference string"
  - "Postfach flags use OR-logic matching existing needs_manual_review pattern — any true in group keeps true"
  - "Both deduplicateCreditors and deduplicateCreditorsStrict received identical merge blocks — consistent behavior across both dedup paths"
metrics:
  duration: "~2m"
  completed: "2026-02-18"
  tasks_completed: 2
  files_modified: 1
---

# Phase 18 Plan 01: Merge Logic for New FastAPI Fields Summary

Merge logic added to creditor deduplication for 3 new FastAPI fields: aktenzeichen_glaeubigervertreter (longest-wins), glaeubiger_adresse_ist_postfach and glaeubiger_vertreter_adresse_ist_postfach (OR-logic).

## What Was Built

Added merge rules to `server/utils/creditorDeduplication.js` so that when two creditors are merged during deduplication, the 3 new FastAPI fields added in Phase 17 are preserved using the correct semantics:

- **aktenzeichen_glaeubigervertreter** — longest non-empty string wins (MERGE-01). If both creditors have this field, the longer value is kept. This ensures the most complete court/case reference is preserved.
- **glaeubiger_adresse_ist_postfach** — OR-logic. If any creditor in the group has `true`, the merged result has `true` (MERGE-02).
- **glaeubiger_vertreter_adresse_ist_postfach** — OR-logic. Same pattern as above.

Also added field extraction in `deduplicateCreditorsFromDocuments` so these fields flow from raw document data into the merge logic.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add merge logic to both Selection Pass sections | acbbe38 | server/utils/creditorDeduplication.js |
| 2 | Propagate new fields through deduplicateCreditorsFromDocuments | 8e6e4d0 | server/utils/creditorDeduplication.js |

## Verification Results

- Module loads without errors: PASS
- `aktenzeichen_glaeubigervertreter` appears 7 times in file (2 Selection Pass blocks x 3 lines + 1 extraction line)
- `glaeubiger_adresse_ist_postfach` appears 5 times (2 Selection Pass blocks x 2 lines + 1 extraction line)
- Smoke test: longest-wins assertion PASSED, OR-logic assertions PASSED for both Postfach flags

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `server/utils/creditorDeduplication.js` — FOUND and modified
- Commit acbbe38 — FOUND (Task 1)
- Commit 8e6e4d0 — FOUND (Task 2)
- All 4 success criteria from plan satisfied:
  - mergeCreditorLists() preserves aktenzeichen_glaeubigervertreter using longest-wins (via deduplicateCreditorsStrict)
  - mergeCreditorLists() preserves Postfach flags using OR-logic (via deduplicateCreditorsStrict)
  - deduplicateCreditorsFromDocuments extracts and forwards all 3 new fields
  - No syntax errors, module loads cleanly
