const express = require('express');
const router = express.Router();
const ClientCreditorController = require('../controllers/clientCreditorController');

module.exports = ({ Client, clientsData, creditorContactService, sideConversationMonitor, authenticateClient, authenticateAdmin }) => {
    const controller = new ClientCreditorController({
        Client,
        clientsData,
        creditorContactService,
        sideConversationMonitor
    });

    // Client: Get creditor list (Confirmation view)
    router.get('/clients/:clientId/creditor-confirmation', authenticateClient, controller.getCreditorConfirmation);

    // Client: Confirm creditors
    router.post('/clients/:clientId/confirm-creditors', authenticateClient, controller.confirmCreditors);

    // Admin/System: Start creditor contact manually (or re-trigger)
    router.post('/clients/:clientId/start-creditor-contact', authenticateAdmin, controller.startCreditorContact);

    // Admin/System: Resend emails
    router.post('/clients/:clientId/resend-creditor-emails', authenticateAdmin, controller.resendCreditorEmails);

    // Admin/System: Get contact status
    router.get('/clients/:clientId/creditor-contact-status', authenticateClient, controller.getCreditorContactStatus);

    // Admin/System: Get debt summary
    router.get('/clients/:clientId/final-debt-summary', authenticateClient, controller.getFinalDebtSummary);

    return router;
};
