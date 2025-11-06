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
            
            // First, check and fix the salutation paragraph itself for w:after spacing
            console.log(`   🔍 Checking salutation paragraph for spacing issues...`);
            const salutationPara = paragraphs[salutationParagraphIndex];
            const salutationPPrMatch = salutationPara.fullMatch.match(/<w:pPr[^>]*>([\s\S]*?)<\/w:pPr>/);
            
            let spacingFixed = false;
            const replacements = []; // Store all replacements to apply at once
            
            if (salutationPPrMatch) {
                const salutationPPrContent = salutationPPrMatch[1];
                console.log(`   📝 Salutation paragraph pPr XML: ${salutationPPrMatch[0].substring(0, 400)}...`);
                
                // Check for w:after spacing in salutation paragraph
                const salutationAfterMatch = salutationPPrContent.match(/w:after="(\d+)"/);
                const salutationBeforeMatch = salutationPPrContent.match(/w:before="(\d+)"/);
                
                if (salutationAfterMatch) {
                    const afterValue = parseInt(salutationAfterMatch[1]);
                    console.log(`   ⚠️ Salutation paragraph has w:after="${afterValue}" twips`);
                    // Remove ANY w:after spacing from salutation (should be 0)
                    console.log(`   🔧 Removing w:after spacing from salutation paragraph (${afterValue} twips -> removed)`);
                    let updatedSalutationXml = salutationPara.fullMatch;
                    
                    // Check if spacing tag has other attributes
                    const spacingTagMatch = salutationPPrContent.match(/<w:spacing[^>]*>/);
                    if (spacingTagMatch) {
                        const spacingTag = spacingTagMatch[0];
                        // Remove w:after attribute
                        let updatedSpacingTag = spacingTag.replace(/\s*w:after="\d+"/, '');
                        // If spacing tag only had w:after, remove the entire tag
                        if (updatedSpacingTag === '<w:spacing>' || updatedSpacingTag === '<w:spacing/>') {
                            // Remove the entire spacing tag
                            updatedSalutationXml = updatedSalutationXml.replace(/<w:spacing[^>]*\/?>/, '');
                        } else {
                            // Replace the spacing tag with updated version
                            updatedSalutationXml = updatedSalutationXml.replace(spacingTag, updatedSpacingTag);
                        }
                    } else {
                        // Fallback: just remove w:after attribute
                        updatedSalutationXml = updatedSalutationXml.replace(/\s*w:after="\d+"/, '');
                    }
                    
                    replacements.push({
                        original: salutationPara.fullMatch,
                        updated: updatedSalutationXml
                    });
                    spacingFixed = true;
                } else {
                    console.log(`   ✅ Salutation paragraph has no w:after spacing`);
                }
                
                if (salutationBeforeMatch) {
                    const beforeValue = parseInt(salutationBeforeMatch[1]);
                    console.log(`   📝 Salutation paragraph has w:before="${beforeValue}" twips`);
                }
            } else {
                console.log(`   ℹ️ Salutation paragraph has no w:pPr`);
            }
            
            // Find the actual body text paragraph (not contact info)
            // Look for paragraphs containing body text indicators like "wird von uns", "geb. am", client name patterns
            console.log(`   🔍 Searching for body text paragraph after salutation...`);
            let bodyParagraphIndex = -1;
            const contactInfoKeywords = ['Telefon', 'Telefax', 'e-Mail', 'Öffnungszeiten', 'Bankverbindungen', 'Aktenzeichen', 'BLZ', 'Konto-Nr'];
            
            for (let i = salutationParagraphIndex + 1; i < paragraphs.length && i <= salutationParagraphIndex + 10; i++) {
                const para = paragraphs[i];
                const paraXml = para.fullMatch;
                
                // Extract text content
                const textMatches = paraXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
                const fullText = textMatches ? textMatches.map(m => {
                    const textMatch = m.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
                    return textMatch ? textMatch[1] : '';
                }).join('') : '';
                
                // Skip if it's contact info or empty
                const isContactInfo = contactInfoKeywords.some(keyword => fullText.includes(keyword));
                const isEmpty = !fullText.trim() || fullText.trim().length < 3;
                
                if (!isContactInfo && !isEmpty) {
                    // Check if it looks like body text (contains "wird von uns", "geb. am", or starts with client name pattern)
                    if (fullText.includes('wird von uns') || 
                        fullText.includes('geb. am') || 
                        fullText.includes('wohnhaft') ||
                        fullText.length > 50) { // Long paragraph likely body text
                        bodyParagraphIndex = i;
                        console.log(`   ✅ Found body text paragraph at index ${i}`);
                        console.log(`   📄 Body text (first 150 chars): "${fullText.substring(0, 150)}..."`);
                        break;
                    }
                }
            }
            
            // Check the body paragraph for excessive w:before spacing
            if (bodyParagraphIndex !== -1) {
                const bodyPara = paragraphs[bodyParagraphIndex];
                const bodyParaXml = bodyPara.fullMatch;
                let updatedBodyParaXml = bodyParaXml;
                
                const bodyPPrMatch = bodyParaXml.match(/<w:pPr[^>]*>([\s\S]*?)<\/w:pPr>/);
                
                if (bodyPPrMatch) {
                    const bodyPPrContent = bodyPPrMatch[1];
                    console.log(`   🔍 Body paragraph pPr XML: ${bodyPPrMatch[0].substring(0, 400)}...`);
                    
                    const bodyBeforeMatch = bodyPPrContent.match(/w:before="(\d+)"/);
                    if (bodyBeforeMatch) {
                        const beforeValue = parseInt(bodyBeforeMatch[1]);
                        console.log(`   ⚠️ Body paragraph has w:before="${beforeValue}" twips`);
                        // Lower threshold - anything over 100 twips (~7 points) is excessive for body text after salutation
                        if (beforeValue > 100) {
                            console.log(`   🔧 Reducing w:before spacing on body paragraph (${beforeValue} twips -> 0)`);
                            updatedBodyParaXml = updatedBodyParaXml.replace(/w:before="\d+"/, 'w:before="0"');
                            replacements.push({
                                original: bodyParaXml,
                                updated: updatedBodyParaXml
                            });
                            spacingFixed = true;
                        }
                    }
                }
            } else {
                console.log(`   ⚠️ Could not find body text paragraph, checking next few paragraphs...`);
                
                // Fallback: check next few paragraphs for spacing issues
                const paragraphsToCheck = Math.min(5, paragraphs.length - salutationParagraphIndex - 1);
                for (let i = 1; i <= paragraphsToCheck; i++) {
                    const paraIndex = salutationParagraphIndex + i;
                    if (paraIndex >= paragraphs.length) break;
                    
                    const para = paragraphs[paraIndex];
                    const paraXml = para.fullMatch;
                    let updatedParaXml = paraXml;
                    
                    // Extract text to see what paragraph this is
                    const textMatches = paraXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
                    const fullText = textMatches ? textMatches.map(m => {
                        const textMatch = m.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
                        return textMatch ? textMatch[1] : '';
                    }).join('') : '';
                    
                    console.log(`   📄 Paragraph ${paraIndex} (first 100 chars): "${fullText.substring(0, 100)}..."`);
                    
                    // Check for paragraph properties with spacing
                    const pPrMatch = paraXml.match(/<w:pPr[^>]*>([\s\S]*?)<\/w:pPr>/);
                    
                    if (pPrMatch) {
                        const pPrContent = pPrMatch[1];
                        const beforeMatch = pPrContent.match(/w:before="(\d+)"/);
                        
                        if (beforeMatch) {
                            const beforeValue = parseInt(beforeMatch[1]);
                            // Lower threshold - anything over 100 twips is excessive
                            if (beforeValue > 100) {
                                console.log(`   🔧 Reducing w:before spacing on paragraph ${paraIndex} (${beforeValue} twips -> 0)`);
                                updatedParaXml = updatedParaXml.replace(/w:before="\d+"/, 'w:before="0"');
                                replacements.push({
                                    original: paraXml,
                                    updated: updatedParaXml
                                });
                                spacingFixed = true;
                            }
                        }
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
            
            // Add console log to identify the salutation line
            console.log(`   📍 SALUTATION LINE IDENTIFIED:`);
            console.log(`      Paragraph Index: ${salutationParagraphIndex}`);
            console.log(`      Full XML (first 500 chars): ${salutationPara.fullMatch.substring(0, 500)}...`);
            
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