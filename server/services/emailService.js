const config = require('../config');

/**
 * EmailService
 * Sends verification code emails using Resend SDK
 * In development mode without API key: logs email to console
 */
class EmailService {
  constructor() {
    this.resend = null;
    this.fromEmail = 'noreply@schuldnerberatung-anwalt.de';
    this.fromName = 'Scuric Mandantenportal';

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
        console.log('✅ EmailService: Resend SDK initialized');
      } catch (error) {
        console.error('❌ EmailService: Failed to initialize Resend SDK:', error.message);
        this.resend = null;
      }
    } else {
      console.log('⚠️ EmailService: No RESEND_API_KEY configured - emails will be logged to console');
    }
  }

  /**
   * Generate HTML email template for verification code
   * @param {string} code - The 6-digit verification code
   * @param {number} expiresInMinutes - Minutes until code expires
   * @returns {string} HTML content
   */
  generateVerificationEmailHtml(code, expiresInMinutes = 5) {
    return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ihr Verifizierungscode</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #eee;">
              <img src="https://www.schuldnerberatung-anwalt.de/wp-content/uploads/2024/10/Logo-T-Scuric.png" alt="Scuric Logo" style="height: 40px; width: auto;">
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 600; color: #111827; text-align: center;">
                Ihr Verifizierungscode
              </h1>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.5; color: #6b7280; text-align: center;">
                Verwenden Sie den folgenden Code, um sich im Mandantenportal anzumelden:
              </p>

              <!-- Code Box -->
              <div style="background-color: #f9fafb; border: 2px solid #e5e7eb; border-radius: 8px; padding: 24px; text-align: center; margin: 0 0 24px;">
                <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #111827; font-family: monospace;">
                  ${code}
                </span>
              </div>

              <p style="margin: 0 0 8px; font-size: 14px; color: #9ca3af; text-align: center;">
                Dieser Code ist <strong>${expiresInMinutes} Minuten</strong> gültig.
              </p>
              <p style="margin: 0; font-size: 14px; color: #9ca3af; text-align: center;">
                Falls Sie diese Anfrage nicht gestellt haben, ignorieren Sie diese E-Mail.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f9fafb; border-top: 1px solid #eee; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">
                © ${new Date().getFullYear()} Scuric. Alle Rechte vorbehalten.
              </p>
              <p style="margin: 8px 0 0; font-size: 12px; color: #9ca3af; text-align: center;">
                <a href="https://www.schuldnerberatung-anwalt.de/impressum/" style="color: #6b7280; text-decoration: none;">Impressum</a>
                <span style="color: #9ca3af;"> • </span>
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
   * Generate plain text email for verification code
   * @param {string} code - The 6-digit verification code
   * @param {number} expiresInMinutes - Minutes until code expires
   * @returns {string} Plain text content
   */
  generateVerificationEmailText(code, expiresInMinutes = 5) {
    return `
Ihr Verifizierungscode für das Scuric Mandantenportal

Code: ${code}

Dieser Code ist ${expiresInMinutes} Minuten gültig.

Falls Sie diese Anfrage nicht gestellt haben, ignorieren Sie diese E-Mail.

--
Scuric
https://www.schuldnerberatung-anwalt.de
    `.trim();
  }

  /**
   * Send verification code email
   * @param {string} email - Recipient email address
   * @param {string} code - The 6-digit verification code
   * @param {number} expiresInMinutes - Minutes until code expires
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async sendVerificationCode(email, code, expiresInMinutes = 5) {
    const subject = `${code} - Ihr Verifizierungscode`;
    const html = this.generateVerificationEmailHtml(code, expiresInMinutes);
    const text = this.generateVerificationEmailText(code, expiresInMinutes);

    // If Resend is not configured, log to console (dev mode)
    if (!this.resend) {
      console.log('\n📧 ================================');
      console.log('📧 VERIFICATION EMAIL (DEV MODE)');
      console.log('📧 ================================');
      console.log(`📧 To: ${email}`);
      console.log(`📧 Subject: ${subject}`);
      console.log(`📧 Code: ${code}`);
      console.log(`📧 Expires in: ${expiresInMinutes} minutes`);
      console.log('📧 ================================\n');

      return { success: true, devMode: true };
    }

    try {
      const response = await this.resend.emails.send({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: email,
        subject,
        html,
        text
      });

      console.log(`✅ Verification email sent to ${email} (ID: ${response.id})`);

      return { success: true, emailId: response.id };
    } catch (error) {
      console.error(`❌ Failed to send verification email to ${email}:`, error.message);

      return {
        success: false,
        error: error.message || 'Failed to send email'
      };
    }
  }

  /**
   * Generate HTML email template for document request
   * @param {string} clientName - Client's full name
   * @param {string} portalUrl - URL to the portal login
   * @returns {string} HTML content
   */
  generateDocumentRequestEmailHtml(clientName, portalUrl) {
    return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bitte laden Sie Ihre Unterlagen hoch</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #eee;">
              <img src="https://www.schuldnerberatung-anwalt.de/wp-content/uploads/2024/10/Logo-T-Scuric.png" alt="Scuric Logo" style="height: 40px; width: auto;">
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 600; color: #111827;">
                Unterlagen benötigt
              </h1>
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.5; color: #374151;">
                Guten Tag ${clientName},
              </p>
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.5; color: #374151;">
                Ihre 1. Rate wurde bestätigt. Um den Prozess fortzusetzen, laden Sie bitte Ihre Gläubiger-Unterlagen im Mandantenportal hoch.
              </p>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.5; color: #374151;">
                Bitte scannen oder fotografieren Sie Ihre Schreiben von Gläubigern und laden Sie diese über das Portal hoch.
              </p>

              <!-- CTA Button -->
              <div style="text-align: center; margin: 0 0 24px;">
                <a href="${portalUrl}" style="display: inline-block; padding: 14px 32px; background-color: #111827; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;">
                  Zum Mandantenportal
                </a>
              </div>

              <p style="margin: 0; font-size: 14px; color: #9ca3af; text-align: center;">
                Falls Sie Fragen haben, antworten Sie einfach auf diese E-Mail.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f9fafb; border-top: 1px solid #eee; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">
                © ${new Date().getFullYear()} Scuric. Alle Rechte vorbehalten.
              </p>
              <p style="margin: 8px 0 0; font-size: 12px; color: #9ca3af; text-align: center;">
                <a href="https://www.schuldnerberatung-anwalt.de/impressum/" style="color: #6b7280; text-decoration: none;">Impressum</a>
                <span style="color: #9ca3af;"> • </span>
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
   * Generate plain text email for document request
   * @param {string} clientName - Client's full name
   * @param {string} portalUrl - URL to the portal login
   * @returns {string} Plain text content
   */
  generateDocumentRequestEmailText(clientName, portalUrl) {
    return `
Unterlagen benötigt — Scuric Mandantenportal

Guten Tag ${clientName},

Ihre 1. Rate wurde bestätigt. Um den Prozess fortzusetzen, laden Sie bitte Ihre Gläubiger-Unterlagen im Mandantenportal hoch.

Bitte scannen oder fotografieren Sie Ihre Schreiben von Gläubigern und laden Sie diese über das Portal hoch.

Zum Mandantenportal: ${portalUrl}

Falls Sie Fragen haben, antworten Sie einfach auf diese E-Mail.

--
Scuric
https://www.schuldnerberatung-anwalt.de
    `.trim();
  }

  /**
   * Send document request email to client
   * @param {string} email - Recipient email address
   * @param {string} clientName - Client's full name
   * @param {string} portalUrl - URL to the portal login
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async sendDocumentRequestEmail(email, clientName, portalUrl) {
    const subject = 'Bitte laden Sie Ihre Unterlagen hoch — Scuric Mandantenportal';
    const html = this.generateDocumentRequestEmailHtml(clientName, portalUrl);
    const text = this.generateDocumentRequestEmailText(clientName, portalUrl);

    // If Resend is not configured, log to console (dev mode)
    if (!this.resend) {
      console.log('\n📧 ================================');
      console.log('📧 DOCUMENT REQUEST EMAIL (DEV MODE)');
      console.log('📧 ================================');
      console.log(`📧 To: ${email}`);
      console.log(`📧 Subject: ${subject}`);
      console.log(`📧 Client: ${clientName}`);
      console.log(`📧 Portal URL: ${portalUrl}`);
      console.log('📧 ================================\n');

      return { success: true, devMode: true };
    }

    try {
      const response = await this.resend.emails.send({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: email,
        subject,
        html,
        text
      });

      console.log(`✅ Document request email sent to ${email} (ID: ${response.id})`);

      return { success: true, emailId: response.id };
    } catch (error) {
      console.error(`❌ Failed to send document request email to ${email}:`, error.message);

      return {
        success: false,
        error: error.message || 'Failed to send email'
      };
    }
  }

  /**
   * Generate HTML email template for creditor confirmation
   * @param {string} clientName - Client's full name
   * @param {string} aktenzeichen - Case reference number
   * @param {number} attachmentCount - Number of attachments
   * @returns {string} HTML content
   */
  generateCreditorConfirmationEmailHtml(clientName, aktenzeichen, attachmentCount) {
    return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ihre Gläubigerliste wurde bestätigt</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #eee;">
              <img src="https://www.schuldnerberatung-anwalt.de/wp-content/uploads/2024/10/Logo-T-Scuric.png" alt="Scuric Logo" style="height: 40px; width: auto;">
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 600; color: #111827;">
                Gläubigerliste bestätigt
              </h1>
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.5; color: #374151;">
                Guten Tag ${clientName},
              </p>
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.5; color: #374151;">
                vielen Dank für die Bestätigung Ihrer Gläubigerliste (Az. ${aktenzeichen}). Wir haben den Kontakt zu Ihren Gläubigern eingeleitet.
              </p>
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.5; color: #374151;">
                Im Anhang finden Sie:
              </p>
              <ul style="margin: 0 0 24px; padding-left: 24px; font-size: 16px; line-height: 1.8; color: #374151;">
                <li>Ihre finale Gläubigerliste als PDF</li>
                <li>Die versendeten Erstanschreiben an Ihre Gläubiger (${attachmentCount - 1} Dokument${attachmentCount - 1 !== 1 ? 'e' : ''})</li>
              </ul>
              <p style="margin: 0; font-size: 14px; color: #9ca3af; text-align: center;">
                Falls Sie Fragen haben, antworten Sie einfach auf diese E-Mail.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f9fafb; border-top: 1px solid #eee; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">
                © ${new Date().getFullYear()} Scuric. Alle Rechte vorbehalten.
              </p>
              <p style="margin: 8px 0 0; font-size: 12px; color: #9ca3af; text-align: center;">
                <a href="https://www.schuldnerberatung-anwalt.de/impressum/" style="color: #6b7280; text-decoration: none;">Impressum</a>
                <span style="color: #9ca3af;"> • </span>
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
   * Generate plain text email for creditor confirmation
   * @param {string} clientName - Client's full name
   * @param {string} aktenzeichen - Case reference number
   * @param {number} attachmentCount - Number of attachments
   * @returns {string} Plain text content
   */
  generateCreditorConfirmationEmailText(clientName, aktenzeichen, attachmentCount) {
    return `
Gläubigerliste bestätigt — Scuric Mandantenportal

Guten Tag ${clientName},

vielen Dank für die Bestätigung Ihrer Gläubigerliste (Az. ${aktenzeichen}). Wir haben den Kontakt zu Ihren Gläubigern eingeleitet.

Im Anhang finden Sie:
- Ihre finale Gläubigerliste als PDF
- Die versendeten Erstanschreiben an Ihre Gläubiger (${attachmentCount - 1} Dokument${attachmentCount - 1 !== 1 ? 'e' : ''})

Falls Sie Fragen haben, antworten Sie einfach auf diese E-Mail.

--
Scuric
https://www.schuldnerberatung-anwalt.de
    `.trim();
  }

  /**
   * Send creditor confirmation email to client with attachments
   * @param {Object} params
   * @param {string} params.email - Recipient email address
   * @param {string} params.clientName - Client's full name
   * @param {string} params.aktenzeichen - Case reference number
   * @param {Array<{filename: string, content: Buffer}>} params.attachments - File attachments
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async sendCreditorConfirmationEmail({ email, clientName, aktenzeichen, attachments }) {
    const subject = `Ihre Gläubigerliste wurde bestätigt — Az. ${aktenzeichen}`;
    const html = this.generateCreditorConfirmationEmailHtml(clientName, aktenzeichen, attachments.length);
    const text = this.generateCreditorConfirmationEmailText(clientName, aktenzeichen, attachments.length);

    // If Resend is not configured, log to console (dev mode)
    if (!this.resend) {
      console.log('\n📧 ================================');
      console.log('📧 CREDITOR CONFIRMATION EMAIL (DEV MODE)');
      console.log('📧 ================================');
      console.log(`📧 To: ${email}`);
      console.log(`📧 Subject: ${subject}`);
      console.log(`📧 Client: ${clientName}`);
      console.log(`📧 Aktenzeichen: ${aktenzeichen}`);
      console.log(`📧 Attachments: ${attachments.length}`);
      attachments.forEach(a => console.log(`📧   - ${a.filename} (${Math.round(a.content.length / 1024)} KB)`));
      console.log('📧 ================================\n');

      return { success: true, devMode: true };
    }

    try {
      const response = await this.resend.emails.send({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: email,
        subject,
        html,
        text,
        attachments
      });

      console.log(`✅ Creditor confirmation email sent to ${email} (ID: ${response.id}, ${attachments.length} attachments)`);

      return { success: true, emailId: response.id };
    } catch (error) {
      console.error(`❌ Failed to send creditor confirmation email to ${email}:`, error.message);

      return {
        success: false,
        error: error.message || 'Failed to send email'
      };
    }
  }

  /**
   * Mask email address for display (e.g., "j***@example.com")
   * @param {string} email - Full email address
   * @returns {string} Masked email address
   */
  maskEmail(email) {
    if (!email || !email.includes('@')) {
      return '***@***.***';
    }

    const [localPart, domain] = email.split('@');

    // Show first character, mask the rest
    const maskedLocal = localPart.length > 1
      ? localPart[0] + '*'.repeat(Math.min(localPart.length - 1, 5))
      : '*';

    // Split domain into name and TLD
    const domainParts = domain.split('.');
    if (domainParts.length >= 2) {
      const domainName = domainParts.slice(0, -1).join('.');
      const tld = domainParts[domainParts.length - 1];
      const maskedDomain = domainName[0] + '*'.repeat(Math.min(domainName.length - 1, 4)) + '.' + tld;
      return `${maskedLocal}@${maskedDomain}`;
    }

    return `${maskedLocal}@${domain}`;
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
module.exports = new EmailService();
