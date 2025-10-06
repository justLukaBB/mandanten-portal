const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');

class OriginalPDFFiller {
    /**
     * Field mapping based on analysis of the original PDF
     * Maps HTML form field names to actual PDF field names from the first page
     */
    static getFieldMapping() {
        return {
            // Section 1: Personal Data (first 5 text fields in PDF)
            'vorname_name': 'Textfeld 1',                    // Name
            'strasse_hausnummer': 'Textfeld 2',              // Street + House Number  
            'plz_ort': 'Textfeld 3',                         // ZIP + City
            'telefon_tags': 'Textfeld 4',                    // Phone during day
            'verfahrensbevollmaechtigter': 'Textfeld 5',     // Legal representative
            
            // Section 2: Court
            'amtsgericht_ort': 'Textfeld 17',               // Court location
            
            // Section 4: Checkboxes for debt relief application
            'restschuldbefreiung_ja': 'Kontrollkästchen 1',        // Apply for debt relief - YES
            'restschuldbefreiung_nein': 'Kontrollkästchen 2',      // Apply for debt relief - NO
            
            // Section 4.2: Previous applications
            'antrag_nicht_gestellt': 'Kontrollkästchen 3',         // No previous application
            'antrag_bereits_gestellt': 'Kontrollkästchen 4',       // Previous application made
            
            // Section 4.2b: Relief granted/denied
            'restschuld_erteilt': 'Kontrollkästchen 5',            // Relief was granted
            'restschuld_versagt': 'Kontrollkästchen 6',            // Relief was denied
            
            // Section 4.2c: Reasons for denial
            'versagung_rechtskraeftig': 'Kontrollkästchen 7',      // Legal conviction
            'versagung_fahrlässig': 'Kontrollkästchen 10'          // Negligent violation
        };
    }

    /**
     * Fill the original PDF with form data
     */
    static async fillOriginalPDF(formData, originalPdfPath) {
        try {
            console.log('🔄 Loading original PDF...');
            
            // Load the original PDF
            const existingPdfBytes = await fs.readFile(originalPdfPath);
            const pdfDoc = await PDFDocument.load(existingPdfBytes);
            
            // Get the form
            const form = pdfDoc.getForm();
            const fieldMapping = this.getFieldMapping();
            
            console.log('📝 Filling form fields...');
            
            // Fill text fields
            Object.entries(fieldMapping).forEach(([htmlField, pdfFieldName]) => {
                try {
                    const value = formData[htmlField];
                    
                    if (value) {
                        // Check if it's a checkbox field
                        if (pdfFieldName.includes('Kontrollkästchen')) {
                            const checkboxField = form.getCheckBox(pdfFieldName);
                            if (value === true || value === 'true' || value === 'on') {
                                checkboxField.check();
                                console.log(`  ✅ Checked: ${pdfFieldName}`);
                            } else {
                                checkboxField.uncheck();
                            }
                        } else {
                            // Text field
                            const textField = form.getTextField(pdfFieldName);
                            textField.setText(String(value));
                            console.log(`  📝 Filled: ${pdfFieldName} = "${value}"`);
                        }
                    }
                } catch (fieldError) {
                    console.warn(`  ⚠️  Could not fill field ${pdfFieldName}:`, fieldError.message);
                }
            });
            
            // Handle special logic for exclusive checkboxes
            this.handleExclusiveCheckboxes(form, formData);
            
            // Flatten the form to make it non-editable (optional)
            // form.flatten();
            
            console.log('💾 Generating filled PDF...');
            
            // Save the filled PDF
            const filledPdfBytes = await pdfDoc.save();
            
            return filledPdfBytes;
            
        } catch (error) {
            console.error('❌ Error filling original PDF:', error);
            throw new Error('Failed to fill original PDF: ' + error.message);
        }
    }

    /**
     * Handle exclusive checkbox behavior (only one can be selected)
     */
    static handleExclusiveCheckboxes(form, formData) {
        try {
            // Debt relief application: only one can be checked
            if (formData.restschuldbefreiung_ja) {
                form.getCheckBox('Kontrollkästchen 1').check();
                form.getCheckBox('Kontrollkästchen 2').uncheck();
            } else if (formData.restschuldbefreiung_nein) {
                form.getCheckBox('Kontrollkästchen 1').uncheck();
                form.getCheckBox('Kontrollkästchen 2').check();
            }
            
            // Previous application: only one can be checked
            if (formData.antrag_nicht_gestellt) {
                form.getCheckBox('Kontrollkästchen 3').check();
                form.getCheckBox('Kontrollkästchen 4').uncheck();
            } else if (formData.antrag_bereits_gestellt) {
                form.getCheckBox('Kontrollkästchen 3').uncheck();
                form.getCheckBox('Kontrollkästchen 4').check();
            }
            
            // Relief status: only one can be checked  
            if (formData.restschuld_erteilt) {
                form.getCheckBox('Kontrollkästchen 5').check();
                form.getCheckBox('Kontrollkästchen 6').uncheck();
            } else if (formData.restschuld_versagt) {
                form.getCheckBox('Kontrollkästchen 5').uncheck();
                form.getCheckBox('Kontrollkästchen 6').check();
            }
            
        } catch (error) {
            console.warn('⚠️  Error handling exclusive checkboxes:', error.message);
        }
    }

    /**
     * Get all available field names from the PDF (for debugging)
     */
    static async getAvailableFields(pdfPath) {
        try {
            const existingPdfBytes = await fs.readFile(pdfPath);
            const pdfDoc = await PDFDocument.load(existingPdfBytes);
            const form = pdfDoc.getForm();
            const fields = form.getFields();
            
            return fields.map((field, index) => ({
                index,
                name: field.getName(),
                type: field.constructor.name
            }));
            
        } catch (error) {
            console.error('Error getting available fields:', error);
            return [];
        }
    }

    /**
     * Create a test filled PDF to verify field mappings
     */
    static async createTestPDF(originalPdfPath, outputPath) {
        const testData = {
            'vorname_name': 'Max Mustermann',
            'strasse_hausnummer': 'Musterstraße 123',
            'plz_ort': '12345 Musterstadt',
            'telefon_tags': '0123456789',
            'verfahrensbevollmaechtigter': 'RA Mustermann',
            'amtsgericht_ort': 'Musterstadt',
            'restschuldbefreiung_ja': true,
            'restschuldbefreiung_nein': false,
            'antrag_nicht_gestellt': true,
            'antrag_bereits_gestellt': false,
            'restschuld_erteilt': false,
            'restschuld_versagt': false,
            'versagung_rechtskraeftig': false,
            'versagung_fahrlässig': false
        };

        console.log('🧪 Creating test PDF with sample data...');
        
        const filledPdfBytes = await this.fillOriginalPDF(testData, originalPdfPath);
        await fs.writeFile(outputPath, filledPdfBytes);
        
        console.log(`✅ Test PDF created: ${outputPath}`);
        
        return outputPath;
    }
}

module.exports = OriginalPDFFiller;