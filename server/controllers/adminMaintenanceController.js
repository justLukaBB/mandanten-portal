const { v4: uuidv4 } = require('uuid');

/**
 * Controller for Admin Maintenance Operations
 * Requires injection of:
 * - creditorContactService
 * - documentReminderService (unless we instantiate it here or pass it)
 * - clientsData (legacy? no, we should use DB)
 * - Client
 * - safeClientUpdate
 */
class AdminMaintenanceController {
    constructor({ creditorContactService, documentReminderService, Client, safeClientUpdate }) {
        this.creditorContactService = creditorContactService;
        this.documentReminderService = documentReminderService;
        this.Client = Client;
        this.safeClientUpdate = safeClientUpdate;
    }

    /**
     * Process timeout creditors
     * POST /api/admin/process-timeout-creditors
     */
    processTimeoutCreditors = async (req, res) => {
        try {
            const { timeout_days = 14 } = req.body;

            console.log(`⏰ Processing timeout creditors (${timeout_days} days)`);

            const result = await this.creditorContactService.processTimeoutCreditors(timeout_days);

            console.log(`✅ Processed ${result.processed_count} timeout creditors`);

            res.json(result);

        } catch (error) {
            console.error('Error processing timeout creditors:', error);
            res.status(500).json({
                error: 'Error processing timeout creditors',
                details: error.message
            });
        }
    }

    /**
     * Manual trigger for document reminder check
     * POST /api/admin/trigger-document-reminders
     */
    triggerDocumentReminders = async (req, res) => {
        try {
            console.log('📧 Admin triggered manual document reminder check');

            const result = await this.documentReminderService.checkAndSendReminders();

            res.json({
                success: true,
                message: 'Document reminder check completed',
                totalChecked: result.totalChecked,
                remindersSent: result.remindersSent,
                errors: result.errors
            });

        } catch (error) {
            console.error('Error in manual document reminder trigger:', error);
            res.status(500).json({
                error: 'Failed to trigger document reminders',
                details: error.message
            });
        }
    }

    /**
     * Check document upload status for specific client
     * POST /api/admin/check-document-status/:clientId
     */
    checkDocumentStatus = async (req, res) => {
        try {
            const { clientId } = req.params;
            console.log(`📄 Admin checking document status for client ${clientId}`);

            const result = await this.documentReminderService.checkDocumentUploadStatus(clientId);

            res.json(result);

        } catch (error) {
            console.error('Error checking document status:', error);
            res.status(500).json({
                error: 'Failed to check document status',
                details: error.message
            });
        }
    }

    /**
     * Fix missing creditor contacts for any client
     * POST /api/clients/:clientId/fix-creditor-contacts
     * (Originally this was public/shared or internal? Server.js had it under admin section or generic?)
     * It was: app.post('/api/clients/:clientId/fix-creditor-contacts', ...)
     * It seems to be a maintenance tool. We'll keep it here, but route might need to be /admin/... or mapped to /api/...
     */
    fixCreditorContacts = async (req, res) => {
        try {
            const clientId = req.params.clientId;

            // Get client from DB 
            // Note: server.js used clientsData[clientId] which is LEGACY. We must use DB now.
            const client = await this.Client.findOne({ $or: [{ id: clientId }, { aktenzeichen: clientId }] });

            if (!client) {
                return res.status(404).json({ error: 'Client not found' });
            }

            console.log(`🔧 Fixing creditor contacts for client: ${clientId} (${client.aktenzeichen})`);

            // Generate creditor contacts from final_creditor_list
            if (client.final_creditor_list && client.final_creditor_list.length > 0) {
                let createdCount = 0;
                client.final_creditor_list.forEach((creditor, index) => {
                    const contactId = `${client.id}-contact-${index + 1}`; // Use client.id not clientId (which might be aktenzeichen)

                    // Check if exists first? Service is map-based in memory? 
                    // creditorContactService usually uses in-memory map `creditorContacts`.
                    // We should check if we need to sync with DB or just memory.
                    // The service implementation seems to use `creditorContacts` Map.

                    if (!this.creditorContactService.creditorContacts.has(contactId)) {
                        // Create creditor contact entry
                        this.creditorContactService.creditorContacts.set(contactId, {
                            id: contactId,
                            client_reference: client.aktenzeichen,
                            creditor_name: creditor.sender_name || creditor.creditor_name,
                            creditor_email: creditor.sender_email || creditor.creditor_email || `${(creditor.sender_name || creditor.creditor_name).toLowerCase().replace(/\s+/g, '.')}@example.com`,
                            reference_number: creditor.reference_number,
                            contact_status: 'completed',
                            final_debt_amount: creditor.claim_amount || creditor.estimated_amount || 0,
                            amount_source: 'creditor_confirmed',
                            response_received_date: new Date().toISOString(),
                            response_data: {
                                creditor_name: creditor.sender_name || creditor.creditor_name,
                                extracted_data: {
                                    final_debt_amount: creditor.claim_amount || creditor.estimated_amount || 0
                                }
                            },
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        });
                        createdCount++;
                    }
                });

                console.log(`✅ Created/Fixed ${createdCount} creditor contacts`);

                return res.json({
                    success: true,
                    message: `Fixed creditor contacts for client ${clientId}`,
                    contacts_created: createdCount,
                    total_contacts: client.final_creditor_list.length,
                    client_status: client.workflow_status
                });
            } else {
                return res.json({
                    success: false,
                    error: 'No creditors found in final_creditor_list',
                    client_status: client.workflow_status
                });
            }

        } catch (error) {
            console.error('❌ Error fixing creditor contacts:', error.message);
            res.status(500).json({
                success: false,
                error: 'Failed to fix creditor contacts',
                details: error.message
            });
        }
    }
}

module.exports = AdminMaintenanceController;
