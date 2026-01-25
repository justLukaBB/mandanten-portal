const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://justlukax:HPa1Me6NfYtzyqcO@backoffice.t0t9u7e.mongodb.net/?retryWrites=true&w=majority&appName=Backoffice')
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

const Client = require('./models/Client');

// Helper function to calculate creditor response statistics
function calculateCreditorResponseStats(client) {
    const creditors = client.final_creditor_list || client.debt_settlement_plan?.creditors || [];

    console.log(`\n📊 Creditor List Found: ${creditors.length} creditors`);

    if (creditors.length === 0) {
        return {
            anzahl_glaeubiger: '0',
            anzahl_glaeubiger_zugestimmt: '0',
            anzahl_ablehnungen: '0',
            anzahl_ohne_antwort: '0',
            summe_zugestimmt: '0',
            summe_gesamt: String(client.total_debt || 0)
        };
    }

    let acceptedCount = 0;
    let declinedCount = 0;
    let noResponseCount = 0;
    let acceptedSum = 0;
    let totalSum = 0;

    creditors.forEach((creditor, index) => {
        const amount = creditor.claim_amount || creditor.current_debt_amount || creditor.creditor_response_amount || 0;
        totalSum += amount;

        const responseStatus = creditor.settlement_response_status || 'no_response';

        console.log(`  Creditor ${index + 1}: ${creditor.sender_name} - Status: ${responseStatus}, Amount: ${amount}`);

        if (responseStatus === 'accepted') {
            acceptedCount++;
            acceptedSum += amount;
        } else if (responseStatus === 'declined' || responseStatus === 'counter_offer') {
            declinedCount++;
        } else {
            noResponseCount++;
        }
    });

    const stats = {
        anzahl_glaeubiger: String(creditors.length),
        anzahl_glaeubiger_zugestimmt: String(acceptedCount),
        anzahl_ablehnungen: String(declinedCount),
        anzahl_ohne_antwort: String(noResponseCount),
        summe_zugestimmt: String(acceptedSum),
        summe_gesamt: String(totalSum)
    };

    console.log('\n📋 Calculated Stats:');
    console.log(`  anzahl_glaeubiger: "${stats.anzahl_glaeubiger}"`);
    console.log(`  anzahl_glaeubiger_zugestimmt: "${stats.anzahl_glaeubiger_zugestimmt}"`);
    console.log(`  anzahl_ablehnungen: "${stats.anzahl_ablehnungen}"`);
    console.log(`  anzahl_ohne_antwort: "${stats.anzahl_ohne_antwort}"`);
    console.log(`  summe_zugestimmt: "${stats.summe_zugestimmt}"`);
    console.log(`  summe_gesamt: "${stats.summe_gesamt}"`);

    return stats;
}

async function debugClient(aktenzeichen) {
    try {
        console.log(`\n🔍 Looking for client: ${aktenzeichen}`);

        const client = await Client.findOne({ aktenzeichen });

        if (!client) {
            console.log('❌ Client not found');
            process.exit(1);
        }

        console.log(`✅ Found client: ${client.firstName} ${client.lastName}`);
        console.log(`   Email: ${client.email}`);
        console.log(`   Total Debt: ${client.total_debt}`);

        const stats = calculateCreditorResponseStats(client);

        console.log('\n✅ Stats calculation complete');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected from MongoDB');
    }
}

// Get aktenzeichen from command line
const aktenzeichen = process.argv[2];

if (!aktenzeichen) {
    console.log('Usage: node debug-insolvenz-fields.js <AKTENZEICHEN>');
    console.log('Example: node debug-insolvenz-fields.js AZ-2025-001');
    process.exit(1);
}

debugClient(aktenzeichen);