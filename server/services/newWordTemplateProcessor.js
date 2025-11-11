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

            // Extract basic client info for use in this method
            const clientName = this.getClientName(clientData);
            const clientReference = clientData?.aktenzeichen || clientData?.reference || 'UNBEKANNT';
            
            // Calculate key financial values
            const totalDebt = settlementData?.total_debt || 0;
            const creditorCount = settlementData?.creditor_payments?.length || 0;
            
            // Get the ACTUAL monthly payment from settlementData (calculated in Schuldenbereinigungsplan step)
            const monthlyPayment = settlementData?.monthly_payment || 
                                 settlementData?.garnishable_amount || 
                                 clientData?.debt_settlement_plan?.pfaendbar_amount ||
                                 clientData?.financial_data?.pfaendbar_amount ||
                                 0;
            
            console.log('💰 Monthly payment from settlement plan:', monthlyPayment);
            
            // Calculate dates
            const deadlineDate = new Date();
            deadlineDate.setDate(deadlineDate.getDate() + 14);
            
            const paymentStartDate = new Date();
            paymentStartDate.setMonth(paymentStartDate.getMonth() + 3);
            paymentStartDate.setDate(1);

            // Replace variables in the document XML
            let processedXml = documentXml;

            // First, replace the complex split XML patterns with simple placeholders
            const splitXmlReplacements = [
                // NEW TEMPLATE: Updated Adresse des Creditors pattern
                {
                    pattern: "&quot;Adresse</w:t></w:r><w:r><w:rPr><w:color w:val=\"101012\"/><w:spacing w:val=\"15\"/><w:sz w:val=\"22\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val=\"101012\"/><w:w w:val=\"90\"/><w:sz w:val=\"22\"/></w:rPr><w:t>des</w:t></w:r><w:r><w:rPr><w:color w:val=\"101012\"/><w:spacing w:val=\"15\"/><w:sz w:val=\"22\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val=\"101012\"/><w:w w:val=\"90\"/><w:sz w:val=\"22\"/></w:rPr><w:t>Creditors</w:t></w:r><w:r><w:rPr><w:color w:val=\"101012\"/><w:spacing w:val=\"17\"/><w:sz w:val=\"22\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val=\"101012\"/><w:spacing w:val=\"-10\"/><w:w w:val=\"90\"/><w:sz w:val=\"22\"/></w:rPr><w:t>&quot;",
                    variable: "Adresse des Creditors",
                    placeholder: "CREDITOR_ADDRESS_NEW_TEMPLATE"
                },
                // OLD TEMPLATE: Keep for compatibility
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
                },
                // Additional "Name des Mandanten" patterns found in template analysis
                {
                    pattern: "&quot;Name</w:t></w:r><w:r><w:rPr><w:color w:val=\"111214\"/><w:spacing w:val=\"10\"/><w:sz w:val=\"22\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val=\"111214\"/><w:spacing w:val=\"-2\"/><w:sz w:val=\"22\"/></w:rPr><w:t>des</w:t></w:r><w:r><w:rPr><w:color w:val=\"111214\"/><w:spacing w:val=\"10\"/><w:sz w:val=\"22\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val=\"111214\"/><w:spacing w:val=\"-2\"/><w:sz w:val=\"22\"/></w:rPr><w:t>Mandanten&quot;",
                    variable: "Name des Mandanten",
                    placeholder: "CLIENT_NAME_PLACEHOLDER_2"
                },
                {
                    pattern: "&quot;Name</w:t></w:r><w:r><w:rPr><w:color w:val=\"0F1012\"/><w:spacing w:val=\"-16\"/><w:sz w:val=\"22\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val=\"0F1012\"/><w:sz w:val=\"22\"/></w:rPr><w:t>des Mandanten&quot;",
                    variable: "Name des Mandanten",
                    placeholder: "CLIENT_NAME_PLACEHOLDER_3"
                },
                {
                    pattern: "&quot;Name</w:t></w:r><w:r><w:rPr><w:color w:val=\"0F0F12\"/><w:spacing w:val=\"-6\"/><w:sz w:val=\"22\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val=\"0F0F12\"/><w:spacing w:val=\"-4\"/><w:sz w:val=\"22\"/></w:rPr><w:t>des</w:t></w:r><w:r><w:rPr><w:color w:val=\"0F0F12\"/><w:spacing w:val=\"-6\"/><w:sz w:val=\"22\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val=\"0F0F12\"/><w:spacing w:val=\"-4\"/><w:sz w:val=\"22\"/></w:rPr><w:t>Mandanten&quot;",
                    variable: "Name des Mandanten",
                    placeholder: "CLIENT_NAME_PLACEHOLDER_4"
                },
                // NEW TEMPLATE: Name des Gläubigers pattern from updated template
                {
                    pattern: "&quot;Name</w:t></w:r><w:r><w:rPr><w:color w:val=\"101012\"/><w:spacing w:val=\"10\"/><w:sz w:val=\"22\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val=\"101012\"/><w:w w:val=\"90\"/><w:sz w:val=\"22\"/></w:rPr><w:t>des</w:t></w:r><w:r><w:rPr><w:color w:val=\"101012\"/><w:spacing w:val=\"11\"/><w:sz w:val=\"22\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val=\"101012\"/><w:w w:val=\"90\"/><w:sz w:val=\"22\"/></w:rPr><w:t>Gläubiger&quot;",
                    variable: "Name des Gläubigers",
                    placeholder: "CREDITOR_NAME_NEW_TEMPLATE"
                },
                // Old template pattern (keeping for compatibility)
                {
                    pattern: "&quot;Name</w:t></w:r><w:r><w:rPr><w:color w:val=\"121215\"/><w:spacing w:val=\"-12\"/><w:sz w:val=\"22\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val=\"121215\"/><w:spacing w:val=\"-4\"/><w:sz w:val=\"22\"/></w:rPr><w:t>des</w:t></w:r><w:r><w:rPr><w:color w:val=\"121215\"/><w:spacing w:val=\"-11\"/><w:sz w:val=\"22\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val=\"121215\"/><w:spacing w:val=\"-4\"/><w:sz w:val=\"22\"/></w:rPr><w:t>Gläubigers&quot;",
                    variable: "Name des Gläubigers",
                    placeholder: "CREDITOR_NAME_PLACEHOLDER"
                },
                {
                    pattern: "&quot;Name</w:t></w:r><w:r><w:rPr><w:color w:val=\"111214\"/><w:spacing w:val=\"10\"/><w:sz w:val=\"22\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val=\"111214\"/><w:spacing w:val=\"-2\"/><w:sz w:val=\"22\"/></w:rPr><w:t>des</w:t></w:r><w:r><w:rPr><w:color w:val=\"111214\"/><w:spacing w:val=\"10\"/><w:sz w:val=\"22\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val=\"111214\"/><w:spacing w:val=\"-2\"/><w:sz w:val=\"22\"/></w:rPr><w:t>Creditors&quot;",
                    variable: "Name des Creditors",
                    placeholder: "CREDITOR_NAME_PLACEHOLDER_2"
                },
                // Potential pattern for creditor name above address
                {
                    pattern: "&quot;Gläubiger</w:t></w:r><w:r><w:rPr><w:color w:val=\"101012\"/><w:spacing w:val=\"-7\"/><w:sz w:val=\"22\"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val=\"101012\"/><w:spacing w:val=\"-6\"/><w:sz w:val=\"22\"/></w:rPr><w:t>Name&quot;",
                    variable: "Gläubiger Name",
                    placeholder: "CREDITOR_NAME_HEADER_PLACEHOLDER"
                }
            ];

            // Initialize totalReplacements counter
            let totalReplacements = 0;
            console.log('🔢 totalReplacements initialized to 0');

            splitXmlReplacements.forEach(({ pattern, variable, placeholder }) => {
                if (processedXml.includes(pattern)) {
                    // Get the actual creditor name or address
                    let actualValue;
                    if (variable === "Name des Gläubigers") {
                        actualValue = creditorData?.name || creditorData?.creditor_name || "Gläubiger";
                    } else if (variable === "Adresse des Creditors") {
                        actualValue = creditorData?.address || "Adresse nicht verfügbar";
                    } else {
                        actualValue = replacements[variable] || placeholder;
                    }
                    
                    processedXml = processedXml.replace(pattern, actualValue);
                    console.log(`✅ Replaced split XML pattern "${variable}" with "${actualValue}"`);
                    totalReplacements++;
                }
            });
            
            // Debug: Show what quoted text exists in the document
            console.log('🔍 Searching for quoted text patterns in document...');
            
            // Extract all simple quoted variables for debugging
            const simpleQuotedVars = processedXml.match(/&quot;[^&<]*?&quot;/g) || [];
            console.log('📋 All simple quoted variables found in template:');
            simpleQuotedVars.forEach((match, index) => {
                const cleanVar = match.replace(/&quot;/g, '"');
                console.log(`   ${index + 1}. ${cleanVar}`);
            });
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

            // Note: Simplified approach - let split-XML patterns handle what they can,
            // then complete systematic replacement will handle everything else
            
            Object.entries(replacements).forEach(([variable, value]) => {
                let variableReplaced = false;
                
                // Skip placeholder variables that were already replaced by split-XML patterns
                if (variable.includes('_PLACEHOLDER')) {
                    console.log(`✅ Skipping "${variable}" - already replaced by split-XML pattern`);
                    return;
                }
                
                quoteTypes.forEach(quoteType => {
                    if (variableReplaced) return; // Skip if already replaced
                    
                    // Create more flexible pattern that handles XML structure
                    const quotedVariable = `${quoteType.open}${variable}${quoteType.close}`;
                    
                    // First try exact match
                    const exactMatchPattern = new RegExp(
                        this.escapeRegex(quotedVariable),
                        'g'
                    );
                    
                    const exactMatches = (processedXml.match(exactMatchPattern) || []).length;
                    if (exactMatches > 0) {
                        processedXml = processedXml.replace(exactMatchPattern, value);
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
                    
                    // TRY 1: Direct exact match for simple cases - GLOBAL REPLACEMENT
                    const quotedVar = quoteType.open + variable + quoteType.close;
                    const directExactPattern = new RegExp(this.escapeRegex(quotedVar), 'g');
                    
                    if (processedXml.includes(quotedVar)) {
                        let matchCount = 0;
                        processedXml = processedXml.replace(directExactPattern, (match, offset) => {
                            // Extra safety: check we're not in an XML attribute
                            const beforeMatch = processedXml.substring(Math.max(0, offset - 100), offset);
                            
                            // Check if we're inside an XML tag (dangerous)
                            const lastOpen = beforeMatch.lastIndexOf('<');
                            const lastClose = beforeMatch.lastIndexOf('>');
                            
                            if (lastOpen > lastClose && !beforeMatch.includes('<w:t')) {
                                return match; // Skip - we're inside a non-text tag
                            }
                            
                            matchCount++;
                            return value;
                        });
                        
                        if (matchCount > 0) {
                            console.log(`✅ Exact match "${variable}" (${quoteType.name}): ${matchCount} occurrences`);
                            totalReplacements += matchCount;
                            variableReplaced = true;
                        }
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
                    // Try to find similar variables in the document for debugging
                    const searchTerm = variable.length > 3 ? variable.substring(0, Math.min(variable.length, 8)) : variable;
                    const documentSnippets = processedXml.match(new RegExp(`[^<]*${this.escapeRegex(searchTerm)}[^>]*`, 'gi'));
                    if (documentSnippets && documentSnippets.length > 0) {
                        console.log(`   🔍 Found similar text in document:`, documentSnippets.slice(0, 3));
                    }
                }
            });
            
            console.log(`✅ Total replacements made: ${totalReplacements}`);
            
            // === SYSTEMATIC COMPLETION OF MISSED VARIABLES ===
            
            // 1. PLAIN TEXT VARIABLES (no quotes in template)
            const plainTextReplacements = [
                {
                    pattern: /<w:t>Einkommen<\/w:t>/g,
                    value: `<w:t>${this.formatCurrency(clientData?.financial_data?.monthly_net_income || 0)}</w:t>`,
                    name: "Einkommen"
                }
            ];
            
            // 2. DYNAMIC CONTENT REPLACEMENT 
            // Search for common placeholder patterns that might exist in documents
            const dynamicReplacements = [
                // Creditor names
                {
                    patterns: ["EOS Deutscher Inkasso-Dienst GmbH", "Inkasso", "Gläubiger Name", "Name des Gläubigers", "Creditor Name"],
                    value: creditorData?.name || creditorData?.creditor_name || "Gläubiger",
                    name: "Creditor Name"
                },
                // Financial amounts that might appear as hardcoded values
                {
                    patterns: ["0,00", "0.00", "XXX,XX", "000,00"],
                    value: this.formatCurrency(creditorData?.debt_amount || 0),
                    name: "Debt Amount"
                },
                // Client name alternatives
                {
                    patterns: ["Max Mustermann", "Mandant Name", "Client Name"],
                    value: clientName,
                    name: "Client Name Alternatives"
                },
                // Date placeholders
                {
                    patterns: ["01.01.2025", "DD.MM.YYYY", "Datum"],
                    value: this.formatDate(new Date()),
                    name: "Date Placeholders"
                }
            ];
            
            dynamicReplacements.forEach(({ patterns, value, name }) => {
                patterns.forEach(pattern => {
                    const regex = new RegExp(`<w:t>${this.escapeRegex(pattern)}</w:t>`, 'g');
                    const matches = processedXml.match(regex);
                    if (matches && matches.length > 0) {
                        processedXml = processedXml.replace(regex, `<w:t>${value}</w:t>`);
                        console.log(`✅ Dynamic ${name} replacement "${pattern}" -> "${value}": ${matches.length} occurrences`);
                        totalReplacements += matches.length;
                    }
                });
            });
            
            // 3. UNIVERSAL CREDITOR NAME REPLACEMENT
            // Replace ANY company name that looks like a creditor with the actual creditor
            const creditorName = creditorData?.name || creditorData?.creditor_name || "Gläubiger";
            
            // Common creditor name patterns to replace (hardcoded company names in template)
            const hardcodedCreditorNames = [
                "EOS Deutscher Inkasso-Dienst GmbH",
                "Schufa Holding AG", 
                "CRIF Bürgel GmbH",
                "Boniversum GmbH",
                "Creditreform",
                "Inkasso Unternehmen",
                "Gläubiger AG",
                "Muster Inkasso GmbH"
            ];
            
            hardcodedCreditorNames.forEach(hardcodedName => {
                const regex = new RegExp(`<w:t>${this.escapeRegex(hardcodedName)}</w:t>`, 'g');
                const matches = processedXml.match(regex);
                if (matches && matches.length > 0) {
                    processedXml = processedXml.replace(regex, `<w:t>${creditorName}</w:t>`);
                    console.log(`✅ Universal creditor name replacement "${hardcodedName}" -> "${creditorName}": ${matches.length} occurrences`);
                    totalReplacements += matches.length;
                }
            });
            
            // Also replace common generic placeholders
            const genericPlaceholders = [
                "Gläubiger",
                "Creditor", 
                "Inkasso",
                "[CREDITOR]",
                "[GLÄUBIGER]"
            ];
            
            genericPlaceholders.forEach(placeholder => {
                const regex = new RegExp(`<w:t>${this.escapeRegex(placeholder)}</w:t>`, 'g');
                const matches = processedXml.match(regex);
                if (matches && matches.length > 0 && placeholder !== creditorName) {
                    processedXml = processedXml.replace(regex, `<w:t>${creditorName}</w:t>`);
                    console.log(`✅ Generic creditor placeholder replacement "${placeholder}" -> "${creditorName}": ${matches.length} occurrences`);
                    totalReplacements += matches.length;
                }
            });
            
            plainTextReplacements.forEach(({ pattern, value, name }) => {
                const matches = processedXml.match(pattern);
                if (matches && matches.length > 0) {
                    processedXml = processedXml.replace(pattern, value);
                    console.log(`✅ Plain text replacement "${name}": ${matches.length} occurrences`);
                    totalReplacements += matches.length;
                }
            });
            
            // 2. COMPLETE VARIABLE COVERAGE - ensure ALL template variables are covered
            const completeVariableMap = {
                // Client information
                "Name des Mandanten": clientName,
                "Mandant": clientName,
                "Familienstand": this.getFamilienstand(clientData),
                "Geburtstag": this.formatDate(clientData?.geburtstag) || this.formatDate(clientData?.birthDate) || '01.01.1980',
                "Aktenzeichen des Mandanten": clientReference,
                
                // Financial data  
                "Forderungssumme": this.formatCurrency(creditorData?.debt_amount || 0),
                "Gessamtsumme Verschuldung": this.formatCurrency(totalDebt),
                "Tilgungsqoute": creditorData ? (creditorData.debt_amount / totalDebt * 100).toFixed(2).replace('.', ',') + "%" : "0,00%",
                "Gläubigeranzahl": creditorCount.toString(),
                "Summe für die Tilgung des Gläubigers monatlich": creditorData && totalDebt > 0 ? this.formatCurrency(monthlyPayment * (creditorData.debt_amount / totalDebt)) : "0,00",
                
                // Income related - use ACTUAL monthly payment from settlement plan
                "pfändbares Einkommen": this.formatCurrency(monthlyPayment),
                "monatlicher pfändbarer Betrag": this.formatCurrency(monthlyPayment),
                
                // Dates
                "Heutiges Datum": this.formatDate(new Date()),
                "Datum in 14 Tagen": this.formatDate(deadlineDate),
                "Immer der erste in 3 Monaten": this.formatDate(paymentStartDate),
                
                // Creditor info
                "Adresse des Creditors": creditorData?.address || "Adresse nicht verfügbar",
                "Name des Creditors": creditorData?.name || creditorData?.creditor_name || "Gläubiger",
                "Name des Gläubigers": creditorData?.name || creditorData?.creditor_name || "Gläubiger",
                "Gläubiger Name": creditorData?.name || creditorData?.creditor_name || "Gläubiger",
                "Creditor": creditorData?.name || creditorData?.creditor_name || "Gläubiger", 
                "Gläubiger": creditorData?.name || creditorData?.creditor_name || "Gläubiger",
                "Aktenzeichen der Forderung": creditorData?.reference || creditorData?.creditor_reference || clientReference,
                
                // Administrative
                "Nummer im Schuldenbereinigungsplan": "1",
                
                // Date fixes for hardcoded values
                "01.08.2025": this.formatDate(paymentStartDate),
                "Datum in 3 Monaten": this.formatDate(paymentStartDate),
                "Startdatum": this.formatDate(paymentStartDate)
            };
            
            // 3. AGGRESSIVE QUOTED VARIABLE REPLACEMENT with multiple quote types
            const simpleQuoteTypes = ['&quot;', '"', '"', '"'];
            
            Object.entries(completeVariableMap).forEach(([variable, value]) => {
                simpleQuoteTypes.forEach(quoteType => {
                    const quotedPattern = `${quoteType}${variable}${quoteType}`;
                    const regex = new RegExp(this.escapeRegex(quotedPattern), 'g');
                    
                    const matches = processedXml.match(regex);
                    if (matches && matches.length > 0) {
                        processedXml = processedXml.replace(regex, value);
                        console.log(`✅ Complete replacement "${variable}" (${quoteType}): ${matches.length} occurrences`);
                        totalReplacements += matches.length;
                    }
                });
            });

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
                const creditorRef = creditorData.aktenzeichen ? `_${creditorData.aktenzeichen.replace(/[^a-zA-Z0-9\-_.]/g, '_')}` : '';
                filename = `Pfaendbares-Einkommen_${clientRef}_${creditorName}${creditorRef}_${Date.now()}.docx`;
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
        const creditorCount = settlementData?.creditor_payments?.length || 0;
        
        // Get the ACTUAL monthly payment from settlementData (calculated in Schuldenbereinigungsplan step)
        const monthlyPayment = settlementData?.monthly_payment || 
                             settlementData?.garnishable_amount || 
                             clientData?.debt_settlement_plan?.pfaendbar_amount ||
                             clientData?.financial_data?.pfaendbar_amount ||
                             0;
        
        console.log('💰 Monthly payment from settlement plan:', monthlyPayment);

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
        replacements["Name des Creditors"] = creditorData?.name || creditorData?.creditor_name || "Gläubiger Name";
        replacements["Creditor"] = creditorData?.name || creditorData?.creditor_name || "Gläubiger Name";
        replacements["Gläubiger"] = creditorData?.name || creditorData?.creditor_name || "Gläubiger Name";
        replacements["Name des Mandanten"] = clientName;
        replacements["Aktenzeichen der Forderung"] = creditorData?.aktenzeichen || "AZ-12345";
        replacements["Gessamtsumme Verschuldung"] = this.formatCurrency(totalDebt);
        replacements["Heutiges Datum"] = this.formatDate(new Date());
        replacements["Aktenzeichen des Mandanten"] = clientReference;
        replacements["pfändbares Einkommen"] = this.formatCurrency(monthlyPayment);
        replacements["monatlicher pfändbarer Betrag"] = this.formatCurrency(monthlyPayment);
        
        // Creditor-specific variables (if creditor data provided)
        if (creditorData) {
            const creditorDebt = creditorData?.debt_amount || 0;
            const tilgungsquote = totalDebt > 0 ? (creditorDebt / totalDebt * 100) : 0;
            const monthlyCreditorPayment = totalDebt > 0 ? monthlyPayment * (creditorDebt / totalDebt) : 0;

            replacements["Forderungssumme"] = this.formatCurrency(creditorDebt);
            replacements["Summe für die Tilgung des Gläubigers monatlich"] = this.formatCurrency(monthlyCreditorPayment);
            replacements["Tilgungsqoute"] = tilgungsquote.toFixed(2).replace('.', ',');
            replacements["Nummer im Schuldenbereinigungsplan"] = this.getCreditorNumber(creditorData, settlementData);
        } else {
            // Default values if no specific creditor
            replacements["Forderungssumme"] = this.formatCurrency(0);
            replacements["Summe für die Tilgung des Gläubigers monatlich"] = this.formatCurrency(0);
            replacements["Tilgungsqoute"] = "0,00";
            replacements["Nummer im Schuldenbereinigungsplan"] = "1";
        }
        
        replacements["Datum in 14 Tagen"] = this.formatDate(deadlineDate);
        
        // Note: Individual variable assignments moved to complete systematic replacement section below

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