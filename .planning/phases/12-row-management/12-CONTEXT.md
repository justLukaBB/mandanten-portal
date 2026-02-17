# Phase 12: Row Management - Context

**Gathered:** 2026-02-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin can add new creditor rows and delete existing creditor rows in the Gläubiger-Tabelle. Changes reflect immediately without page reload. Uses existing EditableCell infrastructure from Phase 11 for inline editing of new rows.

</domain>

<decisions>
## Implementation Decisions

### Add row behavior
- "Hinzufügen" button appends a new empty row at the bottom of the table
- New row is inline in the table using existing EditableCell components — no modal/dialog
- POST fires on first blur of any cell, as long as glaeubiger_name is filled
- POST includes all filled fields at once (not just the name)
- After initial POST, subsequent field edits on that row use the same PUT endpoint as Phase 11 existing rows
- Admin can add multiple new rows at once — "Hinzufügen" is not disabled while unsaved rows exist

### Delete confirmation
- Inline confirm — no modal dialog
- Row highlights red, delete button changes to "Bestätigen" / "Abbrechen"
- Confirm state persists until admin explicitly clicks Bestätigen or Abbrechen (no auto-cancel timeout)
- Delete icon appears only on row hover — cleaner look when not interacting
- Cells remain editable even while delete confirm is active

### Validation & required fields
- Only glaeubiger_name is required before a new creditor can be saved
- If admin blurs glaeubiger_name empty — nothing happens, no POST, no error shown (silent)
- POST triggers only when glaeubiger_name is non-empty on blur

### Visual states
- Unsaved new rows (before POST) have a subtle background tint (light blue or yellow) to signal "not yet saved"
- After successful POST — entire row briefly flashes green, then tint disappears and row becomes a normal row
- After successful DELETE — row disappears instantly (no fade/slide animation)
- Delete confirm state: row highlighted red with Bestätigen/Abbrechen buttons

### Claude's Discretion
- Exact tint color choice (blue vs yellow for unsaved rows)
- Delete confirm text content (just buttons vs name + buttons)
- "Hinzufügen" button placement and styling
- How to handle POST failure on new row (error state details)
- Green flash duration and animation style

</decisions>

<specifics>
## Specific Ideas

- Reuse EditableCell from Phase 11 — new rows should feel identical to editing existing rows
- POST fires with all filled fields, not just the name — fewer requests, better UX
- After POST returns the new creditor ID, the row transitions seamlessly to a "normal" row using PUT for further edits

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 12-row-management*
*Context gathered: 2026-02-17*
