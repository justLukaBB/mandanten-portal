/**
 * Backfill contact_status for creditors that were sent emails
 * but whose status was never updated due to an invalid enum value bug.
 *
 * The bug: creditorContactService.js set contact_status to
 * 'email_sent_with_attachment' (invalid) instead of 'email_sent_with_document'.
 * Mongoose silently rejected the update, leaving status at 'no_response'.
 *
 * This script finds all creditors with email_sent_at set but
 * contact_status still at 'no_response', and corrects them.
 *
 * Run with: node server/scripts/backfill-contact-status.js
 *
 * Options:
 *   --dry-run    Preview affected creditors without updating
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const config = require('../config');

const DRY_RUN = process.argv.includes('--dry-run');

async function run() {
  console.log(`\n🔧 Backfill contact_status${DRY_RUN ? ' (DRY RUN)' : ''}\n`);

  await mongoose.connect(config.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  const Client = require('../models/Client');

  // Find all clients that have at least one creditor with the wrong
  // contact_status value, OR with email_sent_at but status still 'no_response'
  const clients = await Client.find({
    'final_creditor_list': {
      $elemMatch: {
        $or: [
          { contact_status: 'email_sent_with_attachment' },
          { email_sent_at: { $exists: true, $ne: null }, contact_status: 'no_response' },
        ],
      },
    },
  }).select('aktenzeichen name final_creditor_list');

  if (clients.length === 0) {
    console.log('✅ No creditors need fixing. All contact statuses are correct.');
    await mongoose.disconnect();
    return;
  }

  let totalFixed = 0;

  for (const client of clients) {
    const affected = client.final_creditor_list.filter(
      (c) => c.contact_status === 'email_sent_with_attachment' ||
             (c.email_sent_at && c.contact_status === 'no_response')
    );

    console.log(`📋 ${client.aktenzeichen} (${client.name || 'unnamed'}) — ${affected.length} creditor(s) to fix:`);

    for (const creditor of affected) {
      const name = creditor.glaeubiger_name || creditor.sender_name || 'Unknown';
      console.log(`   → ${name} (sent: ${creditor.email_sent_at.toISOString()})`);
    }

    if (!DRY_RUN) {
      // Update each affected creditor's contact_status in one bulk operation
      for (const creditor of affected) {
        await Client.updateOne(
          {
            _id: client._id,
            'final_creditor_list.id': creditor.id,
          },
          {
            $set: {
              'final_creditor_list.$.contact_status': 'email_sent_with_document',
            },
          }
        );
      }
      console.log(`   ✅ Fixed ${affected.length} creditor(s)\n`);
    } else {
      console.log(`   (dry run — no changes made)\n`);
    }

    totalFixed += affected.length;
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Total: ${totalFixed} creditor(s) across ${clients.length} client(s)${DRY_RUN ? ' would be' : ''} fixed.`);

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB\n');
}

run().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
