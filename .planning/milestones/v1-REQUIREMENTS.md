# Requirements Archive: v1 Manual Review & Payment Status Flow Fix

**Archived:** 2026-01-30
**Status:** SHIPPED

This is the archived requirements specification for v1.
For current requirements, see `.planning/REQUIREMENTS.md` (created for next milestone).

---

# Requirements: Manual Review & Payment Status Flow Fix

**Defined:** 2026-01-30
**Core Value:** When a creditor has `needs_manual_review = true`, the case must route through agent review — never auto-approve and skip it.

## v1 Requirements

### Payment Status Logic

- [x] **PAY-01**: Payment handler checks `creditor.needs_manual_review` flag in addition to document flags and missing contact info
- [x] **PAY-02**: If any creditor has `needs_manual_review = true`, status routes to `creditor_review` regardless of document/contact status
- [x] **PAY-03**: Auto-approval only happens when ALL creditors have `needs_manual_review = false` AND pass document/contact checks

### Deduplication Timing

- [x] **DDP-01**: AI deduplication triggers immediately after the last document finishes processing (not on 30-minute timer)
- [x] **DDP-02**: Payment status decision waits for dedup to complete if documents were recently processed
- [x] **DDP-03**: Dedup scheduler cancels pending 30-minute jobs when immediate dedup runs

### Data Integrity

- [x] **DAT-01**: Dedup preserves existing `needs_manual_review` and `review_reasons` when overwriting `final_creditor_list`

## v2 Requirements

### Enhanced Observability

- **OBS-01**: Admin panel shows dedup status (pending/running/complete) per client
- **OBS-02**: Status history logs dedup completion timestamp relative to payment

## Out of Scope

| Feature | Reason |
|---------|--------|
| Agent portal UX changes | Portal already shows review clients correctly via existing query |
| Zendesk ticket creation changes | Works correctly once `creditor_review` status is reached |
| Frontend admin panel changes | Dedup button behavior unchanged |
| Status flow redesign | Current flow is correct, just the check is incomplete |
| Document processing pipeline changes | Extraction and flag-setting works correctly |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DDP-01 | Phase 1 | Complete |
| DDP-02 | Phase 1 | Complete |
| DDP-03 | Phase 1 | Complete |
| DAT-01 | Phase 1 | Complete |
| PAY-01 | Phase 2 | Complete |
| PAY-02 | Phase 2 | Complete |
| PAY-03 | Phase 2 | Complete |

**Coverage:**
- v1 requirements: 7 total
- Mapped to phases: 7
- Unmapped: 0

---

## Milestone Summary

**Shipped:** 7 of 7 v1 requirements
**Adjusted:** None — all requirements implemented as originally specified
**Dropped:** None

---
*Archived: 2026-01-30 as part of v1 milestone completion*
