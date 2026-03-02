---
phase: 31-financial-calculation-engine
plan: 02
subsystem: api
tags: [garnishment, calculation, second-letter, financial-engine, form-submit, admin-endpoint]

# Dependency graph
requires:
  - phase: 31-01
    provides: calculateSecondLetterFinancials pure function
  - phase: 30-client-portal-form
    provides: handleSubmitSecondLetterForm handler with second_letter_financial_snapshot write
  - phase: 28-second-letter-schema
    provides: Client model with second_letter fields and final_creditor_list
provides:
  - Synchronous calculation call inside form-submit handler (single API call = save + calculate)
  - POST /api/admin/clients/:clientId/recalculate-second-letter endpoint
affects:
  - 32-docx-generation (reads planType/creditorCalculations from snapshot — now populated on submit)
  - admin UI (can call recalculate endpoint after correcting creditor data)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Snapshot-first calculation: form submit writes snapshot then calls pure calculation, no re-read"
    - "Atomic $set update via findByIdAndUpdate after safeClientUpdate — avoids race condition"
    - "Dual-entry calculation: same calculateSecondLetterFinancials called from both form-submit and recalculate"
    - "Field name dual-support: service handles both marital_status/number_of_dependents (Phase 30) and familienstand/anzahl_unterhaltsberechtigte (legacy) snapshot fields"

key-files:
  created: []
  modified:
    - server/controllers/clientPortalController.js
    - server/routes/admin-second-letter.js
    - server/server.js
    - server/services/secondLetterCalculationService.js

key-decisions:
  - "Added recalculate endpoint to admin-second-letter.js (not admin-financial.js) — semantically correct file exists and was the right home per plan's own guidance"
  - "Pass Client model via server.js DI to createAdminSecondLetterRouter — no global require in route file"
  - "Fixed snapshot field name mismatch in calculation service: Phase 30 uses marital_status + number_of_dependents, service was reading familienstand + anzahl_unterhaltsberechtigte — service now supports both with fallback"
  - "Form submit response includes calculation_status and optional calculation_error — frontend immediately knows outcome"

requirements-completed: [CALC-01, CALC-02, CALC-03, CALC-04]

# Metrics
duration: 3min
completed: 2026-03-02
---

# Phase 31 Plan 02: Calculation Integration Summary

**Wired calculateSecondLetterFinancials into form-submit handler (synchronous) and admin recalculate endpoint; fixed field name mismatch between Phase 30 snapshot and calculation service**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-02T21:33:16Z
- **Completed:** 2026-03-02T21:36:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Integrated `calculateSecondLetterFinancials()` synchronously into `handleSubmitSecondLetterForm` — one API call now saves form data AND runs the full §850c ZPO calculation
- Calculation results (garnishable_amount, plan_type, total_debt, creditor_calculations, calculation_status, calculated_at) persisted atomically via `Client.findByIdAndUpdate($set)` after snapshot write
- Calculation failure does not lose form data — snapshot is persisted with `calculation_status='failed'` and `calculation_error`
- Added `POST /api/admin/clients/:clientId/recalculate-second-letter` to `admin-second-letter.js` with guards (404 no client, 400 no snapshot, 400 status SENT)
- Fixed field name mismatch: Phase 30 snapshot stores `marital_status`/`number_of_dependents` but service was reading `familienstand`/`anzahl_unterhaltsberechtigte` — service now handles both with fallback chain

## Task Commits

Each task was committed atomically:

1. **Task 1: Integrate calculation into form-submit handler** - `cd6456a` (feat)
2. **Task 2: Add admin recalculate-second-letter endpoint** - `e8e6f31` (feat)

## Files Created/Modified

- `server/controllers/clientPortalController.js` — Added require + calculation block + updated response
- `server/routes/admin-second-letter.js` — Added recalculate-second-letter route + Client DI
- `server/server.js` — Pass Client to createAdminSecondLetterRouter
- `server/services/secondLetterCalculationService.js` — Field name fallback fix (Rule 1 auto-fix)

## Decisions Made

- Placed recalculate endpoint in `admin-second-letter.js` rather than `admin-financial.js` — semantically correct, plan explicitly allows this choice
- Service updated to support both Phase 30 field names (`marital_status`/`number_of_dependents`) and older names (`familienstand`/`anzahl_unterhaltsberechtigte`) via fallback, so existing tests remain valid
- `Client` model passed via dependency injection in `createAdminSecondLetterRouter` — consistent with factory pattern used throughout the project

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed snapshot field name mismatch in secondLetterCalculationService**
- **Found during:** Task 1
- **Issue:** Phase 30 snapshot writes `marital_status` and `number_of_dependents`, but `calculateSecondLetterFinancials` was reading `snapshot.familienstand` and `snapshot.anzahl_unterhaltsberechtigte` — would have produced `undefined` inputs to the garnishment calculator on every real form submission
- **Fix:** Added fallback chain in service: `familienstand = snapshot.familienstand || snapshot.marital_status` and `anzahlUnterhaltsberechtigte = snapshot.anzahl_unterhaltsberechtigte ?? snapshot.number_of_dependents ?? 0`
- **Files modified:** `server/services/secondLetterCalculationService.js`
- **Commit:** `cd6456a`

**2. [Rule 3 - Blocking] Routed endpoint to admin-second-letter.js with Client DI update**
- **Found during:** Task 2
- **Issue:** `admin-second-letter.js` existed (created by Phase 29) but only received `secondLetterTriggerService` — needed `Client` model for the recalculate endpoint
- **Fix:** Updated factory signature and server.js registration to also pass `Client`
- **Files modified:** `server/routes/admin-second-letter.js`, `server/server.js`
- **Commit:** `e8e6f31`

## Issues Encountered

None blocking. Both deviations were auto-fixed inline.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 32 (DOCX generation) can now rely on snapshot fields being populated after form submission
- `second_letter_financial_snapshot.plan_type` will be `'RATENPLAN'` or `'NULLPLAN'` for template selection
- `second_letter_financial_snapshot.creditor_calculations[]` contains `tilgungsangebot` per creditor for template data
- Admin can retrigger via `POST /api/admin/clients/:clientId/recalculate-second-letter` after fixing creditor data

## Self-Check: PASSED

- FOUND: server/controllers/clientPortalController.js (modified)
- FOUND: server/routes/admin-second-letter.js (modified)
- FOUND: server/server.js (modified)
- FOUND: server/services/secondLetterCalculationService.js (modified)
- FOUND commit: cd6456a (feat(31-02): integrate calculateSecondLetterFinancials...)
- FOUND commit: e8e6f31 (feat(31-02): add POST recalculate-second-letter admin endpoint)

---
*Phase: 31-financial-calculation-engine*
*Completed: 2026-03-02*
