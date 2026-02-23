---
phase: 24-core-review-flow
plan: 01
subsystem: ui
tags: [react, redux, rtk-query, typescript, resizable-panels, blob-url]

# Dependency graph
requires:
  - phase: 23-review-foundation
    provides: reviewApi skeleton (getReviewQueue), ReviewQueuePage, auth wiring, sidebar nav, /review routes

provides:
  - ReviewWorkspacePage with ResizablePanelGroup 60/40 split, header, creditor navigation
  - EnhancedDocumentViewer using fetch+Blob URL with Bearer auth
  - reviewApi extended with getReviewData, saveReviewCorrection, completeReview RTK Query endpoints
  - reviewUiSlice tracking currentCreditorIndex, per-creditor actions, skipReasonsEnabled
  - Full TypeScript types for review data structures (ReviewDataResponse, ReviewCreditorWithDocs, etc.)
  - Store registered with reviewUi reducer

affects:
  - 24-02 (correction form reads reviewApi hooks and reviewUiSlice actions)
  - 24-03 (summary dialog uses completeReview mutation and reviewUiSlice state)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - RTK Query injectEndpoints pattern extended on existing reviewApi file
    - fetch+Blob URL pattern for document streaming with Bearer auth
    - Redux slice with selector exports for cross-component state

key-files:
  created:
    - MandantenPortalDesign/src/store/slices/reviewUiSlice.ts
    - MandantenPortalDesign/src/app/components/enhanced-document-viewer.tsx
    - MandantenPortalDesign/src/app/components/review-workspace-page.tsx
  modified:
    - MandantenPortalDesign/src/app/types.ts
    - MandantenPortalDesign/src/store/api/baseApi.ts
    - MandantenPortalDesign/src/store/api/reviewApi.ts
    - MandantenPortalDesign/src/store/index.ts
    - MandantenPortalDesign/src/app/App.tsx

key-decisions:
  - "fetch+Blob URL approach for document viewer (Phase 26 upgrades to PDF.js)"
  - "currentDoc identifier uses doc.id first, then doc.name, then doc.filename for document endpoint"
  - "Creditor list renders needing_review_with_docs if non-empty, else all with_documents"
  - "ReviewUiSlice resetReviewState dispatched on clientId change to prevent stale index"

patterns-established:
  - "Document viewer: fetch /api/agent-review/:clientId/document/:fileIdOrName, createObjectURL, revoke on unmount"
  - "ResizablePanelGroup 60/40 default with ResizableHandle withHandle"

requirements-completed: [FLOW-01]

# Metrics
duration: 4min
completed: 2026-02-23
---

# Phase 24 Plan 01: Core Review Flow - Data Layer & Layout Summary

**Split-pane review workspace with RTK Query data layer, fetch+Blob document viewer, Redux UI slice, and ResizablePanelGroup 60/40 layout wired to real backend endpoints**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-23T17:16:49Z
- **Completed:** 2026-02-23T17:20:38Z
- **Tasks:** 2
- **Files modified:** 8 (5 modified, 3 created)

## Accomplishments

- Review data layer complete: ReviewDataResponse, SaveCorrectionPayload, CompleteReviewResponse types match backend shapes; reviewApi extended with 3 RTK Query endpoints
- reviewUiSlice created tracking currentCreditorIndex, per-creditor actions, and skipReasonsEnabled toggle; registered in store
- ReviewWorkspacePage renders ResizablePanelGroup 60/40 with header (back button, client name, Aktenzeichen badge, prev/next navigation, circular progress), left panel with EnhancedDocumentViewer, right panel with creditor list and review reasons
- EnhancedDocumentViewer fetches documents via fetch+Blob URL with Bearer auth from localStorage, handles loading/error/empty states with cleanup on unmount
- App.tsx placeholder function removed, real imported ReviewWorkspacePage component wired to /review/:clientId route

## Task Commits

Each task was committed atomically (in MandantenPortalDesign submodule):

1. **Task 1: Review types + RTK Query endpoints + reviewUiSlice** - `346725b` (feat)
2. **Task 2: ReviewWorkspacePage + EnhancedDocumentViewer + App wiring** - `db697ac` (feat)

**Plan metadata:** committed in final docs commit

## Files Created/Modified

- `MandantenPortalDesign/src/app/types.ts` - Added ReviewAction, ReviewCreditorWithDocs, ReviewClientInfo, ReviewDataResponse, SaveCorrectionPayload, SaveCorrectionResponse, CompleteReviewResponse
- `MandantenPortalDesign/src/store/api/baseApi.ts` - Added ReviewData to tagTypes array
- `MandantenPortalDesign/src/store/api/reviewApi.ts` - Extended with getReviewData, saveReviewCorrection, completeReview endpoints; exports 4 hooks
- `MandantenPortalDesign/src/store/slices/reviewUiSlice.ts` (NEW) - Redux slice for review UI state with selectors
- `MandantenPortalDesign/src/store/index.ts` - Registered reviewUi reducer
- `MandantenPortalDesign/src/app/components/enhanced-document-viewer.tsx` (NEW) - Fetch+Blob document viewer (210 lines)
- `MandantenPortalDesign/src/app/components/review-workspace-page.tsx` (NEW) - Full split-pane workspace (545 lines)
- `MandantenPortalDesign/src/app/App.tsx` - Replaced placeholder function with import from review-workspace-page

## Decisions Made

- Used `doc.id || doc.name || doc.filename` priority order for document identifier passed to the streaming endpoint — the backend uses flexible matching so ID is most reliable, name as fallback
- Creditor navigation shows `needing_review_with_docs` list if non-empty, falls back to `with_documents` to handle summary-phase reviews where all creditors are already reviewed
- `resetReviewState` dispatched on `clientId` change to prevent stale `currentCreditorIndex` across navigations
- fetch+Blob URL approach chosen per CONTEXT.md direction (Phase 26 upgrades to PDF.js)
- Included inline creditor list in right panel placeholder to make workspace immediately useful even before Plan 02 correction form is built

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Data layer and layout complete; Plan 02 can immediately build the correction form by importing `useGetReviewDataQuery`, `useSaveReviewCorrectionMutation`, `useAppDispatch`, and `selectCurrentCreditorIndex`
- Right panel placeholder in ReviewWorkspacePage has a clearly marked comment `{/* CreditorSelector + ReviewCorrectionForm + ReviewActionBar will go here in Plan 02 */}` for easy replacement
- reviewUiSlice `recordReviewAction` reducer ready for Plan 02 to dispatch correction/confirmation/skip actions

---
*Phase: 24-core-review-flow*
*Completed: 2026-02-23*
