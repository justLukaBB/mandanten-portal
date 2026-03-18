/**
 * Migration: Remove Payment Gate
 *
 * Migrates existing clients stuck in `waiting_for_payment` or `payment_confirmed`
 * status to the new flow where payment is no longer a blocking gate.
 *
 * Usage: node server/scripts/migrate-remove-payment-gate.js [--dry-run]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Client = require('../models/Client');

const DRY_RUN = process.argv.includes('--dry-run');

async function migrate() {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        console.error('MONGODB_URI not set');
        process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log(`Connected to MongoDB${DRY_RUN ? ' (DRY RUN)' : ''}\n`);

    // 1. Clients stuck in waiting_for_payment
    const waitingClients = await Client.find({
        current_status: 'waiting_for_payment'
    });

    console.log(`Found ${waitingClients.length} clients in waiting_for_payment\n`);

    for (const client of waitingClients) {
        const creditors = client.final_creditor_list || [];
        const hasCreditorsNeedingReview = creditors.some(c => c.needs_manual_review === true);

        let newStatus, newWorkflow;

        if (creditors.length === 0) {
            // No creditors — route to review
            newStatus = 'creditor_review';
            newWorkflow = 'admin_review';
        } else if (hasCreditorsNeedingReview) {
            // Creditors need review
            newStatus = 'creditor_review';
            newWorkflow = 'admin_review';
        } else {
            // All creditors OK — auto-approve to client confirmation
            newStatus = 'awaiting_client_confirmation';
            newWorkflow = 'client_confirmation';
        }

        console.log(`  ${client.aktenzeichen}: waiting_for_payment → ${newStatus} (${creditors.length} creditors, ${hasCreditorsNeedingReview ? 'needs review' : 'OK'})`);

        if (!DRY_RUN) {
            const updateFields = {
                current_status: newStatus,
                workflow_status: newWorkflow,
            };

            if (newStatus === 'awaiting_client_confirmation') {
                updateFields.admin_approved = true;
                updateFields.admin_approved_at = new Date();
                updateFields.admin_approved_by = 'migration_script';
            }

            await Client.findByIdAndUpdate(client._id, updateFields);
        }
    }

    // 2. Clients in payment_confirmed that should advance
    const paymentConfirmedClients = await Client.find({
        current_status: 'payment_confirmed'
    });

    console.log(`\nFound ${paymentConfirmedClients.length} clients in payment_confirmed\n`);

    for (const client of paymentConfirmedClients) {
        const creditors = client.final_creditor_list || [];
        const hasCreditorsNeedingReview = creditors.some(c => c.needs_manual_review === true);
        const docs = client.documents || [];
        const hasProcessingDocs = docs.some(d => d.processing_status === 'processing');

        let newStatus, newWorkflow;

        if (hasProcessingDocs) {
            // Still processing — keep in documents_processing
            newStatus = 'documents_processing';
            newWorkflow = 'documents_processing';
        } else if (creditors.length === 0 && docs.length === 0) {
            // No docs, no creditors — keep as-is (portal_access_sent)
            newStatus = 'portal_access_sent';
            newWorkflow = 'portal_access_sent';
        } else if (creditors.length === 0) {
            newStatus = 'creditor_review';
            newWorkflow = 'admin_review';
        } else if (hasCreditorsNeedingReview) {
            newStatus = 'creditor_review';
            newWorkflow = 'admin_review';
        } else {
            newStatus = 'awaiting_client_confirmation';
            newWorkflow = 'client_confirmation';
        }

        console.log(`  ${client.aktenzeichen}: payment_confirmed → ${newStatus}`);

        if (!DRY_RUN) {
            const updateFields = {
                current_status: newStatus,
                workflow_status: newWorkflow,
            };

            if (newStatus === 'awaiting_client_confirmation') {
                updateFields.admin_approved = true;
                updateFields.admin_approved_at = new Date();
                updateFields.admin_approved_by = 'migration_script';
            }

            await Client.findByIdAndUpdate(client._id, updateFields);
        }
    }

    // 3. Set first_payment_received = true for all clients without it (backward compat)
    const unpaidCount = await Client.countDocuments({ first_payment_received: { $ne: true } });
    console.log(`\n${unpaidCount} clients without first_payment_received flag`);

    if (!DRY_RUN && unpaidCount > 0) {
        await Client.updateMany(
            { first_payment_received: { $ne: true } },
            { $set: { first_payment_received: true } }
        );
        console.log(`Set first_payment_received=true for all ${unpaidCount} clients`);
    }

    const totalMigrated = waitingClients.length + paymentConfirmedClients.length;
    console.log(`\n${DRY_RUN ? '[DRY RUN] Would migrate' : 'Migrated'} ${totalMigrated} clients`);

    await mongoose.disconnect();
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
