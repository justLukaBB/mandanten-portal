const ZendeskService = require('./zendeskService');
const CreditorContactService = require('./creditorContactService');

/**
 * Side Conversation Monitor
 * Polls Zendesk API to check for new creditor responses in Side Conversations
 * Scoped to specific clients and their creditor contact processes
 */
class SideConversationMonitor {
    constructor() {
        this.zendeskService = new ZendeskService();
        this.creditorContactService = new CreditorContactService();
        this.activeMonitoringSessions = new Map(); // clientReference -> monitoring session
        this.processedMessages = new Set(); // Avoid double processing
        this.globalMonitorInterval = null;
    }

    /**
     * Start monitoring Side Conversations for a specific client's creditor contact process
     */
    startMonitoringForClient(clientReference, intervalMinutes = 1) {
        if (this.activeMonitoringSessions.has(clientReference)) {
            console.log(`⚠️ Side Conversation monitor already running for client ${clientReference}`);
            return this.activeMonitoringSessions.get(clientReference);
        }

        console.log(`🔄 Starting Side Conversation monitor for client ${clientReference} (checking every ${intervalMinutes} minutes)`);
        
        // Get all Side Conversations for this client's creditor contacts
        const clientSideConversations = this.getClientSideConversations(clientReference);
        
        if (clientSideConversations.length === 0) {
            console.log(`⚠️ No Side Conversations found for client ${clientReference}`);
            return {
                success: false,
                message: 'No Side Conversations found for this client'
            };
        }

        const session = {
            clientReference,
            sideConversations: clientSideConversations,
            intervalMinutes,
            lastCheck: new Date(),
            startedAt: new Date(),
            responsesFound: 0,
            isActive: true
        };

        this.activeMonitoringSessions.set(clientReference, session);
        
        // Start global monitoring if not already running
        this.startGlobalMonitoring(intervalMinutes);
        
        // Initial check for this client
        this.checkClientSideConversations(clientReference);
        
        console.log(`✅ Started monitoring ${clientSideConversations.length} Side Conversations for client ${clientReference}`);
        
        return {
            success: true,
            client_reference: clientReference,
            side_conversations_count: clientSideConversations.length,
            session: session
        };
    }

    /**
     * Get Side Conversations for a specific client's creditor contacts
     */
    getClientSideConversations(clientReference) {
        const clientContacts = Array.from(this.creditorContactService.creditorContacts.values())
            .filter(contact => 
                contact.client_reference === clientReference &&
                contact.contact_status === 'email_sent' && 
                contact.side_conversation_id &&
                contact.main_zendesk_ticket_id
            );

        return clientContacts.map(contact => ({
            side_conversation_id: contact.side_conversation_id,
            main_ticket_id: contact.main_zendesk_ticket_id,
            creditor_name: contact.creditor_name,
            creditor_email: contact.creditor_email,
            reference_number: contact.reference_number,
            contact: contact
        }));
    }

    /**
     * Start global monitoring that checks all active client sessions
     */
    startGlobalMonitoring(intervalMinutes = 1) {
        if (this.globalMonitorInterval) {
            return; // Already running
        }

        const checkInterval = intervalMinutes * 60 * 1000;
        
        console.log(`🌐 Starting global Side Conversation monitoring (every ${intervalMinutes} minutes)`);
        
        this.globalMonitorInterval = setInterval(async () => {
            try {
                await this.checkAllActiveSessions();
            } catch (error) {
                console.error('❌ Critical error in global monitoring interval:', error.message);
                console.error('🔄 Monitoring will continue on next interval...');
            }
        }, checkInterval);
        
        // Initial check
        this.checkAllActiveSessions();
    }

    /**
     * Stop monitoring for a specific client
     */
    stopMonitoringForClient(clientReference) {
        if (!this.activeMonitoringSessions.has(clientReference)) {
            console.log(`⚠️ No active monitoring session for client ${clientReference}`);
            return false;
        }

        const session = this.activeMonitoringSessions.get(clientReference);
        session.isActive = false;
        session.stoppedAt = new Date();
        
        this.activeMonitoringSessions.delete(clientReference);
        
        console.log(`🛑 Stopped Side Conversation monitoring for client ${clientReference}`);
        
        // Stop global monitoring if no active sessions
        if (this.activeMonitoringSessions.size === 0) {
            this.stopGlobalMonitoring();
        }
        
        return true;
    }

    /**
     * Stop global monitoring
     */
    stopGlobalMonitoring() {
        if (this.globalMonitorInterval) {
            clearInterval(this.globalMonitorInterval);
            this.globalMonitorInterval = null;
            console.log('🛑 Global Side Conversation monitoring stopped');
        }
    }

    /**
     * Check all active monitoring sessions
     */
    async checkAllActiveSessions() {
        try {
            if (this.activeMonitoringSessions.size === 0) {
                console.log('ℹ️ No active monitoring sessions');
                return;
            }

            console.log(`🔍 Checking ${this.activeMonitoringSessions.size} active client monitoring sessions`);

            for (const [clientReference, session] of this.activeMonitoringSessions.entries()) {
                if (session.isActive) {
                    await this.checkClientSideConversations(clientReference);
                }
            }

        } catch (error) {
            console.error('❌ Error checking active sessions:', error.message);
        }
    }

    /**
     * Check Side Conversations for a specific client
     */
    async checkClientSideConversations(clientReference) {
        try {
            const session = this.activeMonitoringSessions.get(clientReference);
            if (!session || !session.isActive) {
                return;
            }

            console.log(`🔍 Checking Side Conversations for client ${clientReference} (${session.sideConversations.length} conversations)`);
            
            if (!this.zendeskService.isConfigured()) {
                console.log('⚠️ Zendesk service not configured, skipping check');
                return;
            }

            const newResponses = [];

            for (const sideConv of session.sideConversations) {
                try {
                    const responses = await this.checkSideConversationForNewMessages(
                        sideConv.main_ticket_id,
                        sideConv.side_conversation_id,
                        sideConv.contact
                    );
                    newResponses.push(...responses);
                } catch (error) {
                    console.error(`❌ Error checking Side Conversation ${sideConv.side_conversation_id} for ${sideConv.creditor_name}:`, error.message);
                }
            }

            if (newResponses.length > 0) {
                console.log(`✅ Found ${newResponses.length} new responses for client ${clientReference}`);
                await this.processNewResponses(newResponses);
                
                // Update session stats
                session.responsesFound += newResponses.length;
                session.lastCheck = new Date();
            } else {
                console.log(`ℹ️ No new responses for client ${clientReference}`);
                session.lastCheck = new Date();
            }

        } catch (error) {
            console.error(`❌ Error checking client ${clientReference}:`, error.message);
        }
    }

    /**
     * Check a specific Side Conversation for new messages
     */
    async checkSideConversationForNewMessages(ticketId, sideConversationId, contact) {
        try {
            console.log(`🔍 Checking Side Conversation ${sideConversationId} for ticket ${ticketId}`);
            
            // Get Side Conversation with events sideloaded to get actual messages
            const response = await this.zendeskService.api.get(
                `/tickets/${ticketId}/side_conversations/${sideConversationId}.json?include=events`
            );
            
            if (!response.data.side_conversation) {
                console.log(`⚠️ Side Conversation ${sideConversationId} not found`);
                return [];
            }

            const sideConversation = response.data.side_conversation;
            
            // Events might be sideloaded in the response root or in the side_conversation object
            const messages = sideConversation.events || response.data.events || [];
            
            console.log(`📨 Found ${messages.length} total messages in Side Conversation ${sideConversationId}`);
            console.log(`👥 Participants:`, sideConversation.participants?.length || 0);
            
            // Debug: log full response structure to understand sideloading
            console.log(`🔍 Full API response keys:`, Object.keys(response.data));
            console.log(`🔍 Side Conversation keys:`, Object.keys(sideConversation));
            
            // Debug: log message structure
            if (messages.length > 0) {
                console.log(`🔍 Sample message structure:`, JSON.stringify(messages[0], null, 2));
            } else {
                console.log(`⚠️ No events found - checking if they're elsewhere in response`);
            }

            // Get session to check when monitoring started
            const session = this.activeMonitoringSessions.get(contact.client_reference);
            let monitoringStartTime;
            
            try {
                monitoringStartTime = session && session.startedAt ? new Date(session.startedAt) : new Date();
                if (isNaN(monitoringStartTime.getTime())) {
                    console.log(`⚠️ Invalid monitoring start time, using current time`);
                    monitoringStartTime = new Date();
                }
            } catch (error) {
                console.log(`⚠️ Error parsing monitoring start time: ${error.message}, using current time`);
                monitoringStartTime = new Date();
            }
            
            // Filter for new inbound messages since monitoring started
            const newMessages = messages.filter(message => {
                try {
                    const messageTime = new Date(message.created_at);
                    const messageId = `${sideConversationId}-${message.id}`;
                    
                    // Validate the date
                    if (isNaN(messageTime.getTime())) {
                        console.log(`⚠️ Invalid timestamp for message ${message.id}: ${message.created_at}`);
                        return false;
                    }
                    
                    // Check if message is new and inbound (from creditor)
                    const isNew = messageTime > monitoringStartTime;
                    const isInbound = message.via && message.via.source && message.via.source.from;
                    const notProcessed = !this.processedMessages.has(messageId);
                    const containsDebtInfo = this.containsDebtInformation(message.body);
                    
                    // Debug logging for message filtering
                    console.log(`📧 Message ${message.id}: Time=${messageTime.toISOString()}, MonitorStart=${monitoringStartTime.toISOString()}`);
                    console.log(`   📊 Filters: isNew=${isNew}, isInbound=${isInbound}, notProcessed=${notProcessed}, hasDebtInfo=${containsDebtInfo}`);
                    if (message.body) {
                        console.log(`   📝 Body preview: "${message.body.substring(0, 100)}..."`);
                    }
                    
                    return isNew && isInbound && notProcessed && containsDebtInfo;
                } catch (error) {
                    console.error(`❌ Error processing message ${message.id}:`, error.message);
                    return false;
                }
            });

            console.log(`🆕 Found ${newMessages.length} new inbound messages with debt information`);

            // Convert to our format
            return newMessages.map(message => ({
                side_conversation_id: sideConversationId,
                ticket_id: ticketId,
                contact: contact,
                message: {
                    id: message.id,
                    body: message.body,
                    created_at: message.created_at,
                    from_email: message.via?.source?.from?.address || contact.creditor_email,
                    from_name: message.via?.source?.from?.name || contact.creditor_name
                }
            }));

        } catch (error) {
            if (error.response?.status === 404) {
                console.log(`ℹ️ Side Conversation ${sideConversationId} not found or no access`);
                return [];
            }
            throw error;
        }
    }

    /**
     * Process newly found creditor responses
     */
    async processNewResponses(responses) {
        for (const response of responses) {
            try {
                console.log(`📧 Processing response from ${response.message.from_name}: "${response.message.body.substring(0, 100)}..."`);
                
                // Mark as processed to avoid duplicates
                const messageId = `${response.side_conversation_id}-${response.message.id}`;
                this.processedMessages.add(messageId);
                
                // Process with our creditor response service
                const result = await this.creditorContactService.processIncomingCreditorResponse(
                    response.ticket_id, 
                    {
                        body: response.message.body,
                        author_id: response.contact.creditor_email,
                        created_at: response.message.created_at,
                        public: true,
                        via: { channel: 'email' }
                    }
                );
                
                if (result.success) {
                    console.log(`✅ Processed response: ${result.creditor_name} - €${result.final_amount}`);
                    
                    // Add comment to main ticket about the response
                    await this.addResponseNotificationToTicket(response, result);
                    
                } else {
                    console.error(`❌ Failed to process response: ${result.error}`);
                }
                
            } catch (error) {
                console.error(`❌ Error processing response from ${response.contact.creditor_name}:`, error.message);
            }
        }
    }

    /**
     * Add internal comment to main ticket about processed response
     */
    async addResponseNotificationToTicket(response, processingResult) {
        try {
            const comment = `📧 **GLÄUBIGER-ANTWORT AUTOMATISCH VERARBEITET**

🏛️ **Gläubiger:** ${response.contact.creditor_name}
📧 **E-Mail:** ${response.message.from_email}
⏰ **Erhalten:** ${new Date(response.message.created_at).toLocaleString('de-DE')}
💰 **Extrahierter Betrag:** €${processingResult.final_amount || 'N/A'}
🎯 **Konfidenz:** ${Math.round((processingResult.confidence || 0) * 100)}%

📝 **Antwort-Text:**
"${response.message.body.substring(0, 300)}${response.message.body.length > 300 ? '...' : ''}"

✅ **Status:** Automatisch verarbeitet durch Side Conversation Monitor
🔗 **Side Conversation ID:** ${response.side_conversation_id}

📊 **Verarbeitungsdetails:**
• Quelle: ${processingResult.amount_source || 'Unbekannt'}
• Referenz: ${response.contact.reference_number || 'N/A'}`;

            await this.zendeskService.addInternalComment(response.ticket_id, {
                content: comment,
                tags: ['creditor-response-processed', 'auto-processed']
            });
            
            console.log(`✅ Added response notification to ticket ${response.ticket_id}`);
            
        } catch (error) {
            console.error(`❌ Failed to add response notification: ${error.message}`);
        }
    }

    /**
     * Check if message contains debt-related information
     */
    containsDebtInformation(messageBody) {
        if (!messageBody) return false;
        
        const debtKeywords = [
            'schulden', 'forderung', 'betrag', 'euro', '€', 'eur',
            'gesamtbetrag', 'gesamtsumme', 'zu zahlen', 'offen',
            'hauptforderung', 'zinsen', 'kosten', 'mahnung'
        ];
        
        const lowerBody = messageBody.toLowerCase();
        return debtKeywords.some(keyword => lowerBody.includes(keyword));
    }

    /**
     * Get monitoring status
     */
    getStatus() {
        const activeSessions = Array.from(this.activeMonitoringSessions.entries()).map(([clientRef, session]) => ({
            client_reference: clientRef,
            side_conversations_count: session.sideConversations.length,
            started_at: session.startedAt,
            last_check: session.lastCheck,
            responses_found: session.responsesFound,
            is_active: session.isActive,
            creditors: session.sideConversations.map(sc => sc.creditor_name)
        }));

        return {
            global_monitoring_active: !!this.globalMonitorInterval,
            active_sessions_count: this.activeMonitoringSessions.size,
            active_sessions: activeSessions,
            processed_messages_count: this.processedMessages.size,
            zendesk_configured: this.zendeskService.isConfigured(),
            total_side_conversations: activeSessions.reduce((sum, session) => sum + session.side_conversations_count, 0)
        };
    }

    /**
     * Get status for a specific client
     */
    getClientStatus(clientReference) {
        const session = this.activeMonitoringSessions.get(clientReference);
        
        if (!session) {
            return {
                client_reference: clientReference,
                is_monitored: false,
                message: 'No active monitoring session for this client'
            };
        }

        return {
            client_reference: clientReference,
            is_monitored: true,
            is_active: session.isActive,
            started_at: session.startedAt,
            last_check: session.lastCheck,
            responses_found: session.responsesFound,
            side_conversations: session.sideConversations.map(sc => ({
                side_conversation_id: sc.side_conversation_id,
                creditor_name: sc.creditor_name,
                creditor_email: sc.creditor_email,
                main_ticket_id: sc.main_ticket_id
            }))
        };
    }

    /**
     * Manual check for specific ticket
     */
    async checkTicket(ticketId) {
        try {
            console.log(`🔍 Manual check for ticket ${ticketId}`);
            
            // Find contacts for this ticket
            const contacts = Array.from(this.creditorContactService.creditorContacts.values())
                .filter(contact => 
                    contact.main_zendesk_ticket_id === ticketId && 
                    contact.side_conversation_id
                );
            
            if (contacts.length === 0) {
                return {
                    success: false,
                    message: 'No Side Conversations found for this ticket'
                };
            }
            
            const responses = [];
            for (const contact of contacts) {
                const newResponses = await this.checkSideConversationForNewMessages(
                    ticketId,
                    contact.side_conversation_id,
                    contact
                );
                responses.push(...newResponses);
            }
            
            if (responses.length > 0) {
                await this.processNewResponses(responses);
            }
            
            return {
                success: true,
                message: `Found and processed ${responses.length} responses`,
                responses_count: responses.length
            };
            
        } catch (error) {
            console.error(`❌ Error in manual ticket check: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = SideConversationMonitor;