# Phase 28: State Machine Foundation - Research

**Researched:** 2026-03-02
**Domain:** Mongoose schema extension, MongoDB migration scripts, atomic state guards
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Die 9 definierten Felder (Einkommen, Familienstand, Unterhaltspflichten, Einkommensquelle, Lohnpfaendungen, neue Glaeubiger, Plan-Typ, pfaendbarer Betrag, monatliche Rate) sind die Basis
- Weitere Felder die fuer die Briefe noetig sind (Name, Adresse etc.) kommen direkt vom Client-Model, nicht aus dem Snapshot
- Neue Glaeubiger: Array-Struktur mit je Name und Betrag — ein Mandant kann MEHRERE neue Glaeubiger haben
- Ein Snapshot pro Client reicht (kein Versionierungs-Array) — wird bei erneutem Durchlauf ueberschrieben
- Alle bestehenden Clients bekommen IDLE — der Scheduler/Admin entscheidet spaeter wer getriggert wird
- Kein Sonderstatus fuer manuell bearbeitete Clients — erstmal alle auf IDLE, manuelle Korrektur bei Bedarf
- Creditor-Felder sind optional/nullable — kein explizites Setzen in der Migration noetig
- 4 Status bleiben: IDLE, PENDING, FORM_SUBMITTED, SENT — kein ERROR/CANCELLED Status
- Kuendigungs-Logik ist irrelevant fuer Phase 28 — spaetere Phasen pruefen ob Client aktiv ist
- Erstmal als einmaliger Durchlauf bauen — SENT ist Endzustand, Erweiterung kommt wenn noetig
- Die 3 definierten Felder reichen: second_letter_sent_at, second_letter_email_sent_at, second_letter_document_filename
- Kein delivery_status Tracking — sent_at reicht, Resend-Webhook-Handling ist Overkill
- Alle Creditors eines Clients werden angeschrieben — keine Filterkriterien/Exclude-Logik

### Claude's Discretion
- Creditor-Daten im Snapshot einfrieren vs. Live-Referenzen — Claude waehlt den sichereren Ansatz
- Migration-Timing: einmaliges Script vs. Mongoose Defaults — Claude waehlt basierend auf bestehendem Pattern
- Creditor-Email-Feld: Claude prueft das bestehende Creditor-Schema und ergaenzt was fehlt
- Berechnete Werte (Quota, Tilgungsangebot) auf Creditor-Subdokument vs. nur im Snapshot — Claude waehlt basierend auf Zugriffsmuster
- Status-Zuruecksetzbarkeit durch Admin — Claude entscheidet ob sinnvoll

### Deferred Ideas (OUT OF SCOPE)
- Delivery-Status-Tracking (DELIVERED/BOUNCED per Creditor) — evtl. Phase 33 oder Backlog
- Snapshot-Versionierung fuer wiederholte Durchlaeufe — Backlog
- Creditor-Filterkriterien (Ausschluss bestimmter Glaeubiger) — Backlog
- Status-Zuruecksetzung SENT → IDLE fuer erneuten Durchlauf — Backlog
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCHEMA-01 | Client Model hat `second_letter_status` Enum (IDLE, PENDING, FORM_SUBMITTED, SENT) mit Default IDLE | Mongoose enum field with String type and default. Migration script sets all existing docs to IDLE via `updateMany`. |
| SCHEMA-02 | Client Model hat `second_letter_financial_snapshot` Subdokument (Einkommen, Familienstand, Unterhaltspflichten, Einkommensquelle, Lohnpfaendungen, neue Glaebiger, Plan-Typ, pfaendbarer Betrag, monatliche Rate) | Named nested Schema object, no `_id: false` subdoc approach — or inline object with typed fields. New creditors as array. |
| SCHEMA-03 | Client Model hat `second_letter_triggered_at`, `second_letter_form_submitted_at`, `second_letter_sent_at` Timestamps | Three `{ type: Date }` fields added to clientSchema. No default needed (null until set). |
| SCHEMA-04 | Creditor-Schema hat `second_letter_sent_at`, `second_letter_email_sent_at`, `second_letter_document_filename` Felder | Three fields added to creditorSchema. All optional/nullable. No explicit migration (existing creditors leave as null/undefined). |
</phase_requirements>

## Summary

Phase 28 is a pure schema-and-migration phase: extend `server/models/Client.js` with the `second_letter_*` fields on both the top-level `clientSchema` and the embedded `creditorSchema`, then run a one-shot migration script to initialize `second_letter_status: 'IDLE'` on all existing clients. No new routes, no new services, no UI — just data structure.

The codebase already has strong established patterns for all three sub-tasks: (1) Mongoose schema extension is done by direct field addition to the existing schema objects in `Client.js`; (2) migration scripts live in `server/scripts/` with a consistent `--dry-run` flag, `dotenv` + `mongoose.connect`, and `Client.updateMany`; (3) atomic state guards use `Client.findOneAndUpdate` with a filter on the current status field (`{ second_letter_status: 'IDLE' }`) to prevent double-triggers, which will be the pattern for Phase 29 but must be designed into the schema now to support it cleanly.

The discretionary decisions resolve clearly from the codebase evidence: use a migration script (not Mongoose defaults) to initialize existing clients, consistent with `backfill-contact-status.js` and `backfill-leineweber-data.js`; freeze creditor data in the snapshot rather than live references (snapshot-only pattern established in STATE.md); keep calculated values (quota, Tilgungsangebot) in the snapshot not on individual creditor subdocs (they are calculation outputs that require the full creditor list, not per-creditor data Phase 28 knows about). Status reset by admin is deferred — SENT is final for v10.

**Primary recommendation:** Add schema fields directly in `Client.js` (no new file), write a single migration script in `server/scripts/`, and export a thin `secondLetterStateGuard` function stub in a new `server/services/secondLetterService.js` that Phase 29 will fill in — this avoids Phase 29 having to guess the correct atomic update pattern.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| mongoose | (existing in project) | Schema definition, ODM, atomic updates | Already in use; all models use it |
| dotenv | (existing in project) | Env vars in migration scripts | All existing scripts use `require('dotenv').config()` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| mongoose `updateMany` | built-in | Bulk initialize IDLE status on existing clients | One-time migration — faster than per-document loop |
| mongoose `findOneAndUpdate` | built-in | Atomic status guard (IDLE-only filter) | Every trigger entry point in Phase 29+ |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Migration script | Mongoose schema default + no migration | Default only sets field on NEW documents; existing clients remain without the field. Mongoose query `{ second_letter_status: 'IDLE' }` would NOT match docs where field is absent unless you use `$or: [{ second_letter_status: 'IDLE' }, { second_letter_status: { $exists: false } }]`. This is fragile. Use a migration script. |
| Inline object in clientSchema | Separate named mongoose.Schema for financial snapshot | Named schema allows reuse and validation but is overkill for a single-use subdocument. Existing codebase uses inline objects (`financial_data`, `extended_financial_data`, `review_assignment`) — follow that pattern. |
| Snapshot only stores financial snapshot | Snapshot also stores creditor list snapshot | Creditor data already lives on the client document (`final_creditor_list`). Phase 32 reads live creditors but uses only snapshot for financial calculations. Freezing a copy of creditors in the snapshot would be redundant. Keep creditor data live. |

**Installation:** No new packages needed. All dependencies already present.

## Architecture Patterns

### Recommended Project Structure
```
server/
├── models/
│   └── Client.js          # Add second_letter_* fields here (clientSchema + creditorSchema)
├── scripts/
│   └── init-second-letter-status.js   # One-time migration: set IDLE on all existing clients
└── services/
    └── secondLetterService.js          # Stub: secondLetterStateGuard() for Phase 29
```

### Pattern 1: Inline subdocument in clientSchema (Financial Snapshot)
**What:** Add `second_letter_financial_snapshot` as an inline nested object in `clientSchema`, following the pattern of `financial_data` and `extended_financial_data`.
**When to use:** Single-use subdocument not shared across models.
**Example:**
```javascript
// In clientSchema (Client.js), after extended_financial_data block:

second_letter_financial_snapshot: {
  monthly_net_income: Number,          // Monatliches Nettoeinkommen
  marital_status: {
    type: String,
    enum: ['ledig', 'verheiratet', 'geschieden', 'verwitwet', 'getrennt_lebend']
  },
  number_of_dependents: { type: Number, default: 0 }, // Unterhaltspflichten
  income_source: {
    type: String,
    enum: ['angestellt', 'selbststaendig', 'arbeitslos', 'rentner', 'in_ausbildung']
  },
  has_garnishment: { type: Boolean, default: false }, // Lohnpfaendungen aktiv
  new_creditors: [{
    name: { type: String, required: true },
    amount: { type: Number, required: true }
  }],
  plan_type: {
    type: String,
    enum: ['RATENPLAN', 'NULLPLAN']
  },
  garnishable_amount: Number,           // Pfaendbarer Betrag (berechnet)
  monthly_rate: Number,                 // Monatliche Rate
  snapshot_created_at: Date             // When this snapshot was frozen
},
```

### Pattern 2: Enum status field with default (SCHEMA-01)
**What:** Add `second_letter_status` as a typed String enum with default.
**Example:**
```javascript
// In clientSchema (Client.js):
second_letter_status: {
  type: String,
  enum: ['IDLE', 'PENDING', 'FORM_SUBMITTED', 'SENT'],
  default: 'IDLE'
},
```

### Pattern 3: Timestamp fields (SCHEMA-03)
**What:** Plain `Date` fields without default — only set when transitions occur.
**Example:**
```javascript
// In clientSchema (Client.js):
second_letter_triggered_at: Date,
second_letter_form_submitted_at: Date,
second_letter_sent_at: Date,
```

### Pattern 4: Creditor subdoc extension (SCHEMA-04)
**What:** Add three fields to the existing `creditorSchema` definition near the First Round Creditor Contact block. All nullable, no default.
**Example:**
```javascript
// In creditorSchema (Client.js), after the "First Round Creditor Contact" block:

// Second Letter Tracking
second_letter_sent_at: Date,
second_letter_email_sent_at: Date,
second_letter_document_filename: String,
```

### Pattern 5: Migration script (existing project pattern)
**What:** Standalone Node.js script in `server/scripts/` with `--dry-run` support.
**Example:**
```javascript
// server/scripts/init-second-letter-status.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const config = require('../config');

const DRY_RUN = process.argv.includes('--dry-run');

async function run() {
  console.log(`\n🔧 Init second_letter_status${DRY_RUN ? ' (DRY RUN)' : ''}\n`);

  await mongoose.connect(config.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  const Client = require('../models/Client');

  // Count clients needing initialization
  const count = await Client.countDocuments({
    $or: [
      { second_letter_status: { $exists: false } },
      { second_letter_status: null }
    ]
  });
  console.log(`Clients needing initialization: ${count}`);

  if (!DRY_RUN && count > 0) {
    const result = await Client.updateMany(
      {
        $or: [
          { second_letter_status: { $exists: false } },
          { second_letter_status: null }
        ]
      },
      { $set: { second_letter_status: 'IDLE' } }
    );
    console.log(`✅ Updated: ${result.modifiedCount} clients set to IDLE`);
  } else if (DRY_RUN) {
    console.log(`(dry run — no changes made)`);
  } else {
    console.log('✅ Nothing to migrate.');
  }

  await mongoose.disconnect();
  console.log('Disconnected.\n');
}

run().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
```

### Pattern 6: Atomic state guard stub (for Phase 29 readiness)
**What:** A thin `secondLetterStateGuard` function in `secondLetterService.js` that will be filled by Phase 29. Phase 28 only writes the structure so Phase 29 knows exactly what to implement.
**Example:**
```javascript
// server/services/secondLetterService.js

const Client = require('../models/Client');

/**
 * Atomically transitions a client from IDLE → PENDING.
 * Returns the updated client, or null if the guard blocked (client not IDLE).
 * This is the ONLY entry point that may trigger a second letter.
 */
async function triggerSecondLetter(clientId, triggeredBy = 'system') {
  const client = await Client.findOneAndUpdate(
    { id: clientId, second_letter_status: 'IDLE' },  // Guard: only IDLE clients
    {
      $set: {
        second_letter_status: 'PENDING',
        second_letter_triggered_at: new Date()
      }
    },
    { new: true }
  );
  return client; // null means guard blocked (already PENDING/FORM_SUBMITTED/SENT)
}

module.exports = { triggerSecondLetter };
```

### Anti-Patterns to Avoid
- **Read-then-write for status transitions:** Never do `findOne` + check status + `save`. Use `findOneAndUpdate` with `{ second_letter_status: 'IDLE' }` filter as an atomic guard. A null return = already transitioned.
- **Mongoose default as migration strategy:** Schema `default: 'IDLE'` only applies to new documents created after the schema change. Existing documents will have the field absent. The migration script is required.
- **Adding enum values to `current_status`:** Do NOT add second letter states to the existing `current_status` enum. These are separate state machines on the same document. `second_letter_status` is standalone.
- **Creditor snapshot duplication:** Do NOT copy the full creditor list into the financial snapshot. The snapshot captures only the financial decision data (income, plan type, etc.). Creditor identities are read from the live `final_creditor_list` at send time.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic status transition | Custom mutex or in-memory lock | `findOneAndUpdate` with filter on current status | MongoDB document-level atomicity is sufficient; no distributed locking needed at this scale |
| Enum validation | Manual if/else enum check | Mongoose `enum` array in schema definition | Mongoose validates at save time and rejects invalid values |
| Bulk migration | Per-document loop with save() | `Client.updateMany` with `$set` | Single DB round-trip, no Mongoose pre-save hooks triggered (intentional for migration) |

**Key insight:** MongoDB `findOneAndUpdate` with a filter on the status field IS the state machine guard. There is no need for a separate state machine library (xstate, etc.) — the atomicity is provided by MongoDB's document-level atomic operations.

## Common Pitfalls

### Pitfall 1: Missing documents not matched by IDLE filter
**What goes wrong:** After Phase 28, Phase 29 queries `{ second_letter_status: 'IDLE' }`. Clients that were not reached by the migration script (e.g., created after migration ran but before server restart) have no `second_letter_status` field and DO NOT match the query.
**Why it happens:** MongoDB does not set schema defaults on existing documents; Mongoose defaults only apply on new document creation via `new Client({...}).save()`.
**How to avoid:** The migration script uses `$or: [{ second_letter_status: { $exists: false } }, { second_letter_status: null }]` to catch both missing and null. After the migration, the schema default ensures all new clients have `second_letter_status: 'IDLE'`.
**Warning signs:** Client count from `second_letter_status: 'IDLE'` query is unexpectedly low.

### Pitfall 2: Schema enum rejects existing lowercase values
**What goes wrong:** The existing `creditorSchema` and `clientSchema` use lowercase enums (`'pending'`, `'confirmed'`, etc.). The new `second_letter_status` uses UPPERCASE (`'IDLE'`, `'PENDING'`). Risk of copy-paste error using wrong case.
**Why it happens:** Copy-paste from existing status fields uses lowercase; new status uses uppercase per CONTEXT.md decision.
**How to avoid:** Always write enum values as `['IDLE', 'PENDING', 'FORM_SUBMITTED', 'SENT']` — uppercase. Never mix.
**Warning signs:** `undefined` returned from queries filtering by `second_letter_status: 'idle'` (wrong case).

### Pitfall 3: creditorSchema `_id: false` means positional operator needs `id` field
**What goes wrong:** The `creditorSchema` has `{ _id: false }`. When doing an update on an individual creditor, the positional operator `$` requires a filter that matches the subdocument. Since there is no `_id`, the existing pattern is `{ 'final_creditor_list.id': creditor.id }`.
**Why it happens:** Mongoose positional operator relies on the query filter identifying the array element.
**How to avoid:** All creditor subdoc updates must use `{ _id: client._id, 'final_creditor_list.id': creditorId }` as the filter when setting `second_letter_sent_at` etc. per-creditor.
**Warning signs:** Positional update silently updates wrong creditor or no creditor.

### Pitfall 4: `config` path in migration script
**What goes wrong:** Migration scripts use `require('../config')` but there is no `server/config.js` file — the config might be imported differently.
**Why it happens:** Existing scripts use `require('../config')` (confirmed: `backfill-contact-status.js`, `backfill-leineweber-data.js`).
**How to avoid:** Follow the exact require pattern from existing scripts. Check that `config.MONGODB_URI` resolves.
**Warning signs:** `Cannot find module '../config'` on script run. If this happens, check what the existing scripts actually require.

## Code Examples

Verified patterns from codebase inspection (source: `server/models/Client.js`, `server/scripts/backfill-contact-status.js`, `server/scripts/backfill-leineweber-data.js`, `server/scheduler.js`):

### Existing financial data subdoc pattern (reference for snapshot structure)
```javascript
// From Client.js — financial_data pattern to mirror:
financial_data: {
  monthly_net_income: Number,
  number_of_children: { type: Number, default: 0 },
  marital_status: {
    type: String,
    enum: ['ledig', 'verheiratet', 'geschieden', 'verwitwet', 'getrennt_lebend']
  },
  garnishable_amount: Number,
  recommended_plan_type: {
    type: String,
    enum: ['quotenplan', 'nullplan']
  },
  client_form_filled: { type: Boolean, default: false },
  form_filled_at: Date,
  calculation_completed_at: Date
},
```

### Migration script boilerplate (source: backfill-contact-status.js pattern)
```javascript
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const config = require('../config');
const DRY_RUN = process.argv.includes('--dry-run');

async function run() {
  await mongoose.connect(config.MONGODB_URI);
  const Client = require('../models/Client');
  // ... migration logic ...
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
```

### Per-creditor subdoc update pattern (source: backfill-contact-status.js)
```javascript
// Update a specific creditor's field within final_creditor_list:
await Client.updateOne(
  {
    _id: client._id,
    'final_creditor_list.id': creditor.id,  // Match by creditor.id (not _id — schema has _id: false)
  },
  {
    $set: {
      'final_creditor_list.$.second_letter_sent_at': new Date(),
    },
  }
);
```

### Atomic state guard pattern (source: adminReviewController.js)
```javascript
// findOneAndUpdate returns null if filter doesn't match = guard fired
const client = await Client.findOneAndUpdate(
  { id: clientId, second_letter_status: 'IDLE' }, // Status guard
  {
    $set: {
      second_letter_status: 'PENDING',
      second_letter_triggered_at: new Date()
    }
  },
  { new: true }
);
if (!client) {
  // Guard blocked: client is already PENDING/FORM_SUBMITTED/SENT
  return res.status(409).json({ error: 'Second letter already triggered', status: existingStatus });
}
```

### Scheduler integration pattern (source: server/scheduler.js)
```javascript
// For Phase 29: add to Scheduler.startScheduledTasks()
const SECOND_LETTER_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
setInterval(async () => {
  try {
    console.log('\n⏰ Running second letter scheduler check...');
    const result = await secondLetterSchedulerService.checkAndTriggerPending();
    console.log(`✅ Second letter check complete: ${result.triggered} clients set to PENDING\n`);
  } catch (error) {
    console.error('❌ Error in second letter scheduler check:', error);
  }
}, SECOND_LETTER_CHECK_INTERVAL);
```

## Discretionary Decisions (Claude's Recommendation)

### 1. Creditor data in snapshot: freeze vs. live references
**Recommendation: DO NOT freeze creditor data in snapshot.** The `second_letter_financial_snapshot` contains only financial decision data (income, plan type, etc.). The live `final_creditor_list` on the client document is the authoritative creditor data. Phase 32 (document generation) reads creditors live. This avoids data duplication and keeps the snapshot focused on what actually needs to be frozen: the client's financial situation at form submission time.

**Evidence:** STATE.md decision: "Snapshot-first: second_letter_financial_snapshot written at form submission; DOCX generation reads exclusively from snapshot (not live data)" — this refers to financial data, not creditor identities.

### 2. Migration timing: script vs. Mongoose defaults
**Recommendation: Migration script.** The existing codebase exclusively uses standalone scripts for backfills (`backfill-contact-status.js`, `backfill-leineweber-data.js`). Mongoose schema defaults do not affect existing documents. A script gives auditable, controllable migration with `--dry-run` support.

### 3. Creditor email field: what exists already
**Finding:** The existing `creditorSchema` already has both `email_glaeubiger: String` and `email_glaeubiger_vertreter: String`. No email field needs to be added. The three new fields (`second_letter_sent_at`, `second_letter_email_sent_at`, `second_letter_document_filename`) are tracking/audit fields, not contact fields.

### 4. Calculated values (quota, Tilgungsangebot) placement
**Recommendation: In the snapshot, NOT on creditor subdocuments.** Quota calculation requires the full creditor list (total debt denominator). It is a batch calculation output, not a property of an individual creditor known at schema-definition time. Phase 31 will write calculated quotas into the snapshot (or a separate structure). Phase 28 does NOT need to pre-add these fields — they belong to Phase 31's scope.

### 5. Admin status reset (SENT → IDLE)
**Recommendation: Deferred per CONTEXT.md.** SENT is the final state for v10. Do not add a reset mechanism in Phase 28. No schema changes needed.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `second-round-api.js` + `secondRoundManager.js` | New `secondLetterService.js` with atomic guards | v10 roadmap decision | Old files use Zendesk-centric architecture incompatible with new flow; they are to be deprecated with a comment, not removed or extended |
| Per-document save in migration scripts | `updateMany` bulk operation | Standard MongoDB practice | Faster, fewer round-trips, no pre-save hook side effects during migration |

**Deprecated/outdated:**
- `server/services/secondRoundManager.js`: Zendesk-centric, does not use Client model state machine. Add deprecation comment, do not extend.
- `server/routes/second-round-api.js`: Deprecated route file per STATE.md. Add deprecation comment.

## Open Questions

1. **Does `require('../config')` resolve in migration scripts?**
   - What we know: `backfill-contact-status.js` and `backfill-leineweber-data.js` both use `require('../config')`. The glob search for `server/config.js` returned no results.
   - What's unclear: The config module may be loaded differently (e.g., `server/config/index.js` or inline in `server.js`). This is a LOW confidence item.
   - Recommendation: Before writing the migration script, verify the correct require path by checking what the existing scripts actually use at runtime (or grep for the config export).

2. **`second_letter_form_token` field — include in Phase 28?**
   - What we know: STATE.md states "Token: dedicated second_letter_form_token (short-lived, 14 days) — NOT the onboarding portal_token". This token is needed by Phase 30 (Portal Form).
   - What's unclear: Whether it makes sense to add the token field in Phase 28 (schema-only phase) or defer to Phase 30.
   - Recommendation: Add `second_letter_form_token: String` and `second_letter_form_token_expires_at: Date` to `clientSchema` in Phase 28. These are schema fields with no logic — they belong in the schema phase, and adding them here keeps Phase 30 focused on logic not schema.

## Sources

### Primary (HIGH confidence)
- `server/models/Client.js` — Full schema inspection: `clientSchema`, `creditorSchema`, `documentSchema`, existing subdoc patterns (`financial_data`, `extended_financial_data`, `review_assignment`), enum patterns
- `server/scripts/backfill-contact-status.js` — Migration script pattern: dotenv, mongoose.connect, updateOne with positional `$`, DRY_RUN flag
- `server/scripts/backfill-leineweber-data.js` — Migration script pattern: updateMany with `$set`, CLI flags, comprehensive logging
- `server/scheduler.js` — Scheduler pattern: setInterval, dependency injection, initial setTimeout kicks
- `server/server.js` — Scheduler instantiation: `new Scheduler({ ... }); scheduler.startScheduledTasks()`
- `server/controllers/adminReviewController.js` — Atomic findOneAndUpdate pattern

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` v10 Key Decisions — Architecture decisions established at roadmap creation, not directly verified against code
- `.planning/REQUIREMENTS.md` — Requirements text for SCHEMA-01 through SCHEMA-04

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against existing codebase files
- Architecture: HIGH — all patterns confirmed by direct code inspection
- Pitfalls: HIGH — Mongoose behavior verified by schema inspection, migration patterns from existing scripts
- Discretionary recommendations: HIGH — grounded in codebase evidence and STATE.md decisions

**Research date:** 2026-03-02
**Valid until:** 2026-04-01 (stable domain — Mongoose schema/migration patterns don't change frequently)
