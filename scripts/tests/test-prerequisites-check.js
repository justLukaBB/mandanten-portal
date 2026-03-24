/**
 * Test Insolvenzantrag Prerequisites Check
 */

const mongoose = require('mongoose');
const Client = require('./models/Client');

const TEST_CLIENT_REFERENCE = '1w12'; // Change this to your test client

async function testPrerequisites() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        const client = await Client.findOne({ aktenzeichen: TEST_CLIENT_REFERENCE });
        if (!client) {
            throw new Error(`Client ${TEST_CLIENT_REFERENCE} not found`);
        }

        console.log(`📋 Client: ${client.firstName} ${client.lastName} (${client.aktenzeichen})`);
        console.log(`   Status: ${client.status}\n`);

        console.log('🔍 Checking Prerequisites:\n');

        // 1. Personal Info
        const hasPersonalInfo = !!(client.firstName && client.lastName &&
            (client.address || (client.strasse && client.plz && client.ort)));
        console.log(`1. Personal Info: ${hasPersonalInfo ? '✅' : '❌'}`);
        console.log(`   - Name: ${client.firstName} ${client.lastName}`);
        console.log(`   - Address: ${client.address || `${client.strasse}, ${client.plz} ${client.ort}` || 'MISSING'}`);

        // 2. Financial Data
        const hasFinancialData = !!(client.financial_data?.completed ||
                                   client.financial_data?.client_form_filled ||
                                   client.calculated_settlement_plan);
        console.log(`\n2. Financial Data: ${hasFinancialData ? '✅' : '❌'}`);
        console.log(`   - financial_data.completed: ${client.financial_data?.completed || false}`);
        console.log(`   - financial_data.client_form_filled: ${client.financial_data?.client_form_filled || false}`);
        console.log(`   - calculated_settlement_plan: ${!!client.calculated_settlement_plan}`);
        if (client.calculated_settlement_plan) {
            console.log(`     • Plan type: ${client.calculated_settlement_plan.plan_type}`);
            console.log(`     • Monthly payment: €${client.calculated_settlement_plan.monthly_payment}`);
        }

        // 3. Debt Settlement Plan
        const hasDebtSettlementPlan = !!(client.debt_settlement_plan?.creditors?.length > 0 ||
                                        client.final_creditor_list?.length > 0 ||
                                        client.calculated_settlement_plan);
        console.log(`\n3. Debt Settlement Plan: ${hasDebtSettlementPlan ? '✅' : '❌'}`);
        console.log(`   - debt_settlement_plan.creditors: ${client.debt_settlement_plan?.creditors?.length || 0}`);
        console.log(`   - final_creditor_list: ${client.final_creditor_list?.length || 0}`);
        console.log(`   - calculated_settlement_plan: ${!!client.calculated_settlement_plan}`);

        // 4. Creditor List
        const hasCreditorList = !!(client.final_creditor_list?.length > 0);
        console.log(`\n4. Creditor List: ${hasCreditorList ? '✅' : '❌'}`);
        console.log(`   - final_creditor_list: ${client.final_creditor_list?.length || 0}`);
        if (client.final_creditor_list?.length > 0) {
            client.final_creditor_list.forEach((c, i) => {
                console.log(`     ${i+1}. ${c.sender_name} - €${c.claim_amount}`);
            });
        }

        // Status Override
        console.log(`\n5. Status Override:\n`);
        const hasReachedSettlementStage = client.status === 'settlement_plan_sent_to_creditors';
        console.log(`   - Status: ${client.status}`);
        console.log(`   - Override active: ${hasReachedSettlementStage ? '✅ YES' : '❌ NO'}`);

        // Final Result
        const allPrerequisitesMet = hasPersonalInfo && hasFinancialData && hasDebtSettlementPlan && hasCreditorList;
        const canDownload = allPrerequisitesMet || hasReachedSettlementStage;

        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`📊 FINAL RESULT:`);
        console.log(`   All Prerequisites Met: ${allPrerequisitesMet ? '✅' : '❌'}`);
        console.log(`   Can Download: ${canDownload ? '✅ YES' : '❌ NO'}`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

        if (!canDownload) {
            console.log('⚠️  Issues to fix:');
            if (!hasPersonalInfo) console.log('   - Missing personal info');
            if (!hasFinancialData) console.log('   - Missing financial data');
            if (!hasDebtSettlementPlan) console.log('   - Missing debt settlement plan');
            if (!hasCreditorList) console.log('   - Missing creditor list');
            if (!hasReachedSettlementStage) console.log('   - Status not set to settlement_plan_sent_to_creditors');
        }

        await mongoose.connection.close();

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

testPrerequisites();