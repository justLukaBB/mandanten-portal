# Phase 2: Payment Status Logic - Research

**Researched:** 2026-01-30
**Domain:** Payment handler status routing logic with MongoDB data validation
**Confidence:** HIGH

## Summary

Payment status logic in the Mandanten Portal determines whether a case auto-approves to `awaiting_client_confirmation` or routes through `creditor_review` based on creditor-level flags and contact data completeness. The current implementation in `zendeskWebhookController.js` explicitly ignores the `needs_manual_review` flag at the creditor level (line 489 comment: "using document flags, NOT creditor.needs_manual_review"), creating a gap where creditors flagged for review during AI deduplication can bypass agent review.

The payment handler exists at `server/controllers/zendeskWebhookController.js:handleUserPaymentConfirmed()` and makes decisions after Phase 1's dedup wait logic ensures data freshness. The implementation needs to check **four creditor-level fields** (needs_manual_review, email, address, name) to determine if ALL creditors pass all checks before auto-approval.

Agent portal filtering (`agentReviewController.js:getAvailableClients`) already correctly surfaces clients with `needs_manual_review = true` creditors OR in `creditor_review` status. No changes needed to agent portal filtering, approval actions, or Zendesk ticket creation — these components work correctly once cases land in `creditor_review` status.

**Primary recommendation:** Modify payment handler decision logic to check `creditor.needs_manual_review` flag alongside contact field validation, routing to `creditor_review` if ANY creditor needs review.

## Standard Stack

The established technologies for this implementation:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | LTS | Runtime environment | Existing backend runtime |
| Express.js | ~4.x | HTTP routing framework | Existing web framework |
| Mongoose | ~6.x | MongoDB ODM | Existing database layer |
| MongoDB | ~5.x | Document database | Existing data store |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| uuid | ~9.x | Generate unique identifiers | Status history entries, transaction IDs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline validation | Joi/Yup schema validators | Overkill for 4 simple field checks, adds dependency |
| Custom helpers | Lodash isEmpty | Already have isMissing() helpers, no need for library |

**Installation:**
No new packages required — existing dependencies cover all needs.

## Architecture Patterns

### Recommended Project Structure
```
server/
├── controllers/
│   ├── zendeskWebhookController.js  # Payment handler (modify here)
│   └── agentReviewController.js     # Agent portal filtering (no changes)
├── models/
│   └── Client.js                    # creditorSchema defines data structure
└── utils/
    └── creditorDeduplication.js     # Helper: documentNeedsManualReview()
```

### Pattern 1: Status Decision Logic
**What:** Sequential checks with fail-fast routing
**When to use:** Payment handler status decisions after dedup completion
**Example:**
```javascript
// Source: zendeskWebhookController.js:500-550 (current implementation)
// This is the EXISTING pattern — needs modification to check needs_manual_review

// Helper to check if creditor needs review
const creditorNeedsManualReview = (creditor) => {
  // Check 1: Creditor-level manual review flag (NEW - currently missing)
  if (creditor.needs_manual_review === true) {
    return true;
  }

  // Check 2: Missing contact fields
  const hasEmail = !isMissingValue(creditor.sender_email || creditor.email);
  const hasAddress = !isMissingValue(creditor.sender_address || creditor.address);
  const hasName = !isMissingValue(creditor.sender_name || creditor.glaeubiger_name);

  if (!hasEmail || !hasAddress || !hasName) {
    return true;
  }

  return false;
};

// Route to creditor_review if ANY creditor needs review
const needsReview = creditors.filter(c => creditorNeedsManualReview(c));
if (needsReview.length > 0) {
  freshClient.current_status = 'creditor_review';
  freshClient.payment_ticket_type = 'manual_review';
} else {
  // Auto-approve: all creditors pass all checks
  freshClient.current_status = 'awaiting_client_confirmation';
  freshClient.payment_ticket_type = 'auto_approved';
  freshClient.admin_approved = true;
}
```

### Pattern 2: Field Name Normalization
**What:** Check multiple field name variants for same data (German/English)
**When to use:** Accessing creditor contact fields that have dual naming conventions
**Example:**
```javascript
// Source: webhookController.js:713-732 (email/address checking)
// Creditor schema has both German (glaeubiger_*) and English (sender_*) field names

const emailFields = {
  email_glaeubiger: creditor.email_glaeubiger,
  sender_email: creditor.sender_email,
  Email_Gläubiger: creditor.Email_Gläubiger,
  creditor_email: creditor.creditor_email
};

const hasEmail = !isMissing(creditor.email_glaeubiger) ||
                 !isMissing(creditor.sender_email) ||
                 !isMissing(creditor.Email_Gläubiger);
```

### Pattern 3: Empty Value Detection
**What:** Comprehensive null/empty/placeholder detection
**When to use:** Validating contact field completeness
**Example:**
```javascript
// Source: zendeskWebhookController.js:503-510 (isMissingValue helper)
const isMissingValue = (val) => {
  if (val === undefined || val === null) return true;
  if (typeof val === 'string') {
    const trimmed = val.trim().toLowerCase();
    if (!trimmed || trimmed === 'nicht gefunden' || trimmed === 'n/a' || trimmed === 'na') return true;
  }
  return false;
};
```

### Anti-Patterns to Avoid
- **Document flags only**: Current code checks only `doc.manual_review_required` and ignores `creditor.needs_manual_review` — Phase 2 must check BOTH (creditor flag takes precedence)
- **Single field name assumption**: Creditor fields have multiple naming conventions (German/English) — always check all variants
- **Truthy checks for missing data**: Empty strings, 'N/A', 'nicht gefunden' all represent missing data — use comprehensive isMissing() helper

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Creditor field name variants | Custom field accessor | Check both German and English field names inline | Multiple aliases exist in schema, inline OR checks are clearest |
| Missing value detection | Simple null check | Existing isMissingValue() helper in payment handler | Handles null/undefined/empty/placeholder strings comprehensively |
| Document review flag checking | Custom flag iterator | `documentNeedsManualReview()` from creditorDeduplication.js | Already checks all three document-level flag locations |
| Dedup wait timing | Custom polling logic | Phase 1's waitForDedupIfNeeded() | Already implemented with 5-minute window, 60s timeout, 2s polling |

**Key insight:** The payment handler already has 90% of needed validation helpers. Only missing piece is checking `creditor.needs_manual_review` flag before other checks.

## Common Pitfalls

### Pitfall 1: Checking Document Flags Instead of Creditor Flags
**What goes wrong:** Payment handler only checks `doc.manual_review_required` and misses creditors flagged during deduplication (which sets `creditor.needs_manual_review`)
**Why it happens:** Historical code comment at line 489 explicitly says "using document flags, NOT creditor.needs_manual_review" — suggests intentional decision that no longer reflects requirements
**How to avoid:** Check creditor-level `needs_manual_review` flag FIRST before any other checks. If ANY creditor has this flag, route to creditor_review immediately.
**Warning signs:** Auto-approved cases appearing in agent portal queue because creditors have needs_manual_review=true but status is awaiting_client_confirmation

### Pitfall 2: Field Name Variants (German/English)
**What goes wrong:** Checking only `creditor.sender_email` misses emails stored in `creditor.email_glaeubiger` — creditor appears to have missing email when data exists under different field name
**Why it happens:** Schema evolved over time, AI deduplication uses different naming than document extraction. Both German (glaeubiger_*) and English (sender_*) field names exist in parallel.
**How to avoid:** Always check both naming conventions with OR logic: `creditor.sender_email || creditor.email_glaeubiger`
**Warning signs:** Console logs showing "missing email" but creditor has email in Zendesk ticket or agent portal

### Pitfall 3: Incomplete "Missing Value" Detection
**What goes wrong:** Checking `if (!creditor.email)` misses placeholder values like 'N/A', 'nicht gefunden', empty strings — creditor passes validation with non-functional data
**Why it happens:** Document processing and DB enrichment sometimes write placeholder strings instead of leaving fields null/undefined
**How to avoid:** Use existing `isMissingValue()` helper that checks: null, undefined, empty string, whitespace-only, 'n/a', 'na', 'nicht gefunden'
**Warning signs:** Email sending fails after auto-approval because contact fields contain 'N/A' strings

### Pitfall 4: Status Transition Without History Entry
**What goes wrong:** Status changes without corresponding `status_history` entry — debugging "how did this client reach this status?" becomes impossible
**Why it happens:** Forgetting to add history entry when setting `client.current_status`
**How to avoid:** Every status change needs matching `client.status_history.push()` with changed_by, metadata
**Warning signs:** Status field updated but status_history array is missing transitions, audit trail incomplete

## Code Examples

Verified patterns from official sources:

### Payment Handler Status Decision (needs modification)
```javascript
// Source: server/controllers/zendeskWebhookController.js:500-592
// Location: handleUserPaymentConfirmed() method
// This is the CURRENT implementation — shows WHERE to add needs_manual_review check

// Helper to check if creditor needs review
const creditorNeedsManualReview = (creditor) => {
  // CURRENT CODE: Only checks document flags via getDocumentsForCreditor()
  // NEEDED: Check creditor.needs_manual_review FIRST

  // *** ADD THIS CHECK FIRST ***
  if (creditor.needs_manual_review === true) {
    return true;
  }

  // Check contact fields (already exists)
  const creditorEmail = creditor.email || creditor.sender_email;
  const creditorAddress = creditor.address || creditor.sender_address;
  const creditorName = creditor.sender_name || creditor.glaeubiger_name;

  const missingEmail = isMissingValue(creditorEmail);
  const missingAddress = isMissingValue(creditorAddress);
  const missingName = isMissingValue(creditorName);

  return missingEmail || missingAddress || missingName;
};

// Route based on creditor checks
const needsReview = creditors.filter(c => creditorNeedsManualReview(c));

if (needsReview.length > 0) {
  freshClient.current_status = 'creditor_review';
  freshClient.payment_ticket_type = 'manual_review';
} else {
  // Auto-approved path
  freshClient.current_status = 'awaiting_client_confirmation';
  freshClient.payment_ticket_type = 'auto_approved';
  freshClient.admin_approved = true;
  freshClient.admin_approved_at = new Date();

  // Add status history
  freshClient.status_history.push({
    id: uuidv4(),
    status: 'awaiting_client_confirmation',
    changed_by: 'system',
    metadata: {
      reason: 'Auto-approved: All creditors pass all checks',
      creditors_count: creditors.length,
      auto_approved: true
    }
  });
}
```

### Creditor Field Normalization
```javascript
// Source: server/utils/creditorDeduplication.js:196-226
// Shows how to handle German/English field name variants

// Email checking across all field name variants
const getCreditorEmail = (creditor) => {
  return creditor.sender_email ||
         creditor.email_glaeubiger ||
         creditor.Email_Gläubiger ||
         creditor.creditor_email;
};

// Address checking across all field name variants
const getCreditorAddress = (creditor) => {
  return creditor.sender_address ||
         creditor.glaeubiger_adresse ||
         creditor.Gläubiger_Adresse ||
         creditor.creditor_address;
};

// Name checking across all field name variants
const getCreditorName = (creditor) => {
  return creditor.sender_name ||
         creditor.glaeubiger_name;
};
```

### Empty Value Detection
```javascript
// Source: server/controllers/zendeskWebhookController.js:503-510
// Already exists in payment handler — reuse this

const isMissingValue = (val) => {
  if (val === undefined || val === null) return true;
  if (typeof val === 'string') {
    const trimmed = val.trim().toLowerCase();
    if (!trimmed) return true;
    if (trimmed === 'nicht gefunden' || trimmed === 'n/a' || trimmed === 'na') return true;
  }
  return false;
};
```

### Agent Portal Query (no changes needed)
```javascript
// Source: server/controllers/agentReviewController.js:276-295
// Shows EXISTING filtering logic that already works correctly

// Find clients needing review (already correct)
const clients = await Client.find({
  $or: [
    {
      final_creditor_list: {
        $elemMatch: { needs_manual_review: true }
      }
    },
    { current_status: 'creditor_review' },
    {
      $and: [
        { current_status: 'awaiting_client_confirmation' },
        {
          final_creditor_list: {
            $elemMatch: { needs_manual_review: true }
          }
        }
      ]
    }
  ]
});

// NOTE: This query is ALREADY CORRECT — it finds clients with:
// 1. Any creditor with needs_manual_review=true
// 2. Status is creditor_review
// 3. Both of above
// Phase 2 just needs to ensure payment handler sets status correctly
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Document-level flags only | Document + creditor-level flags | Phase 2 (this work) | Creditors flagged during dedup now route to review |
| 30-minute dedup timer | Immediate dedup after last document | Phase 1 (completed) | Payment handler sees post-dedup data, not stale pre-dedup state |
| No dedup wait | 5-minute window wait for dedup | Phase 1 (completed) | Race condition eliminated, payment decisions use fresh data |

**Deprecated/outdated:**
- Checking only document flags for review routing — dedup sets creditor-level flags that must also be checked
- Assuming single field name per data type — schema has evolved to include both German and English variants

## Open Questions

Things that couldn't be fully resolved:

1. **Edge case: Empty creditor list**
   - What we know: Payment handler checks `creditors.length > 0` before email sending (line 640) but not before status decision
   - What's unclear: Should empty `final_creditor_list` route to `creditor_review` or `awaiting_client_confirmation`?
   - Recommendation: Route to `creditor_review` — zero creditors is abnormal after payment and needs human verification. Add explicit check: `if (creditors.length === 0) { route to creditor_review }`

2. **Field priority when multiple variants exist**
   - What we know: Creditors can have email in both `sender_email` and `email_glaeubiger`, potentially with different values
   - What's unclear: If both exist but differ, which takes precedence?
   - Recommendation: Use OR logic (any non-empty value passes) rather than choosing one. If conflict detection needed, that's a separate concern outside Phase 2 scope.

3. **Retroactive status correction**
   - What we know: Context says "no retroactive changes — only apply new logic to cases going forward"
   - What's unclear: What about cases currently in `awaiting_client_confirmation` that SHOULD be in `creditor_review` based on new logic?
   - Recommendation: Accept constraint — don't retroactively change status. Document this as known limitation: cases approved before Phase 2 deployment remain auto-approved even if they wouldn't pass new checks.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis**:
  - `server/controllers/zendeskWebhookController.js:414-718` - Payment handler implementation
  - `server/controllers/agentReviewController.js:264-400` - Agent portal filtering
  - `server/models/Client.js:80-184` - Creditor schema definition
  - `server/utils/creditorDeduplication.js:8-30` - Document review flag helpers
- **Phase documentation**:
  - `.planning/phases/02-payment-status-logic/02-CONTEXT.md` - User decisions and requirements
  - `.planning/PROJECT.md` - Project goals and constraints
  - `.planning/REQUIREMENTS.md` - Requirements PAY-01, PAY-02, PAY-03

### Secondary (MEDIUM confidence)
- **Phase 1 implementation**: Dedup wait logic pattern at `zendeskWebhookController.js:29-65` provides template for pre-decision data validation

### Tertiary (LOW confidence)
- None — all findings verified against actual codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies, uses existing Node.js/Express/MongoDB/Mongoose
- Architecture: HIGH - Patterns verified in existing codebase, minimal modifications needed
- Pitfalls: HIGH - All pitfalls documented from actual bugs/comments in current code

**Research date:** 2026-01-30
**Valid until:** 30 days (stable domain — no fast-moving dependencies)
