const ZendeskService = require('./zendeskService');

/**
 * Financial Data Reminder Service
 * Sends email reminders to clients to fill in their financial data after 30-day creditor period
 * Uses Zendesk side conversations for professional email delivery
 */
class FinancialDataReminderService {
    constructor() {
        this.zendeskService = new ZendeskService();
    }

    /**
     * Send financial data reminder email to client via Zendesk side conversation
     * @param {string} ticketId - Zendesk ticket ID
     * @param {Object} clientData - Client information
     * @returns {Object} Result with success status and details
     */
    async sendReminder(ticketId, clientData) {
        try {
            console.log(`📧 Sending financial data reminder to ${clientData.firstName} ${clientData.lastName} (${clientData.email})`);

            const emailSubject = "📋 Nächster Schritt: Ihre Finanzdaten";

            // Generate both plain text and HTML email
            const plainTextBody = this.generatePlainTextEmail(clientData);
            const htmlBody = this.generateHTMLEmail(clientData);

            // Send as side conversation
            console.log(`🎯 FINANCIAL REMINDER: Using createSideConversation for client notification`);
            const response = await this.zendeskService.createSideConversation(ticketId, {
                recipientEmail: clientData.email,
                recipientName: `${clientData.firstName} ${clientData.lastName}`,
                subject: emailSubject,
                body: plainTextBody,
                htmlBody: htmlBody,
                internalNote: true
            });

            console.log(`🔍 FINANCIAL REMINDER: createSideConversation response:`, {
                success: response.success,
                method: 'side_conversation',
                side_conversation_id: response.side_conversation_id
            });

            if (response.success) {
                console.log(`✅ Financial data reminder sent successfully to ${clientData.email} via side conversation`);
                console.log(`📝 Ticket ID: ${ticketId}`);
                console.log(`🧵 Side Conversation ID: ${response.side_conversation_id}`);

                return {
                    success: true,
                    ticket_id: ticketId,
                    side_conversation_id: response.side_conversation_id,
                    email: clientData.email,
                    subject: emailSubject,
                    method: 'side_conversation',
                    sent_at: new Date().toISOString()
                };
            } else {
                console.error(`❌ Failed to send financial data reminder: ${response.error}`);

                // Try fallback to public comment
                console.log(`⚠️ Attempting fallback to public comment...`);
                const fallbackResponse = await this.zendeskService.addPublicComment(ticketId, {
                    content: plainTextBody,
                    htmlContent: htmlBody,
                    tags: ['financial-data-reminder', 'client-notification']
                });

                if (fallbackResponse.success) {
                    console.log(`✅ Financial data reminder sent via public comment fallback`);
                    return {
                        success: true,
                        ticket_id: ticketId,
                        email: clientData.email,
                        subject: emailSubject,
                        method: 'public_comment_fallback',
                        sent_at: new Date().toISOString()
                    };
                }

                return {
                    success: false,
                    error: response.error,
                    fallback_error: fallbackResponse.error
                };
            }

        } catch (error) {
            console.error(`❌ Error in sendReminder:`, error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Generate plain text email for financial data reminder
     * @param {Object} clientData - Client information
     * @returns {string} Plain text email content
     */
    generatePlainTextEmail(clientData) {
        const { firstName, lastName, aktenzeichen } = clientData;
        const portalLink = "https://mandanten-portal.onrender.com/login";

        return `
📋 Nächster Schritt: Ihre Finanzdaten

Sehr geehrte/r ${firstName} ${lastName},

wir machen jetzt mit Ihrem Fall weiter.

📊 Nächster Schritt: Finanzdaten eingeben

Bitte loggen Sie sich in Ihr Mandantenportal ein und ergänzen Sie Ihre aktuellen Finanzdaten:

🔗 Portal-Link:
${portalLink}

📝 Benötigte Informationen:
• Monatliches Nettoeinkommen
• Familienstand
• Anzahl unterhaltsberechtigter Personen

⏰ Diese Daten benötigen wir für die Erstellung Ihres Schuldenbereinigungsplans.

📋 Ihre Login-Daten:
E-Mail: ${clientData.email}
Aktenzeichen: ${aktenzeichen}

Bei Fragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen
Ihr Team von Thomas Scuric Rechtsanwälte

---
Kanzlei Thomas Scuric
Rechtsanwalt
`.trim();
    }

    /**
     * Generate HTML email for financial data reminder
     * @param {Object} clientData - Client information
     * @returns {string} HTML email content
     */
    generateHTMLEmail(clientData) {
        const { firstName, lastName, email, aktenzeichen } = clientData;
        const portalLink = "https://mandanten-portal.onrender.com/login";

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nächster Schritt: Ihre Finanzdaten</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">

    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">📋 Nächster Schritt</h1>
        <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.95;">Ihre Finanzdaten</p>
    </div>

    <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">

        <p style="font-size: 16px; margin-bottom: 20px;">
            Sehr geehrte/r <strong>${firstName} ${lastName}</strong>,
        </p>

        <p style="font-size: 16px; margin-bottom: 25px;">
            wir machen jetzt mit Ihrem Fall weiter.
        </p>

        <div style="background: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 25px 0; border-radius: 4px;">
            <h2 style="margin: 0 0 15px 0; font-size: 18px; color: #667eea;">
                📊 Nächster Schritt: Finanzdaten eingeben
            </h2>
            <p style="margin: 0; font-size: 15px;">
                Bitte loggen Sie sich in Ihr Mandantenportal ein und ergänzen Sie Ihre aktuellen Finanzdaten.
            </p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
            <a href="${portalLink}"
               style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                🔗 Zum Mandantenportal
            </a>
        </div>

        <div style="background: #fff9e6; border: 1px solid #ffd966; border-radius: 8px; padding: 20px; margin: 25px 0;">
            <h3 style="margin: 0 0 15px 0; font-size: 16px; color: #856404;">
                📝 Benötigte Informationen:
            </h3>
            <ul style="margin: 0; padding-left: 20px; color: #856404;">
                <li style="margin-bottom: 8px;">Monatliches Nettoeinkommen</li>
                <li style="margin-bottom: 8px;">Familienstand</li>
                <li style="margin-bottom: 8px;">Anzahl unterhaltsberechtigter Personen</li>
            </ul>
        </div>

        <div style="background: #e8eaf6; border-radius: 8px; padding: 20px; margin: 25px 0;">
            <p style="margin: 0 0 10px 0; font-size: 14px; color: #5f6368;">
                ⏰ <strong>Wichtig:</strong> Diese Daten benötigen wir für die Erstellung Ihres Schuldenbereinigungsplans.
            </p>
        </div>

        <div style="background: #f5f5f5; border-radius: 8px; padding: 15px; margin: 25px 0;">
            <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #5f6368;">
                📋 Ihre Login-Daten:
            </h4>
            <p style="margin: 5px 0; font-size: 14px; color: #5f6368;">
                <strong>E-Mail:</strong> ${email}
            </p>
            <p style="margin: 5px 0; font-size: 14px; color: #5f6368;">
                <strong>Aktenzeichen:</strong> ${aktenzeichen}
            </p>
        </div>

        <p style="font-size: 15px; margin-top: 30px;">
            Bei Fragen stehen wir Ihnen gerne zur Verfügung.
        </p>

        <p style="font-size: 15px; margin-top: 20px;">
            Mit freundlichen Grüßen<br>
            <strong>Ihr Team von Thomas Scuric Rechtsanwälte</strong>
        </p>

    </div>

    <div style="background: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0; border-top: none;">
        <p style="margin: 0; font-size: 13px; color: #5f6368;">
            <strong>Kanzlei Thomas Scuric</strong><br>
            Rechtsanwalt
        </p>
    </div>

</body>
</html>
        `.trim();
    }
}

module.exports = FinancialDataReminderService;
