const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function analyzeNewTemplate() {
    try {
        console.log('🔍 Analyzing new PDF template...');
        
        const pdfPath = '/Users/luka/Downloads/New Docus.pdf';
        const existingPdfBytes = fs.readFileSync(pdfPath);
        
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const form = pdfDoc.getForm();
        
        console.log('📄 PDF loaded successfully');
        
        // Get all form fields
        const fields = form.getFields();
        console.log(`📊 Total form fields found: ${fields.length}`);
        
        // Analyze checkboxes specifically
        const checkboxes = [];
        const textFields = [];
        const checkedCheckboxes = [];
        const sampleTextFields = {};
        
        fields.forEach(field => {
            const fieldName = field.getName();
            
            if (field.constructor.name === 'PDFCheckBox') {
                checkboxes.push(fieldName);
                
                try {
                    // Check if checkbox is already checked
                    if (field.isChecked()) {
                        checkedCheckboxes.push(fieldName);
                        console.log(`✅ CHECKED: ${fieldName}`);
                    }
                } catch (error) {
                    // Some checkboxes might not support isChecked()
                }
            } else if (field.constructor.name === 'PDFTextField') {
                textFields.push(fieldName);
                
                try {
                    const value = field.getText();
                    if (value && value.trim() !== '') {
                        sampleTextFields[fieldName] = value.trim();
                        console.log(`📝 TEXT FIELD: ${fieldName} = "${value}"`);
                    }
                } catch (error) {
                    // Field might be empty or not readable
                }
            }
        });
        
        console.log('\n📊 ANALYSIS RESULTS:');
        console.log(`Total fields: ${fields.length}`);
        console.log(`Checkboxes: ${checkboxes.length}`);
        console.log(`Text fields: ${textFields.length}`);
        console.log(`Pre-checked checkboxes: ${checkedCheckboxes.length}`);
        console.log(`Text fields with sample data: ${Object.keys(sampleTextFields).length}`);
        
        // Generate new configuration
        const configContent = `// Updated Insolvenzantrag Checkbox Configuration
// Generated from new template analysis on ${new Date().toLocaleDateString()}
// Based on: ${pdfPath}

const INSOLVENZANTRAG_CONFIG = {
  // These checkboxes are pre-checked in the new template
  DEFAULT_CHECKBOXES_FOR_PFAENDBARES_EINKOMMEN: [
${checkedCheckboxes.map(name => `    "${name}"`).join(',\n')}
  ],

  // Sample text field data from the template
  SAMPLE_TEXT_FIELDS: ${JSON.stringify(sampleTextFields, null, 4)},

  // Apply default checkboxes for clients with attachable income
  applyDefaultCheckboxes: function(form) {
    let appliedCount = 0;
    let errorCount = 0;

    console.log('🔲 Applying NEW template checkboxes for client with pfändbares Einkommen...');
    
    this.DEFAULT_CHECKBOXES_FOR_PFAENDBARES_EINKOMMEN.forEach(fieldName => {
      try {
        const checkbox = form.getCheckBox(fieldName);
        checkbox.check();
        console.log(\`✅ Checked: \${fieldName}\`);
        appliedCount++;
      } catch (error) {
        console.error(\`❌ Failed to check \${fieldName}:\`, error.message);
        errorCount++;
      }
    });

    console.log(\`📊 NEW template checkbox application complete: \${appliedCount} applied, \${errorCount} errors\`);
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
          console.log(\`  ✅ Checked: \${fieldName}\`);
        } catch (error) {
          console.log(\`  ⚠️  Checkbox not found: \${fieldName}\`);
          errorCount++;
        }
      });
      
      console.log(\`📊 Applied \${appliedCount} NEW template checkboxes to PDF, \${errorCount} errors\`);
      
      const modifiedPdfBytes = await pdfDoc.save();
      return modifiedPdfBytes;
      
    } catch (error) {
      console.error('❌ Error applying NEW template checkboxes to PDF:', error);
      throw error;
    }
  }
};

module.exports = INSOLVENZANTRAG_CONFIG;
`;

        // Write the new configuration
        const configPath = '/Users/luka/Documents/Development/Mandanten-Portal/server/insolvenzantrag-checkbox-config-NEW.js';
        fs.writeFileSync(configPath, configContent);
        
        console.log(`\n✅ New configuration written to: ${configPath}`);
        console.log('\n🔧 RECOMMENDED INTEGRATION:');
        console.log('1. Replace the old configuration file with the new one');
        console.log('2. Restart the backend server');
        console.log('3. Test with a client that has pfändbares Einkommen');
        
        return {
            checkedCheckboxes,
            sampleTextFields,
            totalFields: fields.length,
            configPath
        };
        
    } catch (error) {
        console.error('❌ Error analyzing PDF:', error);
        throw error;
    }
}

// Run the analysis
analyzeNewTemplate()
    .then(results => {
        console.log('\n🎉 Analysis complete!');
        process.exit(0);
    })
    .catch(error => {
        console.error('💥 Analysis failed:', error);
        process.exit(1);
    });