const RobustNullplanProcessor = require('./services/robustNullplanProcessor');
const path = require('path');

/**
 * Test script to verify that the Nullplan fix generates unique filenames
 * for creditors with the same name but different reference numbers
 */

async function testNullplanDuplicateFix() {
    console.log('🧪 Testing Nullplan duplicate creditor fix...\n');
    
    // Mock client data
    const clientData = {
        reference: '1010101',
        aktenzeichen: '1010101',
        fullName: 'Test Client',
        firstName: 'Test',
        lastName: 'Client',
        birthDate: '01.01.1990',
        financial_data: {
            monthly_net_income: 1500,
            marital_status: 'ledig'
        }
    };
    
    // Mock creditors - same name and reference but different amounts
    const creditors = [
        {
            id: 1,
            name: 'EOS Deutscher Inkasso-Dienst GmbH',
            creditor_name: 'EOS Deutscher Inkasso-Dienst GmbH',
            sender_name: 'EOS Deutscher Inkasso-Dienst GmbH',
            sender_address: 'Steindamm 71, 20099 Hamburg',
            reference_number: 'REF123456',
            creditor_reference: 'REF123456',
            debt_amount: 795.56,
            amount: 795.56
        },
        {
            id: 2,
            name: 'EOS Deutscher Inkasso-Dienst GmbH',
            creditor_name: 'EOS Deutscher Inkasso-Dienst GmbH', 
            sender_name: 'EOS Deutscher Inkasso-Dienst GmbH',
            sender_address: 'Steindamm 71, 20099 Hamburg',
            reference_number: 'REF123456', // Same reference as first creditor
            creditor_reference: 'REF123456',
            debt_amount: 792.06,
            amount: 792.06
        }
    ];
    
    try {
        const processor = new RobustNullplanProcessor();
        
        console.log('📋 Test scenario:');
        console.log(`   Client: ${clientData.fullName} (${clientData.reference})`);
        console.log(`   Creditor 1: ${creditors[0].name} - ${creditors[0].reference_number} - €${creditors[0].amount}`);
        console.log(`   Creditor 2: ${creditors[1].name} - ${creditors[1].reference_number} - €${creditors[1].amount}`);
        console.log('');
        
        // Generate Nullplan letters
        const result = await processor.generateNullplanLettersForAllCreditors(clientData, creditors);
        
        if (result.success && result.documents.length === 2) {
            console.log('✅ SUCCESS: Generated documents for both creditors');
            console.log('');
            
            // Check filenames are unique
            const filenames = result.documents.map(doc => doc.filename);
            console.log('📁 Generated filenames:');
            filenames.forEach((filename, index) => {
                console.log(`   ${index + 1}. ${filename}`);
            });
            console.log('');
            
            // Verify uniqueness
            const uniqueFilenames = new Set(filenames);
            if (uniqueFilenames.size === filenames.length) {
                console.log('✅ SUCCESS: All filenames are unique!');
                console.log('🎯 Fix confirmed: Same creditor name with same reference generates unique documents based on position/amount');
            } else {
                console.log('❌ FAILURE: Duplicate filenames detected!');
                console.log('   This indicates the fix did not work properly.');
                return false;
            }
            
            // Check that both files were actually created
            const fs = require('fs');
            let filesExist = true;
            
            result.documents.forEach((doc, index) => {
                if (fs.existsSync(doc.path)) {
                    console.log(`✅ File ${index + 1} exists: ${doc.filename} (${Math.round(doc.size / 1024)} KB)`);
                } else {
                    console.log(`❌ File ${index + 1} missing: ${doc.filename}`);
                    filesExist = false;
                }
            });
            
            if (filesExist) {
                console.log('\n🎉 ALL TESTS PASSED: Nullplan duplicate fix working correctly!');
                return true;
            } else {
                console.log('\n❌ SOME FILES MISSING: Check file generation process');
                return false;
            }
            
        } else {
            console.log('❌ FAILURE: Expected 2 documents, got:', result.documents?.length || 0);
            console.log('Error:', result.error || 'Unknown error');
            return false;
        }
        
    } catch (error) {
        console.error('❌ TEST FAILED with error:', error.message);
        return false;
    }
}

// Run the test
if (require.main === module) {
    testNullplanDuplicateFix()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Unhandled error:', error);
            process.exit(1);
        });
}

module.exports = { testNullplanDuplicateFix };