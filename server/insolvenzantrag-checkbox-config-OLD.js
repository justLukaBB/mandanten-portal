// Insolvenzantrag Checkbox Configuration
// Auto-generated from template analysis on 2025-09-29
// Use this config to consistently apply checkboxes for clients with pfändbares Einkommen

const INSOLVENZANTRAG_CONFIG = {
  // These checkboxes are pre-checked in the template for clients with attachable income
  DEFAULT_CHECKBOXES_FOR_PFAENDBARES_EINKOMMEN: [
    "Kontrollkästchen 1",   // Usually: Income type selection
    "Kontrollkästchen 11",  // Usually: Employment status
    "Kontrollkästchen 2",   // Usually: Asset declaration
    "Kontrollkästchen 20",  // Usually: Monthly income declaration
    "Kontrollkästchen 23",  // Usually: Expense declaration
    "Kontrollkästchen 27",  // Usually: Additional income sources
    "Kontrollkästchen 3",   // Usually: Property ownership
    "Kontrollkästchen 30",  // Usually: Debt acknowledgment
    "Kontrollkästchen 36",  // Usually: Settlement attempt confirmation
    "Kontrollkästchen 4"    // Usually: Bank account declaration
  ],

  // Key text fields that contain sample data (useful for mapping)
  SAMPLE_TEXT_FIELDS: {
    "Textfeld 1": "Schmidt, Thomas",           // Name field
    "Textfeld 2": "Hauptstraße 78",           // Address field
    "Textfeld 3": "50667 Köln",               // Postal code and city
    "Textfeld 22": "Thomas",                  // First name
    "Textfeld 25": "Hauptstraße",             // Street name
    "Textfeld 26": "Köln",                    // City
    "Textfeld 27": "29.9.2025",               // Date field
    "Textfeld 28": "78",                      // House number
    "Textfeld 29": "13.10.2025",              // Another date field
    "Textfeld 30": "29.9.2025",               // Date field (duplicate)
    "Textfeld 31": "50667",                   // Postal code
    "Textfeld 37": "Köln",                    // City (duplicate)
    "Textfeld 40": "thomas.schmidt@example.com" // Email field
  },

  // Apply default checkboxes for clients with attachable income
  applyDefaultCheckboxes: function(form) {
    let appliedCount = 0;
    let errorCount = 0;

    console.log('🔲 Applying default checkboxes for client with pfändbares Einkommen...');
    
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

    console.log(`📊 Checkbox application complete: ${appliedCount} applied, ${errorCount} errors`);
    return { applied: appliedCount, errors: errorCount };
  },

  // Apply checkboxes to an already-filled PDF
  applyDefaultCheckboxesToPdf: async function(pdfBytes) {
    const { PDFDocument } = require('pdf-lib');
    
    try {
      // Load the PDF
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const form = pdfDoc.getForm();
      
      // Apply each checkbox
      let appliedCount = 0;
      let errorCount = 0;
      
      console.log('🔧 Applying default checkboxes to PDF...');
      
      this.DEFAULT_CHECKBOXES_FOR_PFAENDBARES_EINKOMMEN.forEach(fieldName => {
        try {
          const field = form.getCheckBox(fieldName);
          field.check();
          appliedCount++;
          console.log(`  ✅ Checked: ${fieldName}`);
        } catch (error) {
          console.log(`  ⚠️  Checkbox not found or already checked: ${fieldName}`);
          errorCount++;
        }
      });
      
      console.log(`📊 Applied ${appliedCount} checkboxes to PDF, ${errorCount} errors`);
      
      // Return the modified PDF bytes
      const modifiedPdfBytes = await pdfDoc.save();
      return modifiedPdfBytes;
      
    } catch (error) {
      console.error('❌ Error applying checkboxes to PDF:', error);
      throw error;
    }
  },

  // Get field mapping suggestions based on the template analysis
  getFieldMappingSuggestions: function() {
    return {
      // Name and personal info
      "Textfeld 1": "clientData.lastName + ', ' + clientData.firstName", // Full name format
      "Textfeld 22": "clientData.firstName",
      "Textfeld 40": "clientData.email",

      // Address fields
      "Textfeld 2": "clientData.streetAddress", // Full street address
      "Textfeld 25": "clientData.street",       // Street name only
      "Textfeld 28": "clientData.houseNumber",  // House number only
      "Textfeld 3": "clientData.postalCode + '\\n' + clientData.city", // Full postal address
      "Textfeld 31": "clientData.postalCode",   // Postal code only
      "Textfeld 26": "clientData.city",         // City name
      "Textfeld 37": "clientData.city",         // City name (duplicate)

      // Date fields - these likely need current date or specific dates
      "Textfeld 27": "new Date().toLocaleDateString('de-DE')", // Current date
      "Textfeld 29": "// Likely a future date - check template context",
      "Textfeld 30": "new Date().toLocaleDateString('de-DE')"  // Current date
    };
  }
};

module.exports = INSOLVENZANTRAG_CONFIG;