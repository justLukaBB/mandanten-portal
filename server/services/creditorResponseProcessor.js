const { v4: uuidv4 } = require('uuid');
const DebtAmountExtractor = require('./debtAmountExtractor');

/**
 * Creditor Response Processor
 * Handles incoming creditor responses and updates debt amounts
 * Includes simulation for local development
 */
class CreditorResponseProcessor {
    constructor(creditorContactService) {
        this.creditorContactService = creditorContactService;
        this.debtAmountExtractor = new DebtAmountExtractor();
        
        // Response simulation templates for testing
        this.responseTemplates = {
            'full_response': [
                `Sehr geehrte Damen und Herren,

bezugnehmend auf Ihr Schreiben vom {date} teilen wir Ihnen die aktuelle Forderungshöhe mit:

Hauptforderung: {main_amount} EUR
Zinsen: {interest_amount} EUR  
Kosten: {costs_amount} EUR
---
Gesamtforderung: {total_amount} EUR

Die letzte Zahlung erfolgte am {last_payment_date}.
Aktenzeichen: {reference_number}

Mit freundlichen Grüßen
{creditor_name}`,

                `Guten Tag,

Aktenzeichen: {reference_number}

Aktuelle Forderung zum {date}:
- Hauptbetrag: {main_amount}€
- Verzugszinsen: {interest_amount}€
- Inkassokosten: {costs_amount}€
- Gesamt: {total_amount}€

Freundliche Grüße
{creditor_name}`,

                `Sehr geehrte Damen und Herren,

hiermit bestätigen wir die Forderung gegen Herrn/Frau {debtor_name}:

Forderungshöhe: {total_amount} EUR (Stand: {date})
Ihr Aktenzeichen: {reference_number}

Aufschlüsselung:
Hauptforderung: {main_amount} EUR
Zinsen 5%: {interest_amount} EUR
Mahnkosten: {costs_amount} EUR

Mit freundlichen Grüßen
{creditor_signature}`
            ],
            
            'simple_response': [
                `Aktuelle Forderung: {total_amount} EUR
Referenz: {reference_number}`,
                
                `Forderungshöhe zum {date}: {total_amount}€
Aktenzeichen: {reference_number}`,
                
                `Gesamtbetrag: {total_amount} EUR inkl. Zinsen und Kosten.
Az: {reference_number}`
            ]
        };
    }

    /**
     * Process incoming creditor email response
     * Extracts debt amount and updates contact record
     */
    async processCreditorResponse(emailData, isSimulation = false) {
        try {
            console.log(`📧 Processing creditor response${isSimulation ? ' (SIMULATION)' : ''}...`);
            console.log('📧 Email subject:', emailData.subject || 'No subject');
            console.log('📧 Email sender:', emailData.sender_email || 'No sender');  
            console.log('📧 Email body preview:', emailData.body?.slice(0, 200) || 'No body');
            
            // Extract reference number from email to find the right contact
            const referenceNumber = this.extractReferenceNumber(emailData.body, emailData.subject);
            
            if (!referenceNumber) {
                console.error('❌ No reference number found in email');
                return {
                    success: false,
                    error: 'Aktenzeichen nicht in E-Mail gefunden',
                    email_preview: emailData.body.slice(0, 100)
                };
            }

            console.log(`🔍 Found reference number: ${referenceNumber}`);
            
            // Find creditor contact record by reference number
            const contactRecord = this.findContactByReference(referenceNumber);
            
            if (!contactRecord) {
                console.error(`❌ No contact record found for reference: ${referenceNumber}`);
                console.log(`🔍 Available contact references:`, Array.from(this.creditorContactService.creditorContacts.values()).map(c => c.reference_number));
                return {
                    success: false,
                    error: `Kein Gläubiger-Datensatz für Aktenzeichen ${referenceNumber} gefunden`,
                    reference_number: referenceNumber
                };
            }

            console.log(`✅ Found contact record: ${contactRecord.creditor_name}`);

            // Extract debt amount from email body
            const extractionResult = await this.debtAmountExtractor.extractDebtAmount(
                emailData.body,
                {
                    creditor_name: contactRecord.creditor_name,
                    reference_number: referenceNumber,
                    original_claim_amount: contactRecord.original_claim_amount
                }
            );

            console.log(`💰 Extraction result: ${extractionResult.extracted_amount} EUR (confidence: ${extractionResult.confidence})`);

            // Determine final amount and source
            let finalAmount, amountSource, contactStatus;
            
            if (extractionResult.extracted_amount > 0 && extractionResult.confidence >= 0.6) {
                finalAmount = extractionResult.extracted_amount;
                amountSource = 'creditor_response';
                contactStatus = 'responded';
            } else {
                // Fallback logic
                if (contactRecord.original_claim_amount && contactRecord.original_claim_amount > 0) {
                    finalAmount = contactRecord.original_claim_amount;
                    amountSource = 'original_document';
                } else {
                    finalAmount = 100.00;
                    amountSource = 'fallback';
                }
                contactStatus = 'response_unclear';
                console.log(`⚠️ Low confidence extraction, using fallback amount: ${finalAmount} EUR`);
            }

            // Update contact record
            const updateResult = this.updateContactRecord(contactRecord.id, {
                contact_status: contactStatus,
                response_received_at: new Date().toISOString(),
                current_debt_amount: extractionResult.extracted_amount > 0 ? extractionResult.extracted_amount : null,
                creditor_response_text: emailData.body,
                final_debt_amount: finalAmount,
                amount_source: amountSource,
                extraction_confidence: extractionResult.confidence,
                extraction_details: extractionResult,
                updated_at: new Date().toISOString()
            });

            console.log(`✅ Updated contact record: ${contactRecord.creditor_name} - Final amount: ${finalAmount} EUR`);

            // SYNC BACK TO CLIENT'S FINAL_CREDITOR_LIST for admin dashboard visibility
            await this.syncResponseToClientCreditorList(contactRecord.client_reference, contactRecord, {
                final_debt_amount: finalAmount,
                amount_source: amountSource,
                response_received_at: new Date().toISOString(),
                creditor_response_text: emailData.body,
                extraction_confidence: extractionResult.confidence
            });

            return {
                success: true,
                creditor_id: contactRecord.id,
                creditor_name: contactRecord.creditor_name,
                reference_number: referenceNumber,
                extracted_amount: extractionResult.extracted_amount,
                final_amount: finalAmount,
                amount_source: amountSource,
                confidence: extractionResult.confidence,
                contact_status: contactStatus,
                extraction_details: extractionResult,
                is_simulation: isSimulation
            };
            
        } catch (error) {
            console.error('❌ Error processing creditor response:', error.message);
            return {
                success: false,
                error: error.message,
                email_preview: emailData.body?.slice(0, 100)
            };
        }
    }

    /**
     * Extract reference number from email content
     * Looks for patterns like [12345678901], Az: 12345, etc.
     */
    extractReferenceNumber(emailBody, emailSubject = '') {
        const fullText = `${emailSubject || ''} ${emailBody || ''}`;
        
        // Patterns to find reference numbers (all with global flag for matchAll)
        const patterns = [
            // Ticket-ID pattern from our emails
            /Ticket-ID:\s*\[([^\]]+)\]/gi,
            // Aktenzeichen patterns
            /(?:aktenzeichen|az|referenz|ref)[\.\s]*:?\s*([A-Za-z0-9\-_]+)/gi,
            // Your reference pattern
            /(?:ihr aktenzeichen|your reference)[\.\s]*:?\s*([A-Za-z0-9\-_]+)/gi,
            // Standalone reference numbers (11 digits like in example)
            /\b(\d{11})\b/g,
            // Bracketed references
            /\[([A-Za-z0-9\-_]{5,})\]/g
        ];

        for (const pattern of patterns) {
            const matches = [...fullText.matchAll(pattern)];
            for (const match of matches) {
                const ref = match[1]?.trim();
                if (ref && ref.length >= 5) {
                    console.log(`📋 Found reference with pattern: ${match[0]} -> ${ref}`);
                    return ref;
                }
            }
        }

        console.log('❌ No reference number pattern found');
        return null;
    }

    /**
     * Find contact record by reference number
     */
    findContactByReference(referenceNumber) {
        if (!this.creditorContactService || !this.creditorContactService.creditorContacts) {
            console.error('❌ CreditorContactService not available');
            return null;
        }

        // Search through all contact records
        for (const contact of this.creditorContactService.creditorContacts.values()) {
            if (contact.reference_number === referenceNumber) {
                console.log(`✅ Found contact by reference: ${contact.creditor_name}`);
                return contact;
            }
        }

        console.log(`❌ No contact found for reference: ${referenceNumber}`);
        return null;
    }

    /**
     * Update contact record with response data
     */
    updateContactRecord(contactId, updates) {
        if (!this.creditorContactService || !this.creditorContactService.creditorContacts) {
            throw new Error('CreditorContactService not available');
        }

        const contact = this.creditorContactService.creditorContacts.get(contactId);
        if (!contact) {
            throw new Error(`Contact record ${contactId} not found`);
        }

        // Update contact record
        Object.assign(contact, updates);

        console.log(`✅ Updated contact record ${contactId} with response data`);
        return contact;
    }

    /**
     * Generate simulated creditor response for testing
     */
    generateSimulatedResponse(contactRecord, responseType = 'random') {
        try {
            console.log(`🎭 Generating simulated response for: ${contactRecord.creditor_name}`);

            // Determine response type
            if (responseType === 'random') {
                const types = ['full_response', 'simple_response', 'no_response'];
                const weights = [0.6, 0.25, 0.15]; // 60% full, 25% simple, 15% no response
                
                const random = Math.random();
                if (random < weights[0]) {
                    responseType = 'full_response';
                } else if (random < weights[0] + weights[1]) {
                    responseType = 'simple_response';
                } else {
                    responseType = 'no_response';
                }
            }

            // Handle no response case
            if (responseType === 'no_response') {
                return {
                    has_response: false,
                    response_type: 'no_response',
                    email_body: null,
                    simulation_note: 'Gläubiger hat nicht geantwortet - Timeout nach 14 Tagen'
                };
            }

            // Generate realistic amounts
            const originalAmount = contactRecord.original_claim_amount || 0;
            let mainAmount;

            if (originalAmount > 0) {
                // Vary amount by ±30% to simulate real changes
                const variance = 0.7 + Math.random() * 0.6; // 0.7 to 1.3
                mainAmount = Math.round(originalAmount * variance * 100) / 100;
            } else {
                // Generate random amount between 500-5000 EUR
                mainAmount = Math.round((500 + Math.random() * 4500) * 100) / 100;
            }

            const interestAmount = Math.round(mainAmount * (0.05 + Math.random() * 0.10) * 100) / 100;
            const costsAmount = Math.round((50 + Math.random() * 150) * 100) / 100;
            const totalAmount = mainAmount + interestAmount + costsAmount;

            // Choose template
            const templates = this.responseTemplates[responseType];
            const template = templates[Math.floor(Math.random() * templates.length)];

            // Generate response data
            const responseData = {
                date: new Date().toLocaleDateString('de-DE'),
                reference_number: contactRecord.reference_number,
                creditor_name: contactRecord.creditor_name,
                creditor_signature: `${contactRecord.creditor_name}\nForderungsmanagement`,
                debtor_name: 'Max Mustermann', // Could be made dynamic
                main_amount: mainAmount.toFixed(2).replace('.', ','),
                interest_amount: interestAmount.toFixed(2).replace('.', ','),
                costs_amount: costsAmount.toFixed(2).replace('.', ','),
                total_amount: totalAmount.toFixed(2).replace('.', ','),
                last_payment_date: this.getRandomPastDate()
            };

            const emailBody = template.replace(/\{(\w+)\}/g, (match, key) => {
                return responseData[key] || match;
            });

            console.log(`✅ Generated ${responseType} response with amount: ${totalAmount} EUR`);

            return {
                has_response: true,
                response_type: responseType,
                email_body: emailBody,
                extracted_amount: totalAmount,
                simulation_data: responseData,
                simulation_note: `Simulierte ${responseType} Antwort mit realistischen Beträgen`
            };
            
        } catch (error) {
            console.error('❌ Error generating simulated response:', error.message);
            return {
                has_response: false,
                response_type: 'error',
                email_body: null,
                error: error.message,
                simulation_note: 'Fehler bei der Antwort-Simulation'
            };
        }
    }

    /**
     * Generate random past date for "last payment"
     */
    getRandomPastDate() {
        const today = new Date();
        const pastDays = Math.floor(Math.random() * 365) + 30; // 30-365 days ago
        const pastDate = new Date(today.getTime() - (pastDays * 24 * 60 * 60 * 1000));
        return pastDate.toLocaleDateString('de-DE');
    }

    /**
     * Simulate responses for all creditors of a client
     */
    async simulateResponsesForClient(clientReference) {
        try {
            console.log(`🎭 Simulating creditor responses for client: ${clientReference}`);

            // Get all contacts for client
            const clientContacts = Array.from(this.creditorContactService.creditorContacts.values())
                .filter(contact => contact.client_reference === clientReference && contact.contact_status === 'email_sent');

            if (clientContacts.length === 0) {
                return {
                    success: true,
                    message: 'No contacts found with email_sent status',
                    client_reference: clientReference,
                    simulated_responses: 0,
                    results: []
                };
            }

            console.log(`📧 Found ${clientContacts.length} contacts to simulate responses for`);

            const results = [];

            for (const contact of clientContacts) {
                try {
                    // Generate simulated response
                    const simulation = this.generateSimulatedResponse(contact, 'random');

                    if (simulation.has_response) {
                        // Process the simulated response
                        const processResult = await this.processCreditorResponse({
                            body: simulation.email_body,
                            subject: `Re: Gläubiger-Anfrage - Az: ${contact.reference_number}`,
                            sender_email: contact.creditor_email || 'simulation@test.com'
                        }, true); // isSimulation = true

                        results.push({
                            ...processResult,
                            simulation_data: simulation
                        });
                    } else {
                        // Mark as no response for timeout processing later
                        results.push({
                            creditor_id: contact.id,
                            creditor_name: contact.creditor_name,
                            reference_number: contact.reference_number,
                            success: true,
                            simulation_data: simulation,
                            action: 'marked_for_timeout',
                            message: 'Gläubiger hat nicht geantwortet'
                        });
                    }
                } catch (error) {
                    console.error(`❌ Error simulating response for ${contact.creditor_name}:`, error.message);
                    results.push({
                        creditor_id: contact.id,
                        creditor_name: contact.creditor_name,
                        reference_number: contact.reference_number,
                        success: false,
                        error: error.message
                    });
                }
            }

            const successCount = results.filter(r => r.success).length;
            const responseCount = results.filter(r => r.simulation_data?.has_response).length;

            console.log(`✅ Simulation complete: ${responseCount} responses generated, ${successCount} successfully processed`);

            return {
                success: true,
                client_reference: clientReference,
                total_contacts: clientContacts.length,
                simulated_responses: responseCount,
                processed_successfully: successCount,
                results: results
            };

        } catch (error) {
            console.error('❌ Error simulating client responses:', error.message);
            return {
                success: false,
                client_reference: clientReference,
                error: error.message
            };
        }
    }

    /**
     * Sync creditor response data back to client's final_creditor_list
     * This ensures admin dashboard shows updated amounts from creditor responses
     */
    async syncResponseToClientCreditorList(clientReference, contactRecord, responseData) {
        try {
            console.log(`🔄 Syncing creditor response to client ${clientReference} final_creditor_list...`);
            
            // Get client from database
            const Client = require('../models/Client');
            const client = await Client.findOne({ aktenzeichen: clientReference });
            
            if (!client) {
                console.error(`❌ Client ${clientReference} not found for syncing response`);
                return false;
            }

            // Find matching creditor in final_creditor_list
            const finalCreditorList = client.final_creditor_list || [];
            const creditorIndex = finalCreditorList.findIndex(creditor => 
                (creditor.sender_name === contactRecord.creditor_name) ||
                (creditor.reference_number === contactRecord.reference_number) ||
                (creditor.sender_email === contactRecord.creditor_email)
            );

            if (creditorIndex === -1) {
                console.error(`❌ Creditor ${contactRecord.creditor_name} not found in client's final_creditor_list`);
                return false;
            }

            // Update the creditor with response data
            const creditor = finalCreditorList[creditorIndex];
            
            // Update amount information
            creditor.claim_amount = responseData.final_debt_amount; // THIS IS KEY - updates amount in admin dashboard
            creditor.original_claim_amount = creditor.claim_amount; // Keep original
            creditor.creditor_response_amount = responseData.final_debt_amount;
            
            // Update status information
            creditor.status = 'responded';
            creditor.amount_source = responseData.amount_source;
            creditor.response_received_at = responseData.response_received_at;
            creditor.extraction_confidence = responseData.extraction_confidence;
            creditor.creditor_response_text = responseData.creditor_response_text;
            creditor.response_processed_at = new Date().toISOString();
            
            // Add response metadata
            creditor.response_metadata = {
                contact_record_id: contactRecord.id,
                processed_by: 'side_conversation_monitor',
                processing_method: 'claude_ai_extraction'
            };

            // Update client in database
            client.final_creditor_list = finalCreditorList;
            client.updated_at = new Date();
            
            // Add to status history
            client.status_history.push({
                id: require('uuid').v4(),
                status: 'creditor_response_processed',
                changed_by: 'system',
                metadata: {
                    creditor_name: contactRecord.creditor_name,
                    old_amount: creditor.original_claim_amount || 0,
                    new_amount: responseData.final_debt_amount,
                    amount_change: (responseData.final_debt_amount - (creditor.original_claim_amount || 0)),
                    extraction_confidence: responseData.extraction_confidence,
                    response_method: 'side_conversation'
                },
                created_at: new Date()
            });

            // Save to database
            await client.save({ validateModifiedOnly: true });
            
            console.log(`✅ Synced creditor response: ${contactRecord.creditor_name} amount updated from ${creditor.original_claim_amount || 'N/A'}€ to ${responseData.final_debt_amount}€`);
            
            return true;
            
        } catch (error) {
            console.error(`❌ Error syncing creditor response to client ${clientReference}:`, error.message);
            return false;
        }
    }

    /**
     * Get processing statistics for a client
     */
    getClientResponseStats(clientReference) {
        if (!this.creditorContactService?.creditorContacts) {
            return null;
        }

        const contacts = Array.from(this.creditorContactService.creditorContacts.values())
            .filter(c => c.client_reference === clientReference);

        return {
            total_creditors: contacts.length,
            emails_sent: contacts.filter(c => c.contact_status === 'email_sent').length,
            responses_received: contacts.filter(c => c.contact_status === 'responded').length,
            unclear_responses: contacts.filter(c => c.contact_status === 'response_unclear').length,
            pending_responses: contacts.filter(c => c.contact_status === 'email_sent').length,
            total_final_debt: contacts.reduce((sum, c) => sum + (c.final_debt_amount || 0), 0),
            amount_sources: {
                creditor_response: contacts.filter(c => c.amount_source === 'creditor_response').length,
                original_document: contacts.filter(c => c.amount_source === 'original_document').length,
                fallback: contacts.filter(c => c.amount_source === 'fallback').length
            }
        };
    }
}

module.exports = CreditorResponseProcessor;