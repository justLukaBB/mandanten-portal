/**
 * Test Financial Data Submission Flow
 * Tests if 3 documents are generated after financial data submission
 */

const mongoose = require('mongoose');
const Client = require('./models/Client');
const DocumentGenerator = require('./services/documentGenerator');

const TEST_CLIENT_AKTENZEICHEN = '123456'; // Test client

async function testFinancialDataFlow() {
    try {
        console.log('🧪 Starting Financial Data Flow Test\n');

        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://justlukax:HPa1Me6NfYtzyqcO@backoffice.t0t9u7e.mongodb.net/?retryWrites=true&w=majority&appName=Backoffice');
        console.log('✅ Connected to MongoDB\n');

        // Find test client
        const client = await Client.findOne({ aktenzeichen: TEST_CLIENT_AKTENZEICHEN });
        if (!client) {
            throw new Error(`Test client ${TEST_CLIENT_AKTENZEICHEN} not found`);
        }

        console.log(`📋 Test Client: ${client.firstName} ${client.lastName} (${client.aktenzeichen})`);
        console.log(`   - Email: ${client.email}`);
        console.log(`   - Financial Data Completed: ${client.financial_data?.completed || false}`);
        console.log(`   - Pfändbarer Betrag: €${client.financial_data?.pfaendbar_amount || 0}`);
        console.log(`   - Recommended Plan: ${client.financial_data?.recommended_plan_type || 'N/A'}\n`);

        // Check if financial data is complete
        if (!client.financial_data?.completed) {
            console.log('⚠️  Financial data not completed yet. Skipping document generation test.');
            console.log('   To test: Submit financial data via the portal first.\n');
            return;
        }

        // Determine plan type
        const planType = client.financial_data.recommended_plan_type;
        const isNullplan = planType === 'nullplan';

        console.log(`📊 Plan Type: ${planType}`);
        console.log(`   ${isNullplan ? 'Nullplan (No garnishable income)' : 'Quotenplan (Has garnishable income)'}\n`);

        // Generate documents based on plan type
        const documentGenerator = new DocumentGenerator();
        let result;

        console.log('📄 Generating documents...\n');

        if (isNullplan) {
            // Test Nullplan document generation
            result = await documentGenerator.generateNullplanDocuments(TEST_CLIENT_AKTENZEICHEN);

            if (result.success) {
                console.log('✅ Nullplan documents generated successfully:');
                console.log(`   1. Nullplan: ${result.nullplan.document_info.filename}`);
                console.log(`   2. Forderungsübersicht: ${result.forderungsuebersicht.document_info.filename}`);
                console.log(`   3. Ratenplan (Nullplan): ${result.ratenplan_nullplan?.document_info?.filename || 'NOT GENERATED ❌'}\n`);
            } else {
                console.error('❌ Nullplan generation failed:', result.error);
            }
        } else {
            // Test regular settlement plan generation
            console.log('ℹ️  Note: Regular Schuldenbereinigungsplan generation requires:');
            console.log('   - Confirmed creditor list');
            console.log('   - Settlement calculation completed\n');

            // Check prerequisites
            const hasCreditors = client.final_creditor_list?.length > 0;
            const hasSettlementPlan = client.debt_settlement_plan?.creditors?.length > 0;

            console.log(`   ✓ Has creditors: ${hasCreditors} (${client.final_creditor_list?.length || 0})`);
            console.log(`   ✓ Has settlement plan: ${hasSettlementPlan}\n`);

            if (!hasCreditors) {
                console.log('⚠️  No creditors confirmed yet. Upload creditor documents first.\n');
                return;
            }

            if (!hasSettlementPlan) {
                console.log('⚠️  Settlement plan not calculated yet.\n');
                return;
            }

            // Check if documents exist
            console.log('📂 Checking existing documents...\n');
            const fs = require('fs');
            const path = require('path');
            const documentDir = path.join(__dirname, 'documents');
            const today = new Date().toISOString().split('T')[0];

            const docs = [
                `Schuldenbereinigungsplan_${TEST_CLIENT_AKTENZEICHEN}_${today}.docx`,
                `Forderungsuebersicht_${TEST_CLIENT_AKTENZEICHEN}_${today}.docx`,
                `Ratenplan-Pfaendbares-Einkommen_${TEST_CLIENT_AKTENZEICHEN}_${today}.docx`
            ];

            docs.forEach(filename => {
                const filePath = path.join(documentDir, filename);
                const exists = fs.existsSync(filePath);
                console.log(`   ${exists ? '✅' : '❌'} ${filename}`);
            });
        }

        console.log('\n✅ Test completed\n');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 MongoDB connection closed');
    }
}

// Run test
testFinancialDataFlow();