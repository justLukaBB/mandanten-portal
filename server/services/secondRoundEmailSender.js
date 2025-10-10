const ZendeskManager = require('./zendeskManager');

/**
 * Second Round Email Sender
 * Sends individual "Pfändbares Einkommen" documents to each creditor via Zendesk Side Conversations
 */
class SecondRoundEmailSender {
    constructor() {
        this.zendesk = new ZendeskManager();
        this.emailResults = new Map(); // Track email sending results
    }

    /**
     * Send second round emails with individual documents to all creditors
     */
    async sendSecondRoundEmails(mainTicketId, creditorContacts, clientData, documentUrls) {
        try {
            console.log(`📧 Starting 2nd round email dispatch for ${creditorContacts.length} creditors...`);
            console.log(`🎫 Main ticket ID: ${mainTicketId}`);

            if (!creditorContacts || creditorContacts.length === 0) {
                return {
                    success: true,
                    message: 'No creditors to contact',
                    emails_sent: 0,
                    email_results: []
                };
            }

            const emailResults = [];
            let successCount = 0;

            // Send email to each creditor individually
            for (let i = 0; i < creditorContacts.length; i++) {
                const contact = creditorContacts[i];
                console.log(`📤 Sending email ${i + 1}/${creditorContacts.length} to: ${contact.creditor_name}`);

                try {
                    // Get the specific document for this creditor
                    const creditorDocument = documentUrls[contact.creditor_name];
                    
                    if (!creditorDocument) {
                        throw new Error(`No document found for creditor: ${contact.creditor_name}`);
                    }

                    // Send the email with document
                    const emailResult = await this.sendIndividualCreditorEmail(
                        mainTicketId,
                        contact,
                        clientData,
                        creditorDocument
                    );

                    if (emailResult.success) {
                        successCount++;
                        console.log(`   ✅ Email sent successfully to ${contact.creditor_name}`);
                    } else {
                        console.error(`   ❌ Email failed for ${contact.creditor_name}: ${emailResult.error}`);
                    }

                    emailResults.push({
                        ...emailResult,
                        creditor_name: contact.creditor_name,
                        creditor_index: i + 1,
                        document_filename: creditorDocument.filename
                    });

                    // Small delay between emails to avoid rate limiting
                    if (i < creditorContacts.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }

                } catch (error) {
                    console.error(`   ❌ Error sending email to ${contact.creditor_name}: ${error.message}`);
                    emailResults.push({
                        success: false,
                        creditor_name: contact.creditor_name,
                        creditor_index: i + 1,
                        error: error.message,
                        sent_at: new Date().toISOString()
                    });
                }
            }

            // Add summary to main ticket
            await this.addEmailSummaryToMainTicket(mainTicketId, emailResults, successCount);

            console.log(`📊 Email dispatch summary: ${successCount}/${creditorContacts.length} emails sent successfully`);

            return {
                success: successCount > 0,
                emails_sent: successCount,
                total_creditors: creditorContacts.length,
                email_results: emailResults,
                main_ticket_id: mainTicketId,
                processing_timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Error sending second round emails:', error.message);
            return {
                success: false,
                error: error.message,
                emails_sent: 0,
                email_results: []
            };
        }
    }

    /**
     * Send email to a single creditor with their specific document
     */
    async sendIndividualCreditorEmail(mainTicketId, creditorContact, clientData, creditorDocument) {
        try {
            // Get creditor email - try multiple sources
            const creditorEmail = creditorContact.creditor_email || 
                                 creditorContact.email || 
                                 creditorContact.contact_email;

            if (!creditorEmail) {
                return {
                    success: false,
                    error: 'No email address available for creditor',
                    requires_manual_contact: true
                };
            }

            // Build email content for second round
            const emailContent = this.buildSecondRoundEmailContent(
                creditorContact.creditor_name,
                clientData,
                creditorDocument
            );

            // Create side conversation with the creditor
            const sideConversationResult = await this.zendesk.createSideConversation(
                mainTicketId,
                {
                    subject: `2. Runde - Pfändbares Einkommen Dokument - ${clientData.name}`,
                    recipients: [creditorEmail],
                    message: emailContent.text,
                    html_message: emailContent.html,
                    document_url: creditorDocument.download_url || creditorDocument.content_url,
                    document_filename: creditorDocument.filename
                }
            );

            if (!sideConversationResult.success) {
                throw new Error(sideConversationResult.error || 'Failed to create side conversation');
            }

            return {
                success: true,
                side_conversation_id: sideConversationResult.side_conversation_id,
                recipient_email: creditorEmail,
                creditor_name: creditorContact.creditor_name,
                document_sent: creditorDocument.filename,
                sent_at: new Date().toISOString()
            };

        } catch (error) {
            console.error(`❌ Error sending email to ${creditorContact.creditor_name}:`, error.message);
            return {
                success: false,
                error: error.message,
                creditor_name: creditorContact.creditor_name,
                sent_at: new Date().toISOString()
            };
        }
    }

    /**
     * Build email content for second round communication
     */
    buildSecondRoundEmailContent(creditorName, clientData, creditorDocument) {
        const currentDate = new Date().toLocaleDateString('de-DE');
        
        // Text version
        const textContent = `
Sehr geehrte Damen und Herren von ${creditorName},

wir setzen die außergerichtliche Schuldenbereinigung für unseren Mandanten ${clientData.name} fort.

Wie angekündigt, übersenden wir Ihnen hiermit das individuelle "Pfändbares Einkommen" Dokument für Ihre Forderung.

Das beigefügte Dokument enthält:
• Die detaillierte Berechnung des pfändbaren Einkommens
• Den monatlichen Zahlungsbetrag für Ihre Forderung
• Die Tilgungsquote entsprechend Ihrer Forderungshöhe
• Den geplanten Zahlungsstart und die Laufzeit

Wir bitten Sie, das Dokument zu prüfen und uns Ihre Zustimmung zu den vorgeschlagenen Konditionen mitzuteilen.

Bei Fragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen
Thomas Scuric Rechtsanwälte

---
Angehängte Dokumente:
• ${creditorDocument.filename}

Datum: ${currentDate}
Mandant: ${clientData.name}
Referenz: ${clientData.reference || 'N/A'}
`;

        // HTML version
        const htmlContent = `
<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <h3 style="color: #2c5aa0;">2. Runde - Außergerichtliche Schuldenbereinigung</h3>
    
    <p>Sehr geehrte Damen und Herren von <strong>${creditorName}</strong>,</p>
    
    <p>wir setzen die außergerichtliche Schuldenbereinigung für unseren Mandanten <strong>${clientData.name}</strong> fort.</p>
    
    <p>Wie angekündigt, übersenden wir Ihnen hiermit das individuelle "Pfändbares Einkommen" Dokument für Ihre Forderung.</p>
    
    <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #2c5aa0; margin: 20px 0;">
        <h4 style="margin-top: 0; color: #2c5aa0;">Das beigefügte Dokument enthält:</h4>
        <ul style="margin-bottom: 0;">
            <li>Die detaillierte Berechnung des pfändbaren Einkommens</li>
            <li>Den monatlichen Zahlungsbetrag für Ihre Forderung</li>
            <li>Die Tilgungsquote entsprechend Ihrer Forderungshöhe</li>
            <li>Den geplanten Zahlungsstart und die Laufzeit</li>
        </ul>
    </div>
    
    <p>Wir bitten Sie, das Dokument zu prüfen und uns Ihre <strong>Zustimmung</strong> zu den vorgeschlagenen Konditionen mitzuteilen.</p>
    
    <p>Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p>
    
    <p style="margin-top: 30px;">
        Mit freundlichen Grüßen<br>
        <strong>Thomas Scuric Rechtsanwälte</strong>
    </p>
    
    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
    
    <div style="background-color: #f1f3f4; padding: 10px; border-radius: 4px; font-size: 12px;">
        <p style="margin: 0;"><strong>Angehängte Dokumente:</strong></p>
        <p style="margin: 5px 0;">📄 ${creditorDocument.filename}</p>
        <p style="margin: 0; color: #666;">
            Datum: ${currentDate} | 
            Mandant: ${clientData.name} | 
            Referenz: ${clientData.reference || 'N/A'}
        </p>
    </div>
</div>
`;

        return {
            text: textContent.trim(),
            html: htmlContent.trim()
        };
    }

    /**
     * Add email summary to main ticket
     */
    async addEmailSummaryToMainTicket(mainTicketId, emailResults, successCount) {
        try {
            const timestamp = new Date().toLocaleString('de-DE');
            const totalEmails = emailResults.length;
            
            let comment = `📧 2. E-Mail-Runde - Status Update\n\n`;
            comment += `📊 E-Mail Versand Zusammenfassung:\n`;
            comment += `• Versendet: ${successCount}/${totalEmails} E-Mails\n`;
            comment += `• Zeitpunkt: ${timestamp}\n\n`;
            
            comment += `📋 Versand Status pro Gläubiger:\n`;
            emailResults.forEach((result, index) => {
                const status = result.success ? '✅ Versendet' : '❌ Fehler';
                const details = result.success ? 
                    `(${result.document_filename})` : 
                    `(${result.error})`;
                
                comment += `${index + 1}. ${result.creditor_name}: ${status} ${details}\n`;
            });

            if (successCount < totalEmails) {
                const failedCount = totalEmails - successCount;
                comment += `\n⚠️ ${failedCount} E-Mails konnten nicht versendet werden. Manuelle Nachbearbeitung erforderlich.`;
            }

            await this.zendesk.addInternalComment(mainTicketId, comment);

        } catch (error) {
            console.error('❌ Error adding email summary to main ticket:', error.message);
        }
    }

    /**
     * Resend email to a specific creditor (for retry scenarios)
     */
    async resendEmailToCreditor(mainTicketId, creditorContact, clientData, creditorDocument) {
        try {
            console.log(`🔄 Resending email to ${creditorContact.creditor_name}...`);

            const result = await this.sendIndividualCreditorEmail(
                mainTicketId,
                creditorContact,
                clientData,
                creditorDocument
            );

            if (result.success) {
                // Add note to main ticket about resend
                const comment = `🔄 E-Mail erneut versendet an ${creditorContact.creditor_name}\n` +
                              `📄 Dokument: ${creditorDocument.filename}\n` +
                              `📅 Zeitpunkt: ${new Date().toLocaleString('de-DE')}`;
                
                await this.zendesk.addInternalComment(mainTicketId, comment);
            }

            return result;

        } catch (error) {
            console.error(`❌ Error resending email to ${creditorContact.creditor_name}:`, error.message);
            return {
                success: false,
                error: error.message,
                creditor_name: creditorContact.creditor_name
            };
        }
    }

    /**
     * Get email status for all creditors
     */
    getEmailStatus(creditorContacts, emailResults) {
        return creditorContacts.map(contact => {
            const emailResult = emailResults.find(result => 
                result.creditor_name === contact.creditor_name
            );

            return {
                creditor_name: contact.creditor_name,
                creditor_email: contact.creditor_email || contact.email,
                email_sent: emailResult ? emailResult.success : false,
                sent_at: emailResult ? emailResult.sent_at : null,
                error: emailResult ? emailResult.error : null,
                side_conversation_id: emailResult ? emailResult.side_conversation_id : null
            };
        });
    }
}

module.exports = SecondRoundEmailSender;