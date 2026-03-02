---
phase: 34-admin-ui-tracking
plan: 03
subsystem: ui
tags: [typescript, react, reactflow, second-letter, tracking-canvas, client-list]

# Dependency graph
requires:
  - phase: 34-admin-ui-tracking
    plan: 01
    provides: second_letter_* fields on ClientDetailCreditor and AdminClient TypeScript types
provides:
  - SecondLetterNode ReactFlow component with sent/not-sent visual states
  - TrackingCanvas 3rd column rendering SecondLetterNode per creditor
  - secondLetterStatus column in Client List with pill badge rendering
affects:
  - Admin tracking view now shows 3-column flow: EmailNode → ResponseNode → SecondLetterNode

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ReactFlow memo node component pattern — mirrors EmailNode/ResponseNode structure"
    - "Viewport clamping with horizontal range: Math.min/max on both x and y axes"
    - "Outlined+tinted pill badge with hex color + opacity suffix: {color}40 border, {color}10 bg"

key-files:
  created:
    - MandantenPortalDesign/src/app/components/tracking/nodes/SecondLetterNode.tsx
  modified:
    - MandantenPortalDesign/src/app/components/tracking/TrackingCanvas.tsx
    - MandantenPortalDesign/src/app/components/table-columns-config.tsx
    - MandantenPortalDesign/src/app/components/client-list.tsx

key-decisions:
  - "SecondLetterNode uses dashed border + #FAFAFA bg for not-sent state to visually distinguish from sent state (solid border + #FFFFFF bg)"
  - "Horizontal x-clamp uses minX = -(3 * COL_WIDTH * v.zoom) — generous bound that covers all 3 columns at any zoom level"
  - "secondLetterStatus column renders as plain dash (–) for IDLE — no badge when no action has been taken"

patterns-established:
  - "3rd column pattern established: creditor.id maps to second-{id} in creditorById — clicking SecondLetterNode opens CreditorDetailPanel via existing else-branch"

requirements-completed: [UI-02, UI-03]

# Metrics
duration: 3min
completed: 2026-03-02
---

# Phase 34 Plan 03: SecondLetterNode + TrackingCanvas 3rd Column + Client List Badge Summary

**New SecondLetterNode component with sent/not-sent states, 3rd column in TrackingCanvas at START_X + 2*COL_WIDTH with relaxed horizontal scroll, and optional secondLetterStatus column in Client List with German labels as outlined pill badges**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-02T22:32:31Z
- **Completed:** 2026-03-02T22:35:33Z
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- Created SecondLetterNode.tsx with two visual states: sent (solid border, green badge "Gesendet · DD.MM.YYYY") and not-sent (dashed border, gray badge "Nicht versendet")
- Extended TrackingCanvas.tsx: registered secondLetterNode type, added 3rd column in buildFlowElements, added second-* entries to creditorById map, relaxed x-lock to allow horizontal panning
- Added secondLetterStatus to ColumnId union, COLUMN_DEFINITIONS, getColumnValue, getColumnColor, getSortValue in table-columns-config.tsx
- Updated client-list.tsx to render secondLetterStatus column as outlined+tinted pill badge when status color is returned

## Task Commits

Each task was committed atomically:

1. **Task 1: SecondLetterNode + TrackingCanvas 3rd column** - `0804a63` (feat) — submodule; `afd82b4` — parent repo
2. **Task 2: secondLetterStatus column in Client List** - `634c2fd` (feat) — submodule; `7410eaf` — parent repo

## Files Created/Modified
- `MandantenPortalDesign/src/app/components/tracking/nodes/SecondLetterNode.tsx` - Created: memo-wrapped ReactFlow node with sent/not-sent variant, Handle target on left, DM Sans, formatDate for sent timestamp
- `MandantenPortalDesign/src/app/components/tracking/TrackingCanvas.tsx` - SecondLetterNode import + nodeTypes registration, 3rd column in buildFlowElements, second-* in creditorById map, relaxed x-clamp in onViewportChange
- `MandantenPortalDesign/src/app/components/table-columns-config.tsx` - secondLetterStatus in ColumnId type, COLUMN_DEFINITIONS entry, getColumnValue labels, getColumnColor colors, getSortValue numeric order
- `MandantenPortalDesign/src/app/components/client-list.tsx` - Pill badge rendering for secondLetterStatus column when getColumnColor returns a color

## Decisions Made
- SecondLetterNode dashed border for not-sent state — consistent with ResponseNode "waiting"/"not_contacted" dashed border pattern
- x-clamp uses `minX = -(3 * COL_WIDTH * v.zoom)` — allows full horizontal panning to show all 3 columns at any zoom level
- secondLetterStatus column renders plain dash for IDLE — no badge needed when no second letter workflow has started

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED
- `MandantenPortalDesign/src/app/components/tracking/nodes/SecondLetterNode.tsx` — FOUND
- `0804a63` — FOUND (git log confirms)
- `634c2fd` — FOUND (git log confirms)
- TypeScript: PASS (npx tsc --noEmit clean)
- secondLetterNode count in TrackingCanvas: 2 (>= 2 required)
- secondLetterStatus count in table-columns-config: 5 (>= 3 required)

---
*Phase: 34-admin-ui-tracking*
*Completed: 2026-03-02*
