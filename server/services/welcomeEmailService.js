const { v4: uuidv4 } = require('uuid');
const ZendeskService = require('./zendeskService');

/**
 * Welcome Email Service
 * Handles welcome email sending via Zendesk public ticket comments
 * Sends professional HTML welcome emails to new portal users
 */
class WelcomeEmailService {
    constructor() {
        this.zendeskService = new ZendeskService();
    }

    /**
     * Send welcome email to new user via public ticket comment
     */
    async sendWelcomeEmail(ticketId, userData) {
        try {
            console.log(`📧 Sending welcome email to ${userData.firstName} ${userData.lastName} (${userData.email})`);
            
            const emailSubject = "🧾 Ihr Zugang zum Mandantenportal";
            
            // Generate both plain text and HTML email
            const plainTextBody = this.generatePlainTextWelcomeEmail(userData);
            const htmlBody = this.generateHTMLWelcomeEmail(userData);

            // Send as public comment on the main ticket
            console.log(`🎯 WELCOME EMAIL: Using addPublicComment method (NOT side conversations)`);
            const response = await this.zendeskService.addPublicComment(ticketId, {
                content: plainTextBody,
                htmlContent: htmlBody,
                tags: ['welcome-email-sent', 'portal-access']
            });
            console.log(`🔍 WELCOME EMAIL: addPublicComment response:`, { success: response.success, method: 'public_comment' });

            if (response.success) {
                console.log(`✅ Welcome email sent successfully to ${userData.email} via public comment`);
                console.log(`📝 Ticket ID: ${ticketId}`);
                
                return {
                    success: true,
                    ticket_id: ticketId,
                    email: userData.email,
                    subject: emailSubject,
                    method: 'public_comment',
                    comment_added: true
                };
            } else {
                console.error(`❌ Failed to send welcome email: ${response.error}`);
                return {
                    success: false,
                    error: response.error
                };
            }

        } catch (error) {
            console.error(`❌ Error in sendWelcomeEmail:`, error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }


    /**
     * Generate plain text welcome email
     */
    generatePlainTextWelcomeEmail(userData) {
        const { firstName, lastName, email, aktenzeichen } = userData;
        const portalLink = "https://mandanten-portal.onrender.com/login";
        
        return `
🧾 Ihr Zugang zum Mandantenportal

Sehr geehrte/r ${firstName} ${lastName},

ab sofort steht Ihnen Ihr persönliches Mandantenportal zur Verfügung.
Hier finden Sie alle wichtigen Dokumente und Informationen –
und können selbst Unterlagen hochladen.

🔐 Ihre Zugangsdaten

Portal-Link:
${portalLink}

Login-E-Mail:
${email}

Einmaliges Passwort (Aktenzeichen):
${aktenzeichen}

Wichtig:
Das Aktenzeichen dient beim ersten Login als einmaliges Passwort.
Danach legen Sie ein eigenes, sicheres Passwort fest.

🚀 So nutzen Sie das Portal

1. Öffnen Sie den oben genannten Portal-Link
2. Melden Sie sich mit Ihrer E-Mail-Adresse und dem Aktenzeichen an
3. Vergeben Sie ein neues Passwort (wird beim ersten Login abgefragt)
4. Laden Sie Ihre Unterlagen im Portal hoch

📤 Bitte laden Sie folgende Unterlagen hoch

• Mahnungen oder Mahnbescheide
• Inkassoschreiben
• Unbezahlte Rechnungen
• Anwaltliche Zahlungsaufforderungen
• Gerichtliche Schreiben

Hinweis:
Laden Sie bitte alle Dokumente hoch, in denen Geld von Ihnen gefordert wird.
Ihr Zugang bleibt dauerhaft aktiv.

Bei Fragen stehe ich Ihnen selbstverständlich gerne zur Verfügung.

Mit freundlichen Grüßen
Luka Scuric
Rechtsanwalt Thomas Scuric

📎 Diese E-Mail wurde automatisch generiert. Bitte antworten Sie nicht direkt auf diese Nachricht.

© 2025 Rechtsanwalt Thomas Scuric
        `.trim();
    }

    /**
     * Generate premium HTML welcome email with advanced styling
     */
    generateHTMLWelcomeEmail(userData) {
        const { firstName, lastName, email, aktenzeichen } = userData;
        const portalLink = "https://mandanten-portal.onrender.com/login";
        
        return `
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ihr Zugang zum Mandantenportal</title>
    <!--[if mso]>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings>
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <![endif]-->
    <style>
        /* Reset styles */
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        /* Base styles */
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #2c3e50;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 0;
            width: 100% !important;
            min-height: 100vh;
        }
        
        /* Email container */
        .email-wrapper {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px 20px;
            min-height: 100vh;
        }
        
        .email-container {
            max-width: 680px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        
        /* Header with gradient */
        .header {
            background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
            color: white;
            padding: 50px 40px;
            text-align: center;
            position: relative;
            overflow: hidden;
        }
        
        .header::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grain" width="100" height="100" patternUnits="userSpaceOnUse"><circle cx="10" cy="10" r="1" fill="rgba(255,255,255,0.1)"/><circle cx="60" cy="30" r="1" fill="rgba(255,255,255,0.1)"/><circle cx="30" cy="70" r="1" fill="rgba(255,255,255,0.1)"/></pattern></defs><rect width="100" height="100" fill="url(%23grain)"/></svg>');
            opacity: 0.3;
            animation: float 20s infinite linear;
        }
        
        @keyframes float {
            0% { transform: translate(-50%, -50%) rotate(0deg); }
            100% { transform: translate(-50%, -50%) rotate(360deg); }
        }
        
        .logo-area {
            position: relative;
            z-index: 2;
        }
        
        .title {
            font-size: 32px;
            font-weight: 700;
            margin-bottom: 10px;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
            letter-spacing: -0.5px;
        }
        
        .subtitle {
            font-size: 18px;
            opacity: 0.9;
            font-weight: 300;
        }
        
        /* Content area */
        .content {
            padding: 50px 40px;
        }
        
        .greeting {
            font-size: 22px;
            font-weight: 600;
            color: #1e3c72;
            margin-bottom: 30px;
            text-align: center;
        }
        
        .intro-text {
            font-size: 17px;
            line-height: 1.8;
            color: #5a6c7d;
            text-align: center;
            margin-bottom: 40px;
            max-width: 500px;
            margin-left: auto;
            margin-right: auto;
        }
        
        /* Credentials section */
        .credentials-section {
            background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
            border-radius: 16px;
            padding: 35px;
            margin: 40px 0;
            border: 2px solid #e2e8f0;
            position: relative;
            overflow: hidden;
        }
        
        .credentials-section::before {
            content: '🔐';
            position: absolute;
            top: -10px;
            right: -10px;
            font-size: 60px;
            opacity: 0.1;
            transform: rotate(15deg);
        }
        
        .section-title {
            font-size: 20px;
            font-weight: 700;
            color: #1e3c72;
            margin-bottom: 25px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .credential-grid {
            display: grid;
            gap: 20px;
        }
        
        .credential-item {
            background: white;
            padding: 20px;
            border-radius: 12px;
            border-left: 4px solid #1e3c72;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
            transition: transform 0.2s ease;
        }
        
        .credential-item:hover {
            transform: translateY(-2px);
        }
        
        .credential-label {
            font-size: 14px;
            font-weight: 600;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
            display: block;
        }
        
        .credential-value {
            font-size: 16px;
            font-weight: 700;
            color: #1e3c72;
            word-break: break-all;
        }
        
        /* Portal button */
        .portal-button-container {
            text-align: center;
            margin: 30px 0;
        }
        
        .portal-button {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white !important;
            padding: 16px 40px;
            border-radius: 50px;
            text-decoration: none;
            font-weight: 700;
            font-size: 16px;
            text-transform: uppercase;
            letter-spacing: 1px;
            box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
            transition: all 0.3s ease;
            border: none;
            position: relative;
            overflow: hidden;
        }
        
        .portal-button::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
            transition: left 0.5s;
        }
        
        .portal-button:hover::before {
            left: 100%;
        }
        
        .portal-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 15px 30px rgba(102, 126, 234, 0.4);
        }
        
        /* Important notice */
        .important-notice {
            background: linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%);
            border: 2px solid #fb923c;
            border-radius: 12px;
            padding: 20px;
            margin: 25px 0;
            position: relative;
        }
        
        .important-notice::before {
            content: '⚠️';
            font-size: 24px;
            position: absolute;
            top: 15px;
            right: 15px;
        }
        
        .important-notice strong {
            color: #ea580c;
        }
        
        /* Steps section */
        .steps-section {
            background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
            border-radius: 16px;
            padding: 35px;
            margin: 40px 0;
            border: 2px solid #0ea5e9;
        }
        
        .step-item {
            display: flex;
            align-items: flex-start;
            margin-bottom: 20px;
            padding: 15px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        
        .step-number {
            background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
            color: white;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 14px;
            margin-right: 15px;
            flex-shrink: 0;
        }
        
        .step-text {
            font-size: 16px;
            line-height: 1.5;
            color: #374151;
        }
        
        /* Documents section */
        .documents-section {
            background: linear-gradient(135deg, #fefce8 0%, #fef3c7 100%);
            border-radius: 16px;
            padding: 35px;
            margin: 40px 0;
            border: 2px solid #f59e0b;
            position: relative;
        }
        
        .documents-section::before {
            content: '📤';
            position: absolute;
            top: 20px;
            right: 20px;
            font-size: 32px;
        }
        
        .document-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 15px;
            margin-top: 20px;
        }
        
        .document-item {
            background: white;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #f59e0b;
            font-size: 14px;
            font-weight: 500;
            color: #374151;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        
        /* Footer */
        .footer {
            background: #f8fafc;
            padding: 40px;
            text-align: center;
            border-top: 1px solid #e2e8f0;
        }
        
        .signature {
            margin-bottom: 30px;
        }
        
        .signature-name {
            font-size: 18px;
            font-weight: 700;
            color: #1e3c72;
            margin-bottom: 5px;
        }
        
        .signature-title {
            font-size: 16px;
            color: #64748b;
            font-weight: 500;
        }
        
        .legal-text {
            font-size: 12px;
            color: #94a3b8;
            line-height: 1.5;
            margin-top: 20px;
        }
        
        /* Responsive design */
        @media only screen and (max-width: 600px) {
            .email-wrapper { padding: 20px 10px; }
            .content { padding: 30px 25px; }
            .header { padding: 40px 25px; }
            .title { font-size: 26px; }
            .subtitle { font-size: 16px; }
            .credentials-section, .steps-section, .documents-section { padding: 25px; }
            .portal-button { padding: 14px 30px; font-size: 14px; }
            .document-grid { grid-template-columns: 1fr; }
        }
        
        /* Dark mode support */
        @media (prefers-color-scheme: dark) {
            .email-container { background: #1f2937; color: #f9fafb; }
            .content { background: #1f2937; }
            .credential-item, .step-item, .document-item { background: #374151; }
            .credentials-section { background: #374151; }
            .steps-section { background: #1e3a8a; }
            .documents-section { background: #92400e; }
        }
    </style>
</head>
<body>
    <div class="email-wrapper">
        <div class="email-container">
            <!-- Header -->
            <div class="header">
                <div class="logo-area">
                    <div class="title">🧾 Mandantenportal</div>
                    <div class="subtitle">Ihr sicherer Zugang zu allen Dokumenten</div>
                </div>
            </div>
            
            <!-- Content -->
            <div class="content">
                <div class="greeting">
                    Willkommen, ${firstName} ${lastName}!
                </div>
                
                <div class="intro-text">
                    Ihr persönliches Mandantenportal ist ab sofort verfügbar. Hier finden Sie alle wichtigen Dokumente und können sicher Unterlagen hochladen.
                </div>
                
                <!-- Credentials Section -->
                <div class="credentials-section">
                    <div class="section-title">
                        🔐 Ihre Zugangsdaten
                    </div>
                    
                    <div class="credential-grid">
                        <div class="credential-item">
                            <span class="credential-label">Portal-Link</span>
                            <div class="portal-button-container">
                                <a href="${portalLink}" class="portal-button">
                                    🚀 Zum Portal
                                </a>
                            </div>
                        </div>
                        
                        <div class="credential-item">
                            <span class="credential-label">Login E-Mail</span>
                            <span class="credential-value">${email}</span>
                        </div>
                        
                        <div class="credential-item">
                            <span class="credential-label">Temporäres Passwort</span>
                            <span class="credential-value">${aktenzeichen}</span>
                        </div>
                    </div>
                    
                    <div class="important-notice">
                        <strong>Wichtiger Hinweis:</strong> Verwenden Sie Ihr Aktenzeichen beim ersten Login als Passwort. Sie werden dann aufgefordert, ein eigenes sicheres Passwort zu erstellen.
                    </div>
                </div>
                
                <!-- Steps Section -->
                <div class="steps-section">
                    <div class="section-title">
                        🚀 So starten Sie
                    </div>
                    
                    <div class="step-item">
                        <div class="step-number">1</div>
                        <div class="step-text">Klicken Sie auf den Portal-Button oben</div>
                    </div>
                    
                    <div class="step-item">
                        <div class="step-number">2</div>
                        <div class="step-text">Melden Sie sich mit Ihrer E-Mail und dem Aktenzeichen an</div>
                    </div>
                    
                    <div class="step-item">
                        <div class="step-number">3</div>
                        <div class="step-text">Erstellen Sie Ihr persönliches, sicheres Passwort</div>
                    </div>
                    
                    <div class="step-item">
                        <div class="step-number">4</div>
                        <div class="step-text">Laden Sie Ihre Dokumente sicher hoch</div>
                    </div>
                </div>
                
                <!-- Documents Section -->
                <div class="documents-section">
                    <div class="section-title">
                        📤 Diese Dokumente benötigen wir
                    </div>
                    
                    <div class="document-grid">
                        <div class="document-item">📄 Mahnungen oder Mahnbescheide</div>
                        <div class="document-item">💰 Inkassoschreiben</div>
                        <div class="document-item">🧾 Unbezahlte Rechnungen</div>
                        <div class="document-item">⚖️ Anwaltliche Zahlungsaufforderungen</div>
                        <div class="document-item">🏛️ Gerichtliche Schreiben</div>
                        <div class="document-item">📋 Weitere Forderungsschreiben</div>
                    </div>
                    
                    <div class="important-notice" style="margin-top: 25px;">
                        <strong>Hinweis:</strong> Laden Sie bitte alle Dokumente hoch, in denen Geld von Ihnen gefordert wird. Ihr Zugang bleibt dauerhaft aktiv und sicher.
                    </div>
                </div>
                
                <div style="text-align: center; margin: 40px 0; padding: 30px; background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-radius: 16px; border: 2px solid #22c55e;">
                    <div style="font-size: 18px; font-weight: 600; color: #15803d; margin-bottom: 10px;">
                        💬 Haben Sie Fragen?
                    </div>
                    <div style="font-size: 16px; color: #374151;">
                        Ich stehe Ihnen gerne zur Verfügung und helfe bei allen Anliegen.
                    </div>
                </div>
            </div>
            
            <!-- Footer -->
            <div class="footer">
                <div class="signature">
                    <div class="signature-name">Luka Scuric</div>
                    <div class="signature-title">Rechtsanwalt Thomas Scuric</div>
                </div>
                
                <div class="legal-text">
                    📎 Diese E-Mail wurde automatisch generiert.<br>
                    Bitte antworten Sie nicht direkt auf diese Nachricht.<br><br>
                    © 2025 Rechtsanwalt Thomas Scuric | Alle Rechte vorbehalten
                </div>
            </div>
        </div>
    </div>
</body>
</html>
        `.trim();
    }
}

module.exports = WelcomeEmailService;