---
phase: 01-deduplication-timing-data-integrity
plan: 01
subsystem: deduplication-scheduler
tags: [deduplication, timing, event-driven, atomic-guards, mongodb]

dependencies:
  requires:
    - "Initial aiDedupScheduler implementation with 30-minute delay"
    - "webhookController document processing flow"
    - "Client schema structure"
  provides:
    - "Immediate dedup execution triggered on allDocsCompleted"
    - "Atomic dedup_in_progress guard preventing race conditions"
    - "dedup coordination fields for payment handler integration"
  affects:
    - "01-03: Payment handler will use dedup_in_progress flag"
    - "All document processing flows now trigger immediate dedup"

tech-stack:
  added: []
  patterns:
    - "Event-driven immediate execution (replaces delayed scheduling)"
    - "MongoDB atomic update guards ($ne operator)"
    - "Try-finally pattern for resource cleanup"
    - "setImmediate for async non-blocking execution"

key-files:
  created: []
  modified:
    - path: "server/models/Client.js"
      changes: "Added dedup_in_progress, dedup_started_at, dedup_completed_at fields"
    - path: "server/services/aiDedupScheduler.js"
      changes: "Removed 30-min delay, added atomic guard, converted to immediate execution"
    - path: "server/controllers/webhookController.js"
      changes: "Added dedup trigger in allDocsCompleted block with setImmediate"
    - path: "server/server.js"
      changes: "Injected aiDedupScheduler dependency to webhookController"
    - path: "server/routes/webhooks.js"
      changes: "Updated router factory to accept aiDedupScheduler"

decisions:
  - decision: "Use MongoDB atomic update instead of application-level locking"
    rationale: "MongoDB atomic operations guarantee no race conditions even across multiple Node.js instances"
    alternatives: ["Redis locks", "Application-level mutex"]
    chosen: "MongoDB atomic update"

  - decision: "Use setImmediate instead of await for dedup execution"
    rationale: "Prevents blocking webhook response while ensuring dedup runs asynchronously after document save"
    alternatives: ["await directly", "setTimeout", "Promise.resolve().then()"]
    chosen: "setImmediate"

  - decision: "Always clear dedup_in_progress in finally block"
    rationale: "Ensures flag is cleared even if dedup fails, preventing permanent lock"
    alternatives: ["Clear in catch block only", "TTL-based auto-clear"]
    chosen: "finally block"

metrics:
  duration: "2m 45s"
  completed: 2026-01-30

execution-notes:
  deviations: "None - plan executed exactly as written"
  blockers: "None"
  performance: "All tasks completed smoothly with no syntax errors or import issues"
---

# Phase 01 Plan 01: Immediate Dedup Execution Summary

**One-liner:** Converted dedup scheduler from 30-minute delayed execution to immediate event-driven execution with atomic MongoDB guards.

## What Was Built

### Task 1: Dedup Coordination Fields & Immediate Execution
**Commit:** `6639579`

**Changes:**
- Added `dedup_in_progress: Boolean`, `dedup_started_at: Date`, `dedup_completed_at: Date` to Client schema
- Removed `DEDUP_DELAY_MS` constant (30 * 60 * 1000)
- Converted `scheduleAIRededup` from delayed (setTimeout) to immediate execution
- Added atomic MongoDB guard: `Client.updateOne({ _id, dedup_in_progress: { $ne: true } }, ...)`
- Added `finally` block to always clear `dedup_in_progress` flag
- Changed dedup history method from `'periodic-ai-rededup'` to `'immediate-ai-rededup'`
- Added `const Client = require('../models/Client')` import

**Key Code Changes:**
```javascript
// Before: 30-minute delay
const timeoutId = setTimeout(async () => {
  await runAIRededup(clientId, getClientFunction);
}, DEDUP_DELAY_MS);

// After: Immediate execution
async function scheduleAIRededup(clientId, getClientFunction) {
  // Cancel any pending delayed job (legacy cleanup)
  if (pendingJobs.has(clientId)) {
    clearTimeout(pendingJobs.get(clientId));
    pendingJobs.delete(clientId);
  }
  // Run dedup IMMEDIATELY
  return runAIRededup(clientId, getClientFunction);
}
```

**Atomic Guard:**
```javascript
// Prevent concurrent dedup execution
const guardResult = await Client.updateOne(
  { _id: client._id, dedup_in_progress: { $ne: true } },
  { $set: { dedup_in_progress: true, dedup_started_at: new Date() } }
);

if (guardResult.modifiedCount === 0) {
  console.log(`[ai-dedup-scheduler] Dedup already in progress, skipping`);
  return { success: false, reason: 'dedup_already_in_progress' };
}

try {
  // ... dedup logic ...
} finally {
  // ALWAYS clear flag
  await Client.updateOne(
    { id: clientId },
    { $set: { dedup_in_progress: false, dedup_completed_at: new Date() } }
  );
}
```

### Task 2: Webhook Trigger on allDocsCompleted
**Commit:** `9f6572e`

**Changes:**
- Updated `createWebhookController` factory signature to accept `aiDedupScheduler`
- Added dedup trigger in `allDocsCompleted` block (after creditor doc check)
- Used `setImmediate` for async execution without blocking webhook response
- Set `all_documents_processed_at` timestamp when all docs complete
- Injected `aiDedupScheduler` from `server.js` to `webhookController`
- Updated `webhooks.js` router factory to pass `aiDedupScheduler`

**Key Code Changes:**
```javascript
// In webhookController.js allDocsCompleted block:
if (creditorDocs.length > 0) {
  console.log(`[webhook] All ${totalDocs} documents processed. Triggering immediate AI dedup for ${client_id}...`);
  clientDoc.all_documents_processed_at = new Date();

  // Fire dedup asynchronously — don't block webhook response
  setImmediate(async () => {
    try {
      await aiDedupScheduler.scheduleAIRededup(client_id, getClient);
      console.log(`[webhook] AI dedup completed for ${client_id}`);
    } catch (err) {
      console.error(`[webhook] AI dedup failed for ${client_id}:`, err.message);
    }
  });
}
```

## Technical Implementation

### Execution Flow
1. **Document Processing Completes:** Webhook receives final document processing result
2. **All Docs Check:** `allDocsCompleted = completedDocs.length === totalDocs && totalDocs > 0`
3. **Creditor Check:** If `creditorDocs.length > 0`, proceed to dedup
4. **Immediate Trigger:** `setImmediate(() => aiDedupScheduler.scheduleAIRededup(...))`
5. **Atomic Guard:** MongoDB atomic update checks `dedup_in_progress` flag
6. **Dedup Execution:** Runs immediately if guard passes
7. **Flag Cleanup:** `finally` block always clears `dedup_in_progress`

### Race Condition Prevention
**Problem:** Multiple simultaneous document uploads could trigger concurrent dedup runs.

**Solution:** MongoDB atomic update with `$ne` operator:
```javascript
{ _id: client._id, dedup_in_progress: { $ne: true } }
```

**How it works:**
- Only ONE updateOne call will modify the document (modifiedCount = 1)
- All other concurrent calls will fail (modifiedCount = 0)
- Works across multiple Node.js instances (database-level atomicity)
- No application-level locking or Redis needed

### Non-Blocking Webhook Response
**Problem:** Dedup can take 5+ seconds, would timeout FastAPI webhook.

**Solution:** `setImmediate` for async execution:
- Webhook response sent immediately (200 OK)
- Document save completes
- THEN dedup runs asynchronously
- Client data already saved, so dedup has latest state

## Testing & Verification

All verification checks passed:
- ✅ No `DEDUP_DELAY_MS` or `30 * 60` in aiDedupScheduler.js
- ✅ No `setTimeout` in scheduleAIRededup function
- ✅ `scheduleAIRededup` called in webhookController allDocsCompleted block
- ✅ `dedup_in_progress` atomic guard in runAIRededup
- ✅ `dedup_in_progress` field in Client schema
- ✅ `aiDedupScheduler` dependency injected in server.js
- ✅ No syntax errors: `node -e "require('./server/services/aiDedupScheduler')"`
- ✅ No import errors: `node -e "require('./server/controllers/webhookController')"`

## Deviations from Plan

None - plan executed exactly as written.

## Performance Impact

**Before:** 30-minute gap between document processing completion and dedup execution.

**After:** Dedup runs within seconds of document processing completion.

**Expected improvement:**
- User sees deduplicated creditor list 30 minutes faster
- Payment handler can check `dedup_in_progress` flag for coordination (enables Plan 01-03)

## Next Phase Readiness

**Blockers:** None

**Dependencies for Plan 01-03 (Payment Handler Coordination):**
- ✅ `dedup_in_progress` flag exists and is atomically managed
- ✅ `dedup_started_at` and `dedup_completed_at` timestamps available
- ✅ Immediate execution ensures flag is set during active dedup

**Integration Points:**
- Payment handler can check `if (client.dedup_in_progress)` before processing
- Payment handler can use `dedup_completed_at` to determine if dedup finished
- Payment handler can trigger dedup manually via `aiDedupScheduler.scheduleAIRededup()`

## Commits

| Hash    | Message                                                              |
|---------|----------------------------------------------------------------------|
| 6639579 | feat(01-01): add dedup coordination fields and convert scheduler to immediate execution |
| 9f6572e | feat(01-01): trigger dedup from document processing completion in webhookController |

## Files Modified

- `server/models/Client.js` - Added dedup coordination fields
- `server/services/aiDedupScheduler.js` - Removed delay, added atomic guard, immediate execution
- `server/controllers/webhookController.js` - Added dedup trigger in allDocsCompleted
- `server/server.js` - Injected aiDedupScheduler dependency
- `server/routes/webhooks.js` - Updated router factory signature
