# Nullplan Template Variable Analysis Report

## Summary

This analysis was performed on the Nullplan Word template (`Nullplan_Text_Template.docx`) to identify the exact variable names used in the template. The goal was to solve the issue where variables in the code didn't match what's actually in the template, causing variables to not be found during document generation.

## Key Findings

### ✅ Variables Found in Template (14 total)

The following variables were confirmed to exist in the template:

**CLIENT INFORMATION (2 variables):**
- `"Mandant Name"`
- `"Name Mandant"`

**CREDITOR INFORMATION (2 variables):**
- `"Adresse des Creditors"`
- `"Quote des Gläubigers"`

**FINANCIAL INFORMATION (4 variables):**
- `"Forderungssumme"`
- `"Schuldsumme Insgesamt"`
- `"Aktenzeichen der Forderung"`
- `"Forderungsnummer in der Forderungsliste"`

**DATE INFORMATION (3 variables):**
- `"Geburtstag"`
- `"Heutiges Datum"`
- `"Datum in 14 Tagen"`

**OTHER INFORMATION (3 variables):**
- `"Einkommen"`
- `"Familienstand"`
- `"Gläuibgeranzahl"`

## Code Implementation

### Recommended Variable Mapping

Use this exact mapping in your Nullplan processing code:

```javascript
const templateVariables = {
  'Einkommen': data.einkommen || '',
  'Geburtstag': data.geburtstag || '',
  'Mandant Name': data.mandantName || '',
  'Name Mandant': data.nameMandant || '',
  'Familienstand': data.familienstand || '',
  'Heutiges Datum': data.heutigesDatum || '',
  'Forderungssumme': data.forderungssumme || '',
  'Gläuibgeranzahl': data.gluibgeranzahl || '',
  'Datum in 14 Tagen': data.datumIn14Tagen || '',
  'Quote des Gläubigers': data.quoteDesGlubigers || '',
  'Adresse des Creditors': data.adresseDesCreditors || '',
  'Schuldsumme Insgesamt': data.schuldsummeInsgesamt || '',
  'Aktenzeichen der Forderung': data.aktenzeichenDerForderung || '',
  'Forderungsnummer in der Forderungsliste': data.forderungsnummerInDerForderungsliste || '',
};
```

### Sample Data Structure

Your data object should include these properties:

```javascript
const sampleData = {
  einkommen: "1500.00",
  geburtstag: "15.03.1985",
  mandantName: "Max Mustermann",
  nameMandant: "Max Mustermann", // Same as above
  familienstand: "ledig",
  heutigesDatum: "10.10.2025",
  datumIn14Tagen: "24.10.2025",
  forderungssumme: "5000.00",
  gluibgeranzahl: "3",
  quoteDesGlubigers: "25.5",
  adresseDesCreditors: "Musterstraße 123, 12345 Musterstadt",
  schuldsummeInsgesamt: "15000.00",
  aktenzeichenDerForderung: "AZ-2025-001",
  forderungsnummerInDerForderungsliste: "1"
};
```

## Tools Created

The following analysis tools were created during this investigation:

### Main Tools (Keep these)

1. **`analyze-word-template.js`** - Universal Word template analyzer
   - Can analyze any Word template
   - Usage: `node analyze-word-template.js [template-path]`
   - Generates clean variable mappings

2. **`Nullplan_Text_Template-variables.json`** - Final analysis report
   - Complete analysis of the Nullplan template
   - Variable categorization and mappings

### Development Tools (Can be removed)

- `analyze-nullplan-template.js` - Initial analysis script
- `analyze-nullplan-template-v2.js` - Improved analysis script  
- `extract-nullplan-variables.js` - Variable extraction script
- `nullplan-variable-summary.js` - Summary generation script
- Various intermediate JSON and text files

## Next Steps

1. **Update your Nullplan processing code** with the exact variable names identified above
2. **Test document generation** with sample data to verify the mapping works
3. **Consider using the universal analyzer** (`analyze-word-template.js`) for other templates
4. **Clean up development files** if desired, keeping only the main analyzer and results

## Files Generated

### Keep These Files:
- `analyze-word-template.js` - Universal template analyzer
- `Nullplan_Text_Template-variables.json` - Analysis results
- `NULLPLAN_TEMPLATE_ANALYSIS_REPORT.md` - This report

### Optional Cleanup:
- Remove intermediate analysis files (analyze-nullplan-*, extract-*, nullplan-template-*)
- Keep raw XML and cleaned text files for reference if needed

## Technical Notes

- Variables in the template are enclosed in double quotes: `"Variable Name"`
- The template uses German text, so variable names are in German
- Some variables appear multiple times (e.g., "Name Mandant" and "Mandant Name")
- Template uses standard Word document structure with XML formatting
- Analysis extracts variables from document.xml within the .docx file

## Resolution

This analysis solves the original problem where template variables weren't being found. The issue was that the code was using different variable names than what actually exists in the template. With the exact variable names now identified, document generation should work correctly.