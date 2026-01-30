# Milestone v1: Manual Review & Payment Status Flow Fix

**Status:** SHIPPED 2026-01-30
**Phases:** 1-2
**Total Plans:** 4

## Overview

Fix the creditor review status flow by ensuring deduplication runs immediately after document processing (eliminating race conditions), preserves manual review flags during merge, and updating the payment handler to check the `needs_manual_review` flag before making status decisions. This ensures creditors flagged for manual review route through agent review instead of auto-approving.

## Phases

### Phase 1: Deduplication Timing & Data Integrity

**Goal**: Deduplication runs immediately after document processing completes and preserves all manual review flags during creditor list merge
**Depends on**: Nothing (first phase)
**Plans**: 3 plans

Plans:

- [x] 01-01: Convert dedup scheduler to immediate execution + trigger from document completion
- [x] 01-02: Preserve manual review flags during dedup merge
- [x] 01-03: Payment handler waits for dedup completion

**Details:**

**Success Criteria** (all verified):
1. Dedup triggers within seconds of the last document finishing processing (not 30 minutes later)
2. Payment status decisions wait for dedup to complete if documents were recently processed
3. Creditors with `needs_manual_review = true` retain that flag after dedup runs
4. Existing `review_reasons` arrays are preserved when `final_creditor_list` is overwritten

**Requirements:** DDP-01, DDP-02, DDP-03, DAT-01

**Files Modified:**
- `server/models/Client.js` — Added dedup_in_progress, dedup_started_at, dedup_completed_at fields
- `server/services/aiDedupScheduler.js` — Removed 30-min delay, added atomic guard, immediate execution, flag preservation
- `server/controllers/webhookController.js` — Added dedup trigger in allDocsCompleted block
- `server/controllers/zendeskWebhookController.js` — Added waitForDedupIfNeeded method
- `server/controllers/adminClientCreditorController.js` — existingMap pattern for flag preservation
- `server/server.js` — Injected aiDedupScheduler dependency
- `server/routes/webhooks.js` — Updated router factory signature

**Commits:**
- `6639579` — feat(01-01): add dedup coordination fields and convert scheduler to immediate execution
- `9f6572e` — feat(01-01): trigger dedup from document processing completion
- `1fc0d30` — feat(01-02): preserve review flags in aiDedupScheduler runAIRededup
- `6e277a6` — feat(01-02): preserve review flags in admin-triggered dedup
- `cee2c15` — feat(01-03): add waitForDedupIfNeeded to payment handler

### Phase 2: Payment Status Logic

**Goal**: Payment handler checks creditor-level `needs_manual_review` flag and routes to `creditor_review` when any creditor needs review
**Depends on**: Phase 1
**Plans**: 1 plan

Plans:

- [x] 02-01: Add needs_manual_review flag check, name validation, and empty creditor guard to payment handler

**Details:**

**Success Criteria** (all verified):
1. Payment handler reads `needs_manual_review` from each creditor in `final_creditor_list`
2. If ANY creditor has `needs_manual_review = true`, status is set to `creditor_review` regardless of document/contact status
3. Auto-approval to `ready_for_payment` only occurs when ALL creditors have `needs_manual_review = false` AND pass document/contact checks
4. Cases with manual review flags appear in agent portal review queue instead of skipping to client approval

**Requirements:** PAY-01, PAY-02, PAY-03

**Files Modified:**
- `server/controllers/zendeskWebhookController.js` — creditorNeedsManualReview rewrite + requiresManualReview boolean

**Commits:**
- `23e947d` — feat(02-01): add needs_manual_review flag check and name validation
- `b032aca` — feat(02-01): add empty creditor list guard and requiresManualReview boolean

---

## Milestone Summary

**Key Decisions:**

- MongoDB atomic update for dedup guard (prevents race conditions without Redis)
- setImmediate for async dedup execution (non-blocking webhook response)
- Always clear dedup_in_progress in finally block (prevents permanent locks)
- OR logic for needs_manual_review preservation (flag never lost during dedup)
- Union merge for review_reasons arrays (historical + new reasons preserved)
- Dual lookup by ID and normalized name (handles FastAPI ID reassignment)
- 5-minute recent window for dedup wait (avoids unnecessary delays)
- Check needs_manual_review flag FIRST in payment handler
- Single requiresManualReview boolean for consistent branching (9 locations)

**Issues Resolved:**

- Payment handler ignoring creditor.needs_manual_review flag (root cause)
- 30-minute race condition between dedup completion and payment status decision
- Manual review flags lost during dedup creditor list overwrite
- Missing name validation in auto-approval checks
- Empty creditor list silently auto-approving

**Issues Deferred:**

None — all v1 requirements satisfied.

**Technical Debt Incurred:**

None identified. All phases executed without deviations and all verification truths passed.

---

_For current project status, see .planning/ROADMAP.md_
