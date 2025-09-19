const ZendeskService = require('./zendeskService');
const SettlementResponseProcessor = require('./settlementResponseProcessor');

/**
 * Settlement Response Monitor
 * Monitors Side Conversations for settlement plan responses (accepts/declines)
 * Adapted from SideConversationMonitor for second round monitoring
 */
class SettlementResponseMonitor {
    constructor() {
        this.zendeskService = new ZendeskService();
        this.settlementProcessor = new SettlementResponseProcessor();
        this.activeMonitoringSessions = new Map(); // clientReference -> monitoring session
        this.processedMessages = new Set(); // Avoid double processing
        this.globalMonitorInterval = null;
    }

    /**
     * Start monitoring settlement plan responses for a specific client
     */
    startMonitoringSettlementResponses(clientReference, intervalMinutes = 1) {
        if (this.activeMonitoringSessions.has(clientReference)) {
            console.log(`⚠️ Settlement response monitor already running for client ${clientReference}`);
            return this.activeMonitoringSessions.get(clientReference);
        }

        console.log(`🔄 Starting settlement response monitor for client ${clientReference} (checking every ${intervalMinutes} minute${intervalMinutes !== 1 ? 's' : ''})`);
        
        const session = {
            clientReference,
            type: 'settlement_responses',
            intervalMinutes,
            lastCheck: new Date(),
            startedAt: new Date(),
            responsesFound: 0,
            isActive: true,
            timeoutDays: 30, // 30 days for settlement plan responses
            autoProcessTimeouts: true
        };

        this.activeMonitoringSessions.set(clientReference, session);

        // Start global monitoring if not already running
        if (!this.globalMonitorInterval) {
            this.startGlobalMonitoring();
        }

        return {
            success: true,
            session: session,
            message: `Settlement response monitoring started for client ${clientReference}`
        };
    }

    /**
     * Start global monitoring loop for all active sessions
     */
    startGlobalMonitoring(intervalMinutes = 1) {
        if (this.globalMonitorInterval) {
            console.log(`⚠️ Global settlement monitoring already running`);
            return;
        }

        console.log(`🔄 Starting global settlement response monitoring (every ${intervalMinutes} minute${intervalMinutes !== 1 ? 's' : ''})`);
        
        this.globalMonitorInterval = setInterval(async () => {
            await this.checkAllActiveSessions();
        }, intervalMinutes * 60 * 1000);
    }

    /**
     * Check all active monitoring sessions
     */
    async checkAllActiveSessions() {
        console.log(`🔍 Checking ${this.activeMonitoringSessions.size} active settlement monitoring sessions`);

        for (const [clientReference, session] of this.activeMonitoringSessions.entries()) {
            try {
                await this.checkClientSettlementResponses(clientReference, session);
                session.lastCheck = new Date();
                
                // Check for timeouts if enabled
                if (session.autoProcessTimeouts) {
                    await this.checkSettlementTimeouts(clientReference, session);
                }
                
            } catch (error) {
                console.error(`❌ Error checking settlement responses for client ${clientReference}:`, error.message);
            }
        }
    }

    /**
     * Check settlement responses for a specific client
     */
    async checkClientSettlementResponses(clientReference, session) {
        try {
            // Get client and their settlement Side Conversations
            const Client = require('../models/Client');
            const client = await Client.findOne({ aktenzeichen: clientReference });
            if (!client) {
                console.warn(`⚠️ Client not found: ${clientReference}`);
                return;
            }

            console.log(`🔍 Settlement monitor for ${clientReference}: Found client with ${client.final_creditor_list.length} creditors`);

            // Get all Side Conversations for settlement plans
            const settlementSideConversations = client.final_creditor_list
                .filter(creditor => creditor.settlement_side_conversation_id)
                .map(creditor => ({
                    side_conversation_id: creditor.settlement_side_conversation_id,
                    creditor_name: creditor.sender_name,
                    creditor_email: creditor.sender_email
                }));

            console.log(`🔍 Settlement Side Conversations for ${clientReference}:`, 
                settlementSideConversations.map(sc => ({
                    creditor: sc.creditor_name,
                    side_conversation_id: sc.side_conversation_id
                }))
            );

            if (settlementSideConversations.length === 0) {
                console.log(`📋 No settlement Side Conversations found for client ${clientReference}`);
                console.log(`🔍 Creditor settlement fields:`, client.final_creditor_list.map(c => ({
                    name: c.sender_name,
                    settlement_side_conversation_id: c.settlement_side_conversation_id,
                    settlement_plan_sent_at: c.settlement_plan_sent_at
                })));
                return;
            }

            console.log(`🔍 Checking ${settlementSideConversations.length} settlement Side Conversations for client ${clientReference}`);

            for (const sideConv of settlementSideConversations) {
                await this.checkSideConversationForSettlementResponse(
                    clientReference,
                    sideConv.side_conversation_id,
                    sideConv.creditor_name,
                    session
                );
            }

        } catch (error) {
            console.error(`❌ Error checking client settlement responses for ${clientReference}:`, error.message);
        }
    }

    /**
     * Check a specific Side Conversation for new settlement responses
     */
    async checkSideConversationForSettlementResponse(clientReference, sideConversationId, creditorName, session) {
        try {
            console.log(`🔍 Checking Side Conversation ${sideConversationId} for ${creditorName}`);

            // Get events from Side Conversation
            const events = await this.zendeskService.getSideConversationEvents(sideConversationId);
            
            if (!events || events.length === 0) {
                return;
            }

            // Filter for new inbound messages (from creditors)
            const newMessages = events.filter(event => {
                const messageId = `${sideConversationId}_${event.id}`;
                
                return event.type === 'message' &&
                       event.message &&
                       event.message.from &&
                       event.message.from.email &&
                       !event.message.from.email.includes('ra-scuric.de') && // Not from our law firm
                       !this.processedMessages.has(messageId) &&
                       new Date(event.created_at) > session.lastCheck;
            });

            if (newMessages.length === 0) {
                return;
            }

            console.log(`📧 Found ${newMessages.length} new settlement responses in Side Conversation ${sideConversationId}`);

            // Process each new message
            for (const message of newMessages) {
                const messageId = `${sideConversationId}_${message.id}`;
                
                try {
                    // Process settlement response
                    const result = await this.settlementProcessor.processSettlementResponse(
                        clientReference,
                        sideConversationId,
                        message.message.body,
                        message.message.from.email,
                        message.created_at
                    );

                    if (result.success) {
                        console.log(`✅ Settlement response processed: ${result.creditor_name} - ${result.response_status}`);
                        session.responsesFound++;
                    } else {
                        console.warn(`⚠️ Failed to process settlement response: ${result.error}`);
                    }

                    // Mark as processed
                    this.processedMessages.add(messageId);

                } catch (processingError) {
                    console.error(`❌ Error processing settlement message ${messageId}:`, processingError.message);
                    this.processedMessages.add(messageId); // Mark as processed to avoid retry loops
                }
            }

        } catch (error) {
            console.error(`❌ Error checking Side Conversation ${sideConversationId} for settlement responses:`, error.message);
        }
    }

    /**
     * Check and process settlement plan timeouts
     */
    async checkSettlementTimeouts(clientReference, session) {
        try {
            // Only check for timeouts once per day to avoid excessive processing
            const hoursSinceStart = (new Date() - session.startedAt) / (1000 * 60 * 60);
            if (hoursSinceStart < 24) {
                return; // Wait at least 24 hours before first timeout check
            }

            const result = await this.settlementProcessor.processSettlementTimeouts(
                clientReference,
                session.timeoutDays
            );

            if (result.success && result.timeouts_processed > 0) {
                console.log(`⏰ Processed ${result.timeouts_processed} settlement timeouts for client ${clientReference}`);
            }

        } catch (error) {
            console.error(`❌ Error checking settlement timeouts for ${clientReference}:`, error.message);
        }
    }

    /**
     * Stop monitoring for a specific client
     */
    stopMonitoringForClient(clientReference) {
        if (!this.activeMonitoringSessions.has(clientReference)) {
            console.log(`⚠️ No active settlement monitoring for client ${clientReference}`);
            return false;
        }

        this.activeMonitoringSessions.delete(clientReference);
        console.log(`🛑 Stopped settlement response monitoring for client ${clientReference}`);

        // Stop global monitoring if no active sessions
        if (this.activeMonitoringSessions.size === 0 && this.globalMonitorInterval) {
            clearInterval(this.globalMonitorInterval);
            this.globalMonitorInterval = null;
            console.log(`🛑 Stopped global settlement monitoring (no active sessions)`);
        }

        return true;
    }

    /**
     * Get monitoring status for a client
     */
    getMonitoringStatus(clientReference) {
        const session = this.activeMonitoringSessions.get(clientReference);
        if (!session) {
            return {
                isMonitoring: false,
                message: 'No active settlement monitoring'
            };
        }

        return {
            isMonitoring: true,
            session: {
                startedAt: session.startedAt,
                lastCheck: session.lastCheck,
                responsesFound: session.responsesFound,
                intervalMinutes: session.intervalMinutes,
                timeoutDays: session.timeoutDays
            }
        };
    }

    /**
     * Generate settlement response summary
     */
    async generateSettlementSummary(clientReference) {
        return await this.settlementProcessor.generateSettlementSummary(clientReference);
    }

    /**
     * Manually process timeouts for a client
     */
    async processTimeouts(clientReference, timeoutDays = 30) {
        return await this.settlementProcessor.processSettlementTimeouts(clientReference, timeoutDays);
    }
}

module.exports = SettlementResponseMonitor;