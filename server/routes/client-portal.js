const express = require('express');
const router = express.Router();
const createClientPortalController = require('../controllers/clientPortalController');
const { authenticateClient } = require('../middleware/auth');
const { rateLimits, validateFileUpload } = require('../middleware/security');
const { upload } = require('../middleware/upload');

/**
 * Client Portal Routes Factory
 * @param {Object} dependencies - dependencies injected from server.js
 */
module.exports = ({ Client, safeClientUpdate, getClient }) => {
    const controller = createClientPortalController({
        Client,
        safeClientUpdate,
        getClient
    });

    // Public/Shared Routes (Make Password)
    router.post('/client/make-new-password', controller.handleMakeNewPassword);

    // Portal Login (Public)
    router.post('/portal/login',
        rateLimits.auth,
        (req, res, next) => next(), // Pass through (controller handles validation)
        controller.handleLogin
    );

    // Session Validation (Public/Shared)
    router.get('/portal/validate-session', controller.handleSessionValidation);

    // Get client data (Shared/Client)
    router.get('/clients/:clientId', controller.handleGetClient);

    // Get client documents
    router.get('/clients/:clientId/documents', controller.handleGetClientDocuments);

    // Upload documents
    router.post('/clients/:clientId/documents',
        rateLimits.upload,
        upload.fields([{ name: 'documents', maxCount: 10 }, { name: 'document', maxCount: 1 }]),
        validateFileUpload,
        controller.handleUploadDocuments
    );

    // Financial Form Status
    router.get('/clients/:clientId/financial-form-status',
        authenticateClient,
        controller.handleGetFinancialFormStatus
    );

    // Submit Financial Data
    router.post('/clients/:clientId/financial-data',
        authenticateClient,
        controller.handleSubmitFinancialData
    );

    // Submit Address/Personal Data
    router.post('/clients/:clientId/address',
        authenticateClient,
        controller.handleSubmitAddress
    );

    // Reset Financial Data (POST)
    router.post('/clients/:clientId/reset-financial-data',
        authenticateClient,
        controller.handleResetFinancialData
    );

    // Reset/Delete Financial Data (DELETE)
    router.delete('/clients/:clientId/financial-data',
        authenticateClient,
        controller.handleDeleteFinancialData
    );

    // Add manual creditor
    router.post('/clients/:clientId/creditors',
        rateLimits.general,
        authenticateClient,
        controller.handleAddCreditor
    );

    return router;
};
