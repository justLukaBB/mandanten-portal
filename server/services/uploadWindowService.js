const Client = require('../models/Client');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_WINDOW_DAYS = 30;

class UploadWindowService {
    /**
     * Check clients in upload_window_active and promote those whose 30-day window
     * (from payment_received_at) has expired.
     * Clients without payment_received_at are NOT promoted (waiting for 1. Rate).
     * Runs daily via scheduler.
     */
    async checkAndPromoteEligible() {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - UPLOAD_WINDOW_DAYS);

            // Find clients parked in upload_window_active whose payment was received >= 30 days ago
            const candidates = await Client.find({
                current_status: 'upload_window_active',
                payment_received_at: { $exists: true, $ne: null, $lte: cutoffDate }
            }).select('_id id aktenzeichen firstName lastName email payment_received_at admin_approved final_creditor_list');

            console.log(`[UploadWindow] Found ${candidates.length} clients ready for promotion (payment + 30 days expired)`);

            let promoted = 0;
            let skipped = 0;
            let errors = 0;

            for (const client of candidates) {
                try {
                    const creditors = client.final_creditor_list || [];
                    const hasCreditorsNeedingReview = creditors.some(c => c.needs_manual_review === true && !c.manually_reviewed);

                    if (hasCreditorsNeedingReview) {
                        await Client.findByIdAndUpdate(client._id, {
                            $set: {
                                current_status: 'creditor_review',
                                workflow_status: 'admin_review',
                                updated_at: new Date()
                            },
                            $push: {
                                status_history: {
                                    id: uuidv4(),
                                    status: 'creditor_review',
                                    changed_by: 'system',
                                    metadata: {
                                        reason: 'Payment upload window expired — creditors need review',
                                        promoted_from: 'upload_window_active',
                                        payment_received_at: client.payment_received_at
                                    },
                                    created_at: new Date()
                                }
                            }
                        });
                        console.log(`  ${client.aktenzeichen} → creditor_review (has creditors needing review)`);
                        promoted++;
                    } else {
                        // All good — promote to client confirmation
                        await Client.findByIdAndUpdate(client._id, {
                            $set: {
                                current_status: 'awaiting_client_confirmation',
                                workflow_status: 'client_confirmation',
                                updated_at: new Date()
                            },
                            $push: {
                                status_history: {
                                    id: uuidv4(),
                                    status: 'awaiting_client_confirmation',
                                    changed_by: 'system',
                                    metadata: {
                                        reason: 'Payment upload window expired — auto-promoted',
                                        promoted_from: 'upload_window_active',
                                        payment_received_at: client.payment_received_at,
                                        creditors_count: creditors.length
                                    },
                                    created_at: new Date()
                                }
                            }
                        });

                        // Send creditor confirmation email
                        try {
                            const emailService = require('./emailService');
                            const portalUrl = `${process.env.FRONTEND_URL || 'https://mandanten-portal.onrender.com'}/login`;
                            const totalDebt = creditors.reduce((sum, c) => sum + (c.claim_amount || 0), 0);
                            await emailService.sendCreditorConfirmationEmail(client.email, client, creditors, portalUrl, totalDebt);
                            console.log(`  ${client.aktenzeichen} → awaiting_client_confirmation + email sent`);
                        } catch (emailErr) {
                            console.log(`  ${client.aktenzeichen} → awaiting_client_confirmation (email failed: ${emailErr.message})`);
                        }

                        promoted++;
                    }
                } catch (err) {
                    console.error(`  ${client.aktenzeichen} — ERROR: ${err.message}`);
                    errors++;
                }
            }

            // Log clients still waiting for payment (not promoted)
            const waitingForPayment = await Client.countDocuments({
                current_status: 'upload_window_active',
                $or: [
                    { payment_received_at: { $exists: false } },
                    { payment_received_at: null }
                ]
            });
            if (waitingForPayment > 0) {
                console.log(`[UploadWindow] ${waitingForPayment} clients in upload_window_active still waiting for 1. Rate`);
            }

            console.log(`[UploadWindow] Done: ${promoted} promoted, ${skipped} skipped, ${errors} errors`);
            return { promoted, skipped, errors, total: candidates.length, waiting_for_payment: waitingForPayment };
        } catch (error) {
            console.error('[UploadWindow] Error checking eligible clients:', error);
            throw error;
        }
    }
}

module.exports = UploadWindowService;
