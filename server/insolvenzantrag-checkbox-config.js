// Updated Insolvenzantrag Checkbox Configuration
// Generated from new template analysis on 29.9.2025
// Based on: /Users/luka/Downloads/New Docus.pdf

const INSOLVENZANTRAG_CONFIG = {
  // Default checkboxes for standard Insolvenzantrag (Verbraucherinsolvenz)
  // These are structural/procedural checkboxes, NOT individual client data.
  // Client-specific checkboxes (Familienstand, Beschäftigung) are set in QuickFieldMapper.
  DEFAULT_CHECKBOXES: [
    "Kontrollkästchen 1",     // Antrag auf Eröffnung des Insolvenzverfahrens
    "Kontrollkästchen 2",     // Verbraucherinsolvenzverfahren
    "Kontrollkästchen 15",    // Außergerichtlicher Einigungsversuch durchgeführt
    "Kontrollkästchen 16",    // Ja — Plan allen Gläubigern übersandt
    "Kontrollkästchen 17",    // Schuldenbereinigungsplan beigefügt
    "Kontrollkästchen 21",    // Antrag auf Restschuldbefreiung
    "Kontrollkästchen 25",    // Abtretungserklärung (§ 287 InsO)
    "Kontrollkästchen 26",    // Versicherung an Eides statt (§ 287 Abs. 1 InsO)
    "Kontrollkästchen 27",    // Vollständigkeit und Richtigkeit der Angaben
    "Kontrollkästchen 34",    // (immer aktiviert)
    "Kontrollkästchen 36",    // Anlage: Schuldenbereinigungsplan
    "Kontrollkästchen 333",   // Gläubigerliste beigefügt
    "Kontrollkästchen 362",   // Plan mit flexiblen Raten (Anlage 7A)
  ],

  // Additional checkbox for clients with pfändbares Einkommen
  PFAENDBARES_EINKOMMEN_CHECKBOXES: [
    "Kontrollkästchen 32a",   // Pfändbares Einkommen vorhanden
  ],

  // Sample text field data from the template
  SAMPLE_TEXT_FIELDS: {
    "Textfeld 1": "Vorname und Name",
    "Textfeld 2": "Straße und Hausnummer",
    "Textfeld 3": "Postleitzahl und Ort",
    "Textfeld 4": "Telefon tagsüber",
    "Textfeld 5": "Verfahrensbevollmächtigte(r)",
    "Textfeld 16": "An das Amtsgericht– Insolvenzgericht – in",
    "Textfeld 22": "(Ort, Datum)",
    "Textfeld 25": "Name",
    "Textfeld 31": "Geburtsort",
    "Textfeld 37": "Mobil Telefon",
    "Textfeld 39": "E-mail",
    "Textfeld 27": "Vorname(n)",
    "Textfeld 26": "Akademischer Grad",
    "Textfeld 30": "Geburtsdatum",
    "Textfeld 32": "Wohnanschrift Straße",
    "Textfeld 33": "Hausnummer",
    "Textfeld 34": "Postleitzahl",
    "Textfeld 35": "Ort",
    "Textfeld 48": "Erlernter Beruf",
    "Textfeld 49": "Zurzeit oder zuletzt tätig als",
    "Textfeld 24": "Vorname Name",
    "Textfeld 69": "Vorname Name",
    "Textfeld 70": "Rechtsanwalt Thomas Scuric",
    "Textfeld 71": "Bongardstraße",
    "Textfeld 72": "33",
    "Textfeld 73": "44787",
    "Textfeld 74": "Bochum",
    "Textfeld 80": "außergerichtlicher Plan (Datum)",
    "Textfeld 82": "Datum (Scheiterung)",
    "Textfeld 83": "(Ort, Datum)",
    "Textfeld 84": "Vorname Name",
    "Textfeld 85": "Anzahl an Gläubigern (zuge",
    "Textfeld 86": "Anzahl an Gläubigern",
    "Textfeld 87": "Summe (Zugestimmten)",
    "Textfeld 88": "Summe",
    "Textfeld 89": "Anzahl ohne Antwort",
    "Textfeld 90": "Anzahl an Gläubigern",
    "Textfeld 97": "Vorname Name",
    "Textfeld 153": "Vorname Name",
    "Textfeld 196": "Vorname Name",
    "Textfeld 215": "Vorname Name",
    "Textfeld 234": "Vorname Name",
    "Textfeld 256": "Vorname Name",
    "Textfeld 272": "Vorname Name",
    "Textfeld 278": "Berufliche Tätigkeit",
    "Textfeld 347": "Vorname Name",
    "Textfeld 364": "Vorname Name",
    "Textfeld 394": "Vorname Name",
    "Textfeld 421": "Vorname Name",
    "Textfeld 634": "Vorname Name",
    "Textfeld 635": "Vormame und Name",
    "Textfeld 636": "Straße und Hausnummer",
    "Textfeld 637": "Postleitzahl und Ort",
    "Textfeld 642": "Datum des Schuldenbereinigungsplans:",
    "Textfeld 748": "Vorname Name",
    "Textfeld 1002": "Vorname Name",
    "Textfeld 1230": "Vorname Name",
    "Textfeld 1231": "Datum des Schuldenbereinigungsplans:",
    "Textfeld 1233": "Vorname Name",
    "Textfeld 1234": "Datum des Schuldenbereinigungsplans:"
},

  // Apply structural checkboxes to a form object
  applyDefaultCheckboxes: function(form, hasPfaendbaresEinkommen = false) {
    let appliedCount = 0;
    let errorCount = 0;

    // Always apply structural defaults
    const checkboxes = [...this.DEFAULT_CHECKBOXES];

    // Add pfändbares Einkommen checkbox if applicable
    if (hasPfaendbaresEinkommen) {
      checkboxes.push(...this.PFAENDBARES_EINKOMMEN_CHECKBOXES);
    }

    console.log(`Applying ${checkboxes.length} structural checkboxes (pfaendbar: ${hasPfaendbaresEinkommen})...`);

    checkboxes.forEach(fieldName => {
      try {
        const checkbox = form.getCheckBox(fieldName);
        checkbox.check();
        appliedCount++;
      } catch (error) {
        console.error(`Failed to check ${fieldName}:`, error.message);
        errorCount++;
      }
    });

    console.log(`Checkbox application complete: ${appliedCount} applied, ${errorCount} errors`);
    return { applied: appliedCount, errors: errorCount };
  },

  // Apply structural checkboxes to an already-filled PDF
  applyDefaultCheckboxesToPdf: async function(pdfBytes, hasPfaendbaresEinkommen = false) {
    const { PDFDocument } = require('pdf-lib');

    try {
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const form = pdfDoc.getForm();

      this.applyDefaultCheckboxes(form, hasPfaendbaresEinkommen);

      const modifiedPdfBytes = await pdfDoc.save();
      return modifiedPdfBytes;

    } catch (error) {
      console.error('Error applying checkboxes to PDF:', error);
      throw error;
    }
  }
};

module.exports = INSOLVENZANTRAG_CONFIG;
