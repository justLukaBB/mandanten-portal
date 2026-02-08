const config = require('../config');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Matcher API URL for syncing inquiries
const MATCHER_API_URL = config.MATCHER_API_URL || process.env.MATCHER_API_URL || 'https://creditor-email-matcher.onrender.com';

/**
 * CreditorEmailService
 * Sends creditor emails (first round, second round) using Resend SDK
 * Replaces Zendesk Side Conversations for better control over sender address
 * In development mode without API key: logs email to console
 *
 * NEW: Automatically syncs sent emails to creditor-email-matcher for reply matching
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
   * Sync sent email to matcher service for reply matching
   * @private
   */
  async syncToMatcher({ clientName, clientReference, creditorName, creditorEmail, creditorReference, resendEmailId, emailType }) {
    try {
      const payload = {
        client_name: clientName,
        client_reference_number: clientReference,
        creditor_name: creditorName,
        creditor_email: creditorEmail,
        reference_numbers: creditorReference ? [creditorReference] : [],
        resend_email_id: resendEmailId,
        email_provider: 'resend',
        sent_at: new Date().toISOString(),
        notes: `${emailType} email sent via Resend`
      };

      console.log(`🔄 Syncing to matcher: ${clientName} → ${creditorName}`);

      const response = await axios.post(
        `${MATCHER_API_URL}/api/v1/inquiries/`,
        payload,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        }
      );

      console.log(`✅ Synced to matcher - Inquiry ID: ${response.data.id}`);
      return { success: true, inquiryId: response.data.id };

    } catch (error) {
      if (error.response?.status === 409) {
        console.log(`ℹ️ Matcher sync: Inquiry already exists`);
        return { success: true, duplicate: true };
      }

      console.error(`⚠️ Matcher sync failed (non-blocking):`, error.message);
      // Non-blocking - email was sent successfully, sync failure is logged but doesn't fail the operation
      return { success: false, error: error.message };
    }
  }

  /**
   * Send first round creditor email with document attachment
   * @param {Object} options
   * @param {string} options.recipientEmail - Creditor email address
   * @param {string} options.recipientName - Creditor name
   * @param {string} options.clientName - Client full name
   * @param {string} options.clientReference - Aktenzeichen
   * @param {string} [options.creditorReference] - Creditor's reference number (optional)
   * @param {Object} [options.attachment] - Document attachment
   * @param {string} options.attachment.filename - Document filename
   * @param {string} options.attachment.path - Local file path to the document
   * @returns {Promise<{success: boolean, emailId?: string, error?: string}>}
   */
  async sendFirstRoundEmail({ recipientEmail, recipientName, clientName, clientReference, creditorReference, attachment }) {
    const subject = `Außergerichtlicher Einigungsversuch - ${clientName} - Az: ${clientReference}`;
    const html = this.generateFirstRoundEmailHtml({
      recipientName,
      clientName,
      clientReference,
      creditorReference,
      attachmentFilename: attachment?.filename
    });
    const text = this.generateFirstRoundEmailText({
      recipientName,
      clientName,
      clientReference,
      creditorReference,
      attachmentFilename: attachment?.filename
    });

    // Prepare attachment if provided
    let attachments = [];
    if (attachment?.path) {
      try {
        const content = fs.readFileSync(attachment.path);
        attachments.push({
          filename: attachment.filename || path.basename(attachment.path),
          content: content
        });
        console.log(`📎 Attachment prepared: ${attachment.filename} (${Math.round(content.length / 1024)} KB)`);
      } catch (err) {
        console.error(`❌ Failed to read attachment file: ${err.message}`);
      }
    }

    const result = await this.sendEmail({
      to: recipientEmail,
      toName: recipientName,
      subject,
      html,
      text,
      attachments,
      tags: [
        { name: 'type', value: 'first_round' },
        { name: 'client_reference', value: clientReference }
      ]
    });

    // Sync to matcher after successful send
    if (result.success && result.emailId) {
      await this.syncToMatcher({
        clientName,
        clientReference,
        creditorName: recipientName,
        creditorEmail: recipientEmail,
        creditorReference,
        resendEmailId: result.emailId,
        emailType: 'first_round'
      });
    }

    return result;
  }

  /**
   * Send second round creditor email with settlement plan attachment
   * @param {Object} options
   * @param {string} options.recipientEmail - Creditor email address
   * @param {string} options.recipientName - Creditor name
   * @param {string} options.clientName - Client full name
   * @param {string} options.clientReference - Aktenzeichen
   * @param {Object} [options.attachment] - Document attachment
   * @param {string} options.attachment.filename - Document filename
   * @param {string} options.attachment.path - Local file path to the document
   * @param {Object} [options.settlementDetails] - Settlement plan details
   * @returns {Promise<{success: boolean, emailId?: string, error?: string}>}
   */
  async sendSecondRoundEmail({ recipientEmail, recipientName, clientName, clientReference, attachment, settlementDetails }) {
    const subject = `Schuldenbereinigungsplan - ${clientName} - Az: ${clientReference}`;
    const html = this.generateSecondRoundEmailHtml({
      recipientName,
      clientName,
      clientReference,
      attachmentFilename: attachment?.filename,
      settlementDetails
    });
    const text = this.generateSecondRoundEmailText({
      recipientName,
      clientName,
      clientReference,
      attachmentFilename: attachment?.filename,
      settlementDetails
    });

    // Prepare attachment if provided
    let attachments = [];
    if (attachment?.path) {
      try {
        const content = fs.readFileSync(attachment.path);
        attachments.push({
          filename: attachment.filename || path.basename(attachment.path),
          content: content
        });
        console.log(`📎 Attachment prepared: ${attachment.filename} (${Math.round(content.length / 1024)} KB)`);
      } catch (err) {
        console.error(`❌ Failed to read attachment file: ${err.message}`);
      }
    }

    const result = await this.sendEmail({
      to: recipientEmail,
      toName: recipientName,
      subject,
      html,
      text,
      attachments,
      tags: [
        { name: 'type', value: 'second_round' },
        { name: 'client_reference', value: clientReference }
      ]
    });

    // Sync to matcher after successful send
    if (result.success && result.emailId) {
      await this.syncToMatcher({
        clientName,
        clientReference,
        creditorName: recipientName,
        creditorEmail: recipientEmail,
        creditorReference: null,
        resendEmailId: result.emailId,
        emailType: 'second_round'
      });
    }

    return result;
  }

  /**
   * Core email sending function
   * @private
   */
  async sendEmail({ to, toName, subject, html, text, attachments = [], tags = [] }) {
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
      console.log(`📧 Attachments: ${attachments.length > 0 ? attachments.map(a => a.filename).join(', ') : 'none'}`);
      console.log(`📧 Tags: ${JSON.stringify(tags)}`);
      console.log('📧 ================================\n');

      return { success: true, devMode: true, emailId: `dev-${Date.now()}` };
    }

    try {
      const emailPayload = {
        from: `${this.fromName} <${this.fromEmail}>`,
        to: to,
        reply_to: this.replyTo,
        subject,
        html,
        text,
        tags
      };

      // Add attachments if present
      if (attachments.length > 0) {
        emailPayload.attachments = attachments;
      }

      const response = await this.resend.emails.send(emailPayload);

      console.log(`✅ Creditor email sent to ${to} (ID: ${response.id})${attachments.length > 0 ? ` with ${attachments.length} attachment(s)` : ''}`);

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
   * Clean, modern design matching verification emails
   * @private
   */
  generateFirstRoundEmailHtml({ recipientName, clientName, clientReference, creditorReference, attachmentFilename }) {
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
        <table role="presentation" style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #eee;">
              <img src="https://www.schuldnerberatung-anwalt.de/wp-content/uploads/2024/10/Logo-T-Scuric.png" alt="Thomas Scuric Rechtsanwälte" style="height: 40px; width: auto;">
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #111827; text-align: center;">
                Außergerichtlicher Einigungsversuch
              </h1>

              <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #374151;">
                Sehr geehrte Damen und Herren,
              </p>

              <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #374151;">
                im Auftrag unseres Mandanten <strong>${clientName}</strong> führen wir einen außergerichtlichen Einigungsversuch gemäß § 305 InsO durch.
              </p>

              <!-- Attachment Notice -->
              <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 16px; margin: 24px 0;">
                <p style="margin: 0; font-size: 14px; color: #0369a1;">
                  📎 <strong>Anlage:</strong> ${attachmentFilename || 'Erstschreiben'}
                </p>
              </div>

              <!-- Action Items -->
              <div style="background-color: #f9fafb; border-radius: 8px; padding: 20px; margin: 24px 0;">
                <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: #111827;">
                  Wir bitten um Mitteilung folgender Informationen:
                </h3>
                <ul style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #4b5563;">
                  <li>Aktuelle Forderungshöhe (aufgeschlüsselt nach Hauptforderung, Zinsen, Kosten)</li>
                  <li>Kopie eventuell vorliegender Titel</li>
                  <li>Angabe bestehender Sicherheiten</li>
                </ul>
              </div>

              <p style="margin: 0 0 8px; font-size: 14px; color: #6b7280; text-align: center;">
                <strong>Antwortfrist:</strong> 14 Tage
              </p>

              <p style="margin: 24px 0 0; font-size: 15px; line-height: 1.6; color: #374151;">
                Mit freundlichen Grüßen
              </p>
              <p style="margin: 4px 0 0; font-size: 15px; font-weight: 600; color: #111827;">
                Thomas Scuric Rechtsanwälte
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f9fafb; border-top: 1px solid #eee; border-radius: 0 0 12px 12px;">
              <table style="width: 100%;">
                <tr>
                  <td style="font-size: 12px; color: #6b7280; line-height: 1.6;">
                    <strong>Thomas Scuric Rechtsanwälte</strong><br>
                    Bongardstraße 33, 44787 Bochum<br>
                    Tel: 0234 913681-0 · E-Mail: office@scuric.de
                  </td>
                  <td style="font-size: 12px; color: #9ca3af; text-align: right; vertical-align: top;">
                    Az: ${clientReference}<br>
                    ${currentDate}
                  </td>
                </tr>
              </table>
              <p style="margin: 16px 0 0; font-size: 11px; color: #9ca3af; text-align: center;">
                <a href="https://www.schuldnerberatung-anwalt.de/impressum/" style="color: #6b7280; text-decoration: none;">Impressum</a>
                <span style="color: #d1d5db;"> · </span>
                <a href="https://www.schuldnerberatung-anwalt.de/datenschutz/" style="color: #6b7280; text-decoration: none;">Datenschutz</a>
              </p>
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
  generateFirstRoundEmailText({ recipientName, clientName, clientReference, creditorReference, attachmentFilename }) {
    const currentDate = new Date().toLocaleDateString('de-DE');

    return `
Außergerichtlicher Einigungsversuch
====================================

Sehr geehrte Damen und Herren,

im Auftrag unseres Mandanten ${clientName} führen wir einen außergerichtlichen Einigungsversuch gemäß § 305 InsO durch.

ANLAGE: ${attachmentFilename || 'Erstschreiben'}

Wir bitten um Mitteilung folgender Informationen:

- Aktuelle Forderungshöhe (aufgeschlüsselt nach Hauptforderung, Zinsen, Kosten)
- Kopie eventuell vorliegender Titel
- Angabe bestehender Sicherheiten

Antwortfrist: 14 Tage

Mit freundlichen Grüßen

Thomas Scuric Rechtsanwälte
Bongardstraße 33
44787 Bochum

Tel: 0234 913681-0
E-Mail: office@scuric.de

---
Aktenzeichen: ${clientReference}
Datum: ${currentDate}
    `.trim();
  }

  /**
   * Generate HTML email for second round (Schuldenbereinigungsplan)
   * Clean, modern design matching verification emails
   * @private
   */
  generateSecondRoundEmailHtml({ recipientName, clientName, clientReference, attachmentFilename, settlementDetails }) {
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
        <table role="presentation" style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #eee;">
              <img src="https://www.schuldnerberatung-anwalt.de/wp-content/uploads/2024/10/Logo-T-Scuric.png" alt="Thomas Scuric Rechtsanwälte" style="height: 40px; width: auto;">
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #111827; text-align: center;">
                Schuldenbereinigungsplan
              </h1>

              <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #374151;">
                Sehr geehrte Damen und Herren,
              </p>

              <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #374151;">
                wir übersenden Ihnen den außergerichtlichen Schuldenbereinigungsplan für unseren Mandanten <strong>${clientName}</strong>.
              </p>

              <!-- Attachment Notice -->
              <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 16px; margin: 24px 0;">
                <p style="margin: 0; font-size: 14px; color: #0369a1;">
                  📎 <strong>Anlage:</strong> ${attachmentFilename || 'Schuldenbereinigungsplan'}
                </p>
              </div>

              <!-- Important Notice -->
              <div style="background-color: #fefce8; border: 1px solid #fde047; border-radius: 8px; padding: 16px; margin: 24px 0;">
                <p style="margin: 0; font-size: 14px; color: #854d0e;">
                  <strong>Hinweis:</strong> Bitte prüfen Sie den beigefügten Schuldenbereinigungsplan und teilen Sie uns Ihre Entscheidung innerhalb der gesetzten Frist mit.
                </p>
              </div>

              <p style="margin: 24px 0 0; font-size: 15px; line-height: 1.6; color: #374151;">
                Mit freundlichen Grüßen
              </p>
              <p style="margin: 4px 0 0; font-size: 15px; font-weight: 600; color: #111827;">
                Thomas Scuric Rechtsanwälte
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f9fafb; border-top: 1px solid #eee; border-radius: 0 0 12px 12px;">
              <table style="width: 100%;">
                <tr>
                  <td style="font-size: 12px; color: #6b7280; line-height: 1.6;">
                    <strong>Thomas Scuric Rechtsanwälte</strong><br>
                    Bongardstraße 33, 44787 Bochum<br>
                    Tel: 0234 913681-0 · E-Mail: office@scuric.de
                  </td>
                  <td style="font-size: 12px; color: #9ca3af; text-align: right; vertical-align: top;">
                    Az: ${clientReference}<br>
                    ${currentDate}
                  </td>
                </tr>
              </table>
              <p style="margin: 16px 0 0; font-size: 11px; color: #9ca3af; text-align: center;">
                <a href="https://www.schuldnerberatung-anwalt.de/impressum/" style="color: #6b7280; text-decoration: none;">Impressum</a>
                <span style="color: #d1d5db;"> · </span>
                <a href="https://www.schuldnerberatung-anwalt.de/datenschutz/" style="color: #6b7280; text-decoration: none;">Datenschutz</a>
              </p>
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
  generateSecondRoundEmailText({ recipientName, clientName, clientReference, attachmentFilename, settlementDetails }) {
    const currentDate = new Date().toLocaleDateString('de-DE');

    return `
Schuldenbereinigungsplan
========================

Sehr geehrte Damen und Herren,

wir übersenden Ihnen den außergerichtlichen Schuldenbereinigungsplan für unseren Mandanten ${clientName}.

ANLAGE: ${attachmentFilename || 'Schuldenbereinigungsplan'}

HINWEIS: Bitte prüfen Sie den beigefügten Schuldenbereinigungsplan und teilen Sie uns Ihre Entscheidung innerhalb der gesetzten Frist mit.

Mit freundlichen Grüßen

Thomas Scuric Rechtsanwälte
Bongardstraße 33
44787 Bochum

Tel: 0234 913681-0
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
