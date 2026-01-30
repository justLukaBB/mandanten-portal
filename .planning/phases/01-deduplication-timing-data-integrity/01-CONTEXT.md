# Phase 1: Deduplication Timing & Data Integrity - Context

**Gathered:** 2026-01-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix when deduplication runs and what it preserves during creditor list merge. Dedup must trigger immediately after document processing completes (not via 30-minute cron), and all manual review flags (`needs_manual_review`, `review_reasons`) must survive the merge into `final_creditor_list`. Payment status logic changes are Phase 2.

</domain>

<decisions>
## Implementation Decisions

### Dedup trigger mechanism
- Remove the existing cron job entirely — dedup only fires from document completion events
- No scheduled fallback; the event-driven trigger is the sole mechanism
- The specific trigger approach (event-driven vs counter-based) is Claude's discretion based on existing codebase patterns

### Dedup-to-payment coordination
- Claude's discretion on whether payment handler blocks until dedup completes or re-queues itself
- Key requirement: payment status decisions must never run on stale (pre-dedup) creditor data

### Claude's Discretion
- Trigger implementation approach (event-driven vs counter-based — whichever fits existing patterns)
- Coordination mechanism between dedup completion and payment status handler
- Merge conflict resolution strategy (which fields win during dedup merge)
- Failure and recovery behavior (retry logic, partial state handling)
- Logging and alerting for dedup operations

</decisions>

<specifics>
## Specific Ideas

- Current delay is caused by a cron job that runs dedup every ~30 minutes — this cron should be removed, not kept as fallback
- The user wants a clean break: event-driven only, no redundant scheduled runs

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-deduplication-timing-data-integrity*
*Context gathered: 2026-01-30*
