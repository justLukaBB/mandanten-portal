# Phase 23: Review Foundation - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Review Queue page with real data from existing agent-review endpoints, accessible via admin token. Includes sidebar nav item, routing, auth middleware change, RTK Query reviewApi slice, and ReviewQueuePage with KPI cards, table, and filters.

Queue management (assignments, batch ops) is Phase 25. Review workspace is Phase 24.

</domain>

<decisions>
## Implementation Decisions

### Queue Table Columns
- Avatar + Name: reuse GradientAvatar component from client list (colored circle with initials next to name)
- Gläubiger count: show review count only ("3 prüfen"), not x/y format — total is less relevant in queue context
- Confidence: colored pill badge with % — red (<50%), yellow (50-80%), green (>80%) — matches existing doc confidence pattern from Phase 22
- No "Zugewiesen an" column in Phase 23 — add in Phase 25 when assignment feature lands (avoids premature column)

### KPI Card Content
- 3 metrics: Offen (total open), Hohe Priorität (high priority count), Ø Alter (avg days since payment)
- Values use animated useCountUp hook from motion-utils — numbers count up from 0 on page load
- Show static comparison vs yesterday as subtitle text ("vs gestern: +3")
- KPI card styling: kpiStaggerContainer + kpiCardVariants from motion-utils

### Claude's Discretion
- KPI computation: client-side from queue response data, or via backend — Claude picks based on what available-clients endpoint returns
- Admin reviewer identity: Claude picks fallback chain based on what controller actually does with agentId

### Controller Fallback for Admin
- Auth middleware: simple swap authenticateAgent → authenticateAdminOrAgent PLUS add req.reviewerType = 'admin' | 'agent' for audit trail
- Username fallback: req.agentUsername || 'Admin' for display purposes
- Trust existing authenticateAdminOrAgent middleware — no pre-verification needed, just swap and test

### Queue Sort & Defaults
- Default sort: oldest first (days_since_payment descending) — longest-waiting cases at top
- Default page size: 25 (match existing client list for consistent UX)
- Search debounce: 300ms after typing stops before sending request
- All filter/sort/page state in URL params via useSearchParams — bookmarkable, browser back works (same pattern as client list)

</decisions>

<specifics>
## Specific Ideas

- Priority badge styling follows plan spec: high (red #991B1B / #FEF2F2), medium (yellow #92400E / #FFFBEB), low (green #166534 / #F0FDF4) — outlined+tinted pills
- Table row hover: bg-black/[0.02] (from plan)
- Loading state: skeleton rows (pattern from client list)
- Click row → navigate to /review/:clientId
- setParam helper should omit defaults from URL (page=1, limit=25, priority=all) for clean URLs

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 23-review-foundation*
*Context gathered: 2026-02-23*
