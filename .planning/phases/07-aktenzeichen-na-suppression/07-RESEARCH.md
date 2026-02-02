# Phase 7: Aktenzeichen N/A Suppression - Research

**Researched:** 2026-02-02
**Domain:** Word document template processing with Node.js (docxtemplater)
**Confidence:** HIGH

## Summary

This phase addresses a template rendering edge case where missing creditor reference numbers (Aktenzeichen) display "N/A" or "Nicht verfügbar" instead of an empty string in the first Anschreiben Word template. The system uses docxtemplater 3.67.6 with pizzip 3.2.0 to generate individual Word documents for each creditor.

**Current behavior:** When a creditor has no reference_number, the template shows fallback text ("Nicht verfügbar" or "N/A")

**Desired behavior:** Empty string (no text) when reference_number is missing or "N/A"

**Root cause:** Template data preparation in `firstRoundDocumentGenerator.js` uses a fallback chain that explicitly sets "Nicht verfügbar" when all reference fields are falsy. The codebase already has logic to filter out "N/A" values in other contexts (deduplication, Zendesk display), but the template generator lacks this handling.

**Primary recommendation:** Modify template data preparation to return empty string when reference_number is missing or "N/A", rather than using "Nicht verfügbar" fallback. This is a simple data transformation change, not a template engine configuration change.

## Standard Stack

The established libraries/tools for Word document generation in this codebase:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| docxtemplater | ^3.67.6 | Word document template rendering | Industry standard for Node.js DOCX generation, mature API |
| pizzip | ^3.2.0 | ZIP handling for DOCX files | Required by docxtemplater for manipulating DOCX structure |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| jszip | ^3.10.1 | Alternative ZIP library | Used by wordTemplateProcessor.js, older pattern |
| fs/promises | Node.js built-in | File I/O for templates | Reading/writing DOCX files |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| docxtemplater | docx-templates | docx-templates has more features but docxtemplater is already working well |
| Data transformation | nullGetter config | Data transformation is simpler and more explicit for this use case |

**Installation:**
```bash
# Already installed in project
npm install docxtemplater@^3.67.6 pizzip@^3.2.0
```

## Architecture Patterns

### Current Pattern: Data Preparation in Generator Service

The `firstRoundDocumentGenerator.js` follows a clean separation:

```
FirstRoundDocumentGenerator
├── generateCreditorDocuments() - Orchestrates batch generation
├── generateSingleCreditorDocument() - Per-creditor document generation
├── prepareTemplateData() - **Data transformation layer**
├── fixDocumentHyphenation() - Post-processing
└── fixDocumentSpacing() - Post-processing
```

**Pattern 1: Template Data Preparation**
```javascript
// Current pattern in prepareTemplateData()
"Aktenzeichen D C":
  creditor.reference_number ||
  creditor.creditor_reference ||
  creditor.reference ||
  creditor.aktenzeichen ||
  "Nicht verfügbar",  // ← Fallback causes the issue
```

**Pattern 2: N/A Filtering (used elsewhere in codebase)**
```javascript
// From server/utils/creditorDeduplication.js:110-111
if (
  creditor.reference_number &&
  member.reference_number &&
  creditor.reference_number !== 'N/A' &&  // ← Filter out N/A
  member.reference_number !== 'N/A' &&
  creditor.reference_number.trim() === member.reference_number.trim()
)

// From server/controllers/zendeskWebhookController.js:861
const refNum = c.reference_number && c.reference_number !== "N/A"
  ? `\n   Referenz: ${c.reference_number}`
  : "";  // ← Empty string for N/A
```

**Pattern 3: isUsableValue Helper (already exists)**
```javascript
// From server/services/firstRoundDocumentGenerator.js:7-8
const isUsableValue = (val) =>
  typeof val === "string" && val.trim() !== "" && val.trim().toUpperCase() !== "N/A";

// Already used for other fields:
Creditor:
  (isUsableValue(creditor.actual_creditor) && creditor.actual_creditor) ||
  (isUsableValue(creditor.sender_name) && creditor.sender_name) ||
  "Unbekannter Gläubiger",
```

### Recommended Solution Pattern

**Apply isUsableValue to reference_number field:**
```javascript
"Aktenzeichen D C": (() => {
  const candidates = [
    creditor.reference_number,
    creditor.creditor_reference,
    creditor.reference,
    creditor.aktenzeichen
  ];

  // Find first usable value (not N/A, not empty)
  for (const candidate of candidates) {
    if (isUsableValue(candidate)) {
      return candidate;
    }
  }

  // Return empty string instead of "Nicht verfügbar"
  return "";
})(),
```

**Why this pattern:**
- Consistent with existing `isUsableValue` helper
- Matches N/A handling in other parts of codebase
- No template engine configuration needed
- Clear, testable logic
- Minimal code change

### Anti-Patterns to Avoid

- **Using nullGetter for single field:** nullGetter is a global configuration that affects all fields. This requirement only affects one field, so using nullGetter would be overkill and could break other fields that legitimately need fallback values.

- **Modifying the template file:** The template file `1.Schreiben.docx` should remain unchanged. The problem is data, not template structure.

- **Adding conditional tags in template:** Using docxtemplater's `{#condition}...{/condition}` syntax would require template redesign and wouldn't handle the "N/A" string case.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DOCX ZIP manipulation | Custom ZIP parser | pizzip (already installed) | DOCX structure is complex with relationships, content types |
| Template variable replacement | String replace on XML | docxtemplater.render() | Handles split XML runs, preserves formatting |
| German hyphenation fixes | Manual XML editing | Existing fixDocumentHyphenation() | Already handles complex cases like "Eini-gungsversuchs" |
| Document spacing fixes | Custom paragraph editing | Existing fixDocumentSpacing() | Already handles salutation spacing edge cases |

**Key insight:** The codebase already has robust DOCX processing infrastructure. The fix for this phase is purely a data transformation change, not a template engine change.

## Common Pitfalls

### Pitfall 1: Confusing "N/A" String with Null/Undefined
**What goes wrong:** Developers treat "N/A" as falsy, but it's a truthy string
**Why it happens:** "N/A" comes from AI extraction (FastAPI service) as a string literal when reference number is missing from creditor documents
**How to avoid:** Always check both `!value` AND `value !== "N/A"` OR use the existing `isUsableValue()` helper
**Warning signs:** Reference numbers displaying "N/A" in generated documents, deduplication matching on "N/A" values

### Pitfall 2: Applying Fix to Wrong Template File
**What goes wrong:** Modifying other template processors or templates that don't have this issue
**Why it happens:** Multiple template types exist (Ratenplan, Nullplan, Schuldenbereinigungsplan)
**How to avoid:**
- Only modify `firstRoundDocumentGenerator.js`
- Only the "Aktenzeichen D C" field in `prepareTemplateData()`
- Template file is `server/templates/1.Schreiben.docx`
- Output directory is `server/generated_documents/first_round/`
**Warning signs:** Other documents showing empty Aktenzeichen fields that should have values

### Pitfall 3: Breaking Existing Fallback Chain
**What goes wrong:** Removing entire fallback chain means truly missing data shows undefined
**Why it happens:** Creditor data has multiple field names for same concept (reference_number, creditor_reference, reference, aktenzeichen)
**How to avoid:** Keep fallback chain, but filter each candidate through `isUsableValue()` before returning
**Warning signs:** Test failures, documents showing "undefined" instead of empty string

### Pitfall 4: Not Testing N/A String Explicitly
**What goes wrong:** Fix handles `null`/`undefined` but not literal "N/A" string
**Why it happens:** Test data uses `null` or missing fields, but production data has "N/A" strings from AI extraction
**How to avoid:** Test cases must include creditors with `reference_number: "N/A"` (string) and `reference_number: null`
**Warning signs:** Tests pass but production documents still show "N/A"

### Pitfall 5: Forgetting Document Post-Processing
**What goes wrong:** Assuming document generation is only template rendering
**Why it happens:** Document goes through hyphenation fixes and spacing fixes after template rendering
**How to avoid:** Changes should not interfere with `fixDocumentHyphenation()` and `fixDocumentSpacing()` methods
**Warning signs:** Documents generate successfully but have spacing or hyphenation issues

## Code Examples

Verified patterns from the codebase:

### Current Implementation (Before Fix)
```javascript
// server/services/firstRoundDocumentGenerator.js:1335-1340
prepareTemplateData(clientData, creditor) {
  // ... other fields ...

  return {
    "Aktenzeichen D C":
      creditor.reference_number ||
      creditor.creditor_reference ||
      creditor.reference ||
      creditor.aktenzeichen ||
      "Nicht verfügbar",  // ← Problem: Fallback to "Nicht verfügbar"

    // ... other fields ...
  };
}
```

### Recommended Fix (After)
```javascript
// server/services/firstRoundDocumentGenerator.js (modified)
prepareTemplateData(clientData, creditor) {
  // Helper function already exists at top of file:
  // const isUsableValue = (val) =>
  //   typeof val === "string" && val.trim() !== "" && val.trim().toUpperCase() !== "N/A";

  // Find first non-N/A reference number
  const findUsableReference = () => {
    const candidates = [
      creditor.reference_number,
      creditor.creditor_reference,
      creditor.reference,
      creditor.aktenzeichen
    ];

    for (const candidate of candidates) {
      if (isUsableValue(candidate)) {
        return candidate;
      }
    }

    return "";  // Empty string instead of "Nicht verfügbar"
  };

  return {
    "Aktenzeichen D C": findUsableReference(),

    // ... other fields remain unchanged ...
  };
}
```

### Alternative: Inline Implementation
```javascript
// More concise version (same behavior)
"Aktenzeichen D C":
  [
    creditor.reference_number,
    creditor.creditor_reference,
    creditor.reference,
    creditor.aktenzeichen
  ].find(ref => isUsableValue(ref)) || "",
```

### Test Case Example
```javascript
// scripts/tests/test-creditor-confirmation-anschreiben.js (to be added)
describe('Aktenzeichen N/A Suppression', () => {
  it('should display empty string when reference_number is "N/A"', async () => {
    const creditor = {
      sender_name: "Test Bank AG",
      reference_number: "N/A",  // Explicit N/A string
      claim_amount: 1000
    };

    const generator = new FirstRoundDocumentGenerator();
    const templateData = generator.prepareTemplateData(clientData, creditor);

    expect(templateData["Aktenzeichen D C"]).toBe("");
  });

  it('should display empty string when reference_number is null', async () => {
    const creditor = {
      sender_name: "Test Bank AG",
      reference_number: null,  // Null value
      claim_amount: 1000
    };

    const generator = new FirstRoundDocumentGenerator();
    const templateData = generator.prepareTemplateData(clientData, creditor);

    expect(templateData["Aktenzeichen D C"]).toBe("");
  });

  it('should display reference_number when valid', async () => {
    const creditor = {
      sender_name: "Test Bank AG",
      reference_number: "AZ-2024-001",  // Valid reference
      claim_amount: 1000
    };

    const generator = new FirstRoundDocumentGenerator();
    const templateData = generator.prepareTemplateData(clientData, creditor);

    expect(templateData["Aktenzeichen D C"]).toBe("AZ-2024-001");
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual XML string replacement | docxtemplater library | Pre-existing | Robust template rendering |
| Hardcoded fallback "Nicht verfügbar" | Empty string for missing data (this phase) | 2026-02-02 (v2.1) | Cleaner document output |
| No N/A filtering in templates | N/A filtering consistent across codebase | 2026-02-02 (v2.1) | Data quality improvement |

**Current state:**
- docxtemplater 3.67.6 is actively maintained (latest stable as of 2026)
- pizzip 3.2.0 is the recommended ZIP library for docxtemplater
- Node.js 12+ compatibility (project likely uses LTS version)

**Deprecated/outdated:**
- JSZip for new template processors (pizzip preferred by docxtemplater)
- Direct XML manipulation for simple data changes (use data transformation layer)

## Open Questions

Things that couldn't be fully resolved:

1. **Should other templates apply the same N/A suppression?**
   - What we know: Requirements say "Only the first Anschreiben is affected" (REQUIREMENTS.md:23)
   - What's unclear: Whether Nullplan, Ratenplan templates have similar issues
   - Recommendation: Implement ONLY for first Anschreiben as specified. Monitor other templates for similar reports.

2. **Where do "N/A" strings originate?**
   - What we know: AI extraction service (FastAPI/Gemini) returns "N/A" when reference_number not found in creditor documents
   - What's unclear: Whether AI service should return null instead of "N/A" string
   - Recommendation: Handle in Node.js backend (this phase). Consider AI service change as future improvement if pattern recurs.

3. **Should the template variable be renamed?**
   - What we know: Template uses `"Aktenzeichen D C"` as variable name (with quotes and space)
   - What's unclear: Whether this naming convention is intentional or legacy
   - Recommendation: Keep existing variable name. Template redesign is out of scope (REQUIREMENTS.md:24).

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `server/services/firstRoundDocumentGenerator.js` - Current implementation
- [docxtemplater FAQ](https://docxtemplater.com/docs/faq/) - nullGetter configuration
- [docxtemplater Configuration](https://docxtemplater.com/docs/configuration/) - Template options
- [docxtemplater npm](https://www.npmjs.com/package/docxtemplater) - Version compatibility

### Secondary (MEDIUM confidence)
- Codebase patterns: `server/utils/creditorDeduplication.js`, `server/controllers/zendeskWebhookController.js` - N/A filtering patterns
- [docxtemplater GitHub Issue #343](https://github.com/open-xml-templating/docxtemplater/issues/343) - Empty value handling discussion
- [Node.js Word template placeholder replacement](https://www.tutorialswebsite.com/replace-word-document-placeholder-node-js/) - General patterns

### Tertiary (LOW confidence)
- [Paragraph Placeholder Module](https://docxtemplater.com/modules/paragraph-placeholder/) - Conditional paragraph display (ENTERPRISE only, not needed)
- [Microsoft Word template conditionals](https://learn.microsoft.com/en-us/power-platform/admin/using-word-templates-dynamics-365) - Alternative approach (not applicable)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Libraries are currently in use, versions confirmed from package.json
- Architecture: HIGH - Codebase analysis reveals clear patterns, existing isUsableValue helper
- Pitfalls: HIGH - Identified from codebase patterns (N/A strings in deduplication logic) and docxtemplater documentation
- Solution approach: HIGH - Simple data transformation, no template engine changes needed

**Research date:** 2026-02-02
**Valid until:** 90 days (stable libraries, mature codebase pattern)

**Key findings:**
1. Fix is data transformation, not template configuration
2. isUsableValue helper already exists and filters "N/A"
3. Pattern exists elsewhere in codebase (deduplication, Zendesk display)
4. Only affects "Aktenzeichen D C" field in first Anschreiben template
5. No template file changes needed
