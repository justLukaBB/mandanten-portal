# Phase 24: Core Review Flow - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin can review creditors one-by-one in a split-pane workspace with document viewer on the left and correction form on the right. Admin can confirm, correct, or skip each creditor, then complete the review with a summary. Queue management, analytics, PDF.js rendering, and export are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Split-pane layout
- Default split ratio 60/40 (document viewer larger, correction form smaller)
- Panels are drag-resizable via ResizablePanelGroup divider
- Document viewer auto-selects the source document belonging to the current creditor
- Initial document viewer approach: Claude's discretion (Phase 26 upgrades to PDF.js later)

### Correction form design
- 9 editable fields, grouped by entity:
  - **Gläubiger section:** Gläubiger Name, Aktenzeichen, Gläubiger Adresse, Forderungsbetrag, Email Gläubiger
  - **Gläubigervertreter section:** Gläubigervertreter Name, Gläubigervertreter Adresse, AZ Gläubigervertreter, Email Gläubigervertreter
- AI-prefilled fields have color-coded borders (distinct from empty or user-edited fields)
- Address fields (Gläubiger Adresse, Gläubigervertreter Adresse) are single textarea, not split into street/PLZ/city

### Review actions & flow
- Fixed bottom action bar in the form panel (always visible, not below form fields)
- Three actions: Bestätigen (confirm), Korrigieren (correct), Überspringen (skip)
- "Korrigieren" auto-saves all form changes and advances to next creditor in one step
- Creditor navigation: Prev/Next arrows plus a creditor list/selector showing all creditors with their review status
- Skip reason: Predefined categories with a toggle to turn them off — when off, skip advances immediately without requiring a reason

### Summary & completion
- ReviewSummaryDialog shows action breakdown (X bestätigt, Y korrigiert, Z übersprungen) PLUS per-creditor detail list with the action taken
- Each creditor in the summary is clickable — takes admin back to that creditor to revise the decision
- No extra confirmation dialog — the summary dialog itself IS the confirmation step
- Clicking "Abschließen" in the summary calls POST /complete and auto-loads the next available review case from the queue
- Success toast shown when review is completed

### Claude's Discretion
- Document viewer implementation approach (fetch+Blob URL vs iframe — whatever works best before Phase 26 PDF.js upgrade)
- Color choice for AI-prefilled field borders
- Exact creditor list/selector component design (sidebar vs dropdown vs inline list)
- Loading and error states throughout the review flow
- Keyboard shortcuts for navigation and actions (if deemed useful)

</decisions>

<specifics>
## Specific Ideas

- Skip reason categories should be toggleable (a function/setting to turn category requirement on/off) — when off, skip just advances to next creditor immediately
- After completing a review, auto-load the next case from the queue rather than redirecting to the queue page
- Creditor list should show review status per creditor (confirmed/corrected/skipped/pending) so admin has overview of progress

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 24-core-review-flow*
*Context gathered: 2026-02-23*
