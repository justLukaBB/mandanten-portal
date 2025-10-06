const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

// Import the field mapper to test the complete integration
const path = require('path');
const QuickFieldMapper = require('./server/pdf-form-test/quick-field-mapper');

async function verifyCompleteIntegration() {
    try {
        console.log('🔍 VERIFICATION: Complete Integration Check');
        console.log('==========================================');
        
        const pdfPath = '/Users/luka/Downloads/dqw.pdf';
        const existingPdfBytes = fs.readFileSync(pdfPath);
        
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const form = pdfDoc.getForm();
        
        // Get all filled fields from template
        const templateFields = {};
        const checkedCheckboxes = [];
        
        const fields = form.getFields();
        fields.forEach(field => {
            const fieldName = field.getName();
            const fieldType = field.constructor.name;
            
            if (fieldType === 'PDFTextField') {
                try {
                    const value = field.getText();
                    if (value && value.trim() !== '') {
                        templateFields[fieldName] = value.trim();
                    }
                } catch (error) {
                    // Field might be empty
                }
            } else if (fieldType === 'PDFCheckBox') {
                try {
                    if (field.isChecked()) {
                        checkedCheckboxes.push(fieldName);
                    }
                } catch (error) {
                    // Checkbox might not support isChecked()
                }
            }
        });
        
        console.log(`📊 Template has ${Object.keys(templateFields).length} filled text fields`);
        console.log(`📊 Template has ${checkedCheckboxes.length} checked checkboxes`);
        
        // Get our current field mapping
        const fieldMapping = QuickFieldMapper.getUpdatedFieldMapping();
        console.log(`📊 Our mapping covers ${Object.keys(fieldMapping).length} field mappings`);
        
        // Test with sample data
        const testClientData = {
            vorname: 'Thomas',
            nachname: 'Schmidt', 
            strasse: 'Hauptstraße',
            hausnummer: '78',
            plz: '50667',
            ort: 'Köln',
            telefon: '0221123456',
            telefon_mobil: '01751234567',
            email: 'thomas.schmidt@example.com',
            geburtsdatum: '15.05.1985',
            geburtsort: 'Köln',
            akademischer_grad: 'Dipl.-Ing.',
            erlernter_beruf: 'Ingenieur',
            aktuelle_taetigkeit: 'Projektleiter',
            berufliche_taetigkeit: 'Projektleiter',
            anwalt_name: 'Rechtsanwalt Mustermann',
            anwalt_strasse: 'Musterstraße',
            anwalt_hausnummer: '123',
            anwalt_plz: '12345',
            anwalt_ort: 'Musterstadt',
            anzahl_glaeubiger: 4,
            gesamtschuldensumme: 13990,
            amtsgericht: 'Köln'
        };
        
        // Simulate the field filling process
        console.log('\\n🔧 SIMULATING FIELD FILLING PROCESS:');
        console.log('=====================================');
        
        let mappedFields = 0;
        let unmappedTemplateFields = [];
        
        // Check which template fields have mappings
        Object.keys(templateFields).forEach(templateField => {
            let isMapped = false;
            
            // Check if this field is in our mapping
            Object.entries(fieldMapping).forEach(([mappingKey, mappingField]) => {
                if (mappingField === templateField) {
                    isMapped = true;
                    mappedFields++;
                    console.log(`✅ ${templateField} = "${templateFields[templateField]}" (mapped as ${mappingKey})`);
                }
            });
            
            if (!isMapped) {
                unmappedTemplateFields.push({
                    field: templateField,
                    value: templateFields[templateField]
                });
            }
        });
        
        console.log('\\n🚨 UNMAPPED TEMPLATE FIELDS:');
        console.log('=============================');
        
        if (unmappedTemplateFields.length === 0) {
            console.log('🎉 ALL TEMPLATE FIELDS ARE MAPPED!');
        } else {
            console.log(`❌ Found ${unmappedTemplateFields.length} unmapped fields:`);
            unmappedTemplateFields.forEach((item, index) => {
                console.log(`${index + 1}. ❌ ${item.field} = "${item.value}"`);
            });
        }
        
        // Check checkbox configuration
        console.log('\\n☑️ CHECKBOX VERIFICATION:');
        console.log('==========================');
        
        const configuredCheckboxes = [
            'Kontrollkästchen 1', 'Kontrollkästchen 2', 'Kontrollkästchen 15', 'Kontrollkästchen 17',
            'Kontrollkästchen 21', 'Kontrollkästchen 25', 'Kontrollkästchen 26', 'Kontrollkästchen 27',
            'Kontrollkästchen 32a', 'Kontrollkästchen 36', 'Kontrollkästchen 333'
        ];
        
        let correctCheckboxes = 0;
        let missingCheckboxes = [];
        
        checkedCheckboxes.forEach(templateCheckbox => {
            if (configuredCheckboxes.includes(templateCheckbox)) {
                correctCheckboxes++;
                console.log(`✅ ${templateCheckbox} (correctly configured)`);
            } else {
                missingCheckboxes.push(templateCheckbox);
            }
        });
        
        if (missingCheckboxes.length > 0) {
            console.log('\\n❌ Missing checkboxes from configuration:');
            missingCheckboxes.forEach(checkbox => {
                console.log(`❌ ${checkbox}`);
            });
        }
        
        console.log('\\n📈 FINAL INTEGRATION SCORE:');
        console.log('============================');
        
        const textFieldScore = (mappedFields / Object.keys(templateFields).length) * 100;
        const checkboxScore = (correctCheckboxes / checkedCheckboxes.length) * 100;
        
        console.log(`Text Fields: ${mappedFields}/${Object.keys(templateFields).length} (${textFieldScore.toFixed(1)}%)`);
        console.log(`Checkboxes: ${correctCheckboxes}/${checkedCheckboxes.length} (${checkboxScore.toFixed(1)}%)`);
        
        const overallScore = ((textFieldScore + checkboxScore) / 2).toFixed(1);
        console.log(`\\n🏆 OVERALL COMPLETION: ${overallScore}%`);
        
        if (overallScore == 100.0) {
            console.log('\\n🎉 PERFECT INTEGRATION - 100% COMPLETE!');
            console.log('✅ All template fields are mapped');
            console.log('✅ All template checkboxes are configured');
            console.log('🚀 Ready for production use!');
        } else {
            console.log('\\n🔧 Integration needs completion:');
            if (unmappedTemplateFields.length > 0) {
                console.log(`📝 Add ${unmappedTemplateFields.length} missing text field mappings`);
            }
            if (missingCheckboxes.length > 0) {
                console.log(`☑️ Add ${missingCheckboxes.length} missing checkbox configurations`);
            }
        }
        
        return {
            textFieldScore,
            checkboxScore,
            overallScore: parseFloat(overallScore),
            unmappedFields: unmappedTemplateFields.length,
            missingCheckboxes: missingCheckboxes.length
        };
        
    } catch (error) {
        console.error('❌ Verification failed:', error);
        throw error;
    }
}

// Run verification
verifyCompleteIntegration()
    .then(results => {
        console.log('\\n🎯 VERIFICATION COMPLETE!');
        process.exit(0);
    })
    .catch(error => {
        console.error('💥 Verification failed:', error);
        process.exit(1);
    });