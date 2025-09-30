const mongoose = require('mongoose');
const Client = require('./models/Client');

async function listClients() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mandanten-portal');

        const clients = await Client.find({}).select('aktenzeichen firstName lastName email financial_data.completed financial_data.recommended_plan_type final_creditor_list').limit(10);

        console.log('\n📋 Available Test Clients:\n');

        if (clients.length === 0) {
            console.log('No clients found in database.\n');
        } else {
            clients.forEach(c => {
                console.log(`📁 ${c.aktenzeichen}`);
                console.log(`   Name: ${c.firstName} ${c.lastName}`);
                console.log(`   Email: ${c.email}`);
                console.log(`   Financial Data: ${c.financial_data?.completed ? '✅ Completed' : '❌ Not completed'}`);
                console.log(`   Plan Type: ${c.financial_data?.recommended_plan_type || 'N/A'}`);
                console.log(`   Creditors: ${c.final_creditor_list?.length || 0}\n`);
            });
        }

        await mongoose.connection.close();
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

listClients();