const { v4: uuidv4 } = require('uuid');
const ZendeskService = require('./zendeskService');

/**
 * Welcome Email Service
 * Handles welcome email sending via Zendesk side conversations
 * Integrates with side conversation monitoring for response tracking
 */
class WelcomeEmailService {
    constructor() {
        this.zendeskService = new ZendeskService();
        
        // Track welcome email side conversations for monitoring
        this.welcomeEmailConversations = new Map(); // clientReference -> conversation data
    }

    /**
     * Send welcome email to new user via side conversation
     */
    async sendWelcomeEmail(ticketId, userData) {
        try {
            console.log(`📧 Sending welcome email to ${userData.firstName} ${userData.lastName} (${userData.email})`);
            
            const emailSubject = "🧾 Ihr Zugang zum Mandantenportal";
            
            // Generate both plain text and HTML email
            const plainTextBody = this.generatePlainTextWelcomeEmail(userData);
            const htmlBody = this.generateHTMLWelcomeEmail(userData);

            const response = await this.zendeskService.createSideConversation(ticketId, {
                recipientEmail: userData.email,
                recipientName: `${userData.firstName} ${userData.lastName}`,
                subject: emailSubject,
                body: plainTextBody,
                htmlBody: htmlBody,
                internalNote: false // This is an external email to the client
            });

            if (response.success) {
                // Store conversation data for monitoring
                const conversationData = {
                    id: uuidv4(),
                    client_reference: userData.aktenzeichen,
                    side_conversation_id: response.side_conversation_id,
                    main_zendesk_ticket_id: ticketId,
                    contact_type: 'welcome_email',
                    contact_status: 'sent',
                    email: userData.email,
                    name: `${userData.firstName} ${userData.lastName}`,
                    sent_at: new Date(),
                    response_received: false,
                    response_processed: false
                };
                
                this.welcomeEmailConversations.set(userData.aktenzeichen, conversationData);
                
                console.log(`✅ Welcome email sent successfully to ${userData.email}`);
                console.log(`📝 Side conversation ID: ${response.side_conversation_id}`);
                
                return {
                    success: true,
                    side_conversation_id: response.side_conversation_id,
                    email: userData.email,
                    subject: emailSubject,
                    conversation_data: conversationData
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
     * Get welcome email conversation data for a client (used by monitoring)
     */
    getWelcomeEmailConversation(clientReference) {
        return this.welcomeEmailConversations.get(clientReference) || null;
    }

    /**
     * Get all welcome email conversations (used by monitoring)
     */
    getAllWelcomeEmailConversations() {
        return Array.from(this.welcomeEmailConversations.values());
    }

    /**
     * Mark welcome email response as received
     */
    markResponseReceived(clientReference, responseData) {
        const conversation = this.welcomeEmailConversations.get(clientReference);
        if (conversation) {
            conversation.response_received = true;
            conversation.response_received_at = new Date();
            conversation.response_data = responseData;
            console.log(`✅ Welcome email response received for client ${clientReference}`);
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
     * Generate HTML welcome email with professional styling
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
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
        }
        .email-container {
            background-color: white;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .header {
            text-align: center;
            border-bottom: 3px solid #007bff;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .title {
            font-size: 24px;
            font-weight: bold;
            color: #007bff;
            margin: 0;
        }
        .greeting {
            font-size: 18px;
            margin-bottom: 25px;
            color: #2c3e50;
        }
        .section {
            margin-bottom: 30px;
        }
        .section-title {
            font-size: 18px;
            font-weight: bold;
            color: #007bff;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .credentials-box {
            background-color: #f8f9fa;
            border: 2px solid #007bff;
            border-radius: 8px;
            padding: 20px;
            margin: 15px 0;
        }
        .credential-item {
            margin-bottom: 12px;
            font-size: 16px;
        }
        .credential-label {
            font-weight: bold;
            color: #495057;
            display: block;
            margin-bottom: 4px;
        }
        .credential-value {
            color: #007bff;
            font-weight: bold;
            font-size: 16px;
            word-break: break-all;
        }
        .portal-link {
            background-color: #007bff;
            color: white !important;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            display: inline-block;
            font-weight: bold;
            margin: 10px 0;
        }
        .portal-link:hover {
            background-color: #0056b3;
        }
        .steps {
            background-color: #e8f4f8;
            border-radius: 8px;
            padding: 20px;
            margin: 15px 0;
        }
        .step {
            margin-bottom: 10px;
            padding-left: 5px;
        }
        .documents-list {
            background-color: #fff8dc;
            border-left: 4px solid #ffc107;
            padding: 20px;
            margin: 15px 0;
        }
        .document-item {
            margin-bottom: 8px;
            color: #495057;
        }
        .important-note {
            background-color: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 6px;
            padding: 15px;
            margin: 20px 0;
            color: #856404;
        }
        .footer {
            border-top: 2px solid #dee2e6;
            padding-top: 20px;
            margin-top: 40px;
            text-align: center;
            color: #6c757d;
            font-size: 14px;
        }
        .signature {
            margin-top: 30px;
            color: #2c3e50;
        }
        .signature-name {
            font-weight: bold;
            color: #007bff;
        }
        .auto-generated {
            font-size: 12px;
            color: #868e96;
            font-style: italic;
            margin-top: 20px;
        }
        @media (max-width: 600px) {
            .email-container {
                padding: 20px;
            }
            .title {
                font-size: 20px;
            }
            .portal-link {
                display: block;
                text-align: center;
                margin: 15px 0;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <h1 class="title">🧾 Ihr Zugang zum Mandantenportal</h1>
        </div>
        
        <div class="greeting">
            Sehr geehrte/r <strong>${firstName} ${lastName}</strong>,
        </div>
        
        <p>ab sofort steht Ihnen Ihr persönliches Mandantenportal zur Verfügung.</p>
        <p>Hier finden Sie alle wichtigen Dokumente und Informationen – und können selbst Unterlagen hochladen.</p>
        
        <div class="section">
            <div class="section-title">
                🔐 Ihre Zugangsdaten
            </div>
            <div class="credentials-box">
                <div class="credential-item">
                    <span class="credential-label">Portal-Link:</span>
                    <a href="${portalLink}" class="portal-link">Zum Mandantenportal</a>
                </div>
                <div class="credential-item">
                    <span class="credential-label">Login-E-Mail:</span>
                    <span class="credential-value">${email}</span>
                </div>
                <div class="credential-item">
                    <span class="credential-label">Einmaliges Passwort (Aktenzeichen):</span>
                    <span class="credential-value">${aktenzeichen}</span>
                </div>
            </div>
            
            <div class="important-note">
                <strong>Wichtig:</strong> Das Aktenzeichen dient beim ersten Login als einmaliges Passwort. Danach legen Sie ein eigenes, sicheres Passwort fest.
            </div>
        </div>
        
        <div class="section">
            <div class="section-title">
                🚀 So nutzen Sie das Portal
            </div>
            <div class="steps">
                <div class="step"><strong>1.</strong> Öffnen Sie den oben genannten Portal-Link</div>
                <div class="step"><strong>2.</strong> Melden Sie sich mit Ihrer E-Mail-Adresse und dem Aktenzeichen an</div>
                <div class="step"><strong>3.</strong> Vergeben Sie ein neues Passwort (wird beim ersten Login abgefragt)</div>
                <div class="step"><strong>4.</strong> Laden Sie Ihre Unterlagen im Portal hoch</div>
            </div>
        </div>
        
        <div class="section">
            <div class="section-title">
                📤 Bitte laden Sie folgende Unterlagen hoch
            </div>
            <div class="documents-list">
                <div class="document-item">• Mahnungen oder Mahnbescheide</div>
                <div class="document-item">• Inkassoschreiben</div>
                <div class="document-item">• Unbezahlte Rechnungen</div>
                <div class="document-item">• Anwaltliche Zahlungsaufforderungen</div>
                <div class="document-item">• Gerichtliche Schreiben</div>
            </div>
            
            <div class="important-note">
                <strong>Hinweis:</strong> Laden Sie bitte alle Dokumente hoch, in denen Geld von Ihnen gefordert wird. Ihr Zugang bleibt dauerhaft aktiv.
            </div>
        </div>
        
        <p>Bei Fragen stehe ich Ihnen selbstverständlich gerne zur Verfügung.</p>
        
        <div class="signature">
            Mit freundlichen Grüßen<br>
            <span class="signature-name">Luka Scuric</span><br>
            Rechtsanwalt Thomas Scuric
        </div>
        
        <div class="footer">
            <div class="auto-generated">
                📎 Diese E-Mail wurde automatisch generiert. Bitte antworten Sie nicht direkt auf diese Nachricht.
            </div>
            <div style="margin-top: 15px;">
                © 2025 Rechtsanwalt Thomas Scuric
            </div>
        </div>
    </div>
</body>
</html>
        `.trim();
    }
}

module.exports = WelcomeEmailService;