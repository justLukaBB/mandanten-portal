---
phase: 36-wire-document-generator
plan: 01
subsystem: api
tags: [docx, email-dispatch, second-letter, express, mongoose]

# Dependency graph
requires:
  - phase: 32-docx-generation
    provides: SecondLetterDocumentGenerator.generateForAllCreditors() — DOCX generation service
  - phase: 33-email-dispatch-workflow-completion
    provides: SecondLetterService.dispatchSecondLetterEmails() — email dispatch service
  - phase: 35-bug-fixes-url-id-field-names
    provides: creditor.id field (not _id), positional update filters, field name fallbacks
provides:
  - Complete E2E second-letter send flow: admin triggers generate+dispatch in a single endpoint call
  - Status and snapshot guards in route handler prevent generation for wrong-state clients
  - Document path in secondLetterService now matches generator output (clientId subdirectory included)
affects: [testing, admin-second-letter-endpoint, second-letter-workflow-e2e]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Generate-then-dispatch: DOCX generation precedes email dispatch in same request lifecycle, following creditorContactService.js pattern"
    - "Re-load client after generation: dispatchSecondLetterEmails() re-loads client from DB to pick up freshly persisted filenames"
    - "Defense-in-depth guards: status guard at route level + service level — redundancy intentional"

key-files:
  created: []
  modified:
    - server/routes/admin-second-letter.js
    - server/services/secondLetterService.js

key-decisions:
  - "[Phase 36-01]: Route handler loads client and runs all guards (status + snapshot) before calling generator — fail-fast before expensive file I/O"
  - "[Phase 36-01]: dispatchSecondLetterEmails() re-loads client internally — no parameter change needed; freshly persisted filenames picked up automatically from MongoDB"
  - "[Phase 36-01]: Both route handler and service have FORM_SUBMITTED status guards — defense in depth, not redundancy to remove"
  - "[Phase 36-01]: GENERATED_DOCS_DIR includes clientId from client._id.toString() — matches SecondLetterDocumentGenerator output path second_round/{clientId}/"

patterns-established:
  - "Path fix pattern: derive clientIdStr = client._id.toString() at the point where GENERATED_DOCS_DIR is constructed, not at fullDocPath join"

requirements-completed: [DOC-01, DOC-02, SEND-01, SEND-03, SEND-04]

# Metrics
duration: 5min
completed: 2026-03-03
---

# Phase 36 Plan 01: Wire Document Generator Summary

**SecondLetterDocumentGenerator wired into send-second-letter endpoint with generate-then-dispatch ordering and clientId path fix eliminating the NO_ELIGIBLE_CREDITORS 422 bug**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-03T00:31:00Z
- **Completed:** 2026-03-03T00:36:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Wired SecondLetterDocumentGenerator.generateForAllCreditors() into the send-second-letter handler — generation now precedes dispatch in the same request
- Added FORM_SUBMITTED status guard and calculation_status snapshot guard at route level before any file I/O
- Fixed path mismatch bug in secondLetterService.js: GENERATED_DOCS_DIR now includes clientId subdirectory, matching generator output at `second_round/{clientId}/{filename}`
- E2E flow now complete: admin triggers POST → status guard → snapshot guard → DOCX generated + filenames persisted to MongoDB → emails dispatched with attachments → status transitions to SENT

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire document generation into send-second-letter route handler** - `cfc830e` (feat)
2. **Task 2: Fix document path mismatch in secondLetterService.js** - `e8cd824` (fix)

## Files Created/Modified

- `server/routes/admin-second-letter.js` - Added SecondLetterDocumentGenerator require; replaced handler body with generate-then-dispatch sequence including status guard, snapshot guard, and generation failure guard
- `server/services/secondLetterService.js` - Added clientIdStr derivation; included in GENERATED_DOCS_DIR path construction so fs.existsSync() finds files written by the generator

## Decisions Made

- Route handler loads client and applies all guards before calling the generator — fail-fast before expensive docxtemplater file I/O
- dispatchSecondLetterEmails() re-loads the client from MongoDB internally (line 48 of service), so it automatically picks up second_letter_document_filename values persisted post-loop by generateForAllCreditors() — no parameter changes needed
- Both route handler and secondLetterService retain their independent FORM_SUBMITTED guards (defense in depth — if client transitions between route load and service load, second guard catches it)
- Path fix targets only GENERATED_DOCS_DIR construction (single line change); fullDocPath join at line 106 stays unchanged

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - both modifications were straightforward. The path mismatch root cause (generator saves to `second_round/{clientId}/` but service looked in `second_round/`) was confirmed by cross-referencing secondLetterDocumentGenerator.js line 320 before implementing the fix.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- E2E second-letter workflow is complete end-to-end: trigger → form → recalculate → send (generate+dispatch)
- All five requirements (DOC-01, DOC-02, SEND-01, SEND-03, SEND-04) are satisfied
- Ready for end-to-end integration testing with real DOCX template files and a client in FORM_SUBMITTED state with a completed snapshot

---
*Phase: 36-wire-document-generator*
*Completed: 2026-03-03*
