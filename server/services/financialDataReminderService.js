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
<body style="margin: 0; padding: 0; background-color: #f4f4f4;">
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">

        <!-- Header -->
        <div style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb;">
            <img src="https://www.anwalt-privatinsolvenz-online.de/wp-content/uploads/2015/08/Logo-T-Scuric.png" alt="Scuric Logo" style="height: 40px; display: block;">
        </div>

        <!-- Main Content -->
        <div style="padding: 24px 20px;">

            <!-- Title Section -->
            <div style="text-align: center; margin-bottom: 32px;">
                <h1 style="font-size: 28px; font-weight: 600; color: #111827; margin: 0 0 12px 0;">Nächster Schritt: Ihre Finanzdaten</h1>
                <p style="font-size: 16px; color: #6b7280; margin: 0;">Wir benötigen noch einige Informationen von Ihnen</p>
            </div>

            <!-- Greeting -->
            <p style="font-size: 15px; color: #374151; line-height: 1.6; margin: 0 0 20px 0;">
                Sehr geehrte/r <strong>${firstName} ${lastName}</strong>,<br><br>
                wir machen jetzt mit Ihrem Fall weiter und benötigen für die Erstellung Ihres Schuldenbereinigungsplans noch einige wichtige Informationen von Ihnen.
            </p>

            <!-- Login Credentials Box -->
            <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <div style="font-size: 16px; font-weight: 600; color: #111827; margin-bottom: 8px;">🔐 Ihre Zugangsdaten</div>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; font-weight: 500; color: #374151; font-size: 14px;">Portal-Link:</td>
                        <td style="padding: 10px 0 10px 16px; border-bottom: 1px solid #e5e7eb; color: #111827; font-size: 14px; font-family: monospace;">
                            <a href="${portalLink}" style="color: #dc2626; text-decoration: none;">mandanten-portal.onrender.com/login</a>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; font-weight: 500; color: #374151; font-size: 14px;">Login-E-Mail:</td>
                        <td style="padding: 10px 0 10px 16px; border-bottom: 1px solid #e5e7eb; color: #111827; font-size: 14px; font-family: monospace;">${email}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px 0; font-weight: 500; color: #374151; font-size: 14px;">Aktenzeichen:</td>
                        <td style="padding: 10px 0 10px 16px; color: #111827; font-size: 14px; font-family: monospace;">${aktenzeichen}</td>
                    </tr>
                </table>
            </div>

            <!-- CTA Button -->
            <div style="text-align: center; margin: 24px 0;">
                <a href="${portalLink}" style="display: inline-block; background-color: #16a34a; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 500; font-size: 16px;">Jetzt anmelden</a>
            </div>

            <!-- Instructions -->
            <h2 style="font-size: 18px; font-weight: 600; color: #111827; margin: 24px 0 16px 0;">So ergänzen Sie Ihre Daten</h2>
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 8px 0;">
                        <table style="width: 100%; background-color: #f9fafb; border-radius: 8px;">
                            <tr>
                                <td style="width: 28px; padding: 12px 0 12px 12px; vertical-align: top;">
                                    <div style="background-color: #111827; color: #ffffff; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 600; font-size: 14px;">1</div>
                                </td>
                                <td style="padding: 16px 12px 12px 12px; color: #374151; font-size: 14px; line-height: 1.5;">Öffnen Sie den oben genannten Portal-Link</td>
                            </tr>
                        </table>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 8px 0;">
                        <table style="width: 100%; background-color: #f9fafb; border-radius: 8px;">
                            <tr>
                                <td style="width: 28px; padding: 12px 0 12px 12px; vertical-align: top;">
                                    <div style="background-color: #111827; color: #ffffff; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 600; font-size: 14px;">2</div>
                                </td>
                                <td style="padding: 16px 12px 12px 12px; color: #374151; font-size: 14px; line-height: 1.5;">Melden Sie sich mit Ihrer E-Mail-Adresse und Ihrem Passwort an</td>
                            </tr>
                        </table>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 8px 0;">
                        <table style="width: 100%; background-color: #f9fafb; border-radius: 8px;">
                            <tr>
                                <td style="width: 28px; padding: 12px 0 12px 12px; vertical-align: top;">
                                    <div style="background-color: #111827; color: #ffffff; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 600; font-size: 14px;">3</div>
                                </td>
                                <td style="padding: 16px 12px 12px 12px; color: #374151; font-size: 14px; line-height: 1.5;">Navigieren Sie zum Bereich "Finanzdaten" im Portal</td>
                            </tr>
                        </table>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 8px 0;">
                        <table style="width: 100%; background-color: #f9fafb; border-radius: 8px;">
                            <tr>
                                <td style="width: 28px; padding: 12px 0 12px 12px; vertical-align: top;">
                                    <div style="background-color: #111827; color: #ffffff; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 600; font-size: 14px;">4</div>
                                </td>
                                <td style="padding: 16px 12px 12px 12px; color: #374151; font-size: 14px; line-height: 1.5;">Tragen Sie die benötigten Informationen ein und speichern Sie</td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>

            <!-- Required Information -->
            <h2 style="font-size: 18px; font-weight: 600; color: #111827; margin: 24px 0 16px 0;">📊 Bitte ergänzen Sie folgende Informationen</h2>
            <table style="width: 100%;">
                <tr>
                    <td>
                        <div style="padding: 10px 16px 10px 36px; margin: 6px 0; background-color: #f9fafb; border-radius: 8px; font-size: 14px; color: #374151; position: relative;">
                            <span style="position: absolute; left: 14px; color: #16a34a; font-weight: 600;">✓</span> Monatliches Nettoeinkommen
                        </div>
                    </td>
                </tr>
                <tr>
                    <td>
                        <div style="padding: 10px 16px 10px 36px; margin: 6px 0; background-color: #f9fafb; border-radius: 8px; font-size: 14px; color: #374151; position: relative;">
                            <span style="position: absolute; left: 14px; color: #16a34a; font-weight: 600;">✓</span> Familienstand
                        </div>
                    </td>
                </tr>
                <tr>
                    <td>
                        <div style="padding: 10px 16px 10px 36px; margin: 6px 0; background-color: #f9fafb; border-radius: 8px; font-size: 14px; color: #374151; position: relative;">
                            <span style="position: absolute; left: 14px; color: #16a34a; font-weight: 600;">✓</span> Anzahl unterhaltsberechtigter Personen
                        </div>
                    </td>
                </tr>
            </table>

            <!-- Important Note -->
            <div style="background-color: #dbeafe; border: 1px solid #93c5fd; border-radius: 8px; padding: 12px; margin: 16px 0; font-size: 14px; color: #1e40af;">
                <strong>Wichtig:</strong> Diese Informationen sind notwendig, damit wir Ihren Schuldenbereinigungsplan erstellen und Ihre Insolvenz erfolgreich durchführen können.
            </div>

            <!-- Closing -->
            <p style="margin-top: 24px; color: #6b7280; font-size: 14px;">
                Bei Fragen stehe ich Ihnen selbstverständlich gerne zur Verfügung.
            </p>

            <!-- Footer with Contact Info -->
            <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #1a1a1a;">
                <p style="margin: 0 0 12px;">
                    <img src="https://www.anwalt-privatinsolvenz-online.de/wp-content/uploads/2015/08/Logo-T-Scuric.png" alt="Thomas Scuric Rechtsanwalt" style="display: block; max-width: 300px; height: auto;">
                </p>
                <p style="margin: 0 0 4px; color: #961919; font-weight: bold;">Rechtsanwaltskanzlei Thomas Scuric</p>
                <p style="margin: 0 0 8px; color: #1f497d;">
                    Bongardstraße 33<br>
                    44787 Bochum
                </p>
                <p style="margin: 0 0 12px; color: #1f497d;">
                    Fon: 0234 913 681 0<br>
                    Fax: 0234 913 681 29<br>
                    E-Mail: <a href="mailto:kontakt@schuldnerberatung-anwalt.de" style="color: #0563c1; text-decoration: none;">kontakt@schuldnerberatung-anwalt.de</a>
                </p>
                <p style="margin: 0; font-size: 11px; line-height: 1.5; color: #a6a6a6;">
                    Der Inhalt dieser E-Mail ist vertraulich und ausschließlich für den bezeichneten Adressaten bestimmt. Wenn Sie nicht der vorgesehene Adressat dieser E-Mail oder dessen Vertreter sein sollten, so beachten Sie bitte, daß jede Form der Kenntnisnahme, Veröffentlichung, Vervielfältigung oder Weitergabe des Inhalts dieser E-Mail unzulässig ist. Wir bitten Sie, sich in diesem Fall mit dem Absender der E-Mail in Verbindung zu setzen. Aussagen gegenüber dem Adressaten unterliegen den Regelungen des zugrundeliegenden Auftrags, insbesondere den Allgemeinen Auftragsbedingungen. Wir möchten Sie außerdem darauf hinweisen, daß die Kommunikation per E-Mail über das Internet unsicher ist, da für unberechtigte Dritte grundsätzlich die Möglichkeit der Kenntnisnahme und Manipulation besteht.<br><br>
                    Wir weisen Sie auf unsere aktuelle <a href="https://www.schuldnerberatung-anwalt.de/datenschutz/" style="color: #a0191d; text-decoration: underline;" target="_blank">Datenschutzerklärung</a> hin.
                </p>
            </div>

            <!-- Legal Links -->
            <div style="text-align: center; margin-top: 32px; padding-top: 24px;">
                <div style="margin-bottom: 12px;">
                    <a href="https://www.schuldnerberatung-anwalt.de/impressum/" style="color: #6b7280; text-decoration: none; font-size: 13px;">Impressum</a>
                    <span style="color: #9ca3af; margin: 0 12px;">•</span>
                    <a href="https://www.schuldnerberatung-anwalt.de/datenschutz/" style="color: #6b7280; text-decoration: none; font-size: 13px;">Datenschutz</a>
                </div>
                <p style="font-size: 12px; color: #9ca3af; margin: 0;">© 2025 Scuric. Alle Rechte vorbehalten.</p>
            </div>

            <!-- Auto-generated Notice -->
            <div style="font-size: 11px; color: #9ca3af; margin-top: 24px; padding: 12px; background-color: #f9fafb; border-radius: 6px;">
                📎 Diese E-Mail wurde automatisch generiert. Bitte antworten Sie nicht direkt auf diese Nachricht.
            </div>

        </div>
    </div>
</body>
</html>
        `.trim();
    }
}

module.exports = FinancialDataReminderService;
