const { v4: uuidv4 } = require('uuid');

/**
 * Settlement Response Processor
 * Handles incoming creditor responses to settlement plans
 * Analyzes acceptance, rejection, or counter-offers
 */
class SettlementResponseProcessor {
    constructor(creditorContactService) {
        this.creditorContactService = creditorContactService;

        // Enhanced keywords for detecting acceptance/rejection
        this.acceptanceKeywords = [
            'zustimmung', 'einverstanden', 'akzeptiert', 'genehmigt', 'angenommen',
            'zusagen', 'bestätigt', 'ok', 'einverständnis', 'akzeptable',
            'zustimmen', 'vereinbarung', 'abkommen', 'einigkeit', 'billigung',
            'ja', 'positiv', 'nehmen an', 'sind bereit', 'stimmen zu',
            'können zustimmen', 'sind einverstanden', 'akzeptieren wir',

            // English variants
            "that's fine", "yes that's fine", "fine", "works for me",
            "sounds good", "okay", "alright", "sure", "all good", "no problem"
        ];

        this.rejectionKeywords = [
            'ablehnung', 'ablehnen', 'nicht einverstanden', 'zurückweisen', 'verwerfen',
            'nicht akzeptabel', 'unzureichend', 'inakzeptabel', 'nicht zufrieden',
            'widersprechen', 'nicht möglich', 'ungenügend', 'zu niedrig',
            'nein', 'negativ', 'lehnen ab', 'können nicht', 'unmöglich',
            'nicht akzeptieren', 'nicht zustimmen', 'verweigern', 'absagen'
        ];

        this.counterOfferKeywords = [
            'gegenangebot', 'alternativ', 'stattdessen', 'vorschlag', 'gegenvorschlag',
            'andere', 'modifikation', 'änderung', 'anpassung', 'alternative',
            'kompromiss', 'verhandlung', 'jedoch', 'aber', 'allerdings',
            'unter der bedingung', 'wenn', 'falls', 'rate', 'ratenzahlung',
            'höhere', 'niedrigere', 'anders', 'bedingung'
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
     * Enhanced content analysis to determine acceptance/rejection with better intelligence
     */
    analyzeResponseContent(emailBody) {
        const normalizedBody = emailBody.toLowerCase();

        // Remove common email signatures and footers
        const cleanBody = this.cleanEmailContent(normalizedBody);

        // Count keyword matches with context analysis
        const acceptanceMatches = this.findKeywordsWithContext(cleanBody, this.acceptanceKeywords);
        const rejectionMatches = this.findKeywordsWithContext(cleanBody, this.rejectionKeywords);
        const counterOfferMatches = this.findKeywordsWithContext(cleanBody, this.counterOfferKeywords);

        // Enhanced decision logic
        let status = 'no_response';
        let confidence = 0;
        let keywords_found = [];
        let analysis_notes = [];

        // Check for clear acceptance patterns
        if (this.hasStrongAcceptancePattern(cleanBody) ||
            (acceptanceMatches.length >= 2 && rejectionMatches.length === 0 && counterOfferMatches.length === 0)) {
            status = 'accepted';
            confidence = Math.min(0.95, 0.7 + (acceptanceMatches.length * 0.1));
            keywords_found = acceptanceMatches.map(m => m.keyword);
            analysis_notes.push('Strong acceptance pattern detected');
        }
        // Check for clear rejection patterns
        else if (this.hasStrongRejectionPattern(cleanBody) ||
            (rejectionMatches.length >= 2 && acceptanceMatches.length === 0)) {
            status = 'declined';
            confidence = Math.min(0.9, 0.6 + (rejectionMatches.length * 0.1));
            keywords_found = rejectionMatches.map(m => m.keyword);
            analysis_notes.push('Strong rejection pattern detected');
        }
        // Check for counter offer patterns
        else if (counterOfferMatches.length > 0 || this.hasCounterOfferPattern(cleanBody)) {
            status = 'counter_offer';
            confidence = Math.min(0.85, 0.5 + (counterOfferMatches.length * 0.15));
            keywords_found = counterOfferMatches.map(m => m.keyword);
            analysis_notes.push('Counter-offer or negotiation detected');
        }
        // Mixed signals - prioritize based on strength
        else if (acceptanceMatches.length > 0 && rejectionMatches.length > 0) {
            if (acceptanceMatches.length > rejectionMatches.length) {
                status = 'accepted';
                confidence = 0.6;
                analysis_notes.push('Mixed signals, leaning towards acceptance');
            } else {
                status = 'declined';
                confidence = 0.6;
                analysis_notes.push('Mixed signals, leaning towards rejection');
            }
            keywords_found = [...acceptanceMatches, ...rejectionMatches].map(m => m.keyword);
        }
        // Single keyword matches
        else if (acceptanceMatches.length > 0) {
            status = 'accepted';
            confidence = 0.7;
            keywords_found = acceptanceMatches.map(m => m.keyword);
        }
        else if (rejectionMatches.length > 0) {
            status = 'declined';
            confidence = 0.7;
            keywords_found = rejectionMatches.map(m => m.keyword);
        }
        // Has substantial content but unclear intent
        else if (cleanBody.length > 100) {
            status = 'counter_offer';
            confidence = 0.3;
            keywords_found = ['manual_review_required'];
            analysis_notes.push('Substantial content requires manual review');
        }

        return {
            status,
            confidence: Math.round(confidence * 100) / 100,
            keywords_found,
            analysis_notes,
            acceptance_count: acceptanceMatches.length,
            rejection_count: rejectionMatches.length,
            counter_offer_count: counterOfferMatches.length,
            content_length: cleanBody.length
        };
    }

    /**
     * Clean email content by removing signatures and footers
     */
    cleanEmailContent(emailBody) {
        let cleaned = emailBody;

        // Remove common German email signatures
        const signaturePatterns = [
            /mit freundlichen grüßen[\s\S]*$/gi,
            /freundliche grüße[\s\S]*$/gi,
            /hochachtungsvoll[\s\S]*$/gi,
            /beste grüße[\s\S]*$/gi,
            /--[\s\S]*$/gi, // Common signature separator
            /________________________________[\s\S]*$/gi,
            /diese e-mail[\s\S]*$/gi,
            /confidential[\s\S]*$/gi
        ];

        signaturePatterns.forEach(pattern => {
            cleaned = cleaned.replace(pattern, '');
        });

        return cleaned.trim();
    }

    /**
     * Find keywords with context analysis
     */
    findKeywordsWithContext(text, keywords) {
        const matches = [];

        keywords.forEach(keyword => {
            const regex = new RegExp(`\\b${keyword.replace(/\s+/g, '\\s+')}\\b`, 'gi');
            let match;
            while ((match = regex.exec(text)) !== null) {
                const context = this.getContext(text, match.index, 50);
                matches.push({
                    keyword: keyword,
                    position: match.index,
                    context: context
                });
            }
        });

        return matches;
    }

    /**
     * Get context around a keyword match
     */
    getContext(text, position, radius) {
        const start = Math.max(0, position - radius);
        const end = Math.min(text.length, position + radius);
        return text.substring(start, end);
    }

    /**
     * Check for strong acceptance patterns
     */
    hasStrongAcceptancePattern(text) {
        const strongPatterns = [
            /wir\s+akzeptieren/gi,
            /stimmen\s+zu/gi,
            /sind\s+einverstanden/gi,
            /nehmen\s+an/gi,
            /bestätigen\s+hiermit/gi
        ];

        return strongPatterns.some(pattern => pattern.test(text));
    }

    /**
     * Check for strong rejection patterns
     */
    hasStrongRejectionPattern(text) {
        const strongPatterns = [
            /lehnen\s+ab/gi,
            /nicht\s+akzeptabel/gi,
            /können\s+nicht\s+zustimmen/gi,
            /widersprechen\s+dem/gi,
            /verweigern/gi
        ];

        return strongPatterns.some(pattern => pattern.test(text));
    }

    /**
     * Check for counter offer patterns
     */
    hasCounterOfferPattern(text) {
        const counterPatterns = [
            /€\s*\d+/gi, // Euro amounts suggesting different offer
            /\d+\s*prozent/gi, // Percentage offers
            /rate\w*/gi, // Payment installments
            /monatlich/gi, // Monthly payments
            /wenn.*dann/gi, // Conditional statements
            /unter.*bedingung/gi // Conditions
        ];

        return counterPatterns.some(pattern => pattern.test(text));
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