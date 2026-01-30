---
phase: 02-payment-status-logic
plan: 01
subsystem: payment-handler
tags: [payment-handler, status-routing, creditor-review, auto-approval, needs_manual_review]
requires:
  - phase: 01-deduplication-timing-data-integrity
    provides: needs_manual_review flag set on creditors during dedup, dedup wait logic
provides:
  - Payment handler checks creditor.needs_manual_review flag before status routing
  - Auto-approval requires ALL creditors pass ALL checks (needs_manual_review + email + address + name)
  - Empty creditor list routes to creditor_review
affects: []
tech-stack:
  added: []
  patterns: [fail-fast validation, computed boolean for branching consistency]
key-files:
  created: []
  modified:
    - server/controllers/zendeskWebhookController.js
key-decisions:
  - "Check creditor.needs_manual_review flag FIRST before any contact field checks"
  - "Auto-approval requires ALL creditors pass ALL checks (flag + email + address + name)"
  - "Empty creditor list routes to creditor_review (abnormal state)"
  - "Single requiresManualReview boolean gates ALL status branching for consistency"
duration: 2min 32s
completed: 2026-01-30
---

# Phase 2 Plan 1: Payment Status Logic Summary

**Payment handler now checks creditor.needs_manual_review flag and creditor name alongside email/address, routing to creditor_review if ANY creditor needs review or is missing required contact information**

## Performance

**Duration:** 2 minutes 32 seconds
**Tasks completed:** 2/2
**Commits:** 2 atomic commits (one per task)

## Accomplishments

### Task 1: Add needs_manual_review flag check and name validation
- Modified `creditorNeedsManualReview()` helper to check `creditor.needs_manual_review === true` FIRST
- Removed document flag traversal logic (linkedDocs lookup, documentNeedsReview check)
- Added name validation using `sender_name || glaeubiger_name` (was missing)
- Updated email check to use `sender_email || email_glaeubiger`
- Updated address check to use `sender_address || glaeubiger_adresse`
- All three contact checks use `isMissingValue()` helper for comprehensive validation
- Updated console logging to show actual review reasons (flag + missing fields)
- Updated auto-approval status history message to reflect new logic

### Task 2: Add empty creditor list guard and requiresManualReview boolean
- Added empty creditor list guard (creditors.length === 0 routes to creditor_review)
- Created `requiresManualReview` computed boolean: `needsReview.length > 0 || creditors.length === 0`
- Replaced ALL occurrences of `needsReview.length > 0` checks with `requiresManualReview`
- Replaced ALL occurrences of `needsReview.length === 0` checks with `!requiresManualReview`
- Consistent branching logic throughout payment handler (9 locations updated)
- Console logging updated to reflect review flag and contact checks

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 23e947d | feat(02-01): add needs_manual_review flag check and name validation |
| 2 | b032aca | feat(02-01): add empty creditor list guard and requiresManualReview boolean |

## Files Created/Modified

### Modified Files

**server/controllers/zendeskWebhookController.js** (lines 512-707)
- `creditorNeedsManualReview()` helper: Now checks `needs_manual_review` flag first, then validates email + address + name
- Empty creditor list guard: Logs warning and routes to creditor_review
- `requiresManualReview` boolean: Single source of truth for status decision branching
- Console logging: Shows actual review reasons (needs_manual_review flag, missing email/address/name)
- Auto-approval history entry: "All creditors pass review flag and contact checks"
- Status decision logic: Uses `requiresManualReview` for all branching (9 locations)

### Key Changes

**Before:**
```javascript
// Helper checked document flags and email/address only (NOT name)
const creditorNeedsManualReview = (creditor) => {
  // Document flag traversal (linkedDocs lookup)
  const documentNeedsReview = linkedDocs.some(doc => ...);

  // Missing contact check (email + address only, NO name)
  const creditorEmail = creditor.email || creditor.sender_email;
  const creditorAddress = creditor.address || creditor.sender_address;

  return documentNeedsReview || missingEmail || missingAddress;
};

// Status decision used needsReview.length > 0 directly in multiple places
if (needsReview.length > 0) { ... }
```

**After:**
```javascript
// Helper checks needs_manual_review flag FIRST, then email + address + name
const creditorNeedsManualReview = (creditor) => {
  // Check 1: Creditor-level manual review flag (set by AI dedup)
  if (creditor.needs_manual_review === true) {
    return true;
  }

  // Check 2: Missing contact fields (email, address, name)
  const creditorEmail = creditor.sender_email || creditor.email_glaeubiger;
  const creditorAddress = creditor.sender_address || creditor.glaeubiger_adresse;
  const creditorName = creditor.sender_name || creditor.glaeubiger_name;

  const missingEmail = isMissingValue(creditorEmail);
  const missingAddress = isMissingValue(creditorAddress);
  const missingName = isMissingValue(creditorName);

  return missingEmail || missingAddress || missingName;
};

// Empty creditor list guard
if (creditors.length === 0) {
  console.log(`[payment-handler] No creditors found for ${freshClient.aktenzeichen} — routing to creditor_review`);
}

// Single requiresManualReview boolean for consistent branching
const requiresManualReview = needsReview.length > 0 || creditors.length === 0;

if (requiresManualReview) { ... }
```

## Decisions Made

### Decision 1: Check needs_manual_review flag FIRST
**Context:** The payment handler was explicitly ignoring the creditor-level `needs_manual_review` flag (line 539 comment: "using document flags, NOT creditor.needs_manual_review"), causing creditors flagged during AI deduplication to bypass agent review.

**Decision:** Check `creditor.needs_manual_review === true` as the FIRST condition in the helper, before any contact field checks. If ANY creditor has this flag, immediately return true to route to creditor_review.

**Impact:** Creditors flagged during deduplication (Phase 1) now correctly route through agent review. The flag set by AI dedup is now honored by the payment handler.

### Decision 2: Add name field to auto-approval requirements
**Context:** The original code only checked email and address. Creditor name is required for document generation and contact, but was not validated.

**Decision:** Add name validation using `sender_name || glaeubiger_name` alongside email and address checks. Auto-approval now requires ALL THREE contact fields to be non-empty.

**Impact:** Cases with missing creditor names now route to creditor_review for agent correction, preventing document generation failures downstream.

### Decision 3: Empty creditor list routes to creditor_review
**Context:** An empty `final_creditor_list` after payment is an abnormal state (no one to contact). The original code didn't handle this edge case explicitly.

**Decision:** Route cases with `creditors.length === 0` to creditor_review status. Add guard check after loading creditor list, include in `requiresManualReview` computation.

**Impact:** Edge case is explicitly handled rather than silently auto-approving cases with no creditors to contact.

### Decision 4: Use computed requiresManualReview boolean
**Context:** The original code had inconsistent branching — some places checked `needsReview.length > 0`, others checked `needsReview.length === 0`, making it easy to miss updates when logic changed.

**Decision:** Compute a single `requiresManualReview` boolean once (`needsReview.length > 0 || creditors.length === 0`), then use it consistently throughout the function for ALL branching decisions.

**Impact:** Consistent branching logic across 9 locations. Future changes to review conditions only need to update one line. Empty creditor list automatically integrates into all branching.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — straightforward implementation with clear requirements and well-documented codebase.

## Next Phase Readiness

**Status:** ✅ Ready

Phase 2 is complete. Payment handler now correctly:
- Checks `creditor.needs_manual_review` flag before status routing (PAY-01 ✅)
- Routes to `creditor_review` if ANY creditor has `needs_manual_review=true` (PAY-02 ✅)
- Auto-approval requires ALL creditors pass ALL checks: flag + email + address + name (PAY-03 ✅)
- Handles empty creditor list edge case (routes to creditor_review)
- Uses consistent branching logic via `requiresManualReview` boolean

**Testing recommendations:**
1. Test case with creditor.needs_manual_review=true → should route to creditor_review
2. Test case with missing email/address/name → should route to creditor_review
3. Test case with all creditors passing all checks → should auto-approve to awaiting_client_confirmation
4. Test case with empty final_creditor_list → should route to creditor_review
5. Verify console logging shows accurate review reasons

**No blockers for future work.**
