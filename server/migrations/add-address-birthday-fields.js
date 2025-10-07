const mongoose = require('mongoose');
require('dotenv').config({ path: '../../.env' });
const Client = require('../models/Client');

async function migrate() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Find all clients without the new fields
    const clients = await Client.find({
      $or: [
        { geburtstag: { $exists: false } },
        { geburtstag: null }
      ]
    });
    
    console.log(`Found ${clients.length} clients to update`);
    
    // Update each client with empty string for the new field
    for (const client of clients) {
      // geburtstag field - set to empty string if not present
      if (!client.geburtstag) {
        client.geburtstag = '';
      }
      
      // address field already exists in schema, so we don't need to migrate it
      
      await client.save({ validateModifiedOnly: true });
      console.log(`Updated client ${client.aktenzeichen}`);
    }
    
    console.log('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
migrate();