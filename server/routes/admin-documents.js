const express = require('express');
const router = express.Router();
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
        // authenticateAdmin,
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

    return router;
};
