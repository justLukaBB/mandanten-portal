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
}

module.exports = RobustNullplanTableGenerator;