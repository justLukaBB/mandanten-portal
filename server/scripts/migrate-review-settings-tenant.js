/**
 * Migration: Remove global ReviewSettings document (without kanzleiId)
 * Each Kanzlei will get its own settings via upsert on first access.
 *
 * Usage: node server/scripts/migrate-review-settings-tenant.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function migrate() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const collection = mongoose.connection.collection('review_settings');

  // Find documents without kanzleiId (the global ones causing the bug)
  const globalDocs = await collection.find({
    $or: [{ kanzleiId: null }, { kanzleiId: { $exists: false } }]
  }).toArray();

  if (globalDocs.length === 0) {
    console.log('No global ReviewSettings found — nothing to migrate.');
  } else {
    console.log(`Found ${globalDocs.length} global ReviewSettings document(s):`);
    globalDocs.forEach(doc => {
      console.log(`  _id=${doc._id}, confidence=${doc.confidence_threshold}, auto_assign=${doc.auto_assignment_enabled}, demo=${doc.demo_mode_enabled}, test=${doc.test_mode_enabled}`);
    });

    const result = await collection.deleteMany({
      $or: [{ kanzleiId: null }, { kanzleiId: { $exists: false } }]
    });
    console.log(`Deleted ${result.deletedCount} global document(s).`);
    console.log('Each Kanzlei will now get its own settings on first access (defaults: threshold=80, auto_assign=false, demo=false, test=false).');
  }

  await mongoose.disconnect();
  console.log('Done.');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
