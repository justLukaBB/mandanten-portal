const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const CHECKBOX_CONFIG = require('./insolvenzantrag-checkbox-config');

async function testCheckboxIntegration() {
    console.log('🧪 Testing Checkbox Integration with Template PDF...\n');
    
    try {
        // Load the template PDF
        const templatePath = '/Users/luka/Documents/Development/Mandanten-Portal/server/pdf-form-test/template-with-checkboxes.pdf';
        const pdfBytes = await fs.readFile(templatePath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const form = pdfDoc.getForm();
        
        console.log('✅ Template PDF loaded successfully');
        
        // Test 1: Verify all default checkboxes exist in the PDF
        console.log('\n🔍 Test 1: Verifying checkbox existence...');
        let existingCheckboxes = 0;
        let missingCheckboxes = [];
        
        CHECKBOX_CONFIG.DEFAULT_CHECKBOXES_FOR_PFAENDBARES_EINKOMMEN.forEach(checkboxName => {
            try {
                const checkbox = form.getCheckBox(checkboxName);
                console.log(`   ✅ Found: ${checkboxName} (currently ${checkbox.isChecked() ? 'checked' : 'unchecked'})`);
                existingCheckboxes++;
            } catch (error) {
                console.log(`   ❌ Missing: ${checkboxName}`);
                missingCheckboxes.push(checkboxName);
            }
        });
        
        console.log(`\n📊 Checkbox Existence Test: ${existingCheckboxes}/${CHECKBOX_CONFIG.DEFAULT_CHECKBOXES_FOR_PFAENDBARES_EINKOMMEN.length} found`);
        
        // Test 2: Apply the checkbox configuration
        console.log('\n🔲 Test 2: Applying checkbox configuration...');
        const mockClientData = { hasPfaendbaresEinkommen: true };
        const result = CHECKBOX_CONFIG.applyDefaultCheckboxes(form);
        
        // Test 3: Verify checkboxes were applied correctly
        console.log('\n🔍 Test 3: Verifying checkbox states after application...');
        let correctlyApplied = 0;
        
        CHECKBOX_CONFIG.DEFAULT_CHECKBOXES_FOR_PFAENDBARES_EINKOMMEN.forEach(checkboxName => {
            try {
                const checkbox = form.getCheckBox(checkboxName);
                if (checkbox.isChecked()) {
                    console.log(`   ✅ Correctly checked: ${checkboxName}`);
                    correctlyApplied++;
                } else {
                    console.log(`   ❌ Not checked: ${checkboxName}`);
                }
            } catch (error) {
                console.log(`   ❌ Error checking: ${checkboxName}`);
            }
        });
        
        // Test 4: Sample text field verification
        console.log('\n📝 Test 4: Verifying sample text fields...');
        let validTextFields = 0;
        
        Object.entries(CHECKBOX_CONFIG.SAMPLE_TEXT_FIELDS).forEach(([fieldName, expectedValue]) => {
            try {
                const textField = form.getTextField(fieldName);
                const actualValue = textField.getText() || '';
                
                if (actualValue === expectedValue) {
                    console.log(`   ✅ ${fieldName}: "${actualValue}" (matches expected)`);
                    validTextFields++;
                } else {
                    console.log(`   ⚠️  ${fieldName}: "${actualValue}" (expected: "${expectedValue}")`);
                }
            } catch (error) {
                console.log(`   ❌ Missing text field: ${fieldName}`);
            }
        });
        
        // Save test result PDF
        const testOutputPath = '/Users/luka/Documents/Development/Mandanten-Portal/server/TEST-CHECKBOX-INTEGRATION.pdf';
        const pdfBytesModified = await pdfDoc.save();
        await fs.writeFile(testOutputPath, pdfBytesModified);
        console.log(`\n💾 Test result saved to: ${testOutputPath}`);
        
        // Summary
        console.log('\n=== TEST SUMMARY ===');
        console.log(`📋 Checkboxes found: ${existingCheckboxes}/${CHECKBOX_CONFIG.DEFAULT_CHECKBOXES_FOR_PFAENDBARES_EINKOMMEN.length}`);
        console.log(`✅ Checkboxes applied: ${result.applied}`);
        console.log(`❌ Application errors: ${result.errors}`);
        console.log(`📝 Valid text fields: ${validTextFields}/${Object.keys(CHECKBOX_CONFIG.SAMPLE_TEXT_FIELDS).length}`);
        
        const overallSuccess = missingCheckboxes.length === 0 && result.errors === 0;
        console.log(`\n🎯 Overall integration test: ${overallSuccess ? '✅ PASSED' : '❌ NEEDS REVIEW'}`);
        
        if (missingCheckboxes.length > 0) {
            console.log('\n⚠️  Missing checkboxes to review:');
            missingCheckboxes.forEach(name => console.log(`   - ${name}`));
        }
        
        // Generate usage recommendations
        console.log('\n📋 USAGE RECOMMENDATIONS:');
        
        if (overallSuccess) {
            console.log('✅ Integration is ready to use in production');
            console.log('   - Add the checkbox config import to your quick-field-mapper.js');
            console.log('   - Use CHECKBOX_CONFIG.applyDefaultCheckboxes(form) for clients with pfändbares Einkommen');
            console.log('   - The 10 default checkboxes will be automatically applied');
        } else {
            console.log('⚠️  Integration needs adjustments:');
            if (missingCheckboxes.length > 0) {
                console.log('   - Some checkboxes from the template analysis are not found in the current PDF');
                console.log('   - Review the field names or update the configuration');
            }
            if (result.errors > 0) {
                console.log('   - Some checkbox application errors occurred');
                console.log('   - Check the error details above');
            }
        }
        
        return overallSuccess;
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        return false;
    }
}

// Run the test
if (require.main === module) {
    testCheckboxIntegration()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Test execution failed:', error);
            process.exit(1);
        });
}

module.exports = testCheckboxIntegration;