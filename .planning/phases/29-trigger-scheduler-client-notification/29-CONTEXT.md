# Phase 29: Trigger, Scheduler & Client Notification - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin can manually trigger the 2. Anschreiben workflow and the scheduler auto-triggers after 30 days — both paths are idempotent and notify the client via Resend email. The client receives a deep-link to the portal form (Phase 30). Creating the form itself, calculations, and document generation are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Admin Trigger UX
- Button placed on client detail page — action targets a single client at a time
- Confirmation dialog before triggering: "2. Anschreiben für [Client-Name] starten? Der Client wird per Email benachrichtigt."
- After successful trigger: Toast notification + immediate status badge update (IDLE → PENDING)
- Idempotency visible: if client is already PENDING, button is disabled with tooltip "Bereits ausgelöst"
- No bulk trigger — scheduler handles automatic mass processing, admin trigger is for individual overrides

### Email Design & Content
- Formal "Sie"-Ansprache — consistent with the legal/financial context of Schuldnerberatung
- Reuse existing Resend email template (same layout, logo, footer as onboarding emails)
- Email explains context: warum Datenbestätigung nötig ist (2. Gläubigeranschreiben), was der Client tun soll, was danach passiert
- CTA-Button: "Daten bestätigen" — clear action-oriented label
- Subject line: "Bitte bestätigen Sie Ihre Daten für das 2. Anschreiben"

### Claude's Discretion
- Scheduler implementation details (cron timing, batch processing approach)
- Token generation and expiry duration for deep-links
- Exact email body copy (within the decided tone and content guidelines)
- Error state handling in admin UI (network failures, server errors)
- Audit log storage format and data structure
- Toast notification duration and styling

</decisions>

<specifics>
## Specific Ideas

- Admin trigger button should feel like a deliberate action — confirmation dialog prevents accidental triggers
- Email should give the client confidence that this is a legitimate next step in their process, not spam
- Status badge transition should be immediately visible without page reload

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 29-trigger-scheduler-client-notification*
*Context gathered: 2026-03-02*
