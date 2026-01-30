# Manual Review & Payment Status Flow Fix

## What This Is

Fix the creditor review status flow in the Mandanten Portal so that the payment handler respects `needs_manual_review` flags set by AI deduplication, and deduplication runs immediately after the last document is processed instead of on a 30-minute timer. This ensures creditors flagged for manual review actually go through agent review before reaching the client.

## Core Value

When a creditor has `needs_manual_review = true`, the case must route through agent review — never auto-approve and skip it.

## Requirements

### Validated

- ✓ AI deduplication merges creditors and sets `needs_manual_review` flags — existing
- ✓ Payment handler routes to `creditor_review` or `awaiting_client_confirmation` — existing
- ✓ Agent portal shows clients needing review — existing
- ✓ Zendesk ticket created on creditor review — existing
- ✓ Document processing pipeline extracts creditors with flags — existing
- ✓ Payment handler checks `creditor.needs_manual_review` flag — v1
- ✓ AI deduplication triggers after last document is processed instead of 30-minute timer — v1
- ✓ Race condition eliminated: creditor list is finalized before payment status decision — v1

### Active

(None — next milestone requirements TBD via `/gsd:new-milestone`)

### Out of Scope

- Agent portal UX changes — not needed, portal already shows review clients correctly
- Zendesk ticket creation changes — existing logic works, just needs to be reached
- Status flow redesign — current flow is correct, check is now complete
- Frontend admin panel changes — dedup button behavior unchanged

## Context

Shipped v1 with 7 files modified across Node.js/Express backend.
Tech stack: Node.js/Express backend, MongoDB, React frontend.
All 7 requirements satisfied, audit passed with full scores.

## Constraints

- **Tech stack**: Node.js/Express backend, MongoDB — existing stack, no new dependencies
- **Backward compatibility**: Must not break existing auto-approval for cases where review is genuinely not needed
- **Data integrity**: `final_creditor_list` overwrites during dedup must preserve all existing flags and review state

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Check `needs_manual_review` flag in payment handler | Flag is set by dedup and document processing but ignored at decision point | ✓ Good — v1 |
| Trigger dedup after last document processed instead of 30-min timer | Eliminates race condition between dedup and payment | ✓ Good — v1 |
| Keep existing Zendesk/agent portal logic unchanged | Already works correctly once `creditor_review` status is set | ✓ Good — v1 |
| MongoDB atomic update for dedup guard | Prevents race conditions without Redis/application locks | ✓ Good — v1 |
| setImmediate for async dedup execution | Non-blocking webhook response, dedup runs after document save | ✓ Good — v1 |
| OR logic for needs_manual_review preservation | Creditors never lose manual review flag during dedup | ✓ Good — v1 |
| Single requiresManualReview boolean | Consistent branching logic across 9 locations in payment handler | ✓ Good — v1 |

---
*Last updated: 2026-01-30 after v1 milestone*
