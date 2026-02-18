# Phase 21: Client List - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Admins see a paginated list of real clients from the backend, with working search, status filter, flow filter, and correctly rendered status and flow badges. The prototype design (MandantenPortalDesign/) already has the visual layout — this phase wires it to real data from GET /api/admin/clients.

</domain>

<decisions>
## Implementation Decisions

### Search behavior
- Live debounced search (~300ms) — results update as admin types
- Search and filters are independent — clearing search keeps filters intact
- Search query and all filters are synced to URL params (?search=müller&status=active) — bookmarkable, survives page reload
- No-results state shows helpful hints like "Versuchen Sie, Filter zu entfernen" or "Suchbegriff anpassen"

### Filter & pagination UX
- Filters are combinable — status + flow + search all work simultaneously
- Page size is configurable via dropdown (25/50/100)
- Changing any filter or search resets pagination to page 1
- Active filters shown as removable chips above the table: [Status: Erstellt ✕] [Flow: Portal zugesendet ✕]
- Zero-results state includes a "Filter zurücksetzen" button that clears all filters at once

### Badge mapping
- Show all 10 real backend workflow states as badge labels — NOT grouped into 5 abstract categories
- German labels for all states (Erstellt, Portal-Zugang gesendet, Dokumente hochgeladen, Dokumente werden verarbeitet, Wartet auf Zahlung, Zahlung bestätigt, Gläubiger-Prüfung, Wartet auf Client-Bestätigung, Gläubiger-Kontakt aktiv, Abgeschlossen)
- Flow badges (Portal zugesendet, 1. Anschreiben, 2. Anschreiben, Insolvenzantrag) are derived/mapped from the workflow_status — backend has no separate flow field
- Unknown or unexpected status values → gray fallback badge showing the raw value

### Loading & refresh behavior
- Auto-reload: poll every 30 seconds, silently re-fetching the current page in the background
- API errors show a toast notification — table stays in its last known state
- "Filter zurücksetzen" button on zero-results state

### Claude's Discretion
- Loading state pattern (skeleton rows vs spinner) during initial load
- Exact color assignments for the 10 workflow state badges
- Flow badge derivation mapping (which workflow states map to which flow stages)
- Toast notification styling and duration

</decisions>

<specifics>
## Specific Ideas

- Existing admin (src/admin/pages/UserList.tsx) already has the 10-state German label mapping and color mapping — reuse those labels
- Prototype badge components (status-badge.tsx, flow-badge.tsx) in MandantenPortalDesign/ have the visual design — adapt to handle real states
- Backend pagination response already provides { total, page, limit, totalPages } — wire directly to pagination controls

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 21-client-list*
*Context gathered: 2026-02-18*
