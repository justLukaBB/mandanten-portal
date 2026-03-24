const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const rateLimits = require('../middleware/security').rateLimits;
const { authenticateAdmin } = require('../middleware/auth');
const createAdminDocumentController = require('../controllers/adminDocumentController');

module.exports = ({ Client, documentProcessor, getGCSFileStream, getGCSFileBuffer, saveClient, uploadsDir }) => {

    // Create controller with dependencies
    const adminDocumentController = createAdminDocumentController({
        Client,
        documentProcessor,
        getGCSFileStream,
        getGCSFileBuffer,
        saveClient,
        uploadsDir
    });

    // --- Document Management Routes ---

    // Download document by document ID
    router.get('/clients/:clientId/documents/:documentId/download',
        rateLimits.admin,
        authenticateAdmin,
        adminDocumentController.downloadDocument
    );

    // Download multiple documents as ZIP (per category)
    router.post('/clients/:clientId/documents/download-zip',
        rateLimits.admin,
        authenticateAdmin,
        adminDocumentController.downloadZipDocuments
    );

    // Trigger reprocessing of a document
    // Using admin rate limit mostly, but client ID param is there. 
    // This action is heavy so admin rate limit is appropriate (usually higher limit but stricter access)
    // Actually authenticateAdmin ensures it's admin.
    router.post('/clients/:clientId/documents/:documentId/reprocess',
        authenticateAdmin, // Explicitly require admin auth for reprocessing
        adminDocumentController.reprocessDocument
    );

    // Bulk reprocess ALL documents for a client
    router.post('/clients/:clientId/documents/reprocess-all',
        authenticateAdmin,
        adminDocumentController.bulkReprocessDocuments
    );

    // Delete ALL documents: DB only (Danger Zone)
    router.delete('/clients/:clientId/documents/delete-all',
        authenticateAdmin,
        adminDocumentController.deleteAllDocuments
    );

    // Admin: Manual document review
    router.patch('/clients/:clientId/documents/:documentId/review',
        authenticateAdmin,
        adminDocumentController.reviewDocument
    );

    // Delete single document
    router.delete('/clients/:clientId/documents/:documentId',
        authenticateAdmin,
        adminDocumentController.deleteDocument
    );

    // Download generated first-round document (Erstschreiben DOCX)
    // Serves from disk if available, otherwise re-generates on-the-fly
    router.get('/clients/:clientId/generated-documents/first-round/:filename',
        rateLimits.admin,
        authenticateAdmin,
        async (req, res) => {
            try {
                const { clientId, filename } = req.params;

                // Sanitize filename to prevent directory traversal
                const safeFilename = path.basename(filename);
                if (safeFilename !== filename) {
                    return res.status(400).json({ error: 'Invalid filename' });
                }

                // Verify the client exists and has this creditor document
                const client = await Client.findById(clientId).lean();
                if (!client) {
                    return res.status(404).json({ error: 'Client not found' });
                }

                const creditor = (client.final_creditor_list || []).find(
                    c => c.first_round_document_filename === safeFilename
                );
                if (!creditor) {
                    return res.status(403).json({ error: 'Document does not belong to this client' });
                }

                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
                res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);

                // Try serving from disk first
                const filePath = path.join(__dirname, '..', 'generated_documents', 'first_round', safeFilename);
                if (fs.existsSync(filePath)) {
                    return fs.createReadStream(filePath).pipe(res);
                }

                // File not on disk — re-generate on-the-fly
                console.log(`📄 Re-generating ${safeFilename} on-the-fly (not found on disk)`);
                const FirstRoundDocumentGenerator = require('../services/firstRoundDocumentGenerator');
                const generator = new FirstRoundDocumentGenerator();

                // Build clientData in the same shape creditorContactService uses
                let street = client.strasse || '';
                let houseNumber = client.hausnummer || '';
                let zipCode = client.plz || '';
                let city = client.wohnort || '';

                if (!street && !zipCode && client.address) {
                    const parts = client.address.match(/^(.+?)\s+(\d+[a-zA-Z]?),?\s*(\d{5})\s+(.+)$/);
                    if (parts) {
                        street = parts[1];
                        houseNumber = parts[2];
                        zipCode = parts[3];
                        city = parts[4];
                    }
                }

                const clientData = {
                    name: `${client.firstName} ${client.lastName}`,
                    reference: client.aktenzeichen,
                    address: client.address || '',
                    street,
                    houseNumber,
                    zipCode,
                    city,
                    birthdate: client.geburtstag || '',
                };

                const result = await generator.generateSingleCreditorDocument(clientData, creditor);
                // The generator wrote the file to disk — stream it
                fs.createReadStream(result.path).pipe(res);
            } catch (err) {
                console.error('Error downloading generated document:', err);
                res.status(500).json({ error: 'Failed to download document' });
            }
        }
    );

    // Download generated second-round document (Zweitschreiben DOCX)
    // Serves from disk only — no on-the-fly re-generation
    router.get('/clients/:clientId/generated-documents/second-round/:filename',
        rateLimits.admin,
        authenticateAdmin,
        async (req, res) => {
            try {
                const { clientId, filename } = req.params;

                // Sanitize filename to prevent directory traversal
                const safeFilename = path.basename(filename);
                if (safeFilename !== filename) {
                    return res.status(400).json({ error: 'Invalid filename' });
                }

                // Verify the client exists and has this creditor document
                const client = await Client.findById(clientId).lean();
                if (!client) {
                    return res.status(404).json({ error: 'Client not found' });
                }

                const creditor = (client.final_creditor_list || []).find(
                    c => c.second_letter_document_filename === safeFilename
                );
                if (!creditor) {
                    return res.status(403).json({ error: 'Document does not belong to this client' });
                }

                const filePath = path.join(__dirname, '..', 'generated_documents', 'second_round', clientId, safeFilename);
                if (!fs.existsSync(filePath)) {
                    return res.status(404).json({ error: 'Document file not found on disk' });
                }

                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
                res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
                fs.createReadStream(filePath).pipe(res);
            } catch (err) {
                console.error('Error downloading second-round document:', err);
                res.status(500).json({ error: 'Failed to download document' });
            }
        }
    );

    return router;
};
