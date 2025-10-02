// Updated Insolvenzantrag Checkbox Configuration
// Generated from new template analysis on 29.9.2025
// Based on: /Users/luka/Downloads/New Docus.pdf

const INSOLVENZANTRAG_CONFIG = {
  // These checkboxes are pre-checked in the new template - UPDATED FROM ULTRA DEEP ANALYSIS
  // DEFAULT_CHECKBOXES_FOR_PFAENDBARES_EINKOMMEN: [
  //   "Kontrollkästchen 1",
  //   "Kontrollkästchen 2",
  //   "Kontrollkästchen 15",    // ✨ NEWLY FOUND
  //   "Kontrollkästchen 17",
  //   "Kontrollkästchen 21",
  //   "Kontrollkästchen 25",
  //   "Kontrollkästchen 26",
  //   "Kontrollkästchen 27",
  //   "Kontrollkästchen 32a",
  //   "Kontrollkästchen 36",
  //   "Kontrollkästchen 62",    // ✨ EMPLOYEE CHECKBOX - "Angestellter"
  //   "Kontrollkästchen 333"
  // ],

  DEFAULT_CHECKBOXES_FOR_PFAENDBARES_EINKOMMEN: Array.from(
    { length: 387 },
    (_, i) => `Kontrollkästchen ${i + 1}`
  ),

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

  // Apply default checkboxes for clients with attachable income
  applyDefaultCheckboxes: function(form) {
    let appliedCount = 0;
    let errorCount = 0;

    console.log('🔲 Applying NEW template checkboxes for client with pfändbares Einkommen...');
    
    this.DEFAULT_CHECKBOXES_FOR_PFAENDBARES_EINKOMMEN.forEach(fieldName => {
      try {
        const checkbox = form.getCheckBox(fieldName);
        checkbox.check();
        console.log(`✅ Checked: ${fieldName}`);
        appliedCount++;
      } catch (error) {
        console.error(`❌ Failed to check ${fieldName}:`, error.message);
        errorCount++;
      }
    });

    console.log(`📊 NEW template checkbox application complete: ${appliedCount} applied, ${errorCount} errors`);
    return { applied: appliedCount, errors: errorCount };
  },

  // Apply checkboxes to an already-filled PDF
  applyDefaultCheckboxesToPdf: async function(pdfBytes) {
    const { PDFDocument } = require('pdf-lib');
    
    try {
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const form = pdfDoc.getForm();
      
      let appliedCount = 0;
      let errorCount = 0;
      
      console.log('🔧 Applying NEW template checkboxes to PDF...');
      
      this.DEFAULT_CHECKBOXES_FOR_PFAENDBARES_EINKOMMEN.forEach(fieldName => {
        try {
          const field = form.getCheckBox(fieldName);
          field.check();
          appliedCount++;
          console.log(`  ✅ Checked: ${fieldName}`);
        } catch (error) {
          console.log(`  ⚠️  Checkbox not found: ${fieldName}`);
          errorCount++;
        }
      });
      
      console.log(`📊 Applied ${appliedCount} NEW template checkboxes to PDF, ${errorCount} errors`);
      
      const modifiedPdfBytes = await pdfDoc.save();
      return modifiedPdfBytes;
      
    } catch (error) {
      console.error('❌ Error applying NEW template checkboxes to PDF:', error);
      throw error;
    }
  }
};

module.exports = INSOLVENZANTRAG_CONFIG;
