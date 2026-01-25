const DocumentGenerator = require('./services/documentGenerator');

async function testMultiCreditorGeneration() {
    console.log('🧪 Testing Multi-Creditor Document Generation...\n');

    const documentGenerator = new DocumentGenerator();

    // Test data for a client with 2 creditors
    const testClientData = {
        reference: 'MULTI-TEST-001',
        firstName: 'Test',
        lastName: 'Kunde',
        aktenzeichen: 'MULTI-TEST-001',
        financial_data: {
            monthly_net_income: 3000,
            number_of_children: 2,
            marital_status: 'married'
        },
        geburtstag: '15.05.1980'
    };

    const testSettlementData = {
        total_debt: 50000,
        creditor_payments: [
            {
                creditor_name: 'Erste Bank AG',
                debt_amount: 25000,
                creditor_address: 'Bankstraße 1, 10115 Berlin',
                reference_number: 'BANK-001-2025'
            },
            {
                creditor_name: 'Zweite Sparkasse',
                debt_amount: 25000,
                creditor_address: 'Sparkassenplatz 2, 20095 Hamburg',
                reference_number: 'SPARK-002-2025'
            }
        ]
    };

    const pfaendbarAmount = 800; // Example amount

    try {
        console.log('📊 Test Input:');
        console.log(`   Client: ${testClientData.firstName} ${testClientData.lastName}`);
        console.log(`   Reference: ${testClientData.reference}`);
        console.log(`   Total Debt: ${testSettlementData.total_debt} EUR`);
        console.log(`   Creditors: ${testSettlementData.creditor_payments.length}`);
        testSettlementData.creditor_payments.forEach((creditor, index) => {
            console.log(`     ${index + 1}. ${creditor.creditor_name} - ${creditor.debt_amount} EUR`);
        });
        console.log(`   Pfändbarer Betrag: ${pfaendbarAmount} EUR\n`);

        console.log('🎯 Calling generateRatenplanDocument...\n');

        const result = await documentGenerator.generateRatenplanDocument(
            testClientData,
            testSettlementData,
            pfaendbarAmount
        );

        console.log('\n📋 RESULT SUMMARY:');
        console.log(`✅ Success: ${result.success}`);
        console.log(`📄 Documents Generated: ${result.totalDocuments || result.documents?.length || 0}`);
        console.log(`❌ Errors: ${result.errors?.length || 0}`);

        if (result.success && result.documents && result.documents.length > 0) {
            console.log('\n📁 Generated Documents:');
            result.documents.forEach((doc, index) => {
                console.log(`   ${index + 1}. ${doc.filename}`);
                console.log(`      Creditor: ${doc.creditor_name || 'Unknown'}`);
                console.log(`      Size: ${Math.round(doc.size / 1024)} KB`);
            });
        }

        if (result.errors && result.errors.length > 0) {
            console.log('\n❌ Errors:');
            result.errors.forEach((error, index) => {
                console.log(`   ${index + 1}. ${error}`);
            });
        }

        // Final verification
        console.log('\n🔍 VERIFICATION:');
        const expectedDocuments = testSettlementData.creditor_payments.length;
        const actualDocuments = result.totalDocuments || result.documents?.length || 0;
        
        if (actualDocuments === expectedDocuments) {
            console.log(`✅ SUCCESS: Generated ${actualDocuments}/${expectedDocuments} documents (one per creditor)`);
        } else {
            console.log(`❌ PROBLEM: Generated ${actualDocuments}/${expectedDocuments} documents`);
            console.log(`   Expected: One document per creditor (${expectedDocuments} total)`);
            console.log(`   Got: ${actualDocuments} documents`);
        }

    } catch (error) {
        console.error('❌ Test Error:', error.message);
        console.error(error.stack);
    }
}

// Run the test
testMultiCreditorGeneration().then(() => {
    console.log('\n🏁 Multi-creditor test completed.');
}).catch(error => {
    console.error('💥 Test failed:', error);
});