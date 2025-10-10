const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

/**
 * Nullplan Creditor Letter Generator
 * Generates individual Nullplan letters for each creditor using Nullplan_Text_Template.docx
 */
class NullplanCreditorLetterGenerator {
    constructor() {
        this.templatePath = path.join(__dirname, '../templates/Nullplan_Text_Template.docx');
        this.outputDir = path.join(__dirname, '../documents');
        
        // Create output directory if it doesn't exist
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    /**
     * Generate individual Nullplan letters for all creditors
     */
    async generateNullplanLettersForAllCreditors(clientData, allCreditors) {
        try {
            console.log(`📄 Generating individual Nullplan letters for ${allCreditors.length} creditors...`);

            if (!fs.existsSync(this.templatePath)) {
                throw new Error(`Nullplan template not found: ${this.templatePath}`);
            }

            const results = [];
            
            // Calculate total debt for quota calculations
            const totalDebt = allCreditors.reduce((sum, creditor) => {
                return sum + (creditor.debt_amount || creditor.final_amount || creditor.amount || 0);
            }, 0);

            // Generate individual letter for each creditor
            for (let i = 0; i < allCreditors.length; i++) {
                const creditor = allCreditors[i];
                const creditorPosition = i + 1;
                
                console.log(`📝 Processing creditor ${creditorPosition}/${allCreditors.length}: ${creditor.name || creditor.creditor_name}`);
                
                const letterResult = await this.generateNullplanLetterForCreditor(
                    clientData, 
                    creditor, 
                    creditorPosition, 
                    allCreditors.length,
                    totalDebt
                );
                
                if (letterResult.success) {
                    results.push(letterResult);
                } else {
                    console.error(`❌ Failed to generate letter for ${creditor.name}: ${letterResult.error}`);
                }
            }

            console.log(`✅ Generated ${results.length}/${allCreditors.length} individual Nullplan letters`);

            return {
                success: true,
                documents: results,
                total_generated: results.length,
                total_creditors: allCreditors.length
            };

        } catch (error) {
            console.error('❌ Error generating Nullplan letters:', error);
            return {
                success: false,
                error: error.message,
                documents: []
            };
        }
    }

    /**
     * Generate Nullplan letter for a single creditor
     */
    async generateNullplanLetterForCreditor(clientData, creditor, creditorPosition, totalCreditors, totalDebt) {
        try {
            // Load the template
            const templateBuffer = fs.readFileSync(this.templatePath);
            const zip = await JSZip.loadAsync(templateBuffer);
            const documentXml = await zip.file('word/document.xml').async('string');

            // Prepare creditor-specific replacements
            const replacements = this.prepareCreditorSpecificReplacements(
                clientData, 
                creditor, 
                creditorPosition, 
                totalCreditors, 
                totalDebt
            );
            
            console.log(`🔄 Applying ${Object.keys(replacements).length} replacements for ${creditor.name || creditor.creditor_name}`);

            // Replace variables in the document XML - using advanced method that handles XML splitting
            let processedXml = documentXml;
            let totalReplacements = 0;

            // Support multiple quote types found in Word documents
            const quoteTypes = [
                { name: 'HTML encoded', open: '&quot;', close: '&quot;' },
                { name: 'Regular', open: '"', close: '"' },
                { name: 'Curly left/right', open: '"', close: '"' },
                { name: 'Curly alternative', open: '"', close: '"' }
            ];

            Object.entries(replacements).forEach(([variable, value]) => {
                let variableReplaced = false;
                
                quoteTypes.forEach(quoteType => {
                    if (variableReplaced) return; // Skip if already replaced
                    
                    // Create more flexible pattern that handles XML structure
                    const quotedVariable = `${quoteType.open}${variable}${quoteType.close}`;
                    
                    // First try exact match
                    const exactPattern = new RegExp(
                        this.escapeRegex(quotedVariable),
                        'g'
                    );
                    
                    const exactMatches = (processedXml.match(exactPattern) || []).length;
                    if (exactMatches > 0) {
                        processedXml = processedXml.replace(exactPattern, value);
                        console.log(`✅ Exact match "${variable}" (${quoteType.name}): ${exactMatches} occurrences`);
                        totalReplacements += exactMatches;
                        variableReplaced = true;
                        return;
                    }
                    
                    // Advanced split-XML pattern for variables that are broken across multiple <w:t> tags
                    if (!variableReplaced && quoteType.name === 'HTML encoded') {
                        // Build a more comprehensive pattern for complex split variables
                        const variableParts = variable.split(/\s+/); // Split on whitespace
                        
                        if (variableParts.length > 1) {
                            // Create pattern that matches quotes, then looks for all parts of the variable with XML in between
                            let splitVariablePattern = this.escapeRegex(quoteType.open);
                            
                            // Add the first part
                            splitVariablePattern += `[^${this.escapeRegex(quoteType.close)}]*?` + this.escapeRegex(variableParts[0]);
                            
                            // Add patterns for remaining parts with XML tags in between
                            for (let i = 1; i < variableParts.length; i++) {
                                splitVariablePattern += `(?:<[^>]*>)*?[^${this.escapeRegex(quoteType.close)}]*?` + this.escapeRegex(variableParts[i]);
                            }
                            
                            // End with closing quote
                            splitVariablePattern += `[^${this.escapeRegex(quoteType.close)}]*?` + this.escapeRegex(quoteType.close);
                            
                            const advancedSplitPattern = new RegExp(splitVariablePattern, 'g');
                            const advancedSplitMatches = processedXml.match(advancedSplitPattern);
                            
                            if (advancedSplitMatches && advancedSplitMatches.length > 0) {
                                processedXml = processedXml.replace(advancedSplitPattern, value);
                                console.log(`✅ Advanced split-XML match "${variable}" (${quoteType.name}): ${advancedSplitMatches.length} occurrences`);
                                totalReplacements += advancedSplitMatches.length;
                                variableReplaced = true;
                                return;
                            }
                        }
                    }
                    
                    // Try pattern that allows for XML tags between quotes and text  
                    const flexiblePattern = new RegExp(
                        `${this.escapeRegex(quoteType.open)}([^${this.escapeRegex(quoteType.close)}]*?${this.escapeRegex(variable)}[^${this.escapeRegex(quoteType.close)}]*?)${this.escapeRegex(quoteType.close)}`,
                        'g'
                    );
                    
                    const flexibleMatches = processedXml.match(flexiblePattern);
                    if (flexibleMatches && flexibleMatches.length > 0) {
                        processedXml = processedXml.replace(flexiblePattern, (match, content) => {
                            // Only replace if the content actually contains our variable
                            if (content.includes(variable)) {
                                console.log(`✅ Flexible match "${variable}" (${quoteType.name}): 1 occurrence`);
                                totalReplacements++;
                                variableReplaced = true;
                                return value;
                            }
                            return match;
                        });
                    }
                    
                    // Try ultra-flexible pattern for variables split across XML elements
                    if (!variableReplaced) {
                        // Build pattern for variables that might be split across <w:t> tags
                        const splitPattern = new RegExp(
                            `${this.escapeRegex(quoteType.open)}[^${this.escapeRegex(quoteType.close)}]*?(?:<[^>]*>)*?[^${this.escapeRegex(quoteType.close)}]*?${this.escapeRegex(variable)}[^${this.escapeRegex(quoteType.close)}]*?(?:<[^>]*>)*?[^${this.escapeRegex(quoteType.close)}]*?${this.escapeRegex(quoteType.close)}`,
                            'g'
                        );
                        
                        const splitMatches = processedXml.match(splitPattern);
                        if (splitMatches && splitMatches.length > 0) {
                            processedXml = processedXml.replace(splitPattern, (match) => {
                                // Extract just the text content to check
                                const textContent = match.replace(/<[^>]*>/g, '');
                                if (textContent.includes(variable)) {
                                    console.log(`✅ Split-XML match "${variable}" (${quoteType.name}): 1 occurrence`);
                                    totalReplacements++;
                                    variableReplaced = true;
                                    return value;
                                }
                                return match;
                            });
                        }
                    }
                });
                
                if (!variableReplaced) {
                    console.log(`⚠️ Variable "${variable}" not found in template`);
                }
            });
            
            console.log(`✅ Total replacements made: ${totalReplacements}`);

            // Update the document XML in the zip
            zip.file('word/document.xml', processedXml);

            // Generate output
            const outputBuffer = await zip.generateAsync({ type: 'nodebuffer' });
            
            // Create creditor-specific filename
            const creditorName = (creditor.name || creditor.creditor_name || `Creditor_${creditorPosition}`)
                .replace(/[^a-zA-Z0-9\-_.]/g, '_');
            const filename = `Nullplan_${clientData.reference}_${creditorName}_${new Date().toISOString().split('T')[0]}.docx`;
            const outputPath = path.join(this.outputDir, filename);
            
            fs.writeFileSync(outputPath, outputBuffer);

            console.log(`✅ Individual Nullplan letter generated: ${filename}`);

            return {
                success: true,
                filename: filename,
                path: outputPath,
                size: outputBuffer.length,
                creditor_name: creditor.name || creditor.creditor_name,
                creditor_id: creditor.id || creditorPosition
            };

        } catch (error) {
            console.error('❌ Error generating Nullplan letter for creditor:', error);
            return {
                success: false,
                error: error.message,
                creditor_name: creditor.name || creditor.creditor_name
            };
        }
    }

    /**
     * Prepare creditor-specific variable replacements
     */
    prepareCreditorSpecificReplacements(clientData, creditor, creditorPosition, totalCreditors, totalDebt) {
        // Extract creditor data
        const creditorAmount = creditor.debt_amount || creditor.final_amount || creditor.amount || 0;
        const creditorQuote = totalDebt > 0 ? (creditorAmount / totalDebt) * 100 : 0;
        
        // Build creditor address
        const creditorAddress = creditor.address || 
            `${creditor.creditor_street || ''}, ${creditor.creditor_postal_code || ''} ${creditor.creditor_city || ''}`.trim() ||
            'Gläubiger Adresse';

        const replacements = {
            // Creditor-specific variables
            "Adresse des Creditors": creditorAddress,
            "Forderungssumme": this.formatGermanCurrency(creditorAmount),
            "Quote des Gläubigers": `${creditorQuote.toFixed(2).replace('.', ',')}`,
            "Forderungsnummer in der Forderungsliste": creditorPosition.toString(),
            
            // Client variables (same for all)
            "Name Mandant": clientData.fullName || `${clientData.firstName || ''} ${clientData.lastName || ''}`.trim() || 'Max Mustermann',
            "808080/TS-JK der Forderung": `${clientData.reference || clientData.aktenzeichen}/TS-JK`,
            "Gläuibgeranzahl": totalCreditors.toString(),
            "Schuldsumme Insgesamt": this.formatGermanCurrency(totalDebt),
            "Heutiges 9.10.2025": new Date().toLocaleDateString('de-DE'),
            "Geburtstag": clientData.birthDate || clientData.geburtstag || '01.01.1980',
            "ledig": this.getMaritalStatusText(clientData.maritalStatus || clientData.financial_data?.marital_status),
            "Mandant Name": clientData.fullName || `${clientData.firstName || ''} ${clientData.lastName || ''}`.trim() || 'Max Mustermann',
            "Einkommen": this.formatGermanCurrency(clientData.monthlyNetIncome || clientData.financial_data?.monthly_net_income || 0),
            "9.10.2025 in 14 Tagen": this.calculateDeadlineDate(),
            "new test 08": clientData.fullName || `${clientData.firstName || ''} ${clientData.lastName || ''}`.trim() || 'Max Mustermann',
            "Datum in 3 Monaten zum 1.": this.calculateStartDate()
        };

        console.log(`💼 Creditor ${creditorPosition}: ${creditor.name || creditor.creditor_name}`);
        console.log(`   Address: ${creditorAddress}`);
        console.log(`   Amount: ${replacements["Forderungssumme"]}`);
        console.log(`   Quote: ${replacements["Quote des Gläubigers"]}%`);

        return replacements;
    }

    /**
     * Get German marital status text
     */
    getMaritalStatusText(status) {
        const statusMap = {
            'verheiratet': 'verheiratet',
            'ledig': 'ledig', 
            'geschieden': 'geschieden',
            'verwitwet': 'verwitwet',
            'getrennt_lebend': 'getrennt lebend'
        };
        return statusMap[status] || 'ledig';
    }

    /**
     * Calculate deadline date (2 weeks from now)
     */
    calculateDeadlineDate() {
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + 14);
        return deadline.toLocaleDateString('de-DE');
    }

    /**
     * Calculate start date (3 months from now)
     */
    calculateStartDate() {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() + 3);
        return startDate.toLocaleDateString('de-DE');
    }

    /**
     * Format number as German currency
     */
    formatGermanCurrency(amount) {
        return new Intl.NumberFormat('de-DE', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    }

    /**
     * Escape special regex characters
     */
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

module.exports = NullplanCreditorLetterGenerator;