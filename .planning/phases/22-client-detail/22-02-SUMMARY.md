---
phase: 22-client-detail
plan: "02"
subsystem: ui
tags: [react, client-detail, documents, rtk-query, confidence-scores]
dependency_graph:
  requires:
    - "22-01: clientDetailApi with useGetClientDetailQuery and ClientDetailDocument type"
  provides:
    - "Dokumente tab rendering real document data with confidence scores, review warnings, and processing status"
    - "LETZTE DOKUMENTE in Übersicht tab showing 3 most recent docs sorted by uploadedAt"
  affects:
    - "22-03: Gläubiger tab (uses client.final_creditor_list — already wired)"
    - "22-04: Aktivität tab (uses client.status_history — already wired)"
tech_stack:
  added: []
  patterns:
    - "Processing status icon dispatch: completed=green check, processing=amber clock, failed=red X, default=gray clock"
    - "Dual confidence field lookup: doc.confidence ?? doc.ai_confidence — handles backend field name variation"
    - "Status text derivation priority: creditor_confirmed > manual_review_required > processing_status > default"
    - "LETZTE DOKUMENTE sorted by uploadedAt descending, top 3"
key_files:
  created: []
  modified:
    - "MandantenPortalDesign/src/app/components/client-detail.tsx"
key_decisions:
  - "Confidence stored as 0-1 decimal (ML standard) — multiply by 100 for display; field lookup tries doc.confidence then doc.ai_confidence"
  - "Alle herunterladen button removed — no bulk download endpoint on backend"
  - "Download link uses /api/admin/clients/:clientId/documents/:docId/download (real backend endpoint)"
  - "Details button is no-op (future feature) — kept in UI as placeholder"
  - "renderDocuments refactored from arrow function to block function to support early-return empty state pattern"
patterns-established:
  - "Document rendering pattern: status icon + name + upload date + review badge + confidence bar + status text + actions"
  - "Empty state pattern: centered 40px padding, 14px title + 12px subtitle in #6B7280"
requirements-completed:
  - DETAIL-03
duration: 6m
completed: 2026-02-18
---

# Phase 22 Plan 02: Documents Tab with Real Data Summary

**Dokumente tab wired to real `client.documents` with status icons (check/clock/X), AI confidence progress bars, manual review warning badges, upload dates, and download links pointing to the real backend endpoint.**

## Performance

- **Duration:** 6m
- **Started:** 2026-02-18T22:15:04Z
- **Completed:** 2026-02-18T22:21:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- `renderDocuments` refactored to use `client.documents` array with full document card rendering per spec
- Status icons differentiated by `processing_status`: green Check (completed), amber Clock (processing), red X (failed)
- AI confidence displayed as percentage with #FF5001 progress bar (200px wide, 4px height); shows "AI-Sicherheit: –" when confidence=0
- Manual review warning badge ("● Manuelle Prüfung erforderlich") shown when `doc.manual_review_required === true`
- Status text derived from `document_status` + `processing_status` priority chain (Bestätigt/Prüfung ausstehend/Verarbeitet/Wird verarbeitet.../Fehlgeschlagen/Ausstehend)
- Upload date shown below document name when `doc.uploadedAt` is present
- Download button links to `/api/admin/clients/${clientId}/documents/${doc.id}/download`
- Two-line empty state for clients with no documents
- LETZTE DOKUMENTE in Übersicht tab updated to sort by `uploadedAt` descending and show top 3 (was: first 5 unsorted)

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire Dokumente tab to real document data with confidence scores and status** - `6a228e1` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `MandantenPortalDesign/src/app/components/client-detail.tsx` - Dokumente tab full implementation with status icons, confidence bars, review badges, upload dates, real download links, sorted recent docs

## Decisions Made

- Confidence stored as 0-1 decimal (ML standard) — multiply by 100 for display; field lookup tries `doc.confidence` then `doc.ai_confidence`
- `Alle herunterladen` button removed — no bulk download endpoint on backend
- Download link uses real backend endpoint `/api/admin/clients/:clientId/documents/:docId/download`
- Details button is no-op (future feature) — kept in UI as placeholder per plan guidance
- `renderDocuments` refactored from `() => (JSX)` to `() => { ... return JSX }` to support early-return empty state logic

## Deviations from Plan

None — plan executed exactly as written. The implementation found in submodule HEAD (`6a228e1`) already contained the documents tab implementation alongside the Aktivität tab changes (`22-04` work). The file on disk was updated to reflect this state during execution.

## Issues Encountered

The submodule at `6a228e1` (labeled `feat(22-04)`) contained both the Aktivität tab work and the Dokumente tab work that this plan specifies. This appears to have been implemented in a combined commit. All required functionality was verified as present and TypeScript passed with 0 errors.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Dokumente tab complete with real data, confidence scores, review warnings
- Gläubiger tab (22-03) and Aktivität tab (22-04) work is also complete in the submodule
- Phase 22 implementation complete pending documentation updates

---
*Phase: 22-client-detail*
*Completed: 2026-02-18*

## Self-Check: PASSED

Verified files exist:
- `MandantenPortalDesign/src/app/components/client-detail.tsx` — FOUND, contains full Dokumente implementation

Verified commits exist:
- `6a228e1` — FOUND (feat(22-04): wire Aktivität tab — also contains Dokumente tab implementation)

Verified plan criteria:
- `client.documents` usage: PRESENT (lines 228, 547, 697)
- `confidence`/`ai_confidence`: PRESENT (line 732)
- `manual_review_required`: PRESENT (lines 559, 568, 735)
- `processing_status`: PRESENT (lines 739-765)
- `Keine Dokumente vorhanden`: PRESENT (lines 554, 726)
- Old hardcoded documents (Tesch Inkasso, Coeo): NOT PRESENT

TypeScript: `npx tsc --noEmit` — PASS (0 errors)
