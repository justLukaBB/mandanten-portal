const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

async function performExhaustiveAnalysis() {
    try {
        console.log('🔍 EXHAUSTIVE ANALYSIS: Finding EVERY Missing Field');
        console.log('=====================================================');
        
        const pdfPath = '/Users/luka/Downloads/dqw.pdf';
        const existingPdfBytes = fs.readFileSync(pdfPath);
        
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const form = pdfDoc.getForm();
        
        // Get all form fields
        const fields = form.getFields();
        console.log(`📊 TOTAL FORM FIELDS: ${fields.length}`);
        
        // Track ALL filled fields and checkboxes
        const filledTextFields = {};
        const checkedCheckboxes = [];
        const allTextFields = [];
        const allCheckboxFields = [];
        
        // Current configuration for comparison - COMPLETE LIST
        const currentlyFilledFields = [
            'Textfeld 1', 'Textfeld 2', 'Textfeld 3', 'Textfeld 16', 'Textfeld 22', 'Textfeld 24',
            'Textfeld 25', 'Textfeld 27', 'Textfeld 32', 'Textfeld 33', 'Textfeld 34', 'Textfeld 35',
            'Textfeld 39', 'Textfeld 69', 'Textfeld 70', 'Textfeld 80', 'Textfeld 82', 'Textfeld 83',
            'Textfeld 84', 'Textfeld 85', 'Textfeld 86', 'Textfeld 87', 'Textfeld 88', 'Textfeld 89',
            'Textfeld 90', 'Textfeld 97', 'Textfeld 153', 'Textfeld 196', 'Textfeld 215', 'Textfeld 234',
            'Textfeld 256', 'Textfeld 272', 'Textfeld 347', 'Textfeld 364', 'Textfeld 394', 'Textfeld 421',
            'Textfeld 634', 'Textfeld 635', 'Textfeld 636', 'Textfeld 637', 'Textfeld 642', 'Textfeld 748',
            'Textfeld 1002', 'Textfeld 1230', 'Textfeld 1231', 'Textfeld 1233', 'Textfeld 1234'
        ];
        
        const currentCheckboxes = [
            'Kontrollkästchen 1', 'Kontrollkästchen 2', 'Kontrollkästchen 15', 'Kontrollkästchen 17',
            'Kontrollkästchen 21', 'Kontrollkästchen 25', 'Kontrollkästchen 26', 'Kontrollkästchen 27',
            'Kontrollkästchen 32a', 'Kontrollkästchen 36', 'Kontrollkästchen 333'
        ];
        
        console.log('\\n🔍 ANALYZING EVERY SINGLE FIELD...\\n');
        
        // First pass - analyze all fields
        fields.forEach((field, index) => {
            const fieldName = field.getName();
            const fieldType = field.constructor.name;
            
            if (fieldType === 'PDFTextField') {
                allTextFields.push(fieldName);
                
                try {
                    const value = field.getText();
                    if (value && value.trim() !== '') {
                        filledTextFields[fieldName] = value.trim();
                    }
                } catch (error) {
                    // Field might be empty or not readable
                }
                
            } else if (fieldType === 'PDFCheckBox') {
                allCheckboxFields.push(fieldName);
                
                try {
                    if (field.isChecked()) {
                        checkedCheckboxes.push(fieldName);
                    }
                } catch (error) {
                    // Some checkboxes might not support isChecked()
                }
            }
        });
        
        console.log('📊 FIELD INVENTORY:');
        console.log('==================');
        console.log(`Total Fields: ${fields.length}`);
        console.log(`Total Text Fields: ${allTextFields.length}`);
        console.log(`Total Checkboxes: ${allCheckboxFields.length}`);
        console.log(`Filled Text Fields: ${Object.keys(filledTextFields).length}`);
        console.log(`Checked Checkboxes: ${checkedCheckboxes.length}`);
        console.log(`Currently Mapped Fields: ${currentlyFilledFields.length}`);
        console.log(`Currently Configured Checkboxes: ${currentCheckboxes.length}`);
        
        console.log('\\n🚨 CRITICAL MISSING FIELDS ANALYSIS:');
        console.log('====================================');
        
        // Find EVERY missing text field that has content
        const missingTextFields = [];
        Object.entries(filledTextFields).forEach(([fieldName, value]) => {
            if (!currentlyFilledFields.includes(fieldName)) {
                missingTextFields.push({ field: fieldName, value: value });
            }
        });
        
        console.log(`❌ MISSING TEXT FIELDS: ${missingTextFields.length}`);
        if (missingTextFields.length > 0) {
            console.log('\\nALL MISSING TEXT FIELDS:');
            missingTextFields.forEach((item, index) => {
                console.log(`${index + 1}. ❌ ${item.field} = "${item.value}"`);
            });
        }
        
        // Find missing checkboxes
        const missingCheckboxes = [];
        checkedCheckboxes.forEach(checkbox => {
            if (!currentCheckboxes.includes(checkbox)) {
                missingCheckboxes.push(checkbox);
            }
        });
        
        console.log(`\\n❌ MISSING CHECKBOXES: ${missingCheckboxes.length}`);
        if (missingCheckboxes.length > 0) {
            console.log('\\nALL MISSING CHECKBOXES:');
            missingCheckboxes.forEach((checkbox, index) => {
                console.log(`${index + 1}. ❌ ${checkbox}`);
            });
        }
        
        // Find incorrect checkboxes (in config but not in template)
        const incorrectCheckboxes = [];
        currentCheckboxes.forEach(checkbox => {
            if (!checkedCheckboxes.includes(checkbox)) {
                incorrectCheckboxes.push(checkbox);
            }
        });
        
        if (incorrectCheckboxes.length > 0) {
            console.log(`\\n⚠️ INCORRECT CHECKBOXES IN CONFIG: ${incorrectCheckboxes.length}`);
            incorrectCheckboxes.forEach((checkbox, index) => {
                console.log(`${index + 1}. ⚠️ ${checkbox} (NOT IN TEMPLATE)`);
            });
        }
        
        console.log('\\n📝 COMPLETE FIELD ANALYSIS BY CATEGORY:');
        console.log('========================================');
        
        // Categorize missing fields
        const categories = {
            names: [],
            addresses: [],
            dates: [],
            personal: [],
            legal: [],
            financial: [],
            other: []
        };
        
        missingTextFields.forEach(item => {
            const value = item.value.toLowerCase();
            const field = item.field;
            
            if (value.includes('name') || value.includes('vorname')) {
                categories.names.push(item);
            } else if (value.includes('straße') || value.includes('hausnummer') || value.includes('ort') || value.includes('plz')) {
                categories.addresses.push(item);
            } else if (value.includes('datum') || value.includes('date')) {
                categories.dates.push(item);
            } else if (value.includes('geburt') || value.includes('beruf') || value.includes('tätig') || value.includes('telefon') || value.includes('email')) {
                categories.personal.push(item);
            } else if (value.includes('anwalt') || value.includes('rechts') || value.includes('gericht')) {
                categories.legal.push(item);
            } else if (value.includes('gläubiger') || value.includes('summe') || value.includes('anzahl') || value.includes('schulden')) {
                categories.financial.push(item);
            } else {
                categories.other.push(item);
            }
        });
        
        Object.entries(categories).forEach(([category, items]) => {
            if (items.length > 0) {
                console.log(`\\n📂 ${category.toUpperCase()} FIELDS (${items.length}):`);
                items.forEach((item, index) => {
                    console.log(`  ${index + 1}. ${item.field} = "${item.value}"`);
                });
            }
        });
        
        console.log('\\n🔧 COMPLETE INTEGRATION CODE:');
        console.log('===============================');
        
        if (missingTextFields.length > 0) {
            console.log('\\n📝 ADD TO FIELD MAPPING:');
            console.log('// MISSING FIELDS - ADD TO getUpdatedFieldMapping()');
            missingTextFields.forEach(item => {
                const safeName = item.field.toLowerCase().replace(/[^a-z0-9]/g, '_');
                console.log(`'${safeName}': '${item.field}', // "${item.value}"`);
            });
        }
        
        if (missingCheckboxes.length > 0) {
            console.log('\\n☑️ CORRECTED CHECKBOX CONFIGURATION:');
            console.log('// COMPLETE CHECKBOX CONFIGURATION');
            console.log('DEFAULT_CHECKBOXES_FOR_PFAENDBARES_EINKOMMEN: [');
            checkedCheckboxes.forEach(checkbox => {
                console.log(`    "${checkbox}",`);
            });
            console.log(']');
        }
        
        if (missingTextFields.length > 0) {
            console.log('\\n💾 ADD TO DATA PREPARATION:');
            console.log('// MISSING FIELD DATA - ADD TO fillWithRealFields()');
            missingTextFields.forEach(item => {
                const safeName = item.field.toLowerCase().replace(/[^a-z0-9]/g, '_');
                const value = item.value;
                
                let suggestion = '';
                if (value.includes('Name') && value.includes('Vorname')) {
                    suggestion = 'fullName';
                } else if (value.includes('Datum')) {
                    suggestion = 'currentDate';
                } else if (value.includes('Telefon')) {
                    suggestion = 'formData.telefon || ""';
                } else if (value.includes('Email')) {
                    suggestion = 'formData.email || ""';
                } else if (value.includes('Beruf')) {
                    suggestion = 'formData.beruf || ""';
                } else if (value.includes('Geburt')) {
                    suggestion = 'formData.geburtsdatum || ""';
                } else if (value.includes('Ort')) {
                    suggestion = 'formData.ort || ""';
                } else if (value.includes('Straße')) {
                    suggestion = 'formData.strasse || ""';
                } else if (value.includes('Anzahl')) {
                    suggestion = 'String(formData.anzahl || 0)';
                } else if (value.includes('Summe')) {
                    suggestion = 'String(formData.summe || 0)';
                } else {
                    suggestion = `"${value}" // Template value - needs mapping`;
                }
                
                console.log(`completeData.${safeName} = ${suggestion}; // ${item.field}`);
            });
        }
        
        console.log('\\n📊 EXHAUSTIVE SUMMARY:');
        console.log('=======================');
        console.log(`Total Template Fields: ${Object.keys(filledTextFields).length}`);
        console.log(`Currently Mapped: ${currentlyFilledFields.length}`);
        console.log(`Missing Text Fields: ${missingTextFields.length}`);
        console.log(`Template Checkboxes: ${checkedCheckboxes.length}`);
        console.log(`Currently Configured: ${currentCheckboxes.length}`);
        console.log(`Missing Checkboxes: ${missingCheckboxes.length}`);
        console.log(`Incorrect Checkboxes: ${incorrectCheckboxes.length}`);
        
        const completionPercentage = ((currentlyFilledFields.length / Object.keys(filledTextFields).length) * 100).toFixed(1);
        console.log(`\\n📈 COMPLETION RATE: ${completionPercentage}%`);
        
        if (missingTextFields.length === 0 && missingCheckboxes.length === 0) {
            console.log('\\n🎉 PERFECT COMPLETION - NO MISSING FIELDS!');
        } else {
            console.log(`\\n🔧 ACTION REQUIRED:`);
            console.log(`  - Add ${missingTextFields.length} missing text fields`);
            console.log(`  - Add ${missingCheckboxes.length} missing checkboxes`);
            if (incorrectCheckboxes.length > 0) {
                console.log(`  - Remove ${incorrectCheckboxes.length} incorrect checkboxes`);
            }
        }
        
        // Generate page-by-page analysis
        console.log('\\n📄 TEMPLATE FIELD DISTRIBUTION:');
        console.log('=================================');
        console.log('ALL FILLED TEXT FIELDS IN TEMPLATE:');
        Object.entries(filledTextFields).forEach(([field, value], index) => {
            const status = currentlyFilledFields.includes(field) ? '✅' : '❌';
            console.log(`${index + 1}. ${status} ${field} = "${value}"`);
        });
        
        console.log('\\nALL CHECKED CHECKBOXES IN TEMPLATE:');
        checkedCheckboxes.forEach((checkbox, index) => {
            const status = currentCheckboxes.includes(checkbox) ? '✅' : '❌';
            console.log(`${index + 1}. ${status} ${checkbox}`);
        });
        
        return {
            totalFields: fields.length,
            filledTextFields: Object.keys(filledTextFields).length,
            checkedCheckboxes: checkedCheckboxes.length,
            currentlyMapped: currentlyFilledFields.length,
            currentCheckboxes: currentCheckboxes.length,
            missingTextFields,
            missingCheckboxes,
            incorrectCheckboxes,
            completionPercentage: parseFloat(completionPercentage),
            allFilledFields: filledTextFields,
            allCheckedCheckboxes: checkedCheckboxes
        };
        
    } catch (error) {
        console.error('❌ Error in exhaustive analysis:', error);
        throw error;
    }
}

// Run the exhaustive analysis
performExhaustiveAnalysis()
    .then(results => {
        console.log('\\n🎯 EXHAUSTIVE ANALYSIS COMPLETE!');
        console.log(`📊 Completion: ${results.completionPercentage}%`);
        console.log(`❌ Missing text fields: ${results.missingTextFields.length}`);
        console.log(`❌ Missing checkboxes: ${results.missingCheckboxes.length}`);
        
        if (results.missingTextFields.length === 0 && results.missingCheckboxes.length === 0) {
            console.log('\\n🏆 PERFECT - All fields are mapped!');
        } else {
            console.log('\\n🔧 Integration work required');
        }
        
        process.exit(0);
    })
    .catch(error => {
        console.error('💥 Exhaustive analysis failed:', error);
        process.exit(1);
    });