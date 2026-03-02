---
phase: 29-trigger-scheduler-client-notification
plan: "02"
subsystem: backend-wiring
tags: [second-letter, admin-route, scheduler, dependency-injection, wiring]
dependency_graph:
  requires: [29-01]
  provides: [admin-trigger-endpoint, scheduler-daily-check, server-wiring]
  affects: [server/scheduler.js, server/server.js, server/routes/admin-second-letter.js, server/controllers/adminSecondLetterController.js]
tech_stack:
  added: []
  patterns: [factory-function-route, controller-factory, dependency-injection-constructor, setInterval-scheduler, idempotent-200-response]
key_files:
  created:
    - server/routes/admin-second-letter.js
    - server/controllers/adminSecondLetterController.js
  modified:
    - server/scheduler.js
    - server/server.js
decisions:
  - "EmailService is a singleton (module.exports = new EmailService()) — used directly via require, not re-instantiated"
  - "secondLetterTriggerService guarded in scheduler with if (this.secondLetterTriggerService) for backward compatibility"
  - "alreadyTriggered returns 200 with { success: false, alreadyTriggered: true } — idempotent endpoint, not 409"
metrics:
  duration: "2m"
  completed: "2026-03-02"
  tasks_completed: 2
  files_created: 2
  files_modified: 2
---

# Phase 29 Plan 02: Admin Route, Scheduler & Server Wiring Summary

**One-liner:** Admin trigger endpoint + 24-hour scheduler wired to SecondLetterTriggerService via dependency injection in server.js — both entry points share the same core service.

## What Was Built

### Task 1: `server/controllers/adminSecondLetterController.js` (NEW)

Factory function `createAdminSecondLetterController({ secondLetterTriggerService })` following the `adminReviewController.js` pattern:

**`triggerSecondLetter(req, res)`**
- Extracts `clientId` from `req.params`, `actor` from `req.adminId || 'admin'`
- Calls `secondLetterTriggerService.triggerForClient(clientId, actor)`
- If `result.alreadyTriggered`: returns `200 { success: false, alreadyTriggered: true, currentStatus, message }` — NOT a 409 (idempotent endpoint)
- On success: returns `200 { success: true, clientId, aktenzeichen, emailSent }`
- Error handler: `500 { error, details }`

### Task 1 (continued): `server/routes/admin-second-letter.js` (NEW)

Factory-pattern route file:
- `module.exports = ({ secondLetterTriggerService }) => { ... return router; }`
- Route: `POST /clients/:clientId/trigger-second-letter`
- Middleware order: `rateLimits.admin` → `authenticateAdmin` → `controller.triggerSecondLetter`
- Mirrors `admin-review.js` pattern exactly

### Task 2: `server/scheduler.js` (MODIFIED)

Constructor now accepts and stores `secondLetterTriggerService`:
```javascript
this.secondLetterTriggerService = dependencies.secondLetterTriggerService;
```

New section in `startScheduledTasks()` guarded by `if (this.secondLetterTriggerService)`:
- **Initial check:** `setTimeout` at 10 minutes after server start
- **Recurring check:** `setInterval` every 24 hours (`SECOND_LETTER_CHECK_INTERVAL`)
- Both call `this.secondLetterTriggerService.checkAndTriggerEligible()`
- Guard ensures backward compatibility if service is not injected

### Task 2 (continued): `server/server.js` (MODIFIED)

Three additions:

1. **Requires** (near other service imports):
   ```javascript
   const EmailService = require('./services/emailService');
   const SecondLetterTriggerService = require('./services/secondLetterTriggerService');
   ```

2. **Instantiation** (near reminder services):
   ```javascript
   const emailService = EmailService; // singleton
   const secondLetterTriggerService = new SecondLetterTriggerService({ emailService });
   ```

3. **Route mount** (after admin review route):
   ```javascript
   const createAdminSecondLetterRouter = require('./routes/admin-second-letter');
   app.use('/api/admin', createAdminSecondLetterRouter({ secondLetterTriggerService }));
   ```

4. **Scheduler injection** (in `new Scheduler({...})`):
   ```javascript
   secondLetterTriggerService  // added to dependency object
   ```

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `7198531` | feat(29-02): add admin second letter route and controller |
| 2 | `c905d30` | feat(29-02): wire SecondLetterTriggerService into scheduler and server.js |

## Deviations from Plan

**[Rule 1 - Clarification] EmailService is a singleton, not a class**

- **Found during:** Task 2
- **Issue:** Plan said `new SecondLetterTriggerService({ emailService })` with emailService injected — but `emailService.js` exports `module.exports = new EmailService()` (a singleton), not the class itself.
- **Fix:** Used `const emailService = EmailService;` (direct reference to singleton) rather than `new EmailService()`.
- **Files modified:** server/server.js (comment clarifies this)
- **Impact:** None — correct behavior, just a naming pattern clarification in the code comment.

## Verification Results

- [x] `server/routes/admin-second-letter.js` exists with `POST /clients/:clientId/trigger-second-letter`
- [x] `server/controllers/adminSecondLetterController.js` exists, exports factory function
- [x] `authenticateAdmin` + `rateLimits.admin` middleware applied to route
- [x] Already-triggered case returns 200 with `{ alreadyTriggered: true }` (not 409)
- [x] `scheduler.js` has `secondLetterTriggerService` in constructor + `SECOND_LETTER_CHECK_INTERVAL` 24h interval
- [x] `scheduler.js` has initial check at 10 minutes guarded by `if (this.secondLetterTriggerService)`
- [x] `server.js` requires and instantiates `SecondLetterTriggerService` with emailService
- [x] `server.js` mounts `admin-second-letter` route at `/api/admin`
- [x] `server.js` passes `secondLetterTriggerService` to `new Scheduler({})`
- [x] All new files load without Node.js syntax errors

## Phase 29 Complete

With Plan 02 done, Phase 29 is fully operational:
- **Scheduler path:** server.js → Scheduler → `checkAndTriggerEligible()` → `triggerForClient()` → DB write + email
- **Admin path:** HTTP POST → `authenticateAdmin` → `triggerSecondLetter` → `triggerForClient()` → DB write + email
- Both entry points share the exact same core service — no duplication

## Self-Check: PASSED

Files verified:
- `server/controllers/adminSecondLetterController.js` — EXISTS
- `server/routes/admin-second-letter.js` — EXISTS
- `server/scheduler.js` — MODIFIED (secondLetterTriggerService present)
- `server/server.js` — MODIFIED (SecondLetterTriggerService wired)

Commits verified:
- `7198531` — feat(29-02): add admin second letter route and controller
- `c905d30` — feat(29-02): wire SecondLetterTriggerService into scheduler and server.js
