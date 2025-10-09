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

            // Prepare all variable replacements based on identified template variables
            const replacements = this.prepareVariableReplacements(clientData, settlementData, creditorData);

            console.log('🔄 Prepared replacements:', Object.keys(replacements).length, 'variables');

            // Replace variables in the document XML
            let processedXml = documentXml;
            
            // Support multiple quote types found in Word documents
            const quoteTypes = [
                { name: 'HTML encoded', open: '&quot;', close: '&quot;' },
                { name: 'Regular', open: '"', close: '"' },
                { name: 'Curly left/right', open: '"', close: '"' },
                { name: 'Curly alternative', open: '"', close: '"' }
            ];

            Object.entries(replacements).forEach(([variable, value]) => {
                quoteTypes.forEach(quoteType => {
                    const pattern = new RegExp(
                        `${this.escapeRegex(quoteType.open)}${this.escapeRegex(variable)}${this.escapeRegex(quoteType.close)}`,
                        'g'
                    );
                    
                    const beforeCount = (processedXml.match(pattern) || []).length;
                    if (beforeCount > 0) {
                        processedXml = processedXml.replace(pattern, value);
                        console.log(`✅ Replaced "${variable}" (${quoteType.name}): ${beforeCount} occurrences`);
                    }
                });
            });

            // Update the document XML in the zip
            zip.file('word/document.xml', processedXml);

            // Generate output
            const outputBuffer = await zip.generateAsync({ type: 'nodebuffer' });
            const filename = `Ratenplan-Pfaendbares-Einkommen_${clientData?.aktenzeichen || clientData?.reference}_${Date.now()}.docx`;
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
        replacements["Adresse des Creditors"] = creditorData?.address || "Gläubiger Adresse";
        replacements["Mandant"] = clientName;
        replacements["Aktenzeichen der Forderung"] = creditorData?.aktenzeichen || "AZ-12345";
        replacements["Name des Mandanten"] = clientName;
        replacements["Gläubigeranzahl"] = creditorCount.toString();
        replacements["Gessamtsumme Verschuldung"] = this.formatCurrency(totalDebt);
        replacements["Heutiges Datum"] = this.formatDate(new Date());
        replacements["Aktenzeichen des Mandanten"] = clientReference;
        replacements["Geburtstag"] = this.formatDate(clientData?.geburtstag);
        replacements["Familienstand"] = this.getFamilienstand(clientData);
        replacements["Einkommen"] = this.formatCurrency(clientData?.financial_data?.monthly_net_income || 0);
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
        
        replacements["Immer der erste in 3 Monaten"] = this.formatDate(paymentStartDate);
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
     * Escape special regex characters
     */
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

module.exports = NewWordTemplateProcessor;