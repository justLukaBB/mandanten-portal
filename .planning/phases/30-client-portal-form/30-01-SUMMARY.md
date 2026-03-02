---
phase: 30-client-portal-form
plan: "01"
subsystem: backend-api
tags: [second-letter, auth-middleware, client-portal, snapshot-write, status-machine]
dependency_graph:
  requires: [29-02]
  provides: [GET /api/second-letter-form, POST /api/second-letter-form, authenticateSecondLetterToken]
  affects: [server/middleware/auth.js, server/controllers/clientPortalController.js, server/routes/client-portal.js]
tech_stack:
  added: []
  patterns: [DB-lookup token validation, safeClientUpdate atomic write, status guard before data write]
key_files:
  created: []
  modified:
    - server/middleware/auth.js
    - server/controllers/clientPortalController.js
    - server/routes/client-portal.js
decisions:
  - "UUID token lookup: authenticateSecondLetterToken validates by DB lookup (second_letter_form_token field) + expiry check, not jwt.verify() — matches Phase 29 which uses uuidv4() not JWT signing"
  - "Snapshot field names match Client.js schema: has_garnishment (not active_garnishments), snapshot_created_at (not submitted_at)"
  - "Status guard is first operation in POST handler before any data reads or writes — returns 409 with NOT_PENDING code"
  - "safeClientUpdate used for all writes — never client.save() directly"
metrics:
  duration: ~2m
  completed: 2026-03-02
  tasks_completed: 2
  files_modified: 3
---

# Phase 30 Plan 01: Second Letter Form Backend API Summary

Backend API for the 2. Anschreiben client portal form: UUID-based token auth middleware, GET pre-fill endpoint, and POST snapshot+status-transition endpoint with PENDING guard.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add authenticateSecondLetterToken middleware | dfb0037 | server/middleware/auth.js |
| 2 | Add GET/POST second-letter-form controller + routes | 9124abe | server/controllers/clientPortalController.js, server/routes/client-portal.js |

## What Was Built

**Task 1 — authenticateSecondLetterToken middleware** (`server/middleware/auth.js`):
- Extracts UUID token from `Authorization: Bearer <token>` header
- Looks up client via `Client.findOne({ second_letter_form_token: token })`
- Checks `second_letter_form_token_expires_at` has not passed
- Sets `req.clientId = client.id` on success
- Returns 401 for missing/invalid/expired tokens
- Exported alongside existing middleware functions

**Task 2 — Controller handlers** (`server/controllers/clientPortalController.js`):
- `handleGetSecondLetterFormData`: finds client by `req.clientId`, returns `second_letter_status`, `second_letter_form_submitted_at`, and `pre_fill` object with 6 field mappings using optional chaining
- `handleSubmitSecondLetterForm`: status guard (409 if not PENDING), validates all 7 FORM-02 required fields with specific error messages, atomic `safeClientUpdate` writes snapshot + updates financial_data/extended_financial_data/aktuelle_pfaendung + transitions to FORM_SUBMITTED

**Task 2 — Routes** (`server/routes/client-portal.js`):
- `GET /second-letter-form` with `authenticateSecondLetterToken` middleware
- `POST /second-letter-form` with `authenticateSecondLetterToken` middleware
- Import added to route file

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Phase 29 uses UUID token, not JWT**
- **Found during:** Task 1
- **Issue:** The plan specified `jwt.verify(token, JWT_SECRET)` and checking `decoded.type === 'second_letter'`. However, Phase 29's `SecondLetterTriggerService.js` generates `second_letter_form_token: uuidv4()` — a plain UUID stored in the Client model, not a signed JWT. The plan's JWT approach would reject all valid tokens from Phase 29.
- **Fix:** Implemented DB lookup validation: `Client.findOne({ second_letter_form_token: token })` + expiry check via `second_letter_form_token_expires_at`. This correctly authenticates the UUID tokens Phase 29 generates.
- **Files modified:** server/middleware/auth.js
- **Commit:** dfb0037

**2. [Rule 1 - Bug] Snapshot field name mismatch with Client.js schema**
- **Found during:** Task 2
- **Issue:** The plan specified writing `active_garnishments` and `submitted_at` to the snapshot. Client.js schema (Phase 28) defines these fields as `has_garnishment` and `snapshot_created_at`.
- **Fix:** Used `has_garnishment` and `snapshot_created_at` to match the actual Mongoose schema.
- **Files modified:** server/controllers/clientPortalController.js
- **Commit:** 9124abe

## Verification Results

All three files parse without errors:
- `cd server && node -e "require('./middleware/auth.js')"` → OK, `authenticateSecondLetterToken` exported
- `cd server && node -e "require('./controllers/clientPortalController.js')"` → OK
- `cd server && node -e "require('./routes/client-portal.js')"` → OK

Success criteria confirmed:
- authenticateSecondLetterToken validates UUID token via DB lookup, rejects expired/missing/invalid tokens
- GET endpoint returns pre-fill with all 6 field mappings using optional chaining from correct DB sources
- POST endpoint checks status guard FIRST (before any writes), validates all FORM-02 fields, uses safeClientUpdate, writes snapshot, transitions status
- Both routes use authenticateSecondLetterToken middleware

## Self-Check: PASSED

Files exist:
- server/middleware/auth.js — FOUND (modified)
- server/controllers/clientPortalController.js — FOUND (modified)
- server/routes/client-portal.js — FOUND (modified)

Commits exist:
- dfb0037 (Task 1) — FOUND
- 9124abe (Task 2) — FOUND
