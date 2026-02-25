/**
 * Creditor Response Utilities
 *
 * Stateless helpers for creditor-response processing.
 *
 * NOTE (Phase D cleanup – 2026-02-25):
 * The original CreditorResponseProcessor class operated on an in-memory Map
 * inside creditorContactService that was never persisted to MongoDB.
 * Live response processing is now handled by:
 *   - creditor-email-matcher-v2  (AI extraction + dual-write)
 *   - matcherWebhookController.js (status_history + Socket.IO push)
 *
 * Only the reference-number extraction helper is retained because it's
 * used by DebtAmountExtractor and may be useful for manual imports.
 */

/**
 * Extract reference number from email content.
 * Looks for patterns like [12345678901], Az: 12345, Ticket-ID, etc.
 *
 * @param {string} emailBody  – email body text
 * @param {string} [emailSubject] – email subject line
 * @returns {string|null} extracted reference or null
 */
function extractReferenceNumber(emailBody, emailSubject = '') {
    const fullText = `${emailSubject || ''} ${emailBody || ''}`;

    const patterns = [
        // Ticket-ID pattern from our outgoing emails
        /Ticket-ID:\s*\[([^\]]+)\]/gi,
        // Aktenzeichen / reference patterns
        /(?:aktenzeichen|az|referenz|ref)[\.\s]*:?\s*([A-Za-z0-9\-_]+)/gi,
        // "Ihr Aktenzeichen" / "Your reference"
        /(?:ihr aktenzeichen|your reference)[\.\s]*:?\s*([A-Za-z0-9\-_]+)/gi,
        // Standalone 11-digit references
        /\b(\d{11})\b/g,
        // Bracketed references
        /\[([A-Za-z0-9\-_]{5,})\]/g,
    ];

    for (const pattern of patterns) {
        const matches = [...fullText.matchAll(pattern)];
        for (const match of matches) {
            const ref = match[1]?.trim();
            if (ref && ref.length >= 5) {
                return ref;
            }
        }
    }

    return null;
}

module.exports = { extractReferenceNumber };
