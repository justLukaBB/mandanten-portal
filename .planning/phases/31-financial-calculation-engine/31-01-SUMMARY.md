---
phase: 31-financial-calculation-engine
plan: 01
subsystem: api
tags: [garnishment, calculation, second-letter, financial-engine, zpo-850c]

# Dependency graph
requires:
  - phase: 30-client-portal-form
    provides: second_letter_financial_snapshot written at form submission
  - phase: 28-second-letter-schema
    provides: Client model with second_letter fields and final_creditor_list
provides:
  - Pure calculation function calculateSecondLetterFinancials(snapshot, creditors)
  - RATENPLAN/NULLPLAN determination from garnishable amount
  - Per-creditor tilgungsangebot and quota_percentage (pro-rata)
affects:
  - 31-financial-calculation-engine (plan 02+ — form-submit handler and admin recalculate endpoint will call this)
  - 32-docx-generation (reads planType and creditorCalculations for template selection)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure calculation service: no DB access, no HTTP, no side effects — synchronously computes from inputs only"
    - "Snapshot-first: reads exclusively from second_letter_financial_snapshot, never live financial_data"
    - "Uppercase enum pattern: RATENPLAN/NULLPLAN (not lowercase) — consistent with v10 locked decisions"
    - "Math.round(x * 100) / 100 for Euro float rounding — consistent with germanGarnishmentCalculator line 422"

key-files:
  created:
    - server/services/secondLetterCalculationService.js
  modified: []

key-decisions:
  - "Use calculator.calculate() not calculateGarnishableAmount() — the latter does not exist (latent bug in adminFinancialController)"
  - "Clamp garnishable amount to Math.max(0, ...) — prevents negative plan amounts"
  - "null claim_amount aborts with descriptive error — locked decision, admin must fix data first"
  - "NULLPLAN creditors get tilgungsangebot = 0 explicitly — uniform data structure for Phase 32 template"
  - "Single creditor handled as normal case: 100% quota, full garnishable as tilgungsangebot"
  - "creditor_id uses _id.toString() (MongoDB ObjectId convention per CLAUDE.md, not .id)"

patterns-established:
  - "Financial calculation pattern: pure function, snapshot-only input, { success, ...data } or { success: false, error } return shape"
  - "Number.isFinite guard on all computed numeric outputs before returning"

requirements-completed: [CALC-01, CALC-02, CALC-03, CALC-04]

# Metrics
duration: 5min
completed: 2026-03-02
---

# Phase 31 Plan 01: Financial Calculation Engine Summary

**Pure §850c ZPO calculation service: garnishable amount + RATENPLAN/NULLPLAN + pro-rata tilgungsangebot per creditor from snapshot data only**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-02T21:29:00Z
- **Completed:** 2026-03-02T21:34:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Created `calculateSecondLetterFinancials(snapshot, creditors)` as a pure function with no DB/HTTP dependencies
- Implements all four CALC requirements: garnishable amount (CALC-01), plan type (CALC-02), creditor validation (CALC-03), per-creditor tilgungsangebot (CALC-04)
- All numeric outputs guarded with `Number.isFinite()` — NaN and Infinity can never enter the system
- Smoke tested: RATENPLAN (2500 EUR ledig, 50/50 split), NULLPLAN (100 EUR verheiratet 3 dependents), null claim_amount abort

## Task Commits

Each task was committed atomically:

1. **Task 1: Create secondLetterCalculationService.js with pure calculation function** - `36d1b6a` (feat)

**Plan metadata:** (to be added in final commit)

## Files Created/Modified
- `server/services/secondLetterCalculationService.js` - Pure calculation service exporting calculateSecondLetterFinancials()

## Decisions Made
- Used `calculator.calculate()` method (not `calculateGarnishableAmount()` which does not exist) — the plan notes this as a latent bug in `adminFinancialController.js` that uses the wrong method name
- Clamped garnishable amount to `Math.max(0, ...)` — negative amounts from the calculator are treated as zero
- `creditor_id` uses `creditor._id?.toString()` per CLAUDE.md MongoDB convention
- `creditor_name` fallback chain: `sender_name || creditor_name || glaeubiger_name || 'Unbekannt'`
- Single creditor handled as normal calculation (100% quota, full garnishable as tilgungsangebot) per plan spec

## Deviations from Plan

None — plan executed exactly as written. The `financial_data` string appearing in grep count verification was a JSDoc comment (not code), which is correct documentation-only usage.

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- `calculateSecondLetterFinancials` is importable and callable from any handler
- Ready for Phase 31 Plan 02 (form-submit handler calling this service) or admin recalculate endpoint
- Note: the `adminFinancialController.js` latent bug (calling `calculateGarnishableAmount()` which doesn't exist) was identified but is out of scope — deferred

## Self-Check: PASSED

- FOUND: server/services/secondLetterCalculationService.js
- FOUND commit: 36d1b6a (feat(31-01): create secondLetterCalculationService...)

---
*Phase: 31-financial-calculation-engine*
*Completed: 2026-03-02*
