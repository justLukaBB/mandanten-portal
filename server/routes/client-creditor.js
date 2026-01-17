const express = require('express');
const router = express.Router();
const ClientCreditorController = require('../controllers/clientCreditorController');

module.exports = ({ Client, clientsData, creditorContactService, sideConversationMonitor }) => {
    const controller = new ClientCreditorController({
        Client,
        clientsData,
        creditorContactService,
        sideConversationMonitor
    });

    // Client: Get creditor list (Confirmation view)
    router.get('/clients/:clientId/creditor-confirmation', controller.getCreditorConfirmation);

    // Client: Confirm creditors
    router.post('/clients/:clientId/confirm-creditors', controller.confirmCreditors);

    // Admin/System: Start creditor contact manually (or re-trigger)
    router.post('/clients/:clientId/start-creditor-contact', controller.startCreditorContact);

    // Admin/System: Resend emails
    router.post('/clients/:clientId/resend-creditor-emails', controller.resendCreditorEmails);

    // Admin/System: Get contact status
    router.get('/clients/:clientId/creditor-contact-status', controller.getCreditorContactStatus);

    // Admin/System: Get debt summary
    router.get('/clients/:clientId/final-debt-summary', controller.getFinalDebtSummary);

    return router;
};
