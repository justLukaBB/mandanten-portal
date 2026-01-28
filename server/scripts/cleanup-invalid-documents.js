/**
 * Cleanup Script for Invalid Documents and Creditors
 *
 * Fixes:
 * 1. Documents with invalid document_status (e.g., 'processing_failed')
 * 2. Documents missing required 'id' field
 * 3. Documents missing required 'name' field
 * 4. Creditors in final_creditor_list missing required 'id' field
 *
 * Run with: node server/scripts/cleanup-invalid-documents.js
 *
 * Add --dry-run to preview changes without saving
 * Add --client=<clientId> to fix only a specific client
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// Valid enum values from schema
const VALID_DOCUMENT_STATUS = [
  'pending', 'creditor_confirmed', 'non_creditor', 'non_creditor_confirmed',
  'not_a_creditor', 'duplicate', 'unclear', 'needs_review'
];

const VALID_PROCESSING_STATUS = [
  'pending', 'processing', 'completed', 'error', 'failed'
];

// Status mapping for invalid values
const STATUS_FIXES = {
  'processing_failed': 'needs_review',
  'failed': 'needs_review',
  'error': 'needs_review',
  'unknown': 'pending',
  'queued': 'pending'
};

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const clientIdArg = args.find(a => a.startsWith('--client='));
const SPECIFIC_CLIENT = clientIdArg ? clientIdArg.split('=')[1] : null;

console.log('\n========================================');
console.log('  DOCUMENT & CREDITOR CLEANUP SCRIPT');
console.log('========================================');
console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be saved)' : 'LIVE (changes will be saved)'}`);
if (SPECIFIC_CLIENT) {
  console.log(`Target: Client ${SPECIFIC_CLIENT} only`);
}
console.log('========================================\n');

async function connectDB() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI environment variable not set');
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB\n');
}

async function cleanup() {
  await connectDB();

  // Get Client model (direct access to bypass validation on read)
  const Client = mongoose.connection.collection('clients');

  // Build query
  const query = SPECIFIC_CLIENT ? { id: SPECIFIC_CLIENT } : {};

  const clients = await Client.find(query).toArray();
  console.log(`Found ${clients.length} client(s) to check\n`);

  let stats = {
    clientsChecked: 0,
    clientsFixed: 0,
    documentsFixed: 0,
    documentStatusFixed: 0,
    documentIdFixed: 0,
    documentNameFixed: 0,
    creditorsFixed: 0,
    creditorIdFixed: 0
  };

  for (const client of clients) {
    stats.clientsChecked++;
    let clientModified = false;
    const clientId = client.id || client._id;
    const aktenzeichen = client.aktenzeichen || 'NO_AKT';

    console.log(`\n--- Client: ${aktenzeichen} (${clientId}) ---`);

    // Fix documents
    if (client.documents && Array.isArray(client.documents)) {
      for (let i = 0; i < client.documents.length; i++) {
        const doc = client.documents[i];
        let docModified = false;

        // Fix missing id
        if (!doc.id) {
          const newId = uuidv4();
          console.log(`  [DOC ${i}] Missing id -> Generated: ${newId}`);
          doc.id = newId;
          docModified = true;
          stats.documentIdFixed++;
        }

        // Fix missing name
        if (!doc.name) {
          const fallbackName = doc.filename || doc.url?.split('/').pop()?.split('?')[0] || `Document_${doc.id || i}`;
          console.log(`  [DOC ${i}] Missing name -> Set to: ${fallbackName}`);
          doc.name = fallbackName;
          docModified = true;
          stats.documentNameFixed++;
        }

        // Fix invalid document_status
        if (doc.document_status && !VALID_DOCUMENT_STATUS.includes(doc.document_status)) {
          const fixedStatus = STATUS_FIXES[doc.document_status] || 'needs_review';
          console.log(`  [DOC ${i}] Invalid document_status: '${doc.document_status}' -> '${fixedStatus}'`);
          doc.document_status = fixedStatus;
          docModified = true;
          stats.documentStatusFixed++;
        }

        // Fix invalid processing_status
        if (doc.processing_status && !VALID_PROCESSING_STATUS.includes(doc.processing_status)) {
          const fixedStatus = 'failed';
          console.log(`  [DOC ${i}] Invalid processing_status: '${doc.processing_status}' -> '${fixedStatus}'`);
          doc.processing_status = fixedStatus;
          docModified = true;
        }

        if (docModified) {
          stats.documentsFixed++;
          clientModified = true;
        }
      }
    }

    // Fix final_creditor_list
    if (client.final_creditor_list && Array.isArray(client.final_creditor_list)) {
      for (let i = 0; i < client.final_creditor_list.length; i++) {
        const creditor = client.final_creditor_list[i];
        let creditorModified = false;

        // Fix missing id
        if (!creditor.id) {
          const newId = uuidv4();
          const creditorName = creditor.sender_name || creditor.glaeubiger_name || `Creditor_${i}`;
          console.log(`  [CREDITOR ${i}] Missing id for "${creditorName}" -> Generated: ${newId}`);
          creditor.id = newId;
          creditorModified = true;
          stats.creditorIdFixed++;
        }

        if (creditorModified) {
          stats.creditorsFixed++;
          clientModified = true;
        }
      }
    }

    // Save if modified
    if (clientModified) {
      stats.clientsFixed++;

      if (DRY_RUN) {
        console.log(`  -> Would save changes (DRY RUN)`);
      } else {
        try {
          await Client.updateOne(
            { _id: client._id },
            {
              $set: {
                documents: client.documents,
                final_creditor_list: client.final_creditor_list
              }
            }
          );
          console.log(`  -> Changes saved successfully`);
        } catch (err) {
          console.error(`  -> ERROR saving: ${err.message}`);
        }
      }
    } else {
      console.log(`  No issues found`);
    }
  }

  // Print summary
  console.log('\n========================================');
  console.log('  CLEANUP SUMMARY');
  console.log('========================================');
  console.log(`Clients checked:        ${stats.clientsChecked}`);
  console.log(`Clients with issues:    ${stats.clientsFixed}`);
  console.log(`Documents fixed:        ${stats.documentsFixed}`);
  console.log(`  - document_status:    ${stats.documentStatusFixed}`);
  console.log(`  - missing id:         ${stats.documentIdFixed}`);
  console.log(`  - missing name:       ${stats.documentNameFixed}`);
  console.log(`Creditors fixed:        ${stats.creditorsFixed}`);
  console.log(`  - missing id:         ${stats.creditorIdFixed}`);
  console.log('========================================');

  if (DRY_RUN) {
    console.log('\n** DRY RUN - No changes were saved **');
    console.log('Run without --dry-run to apply fixes\n');
  } else {
    console.log('\n** All changes have been saved **\n');
  }

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB');
}

// Run
cleanup()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Cleanup failed:', err);
    process.exit(1);
  });
