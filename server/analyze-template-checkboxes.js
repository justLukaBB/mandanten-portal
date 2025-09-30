const { PDFDocument, PDFName } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');

async function analyzeTemplatePDF() {
    console.log('=== PDF Template Analysis ===\n');
    
    try {
        // Read the template PDF
        const templatePath = '/Users/luka/Documents/Development/Mandanten-Portal/pdf-form-test/template-with-checkboxes.pdf';
        const pdfBytes = await fs.readFile(templatePath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const form = pdfDoc.getForm();
        
        // Get all form fields
        const fields = form.getFields();
        
        // Separate checkboxes and text fields
        const checkboxes = [];
        const textFields = [];
        const checkedCheckboxes = [];
        
        console.log(`Total fields found: ${fields.length}\n`);
        
        // Analyze each field
        for (const field of fields) {
            const fieldName = field.getName();
            const fieldType = field.constructor.name;
            
            if (fieldType === 'PDFCheckBox') {
                const isChecked = field.isChecked();
                checkboxes.push({
                    name: fieldName,
                    checked: isChecked,
                    type: 'checkbox'
                });
                
                if (isChecked) {
                    checkedCheckboxes.push(fieldName);
                }
            } else if (fieldType === 'PDFTextField') {
                const value = field.getText() || '';
                textFields.push({
                    name: fieldName,
                    value: value,
                    type: 'text'
                });
            }
        }
        
        // Sort for better readability
        checkboxes.sort((a, b) => a.name.localeCompare(b.name));
        textFields.sort((a, b) => a.name.localeCompare(b.name));
        checkedCheckboxes.sort();
        
        // Output analysis results
        console.log('=== CHECKBOX ANALYSIS ===');
        console.log(`Total checkboxes: ${checkboxes.length}`);
        console.log(`Checked checkboxes: ${checkedCheckboxes.length}\n`);
        
        console.log('Currently CHECKED checkboxes (default checkboxes):');
        checkedCheckboxes.forEach(name => console.log(`  ✓ ${name}`));
        
        console.log('\n\nAll checkboxes with states:');
        checkboxes.forEach(cb => {
            console.log(`  ${cb.checked ? '✓' : '☐'} ${cb.name}`);
        });
        
        console.log('\n\n=== TEXT FIELD ANALYSIS ===');
        console.log(`Total text fields: ${textFields.length}\n`);
        
        console.log('Text fields with values:');
        textFields.forEach(tf => {
            const displayValue = tf.value ? `"${tf.value}"` : '(empty)';
            console.log(`  ${tf.name}: ${displayValue}`);
        });
        
        // Generate JavaScript configuration
        console.log('\n\n=== GENERATED CONFIGURATION ===\n');
        
        const config = {
            // Default checkboxes for clients with pfändbares Einkommen
            defaultCheckboxesForPfaendbaresEinkommen: checkedCheckboxes,
            
            // All checkbox mappings
            checkboxMappings: {
                // Currently checked checkboxes
                alwaysChecked: checkedCheckboxes,
                
                // Conditional checkboxes (to be filled based on client data)
                conditional: {
                    // Example structure - to be customized based on business logic
                    noAttachableIncome: [],
                    withAttachableIncome: checkedCheckboxes,
                    selfEmployed: [],
                    employed: []
                }
            },
            
            // Text field mappings
            textFieldMappings: textFields.reduce((acc, field) => {
                acc[field.name] = {
                    fieldName: field.name,
                    defaultValue: field.value || '',
                    // Add mapping logic here
                    mapFrom: null // e.g., 'client.firstName', 'client.address', etc.
                };
                return acc;
            }, {}),
            
            // Helper function to apply checkbox configuration
            applyCheckboxConfig: function(form, clientData) {
                // Apply default checkboxes
                this.checkboxMappings.alwaysChecked.forEach(fieldName => {
                    try {
                        const checkbox = form.getCheckBox(fieldName);
                        checkbox.check();
                    } catch (error) {
                        console.error(`Failed to check checkbox ${fieldName}:`, error.message);
                    }
                });
                
                // Apply conditional checkboxes based on client data
                if (clientData.hasPfaendbaresEinkommen) {
                    this.checkboxMappings.conditional.withAttachableIncome.forEach(fieldName => {
                        try {
                            const checkbox = form.getCheckBox(fieldName);
                            checkbox.check();
                        } catch (error) {
                            console.error(`Failed to check conditional checkbox ${fieldName}:`, error.message);
                        }
                    });
                }
            }
        };
        
        // Save configuration to file
        const configPath = path.join(__dirname, 'pdf-checkbox-config.js');
        const configContent = `// Auto-generated PDF checkbox configuration
// Generated from: ${templatePath}
// Generated on: ${new Date().toISOString()}

module.exports = ${JSON.stringify(config, null, 2).replace(/"applyCheckboxConfig":\s*"[^"]+"/g, (match) => {
    return '"applyCheckboxConfig": ' + config.applyCheckboxConfig.toString();
})};
`;
        
        await fs.writeFile(configPath, configContent);
        console.log(`\nConfiguration saved to: ${configPath}`);
        
        // Generate integration code for quick-field-mapper.js
        console.log('\n\n=== INTEGRATION CODE FOR quick-field-mapper.js ===\n');
        
        const integrationCode = `
// Import the checkbox configuration
const checkboxConfig = require('./pdf-checkbox-config');

// In your fillInsolvenzantrag function, add:

// Apply default checkboxes for clients with pfändbares Einkommen
if (userData.hasPfaendbaresEinkommen || userData.attachableIncome) {
    checkboxConfig.defaultCheckboxesForPfaendbaresEinkommen.forEach(fieldName => {
        try {
            const checkbox = form.getCheckBox(fieldName);
            checkbox.check();
            console.log(\`✓ Checked: \${fieldName}\`);
        } catch (error) {
            console.error(\`Failed to check \${fieldName}:\`, error.message);
        }
    });
}

// Or use the helper function:
checkboxConfig.applyCheckboxConfig(form, userData);
`;
        
        console.log(integrationCode);
        
        // Return summary
        return {
            totalFields: fields.length,
            checkboxes: checkboxes.length,
            textFields: textFields.length,
            checkedByDefault: checkedCheckboxes.length,
            defaultCheckboxes: checkedCheckboxes,
            configPath: configPath
        };
        
    } catch (error) {
        console.error('Error analyzing PDF:', error);
        throw error;
    }
}

// Run the analysis
if (require.main === module) {
    analyzeTemplatePDF()
        .then(summary => {
            console.log('\n\n=== SUMMARY ===');
            console.log(JSON.stringify(summary, null, 2));
        })
        .catch(error => {
            console.error('Analysis failed:', error);
            process.exit(1);
        });
}

module.exports = analyzeTemplatePDF;