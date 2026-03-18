const { v4: uuidv4 } = require('uuid');

/**
 * Controller for Client Creditor Operations
 * Handles confirmation, contact, and monitoring scenarios.
 */
class ClientCreditorController {
    /**
     * @param {Object} dependencies
     * @param {Model} dependencies.Client
     * @param {Object} dependencies.clientsData (Legacy in-memory support)
     * @param {Object} dependencies.creditorContactService
     * @param {Object} dependencies.sideConversationMonitor
     */
    constructor({ Client, clientsData, creditorContactService, sideConversationMonitor }) {
        this.Client = Client;
        this.clientsData = clientsData;
        this.creditorContactService = creditorContactService;
        this.sideConversationMonitor = sideConversationMonitor;
    }

    /**
     * Get list of creditors for client confirmation
     * GET /api/clients/:clientId/creditor-confirmation
     */
    getCreditorConfirmation = async (req, res) => {
        try {
            const clientId = req.params.clientId;
            const client = await this.getClient(clientId);

            if (!client) {
                return res.status(404).json({ error: 'Client not found' });
            }

            // Check both current_status and workflow_status — use the most advanced one
            const cs = client.current_status || '';
            const ws = client.workflow_status || '';
            // If either status indicates client_confirmation phase, use that
            const isConfirmationPhase = cs === 'awaiting_client_confirmation' || ws === 'client_confirmation' || ws === 'awaiting_client_confirmation';
            const status = isConfirmationPhase ? 'awaiting_client_confirmation' : (cs || ws);

            console.log(`🔍 Creditor confirmation check for ${client.aktenzeichen}:`, {
                current_status: client.current_status,
                workflow_status: client.workflow_status,
                admin_approved: client.admin_approved,
                client_confirmed_creditors: client.client_confirmed_creditors,
                status: status
            });

            // For new clients
            if (status === 'portal_access_sent' || status === 'created') {
                return res.json({
                    workflow_status: status,
                    creditors: [],
                    client_confirmed: false,
                    confirmation_deadline: null,
                    message: 'Bitte laden Sie zuerst Ihre Gläubigerdokumente hoch.'
                });
            }

            // Auto-approve logic check
            const isAutoApproved = client.first_payment_received && client.seven_day_review_triggered && status === 'creditor_review';

            if (!client.admin_approved && !isAutoApproved) {
                return res.json({
                    workflow_status: status,
                    creditors: [],
                    client_confirmed: false,
                    confirmation_deadline: null,
                    message: 'Ihre Gläubigerliste wird noch von unserem Team überprüft.'
                });
            }

            // Show creditors conditions
            if (status === 'awaiting_client_confirmation' || status === 'client_confirmation' || status === 'completed' ||
                (status === 'creditor_review' && client.first_payment_received && client.seven_day_review_triggered)) {

                const validCreditors = (client.final_creditor_list || []).filter(creditor => {
                    // Hide creditors that need manual review but haven't been reviewed yet
                    if (creditor.needs_manual_review && !creditor.manually_reviewed) {
                        return false;
                    }

                    const doc = (client.documents || []).find(d =>
                        d.id === creditor.document_id ||
                        d.id === creditor.source_document_id ||
                        d.name === creditor.source_document
                    );
                    return !doc || doc.is_creditor_document !== false;
                });

                return res.json({
                    workflow_status: status,
                    creditors: validCreditors,
                    client_confirmed: client.client_confirmed_creditors || false,
                    confirmation_deadline: null
                });
            }

            // Default
            return res.json({
                workflow_status: status,
                creditors: [],
                client_confirmed: false,
                confirmation_deadline: null,
                message: 'Gläubigerliste wird noch verarbeitet.'
            });

        } catch (error) {
            console.error('Error fetching creditor confirmation:', error);
            res.status(500).json({
                error: 'Error fetching creditor confirmation data',
                details: error.message
            });
        }
    }

    /**
     * Confirm creditors by client
     * POST /api/clients/:clientId/confirm-creditors
     */
    confirmCreditors = async (req, res) => {
        try {
            const clientId = req.params.clientId;
            const client = await this.getClient(clientId);

            if (!client) {
                return res.status(404).json({ error: 'Client not found' });
            }

            // Payment + admin approval are no longer blocking for creditor confirmation.
            // The admin handles payment marking separately; the client should be able to
            // confirm their creditor list as soon as it's ready for review.
            if (!client.first_payment_received) {
                console.log(`[CreditorConfirm] Warning: ${client.aktenzeichen} confirming without payment — proceeding anyway`);
            }

            const allowedForConfirmation =
                client.current_status === 'awaiting_client_confirmation' ||
                client.workflow_status === 'client_confirmation' ||
                client.workflow_status === 'admin_review' ||
                client.current_status === 'creditor_review';
            if (!allowedForConfirmation) {
                return res.status(400).json({
                    error: 'Invalid status',
                    message: 'Gläubigerbestätigung ist in diesem Status nicht möglich.',
                    current_status: client.current_status,
                    workflow_status: client.workflow_status
                });
            }

            // Process confirmation
            console.log(`✅ Processing client creditor confirmation for ${client.aktenzeichen}...`);

            // Ensure all creditors have an ID (fix for legacy data)
            if (client.final_creditor_list && client.final_creditor_list.length > 0) {
                client.final_creditor_list.forEach((creditor, index) => {
                    if (!creditor.id) {
                        creditor.id = uuidv4();
                        console.log(`⚠️ Generated missing ID for creditor at index ${index}: ${creditor.sender_name}`);
                    }
                });
            }

            client.client_confirmed_creditors = true;
            client.client_confirmed_at = new Date();
            client.current_status = 'creditor_contact_initiated';
            client.phase = 2;
            client.workflow_status = 'creditor_contact_active';
            client.updated_at = new Date();

            client.status_history.push({
                id: uuidv4(),
                status: 'client_creditors_confirmed',
                changed_by: 'client',
                metadata: {
                    confirmed_at: new Date(),
                    creditors_count: (client.final_creditor_list || []).length,
                    admin_approved: client.admin_approved
                }
            });

            await this.saveClient(client);

            // --- Fast path: respond immediately after DB save ---
            res.json({
                success: true,
                message: 'Gläubigerliste erfolgreich bestätigt',
                status: 'creditor_contact_initiated'
            });

            // --- Slow path: fire-and-forget email sending ---
            const aktenzeichen = client.aktenzeichen;
            const creditors = client.final_creditor_list || [];

            if (creditors.length > 0) {
                const Client = require('../models/Client');
                (async () => {
                    try {
                        console.log(`🔄 [Background] Starting creditor contact for ${aktenzeichen}...`);
                        const creditorContactResult = await this.creditorContactService.processClientCreditorConfirmation(aktenzeichen);
                        console.log(`✅ [Background] Creditor contact completed: ${creditorContactResult.emails_sent}/${creditors.length} emails sent`);

                        // Mark creditor contact as started after successful send
                        await Client.updateOne(
                            { aktenzeichen },
                            {
                                $set: {
                                    creditor_contact_started: true,
                                    creditor_contact_started_at: new Date(),
                                }
                            }
                        );
                        console.log(`✅ [Background] Set creditor_contact_started=true for ${aktenzeichen}`);

                        if (this.sideConversationMonitor) {
                            this.sideConversationMonitor.creditorContactService = this.creditorContactService;
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            const monitorResult = await this.sideConversationMonitor.startMonitoringForClient(aktenzeichen, 1);
                            if (monitorResult && monitorResult.success) {
                                console.log(`✅ [Background] Started monitoring ${monitorResult.side_conversations_count} Side Conversations`);
                            }
                        }

                        if (client.zendesk_ticket_id && creditorContactResult.main_ticket_id) {
                            await this.addZendeskComment(client, creditors, creditorContactResult);
                        }

                        console.log(`✅ [Background] All creditor contact tasks completed for ${aktenzeichen}`);
                    } catch (bgError) {
                        console.error(`❌ [Background] Failed creditor contact for ${aktenzeichen}:`, bgError.message);
                        // Persist failure so admin can see it and retry
                        await Client.updateOne(
                            { aktenzeichen },
                            {
                                $set: {
                                    current_status: 'creditor_contact_failed',
                                    creditor_contact_error: bgError.message,
                                    creditor_contact_failed_at: new Date(),
                                }
                            }
                        ).catch(dbErr => console.error(`❌ [Background] Could not persist failure status:`, dbErr.message));
                    }
                })();
            }

        } catch (error) {
            console.error('Error confirming creditors:', error);
            res.status(500).json({ error: 'Error confirming creditors', details: error.message });
        }
    }

    /**
     * Start creditor contact process manually (Admin)
     * POST /api/clients/:clientId/start-creditor-contact
     */
    startCreditorContact = async (req, res) => {
        try {
            const clientId = req.params.clientId;
            const client = await this.getClient(clientId);

            if (!client) {
                return res.status(404).json({ error: 'Client not found' });
            }

            if (!client.first_payment_received) {
                return res.status(400).json({
                    error: 'Payment required',
                    message: 'Die erste Rate muss bezahlt sein, bevor Gläubiger kontaktiert werden können.'
                });
            }

            // Only allow if client has confirmed creditors or process is completed
            if (client.workflow_status !== 'completed' && client.current_status !== 'client_creditors_confirmed' && client.current_status !== 'creditor_contact_initiated') {
                // Be permissive if it's "completed" as per legacy check
                if (client.workflow_status !== 'completed') {
                    return res.status(400).json({
                        error: 'Creditor contact can only be started after client confirmation',
                        current_status: client.workflow_status
                    });
                }
            }

            console.log(`🚀 Starting Zendesk creditor contact process for client ${clientId}`);

            const clientData = {
                name: `${client.firstName} ${client.lastName}`,
                email: client.email
            };

            const result = await this.creditorContactService.processClientCreditorConfirmation(client.aktenzeichen, clientData);

            if (result.success) {
                client.creditor_contact_started = true;
                client.creditor_contact_started_at = new Date().toISOString();
                client.workflow_status = 'creditor_contact_active';
                await this.saveClient(client);
            }

            res.json(result);

        } catch (error) {
            console.error('Error starting creditor contact process:', error);
            res.status(500).json({ error: 'Error starting creditor contact process', details: error.message });
        }
    }

    /**
     * Resend creditor emails
     * POST /api/clients/:clientId/resend-creditor-emails
     */
    resendCreditorEmails = async (req, res) => {
        try {
            const clientId = req.params.clientId;
            const client = await this.getClient(clientId);

            if (!client) return res.status(404).json({ error: 'Client not found' });

            if (!client.creditor_contact_started) {
                return res.status(400).json({ error: 'Creditor contact process has not been started yet' });
            }

            const status = await this.creditorContactService.getClientCreditorStatus(client.aktenzeichen);
            if (!status.creditor_contacts || status.creditor_contacts.length === 0) {
                return res.status(400).json({ error: 'No creditor contacts found to resend' });
            }

            let emailsSent = 0;
            const results = [];

            for (let i = 0; i < status.creditor_contacts.length; i++) {
                const contact = status.creditor_contacts[i];
                try {
                    if (contact.zendesk_ticket_id) {
                        const clientInfo = { name: `${client.firstName} ${client.lastName}`, email: client.email };
                        await this.creditorContactService.zendesk.sendCreditorEmailViaTicket(
                            contact.zendesk_ticket_id,
                            contact,
                            clientInfo
                        );
                        emailsSent++;
                        results.push({ creditor_name: contact.creditor_name, success: true });
                        if (i < status.creditor_contacts.length - 1) await new Promise(r => setTimeout(r, 3000));
                    }
                } catch (e) {
                    results.push({ creditor_name: contact.creditor_name, success: false, error: e.message });
                }
            }

            res.json({
                success: true,
                emails_sent: emailsSent,
                results
            });

        } catch (error) {
            console.error('Error re-sending emails:', error);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Get creditor contact status
     * GET /api/clients/:clientId/creditor-contact-status
     */
    getCreditorContactStatus = async (req, res) => {
        try {
            const clientId = req.params.clientId;
            const client = await this.getClient(clientId);
            if (!client) return res.status(404).json({ error: 'Client not found' });

            const status = await this.creditorContactService.getClientCreditorStatus(client.aktenzeichen);
            res.json({
                ...status,
                client_info: {
                    name: `${client.firstName} ${client.lastName}`,
                    email: client.email,
                    workflow_status: client.workflow_status,
                    creditor_contact_started: client.creditor_contact_started
                }
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Get final debt summary
     * GET /api/clients/:clientId/final-debt-summary
     */
    getFinalDebtSummary = async (req, res) => {
        try {
            const clientId = req.params.clientId;
            const client = await this.getClient(clientId);
            if (!client) return res.status(404).json({ error: 'Client not found' });

            const summary = await this.creditorContactService.getFinalDebtSummary(client.aktenzeichen);
            res.json({
                ...summary,
                client_info: {
                    name: `${client.firstName} ${client.lastName}`,
                    email: client.email
                }
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // --- Helpers ---

    async getClient(clientId) {
        let client = await this.Client.findOne({ id: clientId });
        if (!client) client = await this.Client.findOne({ aktenzeichen: clientId });
        // Fallback to memory if not found in DB but exists in memory (optional per legacy)
        if (!client && this.clientsData && this.clientsData[clientId]) {
            return this.clientsData[clientId];
        }
        return client;
    }

    async saveClient(client) {
        if (client.save) return await client.save();
        return client; // In-memory object is already updated by reference
    }

    async addZendeskComment(client, creditors, result) {
        try {
            // Re-instantiate service locally if needed, but preferably use injected service's zendesk property
            const zendeskService = this.creditorContactService.zendesk;

            const creditorsList = creditors.map((c, index) =>
                `${index + 1}. **${c.creditor_name}** - €${(c.claim_amount || 0).toFixed(2)}`
            ).join('\n');

            await zendeskService.addInternalComment(client.zendesk_ticket_id, {
                content: `🚀 **GLÄUBIGER-KONTAKT INITIIERT**

✅ **Client bestätigt:** ${client.firstName} ${client.lastName} (${client.aktenzeichen})
📧 **Emails verschickt:** ${result.emails_sent}/${creditors.length}
🎫 **Hauptticket:** ${result.main_ticket_id}

📋 **Kontaktierte Gläubiger:**
${creditorsList}

**💰 Gesamtschulden:** €${creditors.reduce((sum, c) => sum + (c.claim_amount || 0), 0).toFixed(2)}

⏳ **Nächste Schritte:**
• Gläubiger haben 14 Tage Zeit zu antworten
• Antworten werden automatisch im Hauptticket ${result.main_ticket_id} verarbeitet
• Bei fehlenden Antworten wird automatische Nachfassung eingeleitet

**Status:** Warten auf Gläubiger-Antworten`,
                status: 'pending'
            });
            console.log(`✅ Added creditor contact documentation to ticket ${client.zendesk_ticket_id}`);
        } catch (error) {
            console.error(`❌ Failed to add creditor contact comment:`, error.message);
        }
    }
}

module.exports = ClientCreditorController;
