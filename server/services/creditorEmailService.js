const config = require('../config');

/**
 * CreditorEmailService
 * Sends creditor emails (first round, second round) using Resend SDK
 * Replaces Zendesk Side Conversations for better control over sender address
 * In development mode without API key: logs email to console
 */
class CreditorEmailService {
  constructor() {
    this.resend = null;
    this.fromEmail = config.RESEND_CREDITOR_FROM_EMAIL || 'office@scuric.de';
    this.fromName = config.RESEND_CREDITOR_FROM_NAME || 'Thomas Scuric Rechtsanwälte';
    this.replyTo = this.fromEmail;

    this.initializeResend();
  }

  /**
   * Initialize Resend SDK if API key is available
   */
  initializeResend() {
    const apiKey = config.RESEND_API_KEY;

    if (apiKey) {
      try {
        const { Resend } = require('resend');
        this.resend = new Resend(apiKey);
        console.log('✅ CreditorEmailService: Resend SDK initialized');
      } catch (error) {
        console.error('❌ CreditorEmailService: Failed to initialize Resend SDK:', error.message);
        this.resend = null;
      }
    } else {
      console.log('⚠️ CreditorEmailService: No RESEND_API_KEY configured - emails will be logged to console');
    }
  }

  /**
   * Send first round creditor email with document link
   * @param {Object} options
   * @param {string} options.recipientEmail - Creditor email address
   * @param {string} options.recipientName - Creditor name
   * @param {string} options.clientName - Client full name
   * @param {string} options.clientReference - Aktenzeichen
   * @param {string} options.documentUrl - Download URL for the first round document
   * @param {string} [options.creditorReference] - Creditor's reference number (optional)
   * @returns {Promise<{success: boolean, emailId?: string, error?: string}>}
   */
  async sendFirstRoundEmail({ recipientEmail, recipientName, clientName, clientReference, documentUrl, creditorReference }) {
    const subject = `Außergerichtlicher Einigungsversuch - ${recipientName} - Az: ${clientReference}`;
    const html = this.generateFirstRoundEmailHtml({
      recipientName,
      clientName,
      clientReference,
      documentUrl,
      creditorReference
    });
    const text = this.generateFirstRoundEmailText({
      recipientName,
      clientName,
      clientReference,
      documentUrl,
      creditorReference
    });

    return this.sendEmail({
      to: recipientEmail,
      toName: recipientName,
      subject,
      html,
      text,
      tags: [
        { name: 'type', value: 'first_round' },
        { name: 'client_reference', value: clientReference }
      ]
    });
  }

  /**
   * Send second round creditor email with settlement plan
   * @param {Object} options
   * @param {string} options.recipientEmail - Creditor email address
   * @param {string} options.recipientName - Creditor name
   * @param {string} options.clientName - Client full name
   * @param {string} options.clientReference - Aktenzeichen
   * @param {string} options.documentUrl - Download URL for the settlement document
   * @param {string} [options.documentFilename] - Document filename
   * @param {Object} [options.settlementDetails] - Settlement plan details
   * @returns {Promise<{success: boolean, emailId?: string, error?: string}>}
   */
  async sendSecondRoundEmail({ recipientEmail, recipientName, clientName, clientReference, documentUrl, documentFilename, settlementDetails }) {
    const subject = `2. Runde - Schuldenbereinigungsplan - ${clientName} - Az: ${clientReference}`;
    const html = this.generateSecondRoundEmailHtml({
      recipientName,
      clientName,
      clientReference,
      documentUrl,
      documentFilename,
      settlementDetails
    });
    const text = this.generateSecondRoundEmailText({
      recipientName,
      clientName,
      clientReference,
      documentUrl,
      documentFilename,
      settlementDetails
    });

    return this.sendEmail({
      to: recipientEmail,
      toName: recipientName,
      subject,
      html,
      text,
      tags: [
        { name: 'type', value: 'second_round' },
        { name: 'client_reference', value: clientReference }
      ]
    });
  }

  /**
   * Core email sending function
   * @private
   */
  async sendEmail({ to, toName, subject, html, text, tags = [] }) {
    // TEST MODE: Override recipient for all creditor emails
    const TEST_RECIPIENT = 'justlukax@gmail.com';
    const originalRecipient = to;
    to = TEST_RECIPIENT;
    console.log(`🧪 TEST MODE: Redirecting email from ${originalRecipient} → ${TEST_RECIPIENT}`);

    // If Resend is not configured, log to console (dev mode)
    if (!this.resend) {
      console.log('\n📧 ================================');
      console.log('📧 CREDITOR EMAIL (DEV MODE)');
      console.log('📧 ================================');
      console.log(`📧 From: ${this.fromName} <${this.fromEmail}>`);
      console.log(`📧 To: ${toName} <${to}>`);
      console.log(`📧 Subject: ${subject}`);
      console.log(`📧 Tags: ${JSON.stringify(tags)}`);
      console.log('📧 ================================\n');

      return { success: true, devMode: true, emailId: `dev-${Date.now()}` };
    }

    try {
      const response = await this.resend.emails.send({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: to,
        reply_to: this.replyTo,
        subject,
        html,
        text,
        tags
      });

      console.log(`✅ Creditor email sent to ${to} (ID: ${response.id})`);

      return { success: true, emailId: response.id };
    } catch (error) {
      console.error(`❌ Failed to send creditor email to ${to}:`, error.message);

      return {
        success: false,
        error: error.message || 'Failed to send email'
      };
    }
  }

  /**
   * Generate HTML email for first round (Erstschreiben)
   * @private
   */
  generateFirstRoundEmailHtml({ recipientName, clientName, clientReference, documentUrl, creditorReference }) {
    const currentDate = new Date().toLocaleDateString('de-DE');

    return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Außergerichtlicher Einigungsversuch</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
          <!-- Header -->
          <tr>
            <td style="padding: 24px 32px; text-align: center; background-color: #2c5aa0; border-radius: 8px 8px 0 0;">
              <img src="https://www.schuldnerberatung-anwalt.de/wp-content/uploads/2024/10/Logo-T-Scuric.png" alt="Thomas Scuric Rechtsanwälte" style="height: 40px; width: auto;">
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 24px; font-size: 20px; font-weight: 600; color: #2c5aa0;">
                Außergerichtlicher Einigungsversuch
              </h2>

              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #333;">
                Sehr geehrte Damen und Herren,
              </p>

              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #333;">
                im Auftrag unseres Mandanten <strong>${clientName}</strong> führen wir einen außergerichtlichen Einigungsversuch im Rahmen der Insolvenzordnung durch.
              </p>

              <!-- Document Download Button -->
              <div style="text-align: center; margin: 32px 0;">
                <a href="${documentUrl}"
                   style="display: inline-block; background-color: #2c5aa0; color: #ffffff; padding: 14px 28px;
                          text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">
                  Erstschreiben herunterladen
                </a>
              </div>

              <!-- Instructions Box -->
              <div style="background-color: #f8f9fa; padding: 20px; border-left: 4px solid #2c5aa0; margin: 24px 0;">
                <h4 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: #333;">Nächste Schritte:</h4>
                <ul style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #555;">
                  <li>Dokument herunterladen und prüfen</li>
                  <li>Aktuelle Forderungshöhe mitteilen (aufgeschlüsselt nach Hauptforderung, Zinsen, Kosten)</li>
                  <li>Kopie eventuell vorliegender Titel übersenden</li>
                  <li>Sicherheiten mitteilen (falls vorhanden)</li>
                </ul>
                <p style="margin: 12px 0 0; font-size: 14px; color: #666;">
                  <strong>Antwortfrist:</strong> 14 Tage ab heute
                </p>
              </div>

              <p style="margin: 24px 0 0; font-size: 15px; line-height: 1.6; color: #333;">
                Mit freundlichen Grüßen
              </p>
              <p style="margin: 8px 0 0; font-size: 15px; font-weight: 600; color: #333;">
                Thomas Scuric Rechtsanwälte
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f8f9fa; border-top: 1px solid #eee; border-radius: 0 0 8px 8px;">
              <table style="width: 100%;">
                <tr>
                  <td style="font-size: 12px; color: #666; line-height: 1.6;">
                    <strong>Thomas Scuric Rechtsanwälte</strong><br>
                    Bongardstraße 33, 44787 Bochum<br>
                    Tel: 0234 913681-0<br>
                    E-Mail: office@scuric.de
                  </td>
                  <td style="font-size: 12px; color: #888; text-align: right; vertical-align: top;">
                    Aktenzeichen: ${clientReference}<br>
                    Datum: ${currentDate}
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

  /**
   * Generate plain text email for first round
   * @private
   */
  generateFirstRoundEmailText({ recipientName, clientName, clientReference, documentUrl, creditorReference }) {
    const currentDate = new Date().toLocaleDateString('de-DE');

    return `
Außergerichtlicher Einigungsversuch

Sehr geehrte Damen und Herren,

im Auftrag unseres Mandanten ${clientName} führen wir einen außergerichtlichen Einigungsversuch im Rahmen der Insolvenzordnung durch.

BEIGEFÜGTES DOKUMENT:

Bitte laden Sie das Erstschreiben herunter:
${documentUrl}

NÄCHSTE SCHRITTE:

1. Dokument herunterladen und prüfen
2. Aktuelle Forderungshöhe mitteilen (aufgeschlüsselt nach Hauptforderung, Zinsen, Kosten)
3. Kopie eventuell vorliegender Titel übersenden
4. Sicherheiten mitteilen (falls vorhanden)

Antwortfrist: 14 Tage ab heute

Mit freundlichen Grüßen

Thomas Scuric Rechtsanwälte
Bongardstraße 33
44787 Bochum

Telefon: 0234 913681-0
E-Mail: office@scuric.de

---
Aktenzeichen: ${clientReference}
Datum: ${currentDate}
    `.trim();
  }

  /**
   * Generate HTML email for second round (Schuldenbereinigungsplan)
   * @private
   */
  generateSecondRoundEmailHtml({ recipientName, clientName, clientReference, documentUrl, documentFilename, settlementDetails }) {
    const currentDate = new Date().toLocaleDateString('de-DE');

    return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Schuldenbereinigungsplan</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
          <!-- Header -->
          <tr>
            <td style="padding: 24px 32px; text-align: center; background-color: #2c5aa0; border-radius: 8px 8px 0 0;">
              <img src="https://www.schuldnerberatung-anwalt.de/wp-content/uploads/2024/10/Logo-T-Scuric.png" alt="Thomas Scuric Rechtsanwälte" style="height: 40px; width: auto;">
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 24px; font-size: 20px; font-weight: 600; color: #2c5aa0;">
                Schuldenbereinigungsplan - 2. Runde
              </h2>

              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #333;">
                Sehr geehrte Damen und Herren,
              </p>

              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #333;">
                wir übersenden Ihnen den außergerichtlichen Schuldenbereinigungsplan für unseren Mandanten <strong>${clientName}</strong>.
              </p>

              <!-- Document Download Button -->
              <div style="text-align: center; margin: 32px 0;">
                <a href="${documentUrl}"
                   style="display: inline-block; background-color: #2c5aa0; color: #ffffff; padding: 14px 28px;
                          text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">
                  ${documentFilename || 'Dokument herunterladen'}
                </a>
              </div>

              <!-- Instructions Box -->
              <div style="background-color: #f8f9fa; padding: 20px; border-left: 4px solid #2c5aa0; margin: 24px 0;">
                <h4 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: #333;">Wichtige Hinweise:</h4>
                <ul style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #555;">
                  <li>Bitte prüfen Sie den beigefügten Schuldenbereinigungsplan</li>
                  <li>Teilen Sie uns Ihre Entscheidung innerhalb der Frist mit</li>
                  <li>Bei Rückfragen stehen wir Ihnen gerne zur Verfügung</li>
                </ul>
              </div>

              <p style="margin: 24px 0 0; font-size: 15px; line-height: 1.6; color: #333;">
                Mit freundlichen Grüßen
              </p>
              <p style="margin: 8px 0 0; font-size: 15px; font-weight: 600; color: #333;">
                Thomas Scuric Rechtsanwälte
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f8f9fa; border-top: 1px solid #eee; border-radius: 0 0 8px 8px;">
              <table style="width: 100%;">
                <tr>
                  <td style="font-size: 12px; color: #666; line-height: 1.6;">
                    <strong>Thomas Scuric Rechtsanwälte</strong><br>
                    Bongardstraße 33, 44787 Bochum<br>
                    Tel: 0234 913681-0<br>
                    E-Mail: office@scuric.de
                  </td>
                  <td style="font-size: 12px; color: #888; text-align: right; vertical-align: top;">
                    Aktenzeichen: ${clientReference}<br>
                    Datum: ${currentDate}
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

  /**
   * Generate plain text email for second round
   * @private
   */
  generateSecondRoundEmailText({ recipientName, clientName, clientReference, documentUrl, documentFilename, settlementDetails }) {
    const currentDate = new Date().toLocaleDateString('de-DE');

    return `
Schuldenbereinigungsplan - 2. Runde

Sehr geehrte Damen und Herren,

wir übersenden Ihnen den außergerichtlichen Schuldenbereinigungsplan für unseren Mandanten ${clientName}.

DOKUMENT ZUM DOWNLOAD:

${documentFilename || 'Schuldenbereinigungsplan'}:
${documentUrl}

WICHTIGE HINWEISE:

- Bitte prüfen Sie den beigefügten Schuldenbereinigungsplan
- Teilen Sie uns Ihre Entscheidung innerhalb der Frist mit
- Bei Rückfragen stehen wir Ihnen gerne zur Verfügung

Mit freundlichen Grüßen

Thomas Scuric Rechtsanwälte
Bongardstraße 33
44787 Bochum

Telefon: 0234 913681-0
E-Mail: office@scuric.de

---
Aktenzeichen: ${clientReference}
Datum: ${currentDate}
    `.trim();
  }

  /**
   * Check if the service is ready to send emails
   * @returns {boolean}
   */
  isConfigured() {
    return !!this.resend;
  }
}

// Export singleton instance
module.exports = new CreditorEmailService();
