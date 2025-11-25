/**
 * Diagnostic Script: Find Missing Document Files
 *
 * This script checks the database for document records and verifies
 * if the actual files exist on the filesystem.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const config = require('./config');
const Client = require('./models/Client');

const uploadsDir = path.join(__dirname, 'uploads');

async function diagnoseClient(clientId) {
  try {
    console.log(`\n🔍 Diagnosing client: ${clientId}\n`);

    // Find client in database
    const client = await Client.findOne({
      $or: [
        { id: clientId },
        { aktenzeichen: clientId }
      ]
    });

    if (!client) {
      console.log(`❌ Client not found in database: ${clientId}`);
      return;
    }

    console.log(`✅ Client found: ${client.firstName} ${client.lastName}`);
    console.log(`   ID: ${client.id}`);
    console.log(`   Aktenzeichen: ${client.aktenzeichen}`);
    console.log(`   Documents: ${client.documents?.length || 0}`);

    if (!client.documents || client.documents.length === 0) {
      console.log(`\n⚠️  Client has no documents in database`);
      return;
    }

    // Check uploads directory
    const clientDirs = [
      path.join(uploadsDir, client.id),
      path.join(uploadsDir, client.aktenzeichen)
    ].filter(dir => fs.existsSync(dir));

    console.log(`\n📁 Client upload directories:`);
    if (clientDirs.length === 0) {
      console.log(`   ❌ No upload directories found`);
      console.log(`   Checked:`);
      console.log(`   - ${path.join(uploadsDir, client.id)}`);
      console.log(`   - ${path.join(uploadsDir, client.aktenzeichen)}`);
    } else {
      clientDirs.forEach(dir => {
        console.log(`   ✅ ${dir}`);
        const files = fs.readdirSync(dir);
        console.log(`      Files: ${files.length}`);
        files.forEach(file => console.log(`      - ${file}`));
      });
    }

    // Check each document
    console.log(`\n📄 Document Analysis:\n`);

    for (const doc of client.documents) {
      console.log(`Document: ${doc.name}`);
      console.log(`  ID: ${doc.id}`);
      console.log(`  Filename: ${doc.filename || 'not set'}`);
      console.log(`  Type: ${doc.type || 'unknown'}`);

      // Try to find the file
      const possiblePaths = [];
      const extension = doc.type ? doc.type.split('/')[1] : 'pdf';

      // Try with document ID
      possiblePaths.push(path.join(uploadsDir, client.id, `${doc.id}.${extension}`));
      possiblePaths.push(path.join(uploadsDir, client.aktenzeichen, `${doc.id}.${extension}`));

      // Try with filename
      if (doc.filename) {
        possiblePaths.push(path.join(uploadsDir, client.id, doc.filename));
        possiblePaths.push(path.join(uploadsDir, client.aktenzeichen, doc.filename));
      }

      // Try with name
      if (doc.name && doc.name !== doc.filename) {
        possiblePaths.push(path.join(uploadsDir, client.id, doc.name));
        possiblePaths.push(path.join(uploadsDir, client.aktenzeichen, doc.name));
      }

      let found = false;
      for (const tryPath of possiblePaths) {
        if (fs.existsSync(tryPath)) {
          console.log(`  ✅ FOUND: ${tryPath}`);
          found = true;
          break;
        }
      }

      if (!found) {
        console.log(`  ❌ FILE NOT FOUND`);
        console.log(`  Tried paths:`);
        possiblePaths.forEach(p => console.log(`    - ${p}`));
      }

      console.log('');
    }

  } catch (error) {
    console.error('Error diagnosing client:', error);
  }
}

async function scanAllClients() {
  try {
    console.log('\n🔍 Scanning all clients for missing files...\n');

    const clients = await Client.find({ documents: { $exists: true, $ne: [] } });

    console.log(`Found ${clients.length} clients with documents\n`);

    let totalDocs = 0;
    let missingDocs = 0;
    const missingByClient = [];

    for (const client of clients) {
      let clientMissing = 0;

      for (const doc of client.documents) {
        totalDocs++;

        const extension = doc.type ? doc.type.split('/')[1] : 'pdf';
        const possiblePaths = [
          path.join(uploadsDir, client.id, `${doc.id}.${extension}`),
          path.join(uploadsDir, client.aktenzeichen, `${doc.id}.${extension}`),
          path.join(uploadsDir, client.id, doc.filename || doc.name),
          path.join(uploadsDir, client.aktenzeichen, doc.filename || doc.name),
        ];

        const found = possiblePaths.some(p => fs.existsSync(p));

        if (!found) {
          missingDocs++;
          clientMissing++;
        }
      }

      if (clientMissing > 0) {
        missingByClient.push({
          id: client.id,
          aktenzeichen: client.aktenzeichen,
          name: `${client.firstName} ${client.lastName}`,
          missing: clientMissing,
          total: client.documents.length
        });
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Total documents: ${totalDocs}`);
    console.log(`   Missing files: ${missingDocs}`);
    console.log(`   Success rate: ${((totalDocs - missingDocs) / totalDocs * 100).toFixed(1)}%\n`);

    if (missingByClient.length > 0) {
      console.log(`\n⚠️  Clients with missing files:\n`);
      missingByClient.forEach(c => {
        console.log(`   ${c.name} (${c.aktenzeichen})`);
        console.log(`   Missing: ${c.missing}/${c.total} documents`);
        console.log(`   ID: ${c.id}\n`);
      });
    }

  } catch (error) {
    console.error('Error scanning clients:', error);
  }
}

async function main() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const args = process.argv.slice(2);

    if (args.length === 0) {
      console.log('\nUsage:');
      console.log('  node diagnose-missing-files.js <client_id>  - Diagnose specific client');
      console.log('  node diagnose-missing-files.js --all        - Scan all clients');
      console.log('');
      process.exit(0);
    }

    if (args[0] === '--all') {
      await scanAllClients();
    } else {
      await diagnoseClient(args[0]);
    }

  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

main();
