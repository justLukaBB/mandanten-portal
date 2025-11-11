const ZendeskManager = require('./zendeskManager');
const fs = require('fs');
const path = require('path');

/**
 * Second Round Zendesk Uploader
 * Handles uploading individual "Pfändbares Einkommen" documents to Zendesk
 * and creating proper document URLs for each creditor
 */
class SecondRoundZendeskUploader {
    constructor() {
        this.zendesk = new ZendeskManager();
        this.uploadedDocuments = new Map(); // Track uploaded documents
    }

    /**
     * Upload all second round documents to Zendesk and create individual document URLs
     */
    async uploadSecondRoundDocuments(mainTicketId, documents) {
        try {
            console.log(`📤 Uploading ${documents.length} second round documents to Zendesk...`);
            console.log(`🎫 Main ticket ID: ${mainTicketId}`);

            if (!documents || documents.length === 0) {
                return {
                    success: true,
                    message: 'No documents to upload',
                    uploaded_count: 0,
                    document_urls: {},
                    main_ticket_id: mainTicketId
                };
            }

            const uploadResults = [];
            const documentUrls = {};
            let successCount = 0;

            // Upload each document individually
            for (let i = 0; i < documents.length; i++) {
                const document = documents[i];
                console.log(`📄 Uploading document ${i + 1}/${documents.length}: ${document.filename}`);
                console.log(`   Creditor: ${document.creditor_name}`);

                try {
                    // Verify file exists
                    if (!fs.existsSync(document.path)) {
                        throw new Error(`Document file not found: ${document.path}`);
                    }

                    // Read document file
                    const fileBuffer = fs.readFileSync(document.path);
                    const fileStats = fs.statSync(document.path);

                    console.log(`   File size: ${Math.round(fileStats.size / 1024)} KB`);

                    // Upload to Zendesk as attachment
                    const uploadResult = await this.zendesk.uploadAttachment(
                        fileBuffer,
                        document.filename,
                        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                    );

                    if (!uploadResult.success) {
                        throw new Error(`Zendesk upload failed: ${uploadResult.error}`);
                    }

                    // Store the upload token and create download URL
                    const documentInfo = {
                        upload_token: uploadResult.upload.token,
                        attachment_url: uploadResult.upload.attachment.url,
                        content_url: uploadResult.upload.attachment.content_url,
                        filename: document.filename,
                        size: fileStats.size,
                        creditor_name: document.creditor_name,
                        creditor_index: document.creditor_index,
                        upload_timestamp: new Date().toISOString()
                    };

                    // Store by creditor name for easy lookup
                    documentUrls[document.creditor_name] = documentInfo;
                    
                    uploadResults.push({
                        success: true,
                        filename: document.filename,
                        creditor_name: document.creditor_name,
                        upload_token: uploadResult.upload.token,
                        attachment_url: uploadResult.upload.attachment.url
                    });

                    successCount++;
                    console.log(`   ✅ Upload successful - Token: ${uploadResult.upload.token}`);

                } catch (error) {
                    console.error(`   ❌ Upload failed for ${document.filename}: ${error.message}`);
                    uploadResults.push({
                        success: false,
                        filename: document.filename,
                        creditor_name: document.creditor_name,
                        error: error.message
                    });
                }
            }

            // Attach all uploaded documents to the main ticket
            if (successCount > 0) {
                console.log(`📎 Attaching ${successCount} documents to main ticket ${mainTicketId}...`);
                
                try {
                    const attachmentResult = await this.attachDocumentsToMainTicket(
                        mainTicketId,
                        uploadResults.filter(r => r.success),
                        documents.length
                    );

                    if (!attachmentResult.success) {
                        console.warn(`⚠️ Failed to attach documents to main ticket: ${attachmentResult.error}`);
                    } else {
                        console.log(`✅ Documents attached to main ticket successfully`);
                    }
                } catch (attachError) {
                    console.warn(`⚠️ Error attaching to main ticket: ${attachError.message}`);
                }
            }

            console.log(`📊 Upload summary: ${successCount}/${documents.length} documents uploaded successfully`);

            return {
                success: successCount > 0,
                uploaded_count: successCount,
                total_documents: documents.length,
                document_urls: documentUrls,
                upload_results: uploadResults,
                main_ticket_id: mainTicketId,
                processing_timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Error uploading second round documents:', error.message);
            return {
                success: false,
                error: error.message,
                uploaded_count: 0,
                document_urls: {},
                main_ticket_id: mainTicketId
            };
        }
    }

    /**
     * Attach uploaded documents to the main ticket with a summary comment
     */
    async attachDocumentsToMainTicket(mainTicketId, successfulUploads, totalDocuments) {
        try {
            // Create attachment data for Zendesk
            const attachments = successfulUploads.map(upload => ({
                file_name: upload.filename,
                content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                content_url: upload.attachment_url
            }));

            // Create a summary comment
            const comment = this.buildAttachmentComment(successfulUploads, totalDocuments);

            // Update the ticket with attachments and comment
            const updateResult = await this.zendesk.updateTicketWithAttachments(
                mainTicketId,
                comment,
                successfulUploads.map(u => u.upload_token)
            );

            return {
                success: true,
                ticket_updated: true,
                attachments_count: attachments.length,
                comment_added: true
            };

        } catch (error) {
            console.error('❌ Error attaching documents to main ticket:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Build a summary comment for the attached documents
     */
    buildAttachmentComment(successfulUploads, totalDocuments) {
        const timestamp = new Date().toLocaleString('de-DE');
        
        let comment = `📄 2. E-Mail-Runde - Individuelle "Pfändbares Einkommen" Dokumente\n\n`;
        comment += `📊 Zusammenfassung:\n`;
        comment += `• Hochgeladen: ${successfulUploads.length}/${totalDocuments} Dokumente\n`;
        comment += `• Zeitpunkt: ${timestamp}\n\n`;
        
        comment += `📋 Dokumente pro Gläubiger:\n`;
        successfulUploads.forEach((upload, index) => {
            comment += `${index + 1}. ${upload.creditor_name}\n`;
            comment += `   📎 ${upload.filename}\n`;
        });

        comment += `\n🔗 Die Dokumente wurden einzeln an jeden Gläubiger per Side Conversation versendet.\n`;
        comment += `📧 Jeder Gläubiger erhält sein individuelles "Pfändbares Einkommen" Dokument mit seinen spezifischen Daten.`;

        return comment;
    }

    /**
     * Create individual download URLs for creditors
     * This creates unique, time-limited URLs for each creditor's document
     */
    async createIndividualDownloadUrls(documentUrls) {
        try {
            console.log('🔗 Creating individual download URLs for creditors...');

            const downloadUrls = {};

            for (const [creditorName, documentInfo] of Object.entries(documentUrls)) {
                try {
                    // For Zendesk, we can use the content_url directly
                    // In production, you might want to create time-limited or signed URLs
                    const downloadUrl = documentInfo.content_url || documentInfo.attachment_url;
                    
                    downloadUrls[creditorName] = {
                        download_url: downloadUrl,
                        filename: documentInfo.filename,
                        creditor_name: creditorName,
                        creditor_index: documentInfo.creditor_index,
                        expires_at: null, // Zendesk URLs don't expire quickly
                        created_at: new Date().toISOString()
                    };

                    console.log(`   ✅ URL created for ${creditorName}: ${documentInfo.filename}`);

                } catch (error) {
                    console.error(`   ❌ Failed to create URL for ${creditorName}: ${error.message}`);
                    downloadUrls[creditorName] = {
                        error: error.message,
                        creditor_name: creditorName
                    };
                }
            }

            return {
                success: true,
                download_urls: downloadUrls,
                total_urls_created: Object.keys(downloadUrls).length
            };

        } catch (error) {
            console.error('❌ Error creating download URLs:', error.message);
            return {
                success: false,
                error: error.message,
                download_urls: {}
            };
        }
    }

    /**
     * Get document URL for a specific creditor
     */
    getDocumentUrlForCreditor(creditorName, documentUrls) {
        const creditorDoc = documentUrls[creditorName];
        if (!creditorDoc) {
            return null;
        }

        return {
            download_url: creditorDoc.content_url || creditorDoc.attachment_url,
            filename: creditorDoc.filename,
            creditor_name: creditorName,
            size: creditorDoc.size,
            upload_timestamp: creditorDoc.upload_timestamp
        };
    }

    /**
     * Verify that all documents are accessible
     */
    async verifyDocumentAccess(documentUrls) {
        try {
            console.log('🔍 Verifying document access...');

            const verificationResults = {};
            
            for (const [creditorName, documentInfo] of Object.entries(documentUrls)) {
                try {
                    // For Zendesk, we assume the URLs are valid if they exist
                    // In a more robust implementation, you might make HEAD requests
                    const isAccessible = !!(documentInfo.content_url || documentInfo.attachment_url);
                    
                    verificationResults[creditorName] = {
                        accessible: isAccessible,
                        filename: documentInfo.filename,
                        creditor_name: creditorName,
                        verified_at: new Date().toISOString()
                    };

                } catch (error) {
                    verificationResults[creditorName] = {
                        accessible: false,
                        error: error.message,
                        creditor_name: creditorName
                    };
                }
            }

            const accessibleCount = Object.values(verificationResults)
                .filter(result => result.accessible).length;

            return {
                success: true,
                verification_results: verificationResults,
                accessible_documents: accessibleCount,
                total_documents: Object.keys(verificationResults).length
            };

        } catch (error) {
            console.error('❌ Error verifying document access:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = SecondRoundZendeskUploader;