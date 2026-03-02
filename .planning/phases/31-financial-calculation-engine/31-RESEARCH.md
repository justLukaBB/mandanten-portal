# Phase 31: Financial Calculation Engine - Research

**Researched:** 2026-03-02
**Domain:** Server-side financial calculation — §850c ZPO garnishment + pro-rata creditor quota, synchronous within form-submit handler
**Confidence:** HIGH

## Summary

Phase 31 adds a calculation step that runs synchronously inside the form-submit handler introduced in Phase 30. After the snapshot is written to the database, the handler calls `germanGarnishmentCalculator.calculate()` with income and dependents from the snapshot, determines plan type (RATENPLAN vs NULLPLAN), computes per-creditor Tilgungsangebot, and persists all results back into `second_letter_financial_snapshot`. No new library is needed; the calculator already exists at `server/services/germanGarnishmentCalculator.js` and is already instantiated in `server.js`.

The key integration point is the Phase 30 route handler (to be created at `POST /api/second-letter/:clientId/submit-form` or similar). Phase 31 extends that handler with a synchronous calculation step that runs after the snapshot write. If the calculation fails, the snapshot is still saved and the error is marked on the snapshot — the admin can retrigger via a dedicated `POST /api/admin/clients/:clientId/recalculate-second-letter` endpoint.

The main engineering risks are: (1) ensuring the calculator receives exactly the right field from the snapshot (the v10 form uses `anzahl_unterhaltsberechtigte` as the dependents count, not `number_of_children` from `financial_data`); (2) guarding against NaN/Infinity in pro-rata quota when `total_debt` is zero or a `claim_amount` is null; (3) using `Math.round(x * 100) / 100` (consistent with the calculator's own rounding), not `toFixed()` which returns a string.

**Primary recommendation:** Implement the calculation as a pure function `calculateSecondLetterFinancials(snapshot, creditors)` in a new `server/services/secondLetterCalculationService.js` file, call it synchronously from the Phase 30 form-submit handler, and expose a second endpoint for admin recalculation. No new npm packages required.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Berechnungsablauf:**
- Berechnung läuft **synchron als Teil des Form-Submit-Handlers** — ein einziger API-Call: Formular speichern + berechnen + Snapshot updaten (atomisch)
- Bei **Berechnungsfehler**: Formulardaten werden trotzdem gespeichert, Berechnung wird als fehlgeschlagen markiert — Admin kann manuell nachtriggern
- Admin bekommt einen **Recalculate-Button** im Client Detail, um Berechnung nach Datenkorrektur neu auszulösen

**Tilgungsangebot-Formel:**
- **Fester Betrag pro Monat**: Tilgungsangebot pro Gläubiger = (claim_amount / total_debt) * monatlicher pfändbarer Betrag
- **Kein Mindestbetrag** — auch 0.12€/Monat wird als Tilgungsangebot ausgewiesen
- Bei **NULLPLAN**: Tilgungsangebot = 0€ explizit für jeden Gläubiger (einheitliche Datenstruktur)

**Edge Cases & Validierung:**
- **Fehlende claim_amount**: Berechnung bricht ab — Admin muss Daten korrigieren bevor Berechnung laufen kann

### Claude's Discretion
- Rundungsmethode (kaufmännisch vs. abrunden) — konsistent mit bestehendem germanGarnishmentCalculator
- Rundungsreste bei Quote-Verteilung — pragmatischste Variante wählen
- Berechnungspräzision (spät runden vs. pro Schritt) — basierend auf Genauigkeitsanforderungen
- Speicherformat (Euro Float vs. Cent Integer) — konsistent mit bestehendem Datenmodell
- Gesamt-Quote als Prozentwert — basierend auf Template-Anforderungen aus Phase 32
- Validierung aller Eingabedaten vor Berechnung vs. Guards am Ende
- Negative pfändbare Beträge: clampen oder abbrechen
- Einzelgläubiger: Normal berechnen (100% Quote) oder Sonderbehandlung

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CALC-01 | Pfändbarer Betrag nach § 850c ZPO berechnet aus Snapshot-Daten (existierende garnishable_amount Logik) | `germanGarnishmentCalculator.calculate(netIncome, maritalStatus, numberOfDependents)` returns `{ success: boolean, garnishableAmount: number, calculationDetails: {...} }`. Use `calculate()` (the alias for `calculateGarnishableIncome2025()`). Read from `second_letter_financial_snapshot` fields, never from live `financial_data`. |
| CALC-02 | Plan-Typ bestimmt: RATENPLAN (pfändbarer Betrag > 0) oder NULLPLAN (pfändbarer Betrag == 0) — stored in snapshot | Simple conditional after CALC-01: `planType = garnishableAmount > 0 ? 'RATENPLAN' : 'NULLPLAN'`. Enum values are uppercase per CONTEXT.md decisions and roadmap. Store in `second_letter_financial_snapshot.plan_type`. |
| CALC-03 | Quote pro Gläubiger berechnet: (claim_amount / total_debt) * pfändbarer Betrag — mit Zero-Division-Guard | Must guard: `totalDebt === 0` → abort with error. `creditor.claim_amount == null` → abort with error (per CONTEXT.md locked decision). Single creditor edge case: treated normally (100% quota). |
| CALC-04 | Tilgungsangebot pro Gläubiger berechnet und im Snapshot gespeichert — all values are finite numbers (no NaN, no Infinity) | Store result in `second_letter_financial_snapshot.creditor_calculations[]` array. Use `Number.isFinite()` guard before persisting. Round with `Math.round(x * 100) / 100` (consistent with calculator's own rounding pattern). For NULLPLAN: store 0 explicitly. |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `germanGarnishmentCalculator.js` | existing | §850c ZPO garnishment table lookup + calculation | Already implemented, tested, in production for first-round letters. 2025-2026 table is current. |
| Mongoose | existing | Save calculation results back into snapshot subdocument | Already in use across entire server codebase |
| Express | existing | Route handler (Recalculate admin endpoint) | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js built-ins (`Number.isFinite`, `Math.round`) | native | NaN/Infinity guards and rounding | Every calculation result must pass `Number.isFinite()` before storage |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure synchronous calculation in submit handler | Async background job | User decision: synchronous is locked. Background job would complicate error handling and delay snapshot completeness. |
| Cent integer storage | Euro float (existing pattern) | Existing `garnishable_amount` in `financial_data` is stored as Number (Euro float). Stay consistent. Round to 2 decimal places. |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure

```
server/
├── services/
│   └── secondLetterCalculationService.js   # NEW — pure calculation function
├── routes/
│   └── admin-second-letter.js              # Phase 29 already adds this; Phase 31 adds recalculate endpoint
└── controllers/
    └── (Phase 30 form-submit handler)       # Phase 31 integrates synchronous calc here
```

The calculation logic belongs in a dedicated service file, not inline in the route handler. This allows the admin recalculate endpoint to call the same function without duplicating logic.

### Pattern 1: Synchronous Calculation Within Form-Submit Handler

**What:** Phase 30 creates `POST /api/second-letter/submit-form` (or equivalent). Phase 31 extends this handler: after writing the snapshot, it calls `secondLetterCalculationService.calculate(snapshot, creditors)` and persists the result back into the snapshot in the same database write.

**When to use:** Any time the snapshot must be complete immediately upon form submission (so admin can see results, Phase 32 DOCX generation can read from snapshot without a second API call).

**Key implementation detail:** Use a single `safeClientUpdate` or `findOneAndUpdate` call that both writes the snapshot AND the calculation results. Do not use two separate saves — this ensures atomic consistency.

**Example:**
```javascript
// server/services/secondLetterCalculationService.js
const GermanGarnishmentCalculator = require('./germanGarnishmentCalculator');

const calculator = new GermanGarnishmentCalculator();

/**
 * Calculate garnishable amount, plan type, and per-creditor Tilgungsangebot
 * from snapshot data only.
 *
 * @param {Object} snapshot - The second_letter_financial_snapshot (already written to DB)
 * @param {Array}  creditors - client.final_creditor_list array
 * @returns {{ success: boolean, garnishableAmount: number, planType: string,
 *             creditorCalculations: Array, totalDebt: number, error?: string }}
 */
function calculateSecondLetterFinancials(snapshot, creditors) {
    // --- Step 1: CALC-01 — Garnishable amount from snapshot ---
    // snapshot.anzahl_unterhaltsberechtigte is the v10 form field (number of dependents)
    // snapshot.familienstand maps to maritalStatus
    const garnishmentResult = calculator.calculate(
        snapshot.monthly_net_income,
        snapshot.familienstand,        // 'ledig'|'verheiratet'|'geschieden'|'verwitwet'
        snapshot.anzahl_unterhaltsberechtigte || 0
    );

    if (!garnishmentResult.success) {
        return { success: false, error: `Garnishment calculation failed: ${garnishmentResult.error}` };
    }

    // Clamp: garnishable amount cannot be negative (calculator already does Math.min, but guard anyway)
    const garnishableAmount = Math.max(0, garnishmentResult.garnishableAmount);

    // --- Step 2: CALC-02 — Plan type ---
    const planType = garnishableAmount > 0 ? 'RATENPLAN' : 'NULLPLAN';

    // --- Step 3: CALC-03 + CALC-04 — Per-creditor Tilgungsangebot ---

    // Validate: all creditors must have a non-null claim_amount (locked decision)
    const missingClaimAmount = creditors.find(c => c.claim_amount == null);
    if (missingClaimAmount) {
        return {
            success: false,
            error: `Creditor "${missingClaimAmount.sender_name || missingClaimAmount._id}" is missing claim_amount — calculation aborted`
        };
    }

    const totalDebt = creditors.reduce((sum, c) => sum + c.claim_amount, 0);

    // Zero-division guard (CALC-03 requirement)
    if (totalDebt === 0) {
        return { success: false, error: 'Total debt is zero — cannot calculate creditor quotas' };
    }

    const creditorCalculations = creditors.map(creditor => {
        // For NULLPLAN: Tilgungsangebot is explicitly 0 (locked decision)
        const tilgungsangebot = planType === 'NULLPLAN'
            ? 0
            : (creditor.claim_amount / totalDebt) * garnishableAmount;

        const rounded = Math.round(tilgungsangebot * 100) / 100;  // Consistent with calculator rounding

        // Guard: must be finite (CALC-04 requirement)
        if (!Number.isFinite(rounded)) {
            return null;  // Will be caught below
        }

        return {
            creditor_id: creditor._id?.toString() || creditor.id,
            creditor_name: creditor.sender_name || creditor.creditor_name || 'Unbekannt',
            claim_amount: creditor.claim_amount,
            tilgungsangebot: rounded,
            quota_percentage: Math.round((creditor.claim_amount / totalDebt) * 10000) / 100  // e.g. 33.33
        };
    });

    if (creditorCalculations.includes(null)) {
        return { success: false, error: 'Non-finite value in creditor calculation — check claim_amount values' };
    }

    return {
        success: true,
        garnishableAmount,
        planType,
        totalDebt,
        creditorCalculations
    };
}

module.exports = { calculateSecondLetterFinancials };
```

### Pattern 2: Calculation Failure Marking on Snapshot

**What:** If `calculateSecondLetterFinancials()` returns `success: false`, the form-submit handler must still save the form data (snapshot without calculation results) and mark the failure. The admin can then trigger recalculation after correcting the data.

**Example:**
```javascript
// Inside Phase 30 form-submit handler — Phase 31 adds the calculation block

const calcResult = calculateSecondLetterFinancials(newSnapshot, client.final_creditor_list || []);

if (calcResult.success) {
    newSnapshot.garnishable_amount = calcResult.garnishableAmount;
    newSnapshot.plan_type = calcResult.planType;
    newSnapshot.total_debt = calcResult.totalDebt;
    newSnapshot.creditor_calculations = calcResult.creditorCalculations;
    newSnapshot.calculation_status = 'completed';
    newSnapshot.calculated_at = new Date();
} else {
    // Locked decision: save form data, mark calculation as failed
    newSnapshot.calculation_status = 'failed';
    newSnapshot.calculation_error = calcResult.error;
    console.warn(`[SecondLetter] Calculation failed for client ${clientId}: ${calcResult.error}`);
}
```

### Pattern 3: Admin Recalculate Endpoint

**What:** A separate `POST /api/admin/clients/:clientId/recalculate-second-letter` endpoint that re-runs the calculation against the currently stored snapshot. This allows the admin to fix `claim_amount` on a creditor and then retrigger.

**Example:**
```javascript
// server/routes/admin-second-letter.js (Phase 29 creates this file; Phase 31 adds this route)
router.post('/clients/:clientId/recalculate-second-letter', authenticateAdmin, async (req, res) => {
    const client = await Client.findById(req.params.clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const snapshot = client.second_letter_financial_snapshot;
    if (!snapshot) return res.status(400).json({ error: 'No snapshot found — client must submit form first' });

    const calcResult = calculateSecondLetterFinancials(snapshot, client.final_creditor_list || []);

    await Client.findByIdAndUpdate(client._id, {
        $set: {
            'second_letter_financial_snapshot.garnishable_amount': calcResult.success ? calcResult.garnishableAmount : snapshot.garnishable_amount,
            'second_letter_financial_snapshot.plan_type': calcResult.success ? calcResult.planType : snapshot.plan_type,
            'second_letter_financial_snapshot.total_debt': calcResult.success ? calcResult.totalDebt : snapshot.total_debt,
            'second_letter_financial_snapshot.creditor_calculations': calcResult.success ? calcResult.creditorCalculations : snapshot.creditor_calculations,
            'second_letter_financial_snapshot.calculation_status': calcResult.success ? 'completed' : 'failed',
            'second_letter_financial_snapshot.calculation_error': calcResult.success ? null : calcResult.error,
            'second_letter_financial_snapshot.calculated_at': new Date()
        }
    });

    res.json({ success: calcResult.success, error: calcResult.error || null });
});
```

### Snapshot Field Mapping — Critical

The v10 form (Phase 30) captures different field names than the legacy `financial_data`. The calculator must receive:

| Calculator Parameter | Snapshot Field (from Phase 30 form) | Notes |
|---------------------|-------------------------------------|-------|
| `netIncome` | `snapshot.monthly_net_income` | Number, in EUR |
| `maritalStatus` | `snapshot.familienstand` | 'ledig'\|'verheiratet'\|'geschieden'\|'verwitwet'\|'getrennt_lebend' |
| `numberOfChildren` | `snapshot.anzahl_unterhaltsberechtigte` | Number of dependents — v10 term for all maintenance-eligible persons, not just children |

The calculator counts married persons as +1 dependent internally (`if (maritalStatus === 'verheiratet') totalDependents += 1`), so passing `anzahl_unterhaltsberechtigte` (number of non-spouse dependents) + maritalStatus is correct.

### Anti-Patterns to Avoid

- **Reading from live `financial_data`:** Phase 31 must read exclusively from `second_letter_financial_snapshot`. The snapshot was frozen at form submit (Phase 30). Reading from live data would violate snapshot immutability.
- **Using `toFixed()` for money:** Returns a string. Use `Math.round(x * 100) / 100` to stay consistent with the calculator and keep Number type in MongoDB.
- **Two separate DB saves:** Writing the snapshot in one save and the calculation results in a second save creates a race condition window. Use a single `findOneAndUpdate` or `safeClientUpdate` to persist both atomically.
- **Calling `calculateGarnishableAmount` (non-existent method):** The existing `adminFinancialController.js` calls `garnishmentCalculator.calculateGarnishableAmount()` which does NOT exist on the class. Use `calculator.calculate()` (the public alias for `calculateGarnishableIncome2025()`).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| §850c ZPO garnishment table lookup | Custom table lookup | `germanGarnishmentCalculator.calculate(netIncome, maritalStatus, dependents)` | 2025-2026 official table already implemented, tested with edge cases (above/below thresholds, married=+1 dependent), returns `{ success, garnishableAmount, calculationDetails }` |
| Rounding | Custom float arithmetic | `Math.round(x * 100) / 100` | Exactly what the calculator uses on line 422: `Math.round(finalGarnishable * 100) / 100` |
| NaN guard | Try/catch or conditional chains | `Number.isFinite(value)` | Single check that catches both NaN and ±Infinity |

**Key insight:** The entire §850c ZPO logic (table lookup, dependent counting, income clamping) is already production-grade. Phase 31's job is to orchestrate existing pieces, not to reimplement calculation logic.

---

## Common Pitfalls

### Pitfall 1: Wrong Method Name on Calculator
**What goes wrong:** `garnishmentCalculator.calculateGarnishableAmount()` is called (as seen in `adminFinancialController.js` line 31 and 339). This method does NOT exist on `GermanGarnishmentCalculator`. The correct public API is `calculate(netIncome, maritalStatus, numberOfChildren)`.
**Why it happens:** Copy-paste from controller code that appears to have a bug (or references a removed method).
**How to avoid:** Use `calculator.calculate()` exclusively. Verify the method exists in `germanGarnishmentCalculator.js` — confirmed at line 379.
**Warning signs:** `TypeError: garnishmentCalculator.calculateGarnishableAmount is not a function` in server logs.

### Pitfall 2: NaN/Infinity in Quota When claim_amount is 0
**What goes wrong:** A creditor has `claim_amount = 0`. The quota formula `(0 / totalDebt) * garnishableAmount = 0` — this is actually fine. But if `totalDebt` somehow becomes 0 (all creditors have 0 claim), then `0 / 0 = NaN`.
**Why it happens:** The zero-division guard checks `totalDebt === 0` but not individual `claim_amount === 0`. Zero claim amount is legal (quota = 0), but zero total debt means the system has no work to do.
**How to avoid:** Guard only on `totalDebt === 0` and `claim_amount == null`. Allow `claim_amount === 0` (produces quota 0, which is valid).

### Pitfall 3: Wrong Dependents Field
**What goes wrong:** Calculator is called with `snapshot.number_of_children` (from legacy `financial_data`) instead of `snapshot.anzahl_unterhaltsberechtigte` (from v10 form). The garnishable amount will be wrong.
**Why it happens:** Legacy `financial_data.number_of_children` looks correct but Phase 30's snapshot uses `anzahl_unterhaltsberechtigte` (which covers all maintenance-eligible persons, not just children).
**How to avoid:** Always read from snapshot fields set by Phase 30. If `anzahl_unterhaltsberechtigte` is undefined, default to 0 (not to `financial_data.number_of_children`).
**Warning signs:** Calculation produces incorrect amounts for clients with dependents.

### Pitfall 4: String from `toFixed()` Stored in MongoDB Number Field
**What goes wrong:** `tilgungsangebot.toFixed(2)` returns `"123.45"` (string). MongoDB stores it as a string, not Number. Phase 32 template rendering breaks when it tries to do arithmetic on the stored value.
**Why it happens:** `toFixed()` is commonly used for display formatting but returns a string.
**How to avoid:** Use `Math.round(tilgungsangebot * 100) / 100` which returns a Number.

### Pitfall 5: Calculation Results Lost on Save Race
**What goes wrong:** Phase 30 handler saves the snapshot (without calc results), responds 200, then Phase 31 code tries to save calc results via a second write that gets overwritten by a concurrent request.
**Why it happens:** Two-step save pattern in async handlers.
**How to avoid:** The single `safeClientUpdate` or `findOneAndUpdate` call must include BOTH the snapshot fields AND the calculation results before responding.

### Pitfall 6: Enum Case Mismatch
**What goes wrong:** Storing `'ratenplan'` or `'ratenzahlung'` instead of `'RATENPLAN'` (uppercase). Phase 32 template branching reads `plan_type` and does a string comparison. Case mismatch causes wrong template to be selected.
**Why it happens:** Older research docs (STACK.md, ARCHITECTURE.md) use lowercase enum values ('ratenplan', 'ratenzahlung'). The CONTEXT.md locked decision and ROADMAP explicitly use uppercase: RATENPLAN, NULLPLAN.
**How to avoid:** Always use uppercase: `'RATENPLAN'` and `'NULLPLAN'`. These are the authoritative values from v10 decisions.

---

## Code Examples

### Full Calculation Flow (Verified Against Existing Calculator API)

```javascript
// Source: server/services/germanGarnishmentCalculator.js (lines 379-453 verified)
// The `calculate()` method is the correct public API

const GermanGarnishmentCalculator = require('./germanGarnishmentCalculator');
const calculator = new GermanGarnishmentCalculator();

// Step 1: Garnishable amount
const result = calculator.calculate(
    snapshot.monthly_net_income,      // Number, EUR
    snapshot.familienstand,           // 'ledig' | 'verheiratet' | etc.
    snapshot.anzahl_unterhaltsberechtigte || 0  // Number of dependents
);
// Returns: { success: true, garnishableAmount: 234.50, calculationDetails: {...} }
// On error: { success: false, error: 'Net income cannot be negative', garnishableAmount: 0 }

// Step 2: Plan type
const planType = result.garnishableAmount > 0 ? 'RATENPLAN' : 'NULLPLAN';

// Step 3: Validate creditors
// (all must have non-null claim_amount — if any is null, abort)

// Step 4: Total debt
const totalDebt = creditors.reduce((sum, c) => sum + c.claim_amount, 0);
// Guard: if totalDebt === 0, abort

// Step 5: Per-creditor calculation
const creditorCalculations = creditors.map(creditor => {
    const tilgungsangebot = planType === 'NULLPLAN'
        ? 0
        : Math.round((creditor.claim_amount / totalDebt) * result.garnishableAmount * 100) / 100;
    // Number.isFinite(tilgungsangebot) must be true
    return {
        creditor_id: creditor._id?.toString(),
        creditor_name: creditor.sender_name || creditor.creditor_name,
        claim_amount: creditor.claim_amount,
        tilgungsangebot,
        quota_percentage: Math.round((creditor.claim_amount / totalDebt) * 10000) / 100
    };
});
```

### Admin Recalculate Route (Pattern from Existing Admin Routes)

```javascript
// Source: Pattern from server/routes/admin-financial.js factory function style
module.exports = (dependencies) => {
    // ... existing routes from Phase 29 ...

    // Phase 31 addition: Recalculate second letter financials
    router.post('/clients/:clientId/recalculate-second-letter', authenticateAdmin, async (req, res) => {
        try {
            const client = await Client.findById(req.params.clientId);
            if (!client) return res.status(404).json({ error: 'Client not found' });
            if (!client.second_letter_financial_snapshot) {
                return res.status(400).json({ error: 'No snapshot — client must submit form first' });
            }
            // ... call calculateSecondLetterFinancials, persist, respond
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
```

### Snapshot Schema Addition Required by Phase 31

Phase 28 defines the base snapshot schema. Phase 31 requires these additional fields to be present in the `second_letter_financial_snapshot` subdocument schema (must be confirmed/added during Phase 28 if not already there):

```javascript
// Fields Phase 31 WRITES into second_letter_financial_snapshot
garnishable_amount: Number,          // CALC-01 result
plan_type: {                          // CALC-02 result
    type: String,
    enum: ['RATENPLAN', 'NULLPLAN']
},
total_debt: Number,                   // Sum of all creditor claim_amounts
creditor_calculations: [{             // CALC-03/CALC-04 results
    creditor_id: String,
    creditor_name: String,
    claim_amount: Number,
    tilgungsangebot: Number,          // Monthly settlement offer (0 for NULLPLAN)
    quota_percentage: Number          // e.g. 33.33 (for Phase 32 template)
}],
calculation_status: {                 // 'pending' | 'completed' | 'failed'
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
},
calculation_error: String,            // Error message if status = 'failed'
calculated_at: Date                   // Timestamp of last successful calculation
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Garnishment via old 2024 `calculateGarnishableIncome()` method (legacy table) | `calculateGarnishableIncome2025()` via `calculate()` alias — 2025-2026 official table | Phase 9/10 of v9 | Use `calculate()` — it auto-selects current table |
| Pro-rata quota computed ad-hoc in `adminFinancialController.js` (lines 130-141) | Dedicated `secondLetterCalculationService.js` with NaN guards and explicit NULLPLAN handling | Phase 31 introduces this | Separates calculation from route handling, enables testability |

**Deprecated/outdated:**
- `secondRoundManager.js` / `second-round-api.js`: Zendesk-centric old architecture. Do NOT use as pattern or extend. Add deprecation comment only.
- `garnishmentCalculator.calculateGarnishableAmount()`: This method does not exist on the class despite being called in `adminFinancialController.js`. It is a latent bug. Do not replicate.

---

## Open Questions

1. **Snapshot field names defined by Phase 28**
   - What we know: Phase 28 defines the `second_letter_financial_snapshot` subdocument schema. The fields for income, dependents, and marital status are from Phase 30's form submit.
   - What's unclear: Exact field names that Phase 28 will give to the snapshot (e.g., is it `familienstand` or `marital_status`? Is it `anzahl_unterhaltsberechtigte` or `number_of_dependents`?). The FORM-02 requirement and Phase 30 CONTEXT.md use `Anzahl Unterhaltspflichten` for the form field.
   - Recommendation: Before writing Phase 31 code, confirm the exact snapshot field names from the Phase 28 schema. The planner should note this dependency. The research assumes `familienstand` and `anzahl_unterhaltsberechtigte` based on the REQUIREMENTS.md and existing `extended_financial_data` schema, but Phase 28 could choose different names.

2. **`calculation_status` field in Phase 28 schema**
   - What we know: CONTEXT.md requires marking calculation as failed if it errors. This requires a `calculation_status` field on the snapshot.
   - What's unclear: Whether Phase 28 includes this field in its schema or whether Phase 31 needs to add a migration.
   - Recommendation: Planner should coordinate with Phase 28 plan to ensure `calculation_status`, `calculation_error`, and `calculated_at` are included in the snapshot subdocument schema.

3. **Route location for form-submit handler**
   - What we know: Phase 30 creates the portal form submit endpoint. Phase 31 extends that handler.
   - What's unclear: Whether Phase 30 places the submit handler in `client-portal.js` (existing portal routes) or in a new `second-letter-portal.js` route file.
   - Recommendation: Either location is acceptable. The planner should note that Phase 31's integration point depends on what Phase 30 creates.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `server/services/germanGarnishmentCalculator.js` — confirmed `calculate()` method signature (line 379), return shape `{ success, garnishableAmount, calculationDetails }`, rounding pattern `Math.round(x * 100) / 100` (line 422), marital status dependents logic (line 409)
- Direct code inspection: `server/controllers/adminFinancialController.js` — confirmed existing quota calculation pattern (lines 127-148), identified latent bug: `calculateGarnishableAmount()` does not exist
- Direct code inspection: `server/models/Client.js` — confirmed `financial_data`, `extended_financial_data` field structures; confirmed `anzahl_unterhaltsberechtigte` exists in `extended_financial_data` (line 477); confirmed existing enum patterns and `determined_plan_type` structure
- Direct code inspection: `server/controllers/clientPortalController.js` — confirmed `handleSubmitFinancialData` pattern (line 991), `safeClientUpdate` usage, `GermanGarnishmentCalculator` instantiation pattern
- `.planning/phases/31-financial-calculation-engine/31-CONTEXT.md` — locked decisions: synchronous calculation, fail-safe persistence, Tilgungsangebot formula, no minimum amount, null claim_amount aborts

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md` — snapshot field sketch (note: uses lowercase enum 'ratenplan', superseded by CONTEXT.md uppercase RATENPLAN/NULLPLAN)
- `.planning/research/ARCHITECTURE.md` — snapshot schema with `creditor_calculations[]` array, confirmed `calculation_status` concept
- `.planning/STATE.md` — v10 key decisions: "Plan type: RATENPLAN when garnishable_amount > 0, NULLPLAN when == 0", NaN/Infinity guard requirement, snapshot-only generation mandate

### Tertiary (LOW confidence)
- None — all findings backed by direct code inspection or project documents.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — existing code inspected directly, no new dependencies
- Architecture: HIGH — calculation pattern clear from `handleSubmitFinancialData` reference implementation, `safeClientUpdate` pattern confirmed
- Pitfalls: HIGH — latent bug in `adminFinancialController.js` (wrong method name) directly observed; NaN/Infinity and enum-case risks confirmed from code + CONTEXT.md

**Research date:** 2026-03-02
**Valid until:** 2026-04-01 (stable domain — calculator table valid until June 2026, no external dependencies)
