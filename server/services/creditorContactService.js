const { v4: uuidv4 } = require('uuid');
const ZendeskManager = require('./zendeskManager');

/**
 * Creditor Contact Service
 * Handles the business logic for automated creditor contact management
 * Integrates with Zendesk for professional communication management
 */
class CreditorContactService {
    constructor() {
        this.zendesk = new ZendeskManager();

        // In-memory storage for demo - in production, use proper database
        this.creditorContacts = new Map();
        this.zendeskSync = new Map();

        // Initialize response processor (will be set after construction to avoid circular dependency)
        this.responseProcessor = null;
    }

    /**
     * Initialize response processor (called after construction)
     */
    initializeResponseProcessor() {
        if (!this.responseProcessor) {
            const CreditorResponseProcessor = require('./creditorResponseProcessor');
            this.responseProcessor = new CreditorResponseProcessor(this);
            console.log('✅ Response processor initialized');
        }
    }

    /**
     * Main function triggered when client confirms creditor list
     * Creates Zendesk user and tickets for all creditors
     */
    async processClientCreditorConfirmation(clientReference, clientData = null) {
        try {
            console.log(`\n🚀 Starting creditor contact process for client: ${clientReference}`);

            // If clientData not provided, fetch from database
            if (!clientData) {
                const Client = require('../models/Client');
                const client = await Client.findOne({ aktenzeichen: clientReference });
                if (!client) {
                    throw new Error(`Client not found: ${clientReference}`);
                }
                clientData = {
                    name: `${client.firstName} ${client.lastName}`,
                    email: client.email,
                    phone: client.phone || '',
                    address: client.address || ''
                };
            }

            console.log(`📋 Client: ${clientData.name} (${clientData.email})`);

            // Step 1: Test Zendesk connection
            const connectionOk = await this.zendesk.testConnection();
            if (!connectionOk) {
                throw new Error('Zendesk connection failed - check configuration');
            }

            // Step 2: Find existing Zendesk user for client (does not create new users)
            const zendeskUser = await this.zendesk.findClientUser(
                clientReference,
                clientData.name,
                clientData.email
            );

            // Step 3: Get all creditors for this client from confirmed documents
            const creditors = await this.getConfirmedCreditorsForClient(clientReference);
            console.log(`📊 Found ${creditors.length} confirmed creditors to contact`);

            // Debug: Log all creditors that will be contacted
            if (creditors.length > 0) {
                console.log(`📧 Creditors to be contacted:`);
                creditors.forEach((creditor, index) => {
                    console.log(`   ${index + 1}. ${creditor.creditor_name || creditor.sender_name} - ${creditor.creditor_email}`);
                });
            }

            if (creditors.length === 0) {
                return {
                    success: true,
                    message: 'No confirmed creditors found for contact',
                    client_reference: clientReference,
                    zendesk_user_id: zendeskUser.id,
                    tickets_created: 0,
                    emails_sent: 0
                };
            }

            // Step 4: Create ONE main Zendesk ticket for all creditors
            console.log(`🎫 Creating main ticket for ${creditors.length} creditors...`);

            const mainTicket = await this.zendesk.createMainCreditorTicket(
                zendeskUser.id,
                {
                    id: clientReference,
                    name: clientData.name,
                    email: clientData.email,
                    phone: clientData.phone || '',
                    address: clientData.address || ''
                },
                creditors
            );

            console.log(`✅ Main ticket created: ${mainTicket.subject} (ID: ${mainTicket.id})`);

            // Update our internal tracking - create contact records for all creditors with same ticket ID
            const contactRecords = [];
            for (const creditor of creditors) {
                try {
                    const contactRecord = await this.createCreditorContactRecord(creditor, mainTicket.id, zendeskUser.id);
                    contactRecords.push({
                        creditor_id: creditor.id,
                        creditor_name: creditor.creditor_name || creditor.sender_name || 'Unknown Creditor',
                        main_ticket_id: mainTicket.id,
                        contact_id: contactRecord.id,
                        success: true
                    });
                } catch (error) {
                    console.error(`❌ Failed to create contact record for ${creditor.creditor_name || creditor.sender_name || 'Unknown Creditor'}:`, error.message);
                    contactRecords.push({
                        creditor_id: creditor.id,
                        creditor_name: creditor.creditor_name || creditor.sender_name || 'Unknown Creditor',
                        success: false,
                        error: error.message
                    });
                }
            }

            // Step 5: Record sync status
            await this.recordZendeskSync(clientReference, zendeskUser.id, 1); // Only 1 main ticket

            // Step 6: Send Side Conversation emails from the main ticket
            const sideConversationResults = await this.sendCreditorEmailsViaSideConversations(
                mainTicket.id,
                contactRecords.filter(r => r.success),
                clientData
            );

            const successfulContacts = contactRecords.filter(r => r.success);
            const successfulEmails = sideConversationResults.filter(r => r.success);

            // Step 7: Add status update to main ticket
            const statusUpdates = sideConversationResults.map(result => ({
                creditor_name: result.creditor_name,
                creditor_email: result.recipient_email,
                status: result.success ? 'Side Conversation E-Mail versendet' : `Fehler: ${result.error}`,
                success: result.success
            }));

            await this.zendesk.addSideConversationStatusUpdate(mainTicket.id, statusUpdates);

            // Count creditors needing manual contact
            const creditorsNeedingManualContact = contactRecords.filter(record => {
                const fullRecord = Array.from(this.creditorContacts.values())
                    .find(c => c.id === record.contact_id);
                return fullRecord && !fullRecord.creditor_email;
            }).length;

            console.log(`✅ Process completed:`);
            console.log(`   - Main ticket created: 1`);
            console.log(`   - Contact records: ${successfulContacts.length}/${creditors.length}`);
            console.log(`   - Side Conversation emails sent: ${successfulEmails.length}/${successfulContacts.length}`);
            if (creditorsNeedingManualContact > 0) {
                console.log(`   - Creditors needing manual contact: ${creditorsNeedingManualContact}`);
            }

            return {
                success: true,
                client_reference: clientReference,
                zendesk_user_id: zendeskUser.id,
                main_ticket_id: mainTicket.id,
                main_ticket_subject: mainTicket.subject,
                tickets_created: 1, // Only one main ticket
                emails_sent: successfulEmails.length,
                total_creditors: creditors.length,
                creditors_contacted_via_email: successfulEmails.length,
                creditors_needing_manual_contact: creditorsNeedingManualContact,
                contact_records: contactRecords,
                side_conversation_results: sideConversationResults,
                processing_timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Error in processClientCreditorConfirmation:', error.message);

            // Provide user-friendly error messages
            let errorMessage = error.message;
            if (error.message.includes('not found')) {
                errorMessage = `❌ Zendesk User nicht gefunden!\n\nBitte erstellen Sie manuell einen Zendesk User mit:\n- Name: ${clientData.name}\n- E-Mail: ${clientData.email}\n\nDann versuchen Sie es erneut.`;
            }

            return {
                success: false,
                client_reference: clientReference,
                error: errorMessage,
                user_action_required: error.message.includes('not found'),
                processing_timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Get all confirmed creditors for a client from MongoDB
     * Uses final_creditor_list from client instead of document-based approach
     */
    async getConfirmedCreditorsForClient(clientReference) {
        try {
            // Query MongoDB for the client
            const Client = require('../models/Client');
            const client = await Client.findOne({ aktenzeichen: clientReference });

            if (!client) {
                throw new Error(`Client ${clientReference} not found in database`);
            }

            // Use final_creditor_list which contains confirmed creditors
            const allCreditors = client.final_creditor_list || [];
            console.log(`🔍 Total creditors in final_creditor_list: ${allCreditors.length}`);

            // Debug each creditor's filtering criteria
            allCreditors.forEach((creditor, index) => {
                console.log(`🔍 Creditor ${index + 1}:`, {
                    name: creditor.sender_name,
                    email: creditor.sender_email,
                    status: creditor.status,
                    hasName: !!creditor.sender_name,
                    hasEmail: !!creditor.sender_email,
                    isConfirmed: creditor.status === 'confirmed',
                    willBeIncluded: creditor.status === 'confirmed' && !!creditor.sender_name && !!creditor.sender_email
                });
            });

            const confirmedCreditors = allCreditors.filter(creditor =>
                creditor.status === 'confirmed' &&
                creditor.sender_name &&
                creditor.sender_email
            );

            console.log(`📋 Found ${confirmedCreditors.length} confirmed creditors in final_creditor_list for client ${clientReference}`);

            // Log filtered out creditors
            const filteredOut = allCreditors.filter(creditor =>
                !(creditor.status === 'confirmed' && creditor.sender_name && creditor.sender_email)
            );

            if (filteredOut.length > 0) {
                console.log(`⚠️ ${filteredOut.length} creditors were filtered out:`);
                filteredOut.forEach((creditor, index) => {
                    const reasons = [];
                    if (creditor.status !== 'confirmed') reasons.push(`status: ${creditor.status}`);
                    if (!creditor.sender_name) reasons.push('missing sender_name');
                    if (!creditor.sender_email) reasons.push('missing sender_email');

                    console.log(`   ${index + 1}. ${creditor.sender_name || 'NO_NAME'} - Reasons: ${reasons.join(', ')}`);
                });
            }

            // Track creditors without emails for manual processing
            const creditorsWithoutEmail = allCreditors.filter(creditor =>
                creditor.status === 'confirmed' &&
                creditor.sender_name &&
                !creditor.sender_email
            );

            if (creditorsWithoutEmail.length > 0) {
                console.log(`📮 ${creditorsWithoutEmail.length} creditors need manual contact (no email):`);
                creditorsWithoutEmail.forEach((creditor, index) => {
                    console.log(`   ${index + 1}. ${creditor.sender_name} - €${(creditor.claim_amount || 0).toFixed(2)}`);
                });
            }

            // Convert ALL creditors to contact records format (including those without emails)
            // We need to track all creditors, not just those we can email
            const allConfirmedCreditors = allCreditors.filter(creditor =>
                creditor.status === 'confirmed' &&
                creditor.sender_name
            );

            const creditorContactRecords = allConfirmedCreditors.map(creditor => ({
                id: uuidv4(),
                client_reference: clientReference,
                creditor_name: creditor.sender_name,
                creditor_email: creditor.sender_email,
                creditor_address: creditor.sender_address || '',
                reference_number: creditor.reference_number || 'NO_REF',
                original_claim_amount: creditor.claim_amount || 0,
                document_ids: creditor.document_id ? [creditor.document_id] : [],
                is_representative: creditor.is_representative || false,
                actual_creditor: creditor.actual_creditor || creditor.sender_name,
                sender_name: creditor.sender_name, // Keep original sender name for contact record
                needs_manual_contact: !creditor.sender_email // Flag for manual processing
            }));

            return creditorContactRecords;

        } catch (error) {
            console.error(`❌ Error getting confirmed creditors for client ${clientReference}:`, error.message);
            throw error;
        }
    }

    /**
     * Create internal creditor contact record with Zendesk integration
     */
    async createCreditorContactRecord(creditorData, ticketId, zendeskUserId) {
        const contactId = uuidv4();

        // Determine fallback amount logic
        const fallbackAmount = creditorData.original_claim_amount > 0
            ? creditorData.original_claim_amount
            : 100.00;
        const amountSource = creditorData.original_claim_amount > 0
            ? 'original_document'
            : 'fallback';

        const contactRecord = {
            id: contactId,
            client_reference: creditorData.client_reference,
            creditor_name: creditorData.creditor_name || creditorData.sender_name,
            creditor_email: creditorData.creditor_email,
            creditor_address: creditorData.creditor_address,
            reference_number: creditorData.reference_number,
            original_claim_amount: creditorData.original_claim_amount,
            document_ids: creditorData.document_ids,

            // Zendesk integration - NEW STRUCTURE
            main_zendesk_ticket_id: ticketId, // This is now the main ticket ID
            zendesk_user_id: zendeskUserId,
            side_conversation_id: null, // Will be set when Side Conversation is created
            ticket_status: 'main_ticket_created',

            // Contact management
            contact_status: 'main_ticket_created',
            email_sent_at: null,
            response_received_at: null,

            // Response data
            current_debt_amount: null,
            creditor_response_text: null,

            // Final amount logic
            final_debt_amount: fallbackAmount,
            amount_source: amountSource,

            // Timestamps
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        // Store in memory (in production, save to database)
        this.creditorContacts.set(contactId, contactRecord);

        console.log(`✅ Created creditor contact record: ${creditorData.creditor_name || creditorData.sender_name} (${contactId})`);
        return contactRecord;
    }

    /**
     * Record Zendesk synchronization status
     */
    async recordZendeskSync(clientReference, zendeskUserId, ticketsCreated) {
        const syncRecord = {
            id: uuidv4(),
            client_reference: clientReference,
            zendesk_user_id: zendeskUserId,
            total_tickets_created: ticketsCreated,
            sync_status: 'completed',
            created_at: new Date().toISOString(),
            last_sync_at: new Date().toISOString()
        };

        this.zendeskSync.set(clientReference, syncRecord);
        return syncRecord;
    }

    /**
     * Send creditor emails via Side Conversations from the main ticket
     */
    async sendCreditorEmailsViaSideConversations(mainTicketId, contactRecords, clientData) {
        const sideConversationResults = [];

        // Filter only creditors with email addresses
        const emailableContacts = contactRecords.filter(contact => {
            const fullRecord = Array.from(this.creditorContacts.values())
                .find(c => c.id === contact.contact_id);
            return fullRecord && fullRecord.creditor_email;
        });

        const manualContacts = contactRecords.filter(contact => {
            const fullRecord = Array.from(this.creditorContacts.values())
                .find(c => c.id === contact.contact_id);
            return fullRecord && !fullRecord.creditor_email;
        });

        if (manualContacts.length > 0) {
            console.log(`📮 ${manualContacts.length} creditors need manual contact (no email):`);
            manualContacts.forEach((contact, index) => {
                console.log(`   ${index + 1}. ${contact.creditor_name}`);
            });
        }

        for (let i = 0; i < emailableContacts.length; i++) {
            const contactInfo = emailableContacts[i];

            try {
                console.log(`📧 Creating Side Conversation ${i + 1}/${emailableContacts.length} for ${contactInfo.creditor_name}...`);

                // Get the full contact record for this creditor
                const contactRecord = Array.from(this.creditorContacts.values())
                    .find(c => c.id === contactInfo.contact_id);

                if (!contactRecord) {
                    throw new Error('Contact record not found');
                }

                // Send Side Conversation email
                const result = await this.zendesk.sendCreditorEmailViaTicket(
                    mainTicketId,
                    contactRecord,
                    clientData
                );

                // Update contact record
                contactRecord.contact_status = result.success ? 'email_sent' : 'failed';
                contactRecord.email_sent_at = result.success ? new Date().toISOString() : null;
                contactRecord.side_conversation_id = result.side_conversation_id;
                contactRecord.updated_at = new Date().toISOString();

                sideConversationResults.push({
                    creditor_id: contactInfo.creditor_id,
                    creditor_name: contactInfo.creditor_name,
                    contact_id: contactInfo.contact_id,
                    main_ticket_id: mainTicketId,
                    side_conversation_id: result.side_conversation_id,
                    success: result.success,
                    recipient_email: result.recipient_email,
                    subject: result.subject
                });

                // Wait 3 seconds between Side Conversations to avoid rate limits
                if (i < contactRecords.length - 1) {
                    console.log(`⏰ Waiting 3 seconds before next Side Conversation...`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }

            } catch (error) {
                console.error(`❌ Failed to create Side Conversation for ${contactInfo.creditor_name}:`, error.message);

                sideConversationResults.push({
                    creditor_id: contactInfo.creditor_id,
                    creditor_name: contactInfo.creditor_name,
                    contact_id: contactInfo.contact_id,
                    main_ticket_id: mainTicketId,
                    success: false,
                    error: error.message
                });
            }
        }

        return sideConversationResults;
    }

    /**
     * Send creditor emails through Zendesk tickets (DEPRECATED - keeping for compatibility)
     */
    async sendCreditorEmailsViaZendesk(ticketResults, clientData) {
        const emailResults = [];

        for (let i = 0; i < ticketResults.length; i++) {
            const ticketInfo = ticketResults[i];

            if (!ticketInfo.success) {
                continue;
            }

            try {
                console.log(`📧 Sending email ${i + 1}/${ticketResults.length} for ${ticketInfo.creditor_name}`);
                // Get creditor contact record
                const contactRecord = Array.from(this.creditorContacts.values())
                    .find(c => c.zendesk_ticket_id === ticketInfo.ticket_id);

                if (!contactRecord) {
                    throw new Error('Contact record not found');
                }

                // Send email via Zendesk
                await this.zendesk.sendCreditorEmailViaTicket(
                    ticketInfo.ticket_id,
                    contactRecord,
                    clientData
                );

                // Update contact record
                contactRecord.contact_status = 'email_sent';
                contactRecord.email_sent_at = new Date().toISOString();
                contactRecord.ticket_status = 'sent';
                contactRecord.updated_at = new Date().toISOString();

                emailResults.push({
                    creditor_id: ticketInfo.creditor_id,
                    creditor_name: ticketInfo.creditor_name,
                    ticket_id: ticketInfo.ticket_id,
                    contact_id: ticketInfo.contact_id,
                    success: true,
                    sent_to: 'justlukax@gmail.com' // Test email
                });

                // Wait 3 seconds between emails to avoid rate limits
                if (i < ticketResults.length - 1) {
                    console.log(`⏰ Waiting 3 seconds before next email...`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }

            } catch (error) {
                console.error(`❌ Failed to send email for ticket ${ticketInfo.ticket_id}:`, error.message);

                emailResults.push({
                    creditor_id: ticketInfo.creditor_id,
                    creditor_name: ticketInfo.creditor_name,
                    ticket_id: ticketInfo.ticket_id,
                    success: false,
                    error: error.message
                });
            }
        }

        return emailResults;
    }

    /**
     * Process creditor response from Zendesk webhook
     */
    async processCreditorResponse(ticketId, commentData) {
        try {
            // Find corresponding contact record
            const contactRecord = Array.from(this.creditorContacts.values())
                .find(c => c.zendesk_ticket_id === ticketId);

            if (!contactRecord) {
                console.log(`❌ No contact record found for ticket ${ticketId}`);
                return { success: false, message: 'Contact record not found' };
            }

            // Extract debt amount from response
            const extractedAmount = this.extractDebtAmountFromResponse(commentData.body);

            console.log(`📧 Processing creditor response for ${contactRecord.creditor_name}`);
            console.log(`💰 Extracted amount: ${extractedAmount} EUR`);

            // Update contact record
            contactRecord.contact_status = 'responded';
            contactRecord.response_received_at = new Date().toISOString();
            contactRecord.current_debt_amount = extractedAmount;
            contactRecord.creditor_response_text = commentData.body;
            contactRecord.final_debt_amount = extractedAmount;
            contactRecord.amount_source = 'creditor_response';
            contactRecord.ticket_status = 'responded';
            contactRecord.updated_at = new Date().toISOString();

            // Update Zendesk ticket with extracted amount
            await this.zendesk.updateTicketWithAmount(ticketId, extractedAmount);

            console.log(`✅ Updated contact record for ${contactRecord.creditor_name} with amount: ${extractedAmount} EUR`);

            return {
                success: true,
                contact_id: contactRecord.id,
                amount: extractedAmount,
                creditor_name: contactRecord.creditor_name
            };

        } catch (error) {
            console.error(`❌ Error processing response for ticket ${ticketId}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Extract debt amount from creditor response using simple regex
     * In production, this would use LLM for better extraction
     */
    extractDebtAmountFromResponse(emailBody) {
        // Simple regex to find amounts in EUR format
        const amountPatterns = [
            /(?:gesamt|total|summe|forderung|betrag)[\s\w]*?:?\s*?(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*€?/gi,
            /(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*€/g,
            /(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*EUR/gi
        ];

        let foundAmounts = [];

        for (const pattern of amountPatterns) {
            const matches = emailBody.match(pattern);
            if (matches) {
                matches.forEach(match => {
                    const numStr = match.replace(/[^\d,]/g, '');
                    const amount = parseFloat(numStr.replace(',', '.'));
                    if (!isNaN(amount) && amount > 0) {
                        foundAmounts.push(amount);
                    }
                });
            }
        }

        // Return the largest amount found, or 0 if none
        return foundAmounts.length > 0 ? Math.max(...foundAmounts) : 0;
    }

    /**
     * Get client creditor contact status
     */
    async getClientCreditorStatus(clientReference) {
        const contacts = Array.from(this.creditorContacts.values())
            .filter(c => c.client_reference === clientReference);

        const syncInfo = this.zendeskSync.get(clientReference);

        // Get main ticket info
        const mainTicketIds = [...new Set(contacts.map(c => c.main_zendesk_ticket_id).filter(Boolean))];
        const mainTicketId = mainTicketIds.length > 0 ? mainTicketIds[0] : null;

        const summary = {
            total_creditors: contacts.length,
            main_tickets_created: mainTicketIds.length, // Should be 1 in new structure
            side_conversations_sent: contacts.filter(c => c.side_conversation_id).length,
            emails_sent: contacts.filter(c => c.contact_status === 'email_sent' || c.contact_status === 'responded').length,
            responses_received: contacts.filter(c => c.contact_status === 'responded').length,
            total_debt: contacts.reduce((sum, c) => sum + (c.final_debt_amount || 0), 0)
        };

        return {
            client_reference: clientReference,
            main_ticket_id: mainTicketId,
            sync_info: syncInfo,
            creditor_contacts: contacts,
            summary: summary
        };
    }

    /**
     * Process timeout for creditors who haven't responded
     */
    async processTimeoutCreditors(timeoutDays = 14) {
        const timeoutDate = new Date();
        timeoutDate.setDate(timeoutDate.getDate() - timeoutDays);

        const timeoutContacts = [];

        for (const contact of this.creditorContacts.values()) {
            if (contact.contact_status === 'email_sent' &&
                contact.email_sent_at &&
                new Date(contact.email_sent_at) < timeoutDate) {

                // Update to timeout status with fallback amount
                contact.contact_status = 'timeout';
                contact.ticket_status = 'timeout';
                contact.final_debt_amount = contact.original_claim_amount > 0
                    ? contact.original_claim_amount
                    : 100.00;
                contact.amount_source = contact.original_claim_amount > 0
                    ? 'original_document'
                    : 'fallback';
                contact.updated_at = new Date().toISOString();

                timeoutContacts.push({
                    id: contact.id,
                    creditor_name: contact.creditor_name,
                    reference_number: contact.reference_number,
                    final_debt_amount: contact.final_debt_amount
                });

                console.log(`⏰ Timeout processed for ${contact.creditor_name}: ${contact.final_debt_amount} EUR`);
            }
        }

        return {
            processed_count: timeoutContacts.length,
            timeout_date: timeoutDate.toISOString(),
            updated_contacts: timeoutContacts
        };
    }

    /**
     * Get final debt summary for client
     */
    async getFinalDebtSummary(clientReference) {
        const contacts = Array.from(this.creditorContacts.values())
            .filter(c => c.client_reference === clientReference);

        const totalDebt = contacts.reduce((sum, c) => sum + (c.final_debt_amount || 0), 0);

        return {
            client_reference: clientReference,
            total_debt_amount: totalDebt,
            currency: 'EUR',
            creditor_details: contacts.map(c => ({
                creditor_name: c.creditor_name,
                reference_number: c.reference_number,
                final_debt_amount: c.final_debt_amount,
                amount_source: c.amount_source,
                contact_status: c.contact_status,
                zendesk_ticket_id: c.zendesk_ticket_id
            })),
            summary: {
                total_creditors: contacts.length,
                responded: contacts.filter(c => c.contact_status === 'responded').length,
                timeout: contacts.filter(c => c.contact_status === 'timeout').length,
                pending: contacts.filter(c => c.contact_status === 'email_sent').length,
                failed: contacts.filter(c => c.contact_status === 'failed').length
            },
            generated_at: new Date().toISOString()
        };
    }

    /**
     * Process incoming creditor response (from email or simulation)
     * Uses the response processor to extract amounts and update records
     */
    async processCreditorResponse(emailData, isSimulation = false) {
        this.initializeResponseProcessor(); // Ensure processor is initialized
        return await this.responseProcessor.processCreditorResponse(emailData, isSimulation);
    }

    /**
     * Simulate creditor responses for testing
     */
    async simulateCreditorResponses(clientReference) {
        this.initializeResponseProcessor();
        return await this.responseProcessor.simulateResponsesForClient(clientReference);
    }

    /**
     * Get response processing statistics for a client
     */
    getResponseStats(clientReference) {
        this.initializeResponseProcessor();
        return this.responseProcessor.getClientResponseStats(clientReference);
    }

    /**
     * Process creditor response from Zendesk webhook or manual input
     * This is the main entry point for actual creditor responses
     */
    async processIncomingCreditorResponse(ticketId, commentData) {
        try {
            // Find corresponding contact record by ticket ID (either main ticket or individual)
            const contactRecord = Array.from(this.creditorContacts.values())
                .find(c => c.main_zendesk_ticket_id === ticketId || c.zendesk_ticket_id === ticketId);

            if (!contactRecord) {
                console.log(`❌ No contact record found for ticket ${ticketId}`);
                return {
                    success: false,
                    message: 'Contact record not found',
                    ticket_id: ticketId
                };
            }

            console.log(`📧 Processing response for ${contactRecord.creditor_name} (ticket: ${ticketId})`);

            const responseText = commentData.body || commentData.comment || commentData;
            const receivedAt = new Date(commentData.created_at || Date.now());
            const sideConversationId = commentData.side_conversation_id || null;

            // --- Update MongoDB ---
            const Client = require('../models/Client');
            const client = await Client.findOne({ aktenzeichen: contactRecord.client_reference });
            if (client) {
                const creditor = client.final_creditor_list.find(c =>
                    c.sender_email === contactRecord.creditor_email
                );

                if (creditor) {
                    creditor.settlement_response_status = 'responded';
                    creditor.settlement_response_text = responseText;
                    creditor.settlement_response_received_at = receivedAt;
                    if (sideConversationId) {
                        creditor.settlement_side_conversation_id = sideConversationId;
                    }

                    client.markModified('final_creditor_list');
                    await client.save();

                    console.log(`✅ Updated creditor ${creditor.sender_name} in DB with response`);
                }
            }

            // Process the response using our response processor
            const result = await this.processCreditorResponse({
                body: commentData.body || commentData.comment || commentData,
                subject: `Response from ${contactRecord.creditor_name}`,
                sender_email: contactRecord.creditor_email,
                // Pass reference number from contact record
                reference_number: contactRecord.reference_number
            }, false);

            if (result.success) {
                console.log(`✅ Processed response: ${result.creditor_name} - Final amount: ${result.final_amount} EUR`);
            }

            return result;

        } catch (error) {
            console.error(`❌ Error processing response for ticket ${ticketId}:`, error.message);
            return {
                success: false,
                error: error.message,
                ticket_id: ticketId
            };
        }
    }

    /**
     * Send settlement plan documents to all creditors (second round of emails)
     */
    async sendSettlementPlanToCreditors(clientReference, settlementData, generatedDocuments = null) {
        try {
            console.log(`\n📄 Starting second round: Sending settlement plan to creditors for ${clientReference}`);

            // Step 1: Test Zendesk connection
            const connectionOk = await this.zendesk.testConnection();
            if (!connectionOk) {
                throw new Error('Zendesk connection failed - check configuration');
            }

            // Step 2: Get client data
            const Client = require('../models/Client');
            const client = await Client.findOne({ aktenzeichen: clientReference });
            if (!client) {
                throw new Error(`Client not found: ${clientReference}`);
            }

            const clientData = {
                name: `${client.firstName} ${client.lastName}`,
                email: client.email,
                phone: client.phone || '',
                address: client.address || '',
                reference: clientReference
            };

            // Step 3: Find existing Zendesk user for client
            const zendeskUser = await this.zendesk.findClientUser(
                clientReference,
                clientData.name,
                clientData.email
            );

            // Step 4: Get all creditors for this client
            const creditors = settlementData.creditors || client.final_creditor_list || [];
            console.log(`📊 Sending settlement plan to ${creditors.length} creditors`);

            if (creditors.length === 0) {
                return {
                    success: true,
                    message: 'No creditors found for settlement plan distribution',
                    client_reference: clientReference,
                    emails_sent: 0
                };
            }

            // Step 5: Create a new Zendesk ticket for settlement plan distribution
            console.log(`🎫 Creating settlement plan distribution ticket...`);

            const settlementTicket = await this.zendesk.createSettlementPlanTicket(
                zendeskUser.id,
                clientData,
                settlementData,
                creditors
            );

            console.log(`✅ Settlement plan ticket created: ${settlementTicket.subject} (ID: ${settlementTicket.id})`);

            // Step 6: Upload documents to main ticket and get download URLs
            const documentDownloadUrls = await this.uploadDocumentsToMainTicketWithUrls(
                settlementTicket.id,
                clientData,
                settlementData,
                generatedDocuments
            );

            // Step 7: Validate we have documents and download URLs
            if (documentDownloadUrls.length === 0) {
                console.warn(`⚠️ No documents were uploaded successfully - Side Conversations will be created without attachments`);
            } else {
                console.log(`📋 Successfully prepared ${documentDownloadUrls.length} document download URLs`);
                documentDownloadUrls.forEach(doc => {
                    console.log(`   📄 ${doc.filename}: ${doc.download_url ? 'HAS URL' : 'NO URL'}`);
                });
            }

            // Step 8: Create Side Conversations for each creditor with download links
            const emailResults = await this.createSideConversationsWithDownloadLinks(
                settlementTicket.id,
                creditors,
                clientData,
                settlementData,
                documentDownloadUrls
            );

            const successfulEmails = emailResults.filter(r => r.success && r.email_sent);

            // Step 9: Add status update to settlement ticket
            const statusUpdates = emailResults.map(result => ({
                creditor_name: result.creditor_name,
                creditor_email: result.recipient_email,
                method: result.method || 'side_conversation_with_links',
                download_links_count: result.download_links_count || 0,
                status: result.success && result.email_sent ?
                    `Schuldenbereinigungsplan E-Mail versendet via Side Conversation (${result.download_links_count || 0} Download-Links)` :
                    `Fehler: ${result.error}`,
                success: result.success && result.email_sent
            }));

            await this.zendesk.addSideConversationStatusUpdate(settlementTicket.id, statusUpdates);

            // Step 10: Update creditor records with Side Conversation IDs and start monitoring
            await this.updateCreditorsWithSideConversationIds(clientReference, emailResults);

            // Wait for database save to complete before starting monitoring
            await new Promise(resolve => setTimeout(resolve, 2000));
          
            // Step 11: Start settlement response monitoring (1-minute intervals)
            const SettlementResponseMonitor = require('./settlementResponseMonitor');
            const settlementMonitor = new SettlementResponseMonitor();
            const monitoringResult = settlementMonitor.startMonitoringSettlementResponses(clientReference, 1, settlementTicket.id);

            console.log(`✅ Settlement plan distribution completed via direct Side Conversations:`);
            console.log(`   - Main settlement ticket created: ${settlementTicket.id}`);
            console.log(`   - Side Conversations created: ${emailResults.length}`);
            console.log(`   - Successful emails sent: ${successfulEmails.length}/${creditors.length}`);
            console.log(`   - Settlement response monitoring: ${monitoringResult.success ? 'STARTED' : 'FAILED'}`);

            return {
                success: true,
                client_reference: clientReference,
                zendesk_user_id: zendeskUser.id,
                settlement_ticket_id: settlementTicket.id,
                settlement_ticket_subject: settlementTicket.subject,
                emails_sent: successfulEmails.length,
                total_creditors: creditors.length,
                side_conversations_created: emailResults.length,
                method: 'side_conversation_with_links',
                monitoring_started: monitoringResult.success,
                email_results: emailResults,
                processing_timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Error in sendSettlementPlanToCreditors:', error.message);
            return {
                success: false,
                client_reference: clientReference,
                error: error.message,
                processing_timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Upload settlement plan documents to main ticket and get download URLs
     * FIXED: Improved retry logic and better document path handling
     */
    async uploadDocumentsToMainTicketWithUrls(ticketId, clientData, settlementData, generatedDocuments = null) {
        try {
            console.log(`📎 Uploading documents to main ticket ${ticketId} for download URLs...`);

            let documentFiles = [];
            const fs = require('fs');
            const path = require('path');

            // PRIORITY 1: Use provided document paths from generation (most reliable)
            if (generatedDocuments && generatedDocuments.settlementResult && generatedDocuments.overviewResult) {
                console.log(`✅ Using provided document info from generation`);
                const settlementPath = generatedDocuments.settlementResult.document_info?.path;
                const overviewPath = generatedDocuments.overviewResult.document_info?.path;
                const ratenplanPath = generatedDocuments.ratenplanResult?.document_info?.path;

                if (settlementPath && fs.existsSync(settlementPath)) {
                    documentFiles.push({ path: settlementPath, type: 'settlement_plan' });
                    console.log(`  ✓ Settlement plan: ${path.basename(settlementPath)}`);
                } else {
                    console.warn(`  ⚠️ Settlement plan not found at: ${settlementPath}`);
                }

                if (overviewPath && fs.existsSync(overviewPath)) {
                    documentFiles.push({ path: overviewPath, type: 'creditor_overview' });
                    console.log(`  ✓ Creditor overview: ${path.basename(overviewPath)}`);
                } else {
                    console.warn(`  ⚠️ Creditor overview not found at: ${overviewPath}`);
                }

                if (ratenplanPath && fs.existsSync(ratenplanPath)) {
                    documentFiles.push({ path: ratenplanPath, type: 'ratenplan_pfaendbares_einkommen' });
                    console.log(`  ✓ Ratenplan: ${path.basename(ratenplanPath)}`);
                } else if (ratenplanPath) {
                    console.warn(`  ⚠️ Ratenplan not found at: ${ratenplanPath}`);
                }
            }

            // FALLBACK: Search documents folder by pattern (less reliable)
            if (documentFiles.length === 0) {
                console.warn(`⚠️ No documents found from provided paths, searching by pattern...`);
                const documentDir = path.join(__dirname, '../documents');

                // Try to find latest documents by pattern (glob-like search)
                const datePattern = new Date().toISOString().split('T')[0];
                const possibleDates = [
                    datePattern,
                    new Date(Date.now() - 86400000).toISOString().split('T')[0], // Yesterday
                ];

                for (const dateStr of possibleDates) {
                    const settlementPlanFile = path.join(documentDir, `Schuldenbereinigungsplan_${clientData.reference}_${dateStr}.docx`);
                    const creditorOverviewFile = path.join(documentDir, `Forderungsübersicht_${clientData.reference}_${dateStr}.docx`);
                    const ratenplanFile = path.join(documentDir, `Ratenplan-Pfaendbares-Einkommen_${clientData.reference}_${dateStr}.docx`);

                    if (fs.existsSync(settlementPlanFile)) {
                        documentFiles.push({ path: settlementPlanFile, type: 'settlement_plan' });
                        console.log(`  ✓ Found settlement plan (${dateStr}): ${path.basename(settlementPlanFile)}`);
                    }
                    if (fs.existsSync(creditorOverviewFile)) {
                        documentFiles.push({ path: creditorOverviewFile, type: 'creditor_overview' });
                        console.log(`  ✓ Found creditor overview (${dateStr}): ${path.basename(creditorOverviewFile)}`);
                    }
                    if (fs.existsSync(ratenplanFile)) {
                        documentFiles.push({ path: ratenplanFile, type: 'ratenplan_pfaendbares_einkommen' });
                        console.log(`  ✓ Found ratenplan (${dateStr}): ${path.basename(ratenplanFile)}`);
                    }

                    // Break if we found all documents
                    if (documentFiles.length >= 3) break;
                }

                if (documentFiles.length === 0) {
                    throw new Error(`No documents found for client ${clientData.reference}. Please ensure documents are generated before sending to creditors.`);
                }
            }

            console.log(`📋 Found ${documentFiles.length} document(s) to upload`);

            const documentUrls = [];

            // Upload each document file
            for (const docFile of documentFiles) {
                const filename = path.basename(docFile.path);
                console.log(`📤 Uploading ${docFile.type}: ${filename}`);
                const uploadResult = await this.zendesk.uploadFileToZendesk(docFile.path, filename);
                if (uploadResult.success) {
                    documentUrls.push({
                        type: docFile.type,
                        filename: filename,
                        token: uploadResult.token,
                        size: uploadResult.size
                    });
                    console.log(`✅ ${docFile.type} uploaded: ${uploadResult.token}`);
                } else {
                    console.error(`❌ Failed to upload ${docFile.type}: ${uploadResult.error}`);
                }
            }

            if (documentUrls.length === 0) {
                throw new Error('All document uploads failed. Cannot proceed with Side Conversations.');
            }

            // Add attachments to main ticket as internal note and get download URLs
            const uploadTokens = documentUrls.map(doc => doc.token);
            const attachmentList = documentUrls.map(doc => `• ${doc.filename} (${Math.round(doc.size / 1024)} KB)`).join('\n');

            const commentResult = await this.zendesk.addTicketComment(ticketId, {
                body: `📎 Schuldenbereinigungsplan Dokumente hochgeladen (${documentUrls.length} Dokumente):\n\n${attachmentList}\n\nDiese Dokumente werden als Download-Links in Side Conversations mit den Gläubigern geteilt.`,
                public: false,
                uploads: uploadTokens
            });

            if (!commentResult.success) {
                throw new Error(`Failed to attach documents to main ticket: ${commentResult.error}`);
            }

            console.log(`✅ Documents attached to main ticket ${ticketId}`);

            // FIXED: Retry logic for attachment URL retrieval
            const maxRetries = 5;
            const retryDelay = 3000; // 3 seconds
            let attachmentDetails = [];

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                console.log(`⏰ Waiting ${retryDelay / 1000} seconds for Zendesk attachment processing (attempt ${attempt}/${maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));

                console.log(`🔗 Retrieving download URLs from ticket ${ticketId}...`);
                attachmentDetails = await this.zendesk.getTicketAttachmentUrls(ticketId);

                if (attachmentDetails.length >= documentUrls.length) {
                    console.log(`✅ Found all ${attachmentDetails.length} download URLs from ticket`);
                    break;
                } else if (attachmentDetails.length > 0) {
                    console.log(`⚠️ Found ${attachmentDetails.length}/${documentUrls.length} download URLs, retrying...`);
                } else {
                    console.log(`⚠️ No download URLs found yet, retrying...`);
                }

                // Don't wait after last attempt
                if (attempt === maxRetries) {
                    console.error(`❌ Failed to retrieve all download URLs after ${maxRetries} attempts`);
                }
            }

            // Match uploaded files with their download URLs
            if (attachmentDetails.length > 0) {
                console.log(`🔗 Matching ${documentUrls.length} uploaded files with ${attachmentDetails.length} attachment URLs:`);
                attachmentDetails.forEach(att => {
                    console.log(`   - ${att.filename}: ${att.content_url}`);
                });

                for (let i = 0; i < documentUrls.length; i++) {
                    const matchingAttachment = attachmentDetails.find(att =>
                        att.filename === documentUrls[i].filename
                    );
                    if (matchingAttachment) {
                        documentUrls[i].download_url = matchingAttachment.content_url;
                        documentUrls[i].attachment_id = matchingAttachment.id;
                        console.log(`✅ ${documentUrls[i].filename} → URL matched`);
                    } else {
                        console.error(`❌ No URL match found for ${documentUrls[i].filename}`);
                    }
                }
            } else {
                console.error(`❌ CRITICAL: No download URLs available after ${maxRetries} attempts`);
                console.error(`📧 Side Conversations will be sent WITHOUT document links!`);
                console.error(`🔧 Manual intervention required: Add documents to ticket ${ticketId} manually`);
            }

            const urlsWithLinks = documentUrls.filter(doc => doc.download_url).length;
            console.log(`🔗 Successfully prepared ${urlsWithLinks}/${documentUrls.length} document download URLs`);

            if (urlsWithLinks === 0) {
                console.error(`❌ WARNING: No download URLs available. Creditors will receive emails without document links!`);
            }

            return documentUrls;

        } catch (error) {
            console.error(`❌ Error uploading documents to main ticket:`, error.message);
            console.error(`📋 Stack trace:`, error.stack);
            return [];
        }
    }

    /**
     * Upload settlement plan documents to main ticket and get attachment IDs (DEPRECATED - use uploadDocumentsToMainTicketWithUrls)
     */
    async uploadDocumentsToMainTicket(ticketId, clientData, settlementData) {
        try {
            console.log(`📎 Uploading documents to main ticket ${ticketId}...`);

            // Get document paths
            const path = require('path');
            const documentDir = path.join(__dirname, '../documents');
            const settlementPlanFile = path.join(documentDir, `Schuldenbereinigungsplan_${clientData.reference}_${new Date().toISOString().split('T')[0]}.docx`);
            const creditorOverviewFile = path.join(documentDir, `Forderungsübersicht_${clientData.reference}_${new Date().toISOString().split('T')[0]}.docx`);

            const fs = require('fs');
            const attachments = [];

            // Upload settlement plan document
            if (fs.existsSync(settlementPlanFile)) {
                const filename = require('path').basename(settlementPlanFile);
                console.log(`📤 Uploading settlement plan: ${filename}`);
                const uploadResult = await this.zendesk.uploadFileToZendesk(settlementPlanFile, filename);
                if (uploadResult.success) {
                    attachments.push({
                        type: 'settlement_plan',
                        filename: filename,
                        token: uploadResult.token,
                        size: uploadResult.size,
                        file_path: settlementPlanFile
                    });
                    console.log(`✅ Settlement plan uploaded: ${uploadResult.token}`);
                }
            } else {
                console.log(`❌ Settlement plan file not found: ${settlementPlanFile}`);
            }

            // Upload creditor overview document  
            if (fs.existsSync(creditorOverviewFile)) {
                const filename = require('path').basename(creditorOverviewFile);
                console.log(`📤 Uploading creditor overview: ${filename}`);
                const uploadResult = await this.zendesk.uploadFileToZendesk(creditorOverviewFile, filename);
                if (uploadResult.success) {
                    attachments.push({
                        type: 'creditor_overview',
                        filename: filename,
                        token: uploadResult.token,
                        size: uploadResult.size,
                        file_path: creditorOverviewFile
                    });
                    console.log(`✅ Creditor overview uploaded: ${uploadResult.token}`);
                }
            } else {
                console.log(`❌ Creditor overview file not found: ${creditorOverviewFile}`);
            }

            // Add attachments to main ticket via comment and get attachment IDs
            if (attachments.length > 0) {
                const uploadTokens = attachments.map(att => att.token);
                const attachmentList = attachments.map(att => `• ${att.filename} (${Math.round(att.size / 1024)} KB)`).join('\n');

                const commentResult = await this.zendesk.addTicketComment(ticketId, {
                    body: `📎 Schuldenbereinigungsplan Dokumente hochgeladen:\n\n${attachmentList}\n\nDiese Dokumente werden für die Side Conversations mit den Gläubigern verwendet.`,
                    public: false,
                    uploads: uploadTokens
                });

                if (commentResult.success) {
                    console.log(`✅ Documents attached to main ticket ${ticketId}`);

                    // Get the attachment IDs from the ticket
                    console.log(`🔍 Retrieving attachment IDs from ticket ${ticketId}...`);
                    const attachmentIds = await this.zendesk.getTicketAttachmentIds(ticketId);

                    if (attachmentIds.length > 0) {
                        // Update attachments array with attachment IDs
                        console.log(`🔍 Found ${attachmentIds.length} attachment IDs from ticket:`);
                        attachmentIds.forEach(att => {
                            console.log(`   - ID: ${att.id}, File: ${att.filename}, Size: ${att.size}`);
                        });

                        for (let i = 0; i < Math.min(attachments.length, attachmentIds.length); i++) {
                            attachments[i].attachment_id = attachmentIds[i].id;
                            attachments[i].content_url = attachmentIds[i].content_url;
                            console.log(`📎 ${attachments[i].filename} → Attachment ID: ${attachmentIds[i].id}`);
                        }
                    } else {
                        console.log(`⚠️ No attachment IDs found for ticket ${ticketId}`);
                        console.log(`🔍 This might be a timing issue - attachments may not be processed yet`);
                    }
                } else {
                    console.log(`❌ Failed to attach documents to main ticket: ${commentResult.error}`);
                }
            }

            console.log(`📎 Successfully prepared ${attachments.length} document attachments`);
            return attachments;

        } catch (error) {
            console.error(`❌ Error uploading documents to main ticket:`, error.message);
            return [];
        }
    }

    /**
     * Create Side Conversations for each creditor with download links
     */
    async createSideConversationsWithDownloadLinks(settlementTicketId, creditors, clientData, settlementData, downloadUrls = []) {
        const emailResults = [];

        console.log(`💬 Creating ${creditors.length} Side Conversations with ${downloadUrls.length} download links`);

        for (let i = 0; i < creditors.length; i++) {
            const creditor = creditors[i];
            const creditorName = creditor.sender_name || creditor.creditor_name || 'Unknown Creditor';

            try {
                console.log(`💬 Creating Side Conversation ${i + 1}/${creditors.length} for ${creditorName}...`);

                // Create Side Conversation with download links
                const result = await this.zendesk.createSideConversationWithDownloadLinks(
                    settlementTicketId,
                    creditor,
                    clientData,
                    settlementData,
                    downloadUrls
                );

                emailResults.push({
                    creditor_id: creditor.id,
                    creditor_name: creditorName,
                    main_ticket_id: settlementTicketId,
                    side_conversation_id: result.side_conversation_id,
                    success: result.success,
                    recipient_email: result.creditor_email || 'justlukax@gmail.com',
                    subject: result.subject,
                    download_links_count: result.download_links_count || downloadUrls.length,
                    method: 'side_conversation_with_links',
                    email_sent: result.success
                });

                // Wait 2 seconds between Side Conversations to avoid rate limits
                if (i < creditors.length - 1) {
                    console.log(`⏰ Waiting 2 seconds before next Side Conversation...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }

            } catch (error) {
                console.error(`❌ Failed to create Side Conversation for ${creditorName}:`, error.message);

                emailResults.push({
                    creditor_id: creditor.id,
                    creditor_name: creditorName,
                    main_ticket_id: settlementTicketId,
                    success: false,
                    error: error.message,
                    email_sent: false,
                    method: 'side_conversation_with_links'
                });
            }
        }

        return emailResults;
    }

    /**
     * Send settlement plan emails via individual creditor tickets (DEPRECATED - use createSideConversationsWithDownloadLinks)
     */
    async sendSettlementPlanEmailsViaMakeWebhook(settlementTicketId, creditors, clientData, settlementData, documentAttachments = []) {
        const emailResults = [];

        console.log(`📎 Using ${documentAttachments.length} uploaded document attachments for settlement plan distribution`);

        for (let i = 0; i < creditors.length; i++) {
            const creditor = creditors[i];
            const creditorName = creditor.sender_name || creditor.creditor_name || 'Unknown Creditor';

            try {
                console.log(`📧 Sending settlement plan via Make.com webhook ${i + 1}/${creditors.length} for ${creditorName}...`);

                // Send via Make.com webhook with main ticket ID and attachment tokens for Side Conversation
                const result = await this.zendesk.sendToMakeWebhook(
                    creditor,
                    clientData,
                    settlementData,
                    documentAttachments,  // Upload tokens for existing attachments
                    settlementTicketId    // Main ticket ID for Side Conversation creation
                );

                emailResults.push({
                    creditor_id: creditor.id,
                    creditor_name: creditorName,
                    main_ticket_id: settlementTicketId,
                    success: result.success,
                    recipient_email: 'justlukax@gmail.com', // Test email
                    subject: `Schuldenbereinigungsplan - ${creditorName} - Az: ${clientData.reference || 'N/A'}`,
                    attachments_count: documentAttachments.length,
                    method: 'make_webhook',
                    email_sent: result.success,
                    webhook_response: result.webhook_response
                });

                // Wait 1 second between webhook calls to avoid overwhelming Make.com
                if (i < creditors.length - 1) {
                    console.log(`⏰ Waiting 1 second before next webhook call...`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

            } catch (error) {
                console.error(`❌ Failed to send via Make.com webhook for ${creditorName}:`, error.message);

                emailResults.push({
                    creditor_id: creditor.id,
                    creditor_name: creditorName,
                    main_ticket_id: settlementTicketId,
                    success: false,
                    error: error.message,
                    email_sent: false,
                    method: 'make_webhook'
                });
            }
        }

        return emailResults;
    }

    /**
     * Update creditor records with Side Conversation IDs for settlement response tracking
     */
      async updateCreditorsWithSideConversationIds(clientReference, emailResults) {
        try {
            console.log(`📋 Updating creditor records with Side Conversation IDs for ${clientReference}`);

            const Client = require('../models/Client');
            const client = await Client.findOne({ aktenzeichen: clientReference });
            if (!client) {
                throw new Error(`Client not found: ${clientReference}`);
            }

            let updatedCount = 0;

            console.log(`🔍 Email results to process:`, emailResults.map(r => ({
                creditor_name: r.creditor_name,
                creditor_id: r.creditor_id,
                success: r.success,
                side_conversation_id: r.side_conversation_id
            })));

            console.log(`🔍 Available creditors in final_creditor_list:`, client.final_creditor_list.map(c => ({
                id: c.id,
                sender_name: c.sender_name
            })));

            for (const emailResult of emailResults) {
                console.log(`🔍 Processing email result:`, {
                    creditor_name: emailResult.creditor_name,
                    creditor_id: emailResult.creditor_id,
                    success: emailResult.success,
                    has_side_conversation_id: !!emailResult.side_conversation_id
                });

                if (emailResult.success && emailResult.side_conversation_id) {
                    // Find matching creditor by ID first (most specific), then by name
                    const creditor = client.final_creditor_list.find(c =>
                        c.id === emailResult.creditor_id
                    ) || client.final_creditor_list.find(c =>
                        c.sender_name === emailResult.creditor_name &&
                        !c.settlement_side_conversation_id  // Only match if not already updated
                    );

                    console.log(`🔍 Creditor matching result:`, {
                        found: !!creditor,
                        searching_for: emailResult.creditor_name,
                        creditor_id: emailResult.creditor_id
                    });

                    if (creditor) {
                        console.log(`📝 Before update:`, {
                            settlement_side_conversation_id: creditor.settlement_side_conversation_id,
                            settlement_plan_sent_at: creditor.settlement_plan_sent_at
                        });

                        creditor.settlement_side_conversation_id = emailResult.side_conversation_id;
                        creditor.settlement_plan_sent_at = new Date();
                        creditor.settlement_response_status = 'pending';
                        updatedCount++;

                        console.log(`📝 After update:`, {
                            settlement_side_conversation_id: creditor.settlement_side_conversation_id,
                            settlement_plan_sent_at: creditor.settlement_plan_sent_at
                        });

                        console.log(`📎 Updated ${creditor.sender_name} with Side Conversation ID: ${emailResult.side_conversation_id}`);
                    } else {
                        console.warn(`⚠️ Could not find creditor for result: ${emailResult.creditor_name} (ID: ${emailResult.creditor_id})`);
                    }
                } else {
                    console.warn(`⚠️ Skipping email result - success: ${emailResult.success}, has_side_conversation_id: ${!!emailResult.side_conversation_id}`);
                }
            }

            if (updatedCount > 0) {
                console.log(`💾 Attempting to save client with ${updatedCount} settlement updates...`);

                // Log the changes before saving
                console.log(`🔍 Client fields before save:`, client.final_creditor_list.map(c => ({
                    name: c.sender_name,
                    settlement_side_conversation_id: c.settlement_side_conversation_id,
                    settlement_plan_sent_at: c.settlement_plan_sent_at,
                    settlement_response_status: c.settlement_response_status
                })));

                try {
                    client.current_status = 'settlement_plan_sent_to_creditors';
                    client.settlement_plan_sent_at = new Date();

                    // Mark the final_creditor_list as modified to ensure Mongoose saves the changes
                    client.markModified('final_creditor_list');

                    const saveResult = await client.save();
                    console.log(`✅ Successfully saved client ${clientReference} with settlement updates`);
                    console.log(`💾 Save result ID: ${saveResult._id}, modified paths: ${saveResult.modifiedPaths ? saveResult.modifiedPaths() : 'N/A'}`);
                } catch (saveError) {
                    console.error(`❌ Failed to save client:`, saveError);
                    console.error(`❌ Save error details:`, {
                        name: saveError.name,
                        message: saveError.message,
                        errors: saveError.errors
                    });
                    throw saveError;
                }

                console.log(`✅ Updated ${updatedCount} creditor records with Side Conversation IDs`);

                // Immediate verification of the save
                const verifyClient = await Client.findOne({ aktenzeichen: clientReference });
                console.log(`🔍 Immediate verification - Settlement fields after save:`, verifyClient.final_creditor_list.map(c => ({
                    name: c.sender_name,
                    settlement_side_conversation_id: c.settlement_side_conversation_id,
                    settlement_plan_sent_at: c.settlement_plan_sent_at,
                    settlement_response_status: c.settlement_response_status
                })));

                // Check if save actually worked
                const savedSettlementIds = verifyClient.final_creditor_list.filter(c => c.settlement_side_conversation_id);
                if (savedSettlementIds.length !== updatedCount) {
                    console.error(`❌ Save verification failed! Expected ${updatedCount} settlement IDs, found ${savedSettlementIds.length}`);

                    // Retry with direct database updates for each creditor
                    console.log(`🔄 Attempting direct database update fallback for ${emailResults.length} creditors...`);

                    for (const emailResult of emailResults) {
                        if (emailResult.success && emailResult.side_conversation_id) {
                            const updateResult = await Client.updateOne(
                                {
                                    aktenzeichen: clientReference,
                                    'final_creditor_list.id': emailResult.creditor_id
                                },
                                {
                                    $set: {
                                        'final_creditor_list.$.settlement_side_conversation_id': emailResult.side_conversation_id,
                                        'final_creditor_list.$.settlement_plan_sent_at': new Date(),
                                        'final_creditor_list.$.settlement_response_status': 'pending'
                                    }
                                }
                            );
                            console.log(`🔄 Direct update for ${emailResult.creditor_name}:`, updateResult.modifiedCount > 0 ? 'SUCCESS' : 'FAILED');
                        }
                    }
                }
            }

            return {
                success: true,
                updated_count: updatedCount
            };

        } catch (error) {
            console.error(`❌ Error updating creditors with Side Conversation IDs:`, error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = CreditorContactService;