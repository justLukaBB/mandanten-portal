const fs = require('fs').promises;
const path = require('path');
const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');
const { formatAddress } = require('../utils/addressFormatter');

/**
 * First Round Document Generator
 * Generates individual DOCX files for each creditor using the template
 */
class FirstRoundDocumentGenerator {
    constructor() {
        this.templatePath = path.join(__dirname, '../templates/1.Schreiben.docx');
        this.outputDir = path.join(__dirname, '../generated_documents/first_round');
    }

    /**
     * Generate DOCX files for all creditors
     */
    async generateCreditorDocuments(clientData, creditors) {
        try {
            console.log(`📄 Generating first round documents for ${creditors.length} creditors...`);

            // Ensure output directory exists
            await this.ensureOutputDirectory();

            const results = [];
            const errors = [];

            for (let i = 0; i < creditors.length; i++) {
                const creditor = creditors[i];
                console.log(`   Processing ${i + 1}/${creditors.length}: ${creditor.creditor_name || creditor.sender_name}`);

                try {
                    const result = await this.generateSingleCreditorDocument(clientData, creditor);
                    results.push(result);
                } catch (error) {
                    console.error(`❌ Failed to generate document for ${creditor.creditor_name || creditor.sender_name}: ${error.message}`);
                    errors.push({
                        creditor: creditor.creditor_name || creditor.sender_name,
                        error: error.message
                    });
                }
            }

            console.log(`✅ Generated ${results.length}/${creditors.length} documents successfully`);
            if (errors.length > 0) {
                console.log(`❌ ${errors.length} documents failed to generate`);
            }

            return {
                success: true,
                documents: results,
                errors: errors,
                total_generated: results.length,
                total_failed: errors.length
            };

        } catch (error) {
            console.error(`❌ Error in generateCreditorDocuments: ${error.message}`);
            return {
                success: false,
                error: error.message,
                documents: [],
                errors: []
            };
        }
    }

    /**
     * Generate a single DOCX document for one creditor
     */
    async generateSingleCreditorDocument(clientData, creditor) {
        try {
            // Read the template file
            const templateContent = await fs.readFile(this.templatePath);
            const zip = new PizZip(templateContent);
            const doc = new Docxtemplater(zip, {
                paragraphLoop: true,
                linebreaks: true,
                delimiters: {
                    start: '"',
                    end: '"'
                }
            });

            // Prepare the data for replacement
            const templateData = this.prepareTemplateData(clientData, creditor);

            // Render the document with the data
            doc.render(templateData);

            // Fix German hyphenation issues in the rendered document
            this.fixDocumentHyphenation(doc);

            // Fix excessive spacing issues in the rendered document
            this.fixDocumentSpacing(doc);

            // Generate the output buffer
            const outputBuffer = doc.getZip().generate({
                type: 'nodebuffer',
                compression: 'DEFLATE',
            });

            // Generate filename
            const creditorName = (creditor.creditor_name || creditor.sender_name || 'UnknownCreditor')
                .replace(/[^a-zA-Z0-9äöüßÄÖÜ\s-]/g, '') // Remove special characters
                .replace(/\s+/g, '_') // Replace spaces with underscores
                .substring(0, 50); // Limit length

            const filename = `${clientData.reference}_${creditorName}_Erstschreiben.docx`;
            const outputPath = path.join(this.outputDir, filename);

            // Save the file
            await fs.writeFile(outputPath, outputBuffer);

            const stats = await fs.stat(outputPath);

            return {
                success: true,
                creditor_name: creditor.creditor_name || creditor.sender_name,
                creditor_id: creditor.id,
                filename: filename,
                path: outputPath,
                size: stats.size,
                generated_at: new Date().toISOString()
            };

        } catch (error) {
            console.error(`❌ Error generating document for creditor: ${error.message}`);
            throw error;
        }
    }

    /**
     * Fix German hyphenation issues in the rendered Word document
     */
    fixDocumentHyphenation(doc) {
        try {
            // Get the document XML
            const zip = doc.getZip();
            let documentXml = zip.files['word/document.xml'].asText();
            
            // Define hyphenation fixes
            const hyphenationFixes = {
                'Eini-gungsversuchs': 'Einigungsversuchs',
                'Eini- gungsversuchs': 'Einigungsversuchs', 
                'die-sem': 'diesem',
                'die- sem': 'diesem',
                'Da-ten': 'Daten',
                'Da- ten': 'Daten',
                'gebe-ten': 'gebeten',
                'gebe- ten': 'gebeten',
                'Ange-le-genheit': 'Angelegenheit',
                'Ange- le- genheit': 'Angelegenheit',
                'Her-ausrechnung': 'Herausrechnung',
                'Her- ausrechnung': 'Herausrechnung',
                'Vollstreckungsmaß-nahmen': 'Vollstreckungsmaßnahmen',
                'Vollstreckungsmaß- nahmen': 'Vollstreckungsmaßnahmen',
                'Verbraucherinsolvenz-verfahrens': 'Verbraucherinsolvenzverfahrens',
                'Verbraucherinsolvenz- verfahrens': 'Verbraucherinsolvenzverfahrens',
                'Schuldnerin/Der': 'Schuldnerin/den',
                'Schuldner/in': 'Schuldner/die Schuldnerin'
            };
            
            // Apply fixes
            for (const [broken, fixed] of Object.entries(hyphenationFixes)) {
                const regex = new RegExp(broken.replace(/[-\s]/g, '[-\\s]*'), 'gi');
                documentXml = documentXml.replace(regex, fixed);
            }
            
            // Update the document XML
            zip.file('word/document.xml', documentXml);
            
            console.log('✅ Fixed German hyphenation issues in document');
            
        } catch (error) {
            console.error('⚠️ Warning: Could not fix hyphenation issues:', error.message);
            // Don't throw error - document generation should continue
        }
    }

    /**
     * Fix excessive spacing issues in the rendered Word document
     * Specifically targets spacing after "Sehr geehrte Damen und Herren,"
     */
    fixDocumentSpacing(doc) {
        try {
            // Get the document XML
            const zip = doc.getZip();
            let documentXml = zip.files['word/document.xml'].asText();
            
            console.log('🔍 Analyzing document XML for spacing issues...');
            
            // Find all paragraphs in the document
            const paragraphRegex = /<w:p[^>]*>([\s\S]*?)<\/w:p>/g;
            const paragraphs = [];
            let match;
            
            while ((match = paragraphRegex.exec(documentXml)) !== null) {
                paragraphs.push({
                    fullMatch: match[0],
                    content: match[1],
                    index: match.index
                });
            }
            
            console.log(`   Found ${paragraphs.length} paragraphs in document`);
            
            // Find the paragraph containing "Sehr geehrte Damen und Herren,"
            let salutationParagraphIndex = -1;
            for (let i = 0; i < paragraphs.length; i++) {
                const paraContent = paragraphs[i].content;
                // Extract text content from XML
                const textMatches = paraContent.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
                if (textMatches) {
                    const fullText = textMatches.map(m => {
                        const textMatch = m.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
                        return textMatch ? textMatch[1] : '';
                    }).join('');
                    
                    if (fullText.includes('Sehr geehrte Damen und Herren')) {
                        salutationParagraphIndex = i;
                        console.log(`   ✅ Found salutation paragraph at index ${i}`);
                        console.log(`   📝 Paragraph XML (first 300 chars): ${paragraphs[i].fullMatch.substring(0, 300)}...`);
                        break;
                    }
                }
            }
            
            if (salutationParagraphIndex === -1) {
                console.log('   ⚠️ Could not find salutation paragraph');
                return;
            }
            
            // Check the next few paragraphs after the salutation for excessive spacing
            const paragraphsToCheck = Math.min(3, paragraphs.length - salutationParagraphIndex - 1);
            console.log(`   🔍 Checking ${paragraphsToCheck} paragraphs after salutation for spacing issues...`);
            
            let spacingFixed = false;
            const replacements = []; // Store all replacements to apply at once
            
            for (let i = 1; i <= paragraphsToCheck; i++) {
                const paraIndex = salutationParagraphIndex + i;
                if (paraIndex >= paragraphs.length) break;
                
                const para = paragraphs[paraIndex];
                const paraXml = para.fullMatch;
                let updatedParaXml = paraXml; // Track updates to this paragraph
                
                // Extract text to see what paragraph this is
                const textMatches = paraXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
                const fullText = textMatches ? textMatches.map(m => {
                    const textMatch = m.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
                    return textMatch ? textMatch[1] : '';
                }).join('') : '';
                
                console.log(`   📄 Paragraph ${paraIndex} (first 100 chars of text): "${fullText.substring(0, 100)}..."`);
                
                // Check for paragraph properties with spacing
                const pPrMatch = paraXml.match(/<w:pPr[^>]*>([\s\S]*?)<\/w:pPr>/);
                
                if (pPrMatch) {
                    const pPrContent = pPrMatch[1];
                    console.log(`   🔍 Found w:pPr in paragraph ${paraIndex}`);
                    console.log(`      pPr XML: ${pPrMatch[0].substring(0, 400)}...`);
                    
                    // Check for spacing attributes
                    const spacingMatch = pPrContent.match(/<w:spacing[^>]*>/);
                    if (spacingMatch) {
                        console.log(`   ⚠️ Found w:spacing in paragraph ${paraIndex}`);
                        
                        // Extract spacing values
                        const beforeMatch = pPrContent.match(/w:before="(\d+)"/);
                        const afterMatch = pPrContent.match(/w:after="(\d+)"/);
                        const lineMatch = pPrContent.match(/w:line="(\d+)"/);
                        
                        if (beforeMatch) {
                            const beforeValue = parseInt(beforeMatch[1]);
                            console.log(`      w:before="${beforeValue}" twips`);
                            if (beforeValue > 200) { // More than ~14 points (200 twips = ~14pt)
                                console.log(`      🔧 Excessive before spacing detected (${beforeValue} twips), reducing to 0`);
                                updatedParaXml = updatedParaXml.replace(/w:before="\d+"/, 'w:before="0"');
                                spacingFixed = true;
                            }
                        }
                        
                        if (afterMatch) {
                            const afterValue = parseInt(afterMatch[1]);
                            console.log(`      w:after="${afterValue}" twips`);
                            if (afterValue > 200) { // More than ~14 points
                                console.log(`      🔧 Excessive after spacing detected (${afterValue} twips), reducing to 0`);
                                updatedParaXml = updatedParaXml.replace(/w:after="\d+"/, 'w:after="0"');
                                spacingFixed = true;
                            }
                        }
                        
                        // Store replacement if paragraph was modified
                        if (updatedParaXml !== paraXml) {
                            replacements.push({
                                original: paraXml,
                                updated: updatedParaXml
                            });
                        }
                        
                        if (lineMatch) {
                            const lineValue = parseInt(lineMatch[1]);
                            console.log(`      w:line="${lineValue}" (line spacing)`);
                        }
                    } else {
                        console.log(`      No w:spacing found in paragraph ${paraIndex}`);
                    }
                } else {
                    console.log(`   ℹ️ No w:pPr found in paragraph ${paraIndex}`);
                }
                
                // Also check if this is an empty paragraph that might be causing spacing
                if (!fullText.trim() && i === 1) {
                    console.log(`   ⚠️ Found empty paragraph immediately after salutation at index ${paraIndex}`);
                    console.log(`      Empty paragraph XML: ${paraXml.substring(0, 200)}...`);
                }
            }
            
            // Also check the salutation paragraph itself for excessive after spacing
            const salutationPara = paragraphs[salutationParagraphIndex];
            const salutationPPrMatch = salutationPara.fullMatch.match(/<w:pPr[^>]*>([\s\S]*?)<\/w:pPr>/);
            
            if (salutationPPrMatch) {
                const salutationPPrContent = salutationPPrMatch[1];
                const salutationAfterMatch = salutationPPrContent.match(/w:after="(\d+)"/);
                
                if (salutationAfterMatch) {
                    const afterValue = parseInt(salutationAfterMatch[1]);
                    console.log(`   🔍 Salutation paragraph w:after="${afterValue}" twips`);
                    if (afterValue > 200) {
                        console.log(`   🔧 Excessive after spacing in salutation paragraph (${afterValue} twips), reducing to 120`);
                        const updatedSalutationXml = salutationPara.fullMatch.replace(/w:after="\d+"/, 'w:after="120"');
                        replacements.push({
                            original: salutationPara.fullMatch,
                            updated: updatedSalutationXml
                        });
                        spacingFixed = true;
                    }
                }
            }
            
            // Remove empty paragraphs immediately after salutation if they exist
            if (salutationParagraphIndex + 1 < paragraphs.length) {
                const nextPara = paragraphs[salutationParagraphIndex + 1];
                const nextParaTextMatches = nextPara.content.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
                const nextParaText = nextParaTextMatches ? nextParaTextMatches.map(m => {
                    const textMatch = m.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
                    return textMatch ? textMatch[1] : '';
                }).join('') : '';
                
                // Check if it's an empty paragraph (only whitespace or very short)
                if (!nextParaText.trim() || nextParaText.trim().length < 3) {
                    console.log(`   🔧 Removing empty paragraph immediately after salutation`);
                    replacements.push({
                        original: nextPara.fullMatch,
                        updated: '' // Remove empty paragraph
                    });
                    spacingFixed = true;
                }
            }
            
            // Apply all replacements to document XML
            if (spacingFixed && replacements.length > 0) {
                console.log(`   🔧 Applying ${replacements.length} XML replacements...`);
                for (const replacement of replacements) {
                    if (replacement.updated === '') {
                        // Remove empty paragraph
                        documentXml = documentXml.replace(replacement.original, '');
                        console.log(`      ✅ Removed empty paragraph`);
                    } else {
                        // Replace paragraph with updated version
                        documentXml = documentXml.replace(replacement.original, replacement.updated);
                        console.log(`      ✅ Updated paragraph XML`);
                    }
                }
                
                // Update the document XML
                zip.file('word/document.xml', documentXml);
                console.log('✅ Fixed excessive spacing issues in document');
            } else {
                console.log('ℹ️ No excessive spacing issues found');
            }
            
        } catch (error) {
            console.error('⚠️ Warning: Could not fix spacing issues:', error.message);
            console.error('   Error stack:', error.stack);
            // Don't throw error - document generation should continue
        }
    }

    /**
     * Parse and format client address for proper line breaks
     */
    formatClientAddress(clientData) {
        // Priority 1: Use structured address fields if available
        if (clientData.street && clientData.zipCode && clientData.city) {
            const streetLine = clientData.houseNumber ?
                `${clientData.street} ${clientData.houseNumber}` :
                clientData.street;
            const address = `${streetLine} ${clientData.zipCode} ${clientData.city}`;
            return formatAddress(address);
        }

        // Priority 2: Use address string
        const address = clientData.address;
        if (!address) {
            return "Adresse nicht verfügbar";
        }

        // Use the shared formatAddress utility
        return formatAddress(address);
    }

    /**
     * Format creditor address using the same logic as client address
     */
    formatCreditorAddress(creditor) {
        const address = creditor.creditor_address ||
                       creditor.address ||
                       creditor.sender_address ||
                       null;

        if (!address) {
            return "Adresse nicht verfügbar";
        }

        return formatAddress(address);
    }

    /**
     * Prepare template data for Word document
     */
    prepareTemplateData(clientData, creditor) {
        const today = new Date();
        const responseDate = new Date();
        responseDate.setDate(today.getDate() + 14); // 14 days from today

        const formatGermanDate = (date) => {
            return date.toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        };

        return {
            // Creditor information
            "Adresse des Creditors": this.formatCreditorAddress(creditor),

            "Creditor": creditor.creditor_name || 
                creditor.sender_name || 
                "Unbekannter Gläubiger",
            
            "Aktenzeichen des Credtiors": creditor.reference_number ||
                creditor.creditor_reference || 
                creditor.reference || 
                creditor.aktenzeichen || 
                "Nicht verfügbar",

            // Client information
            "Name": clientData.name,
            "Geburtstag": clientData.birthdate || 
                clientData.dateOfBirth || 
                "Nicht verfügbar",
            "Adresse": this.formatClientAddress(clientData),
            "Aktenzeichen des Mandanten": clientData.reference,

            // Dates
            "heutiges Datum": formatGermanDate(today),
            "Datum in 14 Tagen": formatGermanDate(responseDate)
        };
    }

    /**
     * Ensure output directory exists
     */
    async ensureOutputDirectory() {
        try {
            await fs.access(this.outputDir);
        } catch (error) {
            // Directory doesn't exist, create it
            await fs.mkdir(this.outputDir, { recursive: true });
            console.log(`📁 Created output directory: ${this.outputDir}`);
        }
    }

    /**
     * Clean up old generated files (optional utility method)
     */
    async cleanupOldFiles(olderThanDays = 30) {
        try {
            const files = await fs.readdir(this.outputDir);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

            let deletedCount = 0;
            for (const file of files) {
                const filePath = path.join(this.outputDir, file);
                const stats = await fs.stat(filePath);
                
                if (stats.mtime < cutoffDate) {
                    await fs.unlink(filePath);
                    deletedCount++;
                }
            }

            if (deletedCount > 0) {
                console.log(`🗑️ Cleaned up ${deletedCount} old document files`);
            }

            return { deleted: deletedCount };
        } catch (error) {
            console.error(`❌ Error cleaning up old files: ${error.message}`);
            return { deleted: 0, error: error.message };
        }
    }
}

module.exports = FirstRoundDocumentGenerator;