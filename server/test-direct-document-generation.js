const DocumentGenerator = require('./services/documentGenerator');

async function testDirectDocumentGeneration() {
    console.log('🧪 Testing Direct Document Generation (All 3 Types)...\n');

    const documentGenerator = new DocumentGenerator();

    // Mock client data
    const testClientData = {
        reference: 'DIRECT-TEST-001',
        firstName: 'Test',
        lastName: 'Client',
        aktenzeichen: 'DIRECT-TEST-001',
        financial_data: {
            monthly_net_income: 3000,
            number_of_children: 2,
            marital_status: 'married'
        },
        geburtstag: '15.05.1980'
    };

    // Test settlement data
    const testSettlementData = {
        total_debt: 50000,
        creditor_payments: [
            {
                creditor_name: 'Test Bank AG',
                debt_amount: 25000,
                creditor_address: 'Bankstraße 1, 10115 Berlin',
                reference_number: 'BANK-001-2025'
            },
            {
                creditor_name: 'Test Sparkasse',
                debt_amount: 25000,
                creditor_address: 'Sparkassenplatz 2, 20095 Hamburg',
                reference_number: 'SPARK-002-2025'
            }
        ],
        plan_type: 'quotenplan',
        duration_months: 36,
        pfaendbar_amount: 800,
        garnishable_amount: 800
    };

    const pfaendbarAmount = 800;

    try {
        console.log('📊 Test Data:');
        console.log(`   Client: ${testClientData.firstName} ${testClientData.lastName}`);
        console.log(`   Total Debt: ${testSettlementData.total_debt} EUR`);
        console.log(`   Creditors: ${testSettlementData.creditor_payments.length}`);
        console.log(`   Pfändbar Amount: ${pfaendbarAmount} EUR\n`);

        const generatedDocuments = {};

        // 1. Test Schuldenbereinigungsplan
        console.log('🎯 Testing Schuldenbereinigungsplan generation...');
        try {
            const schuldenplan = await documentGenerator.generateSettlementPlanDocument(
                testClientData.reference,
                testSettlementData
            );
            generatedDocuments.schuldenbereinigungsplan = schuldenplan;
            console.log(`✅ Schuldenbereinigungsplan: ${schuldenplan.filename} (${Math.round(schuldenplan.size / 1024)} KB)`);
        } catch (error) {
            console.log(`❌ Schuldenbereinigungsplan failed: ${error.message}`);
        }

        // 2. Test Forderungsübersicht
        console.log('\n🎯 Testing Forderungsübersicht generation...');
        try {
            const forderungsuebersicht = await documentGenerator.generateForderungsuebersichtDocument(
                testClientData.reference
            );
            generatedDocuments.forderungsuebersicht = forderungsuebersicht;
            console.log(`✅ Forderungsübersicht: ${forderungsuebersicht.filename} (${Math.round(forderungsuebersicht.size / 1024)} KB)`);
        } catch (error) {
            console.log(`❌ Forderungsübersicht failed: ${error.message}`);
        }

        // 3. Test Ratenplan pfändbares Einkommen (individual per creditor)
        console.log('\n🎯 Testing Ratenplan pfändbares Einkommen generation...');
        try {
            const ratenplanResult = await documentGenerator.generateRatenplanDocument(
                testClientData,
                testSettlementData,
                pfaendbarAmount
            );
            
            if (ratenplanResult.success) {
                generatedDocuments.ratenplan_documents = ratenplanResult.documents;
                console.log(`✅ Ratenplan documents: ${ratenplanResult.documents.length} generated`);
                ratenplanResult.documents.forEach((doc, index) => {
                    console.log(`   ${index + 1}. ${doc.filename} - ${doc.creditor_name} (${Math.round(doc.size / 1024)} KB)`);
                });
            } else {
                console.log(`❌ Ratenplan failed: ${ratenplanResult.error}`);
            }
        } catch (error) {
            console.log(`❌ Ratenplan failed: ${error.message}`);
        }

        // Summary
        console.log('\n📋 GENERATION SUMMARY:');
        const schuldenCount = generatedDocuments.schuldenbereinigungsplan ? 1 : 0;
        const forderungCount = generatedDocuments.forderungsuebersicht ? 1 : 0;
        const ratenplanCount = generatedDocuments.ratenplan_documents ? generatedDocuments.ratenplan_documents.length : 0;
        const totalDocs = schuldenCount + forderungCount + ratenplanCount;

        console.log(`📊 Documents Generated: ${totalDocs}/4 expected`);
        console.log(`   - Schuldenbereinigungsplan: ${schuldenCount}/1 ${schuldenCount === 1 ? '✅' : '❌'}`);
        console.log(`   - Forderungsübersicht: ${forderungCount}/1 ${forderungCount === 1 ? '✅' : '❌'}`);
        console.log(`   - Pfändbares Einkommen: ${ratenplanCount}/2 ${ratenplanCount === 2 ? '✅' : '❌'}`);

        if (totalDocs === 4) {
            console.log('\n🎉 SUCCESS: All document types are working!');
        } else {
            console.log(`\n⚠️ PARTIAL SUCCESS: ${totalDocs}/4 document types working`);
        }

    } catch (error) {
        console.error('❌ Test Error:', error.message);
        console.error(error.stack);
    }
}

// Run the test
testDirectDocumentGeneration().then(() => {
    console.log('\n🏁 Direct document generation test completed.');
}).catch(error => {
    console.error('💥 Test failed:', error);
});