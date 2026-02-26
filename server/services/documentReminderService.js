const Client = require('../models/Client');
const ZendeskService = require('./zendeskService');
const { v4: uuidv4 } = require('uuid');

class DocumentReminderService {
  constructor() {
    this.zendeskService = new ZendeskService();
    this.reminderIntervalDays = 2; // Send reminders every 2 days
  }

  // Check all clients who are waiting for documents and send reminders if needed
  async checkAndSendReminders() {
    try {
      console.log('🔄 Starting document reminder check...');
      
      // Find all clients who:
      // 1. Have received first payment
      // 2. Have no documents uploaded
      // 3. Have payment_ticket_type = 'document_request'
      const clientsWaitingForDocs = await Client.find({
        first_payment_received: true,
        payment_ticket_type: 'document_request',
        'documents': { $size: 0 } // No documents uploaded
      });

      console.log(`📋 Found ${clientsWaitingForDocs.length} clients waiting for documents`);

      let remindersCount = 0;
      let errorCount = 0;

      for (const client of clientsWaitingForDocs) {
        try {
          const shouldSendReminder = this.shouldSendReminder(client);
          
          if (shouldSendReminder) {
            console.log(`📧 Sending document reminder to ${client.firstName} ${client.lastName} (${client.aktenzeichen})`);
            
            await this.sendDocumentReminder(client);
            remindersCount++;
          } else {
            console.log(`⏳ Skipping reminder for ${client.aktenzeichen} - not time yet`);
          }
        } catch (error) {
          console.error(`❌ Error processing reminder for ${client.aktenzeichen}:`, error.message);
          errorCount++;
        }
      }

      console.log(`✅ Document reminder check complete. Sent: ${remindersCount}, Errors: ${errorCount}`);
      
      return {
        totalChecked: clientsWaitingForDocs.length,
        remindersSent: remindersCount,
        errors: errorCount
      };
      
    } catch (error) {
      console.error('❌ Error in document reminder service:', error);
      throw error;
    }
  }

  // Check if it's time to send a reminder (every 2 days)
  shouldSendReminder(client) {
    const lastReminderSent = client.last_document_reminder_at || client.document_request_sent_at;
    
    if (!lastReminderSent) {
      // No reminder sent yet - send first reminder
      return true;
    }

    const daysSinceLastReminder = Math.floor(
      (Date.now() - new Date(lastReminderSent).getTime()) / (1000 * 60 * 60 * 24)
    );

    return daysSinceLastReminder >= this.reminderIntervalDays;
  }

  // Send document upload reminder
  async sendDocumentReminder(client) {
    try {
      // Update reminder count
      const reminderCount = (client.document_reminder_count || 0) + 1;
      
      // Generate reminder content based on reminder count
      const reminderContent = this.generateReminderContent(client, reminderCount);
      
      // Find the original Zendesk ticket
      const originalTicket = client.zendesk_tickets?.find(
        t => t.ticket_type === 'payment_review' || t.ticket_type === 'main_ticket' || t.status === 'active'
      ) || { ticket_id: client.zendesk_ticket_id };

      let zendeskUpdateResult = null;

      // Add internal comment to existing ticket if Zendesk is configured
      if (this.zendeskService.isConfigured() && originalTicket.ticket_id) {
        console.log(`💬 Adding document reminder comment to ticket ${originalTicket.ticket_id}...`);
        
        // First add internal comment
        zendeskUpdateResult = await this.zendeskService.addInternalComment(originalTicket.ticket_id, {
          content: reminderContent,
          tags: ['document-reminder', `reminder-${reminderCount}`, 'awaiting-documents']
        });

        if (zendeskUpdateResult.success) {
          console.log(`✅ Document reminder added to ticket ${originalTicket.ticket_id}`);
          
          // Now send email via side conversation
          console.log(`📧 Sending reminder email via side conversation...`);

          const urgencyText = reminderCount >= 3 ? 'DRINGEND - LETZTE ERINNERUNG' : reminderCount >= 2 ? 'WICHTIG' : '';
          const emailSubject = `${urgencyText ? urgencyText + ' ' : ''}Erinnerung: Dokumente benötigt - Aktenzeichen ${client.aktenzeichen}`;
          const emailBody = this.generateReminderEmailBody(client, reminderCount, urgencyText);
          
          const sideConversationResult = await this.zendeskService.createSideConversation(
            originalTicket.ticket_id,
            {
              recipientEmail: client.email,
              recipientName: `${client.firstName} ${client.lastName}`,
              subject: emailSubject,
              body: emailBody,
              internalNote: false // We already added the internal note above
            }
          );
          
          if (sideConversationResult.success) {
            console.log(`✅ Reminder email sent via side conversation to ${client.email}`);
          } else {
            console.error(`❌ Failed to send reminder email: ${sideConversationResult.error}`);
          }
        } else {
          console.error(`❌ Failed to add reminder to ticket: ${zendeskUpdateResult.error}`);
        }
      }

      // Update client record with reminder information
      client.document_reminder_count = reminderCount;
      client.last_document_reminder_at = new Date();
      
      // Add to status history
      client.status_history.push({
        id: uuidv4(),
        status: 'document_reminder_sent',
        changed_by: 'system',
        metadata: {
          reminder_count: reminderCount,
          days_since_payment: Math.floor(
            (Date.now() - new Date(client.payment_processed_at).getTime()) / (1000 * 60 * 60 * 24)
          ),
          zendesk_ticket_updated: zendeskUpdateResult?.success || false,
          zendesk_ticket_id: originalTicket.ticket_id
        }
      });

      await client.save();

      console.log(`✅ Document reminder #${reminderCount} sent for ${client.aktenzeichen}`);
      
      return {
        success: true,
        reminderCount: reminderCount,
        zendeskUpdated: zendeskUpdateResult?.success || false
      };
      
    } catch (error) {
      console.error(`❌ Error sending document reminder for ${client.aktenzeichen}:`, error);
      throw error;
    }
  }

  // Generate reminder email body for customer
  generateReminderEmailBody(client, reminderCount, urgencyText) {
    const daysSincePayment = Math.floor(
      (Date.now() - new Date(client.payment_processed_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    
    const portalUrl = `${process.env.FRONTEND_URL || 'https://mandanten-portal.onrender.com'}/login`;
    
    let greeting = '';
    if (reminderCount === 1) {
      greeting = 'wir möchten Sie freundlich daran erinnern, dass';
    } else if (reminderCount === 2) {
      greeting = 'leider haben wir noch keine Dokumente von Ihnen erhalten. Bitte denken Sie daran, dass';
    } else if (reminderCount >= 3) {
      greeting = 'dies ist eine wichtige Erinnerung! Um Ihr Insolvenzverfahren fortzusetzen,';
    }
    
    const emailBody = `Sehr geehrte/r ${client.firstName} ${client.lastName},

${greeting} wir Ihre Gläubigerdokumente benötigen.

Sie haben Ihre erste Rate vor ${daysSincePayment} Tagen bezahlt - vielen Dank dafür! 
Jetzt fehlen nur noch Ihre Dokumente, damit wir mit der Bearbeitung beginnen können.

IHRE ZUGANGSDATEN:
==================
Portal-Link: ${portalUrl}
E-Mail: ${client.email}
Aktenzeichen: ${client.aktenzeichen}

BENÖTIGTE DOKUMENTE:
===================
• Mahnungen und Zahlungsaufforderungen
• Rechnungen und Verträge  
• Inkasso-Schreiben
• Kreditverträge
• Alle anderen Gläubigerschreiben

${reminderCount >= 3 ? `
⚠️ WICHTIG: Ohne Ihre Dokumente können wir nicht mit der Bearbeitung beginnen.
Ihre bisherigen Zahlungen könnten verfallen, wenn wir nicht bald fortfahren können.
` : ''}

So laden Sie Ihre Dokumente hoch:
1. Klicken Sie auf den Portal-Link oben
2. Melden Sie sich mit Ihrer E-Mail-Adresse und Ihrem Aktenzeichen an  
3. Klicken Sie auf "Dokumente hochladen"
4. Wählen Sie Ihre Dokumente aus oder fotografieren Sie diese mit Ihrem Smartphone

${reminderCount >= 2 ? `
Benötigen Sie Hilfe beim Hochladen? Rufen Sie uns gerne an:
📞 0234 9136810
📧 info@ra-scuric.de
` : ''}

Mit freundlichen Grüßen
Ihr Insolvenz-Team

PS: Dies ist die ${reminderCount}. Erinnerung bezüglich Ihrer fehlenden Dokumente.`;

    return emailBody;
  }
  
  // Generate reminder content based on reminder count
  generateReminderContent(client, reminderCount) {
    const daysSincePayment = Math.floor(
      (Date.now() - new Date(client.payment_processed_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    let urgencyLevel = '📋';
    let urgencyText = '';
    
    if (reminderCount >= 5) {
      urgencyLevel = '🚨';
      urgencyText = 'DRINGEND - LETZTE ERINNERUNG';
    } else if (reminderCount >= 3) {
      urgencyLevel = '⚠️';
      urgencyText = 'WICHTIG';
    }

    return `${urgencyLevel} **DOKUMENTE-ERINNERUNG #${reminderCount} ${urgencyText}**

👤 **Mandant:** ${client.firstName} ${client.lastName} (${client.aktenzeichen})
📧 **E-Mail:** ${client.email}
💰 **Erste Rate bezahlt:** vor ${daysSincePayment} Tagen
📄 **Dokumente hochgeladen:** 0

**STATUS:** Warte auf Dokumente seit ${daysSincePayment} Tagen

**🔧 AGENT-AKTIONEN:**
${reminderCount === 1 ? '📧 Erste Erinnerungs-E-Mail senden' : ''}
${reminderCount === 2 ? '📞 Mandant anrufen - freundliche Erinnerung' : ''}
${reminderCount === 3 ? '📱 SMS-Erinnerung senden' : ''}
${reminderCount === 4 ? '📞 Zweiter Anruf - Unterstützung anbieten' : ''}
${reminderCount >= 5 ? '⚠️ Eskalation an Teamleiter - Verfahren gefährdet' : ''}

**📧 E-MAIL VORLAGE (Erinnerung ${reminderCount}):**
Betreff: ${urgencyText} Ihre Dokumente werden benötigt - Aktenzeichen ${client.aktenzeichen}

Sehr geehrte/r ${client.firstName} ${client.lastName},

${reminderCount === 1 ? 'wir möchten Sie freundlich daran erinnern, dass' : ''}
${reminderCount === 2 ? 'leider haben wir noch keine Dokumente von Ihnen erhalten. Bitte denken Sie daran, dass' : ''}
${reminderCount >= 3 ? 'dies ist eine wichtige Erinnerung! Um Ihr Insolvenzverfahren fortzusetzen,' : ''}
wir Ihre Gläubigerdokumente benötigen.

Sie haben Ihre erste Rate vor ${daysSincePayment} Tagen bezahlt - vielen Dank dafür! 
Jetzt fehlen nur noch Ihre Dokumente, damit wir mit der Bearbeitung beginnen können.

**Bitte laden Sie Ihre Dokumente hier hoch:**
🔗 ${process.env.FRONTEND_URL || 'https://mandanten-portal.onrender.com'}/login
**Ihr Aktenzeichen:** ${client.aktenzeichen}

Benötigte Dokumente:
• Mahnungen und Zahlungsaufforderungen
• Rechnungen und Verträge  
• Inkasso-Schreiben
• Kreditverträge
• Alle anderen Gläubigerschreiben

${reminderCount >= 3 ? `
⚠️ WICHTIG: Ohne Ihre Dokumente können wir nicht mit der Bearbeitung beginnen.
Ihre bisherigen Zahlungen könnten verfallen, wenn wir nicht bald fortfahren können.
` : ''}

${reminderCount >= 2 ? `
Benötigen Sie Hilfe beim Hochladen? Rufen Sie uns gerne an:
📞 0234 9136810
📧 info@ra-scuric.de
` : ''}

Mit freundlichen Grüßen
Ihr Insolvenz-Team

**🔄 AUTOMATISCHE ERINNERUNG ${reminderCount}**
Nächste Erinnerung in ${this.reminderIntervalDays} Tagen, falls keine Dokumente hochgeladen werden.`;
  }

  // Check if client has uploaded documents after payment
  async checkDocumentUploadStatus(clientId) {
    try {
      const client = await Client.findOne({ id: clientId });
      
      if (!client) {
        return { success: false, error: 'Client not found' };
      }

      const hasDocuments = client.documents && client.documents.length > 0;
      
      if (hasDocuments && client.payment_ticket_type === 'document_request') {
        console.log(`✅ Documents uploaded for ${client.aktenzeichen} - updating status`);
        
        // Update client status
        client.payment_ticket_type = 'processing_documents';
        client.documents_uploaded_after_payment_at = new Date();
        
        // Add status history
        client.status_history.push({
          id: uuidv4(),
          status: 'documents_uploaded_after_payment',
          changed_by: 'system',
          metadata: {
            documents_count: client.documents.length,
            days_after_payment: Math.floor(
              (Date.now() - new Date(client.payment_processed_at).getTime()) / (1000 * 60 * 60 * 24)
            ),
            reminder_count: client.document_reminder_count || 0
          }
        });

        await client.save();

        // Notify Zendesk if configured
        if (this.zendeskService.isConfigured() && client.zendesk_ticket_id) {
          await this.zendeskService.addInternalComment(client.zendesk_ticket_id, {
            content: `✅ **DOKUMENTE HOCHGELADEN**\n\n👤 **Mandant:** ${client.firstName} ${client.lastName}\n📄 **Dokumente:** ${client.documents.length} hochgeladen\n⏱️ **Nach Erinnerungen:** ${client.document_reminder_count || 0}\n\n🔄 **Automatische Verarbeitung gestartet**\nDie AI-Analyse läuft jetzt. Sie erhalten eine Benachrichtigung wenn abgeschlossen.`,
            tags: ['documents-uploaded', 'processing-started']
          });
        }

        return {
          success: true,
          hasDocuments: true,
          documentsCount: client.documents.length,
          statusUpdated: true
        };
      }

      return {
        success: true,
        hasDocuments: hasDocuments,
        documentsCount: client.documents?.length || 0,
        statusUpdated: false
      };
      
    } catch (error) {
      console.error('❌ Error checking document upload status:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = DocumentReminderService;