# Phase 1: Deduplication Timing & Data Integrity - Research

**Researched:** 2026-01-30
**Domain:** Event-driven document processing, MongoDB atomic operations, Node.js async coordination
**Confidence:** HIGH

## Summary

Phase 1 requires converting a timer-based deduplication scheduler (30-minute delay) to event-driven immediate execution after document processing completes, while preserving manual review flags during creditor list merge. The technical domain involves Node.js EventEmitter patterns, MongoDB atomic operations for race condition prevention, and async coordination between dedup completion and payment status evaluation.

The existing codebase uses setTimeout for scheduling (in-memory, process-local) and already has `pendingJobs` Map tracking. The payment handler explicitly ignores `creditor.needs_manual_review` flags (line 489 comment: "using document flags, NOT creditor.needs_manual_review"), creating the core bug. Dedup enrichment fills missing email/address from local DB, which can mask review needs.

**Primary recommendation:** Use event-driven counter-based pattern (track processed document count) with MongoDB atomic operations for state coordination. Preserve manual review flags using MongoDB `$set` with explicit field preservation during creditor list merge.

## Standard Stack

The project uses established Node.js/MongoDB patterns without additional dependencies needed:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js EventEmitter | Built-in | Event coordination for document processing completion | Core Node.js async pattern, already used in codebase |
| MongoDB (Mongoose) | 8.0.0 | Database with atomic operations | Already in use; provides atomic updates via `$set`, `$inc` |
| setTimeout/clearTimeout | Built-in | In-memory job scheduling | Already used by `aiDedupScheduler.js` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| axios | 1.10.0 | HTTP client for FastAPI calls | Already calling `/api/dedup/deduplicate-all` |
| uuid | 9.0.0 | ID generation for creditors | Already preserving creditor IDs during merge |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-memory Map | BullMQ + Redis | BullMQ adds Redis dependency and is overkill for single-process coordination; Map is sufficient for tracking pending jobs per client |
| Event counter | MongoDB Change Streams | Change streams require replica set and add complexity; counter-based is simpler for single-field tracking |
| Blocking await | Job re-queue | Re-queueing adds complexity; blocking with timeout is acceptable for sub-second dedup operations |

**Installation:**
No new packages required — all patterns use existing dependencies.

## Architecture Patterns

### Recommended Project Structure
```
server/
├── services/
│   └── aiDedupScheduler.js      # Already exists - modify trigger logic
├── controllers/
│   └── zendeskWebhookController.js  # Payment handler - add flag check
├── models/
│   └── Client.js                 # Schema already has needed fields
```

### Pattern 1: Document Processing Counter Pattern
**What:** Track document processing count and trigger dedup when all documents complete
**When to use:** When multiple async operations must all complete before triggering next step
**Example:**
```javascript
// Track processing state atomically in MongoDB
const allCompleted = client.documents.every(doc =>
  doc.processing_status === 'completed' ||
  doc.processing_status === 'error'
);

if (allCompleted && !client.dedup_triggered_for_batch) {
  // Mark dedup as triggered atomically to prevent double-runs
  await Client.updateOne(
    { _id: client._id, dedup_triggered_for_batch: { $ne: true } },
    { $set: { dedup_triggered_for_batch: true } }
  );

  // Run dedup immediately
  await runAIRededup(client.id, getClient);
}
```
**Source:** Node.js event coordination patterns from existing codebase structure

### Pattern 2: Atomic Flag Preservation During Array Replace
**What:** Use MongoDB `$set` to replace array while preserving specific nested fields
**When to use:** When merging deduplicated creditor list back into database
**Example:**
```javascript
// Preserve manual review flags during merge
const mergedCreditors = deduplicated_creditors.map(deduped => {
  const existing = client.final_creditor_list.find(c => c.id === deduped.id);

  return {
    ...deduped,
    // Preserve these fields from existing creditor if present
    needs_manual_review: existing?.needs_manual_review ?? deduped.needs_manual_review,
    review_reasons: existing?.review_reasons ?? deduped.review_reasons,
    manually_reviewed: existing?.manually_reviewed ?? false,
    reviewed_at: existing?.reviewed_at,
    reviewed_by: existing?.reviewed_by
  };
});

client.final_creditor_list = mergedCreditors;
await client.save();
```
**Source:** MongoDB update patterns from [official MongoDB docs](https://www.mongodb.com/docs/manual/tutorial/update-documents/)

### Pattern 3: Race Condition Prevention via Atomic Update
**What:** Use MongoDB atomic operations to prevent concurrent dedup executions
**When to use:** When multiple events could trigger same operation simultaneously
**Example:**
```javascript
// Atomic check-and-set to prevent double execution
const result = await Client.updateOne(
  {
    _id: client._id,
    dedup_in_progress: { $ne: true }  // Only update if not already running
  },
  {
    $set: { dedup_in_progress: true, dedup_started_at: new Date() }
  }
);

if (result.modifiedCount === 0) {
  // Another process already started dedup
  console.log('Dedup already in progress, skipping');
  return;
}

try {
  // Run dedup
  await runDedup();
} finally {
  // Clear flag
  await Client.updateOne(
    { _id: client._id },
    { $set: { dedup_in_progress: false } }
  );
}
```
**Source:** [MongoDB atomic operations best practices](https://medium.com/tales-from-nimilandia/handling-race-conditions-and-concurrent-resource-updates-in-node-and-mongodb-by-performing-atomic-9f1a902bd5fa)

### Pattern 4: Payment Handler Coordination
**What:** Block payment handler until dedup completes if documents were recently processed
**When to use:** To prevent payment status decision on pre-dedup creditor data
**Example:**
```javascript
// In payment webhook handler
if (client.all_documents_processed_at) {
  const timeSinceProcessing = Date.now() - client.all_documents_processed_at;
  const DEDUP_MAX_DURATION = 60000; // 60 seconds

  if (timeSinceProcessing < DEDUP_MAX_DURATION && client.dedup_in_progress) {
    // Wait for dedup with timeout
    let waited = 0;
    while (client.dedup_in_progress && waited < DEDUP_MAX_DURATION) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await client.reload();
      waited += 1000;
    }
  }
}

// Now safe to evaluate creditor list for payment status
const needsReview = client.final_creditor_list.filter(c =>
  c.needs_manual_review || hasDocumentReviewFlags(c)
);
```
**Source:** Async/await coordination patterns from [Node.js async patterns 2026](https://medium.com/@a.kago1988/async-await-done-concurrently-in-node-js-33a3e710e27a)

### Anti-Patterns to Avoid
- **Timer-based fallback:** Don't keep cron as backup — creates unpredictable behavior where dedup runs at unexpected times
- **Replace entire document:** Don't use `replaceOne` or spread operator without explicit field preservation — loses manual review state
- **EventEmitter across requests:** Don't emit events across HTTP request boundaries — EventEmitter is in-process only, not durable
- **Callback nesting:** Don't nest callbacks for async coordination — use async/await for cleaner error handling

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Distributed job queue | Custom setTimeout scheduler across servers | BullMQ + Redis (if multi-server) | Existing scheduler is in-memory Map; works for single process but loses state on restart. Only add BullMQ if scaling to multiple servers. |
| Database merge logic | Manual field-by-field merge | MongoDB `$mergeObjects` in aggregation pipeline | Aggregation pipeline handles nested object merging correctly; manual merge is error-prone |
| Dedup idempotency | Custom locking with flags | MongoDB `findOneAndUpdate` atomic operations | MongoDB atomic operations prevent race conditions without application-level locks |
| Event persistence | EventEmitter for durable events | MongoDB Change Streams or explicit state flags | EventEmitter is in-memory; doesn't survive restarts. Use DB state for durable coordination. |

**Key insight:** MongoDB atomic operations handle concurrency; EventEmitter handles in-process coordination. Don't mix their responsibilities or build custom locking.

## Common Pitfalls

### Pitfall 1: EventEmitter Assumptions Across Processes
**What goes wrong:** Treating EventEmitter events as durable or cross-process
**Why it happens:** EventEmitter is built-in and easy to use, but it's in-memory only
**How to avoid:** Use EventEmitter only within single request/process flow; persist state changes in MongoDB for cross-request coordination
**Warning signs:** Events not received after server restart; dedup not triggering after deploy

### Pitfall 2: Array Replace Without Field Preservation
**What goes wrong:** `client.final_creditor_list = deduplicated_creditors` overwrites all fields, including manual review flags
**Why it happens:** JavaScript spread operator and MongoDB save() don't preserve nested fields automatically
**How to avoid:** Explicitly merge existing creditor fields before assigning new array
**Warning signs:** `needs_manual_review` resets to false after dedup runs; `review_reasons` array becomes empty

### Pitfall 3: Ignoring Dedup Enrichment Side Effects
**What goes wrong:** Dedup fills missing email/address from DB, making payment handler think contact info is complete when review is still needed
**Why it happens:** Enrichment happens in `aiDedupScheduler.js` lines 138-202, but payment handler checks contact info completeness separately
**How to avoid:** Check `needs_manual_review` flag first; don't assume complete contact info means no review needed
**Warning signs:** Creditors with `needs_manual_review=true` but complete email/address skip agent review

### Pitfall 4: Race Between Document Processing and Payment
**What goes wrong:** Payment webhook arrives while documents still processing; payment handler evaluates pre-dedup creditor list
**Why it happens:** Payment and document processing are independent async flows; no coordination mechanism exists
**How to avoid:** Add temporal check in payment handler: if `all_documents_processed_at` is recent (within last 60s), wait for `dedup_in_progress` to clear
**Warning signs:** Payment status set to `awaiting_client_confirmation` when creditors still have unresolved duplicates

### Pitfall 5: Double-Trigger Protection
**What goes wrong:** Multiple document completion events trigger dedup multiple times
**Why it happens:** If last two documents complete nearly simultaneously, both might see "all completed" and trigger dedup
**How to avoid:** Use atomic MongoDB update with `dedup_in_progress` flag check before running dedup
**Warning signs:** Dedup history shows multiple entries with same timestamp; FastAPI receives duplicate requests

## Code Examples

Verified patterns from codebase analysis:

### Check All Documents Completed
```javascript
// From existing codebase pattern in webhookController.js
const allDocsCompleted = client.documents.every(doc =>
  doc.processing_status === 'completed' ||
  doc.processing_status === 'error' ||
  doc.processing_status === 'failed'
);

if (allDocsCompleted) {
  // Mark timestamp atomically
  await Client.updateOne(
    { _id: client._id },
    {
      $set: {
        all_documents_processed_at: new Date(),
        current_status: 'documents_completed'
      }
    }
  );

  // Trigger immediate dedup (no 30-minute delay)
  await scheduleAIRededup(client.id, getClient);
}
```

### Modify scheduleAIRededup to Run Immediately
```javascript
// In aiDedupScheduler.js - modify existing function
function scheduleAIRededup(clientId, getClientFunction) {
  console.log(`[ai-dedup-scheduler] Running immediate dedup for ${clientId}...`);

  // Cancel any pending delayed job (from old logic)
  if (pendingJobs.has(clientId)) {
    clearTimeout(pendingJobs.get(clientId));
    pendingJobs.delete(clientId);
  }

  // Run dedup IMMEDIATELY (no setTimeout)
  return runAIRededup(clientId, getClientFunction);
}
```

### Preserve Manual Review Flags During Merge
```javascript
// In aiDedupScheduler.js runAIRededup function, before client.save()
// Get existing creditor map for O(1) lookup
const existingMap = new Map(
  client.final_creditor_list.map(c => [c.id, c])
);

// Merge with preservation of manual review state
client.final_creditor_list = deduplicated_creditors.map(deduped => {
  const existing = existingMap.get(deduped.id);

  return {
    ...deduped,
    id: deduped.id || uuidv4(),
    status: deduped.status || 'confirmed',
    ai_confidence: deduped.ai_confidence || 1.0,
    created_at: deduped.created_at || new Date(),

    // PRESERVE manual review state from existing creditor
    needs_manual_review: existing?.needs_manual_review ?? deduped.needs_manual_review ?? false,
    review_reasons: existing?.review_reasons ?? deduped.review_reasons ?? [],
    manually_reviewed: existing?.manually_reviewed ?? false,
    reviewed_at: existing?.reviewed_at,
    reviewed_by: existing?.reviewed_by,
    review_action: existing?.review_action,
    original_ai_data: existing?.original_ai_data,
    correction_notes: existing?.correction_notes
  };
});
```

### Fix Payment Handler to Check needs_manual_review
```javascript
// In zendeskWebhookController.js, replace line 486-491
const creditorNeedsManualReview = (creditor) => {
  // ✅ FIX: Check creditor.needs_manual_review flag FIRST
  if (creditor.needs_manual_review === true) {
    return true;
  }

  // Then check document flags (existing logic)
  const doc = documents.find(d =>
    d.id === creditor.document_id || d.id === creditor.source_document_id
  );
  const documentNeedsReview = doc?.manual_review_required ||
                               doc?.validation?.requires_manual_review ||
                               (doc?.confidence && doc.confidence < 0.7);

  // Check missing contact info
  const creditorEmail = creditor.email_glaeubiger || creditor.sender_email;
  const creditorAddress = creditor.glaeubiger_adresse || creditor.sender_address;
  const missingEmail = isMissingValue(creditorEmail);
  const missingAddress = isMissingValue(creditorAddress);
  const missingContactInfo = missingEmail || missingAddress;

  return documentNeedsReview || missingContactInfo;
};
```

### Wait for Dedup Before Payment Decision
```javascript
// In zendeskWebhookController.js payment handler, before evaluating creditors
async function waitForDedupIfNeeded(client) {
  const recentlyProcessed = client.all_documents_processed_at &&
    (Date.now() - client.all_documents_processed_at.getTime()) < 60000; // Within 60s

  if (recentlyProcessed && client.dedup_in_progress) {
    console.log(`[payment-handler] Waiting for dedup to complete for ${client.aktenzeichen}...`);

    const maxWait = 60000; // 60 seconds max wait
    const startWait = Date.now();

    while (client.dedup_in_progress && (Date.now() - startWait) < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      // Reload client from DB to get updated dedup_in_progress flag
      const fresh = await Client.findOne({ _id: client._id });
      if (!fresh.dedup_in_progress) break;
    }

    // Reload full client data after dedup completes
    const updated = await Client.findOne({ _id: client._id });
    return updated;
  }

  return client;
}

// Use before evaluating creditors:
client = await waitForDedupIfNeeded(client);
const needsReview = client.final_creditor_list.filter(c =>
  creditorNeedsManualReview(c)
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Cron-based dedup scheduling | Event-driven immediate execution | 2024-2025 industry shift | Reduces latency from minutes to seconds; aligns with serverless patterns |
| Callback-based async | async/await with Promise.all() | Node.js 8+ (2017) | Cleaner error handling, easier to reason about sequential vs parallel |
| Manual locking for race conditions | MongoDB atomic operations | MongoDB best practices 2020+ | Eliminates application-level lock complexity; database handles concurrency |
| EventEmitter for cross-request events | Database state flags | Microservices era (2020+) | Events don't survive restarts; DB state is durable |

**Deprecated/outdated:**
- **setTimeout for scheduled jobs at scale:** BullMQ/Agenda preferred for multi-server, but single-process setTimeout is still valid for lightweight local coordination
- **Callback-style async:** Use async/await; callbacks make error handling complex
- **MongoDB callbacks:** Mongoose 6+ uses promises by default; callback API is legacy

## Open Questions

Things that couldn't be fully resolved:

1. **FastAPI Dedup Timeout Duration**
   - What we know: Current timeout is 300 seconds (5 minutes) in line 104 of aiDedupScheduler.js
   - What's unclear: Is this sufficient for large creditor lists? What's the typical FastAPI response time?
   - Recommendation: Add timeout monitoring to dedup history; alert if approaching 5min threshold

2. **Dedup Failure Recovery**
   - What we know: Dedup errors are logged but don't have explicit retry logic
   - What's unclear: Should failed dedup block payment processing? Should it retry automatically?
   - Recommendation: Mark `dedup_failed` flag in client record; require manual admin trigger for retry

3. **Multi-Server Deployment Considerations**
   - What we know: Current scheduler uses in-memory Map, works for single process
   - What's unclear: Will this system scale to multiple server instances? Is load balancer sticky?
   - Recommendation: If deploying multi-server, migrate to BullMQ for distributed job coordination

## Sources

### Primary (HIGH confidence)
- Existing codebase analysis:
  - `/server/services/aiDedupScheduler.js` - 30-minute setTimeout pattern, enrichment logic
  - `/server/controllers/zendeskWebhookController.js` - payment handler ignoring `needs_manual_review`
  - `/server/models/Client.js` - MongoDB schema with all needed fields
- [MongoDB Update Documents Official Docs](https://www.mongodb.com/docs/manual/tutorial/update-documents/) - `$set` operator behavior
- [Node.js EventEmitter Official Docs](https://nodejs.org/api/events.html) - Built-in event system

### Secondary (MEDIUM confidence)
- [Node.js race conditions patterns (Node.js Design Patterns)](https://nodejsdesignpatterns.com/blog/node-js-race-conditions/) - Verified with official MongoDB docs
- [MongoDB atomic operations for race conditions (Medium)](https://medium.com/tales-from-nimilandia/handling-race-conditions-and-concurrent-resource-updates-in-node-and-mongodb-by-performing-atomic-9f1a902bd5fa) - Practical examples aligned with official docs
- [Async/await concurrent patterns 2026 (Medium)](https://medium.com/@a.kago1988/async-await-done-concurrently-in-node-js-33a3e710e27a) - Recent article, consistent with MDN docs
- [MongoDB preserve fields during update (MongoDB Community)](https://www.mongodb.com/community/forums/t/mergeobjects-is-overwriting-object-data-in-update-pipeline/144221) - Community discussion verified against official docs

### Tertiary (LOW confidence)
- [BullMQ for job queues](https://bullmq.io/) - Not needed for current single-server setup, but valid for future scaling
- [MongoDB Change Streams](https://www.mongodb.com/docs/manual/changestreams/) - Explored but overkill for this use case; requires replica set

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use, no new dependencies
- Architecture: HIGH - Patterns verified in existing codebase and official docs
- Pitfalls: HIGH - Identified from actual codebase bugs (line 489 comment) and MongoDB best practices

**Research date:** 2026-01-30
**Valid until:** 60 days (stable Node.js/MongoDB patterns; not fast-moving)
