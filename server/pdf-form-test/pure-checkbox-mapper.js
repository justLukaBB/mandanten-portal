const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;

class PureCheckboxMapper {
    
    /**
     * Fülle PDF NUR mit checkbox-config.js - KEINE automatischen Überschreibungen
     */
    static async fillWithPureConfig(formData, originalPdfPath) {
        try {
            console.log('🔄 Loading PDF with PURE Checkbox Configuration (keine Überschreibungen)...');
            
            // Cache leeren um neueste checkbox-config.js zu laden
            const path = require('path');
            const configPath = path.resolve('./checkbox-config.js');
            delete require.cache[configPath];
            const checkboxConfig = require('../../checkbox-config');
            
            const existingPdfBytes = await fs.readFile(originalPdfPath);
            const pdfDoc = await PDFDocument.load(existingPdfBytes);
            const form = pdfDoc.getForm();
            
            // Prepare complete data
            const completeData = { ...formData };
            
            // Add computed fields für Textfelder
            completeData.vorname_name = `${formData.nachname || ''}, ${formData.vorname || ''}`;
            completeData.vorname_pb = formData.vorname;
            completeData.strasse_pb = formData.strasse;
            completeData.hausnummer_pb = formData.hausnummer;
            completeData.plz_pb = formData.plz;
            completeData.ort_pb = formData.ort;
            completeData.telefon_pb = formData.telefon;
            
            // Auto-generate dates
            const heute = new Date();
            const scheiterDatum = new Date(heute.getTime() + 14 * 24 * 60 * 60 * 1000);
            completeData.plan_datum = heute.toLocaleDateString('de-DE');
            completeData.scheiter_datum = scheiterDatum.toLocaleDateString('de-DE');
            completeData.bescheinigung_datum = heute.toLocaleDateString('de-DE');
            completeData.unterschrift_ort = formData.ort || 'Musterstadt';
            
            // Personalbogen fields
            completeData.geburtsdatum_pb = formData.geburtsdatum || '';
            completeData.geburtsort_pb = formData.geburtsort || '';
            completeData.email_pb = formData.email || '';
            completeData.geburtsname = formData.geburtsname || '';
            completeData.frueherer_name = formData.frueherer_name || '';
            completeData.telefon_mobil = formData.telefon_mobil || '';
            completeData.telefax = formData.telefax || '';
            
            // Unterhaltsberechtigte
            const hasChildren = formData.kinder_anzahl && parseInt(formData.kinder_anzahl) > 0;
            completeData.unterhalt_anzahl = hasChildren ? formData.kinder_anzahl : '';
            completeData.unterhalt_minderjaehrig = hasChildren ? formData.kinder_anzahl : '';
            
            console.log('📝 Filling Textfields...');
            
            // Basis Textfeld Mapping - nur die wichtigsten
            const basicTextFields = {
                'vorname_name': 'Textfeld 1',
                'telefon': 'Textfeld 4',
                'vorname_pb': 'Textfeld 22',
                'strasse_pb': 'Textfeld 25',
                'hausnummer_pb': 'Textfeld 28',
                'plz_pb': 'Textfeld 31',
                'ort_pb': 'Textfeld 37',
                'telefon_pb': 'Textfeld 39',
                'plan_datum': 'Textfeld 27',
                'scheiter_datum': 'Textfeld 29',
                'bescheinigung_datum': 'Textfeld 30',
                'unterschrift_ort': 'Textfeld 26',
                'email_pb': 'Textfeld 40',
                'unterhalt_anzahl': 'Textfeld 46',
                'unterhalt_minderjaehrig': 'Textfeld 47'
            };
            
            let textFieldsFilled = 0;
            
            // Fill basic text fields
            Object.entries(basicTextFields).forEach(([dataField, pdfFieldName]) => {
                try {
                    const value = completeData[dataField];
                    if (value !== undefined && value !== null && value !== '') {
                        const textField = form.getTextField(pdfFieldName);
                        textField.setText(String(value));
                        textFieldsFilled++;
                        console.log(`  📝 Filled: ${pdfFieldName} = "${value}"`);
                    }
                } catch (error) {
                    console.log(`  ⚠️  Text field not found: ${pdfFieldName}`);
                }
            });
            
            console.log('📋 Applying PURE Checkbox Configuration (EXAKT wie in checkbox-config.js)...');
            
            let checkboxesChecked = 0;
            let checkboxesUnchecked = 0;
            let failedCheckboxes = 0;
            
            // ═══════════════════════════════════════════════════════════════════════════
            // NUR CHECKBOX-CONFIG.JS VERWENDEN - KEINE AUTOMATISCHEN ÜBERSCHREIBUNGEN!
            // ═══════════════════════════════════════════════════════════════════════════
            
            Object.entries(checkboxConfig).forEach(([checkboxName, shouldCheck]) => {
                try {
                    const checkbox = form.getCheckBox(checkboxName);
                    if (shouldCheck) {
                        checkbox.check();
                        checkboxesChecked++;
                        console.log(`  ✅ Checked: ${checkboxName}`);
                    } else {
                        checkbox.uncheck();
                        checkboxesUnchecked++;
                        console.log(`  ✗ Unchecked: ${checkboxName}`);
                    }
                } catch (error) {
                    console.log(`  ⚠️  Checkbox not found: ${checkboxName}`);
                    failedCheckboxes++;
                }
            });
            
            console.log(`📊 Results: ${textFieldsFilled} text fields, ${checkboxesChecked} checked, ${checkboxesUnchecked} unchecked, ${failedCheckboxes} failed`);
            console.log('💾 Generating PDF...');
            
            const filledPdfBytes = await pdfDoc.save();
            return filledPdfBytes;
            
        } catch (error) {
            console.error('❌ Error filling PDF with pure config:', error);
            throw error;
        }
    }
}

module.exports = PureCheckboxMapper;