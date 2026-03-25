/**
 * Migration: Populate Kanzlei ra-scuric with branding + Zendesk config
 *
 * Extracts hardcoded Scuric values from the codebase into the Kanzlei document.
 * Idempotent — safe to run multiple times (uses $set).
 *
 * Usage: node server/scripts/migrate-kanzlei-config.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Kanzlei = require('../models/Kanzlei');

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const kanzlei = await Kanzlei.findOne({ slug: 'ra-scuric' });
  if (!kanzlei) {
    console.error('Kanzlei ra-scuric not found');
    process.exit(1);
  }

  console.log(`Found kanzlei: ${kanzlei.name} (${kanzlei._id})`);

  // Values extracted from hardcoded strings across the codebase:
  // - creditorEmailService.js: fromName, fromEmail, cc, footer
  // - emailService.js: logo URL, copyright
  // - agentReviewController.js: signature block, logo, address, phone, fax
  // - financialDataReminderService.js: logo, address, phone, fax, contact email
  const branding = {
    firmName: 'Thomas Scuric Rechtsanwälte',
    lawyerName: 'Thomas Scuric',
    logoUrl: 'https://www.schuldnerberatung-anwalt.de/wp-content/uploads/2024/10/Logo-T-Scuric.png',
    email: 'office@scuric.de',
    phone: '0234 913 681 0',
    fax: '0234 913 681 29',
    address: {
      street: 'Bongardstraße 33',
      zip: '44787',
      city: 'Bochum',
    },
    website: 'https://www.schuldnerberatung-anwalt.de',
    impressumUrl: 'https://www.schuldnerberatung-anwalt.de/impressum/',
    datenschutzUrl: 'https://www.schuldnerberatung-anwalt.de/datenschutz/',
    copyright: 'Scuric. Alle Rechte vorbehalten.',
    brandColor: '#961919',
  };

  const integrations = {
    zendesk: {
      enabled: true,
      subdomain: process.env.ZENDESK_SUBDOMAIN || process.env.ZENDESK_DOMAIN,
      email: process.env.ZENDESK_EMAIL || process.env.ZENDESK_API_EMAIL,
      token: process.env.ZENDESK_TOKEN || process.env.ZENDESK_API_TOKEN,
    },
  };

  kanzlei.branding = branding;
  kanzlei.integrations = integrations;
  await kanzlei.save();

  console.log('Updated kanzlei ra-scuric with:');
  console.log(`  branding.firmName: ${branding.firmName}`);
  console.log(`  branding.email: ${branding.email}`);
  console.log(`  branding.address: ${branding.address.street}, ${branding.address.zip} ${branding.address.city}`);
  console.log(`  integrations.zendesk.enabled: ${integrations.zendesk.enabled}`);
  console.log(`  integrations.zendesk.subdomain: ${integrations.zendesk.subdomain || '(not set in env)'}`);

  await mongoose.disconnect();
  console.log('Done.');
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
