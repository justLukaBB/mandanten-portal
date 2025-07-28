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
    async processClientCreditorConfirmation(clientReference, clientData) {
        try {
            console.log(`\n🚀 Starting creditor contact process for client: ${clientReference}`);
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
                        creditor_name: creditor.creditor_name,
                        main_ticket_id: mainTicket.id,
                        contact_id: contactRecord.id,
                        success: true
                    });
                } catch (error) {
                    console.error(`❌ Failed to create contact record for ${creditor.creditor_name}:`, error.message);
                    contactRecords.push({
                        creditor_id: creditor.id,
                        creditor_name: creditor.creditor_name,
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

            console.log(`✅ Process completed:`);
            console.log(`   - Main ticket created: 1`);
            console.log(`   - Contact records: ${successfulContacts.length}/${creditors.length}`);
            console.log(`   - Side Conversation emails sent: ${successfulEmails.length}/${successfulContacts.length}`);

            return {
                success: true,
                client_reference: clientReference,
                zendesk_user_id: zendeskUser.id,
                main_ticket_id: mainTicket.id,
                main_ticket_subject: mainTicket.subject,
                tickets_created: 1, // Only one main ticket
                emails_sent: successfulEmails.length,
                total_creditors: creditors.length,
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
     * Get all confirmed creditors for a client from the existing document system
     * Converts confirmed documents to creditor contact records
     */
    async getConfirmedCreditorsForClient(clientReference) {
        // This integrates with the existing clientsData from server.js
        // In a real implementation, this would query the database
        
        // For demo, we'll extract from the in-memory clientsData
        const clientsData = require('../server').clientsData || {};
        const client = clientsData[clientReference];
        
        if (!client) {
            throw new Error(`Client ${clientReference} not found`);
        }

        // Get all confirmed creditor documents
        const confirmedDocs = (client.documents || []).filter(doc => 
            doc.document_status === 'creditor_confirmed' && 
            doc.extracted_data?.creditor_data &&
            !doc.is_duplicate
        );

        console.log(`📋 Found ${confirmedDocs.length} confirmed creditor documents`);

        // Group by creditor + reference number (unique contact key)
        const creditorGroups = new Map();
        
        confirmedDocs.forEach(doc => {
            const creditorData = doc.extracted_data.creditor_data;
            
            // Determine contact details
            const contactName = creditorData.is_representative && creditorData.actual_creditor 
                ? creditorData.actual_creditor 
                : creditorData.sender_name;
                
            const contactEmail = creditorData.sender_email;
            const referenceKey = creditorData.reference_number || 'NO_REF';
            
            // Create unique key
            const uniqueKey = `${contactName}|${referenceKey}`;
            
            if (!creditorGroups.has(uniqueKey)) {
                creditorGroups.set(uniqueKey, {
                    id: uuidv4(),
                    client_reference: clientReference,
                    creditor_name: contactName,
                    creditor_email: contactEmail,
                    creditor_address: creditorData.sender_address || '',
                    reference_number: referenceKey,
                    original_claim_amount: creditorData.claim_amount || 0,
                    document_ids: [doc.id],
                    is_representative: creditorData.is_representative || false,
                    actual_creditor: creditorData.actual_creditor || ''
                });
            } else {
                // Add to existing group and update amount if higher
                const existing = creditorGroups.get(uniqueKey);
                existing.document_ids.push(doc.id);
                if (creditorData.claim_amount && creditorData.claim_amount > existing.original_claim_amount) {
                    existing.original_claim_amount = creditorData.claim_amount;
                }
            }
        });

        return Array.from(creditorGroups.values());
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
            creditor_name: creditorData.creditor_name,
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
        
        console.log(`✅ Created creditor contact record: ${creditorData.creditor_name} (${contactId})`);
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

        for (let i = 0; i < contactRecords.length; i++) {
            const contactInfo = contactRecords[i];
            
            try {
                console.log(`📧 Creating Side Conversation ${i + 1}/${contactRecords.length} for ${contactInfo.creditor_name}...`);
                
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
                    sent_to: 'online@ra-scuric.de' // Test email
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

            // Process the response using our response processor
            const result = await this.processCreditorResponse({
                body: commentData.body || commentData.comment || commentData,
                subject: `Response from ${contactRecord.creditor_name}`,
                sender_email: contactRecord.creditor_email
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
}

module.exports = CreditorContactService;