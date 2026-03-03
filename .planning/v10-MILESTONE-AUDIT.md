---
milestone: v10
audited: 2026-03-03T15:00:00Z
status: gaps_found
scores:
  requirements: 33/34
  phases: 11/11
  integration: 3/4
  flows: 2/3
gaps:
  requirements:
    - id: "TRIG-02"
      status: "partial"
      phase: "Phase 29"
      claimed_by_plans: ["29-01-PLAN.md", "29-02-PLAN.md"]
      completed_by_plans: ["29-01-SUMMARY.md", "29-02-SUMMARY.md"]
      verification_status: "passed (code works in isolation)"
      evidence: "secondLetterTriggerService.triggerForClient(clientId) queries Client.findOneAndUpdate({ id: clientId }) — 'id' is the UUID field (Client.js line 239). Admin UI sends MongoDB _id (clientsApi.ts line 69: 'id: client._id || client.id'). UUID !== ObjectId string → findOneAndUpdate returns null → admin trigger silently fails. Scheduler path works because client.id is the UUID from Mongoose document."
  integration:
    - from: "Phase 34 (admin UI → clientDetailApi.ts)"
      to: "Phase 29 (secondLetterTriggerService.triggerForClient)"
      issue: "Admin frontend normalizes id to _id (clientsApi.ts line 69), trigger service queries UUID id field — no document match"
      affected_requirements: ["TRIG-02"]
  flows:
    - flow: "Admin Manual Trigger → PENDING → Email"
      breaks_at: "secondLetterTriggerService.js line 56 — Client.findOneAndUpdate({ id: clientId }) receives _id from admin UI, matches no document"
      affected_requirements: ["TRIG-02"]
tech_debt:
  - phase: 32-docx-generation
    items:
      - "DOCX templates (2.Schreiben_Ratenplan.docx, 2.Schreiben_Nullplan.docx) absent from server/templates/ — external pre-condition, not code gap. Blocks E2E Flow 3 at runtime."
  - phase: 34-admin-ui-tracking
    items:
      - "4 human verification items pending: trigger button modal, TrackingCanvas 3-column layout, plan type override select, Client List badge column"
      - "overridePlanType mutation missing WorkflowStatus cache invalidation (cosmetic — data persists correctly, UI may not refresh immediately)"
  - phase: 35-bug-fixes-url-id-field-names
    items:
      - "2 residual creditor._id references intentionally kept: prepareTemplateData line 203 (falls through to creditor.id), calculationService line 96 (error path display only)"
  - phase: general
    items:
      - "Pre-existing Mongoose duplicate {id:1} index warning on Client model — unrelated to v10"
      - "secondLetterService.js references creditor.creditor_name which is always undefined — falls through to sender_name fallback. No functional impact."
---

# v10 Milestone Audit: 2. Anschreiben Automatisierung

**Audited:** 2026-03-03T15:00:00Z
**Status:** GAPS_FOUND
**Milestone:** v10 — Phases 28-38 (11 phases, 34 requirements)
**Previous Audit:** 2026-03-03T12:00:00Z (8 gaps — all closed by Phases 35-38)

## Scores Overview

| Dimension | Score | Detail |
|-----------|-------|--------|
| Requirements | 33/34 | 1 integration gap (TRIG-02 id/_id mismatch) |
| Phases | 11/11 | All phases have VERIFICATION.md with passed status |
| Integration | 3/4 | 1 cross-phase wiring issue (admin UI → trigger service) |
| E2E Flows | 2/3 | Admin manual trigger broken; form+send flows wired correctly |

---

## Phase Verification Summary

| Phase | Name | Verification Status | Score |
|-------|------|---------------------|-------|
| 28 | State Machine Foundation | PASSED | 10/10 |
| 29 | Trigger, Scheduler & Client Notification | PASSED | 9/9 |
| 30 | Client Portal Form | PASSED | 6/6 |
| 31 | Financial Calculation Engine | PASSED | 8/8 |
| 32 | DOCX Generation | PASSED | 6/6 |
| 33 | Email Dispatch & Workflow Completion | GAPS_FOUND | 6/7 (SEND-02 _id bug — **closed by Phase 35**) |
| 34 | Admin UI & Tracking | PASSED | 9/9 |
| 35 | Bug Fixes — URL, _id, Field Names | PASSED | 6/6 |
| 36 | Wire Document Generator | HUMAN_NEEDED | 5/5 (code wired, templates absent) |
| 37 | Phase 30 Verification & Cleanup | PASSED | 4/4 |
| 38 | Fix Schema Gap — Persist Calculation Fields | PASSED | 3/3 |

All 11 phases pass individual verification. Phase 33 gap was closed by Phase 35. Phase 38 closed the schema gap from the previous audit.

---

## Previous Audit Gap Closure

The first v10 audit (2026-03-03T12:00:00Z) found 8 unsatisfied requirements due to 5 missing Mongoose schema fields. Phases 35-38 were created to close these gaps:

| Gap | Closed By | Status |
|-----|-----------|--------|
| CALC-04 (Tilgungsangebot not persisted) | Phase 38 — 5 schema fields added | CLOSED |
| DOC-01..04 (send workflow blocked by calculation_status guard) | Phase 38 — calculation_status now persists | CLOSED |
| SEND-01, SEND-03, SEND-04 (send workflow unreachable) | Phase 38 — schema unblocks entire pipeline | CLOSED |
| SEND-02 (_id vs id in per-creditor tracking) | Phase 35 — corrected to final_creditor_list.id | CLOSED |
| NOTIF-02 (email deep-link URL mismatch) | Phase 35 — URL fixed to /portal/second-letter-form | CLOSED |

**All 8 previous gaps are confirmed closed** by reading the Phase 35 and 38 VERIFICATION.md files and cross-referencing with REQUIREMENTS.md (34/34 [x] Complete).

---

## Remaining Gap: TRIG-02 — Admin Manual Trigger id/_id Mismatch

**Severity:** Integration wiring bug
**Requirement:** "Admin kann manuell 2. Anschreiben triggern (Button im Dashboard) → setzt PENDING + sendet Client-Notification"

### Root Cause

The admin frontend normalizes client IDs for routing:

```javascript
// MandantenPortalDesign/src/store/api/clientsApi.ts line 69
id: client._id || client.id,  // Sets id to MongoDB ObjectId string
```

The trigger endpoint receives this normalized `_id`:

```javascript
// server/controllers/adminSecondLetterController.js line 19
const { clientId } = req.params;  // = MongoDB ObjectId string from URL
await secondLetterTriggerService.triggerForClient(clientId, actor);
```

But the trigger service queries the custom `id` UUID field:

```javascript
// server/services/secondLetterTriggerService.js line 55-56
const client = await Client.findOneAndUpdate(
  { id: clientId, second_letter_status: 'IDLE' },  // 'id' = UUID field (Client.js line 239)
```

MongoDB ObjectId string !== UUID → `findOneAndUpdate` returns `null` → service returns `{ success: false, alreadyTriggered: true }` → admin sees misleading "already triggered" toast.

### Impact

- **Admin manual trigger:** BROKEN — button exists, endpoint exists, logic works, but the ID passed doesn't match the field queried
- **Scheduler path:** WORKING — `checkAndTriggerEligible()` iterates Mongoose documents where `client.id` is the physical UUID field, so `triggerForClient(client.id, 'system')` passes the correct value
- **Other admin endpoints:** WORKING — `recalculate-second-letter`, `send-second-letter`, and `second-letter-plan-type` all use `Client.findById(clientId)` which correctly queries `_id`

### Fix

One-line change in `server/services/secondLetterTriggerService.js`:

```javascript
// Line 56: Change { id: clientId } to { _id: clientId }
const client = await Client.findOneAndUpdate(
  { _id: clientId, second_letter_status: 'IDLE' },
  // ...
);

// Line 83: Same change for the status-check fallback
const existing = await Client.findOne({ _id: clientId }, { second_letter_status: 1 });
```

This maintains atomicity while matching the pattern used by all other admin endpoints.

---

## Requirements Cross-Reference (3-Source)

### Source 1: Phase VERIFICATION.md

All 34 requirements have SATISFIED status in at least one VERIFICATION.md.

### Source 2: SUMMARY.md Frontmatter

27/34 requirements appear in `requirements-completed` across v10 SUMMARY files. 7 requirements are absent from all SUMMARY frontmatter:

| Missing from SUMMARY | VERIFICATION Status | REQUIREMENTS.md | Reason |
|----------------------|--------------------|-----------------|----- ---|
| TRIG-01, TRIG-02, TRIG-03, TRIG-04 | Phase 29: SATISFIED | [x] Complete | Phase 29 SUMMARYs don't have requirements-completed field |
| NOTIF-01, NOTIF-03 | Phase 29: SATISFIED | [x] Complete | Same — Phase 29 documentation gap |
| SEND-05 | Phase 33: SATISFIED | [x] Complete | Phase 33 SUMMARY doesn't have requirements-completed field |

These are documentation format gaps, not implementation gaps. All 7 are verified SATISFIED in VERIFICATION.md and [x] Complete in REQUIREMENTS.md.

### Source 3: REQUIREMENTS.md Traceability

All 34 requirements: `[x]` checkbox + `Complete` status in traceability table.

### Final Status Matrix (34 requirements)

| REQ-ID | VERIFICATION | SUMMARY | REQUIREMENTS.md | Integration | Final |
|--------|-------------|---------|-----------------|-------------|-------|
| SCHEMA-01 | Phase 28: SATISFIED | 28-01 | [x] Complete | WIRED | **satisfied** |
| SCHEMA-02 | Phase 28: SATISFIED | 28-01 | [x] Complete | WIRED | **satisfied** |
| SCHEMA-03 | Phase 28: SATISFIED | 28-01 | [x] Complete | WIRED | **satisfied** |
| SCHEMA-04 | Phase 28: SATISFIED | 28-01 | [x] Complete | WIRED | **satisfied** |
| TRIG-01 | Phase 29: SATISFIED | — | [x] Complete | WIRED (scheduler) | **satisfied** |
| **TRIG-02** | Phase 29: SATISFIED | — | [x] Complete | **BROKEN** (admin UI sends _id) | **partial** |
| TRIG-03 | Phase 29: SATISFIED | — | [x] Complete | WIRED | **satisfied** |
| TRIG-04 | Phase 29: SATISFIED | — | [x] Complete | WIRED | **satisfied** |
| NOTIF-01 | Phase 29: SATISFIED | — | [x] Complete | WIRED | **satisfied** |
| NOTIF-02 | Phase 35: SATISFIED | 35-01 | [x] Complete | WIRED | **satisfied** |
| NOTIF-03 | Phase 29: SATISFIED | — | [x] Complete | WIRED | **satisfied** |
| FORM-01 | Phase 30: SATISFIED | 30-02 | [x] Complete | WIRED | **satisfied** |
| FORM-02 | Phase 30: SATISFIED | 30-02 | [x] Complete | WIRED | **satisfied** |
| FORM-03 | Phase 30+37: SATISFIED | 37-01 | [x] Complete | WIRED | **satisfied** |
| FORM-04 | Phase 30: SATISFIED | 30-02 | [x] Complete | WIRED | **satisfied** |
| FORM-05 | Phase 30: SATISFIED | 30-02 | [x] Complete | WIRED | **satisfied** |
| CALC-01 | Phase 31: SATISFIED | 31-01 | [x] Complete | WIRED | **satisfied** |
| CALC-02 | Phase 31: SATISFIED | 31-01 | [x] Complete | WIRED | **satisfied** |
| CALC-03 | Phase 31: SATISFIED | 31-01 | [x] Complete | WIRED | **satisfied** |
| CALC-04 | Phase 38: SATISFIED | 38-01 | [x] Complete | WIRED | **satisfied** |
| DOC-01 | Phase 38: SATISFIED | 38-01 | [x] Complete | WIRED | **satisfied** |
| DOC-02 | Phase 38: SATISFIED | 38-01 | [x] Complete | WIRED | **satisfied** |
| DOC-03 | Phase 38: SATISFIED | 38-01 | [x] Complete | WIRED | **satisfied** |
| DOC-04 | Phase 38: SATISFIED | 38-01 | [x] Complete | WIRED | **satisfied** |
| SEND-01 | Phase 38: SATISFIED | 38-01 | [x] Complete | WIRED | **satisfied** |
| SEND-02 | Phase 35: SATISFIED | 35-01 | [x] Complete | WIRED | **satisfied** |
| SEND-03 | Phase 38: SATISFIED | 38-01 | [x] Complete | WIRED | **satisfied** |
| SEND-04 | Phase 38: SATISFIED | 38-01 | [x] Complete | WIRED | **satisfied** |
| SEND-05 | Phase 33: SATISFIED | — | [x] Complete | WIRED | **satisfied** |
| SEND-06 | Phase 33: SATISFIED | — | [x] Complete | WIRED | **satisfied** |
| UI-01 | Phase 34: SATISFIED | 34-01 | [x] Complete | WIRED | **satisfied** |
| UI-02 | Phase 34: SATISFIED | 34-01,03 | [x] Complete | WIRED | **satisfied** |
| UI-03 | Phase 34: SATISFIED | 34-01,03 | [x] Complete | WIRED | **satisfied** |
| UI-04 | Phase 34: SATISFIED | 34-01 | [x] Complete | WIRED (minor: missing cache invalidation) | **satisfied** |

**Orphaned Requirements:** None. All 34 mapped in traceability, all have VERIFICATION.md coverage.

---

## E2E Flow Status

### Flow 1: Admin Manual Trigger — BROKEN at Step 2

| Step | Component | Status |
|------|-----------|--------|
| 1. Admin clicks "2. Anschreiben starten" | client-detail.tsx → triggerSecondLetter mutation | WORKING |
| 2. POST /api/admin/clients/:clientId/trigger-second-letter | triggerForClient({ id: clientId }) | **BROKEN** — queries UUID field with _id value |
| 3. Atomic IDLE → PENDING transition | findOneAndUpdate | Never reached |
| 4. Token generation + Resend email | emailService.sendSecondLetterNotification | Never reached |

### Flow 2: Client Form Submission + Calculation — COMPLETE

| Step | Component | Status |
|------|-----------|--------|
| 1. Client navigates to /portal/second-letter-form?token=uuid | authenticateSecondLetterToken | WORKING |
| 2. GET form data pre-filled | handleGetSecondLetterFormData | WORKING |
| 3. POST form submit with validation | handleSubmitSecondLetterForm | WORKING |
| 4. financial_data + snapshot write (atomic) | safeClientUpdate | WORKING |
| 5. PENDING → FORM_SUBMITTED transition | Inside safeClientUpdate | WORKING |
| 6. Calculation runs synchronously | calculateSecondLetterFinancials | WORKING |
| 7. Calculation results persist to snapshot | Client.findByIdAndUpdate($set) | WORKING (Phase 38 schema fix) |

### Flow 3: Admin Send → DOCX → Email → SENT — WIRED (templates needed)

| Step | Component | Status |
|------|-----------|--------|
| 1. Admin clicks "Jetzt senden" | sendSecondLetter mutation | WORKING |
| 2. Client.findById(clientId) | admin-second-letter.js | WORKING (uses _id correctly) |
| 3. Status guard (FORM_SUBMITTED) | admin-second-letter.js line 111 | WORKING |
| 4. Snapshot guard (calculation_status === 'completed') | admin-second-letter.js line 121 | WORKING (Phase 38 schema fix) |
| 5. DOCX generation | SecondLetterDocumentGenerator.generateForAllCreditors | WIRED (awaiting template files) |
| 6. Email dispatch per creditor | secondLetterService.dispatchSecondLetterEmails | WIRED |
| 7. Per-creditor tracking | Client.updateOne with final_creditor_list.id | WIRED (Phase 35 fix) |
| 8. Zendesk audit comment | zendesk.addTicketComment | WIRED |
| 9. FORM_SUBMITTED → SENT | findOneAndUpdate atomic transition | WIRED |

**Note:** Flow 3 code is fully wired and correct. Runtime execution requires placing DOCX templates in `server/templates/`. This is an external pre-condition documented in Phase 32, not a code gap.

---

## Tech Debt Summary

| Phase | Item | Severity |
|-------|------|----------|
| 32 | DOCX templates absent from server/templates/ (external pre-condition) | Operational |
| 34 | 4 UI items need browser testing (modal, canvas, select, badges) | Human test |
| 34 | overridePlanType missing WorkflowStatus cache invalidation | Cosmetic |
| 33 | secondLetterService.js references creditor.creditor_name (undefined, falls through to sender_name) | Cosmetic |
| 35 | 2 residual creditor._id references (safe fallback chains, intentional) | Info |
| — | Pre-existing Mongoose duplicate {id:1} index warning | Info |

**Total: 6 items across 4 phases. No blockers.**

---

## Summary

v10 is **97% complete** (33/34 requirements satisfied). All 8 gaps from the first audit are confirmed closed by Phases 35-38. The single remaining gap is an **integration wiring bug** where the admin frontend sends MongoDB `_id` but the trigger service queries the UUID `id` field.

**One-line fix resolves the last gap:** Change `{ id: clientId }` to `{ _id: clientId }` in `secondLetterTriggerService.js` (lines 56 and 83).

After this fix + placing DOCX template files, the entire v10 workflow is end-to-end operational.

---

*Audited: 2026-03-03T15:00:00Z*
*Auditor: Claude (audit-milestone orchestrator + gsd-integration-checker)*
*Previous audit: 2026-03-03T12:00:00Z (8 gaps → all closed by Phases 35-38)*
