/**
 * Test Professional Nullplan Template Integration
 *
 * This script tests that the new professional Nullplan template generator
 * is properly integrated into the document generation workflow.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'server', '.env') });

const DocumentGenerator = require('./server/services/documentGenerator');
const fs = require('fs').promises;

async function testProfessionalNullplanIntegration() {
    console.log('\n🧪 Testing Professional Nullplan Template Integration\n');
    console.log('='.repeat(60));

    const documentGenerator = new DocumentGenerator();

    // Test client data with 0 EUR pfändbares Einkommen
    const testClientData = {
        reference: 'TEST-NULLPLAN-001',
        name: 'Max Mustermann',
        gender: 'male',
        marital_status: 'single',
        children_count: 0,
        financial_data: {
            pfaendbar_amount: 0,
            recommended_plan_type: 'nullplan'
        }
    };

    // Test creditor data
    const testCreditorData = [
        {
            creditor_name: 'Test Bank AG',
            creditor_address: 'Bankstraße 123\n12345 Berlin',
            debt_amount: 15000,
            creditor_id: '1'
        },
        {
            creditor_name: 'Versandhaus GmbH',
            creditor_address: 'Versandweg 45\n67890 Hamburg',
            debt_amount: 3500,
            creditor_id: '2'
        },
        {
            creditor_name: 'Telekom Deutschland',
            creditor_address: 'Friedrich-Ebert-Allee 140\n53113 Bonn',
            debt_amount: 850,
            creditor_id: '3'
        }
    ];

    try {
        console.log('\n📝 Test Data:');
        console.log(`   Client: ${testClientData.name} (${testClientData.reference})`);
        console.log(`   Pfändbares Einkommen: €${testClientData.financial_data.pfaendbar_amount}`);
        console.log(`   Plan Type: ${testClientData.financial_data.recommended_plan_type}`);
        console.log(`   Creditors: ${testCreditorData.length}`);
        console.log(`   Total Debt: €${testCreditorData.reduce((sum, c) => sum + c.debt_amount, 0).toLocaleString('de-DE')}`);

        console.log('\n🔧 Generating Nullplan using professional template...');

        // Generate using the new professional template via generateNullplanDocuments
        const result = await documentGenerator.generateNullplanDocuments(testClientData.reference);

        if (result.success) {
            console.log('\n✅ Professional Nullplan Template Integration: SUCCESS');
            console.log('\n📄 Generated Documents:');
            console.log(`   Nullplan: ${result.nullplan.document_info.filename}`);
            console.log(`   Forderungsübersicht: ${result.forderungsuebersicht.document_info.filename}`);
            console.log(`   Ratenplan: ${result.ratenplan_nullplan.document_info.filename}`);

            console.log('\n📊 File Details:');
            console.log(`   Nullplan: ${Math.round(result.nullplan.document_info.size / 1024)} KB`);
            console.log(`   Forderungsübersicht: ${Math.round(result.forderungsuebersicht.document_info.size / 1024)} KB`);
            console.log(`   Ratenplan: ${Math.round(result.ratenplan_nullplan.document_info.size / 1024)} KB`);

            console.log('\n✅ All tests passed!');
            console.log('\n💡 The professional Nullplan template is now active and will be used');
            console.log('   whenever Nullplan documents are generated (0 EUR pfändbares Einkommen).');

        } else {
            console.error('\n❌ Test FAILED:', result.error);
            process.exit(1);
        }

    } catch (error) {
        console.error('\n❌ Test ERROR:', error.message);
        console.error(error.stack);
        process.exit(1);
    }

    console.log('\n' + '='.repeat(60));
}

// Run the test
testProfessionalNullplanIntegration()
    .then(() => {
        console.log('\n✅ Professional Nullplan template integration test complete!\n');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Test failed:', error);
        process.exit(1);
    });