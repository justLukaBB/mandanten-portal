const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
const DocumentGenerator = require('./documentGenerator');
const { convertDocxToPdf } = require('./documentConverter');

class CreditorDocumentPackageGenerator {
    constructor() {
        this.documentsDir = path.join(__dirname, '../documents');
        this.documentGenerator = new DocumentGenerator();
    }

    /**
     * Generate complete creditor document package as merged PDF
     * Contains all 3 documents: Schuldenbereinigungsplan, Forderungsübersicht, Ratenplan
     */
    async generateCompleteCreditorPackage(clientData, settlementData) {
        try {
            console.log('🔄 Starting complete creditor document package generation...');
            
            const clientReference = clientData.reference || clientData.aktenzeichen || 'UNKNOWN';
            const dateString = new Date().toISOString().split('T')[0];
            
            // Step 1: Generate all 3 Word documents
            console.log('📝 Generating Word documents...');
            const documents = await this.generateAllWordDocuments(clientData, settlementData, clientReference);
            
            // Step 2: Convert all Word documents to PDF
            console.log('🔄 Converting Word documents to PDF...');
            const pdfDocuments = await this.convertAllDocumentsToPdf(documents);
            
            // Step 3: Merge all PDFs into one document
            console.log('📄 Merging PDFs into final document...');
            const mergedPdf = await this.mergePdfDocuments(pdfDocuments);

            // Step 4: Save the final merged PDF
            const finalFilename = `Complete-Creditor-Package_${clientReference}_${dateString}.pdf`;
            const finalPath = path.join(this.documentsDir, finalFilename);

            await fs.writeFile(finalPath, mergedPdf);

            // Report what was successfully merged
            const includedDocs = Object.keys(pdfDocuments);
            const totalDocs = 3; // Expected: schuldenbereinigungsplan, forderungsuebersicht, ratenplan
            console.log(`✅ Complete creditor package generated: ${finalFilename}`);
            console.log(`📦 Documents included: ${includedDocs.length}/${totalDocs} - ${includedDocs.join(', ')}`);
            
            return {
                success: true,
                filename: finalFilename,
                path: finalPath,
                size: mergedPdf.length,
                documents: {
                    schuldenbereinigungsplan: documents.schuldenbereinigungsplan,
                    forderungsuebersicht: documents.forderungsuebersicht,
                    ratenplan: documents.ratenplan
                }
            };
            
        } catch (error) {
            console.error('❌ Error generating complete creditor package:', error);
            throw error;
        }
    }

    /**
     * Generate all 3 Word documents required for creditors
     */
    async generateAllWordDocuments(clientData, settlementData, clientReference) {
        console.log('📝 Generating individual Word documents...');
        
        // Calculate pfändbar amount from settlement data
        const pfaendbarAmount = settlementData.pfaendbar_amount || 
                               settlementData.monthly_payment || 
                               clientData.financial_data?.pfaendbar_amount || 0;
        
        const documents = {};
        
        // 1. Generate Schuldenbereinigungsplan
        try {
            console.log('  📋 Generating Schuldenbereinigungsplan...');
            const schuldenplan = await this.documentGenerator.generateSettlementPlanDocument(
                clientReference,
                settlementData
            );
            documents.schuldenbereinigungsplan = schuldenplan;
            console.log('  ✅ Schuldenbereinigungsplan generated');
        } catch (error) {
            console.error('  ❌ Error generating Schuldenbereinigungsplan:', error.message);
            throw error;
        }

        // 2. Generate Forderungsübersicht
        try {
            console.log('  📋 Generating Forderungsübersicht...');
            const forderungsuebersicht = await this.documentGenerator.generateForderungsuebersichtDocument(clientReference);
            documents.forderungsuebersicht = forderungsuebersicht;
            console.log('  ✅ Forderungsübersicht generated');
        } catch (error) {
            console.error('  ❌ Error generating Forderungsübersicht:', error.message);
            throw error;
        }

        // 3. Generate Ratenplan pfändbares Einkommen
        try {
            console.log('  📋 Generating Ratenplan pfändbares Einkommen...');
            const ratenplan = await this.documentGenerator.generateRatenplanPfaendbaresEinkommen(
                clientReference,
                settlementData
            );
            documents.ratenplan = ratenplan;
            console.log('  ✅ Ratenplan pfändbares Einkommen generated');
        } catch (error) {
            console.error('  ❌ Error generating Ratenplan:', error.message);
            throw error;
        }
        
        return documents;
    }

    /**
     * Convert all Word documents to PDF
     */
    async convertAllDocumentsToPdf(documents) {
        console.log('🔄 Converting all documents to PDF...');
        const pdfDocuments = {};
        
        for (const [docType, docInfo] of Object.entries(documents)) {
            try {
                console.log(`  📄 Converting ${docType} to PDF...`);
                
                // Handle different document info structures
                const docPath = docInfo?.document_info?.path || docInfo?.path;
                const docFilename = docInfo?.document_info?.filename || docInfo?.filename;
                
                if (!docPath) {
                    console.warn(`  ⚠️ Document ${docType} missing path, skipping...`);
                    console.warn(`  🔍 Document info structure:`, JSON.stringify(docInfo, null, 2));

                    // Check if this was a generation failure
                    if (docInfo?.success === false && docInfo?.error) {
                        console.warn(`  💡 Document generation failed: ${docInfo.error}`);
                    }
                    continue;
                }
                
                // Convert Word document to PDF
                const pdfBuffer = await convertDocxToPdf(docPath);
                pdfDocuments[docType] = {
                    buffer: pdfBuffer,
                    filename: docFilename ? docFilename.replace('.docx', '.pdf') : `${docType}.pdf`
                };
                
                console.log(`  ✅ ${docType} converted to PDF`);
                
            } catch (error) {
                console.error(`  ❌ Error converting ${docType} to PDF:`, error.message);
                // Continue with other documents even if one fails
            }
        }
        
        return pdfDocuments;
    }

    /**
     * Merge multiple PDF documents into one
     */
    async mergePdfDocuments(pdfDocuments) {
        console.log('📄 Merging PDFs into single document...');
        
        const mergedPdf = await PDFDocument.create();
        
        // Define the order of documents in final PDF
        const documentOrder = ['schuldenbereinigungsplan', 'forderungsuebersicht', 'ratenplan'];
        
        for (const docType of documentOrder) {
            if (pdfDocuments[docType]) {
                try {
                    console.log(`  📄 Adding ${docType} to merged PDF...`);
                    
                    const pdfDoc = await PDFDocument.load(pdfDocuments[docType].buffer);
                    const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
                    
                    pages.forEach((page) => {
                        mergedPdf.addPage(page);
                    });
                    
                    console.log(`  ✅ ${docType} added to merged PDF`);
                    
                } catch (error) {
                    console.error(`  ❌ Error merging ${docType}:`, error.message);
                }
            } else {
                console.warn(`  ⚠️ ${docType} PDF not available for merging`);
            }
        }
        
        const pdfBytes = await mergedPdf.save();
        console.log('✅ PDF merge completed');
        
        return pdfBytes;
    }

    /**
     * Get settlement plan dates and payment details for a specific creditor
     */
    getCreditorPaymentDetails(settlementData, creditorIndex) {
        if (!settlementData || !settlementData.creditors) {
            return null;
        }
        
        const creditor = settlementData.creditors[creditorIndex];
        if (!creditor) {
            return null;
        }
        
        return {
            creditor_name: creditor.name,
            debt_amount: creditor.debt_amount,
            monthly_payment: creditor.monthly_payment,
            total_payment: creditor.total_payment,
            settlement_quota: creditor.settlement_quota,
            settlement_start_date: settlementData.start_date || '01.08.2025',
            settlement_duration_months: settlementData.duration_months || 36
        };
    }

    /**
     * Generate settlement plan summary for inclusion in main Insolvenzantrag
     */
    async generateSettlementSummaryForInsolvenz(clientData, settlementData) {
        console.log('📊 Generating settlement summary for Insolvenzantrag...');
        
        const totalCreditors = settlementData.creditors?.length || 0;
        const totalDebt = settlementData.total_debt || 0;
        const averageQuota = settlementData.average_quota_percentage || 0;
        const pfaendbarAmount = settlementData.pfaendbar_amount || 0;
        const settlementDuration = settlementData.duration_months || 36;
        
        const summary = {
            settlement_plan_date: new Date().toLocaleDateString('de-DE'),
            total_creditors: totalCreditors,
            total_debt_amount: totalDebt,
            average_settlement_quota: averageQuota,
            monthly_pfaendbar_amount: pfaendbarAmount,
            settlement_duration_months: settlementDuration,
            total_settlement_amount: pfaendbarAmount * settlementDuration,
            has_settlement_plan: true
        };
        
        console.log('📊 Settlement summary:', summary);
        return summary;
    }
}

module.exports = CreditorDocumentPackageGenerator;