const mongoose = require('mongoose');
const path = require('path');
const Client = require(path.join(__dirname, 'server/models/Client'));

mongoose.connect('mongodb://localhost:27017/mandanten-portal-test', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('Connected to MongoDB\n');

  // Find clients with settlement status
  const settled = await Client.find({ current_status: 'settlement_plan_sent_to_creditors' });
  console.log(`Found ${settled.length} clients with settlement_plan_sent_to_creditors status`);
  settled.forEach(client => {
    console.log(`\n  Client: ${client.aktenzeichen}`);
    console.log(`  Name: ${client.firstName} ${client.lastName}`);
    console.log(`  Email: ${client.email}`);
    console.log(`  has calculated_settlement_plan: ${client.calculated_settlement_plan ? 'YES' : 'NO'}`);
    console.log(`  has final_creditor_list: ${client.final_creditor_list?.length || 0} creditors`);
  });

  // Also check for settlement_documents_generated
  const docsGen = await Client.find({ current_status: 'settlement_documents_generated' });
  console.log(`\n\nFound ${docsGen.length} clients with settlement_documents_generated status`);
  docsGen.forEach(client => {
    console.log(`\n  Client: ${client.aktenzeichen}`);
    console.log(`  Name: ${client.firstName} ${client.lastName}`);
    console.log(`  has calculated_settlement_plan: ${client.calculated_settlement_plan ? 'YES' : 'NO'}`);
  });

  // Check all clients sorted by update
  const allClients = await Client.find().sort({ updatedAt: -1 }).limit(10);
  console.log(`\n\nLast 10 updated clients:`);
  allClients.forEach(client => {
    console.log(`\n  ${client.aktenzeichen} (${client.firstName} ${client.lastName})`);
    console.log(`    Status: ${client.current_status}`);
    console.log(`    Settlement Plan: ${client.calculated_settlement_plan ? 'YES' : 'NO'}`);
    console.log(`    Updated: ${client.updatedAt}`);
  });

  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});