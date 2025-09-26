const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');

class QuickFieldMapper {
    /**
     * Updated field mapping with REAL PDF field names from analysis
     */
    static getUpdatedFieldMapping() {
        return {
            // HAUPTBLATT (Seite 1) - CONFIRMED WORKING
            'vorname_name': 'Textfeld 1',                    // Name (confirmed working)
            'vollstaendige_adresse': 'Textfeld 2',           // Address (confirmed working)
            'plz_ort_kombiniert': 'Textfeld 3',              // ZIP + City (confirmed working)
            'telefon': 'Textfeld 4',                         // Phone (confirmed working)
            'anwalt_name': 'Textfeld 5',                     // Legal representative (confirmed working)
            'amtsgericht': 'Textfeld 17',                    // Court (confirmed working)
            
            // More text fields from analysis - let's map systematically
            'email': 'Textfeld 18',                          // Try email in next field
            'geburtsdatum': 'Textfeld 19',                   // Birth date
            'geburtsort': 'Textfeld 16',                     // Birth place
            
            // PERSONALBOGEN fields - trying sequential mapping
            'nachname_pb': 'Textfeld 20',                    // Last name separate
            'vorname_pb': 'Textfeld 22',                     // First name separate
            'strasse_pb': 'Textfeld 25',                     // Street
            'hausnummer_pb': 'Textfeld 28',                  // House number
            'plz_pb': 'Textfeld 31',                         // ZIP
            'ort_pb': 'Textfeld 37',                         // City
            'telefon_pb': 'Textfeld 39',                     // Phone duplicate
            
            // Standard checkboxes - CONFIRMED WORKING FROM LOGS
            'standard_restschuldbefreiung_ja': 'Kontrollkästchen 1',        
            'standard_restschuldbefreiung_nein': 'Kontrollkästchen 2',      
            'standard_antrag_nicht_gestellt': 'Kontrollkästchen 3',         
            'standard_antrag_bereits_gestellt': 'Kontrollkästchen 4',       
            'standard_restschuld_erteilt': 'Kontrollkästchen 5',            
            'standard_restschuld_versagt': 'Kontrollkästchen 6',            
            'standard_versagung_rechtskraeftig': 'Kontrollkästchen 7',      
            'standard_versagung_fahrlässig': 'Kontrollkästchen 10',         
            
            // Family status checkboxes - trying sequential
            'familienstand_ledig': 'Kontrollkästchen 11',
            'familienstand_verheiratet': 'Kontrollkästchen 15',
            'familienstand_geschieden': 'Kontrollkästchen 16',
            'familienstand_verwitwet': 'Kontrollkästchen 17',
            
            // Employment checkboxes
            'beruf_angestellt': 'Kontrollkästchen 23',
            'beruf_selbstaendig': 'Kontrollkästchen 24',
            'beruf_arbeitslos': 'Kontrollkästchen 25',
            'beruf_rentner': 'Kontrollkästchen 26',
            
            // Children
            'kinder_ja': 'Kontrollkästchen 31',
            'kinder_nein': 'Kontrollkästchen 32',
            
            // More text fields for dates
            'plan_datum': 'Textfeld 27',
            'scheiter_datum': 'Textfeld 29',
            'bescheinigung_datum': 'Textfeld 30'
        };
    }

    /**
     * Fill PDF with real field names and handle both text and checkboxes
     */
    static async fillWithRealFields(formData, originalPdfPath) {
        try {
            console.log('🔄 Loading original PDF with real field mapping...');
            
            const existingPdfBytes = await fs.readFile(originalPdfPath);
            const pdfDoc = await PDFDocument.load(existingPdfBytes);
            const form = pdfDoc.getForm();
            
            // Prepare complete data
            const completeData = { ...formData };
            
            // Add computed fields
            completeData.vorname_name = `${formData.nachname || ''}, ${formData.vorname || ''}`;
            completeData.nachname_pb = formData.nachname;
            completeData.vorname_pb = formData.vorname;
            completeData.strasse_pb = formData.strasse;
            completeData.hausnummer_pb = formData.hausnummer;
            completeData.plz_pb = formData.plz;
            completeData.ort_pb = formData.ort;
            completeData.telefon_pb = formData.telefon;
            
            // Add standard values
            completeData.standard_restschuldbefreiung_ja = true;
            completeData.standard_restschuldbefreiung_nein = false;
            completeData.standard_antrag_nicht_gestellt = true;
            completeData.standard_antrag_bereits_gestellt = false;
            completeData.standard_restschuld_erteilt = false;
            completeData.standard_restschuld_versagt = false;
            completeData.standard_versagung_rechtskraeftig = false;
            completeData.standard_versagung_fahrlässig = false;
            
            // Handle family status
            this.setFamilyStatus(completeData, formData.familienstand);
            
            // Handle employment
            this.setEmploymentStatus(completeData, formData.berufsstatus);
            
            // Handle children
            const hasChildren = formData.kinder_anzahl && parseInt(formData.kinder_anzahl) > 0;
            completeData.kinder_ja = hasChildren;
            completeData.kinder_nein = !hasChildren;
            
            // Auto-generate dates
            const heute = new Date();
            const scheiterDatum = new Date(heute.getTime() + 14 * 24 * 60 * 60 * 1000);
            completeData.plan_datum = heute.toLocaleDateString('de-DE');
            completeData.scheiter_datum = scheiterDatum.toLocaleDateString('de-DE');
            completeData.bescheinigung_datum = heute.toLocaleDateString('de-DE');
            
            console.log('📝 Filling PDF with real field names...');
            
            const fieldMapping = this.getUpdatedFieldMapping();
            let textFieldsFilled = 0;
            let checkboxesFilled = 0;
            let failedFields = 0;
            
            Object.entries(fieldMapping).forEach(([dataField, pdfFieldName]) => {
                try {
                    const value = completeData[dataField];
                    
                    if (value !== undefined && value !== null && value !== '') {
                        if (pdfFieldName.includes('Kontrollkästchen')) {
                            // Checkbox
                            try {
                                const checkbox = form.getCheckBox(pdfFieldName);
                                if (value === true || value === 'true' || value === 'on') {
                                    checkbox.check();
                                    checkboxesFilled++;
                                    console.log(`  ✅ Checked: ${pdfFieldName}`);
                                } else {
                                    checkbox.uncheck();
                                }
                            } catch (checkboxError) {
                                console.log(`  ⚠️  Checkbox not found: ${pdfFieldName}`);
                                failedFields++;
                            }
                        } else {
                            // Text field
                            try {
                                const textField = form.getTextField(pdfFieldName);
                                textField.setText(String(value));
                                textFieldsFilled++;
                                console.log(`  📝 Filled: ${pdfFieldName} = "${value}"`);
                            } catch (textError) {
                                console.log(`  ⚠️  Text field not found: ${pdfFieldName}`);
                                failedFields++;
                            }
                        }
                    }
                } catch (error) {
                    console.warn(`  ❌ Error with ${pdfFieldName}:`, error.message);
                    failedFields++;
                }
            });
            
            console.log(`📊 Results: ${textFieldsFilled} text fields, ${checkboxesFilled} checkboxes, ${failedFields} failed`);
            console.log('💾 Generating improved PDF...');
            
            const filledPdfBytes = await pdfDoc.save();
            return filledPdfBytes;
            
        } catch (error) {
            console.error('❌ Error filling PDF with real fields:', error);
            throw error;
        }
    }
    
    /**
     * Set family status (exclusive)
     */
    static setFamilyStatus(data, status) {
        data.familienstand_ledig = (status === 'ledig');
        data.familienstand_verheiratet = (status === 'verheiratet');
        data.familienstand_geschieden = (status === 'geschieden');
        data.familienstand_verwitwet = (status === 'verwitwet');
    }
    
    /**
     * Set employment status (exclusive)
     */
    static setEmploymentStatus(data, status) {
        data.beruf_angestellt = (status === 'angestellt');
        data.beruf_selbstaendig = (status === 'selbstaendig');
        data.beruf_arbeitslos = (status === 'arbeitslos');
        data.beruf_rentner = (status === 'rentner');
    }
}

module.exports = QuickFieldMapper;