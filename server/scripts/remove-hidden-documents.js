/**
 * Script to remove hidden source documents from client document arrays
 * Run with: node server/scripts/remove-hidden-documents.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const clientSchema = new mongoose.Schema({}, {
  strict: false,
  collection: 'clients'
});

const Client = mongoose.model('Client', clientSchema);

async function removeHiddenDocuments() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mandanten-portal', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB\n');

    // Find all clients
    const clients = await Client.find({});
    console.log(`📊 Found ${clients.length} clients\n`);

    let totalRemoved = 0;

    for (const client of clients) {
      if (!client.documents || client.documents.length === 0) {
        continue;
      }

      const beforeCount = client.documents.length;
      const hiddenDocs = client.documents.filter(doc => doc.hidden_from_portal === true);

      if (hiddenDocs.length > 0) {
        console.log(`\n👤 Client: ${client.firstName} ${client.lastName} (${client.email})`);
        console.log(`   📄 Documents before: ${beforeCount}`);
        console.log(`   🙈 Hidden documents found: ${hiddenDocs.length}`);

        // Log which documents will be removed
        hiddenDocs.forEach(doc => {
          console.log(`      - ${doc.name || doc.filename} (ID: ${doc.id})`);
        });

        // Remove hidden documents
        client.documents = client.documents.filter(doc => doc.hidden_from_portal !== true);
        await client.save();

        const afterCount = client.documents.length;
        const removed = beforeCount - afterCount;
        totalRemoved += removed;

        console.log(`   ✅ Documents after: ${afterCount}`);
        console.log(`   🗑️  Removed: ${removed} documents`);
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log(`✨ Cleanup complete!`);
    console.log(`📊 Total hidden documents removed: ${totalRemoved}`);
    console.log('='.repeat(50) + '\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the script
removeHiddenDocuments();
