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
   * Generate HTML email template for second letter notification
   * @param {string} clientName - Client's full name
   * @param {string} portalUrl - Portal login URL
   * @param {string} aktenzeichen - Client's case reference number
   * @returns {string} HTML content
   */
  generateSecondLetterNotificationHtml(clientName, portalUrl, aktenzeichen) {
    return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bitte bestätigen Sie Ihre Daten für das 2. Anschreiben</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08); padding: 40px;">
          <!-- Header -->
          <tr>
            <td style="padding: 0 0 32px; text-align: center; border-bottom: 1px solid #eee;">
              <img src="https://www.schuldnerberatung-anwalt.de/wp-content/uploads/2024/10/Logo-T-Scuric.png" alt="RA T. Scuric" style="height: 40px; width: auto;">
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px 0 0;">
              <h1 style="margin: 0 0 24px; font-size: 22px; font-weight: 600; color: #111827;">
                2. Gläubigeranschreiben — Ihre Daten werden benötigt
              </h1>
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #374151;">
                Sehr geehrte/r ${clientName},
              </p>
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #374151;">
                im Rahmen Ihres Insolvenzverfahrens (Aktenzeichen: <strong>${aktenzeichen}</strong>) wurde das erste Gläubigeranschreiben bereits erfolgreich versandt. Wir bereiten nun das 2. Gläubigeranschreiben vor.
              </p>
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #374151;">
                Damit wir die Anschreiben korrekt und aktuell erstellen können, benötigen wir Ihre bestätigten finanziellen Daten. Bitte nehmen Sie sich einen Moment Zeit, Ihre aktuellen Angaben zu überprüfen und zu bestätigen.
              </p>
              <p style="margin: 0 0 32px; font-size: 16px; line-height: 1.6; color: #374151;">
                Nach Ihrer Bestätigung werden wir die erforderlichen Unterlagen erstellen und an Ihre Gläubiger versenden. Sie müssen nach dem Ausfüllen des Formulars nichts weiter unternehmen.
              </p>

              <!-- CTA Button -->
              <div style="text-align: center; margin: 0 0 32px;">
                <a href="${portalUrl}" style="display: inline-block; padding: 14px 28px; background-color: #111827; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;">
                  Daten bestätigen
                </a>
              </div>

              <p style="margin: 0; font-size: 14px; color: #9ca3af; text-align: center;">
                Loggen Sie sich einfach im Portal ein, um das Formular auszufüllen. Falls Sie Fragen haben, antworten Sie einfach auf diese E-Mail.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 0 0; border-top: 1px solid #eee; margin-top: 32px;">
              <p style="margin: 0 0 8px; font-size: 12px; color: #9ca3af; text-align: center;">
                Aktenzeichen: <strong>${aktenzeichen}</strong>
              </p>
              <p style="margin: 0 0 8px; font-size: 12px; color: #9ca3af; text-align: center;">
                © ${new Date().getFullYear()} Kanzlei RA T. Scuric. Alle Rechte vorbehalten.
              </p>
              <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">
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
   * Generate plain text email for second letter notification
   * @param {string} clientName - Client's full name
   * @param {string} portalUrl - Portal login URL
   * @param {string} aktenzeichen - Client's case reference number
   * @returns {string} Plain text content
   */
  generateSecondLetterNotificationText(clientName, portalUrl, aktenzeichen) {
    return `
Sehr geehrte/r ${clientName},

im Rahmen Ihres Insolvenzverfahrens (Aktenzeichen: ${aktenzeichen}) wurde das erste Gläubigeranschreiben bereits versandt. Wir bereiten nun das 2. Gläubigeranschreiben vor.

Bitte bestätigen Sie Ihre aktuellen finanziellen Daten unter folgendem Link:

${portalUrl}

Nach Ihrer Bestätigung werden die Anschreiben erstellt und an Ihre Gläubiger versandt.

Loggen Sie sich einfach im Portal ein, um das Formular auszufüllen.

Mit freundlichen Grüßen
Kanzlei RA T. Scuric

Aktenzeichen: ${aktenzeichen}
    `.trim();
  }

  /**
   * Send second letter notification email to client
   * Called by SecondLetterTriggerService after successful IDLE → PENDING transition.
   * @param {string} email - Recipient email address
   * @param {string} clientName - Client's full name
   * @param {string} portalUrl - Portal login URL
   * @param {string} aktenzeichen - Client's case reference number
   * @returns {Promise<{ success: boolean, emailId?: string, devMode?: boolean, error?: string }>}
   */
  async sendSecondLetterNotification(email, clientName, portalUrl, aktenzeichen) {
    const subject = 'Bitte bestätigen Sie Ihre Daten für das 2. Anschreiben';
    const html = this.generateSecondLetterNotificationHtml(clientName, portalUrl, aktenzeichen);
    const text = this.generateSecondLetterNotificationText(clientName, portalUrl, aktenzeichen);

    // Dev mode: no Resend API key configured — log to console instead of sending.
    if (!this.resend) {
      console.log('\n📧 ================================');
      console.log('📧 SECOND LETTER NOTIFICATION (DEV MODE)');
      console.log('📧 ================================');
      console.log(`📧 To: ${email}`);
      console.log(`📧 Subject: ${subject}`);
      console.log(`📧 Portal URL: ${portalUrl}`);
      console.log(`📧 Aktenzeichen: ${aktenzeichen}`);
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

      const emailId = response.data?.id || response.id;
      console.log(`✅ Second letter notification sent to ${email} (ID: ${emailId})`);

      return { success: true, emailId };
    } catch (error) {
      console.error(`❌ Failed to send second letter notification to ${email}:`, error.message);

      return { success: false, error: error.message };
    }
  }

  /**
   * Send creditor confirmation email to client
   * Asks the client to review and confirm their creditor list in the portal
   */
  async sendCreditorConfirmationEmail(email, client, creditors, portalUrl, totalDebt) {
    const { firstName, lastName, aktenzeichen } = client;
    const subject = `Ihre Gläubigerliste zur Bestätigung (${aktenzeichen})`;

    const formatEuro = (amount) => {
      if (!amount && amount !== 0) return '';
      return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
    };

    const creditorListPlain = creditors
      .map((c, i) => {
        const amount = c.claim_amount ? `   Forderung: ${formatEuro(c.claim_amount)}` : '';
        const refNum = c.reference_number && c.reference_number !== 'N/A' ? `   Referenz: ${c.reference_number}` : '';
        const details = [amount, refNum].filter(Boolean).join('\n');
        return `${i + 1}. ${c.sender_name || 'Unbekannt'}${details ? '\n' + details : ''}`;
      })
      .join('\n\n');

    const creditorListHtml = creditors
      .map((c, i) => {
        const refNum = c.reference_number && c.reference_number !== 'N/A'
          ? `<div style="font-size: 12px; color: #6b7280; margin-top: 4px;">Referenz: ${c.reference_number}</div>`
          : '';
        const amount = c.claim_amount
          ? `<div style="font-size: 13px; font-weight: 600; color: #374151; margin-top: 4px;">${formatEuro(c.claim_amount)}</div>`
          : '';
        return `
          <tr>
            <td style="padding: 16px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #111827; vertical-align: top; width: 32px;">${i + 1}.</td>
            <td style="padding: 16px; border-bottom: 1px solid #e5e7eb; vertical-align: top;">
              <div style="font-weight: 600; color: #111827; margin-bottom: 2px;">${c.sender_name || 'Unbekannt'}</div>
              ${refNum}
              ${amount}
            </td>
          </tr>`;
      })
      .join('');

    const text = `
Sehr geehrte/r ${firstName} ${lastName},

wir haben Ihre im Mandantenportal eingereichten Unterlagen gesichtet und daraus folgende Gläubiger für Sie erfasst:

GLÄUBIGERLISTE:
${creditorListPlain}

${totalDebt ? `GESAMTFORDERUNG: ${formatEuro(totalDebt)}` : ''}

Bitte loggen Sie sich in Ihr Mandantenportal ein, prüfen Sie die Liste sorgfältig und bestätigen Sie anschließend über den dort angezeigten Button, dass die Gläubigerliste vollständig ist.

WICHTIG - 7-TAGE-FRIST:
Sollten Sie innerhalb von 7 Tagen keine Bestätigung abgeben, gehen wir davon aus, dass die Gläubigerliste vollständig ist. In diesem Fall werden wir die genannten Gläubiger anschreiben und die aktuellen Forderungshöhen erfragen.

Den Zugang zum Portal finden Sie hier:
${portalUrl}

Bei Fragen stehe ich Ihnen selbstverständlich gerne zur Verfügung.

Mit freundlichen Grüßen
Rechtsanwalt Thomas Scuric

Aktenzeichen: ${aktenzeichen}
    `.trim();

    const html = `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ihre Gläubigerliste zur Überprüfung</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; margin: 0; padding: 0; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <div style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb;">
      <img src="https://www.anwalt-privatinsolvenz-online.de/wp-content/uploads/2015/08/Logo-T-Scuric.png" alt="Scuric Logo" style="height: 40px; display: block;">
    </div>
    <div style="padding: 24px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="font-size: 28px; font-weight: 600; color: #111827; margin: 0 0 12px 0;">Ihre Gläubigerliste</h1>
        <p style="font-size: 16px; color: #6b7280; margin: 0;">Bitte überprüfen und bestätigen</p>
      </div>
      <p style="font-size: 15px; color: #374151; line-height: 1.6; margin: 0 0 20px 0;">
        Sehr geehrte/r <strong>${firstName} ${lastName}</strong>,<br><br>
        wir haben Ihre im Mandantenportal eingereichten Unterlagen gesichtet und daraus folgende Gläubiger für Sie erfasst:
      </p>
      <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; margin: 20px 0; overflow: hidden;">
        <div style="padding: 16px; background-color: #111827; color: #ffffff; font-weight: 600; font-size: 16px;">
          Gläubigerliste
        </div>
        <table style="width: 100%; border-collapse: collapse;">
          <tbody>${creditorListHtml}</tbody>
        </table>
        <div style="padding: 16px; background-color: #111827; color: #ffffff; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 600; font-size: 16px;">${creditors.length} Gläubiger erfasst</span>
          ${totalDebt ? `<span style="font-weight: 600; font-size: 16px;">${formatEuro(totalDebt)}</span>` : ''}
        </div>
      </div>
      <div style="background-color: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 14px; color: #78350f;">
        <div style="font-weight: 600; color: #92400e; margin-bottom: 8px;">WICHTIG - 7-Tage-Frist:</div>
        <p style="margin: 0; line-height: 1.6;">
          Sollten Sie innerhalb von <strong>7 Tagen</strong> keine Bestätigung abgeben, gehen wir davon aus, dass die Gläubigerliste vollständig ist. In diesem Fall werden wir die genannten Gläubiger anschreiben und die aktuellen Forderungshöhen erfragen.
        </p>
      </div>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${portalUrl}" style="display: inline-block; background-color: #16a34a; color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Jetzt im Portal bestätigen
        </a>
      </div>
      <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #1a1a1a;">
        <p style="margin: 0 0 4px; color: #961919; font-weight: bold;">Rechtsanwaltskanzlei Thomas Scuric</p>
        <p style="margin: 0; font-size: 12px; color: #6b7280;">Aktenzeichen: ${aktenzeichen}</p>
      </div>
    </div>
  </div>
</body>
</html>
    `.trim();

    if (!this.resend) {
      console.log('\n📧 ================================');
      console.log('📧 CREDITOR CONFIRMATION EMAIL (DEV MODE)');
      console.log('📧 ================================');
      console.log(`📧 To: ${email}`);
      console.log(`📧 Subject: ${subject}`);
      console.log(`📧 Creditors: ${creditors.length}`);
      console.log(`📧 Total Debt: €${totalDebt.toLocaleString('de-DE')}`);
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

      console.log(`✅ Creditor confirmation email sent to ${email} (ID: ${response.id})`);
      return { success: true, emailId: response.id };
    } catch (error) {
      console.error(`❌ Failed to send creditor confirmation email to ${email}:`, error.message);
      return { success: false, error: error.message || 'Failed to send email' };
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

  // ── Insolvenzantrag Data Collection Email ──────────────────────────

  generateInsolvenzantragDataCollectionHtml(clientName, portalUrl, aktenzeichen) {
    return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Insolvenzantrag — Ihre Angaben werden benoetigt</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08); padding: 40px;">
          <!-- Header -->
          <tr>
            <td style="padding: 0 0 32px; text-align: center; border-bottom: 1px solid #eee;">
              <img src="https://www.schuldnerberatung-anwalt.de/wp-content/uploads/2024/10/Logo-T-Scuric.png" alt="RA T. Scuric" style="height: 40px; width: auto;">
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px 0 0;">
              <h1 style="margin: 0 0 24px; font-size: 22px; font-weight: 600; color: #111827;">
                Insolvenzantrag — Ihre Angaben werden benoetigt
              </h1>
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #374151;">
                Sehr geehrte/r ${clientName},
              </p>
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #374151;">
                im Rahmen Ihres Verfahrens (Aktenzeichen: <strong>${aktenzeichen}</strong>) bereiten wir nun Ihren Insolvenzantrag vor. Dafuer benoetigen wir einige persoenliche Angaben von Ihnen.
              </p>
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #374151;">
                Bitte loggen Sie sich in Ihr Portal ein und fuellen Sie das Formular aus. Bereits vorhandene Daten sind vorausgefuellt — pruefen Sie diese bitte auf Richtigkeit und ergaenzen Sie fehlende Angaben.
              </p>
              <p style="margin: 0 0 32px; font-size: 16px; line-height: 1.6; color: #374151;">
                Das Formular umfasst Angaben zu Ihrer Person, Adresse, Familie, Beruf, Einkommen und Vermoegen. Ihre Eingaben werden automatisch gespeichert — Sie koennen jederzeit unterbrechen und spaeter fortfahren.
              </p>

              <!-- CTA Button -->
              <div style="text-align: center; margin: 0 0 32px;">
                <a href="${portalUrl}" style="display: inline-block; padding: 14px 28px; background-color: #111827; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;">
                  Formular ausfuellen
                </a>
              </div>

              <p style="margin: 0; font-size: 14px; color: #9ca3af; text-align: center;">
                Falls Sie Fragen haben, antworten Sie einfach auf diese E-Mail.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 0 0; border-top: 1px solid #eee; margin-top: 32px;">
              <p style="margin: 0 0 8px; font-size: 12px; color: #9ca3af; text-align: center;">
                Aktenzeichen: <strong>${aktenzeichen}</strong>
              </p>
              <p style="margin: 0 0 8px; font-size: 12px; color: #9ca3af; text-align: center;">
                &copy; ${new Date().getFullYear()} Kanzlei RA T. Scuric. Alle Rechte vorbehalten.
              </p>
              <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">
                <a href="https://www.schuldnerberatung-anwalt.de/impressum/" style="color: #6b7280; text-decoration: none;">Impressum</a>
                <span style="color: #9ca3af;"> &bull; </span>
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

  generateInsolvenzantragDataCollectionText(clientName, portalUrl, aktenzeichen) {
    return `
Sehr geehrte/r ${clientName},

im Rahmen Ihres Verfahrens (Aktenzeichen: ${aktenzeichen}) bereiten wir nun Ihren Insolvenzantrag vor. Dafuer benoetigen wir einige persoenliche Angaben von Ihnen.

Bitte loggen Sie sich in Ihr Portal ein und fuellen Sie das Formular aus:

${portalUrl}

Das Formular umfasst Angaben zu Ihrer Person, Adresse, Familie, Beruf, Einkommen und Vermoegen. Ihre Eingaben werden automatisch gespeichert.

Mit freundlichen Gruessen
Kanzlei RA T. Scuric

Aktenzeichen: ${aktenzeichen}
    `.trim();
  }

  async sendInsolvenzantragDataCollectionEmail(email, clientName, portalUrl, aktenzeichen) {
    const subject = 'Insolvenzantrag — Bitte fuellen Sie das Formular aus';
    const html = this.generateInsolvenzantragDataCollectionHtml(clientName, portalUrl, aktenzeichen);
    const text = this.generateInsolvenzantragDataCollectionText(clientName, portalUrl, aktenzeichen);

    if (!this.resend) {
      console.log('\n📧 ================================');
      console.log('📧 INSOLVENZANTRAG DATA COLLECTION (DEV MODE)');
      console.log('📧 ================================');
      console.log(`📧 To: ${email}`);
      console.log(`📧 Subject: ${subject}`);
      console.log(`📧 Portal URL: ${portalUrl}`);
      console.log(`📧 Aktenzeichen: ${aktenzeichen}`);
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

      const emailId = response.data?.id || response.id;
      console.log(`✅ Insolvenzantrag data collection email sent to ${email} (ID: ${emailId})`);
      return { success: true, emailId };
    } catch (error) {
      console.error(`❌ Failed to send insolvenzantrag data collection email to ${email}:`, error.message);
      return { success: false, error: error.message };
    }
  }
  // ── Welcome Email ─────────────────────────────────────────────────────────

  generateWelcomeEmailHtml(clientName, email, aktenzeichen, portalUrl) {
    return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
  <div style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb;">
    <img src="https://www.anwalt-privatinsolvenz-online.de/wp-content/uploads/2015/08/Logo-T-Scuric.png" alt="Scuric Logo" style="height: 40px; display: block;">
  </div>
  <div style="padding: 24px 20px;">
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="font-size: 28px; font-weight: 600; color: #111827; margin: 0 0 12px 0;">Willkommen im Mandanten Portal</h1>
      <p style="font-size: 16px; color: #6b7280; margin: 0;">Ihr persoenlicher Zugang steht bereit</p>
    </div>

    <p style="font-size: 15px; color: #374151; line-height: 1.6; margin: 0 0 20px 0;">
      Sehr geehrte/r <strong>${clientName}</strong>,<br><br>
      ab sofort steht Ihnen Ihr persoenliches Mandantenportal zur Verfuegung. Hier finden Sie alle wichtigen Dokumente und Informationen – und koennen selbst Unterlagen hochladen.
    </p>

    <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0;">
      <div style="font-size: 16px; font-weight: 600; color: #111827; margin-bottom: 8px;">Ihre Zugangsdaten</div>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; font-weight: 500; color: #374151; font-size: 14px;">Portal-Link:</td>
          <td style="padding: 10px 0 10px 16px; border-bottom: 1px solid #e5e7eb; color: #111827; font-size: 14px; font-family: monospace;">
            <a href="${portalUrl}/login" style="color: #dc2626; text-decoration: none;">${portalUrl.replace('https://', '')}/login</a>
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

    <div style="text-align: center; margin: 24px 0;">
      <a href="${portalUrl}/login" style="display: inline-block; background-color: #16a34a; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 500; font-size: 16px;">Jetzt anmelden</a>
    </div>

    <h2 style="font-size: 18px; font-weight: 600; color: #111827; margin: 24px 0 16px 0;">So nutzen Sie das Portal</h2>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 8px 0;"><table style="width: 100%; background-color: #f9fafb; border-radius: 8px;"><tr><td style="width: 28px; padding: 12px 0 12px 12px; vertical-align: top;"><div style="background-color: #111827; color: #ffffff; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 600; font-size: 14px;">1</div></td><td style="padding: 16px 12px 12px 12px; color: #374151; font-size: 14px; line-height: 1.5;">Oeffnen Sie den oben genannten Portal-Link</td></tr></table></td></tr>
      <tr><td style="padding: 8px 0;"><table style="width: 100%; background-color: #f9fafb; border-radius: 8px;"><tr><td style="width: 28px; padding: 12px 0 12px 12px; vertical-align: top;"><div style="background-color: #111827; color: #ffffff; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 600; font-size: 14px;">2</div></td><td style="padding: 16px 12px 12px 12px; color: #374151; font-size: 14px; line-height: 1.5;">Melden Sie sich mit Ihrer E-Mail-Adresse und dem Aktenzeichen an</td></tr></table></td></tr>
      <tr><td style="padding: 8px 0;"><table style="width: 100%; background-color: #f9fafb; border-radius: 8px;"><tr><td style="width: 28px; padding: 12px 0 12px 12px; vertical-align: top;"><div style="background-color: #111827; color: #ffffff; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 600; font-size: 14px;">3</div></td><td style="padding: 16px 12px 12px 12px; color: #374151; font-size: 14px; line-height: 1.5;"><strong>Sie erhalten einen Bestaetigungscode per E-Mail.</strong> Geben Sie diesen Code ein, um Ihre Identitaet zu bestaetigen.</td></tr></table></td></tr>
      <tr><td style="padding: 8px 0;"><table style="width: 100%; background-color: #f9fafb; border-radius: 8px;"><tr><td style="width: 28px; padding: 12px 0 12px 12px; vertical-align: top;"><div style="background-color: #111827; color: #ffffff; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 600; font-size: 14px;">4</div></td><td style="padding: 16px 12px 12px 12px; color: #374151; font-size: 14px; line-height: 1.5;">Laden Sie Ihre Unterlagen im Portal hoch</td></tr></table></td></tr>
    </table>

    <h2 style="font-size: 18px; font-weight: 600; color: #111827; margin: 24px 0 16px 0;">Bitte laden Sie folgende Unterlagen hoch</h2>
    <table style="width: 100%;">
      <tr><td><div style="padding: 10px 16px 10px 36px; margin: 6px 0; background-color: #f9fafb; border-radius: 8px; font-size: 14px; color: #374151; position: relative;"><span style="position: absolute; left: 14px; color: #16a34a; font-weight: 600;">&#10003;</span> Mahnungen oder Mahnbescheide</div></td></tr>
      <tr><td><div style="padding: 10px 16px 10px 36px; margin: 6px 0; background-color: #f9fafb; border-radius: 8px; font-size: 14px; color: #374151; position: relative;"><span style="position: absolute; left: 14px; color: #16a34a; font-weight: 600;">&#10003;</span> Inkassoschreiben</div></td></tr>
      <tr><td><div style="padding: 10px 16px 10px 36px; margin: 6px 0; background-color: #f9fafb; border-radius: 8px; font-size: 14px; color: #374151; position: relative;"><span style="position: absolute; left: 14px; color: #16a34a; font-weight: 600;">&#10003;</span> Unbezahlte Rechnungen</div></td></tr>
      <tr><td><div style="padding: 10px 16px 10px 36px; margin: 6px 0; background-color: #f9fafb; border-radius: 8px; font-size: 14px; color: #374151; position: relative;"><span style="position: absolute; left: 14px; color: #16a34a; font-weight: 600;">&#10003;</span> Anwaltliche Zahlungsaufforderungen</div></td></tr>
      <tr><td><div style="padding: 10px 16px 10px 36px; margin: 6px 0; background-color: #f9fafb; border-radius: 8px; font-size: 14px; color: #374151; position: relative;"><span style="position: absolute; left: 14px; color: #16a34a; font-weight: 600;">&#10003;</span> Gerichtliche Schreiben</div></td></tr>
    </table>

    <div style="background-color: #dbeafe; border: 1px solid #93c5fd; border-radius: 8px; padding: 12px; margin: 16px 0; font-size: 14px; color: #1e40af;">
      <strong>Hinweis:</strong> Laden Sie bitte alle Dokumente hoch, in denen Geld von Ihnen gefordert wird. Ihr Zugang bleibt dauerhaft aktiv.
    </div>

    <p style="margin-top: 24px; color: #6b7280; font-size: 14px;">Bei Fragen stehe ich Ihnen selbstverstaendlich gerne zur Verfuegung.</p>

    <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #1a1a1a;">
      <p style="margin: 0 0 12px;"><img src="https://www.anwalt-privatinsolvenz-online.de/wp-content/uploads/2015/08/Logo-T-Scuric.png" alt="Thomas Scuric Rechtsanwalt" style="display: block; max-width: 300px; height: auto;"></p>
      <p style="margin: 0 0 4px; color: #961919; font-weight: bold;">Rechtsanwaltskanzlei Thomas Scuric</p>
      <p style="margin: 0 0 8px; color: #1f497d;">Bongardstrasse 33<br>44787 Bochum</p>
      <p style="margin: 0 0 12px; color: #1f497d;">Fon: 0234 913 681 0<br>Fax: 0234 913 681 29<br>E-Mail: <a href="mailto:kontakt@schuldnerberatung-anwalt.de" style="color: #0563c1; text-decoration: none;">kontakt@schuldnerberatung-anwalt.de</a></p>
      <p style="margin: 0; font-size: 11px; line-height: 1.5; color: #a6a6a6;">Der Inhalt dieser E-Mail ist vertraulich und ausschliesslich fuer den bezeichneten Adressaten bestimmt. Wenn Sie nicht der vorgesehene Adressat dieser E-Mail oder dessen Vertreter sein sollten, so beachten Sie bitte, dass jede Form der Kenntnisnahme, Veroeffentlichung, Vervielfaeltigung oder Weitergabe des Inhalts dieser E-Mail unzulaessig ist. Wir bitten Sie, sich in diesem Fall mit dem Absender der E-Mail in Verbindung zu setzen.<br><br>Wir weisen Sie auf unsere aktuelle <a href="https://www.schuldnerberatung-anwalt.de/datenschutz/" style="color: #a0191d; text-decoration: underline;" target="_blank">Datenschutzerklaerung</a> hin.</p>
    </div>

    <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
      <div style="margin-bottom: 12px;">
        <a href="https://www.schuldnerberatung-anwalt.de/impressum/" style="color: #6b7280; text-decoration: none; font-size: 13px;">Impressum</a>
        <span style="color: #9ca3af; margin: 0 12px;">&bull;</span>
        <a href="https://www.schuldnerberatung-anwalt.de/datenschutz/" style="color: #6b7280; text-decoration: none; font-size: 13px;">Datenschutz</a>
      </div>
      <p style="font-size: 12px; color: #9ca3af; margin: 0;">&copy; 2025 Scuric. Alle Rechte vorbehalten.</p>
    </div>

    <div style="font-size: 11px; color: #9ca3af; margin-top: 24px; padding: 12px; background-color: #f9fafb; border-radius: 6px;">
      Diese E-Mail wurde automatisch generiert. Bitte antworten Sie nicht direkt auf diese Nachricht.
    </div>
  </div>
</div>`.trim();
  }

  generateWelcomeEmailText(clientName, email, aktenzeichen, portalUrl) {
    return `
Willkommen im Mandanten Portal

Sehr geehrte/r ${clientName},

ab sofort steht Ihnen Ihr persoenliches Mandantenportal zur Verfuegung.

Ihre Zugangsdaten:
- Portal-Link: ${portalUrl}/login
- Login-E-Mail: ${email}
- Aktenzeichen: ${aktenzeichen}

So nutzen Sie das Portal:
1. Oeffnen Sie den Portal-Link
2. Melden Sie sich mit E-Mail und Aktenzeichen an
3. Sie erhalten einen Bestaetigungscode per E-Mail
4. Laden Sie Ihre Unterlagen hoch

Bitte laden Sie folgende Unterlagen hoch:
- Mahnungen oder Mahnbescheide
- Inkassoschreiben
- Unbezahlte Rechnungen
- Anwaltliche Zahlungsaufforderungen
- Gerichtliche Schreiben

Hinweis: Laden Sie bitte alle Dokumente hoch, in denen Geld von Ihnen gefordert wird.

Bei Fragen stehe ich Ihnen gerne zur Verfuegung.

Rechtsanwaltskanzlei Thomas Scuric
Bongardstrasse 33, 44787 Bochum
Fon: 0234 913 681 0
E-Mail: kontakt@schuldnerberatung-anwalt.de
    `.trim();
  }

  async sendWelcomeEmail(recipientEmail, { firstName, lastName, email, aktenzeichen }) {
    const portalUrl = process.env.FRONTEND_URL || 'https://mandanten-portal.onrender.com';
    const clientName = `${firstName} ${lastName}`;
    const subject = 'Willkommen im Mandanten Portal — Ihr Zugang steht bereit';
    const html = this.generateWelcomeEmailHtml(clientName, email, aktenzeichen, portalUrl);
    const text = this.generateWelcomeEmailText(clientName, email, aktenzeichen, portalUrl);

    if (!this.resend) {
      console.log('\n📧 ================================');
      console.log('📧 WELCOME EMAIL (DEV MODE)');
      console.log('📧 ================================');
      console.log(`📧 To: ${recipientEmail}`);
      console.log(`📧 Subject: ${subject}`);
      console.log(`📧 Portal URL: ${portalUrl}/login`);
      console.log(`📧 Aktenzeichen: ${aktenzeichen}`);
      console.log('📧 ================================\n');
      return { success: true, devMode: true };
    }

    try {
      const response = await this.resend.emails.send({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: recipientEmail,
        subject,
        html,
        text
      });

      const emailId = response.data?.id || response.id;
      console.log(`✅ Welcome email sent to ${recipientEmail} (ID: ${emailId})`);
      return { success: true, emailId };
    } catch (error) {
      console.error(`❌ Failed to send welcome email to ${recipientEmail}:`, error.message);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
module.exports = new EmailService();
