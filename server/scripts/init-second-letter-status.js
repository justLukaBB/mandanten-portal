/**
 * Initialize second_letter_status on all existing clients.
 *
 * The second_letter_status enum was added in Phase 28 (v10).
 * Mongoose defaults only apply to NEW documents — existing clients
 * have no second_letter_status field. This script sets all of them to 'IDLE'
 * so the Phase 29 scheduler query { second_letter_status: 'IDLE' } matches them.
 *
 * Run with: node server/scripts/init-second-letter-status.js
 *
 * Options:
 *   --dry-run    Preview affected clients without updating
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const config = require('../config');

const DRY_RUN = process.argv.includes('--dry-run');

async function run() {
  console.log(`\n🔧 Init second_letter_status${DRY_RUN ? ' (DRY RUN)' : ''}\n`);

  await mongoose.connect(config.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  const Client = require('../models/Client');

  // Count total clients for context
  const totalClients = await Client.countDocuments();
  console.log(`Total clients in database: ${totalClients}`);

  // Count clients needing initialization:
  // - Field does not exist (never set)
  // - Field is null (explicitly set to null)
  const needsInit = await Client.countDocuments({
    $or: [
      { second_letter_status: { $exists: false } },
      { second_letter_status: null }
    ]
  });
  console.log(`Clients needing initialization: ${needsInit}`);

  // Count clients already having a status (should be 0 on first run)
  const alreadySet = await Client.countDocuments({
    second_letter_status: { $exists: true, $ne: null }
  });
  console.log(`Clients already with second_letter_status: ${alreadySet}`);

  if (needsInit === 0) {
    console.log('\n✅ Nothing to migrate — all clients already have second_letter_status.\n');
    await mongoose.disconnect();
    return;
  }

  if (DRY_RUN) {
    console.log(`\n(dry run — would update ${needsInit} clients to IDLE)\n`);
    await mongoose.disconnect();
    return;
  }

  // Perform the bulk update
  const result = await Client.updateMany(
    {
      $or: [
        { second_letter_status: { $exists: false } },
        { second_letter_status: null }
      ]
    },
    {
      $set: { second_letter_status: 'IDLE' }
    }
  );

  console.log(`\n✅ Updated: ${result.modifiedCount} clients set to IDLE`);

  // Verify the update
  const verifyCount = await Client.countDocuments({ second_letter_status: 'IDLE' });
  console.log(`Verification: ${verifyCount} clients now have status IDLE`);

  const remainingNull = await Client.countDocuments({
    $or: [
      { second_letter_status: { $exists: false } },
      { second_letter_status: null }
    ]
  });
  console.log(`Remaining without status: ${remainingNull}`);

  if (remainingNull > 0) {
    console.warn(`⚠️  WARNING: ${remainingNull} clients still without second_letter_status!`);
  }

  await mongoose.disconnect();
  console.log('\nDisconnected.\n');
}

run().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
