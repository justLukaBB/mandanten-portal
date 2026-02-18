# Phase 20: Authentication - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin login/logout with session persistence and route protection. Admins can log in with email and password via POST /api/admin/login, stay authenticated across reloads via localStorage token, and are redirected to /login when not authenticated. The backend auth endpoint already exists — this phase is frontend-only.

</domain>

<decisions>
## Implementation Decisions

### Login page design
- Centered card layout on a minimal background — standard SaaS login
- No logo, no title — minimal and functional, just the form
- Include a "Passwort vergessen?" link (placeholder action is fine if backend doesn't support it yet)
- All UI text in German: "E-Mail", "Passwort", "Anmelden"

### Session behavior
- Token expires after 8 hours — admin must re-login roughly once per work day
- Expiry is tracked on the frontend (store login timestamp, check on each API call or app load)
- On expired session mid-use: show "Sitzung abgelaufen" toast, then redirect to /login
- After re-login: always land on /clients (no return-to-previous-page logic)

### Auth error experience
- Specific error messages: "Passwort falsch" or "E-Mail nicht gefunden" — reveals which field is wrong (acceptable for internal admin tool)
- Error displayed inline below the form fields, within the login card
- Network/server errors show distinct message: "Server nicht erreichbar" — differentiated from auth errors so admin knows it's not their fault
- Frontend cooldown: disable login button for 5 seconds after 3 failed attempts — lightweight rate limiting, no backend changes needed

### Redirect & logout flow
- Dedicated /login route — root (/) redirects to /clients or /login based on auth state
- After successful login: always redirect to /clients (the main working view)
- Logout button at the bottom of the sidebar navigation
- No logout confirmation — click logout, immediately clear token and redirect to /login
- Protected route wrapper: any navigation to /clients or /clients/:id without valid token redirects to /login

### Claude's Discretion
- Login card exact dimensions, padding, and shadow styling
- Input field styling (use existing shadcn/ui form components)
- Toast component choice and positioning for session expiry
- "Passwort vergessen?" link behavior (placeholder toast or disabled state)
- Loading state on the login button during API call

</decisions>

<specifics>
## Specific Ideas

- Login page should feel clean and no-nonsense — it's an internal admin tool, not a consumer product
- The sidebar logout button should be unobtrusive but findable — no need for an elaborate user menu

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 20-authentication*
*Context gathered: 2026-02-18*
