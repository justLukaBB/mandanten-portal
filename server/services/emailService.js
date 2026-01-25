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
                <a href="https://www.schuldnerberatung-anwalt.de/impressum/" style="color: #6b7280;">Impressum</a>
                &nbsp;•&nbsp;
                <a href="https://www.schuldnerberatung-anwalt.de/datenschutz/" style="color: #6b7280;">Datenschutz</a>
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
