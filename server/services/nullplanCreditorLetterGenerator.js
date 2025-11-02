const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { formatAddress } = require('../utils/addressFormatter');

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

            // Replace variables in the document XML - handling XML-split variables
            let processedXml = documentXml;
            let totalReplacements = 0;

            // First, handle the XML-split patterns identified in the template
            const xmlSplitPatterns = [
                {
                    variable: "Adresse des Creditors",
                    pattern: "&quot;Adresse</w:t></w:r><w:r><w:rPr><w:spacing w:val=\"-7\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr/><w:t>des</w:t></w:r><w:r><w:rPr><w:spacing w:val=\"-6\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:spacing w:val=\"-2\"/></w:rPr><w:t>Creditors&quot;",
                    value: replacements["Adresse des Creditors"]
                },
                {
                    variable: "Aktenzeichen der Forderung",
                    pattern: "&quot;Aktenzeichen der</w:t></w:r><w:r><w:rPr><w:spacing w:val=\"40\"/><w:sz w:val=\"22\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:sz w:val=\"22\"/></w:rPr><w:t>Forderung &quot;",
                    value: replacements["Aktenzeichen der Forderung"]
                },
                {
                    variable: "Heutiges Datum",
                    pattern: "&quot;Heutiges </w:t></w:r><w:r><w:rPr><w:spacing w:val=\"-2\"/><w:sz w:val=\"20\"/></w:rPr><w:t>Datum&quot;",
                    value: replacements["Heutiges Datum"]
                },
                {
                    variable: "Schuldsumme Insgesamt",
                    pattern: "&quot;Schuldsumme</w:t></w:r><w:r><w:rPr><w:spacing w:val=\"-3\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr/><w:t>Insgesamt&quot;",
                    value: replacements["Schuldsumme Insgesamt"]
                },
                {
                    variable: "Mandant Name",
                    pattern: "&quot;Mandant</w:t></w:r><w:r><w:rPr><w:spacing w:val=\"-1\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr/><w:t>Name&quot;",
                    value: replacements["Mandant Name"]
                },
                {
                    variable: "Datum in 14 Tagen",
                    pattern: "&quot;Datum</w:t></w:r><w:r><w:rPr><w:spacing w:val=\"-5\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr/><w:t>in</w:t></w:r><w:r><w:rPr><w:spacing w:val=\"-5\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr/><w:t>14</w:t></w:r><w:r><w:rPr><w:spacing w:val=\"-5\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:spacing w:val=\"-2\"/></w:rPr><w:t>Tagen&quot;",
                    value: replacements["Datum in 14 Tagen"]
                }
            ];

            // Apply XML-split pattern replacements
            xmlSplitPatterns.forEach(({ variable, pattern, value }) => {
                if (processedXml.includes(pattern)) {
                    processedXml = processedXml.replace(pattern, value);
                    console.log(`✅ XML-split pattern replaced: "${variable}"`);
                    totalReplacements++;
                } else {
                    console.log(`⚠️ XML-split pattern not found: "${variable}"`);
                }
            });

            // Then handle simple quoted variables that aren't XML-split
            const simpleVariables = [
                "Name Mandant",
                "Forderungssumme", 
                "Quote des Gläubigers",
                "Forderungsnummer in der Forderungsliste",
                "Gläubigeranzahl",
                "Einkommen",
                "Geburtstag",
                "Familienstand"
            ];

            simpleVariables.forEach(variable => {
                if (replacements[variable]) {
                    const quotedVariable = `&quot;${variable}&quot;`;
                    if (processedXml.includes(quotedVariable)) {
                        processedXml = processedXml.replace(new RegExp(this.escapeRegex(quotedVariable), 'g'), replacements[variable]);
                        console.log(`✅ Simple variable replaced: "${variable}"`);
                        totalReplacements++;
                    } else {
                        console.log(`⚠️ Simple variable not found: "${variable}"`);
                    }
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
            
            // Get creditor reference for filename uniqueness
            const creditorRef = (creditor.reference_number || 
                               creditor.creditor_reference || 
                               creditor.reference || 
                               creditor.aktenzeichen || 
                               `REF_${creditorPosition}`)
                               .replace(/[^a-zA-Z0-9\-_.]/g, '_');
            
            // Always include creditor position to ensure uniqueness
            const filename = `Nullplan_${clientData.reference}_${creditorName}_${creditorRef}_${creditorPosition}_${new Date().toISOString().split('T')[0]}.docx`;
            const outputPath = path.join(this.outputDir, filename);
            
            fs.writeFileSync(outputPath, outputBuffer);

            console.log(`✅ Individual Nullplan letter generated: ${filename}`);

            return {
                success: true,
                filename: filename,
                path: outputPath,
                size: outputBuffer.length,
                creditor_name: creditor.name || creditor.creditor_name || creditor.sender_name || `Creditor_${creditorPosition}`,
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
        
        // Build creditor address - street on first line, PLZ and city on second line
        // Get raw address from creditor data
        let rawAddress = creditor.address ||
            `${creditor.creditor_street || ''} ${creditor.creditor_postal_code || ''} ${creditor.creditor_city || ''}`.trim() ||
            '';

        // Format address using utility (handles various input formats)
        // Then replace \n with Word XML line breaks for proper .docx formatting
        const formattedAddress = rawAddress ? formatAddress(rawAddress) : 'Gläubiger Adresse';
        const creditorAddress = formattedAddress.replace(/\n/g, '<w:br/>');

        const replacements = {
            // EXACT variables from template analysis
            "Adresse des Creditors": creditorAddress,
            "Forderungssumme": this.formatGermanCurrency(creditorAmount),
            "Quote des Gläubigers": `${creditorQuote.toFixed(2).replace('.', ',')}%`,
            "Forderungsnummer in der Forderungsliste": creditorPosition.toString(),
            "Aktenzeichen der Forderung": `${clientData.reference || clientData.aktenzeichen}/TS-JK`,
            "Schuldsumme Insgesamt": this.formatGermanCurrency(totalDebt),
            "Gläubigeranzahl": totalCreditors.toString(),
            
            // Client variables
            "Name Mandant": clientData.fullName || `${clientData.firstName || ''} ${clientData.lastName || ''}`.trim() || 'Max Mustermann',
            "Mandant Name": clientData.fullName || `${clientData.firstName || ''} ${clientData.lastName || ''}`.trim() || 'Max Mustermann',
            "Einkommen": this.formatGermanCurrency(clientData.monthlyNetIncome || clientData.financial_data?.monthly_net_income || 0),
            "Geburtstag": clientData.birthDate || clientData.geburtstag || '01.01.1980',
            "Familienstand": this.getMaritalStatusText(clientData.maritalStatus || clientData.financial_data?.marital_status),
            
            // Date variables
            "Heutiges Datum": new Date().toLocaleDateString('de-DE'),
            "Datum in 14 Tagen": this.calculateDeadlineDate()
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