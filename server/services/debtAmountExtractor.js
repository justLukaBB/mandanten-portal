const axios = require('axios');
require('dotenv').config();

/**
 * Debt Amount Extractor Service
 * Uses Claude AI to extract debt amounts from German creditor emails
 */
class DebtAmountExtractor {
    constructor() {
        this.claudeApiKey = process.env.CLAUDE_API_KEY;
        this.claudeApiUrl = 'https://api.anthropic.com/v1/messages';
        
        if (!this.claudeApiKey) {
            console.warn('⚠️ CLAUDE_API_KEY not found in environment variables');
        }

        this.extractionPrompt = `Sie sind ein spezialisierter KI-Assistent für die Extraktion von Forderungsbeträgen aus deutschen Gläubiger-E-Mails.

AUFGABE: Extrahieren Sie die AKTUELLE GESAMTFORDERUNG aus der E-Mail-Antwort eines Gläubigers.

DEUTSCHE BEGRIFFE FÜR FORDERUNGEN:
- "Gesamtforderung", "Gesamtbetrag", "Gesamtsumme"
- "Aktuelle Forderung", "Forderungshöhe", "Schulden"
- "Hauptforderung + Zinsen + Kosten"
- "Endbetrag", "Zu zahlen", "Offener Betrag"

MUSTER ZU ERKENNEN:
- "Gesamtforderung: 2.450,00 EUR"
- "Aktuelle Schulden: 1.234,56€"
- "Hauptforderung: 1.000€ + Zinsen: 150€ + Kosten: 200€ = 1.350€"
- "Zu zahlen: 3.567,89 Euro"

WICHTIG:
- Suchen Sie nach dem HÖCHSTEN/FINALEN Betrag (meist Gesamtsumme)
- Ignorieren Sie Teilbeträge, wenn Gesamtsumme vorhanden
- Deutsche Zahlenformate: 1.234,56 oder 1234,56 oder 1.234,56€
- Bei mehreren Beträgen: Nehmen Sie die Gesamtsumme

ANTWORTEN SIE NUR MIT EINEM JSON-OBJEKT (keine zusätzlichen Erklärungen):

{
  "extracted_amount": 0.00,
  "currency": "EUR",
  "confidence": 0.0,
  "extraction_source": "text_snippet_where_found",
  "breakdown": {
    "main_amount": 0.00,
    "interest": 0.00,
    "costs": 0.00
  },
  "reasoning": "Kurze Erklärung der Extraktion"
}`;
    }

    /**
     * Extract debt amount from creditor email using Claude AI + fallback regex
     */
    async extractDebtAmount(emailBody, creditorContext = null) {
        try {
            console.log(`💰 Starting debt amount extraction...`);
            
            // Primary: Claude AI extraction
            const claudeResult = await this._extractWithClaude(emailBody, creditorContext);
            
            if (claudeResult.confidence >= 0.7) {
                console.log(`✅ Claude extraction successful: ${claudeResult.extracted_amount} EUR (confidence: ${claudeResult.confidence})`);
                return claudeResult;
            }
            
            console.log(`🔄 Claude confidence low (${claudeResult.confidence}), falling back to regex...`);
            
            // Fallback: Regex extraction
            const regexResult = this._extractWithRegex(emailBody);
            
            if (regexResult.extracted_amount > 0) {
                console.log(`✅ Regex extraction successful: ${regexResult.extracted_amount} EUR`);
                return regexResult;
            }
            
            console.log(`❌ No amount found in email`);
            
            // Final fallback
            return {
                extracted_amount: 0.0,
                currency: 'EUR',
                confidence: 0.0,
                extraction_source: 'no_amount_found',
                breakdown: { main_amount: 0, interest: 0, costs: 0 },
                reasoning: 'Kein Betrag in der E-Mail gefunden'
            };
            
        } catch (error) {
            console.error('❌ Debt extraction error:', error.message);
            return this._extractWithRegex(emailBody);
        }
    }

    /**
     * Use Claude AI to extract debt amount from German creditor email
     */
    async _extractWithClaude(emailBody, creditorContext = null) {
        if (!this.claudeApiKey) {
            console.log('⚠️ Claude API key not available, using regex fallback');
            return { extracted_amount: 0.0, confidence: 0.0 };
        }

        try {
            let contextInfo = "";
            if (creditorContext) {
                contextInfo = `
KONTEXT:
Gläubiger: ${creditorContext.creditor_name || 'Unbekannt'}
Aktenzeichen: ${creditorContext.reference_number || 'Unbekannt'}
Ursprünglicher Betrag: ${creditorContext.original_claim_amount || 'Unbekannt'} EUR
`;
            }

            const fullPrompt = `${this.extractionPrompt}

${contextInfo}

E-MAIL INHALT:
${emailBody.slice(0, 2000)}

Extrahieren Sie die aktuelle Gesamtforderung als JSON:`;

            const response = await axios.post(this.claudeApiUrl, {
                model: 'claude-sonnet-4-5-20250929',
                max_tokens: 1000,
                temperature: 0.1,
                messages: [{
                    role: 'user',
                    content: fullPrompt
                }]
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.claudeApiKey,
                    'anthropic-version': '2023-06-01'
                }
            });

            const responseText = response.data.content[0].text.trim();
            console.log(`🤖 Claude response:`, responseText);

            // Parse JSON response
            let result;
            try {
                // Try to extract JSON from response
                const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    result = JSON.parse(jsonMatch[0]);
                } else {
                    result = JSON.parse(responseText);
                }
            } catch (parseError) {
                console.error('❌ Failed to parse Claude JSON response:', parseError.message);
                return { extracted_amount: 0.0, confidence: 0.0 };
            }
            
            // Validate result
            if (!result.hasOwnProperty('extracted_amount') || typeof result.extracted_amount !== 'number') {
                console.error('❌ Invalid Claude response format');
                return { extracted_amount: 0.0, confidence: 0.0 };
            }

            // Ensure all required fields
            return {
                extracted_amount: result.extracted_amount || 0.0,
                currency: result.currency || 'EUR',
                confidence: result.confidence || 0.0,
                extraction_source: result.extraction_source || 'claude_ai',
                breakdown: result.breakdown || { main_amount: 0, interest: 0, costs: 0 },
                reasoning: result.reasoning || 'Claude AI extraction'
            };
            
        } catch (error) {
            console.error('❌ Claude API error:', error.response?.data || error.message);
            return { extracted_amount: 0.0, confidence: 0.0 };
        }
    }

    /**
     * Fallback regex extraction for German currency amounts
     */
    _extractWithRegex(emailBody) {
        console.log('🔍 Using regex extraction for German currency amounts...');
        
        // German currency patterns (ordered by specificity)
        const patterns = [
            // Specific contexts first
            {
                pattern: /(?:gesamtforderung|gesamtbetrag|gesamtsumme|zu zahlen|offener betrag|aktuelle forderung|forderungshöhe)[:\s]*(\d{1,3}(?:\.\d{3})*,\d{2})\s*(?:eur|€|euro)/gi,
                priority: 10
            },
            {
                pattern: /(?:gesamt|total|forderung|schulden|betrag|summe)[:\s]*(\d{1,3}(?:\.\d{3})*,\d{2})\s*(?:eur|€|euro)/gi,
                priority: 8
            },
            // General amount patterns
            {
                pattern: /(\d{1,3}(?:\.\d{3})*,\d{2})\s*(?:eur|€|euro)/gi,
                priority: 5
            },
            // Alternative formats
            {
                pattern: /(\d{1,3}(?:,\d{3})*\.\d{2})\s*(?:eur|€|euro)/gi,
                priority: 3
            }
        ];
        
        const foundAmounts = [];
        
        for (const patternObj of patterns) {
            const matches = [...emailBody.matchAll(patternObj.pattern)];
            
            for (const match of matches) {
                try {
                    let amountStr = match[1];
                    let amount;
                    
                    // Convert German number format to float
                    if (amountStr.includes(',') && amountStr.includes('.')) {
                        // German: 1.234,56 -> 1234.56
                        amount = parseFloat(amountStr.replace(/\./g, '').replace(',', '.'));
                    } else if (amountStr.includes(',')) {
                        // German: 1234,56 -> 1234.56
                        amount = parseFloat(amountStr.replace(',', '.'));
                    } else {
                        // English format or integer
                        amount = parseFloat(amountStr.replace(/,/g, ''));
                    }
                    
                    // Reasonable debt range check
                    if (!isNaN(amount) && amount >= 10 && amount <= 1000000) {
                        foundAmounts.push({
                            amount: amount,
                            priority: patternObj.priority,
                            source: match[0],
                            context: this._getContext(emailBody, match.index, 50)
                        });
                        
                        console.log(`💰 Found amount: ${amount} EUR (priority: ${patternObj.priority}) - "${match[0]}"`);
                    }
                        
                } catch (error) {
                    console.error('❌ Error parsing amount:', error.message);
                }
            }
        }
        
        if (foundAmounts.length > 0) {
            // Sort by priority (highest first), then by amount (highest first)
            foundAmounts.sort((a, b) => {
                if (a.priority !== b.priority) {
                    return b.priority - a.priority;
                }
                return b.amount - a.amount;
            });
            
            const bestMatch = foundAmounts[0];
            console.log(`✅ Best regex match: ${bestMatch.amount} EUR (priority: ${bestMatch.priority})`);
            console.log(`📝 Context: "${bestMatch.context}"`);
            
            return {
                extracted_amount: bestMatch.amount,
                currency: 'EUR',
                confidence: this._calculateRegexConfidence(bestMatch.priority, foundAmounts.length),
                extraction_source: bestMatch.source,
                breakdown: { 
                    main_amount: bestMatch.amount, 
                    interest: 0, 
                    costs: 0 
                },
                reasoning: `Regex-Extraktion: ${bestMatch.source}`,
                context: bestMatch.context
            };
        }
        
        console.log('❌ No valid amounts found with regex');
        return {
            extracted_amount: 0.0,
            currency: 'EUR', 
            confidence: 0.0,
            extraction_source: 'no_regex_match',
            breakdown: { main_amount: 0, interest: 0, costs: 0 },
            reasoning: 'Regex konnte keinen Betrag finden'
        };
    }

    /**
     * Get context around a match for debugging
     */
    _getContext(text, index, radius) {
        const start = Math.max(0, index - radius);
        const end = Math.min(text.length, index + radius);
        return text.slice(start, end).replace(/\s+/g, ' ').trim();
    }

    /**
     * Calculate confidence score for regex matches
     */
    _calculateRegexConfidence(priority, totalMatches) {
        let confidence = 0.3; // Base confidence for regex
        
        // Higher priority patterns get higher confidence
        if (priority >= 8) {
            confidence = 0.85;
        } else if (priority >= 5) {
            confidence = 0.7;
        } else {
            confidence = 0.5;
        }
        
        // Reduce confidence if many matches (ambiguous)
        if (totalMatches > 5) {
            confidence *= 0.8;
        } else if (totalMatches > 3) {
            confidence *= 0.9;
        }
        
        return Math.round(confidence * 100) / 100;
    }

    /**
     * Test the extraction with sample emails
     */
    async testExtraction() {
        const testEmails = [
            {
                name: 'German total amount',
                body: `Sehr geehrte Damen und Herren,
                       
                       bezugnehmend auf Ihr Schreiben teilen wir mit:
                       
                       Gesamtforderung: 2.450,00 EUR
                       
                       Hauptforderung: 2.000,00 €
                       Zinsen: 350,00 €
                       Kosten: 100,00 €
                       
                       Mit freundlichen Grüßen`,
                expected: 2450.00
            },
            {
                name: 'Simple debt statement',
                body: `Aktuelle Schulden: 1.234,56€ (Stand: heute)
                       
                       Bitte begleichen Sie den Betrag.`,
                expected: 1234.56
            },
            {
                name: 'Total to pay',
                body: `Zu zahlen: 5.678,90 Euro inkl. aller Kosten und Zinsen.`,
                expected: 5678.90
            },
            {
                name: 'No clear amount',
                body: `Wir bestätigen den Eingang Ihres Schreibens und werden uns zeitnah melden.`,
                expected: 0.0
            }
        ];
        
        console.log('\n🧪 Testing debt amount extraction...\n');
        
        const results = [];
        for (const test of testEmails) {
            console.log(`📧 Testing: ${test.name}`);
            const result = await this.extractDebtAmount(test.body);
            
            const success = Math.abs(result.extracted_amount - test.expected) < 0.01;
            const status = success ? '✅' : '❌';
            
            console.log(`${status} Expected: ${test.expected}, Got: ${result.extracted_amount} (confidence: ${result.confidence})`);
            console.log(`💭 Reasoning: ${result.reasoning}`);
            
            results.push({
                test_name: test.name,
                test_body: test.body.slice(0, 100) + '...',
                expected: test.expected,
                extracted: result.extracted_amount,
                confidence: result.confidence,
                success: success,
                reasoning: result.reasoning
            });
            
            console.log('');
        }
        
        const successCount = results.filter(r => r.success).length;
        console.log(`📊 Test Results: ${successCount}/${results.length} tests passed`);
        
        return results;
    }
}

module.exports = DebtAmountExtractor;