const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

async function performUltraDeepAnalysis() {
    try {
        console.log('🔍 ULTRA DEEP ANALYSIS: dqw.pdf Document');
        console.log('===============================================');
        
        const pdfPath = '/Users/luka/Downloads/dqw.pdf';
        const existingPdfBytes = fs.readFileSync(pdfPath);
        
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const form = pdfDoc.getForm();
        
        // Get all form fields
        const fields = form.getFields();
        console.log(`📊 TOTAL FORM FIELDS: ${fields.length}`);
        
        // Categorize fields
        const textFields = [];
        const checkboxFields = [];
        const checkedCheckboxes = [];
        const uncheckedCheckboxes = [];
        const filledTextFields = {};
        const emptyTextFields = [];
        
        // Our current configuration for comparison
        const currentCheckboxes = [
            'Kontrollkästchen 1', 'Kontrollkästchen 2', 'Kontrollkästchen 17', 'Kontrollkästchen 21',
            'Kontrollkästchen 25', 'Kontrollkästchen 26', 'Kontrollkästchen 27', 'Kontrollkästchen 32a',
            'Kontrollkästchen 36', 'Kontrollkästchen 333'
        ];
        
        console.log('\\n🔍 ANALYZING ALL FIELDS FOR CHECKBOXES AND NAME FIELDS...\\n');
        
        fields.forEach((field, index) => {
            const fieldName = field.getName();
            const fieldType = field.constructor.name;
            
            if (fieldType === 'PDFTextField') {
                textFields.push(fieldName);
                
                try {
                    const value = field.getText();
                    if (value && value.trim() !== '') {
                        filledTextFields[fieldName] = value.trim();
                        
                        // Look for name fields specifically
                        if (value.toLowerCase().includes('name') || 
                            value.toLowerCase().includes('vorname') ||
                            fieldName.toLowerCase().includes('name') ||
                            value.includes('Vorname Name') ||
                            value.includes('Name') ||
                            value.includes('vorname')) {
                            console.log(`👤 NAME FIELD: ${fieldName} = "${value}" ⭐`);
                        } else {
                            console.log(`📝 FILLED TEXT: ${fieldName} = "${value}"`);
                        }
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
                        
                        // Check if it's in our current config
                        const isInConfig = currentCheckboxes.includes(fieldName);
                        console.log(`✅ CHECKED CHECKBOX: ${fieldName} ${isInConfig ? '(IN CONFIG)' : '❌ MISSING FROM CONFIG!'}`);
                    } else {
                        uncheckedCheckboxes.push(fieldName);
                    }
                } catch (error) {
                    uncheckedCheckboxes.push(fieldName);
                }
            }
        });
        
        console.log('\\n📊 COMPREHENSIVE ANALYSIS:');
        console.log('==========================');
        console.log(`Total Fields: ${fields.length}`);
        console.log(`Text Fields: ${textFields.length}`);
        console.log(`Checkboxes: ${checkboxFields.length}`);
        console.log(`Filled Text Fields: ${Object.keys(filledTextFields).length}`);
        console.log(`Empty Text Fields: ${emptyTextFields.length}`);
        console.log(`Checked Checkboxes: ${checkedCheckboxes.length}`);
        console.log(`Unchecked Checkboxes: ${uncheckedCheckboxes.length}`);
        
        console.log('\\n🚨 CRITICAL CHECKBOX ANALYSIS:');
        console.log('===============================');
        
        // Find missing checkboxes
        const missingCheckboxes = [];
        checkedCheckboxes.forEach(checkbox => {
            if (!currentCheckboxes.includes(checkbox)) {
                missingCheckboxes.push(checkbox);
            }
        });
        
        if (missingCheckboxes.length > 0) {
            console.log('❌ MISSING CHECKBOXES FROM CONFIG:');
            missingCheckboxes.forEach(checkbox => {
                console.log(`  🆕 ADD: "${checkbox}"`);
            });
        } else {
            console.log('✅ All template checkboxes are in our configuration!');
        }
        
        // Check for incorrect checkboxes in config
        const incorrectCheckboxes = [];
        currentCheckboxes.forEach(checkbox => {
            if (!checkedCheckboxes.includes(checkbox)) {
                incorrectCheckboxes.push(checkbox);
            }
        });
        
        if (incorrectCheckboxes.length > 0) {
            console.log('\\n⚠️  CHECKBOXES IN CONFIG BUT NOT IN TEMPLATE:');
            incorrectCheckboxes.forEach(checkbox => {
                console.log(`  ❌ REMOVE: "${checkbox}"`);
            });
        }
        
        console.log('\\n👤 NAME FIELD ANALYSIS:');
        console.log('========================');
        
        // Find all potential name fields
        const nameFields = [];
        const currentNameFields = [
            'Textfeld 24', 'Textfeld 97', 'Textfeld 153', 'Textfeld 196', 'Textfeld 215', 
            'Textfeld 234', 'Textfeld 256', 'Textfeld 272', 'Textfeld 347', 'Textfeld 364', 
            'Textfeld 394', 'Textfeld 421', 'Textfeld 634', 'Textfeld 635', 'Textfeld 748', 
            'Textfeld 1002', 'Textfeld 1230', 'Textfeld 1233'
        ];
        
        Object.entries(filledTextFields).forEach(([fieldName, value]) => {
            if (value.toLowerCase().includes('name') || 
                value.toLowerCase().includes('vorname') ||
                value.includes('Vorname Name') ||
                (value.includes('Name') && !value.includes('Straße') && !value.includes('Hausnummer'))) {
                nameFields.push(fieldName);
            }
        });
        
        console.log(`Found ${nameFields.length} potential name fields in template:`);
        nameFields.forEach(field => {
            const isInConfig = currentNameFields.includes(field);
            console.log(`  ${isInConfig ? '✅' : '🆕'} ${field} = "${filledTextFields[field]}" ${isInConfig ? '' : '(MISSING)'}`);
        });
        
        // Find missing name fields
        const missingNameFields = nameFields.filter(field => !currentNameFields.includes(field));
        
        if (missingNameFields.length > 0) {
            console.log('\\n🆕 MISSING NAME FIELDS TO ADD:');
            missingNameFields.forEach(field => {
                console.log(`  'name_field_extra_${field.replace(/[^0-9]/g, '')}': '${field}', // "${filledTextFields[field]}"`);
            });
        }
        
        console.log('\\n📝 UPDATED CHECKBOX CONFIGURATION:');
        console.log('===================================');
        
        if (missingCheckboxes.length > 0 || incorrectCheckboxes.length > 0) {
            console.log('// CORRECTED CHECKBOX CONFIGURATION');
            console.log('DEFAULT_CHECKBOXES_FOR_PFAENDBARES_EINKOMMEN: [');
            checkedCheckboxes.forEach(checkbox => {
                console.log(`    "${checkbox}",`);
            });
            console.log(']');
        } else {
            console.log('✅ Current checkbox configuration is correct!');
        }
        
        console.log('\\n📋 COMPLETE NAME FIELD MAPPINGS:');
        console.log('=================================');
        
        console.log('// ALL NAME FIELDS FOR DOCUMENT CONSISTENCY');
        nameFields.forEach((field, index) => {
            console.log(`'name_field_${index + 1}': '${field}', // "${filledTextFields[field]}"`);
        });
        
        console.log('\\n🔧 INTEGRATION ACTIONS REQUIRED:');
        console.log('==================================');
        
        if (missingCheckboxes.length > 0) {
            console.log(`1. ❌ ADD ${missingCheckboxes.length} missing checkboxes to configuration`);
        }
        
        if (incorrectCheckboxes.length > 0) {
            console.log(`2. ⚠️  REMOVE ${incorrectCheckboxes.length} incorrect checkboxes from configuration`);
        }
        
        if (missingNameFields.length > 0) {
            console.log(`3. 👤 ADD ${missingNameFields.length} missing name fields to mapping`);
        }
        
        if (missingCheckboxes.length === 0 && incorrectCheckboxes.length === 0 && missingNameFields.length === 0) {
            console.log('✅ NO ACTIONS REQUIRED - Configuration is complete!');
        }
        
        console.log('\\n📊 FINAL SUMMARY:');
        console.log('==================');
        console.log(`Template Checkboxes: ${checkedCheckboxes.length}`);
        console.log(`Config Checkboxes: ${currentCheckboxes.length}`);
        console.log(`Missing Checkboxes: ${missingCheckboxes.length}`);
        console.log(`Template Name Fields: ${nameFields.length}`);
        console.log(`Config Name Fields: ${currentNameFields.length}`);
        console.log(`Missing Name Fields: ${missingNameFields.length}`);
        
        return {
            totalFields: fields.length,
            checkedCheckboxes: checkedCheckboxes.length,
            missingCheckboxes,
            incorrectCheckboxes,
            nameFields,
            missingNameFields,
            allCheckedCheckboxes: checkedCheckboxes,
            allFilledTextFields: filledTextFields
        };
        
    } catch (error) {
        console.error('❌ Error in ultra deep analysis:', error);
        throw error;
    }
}

// Run the ultra deep analysis
performUltraDeepAnalysis()
    .then(results => {
        console.log('\\n🎉 ULTRA DEEP ANALYSIS COMPLETE!');
        console.log(`📊 Missing checkboxes: ${results.missingCheckboxes.length}`);
        console.log(`👤 Missing name fields: ${results.missingNameFields.length}`);
        process.exit(0);
    })
    .catch(error => {
        console.error('💥 Analysis failed:', error);
        process.exit(1);
    });