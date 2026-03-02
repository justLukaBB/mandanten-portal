---
phase: 29-trigger-scheduler-client-notification
plan: "01"
subsystem: backend-services
tags: [second-letter, trigger, email, state-machine, idempotency]
dependency_graph:
  requires: [28-state-machine-foundation]
  provides: [secondLetterTriggerService, sendSecondLetterNotification]
  affects: [server/scheduler.js, server/server.js, second-letter admin route]
tech_stack:
  added: []
  patterns: [atomic-findOneAndUpdate-status-guard, dependency-injection-class, resend-dev-mode-fallback, status-history-audit-log]
key_files:
  created:
    - server/services/secondLetterTriggerService.js
  modified:
    - server/services/emailService.js
decisions:
  - "SecondLetterTriggerService exported as CLASS (not singleton) so server.js injects emailService dependency — consistent with Scheduler pattern"
  - "Two-step 30-day eligibility: DB $elemMatch pre-filter + JS MAX(email_sent_at) — avoids complex aggregation pipeline per research Pitfall 1"
  - "Sequential for-loop in checkAndTriggerEligible (not Promise.all) to avoid Resend rate limit bursts during batch runs"
  - "PORTAL_BASE_URL env var with fallback to 'https://mandanten-portal.onrender.com' — no hardcoded URL"
metrics:
  duration: "1m45s"
  completed: "2026-03-02"
  tasks_completed: 2
  files_created: 1
  files_modified: 1
---

# Phase 29 Plan 01: Trigger Service & Client Notification Email Summary

**One-liner:** Atomic IDLE→PENDING trigger service with uuidv4 token generation, 30-day eligibility batch check, and Resend email notification with formal German "Daten bestätigen" CTA.

## What Was Built

### Task 1: `server/services/secondLetterTriggerService.js` (NEW)

Class-based service with two public methods:

**`triggerForClient(clientId, actor = 'system')`**
- Atomic `findOneAndUpdate` with `{ id: clientId, second_letter_status: 'IDLE' }` filter — state guard as the first and only write operation
- On success: sets `second_letter_status: 'PENDING'`, `second_letter_triggered_at`, `second_letter_form_token` (uuidv4), `second_letter_form_token_expires_at` (14 days)
- Pushes `status_history` audit entry with `changed_by: 'system'|'admin'`, `reason: 'auto_30_day_trigger'|'admin_manual_trigger'`
- If `findOneAndUpdate` returns `null` (idempotency guard fired): fetches current status, returns `{ success: false, alreadyTriggered: true, currentStatus }`
- On success: builds portal deep-link with token, calls `emailService.sendSecondLetterNotification()`
- Returns `{ success: true, clientId, aktenzeichen, emailSent, emailId }`

**`checkAndTriggerEligible()`**
- Calculates `thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)`
- Step 1 — DB query: IDLE clients with at least one creditor having `email_sent_at` set (`$elemMatch`)
- Step 2 — JS filter: only clients where `MAX(email_sent_at) <= thirtyDaysAgo`
- Sequential iteration via `for...of` loop (not `Promise.all`) — rate limit safety
- Per-client error catching: logs error, continues batch, increments `errors` counter
- Returns `{ triggered, skipped, errors, total }`

**Export:** `module.exports = SecondLetterTriggerService` — CLASS, not singleton

### Task 2: `server/services/emailService.js` (MODIFIED — additions only)

Three new methods added to the `EmailService` class:

**`generateSecondLetterNotificationHtml(clientName, portalUrl, aktenzeichen)`**
- Full HTML email template matching existing `generateDocumentRequestEmailHtml` structure
- Logo: `https://www.schuldnerberatung-anwalt.de/wp-content/uploads/2024/10/Logo-T-Scuric.png`
- Formal "Sie"-Ansprache: "Sehr geehrte/r ${clientName}"
- Three body paragraphs: context (1. Gläubigeranschreiben sent), action needed (confirm data), outcome (letters sent to creditors)
- CTA Button: "Daten bestätigen" — `background-color: #111827`, `border-radius: 8px`, `padding: 14px 28px`
- Footer: Aktenzeichen reference, Impressum + Datenschutz links

**`generateSecondLetterNotificationText(clientName, portalUrl, aktenzeichen)`**
- Plain-text fallback with same content structure
- Portal URL on its own line for easy copy-paste

**`sendSecondLetterNotification(email, clientName, portalUrl, aktenzeichen)`**
- Subject: `'Bitte bestätigen Sie Ihre Daten für das 2. Anschreiben'` (locked decision)
- Dev mode guard: if `!this.resend` → logs to console with `📧 SECOND LETTER NOTIFICATION (DEV MODE)`, returns `{ success: true, devMode: true }`
- Resend send: `response.data?.id || response.id` for SDK v6.x compatibility
- Error catch: logs error, returns `{ success: false, error: error.message }`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `84aff08` | feat(29-01): add SecondLetterTriggerService |
| 2 | `d4a9db7` | feat(29-01): add sendSecondLetterNotification() to emailService.js |

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

- [x] `secondLetterTriggerService.js` exists and exports `SecondLetterTriggerService` class
- [x] `triggerForClient()` uses `findOneAndUpdate` with `{ second_letter_status: 'IDLE' }` filter
- [x] `checkAndTriggerEligible()` queries 30-day-eligible IDLE clients and triggers each
- [x] `sendSecondLetterNotification()` exists with Resend send + dev mode fallback
- [x] Email HTML contains "Daten bestätigen" CTA button and formal German copy
- [x] No existing `emailService.js` methods were modified

## Next Steps (Plan 02)

Plan 02 wires the two entry points to this service:
1. Extend `server/scheduler.js` with a `setInterval` daily check calling `checkAndTriggerEligible()`
2. Create admin route `POST /api/admin/clients/:clientId/trigger-second-letter`
3. Mount `SecondLetterTriggerService` in `server.js` with `emailService` injected

## Self-Check: PASSED

Files verified:
- `server/services/secondLetterTriggerService.js` — EXISTS
- `server/services/emailService.js` — MODIFIED (additions only confirmed)

Commits verified:
- `84aff08` — feat(29-01): add SecondLetterTriggerService
- `d4a9db7` — feat(29-01): add sendSecondLetterNotification() to emailService.js
