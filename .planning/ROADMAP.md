# Roadmap: Manual Review & Payment Status Flow Fix

## Overview

Fix the creditor review status flow by ensuring deduplication runs immediately after document processing (eliminating race conditions), preserves manual review flags during merge, and updating the payment handler to check the `needs_manual_review` flag before making status decisions. This ensures creditors flagged for manual review route through agent review instead of auto-approving.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Deduplication Timing & Data Integrity** - Fix when dedup runs and what it preserves
- [ ] **Phase 2: Payment Status Logic** - Respect manual review flags in status decisions

## Phase Details

### Phase 1: Deduplication Timing & Data Integrity
**Goal**: Deduplication runs immediately after document processing completes and preserves all manual review flags during creditor list merge
**Depends on**: Nothing (first phase)
**Requirements**: DDP-01, DDP-02, DDP-03, DAT-01
**Success Criteria** (what must be TRUE):
  1. Dedup triggers within seconds of the last document finishing processing (not 30 minutes later)
  2. Payment status decisions wait for dedup to complete if documents were recently processed
  3. Creditors with `needs_manual_review = true` retain that flag after dedup runs
  4. Existing `review_reasons` arrays are preserved when `final_creditor_list` is overwritten
**Plans**: TBD

Plans:
- [ ] 01-01: TBD

### Phase 2: Payment Status Logic
**Goal**: Payment handler checks creditor-level `needs_manual_review` flag and routes to `creditor_review` when any creditor needs review
**Depends on**: Phase 1
**Requirements**: PAY-01, PAY-02, PAY-03
**Success Criteria** (what must be TRUE):
  1. Payment handler reads `needs_manual_review` from each creditor in `final_creditor_list`
  2. If ANY creditor has `needs_manual_review = true`, status is set to `creditor_review` regardless of document/contact status
  3. Auto-approval to `ready_for_payment` only occurs when ALL creditors have `needs_manual_review = false` AND pass document/contact checks
  4. Cases with manual review flags appear in agent portal review queue instead of skipping to client approval
**Plans**: TBD

Plans:
- [ ] 02-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Deduplication Timing & Data Integrity | 0/TBD | Not started | - |
| 2. Payment Status Logic | 0/TBD | Not started | - |
