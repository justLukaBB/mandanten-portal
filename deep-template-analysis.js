const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

async function performDeepAnalysis() {
    try {
        console.log('🔍 DEEP ANALYSIS: New Docus.pdf Template');
        console.log('================================================');
        
        const pdfPath = '/Users/luka/Downloads/New Docus.pdf';
        const existingPdfBytes = fs.readFileSync(pdfPath);
        
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const form = pdfDoc.getForm();
        
        // Get all form fields
        const fields = form.getFields();
        console.log(`📊 TOTAL FORM FIELDS: ${fields.length}`);
        
        // Categorize fields
        const textFields = [];
        const checkboxFields = [];
        const otherFields = [];
        const checkedCheckboxes = [];
        const uncheckedCheckboxes = [];
        const filledTextFields = {};
        const emptyTextFields = [];
        
        console.log('\n🔍 ANALYZING ALL FIELDS...\n');
        
        fields.forEach((field, index) => {
            const fieldName = field.getName();
            const fieldType = field.constructor.name;
            
            if (fieldType === 'PDFTextField') {
                textFields.push(fieldName);
                
                try {
                    const value = field.getText();
                    if (value && value.trim() !== '') {
                        filledTextFields[fieldName] = value.trim();
                        console.log(`📝 FILLED TEXT: ${fieldName} = "${value}"`);
                    } else {
                        emptyTextFields.push(fieldName);
                    }
                } catch (error) {
                    emptyTextFields.push(fieldName);
                }
                
            } else if (fieldType === 'PDFCheckBox') {
                checkboxFields.push(fieldName);
                
                try {
                    if (field.isChecked()) {
                        checkedCheckboxes.push(fieldName);
                        console.log(`✅ CHECKED CHECKBOX: ${fieldName}`);
                    } else {
                        uncheckedCheckboxes.push(fieldName);
                    }
                } catch (error) {
                    // Some checkboxes might not support isChecked()
                    uncheckedCheckboxes.push(fieldName);
                }
                
            } else {
                otherFields.push({ name: fieldName, type: fieldType });
            }
        });
        
        console.log('\n📊 ANALYSIS SUMMARY:');
        console.log('==================');
        console.log(`Total Fields: ${fields.length}`);
        console.log(`Text Fields: ${textFields.length}`);
        console.log(`Checkboxes: ${checkboxFields.length}`);
        console.log(`Other Field Types: ${otherFields.length}`);
        console.log(`Filled Text Fields: ${Object.keys(filledTextFields).length}`);
        console.log(`Empty Text Fields: ${emptyTextFields.length}`);
        console.log(`Checked Checkboxes: ${checkedCheckboxes.length}`);
        console.log(`Unchecked Checkboxes: ${uncheckedCheckboxes.length}`);
        
        console.log('\n🎯 CRITICAL MISSING FIELDS ANALYSIS:');
        console.log('====================================');
        
        // Analyze what fields we're currently NOT filling
        const currentlyFilledFields = [
            'Textfeld 1', 'Textfeld 2', 'Textfeld 3', 'Textfeld 16', 'Textfeld 22', 'Textfeld 24',
            'Textfeld 25', 'Textfeld 27', 'Textfeld 32', 'Textfeld 33', 'Textfeld 34', 'Textfeld 35',
            'Textfeld 39', 'Textfeld 83', 'Textfeld 84', 'Textfeld 86', 'Textfeld 88', 'Textfeld 97',
            'Textfeld 153', 'Textfeld 196', 'Textfeld 215', 'Textfeld 234', 'Textfeld 256', 'Textfeld 272',
            'Textfeld 347', 'Textfeld 364', 'Textfeld 394', 'Textfeld 421', 'Textfeld 634', 'Textfeld 635',
            'Textfeld 636', 'Textfeld 637', 'Textfeld 748', 'Textfeld 1002', 'Textfeld 1230', 'Textfeld 1233'
        ];
        
        // Find missing text fields that have content in the template
        const missingImportantFields = [];
        for (const [fieldName, value] of Object.entries(filledTextFields)) {
            if (!currentlyFilledFields.includes(fieldName)) {
                missingImportantFields.push({ field: fieldName, templateValue: value });
            }
        }
        
        console.log('\n🚨 MISSING IMPORTANT TEXT FIELDS:');
        missingImportantFields.forEach(item => {
            console.log(`❌ MISSING: ${item.field} = "${item.templateValue}"`);
        });
        
        console.log('\n✅ CHECKBOX STATUS:');
        console.log('==================');
        console.log('CURRENTLY APPLIED CHECKBOXES:');
        const currentlyAppliedCheckboxes = ['Kontrollkästchen 1', 'Kontrollkästchen 2', 'Kontrollkästchen 17', 'Kontrollkästchen 21', 'Kontrollkästchen 25', 'Kontrollkästchen 26', 'Kontrollkästchen 27', 'Kontrollkästchen 32a', 'Kontrollkästchen 36', 'Kontrollkästchen 333'];
        
        currentlyAppliedCheckboxes.forEach(checkbox => {
            const isInTemplate = checkedCheckboxes.includes(checkbox);
            console.log(`${isInTemplate ? '✅' : '❌'} ${checkbox} ${isInTemplate ? '(CORRECT)' : '(NOT IN TEMPLATE!)'}`);
        });
        
        console.log('\nTEMPLATE CHECKBOXES NOT IN OUR CONFIG:');
        checkedCheckboxes.forEach(checkbox => {
            if (!currentlyAppliedCheckboxes.includes(checkbox)) {
                console.log(`🆕 MISSING: ${checkbox}`);
            }
        });
        
        console.log('\n📋 FIELD MAPPING RECOMMENDATIONS:');
        console.log('=================================');
        
        // Generate field mapping recommendations for missing fields
        const fieldMappingRecommendations = {};
        
        missingImportantFields.forEach(item => {
            const fieldName = item.field;
            const templateValue = item.templateValue;
            
            // Analyze the template value to suggest data mapping
            let recommendation = '';
            
            if (templateValue.includes('Telefon') || templateValue.includes('tagsüber')) {
                recommendation = 'formData.telefon || ""';
            } else if (templateValue.includes('Verfahrensbevollmächtigte') || templateValue.includes('Anwalt')) {
                recommendation = 'formData.anwalt_name || ""';
            } else if (templateValue.includes('Amtsgericht') || templateValue.includes('Insolvenzgericht')) {
                recommendation = 'formData.amtsgericht || ""';
            } else if (templateValue.includes('Ort') && templateValue.includes('Datum')) {
                recommendation = 'new Date().toLocaleDateString("de-DE")';
            } else if (templateValue.includes('Vorname') && templateValue.includes('Name')) {
                recommendation = 'fullName';
            } else if (templateValue.includes('Akademischer Grad')) {
                recommendation = 'formData.akademischer_grad || ""';
            } else if (templateValue.includes('Geburtsdatum')) {
                recommendation = 'formData.geburtsdatum || ""';
            } else if (templateValue.includes('Geburtsort')) {
                recommendation = 'formData.geburtsort || ""';
            } else if (templateValue.includes('Mobil')) {
                recommendation = 'formData.telefon_mobil || ""';
            } else if (templateValue.includes('E-mail') || templateValue.includes('email')) {
                recommendation = 'formData.email || ""';
            } else if (templateValue.includes('Beruf')) {
                recommendation = 'formData.beruf || ""';
            } else if (templateValue.includes('tätig')) {
                recommendation = 'formData.aktuelle_taetigkeit || ""';
            } else if (templateValue.includes('Rechtsanwalt') || templateValue.includes('Bongardstraße') || templateValue.includes('Bochum')) {
                recommendation = 'formData.anwalt_details || ""';
            } else if (templateValue.includes('Plan') && templateValue.includes('Datum')) {
                recommendation = 'formData.plan_datum || ""';
            } else if (templateValue.includes('Scheiterung') && templateValue.includes('Datum')) {
                recommendation = 'formData.scheiterung_datum || ""';
            } else if (templateValue.includes('Anzahl') && templateValue.includes('Gläubiger')) {
                recommendation = 'formData.anzahl_glaeubiger || ""';
            } else if (templateValue.includes('Summe')) {
                recommendation = 'formData.summe_total || ""';
            } else if (templateValue.includes('Schuldenbereinigungsplan')) {
                recommendation = 'formData.schuldenbereinigungsplan_datum || ""';
            } else {
                recommendation = `"${templateValue}" // Template value - needs mapping`;
            }
            
            fieldMappingRecommendations[fieldName] = recommendation;
        });
        
        console.log('\n📝 SUGGESTED FIELD MAPPINGS TO ADD:');
        Object.entries(fieldMappingRecommendations).forEach(([field, mapping]) => {
            console.log(`'${field}': ${mapping},`);
        });
        
        console.log('\n🔧 INTEGRATION STEPS:');
        console.log('=====================');
        console.log('1. Add missing field mappings to quick-field-mapper.js');
        console.log('2. Update checkbox configuration if needed');
        console.log('3. Add missing data preparation in fillWithRealFields()');
        console.log('4. Test PDF generation');
        
        // Generate updated configuration files
        console.log('\n💾 GENERATING UPDATED CONFIGURATION...');
        
        const updatedFieldMapping = `
// COMPLETE FIELD MAPPING - Based on deep template analysis
static getCompleteFieldMapping() {
    return {
        // EXISTING MAPPINGS (already implemented)
        'vorname_name': 'Textfeld 1',
        'vollstaendige_adresse': 'Textfeld 2', 
        'plz_ort_kombiniert': 'Textfeld 3',
        'amtsgericht': 'Textfeld 16',
        'datum_unterschrift': 'Textfeld 22',
        'name_field_1': 'Textfeld 24',
        'nachname': 'Textfeld 25',
        'vorname': 'Textfeld 27',
        'strasse': 'Textfeld 32',
        'hausnummer': 'Textfeld 33',
        'plz': 'Textfeld 34',
        'ort': 'Textfeld 35',
        'email': 'Textfeld 39',
        'unterschrift_ort_datum': 'Textfeld 83',
        'unterschrift_name': 'Textfeld 84',
        'anzahl_glaeubiger': 'Textfeld 86',
        'summe_gesamt': 'Textfeld 88',
        
        // MISSING FIELDS TO ADD:
${Object.entries(fieldMappingRecommendations).map(([field, mapping]) => 
    `        '${field.toLowerCase().replace(/[^a-z0-9]/g, '_')}': '${field}', // ${mapping}`
).join('\n')}
        
        // All name fields for consistency
${Array.from({length: 17}, (_, i) => {
    const fieldNum = [97, 153, 196, 215, 234, 256, 272, 347, 364, 394, 421, 634, 635, 748, 1002, 1230, 1233][i];
    return `        'name_field_${i + 2}': 'Textfeld ${fieldNum}',`;
}).join('\n')}
    };
}`;
        
        const updatedCheckboxConfig = `
// COMPLETE CHECKBOX CONFIGURATION - All checked boxes from template
DEFAULT_CHECKBOXES_FOR_PFAENDBARES_EINKOMMEN: [
${checkedCheckboxes.map(checkbox => `    "${checkbox}"`).join(',\n')}
]`;
        
        console.log('\n📄 COMPLETE FIELD MAPPING TO IMPLEMENT:');
        console.log(updatedFieldMapping);
        
        console.log('\n☑️ COMPLETE CHECKBOX CONFIG:');
        console.log(updatedCheckboxConfig);
        
        return {
            totalFields: fields.length,
            textFields: textFields.length,
            checkboxFields: checkboxFields.length,
            filledTextFields: Object.keys(filledTextFields).length,
            checkedCheckboxes: checkedCheckboxes.length,
            missingFields: missingImportantFields.length,
            recommendations: fieldMappingRecommendations,
            allCheckedCheckboxes: checkedCheckboxes,
            allFilledTextFields: filledTextFields
        };
        
    } catch (error) {
        console.error('❌ Error in deep analysis:', error);
        throw error;
    }
}

// Run the deep analysis
performDeepAnalysis()
    .then(results => {
        console.log('\n🎉 DEEP ANALYSIS COMPLETE!');
        console.log(`📊 Results: ${results.missingFields} missing fields identified`);
        console.log(`✅ Checked boxes: ${results.checkedCheckboxes}`);
        console.log(`📝 Filled text fields: ${results.filledTextFields}`);
        process.exit(0);
    })
    .catch(error => {
        console.error('💥 Analysis failed:', error);
        process.exit(1);
    });