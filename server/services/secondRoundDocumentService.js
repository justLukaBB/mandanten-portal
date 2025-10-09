const DocumentGenerator = require('./documentGenerator');
const fs = require('fs');
const path = require('path');

/**
 * Second Round Document Service
 * Generates individual "Pfändbares Einkommen" documents for each creditor for the 2nd email round
 */
class SecondRoundDocumentService {
    constructor() {
        this.documentGenerator = new DocumentGenerator();
        this.outputDir = path.join(__dirname, '../generated_documents/second_round');
        
        // Ensure output directory exists
        this.ensureOutputDirectory();
    }

    /**
     * Ensure output directory exists
     */
    async ensureOutputDirectory() {
        try {
            if (!fs.existsSync(this.outputDir)) {
                fs.mkdirSync(this.outputDir, { recursive: true });
                console.log(`📁 Created second round output directory: ${this.outputDir}`);
            }
        } catch (error) {
            console.error('❌ Error creating output directory:', error.message);
        }
    }

    /**
     * Main function to generate all second round documents for a client
     * This generates individual "Pfändbares Einkommen" documents for each creditor
     */
    async generateSecondRoundDocuments(clientReference, settlementData = null) {
        try {
            console.log(`\n🚀 Starting 2nd round document generation for client: ${clientReference}`);

            // Get client data from database
            const Client = require('../models/Client');
            const client = await Client.findOne({ aktenzeichen: clientReference });
            
            if (!client) {
                throw new Error(`Client not found: ${clientReference}`);
            }

            // Prepare client data for document generation
            const clientData = {
                name: `${client.firstName} ${client.lastName}`,
                firstName: client.firstName,
                lastName: client.lastName,
                reference: client.aktenzeichen,
                email: client.email,
                address: client.address,
                financial_data: client.financial_data
            };

            // Get settlement data if not provided
            if (!settlementData) {
                settlementData = this.prepareSettlementData(client);
            }

            // Calculate pfändbar amount
            const pfaendbarAmount = this.calculatePfaendbarAmount(client, settlementData);

            console.log(`📊 Client: ${clientData.name}`);
            console.log(`💰 Pfändbar amount: €${pfaendbarAmount.toFixed(2)}`);
            console.log(`👥 Creditors: ${settlementData.creditor_payments?.length || 0}`);

            // Check if this is a Nullplan case
            if (pfaendbarAmount < 1) {
                console.log('⚠️ Nullplan case detected - no pfändbares Einkommen documents needed');
                return {
                    success: true,
                    is_nullplan: true,
                    message: 'Nullplan case - no second round documents generated',
                    client_reference: clientReference,
                    pfaendbar_amount: pfaendbarAmount,
                    documents: [],
                    total_documents: 0
                };
            }

            // Generate individual "Pfändbares Einkommen" documents using the new DocumentGenerator
            console.log('📄 Generating individual "Pfändbares Einkommen" documents...');
            
            const generationResult = await this.documentGenerator.generateRatenplanDocument(
                clientData,
                settlementData,
                pfaendbarAmount
            );

            if (!generationResult.success) {
                throw new Error(`Document generation failed: ${generationResult.error || 'Unknown error'}`);
            }

            // Process the results to match our expected format
            const processedDocuments = this.processGenerationResults(generationResult, clientReference);

            console.log(`✅ Second round document generation completed:`);
            console.log(`   - Total documents: ${processedDocuments.length}`);
            console.log(`   - Client: ${clientReference}`);
            
            return {
                success: true,
                is_nullplan: false,
                client_reference: clientReference,
                pfaendbar_amount: pfaendbarAmount,
                total_documents: processedDocuments.length,
                total_creditors: settlementData.creditor_payments?.length || 0,
                documents: processedDocuments,
                summary: `Generated ${processedDocuments.length} individual "Pfändbares Einkommen" documents`,
                generation_timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Error in second round document generation:', error.message);
            return {
                success: false,
                error: error.message,
                client_reference: clientReference,
                generation_timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Process the document generation results into our expected format
     */
    processGenerationResults(generationResult, clientReference) {
        const documents = [];

        // Handle both single document and multi-document results
        if (generationResult.documents && Array.isArray(generationResult.documents)) {
            // Multi-document result (new format)
            generationResult.documents.forEach((doc, index) => {
                documents.push({
                    creditor_name: doc.creditor_name || `Creditor ${index + 1}`,
                    creditor_index: doc.creditor_index || index + 1,
                    filename: doc.filename,
                    path: doc.path,
                    size: doc.size,
                    document_type: 'pfaendbares_einkommen',
                    client_reference: clientReference,
                    generated_at: new Date().toISOString()
                });
            });
        } else if (generationResult.success && generationResult.filename) {
            // Single document result (fallback)
            documents.push({
                creditor_name: 'General Document',
                creditor_index: 1,
                filename: generationResult.filename,
                path: generationResult.path,
                size: generationResult.size,
                document_type: 'pfaendbares_einkommen',
                client_reference: clientReference,
                generated_at: new Date().toISOString()
            });
        }

        return documents;
    }

    /**
     * Prepare settlement data from client information
     */
    prepareSettlementData(client) {
        // Get creditor data from confirmed creditor list
        const creditors = client.final_creditor_list || client.creditor_calculation_table || [];
        
        // Calculate total debt
        const totalDebt = creditors.reduce((sum, creditor) => {
            return sum + (creditor.claim_amount || creditor.final_amount || creditor.amount || 0);
        }, 0);

        // Convert creditors to expected format
        const creditorPayments = creditors.map((creditor, index) => ({
            creditor_name: creditor.creditor_name || creditor.sender_name || `Creditor ${index + 1}`,
            name: creditor.creditor_name || creditor.sender_name || `Creditor ${index + 1}`,
            debt_amount: creditor.claim_amount || creditor.final_amount || creditor.amount || 0,
            final_amount: creditor.claim_amount || creditor.final_amount || creditor.amount || 0,
            amount: creditor.claim_amount || creditor.final_amount || creditor.amount || 0,
            creditor_address: creditor.creditor_address || this.buildCreditorAddress(creditor),
            creditor_street: creditor.creditor_street,
            creditor_postal_code: creditor.creditor_postal_code,
            creditor_city: creditor.creditor_city,
            reference_number: creditor.reference_number || creditor.creditor_reference,
            creditor_reference: creditor.reference_number || creditor.creditor_reference
        }));

        return {
            total_debt: totalDebt,
            creditor_payments: creditorPayments,
            plan_type: 'quotenplan', // Will be determined by pfändbar amount
            duration_months: 36,
            start_date: '01.01.2026'
        };
    }

    /**
     * Build creditor address from individual components
     */
    buildCreditorAddress(creditor) {
        const parts = [];
        
        if (creditor.creditor_street) parts.push(creditor.creditor_street);
        
        const cityPart = [];
        if (creditor.creditor_postal_code) cityPart.push(creditor.creditor_postal_code);
        if (creditor.creditor_city) cityPart.push(creditor.creditor_city);
        if (cityPart.length > 0) parts.push(cityPart.join(' '));
        
        return parts.length > 0 ? parts.join(', ') : 'Adresse nicht verfügbar';
    }

    /**
     * Calculate pfändbar amount for the client
     */
    calculatePfaendbarAmount(client, settlementData) {
        // Try multiple sources for pfändbar amount
        return settlementData?.garnishable_amount ||
               settlementData?.monthly_payment ||
               client.debt_settlement_plan?.pfaendbar_amount ||
               client.financial_data?.pfaendbar_amount ||
               client.calculated_settlement_plan?.garnishable_amount ||
               0;
    }

    /**
     * Get detailed document information for a specific client
     */
    async getDocumentInfo(clientReference) {
        try {
            // Check for existing second round documents
            const clientOutputDir = path.join(this.outputDir, clientReference);
            
            if (!fs.existsSync(clientOutputDir)) {
                return {
                    success: true,
                    client_reference: clientReference,
                    documents_exist: false,
                    message: 'No second round documents found'
                };
            }

            // List all documents for this client
            const files = fs.readdirSync(clientOutputDir);
            const documents = files
                .filter(file => file.endsWith('.docx'))
                .map(file => {
                    const filePath = path.join(clientOutputDir, file);
                    const stats = fs.statSync(filePath);
                    
                    return {
                        filename: file,
                        path: filePath,
                        size: stats.size,
                        created_at: stats.birthtime.toISOString(),
                        modified_at: stats.mtime.toISOString()
                    };
                });

            return {
                success: true,
                client_reference: clientReference,
                documents_exist: documents.length > 0,
                total_documents: documents.length,
                documents: documents
            };

        } catch (error) {
            console.error('❌ Error getting document info:', error.message);
            return {
                success: false,
                error: error.message,
                client_reference: clientReference
            };
        }
    }
}

module.exports = SecondRoundDocumentService;