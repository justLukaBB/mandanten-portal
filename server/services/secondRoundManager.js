const SecondRoundDocumentService = require('./secondRoundDocumentService');
const SecondRoundZendeskUploader = require('./secondRoundZendeskUploader');
const SecondRoundEmailSender = require('./secondRoundEmailSender');

/**
 * Second Round Manager
 * Orchestrates the complete 2nd email round process:
 * 1. Generate individual "Pfändbares Einkommen" documents for each creditor
 * 2. Upload documents to Zendesk
 * 3. Send individual emails to each creditor with their specific document
 */
class SecondRoundManager {
    constructor() {
        this.documentService = new SecondRoundDocumentService();
        this.zendeskUploader = new SecondRoundZendeskUploader();
        this.emailSender = new SecondRoundEmailSender();
        
        // Track processing state
        this.processingState = new Map();
    }

    /**
     * Main function to execute the complete 2nd round process
     */
    async executeSecondRound(clientReference, mainTicketId, creditorContacts) {
        try {
            console.log(`\n🚀 Starting complete 2nd round process for client: ${clientReference}`);
            console.log(`🎫 Main ticket ID: ${mainTicketId}`);
            console.log(`👥 Creditor contacts: ${creditorContacts?.length || 0}`);

            // Validate inputs
            if (!clientReference) {
                throw new Error('Client reference is required');
            }
            if (!mainTicketId) {
                throw new Error('Main ticket ID is required');
            }
            if (!creditorContacts || creditorContacts.length === 0) {
                throw new Error('No creditor contacts provided');
            }

            // Set processing state
            this.processingState.set(clientReference, {
                status: 'processing',
                started_at: new Date().toISOString(),
                current_step: 'document_generation'
            });

            const processResult = {
                success: false,
                client_reference: clientReference,
                main_ticket_id: mainTicketId,
                processing_steps: {},
                start_time: new Date().toISOString()
            };

            // Step 1: Generate individual documents for each creditor
            console.log('\n📄 Step 1: Generating individual creditor documents...');
            this.updateProcessingStep(clientReference, 'document_generation');
            
            const documentResult = await this.documentService.generateSecondRoundDocuments(clientReference);
            processResult.processing_steps.document_generation = documentResult;

            if (!documentResult.success) {
                throw new Error(`Document generation failed: ${documentResult.error}`);
            }

            if (documentResult.is_nullplan) {
                console.log('⚠️ Nullplan case detected - skipping 2nd round email process');
                this.processingState.set(clientReference, {
                    status: 'completed_nullplan',
                    completed_at: new Date().toISOString(),
                    message: 'Nullplan case - no second round needed'
                });

                return {
                    success: true,
                    is_nullplan: true,
                    message: 'Nullplan case - no second round documents needed',
                    ...processResult,
                    end_time: new Date().toISOString()
                };
            }

            console.log(`✅ Generated ${documentResult.total_documents} documents for ${documentResult.total_creditors} creditors`);

            // Step 2: Upload documents to Zendesk
            console.log('\n📤 Step 2: Uploading documents to Zendesk...');
            this.updateProcessingStep(clientReference, 'document_upload');

            const uploadResult = await this.zendeskUploader.uploadSecondRoundDocuments(
                mainTicketId,
                documentResult.documents
            );
            processResult.processing_steps.document_upload = uploadResult;

            if (!uploadResult.success) {
                throw new Error(`Document upload failed: ${uploadResult.error}`);
            }

            console.log(`✅ Uploaded ${uploadResult.uploaded_count} documents to Zendesk`);

            // Step 3: Create individual download URLs
            console.log('\n🔗 Step 3: Creating individual download URLs...');
            this.updateProcessingStep(clientReference, 'url_creation');

            const urlResult = await this.zendeskUploader.createIndividualDownloadUrls(uploadResult.document_urls);
            processResult.processing_steps.url_creation = urlResult;

            if (!urlResult.success) {
                throw new Error(`URL creation failed: ${urlResult.error}`);
            }

            // Step 4: Send individual emails to each creditor
            console.log('\n📧 Step 4: Sending individual emails to creditors...');
            this.updateProcessingStep(clientReference, 'email_sending');

            // Get client data for emails
            const Client = require('../models/Client');
            const client = await Client.findOne({ aktenzeichen: clientReference });
            
            const clientData = {
                name: `${client.firstName} ${client.lastName}`,
                reference: client.aktenzeichen,
                email: client.email
            };

            const emailResult = await this.emailSender.sendSecondRoundEmails(
                mainTicketId,
                creditorContacts,
                clientData,
                documentResult.documents  // Pass documents with local file paths for attachments
            );
            processResult.processing_steps.email_sending = emailResult;

            if (!emailResult.success) {
                console.warn(`⚠️ Email sending partially failed: ${emailResult.error || 'Some emails failed'}`);
            }

            console.log(`✅ Sent ${emailResult.emails_sent}/${creditorContacts.length} emails successfully`);

            // Update processing state
            this.processingState.set(clientReference, {
                status: 'completed',
                completed_at: new Date().toISOString(),
                summary: {
                    documents_generated: documentResult.total_documents,
                    documents_uploaded: uploadResult.uploaded_count,
                    emails_sent: emailResult.emails_sent,
                    total_creditors: creditorContacts.length
                }
            });

            // Final result
            const finalResult = {
                success: true,
                client_reference: clientReference,
                main_ticket_id: mainTicketId,
                summary: {
                    total_creditors: creditorContacts.length,
                    documents_generated: documentResult.total_documents,
                    documents_uploaded: uploadResult.uploaded_count,
                    emails_sent: emailResult.emails_sent,
                    success_rate: Math.round((emailResult.emails_sent / creditorContacts.length) * 100)
                },
                processing_steps: processResult.processing_steps,
                start_time: processResult.start_time,
                end_time: new Date().toISOString()
            };

            console.log(`\n🎉 2nd round process completed successfully!`);
            console.log(`📊 Summary: ${emailResult.emails_sent}/${creditorContacts.length} creditors contacted with individual documents`);

            return finalResult;

        } catch (error) {
            console.error('❌ Error in 2nd round process:', error.message);

            // Update processing state
            this.processingState.set(clientReference, {
                status: 'failed',
                failed_at: new Date().toISOString(),
                error: error.message
            });

            return {
                success: false,
                error: error.message,
                client_reference: clientReference,
                main_ticket_id: mainTicketId,
                processing_steps: processResult.processing_steps || {},
                start_time: processResult.start_time,
                end_time: new Date().toISOString()
            };
        }
    }

    /**
     * Update processing step for tracking
     */
    updateProcessingStep(clientReference, step) {
        const currentState = this.processingState.get(clientReference) || {};
        this.processingState.set(clientReference, {
            ...currentState,
            current_step: step,
            updated_at: new Date().toISOString()
        });
    }

    /**
     * Get processing status for a client
     */
    getProcessingStatus(clientReference) {
        return this.processingState.get(clientReference) || {
            status: 'not_started',
            message: 'No 2nd round process initiated for this client'
        };
    }

    /**
     * Check if a client is eligible for 2nd round
     */
    async checkSecondRoundEligibility(clientReference) {
        try {
            // Get client data
            const Client = require('../models/Client');
            const client = await Client.findOne({ aktenzeichen: clientReference });
            
            if (!client) {
                throw new Error(`Client not found: ${clientReference}`);
            }

            // Check if first round was completed
            const firstRoundCompleted = client.creditor_contact_started && client.creditor_contact_started_at;
            
            // Check if client has pfändbar amount
            const pfaendbarAmount = client.debt_settlement_plan?.pfaendbar_amount ||
                                   client.financial_data?.pfaendbar_amount ||
                                   client.calculated_settlement_plan?.garnishable_amount || 0;

            const isNullplan = pfaendbarAmount < 1;
            
            // Check if there are creditors
            const creditors = client.final_creditor_list || client.creditor_calculation_table || [];
            const hasCreditors = creditors.length > 0;

            return {
                success: true,
                eligible: firstRoundCompleted && !isNullplan && hasCreditors,
                client_reference: clientReference,
                eligibility_details: {
                    first_round_completed: firstRoundCompleted,
                    is_nullplan: isNullplan,
                    pfaendbar_amount: pfaendbarAmount,
                    has_creditors: hasCreditors,
                    creditor_count: creditors.length
                },
                recommendation: firstRoundCompleted && !isNullplan && hasCreditors ? 
                    'Client is eligible for 2nd round process' : 
                    'Client is not eligible for 2nd round process'
            };

        } catch (error) {
            console.error('❌ Error checking 2nd round eligibility:', error.message);
            return {
                success: false,
                error: error.message,
                client_reference: clientReference
            };
        }
    }

    /**
     * Trigger 2nd round for eligible clients (can be called manually or automatically)
     */
    async triggerSecondRoundForClient(clientReference) {
        try {
            console.log(`🔄 Triggering 2nd round for client: ${clientReference}`);

            // Check eligibility first
            const eligibilityCheck = await this.checkSecondRoundEligibility(clientReference);
            
            if (!eligibilityCheck.success) {
                throw new Error(`Eligibility check failed: ${eligibilityCheck.error}`);
            }

            if (!eligibilityCheck.eligible) {
                return {
                    success: false,
                    message: 'Client is not eligible for 2nd round',
                    eligibility_details: eligibilityCheck.eligibility_details,
                    client_reference: clientReference
                };
            }

            // Get the main ticket ID and creditor contacts from first round
            const Client = require('../models/Client');
            const client = await Client.findOne({ aktenzeichen: clientReference });
            
            const mainTicketId = client.main_zendesk_ticket_id || client.zendesk_ticket_id;
            if (!mainTicketId) {
                throw new Error('No main ticket ID found for client');
            }

            // Get creditor contacts from the creditor contact service or database
            const creditorContacts = await this.getCreditorContactsForClient(clientReference);
            
            if (!creditorContacts || creditorContacts.length === 0) {
                throw new Error('No creditor contacts found for client');
            }

            // Execute the 2nd round process
            const result = await this.executeSecondRound(clientReference, mainTicketId, creditorContacts);

            return result;

        } catch (error) {
            console.error(`❌ Error triggering 2nd round for ${clientReference}:`, error.message);
            return {
                success: false,
                error: error.message,
                client_reference: clientReference
            };
        }
    }

    /**
     * Get creditor contacts for a client (from first round data)
     */
    async getCreditorContactsForClient(clientReference) {
        try {
            const Client = require('../models/Client');
            const client = await Client.findOne({ aktenzeichen: clientReference });
            
            if (!client) {
                throw new Error(`Client not found: ${clientReference}`);
            }

            // Get creditors from final creditor list
            const creditors = client.final_creditor_list || client.creditor_calculation_table || [];
            
            // Convert to creditor contact format
            const creditorContacts = creditors.map((creditor, index) => ({
                creditor_name: creditor.creditor_name || creditor.sender_name || `Creditor ${index + 1}`,
                creditor_email: creditor.creditor_email || creditor.sender_email,
                contact_id: creditor.id || `${clientReference}_creditor_${index + 1}`,
                success: true // Assume they were successfully contacted in first round
            }));

            return creditorContacts.filter(contact => contact.creditor_email); // Only return contacts with email

        } catch (error) {
            console.error('❌ Error getting creditor contacts:', error.message);
            return [];
        }
    }
}

module.exports = SecondRoundManager;