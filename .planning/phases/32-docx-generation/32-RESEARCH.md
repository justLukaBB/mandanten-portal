# Phase 32: DOCX Generation - Research

**Researched:** 2026-03-02
**Domain:** DOCX generation via docxtemplater + pizzip — mirroring existing firstRoundDocumentGenerator.js
**Confidence:** HIGH

## Summary

Phase 32 creates `SecondLetterDocumentGenerator` — a class that mirrors the existing `server/services/firstRoundDocumentGenerator.js` in structure, libraries, and patterns, with two key differences: (1) it selects between two templates based on `plan_type` from the snapshot (RATENPLAN vs NULLPLAN), and (2) it reads all data exclusively from `second_letter_financial_snapshot` and `final_creditor_list`, never from live `financial_data`. Both templates will be placed in `server/templates/`. The generator is a standalone service that Phase 33 will call from the email dispatch orchestrator.

The exact docxtemplater configuration — `{ paragraphLoop: true, linebreaks: true, delimiters: { start: '{', end: '}' } }` — is already proven in production on the first round generator and must be reused verbatim. The German-quote normalization pre-processing step (replacing „/"/„ with `{`/`}` inside `<w:t>` elements before passing to PizZip) is also required if templates are authored in Word with German autocorrect enabled.

The main engineering challenge is placeholder variable definition: the templates do not yet have docxtemplater placeholders inserted. The planner must define the complete variable name list as part of Phase 32 planning, and those names must go into the templates. The file naming and sanitization logic follow the locked decisions in CONTEXT.md. Error handling continues on per-creditor failure, and the generated filename is stored on the creditor document via `findOneAndUpdate`.

**Primary recommendation:** Implement `SecondLetterDocumentGenerator` as a class in `server/services/secondLetterDocumentGenerator.js`, mirroring `firstRoundDocumentGenerator.js` exactly except for the two-template branching and the snapshot-only data source.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Template content & structure:**
- DOCX templates (Ratenplan + Nullplan) exist externally and will be provided — not created as part of this phase
- Templates do NOT yet contain docxtemplater placeholders — placeholders must be inserted into the templates
- Placeholder variable names should mirror the firstRoundDocumentGenerator naming conventions where possible for consistency
- Two templates: one for Ratenplan, one for Nullplan — template selection based solely on plan_type field

**Variable formatting:**
- Currency amounts: German format with period thousands separator, comma decimal, Euro sign — `1.234,56 €`
- Dates: German short format — `02.03.2026` (TT.MM.JJJJ)
- Addresses: Multi-line format — Name, Straße, PLZ Ort (standard German letter format)
- Percentage values (Quote): Whole numbers when possible, decimals only when needed — `45 %` or `45,5 %`

**File naming & storage:**
- Filename pattern: `{CreditorName}_{Aktenzeichen}_{PlanType}.docx` — e.g. `Mueller-Co-KG_AZ-12345_Ratenplan.docx`
- Special characters in creditor names are sanitized: Umlaute replaced (ü→ue, ä→ae, ö→oe, ß→ss), spaces/special chars replaced with hyphens
- Plan type (Ratenplan/Nullplan) is included in the filename for easy identification
- Files stored in per-client subdirectories: `generated_documents/second_round/{clientId}/`
- Filename is stored on the creditor document in MongoDB

**Error handling:**
- Generation continues on per-creditor failure — errors are collected, remaining creditors are still processed
- Errors logged both to server log (for debugging) and returned in API response (admin sees which creditors failed)
- Admin can retry generation for individual failed creditors (not just full batch re-run)
- Re-generation overwrites existing file — no versioning, clean overwrite

### Claude's Discretion
- Exact docxtemplater configuration and options
- Sanitization function implementation details
- Internal error object structure
- How to structure the generator class/module

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DOC-01 | SecondLetterDocumentGenerator erstellt (spiegelt FirstRoundDocumentGenerator — docxtemplater + pizzip) | Mirror the class structure exactly: constructor sets templatePaths (two paths, keyed by plan_type) and outputDir. Methods: `generateForAllCreditors()`, `generateForSingleCreditor()`, `prepareTemplateData()`, `ensureOutputDirectory()`. Libraries already installed: `docxtemplater@^3.66.4`, `pizzip@^3.2.0`. |
| DOC-02 | Template-Branching: plan_type == RATENPLAN → Ratenplan-Template, sonst → Nullplan-Template | Read `plan_type` from `second_letter_financial_snapshot`. In constructor, define `this.templatePaths = { RATENPLAN: path.join(__dirname, '../templates/2.Schreiben_Ratenplan.docx'), NULLPLAN: path.join(__dirname, '../templates/2.Schreiben_Nullplan.docx') }`. Template selection: `const templatePath = this.templatePaths[snapshot.plan_type] || this.templatePaths.NULLPLAN`. |
| DOC-03 | Template-Variablen befüllt: creditor data, debtor data, plan data, law firm Aktenzeichen — all from snapshot | `prepareTemplateData(snapshot, creditor, client)` reads exclusively from snapshot for financial values; from `client` for name/birthdate/address/aktenzeichen; from `creditor` (final_creditor_list entry) for creditor name/address/reference. Per-creditor values (tilgungsangebot, quota) come from `snapshot.creditor_calculations[]` matched by creditor._id. |
| DOC-04 | Ein DOCX pro Gläubiger generiert, gespeichert in generated_documents/second_round/ mit Filename auf Creditor-Dokument gespeichert | Output dir: `server/generated_documents/second_round/{clientId}/`. After successful write, persist filename to creditor via `Client.findOneAndUpdate({ _id: clientId, 'final_creditor_list._id': creditorId }, { $set: { 'final_creditor_list.$.second_letter_document_filename': filename } })` — mirrors the pattern used in creditorContactService.js line 726 for first round. |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `docxtemplater` | `^3.66.4` | DOCX template variable substitution | Already in production for first round letters. Same version, same config. |
| `pizzip` | `^3.2.0` | Zip/unzip DOCX binary buffers | Required by docxtemplater. Already installed. |
| `fs.promises` | Node built-in | Read template file, write output file | Async file I/O. Same pattern as firstRoundDocumentGenerator. |
| `path` | Node built-in | Resolve template and output paths | Same pattern as firstRoundDocumentGenerator. |
| `Mongoose` (`Client.findOneAndUpdate`) | existing | Persist filename to creditor subdocument | Atomic update of `final_creditor_list.$.second_letter_document_filename`. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `addressFormatter` (existing utility) | existing | Format multi-line German address | Already used in firstRoundDocumentGenerator. Reuse `formatAddress()` from `server/utils/addressFormatter.js`. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| docxtemplater + pizzip | `officegen`, `libreoffice` headless | docxtemplater is already installed, proven, no system dependency. No reason to change. |
| Per-client subdirectory | Flat directory with client prefix | Per-client subdirectory is the locked decision. Consistent with `generated_documents/first_round` (which is flat, but second round adds hierarchy for organizational clarity). |

**Installation:** No new packages required. `docxtemplater@^3.66.4` and `pizzip@^3.2.0` are already in `server/package.json`.

---

## Architecture Patterns

### Recommended Project Structure

```
server/
├── services/
│   └── secondLetterDocumentGenerator.js    # NEW — mirrors firstRoundDocumentGenerator.js
├── templates/
│   ├── 1.Schreiben.docx                    # Existing first round template
│   ├── 2.Schreiben_Ratenplan.docx          # NEW — to be provided by user
│   └── 2.Schreiben_Nullplan.docx           # NEW — to be provided by user
└── generated_documents/
    ├── first_round/                         # Existing
    └── second_round/
        └── {clientId}/                     # NEW — per-client subdirectories
```

### Pattern 1: Class Mirroring firstRoundDocumentGenerator

**What:** `SecondLetterDocumentGenerator` is a class with constructor, and the same set of methods as `FirstRoundDocumentGenerator`. The only structural differences are two template paths (keyed by plan_type) and the `prepareTemplateData` signature receiving `snapshot` in addition to `client` and `creditor`.

**When to use:** Called by Phase 33 email dispatch service after snapshot calculation is complete.

**Key difference from first round:** The first round uses a single `clientData` object from the caller. The second round splits into: `snapshot` (financial variables), `client` (personal data — name, address, birthdate, aktenzeichen), and `creditor` (the specific final_creditor_list entry).

**Example class skeleton:**
```javascript
// server/services/secondLetterDocumentGenerator.js
const fs = require('fs').promises;
const path = require('path');
const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');
const { formatAddress } = require('../utils/addressFormatter');

class SecondLetterDocumentGenerator {
  constructor() {
    this.templatePaths = {
      RATENPLAN: path.join(__dirname, '../templates/2.Schreiben_Ratenplan.docx'),
      NULLPLAN:  path.join(__dirname, '../templates/2.Schreiben_Nullplan.docx'),
    };
    // outputDir is per-client; created dynamically in generateForAllCreditors
  }

  async generateForAllCreditors(client, snapshot) {
    const clientId = client._id.toString();
    const outputDir = path.join(__dirname, '../generated_documents/second_round', clientId);
    await this.ensureOutputDirectory(outputDir);

    const results = [];
    const errors = [];

    for (const creditor of (client.final_creditor_list || [])) {
      try {
        const result = await this.generateForSingleCreditor(client, snapshot, creditor, outputDir);
        results.push(result);
      } catch (err) {
        errors.push({
          creditor_id: creditor._id?.toString(),
          creditor_name: creditor.sender_name || creditor.creditor_name,
          error: err.message,
        });
      }
    }

    return {
      success: true,
      total_generated: results.length,
      total_failed: errors.length,
      documents: results,
      errors,
    };
  }

  async generateForSingleCreditor(client, snapshot, creditor, outputDir) {
    const planType = snapshot.plan_type || 'NULLPLAN';
    const templatePath = this.templatePaths[planType] || this.templatePaths.NULLPLAN;

    // Read and normalize template (same quote-normalization as first round)
    const templateContent = await fs.readFile(templatePath);
    const zip = new PizZip(templateContent);
    this._normalizeGermanQuotes(zip);

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{', end: '}' },
    });

    const templateData = this.prepareTemplateData(client, snapshot, creditor);
    doc.render(templateData);

    const outputBuffer = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    const filename = this._buildFilename(creditor, client, planType);
    const outputPath = path.join(outputDir, filename);

    await fs.writeFile(outputPath, outputBuffer);

    return {
      success: true,
      creditor_id: creditor._id?.toString(),
      creditor_name: creditor.sender_name || creditor.creditor_name,
      filename,
      path: outputPath,
    };
  }

  // ... prepareTemplateData, _buildFilename, _normalizeGermanQuotes, ensureOutputDirectory
}

module.exports = SecondLetterDocumentGenerator;
```

### Pattern 2: Template Variable Population from Snapshot

**What:** `prepareTemplateData(client, snapshot, creditor)` returns a flat object of template variables. Per-creditor calculation values are looked up from `snapshot.creditor_calculations[]` by matching `creditor_id`.

**Data sources:**
- Creditor data: from `creditor` (final_creditor_list entry)
- Debtor data: from `client` (name, birthdate, address fields, aktenzeichen)
- Plan data: from `snapshot` (plan_type, garnishable_amount, monthly_rate, calculated_at as start date, deadline TBD)
- Per-creditor financial data: from `snapshot.creditor_calculations[]` matched by `creditor_id`

**German formatting helpers** (implement inline or as small private methods):
```javascript
// Currency: 1234.56 → "1.234,56 €"
function formatEuro(amount) {
  if (amount == null || !Number.isFinite(amount)) return '0,00 €';
  return amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

// Date: new Date() → "02.03.2026"
function formatGermanDate(date) {
  return new Date(date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Percentage: 45 → "45 %", 45.5 → "45,5 %"
function formatPercent(value) {
  if (value == null) return '0 %';
  const rounded = Math.round(value * 10) / 10;  // 1 decimal precision
  const formatted = rounded % 1 === 0
    ? rounded.toString()
    : rounded.toLocaleString('de-DE');
  return formatted + ' %';
}
```

### Pattern 3: Filename Sanitization

**What:** The creditor name must be sanitized for use in filenames. The locked decision specifies: Umlaute replaced (ü→ue, ä→ae, ö→oe, ß→ss), spaces/special chars replaced with hyphens, Plan type appended.

**Example:**
```javascript
function sanitizeForFilename(name) {
  return (name || 'Unbekannt')
    .replace(/ü/g, 'ue').replace(/Ü/g, 'Ue')
    .replace(/ä/g, 'ae').replace(/Ä/g, 'Ae')
    .replace(/ö/g, 'oe').replace(/Ö/g, 'Oe')
    .replace(/ß/g, 'ss')
    .replace(/[^a-zA-Z0-9\-]/g, '-')   // Replace remaining special chars with hyphen
    .replace(/-{2,}/g, '-')             // Collapse multiple hyphens
    .replace(/^-|-$/g, '')              // Trim leading/trailing hyphens
    .substring(0, 50);
}

function buildFilename(creditor, client, planType) {
  const creditorPart = sanitizeForFilename(creditor.sender_name || creditor.creditor_name);
  const aktenzeichenPart = sanitizeForFilename(client.aktenzeichen || 'AZ-unbekannt');
  const planPart = planType === 'RATENPLAN' ? 'Ratenplan' : 'Nullplan';
  return `${creditorPart}_${aktenzeichenPart}_${planPart}.docx`;
}
```

### Pattern 4: Persisting Filename to Creditor Document

**What:** After successful file write, update the creditor subdocument's `second_letter_document_filename` field using a positional `$` operator. This mirrors the first-round pattern in `creditorContactService.js` line 726.

**Example:**
```javascript
// After successful file write:
await Client.findOneAndUpdate(
  { _id: client._id, 'final_creditor_list._id': creditor._id },
  { $set: { 'final_creditor_list.$.second_letter_document_filename': filename } }
);
```

Note: This field must exist on the final_creditor_list subdocument schema (added in Phase 28). Phase 32 assumes Phase 28 is complete.

### Pattern 5: German Quote Normalization (pre-processing before PizZip)

The first round generator normalizes German typographic quotes inside `<w:t>` XML elements before passing to docxtemplater. This is required if Word templates are authored with German autocorrect (which replaces `{...}` with `„..."` or similar). Reuse this exact preprocessing step:

```javascript
_normalizeGermanQuotes(zip) {
  const docFile = zip.files['word/document.xml'];
  if (!docFile) return;
  let xml = docFile.asText();
  xml = xml.replace(/<w:t([^>]*)>([^<]*)<\/w:t>/g, (match, attrs, text) => {
    const normalized = text
      .replace(/\u201E/g, '{')   // „ German opening quote
      .replace(/\u201C/g, '}')   // " German closing quote
      .replace(/\u201D/g, '}')   // " Right double quotation mark
      .replace(/"([^"{}]+)"/g, '{$1}');
    return `<w:t${attrs}>${normalized}</w:t>`;
  });
  zip.file('word/document.xml', xml);
}
```

### Anti-Patterns to Avoid

- **Reading from live `financial_data` or `extended_financial_data`:** DOCX generation must read exclusively from `second_letter_financial_snapshot`. Never fall back to live data.
- **Skipping the German quote normalization:** If omitted and the template has typographic quotes, docxtemplater will silently skip variable substitution with no error — the placeholder text appears verbatim in the output.
- **Single output directory for all clients:** The locked decision is per-client subdirectory (`second_round/{clientId}/`). Do not flatten to `second_round/` directly.
- **Saving filename before file write completes:** Always `await fs.writeFile(...)` before persisting the filename to MongoDB. If write fails, the filename must not be stored.
- **Using `toFixed()` for currency display:** `toFixed()` returns a string and can produce wrong rounding. Use `toLocaleString('de-DE', ...)` for display formatting.
- **Hard-stopping on per-creditor failure:** The locked decision is to collect errors and continue. Never `throw` from the `generateForAllCreditors` loop — only from `generateForSingleCreditor` (which is caught by the loop).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DOCX variable substitution | Custom XML string replacement | `docxtemplater` (already installed) | docxtemplater handles nested loops, conditional blocks, XML escaping, and complex OOXML structures correctly |
| Zip read/write | Custom binary parsing | `pizzip` (already installed) | DOCX is an OOXML zip container; pizzip correctly handles all internal file references |
| German address formatting | Inline formatting logic | `server/utils/addressFormatter.js` (existing) | Already handles the multi-line address format used in first round letters |

**Key insight:** The entire docxtemplater+pizzip pattern is already proven and running in production. The only new code is the template data contract and the two-template branching logic.

---

## Template Variable Contract

This is the complete variable set that must be inserted as `{VariableName}` placeholders in both DOCX templates. The planner must communicate this list to the user for template authoring.

**Creditor block:**
| Variable | Source | Example |
|----------|--------|---------|
| `{Adresse D C}` | creditor sender_name + formatAddress(creditor.creditor_address) | `Muster GmbH\nMusterstraße 1\n10115 Berlin` |
| `{Creditor}` | creditor.glaeubiger_name or sender_name | `Muster GmbH` |
| `{Aktenzeichen D C}` | creditor.reference_number or creditor.creditor_reference | `AZ-12345` |
| `{Forderung}` | claim_amount, Euro format | `5.234,00 €` |
| `{Quote}` | quota_percentage from snapshot.creditor_calculations | `23,5 %` |
| `{Auszahlung}` | tilgungsangebot from snapshot.creditor_calculations, Euro format | `47,22 €` |

**Debtor block (same as first round):**
| Variable | Source | Example |
|----------|--------|---------|
| `{Name}` | client.name | `Max Mustermann` |
| `{Geburtstag}` | client.birthdate | `15.04.1975` |
| `{Adresse}` | formatAddress(client.address or structured fields) | `Musterweg 5\n80331 München` |
| `{Familienstand}` | snapshot.familienstand | `verheiratet` |
| `{Unterhaltsberechtigte}` | snapshot.anzahl_unterhaltsberechtigte | `2` |
| `{Einkommen}` | snapshot.monthly_net_income, Euro format | `2.100,00 €` |

**Plan data block:**
| Variable | Source | Example |
|----------|--------|---------|
| `{Plantyp}` | snapshot.plan_type | `Ratenplan` |
| `{Monatliche Rate}` | snapshot.garnishable_amount (= monthly payment), Euro format | `178,50 €` |
| `{Startdatum}` | snapshot.calculated_at or today, German date | `01.04.2026` |
| `{Frist}` | today + 14 days, German date | `16.04.2026` |

**Law firm block:**
| Variable | Source | Example |
|----------|--------|---------|
| `{Aktenzeichen des Mandanten}` | client.aktenzeichen | `MP-2024-001` |
| `{heutiges Datum}` | today, German date | `02.03.2026` |

**Note on NULLPLAN:** The Nullplan template may display `{Auszahlung}` as `0,00 €` and `{Quote}` as `0 %`. The generator populates both templates with the same variable set — the template content differs (letter body text), not the variable names.

---

## Common Pitfalls

### Pitfall 1: Template Files Not in Place Before Testing
**What goes wrong:** Generator throws `ENOENT: no such file or directory` on template read. This is a hard blocker — the generator cannot be tested end-to-end without the actual template files.
**Why it happens:** Templates must be provided by the user and placed in `server/templates/` before Phase 32 code can run.
**How to avoid:** Phase 32 planning must include a step that defines placeholder names and communicates them to the user for template authoring. The generator can be written and unit-tested with a minimal placeholder template file.
**Warning signs:** `Error: ENOENT` on `fs.readFile(templatePath)`.

### Pitfall 2: German Quote Normalization Omitted
**What goes wrong:** Template placeholders appear verbatim in generated DOCX — variables are not substituted.
**Why it happens:** Word (especially on macOS) autocorrects `{VariableName}` to `„VariableName"` (using German typographic quotes). docxtemplater only recognizes `{` and `}` as delimiters; the quote characters are different Unicode code points.
**How to avoid:** Always apply `_normalizeGermanQuotes(zip)` after PizZip loads the template and before creating Docxtemplater instance. This is already in the first round generator.
**Warning signs:** Generated DOCX contains `{Name}` or `„Name"` literally instead of the actual value.

### Pitfall 3: Per-Creditor Calculation Data Not Found in Snapshot
**What goes wrong:** `snapshot.creditor_calculations` is empty or undefined when the generator runs (calculation failed in Phase 31, or snapshot is in `calculation_status: 'failed'` state).
**Why it happens:** Phase 33 calls Phase 32 without checking if calculation completed successfully.
**How to avoid:** Phase 33 must guard: check `snapshot.calculation_status === 'completed'` before calling the generator. The generator itself should also handle missing calculation gracefully: if no matching entry in `creditor_calculations`, fall back to `tilgungsangebot: 0` and `quota_percentage: 0` and log a warning.
**Warning signs:** Template variables `{Auszahlung}` and `{Quote}` render as `0,00 €` / `0 %` for all creditors.

### Pitfall 4: Output Directory Not Created Before Write
**What goes wrong:** `ENOENT: no such file or directory` when writing the first file for a new client (the per-client subdirectory doesn't exist yet).
**Why it happens:** Unlike the first round generator (which uses a flat directory created once in constructor), the second round uses per-client subdirectories that don't pre-exist.
**How to avoid:** Call `fs.mkdir(outputDir, { recursive: true })` at the start of `generateForAllCreditors()` before the loop.
**Warning signs:** First file write fails, but subsequent runs succeed if directory was manually created.

### Pitfall 5: Filename Stored Before File Write Confirmation
**What goes wrong:** Creditor document shows a filename but the file doesn't exist on disk (e.g., write failed midway, or process crashed between MongoDB update and file write).
**Why it happens:** Persisting filename to MongoDB before `await fs.writeFile()` confirms success.
**How to avoid:** Always: (1) write file, (2) verify with `fs.stat()` or trust the successful `await`, (3) then update MongoDB. The first round generator follows this pattern: `await fs.writeFile(outputPath, outputBuffer)` then `const stats = await fs.stat(outputPath)`.

### Pitfall 6: Overwrite Without Delete Leaves Corrupt Files
**What goes wrong:** If a creditor's document is regenerated and the new write fails midway, the old file is partially overwritten with corrupt content.
**Why it happens:** `fs.writeFile` on an existing path truncates then writes — if the write fails mid-stream, the result is a corrupt file.
**How to avoid:** This is acceptable for v10 (no versioning is the locked decision). Log the overwrite action. The risk is low since `fs.writeFile` with a complete Buffer is atomic enough on most file systems for files of this size.

---

## Code Examples

### Complete prepareTemplateData (Reference Implementation)
```javascript
// Source: mirrors firstRoundDocumentGenerator.js prepareTemplateData, with snapshot data
prepareTemplateData(client, snapshot, creditor) {
  const today = new Date();
  const deadlineDate = new Date();
  deadlineDate.setDate(today.getDate() + 14);

  // Find per-creditor calculation from snapshot
  const creditorId = creditor._id?.toString() || creditor.id;
  const calcEntry = (snapshot.creditor_calculations || [])
    .find(c => c.creditor_id === creditorId) || {};

  return {
    // Creditor block (mirrors first round variable names)
    'Adresse D C': [
      creditor.sender_name || creditor.creditor_name,
      formatAddress(creditor.creditor_address || creditor.address || creditor.sender_address || ''),
    ].filter(Boolean).join('\n'),
    'Creditor': creditor.glaeubiger_name || creditor.sender_name || creditor.creditor_name || 'Unbekannt',
    'Aktenzeichen D C': [
      creditor.reference_number, creditor.creditor_reference, creditor.reference, creditor.aktenzeichen
    ].find(r => r && r.trim() && r.toUpperCase() !== 'N/A') || 'AZ nicht vorhanden',
    'Forderung': formatEuro(calcEntry.claim_amount || creditor.claim_amount),
    'Quote': formatPercent(calcEntry.quota_percentage),
    'Auszahlung': formatEuro(calcEntry.tilgungsangebot || 0),

    // Debtor block (same as first round)
    'Name': client.name,
    'Geburtstag': client.birthdate || client.dateOfBirth || 'Nicht verfügbar',
    'Adresse': this.formatClientAddress(client),
    'Familienstand': snapshot.familienstand || '',
    'Unterhaltsberechtigte': String(snapshot.anzahl_unterhaltsberechtigte || 0),
    'Einkommen': formatEuro(snapshot.monthly_net_income),

    // Plan block
    'Plantyp': snapshot.plan_type === 'RATENPLAN' ? 'Ratenplan' : 'Nullplan',
    'Monatliche Rate': formatEuro(snapshot.garnishable_amount || 0),
    'Startdatum': formatGermanDate(snapshot.calculated_at || today),
    'Frist': formatGermanDate(deadlineDate),

    // Law firm block
    'Aktenzeichen des Mandanten': client.aktenzeichen || client.reference || '',
    'heutiges Datum': formatGermanDate(today),
    'heutiges D': formatGermanDate(today),
  };
}
```

### Generating for a Single Creditor (Admin Retry Pattern)
```javascript
// Exposed for admin retry endpoint (Phase 33 or future admin UI)
async generateForSingleCreditorById(clientId, creditorId) {
  const Client = require('../models/Client');
  const client = await Client.findById(clientId);
  if (!client) throw new Error(`Client ${clientId} not found`);

  const snapshot = client.second_letter_financial_snapshot;
  if (!snapshot || snapshot.calculation_status !== 'completed') {
    throw new Error('Snapshot not available or calculation not completed');
  }

  const creditor = (client.final_creditor_list || [])
    .find(c => c._id.toString() === creditorId);
  if (!creditor) throw new Error(`Creditor ${creditorId} not found`);

  const outputDir = path.join(__dirname, '../generated_documents/second_round', clientId);
  await this.ensureOutputDirectory(outputDir);

  const result = await this.generateForSingleCreditor(client, snapshot, creditor, outputDir);

  // Persist filename
  await Client.findOneAndUpdate(
    { _id: client._id, 'final_creditor_list._id': creditor._id },
    { $set: { 'final_creditor_list.$.second_letter_document_filename': result.filename } }
  );

  return result;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single template for all plan types | Two templates branched by plan_type | Phase 32 (new) | Template content can differ radically between RATENPLAN and NULLPLAN letters |
| Flat first_round directory | Per-client subdirectory in second_round | Phase 32 (new) | Keeps second round files organized by client; easier to clean up |
| firstRoundDocumentGenerator reads live client data | secondLetterDocumentGenerator reads only from snapshot | Phase 32 design | Snapshot-isolation ensures document content is frozen at form-submission time |

**Deprecated/outdated:**
- `server/services/secondRoundManager.js`: Zendesk-centric old pattern. Do NOT reference or extend. Add deprecation comment per STATE.md decisions.
- `server/routes/second-round-api.js`: Deprecated route file. Add deprecation comment. Do not extend.

---

## Open Questions

1. **Template placeholder names — user confirmation required**
   - What we know: Variable names listed in this document under "Template Variable Contract" are derived from first-round naming conventions and the CONTEXT.md requirements. They are recommendations.
   - What's unclear: The actual templates (once provided) may already have different placeholder names, or the user may prefer different names for the second round.
   - Recommendation: During planning, present the variable list to the user for confirmation before writing the generator. The generator's `prepareTemplateData` is entirely driven by these names.

2. **`{Startdatum}` — what date to use**
   - What we know: The CONTEXT.md mentions "Startdatum" as a plan data field. Options: (a) date calculation completed (`snapshot.calculated_at`), (b) today's date at generation time, (c) first day of next month after generation.
   - What's unclear: User intent — is this the plan start date or letter date?
   - Recommendation: Default to `snapshot.calculated_at` (when the plan was calculated). If that field doesn't exist, fall back to today. Planner should flag this for user confirmation.

3. **NULLPLAN template — does it need `{Quote}` and `{Auszahlung}` placeholders?**
   - What we know: For NULLPLAN, tilgungsangebot = 0 and quota = 0%. The letter body will be different (no payment plan proposed).
   - What's unclear: Whether the NULLPLAN template body even references these variables, or whether it uses different variables entirely.
   - Recommendation: Pass all variables to both templates. docxtemplater ignores variables that don't appear in the template. This means the generator can use the same `prepareTemplateData` for both template types.

---

## Sources

### Primary (HIGH confidence)
- `server/services/firstRoundDocumentGenerator.js` — Full implementation read. Confirms: class structure, docxtemplater config `{ paragraphLoop: true, linebreaks: true, delimiters: { start: '{', end: '}' } }`, German quote normalization preprocessing, `ensureOutputDirectory` pattern, `getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })`.
- `server/package.json` — Confirms versions: `docxtemplater: ^3.66.4`, `pizzip: ^3.2.0`.
- `server/services/creditorContactService.js` line 726 — Confirms `findOneAndUpdate` positional `$` pattern for storing filename on creditor subdocument.
- `server/models/Client.js` line 164 — Confirms `first_round_document_filename: String` field on creditor schema; Phase 28 will add `second_letter_document_filename`.
- `.planning/phases/31-financial-calculation-engine/31-RESEARCH.md` — Confirms snapshot data structure: `snapshot.creditor_calculations[]` contains `{ creditor_id, creditor_name, claim_amount, tilgungsangebot, quota_percentage }`. Confirms `snapshot.plan_type`, `snapshot.garnishable_amount`, `snapshot.familienstand`, `snapshot.anzahl_unterhaltsberechtigte`, `snapshot.monthly_net_income`.
- `.planning/phases/32-docx-generation/32-CONTEXT.md` — User decisions read and copied verbatim into User Constraints section.
- `server/templates/` listing — Confirms template directory exists at `server/templates/`. Current contents: `1.Schreiben.docx` and several Nullplan variants. Second round templates will be placed here.
- `server/generated_documents/second_round/` — Directory already exists (empty, created by earlier work).

### Secondary (MEDIUM confidence)
- `server/services/creditorEmailService.js` — `sendSecondRoundEmail()` signature confirmed: accepts `{ recipientEmail, recipientName, clientName, clientReference, attachment: { filename, path }, settlementDetails }`. Phase 32 generator output (filename + path) maps directly to this interface.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — libraries already installed and running in production; same config confirmed by reading source
- Architecture: HIGH — class structure is a direct mirror of existing code; data sources confirmed by reading Phase 31 research and schema
- Template variable contract: MEDIUM — names are recommendations derived from first-round conventions; require user confirmation before template authoring
- Pitfalls: HIGH — German quote normalization pitfall verified by reading firstRoundDocumentGenerator source; others verified by reading Node.js fs behavior and docxtemplater known behavior

**Research date:** 2026-03-02
**Valid until:** 2026-06-01 (docxtemplater 3.x is stable; no expected breaking changes)
