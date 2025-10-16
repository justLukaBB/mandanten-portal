const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

/**
 * Robust Nullplan Table Generator
 * Uses exact XML patterns identified from template analysis
 */
class RobustNullplanTableGenerator {
    constructor() {
        this.templatePath = path.join(__dirname, '../templates/Nullplan_Table_Template_New.docx');
        this.outputDir = path.join(__dirname, '../documents');
        
        // Create output directory if it doesn't exist
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }

        // Template mappings for literal text replacement
        this.templateMapping = {
            // Replace hardcoded client name
            "okla test": "CLIENT_NAME",
            // Replace hardcoded date
            "16.10.2025": "TODAY_DATE",
            // Replace hardcoded start date
            "16.1.2026": "START_DATE"
        };
    }

    /**
     * Generate Nullplan quota table document using robust pattern matching
     */
    async generateNullplanTable(clientData, creditorData) {
        try {
            console.log('📊 [ROBUST] Generating Nullplan quota table document...');
            
            if (!fs.existsSync(this.templatePath)) {
                throw new Error(`Nullplan table template not found: ${this.templatePath}`);
            }

            // Load the template
            const templateBuffer = fs.readFileSync(this.templatePath);
            const zip = await JSZip.loadAsync(templateBuffer);
            const documentXml = await zip.file('word/document.xml').async('string');

            console.log('📄 [ROBUST] Template loaded, processing data...');
            
            // Calculate quotas and prepare replacements
            const replacements = this.prepareTableReplacements(clientData, creditorData);
            
            console.log(`🔄 [ROBUST] Applying table replacements: ${Object.keys(replacements).length} variables`);

            // Replace variables in the document XML using robust pattern matching
            let processedXml = documentXml;
            let totalReplacements = 0;

            // Apply literal text replacements
            Object.entries(this.templateMapping).forEach(([oldText, placeholder]) => {
                if (processedXml.includes(`<w:t>${oldText}</w:t>`)) {
                    let newText = '';
                    switch(placeholder) {
                        case 'CLIENT_NAME':
                            newText = clientData.fullName || `${clientData.firstName || ''} ${clientData.lastName || ''}`.trim() || 'Max Mustermann';
                            break;
                        case 'TODAY_DATE':
                            newText = new Date().toLocaleDateString('de-DE');
                            break;
                        case 'START_DATE':
                            const startDate = new Date();
                            startDate.setMonth(startDate.getMonth() + 3);
                            newText = startDate.toLocaleDateString('de-DE');
                            break;
                        default:
                            newText = oldText;
                    }
                    processedXml = processedXml.replace(`<w:t>${oldText}</w:t>`, `<w:t>${newText}</w:t>`);
                    console.log(`✅ [ROBUST] Literal text replaced: "${oldText}" → "${newText}"`);
                    totalReplacements++;
                } else {
                    console.log(`⚠️ [ROBUST] Literal text not found: "${oldText}"`);
                }
            });
            
            console.log(`✅ [ROBUST] Total replacements made: ${totalReplacements}`);
            
            // Also replace simple quoted variables (for creditor data)
            Object.entries(replacements).forEach(([variable, value]) => {
                // Skip already processed XML-split patterns
                if (!this.templateMapping[variable]) {
                    const quotedVariable = `&quot;${variable}&quot;`;
                    if (processedXml.includes(quotedVariable)) {
                        processedXml = processedXml.replace(new RegExp(this.escapeRegex(quotedVariable), 'g'), value);
                        console.log(`✅ [ROBUST] Simple variable replaced: "${variable}"`);
                        totalReplacements++;
                    }
                }
            });
            
            console.log(`✅ [ROBUST] Total replacements after simple variables: ${totalReplacements}`);
            
            // Always populate table rows with creditor data for new template
            console.log('🔄 [ROBUST] Populating table rows with creditor data...');
            processedXml = this.populateTableRows(processedXml, creditorData);

            // Update the document XML in the zip
            zip.file('word/document.xml', processedXml);

            // Generate output
            const outputBuffer = await zip.generateAsync({ type: 'nodebuffer' });
            const filename = `Schuldenbereinigungsplan_${clientData?.aktenzeichen || clientData?.reference}_${new Date().toISOString().split('T')[0]}.docx`;
            const outputPath = path.join(this.outputDir, filename);
            
            fs.writeFileSync(outputPath, outputBuffer);

            console.log('✅ [ROBUST] Nullplan table document generated successfully');
            console.log(`📁 File: ${filename} (${Math.round(outputBuffer.length / 1024)} KB)`);

            return {
                success: true,
                filename: filename,
                path: outputPath,
                size: outputBuffer.length
            };

        } catch (error) {
            console.error('❌ [ROBUST] Error generating Nullplan table:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Prepare all table replacements with robust data handling
     */
    prepareTableReplacements(clientData, creditorData) {
        // Calculate total debt
        const totalDebt = creditorData.reduce((sum, creditor) => {
            return sum + (creditor.debt_amount || creditor.final_amount || creditor.amount || 0);
        }, 0);

        console.log(`💰 [ROBUST] Total debt: ${this.formatGermanCurrency(totalDebt)} from ${creditorData.length} creditors`);

        // Client name
        const clientName = clientData.fullName || `${clientData.firstName || ''} ${clientData.lastName || ''}`.trim() || 'Max Mustermann';

        // Replacements for the new template - will be handled by populateTableRows
        const replacements = {};

        console.log('📋 [ROBUST] Table replacements prepared:');
        Object.entries(replacements).forEach(([key, value]) => {
            console.log(`   "${key}" → "${value}"`);
        });

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
     * Format number as German currency without symbol (for table cells)
     */
    formatGermanCurrencyNoSymbol(amount) {
        return new Intl.NumberFormat('de-DE', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    }
    
    /**
     * Populate table rows with creditor data dynamically
     */
    populateTableRows(documentXml, creditorData) {
        try {
            // Calculate total debt for quotas
            const totalDebt = creditorData.reduce((sum, creditor) => {
                return sum + (creditor.debt_amount || creditor.final_amount || creditor.amount || 0);
            }, 0);
            
            let result = documentXml;
            
            // Replace placeholder text "Test 1" with actual creditor data
            creditorData.forEach((creditor, index) => {
                const creditorNum = index + 1;
                const creditorName = creditor.creditor_name || creditor.name || creditor.sender_name || `Gläubiger ${creditorNum}`;
                const creditorAmount = creditor.debt_amount || creditor.final_amount || creditor.amount || 0;
                const creditorQuote = totalDebt > 0 ? (creditorAmount / totalDebt) * 100 : 0;
                
                // Replace "Test 1" placeholders for this creditor row
                // Each row has 3 "Test 1" occurrences for: creditor name, amount, quote
                
                // Find the pattern for this row number and replace the "Test 1" placeholders
                const rowPattern = new RegExp(`(<w:tr[^>]*>[\\s\\S]*?<w:t>${creditorNum}<\\/w:t>[\\s\\S]*?)<w:t>Test <\\/w:t>\\s*<w:t>1<\\/w:t>([\\s\\S]*?)<w:t>Test <\\/w:t>\\s*<w:t>1<\\/w:t>([\\s\\S]*?)<w:t>Test <\\/w:t>\\s*<w:t>1<\\/w:t>`);
                
                result = result.replace(rowPattern, `$1<w:t>${creditorName}</w:t>$2<w:t>${this.formatGermanCurrencyNoSymbol(creditorAmount)}</w:t>$3<w:t>${creditorQuote.toFixed(2).replace('.', ',')}%</w:t>`);
                
                console.log(`✓ [ROBUST] Populated row ${creditorNum}: ${creditorName} - ${this.formatGermanCurrencyNoSymbol(creditorAmount)} - ${creditorQuote.toFixed(2).replace('.', ',')}%`);
            });
            
            // Remove rows that weren't populated (rows beyond the number of creditors)
            for (let i = creditorData.length + 1; i <= 8; i++) {
                const emptyRowPattern = new RegExp(`<w:tr[^>]*>[\\s\\S]*?<w:t>${i}<\\/w:t>[\\s\\S]*?<\\/w:tr>`);
                result = result.replace(emptyRowPattern, '');
                console.log(`✓ [ROBUST] Removed empty row ${i}`);
            }
            
            console.log(`✓ [ROBUST] Successfully populated ${creditorData.length} creditor rows`);
            return result;
            
        } catch (error) {
            console.error('❌ [ROBUST] Error populating table rows:', error.message);
            return documentXml;
        }
    }
    
    /**
     * Escape special regex characters
     */
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

module.exports = RobustNullplanTableGenerator;