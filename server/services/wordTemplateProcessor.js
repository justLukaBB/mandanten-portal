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
        this.nullplanTemplatePath = path.join(__dirname, '../documents/Nullplan-Template-Original.docx');
        this.quotenplanNullplanTemplatePath = path.join(__dirname, '../documents/Quotenplan-Nullplan-Template-Original.docx');
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

            // Log some key replacements for debugging
            console.log('🔄 Sample replacements:');
            console.log('   - "Name Mandant": ', replacements['"Name Mandant"'] || 'NOT FOUND');
            console.log('   - "pfändbarer Betrag": ', replacements['"pfändbarer Betrag"'] || 'NOT FOUND');
            console.log('   - "Gesamtschulden": ', replacements['"Gesamtschulden"'] || 'NOT FOUND');
            console.log('   - Total replacements: ', Object.keys(replacements).length);

            // Apply replacements to the document XML
            let processedXml = documentXml;
            let replacementCount = 0;
            Object.entries(replacements).forEach(([search, replace]) => {
                const regex = new RegExp(this.escapeRegex(search), 'g');
                const before = processedXml.length;
                processedXml = processedXml.replace(regex, (match) => {
                    replacementCount++;
                    return replace;
                });
            });
            
            console.log(`✅ Applied ${replacementCount} replacements in document`);

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
        
        // Get all creditors for counting
        const allCreditors = client.creditor_calculation_table || settlementData.creditor_payments || [];
        const creditorCount = allCreditors.length;
        
        // Find specific creditor (Finanzamt) or use default
        const finanzamtCreditor = this.findFinanzamtCreditor(allCreditors);
        
        // Find creditor position (index + 1)
        const creditorPosition = finanzamtCreditor ? 
            allCreditors.findIndex(c => c.name === finanzamtCreditor.name) + 1 : 12;
        
        // Calculate individual creditor payment
        const creditorAmount = finanzamtCreditor?.final_amount || finanzamtCreditor?.amount || 1677.64;
        const creditorTotalPayment = this.calculateCreditorPayment(creditorAmount, totalDebt, pfaendbarAmount);
        
        // Calculate tilgung percentage 
        const tilgungsquote = (creditorTotalPayment / creditorAmount) * 100;
        
        // Get birth date from client data or calculate
        const birthDate = client.geburtstag || this.calculateBirthDate();
        
        // Court determination
        const court = this.determineCourtFromAddress(client.address);
        
        // Income type determination
        const incomeType = this.determineIncomeType(client);
        
        // Address parsing
        const parsedAddress = this.parseAddress(client.address);
        
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
            
            // Address Components
            street: parsedAddress.street,
            city: parsedAddress.city,
            postalCode: parsedAddress.postalCode,
            
            // Financial Information  
            monthlyNetIncome,
            grossIncome,
            pfaendbarAmount,
            totalDebt,
            incomeType,
            
            // Creditor Information
            creditorCount,
            creditorPosition,
            finanzamtCreditor: {
                name: finanzamtCreditor?.name || 'Finanzamt Bochum-Süd',
                amount: creditorAmount,
                reference: finanzamtCreditor?.reference_number || '350/2141/2659',
                address: finanzamtCreditor?.address || 'Königsallee 21, 44789 Bochum'
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
        // Common replacements that might appear in quotes
        const replacements = {
            // Dates - various formats
            '"aktuelles Datum"': clientData.currentDate,
            '"Datum"': clientData.currentDate,
            '"Startdatum Zahlungsplan"': clientData.planStartDate,
            '"Deadline für Zustimmung"': clientData.deadlineDate,
            
            // Client Information
            '"Vorname Nachname Mandant"': clientData.fullName,
            '"Name Mandant"': clientData.fullName,
            '"Herr/Frau Name Mandant"': `${this.getGenderTitle(clientData)} ${clientData.fullName}`,
            '"Vorname"': clientData.firstName,
            '"Nachname"': clientData.lastName,
            '"Geburtsdatum"': clientData.birthDate,
            '"Familienstand"': this.getMaritalStatusText(clientData.maritalStatus),
            
            // Address
            '"Adresse Mandant"': clientData.address,
            '"Straße"': clientData.street,
            '"PLZ Ort"': `${clientData.postalCode} ${clientData.city}`,
            
            // Financial Information
            '"Gesamtschulden"': this.formatGermanCurrency(clientData.totalDebt),
            '"Bruttoeinkommen"': this.formatGermanCurrency(clientData.grossIncome),
            '"Nettoeinkommen"': this.formatGermanCurrency(clientData.monthlyNetIncome),
            '"pfändbarer Betrag"': this.formatGermanCurrency(clientData.pfaendbarAmount),
            '"Einkommensart"': clientData.incomeType,
            
            // Creditor Information
            '"Anzahl Gläubiger"': clientData.creditorCount.toString(),
            '"Name Gläubiger"': clientData.finanzamtCreditor.name,
            '"Adresse Gläubiger"': clientData.finanzamtCreditor.address,
            '"Forderungsbetrag"': this.formatGermanCurrency(clientData.finanzamtCreditor.amount),
            '"Gesamttilgungsbetrag"': this.formatGermanCurrency(clientData.creditorTotalPayment),
            '"Tilgungsquote"': `${clientData.tilgungsquote.toFixed(2).replace('.', ',')}%`,
            '"laufende Nummer"': clientData.creditorPosition.toString(),
            
            // Reference Numbers
            '"Aktenzeichen"': `${clientData.reference}/TS-JK`,
            '"Referenznummer Gläubiger"': clientData.finanzamtCreditor.reference,
            
            // Court Information
            '"zuständiges Amtsgericht"': clientData.court,
            '"Ort Amtsgericht"': clientData.courtAddress,
            
            // Also include the specific values from the template (as fallback)
            '02.05.2025': clientData.currentDate,
            '01.08.2025': clientData.planStartDate,
            '16.05.2025': clientData.deadlineDate,
            'Alexander Drewitz': clientData.fullName,
            'Alexander': clientData.firstName,
            'Drewitz': clientData.lastName,
            'Herr Drewitz': `Herr ${clientData.lastName}`,
            'Herr Alexander Drewitz': `Herr ${clientData.fullName}`,
            '97.357,73': this.formatGermanCurrency(clientData.totalDebt),
            '2.750,00': this.formatGermanCurrency(clientData.grossIncome),
            '680,78': this.formatGermanCurrency(clientData.pfaendbarAmount),
            '880,78': this.formatGermanCurrency(clientData.pfaendbarAmount),
            '1.677,64': this.formatGermanCurrency(clientData.finanzamtCreditor.amount),
            '546,38': this.formatGermanCurrency(clientData.creditorTotalPayment),
            '32,57%': `${clientData.tilgungsquote.toFixed(2).replace('.', ',')}%`,
            '99/25 TS-JK': `${clientData.reference}/TS-JK`,
            '99/25 TS.JK': `${clientData.reference}/TS-JK`, 
            '350/2141/2659': clientData.finanzamtCreditor.reference || clientData.reference,
            '24.11.1985': clientData.birthDate,
            'verheiratet': this.getMaritalStatusText(clientData.maritalStatus),
            'Amtsgericht Bochum': clientData.court,
            'Bochum': clientData.courtAddress,
            '12 Gläubigern': `${clientData.creditorCount} Gläubigern`,
            'Nummer 12': `Nummer ${clientData.creditorPosition}`
        };
        
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
        return statusMap[status] || 'verheiratet';
    }
    
    /**
     * Get gender title (Herr/Frau)
     */
    getGenderTitle(clientData) {
        // Check if we have gender information in client data
        if (clientData.gender) {
            return clientData.gender === 'female' ? 'Frau' : 'Herr';
        }
        
        // Default to Herr for now
        // TODO: Consider adding gender field to client model or better detection
        return 'Herr';
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

    /**
     * Determine income type based on client data
     */
    determineIncomeType(client) {
        // Check financial data for income type indicators
        if (client.financial_data?.income_type) {
            return client.financial_data.income_type;
        }
        
        // Default to employment income
        return 'Erwerbstätigkeit';
    }

    /**
     * Parse address into components
     */
    parseAddress(address) {
        if (!address) {
            return {
                street: 'Musterstraße 1',
                postalCode: '44787',
                city: 'Bochum'
            };
        }
        
        // Simple address parsing - could be enhanced
        const parts = address.split(',').map(part => part.trim());
        
        // Try to extract postal code and city from last part
        const lastPart = parts[parts.length - 1] || '';
        const postalMatch = lastPart.match(/(\d{5})\s+(.+)/);
        
        return {
            street: parts[0] || 'Musterstraße 1',
            postalCode: postalMatch ? postalMatch[1] : '44787',
            city: postalMatch ? postalMatch[2] : 'Bochum'
        };
    }

    /**
     * Process the Nullplan template with client and creditor data
     */
    async processNullplanTemplate(clientReference, settlementData, creditorData) {
        try {
            console.log('📄 Processing Nullplan template with full client data...');

            // Get full client data from database
            const Client = require('../models/Client');
            const client = await Client.findOne({ aktenzeichen: clientReference });
            
            if (!client) {
                throw new Error(`Client not found: ${clientReference}`);
            }

            // Read the Nullplan template file
            const templateBuffer = fs.readFileSync(this.nullplanTemplatePath);
            const zip = await JSZip.loadAsync(templateBuffer);

            // Get the document XML
            const documentXml = await zip.file('word/document.xml').async('string');

            // Extract comprehensive client data for Nullplan
            const clientData = this.extractNullplanClientData(client, settlementData, creditorData);
            console.log('📊 Extracted Nullplan client data:', {
                name: clientData.fullName,
                totalDebt: clientData.totalDebt,
                creditorCount: clientData.creditorCount,
                planType: 'Nullplan'
            });

            // Build replacements for Nullplan
            const replacements = this.buildNullplanReplacements(clientData);
            
            console.log('🔄 Applying Nullplan replacements:', Object.keys(replacements).length, 'replacements');

            // Apply replacements to the document XML
            let processedXml = documentXml;
            let replacementCount = 0;
            Object.entries(replacements).forEach(([search, replace]) => {
                const regex = new RegExp(this.escapeRegex(search), 'g');
                const before = processedXml.length;
                processedXml = processedXml.replace(regex, (match) => {
                    replacementCount++;
                    return replace;
                });
            });
            
            console.log(`✅ Applied ${replacementCount} replacements in document`);

            // Update the document in the zip
            zip.file('word/document.xml', processedXml);

            // Generate the new document
            const outputBuffer = await zip.generateAsync({ type: 'nodebuffer' });

            // Save to documents folder
            const outputFilename = `Nullplan_${clientReference}_${new Date().toISOString().split('T')[0]}.docx`;
            const outputPath = path.join(__dirname, '../documents', outputFilename);
            
            fs.writeFileSync(outputPath, outputBuffer);

            console.log('✅ Nullplan template processed successfully');
            console.log(`📁 Output: ${outputFilename}`);

            return {
                success: true,
                filename: outputFilename,
                path: outputPath,
                size: outputBuffer.length
            };

        } catch (error) {
            console.error('❌ Error processing Nullplan template:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Extract client data specific to Nullplan documents
     */
    extractNullplanClientData(client, settlementData, creditorData) {
        const clientData = this.extractClientData(client, settlementData, 0); // 0 for pfändbar amount
        
        // Additional Nullplan-specific data
        const planStartDate = new Date();
        planStartDate.setMonth(planStartDate.getMonth() + 3); // 3 months from now
        
        return {
            ...clientData,
            // Override pfändbar amount for Nullplan
            pfaendbarAmount: 0,
            monthlyPayment: 0,
            
            // Nullplan specific
            planType: 'Nullplan',
            planDuration: '3 Jahre',
            planStartDate: planStartDate.toLocaleDateString('de-DE'),
            
            // Creditor for current letter (if generating individual letters)
            currentCreditor: creditorData && creditorData[0] ? {
                name: creditorData[0].name || creditorData[0].creditor_name,
                address: creditorData[0].address || `${creditorData[0].creditor_street || ''}, ${creditorData[0].creditor_postal_code || ''} ${creditorData[0].creditor_city || ''}`.trim(),
                reference: creditorData[0].reference_number || '',
                amount: creditorData[0].amount || creditorData[0].debt_amount || 0
            } : null
        };
    }

    /**
     * Build replacements for Nullplan template
     */
    buildNullplanReplacements(clientData) {
        const replacements = {
            // Common replacements from regular template
            ...this.buildReplacements(clientData),
            
            // Nullplan specific replacements
            '"Nullplan"': 'Nullplan',
            '"0,00 EUR"': '0,00 EUR',
            '"0,00 €"': '0,00 €',
            '"keine monatlichen Zahlungen"': 'keine monatlichen Zahlungen',
            '"3 Jahre"': clientData.planDuration,
            '"36 Monate"': '36 Monate',
            '"Laufzeit"': clientData.planDuration,
            
            // Zero amounts - various formats
            '"monatliche Rate"': '0,00 EUR',
            '"Monatsrate"': '0,00 EUR',
            '"pfändbar"': '0,00 EUR',
            '"pfändbares Einkommen"': '0,00 EUR',
            '"Tilgung"': '0,00 EUR',
            '"Zahlbetrag"': '0,00 EUR',
            '"monatlicher Betrag"': '0,00 EUR',
            '"Rate pro Monat"': '0,00 EUR',
            
            // Current creditor (for individual letters)
            '"Name aktueller Gläubiger"': clientData.currentCreditor?.name || 'Gläubiger',
            '"Adresse aktueller Gläubiger"': clientData.currentCreditor?.address || '',
            '"Referenz aktueller Gläubiger"': clientData.currentCreditor?.reference || '',
            '"Forderung aktueller Gläubiger"': this.formatGermanCurrency(clientData.currentCreditor?.amount || 0),
            
            // Legal text variations
            '"kein pfändbares Einkommen"': 'kein pfändbares Einkommen vorhanden',
            '"kein pfändbares Einkommen vorhanden"': 'kein pfändbares Einkommen vorhanden',
            '"Verbesserung der Verhältnisse"': 'Bei Verbesserung der wirtschaftlichen Verhältnisse',
            '"bei Verbesserung"': 'bei Verbesserung der wirtschaftlichen Verhältnisse',
            
            // Nullplan explanation text
            '"Nullplan Erklärung"': 'Da kein pfändbares Einkommen vorhanden ist, erfolgen keine regelmäßigen Zahlungen während der Laufzeit von 3 Jahren.',
            '"Überwachungsphase"': 'dreijährige Überwachungsphase',
            
            // Additional legal clauses
            '"Änderung der Verhältnisse"': 'Bei einer wesentlichen Verbesserung der Einkommenssituation wird der Zahlungsbetrag entsprechend angepasst.',
            '"Verpflichtung zur Mitteilung"': 'Der Schuldner verpflichtet sich, Änderungen seiner wirtschaftlichen Verhältnisse unverzüglich mitzuteilen.'
        };
        
        return replacements;
    }

    /**
     * Process the Quotenplan-Nullplan template (Nullplan with creditor quota table)
     */
    async processQuotenplanNullplanTemplate(clientReference, settlementData) {
        try {
            console.log('📄 Processing Quotenplan-Nullplan template with creditor quota table...');

            // Get full client data from database
            const Client = require('../models/Client');
            const client = await Client.findOne({ aktenzeichen: clientReference });
            
            if (!client) {
                throw new Error(`Client not found: ${clientReference}`);
            }

            // Read the Quotenplan-Nullplan template file
            const templateBuffer = fs.readFileSync(this.quotenplanNullplanTemplatePath);
            const zip = await JSZip.loadAsync(templateBuffer);

            // Get the document XML
            const documentXml = await zip.file('word/document.xml').async('string');

            // Extract comprehensive client data for Quotenplan-Nullplan
            const clientData = this.extractQuotenplanNullplanClientData(client, settlementData);
            console.log('📊 Extracted Quotenplan-Nullplan client data:', {
                name: clientData.fullName,
                totalDebt: clientData.totalDebt,
                creditorCount: clientData.creditorCount,
                planType: 'Quotenplan-Nullplan'
            });

            // Build replacements for Quotenplan-Nullplan
            const replacements = this.buildQuotenplanNullplanReplacements(clientData);
            
            console.log('🔄 Applying Quotenplan-Nullplan replacements:', Object.keys(replacements).length, 'replacements');

            // Apply replacements to the document XML
            let processedXml = documentXml;
            let replacementCount = 0;
            Object.entries(replacements).forEach(([search, replace]) => {
                const regex = new RegExp(this.escapeRegex(search), 'g');
                const before = processedXml.length;
                processedXml = processedXml.replace(regex, (match) => {
                    replacementCount++;
                    return replace;
                });
            });
            
            console.log(`✅ Applied ${replacementCount} replacements in document`);

            // Update the document in the zip
            zip.file('word/document.xml', processedXml);

            // Generate the new document
            const outputBuffer = await zip.generateAsync({ type: 'nodebuffer' });

            // Save to documents folder
            const outputFilename = `Quotenplan-Nullplan_${clientReference}_${new Date().toISOString().split('T')[0]}.docx`;
            const outputPath = path.join(__dirname, '../documents', outputFilename);
            
            fs.writeFileSync(outputPath, outputBuffer);

            console.log('✅ Quotenplan-Nullplan template processed successfully');
            console.log(`📁 Output: ${outputFilename}`);

            return {
                success: true,
                filename: outputFilename,
                path: outputPath,
                size: outputBuffer.length
            };

        } catch (error) {
            console.error('❌ Error processing Quotenplan-Nullplan template:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Extract client data specific to Quotenplan-Nullplan documents (Nullplan with quota table)
     */
    extractQuotenplanNullplanClientData(client, settlementData) {
        const clientData = this.extractClientData(client, settlementData, 0); // 0 for pfändbar amount
        
        // Get creditor data from settlement data or client
        const allCreditors = client.creditor_calculation_table || settlementData.creditor_payments || [];
        const totalDebt = client.creditor_calculation_total_debt || settlementData.total_debt || 0;
        
        // Build detailed creditor data with quotas
        const creditorDetails = allCreditors.map((creditor, index) => {
            const amount = creditor.final_amount || creditor.amount || creditor.debt_amount || 0;
            const quota = totalDebt > 0 ? (amount / totalDebt * 100) : 0;
            const monthlyQuota = 0; // Always 0 for Nullplan
            
            return {
                position: index + 1,
                name: creditor.name || creditor.creditor_name || `Gläubiger ${index + 1}`,
                reference: creditor.reference_number || '',
                amount: amount,
                quota: quota,
                monthlyQuota: monthlyQuota,
                totalPayment: 0 // Always 0 for Nullplan over 36 months
            };
        });
        
        return {
            ...clientData,
            // Override pfändbar amount for Nullplan
            pfaendbarAmount: 0,
            monthlyPayment: 0,
            
            // Quotenplan-Nullplan specific
            planType: 'Quotenplan-Nullplan',
            planDuration: '3 Jahre',
            creditorDetails,
            totalPaymentAllCreditors: 0,
            averageQuota: creditorDetails.length > 0 ? 
                creditorDetails.reduce((sum, c) => sum + c.quota, 0) / creditorDetails.length : 0
        };
    }

    /**
     * Build replacements for Quotenplan-Nullplan template
     */
    buildQuotenplanNullplanReplacements(clientData) {
        const replacements = {
            // Common replacements from regular template
            ...this.buildReplacements(clientData),
            
            // Quotenplan-Nullplan specific replacements
            '"Quotenplan Nullplan"': 'Quotenplan (Nullplan)',
            '"Nullplan mit Quoten"': 'Nullplan mit Gläubigerquoten',
            '"0,00 EUR"': '0,00 EUR',
            '"0,00 €"': '0,00 €',
            '"keine monatlichen Zahlungen"': 'keine monatlichen Zahlungen',
            '"3 Jahre"': clientData.planDuration,
            '"36 Monate"': '36 Monate',
            
            // Zero amounts - various formats
            '"monatliche Gesamtzahlung"': '0,00 EUR',
            '"Gesamtzahlung 36 Monate"': '0,00 EUR',
            '"Durchschnittsquote"': `${clientData.averageQuota.toFixed(2).replace('.', ',')}%`,
            '"Summe aller Raten"': '0,00 EUR',
            '"Gesamtsumme"': '0,00 EUR',
            
            // Creditor table placeholders and individual entries
            '"Gläubigertabelle"': this.buildCreditorTableText(clientData.creditorDetails),
            
            // Individual creditor data (for first few creditors as examples)
            ...this.buildIndividualCreditorReplacements(clientData.creditorDetails),
            
            // Legal text for Quotenplan-Nullplan
            '"Quotenerklärung"': 'Die Quoten zeigen die anteilige Verteilung der Forderungen. Da kein pfändbares Einkommen vorhanden ist, erfolgen keine Zahlungen während der 3-jährigen Überwachungsphase.',
            '"Überwachungszeit"': 'dreijährige Überwachungsphase ohne Zahlungen',
            '"Nullplan Begründung"': 'Aufgrund der wirtschaftlichen Verhältnisse ist kein pfändbares Einkommen vorhanden.',
            '"Quotenverteilung"': 'Die Quoten entsprechen dem Verhältnis der einzelnen Forderungen zur Gesamtschuld.'
        };
        
        return replacements;
    }

    /**
     * Build creditor table text for document replacement
     */
    buildCreditorTableText(creditorDetails) {
        if (!creditorDetails || creditorDetails.length === 0) {
            return 'Keine Gläubiger vorhanden.';
        }
        
        let tableText = '';
        creditorDetails.forEach(creditor => {
            tableText += `${creditor.position}. ${creditor.name} - ${this.formatGermanCurrency(creditor.amount)} (${creditor.quota.toFixed(2).replace('.', ',')}%) - Monatsquote: 0,00 EUR\n`;
        });
        
        return tableText.trim();
    }

    /**
     * Build individual creditor replacements for template variables
     */
    buildIndividualCreditorReplacements(creditorDetails) {
        const replacements = {};
        
        if (!creditorDetails || creditorDetails.length === 0) {
            return replacements;
        }
        
        // Create replacements for individual creditors (up to 20 creditors)
        creditorDetails.slice(0, 20).forEach((creditor, index) => {
            const position = index + 1;
            
            replacements[`"Gläubiger ${position} Name"`] = creditor.name;
            replacements[`"Gläubiger ${position} Betrag"`] = this.formatGermanCurrency(creditor.amount);
            replacements[`"Gläubiger ${position} Quote"`] = `${creditor.quota.toFixed(2).replace('.', ',')}%`;
            replacements[`"Gläubiger ${position} Monatsquote"`] = '0,00 EUR';
            replacements[`"Gläubiger ${position} Gesamtzahlung"`] = '0,00 EUR';
            replacements[`"Position ${position}"`] = position.toString();
            
            // Alternative formats
            replacements[`"Name ${position}"`] = creditor.name;
            replacements[`"Betrag ${position}"`] = this.formatGermanCurrency(creditor.amount);
            replacements[`"Quote ${position}"`] = `${creditor.quota.toFixed(2).replace('.', ',')}%`;
        });
        
        return replacements;
    }
}

module.exports = WordTemplateProcessor;