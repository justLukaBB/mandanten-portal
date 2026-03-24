const express = require('express');
const router = express.Router();
const createClientPortalController = require('../controllers/clientPortalController');
const { authenticateClient, authenticateSecondLetterToken } = require('../middleware/auth');
const { rateLimits, validateFileUpload } = require('../middleware/security');
const { upload, uploadTimeout } = require('../middleware/upload');

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

    // Portal Login - Request Verification Code (Public)
    router.post('/portal/request-verification-code',
        rateLimits.verificationCodeRequest,
        controller.handleRequestVerificationCode
    );

    // Portal Login - Verify Code (Public)
    router.post('/portal/verify-code',
        rateLimits.verificationAttempt,
        controller.handleVerifyCode
    );

    // Portal Login (Legacy - kept for backward compatibility)
    router.post('/portal/login',
        rateLimits.auth,
        (req, res, next) => next(), // Pass through (controller handles validation)
        controller.handleLogin
    );

    // Session Validation (Public/Shared)
    router.get('/portal/validate-session', controller.handleSessionValidation);

    // Get client data (Authenticated)
    router.get('/clients/:clientId', authenticateClient, controller.handleGetClient);

    // Get client documents (Authenticated)
    router.get('/clients/:clientId/documents', authenticateClient, controller.handleGetClientDocuments);

    // Upload status (Authenticated, 30-day window)
    router.get('/clients/:clientId/upload-status', authenticateClient, controller.handleGetUploadStatus);

    // Upload documents
    router.post('/clients/:clientId/documents',
        uploadTimeout(300000), // 5 minute timeout for uploads
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

    // Get creditors for client
    router.get('/clients/:clientId/creditors',
        authenticateClient,
        controller.handleGetCreditors
    );

    // Add manual creditor
    router.post('/clients/:clientId/creditors',
        rateLimits.general,
        authenticateClient,
        controller.handleAddCreditor
    );

    // Second Letter Form — token-authenticated routes (token is UUID from Phase 29, not regular JWT)
    router.get('/second-letter-form',
        authenticateSecondLetterToken,
        controller.handleGetSecondLetterFormData
    );
    router.post('/second-letter-form',
        authenticateSecondLetterToken,
        controller.handleSubmitSecondLetterForm
    );

    // Second Letter Form — JWT-authenticated routes (portal inline form)
    router.get('/clients/:clientId/second-letter-form',
        authenticateClient,
        controller.handleGetSecondLetterFormDataJWT
    );
    router.post('/clients/:clientId/second-letter-form',
        authenticateClient,
        controller.handleSubmitSecondLetterFormJWT
    );

    // Insolvenzantrag Data Collection Form
    router.get('/clients/:clientId/insolvenzantrag-form',
        authenticateClient,
        controller.handleGetInsolvenzantragForm
    );
    router.post('/clients/:clientId/insolvenzantrag-form/save-section',
        authenticateClient,
        controller.handleSaveInsolvenzantragSection
    );
    router.post('/clients/:clientId/insolvenzantrag-form/submit',
        authenticateClient,
        controller.handleSubmitInsolvenzantragForm
    );

    return router;
};
