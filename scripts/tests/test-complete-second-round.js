const SecondRoundDocumentService = require('./services/secondRoundDocumentService');

async function testCompleteSecondRound() {
    console.log('🧪 Testing COMPLETE 2nd Round Document Generation (All 3 Documents)...\n');

    const secondRoundService = new SecondRoundDocumentService();

    // Test settlement data with 2 creditors
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

    try {
        console.log('📊 Test Settlement Data:');
        console.log(`   Total Debt: ${testSettlementData.total_debt} EUR`);
        console.log(`   Creditors: ${testSettlementData.creditor_payments.length}`);
        console.log(`   Pfändbar Amount: ${testSettlementData.pfaendbar_amount} EUR`);
        testSettlementData.creditor_payments.forEach((creditor, index) => {
            console.log(`     ${index + 1}. ${creditor.creditor_name} - ${creditor.debt_amount} EUR`);
        });
        console.log();

        console.log('🚀 Calling generateSecondRoundDocuments...\n');

        const result = await secondRoundService.generateSecondRoundDocuments(
            'COMPLETE-TEST-001',
            testSettlementData
        );

        console.log('\n📋 COMPLETE 2ND ROUND RESULT:');
        console.log(`✅ Success: ${result.success}`);
        console.log(`📄 Total Documents: ${result.total_documents || 0}`);
        console.log(`👥 Total Creditors: ${result.total_creditors || 0}`);
        console.log(`❌ Errors: ${result.errors?.length || 0}`);

        if (result.success && result.documents && result.documents.length > 0) {
            console.log('\n📁 Generated Documents:');
            
            // Group documents by type
            const documentsByType = {
                schuldenbereinigungsplan: [],
                forderungsuebersicht: [],
                pfaendbares_einkommen: []
            };

            result.documents.forEach(doc => {
                documentsByType[doc.document_type].push(doc);
            });

            // Display each type
            console.log('\n  📋 Schuldenbereinigungsplan:');
            documentsByType.schuldenbereinigungsplan.forEach((doc, index) => {
                console.log(`     ${index + 1}. ${doc.filename} (${Math.round(doc.size / 1024)} KB)`);
            });

            console.log('\n  📋 Forderungsübersicht:');
            documentsByType.forderungsuebersicht.forEach((doc, index) => {
                console.log(`     ${index + 1}. ${doc.filename} (${Math.round(doc.size / 1024)} KB)`);
            });

            console.log('\n  📋 Pfändbares Einkommen (per Creditor):');
            documentsByType.pfaendbares_einkommen.forEach((doc, index) => {
                console.log(`     ${index + 1}. ${doc.filename} - ${doc.creditor_name} (${Math.round(doc.size / 1024)} KB)`);
            });
        }

        if (result.errors && result.errors.length > 0) {
            console.log('\n❌ Errors:');
            result.errors.forEach((error, index) => {
                console.log(`   ${index + 1}. ${error}`);
            });
        }

        // Verification
        console.log('\n🔍 VERIFICATION:');
        
        const expectedDocuments = 2 + testSettlementData.creditor_payments.length; // 2 general + N creditor-specific
        const actualDocuments = result.total_documents || 0;
        
        console.log(`📊 Document Count Analysis:`);
        console.log(`   Expected: ${expectedDocuments} total (2 general + ${testSettlementData.creditor_payments.length} creditor-specific)`);
        console.log(`   Actual: ${actualDocuments} total`);
        
        if (result.documents) {
            const schuldenCount = result.documents.filter(d => d.document_type === 'schuldenbereinigungsplan').length;
            const forderungCount = result.documents.filter(d => d.document_type === 'forderungsuebersicht').length;
            const ratenplanCount = result.documents.filter(d => d.document_type === 'pfaendbares_einkommen').length;
            
            console.log(`   Breakdown:`);
            console.log(`     - Schuldenbereinigungsplan: ${schuldenCount}/1 ${schuldenCount === 1 ? '✅' : '❌'}`);
            console.log(`     - Forderungsübersicht: ${forderungCount}/1 ${forderungCount === 1 ? '✅' : '❌'}`);
            console.log(`     - Pfändbares Einkommen: ${ratenplanCount}/${testSettlementData.creditor_payments.length} ${ratenplanCount === testSettlementData.creditor_payments.length ? '✅' : '❌'}`);
        }
        
        if (actualDocuments === expectedDocuments) {
            console.log(`\n🎉 SUCCESS: All ${expectedDocuments} documents generated correctly!`);
        } else {
            console.log(`\n❌ PROBLEM: Expected ${expectedDocuments} documents, got ${actualDocuments}`);
        }

    } catch (error) {
        console.error('❌ Test Error:', error.message);
        console.error(error.stack);
    }
}

// Run the test
testCompleteSecondRound().then(() => {
    console.log('\n🏁 Complete 2nd round test finished.');
}).catch(error => {
    console.error('💥 Test failed:', error);
});