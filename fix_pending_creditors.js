// Utility script to fix existing test creditors with pending status that have been manually reviewed
const mongoose = require('mongoose');
require('dotenv').config();

const Client = require('./server/models/Client');

async function fixPendingCreditors() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    
    console.log('🔍 Finding clients with manually reviewed creditors that are still pending...');
    
    const clients = await Client.find({
      'final_creditor_list.manually_reviewed': true,
      'final_creditor_list.status': 'pending'
    });
    
    console.log(`📊 Found ${clients.length} clients with pending creditors that have been reviewed`);
    
    let totalUpdated = 0;
    
    for (const client of clients) {
      let clientUpdated = false;
      
      for (let i = 0; i < client.final_creditor_list.length; i++) {
        const creditor = client.final_creditor_list[i];
        
        if (creditor.manually_reviewed && creditor.status === 'pending') {
          console.log(`✏️ Updating creditor ${creditor.sender_name} for client ${client.aktenzeichen}`);
          
          // Update status based on review action
          if (creditor.review_action === 'skipped') {
            creditor.status = 'rejected';
          } else {
            creditor.status = 'confirmed';
            if (!creditor.confirmed_at) {
              creditor.confirmed_at = creditor.reviewed_at || new Date();
            }
          }
          
          clientUpdated = true;
          totalUpdated++;
        }
      }
      
      if (clientUpdated) {
        await client.save();
        console.log(`💾 Updated client ${client.aktenzeichen}`);
      }
    }
    
    console.log(`✅ Updated ${totalUpdated} creditors across ${clients.length} clients`);
    
  } catch (error) {
    console.error('❌ Error fixing pending creditors:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Run if called directly
if (require.main === module) {
  fixPendingCreditors();
}

module.exports = fixPendingCreditors;