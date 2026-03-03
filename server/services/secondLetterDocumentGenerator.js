const fs = require('fs').promises;
const path = require('path');
const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');
const { formatAddress } = require('../utils/addressFormatter');

// ---------------------------------------------------------------------------
// Module-level helper functions
// ---------------------------------------------------------------------------

/**
 * Returns true if val is a non-empty, non-"N/A" string.
 * Mirrors isUsableValue from firstRoundDocumentGenerator.js
 */
const isUsableValue = (val) =>
  typeof val === 'string' && val.trim() !== '' && val.trim().toUpperCase() !== 'N/A';

/**
 * Format a numeric amount as German currency: 1234.56 → "1.234,56 €"
 * Uses toLocaleString (NOT toFixed) per CONTEXT.md locked decision.
 */
function formatEuro(amount) {
  if (amount == null || !Number.isFinite(amount)) return '0,00 €';
  return amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

/**
 * Format a date in German short format: TT.MM.JJJJ
 * e.g. new Date('2026-03-02') → "02.03.2026"
 */
function formatGermanDate(date) {
  return new Date(date).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Format a percentage value per CONTEXT.md:
 * Whole number → "45 %", decimal → "45,5 %"
 */
function formatPercent(value) {
  if (value == null) return '0 %';
  const rounded = Math.round(value * 10) / 10;
  const formatted = rounded % 1 === 0
    ? rounded.toString()
    : rounded.toLocaleString('de-DE');
  return formatted + ' %';
}

/**
 * Sanitize a string for use in a filename.
 * Per CONTEXT.md locked decision:
 * - Replaces German Umlaute (ü→ue, Ü→Ue, ä→ae, Ä→Ae, ö→oe, Ö→Oe, ß→ss)
 * - Replaces remaining non-alphanumeric chars (except hyphens) with '-'
 * - Collapses multiple hyphens, trims leading/trailing hyphens
 * - Truncates to 50 characters
 */
function sanitizeForFilename(name) {
  if (!name) return 'Unbekannt';
  return name
    .replace(/ü/g, 'ue')
    .replace(/Ü/g, 'Ue')
    .replace(/ä/g, 'ae')
    .replace(/Ä/g, 'Ae')
    .replace(/ö/g, 'oe')
    .replace(/Ö/g, 'Oe')
    .replace(/ß/g, 'ss')
    .replace(/[^a-zA-Z0-9\-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

// ---------------------------------------------------------------------------
// SecondLetterDocumentGenerator class
// ---------------------------------------------------------------------------

/**
 * Second Round Document Generator
 *
 * Generates one DOCX letter per creditor using the correct template
 * (Ratenplan or Nullplan) based on plan_type from the financial snapshot.
 *
 * Mirrors firstRoundDocumentGenerator.js in class structure and libraries
 * (docxtemplater + pizzip), with two key differences:
 * - Two-template branching based on snapshot.plan_type
 * - Snapshot-only data source (never reads live financial_data)
 *
 * Called by Phase 33 email dispatch orchestrator to produce DOCX attachments
 * before sending creditor emails.
 */
class SecondLetterDocumentGenerator {
  constructor() {
    this.templatePaths = {
      RATENPLAN: path.join(__dirname, '../templates/2.Schreiben_Ratenplan.docx'),
      NULLPLAN: path.join(__dirname, '../templates/2.Schreiben_Nullplan.docx'),
    };
    // No fixed outputDir — per-client subdirectories are created dynamically
  }

  /**
   * Normalize German typographic quotes inside <w:t> XML text elements ONLY.
   * This is required because Word (especially on macOS) autocorrects {VariableName}
   * to „VariableName" using Unicode quote characters that docxtemplater does not
   * recognise as delimiters.
   *
   * Exact logic copied from firstRoundDocumentGenerator.js lines 112-126.
   *
   * @param {PizZip} zip
   */
  _normalizeGermanQuotes(zip) {
    const documentXmlFile = zip.files['word/document.xml'];
    if (!documentXmlFile) return;

    let documentXml = documentXmlFile.asText();
    documentXml = documentXml.replace(/<w:t([^>]*)>([^<]*)<\/w:t>/g, (match, attrs, text) => {
      const normalizedText = text
        .replace(/\u201E/g, '{')           // „ German opening quote → {
        .replace(/\u201C/g, '}')           // " German closing quote → }
        .replace(/\u201D/g, '}')           // " Right double quotation mark → }
        .replace(/"([^"{}]+)"/g, '{$1}');  // ASCII "..." → {...}
      return `<w:t${attrs}>${normalizedText}</w:t>`;
    });
    zip.file('word/document.xml', documentXml);
  }

  /**
   * Ensure the output directory exists, creating it (and all parents) if needed.
   * Simpler than first round's access-then-create pattern; recursive: true is
   * a no-op if the directory already exists.
   *
   * @param {string} outputDir
   */
  async ensureOutputDirectory(outputDir) {
    await fs.mkdir(outputDir, { recursive: true });
  }

  /**
   * Build the output filename for a generated DOCX.
   * Pattern per CONTEXT.md: {CreditorName}_{Aktenzeichen}_{PlanType}.docx
   * e.g. "Mueller-Co-KG_AZ-12345_Ratenplan.docx"
   *
   * @param {object} creditor
   * @param {object} client
   * @param {string} planType - 'RATENPLAN' or 'NULLPLAN'
   * @returns {string}
   */
  _buildFilename(creditor, client, planType) {
    const creditorPart = sanitizeForFilename(creditor.sender_name || creditor.creditor_name);
    const aktenzeichenPart = sanitizeForFilename(client.aktenzeichen || 'AZ-unbekannt');
    const planPart = planType === 'RATENPLAN' ? 'Ratenplan' : 'Nullplan';
    return `${creditorPart}_${aktenzeichenPart}_${planPart}.docx`;
  }

  /**
   * Format the client's address for insertion into the template.
   * Priority 1: structured fields (street + houseNumber + zipCode + city) → formatAddress
   * Priority 2: client.address string → formatAddress
   * Fallback: 'Adresse nicht verfügbar'
   *
   * Mirrors formatClientAddress from firstRoundDocumentGenerator.js.
   *
   * @param {object} client
   * @returns {string}
   */
  formatClientAddress(client) {
    // Priority 1: structured fields
    if (client.street && client.zipCode && client.city) {
      const streetLine = client.houseNumber
        ? `${client.street} ${client.houseNumber}`
        : client.street;
      const address = `${streetLine} ${client.zipCode} ${client.city}`;
      return formatAddress(address);
    }

    // Priority 2: address string
    if (client.address) {
      return formatAddress(client.address);
    }

    return 'Adresse nicht verfügbar';
  }

  /**
   * Prepare the flat template variable object for a single creditor.
   * All financial values are read exclusively from snapshot and snapshot.creditor_calculations.
   * Never reads from live financial_data or extended_financial_data.
   *
   * @param {object} client
   * @param {object} snapshot - second_letter_financial_snapshot
   * @param {object} creditor - entry from client.final_creditor_list
   * @returns {object} Flat map of template variable name → value
   */
  prepareTemplateData(client, snapshot, creditor) {
    const today = new Date();
    const deadlineDate = new Date();
    deadlineDate.setDate(today.getDate() + 14);

    // Find per-creditor calculation entry from snapshot.
    // Graceful degradation per RESEARCH.md Pitfall 3: fall back to {} if not found.
    const creditorId = creditor._id?.toString() || creditor.id;
    const calcEntry = (snapshot.creditor_calculations || [])
      .find(c => c.creditor_id === creditorId) || {};

    if (!calcEntry.creditor_id) {
      console.warn(`⚠️  [SecondLetterDocumentGenerator] No calculation entry found for creditor ${creditorId} — using zeros`);
    }

    // Euro values without " €" suffix — templates already contain the " €" after placeholders
    const euroVal = (amount) => {
      if (amount == null || !Number.isFinite(amount)) return '0,00';
      return amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Gender detection from client.geschlecht field
    const geschlecht = (client.geschlecht || '').toLowerCase();
    const isFemale = geschlecht === 'weiblich' || geschlecht === 'w' || geschlecht === 'female' || geschlecht === 'f';
    const anrede = isFemale ? 'Frau' : 'Herr';
    const pronomen = isFemale ? 'Sie' : 'Er';

    // Dependents
    const dependents = snapshot.anzahl_unterhaltsberechtigte ?? snapshot.number_of_dependents ?? 0;

    // Total creditors and debt (for Nullplan template)
    // Use effective claim: creditor_response_amount (confirmed by creditor) > claim_amount
    const getEffectiveClaim = (c) =>
      (c.creditor_response_amount != null && c.creditor_response_amount > 0)
        ? c.creditor_response_amount : (c.claim_amount || 0);
    const allCreditors = client.final_creditor_list || [];
    const totalDebt = allCreditors.reduce((sum, c) => sum + getEffectiveClaim(c), 0);

    // Kindertext for Nullplan: "ein Kind", "zwei Kinder", etc.
    const kinderWords = ['', 'ein Kind', 'zwei Kinder', 'drei Kinder', 'vier Kinder', 'fünf Kinder'];
    const kindertext = dependents > 0
      ? (kinderWords[dependents] || `${dependents} Kinder`)
      : '';

    // Unterhaltsverpflichtungen = dependents + spouse (if married)
    const familienstand = snapshot.familienstand || snapshot.marital_status || '';
    const isMarried = /verheiratet/i.test(familienstand);
    const unterhalt = dependents + (isMarried ? 1 : 0);

    return {
      // --- Creditor block ---
      'Adresse D C': formatAddress(creditor.creditor_address || creditor.address || creditor.sender_address || ''),
      'Creditor': creditor.glaeubiger_name || creditor.sender_name || creditor.creditor_name || 'Unbekannter Gläubiger',

      'Aktenzeichen D C': [
        creditor.reference_number,
        creditor.creditor_reference,
        creditor.reference,
        creditor.aktenzeichen,
      ].find(r => isUsableValue(r)) || 'AZ nicht vorhanden',

      'Forderung': euroVal(calcEntry.claim_amount || getEffectiveClaim(creditor)),
      'Quote': formatPercent(calcEntry.quota_percentage),
      'Auszahlung': euroVal(calcEntry.tilgungsangebot || 0),

      // --- Debtor block ---
      'Name': client.name || `${client.firstName} ${client.lastName}`,
      'Nachname': client.lastName || '',
      'Anrede': anrede,
      'Pronomen': pronomen,
      'Geburtstag': client.birthdate || client.dateOfBirth || 'Nicht verfügbar',
      'Adresse': this.formatClientAddress(client),
      'Familienstand': familienstand,
      'Unterhaltsberechtigte': String(dependents),
      'Einkommen': euroVal(snapshot.monthly_net_income),

      // --- Nullplan-specific totals ---
      'Gesamtschulden': euroVal(totalDebt),
      'Anzahl Glaeubieger': String(allCreditors.length),
      'Kindertext': kindertext,
      'Unterhaltsverpflichtungen': String(unterhalt),

      // --- Plan block ---
      'Plantyp': snapshot.plan_type === 'RATENPLAN' ? 'Ratenplan' : 'Nullplan',
      'Monatliche Rate': euroVal(snapshot.garnishable_amount || 0),
      'Startdatum': formatGermanDate(snapshot.calculated_at || today),
      'Frist': formatGermanDate(deadlineDate),

      // --- Law firm block ---
      'Aktenzeichen des Mandanten': client.aktenzeichen || client.reference || '',
      'heutiges Datum': formatGermanDate(today),
      'heutiges D': formatGermanDate(today),
    };
  }

  /**
   * Generate a single DOCX document for one creditor.
   *
   * @param {object} client
   * @param {object} snapshot - second_letter_financial_snapshot
   * @param {object} creditor - entry from client.final_creditor_list
   * @param {string} outputDir - absolute path to client-specific output directory
   * @returns {object} Result descriptor { success, creditor_id, creditor_name, filename, path }
   */
  async generateForSingleCreditor(client, snapshot, creditor, outputDir) {
    const planType = snapshot.plan_type || 'NULLPLAN';
    const templatePath = this.templatePaths[planType] || this.templatePaths.NULLPLAN;

    // Read the correct template based on plan_type
    const templateContent = await fs.readFile(templatePath);
    const zip = new PizZip(templateContent);

    // Normalize German typographic quotes before docxtemplater parses the XML
    this._normalizeGermanQuotes(zip);

    // Create Docxtemplater with exact same config as first round (proven in production)
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: {
        start: '{',
        end: '}',
      },
    });

    // Prepare and render template data
    const templateData = this.prepareTemplateData(client, snapshot, creditor);
    doc.render(templateData);

    // Generate output buffer
    const outputBuffer = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });

    // Build filename and write file — filename is ONLY stored after successful write (Pitfall 5)
    const filename = this._buildFilename(creditor, client, planType);
    const outputPath = path.join(outputDir, filename);

    await fs.writeFile(outputPath, outputBuffer);

    return {
      success: true,
      creditor_id: creditor.id,
      creditor_name: creditor.sender_name || creditor.creditor_name,
      filename,
      path: outputPath,
    };
  }

  /**
   * Generate DOCX files for all creditors in client.final_creditor_list.
   *
   * Creates the per-client output directory before the loop (Pitfall 4).
   * Continues on per-creditor failure — errors are collected (Pitfall hard-stop avoided).
   * Persists filenames to MongoDB after all generations complete (only for successes).
   *
   * @param {object} client - Mongoose Client document
   * @param {object} snapshot - second_letter_financial_snapshot
   * @returns {object} { success, total_generated, total_failed, documents, errors }
   */
  async generateForAllCreditors(client, snapshot) {
    const clientId = client._id.toString();
    const outputDir = path.join(__dirname, '../generated_documents/second_round', clientId);

    // CRITICAL: create directory BEFORE the loop — per-client dirs don't pre-exist (Pitfall 4)
    await this.ensureOutputDirectory(outputDir);

    const creditors = client.final_creditor_list || [];
    console.log(`📄 Generating second round documents for ${creditors.length} creditors...`);

    const results = [];
    const errors = [];

    for (let i = 0; i < creditors.length; i++) {
      const creditor = creditors[i];
      console.log(`   Processing ${i + 1}/${creditors.length}: ${creditor.sender_name || creditor.creditor_name}`);

      try {
        const result = await this.generateForSingleCreditor(client, snapshot, creditor, outputDir);
        results.push(result);
      } catch (error) {
        console.error(`❌ Failed to generate document for ${creditor.sender_name || creditor.creditor_name}: ${error.message}`);
        errors.push({
          creditor_id: creditor.id,
          creditor_name: creditor.sender_name || creditor.creditor_name,
          error: error.message,
        });
      }
    }

    console.log(`✅ Generated ${results.length}/${creditors.length} documents successfully`);
    if (errors.length > 0) {
      console.log(`❌ ${errors.length} documents failed to generate`);
    }

    // Persist filenames to MongoDB for successful generations ONLY.
    // Done post-loop to ensure file write has fully completed before DB update (Pitfall 5).
    const Client = require('../models/Client');
    for (const result of results) {
      await Client.findOneAndUpdate(
        { _id: client._id, 'final_creditor_list.id': result.creditor_id },
        { $set: { 'final_creditor_list.$.second_letter_document_filename': result.filename } }
      );
    }

    return {
      success: true,
      total_generated: results.length,
      total_failed: errors.length,
      documents: results,
      errors,
    };
  }

  /**
   * Admin retry method: generate (or re-generate) DOCX for a single creditor by ID.
   * Fetches client and snapshot from MongoDB, then calls generateForSingleCreditor.
   * Persists updated filename to creditor document after successful generation.
   *
   * Used by Phase 33/34 admin endpoints for individual creditor re-generation.
   *
   * @param {string} clientId
   * @param {string} creditorId
   * @returns {object} Result descriptor
   */
  async generateForSingleCreditorById(clientId, creditorId) {
    // Lazy require to avoid circular dependency issues
    const Client = require('../models/Client');

    const client = await Client.findById(clientId);
    if (!client) {
      throw new Error(`Client ${clientId} not found`);
    }

    const snapshot = client.second_letter_financial_snapshot;
    if (!snapshot || snapshot.calculation_status !== 'completed') {
      throw new Error('Snapshot not available or calculation not completed');
    }

    const creditor = (client.final_creditor_list || [])
      .find(c => c.id === creditorId);
    if (!creditor) {
      throw new Error(`Creditor ${creditorId} not found in client.final_creditor_list`);
    }

    const outputDir = path.join(__dirname, '../generated_documents/second_round', clientId);
    await this.ensureOutputDirectory(outputDir);

    const result = await this.generateForSingleCreditor(client, snapshot, creditor, outputDir);

    // Persist filename after successful file write
    await Client.findOneAndUpdate(
      { _id: client._id, 'final_creditor_list.id': creditor.id },
      { $set: { 'final_creditor_list.$.second_letter_document_filename': result.filename } }
    );

    return result;
  }
}

module.exports = SecondLetterDocumentGenerator;
