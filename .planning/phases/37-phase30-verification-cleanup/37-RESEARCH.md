# Phase 37: Phase 30 Verification & Requirements Cleanup — Research

**Researched:** 2026-03-03
**Domain:** Documentation audit / verification / REQUIREMENTS.md bookkeeping
**Confidence:** HIGH — all evidence is from direct codebase inspection; no external libraries involved

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FORM-03 | Bei Submit: financial_data in DB aktualisiert + immutabler Snapshot in second_letter_financial_snapshot erstellt | Implementation confirmed in `server/controllers/clientPortalController.js` lines 1414–1479. `safeClientUpdate` atomically writes both `financial_data` corrections and `second_letter_financial_snapshot`. REQUIREMENTS.md checkbox is currently unchecked `[ ]`. This phase creates the VERIFICATION.md and flips the checkbox to `[x]`. |
</phase_requirements>

---

## Summary

Phase 37 is a pure documentation/verification phase with no new code to write. Its only deliverables are a `30-VERIFICATION.md` file (formally verifying Phase 30's snapshot write behaviour) and updates to `REQUIREMENTS.md` to flip the `FORM-03` checkbox from `[ ]` to `[x]` and update the traceability table row.

FORM-03 was implemented as part of Phase 30 Plan 01 (`handleSubmitSecondLetterForm` in `clientPortalController.js`) and was never assigned its own formal VERIFICATION.md. The REQUIREMENTS.md traceability table already reassigned FORM-03 to Phase 37 (the current phase) and marked it Pending. The v10 audit identified this documentation gap.

The implementation evidence is strong and fully present in the codebase. The `handleSubmitSecondLetterForm` handler (lines 1348–1491 of `clientPortalController.js`) does exactly what FORM-03 requires: it writes `c.second_letter_financial_snapshot` and updates `c.financial_data`, `c.extended_financial_data`, and `c.aktuelle_pfaendung` inside a single `safeClientUpdate` call. No code fix is needed — only verification and documentation.

Phase 30 currently has no `VERIFICATION.md`. The model for how to write one is Phase 28 (`28-VERIFICATION.md`, status: `passed`, 10/10 truths, full requirements coverage table) and Phase 36 (`36-VERIFICATION.md`, status: `human_needed`, 5/5 truths). The planner should follow this exact YAML frontmatter + Observable Truths + Required Artifacts + Key Links + Requirements Coverage structure.

**Primary recommendation:** Write `30-VERIFICATION.md` verifying FORM-03 against the live code, then update REQUIREMENTS.md: flip `FORM-03` checkbox and update traceability row to `Complete`.

---

## Standard Stack

This phase touches no libraries. The "stack" is the project's existing documentation conventions.

### Core

| Artifact | Format | Purpose | Why Standard |
|----------|--------|---------|--------------|
| `XX-VERIFICATION.md` | YAML frontmatter + Markdown | Formal verification document per phase | Established pattern used by Phases 28, 32, 36 |
| `REQUIREMENTS.md` | Markdown checkbox list + traceability table | Single source of truth for requirement completion | Project-wide requirements register |

### Verification Document Structure (from existing examples)

```
---
phase: 30-client-portal-form
verified: [ISO timestamp]
status: passed | human_needed | failed
score: N/N must-haves verified
re_verification: false
human_verification: (optional — only if human step needed)
---

# Phase 30: Client Portal Form Verification Report

## Goal Achievement
### Observable Truths (table: #, Truth, Status, Evidence)
### Required Artifacts (table: Artifact, Expected, Status, Details)
### Key Link Verification (table: From, To, Via, Status, Details)
### Requirements Coverage (table: Requirement, Source Plan, Description, Status, Evidence)
### Anti-Patterns Found
### Human Verification Required (or "None")
### Gaps Summary
```

---

## Architecture Patterns

### What Phase 37 Delivers

```
.planning/
├── phases/
│   └── 30-client-portal-form/
│       └── 30-VERIFICATION.md    ← CREATE (verifies FORM-03)
└── REQUIREMENTS.md               ← UPDATE (flip FORM-03 checkbox + traceability)
```

No server or frontend files are touched.

### Pattern: FORM-03 Observable Truths to Verify

The verification document must confirm these truths against the live codebase:

| # | Truth to Verify | Where to Look |
|---|-----------------|---------------|
| 1 | `handleSubmitSecondLetterForm` writes `financial_data` update inside `safeClientUpdate` | `clientPortalController.js` lines 1414–1421 |
| 2 | `second_letter_financial_snapshot` is written atomically via `safeClientUpdate` (not client.save()) | `clientPortalController.js` lines 1433–1444 |
| 3 | Snapshot write is gated by PENDING status guard (guard fires before any data write) | `clientPortalController.js` lines 1353–1356 |
| 4 | All snapshot fields map to Client.js schema field names (`has_garnishment`, `snapshot_created_at`) | Cross-ref `Client.js` lines 655–678 vs controller lines 1434–1444 |
| 5 | `extended_financial_data` is updated with `berufsstatus` and `anzahl_unterhaltsberechtigte` | `clientPortalController.js` lines 1423–1428 |
| 6 | Route is registered and middleware-protected: `POST /second-letter-form` with `authenticateSecondLetterToken` | `client-portal.js` lines 107–110 |

### Pattern: REQUIREMENTS.md Updates

Two targeted edits to `REQUIREMENTS.md`:

**Edit 1 — Checkbox flip (line 34):**
```
Before: - [ ] **FORM-03**: Bei Submit: financial_data in DB aktualisiert + immutabler Snapshot in second_letter_financial_snapshot erstellt
After:  - [x] **FORM-03**: Bei Submit: financial_data in DB aktualisiert + immutabler Snapshot in second_letter_financial_snapshot erstellt
```

**Edit 2 — Traceability table (line 108):**
```
Before: | FORM-03 | Phase 37 | Pending |
After:  | FORM-03 | Phase 37 | Complete |
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Verification evidence | Re-implementing or re-reading all of Phase 30 research | Direct code inspection of `clientPortalController.js` lines 1348–1491 | The implementation is already there; the task is to document what exists |
| Phase 30 VERIFICATION.md structure | Inventing a new format | Follow Phase 28 VERIFICATION.md pattern verbatim | Consistency with existing verification documents is essential for the audit trail |

**Key insight:** This phase is a bookkeeping phase. The implementation gap identified in the v10 audit was missing documentation, not missing code. No code changes are needed.

---

## Common Pitfalls

### Pitfall 1: Treating This as a Code Phase
**What goes wrong:** Planner creates tasks to add new code to the submit handler, believing FORM-03 is unimplemented.
**Why it happens:** REQUIREMENTS.md checkbox `[ ]` makes it look like nothing was done.
**How to avoid:** The 30-01-SUMMARY.md explicitly lists FORM-03 in `requirements` frontmatter and its accomplishments section confirms the snapshot write. The actual handler code in `clientPortalController.js` lines 1433–1444 is the proof. This phase writes the verification doc to formally record that proof.

### Pitfall 2: Forgetting the Traceability Table Row
**What goes wrong:** Planner only flips the checkbox on line 34 but misses the traceability table on line 108.
**Why it happens:** Two separate locations in REQUIREMENTS.md must both be updated.
**How to avoid:** REQUIREMENTS.md has both a `## v10 Requirements` checkbox section and a `## Traceability` table. Both must be updated to `[x]` / `Complete` respectively.

### Pitfall 3: Status Mismatch in Verification Frontmatter
**What goes wrong:** Verification document sets `status: human_needed` when human verification is actually not required for FORM-03.
**Why it happens:** Cargo-culting from Phase 36 VERIFICATION.md which requires human testing because template files are absent.
**How to avoid:** FORM-03 (snapshot write) can be fully verified by static code inspection — the logic is in `clientPortalController.js` and the schema is in `Client.js`. No runtime test with live data is required for this verification. Status should be `passed`.

### Pitfall 4: Scope Creep into Other FORM-XX Requirements
**What goes wrong:** Planner decides to "clean up" all Phase 30 requirements in this phase, including re-verifying FORM-01, FORM-02, FORM-04, FORM-05.
**Why it happens:** Phase 30 has no VERIFICATION.md at all, so it might seem sensible to verify everything.
**How to avoid:** The ROADMAP.md phase description is narrow: "Formally verify Phase 30 (FORM-03 snapshot write)". REQUIREMENTS.md already marks FORM-01, FORM-02, FORM-04, FORM-05 as `[x]` Complete. This phase is specifically about closing the FORM-03 documentation gap.

---

## Code Examples

### Evidence: Financial Data Update (FORM-03, Part 1)

```javascript
// Source: server/controllers/clientPortalController.js lines 1414–1428
const updatedClient = await safeClientUpdate(client.id, async (c) => {
    // 1. Update financial_data with corrections
    c.financial_data = {
        ...(c.financial_data || {}),
        monthly_net_income: parseFloat(monthly_net_income),
        marital_status: marital_status
    };

    // 2. Update extended_financial_data with corrections
    c.extended_financial_data = {
        ...(c.extended_financial_data || {}),
        berufsstatus: income_source,
        anzahl_unterhaltsberechtigte: parseInt(number_of_dependents)
    };

    // 3. Update top-level garnishment field
    c.aktuelle_pfaendung = active_garnishments === true;
    // ...
```

### Evidence: Snapshot Write (FORM-03, Part 2)

```javascript
// Source: server/controllers/clientPortalController.js lines 1433–1444
    // 4. Write immutable snapshot (DOCX generation reads exclusively from this)
    c.second_letter_financial_snapshot = {
        monthly_income: parseFloat(monthly_net_income),
        income_source: income_source,
        marital_status: marital_status,
        number_of_dependents: parseInt(number_of_dependents),
        has_garnishment: active_garnishments === true,
        new_creditors: has_new_creditors
            ? new_creditors.map(cred => ({ name: cred.name, amount: parseFloat(cred.amount) }))
            : [],
        snapshot_created_at: new Date()
    };
```

Note: Snapshot field names (`has_garnishment`, `snapshot_created_at`) match the Client.js schema (Phase 28 VERIFICATION.md Truth 2, `Client.js` lines 655–678). The 30-01-SUMMARY.md documents this as a planned deviation from the initial research (which had used `active_garnishments` and `submitted_at`).

### Evidence: PENDING Status Guard (FORM-03 immutability)

```javascript
// Source: server/controllers/clientPortalController.js lines 1353–1356
// STATUS GUARD — must be first, before any data writes
if (client.second_letter_status !== 'PENDING') {
    return res.status(409).json({ error: 'Formular nicht verfügbar', code: 'NOT_PENDING' });
}
```

### Evidence: Route Registration

```javascript
// Source: server/routes/client-portal.js lines 107–110
router.post('/second-letter-form',
    authenticateSecondLetterToken,
    controller.handleSubmitSecondLetterForm
);
```

---

## Key Facts for the Planner

### Phase 30 Current State

| Artifact | Exists | Notes |
|----------|--------|-------|
| `30-01-PLAN.md` | YES | Lists FORM-03 in requirements frontmatter |
| `30-02-PLAN.md` | YES | Lists FORM-01, FORM-02, FORM-04, FORM-05 (not FORM-03) |
| `30-01-SUMMARY.md` | YES | Confirms snapshot write implemented; documents schema field name deviations |
| `30-02-SUMMARY.md` | YES | Confirms frontend complete; requirements-completed: [FORM-01, FORM-02, FORM-04, FORM-05] |
| `30-CONTEXT.md` | YES | User locked decisions for form design |
| `30-RESEARCH.md` | YES | Full research; Pattern 2 documents snapshot write pattern |
| `30-VERIFICATION.md` | **NO** | This is the gap Phase 37 closes |

### REQUIREMENTS.md Current State

| ID | Checkbox | Traceability | Correct? |
|----|----------|-------------|----------|
| FORM-01 | `[x]` | Phase 30, Complete | YES |
| FORM-02 | `[x]` | Phase 30, Complete | YES |
| FORM-03 | `[ ]` | Phase 37, Pending | Needs update to `[x]` / Complete |
| FORM-04 | `[x]` | Phase 30, Complete | YES |
| FORM-05 | `[x]` | Phase 30, Complete | YES |

### Implementation Files for Verification

| File | Lines | Relevance |
|------|-------|-----------|
| `server/controllers/clientPortalController.js` | 1348–1491 | `handleSubmitSecondLetterForm` — full FORM-03 implementation |
| `server/routes/client-portal.js` | 103–110 | Route registration with `authenticateSecondLetterToken` |
| `server/middleware/auth.js` | (search `authenticateSecondLetterToken`) | UUID token DB-lookup validation |
| `server/models/Client.js` | 655–678 | `second_letter_financial_snapshot` schema for field name verification |

---

## Open Questions

1. **Should the verification status be `passed` or `human_needed`?**
   - What we know: FORM-03 requires `financial_data` update + `second_letter_financial_snapshot` write. Both are statically verifiable in the controller code.
   - What's unclear: Whether a live end-to-end test is required to formally close the requirement.
   - Recommendation: Set `status: passed`. The implementation can be fully confirmed by static code inspection (unlike Phase 36 which required template files for runtime verification). The 30-02-SUMMARY.md documents that human verification for the form UI was a checkpoint task — but FORM-03 is a backend behaviour, not a UI interaction.

2. **Should Phase 30 VERIFICATION.md verify all FORM requirements or only FORM-03?**
   - What we know: The ROADMAP description says "Formally verify Phase 30 (FORM-03 snapshot write)". FORM-01/02/04/05 are already `[x]` in REQUIREMENTS.md.
   - Recommendation: The verification document lives in the Phase 30 folder, so it should cover the full Phase 30 scope (all FORM requirements) for completeness. However, the primary focus and the only checkbox change in REQUIREMENTS.md is FORM-03.

---

## Sources

### Primary (HIGH confidence)

- `/Users/luka.s/Migration Mandanten Portal/server/controllers/clientPortalController.js` — lines 1348–1491 — `handleSubmitSecondLetterForm` implementation, directly verified by code inspection
- `/Users/luka.s/Migration Mandanten Portal/server/routes/client-portal.js` — lines 103–110 — route registration with `authenticateSecondLetterToken` middleware
- `/Users/luka.s/Migration Mandanten Portal/server/models/Client.js` — lines 655–678 (per Phase 28 VERIFICATION.md) — `second_letter_financial_snapshot` schema field definitions
- `/Users/luka.s/Migration Mandanten Portal/.planning/REQUIREMENTS.md` — current checkbox states, traceability table
- `/Users/luka.s/Migration Mandanten Portal/.planning/phases/30-client-portal-form/30-01-SUMMARY.md` — confirms FORM-03 implementation and field name deviations from plan
- `/Users/luka.s/Migration Mandanten Portal/.planning/phases/28-state-machine-foundation/28-VERIFICATION.md` — VERIFICATION.md structure template
- `/Users/luka.s/Migration Mandanten Portal/.planning/phases/36-wire-document-generator/36-VERIFICATION.md` — VERIFICATION.md structure template (human_needed variant)
- `/Users/luka.s/Migration Mandanten Portal/.planning/ROADMAP.md` — Phase 37 goal statement and plan list

---

## Metadata

**Confidence breakdown:**
- Implementation evidence: HIGH — code inspected directly, handler text reproduced above
- Documentation gap: HIGH — absence of `30-VERIFICATION.md` confirmed by directory listing
- Verification document format: HIGH — two existing examples (Phase 28, Phase 36) provide exact structure to follow
- REQUIREMENTS.md edit targets: HIGH — exact line numbers identified

**Research date:** 2026-03-03
**Valid until:** Stable — no code changes expected; this phase is documentation-only
