const express = require("express");

/**
 * Creates the Zendesk webhooks router with injected dependencies
 * @param {Object} dependencies - The dependencies for the router
 * @param {Object} dependencies.Client - The Mongoose Client model
 * @param {Object} dependencies.rateLimits - Rate limiting middleware
 * @param {Object} dependencies.zendeskWebhookController - The initialized ZendeskWebhookController instance
 * @returns {express.Router} The configured router
 */
module.exports = function createZendeskWebhooksRouter({
    Client,
    rateLimits,
    zendeskWebhookController,
}) {
    const router = express.Router();

    // Middleware to parse Zendesk-specific payloads
    // We use the one from the controller for consistency
    const parseZendeskPayload = (req, res, next) =>
        zendeskWebhookController.parseZendeskPayload(req, res, next);

    // === ROUTES ===

    // 1. Portal Link Sent
    // Triggered when agent sends portal link macro
    router.post(
        "/portal-link-sent",
        rateLimits.general,
        /* parseZendeskPayload is handled inside the controller if needed or standard express.json is sufficient? 
           The controller has specific logic to handle string bodies.
           Let's use the express body parser generally setup in server.js but ensuring we handle string type if zendesk sends it weirdly.
           The controller method parseZendeskPayload handles it.
        */
        parseZendeskPayload,
        (req, res) => zendeskWebhookController.handlePortalLinkSent(req, res)
    );

    // 2. User Payment Confirmed (Phase 2)
    router.post(
        "/user-payment-confirmed",
        rateLimits.general,
        parseZendeskPayload,
        (req, res) => zendeskWebhookController.handleUserPaymentConfirmed(req, res)
    );

    // 3. Payment Confirmed (Primary/Legacy)
    router.post(
        "/payment-confirmed",
        rateLimits.general,
        parseZendeskPayload,
        (req, res) => zendeskWebhookController.handlePaymentConfirmed(req, res)
    );

    // 4. Start Manual Review
    router.post(
        "/start-manual-review",
        rateLimits.general,
        parseZendeskPayload,
        (req, res) => zendeskWebhookController.handleStartManualReview(req, res)
    );

    // 5. Manual Review Complete
    router.post(
        "/manual-review-complete",
        rateLimits.general,
        parseZendeskPayload,
        (req, res) => zendeskWebhookController.handleManualReviewComplete(req, res)
    );

    // 6. Processing Complete
    router.post(
        "/processing-complete",
        rateLimits.general,
        parseZendeskPayload,
        (req, res) => zendeskWebhookController.handleProcessingComplete(req, res)
    );

    // 7. Creditor Confirmation Request
    router.post(
        "/creditor-confirmation-request",
        rateLimits.general,
        parseZendeskPayload,
        (req, res) => zendeskWebhookController.handleCreditorConfirmationRequest(req, res)
    );

    // 8. Client Creditor Confirmed
    router.post(
        "/client-creditor-confirmed",
        rateLimits.general,
        parseZendeskPayload,
        (req, res) => zendeskWebhookController.handleClientCreditorConfirmed(req, res)
    );

    // 11. Creditor Response
    router.post(
        "/creditor-response",
        rateLimits.general,
        (req, res) => zendeskWebhookController.handleCreditorResponse(req, res)
    );

    // 9. Monitor APIs
    router.post(
        "/monitor/start-client/:clientReference",
        rateLimits.general,
        (req, res) => zendeskWebhookController.handleMonitorStartClient(req, res)
    );

    router.post(
        "/monitor/stop-client/:clientReference",
        rateLimits.general,
        (req, res) => zendeskWebhookController.handleMonitorStopClient(req, res)
    );

    router.get(
        "/monitor/status",
        rateLimits.general,
        (req, res) => zendeskWebhookController.handleMonitorStatus(req, res)
    );

    router.get(
        "/monitor/status/:clientReference",
        rateLimits.general,
        (req, res) => zendeskWebhookController.handleMonitorStatusClient(req, res)
    );

    router.post(
        "/monitor/restart",
        rateLimits.general,
        (req, res) => zendeskWebhookController.handleMonitorRestart(req, res)
    );

    router.post(
        "/monitor/check-client/:clientReference",
        rateLimits.general,
        (req, res) => zendeskWebhookController.handleMonitorCheckClient(req, res)
    );

    router.post(
        "/monitor/check-all",
        rateLimits.general,
        (req, res) => zendeskWebhookController.handleMonitorCheckAll(req, res)
    );

    // 10. Creditor Review Ready
    router.post(
        "/creditor-review-ready",
        rateLimits.general,
        parseZendeskPayload,
        (req, res) => zendeskWebhookController.handleCreditorReviewReady(req, res)
    );

    return router;
};
