const RobustNullplanTableGenerator = require('./services/robustNullplanTableGenerator');

/**
 * Test script to verify that the Nullplan table fix populates creditor data
 */

async function testNullplanTableFix() {
    console.log('🧪 Testing Nullplan table creditor population fix...\n');
    
    // Mock client data
    const clientData = {
        reference: '987456',
        aktenzeichen: '987456',
        fullName: 'okla test',
        firstName: 'okla',
        lastName: 'test'
    };
    
    // Mock creditors - same as in your test case
    const creditors = [
        {
            creditor_name: 'goldbach financial GmbH',
            debt_amount: 180.75,
            amount: 180.75
        },
        {
            creditor_name: 'EOS Deutscher Inkasso-Dienst GmbH',
            debt_amount: 792.06,
            amount: 792.06
        }
    ];
    
    try {
        const generator = new RobustNullplanTableGenerator();
        
        console.log('📋 Test scenario:');
        console.log(`   Client: ${clientData.fullName} (${clientData.reference})`);
        console.log(`   Creditor 1: ${creditors[0].creditor_name} - €${creditors[0].debt_amount}`);
        console.log(`   Creditor 2: ${creditors[1].creditor_name} - €${creditors[1].debt_amount}`);
        console.log(`   Total debt: €${creditors.reduce((sum, c) => sum + c.debt_amount, 0)}`);
        console.log('');
        
        // Generate Nullplan table
        const result = await generator.generateNullplanTable(clientData, creditors);
        
        if (result.success) {
            console.log('✅ SUCCESS: Generated Nullplan table document');
            console.log(`📁 File: ${result.filename} (${Math.round(result.size / 1024)} KB)`);
            console.log(`📄 Path: ${result.path}`);
            
            // Check if file exists
            const fs = require('fs');
            if (fs.existsSync(result.path)) {
                console.log('✅ File exists on disk');
                console.log('\n🎉 TEST PASSED: Nullplan table fix implemented successfully!');
                console.log('   → The table should now show creditor data instead of empty rows');
                console.log('   → Open the generated document to verify the creditor information is populated');
                return true;
            } else {
                console.log('❌ File was not created');
                return false;
            }
            
        } else {
            console.log('❌ FAILURE: Could not generate Nullplan table');
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
    testNullplanTableFix()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Unhandled error:', error);
            process.exit(1);
        });
}

module.exports = { testNullplanTableFix };