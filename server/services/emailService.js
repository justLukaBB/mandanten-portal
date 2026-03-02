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
   * @param {string} portalUrl - Deep-link URL with second_letter_form_token
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
                Der Link ist 14 Tage gültig. Falls Sie Fragen haben, antworten Sie einfach auf diese E-Mail.
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
   * @param {string} portalUrl - Deep-link URL with second_letter_form_token
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

Der Link ist 14 Tage gültig.

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
   * @param {string} portalUrl - Deep-link URL containing second_letter_form_token
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

    const creditorListPlain = creditors
      .map((c, i) => {
        const refNum = c.reference_number && c.reference_number !== 'N/A' ? `\n   Referenz: ${c.reference_number}` : '';
        return `${i + 1}. ${c.sender_name || 'Unbekannt'}\n   Forderung: €${(c.claim_amount || 0).toLocaleString('de-DE')}${refNum}`;
      })
      .join('\n\n');

    const creditorListHtml = creditors
      .map((c, i) => {
        const refNum = c.reference_number && c.reference_number !== 'N/A'
          ? `<div style="font-size: 12px; color: #6b7280; margin-top: 4px;">Referenz: ${c.reference_number}</div>`
          : '';
        return `
          <tr>
            <td style="padding: 16px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #111827; vertical-align: top;">${i + 1}.</td>
            <td style="padding: 16px; border-bottom: 1px solid #e5e7eb; vertical-align: top;">
              <div style="font-weight: 600; color: #111827; margin-bottom: 4px;">${c.sender_name || 'Unbekannt'}</div>
              <div style="font-size: 14px; color: #16a34a; font-weight: 500;">Forderung: €${(c.claim_amount || 0).toLocaleString('de-DE')}</div>
              ${refNum}
            </td>
          </tr>`;
      })
      .join('');

    const text = `
Sehr geehrte/r ${firstName} ${lastName},

wir haben Ihre im Mandantenportal eingereichten Unterlagen gesichtet und daraus folgende Gläubiger für Sie erfasst:

GLÄUBIGERLISTE:
${creditorListPlain}

Gesamtschulden: €${totalDebt.toLocaleString('de-DE')}

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
        <div style="padding: 16px; background-color: #111827; color: #ffffff;">
          <span style="font-weight: 600; font-size: 16px;">Gesamtschulden: </span>
          <span style="font-weight: 700; font-size: 20px; color: #10b981;">€${totalDebt.toLocaleString('de-DE')}</span>
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
}

// Export singleton instance
module.exports = new EmailService();
