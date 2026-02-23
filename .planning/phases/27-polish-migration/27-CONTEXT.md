# Phase 27: Polish & Migration - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Export review queue data, add real-time queue updates with sidebar badge, and redirect old portal agent routes to the new admin portal. This phase polishes the review system and begins deprecating the old portal.

</domain>

<decisions>
## Implementation Decisions

### Export behavior
- Export includes all visible columns from the review queue table (not hidden/internal fields)
- Export always exports the full queue regardless of active filters or sorting
- Default format is CSV — single button click triggers CSV download
- Export button placed top-right of the queue table, near existing action buttons
- XLSX support also available (dropdown or secondary option — Claude's discretion on exact UI)

### Real-time updates & badge
- Queue auto-refreshes every 30 seconds
- New cases that appear after refresh are briefly highlighted (animation/color that fades after a few seconds)
- Sidebar badge shows total pending (unreviewed) case count
- Badge is always a live count of pending cases, not "new since last visit"

### Redirect & deprecation
- All /agent/* routes in the old portal redirect to the new admin portal (not just /agent/review)
- Redirect shows a brief notice: "This page has moved to the new admin portal. Redirecting..." then auto-redirects after 3-5 seconds
- Message tone is simple and minimal — no detailed migration explanation
- Redirect checks authentication first — only redirect if user has valid session, otherwise show login prompt

### Claude's Discretion
- XLSX button/dropdown exact UI treatment (split button, dropdown, or separate button)
- Mid-review refresh handling (pause vs background refresh while case detail is open)
- Badge visibility scope (whether badge shows when already on review page)
- Exact highlight animation style and duration for new cases
- Redirect timer duration (3-5 second range)
- Mapping of specific /agent/* routes to their new admin portal equivalents

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 27-polish-migration*
*Context gathered: 2026-02-23*
