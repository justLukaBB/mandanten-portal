const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

/**
 * Word Template Processor
 * Processes Word document templates by replacing placeholders with actual data
 */
class WordTemplateProcessor {
    constructor() {
        this.templatePath = path.join(__dirname, '../documents/Ratenplan-Template-Original.docx');
    }

    /**
     * Process the Ratenplan template with full client data from database
     */
    async processRatenplanTemplate(clientReference, settlementData, pfaendbarAmount) {
        try {
            console.log('📄 Processing Ratenplan template with full client data...');

            // Get full client data from database
            const Client = require('../models/Client');
            const client = await Client.findOne({ aktenzeichen: clientReference });
            
            if (!client) {
                throw new Error(`Client not found: ${clientReference}`);
            }

            // Read the template file
            const templateBuffer = fs.readFileSync(this.templatePath);
            const zip = await JSZip.loadAsync(templateBuffer);

            // Get the document XML
            const documentXml = await zip.file('word/document.xml').async('string');

            // Extract comprehensive client data
            const clientData = this.extractClientData(client, settlementData, pfaendbarAmount);
            console.log('📊 Extracted client data:', {
                name: clientData.fullName,
                income: clientData.grossIncome,
                pfaendbar: clientData.pfaendbarAmount,
                totalDebt: clientData.totalDebt,
                maritalStatus: clientData.maritalStatus,
                children: clientData.numberOfChildren
            });

            // Create dynamic replacements based on real client data
            const replacements = this.buildReplacements(clientData);
            
            console.log('🔄 Applying dynamic replacements:', Object.keys(replacements).length, 'replacements');

            console.log('🔄 Applying replacements:', replacements);

            // Apply replacements to the document XML
            let processedXml = documentXml;
            Object.entries(replacements).forEach(([search, replace]) => {
                const regex = new RegExp(this.escapeRegex(search), 'g');
                processedXml = processedXml.replace(regex, replace);
            });

            // Update the document in the zip
            zip.file('word/document.xml', processedXml);

            // Generate the new document
            const outputBuffer = await zip.generateAsync({ type: 'nodebuffer' });

            // Save to documents folder
            const outputFilename = `Ratenplan-Pfaendbares-Einkommen_${clientReference}_${new Date().toISOString().split('T')[0]}.docx`;
            const outputPath = path.join(__dirname, '../documents', outputFilename);
            
            fs.writeFileSync(outputPath, outputBuffer);

            console.log('✅ Ratenplan template processed successfully');
            console.log(`📁 Output: ${outputFilename}`);

            return {
                success: true,
                filename: outputFilename,
                path: outputPath,
                size: outputBuffer.length
            };

        } catch (error) {
            console.error('❌ Error processing Ratenplan template:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Extract comprehensive client data for document generation
     */
    extractClientData(client, settlementData, pfaendbarAmount) {
        // Basic client info
        const firstName = client.firstName || 'Alexander';
        const lastName = client.lastName || 'Drewitz';
        const fullName = `${firstName} ${lastName}`;
        
        // Financial data
        const monthlyNetIncome = client.financial_data?.monthly_net_income || 2750;
        const numberOfChildren = client.financial_data?.number_of_children || 0;
        const maritalStatus = client.financial_data?.marital_status || 'verheiratet';
        
        // Calculate gross income (reverse calculation from pfändbar amount using rough estimation)
        const grossIncome = this.calculateGrossIncomeFromPfaendbar(pfaendbarAmount, maritalStatus, numberOfChildren);
        
        // Debt information
        const totalDebt = client.creditor_calculation_total_debt || 
                         settlementData.total_debt || 
                         97357.73;
        
        // Find specific creditor (Finanzamt) or use default
        const finanzamtCreditor = this.findFinanzamtCreditor(client.creditor_calculation_table || []);
        
        // Calculate individual creditor payment
        const creditorAmount = finanzamtCreditor?.final_amount || 1677.64;
        const creditorTotalPayment = this.calculateCreditorPayment(creditorAmount, totalDebt, pfaendbarAmount);
        
        // Calculate tilgung percentage 
        const tilgungsquote = (creditorTotalPayment / creditorAmount) * 100;
            
        // Birth date (calculate age - assuming born around 1985 for now)
        const birthDate = this.calculateBirthDate();
        
        // Court determination
        const court = this.determineCourtFromAddress(client.address);
        
        return {
            // Personal Information
            firstName,
            lastName,
            fullName,
            email: client.email,
            reference: client.aktenzeichen,
            address: client.address,
            birthDate,
            maritalStatus,
            numberOfChildren,
            
            // Financial Information  
            monthlyNetIncome,
            grossIncome,
            pfaendbarAmount,
            totalDebt,
            
            // Creditor Information
            finanzamtCreditor: {
                name: finanzamtCreditor?.name || 'Finanzamt Bochum-Süd',
                amount: creditorAmount,
                reference: finanzamtCreditor?.reference_number || '350/2141/2659'
            },
            creditorTotalPayment,
            tilgungsquote,
            
            // Dates
            currentDate: new Date().toLocaleDateString('de-DE'),
            planStartDate: '01.08.2025',
            deadlineDate: this.calculateDeadlineDate(),
            
            // Court/Legal
            court: court.name,
            courtAddress: court.address
        };
    }

    /**
     * Find Finanzamt creditor in creditor list
     */
    findFinanzamtCreditor(creditors) {
        return creditors.find(creditor => 
            creditor.name && creditor.name.toLowerCase().includes('finanzamt')
        ) || null;
    }

    /**
     * Calculate gross income from pfändbar amount (reverse calculation)
     */
    calculateGrossIncomeFromPfaendbar(pfaendbarAmount, maritalStatus, numberOfChildren) {
        // Rough estimation: pfändbar amount is typically 25-35% of gross income
        // This is a simplified calculation - in reality it depends on complex tax and social security rules
        const baseMultiplier = maritalStatus === 'verheiratet' ? 4.2 : 3.8;
        const childReduction = numberOfChildren * 0.15; // Reduce multiplier for children
        const multiplier = Math.max(baseMultiplier - childReduction, 3.0);
        
        return Math.round(pfaendbarAmount * multiplier);
    }

    /**
     * Calculate individual creditor payment over 36 months
     */
    calculateCreditorPayment(creditorAmount, totalDebt, monthlyPayment) {
        const creditorPercentage = (creditorAmount / totalDebt);
        const totalPayment = monthlyPayment * 36;
        return Math.round(totalPayment * creditorPercentage);
    }

    /**
     * Calculate birth date (placeholder - should be stored in client model)
     */
    calculateBirthDate() {
        // Default to 24.11.1985 as in original template
        // This should eventually come from client data
        return '24.11.1985';
    }

    /**
     * Determine court from client address
     */
    determineCourtFromAddress(address) {
        // Simple court mapping based on address
        // This should be more sophisticated in production
        if (!address) {
            return {
                name: 'Amtsgericht Bochum',
                address: 'Bochum'
            };
        }
        
        const addressLower = address.toLowerCase();
        if (addressLower.includes('bochum')) {
            return {
                name: 'Amtsgericht Bochum', 
                address: 'Bochum'
            };
        } else if (addressLower.includes('dortmund')) {
            return {
                name: 'Amtsgericht Dortmund',
                address: 'Dortmund'
            };
        } else if (addressLower.includes('essen')) {
            return {
                name: 'Amtsgericht Essen',
                address: 'Essen'
            };
        }
        
        // Default
        return {
            name: 'Amtsgericht Bochum',
            address: 'Bochum'
        };
    }

    /**
     * Build comprehensive replacements for template
     */
    buildReplacements(clientData) {
        return {
            // Dates
            '02.05.2025': clientData.currentDate,
            '01.08.2025': clientData.planStartDate,
            '16.05.2025': clientData.deadlineDate,
            
            // Client Names - Multiple variations
            'Alexander Drewitz': clientData.fullName,
            'Alexander': clientData.firstName,
            'Drewitz': clientData.lastName,
            'Herr Drewitz': `Herr ${clientData.lastName}`,
            'Herr Alexander Drewitz': `Herr ${clientData.fullName}`,
            
            // Financial Amounts
            '97.357,73': this.formatGermanCurrency(clientData.totalDebt),
            '2.750,00': this.formatGermanCurrency(clientData.grossIncome),
            '680,78': this.formatGermanCurrency(clientData.pfaendbarAmount),
            '880,78': this.formatGermanCurrency(clientData.pfaendbarAmount),
            '1.677,64': this.formatGermanCurrency(clientData.finanzamtCreditor.amount),
            '546,38': this.formatGermanCurrency(clientData.creditorTotalPayment),
            
            // Percentages
            '32,57%': `${clientData.tilgungsquote.toFixed(2).replace('.', ',')}%`,
            
            // Reference Numbers
            '99/25 TS-JK': `${clientData.reference}/TS-JK`,
            '99/25 TS.JK': `${clientData.reference}/TS-JK`, 
            '350/2141/2659': clientData.finanzamtCreditor.reference || clientData.reference,
            
            // Birth Date
            '24.11.1985': clientData.birthDate,
            
            // Marital Status Specific Text
            'verheiratet': this.getMaritalStatusText(clientData.maritalStatus),
            
            // Court Information
            'Amtsgericht Bochum': clientData.court,
            'Bochum': clientData.courtAddress,
            
            // Dynamic creditor number (12 is from template)
            '12 Gläubigern': `${(clientData.creditorCount || 12)} Gläubigern`,
            
            // Number 12 (creditor position)
            'Nummer 12': `Nummer ${clientData.creditorPosition || 12}`
        };
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
        return statusMap[status] || 'verheiratet';
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
     * Calculate deadline date (2 weeks from now)
     */
    calculateDeadlineDate() {
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + 14);
        return deadline.toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    /**
     * Escape special regex characters
     */
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

module.exports = WordTemplateProcessor;