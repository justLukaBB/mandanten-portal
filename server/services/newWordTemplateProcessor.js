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
            console.log('🎯 Processing new Word template with identified variables...');
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

            splitXmlReplacements.forEach(({ pattern, placeholder }) => {
                if (processedXml.includes(pattern)) {
                    processedXml = processedXml.replace(pattern, placeholder);
                    console.log(`✅ Replaced split XML pattern with ${placeholder}`);
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

            let totalReplacements = 0;

            Object.entries(replacements).forEach(([variable, value]) => {
                let variableReplaced = false;
                
                quoteTypes.forEach(quoteType => {
                    if (variableReplaced) return; // Skip if already replaced
                    
                    // Create more flexible pattern that handles XML structure
                    const quotedVariable = `${quoteType.open}${variable}${quoteType.close}`;
                    
                    // First try exact match
                    const exactPattern = new RegExp(
                        this.escapeRegex(quotedVariable),
                        'g'
                    );
                    
                    const exactMatches = (processedXml.match(exactPattern) || []).length;
                    if (exactMatches > 0) {
                        processedXml = processedXml.replace(exactPattern, value);
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
                    
                    // Try pattern that allows for XML tags between quotes and text  
                    const flexiblePattern = new RegExp(
                        `${this.escapeRegex(quoteType.open)}([^${this.escapeRegex(quoteType.close)}]*?${this.escapeRegex(variable)}[^${this.escapeRegex(quoteType.close)}]*?)${this.escapeRegex(quoteType.close)}`,
                        'g'
                    );
                    
                    const flexibleMatches = processedXml.match(flexiblePattern);
                    if (flexibleMatches && flexibleMatches.length > 0) {
                        processedXml = processedXml.replace(flexiblePattern, (match, content) => {
                            // Only replace if the content actually contains our variable
                            if (content.includes(variable)) {
                                console.log(`✅ Flexible match "${variable}" (${quoteType.name}): 1 occurrence`);
                                totalReplacements++;
                                variableReplaced = true;
                                return value;
                            }
                            return match;
                        });
                    }
                    
                    // Try ultra-flexible pattern for variables split across XML elements
                    if (!variableReplaced) {
                        // Build pattern for variables that might be split across <w:t> tags
                        const splitPattern = new RegExp(
                            `${this.escapeRegex(quoteType.open)}[^${this.escapeRegex(quoteType.close)}]*?(?:<[^>]*>)*?[^${this.escapeRegex(quoteType.close)}]*?${this.escapeRegex(variable)}[^${this.escapeRegex(quoteType.close)}]*?(?:<[^>]*>)*?[^${this.escapeRegex(quoteType.close)}]*?${this.escapeRegex(quoteType.close)}`,
                            'g'
                        );
                        
                        const splitMatches = processedXml.match(splitPattern);
                        if (splitMatches && splitMatches.length > 0) {
                            processedXml = processedXml.replace(splitPattern, (match) => {
                                // Extract just the text content to check
                                const textContent = match.replace(/<[^>]*>/g, '');
                                if (textContent.includes(variable)) {
                                    console.log(`✅ Split-XML match "${variable}" (${quoteType.name}): 1 occurrence`);
                                    totalReplacements++;
                                    variableReplaced = true;
                                    return value;
                                }
                                return match;
                            });
                        }
                    }
                });
                
                if (!variableReplaced) {
                    console.log(`⚠️ Variable "${variable}" not found in document`);
                }
            });
            
            console.log(`✅ Total replacements made: ${totalReplacements}`);

            // Update the document XML in the zip
            zip.file('word/document.xml', processedXml);

            // Generate output
            const outputBuffer = await zip.generateAsync({ type: 'nodebuffer' });
            
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

        // Template Variables - based on actual analysis
        // Use placeholders for split XML variables
        replacements["CREDITOR_ADDRESS_PLACEHOLDER"] = creditorData?.address || "Gläubiger Adresse";
        replacements["Mandant"] = clientName;
        replacements["CREDITOR_REFERENCE_PLACEHOLDER"] = creditorData?.aktenzeichen || "AZ-12345";
        replacements["CLIENT_NAME_PLACEHOLDER"] = clientName;
        replacements["Gläubigeranzahl"] = creditorCount.toString();
        replacements["TOTAL_DEBT_PLACEHOLDER"] = this.formatCurrency(totalDebt);
        replacements["TODAY_DATE_PLACEHOLDER"] = this.formatDate(new Date());
        replacements["CLIENT_REFERENCE_PLACEHOLDER"] = clientReference;
        replacements["Geburtstag"] = this.formatDate(clientData?.geburtstag);
        replacements["Familienstand"] = this.getFamilienstand(clientData);
        replacements["Einkommen"] = this.formatCurrency(clientData?.financial_data?.monthly_net_income || 0);
        replacements["PFAENDBAR_INCOME_PLACEHOLDER"] = this.formatCurrency(pfaendbarAmount);
        replacements["MONTHLY_PFAENDBAR_PLACEHOLDER"] = this.formatCurrency(monthlyPayment);
        
        // Creditor-specific variables (if creditor data provided)
        if (creditorData) {
            const creditorDebt = creditorData?.debt_amount || 0;
            const tilgungsquote = totalDebt > 0 ? (creditorDebt / totalDebt * 100) : 0;
            const monthlyCreditororPayment = monthlyPayment * (creditorDebt / totalDebt);
            const totalCreditorPayment = monthlyCreditororPayment * 36; // 3 years

            replacements["Forderungssumme"] = this.formatCurrency(creditorDebt);
            replacements["TOTAL_MONTHLY_PAYMENT_PLACEHOLDER"] = this.formatCurrency(totalCreditorPayment);
            replacements["Tilgungsqoute"] = tilgungsquote.toFixed(2);
            replacements["PLAN_NUMBER_PLACEHOLDER"] = this.getCreditorNumber(creditorData, settlementData);
        } else {
            // Default values if no specific creditor
            replacements["Forderungssumme"] = this.formatCurrency(0);
            replacements["TOTAL_MONTHLY_PAYMENT_PLACEHOLDER"] = this.formatCurrency(0);
            replacements["Tilgungsqoute"] = "0,00";
            replacements["PLAN_NUMBER_PLACEHOLDER"] = "1";
        }
        
        replacements["Immer der erste in 3 Monaten"] = this.formatDate(paymentStartDate);
        replacements["DEADLINE_DATE_PLACEHOLDER"] = this.formatDate(deadlineDate);

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