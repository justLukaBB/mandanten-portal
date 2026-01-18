const path = require('path');
const fs = require('fs-extra');
const axios = require('axios');

/**
 * Factory for Admin Document Controller
 * @param {Object} dependencies
 * @param {Model} dependencies.Client
 * @param {Object} dependencies.documentProcessor
 * @param {Function} dependencies.getGCSFileStream
 * @param {Function} dependencies.getGCSFileBuffer
 * @param {Function} dependencies.saveClient
 * @param {String} dependencies.uploadsDir
 */
const createAdminDocumentController = ({
    Client,
    documentProcessor,
    getGCSFileStream,
    getGCSFileBuffer,
    saveClient,
    uploadsDir
}) => {

    // Helper to serve mock PDF for testing
    const serveMockPDFDownload = (res, filename) => {
        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        doc.pipe(res);
        doc.fontSize(25).text('MOCK PDF DOCUMENT FOR TESTING', 100, 100);
        doc.fontSize(12).text(`Filename: ${filename}`, 100, 150);
        doc.fontSize(12).text(`Generated: ${new Date().toISOString()}`, 100, 170);
        doc.end();
    };

    return {
        // Download document
        downloadDocument: async (req, res) => {
            try {
                const { clientId, documentId } = req.params;

                console.log(`📥 Admin document download request: Client ${clientId}, Document ${documentId}`);

                const client = await Client.findOne({ $or: [{ id: clientId }, { aktenzeichen: clientId }] });

                if (!client) {
                    return res.status(404).json({ error: 'Client not found' });
                }

                // Find the document by ID
                const document = (client.documents || []).find(doc => doc.id === documentId);

                if (!document) {
                    return res.status(404).json({ error: 'Document not found' });
                }

                // For test scenarios, serve a mock PDF
                if (client.aktenzeichen?.startsWith('TEST_REVIEW_')) {
                    console.log(`📋 Serving mock PDF for test document ${document.name}`);
                    return serveMockPDFDownload(res, document.name);
                }

                const filename = document.filename || document.name;
                if (!filename) {
                    return res.status(404).json({ error: 'Document filename not found' });
                }

                // Log download for security auditing
                console.log(`📄 Admin downloading document ${documentId} (${filename}) for client ${client.aktenzeichen}`);

                // Set appropriate headers for download
                const mimeType = document.type || 'application/pdf';

                // Encode filename properly for special characters (RFC 5987)
                const downloadName = document.name || filename || `document_${documentId}.pdf`;
                const encodedFilename = encodeURIComponent(downloadName);
                const asciiFilename = downloadName.replace(/[^\x00-\x7F]/g, '_');

                res.setHeader('Content-Type', mimeType);
                res.setHeader('Content-Disposition', `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`);
                res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');

                try {
                    const fileStream = getGCSFileStream(filename);

                    fileStream.on('error', (err) => {
                        console.error(`❌ GCS stream error for ${filename}:`, err.message);
                        if (!res.headersSent) {
                            res.status(404).json({
                                error: 'File not found in storage',
                                details: err.message
                            });
                        }
                    });

                    fileStream.pipe(res);
                } catch (streamError) {
                    console.error('Error creating GCS stream:', streamError);
                    if (!res.headersSent) {
                        res.status(500).json({ error: 'Failed to retrieve file' });
                    }
                }

            } catch (error) {
                console.error('❌ Error downloading document:', error);
                if (!res.headersSent) {
                    res.status(500).json({
                        error: 'Failed to download document',
                        details: error.message
                    });
                }
            }
        },

        // Reprocess single document
        reprocessDocument: async (req, res) => {
            try {
                const { clientId, documentId } = req.params;
                const client = await Client.findOne({ $or: [{ id: clientId }, { aktenzeichen: clientId }] });

                if (!client) {
                    return res.status(404).json({ error: 'Client not found' });
                }

                const docIndex = client.documents?.findIndex(doc => doc.id === documentId);

                if (docIndex === -1) {
                    return res.status(404).json({ error: 'Document not found' });
                }

                const document = client.documents[docIndex];

                // For GCS, we need the filename to fetch content
                const gcsFilename = document.filename || document.name;

                if (!gcsFilename) {
                    return res.status(400).json({ error: 'Document has no filename/key' });
                }

                // Update status to processing
                client.documents[docIndex].processing_status = 'processing';
                client.documents[docIndex].processing_error = null;
                await saveClient(client);

                // Start reprocessing in background
                setImmediate(async () => {
                    try {
                        console.log(`Reprocessing document: ${document.name}`);

                        // Fetch file buffer
                        let fileBuffer;
                        try {
                            fileBuffer = await getGCSFileBuffer(gcsFilename);
                        } catch (err) {
                            // Try local file if GCS fails
                            const localPath = path.join(uploadsDir, clientId, gcsFilename);
                            if (fs.existsSync(localPath)) {
                                fileBuffer = fs.readFileSync(localPath);
                            } else {
                                throw err;
                            }
                        }

                        if (!fileBuffer) {
                            throw new Error('Could not retrieve file content');
                        }

                        const extractedData = await documentProcessor.processDocument(fileBuffer, document.name);
                        const validation = documentProcessor.validateExtraction(extractedData);
                        const summary = documentProcessor.generateSummary(extractedData);

                        // We need to fetch latest client version to update to avoid conflicts
                        const latestClient = await Client.findOne({ _id: client._id });
                        const latestDocIndex = latestClient.documents.findIndex(d => d.id === documentId);

                        if (latestDocIndex !== -1) {
                            latestClient.documents[latestDocIndex] = {
                                ...latestClient.documents[latestDocIndex].toObject(),
                                processing_status: 'completed',
                                extracted_data: extractedData,
                                validation: validation,
                                summary: summary,
                                processed_at: new Date().toISOString()
                            };
                            await saveClient(latestClient);
                        }

                        console.log(`Reprocessing completed for: ${document.name}`);
                    } catch (error) {
                        console.error(`Reprocessing failed for ${document.name}:`, error);

                        const errorClient = await Client.findOne({ _id: client._id });
                        const errorDocIndex = errorClient.documents.findIndex(d => d.id === documentId);

                        if (errorDocIndex !== -1) {
                            errorClient.documents[errorDocIndex].processing_status = 'failed';
                            errorClient.documents[errorDocIndex].processing_error = error.message;
                            errorClient.documents[errorDocIndex].processed_at = new Date().toISOString();
                            await saveClient(errorClient);
                        }
                    }
                });

                res.json({
                    success: true,
                    message: 'Document reprocessing started',
                    document_id: documentId
                });
            } catch (error) {
                console.error('Error starting reprocessing:', error);
                res.status(500).json({
                    error: 'Error starting reprocessing',
                    details: error.message
                });
            }
        },

        // Bulk reprocess all documents
        bulkReprocessDocuments: async (req, res) => {
            try {
                const { clientId } = req.params;
                const { confirmation, admin_id, reason } = req.body;

                // Require explicit confirmation
                if (!confirmation) {
                    return res.status(400).json({
                        error: 'Confirmation required',
                        message: 'You must explicitly confirm this destructive action'
                    });
                }

                const client = await Client.findOne({ $or: [{ id: clientId }, { aktenzeichen: clientId }] });

                if (!client) {
                    return res.status(404).json({ error: 'Client not found' });
                }

                // Check if documents exist
                if (!client.documents || client.documents.length === 0) {
                    return res.status(400).json({
                        error: 'No documents found',
                        message: 'This client has no documents to reprocess'
                    });
                }

                // Get documents count before reprocessing
                const documentsCount = client.documents.length;
                const documentIds = client.documents.map(doc => doc.id);

                console.log('Documents count:', documentsCount);

                // Reset all documents - clear AI results but preserve original metadata
                client.documents = client.documents.map((doc) => ({
                    // Preserve ORIGINAL metadata (CRITICAL)
                    id: doc.id, // KEEP SAME ID
                    name: doc.name,
                    filename: doc.filename,
                    type: doc.type,
                    size: doc.size,
                    url: doc.url, // Keep URL if exists
                    uploadedAt: doc.uploadedAt, // KEEP ORIGINAL UPLOAD DATE

                    // Reset processing state
                    processing_status: 'pending',
                    document_status: 'pending',

                    // Clear AI extraction results
                    extracted_data: null,
                    validation: null,
                    summary: null,

                    // Clear processing metadata
                    processing_error: null,
                    processing_time_ms: null,
                    processed_at: null,

                    // Reset review flags
                    confidence: null,
                    classification_success: null,
                    manual_review_required: false,
                    is_creditor_document: null,
                    is_duplicate: false,
                    duplicate_reason: null,

                    // Clear manual review data
                    manually_reviewed: false,
                    reviewed_at: null,
                    reviewed_by: null,

                    // Add reprocess tracking
                    reprocessed: true,
                    reprocessed_at: new Date().toISOString(),
                    reprocessed_by: admin_id || 'admin',
                    reprocess_reason: reason || 'Bulk reprocess requested'
                }));

                // IMPORTANT: Remove creditors from final_creditor_list that came from these documents
                const removedCreditorsCount = client.final_creditor_list ? client.final_creditor_list.length : 0;
                if (client.final_creditor_list && client.final_creditor_list.length > 0) {
                    client.final_creditor_list = client.final_creditor_list.filter(creditor => {
                        // Keep creditors that were manually added or from other sources
                        return creditor.created_via === 'manual_entry' ||
                            !documentIds.includes(creditor.document_id);
                    });

                    console.log(`Removed ${removedCreditorsCount - client.final_creditor_list.length} creditors from final list`);
                }

                // Add audit log entry to status_history
                const auditEntry = {
                    id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    status: 'documents_reprocessed_bulk',
                    changed_by: 'admin',
                    metadata: {
                        action: 'bulk_reprocess_documents',
                        admin_id: admin_id || 'unknown',
                        documents_count: documentsCount,
                        document_ids: documentIds,
                        reason: reason || 'Not provided',
                        timestamp: new Date().toISOString(),
                        creditors_removed: removedCreditorsCount - (client.final_creditor_list ? client.final_creditor_list.length : 0)
                    },
                    created_at: new Date()
                };

                if (!client.status_history) {
                    client.status_history = [];
                }
                client.status_history.push(auditEntry);

                // Save client with reset documents
                await saveClient(client);

                console.log(`\n========================================`);
                console.log(`📋 BULK REPROCESS INITIATED`);
                console.log(`========================================`);
                console.log(`Client: ${client.firstName} ${client.lastName} (${clientId})`);
                console.log(`Documents: ${documentsCount}`);

                // Queue all documents for reprocessing in background
                setImmediate(async () => {
                    let successCount = 0;
                    let failureCount = 0;

                    for (let i = 0; i < client.documents.length; i++) {
                        const doc = client.documents[i];

                        // Skip documents without filename
                        const gcsFilename = doc.filename || doc.name;

                        if (!gcsFilename) {
                            console.warn(`⚠️ Skipping document ${doc.id} - no filename`);
                            failureCount++;
                            continue;
                        }

                        // Fetch the file from GCS or local into a buffer for processing
                        let fileBuffer;
                        try {
                            try {
                                fileBuffer = await getGCSFileBuffer(gcsFilename);
                            } catch (err) {
                                // Fallback to local
                                const localPath = path.join(uploadsDir, clientId, gcsFilename);
                                if (fs.existsSync(localPath)) {
                                    fileBuffer = fs.readFileSync(localPath);
                                } else {
                                    throw err;
                                }
                            }

                            if (!fileBuffer) {
                                throw new Error('File buffer is empty');
                            }
                        } catch (fetchError) {
                            console.error(`❌ Failed to fetch file for reprocessing: ${doc.name} (${gcsFilename})`, fetchError.message);

                            const updatedClient = await Client.findOne({ _id: client._id });
                            const docIndex = updatedClient.documents.findIndex(d => d.id === doc.id);
                            if (docIndex !== -1) {
                                updatedClient.documents[docIndex].processing_status = 'error';
                                updatedClient.documents[docIndex].processing_error = `Failed to fetch: ${fetchError.message}`;
                                await saveClient(updatedClient);
                            }
                            failureCount++;
                            continue;
                        }

                        try {
                            // Update status to processing
                            const updatedClient = await Client.findOne({ _id: client._id });
                            const docIndex = updatedClient.documents.findIndex(d => d.id === doc.id);
                            if (docIndex !== -1) {
                                updatedClient.documents[docIndex].processing_status = 'processing';
                                await saveClient(updatedClient);
                            }

                            console.log(`🔄 Reprocessing [${i + 1}/${documentsCount}]: ${doc.name}`);

                            // Process document through AI pipeline
                            const extractedData = await documentProcessor.processDocument(fileBuffer, doc.name);
                            const validation = documentProcessor.validateExtraction(extractedData);
                            const summary = documentProcessor.generateSummary(extractedData);

                            // Update document with new results
                            const finalClient = await Client.findOne({ _id: client._id });
                            const finalDocIndex = finalClient.documents.findIndex(d => d.id === doc.id);

                            if (finalDocIndex !== -1) {
                                // CRITICAL: Preserve original metadata while updating results
                                const existingDoc = finalClient.documents[finalDocIndex].toObject ? finalClient.documents[finalDocIndex].toObject() : finalClient.documents[finalDocIndex];

                                finalClient.documents[finalDocIndex] = {
                                    ...existingDoc,
                                    // Explicitly ensure key metadata fields are preserved
                                    id: existingDoc.id,
                                    filename: existingDoc.filename,
                                    name: existingDoc.name,
                                    type: existingDoc.type,
                                    size: existingDoc.size,
                                    uploadedAt: existingDoc.uploadedAt,

                                    // Update processing results
                                    processing_status: 'completed',
                                    extracted_data: extractedData,
                                    validation: validation,
                                    summary: summary,
                                    processed_at: new Date().toISOString(),

                                    // Update flags based on new extraction
                                    is_creditor_document: extractedData?.is_creditor_document,
                                    confidence: extractedData?.confidence || validation?.confidence,
                                    classification_success: true,
                                    manual_review_required: validation?.requires_manual_review || false,

                                    // Clear any previous errors
                                    processing_error: null
                                };

                                await saveClient(finalClient);
                                successCount++;
                                console.log(`✅ Completed [${i + 1}/${documentsCount}]: ${doc.name}`);
                            }

                        } catch (error) {
                            console.error(`❌ Failed to reprocess ${doc.name}:`, error.message);

                            // Update document with error
                            const errorClient = await Client.findOne({ _id: client._id });
                            const errorDocIndex = errorClient.documents.findIndex(d => d.id === doc.id);
                            if (errorDocIndex !== -1) {
                                errorClient.documents[errorDocIndex].processing_status = 'error';
                                errorClient.documents[errorDocIndex].processing_error = error.message;
                                errorClient.documents[errorDocIndex].processed_at = new Date().toISOString();
                                await saveClient(errorClient);
                            }
                            failureCount++;
                        }

                        // Small delay between documents
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }

                    console.log(`\n========================================`);
                    console.log(`📊 BULK REPROCESS COMPLETED`);
                    console.log(`✅ Success: ${successCount}`);
                    console.log(`❌ Failed: ${failureCount}`);
                    console.log(`========================================\n`);
                });

                // Return immediate response
                res.json({
                    success: true,
                    message: 'Bulk document reprocessing started',
                    client_id: clientId,
                    documents_count: documentsCount,
                    estimated_time_minutes: Math.ceil(documentsCount * 0.5), // ~30 seconds per document
                    status: 'processing'
                });

            } catch (error) {
                console.error('❌ Error starting bulk reprocessing:', error);
                res.status(500).json({
                    error: 'Error starting bulk reprocessing',
                    details: error.message
                });
            }
        },

        // Manual Document Review
        reviewDocument: async (req, res) => {
            try {
                const { clientId, documentId } = req.params;
                const { document_status, admin_note, reviewed_by } = req.body;

                const client = await Client.findOne({ $or: [{ id: clientId }, { aktenzeichen: clientId }] });

                if (!client) {
                    return res.status(404).json({ error: 'Client not found' });
                }

                const docIndex = client.documents?.findIndex(doc => doc.id === documentId);

                if (docIndex === -1) {
                    return res.status(404).json({ error: 'Document not found' });
                }

                // Validate the new status
                const validStatuses = ['creditor_confirmed', 'non_creditor_confirmed', 'needs_review', 'duplicate'];
                if (!validStatuses.includes(document_status)) {
                    return res.status(400).json({ error: 'Invalid document status' });
                }

                // Update document with admin review
                client.documents[docIndex] = {
                    ...client.documents[docIndex].toObject ? client.documents[docIndex].toObject() : client.documents[docIndex],
                    document_status: document_status,
                    status_reason: admin_note || `Manuell geprüft: ${document_status}`,
                    admin_reviewed: true,
                    admin_reviewed_at: new Date().toISOString(),
                    admin_reviewed_by: reviewed_by || 'Admin',
                    manual_review_required: false, // Clear manual review flag after admin review

                    // Also update basic creditor flag based on status
                    is_creditor_document: document_status === 'creditor_confirmed'
                };

                await saveClient(client);

                console.log(`📋 Admin Review: Document "${client.documents[docIndex].name}" marked as "${document_status}"`);

                res.json({
                    success: true,
                    message: `Dokument erfolgreich als "${document_status}" markiert`,
                    document: {
                        id: documentId,
                        document_status: document_status,
                        status_reason: admin_note,
                        admin_reviewed: true,
                        admin_reviewed_at: client.documents[docIndex].admin_reviewed_at,
                        admin_reviewed_by: reviewed_by || 'Admin'
                    }
                });
            } catch (error) {
                console.error('Error reviewing document:', error);
                res.status(500).json({
                    error: 'Error reviewing document',
                    details: error.message
                });
            }
        },

        // Delete single document
        deleteDocument: async (req, res) => {
            try {
                const { clientId, documentId } = req.params;
                const client = await Client.findOne({ $or: [{ id: clientId }, { aktenzeichen: clientId }] });

                if (!client) {
                    return res.status(404).json({ error: 'Client not found' });
                }

                const documentIndex = client.documents.findIndex(doc => doc.id === documentId);

                if (documentIndex === -1) {
                    return res.status(404).json({ error: 'Document not found' });
                }

                const document = client.documents[documentIndex];
                const filename = document.filename || document.name;

                // Note: We don't delete from GCS essentially, unless requested by user config, 
                // but we can delete local fallback if exists
                if (uploadsDir) {
                    const filePath = path.join(uploadsDir, clientId, filename);
                    if (fs.existsSync(filePath)) {
                        fs.removeSync(filePath);
                    }
                }

                // Remove from client documents
                client.documents.splice(documentIndex, 1);
                await saveClient(client);

                res.json({ success: true, message: 'Dokument gelöscht' });
            } catch (error) {
                console.error('Error deleting document:', error);
                res.status(500).json({
                    error: 'Error deleting document',
                    details: error.message
                });
            }
        },

        // Delete all actions
        deleteAllDocuments: async (req, res) => {
            try {
                const { clientId } = req.params;

                console.log(`🗑️ Deleting ALL documents for client ${clientId}`);

                const client = await Client.findOne({ $or: [{ id: clientId }, { aktenzeichen: clientId }] });

                if (!client) {
                    return res.status(404).json({ error: 'Client not found' });
                }

                const docCount = client.documents ? client.documents.length : 0;

                // Clear documents array
                client.documents = [];

                await saveClient(client);

                console.log(`✅ Deleted ${docCount} documents for client ${clientId}`);

                res.json({
                    success: true,
                    message: `Successfully deleted ${docCount} documents from database`,
                    deleted_count: docCount
                });

            } catch (error) {
                console.error('Error deleting documents:', error);
                res.status(500).json({
                    error: 'Error deleting documents',
                    details: error.message
                });
            }
        }
    };
};

module.exports = createAdminDocumentController;
