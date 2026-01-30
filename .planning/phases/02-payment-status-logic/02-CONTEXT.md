# Phase 2: Payment Status Logic - Context

**Gathered:** 2026-01-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Payment handler checks creditor-level `needs_manual_review` flag and routes to `creditor_review` when any creditor needs review or is missing required contact information. Auto-approval to `awaiting_client_confirmation` only occurs when ALL creditors pass all checks. Agent portal approval flow and creditor filtering already exist — this phase focuses on the payment handler decision logic.

</domain>

<decisions>
## Implementation Decisions

### Status Decision Hierarchy
- Check `needs_manual_review` FIRST, before any other checks
- If ANY creditor has `needs_manual_review = true`, immediately route to `creditor_review`
- No differentiation in status — both manual review and missing info route to `creditor_review` without storing the reason
- The payment handler logic only checks creditor-level fields (not document processing status)
- After dedup wait (Phase 1), iterate creditors and check: `needs_manual_review` + email address + postal address + creditor name
- That's the complete decision flow — no other conditions to check

### Auto-Approval Conditions
- Auto-approval requires ALL of:
  1. Every creditor has `needs_manual_review = false`
  2. Every creditor has an email address
  3. Every creditor has a postal address
  4. Every creditor has a creditor name
- If ANY creditor is missing ANY of those fields, auto-approval is blocked → route to `creditor_review`

### Transition Behavior
- No retroactive changes — only apply new logic to cases going forward
- Two paths after payment is paid:
  - **Path A (auto):** All creditors OK → `awaiting_client_confirmation` (skip `creditor_review`)
  - **Path B (review):** Any creditor needs review or missing info → `creditor_review` → agent approves → `awaiting_client_confirmation`

### Review Queue Routing
- Cases in `creditor_review` appear as regular items in existing agent portal queue — no special indicators or tags
- Agent portal already filters to show only creditors needing attention (needs_manual_review=true OR missing contact info)
- Agent explicitly clicks approve action to transition case to `awaiting_client_confirmation`
- Holistic review but scoped to creditors that need attention — agents don't review creditors that already have all information

### Claude's Discretion
- Order of checking the three contact fields (email, address, name)
- How to handle edge cases with empty `final_creditor_list`
- Logging/debugging output for status decisions

</decisions>

<specifics>
## Specific Ideas

- The three required contact fields are: email address, postal address, creditor name — these are non-negotiable for auto-approval
- Agent portal filtering for review-needing creditors already exists and should be leveraged as-is
- The approve action in agent portal already exists — this phase ensures cases actually land in `creditor_review` when they should

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-payment-status-logic*
*Context gathered: 2026-01-30*
