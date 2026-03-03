# Phase 38: Fix Mongoose Schema Gap — Persist Calculation Fields - Research

**Researched:** 2026-03-03
**Domain:** Mongoose schema design, strict mode behavior, subdocument field declaration
**Confidence:** HIGH

## Summary

This phase has a single, precisely diagnosed root cause: 5 fields written by Phase 31's calculation service (`creditor_calculations`, `calculation_status`, `calculation_error`, `calculated_at`, `total_debt`) are not declared in the `second_letter_financial_snapshot` subdocument schema in `server/models/Client.js`. Mongoose's default `strict: true` mode silently discards any field in a `$set` update that is not declared in the schema. No error is thrown. The data is simply lost.

The fix is surgical: add the 5 missing field declarations to the existing subdocument definition at lines 655–678 of `server/models/Client.js`. No migration script is needed — once the schema declares the fields, subsequent `$set` writes will persist correctly. Existing documents with the snapshot missing those fields will simply return `undefined` for them, which all read-side guards already handle (e.g., `snapshot.calculation_status !== 'completed'` evaluates to `undefined !== 'completed'` which is the current blocking behavior).

After adding the 5 fields, two additional cleanup tasks are required: (1) update `REQUIREMENTS.md` to flip checkboxes and traceability for the 8 now-unblocked requirements, and (2) verify the audit findings are now resolved. No service code changes are needed — all Phase 31, 32, 33, 35, and 36 implementations are correct and will work immediately once the schema gap is closed.

**Primary recommendation:** Add 5 field declarations to `second_letter_financial_snapshot` in `server/models/Client.js`. That is the entire code change. Everything else is documentation cleanup.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CALC-04 | Tilgungsangebot pro Gläubiger berechnet und im Snapshot gespeichert | Adding `creditor_calculations` array to schema allows Phase 31's `$set` to persist. Calculation logic already correct per Phase 31 VERIFICATION.md. |
| DOC-01 | SecondLetterDocumentGenerator erstellt (spiegelt FirstRoundDocumentGenerator) | Generator already implemented (Phase 32+36). Blocked at route guard `snapshot.calculation_status !== 'completed'` which always blocks because `calculation_status` not in schema. Adding field unblocks. |
| DOC-02 | Template-Branching: plan_type == RATENPLAN / NULLPLAN Template | Branching logic correct in `generateForSingleCreditor`. Blocked at same guard. Adding `calculation_status` to schema unblocks. |
| DOC-03 | Template-Variablen befüllt: per-creditor financials from creditor_calculations | `prepareTemplateData` reads from `snapshot.creditor_calculations`. Array never persists because field not in schema. Adding field fixes persistence. |
| DOC-04 | Ein DOCX pro Gläubiger generiert, gespeichert in generated_documents/second_round/ | Generation loop correct. Blocked at route guard. Schema fix unblocks. |
| SEND-01 | Resend Email pro Gläubiger mit DOCX Attachment | `sendSecondRoundEmail` implemented correctly. `dispatchSecondLetterEmails` never reached due to blocked route. Schema fix unblocks. |
| SEND-03 | Zendesk Audit-Comment pro erfolgreichem Versand | Zendesk comment logic correct. Never executed because send workflow blocked. Schema fix unblocks. |
| SEND-04 | Status-Übergang FORM_SUBMITTED → SENT nach erfolgreichem Versand | Atomic transition implemented correctly. Never reached because send workflow blocked. Schema fix unblocks. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Mongoose | Already installed | ODM, subdocument schema definition | Project-wide ORM — not negotiable |

### Supporting
None — no new packages needed. This is a pure schema declaration change.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Adding fields to schema | Use `strict: false` on subdocument | `strict: false` is dangerous — would allow arbitrary unvalidated data into the snapshot. Schema declaration is the correct fix. |
| Adding fields to schema | Raw MongoDB driver bypass | Would undermine the schema as source of truth and break all ODM-level validation. Not appropriate. |

**Installation:**
No new packages required.

## Architecture Patterns

### Recommended Project Structure
No structural changes — single file edit in `server/models/Client.js`.

### Pattern 1: Mongoose Subdocument Field Declaration
**What:** Declare all fields that any service writes via `$set` inside the subdocument schema object. Mongoose strict mode enforces the schema as a whitelist — undeclared fields in `$set` operations are silently discarded.
**When to use:** Whenever a service adds new fields to an existing subdocument via `findByIdAndUpdate`.
**Example:**
```javascript
// In server/models/Client.js — second_letter_financial_snapshot subdocument
// ADD these 5 fields after the existing snapshot_created_at field:

creditor_calculations: [{
  creditor_id: String,
  creditor_name: String,
  claim_amount: Number,
  tilgungsangebot: Number,
  quota_percentage: Number
}],
calculation_status: {
  type: String,
  enum: ['completed', 'failed']
},
calculation_error: String,
calculated_at: Date,
total_debt: Number
```

### Pattern 2: Dotted-path $set into subdocument
**What:** Both write sites (clientPortalController.js and admin-second-letter.js) use the dotted-path pattern for subdocument field updates:
```javascript
calcUpdate['second_letter_financial_snapshot.creditor_calculations'] = calcResult.creditorCalculations;
calcUpdate['second_letter_financial_snapshot.calculation_status'] = 'completed';
// ... etc
await Client.findByIdAndUpdate(client._id, { $set: calcUpdate });
```
**When to use:** Already in place and correct. Schema fix makes these writes effective.

### Anti-Patterns to Avoid
- **Using `strict: false` on the subdocument:** Would disable validation for the entire subdocument, not just the 5 missing fields. Schema declaration is the correct approach.
- **Adding a migration script:** Not needed. Once fields are declared, subsequent writes will persist. Existing documents without the fields will simply have `undefined` for them — no data corruption risk.
- **Changing write-side code:** The `$set` patterns in `clientPortalController.js` (line 1467–1479) and `admin-second-letter.js` (lines 68–76) are already correct. Do not touch them.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Persisting calculation fields | Custom middleware or post-save hooks | Declare fields in schema | Mongoose handles persistence automatically once declared — hooks add unnecessary complexity |
| Data migration for existing documents | Per-document updateMany script | Nothing — no migration needed | Undefined fields in existing documents are safe; calculation runs on demand and overwrites |

**Key insight:** Mongoose strict mode is a feature, not a bug. The fix is declaration, not workaround.

## Common Pitfalls

### Pitfall 1: Forgetting `creditor_calculations` is an array of subdocuments
**What goes wrong:** Declaring `creditor_calculations: [{}]` or `creditor_calculations: Array` instead of a typed array schema. Mongoose needs the subdocument structure declared so it can handle casting.
**Why it happens:** Developer treats the array as opaque data.
**How to avoid:** Use the typed array schema with explicit field names matching what Phase 31 writes: `creditor_id`, `creditor_name`, `claim_amount`, `tilgungsangebot`, `quota_percentage`.
**Warning signs:** After adding the field, if `creditor_calculations` persists as an empty array despite non-empty input, the subdocument type mismatch is the cause.

### Pitfall 2: `calculation_error: null` write after `$set`
**What goes wrong:** On success, `calcUpdate['second_letter_financial_snapshot.calculation_error'] = null` is set. If the field is typed `String`, Mongoose may coerce `null` to `null` (which is valid for String fields with no `required`). This is fine. But if typed incorrectly (e.g., `{ type: String, required: true }`), the null would fail validation.
**Why it happens:** Cargo-culting required on optional error fields.
**How to avoid:** Declare as plain `calculation_error: String` (no required, no default). Null writes are valid for non-required String fields.

### Pitfall 3: `calculation_status` enum vs. missing value
**What goes wrong:** The route guard in `admin-second-letter.js` line 121 checks `snapshot.calculation_status !== 'completed'`. If the enum is declared with only `['completed', 'failed']`, a document where the field was never set will have `undefined` — which still fails the guard correctly (client must run calculation first). This is intentional behavior.
**Why it happens:** Confusion between "field missing from schema" (current broken state) and "field present but value is undefined" (correct post-fix behavior for uncalculated clients).
**How to avoid:** No default value on `calculation_status` — `undefined` is the correct sentinel for "calculation not yet run."

### Pitfall 4: Wrong location in Client.js
**What goes wrong:** Adding the 5 fields outside the `second_letter_financial_snapshot` subdocument block (e.g., at the top level of the schema).
**Why it happens:** Client.js is a large file (700+ lines); the subdocument definition spans lines 655–678.
**How to avoid:** Insert the 5 fields inside the `second_letter_financial_snapshot: { ... }` object, after `snapshot_created_at: Date` (the current last field at line 677), before the closing `}` at line 678.

### Pitfall 5: Confusing two separate write sites
**What goes wrong:** Testing only the form-submit path (clientPortalController.js line 1479) and not the recalculate endpoint (admin-second-letter.js line 78). Both use the same `$set` pattern and both will benefit from the schema fix. Verification must confirm both paths.
**Why it happens:** Phase 31 calculation runs on form submit; Phase 36 has an additional recalculate endpoint for admin use.
**How to avoid:** After the schema fix, manually verify both: (a) form submit triggers calculation and calculation_status persists, (b) recalculate endpoint also persists.

## Code Examples

### Current schema (lines 654–678 of server/models/Client.js) — BEFORE fix
```javascript
// Financial snapshot frozen at form submission — DOCX generation reads from this, not live data
second_letter_financial_snapshot: {
  monthly_net_income: Number,
  marital_status: {
    type: String,
    enum: ['ledig', 'verheiratet', 'geschieden', 'verwitwet', 'getrennt_lebend']
  },
  number_of_dependents: { type: Number, default: 0 },
  income_source: {
    type: String,
    enum: ['angestellt', 'selbststaendig', 'arbeitslos', 'rentner', 'in_ausbildung']
  },
  has_garnishment: { type: Boolean, default: false },
  new_creditors: [{
    name: String,
    amount: Number
  }],
  plan_type: {
    type: String,
    enum: ['RATENPLAN', 'NULLPLAN']
  },
  garnishable_amount: Number,
  monthly_rate: Number,
  snapshot_created_at: Date
  // <-- 5 missing fields below
},
```

### Target schema (lines 654–678 of server/models/Client.js) — AFTER fix
```javascript
// Financial snapshot frozen at form submission — DOCX generation reads from this, not live data
second_letter_financial_snapshot: {
  monthly_net_income: Number,
  marital_status: {
    type: String,
    enum: ['ledig', 'verheiratet', 'geschieden', 'verwitwet', 'getrennt_lebend']
  },
  number_of_dependents: { type: Number, default: 0 },
  income_source: {
    type: String,
    enum: ['angestellt', 'selbststaendig', 'arbeitslos', 'rentner', 'in_ausbildung']
  },
  has_garnishment: { type: Boolean, default: false },
  new_creditors: [{
    name: String,
    amount: Number
  }],
  plan_type: {
    type: String,
    enum: ['RATENPLAN', 'NULLPLAN']
  },
  garnishable_amount: Number,
  monthly_rate: Number,
  snapshot_created_at: Date,
  // Phase 38: calculation result fields — declared so Mongoose strict mode persists them
  creditor_calculations: [{
    creditor_id: String,
    creditor_name: String,
    claim_amount: Number,
    tilgungsangebot: Number,
    quota_percentage: Number
  }],
  calculation_status: {
    type: String,
    enum: ['completed', 'failed']
  },
  calculation_error: String,
  calculated_at: Date,
  total_debt: Number
},
```

### Write sites that will start working immediately (no changes needed)
```javascript
// clientPortalController.js lines 1464–1479 — form submit path
if (calcResult.success) {
  calcUpdate['second_letter_financial_snapshot.garnishable_amount'] = calcResult.garnishableAmount;
  calcUpdate['second_letter_financial_snapshot.plan_type'] = calcResult.planType;
  calcUpdate['second_letter_financial_snapshot.total_debt'] = calcResult.totalDebt;
  calcUpdate['second_letter_financial_snapshot.creditor_calculations'] = calcResult.creditorCalculations;
  calcUpdate['second_letter_financial_snapshot.calculation_status'] = 'completed';
  calcUpdate['second_letter_financial_snapshot.calculation_error'] = null;
  calcUpdate['second_letter_financial_snapshot.calculated_at'] = new Date();
}
await Client.findByIdAndUpdate(updatedClient._id, { $set: calcUpdate });

// admin-second-letter.js lines 65–78 — recalculate endpoint path (identical pattern)
calcUpdate['second_letter_financial_snapshot.total_debt'] = calcResult.totalDebt;
calcUpdate['second_letter_financial_snapshot.creditor_calculations'] = calcResult.creditorCalculations;
calcUpdate['second_letter_financial_snapshot.calculation_status'] = 'completed';
// ...
await Client.findByIdAndUpdate(client._id, { $set: calcUpdate });
```

### Route guard that will unblock (no changes needed)
```javascript
// admin-second-letter.js line 121 — currently always blocks
if (!snapshot || snapshot.calculation_status !== 'completed') {
  return res.status(400).json({ ... });
}
// After schema fix: calculation_status persists as 'completed' → guard passes → DOCX + email dispatch proceeds
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Mongoose 4.x `strict: false` as default | `strict: true` as default (Mongoose 5+) | Mongoose 5.0 (2018) | Undeclared fields in $set silently dropped — schema is the whitelist |
| Subdocument fields added ad-hoc | All fields must be declared before any write | Ongoing since Mongoose 5 | Cross-phase schema coordination is a hard requirement |

**Note:** No deprecations or state-of-the-art concerns apply here — this is standard Mongoose schema management, fully stable, well-documented behavior.

## Open Questions

1. **Are DOCX templates in place?**
   - What we know: Phase 32 VERIFICATION.md notes templates (`2.Schreiben_Ratenplan.docx`, `2.Schreiben_Nullplan.docx`) as an external pre-condition. v10 audit tech debt confirms they are absent from `server/templates/`.
   - What's unclear: Whether they have been placed by the user since the audit.
   - Recommendation: After schema fix, attempt end-to-end send. The `SecondLetterDocumentGenerator` will fail with a clear file-not-found error if templates are missing. Document this as the next blocker if encountered — it's outside Phase 38's code scope.

2. **REQUIREMENTS.md documentation cleanup scope**
   - What we know: The audit identified 12 documentation items needing update (7 checkboxes, 3 traceability status entries, 2 phase attribution rows).
   - What's unclear: Whether Phase 38 should do full cleanup of all 12 items or just the 8 requirements directly satisfied by this phase.
   - Recommendation: Phase 38 closes all 8 blocked requirements (CALC-04, DOC-01–04, SEND-01, SEND-03, SEND-04). Update all 8 plus any directly related traceability. Defer the 4 UI items (UI-01–04) and 2 others (NOTIF-02, SEND-02) to avoid scope creep — they are satisfied but their checkboxes are a separate cleanup concern.

## Sources

### Primary (HIGH confidence)
- Direct code inspection — `server/models/Client.js` lines 654–678: confirmed 5 fields absent from schema
- Direct code inspection — `server/controllers/clientPortalController.js` lines 1464–1479: confirmed write pattern
- Direct code inspection — `server/routes/admin-second-letter.js` lines 65–78, 121: confirmed write pattern and guard
- Direct code inspection — `server/services/secondLetterDocumentGenerator.js` lines 204, 242, 393: confirmed read pattern expects missing fields
- `.planning/v10-MILESTONE-AUDIT.md`: root cause analysis and exact field list already documented

### Secondary (MEDIUM confidence)
- Mongoose documentation (training knowledge, stable behavior since v5): `strict: true` silently drops undeclared fields in `$set`

### Tertiary (LOW confidence)
None — all findings are from direct code inspection of this codebase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — single file, no new dependencies, pure schema declaration
- Architecture: HIGH — root cause fully traced, write/read sites all identified
- Pitfalls: HIGH — derived from actual code inspection of the exact write and guard patterns

**Research date:** 2026-03-03
**Valid until:** Stable — no fast-moving dependencies. Valid until schema file changes.
