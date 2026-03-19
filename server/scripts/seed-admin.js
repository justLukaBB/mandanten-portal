/**
 * Seed script: Creates initial Kanzlei + AdminUser + migrates existing clients.
 *
 * Usage: node scripts/seed-admin.js
 *
 * Environment variables:
 *   ADMIN_EMAIL    - Admin email (required)
 *   ADMIN_PASSWORD - Admin password (required)
 *   KANZLEI_NAME   - Kanzlei name (default: "RA Scuric")
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const Kanzlei = require('../models/Kanzlei');
const AdminUser = require('../models/AdminUser');
const Client = require('../models/Client');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set');
  process.exit(1);
}

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const kanzleiName = process.env.KANZLEI_NAME || 'RA Scuric';

  if (!email || !password) {
    console.error('ADMIN_EMAIL and ADMIN_PASSWORD must be set');
    process.exit(1);
  }

  // 1. Create or find Kanzlei
  let kanzlei = await Kanzlei.findOne({ slug: 'ra-scuric' });
  if (!kanzlei) {
    kanzlei = await Kanzlei.create({
      id: uuidv4(),
      name: kanzleiName,
      slug: 'ra-scuric',
      email: email
    });
    console.log(`Created Kanzlei: ${kanzlei.name} (${kanzlei.id})`);
  } else {
    console.log(`Kanzlei exists: ${kanzlei.name} (${kanzlei.id})`);
  }

  // 2. Create or update AdminUser
  let admin = await AdminUser.findOne({ email: email.toLowerCase() });
  if (!admin) {
    admin = await AdminUser.create({
      id: uuidv4(),
      email: email.toLowerCase(),
      password_hash: password, // pre-save hook will bcrypt it
      first_name: 'Admin',
      last_name: kanzleiName,
      kanzleiId: kanzlei.id,
      role: 'superadmin' // First admin is superadmin
    });
    console.log(`Created AdminUser: ${admin.email} (role: ${admin.role})`);
  } else {
    console.log(`AdminUser exists: ${admin.email} (role: ${admin.role})`);
  }

  // 3. Migrate existing clients: set kanzleiId where missing
  const clientsWithoutKanzlei = await Client.countDocuments({
    $or: [{ kanzleiId: { $exists: false } }, { kanzleiId: null }, { kanzleiId: '' }]
  });

  if (clientsWithoutKanzlei > 0) {
    const result = await Client.updateMany(
      { $or: [{ kanzleiId: { $exists: false } }, { kanzleiId: null }, { kanzleiId: '' }] },
      { $set: { kanzleiId: kanzlei.id } }
    );
    console.log(`Migrated ${result.modifiedCount} clients to Kanzlei "${kanzlei.name}"`);
  } else {
    console.log('All clients already have kanzleiId');
  }

  // Summary
  const totalClients = await Client.countDocuments({ kanzleiId: kanzlei.id });
  console.log(`\nSummary:`);
  console.log(`  Kanzlei: ${kanzlei.name} (${kanzlei.id})`);
  console.log(`  Admin: ${admin.email} (${admin.role})`);
  console.log(`  Clients: ${totalClients}`);

  await mongoose.disconnect();
  console.log('\nDone.');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
