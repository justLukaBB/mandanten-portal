#!/usr/bin/env node
/**
 * Backfill email_body_full for existing CreditorEmail records.
 *
 * Fetches the full email body from the creditor-email-matcher API
 * and updates CreditorEmail records that only have a truncated preview.
 *
 * Usage:
 *   node server/scripts/backfill-email-body.js           # dry run
 *   node server/scripts/backfill-email-body.js --execute  # actually update
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MATCHER_API = process.env.MATCHER_API_URL || 'https://creditor-email-matcher.onrender.com';
const MONGO_URI = process.env.MONGODB_URI;
const EXECUTE = process.argv.includes('--execute');

if (!MONGO_URI) {
  console.error('ERROR: MONGODB_URI environment variable required');
  process.exit(1);
}

const CreditorEmail = require('../models/CreditorEmail');

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // Find all CreditorEmail records without email_body_full
  const emails = await CreditorEmail.find({
    email_body_full: { $exists: false },
    email_id: { $ne: null },
  }).lean();

  console.log(`Found ${emails.length} emails without full body\n`);

  let updated = 0;
  let skipped = 0;

  for (const email of emails) {
    const matcherEmailId = email.email_id;
    if (!matcherEmailId) {
      skipped++;
      continue;
    }

    try {
      const resp = await fetch(`${MATCHER_API}/api/v1/jobs/${matcherEmailId}`);
      if (!resp.ok) {
        console.log(`  SKIP ID=${matcherEmailId} - matcher returned ${resp.status}`);
        skipped++;
        continue;
      }

      const job = await resp.json();
      const fullBody = job.raw_body_text;

      if (!fullBody) {
        console.log(`  SKIP ID=${matcherEmailId} - no raw_body_text in matcher`);
        skipped++;
        continue;
      }

      console.log(`  ${EXECUTE ? 'UPDATE' : 'WOULD UPDATE'} ${email.creditor_name} (matcher ID=${matcherEmailId}) - ${fullBody.length} chars`);

      if (EXECUTE) {
        await CreditorEmail.updateOne(
          { _id: email._id },
          { $set: { email_body_full: fullBody } }
        );
        updated++;
      }
    } catch (err) {
      console.log(`  ERR ID=${matcherEmailId} - ${err.message}`);
      skipped++;
    }

    // Small delay
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`);
  if (!EXECUTE && emails.length > 0) {
    console.log('Dry run complete. Use --execute to apply changes.');
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
