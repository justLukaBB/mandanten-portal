const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

/**
 * Robust Nullplan Template Processor
 * Uses exact XML patterns identified from template analysis
 */
class RobustNullplanProcessor {
    constructor() {
        this.templatePath = path.join(__dirname, '../templates/Nullplan_Text_Template.docx');
        this.outputDir = path.join(__dirname, '../documents');
        
        // Create output directory if it doesn't exist
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }

        // Load exact template mapping from analysis
        this.templateMapping = {
            "Adresse des Creditors": {
                "type": "xml-split",
                "pattern": "&quot;Adresse</w:t></w:r><w:r><w:rPr><w:spacing w:val=\"-7\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr/><w:t>des</w:t></w:r><w:r><w:rPr><w:spacing w:val=\"-6\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:spacing w:val=\"-2\"/></w:rPr><w:t>Creditors&quot;"
            },
            "Aktenzeichen der Forderung": {
                "type": "xml-split",
                "pattern": "&quot;Aktenzeichen der</w:t></w:r><w:r><w:rPr><w:spacing w:val=\"40\"/><w:sz w:val=\"22\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:sz w:val=\"22\"/></w:rPr><w:t>Forderung &quot;"
            },
            "Schuldsumme Insgesamt": {
                "type": "xml-split",
                "pattern": "&quot;Schuldsumme</w:t></w:r><w:r><w:rPr><w:spacing w:val=\"-3\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr/><w:t>Insgesamt&quot;"
            },
            "Heutiges Datum": {
                "type": "xml-split",
                "pattern": "&quot;Heutiges </w:t></w:r><w:r><w:rPr><w:spacing w:val=\"-2\"/><w:sz w:val=\"20\"/></w:rPr><w:t>Datum&quot;"
            },
            "Mandant Name": {
                "type": "xml-split",
                "pattern": "&quot;Mandant</w:t></w:r><w:r><w:rPr><w:spacing w:val=\"-1\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr/><w:t>Name&quot;"
            },
            "Datum in 14 Tagen": {
                "type": "xml-split",
                "pattern": "&quot;Datum</w:t></w:r><w:r><w:rPr><w:spacing w:val=\"-5\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr/><w:t>in</w:t></w:r><w:r><w:rPr><w:spacing w:val=\"-5\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr/><w:t>14</w:t></w:r><w:r><w:rPr><w:spacing w:val=\"-5\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:spacing w:val=\"-2\"/></w:rPr><w:t>Tagen&quot;"
            }
        };

        // Simple variables that use standard quoted patterns
        this.simpleVariables = [
            "Name Mandant",
            "Forderungssumme", 
            "Quote des Gläubigers",
            "Forderungsnummer in der Forderungsliste",
            "Gläuibgeranzahl",
            "Einkommen",
            "Geburtstag",
            "Familienstand"
        ];
    }

    /**
     * Generate individual Nullplan letters for all creditors
     */
    async generateNullplanLettersForAllCreditors(clientData, allCreditors) {
        try {
            console.log(`📄 [ROBUST] Generating individual Nullplan letters for ${allCreditors.length} creditors...`);

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
                
                console.log(`📝 [ROBUST] Processing creditor ${creditorPosition}/${allCreditors.length}: ${creditor.name || creditor.creditor_name}`);
                
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
                    console.error(`❌ [ROBUST] Failed to generate letter for ${creditor.name}: ${letterResult.error}`);
                }
            }

            console.log(`✅ [ROBUST] Generated ${results.length}/${allCreditors.length} individual Nullplan letters`);

            return {
                success: true,
                documents: results,
                total_generated: results.length,
                total_creditors: allCreditors.length
            };

        } catch (error) {
            console.error('❌ [ROBUST] Error generating Nullplan letters:', error);
            return {
                success: false,
                error: error.message,
                documents: []
            };
        }
    }

    /**
     * Generate Nullplan letter for a single creditor using robust pattern matching
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
            
            console.log(`🔄 [ROBUST] Applying ${Object.keys(replacements).length} replacements for ${creditor.name || creditor.creditor_name}`);

            // Apply replacements using robust pattern matching
            let processedXml = documentXml;
            let totalReplacements = 0;

            // 1. First handle XML-split patterns with exact matches
            console.log('🎯 [ROBUST] Processing XML-split patterns...');
            Object.entries(this.templateMapping).forEach(([variable, mapping]) => {
                if (replacements[variable]) {
                    const pattern = mapping.pattern;
                    
                    if (processedXml.includes(pattern)) {
                        processedXml = processedXml.replace(pattern, replacements[variable]);
                        console.log(`✅ [ROBUST] XML-split pattern replaced: "${variable}"`);
                        totalReplacements++;
                    } else {
                        console.log(`⚠️ [ROBUST] XML-split pattern not found: "${variable}"`);
                        console.log(`   Expected pattern length: ${pattern.length}`);
                        console.log(`   Pattern start: ${pattern.substring(0, 50)}...`);
                    }
                }
            });

            // 2. Then handle simple quoted variables
            console.log('🎯 [ROBUST] Processing simple variables...');
            this.simpleVariables.forEach(variable => {
                if (replacements[variable]) {
                    const quotedVariable = `&quot;${variable}&quot;`;
                    
                    if (processedXml.includes(quotedVariable)) {
                        processedXml = processedXml.replace(new RegExp(this.escapeRegex(quotedVariable), 'g'), replacements[variable]);
                        console.log(`✅ [ROBUST] Simple variable replaced: "${variable}"`);
                        totalReplacements++;
                    } else {
                        console.log(`⚠️ [ROBUST] Simple variable not found: "${variable}"`);
                    }
                }
            });
            
            console.log(`✅ [ROBUST] Total replacements made: ${totalReplacements}`);

            // Update the document XML in the zip
            zip.file('word/document.xml', processedXml);

            // Generate output
            const outputBuffer = await zip.generateAsync({ type: 'nodebuffer' });
            
            // Create creditor-specific filename
            const creditorName = (creditor.name || creditor.creditor_name || `Creditor_${creditorPosition}`)
                .replace(/[^a-zA-Z0-9\-_.]/g, '_');
            const filename = `Nullplan_${clientData.reference || clientData.aktenzeichen}_${creditorName}_${new Date().toISOString().split('T')[0]}.docx`;
            const outputPath = path.join(this.outputDir, filename);
            
            fs.writeFileSync(outputPath, outputBuffer);

            console.log(`✅ [ROBUST] Individual Nullplan letter generated: ${filename}`);

            return {
                success: true,
                filename: filename,
                path: outputPath,
                size: outputBuffer.length,
                creditor_name: creditor.name || creditor.creditor_name || creditor.sender_name || `Creditor_${creditorPosition}`,
                creditor_id: creditor.id || creditorPosition
            };

        } catch (error) {
            console.error('❌ [ROBUST] Error generating Nullplan letter for creditor:', error);
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
            `${creditor.sender_street || ''}, ${creditor.sender_postal_code || ''} ${creditor.sender_city || ''}`.trim() ||
            'Gläubiger Adresse';

        // Client name
        const clientName = clientData.fullName || `${clientData.firstName || ''} ${clientData.lastName || ''}`.trim() || 'Max Mustermann';

        const replacements = {
            // XML-split variables (exact mapping)
            "Adresse des Creditors": creditorAddress,
            "Aktenzeichen der Forderung": `${clientData.reference || clientData.aktenzeichen}/TS-JK`,
            "Schuldsumme Insgesamt": this.formatGermanCurrency(totalDebt),
            "Heutiges Datum": new Date().toLocaleDateString('de-DE'),
            "Mandant Name": clientName,
            "Datum in 14 Tagen": this.calculateDeadlineDate(),
            
            // Simple variables
            "Name Mandant": clientName,
            "Forderungssumme": this.formatGermanCurrency(creditorAmount),
            "Quote des Gläubigers": `${creditorQuote.toFixed(2).replace('.', ',')}%`,
            "Forderungsnummer in der Forderungsliste": creditorPosition.toString(),
            "Gläuibgeranzahl": totalCreditors.toString(),
            "Einkommen": this.formatGermanCurrency(clientData.monthlyNetIncome || clientData.financial_data?.monthly_net_income || 0),
            "Geburtstag": clientData.birthDate || clientData.geburtstag || '01.01.1980',
            "Familienstand": this.getMaritalStatusText(clientData.maritalStatus || clientData.financial_data?.marital_status)
        };

        console.log(`💼 [ROBUST] Creditor ${creditorPosition}: ${creditor.name || creditor.creditor_name}`);
        console.log(`   Address: ${creditorAddress}`);
        console.log(`   Amount: ${replacements["Forderungssumme"]}`);
        console.log(`   Quote: ${replacements["Quote des Gläubigers"]}`);

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
            'getrennt_lebend': 'getrennt lebend',
            'married': 'verheiratet',
            'single': 'ledig',
            'divorced': 'geschieden',
            'widowed': 'verwitwet'
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

module.exports = RobustNullplanProcessor;