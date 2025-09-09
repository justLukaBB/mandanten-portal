const ZendeskService = require('./zendeskService');
const { v4: uuidv4 } = require('uuid');

class ImmediateDocumentRequest {
  constructor() {
    this.zendeskService = new ZendeskService();
  }

  /**
   * Send immediate document upload request after payment confirmation
   * This prevents clients from waiting up to 1 hour for the first reminder
   */
  async sendImmediateDocumentRequest(client) {
    try {
      console.log(`📤 Sending immediate document request to ${client.firstName} ${client.lastName} (${client.aktenzeichen})`);
      
      // Generate welcome email content
      const emailContent = this.generateWelcomeEmail(client);
      
      // Find the payment review ticket
      const paymentTicket = client.zendesk_tickets?.find(
        t => t.ticket_type === 'payment_review' || t.ticket_scenario === 'payment-confirmed'
      );
      
      if (!paymentTicket?.ticket_id) {
        console.error('❌ No payment ticket found for immediate document request');
        return { success: false, error: 'No payment ticket found' };
      }

      // Send email via Zendesk side conversation
      if (this.zendeskService.isConfigured()) {
        const emailResult = await this.zendeskService.createSideConversation(
          paymentTicket.ticket_id,
          {
            recipientEmail: client.email,
            recipientName: `${client.firstName} ${client.lastName}`,
            subject: `✅ Zahlung erhalten - Dokumente benötigt | ${client.aktenzeichen}`,
            body: emailContent.customerEmail,
            internalNote: false
          }
        );

        // Add internal note for agents
        await this.zendeskService.addInternalComment(paymentTicket.ticket_id, {
          content: emailContent.internalNote,
          tags: ['payment-confirmed', 'document-request-sent', 'immediate-notification']
        });

        // Update client record
        client.document_request_email_sent_at = new Date();
        
        // Add to status history
        client.status_history.push({
          id: uuidv4(),
          status: 'immediate_document_request_sent',
          changed_by: 'system',
          metadata: {
            email_sent: emailResult.success,
            trigger: 'payment_confirmation',
            ticket_id: paymentTicket.ticket_id
          }
        });

        await client.save();

        console.log(`✅ Immediate document request sent successfully`);
        
        return {
          success: true,
          emailSent: emailResult.success,
          ticketUpdated: true
        };
      }

      return { success: false, error: 'Zendesk not configured' };
      
    } catch (error) {
      console.error('❌ Error sending immediate document request:', error);
      return { success: false, error: error.message };
    }
  }

  generateWelcomeEmail(client) {
    const portalUrl = `${process.env.FRONTEND_URL || 'https://mandanten-portal.onrender.com'}/login`;
    
    const customerEmail = `Sehr geehrte/r ${client.firstName} ${client.lastName},

vielen Dank für Ihre erste Zahlung! ✅

Wir haben Ihre Zahlung erhalten und können nun mit Ihrem Insolvenzverfahren beginnen. 
Als nächsten Schritt benötigen wir Ihre Gläubigerdokumente.

IHRE NÄCHSTEN SCHRITTE:
========================
1. Öffnen Sie das Mandanten-Portal: ${portalUrl}
2. Melden Sie sich mit diesen Daten an:
   • E-Mail: ${client.email}
   • Aktenzeichen: ${client.aktenzeichen}
3. Laden Sie alle Gläubigerdokumente hoch

WELCHE DOKUMENTE BENÖTIGEN WIR?
================================
📄 Mahnungen und Zahlungsaufforderungen
📄 Rechnungen und Verträge
📄 Inkasso-Schreiben
📄 Kreditverträge und Darlehensverträge
📄 Gerichtliche Mahnbescheide
📄 Vollstreckungsbescheide
📄 Alle anderen Schreiben von Gläubigern

WICHTIGE HINWEISE:
==================
• Je schneller Sie die Dokumente hochladen, desto schneller können wir mit der Bearbeitung beginnen
• Sie können Dokumente fotografieren oder scannen
• Laden Sie lieber zu viele als zu wenige Dokumente hoch
• Bei Fragen rufen Sie uns gerne an: 0234 9136810

Wir freuen uns darauf, Ihnen zu helfen!

Mit freundlichen Grüßen
Ihr Insolvenz-Team

PS: Diese E-Mail wurde automatisch nach Zahlungseingang versendet. 
    Sollten Sie bereits Dokumente hochgeladen haben, können Sie diese Nachricht ignorieren.`;

    const internalNote = `💰 **ZAHLUNG ERHALTEN - DOKUMENTE ANGEFORDERT**

👤 **Mandant:** ${client.firstName} ${client.lastName}
📧 **E-Mail:** ${client.email}
📁 **Aktenzeichen:** ${client.aktenzeichen}
💶 **Status:** Erste Rate bezahlt
📄 **Dokumente:** 0 hochgeladen

**AUTOMATISCHE AKTIONEN:**
✅ Willkommens-E-Mail mit Dokumentenanforderung versendet
✅ Portal-Zugangsdaten mitgeteilt
✅ Erinnerungsprozess aktiviert

**NÄCHSTE SCHRITTE:**
1. Mandant lädt Dokumente hoch → Automatische AI-Verarbeitung startet
2. Keine Dokumente nach 2 Tagen → Erste Erinnerung wird versendet
3. Agent-Aktionen bei Bedarf gemäß Erinnerungsplan

**ERINNERUNGSPLAN:**
• Tag 2: Erste freundliche Erinnerung
• Tag 4: Zweite Erinnerung mit Dringlichkeit
• Tag 6: Dritte Erinnerung + SMS-Vorschlag
• Tag 8: Anruf-Aufgabe für Agent
• Tag 10: Eskalation an Teamleiter`;

    return {
      customerEmail,
      internalNote
    };
  }
}

module.exports = ImmediateDocumentRequest;