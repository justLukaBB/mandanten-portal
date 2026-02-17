---
phase: 15-admin-trigger-button
plan: 02
subsystem: ui
tags: [react, admin, payments, zendesk, heroicons]

# Dependency graph
requires:
  - phase: 15-admin-trigger-button
    plan: 01
    provides: POST /api/admin/clients/:clientId/trigger-payment-handler endpoint
provides:
  - Payment Handler trigger button in UserDetailView header (always visible, ADMIN-02)
  - window.confirm warning dialog when first_payment_received is true (ADMIN-03)
  - Inline result display showing handler outcome (status, ticket, creditors, email)
affects: [admin-frontend, admin-workflow-manager]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "window.confirm for admin-action confirmation dialogs — consistent with existing triggerAIRededup pattern"
    - "Inline result banner with dismiss button — consistent with aiDedupMessage pattern"
    - "fetchUserDetails({ silent: true }) refresh after admin action"

key-files:
  created: []
  modified:
    - src/admin/components/UserDetailView.tsx

key-decisions:
  - "Used window.confirm for confirmation dialog (ADMIN-03) — consistent with existing triggerAIRededup pattern, avoids new modal state management"
  - "Result display placed at top of scrollable content area, styled green/red based on Fehler prefix, dismissible with XMarkIcon"
  - "Button always visible in header regardless of first_payment_received status (ADMIN-02 requirement)"

patterns-established:
  - "Admin trigger buttons: green bg-green-600 with CurrencyEuroIcon, ArrowPathIcon spinner during loading"

requirements-completed: [ADMIN-02, ADMIN-03]

# Metrics
duration: 3min
completed: 2026-02-17
---

# Phase 15 Plan 02: Admin Payment Handler Trigger Button Summary

**Green 'Payment Handler' button added to UserDetailView header that calls POST /api/admin/clients/:clientId/trigger-payment-handler with window.confirm guard when first_payment_received is already true**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-17T14:37:02Z
- **Completed:** 2026-02-17T14:40:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added `first_payment_received` and `no_documents_email_sent` fields to `DetailedUser` interface
- Added `triggeringPaymentHandler` and `paymentHandlerResult` state variables
- Added `triggerPaymentHandler` function calling the new admin endpoint with structured result summary
- Added `handlePaymentHandlerClick` with `window.confirm` guard when payment already received
- Added green "Payment Handler" button to header (always visible, ArrowPathIcon spinner during execution)
- Added dismissible result banner at top of scrollable content area (green/red based on success/error)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Payment Handler trigger button to UserDetailView header** - `b7d2c61` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/admin/components/UserDetailView.tsx` - Added state, trigger functions, header button, result display

## Decisions Made
- Used `window.confirm` for the ADMIN-03 confirmation dialog (when first_payment_received is true), consistent with the existing `triggerAIRededup` pattern that also uses `window.confirm`. This avoids introducing new modal state management.
- Result display placed at top of scrollable content area rather than inside the header to keep the header clean and allow multi-line results to be readable.
- Button styled with `bg-green-600` to visually differentiate it from other header buttons (blue, orange, red).

## Deviations from Plan

None - plan executed exactly as written. The plan itself noted to use `window.confirm` (final version in Step 5), and the `showPaymentHandlerConfirm` state was not added per the plan's final guidance.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All ADMIN-01 through ADMIN-04 requirements are now complete
- Backend endpoint (15-01) + Frontend button (15-02) deliver the full admin payment handler trigger workflow
- No further phases planned for this feature

## Self-Check: PASSED

- FOUND: src/admin/components/UserDetailView.tsx
- FOUND: trigger-payment-handler in fetch call (line 395)
- FOUND: handlePaymentHandlerClick function and button onClick (lines 436, 1169)
- FOUND: first_payment_received in interface and confirmation check (lines 72, 437)
- FOUND: paymentHandlerResult state and result display (lines 158, 1267-1276)
- FOUND: commit b7d2c61 (feat(15-02): add Payment Handler trigger button to UserDetailView header)

---
*Phase: 15-admin-trigger-button*
*Completed: 2026-02-17*
