# Phase 26: Enhanced Viewer & Analytics - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

PDF.js document rendering with zoom/pan controls, analytics dashboard with 4 KPI cards and 4 Recharts charts, and a settings page for configuring confidence threshold and auto-assignment. Replaces existing iframe document viewer with PDF.js canvas.

</domain>

<decisions>
## Implementation Decisions

### PDF viewer controls
- Default to fit-to-width, with +/- buttons and a percentage dropdown (50%, 75%, 100%, 150%, 200%)
- Fixed top toolbar row above the PDF canvas — always visible
- Continuous vertical scroll for multi-page documents (all pages stacked)
- Toolbar includes Download and Print buttons
- Always reset to fit-to-width when opening a new document — no zoom persistence

### Analytics charts & KPIs
- 4 KPI cards: Total Reviews / Pending / Avg Processing Time / Auto-approved %
- Date range filtering via preset buttons: Last 7 days, 30 days, 90 days, All time
- 4 charts in a 2x2 grid layout, equal size
- Agent Performance Table columns: Agent name / Reviews handled / Avg time / Accuracy

### Settings page
- Confidence threshold: number input field (not slider)
- Auto-assignment: toggle control
- Just those two settings — no extras
- Auto-save on change with confirmation toast
- No help text/descriptions — minimal labels only

### Document viewer transition
- Loading state: centered spinner with loading percentage
- Fallback on PDF.js failure: silently fall back to iframe embed
- Enhanced viewer covers PDFs (via PDF.js) AND images (with zoom/pan)
- Non-PDF/non-image files stay as-is

### Claude's Discretion
- Spinner/progress implementation details
- Image viewer zoom/pan library choice
- Toast notification styling and duration
- Exact toolbar icon choices and spacing
- Chart color palette for Recharts

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

*Phase: 26-enhanced-viewer-analytics*
*Context gathered: 2026-02-23*
