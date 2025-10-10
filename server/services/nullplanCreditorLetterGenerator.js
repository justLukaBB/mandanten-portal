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
                    
                    const quotedVariable = `${quoteType.open}${variable}${quoteType.close}`;
                    
                    // Try exact match first (safest)
                    const exactPattern = new RegExp(this.escapeRegex(quotedVariable), 'g');
                    const exactMatches = (processedXml.match(exactPattern) || []).length;
                    if (exactMatches > 0) {
                        processedXml = processedXml.replace(exactPattern, value);
                        console.log(`✅ Exact match "${variable}" (${quoteType.name}): ${exactMatches} occurrences`);
                        totalReplacements += exactMatches;
                        variableReplaced = true;
                        return;
                    }
                    
                    // Simple flexible pattern (conservative approach)
                    // Only allows whitespace and basic characters between quotes and variable
                    const simpleFlexiblePattern = new RegExp(
                        `${this.escapeRegex(quoteType.open)}\\s*${this.escapeRegex(variable)}\\s*${this.escapeRegex(quoteType.close)}`,
                        'g'
                    );
                    
                    const simpleMatches = (processedXml.match(simpleFlexiblePattern) || []).length;
                    if (simpleMatches > 0) {
                        processedXml = processedXml.replace(simpleFlexiblePattern, value);
                        console.log(`✅ Simple flexible match "${variable}" (${quoteType.name}): ${simpleMatches} occurrences`);
                        totalReplacements += simpleMatches;
                        variableReplaced = true;
                        return;
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