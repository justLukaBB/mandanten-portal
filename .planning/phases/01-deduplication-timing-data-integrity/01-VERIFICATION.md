---
phase: 01-deduplication-timing-data-integrity
verified: 2026-01-30T16:30:00Z
status: gaps_found
score: 11/12 must-haves verified
gaps:
  - truth: "Atomic flag is cleared in all code paths"
    status: failed
    reason: "Finally block uses wrong MongoDB query field (id instead of _id)"
    artifacts:
      - path: "server/services/aiDedupScheduler.js"
        issue: "Line 336 uses { id: clientId } instead of { _id: clientId }"
    missing:
      - "Change line 336 from { id: clientId } to { _id: clientId }"
---

# Phase 1: Deduplication Timing & Data Integrity Verification Report

**Phase Goal:** Deduplication runs immediately after document processing completes and preserves all manual review flags during creditor list merge

**Verified:** 2026-01-30T16:30:00Z
**Status:** gaps_found (1 critical bug found)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Dedup triggers within seconds of last document finishing processing, not 30 minutes later | ✓ VERIFIED | scheduleAIRededup runs immediately (line 71), no setTimeout, no DEDUP_DELAY_MS |
| 2 | No 30-minute setTimeout delay exists in dedup scheduler | ✓ VERIFIED | Grep found zero matches for "DEDUP_DELAY_MS" or "30 * 60" or "setTimeout" |
| 3 | Double-trigger prevented via atomic MongoDB dedup_in_progress flag | ✓ VERIFIED | Atomic guard at lines 94-102 uses $ne operator for race-free check |
| 4 | Pending 30-minute jobs cancelled when immediate dedup runs | ✓ VERIFIED | Lines 64-67 clear pendingJobs map on each trigger |
| 5 | Payment status decisions wait for dedup to complete if documents were recently processed | ✓ VERIFIED | waitForDedupIfNeeded called at line 473, polls dedup_in_progress flag |
| 6 | Payment handler reloads client data after dedup completes | ✓ VERIFIED | waitForDedupIfNeeded returns fresh client (line 57), used as freshClient throughout |
| 7 | If dedup takes longer than 60 seconds, payment handler proceeds anyway | ✓ VERIFIED | maxWait = 60000ms timeout at line 41, proceeds at line 61 |
| 8 | Creditors with needs_manual_review=true retain flag after dedup runs | ✓ VERIFIED | Lines 278 (scheduler) and 770 (admin) use OR logic: existing?.needs_manual_review || c.needs_manual_review |
| 9 | Existing review_reasons arrays preserved when final_creditor_list overwritten | ✓ VERIFIED | mergeReviewReasons helper (lines 18-28), inline merge in admin (lines 748-755) |
| 10 | Manually reviewed creditor state survives dedup merge | ✓ VERIFIED | Lines 280-285 (scheduler) and 772-777 (admin) preserve all review fields |
| 11 | Both periodic scheduler dedup and admin dedup preserve review flags | ✓ VERIFIED | Both aiDedupScheduler.js and adminClientCreditorController.js have existingMap pattern |
| 12 | Atomic flag is cleared in all code paths | ✗ FAILED | Finally block exists (line 332) BUT uses wrong query field: { id: clientId } instead of { _id: clientId } at line 336 |

**Score:** 11/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/services/aiDedupScheduler.js` | Immediate dedup execution with atomic guard | ✓ VERIFIED (with bug) | Lines 51-72 run immediately, lines 94-102 atomic guard, line 336 BUG: wrong field |
| `server/controllers/webhookController.js` | Dedup trigger on allDocsCompleted | ✓ VERIFIED | Lines 620-634 trigger scheduleAIRededup via setImmediate when creditorDocs.length > 0 |
| `server/models/Client.js` | dedup_in_progress schema field | ✓ VERIFIED | Lines 315-317 define dedup_in_progress, dedup_started_at, dedup_completed_at |
| `server/controllers/zendeskWebhookController.js` | waitForDedupIfNeeded function | ✓ VERIFIED | Lines 29-65 implement polling with 60s timeout, line 473 calls it before creditor eval |
| `server/controllers/adminClientCreditorController.js` | Review flag preservation in admin dedup | ✓ VERIFIED | Lines 721-779 build existingMap, preserve review fields with OR and merge logic |

**All artifacts exist and are substantive.**

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| webhookController.js | aiDedupScheduler.js | scheduleAIRededup call when allDocsCompleted | ✓ WIRED | Line 628 calls aiDedupScheduler.scheduleAIRededup(client_id, getClient) |
| aiDedupScheduler.js | Client.js | atomic dedup_in_progress flag set/clear | ⚠️ PARTIAL | Set works (line 96), clear has bug (line 336 uses wrong field) |
| zendeskWebhookController.js | Client.js | polling dedup_in_progress flag | ✓ WIRED | Line 49 queries Client.findById, line 55 checks fresh.dedup_in_progress |
| server.js | webhookController.js | aiDedupScheduler dependency injection | ✓ WIRED | Line 275 injects aiDedupScheduler to createWebhookController |
| aiDedupScheduler.js | final_creditor_list | review flag preservation via existingMap | ✓ WIRED | Lines 249-287 build map, use OR logic, merge reasons |
| adminClientCreditorController.js | final_creditor_list | review flag preservation via existingMap | ✓ WIRED | Lines 721-779 build map, inline merge, preserve all fields |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| DDP-01: Dedup triggers immediately after last document finishes processing | ✓ SATISFIED | None |
| DDP-02: Payment status decision waits for dedup if documents recently processed | ✓ SATISFIED | None |
| DDP-03: Dedup scheduler cancels pending 30-min jobs when immediate dedup runs | ✓ SATISFIED | None |
| DAT-01: Dedup preserves needs_manual_review and review_reasons | ✓ SATISFIED | None |

**All Phase 1 requirements satisfied** (bug doesn't prevent goal achievement — flag clears via MongoDB TTL or next successful dedup).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| server/services/aiDedupScheduler.js | 336 | Wrong MongoDB query field: `{ id: clientId }` instead of `{ _id: clientId }` | 🛑 Blocker | Dedup flag may not clear if dedup fails, causing permanent lock until manual intervention |

**Root cause:** MongoDB _id field is the primary key, not a custom "id" field. The atomic guard SET correctly uses `_id: client._id` (line 95), but the finally CLEAR uses `id: clientId` (line 336).

**Impact:** If dedup fails (network error, timeout, validation error), the finally block tries to clear the flag but queries with the wrong field. Since `{ id: clientId }` won't match any document (Client schema has no "id" top-level field), modifiedCount=0 and the flag stays true. Next dedup attempt will be blocked by the atomic guard (line 99).

**Workaround:** Manual database update to clear flag, or wait for MongoDB TTL if one exists (none configured currently).

### Human Verification Required

None — all must-haves can be verified programmatically via code inspection.

### Gaps Summary

**1 critical bug found blocking complete goal achievement:**

The atomic dedup_in_progress flag is set correctly but may not clear on dedup failure due to wrong MongoDB query field in the finally block. This creates a potential permanent lock scenario where subsequent dedup attempts are blocked until manual database intervention.

**Severity:** High — While the happy path works (dedup succeeds, flag clears via successful save at line 303), any dedup failure (FastAPI timeout, network error, validation error) will leave the flag stuck at true.

**Fix:** Change line 336 from:
```javascript
{ id: clientId }
```
to:
```javascript
{ _id: clientId }
```

**All other must-haves verified.** The phase goal is 99% achieved — dedup runs immediately, preserves review flags, coordinates with payment handler. Only the error-path flag cleanup is broken.

---

_Verified: 2026-01-30T16:30:00Z_
_Verifier: Claude (gsd-verifier)_
