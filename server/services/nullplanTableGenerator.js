const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

/**
 * Nullplan Table Generator
 * Processes the Tabelle Nullplan Template.docx for quota-based Schuldenbereinigungsplan
 */
class NullplanTableGenerator {
    constructor() {
        this.templatePath = path.join(__dirname, '../templates/Tabelle Nullplan Template.docx');
        this.outputDir = path.join(__dirname, '../documents');
        
        // Create output directory if it doesn't exist
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    /**
     * Generate Nullplan quota table document
     */
    async generateNullplanTable(clientData, creditorData) {
        try {
            console.log('📊 Generating Nullplan quota table document...');
            
            if (!fs.existsSync(this.templatePath)) {
                throw new Error(`Nullplan table template not found: ${this.templatePath}`);
            }

            // Load the template
            const templateBuffer = fs.readFileSync(this.templatePath);
            const zip = await JSZip.loadAsync(templateBuffer);
            const documentXml = await zip.file('word/document.xml').async('string');

            console.log('📄 Template loaded, processing creditor data...');
            
            // Calculate quotas and prepare replacements
            const replacements = this.prepareTableReplacements(clientData, creditorData);
            
            console.log('🔄 Applying table replacements:', Object.keys(replacements).length, 'variables');

            // Replace variables in the document XML
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
            const filename = `Schuldenbereinigungsplan_${clientData?.aktenzeichen || clientData?.reference}_${new Date().toISOString().split('T')[0]}.docx`;
            const outputPath = path.join(this.outputDir, filename);
            
            fs.writeFileSync(outputPath, outputBuffer);

            console.log('✅ Nullplan table document generated successfully');
            console.log(`📁 File: ${filename} (${Math.round(outputBuffer.length / 1024)} KB)`);

            return {
                success: true,
                filename: filename,
                path: outputPath,
                size: outputBuffer.length
            };

        } catch (error) {
            console.error('❌ Error generating Nullplan table:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Prepare all table replacements with quota calculations
     */
    prepareTableReplacements(clientData, creditorData) {
        // Calculate total debt
        const totalDebt = creditorData.reduce((sum, creditor) => {
            return sum + (creditor.debt_amount || creditor.final_amount || creditor.amount || 0);
        }, 0);

        console.log(`💰 Total debt: ${this.formatGermanCurrency(totalDebt)} from ${creditorData.length} creditors`);

        // EXACT variables from Nullplan table template analysis - only 3 variables exist!
        const replacements = {
            "Heutiges Datum": new Date().toLocaleDateString('de-DE'),
            "Name Mandant": clientData.fullName || `${clientData.firstName || ''} ${clientData.lastName || ''}`.trim() || 'Max Mustermann',
            "Datum in 3 Monaten": this.calculateStartDate()
        };

        // Note: This template doesn't have individual creditor fields like "Gläubiger 1", "Forderung 1", etc.
        // It's a simple table template with just basic header information

        return replacements;
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
     * Format number as German currency without symbol
     */
    formatGermanCurrency(amount) {
        return new Intl.NumberFormat('de-DE', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount) + ' €';
    }

    /**
     * Escape special regex characters
     */
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

module.exports = NullplanTableGenerator;