const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

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
                (async () => {
                    try {
                        console.log(`🔄 [Background] Starting creditor contact for ${aktenzeichen}...`);
                        const creditorContactResult = await this.creditorContactService.processClientCreditorConfirmation(aktenzeichen);
                        console.log(`✅ [Background] Creditor contact completed: ${creditorContactResult.emails_sent}/${creditors.length} emails sent`);

                        if (this.sideConversationMonitor) {
                            this.sideConversationMonitor.creditorContactService = this.creditorContactService;
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            const monitorResult = await this.sideConversationMonitor.startMonitoringForClient(aktenzeichen, 1);
                            if (monitorResult && monitorResult.success) {
                                console.log(`✅ [Background] Started monitoring ${monitorResult.side_conversations_count} Side Conversations`);
                            }
                        }

                        // Send confirmation email to client with Gläubigerliste PDF + DOCX attachments (delayed, business hours only)
                        try {
                            const SystemSettings = require('../models/SystemSettings');
                            const delayHours = await SystemSettings.getValue('confirmation_email_delay_hours', 3);

                            // Calculate send time counting only business hours (Mo-Fr 9:00-18:00)
                            const calculateBusinessHoursSendTime = (startDate, businessHours) => {
                                const BUSINESS_START = 9;  // 09:00
                                const BUSINESS_END = 18;   // 18:00
                                const HOURS_PER_DAY = BUSINESS_END - BUSINESS_START; // 9

                                let remaining = businessHours;
                                let current = new Date(startDate);

                                while (remaining > 0) {
                                    const dayOfWeek = current.getDay(); // 0=Sun, 6=Sat

                                    // Skip weekends
                                    if (dayOfWeek === 0 || dayOfWeek === 6) {
                                        // Jump to next Monday 09:00
                                        const daysToMonday = dayOfWeek === 0 ? 1 : 2;
                                        current.setDate(current.getDate() + daysToMonday);
                                        current.setHours(BUSINESS_START, 0, 0, 0);
                                        continue;
                                    }

                                    const currentHour = current.getHours() + current.getMinutes() / 60;

                                    // Before business hours → jump to 09:00
                                    if (currentHour < BUSINESS_START) {
                                        current.setHours(BUSINESS_START, 0, 0, 0);
                                        continue;
                                    }

                                    // After business hours → jump to next weekday 09:00
                                    if (currentHour >= BUSINESS_END) {
                                        current.setDate(current.getDate() + (dayOfWeek === 5 ? 3 : 1));
                                        current.setHours(BUSINESS_START, 0, 0, 0);
                                        continue;
                                    }

                                    // Within business hours — count available hours today
                                    const hoursLeftToday = BUSINESS_END - currentHour;

                                    if (remaining <= hoursLeftToday) {
                                        // Fits within today
                                        current = new Date(current.getTime() + remaining * 60 * 60 * 1000);
                                        remaining = 0;
                                    } else {
                                        // Use up rest of today, continue next business day
                                        remaining -= hoursLeftToday;
                                        current.setDate(current.getDate() + (dayOfWeek === 5 ? 3 : 1));
                                        current.setHours(BUSINESS_START, 0, 0, 0);
                                    }
                                }

                                return current;
                            };

                            const sendConfirmationEmail = async () => {
                                try {
                                    console.log(`📧 [Background] Preparing creditor confirmation email for ${aktenzeichen}...`);
                                    const emailService = require('../services/emailService');
                                    const { generateGlaeubigerlistePdf } = require('../services/documentConverter');

                                    // Re-fetch client to get latest state
                                    const freshClient = await this.getClient(aktenzeichen);
                                    const clientToUse = freshClient || client;

                                    const attachments = [];

                                    // 1. Generate Gläubigerliste PDF
                                    const pdfBytes = await generateGlaeubigerlistePdf(clientToUse);
                                    attachments.push({
                                        filename: `Glaeubigerliste_${aktenzeichen}.pdf`,
                                        content: Buffer.from(pdfBytes)
                                    });

                                    // 2. Collect all generated first-round DOCX files
                                    const firstRoundDir = path.join(__dirname, '..', 'generated_documents', 'first_round');
                                    if (fs.existsSync(firstRoundDir)) {
                                        const prefix = `${aktenzeichen}_`;
                                        const docxFiles = fs.readdirSync(firstRoundDir)
                                            .filter(f => f.startsWith(prefix) && f.endsWith('_Erstschreiben.docx'));

                                        for (const filename of docxFiles) {
                                            const filePath = path.join(firstRoundDir, filename);
                                            attachments.push({
                                                filename,
                                                content: fs.readFileSync(filePath)
                                            });
                                        }
                                        console.log(`📎 [Background] Found ${docxFiles.length} DOCX attachments for ${aktenzeichen}`);
                                    }

                                    // 3. Send email
                                    const clientName = `${clientToUse.firstName} ${clientToUse.lastName}`;
                                    const emailResult = await emailService.sendCreditorConfirmationEmail({
                                        email: clientToUse.email,
                                        clientName,
                                        aktenzeichen,
                                        attachments
                                    });

                                    if (emailResult.success) {
                                        console.log(`✅ [Background] Creditor confirmation email sent to ${clientToUse.email}`);
                                    } else {
                                        console.error(`❌ [Background] Failed to send confirmation email: ${emailResult.error}`);
                                    }
                                } catch (emailError) {
                                    console.error(`❌ [Background] Failed to send creditor confirmation email for ${aktenzeichen}:`, emailError.message);
                                }
                            };

                            if (delayHours > 0) {
                                const sendAt = calculateBusinessHoursSendTime(new Date(), delayHours);
                                const delayMs = sendAt.getTime() - Date.now();
                                console.log(`⏰ [Background] Scheduling confirmation email for ${aktenzeichen} in ${delayHours} business hours (send at: ${sendAt.toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })})`);
                                setTimeout(sendConfirmationEmail, delayMs);
                            } else {
                                await sendConfirmationEmail();
                            }
                        } catch (delayError) {
                            console.error(`❌ [Background] Failed to schedule confirmation email for ${aktenzeichen}:`, delayError.message);
                        }

                        if (client.zendesk_ticket_id && creditorContactResult.main_ticket_id) {
                            await this.addZendeskComment(client, creditors, creditorContactResult);
                        }

                        console.log(`✅ [Background] All creditor contact tasks completed for ${aktenzeichen}`);
                    } catch (bgError) {
                        console.error(`❌ [Background] Failed creditor contact for ${aktenzeichen}:`, bgError.message);
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
     * Resend creditor emails via Resend with document regeneration
     * POST /api/clients/:clientId/resend-creditor-emails
     *
     * Regenerates DOCX documents and sends first round emails via Resend
     * to actual creditor email addresses. Updates MongoDB and syncs to matcher.
     */
    resendCreditorEmails = async (req, res) => {
        try {
            const clientId = req.params.clientId;
            const client = await this.getClient(clientId);

            if (!client) return res.status(404).json({ error: 'Client not found' });

            const creditorEmailService = require('../services/creditorEmailService');
            const FirstRoundDocumentGenerator = require('../services/firstRoundDocumentGenerator');

            // Get all confirmed creditors with email addresses from final_creditor_list
            const allCreditors = client.final_creditor_list || [];
            const emailableCreditors = allCreditors.filter(creditor => {
                if (creditor.status !== 'confirmed') return false;
                // Check all possible email fields
                const email = creditor.is_representative
                    ? (creditor.email_glaeubiger_vertreter || creditor.sender_email || creditor.email_glaeubiger)
                    : (creditor.email_glaeubiger || creditor.sender_email);
                return !!email;
            });

            if (emailableCreditors.length === 0) {
                return res.status(400).json({ error: 'No creditors with email addresses found' });
            }

            console.log(`\n🔄 RESEND: Starting for ${client.aktenzeichen} - ${emailableCreditors.length} creditors with emails`);

            // Prepare client data for document generation
            let street = client.strasse || '';
            let houseNumber = client.hausnummer || '';
            let zipCode = client.plz || '';
            let city = client.ort || '';

            if (!street && !zipCode && client.address) {
                const addressParts = client.address.match(/^(.+?)\s+(\d+[a-zA-Z]?),?\s*(\d{5})\s+(.+)$/);
                if (addressParts) {
                    street = addressParts[1];
                    houseNumber = addressParts[2];
                    zipCode = addressParts[3];
                    city = addressParts[4];
                }
            }

            const clientData = {
                name: `${client.firstName} ${client.lastName}`,
                reference: client.aktenzeichen,
                address: client.address || '',
                street, houseNumber, zipCode, city,
                birthdate: client.geburtstag || ''
            };

            // Step 1: Regenerate documents
            console.log(`📄 RESEND: Regenerating documents...`);
            const documentGenerator = new FirstRoundDocumentGenerator();
            const documentResults = await documentGenerator.generateCreditorDocuments(
                clientData,
                emailableCreditors,
                client
            );

            if (!documentResults.success || documentResults.total_generated === 0) {
                return res.status(500).json({ error: 'Document generation failed', details: documentResults.errors });
            }

            console.log(`✅ RESEND: Generated ${documentResults.total_generated} documents`);

            // Step 2: Send emails via Resend and update MongoDB
            let emailsSent = 0;
            const results = [];

            // Deduplicate by email address to avoid sending multiple emails to same address
            const seenEmails = new Set();

            for (let i = 0; i < emailableCreditors.length; i++) {
                const creditor = emailableCreditors[i];
                try {
                    // Determine the correct email address
                    const recipientEmail = creditor.is_representative
                        ? (creditor.email_glaeubiger_vertreter || creditor.sender_email || creditor.email_glaeubiger)
                        : (creditor.email_glaeubiger || creditor.sender_email);

                    const recipientName = creditor.glaeubigervertreter_name || creditor.glaeubiger_name || creditor.sender_name || 'Gläubiger';
                    const creditorReference = creditor.aktenzeichen_glaeubigervertreter || creditor.reference_number || '';

                    // Skip true duplicates - same email AND same reference number
                    // Different AZ = different debt = separate email needed
                    const dedupeKey = `${recipientEmail}__${creditorReference || 'NO_REF'}`;
                    if (seenEmails.has(dedupeKey)) {
                        console.log(`⏭️ RESEND: Skipping duplicate for ${recipientName} (${recipientEmail}, AZ: ${creditorReference || 'none'})`);
                        results.push({ creditor_name: recipientName, email: recipientEmail, success: true, skipped: 'duplicate' });
                        continue;
                    }
                    seenEmails.add(dedupeKey);

                    // Find the generated document for this creditor
                    const document = documentResults.documents.find(doc =>
                        doc.creditor_id === creditor.id
                    );

                    if (!document) {
                        console.warn(`⚠️ RESEND: No document found for ${recipientName}`);
                        results.push({ creditor_name: recipientName, email: recipientEmail, success: false, error: 'No document generated' });
                        continue;
                    }

                    console.log(`📧 RESEND ${i + 1}/${emailableCreditors.length}: Sending to ${recipientName} (${recipientEmail})...`);

                    // Send via Resend
                    const emailResult = await creditorEmailService.sendFirstRoundEmail({
                        recipientEmail,
                        recipientName,
                        clientName: clientData.name,
                        clientReference: clientData.reference,
                        creditorReference,
                        attachment: {
                            filename: document.filename,
                            path: document.path
                        }
                    });

                    if (emailResult.success) {
                        emailsSent++;

                        // Update MongoDB for this creditor
                        const updateResult = await this.Client.updateOne(
                            {
                                aktenzeichen: client.aktenzeichen,
                                'final_creditor_list.id': creditor.id
                            },
                            {
                                $set: {
                                    'final_creditor_list.$.resend_email_id': emailResult.emailId,
                                    'final_creditor_list.$.email_provider': 'resend',
                                    'final_creditor_list.$.first_round_document_filename': document.filename,
                                    'final_creditor_list.$.document_sent_at': new Date(),
                                    'final_creditor_list.$.email_sent_at': new Date(),
                                    'final_creditor_list.$.last_contacted_at': new Date(),
                                    'final_creditor_list.$.contact_status': 'email_sent_with_document'
                                }
                            }
                        );

                        console.log(`✅ RESEND: Email sent to ${recipientName} (${recipientEmail}) - ID: ${emailResult.emailId}, DB updated: ${updateResult.modifiedCount > 0}`);

                        results.push({
                            creditor_name: recipientName,
                            email: recipientEmail,
                            success: true,
                            resend_email_id: emailResult.emailId,
                            document: document.filename,
                            db_updated: updateResult.modifiedCount > 0
                        });
                    } else {
                        console.error(`❌ RESEND: Failed for ${recipientName}: ${emailResult.error}`);
                        results.push({ creditor_name: recipientName, email: recipientEmail, success: false, error: emailResult.error });
                    }

                    // Rate limiting delay
                    if (i < emailableCreditors.length - 1) {
                        await new Promise(r => setTimeout(r, 2000));
                    }

                } catch (e) {
                    console.error(`❌ RESEND: Error for creditor ${creditor.glaeubiger_name || creditor.sender_name}:`, e.message);
                    results.push({
                        creditor_name: creditor.glaeubiger_name || creditor.sender_name,
                        success: false,
                        error: e.message
                    });
                }
            }

            // Step 3: Update client-level flags
            await this.Client.updateOne(
                { aktenzeichen: client.aktenzeichen },
                {
                    $set: {
                        creditor_contact_started: true,
                        creditor_contact_started_at: client.creditor_contact_started_at || new Date()
                    }
                }
            );

            console.log(`\n✅ RESEND COMPLETE: ${emailsSent}/${emailableCreditors.length} emails sent for ${client.aktenzeichen}`);

            res.json({
                success: true,
                emails_sent: emailsSent,
                total_creditors: emailableCreditors.length,
                results
            });

        } catch (error) {
            console.error('Error re-sending creditor emails:', error);
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
                    creditor_contact_started: client.creditor_contact_started || client.current_status === 'creditor_contact_initiated',
                    creditor_contact_started_at: client.creditor_contact_started_at
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
