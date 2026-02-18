---
phase: 22-client-detail
plan: "04"
subsystem: ui
tags: [react, status-history, activity-log, german-locale, timeline]

requires:
  - phase: "22-01"
    provides: "ClientDetail fetching real API data with client.status_history array"
provides:
  - "Aktivität tab rendering real status_history events sorted newest-first with German labels"
  - "STATUS_EVENT_LABELS map for 18 known workflow status values"
  - "ACTOR_LABELS map (System/Agent/Mandant/Admin)"
  - "formatActivityDateTime with Heute/Gestern relative day formatting"
  - "Color-coded timeline dots by changed_by actor type"
affects:
  - "Any future phase reading activity history UI"

tech-stack:
  added: []
  patterns:
    - "useMemo for memoized sort of status_history array"
    - "Graceful fallback: STATUS_EVENT_LABELS[status] || status for unknown status values"
    - "Color-coded actor dots: admin=blue, system=gray, client=green, agent=purple"

key-files:
  created: []
  modified:
    - "MandantenPortalDesign/src/app/components/client-detail.tsx"

key-decisions:
  - "formatActivityDateTime is a separate function from formatGermanDateTime to preserve existing profile tab formatting (with Uhr suffix) while adding Heute/Gestern logic for activity events"
  - "sortedHistory moved to useMemo at component scope (not inside renderActivity) to enable reuse across potential future features"
  - "Empty state has two-line message: headline + explanatory sub-text (consistent with richer UX pattern)"

requirements-completed:
  - "DETAIL-05"

duration: 2min
completed: 2026-02-18
---

# Phase 22 Plan 04: Aktivität Tab — Real Status History Summary

**Activity log wired to real client.status_history with STATUS_EVENT_LABELS for 18 workflow events, ACTOR_LABELS for German actor names, color-coded timeline dots, and Heute/Gestern-aware timestamps.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-18T22:15:07Z
- **Completed:** 2026-02-18T22:17:03Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Aktivität tab now reads real `client.status_history` sorted newest-first via `useMemo`
- 18 workflow status values mapped to German labels via `STATUS_EVENT_LABELS`
- Actor field displays German labels (System, Agent, Mandant, Admin) via `ACTOR_LABELS`
- Timeline dots are color-coded by `changed_by` — admin=blue, system=gray, client=green, agent=purple
- Zendesk ticket IDs appear inline where present (`· Ticket #12345`)
- `formatActivityDateTime` shows "Heute, HH:MM" / "Gestern, HH:MM" for recent events, full German date for older
- Empty state shows structured two-line message instead of plain text
- Unknown status values fall through gracefully to raw string

## Task Commits

1. **Task 1: Wire Aktivität tab to real status_history events with German labels** - `6a228e1` (feat)

## Files Created/Modified
- `MandantenPortalDesign/src/app/components/client-detail.tsx` - Added STATUS_EVENT_LABELS, ACTOR_LABELS, formatActivityDateTime; upgraded renderActivity with full German labels, color dots, actor display, Zendesk ticket IDs, and Heute/Gestern timestamps

## Decisions Made
- `formatActivityDateTime` is a new separate function from the existing `formatGermanDateTime` — the existing one adds " Uhr" suffix and is used in the Profil tab; breaking it would change profile display. A separate function for the activity timeline is cleaner and purpose-specific.
- `sortedHistory` computed at component scope via `useMemo([c?.status_history])` rather than inside `renderActivity` — makes it available to the rest of the component if needed and avoids recomputing on every render.
- Empty state is shown by early return within `renderActivity` with a structured two-line message (matching the documents tab pattern from plan 22-02).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All four ClientDetail tabs (Übersicht, Profil, Dokumente, Gläubiger, Aktivität) now use real backend data
- Phase 22 is complete — all plans executed

---
*Phase: 22-client-detail*
*Completed: 2026-02-18*

## Self-Check: PASSED

- `MandantenPortalDesign/src/app/components/client-detail.tsx` — FOUND
- `.planning/phases/22-client-detail/22-04-SUMMARY.md` — FOUND
- Commit `6a228e1` — FOUND in submodule git log
- TypeScript `npx tsc --noEmit` — exit code 0 (PASSED)
