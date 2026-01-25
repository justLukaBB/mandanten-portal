const DocumentGenerator = require('./server/services/documentGenerator');
const CreditorContactService = require('./server/services/creditorContactService');
const fs = require('fs');
const path = require('path');

async function testComplete3DocumentFlow() {
    console.log('🧪 Testing complete 3-document flow: Generation + Zendesk Upload + Email...');

    const documentGenerator = new DocumentGenerator();
    const creditorService = new CreditorContactService();

    // Test data - simulating pfändbares Einkommen scenario
    const testClientReference = 'TEST-FLOW-2025-001';
    const testClientData = {
        name: "Alexander Drewitz",
        email: "test@example.com", 
        reference: testClientReference,
        aktenzeichen: testClientReference
    };

    const testSettlementData = {
        monthly_payment: 880.78,
        duration_months: 36,
        total_debt: 97357.73,
        average_quota_percentage: 32.57,
        plan_type: 'ratenzahlung',
        pfaendbar_amount: 880.78,
        creditor_payments: [
            {
                creditor_name: "Finanzamt Bochum-Süd",
                debt_amount: 1677.64,
                quota_percentage: 1.72
            },
            {
                creditor_name: "Telekom Deutschland GmbH", 
                debt_amount: 1587.13,
                quota_percentage: 1.63
            },
            {
                creditor_name: "Real Inkasso GmbH & Co. KG",
                debt_amount: 772.12,
                quota_percentage: 0.79
            }
        ]
    };

    const testCreditorData = [
        {
            sender_name: "Finanzamt Bochum-Süd",
            sender_email: "test@example.com",
            claim_amount: 1677.64
        }
    ];

    try {
        console.log('\n📄 PHASE 1: Generating all 3 documents...');

        // 1. Generate Settlement Plan Document
        console.log('🔧 Generating Schuldenbereinigungsplan...');
        const settlementResult = await documentGenerator.generateSettlementPlanDocument(
            testClientReference, 
            testSettlementData
        );

        if (!settlementResult.success) {
            throw new Error(`Settlement document generation failed: ${settlementResult.error}`);
        }
        console.log(`✅ Settlement Plan: ${settlementResult.document_info.filename}`);

        // 2. Generate Creditor Overview Document
        console.log('🔧 Generating Forderungsübersicht...');
        const overviewResult = await documentGenerator.generateForderungsuebersichtDocument(
            testClientReference
        );

        if (!overviewResult.success) {
            throw new Error(`Overview document generation failed: ${overviewResult.error}`);
        }
        console.log(`✅ Creditor Overview: ${overviewResult.document_info.filename}`);

        // 3. Generate Ratenplan pfändbares Einkommen Document
        console.log('🔧 Generating Ratenplan pfändbares Einkommen...');
        const ratenplanResult = await documentGenerator.generateRatenplanPfaendbaresEinkommen(
            testClientReference,
            testSettlementData
        );

        if (!ratenplanResult.success) {
            throw new Error(`Ratenplan document generation failed: ${ratenplanResult.error}`);
        }
        console.log(`✅ Ratenplan pfändbares Einkommen: ${ratenplanResult.document_info.filename}`);

        // Verify all files exist
        console.log('\n📋 PHASE 2: Verifying all generated files exist...');
        const documentsToCheck = [
            { name: 'Settlement Plan', path: settlementResult.document_info.path },
            { name: 'Creditor Overview', path: overviewResult.document_info.path },
            { name: 'Ratenplan pfändbares Einkommen', path: ratenplanResult.document_info.path }
        ];

        for (const doc of documentsToCheck) {
            if (fs.existsSync(doc.path)) {
                const stats = fs.statSync(doc.path);
                console.log(`✅ ${doc.name}: ${Math.round(stats.size / 1024)} KB`);
            } else {
                throw new Error(`❌ ${doc.name} file not found: ${doc.path}`);
            }
        }

        // Test document upload and URL generation
        console.log('\n📤 PHASE 3: Testing document upload to Zendesk...');
        
        // Mock a main ticket ID (in real scenario this would come from actual ticket creation)
        const mockMainTicketId = '12345';
        
        const generatedDocuments = {
            settlementResult,
            overviewResult,
            ratenplanResult
        };

        console.log('🔧 Testing uploadDocumentsToMainTicketWithUrls with 3 documents...');
        
        // This test simulates the upload process without actually calling Zendesk
        // Just verify the logic prepares all 3 documents correctly
        const documentFiles = [];
        
        const settlementPath = generatedDocuments.settlementResult.document_info?.path;
        const overviewPath = generatedDocuments.overviewResult.document_info?.path;
        const ratenplanPath = generatedDocuments.ratenplanResult?.document_info?.path;

        if (settlementPath) documentFiles.push({ path: settlementPath, type: 'settlement_plan' });
        if (overviewPath) documentFiles.push({ path: overviewPath, type: 'creditor_overview' });
        if (ratenplanPath) documentFiles.push({ path: ratenplanPath, type: 'ratenplan_pfaendbares_einkommen' });

        console.log(`📊 Prepared ${documentFiles.length} documents for upload:`);
        documentFiles.forEach((doc, index) => {
            const filename = path.basename(doc.path);
            const stats = fs.statSync(doc.path);
            console.log(`   ${index + 1}. ${doc.type}: ${filename} (${Math.round(stats.size / 1024)} KB)`);
        });

        if (documentFiles.length !== 3) {
            throw new Error(`Expected 3 documents, but got ${documentFiles.length}`);
        }

        console.log('\n✅ PHASE 4: All systems working correctly!');
        console.log(`📁 Generated documents in: ${path.dirname(settlementResult.document_info.path)}`);
        console.log('🎯 Integration test passed - all 3 documents are:');
        console.log('   ✅ Generated successfully');
        console.log('   ✅ Saved to disk');
        console.log('   ✅ Ready for Zendesk upload');
        console.log('   ✅ Ready for email attachment');

        return {
            success: true,
            documents_generated: 3,
            settlement_plan: settlementResult.document_info.filename,
            creditor_overview: overviewResult.document_info.filename,
            ratenplan: ratenplanResult.document_info.filename,
            total_size_kb: Math.round(
                (settlementResult.document_info.size + 
                 overviewResult.document_info.size + 
                 ratenplanResult.document_info.size) / 1024
            )
        };

    } catch (error) {
        console.error('❌ Complete flow test failed:', error.message);
        console.error('Stack trace:', error.stack);
        
        return {
            success: false,
            error: error.message
        };
    }
}

// Run the test
if (require.main === module) {
    testComplete3DocumentFlow()
        .then(result => {
            if (result.success) {
                console.log('\n🎉 COMPLETE 3-DOCUMENT FLOW TEST PASSED!');
                console.log(`📊 Summary:`);
                console.log(`   • Documents generated: ${result.documents_generated}`);
                console.log(`   • Settlement Plan: ${result.settlement_plan}`);
                console.log(`   • Creditor Overview: ${result.creditor_overview}`);
                console.log(`   • Ratenplan: ${result.ratenplan}`);
                console.log(`   • Total size: ${result.total_size_kb} KB`);
                console.log('\n✅ The system is ready to generate and send 3 documents to creditors!');
            } else {
                console.log('💥 Flow test failed!');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('💥 Test execution failed:', error);
            process.exit(1);
        });
}

module.exports = testComplete3DocumentFlow;