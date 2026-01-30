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

### Active

- [ ] Payment handler checks `creditor.needs_manual_review` flag (not just document flags and contact info)
- [ ] AI deduplication triggers after last document is processed instead of 30-minute timer
- [ ] Race condition eliminated: creditor list is finalized before payment status decision

### Out of Scope

- Agent portal UX changes — not needed, portal already shows review clients correctly
- Zendesk ticket creation changes — existing logic works, just needs to be reached
- Status flow redesign — current flow is correct, just the check is incomplete
- Frontend admin panel changes — dedup button behavior unchanged

## Context

- **Root cause**: `zendeskWebhookController.js:489` explicitly ignores `creditor.needs_manual_review` flag. Comment says "using document flags, NOT creditor.needs_manual_review"
- **Race condition**: `aiDedupScheduler.js` schedules dedup with 30-minute delay after uploads. Payment can arrive before dedup completes, evaluating pre-dedup creditor list
- **Dedup enrichment side effect**: Dedup fills in missing emails/addresses from local DB, which can make the payment handler think contact info is complete when review is still needed for other reasons
- **Existing codebase**: Node.js/Express backend, MongoDB, React frontend. See `.planning/codebase/` for full mapping

## Constraints

- **Tech stack**: Node.js/Express backend, MongoDB — existing stack, no new dependencies
- **Backward compatibility**: Must not break existing auto-approval for cases where review is genuinely not needed
- **Data integrity**: `final_creditor_list` overwrites during dedup must preserve all existing flags and review state

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Check `needs_manual_review` flag in payment handler | Flag is set by dedup and document processing but ignored at decision point | — Pending |
| Trigger dedup after last document processed instead of 30-min timer | Eliminates race condition between dedup and payment | — Pending |
| Keep existing Zendesk/agent portal logic unchanged | Already works correctly once `creditor_review` status is set | — Pending |

---
*Last updated: 2026-01-30 after initialization*
