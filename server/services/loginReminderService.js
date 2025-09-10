const Client = require('../models/Client');
const ZendeskService = require('./zendeskService');
const { v4: uuidv4 } = require('uuid');

class LoginReminderService {
  constructor() {
    this.zendeskService = new ZendeskService();
    this.loginReminderDays = 7; // Send login reminder after 7 days of no login
    this.documentReminderDays = 7; // Send document reminder after 7 days of login but no upload
  }

  /**
   * Check for clients who need login or document upload reminders
   */
  async checkAndSendLoginReminders() {
    try {
      console.log('🔄 Starting login reminder check...');
      
      // Find clients who need login reminders (no login after 7 days)
      const clientsNeedingLoginReminder = await Client.find({
        portal_link_sent: true,
        portal_link_sent_at: { 
          $lte: new Date(Date.now() - this.loginReminderDays * 24 * 60 * 60 * 1000) 
        },
        last_login: null, // Never logged in
        login_reminder_sent: { $ne: true }, // No login reminder sent yet
        current_status: { $in: ['created', 'portal_access_sent'] }
      });

      // Find clients who logged in but haven't uploaded documents (7 days after login)
      const clientsNeedingDocReminder = await Client.find({
        last_login: { 
          $lte: new Date(Date.now() - this.documentReminderDays * 24 * 60 * 60 * 1000) 
        },
        'documents': { $size: 0 }, // No documents uploaded
        login_document_reminder_sent: { $ne: true }, // No login-based document reminder sent
        current_status: { $in: ['portal_access_sent', 'documents_uploaded'] },
        first_payment_received: { $ne: true } // Not payment-based (that's handled separately)
      });

      console.log(`📋 Found ${clientsNeedingLoginReminder.length} clients needing login reminders`);
      console.log(`📋 Found ${clientsNeedingDocReminder.length} clients needing document upload reminders`);

      let loginRemindersCount = 0;
      let docRemindersCount = 0;
      let errorCount = 0;

      // Send login reminders
      for (const client of clientsNeedingLoginReminder) {
        try {
          await this.sendLoginReminder(client);
          loginRemindersCount++;
        } catch (error) {
          console.error(`❌ Error sending login reminder to ${client.aktenzeichen}:`, error.message);
          errorCount++;
        }
      }

      // Send document upload reminders (for clients who logged in but didn't upload)
      for (const client of clientsNeedingDocReminder) {
        try {
          await this.sendLoginBasedDocumentReminder(client);
          docRemindersCount++;
        } catch (error) {
          console.error(`❌ Error sending document reminder to ${client.aktenzeichen}:`, error.message);
          errorCount++;
        }
      }

      console.log(`✅ Login reminder check complete. Login reminders: ${loginRemindersCount}, Doc reminders: ${docRemindersCount}, Errors: ${errorCount}`);
      
      return {
        totalChecked: clientsNeedingLoginReminder.length + clientsNeedingDocReminder.length,
        loginRemindersSent: loginRemindersCount,
        documentRemindersSent: docRemindersCount,
        errors: errorCount
      };
      
    } catch (error) {
      console.error('❌ Error in login reminder service:', error);
      throw error;
    }
  }

  /**
   * Send login reminder to client who hasn't logged in after 7 days
   */
  async sendLoginReminder(client) {
    try {
      console.log(`📧 Sending login reminder to ${client.firstName} ${client.lastName} (${client.aktenzeichen})`);
      
      const daysSincePortalSent = Math.floor(
        (Date.now() - new Date(client.portal_link_sent_at).getTime()) / (1000 * 60 * 60 * 24)
      );

      const reminderContent = this.generateLoginReminderContent(client, daysSincePortalSent);
      
      // Find the original Zendesk ticket
      const originalTicket = client.zendesk_tickets?.find(
        t => t.ticket_type === 'main_ticket' || t.status === 'active'
      ) || { ticket_id: client.zendesk_ticket_id };

      let zendeskUpdateResult = null;

      // Add internal comment and send email if Zendesk is configured
      if (this.zendeskService.isConfigured() && originalTicket.ticket_id) {
        console.log(`💬 Adding login reminder comment to ticket ${originalTicket.ticket_id}...`);
        
        // Add internal comment
        zendeskUpdateResult = await this.zendeskService.addInternalComment(originalTicket.ticket_id, {
          content: reminderContent,
          tags: ['login-reminder', 'no-login-7-days', 'awaiting-login']
        });

        if (zendeskUpdateResult.success) {
          // Send email via side conversation
          const emailSubject = `Wichtige Erinnerung: Portal-Zugang nutzen - ${client.aktenzeichen}`;
          const emailBody = this.generateLoginReminderEmailBody(client, daysSincePortalSent);
          
          const sideConversationResult = await this.zendeskService.createSideConversation(
            originalTicket.ticket_id,
            {
              recipientEmail: client.email,
              recipientName: `${client.firstName} ${client.lastName}`,
              subject: emailSubject,
              body: emailBody,
              internalNote: false
            }
          );
          
          if (sideConversationResult.success) {
            console.log(`✅ Login reminder email sent to ${client.email}`);
          }
        }
      }

      // Update client record
      client.login_reminder_sent = true;
      client.login_reminder_sent_at = new Date();
      
      // Add to status history
      client.status_history.push({
        id: uuidv4(),
        status: 'login_reminder_sent',
        changed_by: 'system',
        metadata: {
          days_since_portal_sent: daysSincePortalSent,
          portal_sent_at: client.portal_link_sent_at,
          reminder_type: 'login_reminder',
          zendesk_ticket_updated: zendeskUpdateResult?.success || false
        }
      });

      await client.save();

      console.log(`✅ Login reminder sent for ${client.aktenzeichen}`);
      
      return {
        success: true,
        reminderType: 'login',
        zendeskUpdated: zendeskUpdateResult?.success || false
      };
      
    } catch (error) {
      console.error(`❌ Error sending login reminder for ${client.aktenzeichen}:`, error);
      throw error;
    }
  }

  /**
   * Send document upload reminder to client who logged in but didn't upload (7 days after login)
   */
  async sendLoginBasedDocumentReminder(client) {
    try {
      console.log(`📧 Sending login-based document reminder to ${client.firstName} ${client.lastName} (${client.aktenzeichen})`);
      
      const daysSinceLogin = Math.floor(
        (Date.now() - new Date(client.last_login).getTime()) / (1000 * 60 * 60 * 24)
      );

      const reminderContent = this.generateDocumentReminderContent(client, daysSinceLogin);
      
      // Find the original Zendesk ticket
      const originalTicket = client.zendesk_tickets?.find(
        t => t.ticket_type === 'main_ticket' || t.status === 'active'
      ) || { ticket_id: client.zendesk_ticket_id };

      let zendeskUpdateResult = null;

      // Add internal comment and send email if Zendesk is configured
      if (this.zendeskService.isConfigured() && originalTicket.ticket_id) {
        console.log(`💬 Adding document reminder comment to ticket ${originalTicket.ticket_id}...`);
        
        zendeskUpdateResult = await this.zendeskService.addInternalComment(originalTicket.ticket_id, {
          content: reminderContent,
          tags: ['document-reminder', 'login-no-upload-7-days', 'awaiting-documents']
        });

        if (zendeskUpdateResult.success) {
          const emailSubject = `Dokumente benötigt: Bitte laden Sie Ihre Unterlagen hoch - ${client.aktenzeichen}`;
          const emailBody = this.generateDocumentReminderEmailBody(client, daysSinceLogin);
          
          const sideConversationResult = await this.zendeskService.createSideConversation(
            originalTicket.ticket_id,
            {
              recipientEmail: client.email,
              recipientName: `${client.firstName} ${client.lastName}`,
              subject: emailSubject,
              body: emailBody,
              internalNote: false
            }
          );
          
          if (sideConversationResult.success) {
            console.log(`✅ Document reminder email sent to ${client.email}`);
          }
        }
      }

      // Update client record
      client.login_document_reminder_sent = true;
      client.login_document_reminder_sent_at = new Date();
      
      // Add to status history
      client.status_history.push({
        id: uuidv4(),
        status: 'login_document_reminder_sent',
        changed_by: 'system',
        metadata: {
          days_since_login: daysSinceLogin,
          last_login: client.last_login,
          reminder_type: 'document_upload_after_login',
          zendesk_ticket_updated: zendeskUpdateResult?.success || false
        }
      });

      await client.save();

      console.log(`✅ Login-based document reminder sent for ${client.aktenzeichen}`);
      
      return {
        success: true,
        reminderType: 'document_after_login',
        zendeskUpdated: zendeskUpdateResult?.success || false
      };
      
    } catch (error) {
      console.error(`❌ Error sending document reminder for ${client.aktenzeichen}:`, error);
      throw error;
    }
  }

  generateLoginReminderContent(client, daysSincePortalSent) {
    return `🔑 **LOGIN-ERINNERUNG**

👤 **Mandant:** ${client.firstName} ${client.lastName} (${client.aktenzeichen})
📧 **E-Mail:** ${client.email}
📅 **Portal-Link gesendet:** vor ${daysSincePortalSent} Tagen
🚪 **Status:** Noch nicht angemeldet

**SITUATION:** Mandant hat sich seit ${daysSincePortalSent} Tagen nicht am Portal angemeldet.

**🔧 AGENT-AKTIONEN:**
📧 Erinnerungs-E-Mail mit Login-Anleitung senden
📞 Mandant anrufen und beim Login helfen
💻 Technische Probleme abklären

**📧 E-MAIL VORLAGE:**
Betreff: Wichtige Erinnerung: Portal-Zugang nutzen - ${client.aktenzeichen}

Sehr geehrte/r ${client.firstName} ${client.lastName},

vor ${daysSincePortalSent} Tagen haben wir Ihnen den Zugang zu unserem Mandanten-Portal gesendet.
Bisher konnten wir noch keine Anmeldung feststellen.

**Ihre Zugangsdaten:**
🔗 Portal-Link: ${process.env.FRONTEND_URL || 'https://mandanten-portal.onrender.com'}/login
📧 E-Mail: ${client.email}
📁 Aktenzeichen: ${client.aktenzeichen}

Bitte loggen Sie sich ein, um mit der Bearbeitung Ihres Insolvenzverfahrens zu beginnen.

Bei Problemen beim Login helfen wir Ihnen gerne:
📞 0234 9136810
📧 info@ra-scuric.de

Mit freundlichen Grüßen
Ihr Insolvenz-Team`;
  }

  generateLoginReminderEmailBody(client, daysSincePortalSent) {
    return `Sehr geehrte/r ${client.firstName} ${client.lastName},

vor ${daysSincePortalSent} Tagen haben wir Ihnen den Zugang zu unserem Mandanten-Portal gesendet.
Bisher konnten wir noch keine Anmeldung feststellen.

**IHRE ZUGANGSDATEN:**
🔗 Portal-Link: ${process.env.FRONTEND_URL || 'https://mandanten-portal.onrender.com'}/login
📧 E-Mail-Adresse: ${client.email}
📁 Aktenzeichen: ${client.aktenzeichen}

**SO MELDEN SIE SICH AN:**
1. Klicken Sie auf den Portal-Link oben
2. Geben Sie Ihre E-Mail-Adresse ein
3. Geben Sie Ihr Aktenzeichen ein
4. Klicken Sie auf "Anmelden"

Nach der Anmeldung können Sie:
✅ Ihre Gläubigerdokumente hochladen
✅ Den Bearbeitungsstand einsehen
✅ Mit uns kommunizieren

**BRAUCHEN SIE HILFE?**
Falls Sie Probleme beim Login haben, rufen Sie uns gerne an:
📞 0234 9136810
📧 info@ra-scuric.de

Wir helfen Ihnen gerne bei der ersten Anmeldung!

Mit freundlichen Grüßen
Ihr Insolvenz-Team

PS: Diese Erinnerung wird nur einmal versendet.`;
  }

  generateDocumentReminderContent(client, daysSinceLogin) {
    return `📄 **DOKUMENT-UPLOAD ERINNERUNG**

👤 **Mandant:** ${client.firstName} ${client.lastName} (${client.aktenzeichen})
📧 **E-Mail:** ${client.email}
🔑 **Letzte Anmeldung:** vor ${daysSinceLogin} Tagen
📄 **Dokumente hochgeladen:** 0

**SITUATION:** Mandant hat sich angemeldet, aber seit ${daysSinceLogin} Tagen keine Dokumente hochgeladen.

**🔧 AGENT-AKTIONEN:**
📧 Dokument-Upload Erinnerung senden
📞 Mandant anrufen und beim Upload helfen
💻 Technische Probleme beim Upload abklären

**BENÖTIGTE DOKUMENTE:**
• Mahnungen und Zahlungsaufforderungen
• Rechnungen und Verträge
• Inkasso-Schreiben
• Kreditverträge
• Alle anderen Gläubigerschreiben`;
  }

  generateDocumentReminderEmailBody(client, daysSinceLogin) {
    return `Sehr geehrte/r ${client.firstName} ${client.lastName},

wir freuen uns, dass Sie sich vor ${daysSinceLogin} Tagen in unserem Portal angemeldet haben!

Um mit der Bearbeitung Ihres Insolvenzverfahrens beginnen zu können, benötigen wir noch Ihre Gläubigerdokumente.

**BENÖTIGTE DOKUMENTE:**
📄 Mahnungen und Zahlungsaufforderungen
📄 Rechnungen und Verträge
📄 Inkasso-Schreiben
📄 Kreditverträge und Darlehensverträge
📄 Gerichtliche Mahnbescheide
📄 Alle anderen Schreiben von Gläubigern

**SO LADEN SIE DOKUMENTE HOCH:**
1. Loggen Sie sich im Portal ein: ${process.env.FRONTEND_URL || 'https://mandanten-portal.onrender.com'}/login
2. Klicken Sie auf "Dokumente hochladen"
3. Wählen Sie Ihre Dateien aus oder fotografieren Sie die Dokumente
4. Klicken Sie auf "Hochladen"

**IHRE ZUGANGSDATEN:**
📧 E-Mail: ${client.email}
📁 Aktenzeichen: ${client.aktenzeichen}

**WICHTIGER HINWEIS:**
Je schneller Sie die Dokumente hochladen, desto schneller können wir mit der Bearbeitung beginnen.

**BRAUCHEN SIE HILFE?**
Falls Sie Probleme beim Upload haben, rufen Sie uns gerne an:
📞 0234 9136810
📧 info@ra-scuric.de

Mit freundlichen Grüßen
Ihr Insolvenz-Team

PS: Diese Erinnerung wird nur einmal versendet.`;
  }
}

module.exports = LoginReminderService;