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
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nächster Schritt: Ihre Finanzdaten</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f4;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px 0;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

                    <!-- Header with Logo -->
                    <tr>
                        <td style="background-color: #c41e3a; padding: 30px; text-align: center;">
                            <img src="https://www.scuric.de/wp-content/uploads/2023/01/scuric-logo-white.png" alt="Scuric Rechtsanwälte" style="max-width: 200px; height: auto;">
                        </td>
                    </tr>

                    <!-- Main Content -->
                    <tr>
                        <td style="padding: 40px 30px;">

                            <h1 style="color: #333333; font-size: 24px; margin: 0 0 20px 0; font-weight: bold;">
                                Nächster Schritt: Ihre Finanzdaten
                            </h1>

                            <p style="color: #666666; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                                Sehr geehrte/r <strong>${firstName} ${lastName}</strong>,
                            </p>

                            <p style="color: #666666; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                                wir machen jetzt mit Ihrem Fall weiter und benötigen für die Erstellung Ihres Schuldenbereinigungsplans noch einige wichtige Informationen von Ihnen.
                            </p>

                            <!-- Info Box -->
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8f9fa; border-left: 4px solid #c41e3a; margin: 25px 0;">
                                <tr>
                                    <td style="padding: 20px;">
                                        <h2 style="color: #c41e3a; font-size: 18px; margin: 0 0 10px 0; font-weight: bold;">
                                            📊 Bitte ergänzen Sie Ihre Finanzdaten
                                        </h2>
                                        <p style="color: #666666; font-size: 15px; line-height: 1.6; margin: 0;">
                                            Loggen Sie sich in Ihr Mandantenportal ein und tragen Sie die folgenden Informationen ein.
                                        </p>
                                    </td>
                                </tr>
                            </table>

                            <!-- CTA Button -->
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 30px 0;">
                                <tr>
                                    <td align="center">
                                        <a href="${portalLink}" style="display: inline-block; background-color: #28a745; color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 5px; font-weight: bold; font-size: 16px;">
                                            Zum Mandantenportal
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <!-- Required Information Box -->
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fff9e6; border: 1px solid #ffd966; border-radius: 8px; margin: 25px 0;">
                                <tr>
                                    <td style="padding: 20px;">
                                        <h3 style="color: #856404; font-size: 16px; margin: 0 0 15px 0; font-weight: bold;">
                                            📝 Benötigte Informationen:
                                        </h3>
                                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                            <tr>
                                                <td style="padding: 5px 0; color: #856404; font-size: 14px;">
                                                    ✓ Monatliches Nettoeinkommen
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 5px 0; color: #856404; font-size: 14px;">
                                                    ✓ Familienstand
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 5px 0; color: #856404; font-size: 14px;">
                                                    ✓ Anzahl unterhaltsberechtigter Personen
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <!-- Login Credentials Box -->
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f5f5f5; border-radius: 8px; margin: 25px 0;">
                                <tr>
                                    <td style="padding: 20px;">
                                        <h4 style="color: #333333; font-size: 14px; margin: 0 0 15px 0; font-weight: bold;">
                                            🔑 Ihre Login-Daten:
                                        </h4>
                                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                            <tr>
                                                <td style="padding: 8px 15px; background-color: #ffffff; border: 1px solid #e0e0e0;">
                                                    <strong style="color: #666666; font-size: 13px;">E-Mail:</strong>
                                                </td>
                                                <td style="padding: 8px 15px; background-color: #ffffff; border: 1px solid #e0e0e0;">
                                                    <span style="color: #333333; font-size: 13px;">${email}</span>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 15px; background-color: #ffffff; border: 1px solid #e0e0e0;">
                                                    <strong style="color: #666666; font-size: 13px;">Aktenzeichen:</strong>
                                                </td>
                                                <td style="padding: 8px 15px; background-color: #ffffff; border: 1px solid #e0e0e0;">
                                                    <span style="color: #333333; font-size: 13px;">${aktenzeichen}</span>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <!-- Important Note -->
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #e8eaf6; border-radius: 8px; margin: 25px 0;">
                                <tr>
                                    <td style="padding: 15px 20px;">
                                        <p style="color: #5f6368; font-size: 14px; margin: 0; line-height: 1.5;">
                                            ⏰ <strong>Wichtig:</strong> Diese Informationen sind notwendig, damit wir Ihren Schuldenbereinigungsplan erstellen und Ihre Insolvenz erfolgreich durchführen können.
                                        </p>
                                    </td>
                                </tr>
                            </table>

                            <p style="color: #666666; font-size: 15px; line-height: 1.6; margin: 30px 0 10px 0;">
                                Bei Fragen stehen wir Ihnen gerne zur Verfügung.
                            </p>

                            <p style="color: #666666; font-size: 15px; line-height: 1.6; margin: 10px 0 0 0;">
                                Mit freundlichen Grüßen<br>
                                <strong style="color: #333333;">Ihr Team von Scuric Rechtsanwälte</strong>
                            </p>

                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #2c2c2c; padding: 30px; color: #ffffff;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td style="text-align: center; padding-bottom: 20px;">
                                        <strong style="font-size: 16px; color: #ffffff;">Kanzlei Scuric</strong><br>
                                        <span style="font-size: 13px; color: #cccccc;">Rechtsanwälte</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="text-align: center; font-size: 12px; color: #cccccc; line-height: 1.6;">
                                        <p style="margin: 5px 0;">📍 Musterstraße 123, 12345 Musterstadt</p>
                                        <p style="margin: 5px 0;">📞 Tel: +49 (0) 123 456789</p>
                                        <p style="margin: 5px 0;">📧 E-Mail: info@scuric.de</p>
                                        <p style="margin: 15px 0 5px 0;">
                                            <a href="https://www.scuric.de" style="color: #c41e3a; text-decoration: none;">www.scuric.de</a>
                                        </p>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="text-align: center; padding-top: 20px; font-size: 11px; color: #999999; border-top: 1px solid #444444;">
                                        <p style="margin: 10px 0;">
                                            Diese E-Mail wurde automatisch generiert. Bitte antworten Sie nicht direkt auf diese E-Mail.
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
        `.trim();
    }
}

module.exports = FinancialDataReminderService;
