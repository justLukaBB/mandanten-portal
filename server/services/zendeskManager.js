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
     * Create individual ticket for creditor settlement plan with email channel
     */
    async createCreditorSettlementTicket(creditorData, clientData, settlementData, creditorEmail) {
        try {
            const creditorName = creditorData.sender_name || creditorData.creditor_name || 'Unknown Creditor';
            const subject = `Schuldenbereinigungsplan - ${creditorName} - Az: ${clientData.reference || 'N/A'}`;
            
            // Create ticket specifically for email communication
            const ticketData = {
                ticket: {
                    subject: subject,
                    comment: {
                        body: `Schuldenbereinigungsplan für Mandant: ${clientData.name || 'N/A'}\nAktenzeichen: ${clientData.reference || 'N/A'}\nGläubiger: ${creditorName}`,
                        public: false // Initial comment is internal
                    },
                    requester: {
                        email: creditorEmail,
                        name: creditorName
                    },
                    submitter: {
                        email: this.config.email,
                        name: "Thomas Scuric Rechtsanwälte"
                    },
                    status: 'open',
                    priority: 'normal',
                    type: 'task',
                    tags: ['schuldenbereinigungsplan', 'settlement_plan', 'creditor_communication', 'email_required'],
                    // Try to force email channel
                    via: {
                        channel: "email"
                    }
                }
            };
            
            const response = await axios.post(`${this.apiUrl}tickets.json`, ticketData, {
                auth: this.auth,
                headers: this.headers
            });
            
            console.log(`✅ Created creditor settlement ticket: ${response.data.ticket.id} for ${creditorName}`);
            console.log(`👤 Ticket requester: ${response.data.ticket.requester?.email || 'Unknown'}`);
            console.log(`📧 Notifications should be sent to: ${creditorEmail}`);
            
            return {
                success: true,
                ticket_id: response.data.ticket.id,
                ticket_url: response.data.ticket.url,
                creditor_name: creditorName,
                creditor_email: creditorEmail,
                requester_email: response.data.ticket.requester?.email
            };
            
        } catch (error) {
            console.error(`❌ Error creating creditor settlement ticket:`, error.message);
            if (error.response?.data) {
                console.error(`Ticket creation error details:`, error.response.data);
            }
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Send email to creditor via public comment with attachments
     */
    async sendCreditorEmailWithAttachments(ticketId, creditorEmail, creditorName, subject, emailBody, attachmentPaths) {
        try {
            console.log(`📧 Sending email to ${creditorEmail} via public comment on ticket ${ticketId}`);
            
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
            
            // Try automatic email approach first, then fallback to manual
            console.log(`🔄 Attempting automatic email with attachments...`);
            
            // Enhanced email body for direct sending
            const directEmailBody = `${emailBody}

📎 Anhänge zu diesem Schuldenbereinigungsplan:
${attachmentPaths.map(path => `• ${require('path').basename(path)}`).join('\n')}

Bei Fragen zu den Dokumenten kontaktieren Sie bitte unser Büro.
---
Bei Problemen mit den Anhängen wenden Sie sich bitte an: ${this.config.email}`;
            
            // Create public comment with forced email notification
            const commentData = {
                ticket: {
                    comment: {
                        body: directEmailBody,
                        uploads: uploadTokens,
                        public: true, // Public to trigger email notification
                        author_id: null
                    },
                    // Update ticket to ensure notification
                    status: 'open',
                    priority: 'normal'
                }
            };
            
            // First, verify the ticket requester before adding comment
            const ticketCheck = await axios.get(`${this.apiUrl}tickets/${ticketId}.json`, {
                auth: this.auth,
                headers: this.headers
            });
            
            const actualRequester = ticketCheck.data.ticket.requester?.email;
            console.log(`🔍 Verifying ticket ${ticketId} requester: ${actualRequester}`);
            console.log(`🎯 Expected requester: ${creditorEmail}`);
            
            if (actualRequester !== creditorEmail) {
                console.warn(`⚠️ Requester mismatch! Expected ${creditorEmail}, got ${actualRequester}`);
            }
            
            console.log(`📧 Creating public comment with ${uploadTokens.length} attachments for ${creditorEmail}`);
            
            // Add the comment with notifications enabled
            const response = await axios.put(`${this.apiUrl}tickets/${ticketId}.json?notify=true`, commentData, {
                auth: this.auth,
                headers: this.headers
            });
            
            console.log(`✅ Public comment created for ${creditorEmail} with ${uploadTokens.length} attachments`);
            console.log(`📧 Email notification should be sent automatically to requester`);
            console.log(`📎 Attachments will appear as downloadable links in the email`);
            
            return {
                success: true,
                comment_id: response.data.audit?.id,
                attachments_count: uploadTokens.length,
                recipient_email: creditorEmail,
                ticket_id: ticketId,
                method: "public_comment_with_attachment_links",
                attachment_note: "Attachments sent as downloadable links in email notification"
            };
            
        } catch (error) {
            console.error(`❌ Error sending email to ${creditorEmail}:`, error.message);
            if (error.response?.data) {
                console.error(`Email sending error details:`, error.response.data);
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
     * Create individual ticket for creditor and send settlement plan email via public comment
     */
    async sendSettlementPlanEmailViaTicket(mainTicketId, creditorData, clientData, settlementData) {
        // Use test email for now
        const testEmail = 'justlukax@gmail.com';
        const creditorName = creditorData.sender_name || creditorData.creditor_name || 'Unknown Creditor';
        const emailBody = this.generateSettlementPlanEmailBody(creditorData, clientData, settlementData);
        const emailSubject = `Schuldenbereinigungsplan - ${creditorName} - Az: ${clientData.reference || 'N/A'}`;
        
        try {
            console.log(`🎫 Creating individual ticket for creditor: ${creditorName}`);
            
            // Create individual ticket for this creditor
            const creditorTicket = await this.createCreditorSettlementTicket(creditorData, clientData, settlementData, testEmail);
            
            if (!creditorTicket.success) {
                throw new Error(`Failed to create creditor ticket: ${creditorTicket.error}`);
            }
            
            const creditorTicketId = creditorTicket.ticket_id;
            console.log(`✅ Created creditor ticket: ${creditorTicketId}`);
            
            // Upload settlement plan and creditor overview documents
            const path = require('path');
            const documentDir = path.join(__dirname, '../documents');
            
            // Expected document filenames
            const settlementPlanFile = path.join(documentDir, `Schuldenbereinigungsplan_${clientData.reference}_${new Date().toISOString().split('T')[0]}.docx`);
            const creditorOverviewFile = path.join(documentDir, `Forderungsübersicht_${clientData.reference}_${new Date().toISOString().split('T')[0]}.docx`);
            
            console.log(`📎 Looking for documents:`);
            console.log(`   Settlement Plan: ${settlementPlanFile}`);
            console.log(`   Creditor Overview: ${creditorOverviewFile}`);
            
            // Check if files exist and add to attachment list
            const attachmentPaths = [];
            const fs = require('fs');
            if (fs.existsSync(settlementPlanFile)) {
                attachmentPaths.push(settlementPlanFile);
                console.log(`✅ Found Schuldenbereinigungsplan: ${settlementPlanFile}`);
            } else {
                console.warn(`⚠️ Schuldenbereinigungsplan not found: ${settlementPlanFile}`);
            }
            
            if (fs.existsSync(creditorOverviewFile)) {
                attachmentPaths.push(creditorOverviewFile);
                console.log(`✅ Found Forderungsübersicht: ${creditorOverviewFile}`);
            } else {
                console.warn(`⚠️ Forderungsübersicht not found: ${creditorOverviewFile}`);
            }
            
            // Send public comment with attachments (this will email the creditor)
            const emailResult = await this.sendCreditorEmailWithAttachments(
                creditorTicketId, 
                testEmail, 
                creditorName,
                emailSubject,
                emailBody,
                attachmentPaths
            );
            
            if (!emailResult.success) {
                throw new Error(`Failed to send email: ${emailResult.error}`);
            }
            
            console.log(`✅ Settlement Plan email sent to: ${testEmail} (${creditorName})`);
            console.log(`📎 Attachments included: ${emailResult.attachments_count || 0} documents`);
            
            return {
                success: true,
                main_ticket_id: mainTicketId,
                creditor_ticket_id: creditorTicketId,
                comment_id: emailResult.comment_id,
                recipient_email: testEmail,
                recipient_name: creditorName,
                subject: emailSubject,
                attachments_count: emailResult.attachments_count || 0,
                method: 'individual_ticket_with_email',
                email_sent: true
            };

        } catch (error) {
            console.error(`❌ Error creating Settlement Plan email for creditor ${creditorName}:`, error.message);
            
            return {
                success: false,
                error: error.message,
                main_ticket_id: mainTicketId,
                recipient_email: testEmail,
                recipient_name: creditorName,
                subject: emailSubject,
                method: 'individual_ticket_with_email',
                email_sent: false
            };
        }
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
}

module.exports = ZendeskManager;