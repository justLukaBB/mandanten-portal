const { v4: uuidv4 } = require('uuid');

/**
 * Settlement Response Processor
 * Handles incoming creditor responses to settlement plans
 * Analyzes acceptance, rejection, or counter-offers
 */
class SettlementResponseProcessor {
    constructor(creditorContactService) {
        this.creditorContactService = creditorContactService;
        
        // Keywords for detecting acceptance/rejection
        this.acceptanceKeywords = [
            'zustimmung', 'einverstanden', 'akzeptiert', 'genehmigt', 'angenommen',
            'zusagen', 'bestätigt', 'ok', 'einverständnis', 'akzeptable', 
            'zustimmen', 'einverstanden', 'vereinbarung', 'abkommen'
        ];
        
        this.rejectionKeywords = [
            'ablehnung', 'ablehnen', 'nicht einverstanden', 'zurückweisen', 'verwerfen',
            'nicht akzeptabel', 'unzureichend', 'inakzeptabel', 'nicht zufrieden',
            'widersprechen', 'nicht möglich', 'ungenügend', 'zu niedrig'
        ];
        
        this.counterOfferKeywords = [
            'gegenangebot', 'alternativ', 'stattdessen', 'vorschlag', 'gegenvorschlag',
            'andere', 'modifikation', 'änderung', 'anpassung', 'alternative',
            'kompromiss', 'verhandlung'
        ];
    }

    /**
     * Process settlement plan response from creditor
     */
    async processSettlementResponse(clientReference, sideConversationId, emailBody, fromEmail, responseDate) {
        try {
            console.log(`📋 Processing settlement response for client ${clientReference}`);
            console.log(`📧 From: ${fromEmail}`);
            console.log(`📅 Date: ${responseDate}`);
            
            // Find matching creditor in the client's data
            const Client = require('../models/Client');
            const client = await Client.findOne({ aktenzeichen: clientReference });
            if (!client) {
                throw new Error(`Client not found: ${clientReference}`);
            }

            // Find creditor by side conversation ID or email
            const creditor = client.final_creditor_list.find(c => 
                c.settlement_side_conversation_id === sideConversationId ||
                c.sender_email === fromEmail ||
                c.creditor_email === fromEmail
            );

            if (!creditor) {
                console.warn(`⚠️ No matching creditor found for ${fromEmail} in client ${clientReference}`);
                return {
                    success: false,
                    error: 'No matching creditor found'
                };
            }

            // Analyze response content
            const analysisResult = this.analyzeResponseContent(emailBody);
            
            console.log(`🔍 Response analysis for ${creditor.sender_name}:`);
            console.log(`   Status: ${analysisResult.status}`);
            console.log(`   Confidence: ${analysisResult.confidence}`);
            console.log(`   Keywords found: ${analysisResult.keywords_found.join(', ')}`);

            // Update creditor record
            creditor.settlement_response_status = analysisResult.status;
            creditor.settlement_response_received_at = new Date(responseDate);
            creditor.settlement_response_text = emailBody;
            creditor.settlement_acceptance_confidence = analysisResult.confidence;
            creditor.settlement_response_metadata = {
                analysis_method: 'keyword_detection',
                keywords_found: analysisResult.keywords_found,
                processed_at: new Date().toISOString(),
                from_email: fromEmail,
                side_conversation_id: sideConversationId
            };

            // Save updated client data
            await client.save();

            console.log(`✅ Settlement response processed for ${creditor.sender_name}: ${analysisResult.status}`);

            return {
                success: true,
                creditor_name: creditor.sender_name,
                response_status: analysisResult.status,
                confidence: analysisResult.confidence,
                keywords_found: analysisResult.keywords_found
            };

        } catch (error) {
            console.error(`❌ Error processing settlement response:`, error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Analyze response content to determine acceptance/rejection
     */
    analyzeResponseContent(emailBody) {
        const normalizedBody = emailBody.toLowerCase();
        
        // Count keyword matches
        const acceptanceMatches = this.acceptanceKeywords.filter(keyword => 
            normalizedBody.includes(keyword.toLowerCase())
        );
        
        const rejectionMatches = this.rejectionKeywords.filter(keyword => 
            normalizedBody.includes(keyword.toLowerCase())
        );
        
        const counterOfferMatches = this.counterOfferKeywords.filter(keyword => 
            normalizedBody.includes(keyword.toLowerCase())
        );

        // Determine status based on keyword strength
        let status = 'no_response';
        let confidence = 0;
        let keywords_found = [];

        if (counterOfferMatches.length > 0) {
            status = 'counter_offer';
            confidence = Math.min(0.9, counterOfferMatches.length * 0.3);
            keywords_found = counterOfferMatches;
        } else if (acceptanceMatches.length > rejectionMatches.length && acceptanceMatches.length > 0) {
            status = 'accepted';
            confidence = Math.min(0.95, acceptanceMatches.length * 0.4);
            keywords_found = acceptanceMatches;
        } else if (rejectionMatches.length > 0) {
            status = 'declined';
            confidence = Math.min(0.9, rejectionMatches.length * 0.35);
            keywords_found = rejectionMatches;
        } else if (normalizedBody.length > 50) {
            // Has content but no clear keywords - might need manual review
            status = 'counter_offer'; // Conservative assumption
            confidence = 0.2;
            keywords_found = ['manual_review_required'];
        }

        return {
            status,
            confidence: Math.round(confidence * 100) / 100,
            keywords_found,
            acceptance_count: acceptanceMatches.length,
            rejection_count: rejectionMatches.length,
            counter_offer_count: counterOfferMatches.length
        };
    }

    /**
     * Process timeout for creditors who didn't respond (after 30 days)
     */
    async processSettlementTimeouts(clientReference, timeoutDays = 30) {
        try {
            console.log(`⏰ Processing settlement plan timeouts for client ${clientReference} (${timeoutDays} days)`);
            
            const Client = require('../models/Client');
            const client = await Client.findOne({ aktenzeichen: clientReference });
            if (!client) {
                throw new Error(`Client not found: ${clientReference}`);
            }

            const timeoutDate = new Date();
            timeoutDate.setDate(timeoutDate.getDate() - timeoutDays);

            let timeoutCount = 0;
            
            for (const creditor of client.final_creditor_list) {
                // Check if settlement plan was sent and no response received within timeout period
                if (creditor.settlement_plan_sent_at && 
                    new Date(creditor.settlement_plan_sent_at) < timeoutDate &&
                    creditor.settlement_response_status === 'pending') {
                    
                    creditor.settlement_response_status = 'no_response';
                    creditor.settlement_response_metadata = {
                        timeout_processed_at: new Date().toISOString(),
                        timeout_days: timeoutDays,
                        analysis_method: 'timeout'
                    };
                    
                    timeoutCount++;
                    console.log(`⏰ Creditor ${creditor.sender_name} marked as no_response (timeout)`);
                }
            }

            if (timeoutCount > 0) {
                await client.save();
                console.log(`✅ Processed ${timeoutCount} settlement plan timeouts for client ${clientReference}`);
            } else {
                console.log(`📋 No settlement plan timeouts to process for client ${clientReference}`);
            }

            return {
                success: true,
                timeouts_processed: timeoutCount
            };

        } catch (error) {
            console.error(`❌ Error processing settlement timeouts:`, error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Generate settlement response summary for client
     */
    async generateSettlementSummary(clientReference) {
        try {
            const Client = require('../models/Client');
            const client = await Client.findOne({ aktenzeichen: clientReference });
            if (!client) {
                throw new Error(`Client not found: ${clientReference}`);
            }

            const summary = {
                total_creditors: client.final_creditor_list.length,
                accepted: 0,
                declined: 0,
                counter_offers: 0,
                no_responses: 0,
                pending: 0,
                creditors: []
            };

            for (const creditor of client.final_creditor_list) {
                const status = creditor.settlement_response_status || 'pending';
                summary[status]++;
                
                summary.creditors.push({
                    name: creditor.sender_name,
                    email: creditor.sender_email,
                    status: status,
                    response_date: creditor.settlement_response_received_at,
                    claim_amount: creditor.claim_amount
                });
            }

            summary.acceptance_rate = summary.total_creditors > 0 ? 
                Math.round((summary.accepted / summary.total_creditors) * 100) : 0;

            console.log(`📊 Settlement summary for ${clientReference}:`);
            console.log(`   Total creditors: ${summary.total_creditors}`);
            console.log(`   Accepted: ${summary.accepted}`);
            console.log(`   Declined: ${summary.declined}`);
            console.log(`   No responses: ${summary.no_responses}`);
            console.log(`   Acceptance rate: ${summary.acceptance_rate}%`);

            return summary;

        } catch (error) {
            console.error(`❌ Error generating settlement summary:`, error.message);
            throw error;
        }
    }
}

module.exports = SettlementResponseProcessor;