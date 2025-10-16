const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

/**
 * Robust Nullplan Table Generator
 * Uses exact XML patterns identified from template analysis
 */
class RobustNullplanTableGenerator {
    constructor() {
        this.templatePath = path.join(__dirname, '../templates/Tabelle Nullplan Template.docx');
        this.outputDir = path.join(__dirname, '../documents');
        
        // Create output directory if it doesn't exist
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }

        // Exact template mapping from analysis
        this.templateMapping = {
            "Heutiges Datum": {
                "type": "xml-split",
                "pattern": "&quot;Heutiges</w:t></w:r><w:r><w:rPr><w:spacing w:val=\"-1\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:spacing w:val=\"-2\"/></w:rPr><w:t>Datum&quot;"
            },
            "Name Mandant": {
                "type": "xml-split",
                "pattern": "&quot;Name</w:t></w:r><w:r><w:rPr><w:b/><w:spacing w:val=\"-11\"/><w:sz w:val=\"18\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:b/><w:spacing w:val=\"-2\"/><w:sz w:val=\"18\"/></w:rPr><w:t>Mandant&quot;"
            },
            "Datum in 3 Monaten": {
                "type": "xml-split",
                "pattern": "&quot;Datum</w:t></w:r><w:r><w:rPr><w:spacing w:val=\"3\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr/><w:t>in</w:t></w:r><w:r><w:rPr><w:spacing w:val=\"3\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr/><w:t>3</w:t></w:r><w:r><w:rPr><w:spacing w:val=\"4\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:spacing w:val=\"-2\"/></w:rPr><w:t>Monaten&quot;"
            }
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

            // Apply XML-split pattern replacements
            Object.entries(this.templateMapping).forEach(([variable, mapping]) => {
                if (replacements[variable]) {
                    const pattern = mapping.pattern;
                    
                    if (processedXml.includes(pattern)) {
                        processedXml = processedXml.replace(pattern, replacements[variable]);
                        console.log(`✅ [ROBUST] XML-split pattern replaced: "${variable}"`);
                        totalReplacements++;
                    } else {
                        console.log(`⚠️ [ROBUST] XML-split pattern not found: "${variable}"`);
                        console.log(`   Expected pattern: ${pattern.substring(0, 50)}...`);
                    }
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
            
            // If no creditor placeholders were found, try to populate table rows dynamically
            if (totalReplacements <= 3) {
                console.log('⚠️ [ROBUST] No creditor placeholders found, attempting dynamic table population...');
                processedXml = this.populateTableRows(processedXml, creditorData);
            }

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

        // EXACT variables from Nullplan table template analysis
        const replacements = {
            "Heutiges Datum": new Date().toLocaleDateString('de-DE'),
            "Name Mandant": clientName,
            "Datum in 3 Monaten": this.calculateStartDate()
        };
        
        // Add creditor-specific replacements for the table
        // The template should have placeholders like "Gläubiger 1", "Forderung 1", "Quote 1" etc.
        creditorData.forEach((creditor, index) => {
            const creditorNum = index + 1;
            const creditorName = creditor.creditor_name || creditor.name || creditor.sender_name || `Gläubiger ${creditorNum}`;
            const creditorAmount = creditor.debt_amount || creditor.final_amount || creditor.amount || 0;
            const creditorQuote = totalDebt > 0 ? (creditorAmount / totalDebt) * 100 : 0;
            
            // Add replacements for this creditor
            replacements[`Gläubiger ${creditorNum}`] = creditorName;
            replacements[`Forderung ${creditorNum}`] = this.formatGermanCurrencyNoSymbol(creditorAmount);
            replacements[`Quote ${creditorNum}`] = `${creditorQuote.toFixed(2).replace('.', ',')}%`;
        });

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
            // Find the first empty table row (usually starts with <w:tr> and has empty cells)
            // Look for a pattern that represents empty table cells
            const tableRowPattern = /(<w:tr[^>]*>.*?<w:tc[^>]*>.*?<w:p[^>]*>.*?<\/w:p>.*?<\/w:tc>.*?<w:tc[^>]*>.*?<w:p[^>]*>.*?<\/w:p>.*?<\/w:tc>.*?<w:tc[^>]*>.*?<w:p[^>]*>.*?<\/w:p>.*?<\/w:tc>.*?<\/w:tr>)/;
            
            const match = documentXml.match(tableRowPattern);
            if (!match) {
                console.log('⚠️ [ROBUST] Could not find table row pattern to populate');
                return documentXml;
            }
            
            const emptyRowTemplate = match[1];
            console.log('✓ [ROBUST] Found empty table row template');
            
            // Calculate total debt for quotas
            const totalDebt = creditorData.reduce((sum, creditor) => {
                return sum + (creditor.debt_amount || creditor.final_amount || creditor.amount || 0);
            }, 0);
            
            // Generate rows for each creditor
            let newRows = '';
            creditorData.forEach((creditor, index) => {
                const creditorNum = index + 1;
                const creditorName = creditor.creditor_name || creditor.name || creditor.sender_name || `Gläubiger ${creditorNum}`;
                const creditorAmount = creditor.debt_amount || creditor.final_amount || creditor.amount || 0;
                const creditorQuote = totalDebt > 0 ? (creditorAmount / totalDebt) * 100 : 0;
                
                // Create a row by replacing the empty row template with actual data
                let creditorRow = emptyRowTemplate;
                
                // Replace empty paragraphs with actual content
                // This is a simplified approach - we replace the first three empty paragraphs
                creditorRow = creditorRow.replace(/<w:p[^>]*><\/w:p>/, `<w:p><w:r><w:t>${creditorNum}</w:t></w:r></w:p>`);
                creditorRow = creditorRow.replace(/<w:p[^>]*><\/w:p>/, `<w:p><w:r><w:t>${creditorName}</w:t></w:r></w:p>`);
                creditorRow = creditorRow.replace(/<w:p[^>]*><\/w:p>/, `<w:p><w:r><w:t>${this.formatGermanCurrencyNoSymbol(creditorAmount)}</w:t></w:r></w:p>`);
                creditorRow = creditorRow.replace(/<w:p[^>]*><\/w:p>/, `<w:p><w:r><w:t>${creditorQuote.toFixed(2).replace('.', ',')}%</w:t></w:r></w:p>`);
                
                newRows += creditorRow;
            });
            
            // Replace the first empty row with all creditor rows
            const result = documentXml.replace(emptyRowTemplate, newRows);
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