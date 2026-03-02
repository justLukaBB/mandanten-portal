# Phase 35: Bug Fixes — URL, _id, and Field Name Mismatches - Research

**Researched:** 2026-03-03
**Domain:** Backend bug fixes — Node.js/Mongoose, creditor subdocument positional updates, template variable mapping
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NOTIF-02 | Email deep-link to Portal form with token | Fix URL in `secondLetterTriggerService.js` line 93: `/second-letter?token=` → `/portal/second-letter-form?token=` |
| SEND-02 | Per-creditor tracking: `second_letter_sent_at`, `second_letter_email_sent_at`, `second_letter_document_filename` updated after send | `secondLetterService.js` line 147 is already correct (`'final_creditor_list.id': creditor.id`). SEND-02 may already be satisfied — verification needed. |
| DOC-03 | Template variables populated: marital status and dependents count | `prepareTemplateData()` reads `snapshot.familienstand` / `snapshot.anzahl_unterhaltsberechtigte` but snapshot schema and Phase 30 write `marital_status` / `number_of_dependents`. Add fallback pattern (already implemented in `secondLetterCalculationService.js`). |
| DOC-04 | One DOCX per creditor saved to `generated_documents/second_round/` + DB tracking field updated | `secondLetterDocumentGenerator.js` uses `'final_creditor_list._id'` in two DB updates — must be `'final_creditor_list.id'`. Also `creditor._id?.toString()` throughout must become `creditor.id`. |
</phase_requirements>

---

## Summary

Phase 35 is a targeted bug-fix phase with no new features. It closes four data-level integration gaps identified by the v10 milestone audit. All bugs are in server-side JavaScript (Node.js/Mongoose) — no frontend changes required.

The bugs share a common root: mismatches between how data was designed and how it is accessed. The creditor subdocument schema uses `{ _id: false }` with an explicit `id: String` field, but multiple services reference `creditor._id` (always `undefined`) and use `'final_creditor_list._id'` in positional update filters (which will never match). Separately, the financial snapshot schema stores `marital_status` / `number_of_dependents` (English convention, from Phase 30 form), but the document generator reads `familienstand` / `anzahl_unterhaltsberechtigte` (German convention from legacy schema). A calculation service bug also stores empty string as `creditor_id` in `creditor_calculations`, breaking the per-creditor lookup in `prepareTemplateData`.

**Primary recommendation:** Fix all five bug sites in a single plan: (1) URL in triggerService, (2) field names in prepareTemplateData, (3) `._id` → `.id` in generateForAllCreditors DB update, (4) `._id` → `.id` in generateForSingleCreditorById, (5) `creditor._id?.toString()` → `creditor.id` in creditor_id stores across documentGenerator and calculationService, (6) verify SEND-02 is already fixed.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Mongoose | ~8.x (project) | MongoDB ODM — positional `$` operator for array element updates | Already in use across all services |
| Node.js/Express | ~20.x (project) | Runtime — no new libraries needed | All fixes are logic corrections, not new dependencies |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none required) | — | All fixes are one-liners in existing files | No new packages |

**Installation:** No new packages required.

---

## Architecture Patterns

### Mongoose Positional Update Pattern (the correct one)

When updating a subdocument in an array, the filter must match the array element using the same field that identifies it in the schema.

**creditorSchema** (line 85, `server/models/Client.js`) has `{ _id: false }` and uses:
```js
id: { type: String, required: true }
```

There is NO `_id` on creditor documents. Mongoose does not auto-generate `_id` when `{ _id: false }` is set.

**Correct positional update pattern:**
```js
// Source: confirmed by reading server/models/Client.js lines 85-219
await Client.updateOne(
  { _id: client._id, 'final_creditor_list.id': creditor.id },  // <-- .id not ._id
  { $set: { 'final_creditor_list.$.second_letter_document_filename': filename } }
);
```

**Wrong pattern (currently in document generator):**
```js
// BUG: 'final_creditor_list._id' never matches since creditorSchema has { _id: false }
await Client.findOneAndUpdate(
  { _id: client._id, 'final_creditor_list._id': result.creditor_id },  // WRONG
  { $set: { 'final_creditor_list.$.second_letter_document_filename': result.filename } }
);
```

### Field Name Fallback Pattern (already proven in project)

`secondLetterCalculationService.js` already implements the correct fallback pattern for the field name mismatch:

```js
// Source: server/services/secondLetterCalculationService.js lines 61-65
const familienstand = snapshot.familienstand || snapshot.marital_status;
const anzahlUnterhaltsberechtigte =
    snapshot.anzahl_unterhaltsberechtigte != null
        ? snapshot.anzahl_unterhaltsberechtigte
        : (snapshot.number_of_dependents || 0);
```

`prepareTemplateData()` in `secondLetterDocumentGenerator.js` must adopt the same pattern.

### Snapshot Field Name Convention

Phase 30's form submit handler (`clientPortalController.js` lines 1434-1444) writes the snapshot with English field names:
```js
c.second_letter_financial_snapshot = {
  monthly_net_income: parseFloat(monthly_net_income),
  marital_status: marital_status,          // English key
  number_of_dependents: parseInt(number_of_dependents),  // English key
  ...
};
```

The schema (`Client.js` lines 655-678) confirms:
```js
second_letter_financial_snapshot: {
  monthly_net_income: Number,
  marital_status: { type: String, enum: [...] },
  number_of_dependents: { type: Number, default: 0 },
  ...
}
```

There is no `familienstand` or `anzahl_unterhaltsberechtigte` field in `second_letter_financial_snapshot`. The document generator reading those names will always get `undefined`.

---

## Complete Bug Map (Phase 35 scope)

### Bug 1 — NOTIF-02: URL mismatch in email deep-link
**File:** `server/services/secondLetterTriggerService.js`
**Line:** 93
**Current:**
```js
const portalUrl = `${baseUrl}/second-letter?token=${client.second_letter_form_token}`;
```
**Correct:**
```js
const portalUrl = `${baseUrl}/portal/second-letter-form?token=${client.second_letter_form_token}`;
```
**Evidence:** `src/App.tsx` line 118 mounts `SecondLetterForm` at `/portal/second-letter-form`. The form reads `?token=` query param to authenticate. One-character path change fixes this.

---

### Bug 2 — DOC-03: Field name mismatch in prepareTemplateData
**File:** `server/services/secondLetterDocumentGenerator.js`
**Lines:** 235–236
**Current:**
```js
'Familienstand': snapshot.familienstand || '',
'Unterhaltsberechtigte': String(snapshot.anzahl_unterhaltsberechtigte || 0),
```
**Correct:**
```js
'Familienstand': snapshot.familienstand || snapshot.marital_status || '',
'Unterhaltsberechtigte': String(snapshot.anzahl_unterhaltsberechtigte ?? snapshot.number_of_dependents ?? 0),
```
**Evidence:** Snapshot schema has `marital_status` and `number_of_dependents`. Phase 30 writes these English names. The German names never exist in the snapshot.

---

### Bug 3 — DOC-04a: creditor_id stored as undefined in generateForSingleCreditor result
**File:** `server/services/secondLetterDocumentGenerator.js`
**Line:** 300
**Current:**
```js
creditor_id: creditor._id?.toString(),
```
**Correct:**
```js
creditor_id: creditor.id,
```
**Evidence:** `creditorSchema` has `{ _id: false }`. `creditor._id` is always `undefined`. `creditor.id` is the `String` identifier.

Same fix needed at:
- Line 341 (error object in the loop): `creditor_id: creditor._id?.toString()` → `creditor_id: creditor.id`

---

### Bug 4 — DOC-04b: DB update uses wrong array filter key in generateForAllCreditors
**File:** `server/services/secondLetterDocumentGenerator.js`
**Lines:** 357–360
**Current:**
```js
await Client.findOneAndUpdate(
  { _id: client._id, 'final_creditor_list._id': result.creditor_id },
  { $set: { 'final_creditor_list.$.second_letter_document_filename': result.filename } }
);
```
**Correct:**
```js
await Client.findOneAndUpdate(
  { _id: client._id, 'final_creditor_list.id': result.creditor_id },
  { $set: { 'final_creditor_list.$.second_letter_document_filename': result.filename } }
);
```
**Evidence:** `creditorSchema` has `id: String` not `_id`. Combined with Bug 3 fix (storing `creditor.id` in `result.creditor_id`), this will work.

---

### Bug 5 — DOC-04c: DB update uses wrong array filter key in generateForSingleCreditorById
**File:** `server/services/secondLetterDocumentGenerator.js`
**Lines:** 397–398 and 409–411
**Line 397-398 current:**
```js
const creditor = (client.final_creditor_list || [])
  .find(c => c._id.toString() === creditorId);
```
**Line 397-398 correct:**
```js
const creditor = (client.final_creditor_list || [])
  .find(c => c.id === creditorId);
```

**Line 409-411 current:**
```js
await Client.findOneAndUpdate(
  { _id: client._id, 'final_creditor_list._id': creditor._id },
  { $set: { 'final_creditor_list.$.second_letter_document_filename': result.filename } }
);
```
**Line 409-411 correct:**
```js
await Client.findOneAndUpdate(
  { _id: client._id, 'final_creditor_list.id': creditor.id },
  { $set: { 'final_creditor_list.$.second_letter_document_filename': result.filename } }
);
```
**Evidence:** Same `{ _id: false }` issue. `c._id.toString()` throws TypeError since `_id` is undefined.

---

### Bug 6 — Secondary: creditor_id stored as empty string in calculateSecondLetterFinancials
**File:** `server/services/secondLetterCalculationService.js`
**Line:** 145
**Current:**
```js
creditor_id: creditor._id?.toString() || '',
```
**Correct:**
```js
creditor_id: creditor.id || '',
```
**Impact:** This bug means `snapshot.creditor_calculations` stores `creditor_id: ''` for every creditor. When `prepareTemplateData` does:
```js
const creditorId = creditor._id?.toString() || creditor.id;
const calcEntry = (snapshot.creditor_calculations || [])
  .find(c => c.creditor_id === creditorId) || {};
```
…it will search for `creditor.id` (e.g., `"abc-123"`) but all entries have `creditor_id: ''`. No match → `calcEntry` is `{}` → `Forderung`, `Quote`, `Auszahlung` all render as `0,00 €` / `0 %`.

**Fix location:** `secondLetterCalculationService.js` line 145. This affects all new snapshots written after this fix. Existing snapshots in DB would need recalculation (but Phase 35 scope is code fixes; snapshot recalculation is an operational concern for post-fix verification).

---

### Bug 7 — SEND-02: Status check needed
**File:** `server/services/secondLetterService.js`
**Lines:** 146–155
**Current state (after Phase 33):**
```js
await Client.updateOne(
  { _id: client._id, 'final_creditor_list.id': creditor.id },
  { $set: { ... } }
);
```
The audit said this was `final_creditor_list._id` but reading the current file shows it is already `final_creditor_list.id`. **The SEND-02 bug has already been fixed in Phase 33.** SEND-02 verification should confirm the fix is in place, not apply a new one.

**Action for Phase 35:** Verify secondLetterService.js line 147 — if already correct, document SEND-02 as satisfied; no code change needed.

---

### Bug 8 — prepareTemplateData creditorId lookup (compound of Bugs 3 and 6)
**File:** `server/services/secondLetterDocumentGenerator.js`
**Line:** 203
**Current:**
```js
const creditorId = creditor._id?.toString() || creditor.id;
```
Since `creditor._id` is undefined, the fallback to `creditor.id` works correctly here. However, the lookup on line 205 will still fail if Bug 6 is not fixed (stored IDs in creditor_calculations will be empty string, not matching `creditor.id`). Fix Bug 6 first, then this line works correctly as-is.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Positional array update | Custom iteration/replace | Mongoose `$` positional operator with correct filter key | Already in use; just fix the filter key |
| Field name normalization | Conditional rewrite logic | Simple `||` fallback chain | Pattern already proven in calculationService |
| ID field detection | Schema introspection | Just use `creditor.id` directly | Schema is known and stable |

---

## Common Pitfalls

### Pitfall 1: `{ _id: false }` subdocuments do not have `_id`
**What goes wrong:** `creditor._id` is `undefined`. Optional chaining `?._id` silently returns `undefined` instead of throwing. Bugs propagate silently — DB updates match nothing, array finds return nothing.
**Why it happens:** Mongoose omits `_id` entirely when `{ _id: false }` is set. The subdocument has no `_id` field at all.
**How to avoid:** Always look at the schema before writing `._id` on a subdocument. `creditorSchema` has `id: String` — use that.
**Warning signs:** `findOneAndUpdate` returning `null` even though you expect a match. `find()` returning `undefined`.

### Pitfall 2: Snapshot field names differ from legacy `extended_financial_data` field names
**What goes wrong:** Reads of `snapshot.familienstand` and `snapshot.anzahl_unterhaltsberechtigte` return `undefined` because the Phase 30 snapshot uses English names.
**Why it happens:** Two conventions exist in the codebase: legacy German (`extended_financial_data.anzahl_unterhaltsberechtigte`) and Phase 30 English (`second_letter_financial_snapshot.number_of_dependents`). The document generator was written against the wrong convention.
**How to avoid:** Use the fallback pattern already established in calculationService. Always check the snapshot schema directly.

### Pitfall 3: Empty creditor_id in creditor_calculations breaks per-creditor template data
**What goes wrong:** Even after fixing field names in `prepareTemplateData`, the `calcEntry` lookup fails if `creditor_calculations` was stored with empty `creditor_id` strings.
**Why it happens:** `secondLetterCalculationService` line 145 uses `creditor._id?.toString()` (always undefined → empty string from `|| ''`). The stored IDs don't match the actual `creditor.id` values.
**How to avoid:** Fix the calculationService first so future snapshots store correct IDs. For existing snapshots in DB, admin must recalculate.

### Pitfall 4: Order of fixes matters for creditor_calculations lookup
Fix Bug 6 (`calculationService` creditor_id) BEFORE verifying DOC-03. New creditor_calculations entries will have correct IDs after the calculationService fix; the document generator's `prepareTemplateData` will then find them correctly.

### Pitfall 5: Existing snapshots in DB have empty creditor_id strings
After fixing the calculationService, existing snapshots in DB still contain `creditor_id: ''`. These must be recalculated via the admin recalculate endpoint before DOCX generation will produce correct financial figures. This is an operational step, not a code fix — it should be noted in the plan's verification checklist.

---

## Code Examples

### Correct Mongoose Positional Update for creditorSchema
```js
// Source: derived from creditorSchema in server/models/Client.js (lines 85-219, { _id: false })
// creditorSchema has: id: { type: String, required: true }
// Use 'final_creditor_list.id' (NOT 'final_creditor_list._id')

await Client.findOneAndUpdate(
  { _id: client._id, 'final_creditor_list.id': creditor.id },
  { $set: { 'final_creditor_list.$.second_letter_document_filename': result.filename } }
);
```

### Correct Snapshot Field Name Fallback
```js
// Source: pattern from server/services/secondLetterCalculationService.js lines 61-65
// Apply same pattern in prepareTemplateData

'Familienstand': snapshot.familienstand || snapshot.marital_status || '',
'Unterhaltsberechtigte': String(
  snapshot.anzahl_unterhaltsberechtigte ?? snapshot.number_of_dependents ?? 0
),
```

### Correct creditor_id Storage
```js
// Source: derived from creditorSchema { _id: false } + id: String
// Fix secondLetterCalculationService.js line 145

creditorCalculations.push({
  creditor_id: creditor.id || '',    // creditor.id (not creditor._id which is undefined)
  creditor_name: ...,
  claim_amount: creditor.claim_amount,
  tilgungsangebot,
  quota_percentage
});
```

### Correct Deep-Link URL
```js
// Source: src/App.tsx line 118 — SecondLetterForm mounted at /portal/second-letter-form
// Fix secondLetterTriggerService.js line 93

const portalUrl = `${baseUrl}/portal/second-letter-form?token=${client.second_letter_form_token}`;
```

---

## Files to Edit

| File | Lines | Bug(s) | Change |
|------|-------|--------|--------|
| `server/services/secondLetterTriggerService.js` | 93 | NOTIF-02 | URL path fix |
| `server/services/secondLetterDocumentGenerator.js` | 203, 235-236, 300, 341, 357-360, 397-411 | DOC-03, DOC-04 | `._id` → `.id`, field name fallbacks |
| `server/services/secondLetterCalculationService.js` | 145 | Secondary (DOC-03 compound) | `creditor._id?.toString()` → `creditor.id` |
| `server/services/secondLetterService.js` | 147 | SEND-02 (verify only) | Already correct — confirm, no change expected |

---

## State of the Art

| Old Approach (Buggy) | Correct Approach | Impact |
|----------------------|-----------------|--------|
| `creditor._id?.toString()` | `creditor.id` | creditorSchema has `{ _id: false }` — `_id` never exists |
| `'final_creditor_list._id': id` | `'final_creditor_list.id': id` | Positional update filter must use schema field |
| `snapshot.familienstand` | `snapshot.familienstand \|\| snapshot.marital_status` | Phase 30 writes English names to snapshot |
| `/second-letter?token=` | `/portal/second-letter-form?token=` | Form is mounted at the correct path in App.tsx |

---

## Open Questions

1. **SEND-02 already fixed?**
   - What we know: `secondLetterService.js` line 147 currently reads `'final_creditor_list.id': creditor.id` (correct)
   - What's unclear: Was this fixed during Phase 33 execution, or did the audit describe an intent that was already correct?
   - Recommendation: Plan 35-01 should verify line 147, document the finding, and only fix if wrong. If already correct, mark SEND-02 as satisfied in REQUIREMENTS.md.

2. **Existing snapshot recalculation scope**
   - What we know: Any snapshot written before the calculationService fix has `creditor_id: ''` in all `creditor_calculations` entries
   - What's unclear: How many live clients have FORM_SUBMITTED status with existing snapshots?
   - Recommendation: Note in plan verification that admin must run recalculate for FORM_SUBMITTED clients after deploying the fix.

---

## Sources

### Primary (HIGH confidence)
- `server/models/Client.js` lines 85-219 — creditorSchema definition with `{ _id: false }` and `id: String`
- `server/models/Client.js` lines 655-678 — `second_letter_financial_snapshot` schema (English field names)
- `server/services/secondLetterTriggerService.js` line 93 — current buggy URL
- `server/services/secondLetterDocumentGenerator.js` lines 196-415 — all bug locations confirmed by direct read
- `server/services/secondLetterCalculationService.js` lines 61-65, 145 — field fallback (correct) + creditor_id (wrong)
- `server/services/secondLetterService.js` lines 146-155 — SEND-02 already correct
- `server/controllers/clientPortalController.js` lines 1434-1444 — snapshot write with English field names
- `src/App.tsx` lines 118-119 — SecondLetterForm route at `/portal/second-letter-form`
- `.planning/v10-MILESTONE-AUDIT.md` — Audit findings that identified all four requirement gaps

### Secondary (MEDIUM confidence)
- STATE.md v10 Phase 28 decision: "Uses `id` field (not `_id`) in service `findOneAndUpdate` filters — consistent with Client model convention" — confirms `id` is the intended identifier

---

## Metadata

**Confidence breakdown:**
- Bug identification: HIGH — all bugs verified by direct file reads against schema
- Fix correctness: HIGH — pattern already proven in calculationService (lines 61-65)
- SEND-02 status: HIGH — current file shows correct code, likely already fixed
- Existing snapshot impact: MEDIUM — operational concern, not verified by code read alone

**Research date:** 2026-03-03
**Valid until:** 2026-04-03 (stable code, no external dependencies)
