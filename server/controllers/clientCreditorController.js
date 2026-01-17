const { v4: uuidv4 } = require('uuid');
const CreditorService = require('../services/creditorService');
const creditorService = new CreditorService();

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

            // Check current_status (new field) or workflow_status (legacy field)
            const status = client.current_status || client.workflow_status;

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

            if (!client.admin_approved) {
                return res.status(400).json({
                    error: 'Admin approval required',
                    message: 'Die Gläubigerliste muss zuerst von unserem Team überprüft werden.'
                });
            }

            if (client.current_status !== 'awaiting_client_confirmation') {
                return res.status(400).json({
                    error: 'Invalid status',
                    message: 'Gläubigerbestätigung ist in diesem Status nicht möglich.',
                    current_status: client.current_status
                });
            }

            // Process confirmation
            console.log(`✅ Processing client creditor confirmation for ${client.aktenzeichen}...`);

            client.client_confirmed_creditors = true;
            client.client_confirmed_at = new Date();
            client.current_status = 'creditor_contact_initiated';
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

            // Auto-trigger creditor contact
            const creditors = client.final_creditor_list || [];
            let creditorContactResult = null;

            if (creditors.length > 0) {
                try {
                    console.log(`🚀 Auto-triggering creditor contact for ${client.aktenzeichen}...`);
                    creditorContactResult = await this.creditorContactService.processClientCreditorConfirmation(client.aktenzeichen);
                    console.log(`✅ Creditor contact initiated: ${creditorContactResult.emails_sent}/${creditors.length} emails sent`);

                    // Start monitoring
                    if (this.sideConversationMonitor) {
                        // Ensure monitor has access to latest service instance if needed (usually handled via dependency injection)
                        this.sideConversationMonitor.creditorContactService = this.creditorContactService; // Ensuring linkage

                        // Small delay
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        const monitorResult = await this.sideConversationMonitor.startMonitoringForClient(client.aktenzeichen, 1);
                        if (monitorResult && monitorResult.success) {
                            console.log(`✅ Started monitoring ${monitorResult.side_conversations_count} Side Conversations`);
                        }
                    }

                    // Add internal comment to Zendesk
                    if (client.zendesk_ticket_id && creditorContactResult.main_ticket_id) {
                        await this.addZendeskComment(client, creditors, creditorContactResult);
                    }

                } catch (creditorError) {
                    console.error(`❌ Failed to initiate creditor contact:`, creditorError.message);
                }
            }

            res.json({
                success: true,
                message: 'Gläubigerliste erfolgreich bestätigt',
                status: 'creditor_contact_initiated',
                creditor_contact: creditorContactResult ? {
                    emails_sent: creditorContactResult.emails_sent,
                    main_ticket_id: creditorContactResult.main_ticket_id
                } : null
            });

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

    /**
     * Add a new creditor (client-facing)
     * POST /api/clients/:clientId/creditors
     */
    addCreditor = async (req, res) => {
        try {
            const { clientId } = req.params;
            const creditorData = req.body;

            console.log(`👤 Client ${clientId} adding manual creditor: ${creditorData.name}`);

            const result = await creditorService.addCreditorToClient(
                clientId,
                creditorData,
                'client',
                'client'
            );

            if (!result.success) {
                return res.status(400).json({ error: result.error });
            }

            res.json({
                success: true,
                message: `Gläubiger "${creditorData.name}" erfolgreich hinzugefügt`,
                creditor: result.creditor
            });
        } catch (error) {
            console.error('❌ Error adding manual creditor (client):', error);
            res.status(500).json({ error: 'Fehler beim Hinzufügen des Gläubigers', details: error.message });
        }
    }

    /**
     * Get creditors for a client (client-facing)
     * GET /api/clients/:clientId/creditors
     */
    getCreditors = async (req, res) => {
        try {
            const { clientId } = req.params;

            // Security: Verify authenticated client matches requested client
            if (req.clientId && req.clientId !== clientId) {
                return res.status(403).json({ error: 'Forbidden: You can only access your own creditors' });
            }

            console.log(`📋 Client ${clientId} fetching creditors list`);

            const result = await creditorService.getClientWithCreditors(clientId);

            if (!result.success) {
                return res.status(404).json({ error: result.error });
            }

            res.json({
                success: true,
                client: result.client,
                creditors: result.creditors
            });
        } catch (error) {
            console.error('❌ Error fetching creditors (client):', error);
            res.status(500).json({ error: 'Failed to fetch creditors', details: error.message });
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
