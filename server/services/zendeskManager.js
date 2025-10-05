const axios = require('axios');
require('dotenv').config();

/**
 * Zendesk API Manager
 * Handles all Zendesk API operations for creditor contact management
 */
class ZendeskManager {
    constructor() {
        this.config = {
            subdomain: process.env.ZENDESK_SUBDOMAIN || 'your-law-firm',
            email: process.env.ZENDESK_EMAIL || 'api@your-law-firm.com',
            token: process.env.ZENDESK_TOKEN || 'your-zendesk-api-token',
        };
        
        this.apiUrl = `https://${this.config.subdomain}.zendesk.com/api/v2/`;
        
        this.headers = {
            'Content-Type': 'application/json',
        };
        
        this.auth = {
            username: `${this.config.email}/token`,
            password: this.config.token
        };

        // Custom field IDs - these need to be created in Zendesk first
        this.customFields = {
            creditor_name: process.env.ZENDESK_FIELD_CREDITOR_NAME || 'custom_field_12345',
            reference_number: process.env.ZENDESK_FIELD_REFERENCE_NUMBER || 'custom_field_12346',
            original_claim_amount: process.env.ZENDESK_FIELD_ORIGINAL_CLAIM_AMOUNT || 'custom_field_12347',
            current_debt_amount: process.env.ZENDESK_FIELD_CURRENT_DEBT_AMOUNT || 'custom_field_12348',
            amount_source: process.env.ZENDESK_FIELD_AMOUNT_SOURCE || 'custom_field_12349',
            client_reference: process.env.ZENDESK_FIELD_CLIENT_REFERENCE || 'custom_field_12350'
        };
    }

    /**
     * Find existing Zendesk user by email (does not create new users)
     */
    async findClientUser(clientReference, clientName, clientEmail) {
        try {
            console.log(`🔍 Searching for existing Zendesk user: ${clientEmail}`);
            
            // Search for existing user by email
            const searchUrl = `${this.apiUrl}users/search.json`;
            const searchResponse = await axios.get(searchUrl, {
                auth: this.auth,
                params: { query: `email:${clientEmail}` }
            });

            if (searchResponse.data.users && searchResponse.data.users.length > 0) {
                const user = searchResponse.data.users[0];
                console.log(`✅ Found existing Zendesk user: ${clientEmail} (ID: ${user.id})`);
                console.log(`   Name: ${user.name}`);
                console.log(`   Role: ${user.role}`);
                return user;
            }

            // User not found - throw error instead of creating
            throw new Error(`Zendesk user with email '${clientEmail}' not found. Please create the user manually in Zendesk first.`);

        } catch (error) {
            if (error.message.includes('not found')) {
                // Re-throw our custom error message
                throw error;
            }
            
            console.error('❌ Error searching for Zendesk user:', error.message);
            if (error.response) {
                console.error('Response data:', error.response.data);
            }
            throw new Error(`Failed to search for Zendesk user: ${error.message}`);
        }
    }

    /**
     * Create main ticket for all creditor contacts of a client
     */
    async createMainCreditorTicket(clientUserId, clientData, creditors) {
        try {
            const subject = `Gläubiger-Anfragen: ${clientData.name} (${creditors.length} Gläubiger)`;
            
            // Separate creditors with and without emails
            const creditorsWithEmail = creditors.filter(c => c.creditor_email);
            const creditorsWithoutEmail = creditors.filter(c => !c.creditor_email);
            
            // Generate creditor overview
            const creditorOverview = creditors.map((creditor, index) => 
                `${index + 1}. ${creditor.creditor_name} ${!creditor.creditor_email ? '⚠️ (KEIN E-MAIL)' : ''}
   • Aktenzeichen: ${creditor.reference_number}
   • E-Mail: ${creditor.creditor_email || '❌ FEHLT - MANUELLE KONTAKTIERUNG ERFORDERLICH'}
   • Betrag: ${creditor.original_claim_amount ? creditor.original_claim_amount + ' EUR' : 'Unbekannt'}
   • Adresse: ${creditor.creditor_address || 'Nicht verfügbar'}`
            ).join('\n\n');

            const totalAmount = creditors.reduce((sum, c) => sum + (c.original_claim_amount || 0), 0);
            
            const description = `Automatische Gläubiger-Anfragen für alle bestätigten Gläubiger.

👤 MANDANT: ${clientData.name}
📧 E-Mail: ${clientData.email}
📞 Telefon: ${clientData.phone || 'Nicht verfügbar'}
🏠 Adresse: ${clientData.address || 'Nicht verfügbar'}

📊 GLÄUBIGER-ÜBERSICHT (${creditors.length} Gläubiger):
${creditorOverview}

💰 GESAMTBETRAG: ${totalAmount.toFixed(2)} EUR

📅 PROZESS-STATUS:
• Erstellt: ${new Date().toLocaleString('de-DE')}
• Status: Side Conversations werden erstellt
• E-Mails: ${creditorsWithEmail.length} von ${creditors.length} Gläubigern
${creditorsWithoutEmail.length > 0 ? `• ⚠️ ACHTUNG: ${creditorsWithoutEmail.length} Gläubiger ohne E-Mail - MANUELLE KONTAKTIERUNG ERFORDERLICH` : ''}

🤖 Diese Anfragen wurden automatisch generiert basierend auf den verarbeiteten Gläubigerdokumenten.
📧 Jeder Gläubiger erhält eine separate Side Conversation E-Mail von diesem Ticket.
${creditorsWithoutEmail.length > 0 ? `
⚠️ MANUELLE KONTAKTIERUNG ERFORDERLICH:
${creditorsWithoutEmail.map((c, i) => `${i + 1}. ${c.creditor_name} - ${c.original_claim_amount ? c.original_claim_amount + ' EUR' : 'Betrag unbekannt'}`).join('\n')}

Diese Gläubiger haben keine E-Mail-Adresse und müssen telefonisch oder postalisch kontaktiert werden.` : ''}

---
INTERNE NOTIZEN:
- Alle Gläubiger-E-Mails werden als Side Conversations von diesem Ticket versendet
- Antworten der Gläubiger kommen als Replies zu den jeweiligen Side Conversations
- Status-Updates werden kontinuierlich in diesem Ticket dokumentiert
${creditorsWithoutEmail.length > 0 ? `- ${creditorsWithoutEmail.length} Gläubiger benötigen manuelle Kontaktierung (keine E-Mail)` : ''}`;

            const ticketData = {
                ticket: {
                    requester_id: clientUserId,
                    subject: subject,
                    comment: {
                        body: description
                    },
                    type: 'task',
                    priority: 'normal',
                    status: 'open',
                    tags: [
                        'gläubiger-anfragen', 
                        'automatisch', 
                        clientData.id,
                        `gläubiger-anzahl-${creditors.length}`,
                        'side-conversations'
                    ]
                }
            };

            const url = `${this.apiUrl}tickets.json`;
            const response = await axios.post(url, ticketData, {
                auth: this.auth,
                headers: this.headers
            });

            console.log(`✅ Created main Zendesk ticket: ${subject} (ID: ${response.data.ticket.id})`);
            return response.data.ticket;

        } catch (error) {
            console.error('❌ Error creating Zendesk ticket:', error.message);
            if (error.response) {
                console.error('Response data:', JSON.stringify(error.response.data, null, 2));
                if (error.response.data.details) {
                    console.error('Error details:', JSON.stringify(error.response.data.details, null, 2));
                }
            }
            
            // If custom fields are causing issues, try without them
            if (error.response?.status === 422) {
                console.log('🔄 Retrying ticket creation without custom fields...');
                try {
                    const fallbackTicketData = {
                        ticket: {
                            requester_id: clientUserId,
                            subject: subject,
                            comment: {
                                body: description
                            },
                            type: 'task',
                            priority: 'normal',
                            status: 'open',
                            tags: ['gläubiger-anfrage', 'automatisch', creditorData.client_reference]
                        }
                    };

                    const fallbackResponse = await axios.post(url, fallbackTicketData, {
                        auth: this.auth,
                        headers: this.headers
                    });

                    console.log(`✅ Created Zendesk ticket (without custom fields): ${subject} (ID: ${fallbackResponse.data.ticket.id})`);
                    return fallbackResponse.data.ticket;
                } catch (fallbackError) {
                    console.error('❌ Fallback ticket creation also failed:', fallbackError.message);
                }
            }
            
            throw new Error(`Failed to create main Zendesk ticket: ${error.message}`);
        }
    }

    /**
     * Add status update to main ticket about side conversation progress
     */
    async addSideConversationStatusUpdate(ticketId, updates) {
        try {
            const timestamp = new Date().toLocaleString('de-DE');
            
            const statusText = updates.map(update => 
                `• ${update.creditor_name} (${update.creditor_email}): ${update.status} ${update.success ? '✅' : '❌'}`
            ).join('\n');

            const successCount = updates.filter(u => u.success).length;
            const totalCount = updates.length;

            const commentBody = `📊 SIDE CONVERSATION STATUS UPDATE - ${timestamp}

📧 E-MAIL VERSAND STATUS:
${statusText}

📈 ZUSAMMENFASSUNG:
• Erfolgreich versendet: ${successCount}/${totalCount} E-Mails
• Fehlgeschlagen: ${totalCount - successCount}/${totalCount} E-Mails

${successCount === totalCount ? '✅ Alle E-Mails erfolgreich versendet!' : 
  successCount > 0 ? '⚠️ Teilweise erfolgreich - manuelle Nachbearbeitung erforderlich' : 
  '❌ Alle E-Mails fehlgeschlagen - manuelle Bearbeitung erforderlich'}

---
Diese Status-Updates werden automatisch aktualisiert wenn Gläubiger antworten.`;

            return await this.addTicketComment(ticketId, commentBody, false);

        } catch (error) {
            console.error(`❌ Error adding status update to ticket ${ticketId}:`, error.message);
            throw error;
        }
    }

    /**
     * Send creditor email through Zendesk Side Conversations (actually sends email)
     */
    async sendCreditorEmailViaTicket(ticketId, creditorData, clientData) {
        // Use test email for now - moved outside try block for scope
        const testEmail = 'justlukax@gmail.com';
        const emailBody = this.generateCreditorEmailBody(creditorData, clientData);
        const emailSubject = `Gläubiger-Anfrage: ${creditorData.creditor_name} - Az: ${creditorData.reference_number}`;
        
        try {
            console.log(`📧 Creating Side Conversation to send email to ${testEmail}...`);
            
            // Create Side Conversation with correct API structure
            const sideConversationData = {
                message: {
                    to: [
                        {
                            email: testEmail,
                            name: creditorData.creditor_name
                        }
                    ],
                    subject: emailSubject,
                    body: emailBody
                }
            };

            // Use correct Side Conversations API endpoint
            const url = `${this.apiUrl}tickets/${ticketId}/side_conversations.json`;
            console.log(`🔗 API URL: ${url}`);
            console.log(`📝 Request data:`, JSON.stringify(sideConversationData, null, 2));

            const response = await axios.post(url, sideConversationData, {
                auth: this.auth,
                headers: this.headers
            });

            console.log(`✅ Side Conversation created successfully!`);
            console.log(`📨 Side Conversation ID: ${response.data.side_conversation?.id}`);
            console.log(`📧 E-Mail sent to: ${testEmail}`);
            
            // Add internal note to main ticket about the side conversation
            await this.addTicketComment(
                ticketId, 
                `📧 Side Conversation E-Mail gesendet an ${testEmail} (${creditorData.creditor_name})\n\nBetreff: ${emailSubject}\nSide Conversation ID: ${response.data.side_conversation?.id}\n\nStatus: E-Mail erfolgreich versendet ✅`,
                false // Internal comment
            );
            
            return {
                success: true,
                ticket_id: ticketId,
                side_conversation_id: response.data.side_conversation?.id,
                recipient_email: testEmail,
                recipient_name: creditorData.creditor_name,
                subject: emailSubject,
                email_sent: true
            };

        } catch (error) {
            console.error(`❌ Error creating Side Conversation for ticket ${ticketId}:`, error.message);
            console.error(`❌ Error status:`, error.response?.status);
            if (error.response) {
                console.error('❌ Response data:', JSON.stringify(error.response.data, null, 2));
                console.error('❌ Response headers:', JSON.stringify(error.response.headers, null, 2));
            }
            
            // Check if it's a specific Side Conversation error
            const isPermissionError = error.response?.status === 403 || error.response?.status === 401;
            const isPlanError = error.response?.data?.error?.includes?.('plan') || 
                               error.response?.data?.error?.includes?.('subscription') ||
                               error.response?.data?.error?.includes?.('addon');
            
            let errorReason = '';
            if (isPermissionError) {
                errorReason = 'Zendesk Side Conversations benötigt Professional+ Plan oder Collaboration Add-on';
            } else if (error.response?.status === 422) {
                errorReason = `API Validation Error: ${error.response?.data?.error || 'Unbekannter Validierungsfehler'}`;
            } else {
                errorReason = error.message;
            }
            
            // Fallback: Add detailed ticket comment with manual instruction
            console.log(`🔄 Falling back to ticket comment with manual email instruction...`);
            try {
                const fallbackCommentData = {
                    ticket: {
                        comment: {
                            body: `📧 GLÄUBIGER E-MAIL ERFORDERLICH - MANUELL SENDEN\n\n` +
                                  `🎯 AN: ${testEmail}\n` +
                                  `👤 NAME: ${creditorData.creditor_name}\n` +
                                  `📋 BETREFF: ${emailSubject}\n\n` +
                                  `📝 E-MAIL INHALT:\n${'-'.repeat(50)}\n${emailBody}\n${'-'.repeat(50)}\n\n` +
                                  `⚠️ Side Conversation Fehler: ${errorReason}\n\n` +
                                  `✋ AKTION ERFORDERLICH: Bitte E-Mail manuell an ${testEmail} senden`,
                            public: false, // Keep internal
                        },
                        status: 'open' // Set to open so it requires attention
                    }
                };

                const fallbackUrl = `${this.apiUrl}tickets/${ticketId}.json`;
                const fallbackResponse = await axios.put(fallbackUrl, fallbackCommentData, {
                    auth: this.auth,
                    headers: this.headers
                });

                console.log(`✅ Added detailed manual email instruction to ticket ${ticketId}`);
                return {
                    success: false,
                    ticket_id: ticketId,
                    side_conversation_created: false,
                    manual_action_required: true,
                    recipient_email: testEmail,
                    recipient_name: creditorData.creditor_name,
                    subject: emailSubject,
                    error: errorReason,
                    fallback_used: true
                };
                
            } catch (fallbackError) {
                console.error(`❌ Fallback comment also failed:`, fallbackError.message);
            }
            
            throw new Error(`Failed to create Side Conversation: ${errorReason}`);
        }
    }

    /**
     * Add a comment to an existing ticket
     */
    async addTicketComment(ticketId, commentBody, isPublic = false) {
        try {
            const commentData = {
                ticket: {
                    comment: {
                        body: commentBody,
                        public: isPublic
                    }
                }
            };

            const url = `${this.apiUrl}tickets/${ticketId}.json`;
            const response = await axios.put(url, commentData, {
                auth: this.auth,
                headers: this.headers
            });

            return response.data;
        } catch (error) {
            console.error(`❌ Error adding comment to ticket ${ticketId}:`, error.message);
            throw error;
        }
    }

    /**
     * Generate professional email content for creditor inquiry
     */
    generateCreditorEmailBody(creditorData, clientData) {
        const clientName = clientData.name || '[MANDANT_NAME]';
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + 14);
        
        return `Sehr geehrte Damen und Herren,

wir vertreten ${clientName} in einem Privatinsolvenzverfahren und bitten Sie um Auskunft über die aktuelle Höhe Ihrer Forderung.

📋 MANDANTENDATEN:
• Name: ${clientName}
• Ihr Aktenzeichen: ${creditorData.reference_number}

📊 BENÖTIGTE INFORMATIONEN:
1. Aktuelle Gesamtforderung (Hauptforderung + Zinsen + Kosten)
2. Detaillierte Aufschlüsselung der Forderungsbestandteile
3. Datum der letzten Zahlung (falls vorhanden)
4. Aktueller Verzugszinssatz (falls anwendbar)

Wir bitten um Übersendung einer aktuellen Forderungsaufstellung bis zum ${deadline.toLocaleDateString('de-DE')}.

Bei Rückfragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen

Thomas Scuric Rechtsanwälte
Thomas Scuric, Rechtsanwalt

📧 WICHTIGER HINWEIS:
Bitte antworten Sie direkt auf diese E-Mail. Ihre Antwort wird automatisch unserem Bearbeitungssystem zugeordnet und beschleunigt die Bearbeitung Ihrer Forderungsangaben.

---
Diese E-Mail wurde automatisch im Rahmen des Insolvenzverfahrens generiert.
Ticket-ID: [${creditorData.reference_number}] für interne Zuordnung.`;
    }

    /**
     * Update Zendesk ticket with extracted debt amount
     */
    async updateTicketWithAmount(ticketId, amount, amountSource = 'creditor_response') {
        try {
            const ticketData = {
                ticket: {
                    custom_fields: [
                        { id: parseInt(this.customFields.current_debt_amount), value: amount.toString() },
                        { id: parseInt(this.customFields.amount_source), value: amountSource }
                    ],
                    status: 'solved'
                }
            };

            const url = `${this.apiUrl}tickets/${ticketId}.json`;
            const response = await axios.put(url, ticketData, {
                auth: this.auth,
                headers: this.headers
            });

            console.log(`✅ Updated Zendesk ticket ${ticketId} with amount: ${amount} EUR`);
            return response.data;

        } catch (error) {
            console.error(`❌ Error updating ticket ${ticketId} with amount:`, error.message);
            throw new Error(`Failed to update ticket with amount: ${error.message}`);
        }
    }

    /**
     * Get ticket information from Zendesk
     */
    async getTicket(ticketId) {
        try {
            const url = `${this.apiUrl}tickets/${ticketId}.json`;
            const response = await axios.get(url, {
                auth: this.auth
            });

            return response.data.ticket;

        } catch (error) {
            console.error(`❌ Error getting ticket ${ticketId}:`, error.message);
            throw new Error(`Failed to get ticket: ${error.message}`);
        }
    }

    /**
     * Map Zendesk status to our internal status
     */
    mapZendeskStatusToOurs(zendeskStatus) {
        const statusMap = {
            'new': 'created',
            'open': 'sent',
            'pending': 'sent',
            'hold': 'pending',
            'solved': 'responded',
            'closed': 'completed'
        };
        
        return statusMap[zendeskStatus] || 'unknown';
    }

    /**
     * Test Zendesk connection
     */
    async testConnection() {
        try {
            const url = `${this.apiUrl}users/me.json`;
            const response = await axios.get(url, {
                auth: this.auth
            });

            console.log('✅ Zendesk connection successful');
            console.log(`Connected as: ${response.data.user.name} (${response.data.user.email})`);
            return true;

        } catch (error) {
            console.error('❌ Zendesk connection failed:', error.message);
            return false;
        }
    }

    /**
     * Create settlement plan distribution ticket
     */
    async createSettlementPlanTicket(zendeskUserId, clientData, settlementData, creditors) {
        try {
            console.log(`🎫 Creating settlement plan ticket for ${clientData.name}...`);
            
            const planType = settlementData.plan_type || 'Quotenplan';
            const monthlyPayment = settlementData.monthly_payment || 0;
            const totalDebt = settlementData.total_debt || 0;
            const creditorCount = creditors.length;
            
            // Create the settlement plan ticket subject and description
            const subject = `📄 Schuldenbereinigungsplan - ${clientData.name} - Az: ${clientData.reference || 'N/A'}`;
            
            const description = `
**SCHULDENBEREINIGUNGSPLAN DISTRIBUTION**

**Client Information:**
- Name: ${clientData.name}
- Email: ${clientData.email}
- Reference: ${clientData.reference || 'N/A'}

**Settlement Plan Details:**
- Plan Type: ${planType}
- Monthly Payment: €${monthlyPayment.toFixed(2)}
- Total Debt: €${totalDebt.toFixed(2)}
- Duration: ${settlementData.duration_months || 36} months

**Distribution Summary:**
- Total Creditors: ${creditorCount}
- Documents to be sent:
  • Schuldenbereinigungsplan (Settlement Plan)
  • Forderungsübersicht (Creditor Overview)

**Creditors to Contact:**
${creditors.map((creditor, index) => {
    const name = creditor.sender_name || creditor.creditor_name || 'Unknown Creditor';
    const amount = creditor.claim_amount || 0;
    return `${index + 1}. ${name} - €${amount.toFixed(2)}`;
}).join('\n')}

---
This ticket manages the second round of creditor communication for settlement plan distribution.
Each creditor will receive an individual Side Conversation email with the settlement documents.

Status updates will be posted to this ticket as emails are sent.
            `.trim();

            const ticketData = {
                ticket: {
                    requester_id: zendeskUserId,
                    subject: subject,
                    description: description,
                    status: 'open',
                    priority: 'normal',
                    type: 'incident',
                    tags: [
                        'schuldenbereinigungsplan',
                        'settlement-plan',
                        'creditor-distribution',
                        'second-round',
                        `client-${clientData.reference || 'unknown'}`,
                        `plan-type-${planType.toLowerCase()}`
                    ],
                    // Custom fields removed to prevent 422 validation errors
                    // custom_fields: [
                    //     { id: this.customFields.client_reference, value: clientData.reference || '' },
                    //     { id: this.customFields.creditor_name, value: `${creditorCount} Creditors` },
                    //     { id: this.customFields.original_claim_amount, value: totalDebt.toString() }
                    // ]
                }
            };

            const url = `${this.apiUrl}tickets.json`;
            const response = await axios.post(url, ticketData, {
                auth: this.auth,
                headers: this.headers
            });

            console.log(`✅ Settlement plan ticket created successfully!`);
            console.log(`🎫 Ticket ID: ${response.data.ticket.id}`);
            console.log(`📋 Subject: ${response.data.ticket.subject}`);

            return {
                id: response.data.ticket.id,
                subject: response.data.ticket.subject,
                status: response.data.ticket.status,
                created_at: response.data.ticket.created_at,
                url: response.data.ticket.url
            };

        } catch (error) {
            console.error('❌ Error creating settlement plan ticket:', error.message);
            if (error.response?.data) {
                console.error('Zendesk API error details:', error.response.data);
            }
            throw error;
        }
    }

    /**
     * Create nullplan distribution ticket
     * For clients with no garnishable income (pfändbar amount = 0)
     */
    async createNullplanTicket(zendeskUserId, clientData, nullplanData, creditorCount) {
        try {
            console.log(`🎫 Creating nullplan ticket for ${clientData.firstName} ${clientData.lastName}...`);
            
            const totalDebt = nullplanData.total_debt || 0;
            const creditors = clientData.final_creditor_list?.filter(c => c.status === 'confirmed') || [];
            
            // Create the nullplan ticket subject and description
            const subject = `📄 Nullplan - ${clientData.firstName} ${clientData.lastName} - Az: ${clientData.aktenzeichen}`;
            
            const description = `
**NULLPLAN DISTRIBUTION**

**Client Information:**
- Name: ${clientData.firstName} ${clientData.lastName}
- Email: ${clientData.email}
- Reference: ${clientData.aktenzeichen}

**Nullplan Details:**
- Plan Type: Nullplan (§ 305 Abs. 1 Nr. 1 InsO)
- Pfändbares Einkommen: 0,00 EUR
- Total Debt: €${totalDebt.toFixed(2)}
- Monthly Payment: 0,00 EUR (keine Zahlungen möglich)

**Distribution Summary:**
- Total Creditors: ${creditorCount}
- Documents to be sent:
  • Nullplan (Nullplan Documentation)
  • Forderungsübersicht (Creditor Overview)

**Creditors to Contact:**
${creditors.map((creditor, index) => {
    const name = creditor.sender_name || 'Unknown Creditor';
    const amount = creditor.claim_amount || 0;
    return `${index + 1}. ${name} - €${amount.toFixed(2)}`;
}).join('\n')}

**Legal Basis:**
Client cannot make any payments due to economic circumstances (no garnishable income).
According to § 305 Abs. 1 Nr. 1 InsO, this nullplan is presented to all creditors.

**Expected Response:**
- Bei Annahme des Nullplans durch alle Gläubiger wird das Verfahren eingestellt
- Bei Ablehnung kann der Mandant das gerichtliche Insolvenzverfahren beantragen
- Eine Befriedigung der Forderungen ist derzeit nicht möglich

---
This ticket manages the nullplan distribution to all creditors.
Each creditor will receive an individual Side Conversation email with the nullplan documents.

Status updates will be posted to this ticket as emails are sent.
            `.trim();

            const ticketData = {
                ticket: {
                    requester_id: zendeskUserId,
                    subject: subject,
                    description: description,
                    status: 'open',
                    priority: 'normal',
                    type: 'incident',
                    tags: [
                        'nullplan',
                        'null-plan',
                        'creditor-distribution',
                        'insolvency',
                        `client-${clientData.aktenzeichen}`,
                        'plan-type-nullplan'
                    ]
                }
            };

            const url = `${this.apiUrl}tickets.json`;
            const response = await axios.post(url, ticketData, {
                auth: this.auth,
                headers: this.headers
            });

            console.log(`✅ Nullplan ticket created successfully!`);
            console.log(`🎫 Ticket ID: ${response.data.ticket.id}`);
            console.log(`📋 Subject: ${response.data.ticket.subject}`);

            return {
                id: response.data.ticket.id,
                subject: response.data.ticket.subject,
                status: response.data.ticket.status,
                created_at: response.data.ticket.created_at,
                url: response.data.ticket.url
            };

        } catch (error) {
            console.error('❌ Error creating nullplan ticket:', error.message);
            if (error.response?.data) {
                console.error('Zendesk API error details:', error.response.data);
            }
            throw error;
        }
    }

    /**
     * Send settlement plan data to Make.com webhook
     */
    async sendToMakeWebhook(creditorData, clientData, settlementData, documentAttachments, mainTicketId) {
        try {
            const creditorName = creditorData.sender_name || creditorData.creditor_name || 'Unknown Creditor';
            const creditorEmail = 'justlukax@gmail.com'; // Test email
            
            // Prepare webhook payload
            const webhookData = {
                // Client information
                client: {
                    name: clientData.name,
                    email: clientData.email,
                    reference: clientData.reference,
                    phone: clientData.phone || '',
                    address: clientData.address || ''
                },
                
                // Creditor information
                creditor: {
                    name: creditorName,
                    email: creditorEmail,
                    original_debt: creditorData.debt_amount || 0,
                    reference_number: creditorData.reference_number || '',
                    address: creditorData.creditor_address || ''
                },
                
                // Settlement plan details
                settlement: {
                    plan_type: settlementData.plan_type || 'quotenplan',
                    monthly_payment: settlementData.monthly_payment || 0,
                    duration_months: settlementData.duration_months || 36,
                    total_debt: settlementData.total_debt || 0,
                    creditor_share: creditorData.debt_amount / settlementData.total_debt,
                    creditor_monthly_payment: (settlementData.monthly_payment || 0) * (creditorData.debt_amount / settlementData.total_debt),
                    total_payment: ((settlementData.monthly_payment || 0) * (creditorData.debt_amount / settlementData.total_debt)) * 36
                },
                
                // Document attachment info (for Side Conversation creation)
                documents: documentAttachments.map(attachment => ({
                    filename: attachment.filename,
                    type: attachment.type,
                    attachment_id: attachment.attachment_id || null,
                    fresh_upload_token: attachment.token, // For fresh upload to Side Conversation
                    content_url: attachment.content_url || null,
                    size: attachment.size,
                    file_path: attachment.file_path || null // In case Make.com needs to re-upload
                })),
                
                // Email content
                email: {
                    subject: `Schuldenbereinigungsplan - ${creditorName} - Az: ${clientData.reference || 'N/A'}`,
                    body: this.generateSettlementPlanEmailBody(creditorData, clientData, settlementData)
                },
                
                // Zendesk ticket information
                zendesk: {
                    main_ticket_id: mainTicketId,
                    ticket_url: `https://${this.config.subdomain}.zendesk.com/agent/tickets/${mainTicketId}`
                },
                
                // Metadata
                metadata: {
                    timestamp: new Date().toISOString(),
                    source: 'mandanten_portal',
                    action: 'create_side_conversation',
                    note: 'For Side Conversations, you may need to re-upload documents using file_path or use fresh_upload_token'
                }
            };
            
            // Get webhook URL from environment or use the provided URL
            const webhookUrl = process.env.MAKE_WEBHOOK_URL || 'https://hook.eu2.make.com/z22vqf13jm19hchx8e1e9qh0joq3rym7';
            
            console.log(`🔗 Sending creditor data to Make.com webhook for Side Conversation`);
            console.log(`🎫 Main Ticket ID: ${mainTicketId}`);
            console.log(`📧 Creditor: ${creditorName} (${creditorEmail})`);
            console.log(`📎 Documents: ${documentAttachments.length}`);
            
            // Log document attachment IDs for debugging
            webhookData.documents.forEach(doc => {
                console.log(`   📄 ${doc.filename}: ID ${doc.attachment_id} (${doc.type})`);
            });
            
            // Send to Make.com webhook
            const response = await axios.post(webhookUrl, webhookData, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 30000 // 30 second timeout
            });
            
            console.log(`✅ Successfully sent creditor data to Make.com for Side Conversation creation`);
            console.log(`🎫 Make.com response:`, response.data);
            
            return {
                success: true,
                webhook_response: response.data,
                creditor_name: creditorName,
                creditor_email: creditorEmail,
                documents_count: documentPaths.length
            };
            
        } catch (error) {
            console.error(`❌ Error sending to Make.com webhook:`, error.message);
            if (error.response?.data) {
                console.error(`Webhook error details:`, error.response.data);
            }
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Upload files and create ticket with email in one workflow
     */
    async sendCreditorEmailWithAttachments(mainTicketId, creditorEmail, creditorName, subject, emailBody, attachmentPaths) {
        try {
            console.log(`📧 Uploading files and sending email to ${creditorEmail}`);
            
            // Step 1: Upload all files first to get tokens
            const uploadTokens = [];
            for (const filePath of attachmentPaths) {
                const filename = require('path').basename(filePath);
                const uploadResult = await this.uploadFileToZendesk(filePath, filename);
                if (uploadResult.success) {
                    uploadTokens.push(uploadResult.token);
                    console.log(`✅ Uploaded ${filename}: ${uploadResult.token}`);
                }
            }

            // Step 2: Now we don't actually use the mainTicketId - we create a NEW ticket 
            // that immediately sends an email with attachments to the creditor
            console.log(`🎫 Creating new ticket that sends email with ${uploadTokens.length} attachments`);
            
            return {
                success: true,
                upload_tokens: uploadTokens,
                attachments_count: uploadTokens.length,
                recipient_email: creditorEmail,
                ready_for_ticket_creation: true,
                method: "upload_then_create_ticket_with_email"
            };
            
        } catch (error) {
            console.error(`❌ Error uploading files for ${creditorEmail}:`, error.message);
            if (error.response?.data) {
                console.error(`Upload error details:`, error.response.data);
            }
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Create ticket comment with attachments (more reliable than Side Conversations)
     */
    async addTicketCommentWithAttachments(ticketId, comment, attachmentPaths) {
        try {
            console.log(`📎 Adding ticket comment with ${attachmentPaths.length} attachments`);
            
            // Upload all files first
            const uploadTokens = [];
            for (const filePath of attachmentPaths) {
                const filename = require('path').basename(filePath);
                const uploadResult = await this.uploadFileToZendesk(filePath, filename);
                if (uploadResult.success) {
                    uploadTokens.push(uploadResult.token);
                    console.log(`✅ Uploaded ${filename}: ${uploadResult.token}`);
                }
            }
            
            // Create ticket comment with attachments
            const commentData = {
                ticket: {
                    comment: {
                        body: comment,
                        uploads: uploadTokens,
                        public: false // Internal comment
                    }
                }
            };
            
            const response = await axios.put(`${this.apiUrl}tickets/${ticketId}.json`, commentData, {
                auth: this.auth,
                headers: this.headers
            });
            
            console.log(`✅ Ticket comment added with ${uploadTokens.length} attachments`);
            return {
                success: true,
                comment_id: response.data.audit?.id,
                attachments_count: uploadTokens.length
            };
            
        } catch (error) {
            console.error(`❌ Error adding ticket comment with attachments:`, error.message);
            if (error.response?.data) {
                console.error(`Ticket comment error details:`, error.response.data);
            }
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Upload file to Zendesk using regular uploads endpoint (more reliable)
     */
    async uploadFileToZendesk(filePath, filename) {
        try {
            console.log(`📎 Uploading file to Zendesk: ${filename}`);
            
            const fs = require('fs');
            
            // Check if file exists
            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }
            
            // Read file as buffer
            const fileBuffer = fs.readFileSync(filePath);
            
            // Upload to regular Zendesk uploads endpoint (more reliable)
            const uploadUrl = `${this.apiUrl}uploads.json?filename=${encodeURIComponent(filename)}`;
            
            const response = await axios.post(uploadUrl, fileBuffer, {
                auth: this.auth,
                headers: {
                    'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                },
                maxBodyLength: 50 * 1024 * 1024, // 50MB limit
                maxContentLength: 50 * 1024 * 1024
            });
            
            console.log(`✅ File uploaded successfully: ${filename}`);
            console.log(`🎫 Upload token: ${response.data.upload.token}`);
            
            return {
                success: true,
                token: response.data.upload.token,
                filename: filename,
                size: response.data.upload.size || fileBuffer.length
            };
            
        } catch (error) {
            console.error(`❌ Error uploading file ${filename}:`, error.message);
            if (error.response?.data) {
                console.error(`Zendesk upload error details:`, error.response.data);
            }
            return {
                success: false,
                error: error.message,
                filename: filename
            };
        }
    }

    /**
     * Create ticket with immediate email and attachments to creditor (NEW APPROACH)
     */
    async sendSettlementPlanEmailViaTicket(mainTicketId, creditorData, clientData, settlementData) {
        // Use test email for now
        const testEmail = 'justlukax@gmail.com';
        const creditorName = creditorData.sender_name || creditorData.creditor_name || 'Unknown Creditor';
        const emailBody = this.generateSettlementPlanEmailBody(creditorData, clientData, settlementData);
        const emailSubject = `Schuldenbereinigungsplan - ${creditorName} - Az: ${clientData.reference || 'N/A'}`;
        
        try {
            console.log(`📧 Creating ticket with immediate email for creditor: ${creditorName}`);

            // Step 1: Get file paths - FIXED: Try date-based patterns if specific path not found
            const path = require('path');
            const fs = require('fs');
            const documentDir = path.join(__dirname, '../documents');

            // Try multiple date patterns (today and yesterday) to find documents
            const datePattern = new Date().toISOString().split('T')[0];
            const yesterdayPattern = new Date(Date.now() - 86400000).toISOString().split('T')[0];
            const possibleDates = [datePattern, yesterdayPattern];

            console.log(`📎 Looking for documents with date patterns: ${possibleDates.join(', ')}`);

            // Check if files exist and upload them
            const attachmentPaths = [];

            // Find Settlement Plan
            let settlementPlanFile = null;
            for (const dateStr of possibleDates) {
                const filePath = path.join(documentDir, `Schuldenbereinigungsplan_${clientData.reference}_${dateStr}.docx`);
                if (fs.existsSync(filePath)) {
                    settlementPlanFile = filePath;
                    attachmentPaths.push(filePath);
                    console.log(`✅ Found Schuldenbereinigungsplan (${dateStr}): ${path.basename(filePath)}`);
                    break;
                }
            }
            if (!settlementPlanFile) {
                console.warn(`⚠️ Schuldenbereinigungsplan not found for dates: ${possibleDates.join(', ')}`);
            }

            // Find Creditor Overview
            let creditorOverviewFile = null;
            for (const dateStr of possibleDates) {
                const filePath = path.join(documentDir, `Forderungsübersicht_${clientData.reference}_${dateStr}.docx`);
                if (fs.existsSync(filePath)) {
                    creditorOverviewFile = filePath;
                    attachmentPaths.push(filePath);
                    console.log(`✅ Found Forderungsübersicht (${dateStr}): ${path.basename(filePath)}`);
                    break;
                }
            }
            if (!creditorOverviewFile) {
                console.warn(`⚠️ Forderungsübersicht not found for dates: ${possibleDates.join(', ')}`);
            }

            // Find Ratenplan
            let ratenplanFile = null;
            for (const dateStr of possibleDates) {
                const filePath = path.join(documentDir, `Ratenplan-Pfaendbares-Einkommen_${clientData.reference}_${dateStr}.docx`);
                if (fs.existsSync(filePath)) {
                    ratenplanFile = filePath;
                    attachmentPaths.push(filePath);
                    console.log(`✅ Found Ratenplan pfändbares Einkommen (${dateStr}): ${path.basename(filePath)}`);
                    break;
                }
            }
            if (!ratenplanFile) {
                console.warn(`⚠️ Ratenplan pfändbares Einkommen not found for dates: ${possibleDates.join(', ')}`);
            }

            // Step 2: Upload files to get tokens
            console.log(`📤 Uploading ${attachmentPaths.length} files to Zendesk...`);
            const uploadTokens = [];
            for (const filePath of attachmentPaths) {
                const filename = require('path').basename(filePath);
                const uploadResult = await this.uploadFileToZendesk(filePath, filename);
                if (uploadResult.success) {
                    uploadTokens.push(uploadResult.token);
                    console.log(`✅ Uploaded ${filename}: ${uploadResult.token}`);
                }
            }

            // Step 3: Create ticket WITH attachments that immediately sends email
            console.log(`🎫 Creating ticket with immediate email and ${uploadTokens.length} attachments`);
            const ticketResult = await this.createCreditorSettlementTicket(
                creditorData, 
                clientData, 
                settlementData, 
                testEmail, 
                uploadTokens, 
                emailBody
            );
            
            if (!ticketResult.success) {
                throw new Error(`Failed to create ticket with email: ${ticketResult.error}`);
            }
            
            console.log(`✅ Settlement Plan ticket created and email sent to: ${testEmail} (${creditorName})`);
            console.log(`🎫 Ticket ID: ${ticketResult.ticket_id}`);
            console.log(`📎 Attachments included: ${uploadTokens.length} documents`);
            
            return {
                success: true,
                main_ticket_id: mainTicketId,
                creditor_ticket_id: ticketResult.ticket_id,
                recipient_email: testEmail,
                recipient_name: creditorName,
                subject: emailSubject,
                attachments_count: uploadTokens.length,
                method: 'ticket_with_immediate_email',
                email_sent: ticketResult.email_sent
            };

        } catch (error) {
            console.error(`❌ Error creating ticket with email for creditor ${creditorName}:`, error.message);
            
            return {
                success: false,
                error: error.message,
                main_ticket_id: mainTicketId,
                recipient_email: testEmail,
                recipient_name: creditorName,
                subject: emailSubject,
                method: 'ticket_with_immediate_email',
                email_sent: false
            };
        }
    }

    /**
     * Create ticket with immediate email and attachments to creditor
     */
    async createCreditorSettlementTicket(creditorData, clientData, settlementData, testEmail, uploadTokens, emailBody) {
        try {
            const creditorName = creditorData.sender_name || creditorData.creditor_name || 'Unknown Creditor';
            const emailSubject = `Schuldenbereinigungsplan - ${creditorName} - Az: ${clientData.reference || 'N/A'}`;
            
            console.log(`🎫 Creating settlement ticket for creditor: ${creditorName}`);
            console.log(`📎 Including ${uploadTokens.length} attachments`);
            
            // Find the client's Zendesk user
            const zendeskUser = await this.findClientUser(
                clientData.reference,
                clientData.name,
                clientData.email
            );

            const ticketData = {
                ticket: {
                    requester_id: zendeskUser.id,
                    subject: emailSubject,
                    comment: {
                        body: emailBody,
                        uploads: uploadTokens, // Attach the uploaded files
                        public: true // This makes it an email that gets sent
                    },
                    type: 'task',
                    priority: 'normal',
                    status: 'open',
                    tags: [
                        'schuldenbereinigungsplan',
                        'settlement-plan-email',
                        'creditor-individual',
                        clientData.reference || 'unknown',
                        creditorName.toLowerCase().replace(/\s+/g, '-')
                    ]
                }
            };

            const url = `${this.apiUrl}tickets.json`;
            const response = await axios.post(url, ticketData, {
                auth: this.auth,
                headers: this.headers
            });

            console.log(`✅ Settlement ticket created and email sent: ${creditorName} (ID: ${response.data.ticket.id})`);
            console.log(`📧 Email sent to: ${testEmail} with ${uploadTokens.length} attachments`);
            
            return {
                success: true,
                ticket_id: response.data.ticket.id,
                email_sent: true,
                subject: emailSubject,
                recipient_email: testEmail,
                recipient_name: creditorName,
                attachments_count: uploadTokens.length
            };

        } catch (error) {
            console.error('❌ Error creating settlement ticket with email:', error.message);
            if (error.response?.data) {
                console.error('Zendesk API error details:', error.response.data);
            }
            
            return {
                success: false,
                error: error.message,
                email_sent: false
            };
        }
    }

    /**
     * Add comment with attachments to existing ticket
     */
    async addTicketComment(ticketId, commentData) {
        try {
            console.log(`💬 Adding comment to ticket ${ticketId}`);
            
            const ticketData = {
                ticket: {
                    comment: commentData
                }
            };

            const url = `${this.apiUrl}tickets/${ticketId}.json`;
            const response = await axios.put(url, ticketData, {
                auth: this.auth,
                headers: this.headers
            });

            console.log(`✅ Comment added to ticket ${ticketId}`);
            
            return {
                success: true,
                ticket_id: ticketId,
                comment_id: response.data.ticket.comments?.[0]?.id || 'unknown'
            };

        } catch (error) {
            console.error('❌ Error adding ticket comment:', error.message);
            if (error.response?.data) {
                console.error('Zendesk API error details:', error.response.data);
            }
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get attachment download URLs from a ticket  
     */
    async getTicketAttachmentUrls(ticketId) {
        try {
            console.log(`🔗 Getting attachment URLs for ticket ${ticketId}`);
            
            const url = `${this.apiUrl}tickets/${ticketId}/comments.json`;
            const response = await axios.get(url, {
                auth: this.auth,
                headers: this.headers
            });

            const attachmentUrls = [];
            
            // Look through all comments for attachments
            if (response.data.comments) {
                response.data.comments.forEach(comment => {
                    if (comment.attachments && comment.attachments.length > 0) {
                        comment.attachments.forEach(attachment => {
                            attachmentUrls.push({
                                id: attachment.id,
                                filename: attachment.file_name,
                                content_url: attachment.content_url,
                                size: attachment.size
                            });
                        });
                    }
                });
            }

            console.log(`✅ Found ${attachmentUrls.length} attachment URLs in ticket ${ticketId}`);
            return attachmentUrls;

        } catch (error) {
            console.error('❌ Error getting ticket attachment URLs:', error.message);
            if (error.response?.data) {
                console.error('Zendesk API error details:', error.response.data);
            }
            return [];
        }
    }

    /**
     * Get attachment IDs from a ticket (DEPRECATED - use getTicketAttachmentUrls)
     */
    async getTicketAttachmentIds(ticketId) {
        try {
            console.log(`🔍 Getting attachment IDs for ticket ${ticketId}`);
            
            const url = `${this.apiUrl}tickets/${ticketId}/comments.json`;
            const response = await axios.get(url, {
                auth: this.auth,
                headers: this.headers
            });

            const attachmentIds = [];
            
            // Look through all comments for attachments
            if (response.data.comments) {
                response.data.comments.forEach(comment => {
                    if (comment.attachments && comment.attachments.length > 0) {
                        comment.attachments.forEach(attachment => {
                            attachmentIds.push({
                                id: attachment.id,
                                filename: attachment.file_name,
                                content_url: attachment.content_url,
                                size: attachment.size
                            });
                        });
                    }
                });
            }

            console.log(`✅ Found ${attachmentIds.length} attachments in ticket ${ticketId}`);
            return attachmentIds;

        } catch (error) {
            console.error('❌ Error getting ticket attachment IDs:', error.message);
            if (error.response?.data) {
                console.error('Zendesk API error details:', error.response.data);
            }
            return [];
        }
    }

    /**
     * Create Side Conversation with download links
     */
    async createSideConversationWithDownloadLinks(ticketId, creditorData, clientData, settlementData, downloadUrls) {
        try {
            const creditorName = creditorData.sender_name || creditorData.creditor_name || 'Unknown Creditor';
            // Use actual creditor email if available, fallback to test email for development
            const creditorEmail = creditorData.creditor_email || creditorData.email || 'justlukax@gmail.com';
            const emailSubject = `Schuldenbereinigungsplan - ${creditorName} - Az: ${clientData.reference || 'N/A'}`;
            
            console.log(`📧 Sending to: ${creditorEmail} (${creditorEmail === 'justlukax@gmail.com' ? 'TEST EMAIL' : 'CREDITOR EMAIL'})`);
            
            console.log(`💬 Creating Side Conversation for ${creditorName} in ticket ${ticketId}`);
            
            // Generate email body with download links
            const emailBody = this.generateSettlementPlanEmailBodyWithLinks(creditorData, clientData, settlementData, downloadUrls);
            
            const sideConversationData = {
                message: {
                    to: [
                        {
                            email: creditorEmail,
                            name: creditorName
                        }
                    ],
                    subject: emailSubject,
                    body: emailBody
                }
            };

            const url = `${this.apiUrl}tickets/${ticketId}/side_conversations.json`;
            const response = await axios.post(url, sideConversationData, {
                auth: this.auth,
                headers: this.headers
            });

            console.log(`✅ Side Conversation created for ${creditorName}: ${response.data.side_conversation.id}`);
            
            return {
                success: true,
                side_conversation_id: response.data.side_conversation.id,
                creditor_name: creditorName,
                creditor_email: creditorEmail,
                subject: emailSubject,
                download_links_count: downloadUrls.length
            };

        } catch (error) {
            const creditorName = creditorData.sender_name || creditorData.creditor_name || 'Unknown';
            console.error(`❌ Error creating Side Conversation for ${creditorName}:`, error.message);
            if (error.response?.data) {
                console.error('Zendesk API error details:', error.response.data);
                console.error('Response status:', error.response.status);
            }
            
            return {
                success: false,
                error: error.message,
                creditor_name: creditorName,
                creditor_email: creditorData.creditor_email || creditorData.email || 'justlukax@gmail.com'
            };
        }
    }

    /**
     * Generate settlement plan email body with download links
     */
    generateSettlementPlanEmailBodyWithLinks(creditorData, clientData, settlementData, downloadUrls) {
        const creditorName = creditorData.sender_name || creditorData.creditor_name || 'Sehr geehrte Damen und Herren';
        const planType = settlementData.plan_type || 'Quotenplan';
        const monthlyPayment = settlementData.monthly_payment || 0;
        const totalDebt = settlementData.total_debt || 0;
        const creditorDebt = creditorData.claim_amount || 0;
        const duration = settlementData.duration_months || 36;

        // Calculate creditor's share
        const creditorShare = totalDebt > 0 ? (creditorDebt / totalDebt) * 100 : 0;
        const creditorMonthlyPayment = totalDebt > 0 ? (monthlyPayment * (creditorDebt / totalDebt)) : 0;
        const creditorTotalPayment = creditorMonthlyPayment * duration;

        // Check if this is a Nullplan (no garnishable income)
        const isNullplan = planType === 'Nullplan' || planType === 'nullplan' || monthlyPayment === 0;

        // Generate download links section with hyperlinks
        const downloadLinksSection = downloadUrls.map(doc => {
            let documentName = 'Dokument';
            if (doc.type === 'settlement_plan') {
                documentName = 'Schuldenbereinigungsplan';
            } else if (doc.type === 'nullplan') {
                documentName = 'Nullplan';
            } else if (doc.type === 'creditor_overview' || doc.type === 'forderungsuebersicht') {
                documentName = 'Forderungsübersicht';
            } else if (doc.type === 'ratenplan' || doc.type === 'ratenplan_pfaendbares_einkommen' || doc.type === 'ratenplan_nullplan' || doc.type === 'payment_plan') {
                // Choose Ratenplan name based on whether client has garnishable income
                documentName = isNullplan ? 'Ratenplan (0 EUR - Nullplan)' : 'Ratenplan (Pfändbares Einkommen)';
            }

            if (doc.download_url) {
                return `📄 [${documentName}](${doc.download_url})`;
            } else {
                return `📄 ${documentName}: (Download-Link wird vorbereitet)`;
            }
        }).join('\n');

        return `
Sehr geehrte Damen und Herren,
${creditorName !== 'Sehr geehrte Damen und Herren' ? `\nSehr geehrte/r ${creditorName},` : ''}

wir übersenden Ihnen hiermit den außergerichtlichen Schuldenbereinigungsplan für unseren Mandanten ${clientData.name}.

**SCHULDENBEREINIGUNGSPLAN DETAILS:**

Plan-Typ: ${planType}
Laufzeit: ${duration} Monate
Gesamtschuldensumme: €${totalDebt.toFixed(2)}
Monatliche Zahlungsrate gesamt: €${monthlyPayment.toFixed(2)}

**IHRE FORDERUNG:**

Forderungsbetrag: €${creditorDebt.toFixed(2)}
Ihr Anteil an Gesamtschuld: ${creditorShare.toFixed(2)}%
Ihre monatliche Zahlung: €${creditorMonthlyPayment.toFixed(2)}
Ihre Gesamtzahlung über ${duration} Monate: €${creditorTotalPayment.toFixed(2)}

**DOKUMENTE ZUM DOWNLOAD:**

${downloadLinksSection}

**NÄCHSTE SCHRITTE:**

Bitte laden Sie die Dokumente über die obigen Links herunter und prüfen Sie den Schuldenbereinigungsplan. Teilen Sie uns Ihre Zustimmung oder etwaige Anmerkungen bis zum [DATUM] mit.

Bei Zustimmung aller Gläubiger wird der Plan rechtsverbindlich und die Zahlungen beginnen zum [STARTDATUM].

Bei Fragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen
Thomas Scuric Rechtsanwälte

---
📱 Diese E-Mail wurde automatisch über unser Mandanten-Portal generiert.
        `.trim();
    }

    /**
     * Generate settlement plan email body
     */
    generateSettlementPlanEmailBody(creditorData, clientData, settlementData) {
        const creditorName = creditorData.sender_name || creditorData.creditor_name || 'Sehr geehrte Damen und Herren';
        const planType = settlementData.plan_type || 'Quotenplan';
        const monthlyPayment = settlementData.monthly_payment || 0;
        const totalDebt = settlementData.total_debt || 0;
        const creditorDebt = creditorData.claim_amount || 0;
        const duration = settlementData.duration_months || 36;
        
        // Calculate creditor's share
        const creditorShare = totalDebt > 0 ? (creditorDebt / totalDebt) * 100 : 0;
        const creditorMonthlyPayment = totalDebt > 0 ? (monthlyPayment * (creditorDebt / totalDebt)) : 0;
        const creditorTotalPayment = creditorMonthlyPayment * duration;

        return `
Sehr geehrte Damen und Herren,
${creditorName !== 'Sehr geehrte Damen und Herren' ? `\nSehr geehrte/r ${creditorName},` : ''}

wir übersenden Ihnen hiermit den außergerichtlichen Schuldenbereinigungsplan für unseren Mandanten ${clientData.name}.

**SCHULDENBEREINIGUNGSPLAN DETAILS:**

Plan-Typ: ${planType}
Laufzeit: ${duration} Monate
Gesamtschuldensumme: €${totalDebt.toFixed(2)}
Monatliche Zahlungsrate gesamt: €${monthlyPayment.toFixed(2)}

**IHRE FORDERUNG:**

Forderungsbetrag: €${creditorDebt.toFixed(2)}
Ihr Anteil an Gesamtschuld: ${creditorShare.toFixed(2)}%
Ihre monatliche Zahlung: €${creditorMonthlyPayment.toFixed(2)}
Ihre Gesamtzahlung über ${duration} Monate: €${creditorTotalPayment.toFixed(2)}

**BEIGEFÜGTE DOKUMENTE:**

1. Schuldenbereinigungsplan (detaillierte Aufstellung)
2. Forderungsübersicht (vollständige Gläubigerliste)
3. Ratenplan pfändbares Einkommen (Zahlungsvereinbarung)

**NÄCHSTE SCHRITTE:**

Bitte prüfen Sie den beigefügten Schuldenbereinigungsplan und teilen uns Ihre Zustimmung oder etwaige Anmerkungen bis zum [DATUM] mit.

Bei Zustimmung aller Gläubiger wird der Plan rechtsverbindlich und die Zahlungen beginnen zum [STARTDATUM].

Bei Fragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen

Thomas Scuric Rechtsanwälte
[Adresse]
[Telefon]
[E-Mail]

---
Aktenzeichen: ${clientData.reference || 'N/A'}
Bearbeiter: [Name]
Datum: ${new Date().toLocaleDateString('de-DE')}

Diese E-Mail wurde automatisch generiert im Rahmen des außergerichtlichen Schuldenbereinigungsverfahrens.
        `.trim();
    }

    /**
     * Generate Nullplan email body with download links
     * For clients with no garnishable income (pfändbar amount = 0)
     */
    generateNullplanEmailBodyWithLinks(creditorData, clientData, nullplanData, downloadUrls) {
        const creditorName = creditorData.sender_name || creditorData.creditor_name || 'Sehr geehrte Damen und Herren';
        const totalDebt = nullplanData.total_debt || 0;
        const creditorDebt = creditorData.claim_amount || 0;
        
        // Calculate creditor's share  
        const creditorShare = totalDebt > 0 ? (creditorDebt / totalDebt) * 100 : 0;

        // Generate download links section with hyperlinks
        const downloadLinksSection = downloadUrls.map(doc => {
            let documentName = 'Dokument';
            if (doc.type === 'nullplan') {
                documentName = 'Nullplan';
            } else if (doc.type === 'creditor_overview' || doc.type === 'forderungsuebersicht') {
                documentName = 'Forderungsübersicht';
            } else if (doc.type === 'ratenplan_nullplan' || doc.type === 'ratenplan' || doc.type === 'ratenplan_pfaendbares_einkommen') {
                documentName = 'Ratenplan (0 EUR - Nullplan)';
            }

            if (doc.download_url) {
                return `📄 [${documentName}](${doc.download_url})`;
            } else {
                return `📄 ${documentName}: (Download-Link wird vorbereitet)`;
            }
        }).join('\n');

        return `
Sehr geehrte Damen und Herren,
${creditorName !== 'Sehr geehrte Damen und Herren' ? `\nSehr geehrte/r ${creditorName},` : ''}

wir übersenden Ihnen hiermit den außergerichtlichen Nullplan für unseren Mandanten ${clientData.name}.

**NULLPLAN DETAILS:**

Plan-Typ: Nullplan (§ 305 Abs. 1 Nr. 1 InsO)
Pfändbares Einkommen: 0,00 EUR
Gesamtschuldensumme: €${totalDebt.toFixed(2)}
Zahlungsrate: 0,00 EUR (keine Zahlungen möglich)

**IHRE FORDERUNG:**

Forderungsbetrag: €${creditorDebt.toFixed(2)}
Ihr Anteil an Gesamtschuld: ${creditorShare.toFixed(2)}%
Zahlung an Sie: 0,00 EUR

**RECHTLICHE GRUNDLAGE:**

Unser Mandant kann aufgrund seiner wirtschaftlichen Verhältnisse keine Ratenzahlungen leisten, da das pfändbare Einkommen 0,00 EUR beträgt. Gemäß § 305 Abs. 1 Nr. 1 InsO wird Ihnen daher dieser außergerichtliche Nullplan vorgelegt.

**DOKUMENTE ZUM DOWNLOAD:**

${downloadLinksSection}

**RECHTSWIRKUNG:**

• Bei Annahme des Nullplans durch alle Gläubiger wird das Verfahren eingestellt
• Bei Ablehnung kann der Mandant das gerichtliche Insolvenzverfahren beantragen
• Eine Befriedigung der Forderungen ist derzeit nicht möglich
• Bei Verbesserung der wirtschaftlichen Verhältnisse wird unverzüglich eine angemessene Regelung angestrebt

**NÄCHSTE SCHRITTE:**

Bitte laden Sie die Dokumente über die obigen Links herunter und prüfen Sie den Nullplan. Teilen Sie uns Ihre Stellungnahme bis zum [DATUM] mit.

Bei Fragen zum Nullplan oder zum weiteren Verfahren stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen
Thomas Scuric Rechtsanwälte

---
📱 Diese E-Mail wurde automatisch über unser Mandanten-Portal generiert.
        `.trim();
    }

    /**
     * Generate Nullplan email body (without download links)
     * Fallback version for when documents are attached directly
     */
    generateNullplanEmailBody(creditorData, clientData, nullplanData) {
        const creditorName = creditorData.sender_name || creditorData.creditor_name || 'Sehr geehrte Damen und Herren';
        const totalDebt = nullplanData.total_debt || 0;
        const creditorDebt = creditorData.claim_amount || 0;
        
        // Calculate creditor's share  
        const creditorShare = totalDebt > 0 ? (creditorDebt / totalDebt) * 100 : 0;

        return `
Sehr geehrte Damen und Herren,
${creditorName !== 'Sehr geehrte Damen und Herren' ? `\nSehr geehrte/r ${creditorName},` : ''}

wir übersenden Ihnen hiermit den außergerichtlichen Nullplan für unseren Mandanten ${clientData.name}.

**NULLPLAN DETAILS:**

Plan-Typ: Nullplan (§ 305 Abs. 1 Nr. 1 InsO)
Pfändbares Einkommen: 0,00 EUR
Gesamtschuldensumme: €${totalDebt.toFixed(2)}
Zahlungsrate: 0,00 EUR (keine Zahlungen möglich)

**IHRE FORDERUNG:**

Forderungsbetrag: €${creditorDebt.toFixed(2)}
Ihr Anteil an Gesamtschuld: ${creditorShare.toFixed(2)}%
Zahlung an Sie: 0,00 EUR

**RECHTLICHE GRUNDLAGE:**

Unser Mandant kann aufgrund seiner wirtschaftlichen Verhältnisse keine Ratenzahlungen leisten, da das pfändbare Einkommen 0,00 EUR beträgt. Gemäß § 305 Abs. 1 Nr. 1 InsO wird Ihnen daher dieser außergerichtliche Nullplan vorgelegt.

**BEIGEFÜGTE DOKUMENTE:**

1. Nullplan (detaillierte Darstellung der wirtschaftlichen Verhältnisse)
2. Forderungsübersicht (Auflistung aller Gläubiger und Forderungen)

**RECHTSWIRKUNG:**

• Bei Annahme des Nullplans durch alle Gläubiger wird das Verfahren eingestellt
• Bei Ablehnung kann der Mandant das gerichtliche Insolvenzverfahren beantragen
• Eine Befriedigung der Forderungen ist derzeit nicht möglich
• Bei Verbesserung der wirtschaftlichen Verhältnisse wird unverzüglich eine angemessene Regelung angestrebt

**NÄCHSTE SCHRITTE:**

Bitte prüfen Sie den beigefügten Nullplan und teilen Sie uns Ihre Stellungnahme bis zum [DATUM] mit.

Bei Fragen zum Nullplan oder zum weiteren Verfahren stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen

Thomas Scuric Rechtsanwälte
[Adresse]
[Telefon]
[E-Mail]

---
Aktenzeichen: ${clientData.reference || 'N/A'}
Bearbeiter: [Name]
Datum: ${new Date().toLocaleDateString('de-DE')}

Diese E-Mail wurde automatisch generiert im Rahmen des außergerichtlichen Schuldenbereinigungsverfahrens.
        `.trim();
    }
    /**
     * Upload multiple first round DOCX files to main ticket and get download URLs
     */
    async uploadFirstRoundDocumentsToMainTicket(ticketId, documentResults) {
        try {
            console.log(`📎 Uploading ${documentResults.length} first round documents to main ticket ${ticketId}...`);

            const uploadResults = [];
            const uploadTokens = [];

            // Step 1: Upload all files to Zendesk
            for (let i = 0; i < documentResults.length; i++) {
                const doc = documentResults[i];
                console.log(`   Uploading ${i + 1}/${documentResults.length}: ${doc.filename}`);

                const uploadResult = await this.uploadFileToZendesk(doc.path, doc.filename);
                uploadResults.push({
                    ...uploadResult,
                    creditor_name: doc.creditor_name,
                    creditor_id: doc.creditor_id
                });

                if (uploadResult.success) {
                    uploadTokens.push(uploadResult.token);
                }
            }

            const successfulUploads = uploadResults.filter(r => r.success);
            console.log(`✅ Successfully uploaded ${successfulUploads.length}/${documentResults.length} files`);

            if (uploadTokens.length === 0) {
                throw new Error('No files were uploaded successfully');
            }

            // Step 2: Attach files to main ticket via comment
            const commentText = `📄 Erstschreiben für alle Gläubiger wurden generiert und hochgeladen.\n\n` +
                `Anzahl Dokumente: ${successfulUploads.length}\n` +
                `Zeitstempel: ${new Date().toISOString()}\n\n` +
                `Details:\n` +
                successfulUploads.map(upload => 
                    `• ${upload.creditor_name}: ${upload.filename} (${Math.round(upload.size / 1024)} KB)`
                ).join('\n');

            const commentData = {
                body: commentText,
                uploads: uploadTokens
            };

            await this.addTicketComment(ticketId, commentData);
            console.log(`✅ Files attached to main ticket with comment`);

            // Step 3: Get download URLs with retry logic
            const urlResults = await this.getFirstRoundDocumentUrls(ticketId, successfulUploads);

            return {
                success: true,
                uploaded_count: successfulUploads.length,
                failed_count: uploadResults.length - successfulUploads.length,
                upload_results: uploadResults,
                document_urls: urlResults
            };

        } catch (error) {
            console.error(`❌ Error uploading first round documents: ${error.message}`);
            return {
                success: false,
                error: error.message,
                uploaded_count: 0,
                document_urls: []
            };
        }
    }

    /**
     * Get download URLs for first round documents with retry logic
     */
    async getFirstRoundDocumentUrls(ticketId, uploadResults, maxRetries = 5) {
        console.log(`🔗 Retrieving download URLs for ${uploadResults.length} documents...`);
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`   Attempt ${attempt}/${maxRetries} to get download URLs...`);

                // Get ticket comments to find attachment URLs
                const url = `${this.apiUrl}tickets/${ticketId}/comments.json`;
                const response = await axios.get(url, {
                    auth: this.auth,
                    headers: this.headers
                });

                // Find the most recent comment with attachments
                const comments = response.data.comments;
                const latestCommentWithAttachments = comments
                    .reverse()
                    .find(comment => comment.attachments && comment.attachments.length > 0);

                if (!latestCommentWithAttachments) {
                    if (attempt < maxRetries) {
                        console.log(`   No attachments found, waiting 5 seconds before retry...`);
                        await new Promise(resolve => setTimeout(resolve, 5000));
                        continue;
                    }
                    throw new Error('No attachments found in ticket comments');
                }

                // Map attachments to creditors
                const documentUrls = [];
                const attachments = latestCommentWithAttachments.attachments;

                for (const upload of uploadResults) {
                    const attachment = attachments.find(att => 
                        att.file_name === upload.filename
                    );

                    if (attachment) {
                        documentUrls.push({
                            creditor_name: upload.creditor_name,
                            creditor_id: upload.creditor_id,
                            filename: upload.filename,
                            download_url: attachment.content_url,
                            file_size: attachment.size,
                            success: true
                        });
                    } else {
                        documentUrls.push({
                            creditor_name: upload.creditor_name,
                            creditor_id: upload.creditor_id,
                            filename: upload.filename,
                            success: false,
                            error: 'Attachment not found in ticket'
                        });
                    }
                }

                const successfulUrls = documentUrls.filter(doc => doc.success);
                console.log(`✅ Successfully retrieved ${successfulUrls.length}/${uploadResults.length} download URLs`);

                return documentUrls;

            } catch (error) {
                console.error(`❌ Attempt ${attempt} failed: ${error.message}`);
                if (attempt < maxRetries) {
                    console.log(`   Waiting 5 seconds before retry...`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                } else {
                    console.error(`❌ Failed to get download URLs after ${maxRetries} attempts`);
                    // Return empty results for all uploads
                    return uploadResults.map(upload => ({
                        creditor_name: upload.creditor_name,
                        creditor_id: upload.creditor_id,
                        filename: upload.filename,
                        success: false,
                        error: `Failed to get download URL after ${maxRetries} attempts`
                    }));
                }
            }
        }
    }

    /**
     * Create Side Conversation with first round document download link
     */
    async createFirstRoundSideConversationWithDocument(ticketId, creditorData, clientData, documentUrl) {
        try {
            const emailBody = this.generateFirstRoundEmailBody(creditorData, clientData, documentUrl);
            const emailSubject = `Außergerichtlicher Einigungsversuch - ${creditorData.creditor_name} - Az: ${clientData.reference}`;
            
            // Use test email for development
            const testEmail = 'justlukax@gmail.com';
            
            console.log(`📧 Creating Side Conversation for ${creditorData.creditor_name} with document...`);
            
            const sideConversationData = {
                message: {
                    to: [
                        {
                            email: testEmail,
                            name: creditorData.creditor_name
                        }
                    ],
                    subject: emailSubject,
                    body: emailBody
                }
            };

            const url = `${this.apiUrl}tickets/${ticketId}/side_conversations.json`;
            const response = await axios.post(url, sideConversationData, {
                auth: this.auth,
                headers: this.headers
            });

            console.log(`✅ Side Conversation created for ${creditorData.creditor_name}`);
            
            return {
                success: true,
                side_conversation_id: response.data.side_conversation.id,
                creditor_name: creditorData.creditor_name,
                recipient_email: testEmail,
                subject: emailSubject,
                document_included: true
            };

        } catch (error) {
            console.error(`❌ Error creating first round side conversation: ${error.message}`);
            return {
                success: false,
                error: error.message,
                creditor_name: creditorData.creditor_name,
                document_included: false
            };
        }
    }

    /**
     * Generate email body for first round with document download link
     */
    generateFirstRoundEmailBody(creditorData, clientData, documentUrl) {
        return `
Sehr geehrte Damen und Herren,

im Auftrag unseres Mandanten ${clientData.name} führen wir einen außergerichtlichen Einigungsversuch im Rahmen der Insolvenzordnung durch.

**BEIGEFÜGTES DOKUMENT:**

Anbei erhalten Sie das offizielle Erstschreiben für die Forderungsabfrage.

📄 [Erstschreiben herunterladen](${documentUrl})

**WICHTIGE INFORMATIONEN:**

• Bitte laden Sie das beigefügte Dokument herunter und lesen Sie es vollständig durch
• Das Dokument enthält alle erforderlichen Informationen zur Forderungsabfrage
• Antwortfrist: 14 Tage ab heute
• Bei Fragen stehen wir Ihnen gerne zur Verfügung

**NÄCHSTE SCHRITTE:**

1. Dokument herunterladen und prüfen
2. Aktuelle Forderungshöhe mitteilen (aufgeschlüsselt nach Hauptforderung, Zinsen, Kosten)
3. Kopie eventuell vorliegender Titel übersenden
4. Sicherheiten mitteilen (falls vorhanden)

Mit freundlichen Grüßen

Thomas Scuric Rechtsanwälte
Bongardstraße 33
44787 Bochum

Telefon: 0234 913681-0
E-Mail: info@ra-scuric.de

---
Aktenzeichen: ${clientData.reference}
Gläubiger: ${creditorData.creditor_name}
Datum: ${new Date().toLocaleDateString('de-DE')}

Diese E-Mail wurde automatisch im Rahmen des außergerichtlichen Schuldenbereinigungsverfahrens generiert.
        `.trim();
    }
}

module.exports = ZendeskManager;