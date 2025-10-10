const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

/**
 * New Word Template Processor for "Template Word Pfändbares Einkommen"
 * Built specifically for the exact variables found in the template
 */
class NewWordTemplateProcessor {
    constructor() {
        // Use relative path from server directory for production compatibility
        this.templatePath = path.join(__dirname, '../templates/Template-Word-Pfaendbares-Einkommen.docx');
        this.outputDir = path.join(__dirname, '../documents');
        
        // Create output directory if it doesn't exist
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    /**
     * Process the template with client and settlement data
     */
    async processTemplate(clientData, settlementData, creditorData = null) {
        try {
            console.log('🎯 Processing new Word template with identified variables (v3 - totalReplacements fix)...');
            console.log('📊 Input data:', {
                clientReference: clientData?.aktenzeichen || clientData?.reference,
                hasSettlementData: !!settlementData,
                hasCreditorData: !!creditorData,
                creditorCount: settlementData?.creditor_payments?.length || 0
            });

            // Check if template exists
            if (!fs.existsSync(this.templatePath)) {
                throw new Error(`Template not found: ${this.templatePath}`);
            }

            // Load the template
            const templateBuffer = fs.readFileSync(this.templatePath);
            const zip = await JSZip.loadAsync(templateBuffer);
            const documentXml = await zip.file('word/document.xml').async('string');

            console.log('📄 Template loaded, document XML length:', documentXml.length);
            
            // Run analysis to understand template structure
            await this.analyzeTemplate();

            // Prepare all variable replacements based on identified template variables
            const replacements = this.prepareVariableReplacements(clientData, settlementData, creditorData);

            console.log('🔄 Prepared replacements:', Object.keys(replacements).length, 'variables');

            // Replace variables in the document XML
            let processedXml = documentXml;

            // First, replace the complex split XML patterns with simple placeholders
            const splitXmlReplacements = [
                {
                    pattern: "&quot;Adresse</w:t></w:r><w:r><w:rPr><w:color w:val=\"101012\"/><w:spacing w:val=\"-7\"/><w:sz w:val=\"22\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val=\"101012\"/><w:spacing w:val=\"-6\"/><w:sz w:val=\"22\"/></w:rPr><w:t>des</w:t></w:r><w:r><w:rPr><w:color w:val=\"101012\"/><w:spacing w:val=\"-7\"/><w:sz w:val=\"22\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val=\"101012\"/><w:spacing w:val=\"-6\"/><w:sz w:val=\"22\"/></w:rPr><w:t>Creditors</w:t></w:r><w:r><w:rPr><w:color w:val=\"101012\"/><w:spacing w:val=\"-5\"/><w:sz w:val=\"22\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val=\"101012\"/><w:spacing w:val=\"-10\"/><w:sz w:val=\"22\"/></w:rPr><w:t>&quot;",
                    variable: "Adresse des Creditors",
                    placeholder: "CREDITOR_ADDRESS_PLACEHOLDER"
                },
                {
                    pattern: "&quot;Aktenzeichen</w:t></w:r><w:r><w:rPr><w:color w:val=\"0E1012\"/><w:spacing w:val=\"5\"/><w:sz w:val=\"22\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val=\"0E1012\"/><w:spacing w:val=\"-8\"/><w:sz w:val=\"22\"/></w:rPr><w:t>der</w:t></w:r><w:r><w:rPr><w:color w:val=\"0E1012\"/><w:spacing w:val=\"5\"/><w:sz w:val=\"22\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val=\"0E1012\"/><w:spacing w:val=\"-8\"/><w:sz w:val=\"22\"/></w:rPr><w:t>Forderung&quot;",
                    variable: "Aktenzeichen der Forderung",
                    placeholder: "CREDITOR_REFERENCE_PLACEHOLDER"
                },
                {
                    pattern: "&quot;Name</w:t></w:r><w:r><w:rPr><w:color w:val=\"121215\"/><w:spacing w:val=\"-12\"/><w:sz w:val=\"22\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val=\"121215\"/><w:spacing w:val=\"-4\"/><w:sz w:val=\"22\"/></w:rPr><w:t>des</w:t></w:r><w:r><w:rPr><w:color w:val=\"121215\"/><w:spacing w:val=\"-11\"/><w:sz w:val=\"22\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val=\"121215\"/><w:spacing w:val=\"-4\"/><w:sz w:val=\"22\"/></w:rPr><w:t>Mandanten&quot;",
                    variable: "Name des Mandanten",
                    placeholder: "CLIENT_NAME_PLACEHOLDER"
                },
                {
                    pattern: "&quot;Gessamtsumme</w:t></w:r><w:r><w:rPr><w:color w:val=\"121215\"/><w:spacing w:val=\"-16\"/><w:sz w:val=\"22\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val=\"121215\"/><w:spacing w:val=\"-2\"/><w:sz w:val=\"22\"/></w:rPr><w:t>Verschuldung&quot;",
                    variable: "Gessamtsumme Verschuldung",
                    placeholder: "TOTAL_DEBT_PLACEHOLDER"
                },
                {
                    pattern: "&quot;Heutiges </w:t></w:r><w:r><w:rPr><w:color w:val=\"1A1A1D\"/><w:spacing w:val=\"-2\"/></w:rPr><w:t>Datum&quot;",
                    variable: "Heutiges Datum",
                    placeholder: "TODAY_DATE_PLACEHOLDER"
                },
                {
                    pattern: "&quot;Aktenzeichen</w:t></w:r><w:r><w:rPr><w:rFonts w:ascii=\"Helvetica\"/><w:color w:val=\"0E0F11\"/><w:spacing w:val=\"-8\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:rFonts w:ascii=\"Helvetica\"/><w:color w:val=\"0E0F11\"/><w:spacing w:val=\"-6\"/></w:rPr><w:t>des </w:t></w:r><w:r><w:rPr><w:rFonts w:ascii=\"Helvetica\"/><w:color w:val=\"0E0F11\"/><w:spacing w:val=\"-2\"/></w:rPr><w:t>Mandanten&quot;",
                    variable: "Aktenzeichen des Mandanten",
                    placeholder: "CLIENT_REFERENCE_PLACEHOLDER"
                },
                {
                    pattern: "</w:t></w:r><w:r><w:rPr><w:rFonts w:ascii=\"Times New Roman\" w:hAnsi=\"Times New Roman\"/><w:i/><w:color w:val=\"101113\"/><w:sz w:val=\"22\"/></w:rPr><w:t>pfändbares Einkommen</w:t></w:r><w:r><w:rPr><w:i/><w:color w:val=\"101113\"/><w:sz w:val=\"22\"/></w:rPr><w:t>&quot;",
                    variable: "pfändbares Einkommen",
                    placeholder: "PFAENDBAR_INCOME_PLACEHOLDER"
                },
                {
                    pattern: "</w:t></w:r><w:r><w:rPr><w:rFonts w:ascii=\"Times New Roman\" w:hAnsi=\"Times New Roman\"/><w:i/><w:color w:val=\"0F1012\"/><w:sz w:val=\"22\"/></w:rPr><w:t>monatlicher pfändbarer</w:t></w:r><w:r><w:rPr><w:rFonts w:ascii=\"Times New Roman\" w:hAnsi=\"Times New Roman\"/><w:i/><w:color w:val=\"0F1012\"/><w:spacing w:val=\"40\"/><w:sz w:val=\"22\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:rFonts w:ascii=\"Times New Roman\" w:hAnsi=\"Times New Roman\"/><w:i/><w:color w:val=\"0F1012\"/><w:sz w:val=\"22\"/></w:rPr><w:t>Betrag</w:t></w:r><w:r><w:rPr><w:i/><w:color w:val=\"0F1012\"/><w:sz w:val=\"22\"/></w:rPr><w:t>&quot;",
                    variable: "monatlicher pfändbarer Betrag",
                    placeholder: "MONTHLY_PFAENDBAR_PLACEHOLDER"
                },
                {
                    pattern: "&quot;Summe</w:t></w:r><w:r><w:rPr><w:b/><w:color w:val=\"0F1012\"/><w:spacing w:val=\"-11\"/><w:sz w:val=\"22\"/><w:u w:val=\"thick\" w:color=\"0F1012\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:b/><w:color w:val=\"0F1012\"/><w:spacing w:val=\"-2\"/><w:sz w:val=\"22\"/><w:u w:val=\"thick\" w:color=\"0F1012\"/></w:rPr><w:t>für</w:t></w:r><w:r><w:rPr><w:b/><w:color w:val=\"0F1012\"/><w:spacing w:val=\"-11\"/><w:sz w:val=\"22\"/><w:u w:val=\"thick\" w:color=\"0F1012\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:b/><w:color w:val=\"0F1012\"/><w:spacing w:val=\"-2\"/><w:sz w:val=\"22\"/><w:u w:val=\"thick\" w:color=\"0F1012\"/></w:rPr><w:t>die</w:t></w:r><w:r><w:rPr><w:b/><w:color w:val=\"0F1012\"/><w:spacing w:val=\"-11\"/><w:sz w:val=\"22\"/><w:u w:val=\"thick\" w:color=\"0F1012\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:b/><w:color w:val=\"0F1012\"/><w:spacing w:val=\"-2\"/><w:sz w:val=\"22\"/><w:u w:val=\"thick\" w:color=\"0F1012\"/></w:rPr><w:t>Tilgung</w:t></w:r><w:r><w:rPr><w:b/><w:color w:val=\"0F1012\"/><w:spacing w:val=\"-11\"/><w:sz w:val=\"22\"/><w:u w:val=\"thick\" w:color=\"0F1012\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:b/><w:color w:val=\"0F1012\"/><w:spacing w:val=\"-2\"/><w:sz w:val=\"22\"/><w:u w:val=\"thick\" w:color=\"0F1012\"/></w:rPr><w:t>des</w:t></w:r><w:r><w:rPr><w:b/><w:color w:val=\"0F1012\"/><w:spacing w:val=\"-11\"/><w:sz w:val=\"22\"/><w:u w:val=\"thick\" w:color=\"0F1012\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:b/><w:color w:val=\"0F1012\"/><w:spacing w:val=\"-2\"/><w:sz w:val=\"22\"/><w:u w:val=\"thick\" w:color=\"0F1012\"/></w:rPr><w:t>Gläubigers</w:t></w:r><w:r><w:rPr><w:b/><w:color w:val=\"0F1012\"/><w:spacing w:val=\"-11\"/><w:sz w:val=\"22\"/><w:u w:val=\"thick\" w:color=\"0F1012\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:b/><w:color w:val=\"0F1012\"/><w:spacing w:val=\"-2\"/><w:sz w:val=\"22\"/><w:u w:val=\"thick\" w:color=\"0F1012\"/></w:rPr><w:t>monatlich&quot;",
                    variable: "Summe für die Tilgung des Gläubigers monatlich",
                    placeholder: "TOTAL_MONTHLY_PAYMENT_PLACEHOLDER"
                },
                {
                    pattern: "&quot;Nummer</w:t></w:r><w:r><w:rPr><w:color w:val=\"0F1012\"/><w:spacing w:val=\"-9\"/><w:sz w:val=\"22\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val=\"0F1012\"/><w:sz w:val=\"22\"/></w:rPr><w:t>im </w:t></w:r><w:r><w:rPr><w:color w:val=\"0F1012\"/><w:spacing w:val=\"-2\"/><w:sz w:val=\"22\"/></w:rPr><w:t>Schuldenbereinigungsplan&quot;",
                    variable: "Nummer im Schuldenbereinigungsplan",
                    placeholder: "PLAN_NUMBER_PLACEHOLDER"
                },
                {
                    pattern: "&quot;Datum</w:t></w:r><w:r><w:rPr><w:color w:val=\"0B0D10\"/><w:spacing w:val=\"-4\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val=\"0B0D10\"/><w:spacing w:val=\"-8\"/></w:rPr><w:t>in</w:t></w:r><w:r><w:rPr><w:color w:val=\"0B0D10\"/><w:spacing w:val=\"-3\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val=\"0B0D10\"/><w:spacing w:val=\"-8\"/></w:rPr><w:t>14</w:t></w:r><w:r><w:rPr><w:color w:val=\"0B0D10\"/><w:spacing w:val=\"-3\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val=\"0B0D10\"/><w:spacing w:val=\"-8\"/></w:rPr><w:t>Tagen&quot;",
                    variable: "Datum in 14 Tagen",
                    placeholder: "DEADLINE_DATE_PLACEHOLDER"
                }
            ];

            // Initialize totalReplacements counter
            let totalReplacements = 0;
            console.log('🔢 totalReplacements initialized to 0');

            splitXmlReplacements.forEach(({ pattern, variable, placeholder }) => {
                if (processedXml.includes(pattern)) {
                    const actualValue = replacements[variable] || placeholder;
                    processedXml = processedXml.replace(pattern, actualValue);
                    console.log(`✅ Replaced split XML pattern "${variable}" with "${actualValue}"`);
                    totalReplacements++;
                }
            });
            
            // Debug: Show what quoted text exists in the document
            console.log('🔍 Searching for quoted text patterns in document...');
            const debugPatterns = [
                /&quot;[^&]*?&quot;/g,
                /"[^"]*?"/g,
                /"[^"]*?"/g,
                /"[^"]*?"/g
            ];
            
            debugPatterns.forEach((pattern, index) => {
                const matches = documentXml.match(pattern);
                if (matches && matches.length > 0) {
                    console.log(`   Pattern ${index + 1} found ${matches.length} matches:`, matches.slice(0, 5));
                }
            });
            
            // Support multiple quote types found in Word documents - with XML handling
            const quoteTypes = [
                { name: 'HTML encoded', open: '&quot;', close: '&quot;' },
                { name: 'Regular', open: '"', close: '"' },
                { name: 'Curly left/right', open: '"', close: '"' },
                { name: 'Curly alternative', open: '"', close: '"' }
            ];

            // Variables that are handled by split-XML patterns - don't process them in regular replacement
            const splitXmlVariables = [
                "Adresse des Creditors",
                "Aktenzeichen der Forderung", 
                "Name des Mandanten",
                "Gessamtsumme Verschuldung",
                "Heutiges Datum",
                "Aktenzeichen des Mandanten",
                "pfändbares Einkommen",
                "monatlicher pfändbarer Betrag",
                "Summe für die Tilgung des Gläubigers monatlich",
                "Nummer im Schuldenbereinigungsplan",
                "Datum in 14 Tagen"
            ];

            Object.entries(replacements).forEach(([variable, value]) => {
                let variableReplaced = false;
                
                // Skip placeholder variables that were already replaced by split-XML patterns
                if (variable.includes('_PLACEHOLDER')) {
                    console.log(`✅ Skipping "${variable}" - already replaced by split-XML pattern`);
                    return;
                }
                
                // Skip variables that are handled by split-XML patterns
                if (splitXmlVariables.includes(variable)) {
                    console.log(`✅ Skipping "${variable}" - handled by split-XML pattern`);
                    return;
                }
                
                quoteTypes.forEach(quoteType => {
                    if (variableReplaced) return; // Skip if already replaced
                    
                    // Create more flexible pattern that handles XML structure
                    const quotedVariable = `${quoteType.open}${variable}${quoteType.close}`;
                    
                    // First try exact match
                    const simpleExactPattern = new RegExp(
                        this.escapeRegex(quotedVariable),
                        'g'
                    );
                    
                    const exactMatches = (processedXml.match(simpleExactPattern) || []).length;
                    if (exactMatches > 0) {
                        processedXml = processedXml.replace(simpleExactPattern, value);
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
                    
                    // TRY 1: Direct exact match for simple cases
                    const directExactPattern = new RegExp(this.escapeRegex(quoteType.open + variable + quoteType.close), 'g');
                    if (processedXml.includes(quoteType.open + variable + quoteType.close)) {
                        processedXml = processedXml.replace(directExactPattern, (match) => {
                            // Extra safety: check we're not in an XML attribute
                            const matchIndex = processedXml.indexOf(match);
                            const beforeMatch = processedXml.substring(Math.max(0, matchIndex - 100), matchIndex);
                            const afterMatch = processedXml.substring(matchIndex, Math.min(processedXml.length, matchIndex + 100));
                            
                            // Check if we're inside an XML tag (dangerous)
                            const lastOpen = beforeMatch.lastIndexOf('<');
                            const lastClose = beforeMatch.lastIndexOf('>');
                            
                            if (lastOpen > lastClose && !beforeMatch.includes('<w:t')) {
                                return match; // Skip - we're inside a non-text tag
                            }
                            
                            console.log(`✅ Exact match "${variable}" (${quoteType.name}): 1 occurrence`);
                            totalReplacements++;
                            variableReplaced = true;
                            return value;
                        });
                    }
                    
                    // TRY 2: Flexible pattern for variables split across XML elements
                    if (!variableReplaced) {
                        const flexiblePattern = new RegExp(
                            `${this.escapeRegex(quoteType.open)}([^${this.escapeRegex(quoteType.close)}]*?${this.escapeRegex(variable)}[^${this.escapeRegex(quoteType.close)}]*?)${this.escapeRegex(quoteType.close)}`,
                            'g'
                        );
                        
                        const matches = [];
                        let match;
                        const regex = new RegExp(flexiblePattern.source, flexiblePattern.flags);
                        
                        while ((match = regex.exec(processedXml)) !== null) {
                            matches.push({
                                match: match[0],
                                content: match[1],
                                index: match.index
                            });
                        }
                        
                        // Process matches in reverse order to avoid index shifting
                        matches.reverse().forEach(matchInfo => {
                            const { match: fullMatch, content, index } = matchInfo;
                            
                            if (content.includes(variable)) {
                                // SAFETY CHECK: Don't replace if this looks like it's inside an XML attribute
                                const beforeMatch = processedXml.substring(Math.max(0, index - 200), index);
                                const lastOpenBracket = beforeMatch.lastIndexOf('<');
                                const lastCloseBracket = beforeMatch.lastIndexOf('>');
                                
                                // Advanced check: look for attribute patterns like val="..."
                                const attributePattern = /\s+\w+\s*=\s*$/;
                                if (attributePattern.test(beforeMatch)) {
                                    return; // Skip - this looks like an attribute value
                                }
                                
                                // If we're inside a tag but it's a text tag, it's probably OK
                                if (lastOpenBracket > lastCloseBracket) {
                                    const tagContent = beforeMatch.substring(lastOpenBracket);
                                    if (!tagContent.includes('<w:t') && !tagContent.includes('</w:r>')) {
                                        return; // Skip - we're inside a non-text tag
                                    }
                                }
                                
                                console.log(`✅ Flexible match "${variable}" (${quoteType.name}): 1 occurrence`);
                                
                                // Replace this specific occurrence
                                processedXml = processedXml.substring(0, index) + 
                                              value + 
                                              processedXml.substring(index + fullMatch.length);
                                totalReplacements++;
                                variableReplaced = true;
                            }
                        });
                    }
                });
                
                if (!variableReplaced) {
                    console.log(`⚠️ Variable "${variable}" not found in document`);
                }
            });
            
            console.log(`✅ Total replacements made: ${totalReplacements}`);

            // Validate XML structure before saving to prevent corruption
            try {
                // Basic XML validation - check for unclosed tags
                const openTags = (processedXml.match(/<w:r>/g) || []).length;
                const closeTags = (processedXml.match(/<\/w:r>/g) || []).length;
                const openProps = (processedXml.match(/<w:rPr>/g) || []).length;
                const closeProps = (processedXml.match(/<\/w:rPr>/g) || []).length;
                
                if (openTags !== closeTags) {
                    console.warn(`⚠️ XML Warning: Mismatched <w:r> tags - ${openTags} open, ${closeTags} close`);
                }
                if (openProps !== closeProps) {
                    console.warn(`⚠️ XML Warning: Mismatched <w:rPr> tags - ${openProps} open, ${closeProps} close`);
                }
                
                // Quick XML syntax check
                if (processedXml.includes('<>') || processedXml.includes('</>')) {
                    throw new Error('Invalid XML syntax detected - empty tags found');
                }
                
                console.log(`✅ XML validation passed - document structure appears intact`);
            } catch (xmlError) {
                console.error(`❌ XML validation failed: ${xmlError.message}`);
                throw new Error(`Document XML is corrupted: ${xmlError.message}`);
            }

            // Update the document XML in the zip
            zip.file('word/document.xml', processedXml);

            // Generate output with proper Word document settings
            const outputBuffer = await zip.generateAsync({ 
                type: 'nodebuffer',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 },
                platform: 'DOS',  // Better compatibility with Microsoft Word
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            });
            
            // Create filename with creditor-specific info if available
            let filename;
            if (creditorData && creditorData.name) {
                const creditorName = creditorData.name.replace(/[^a-zA-Z0-9\-_.]/g, '_');
                const clientRef = clientData?.aktenzeichen || clientData?.reference;
                filename = `Pfaendbares-Einkommen_${clientRef}_${creditorName}_${Date.now()}.docx`;
            } else {
                filename = `Pfaendbares-Einkommen_${clientData?.aktenzeichen || clientData?.reference}_${Date.now()}.docx`;
            }
            const outputPath = path.join(this.outputDir, filename);

            // Save the file
            fs.writeFileSync(outputPath, outputBuffer);

            console.log('✅ New template processed successfully');
            console.log('📁 Output file:', filename);
            console.log('📏 File size:', Math.round(outputBuffer.length / 1024), 'KB');

            return {
                success: true,
                filename: filename,
                path: outputPath,
                size: outputBuffer.length,
                buffer: outputBuffer,
                replacements_made: Object.keys(replacements).length
            };

        } catch (error) {
            console.error('❌ Error processing new template:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Prepare all variable replacements based on the exact template variables identified
     */
    prepareVariableReplacements(clientData, settlementData, creditorData) {
        const replacements = {};

        // Extract basic client info
        const clientName = this.getClientName(clientData);
        const clientReference = clientData?.aktenzeichen || clientData?.reference || 'UNBEKANNT';
        
        // Calculate key financial values
        const totalDebt = settlementData?.total_debt || 0;
        const pfaendbarAmount = this.calculatePfaendbarAmount(clientData);
        const monthlyPayment = pfaendbarAmount;
        const creditorCount = settlementData?.creditor_payments?.length || 0;

        // Calculate payment start date (3 months from now, first of month)
        const paymentStartDate = new Date();
        paymentStartDate.setMonth(paymentStartDate.getMonth() + 3);
        paymentStartDate.setDate(1);

        // Calculate deadline (14 days from now)
        const deadlineDate = new Date();
        deadlineDate.setDate(deadlineDate.getDate() + 14);

        // Template Variables - based on actual template analysis
        // REAL VARIABLES from the document (not placeholders!)
        replacements["Adresse des Creditors"] = creditorData?.address || "Gläubiger Adresse";
        replacements["Name des Mandanten"] = clientName;
        replacements["Aktenzeichen der Forderung"] = creditorData?.aktenzeichen || "AZ-12345";
        replacements["Gessamtsumme Verschuldung"] = this.formatCurrency(totalDebt);
        replacements["Heutiges Datum"] = this.formatDate(new Date());
        replacements["Aktenzeichen des Mandanten"] = clientReference;
        replacements["pfändbares Einkommen"] = this.formatCurrency(pfaendbarAmount);
        replacements["monatlicher pfändbarer Betrag"] = this.formatCurrency(monthlyPayment);
        
        // Creditor-specific variables (if creditor data provided)
        if (creditorData) {
            const creditorDebt = creditorData?.debt_amount || 0;
            const tilgungsquote = totalDebt > 0 ? (creditorDebt / totalDebt * 100) : 0;
            const monthlyCreditororPayment = monthlyPayment * (creditorDebt / totalDebt);
            const totalCreditorPayment = monthlyCreditororPayment * 36; // 3 years

            replacements["Forderungssumme"] = this.formatCurrency(creditorDebt);
            replacements["Summe für die Tilgung des Gläubigers monatlich"] = this.formatCurrency(totalCreditorPayment);
            replacements["Tilgungsqoute"] = tilgungsquote.toFixed(2);
            replacements["Nummer im Schuldenbereinigungsplan"] = this.getCreditorNumber(creditorData, settlementData);
        } else {
            // Default values if no specific creditor
            replacements["Forderungssumme"] = this.formatCurrency(0);
            replacements["Summe für die Tilgung des Gläubigers monatlich"] = this.formatCurrency(0);
            replacements["Tilgungsqoute"] = "0,00";
            replacements["Nummer im Schuldenbereinigungsplan"] = "1";
        }
        
        replacements["Datum in 14 Tagen"] = this.formatDate(deadlineDate);

        console.log('📋 Variable replacements prepared:');
        Object.entries(replacements).forEach(([key, value]) => {
            console.log(`   "${key}" → "${value}"`);
        });

        return replacements;
    }

    /**
     * Get client full name
     */
    getClientName(clientData) {
        if (clientData?.firstName && clientData?.lastName) {
            return `${clientData.firstName} ${clientData.lastName}`;
        }
        if (clientData?.name) {
            return clientData.name;
        }
        return "Unbekannter Mandant";
    }

    /**
     * Calculate pfändbar amount based on German law (§850c ZPO)
     */
    calculatePfaendbarAmount(clientData) {
        const netIncome = clientData?.financial_data?.monthly_net_income || 0;
        const children = clientData?.financial_data?.number_of_children || 0;
        
        // Simplified calculation - in reality this would use the full §850c table
        const baseExemption = 1330; // Basic exemption amount
        const childExemption = children * 300; // Per child exemption
        const totalExemption = baseExemption + childExemption;
        
        const pfaendbar = Math.max(0, netIncome - totalExemption);
        
        console.log('💰 Pfändbar calculation:', {
            netIncome,
            children,
            totalExemption,
            pfaendbar
        });
        
        return pfaendbar;
    }

    /**
     * Get familienstand (marital status)
     */
    getFamilienstand(clientData) {
        const status = clientData?.financial_data?.marital_status || clientData?.marital_status;
        
        const statusMap = {
            'single': 'ledig',
            'married': 'verheiratet',
            'divorced': 'geschieden',
            'widowed': 'verwitwet'
        };
        
        return statusMap[status] || status || 'unbekannt';
    }

    /**
     * Get creditor number in settlement plan
     */
    getCreditorNumber(creditorData, settlementData) {
        if (!settlementData?.creditor_payments) return "1";
        
        const index = settlementData.creditor_payments.findIndex(
            c => c.creditor_name === creditorData.creditor_name || c.name === creditorData.name
        );
        
        return (index + 1).toString();
    }

    /**
     * Format currency in German format
     */
    formatCurrency(amount) {
        if (typeof amount !== 'number') {
            amount = parseFloat(amount) || 0;
        }
        return amount.toLocaleString('de-DE', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    /**
     * Format date in German format
     */
    formatDate(date) {
        if (!date) return new Date().toLocaleDateString('de-DE');
        
        if (typeof date === 'string') {
            // Handle various date string formats
            if (date.includes('.')) {
                // Already German format DD.MM.YYYY
                return date;
            }
            date = new Date(date);
        }
        
        if (!(date instanceof Date) || isNaN(date)) {
            return new Date().toLocaleDateString('de-DE');
        }
        
        return date.toLocaleDateString('de-DE');
    }

    /**
     * Debug function to analyze what's actually in the Word template
     */
    async analyzeTemplate() {
        try {
            if (!fs.existsSync(this.templatePath)) {
                console.log('❌ Template not found:', this.templatePath);
                return;
            }

            const templateBuffer = fs.readFileSync(this.templatePath);
            const zip = await JSZip.loadAsync(templateBuffer);
            const documentXml = await zip.file('word/document.xml').async('string');

            console.log('🔍 Template Analysis:');
            console.log('📁 Template path:', this.templatePath);
            console.log('📄 Document XML length:', documentXml.length);

            // Look for all types of quoted text
            const patterns = [
                { name: 'HTML encoded quotes', regex: /&quot;[^&]*?&quot;/g },
                { name: 'Regular quotes', regex: /"[^"]*?"/g },
                { name: 'Left/right curly quotes', regex: /"[^"]*?"/g },
                { name: 'Alternative curly quotes', regex: /"[^"]*?"/g }
            ];

            patterns.forEach(({ name, regex }) => {
                const matches = documentXml.match(regex);
                if (matches && matches.length > 0) {
                    console.log(`\n📋 ${name} (${matches.length} found):`);
                    matches.forEach((match, index) => {
                        if (index < 10) { // Show first 10
                            console.log(`   ${index + 1}. ${match}`);
                        }
                    });
                    if (matches.length > 10) {
                        console.log(`   ... and ${matches.length - 10} more`);
                    }
                }
            });

            return documentXml;
        } catch (error) {
            console.error('❌ Error analyzing template:', error.message);
        }
    }

    /**
     * Escape special regex characters
     */
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

module.exports = NewWordTemplateProcessor;