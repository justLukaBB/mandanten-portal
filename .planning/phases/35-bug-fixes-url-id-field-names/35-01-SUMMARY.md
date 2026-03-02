---
phase: 35-bug-fixes-url-id-field-names
plan: 01
subsystem: api
tags: [mongoose, docx, email, creditor, second-letter, bug-fix]

# Dependency graph
requires:
  - phase: 33-email-dispatch-workflow-completion
    provides: secondLetterService.js with SEND-02 per-creditor tracking
  - phase: 32-docx-generation
    provides: SecondLetterDocumentGenerator with generateForSingleCreditor / generateForAllCreditors
  - phase: 31-financial-calculation-engine
    provides: calculateSecondLetterFinancials with creditor_calculations array
  - phase: 29-trigger-scheduler-client-notification
    provides: SecondLetterTriggerService with email deep-link construction
provides:
  - Correct portal deep-link URL /portal/second-letter-form?token= in triggerService
  - Fixed _id-to-id references throughout secondLetterDocumentGenerator
  - Fixed final_creditor_list.id filter keys in all MongoDB positional updates
  - Field name fallback chain for Familienstand and Unterhaltsberechtigte in template data
  - Correct creditor.id storage in creditor_calculations entries
affects: [33-email-dispatch-workflow-completion, 32-docx-generation, 31-financial-calculation-engine]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Use creditor.id (not creditor._id) throughout — creditorSchema has { _id: false }"
    - "Use final_creditor_list.id filter key (not final_creditor_list._id) for Mongoose positional updates"
    - "Use ?? (not ||) for numeric fallbacks where 0 is a valid value (number_of_dependents)"

key-files:
  created: []
  modified:
    - server/services/secondLetterTriggerService.js
    - server/services/secondLetterDocumentGenerator.js
    - server/services/secondLetterCalculationService.js

key-decisions:
  - "[Phase 35-01]: creditorSchema { _id: false } means all creditor._id refs are always undefined — use creditor.id throughout"
  - "[Phase 35-01]: ?? nullish coalescing (not ||) for number_of_dependents fallback — 0 is valid and || would skip it"
  - "[Phase 35-01]: prepareTemplateData line 203 creditor._id?.toString() || creditor.id retained — safe fallback, once Bug 6 fixed calcEntry lookup uses real creditor.id"
  - "[Phase 35-01]: SEND-02 already correct in secondLetterService.js line 147 — no change needed"
  - "[Phase 35-01]: Clients with FORM_SUBMITTED whose snapshot was calculated before this fix need recalculate-second-letter endpoint run — creditor_id was stored as empty string"

patterns-established:
  - "creditor.id pattern: All creditor identifier references use creditor.id; never creditor._id (which is always undefined due to { _id: false })"
  - "Positional update filter pattern: 'final_creditor_list.id' not 'final_creditor_list._id'"
  - "Dual-field fallback pattern: snapshot.familienstand || snapshot.marital_status and snapshot.anzahl_unterhaltsberechtigte ?? snapshot.number_of_dependents — supports both German and English snapshot field names"

requirements-completed: [NOTIF-02, SEND-02, DOC-03, DOC-04]

# Metrics
duration: 2min
completed: 2026-03-02
---

# Phase 35 Plan 01: Bug Fixes — URL, _id, and Field Names Summary

**Six data-level bugs in the 2. Anschreiben workflow fixed: portal deep-link URL corrected, all `creditor._id` refs replaced with `creditor.id`, Mongoose positional update filters corrected to `final_creditor_list.id`, template fallback chain added for German/English snapshot field names, and creditor_id storage in creditor_calculations fixed.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-02T23:17:53Z
- **Completed:** 2026-03-02T23:19:53Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- NOTIF-02: Email deep-link URL corrected from `/second-letter?token=` to `/portal/second-letter-form?token=` — clients no longer land on a 404
- DOC-03: Template data fallback chain added: `snapshot.familienstand || snapshot.marital_status` and `snapshot.anzahl_unterhaltsberechtigte ?? snapshot.number_of_dependents` — Familienstand and Unterhaltsberechtigte template variables now populate from English-named snapshot fields
- DOC-04: All five `creditor._id` data-storage sites replaced with `creditor.id` across documentGenerator and calculationService; both `final_creditor_list._id` positional filter keys replaced with `final_creditor_list.id` — DOCX filenames now persist to MongoDB correctly
- SEND-02: Verified already correct — `secondLetterService.js` line 147 uses `final_creditor_list.id` filter key, no change needed

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix _id-to-id and URL bugs in documentGenerator and triggerService** - `c1523c2` (fix)
2. **Task 2: Fix creditor_id storage in calculationService and verify SEND-02** - `d613c1c` (fix)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `server/services/secondLetterTriggerService.js` - Fixed portal deep-link URL (line 93): `/second-letter?token=` → `/portal/second-letter-form?token=`
- `server/services/secondLetterDocumentGenerator.js` - Fixed 5 bugs: DOC-03 field name fallbacks (lines 235-236), DOC-04a creditor_id in result + error objects (lines 300/341), DOC-04b filter key in generateForAllCreditors (line 358), DOC-04c lookup + filter key in generateForSingleCreditorById (lines 397/410)
- `server/services/secondLetterCalculationService.js` - Fixed Bug 6: creditor_id storage changed from `creditor._id?.toString() || ''` to `creditor.id || ''` (line 145)

## Decisions Made

- `creditor.id` throughout: `creditorSchema` has `{ _id: false }` which makes `creditor._id` always `undefined`. Using `creditor._id?.toString()` always produces `undefined`, and `|| ''` makes it empty string. All storage sites corrected to `creditor.id`.
- `??` for number_of_dependents: Using `||` would skip `0` (a valid value for no dependents). Nullish coalescing `??` correctly distinguishes `null`/`undefined` from `0`.
- Line 203 in documentGenerator kept as-is (`creditor._id?.toString() || creditor.id`): This is in `prepareTemplateData` which looks up the calc entry. The fallback `|| creditor.id` makes it safe — once Bug 6 is fixed, `creditor.id` is what gets stored in `creditor_calculations[].creditor_id`, so the lookup succeeds.
- SEND-02 no-op: `secondLetterService.js` line 147 already correctly uses `'final_creditor_list.id': creditor.id` — confirmed during research phase.

## Deviations from Plan

None — plan executed exactly as written. Six bug sites fixed as specified, one site (SEND-02) verified as already correct.

## Issues Encountered

None. Both `node -e "require('./server/services/secondLetterDocumentGenerator')"` and `node -e "require('./server/services/secondLetterCalculationService')"` load cleanly with no errors.

## User Setup Required

**Operational note for deployed clients:** Any client currently in `second_letter_status: FORM_SUBMITTED` whose financial snapshot was calculated **before this fix** will have `creditor_id: ''` in all `creditor_calculations` entries. The admin must run the recalculate endpoint before DOCX generation produces correct financial figures:

```
POST /api/admin/clients/:clientId/recalculate-second-letter
```

No environment variable or infrastructure changes required.

## Next Phase Readiness

- All six audit-identified bugs from v10 milestone audit are resolved
- 2. Anschreiben workflow is now end-to-end correct: email deep-link → portal form → snapshot calculation → DOCX generation → email dispatch
- Ready for Phase 35 Plan 02 (if any) or end-to-end integration testing

---
*Phase: 35-bug-fixes-url-id-field-names*
*Completed: 2026-03-02*
