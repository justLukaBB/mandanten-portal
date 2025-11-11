const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Client = require("../models/Client");
const { rateLimits } = require("../middleware/security");
const { sanitizeAktenzeichen } = require("../utils/sanitizeAktenzeichen");
const ZendeskService = require("../services/zendeskService");
const CreditorContactService = require("../services/creditorContactService");
const SideConversationMonitor = require("../services/sideConversationMonitor");
const ConditionCheckService = require("../services/conditionCheckService");
const WelcomeEmailService = require("../services/welcomeEmailService");

const router = express.Router();

// Initialize Zendesk service
const zendeskService = new ZendeskService();

// Initialize Side Conversation Monitor
const sideConversationMonitor = new SideConversationMonitor();

// Initialize Condition Check Service
const conditionCheckService = new ConditionCheckService();

// Initialize Welcome Email Service
const welcomeEmailService = new WelcomeEmailService();

// Middleware to handle Zendesk's specific JSON format
const parseZendeskPayload = (req, res, next) => {
  console.log(
    "🔍 Zendesk Payload Parser - Original body type:",
    typeof req.body
  );

  // If body is a string, try to parse it
  if (typeof req.body === "string") {
    try {
      console.log("📜 Attempting to parse string body as JSON...");
      req.body = JSON.parse(req.body);
      console.log("✅ Successfully parsed string body to JSON");
    } catch (e) {
      console.error("❌ Failed to parse string body:", e.message);
      return res.status(400).json({
        error: "Invalid JSON in request body",
        details: e.message,
        receivedType: typeof req.body,
        receivedBody: req.body.substring(0, 100) + "...",
      });
    }
  }

  // Log the final parsed body
  console.log("📦 Final parsed body:", JSON.stringify(req.body, null, 2));
  next();
};

// Helper function to sanitize aktenzeichen from webhook payload
function sanitizeAktenzeichenFromPayload(aktenzeichen, res) {
  if (!aktenzeichen) {
    return null;
  }

  const original = aktenzeichen;
  try {
    const sanitized = sanitizeAktenzeichen(aktenzeichen);
    if (original !== sanitized) {
      console.log(`🔧 Sanitized aktenzeichen: "${original}" → "${sanitized}"`);
    }
    return sanitized;
  } catch (error) {
    console.error(`❌ Failed to sanitize aktenzeichen "${original}":`, error.message);
    if (res) {
      res.status(400).json({
        error: "Invalid aktenzeichen format",
        message: error.message,
        received: original
      });
    }
    return null;
  }
}

// Zendesk Webhook: Portal Link Sent
// Triggered when agent uses "Portal-Link senden" macro
router.post(
  "/portal-link-sent",
  parseZendeskPayload,
  rateLimits.general,
  async (req, res) => {
    try {
      console.log("🔗 Zendesk Webhook: Portal-Link-Sent received", req.body);
      console.log("🔍 Portal-Link-Sent webhook triggered details:", {
        userAgent: req.headers['user-agent'],
        sourceIP: req.ip,
        timestamp: new Date().toISOString(),
        triggeredBy: req.body.trigger_id || req.body.automation_id || 'manual',
        webhookSource: req.headers['x-zendesk-webhook-signature'] ? 'zendesk' : 'external',
        hasZendeskFormat: !!(req.body.ticket && req.body.ticket.requester)
      });

      // Handle both direct format and Zendesk webhook format
      let email,
        aktenzeichen,
        firstName,
        lastName,
        zendesk_ticket_id,
        zendesk_user_id,
        phone,
        address,
        geburtstag;

      if (req.body.ticket && req.body.ticket.requester) {
        // Zendesk webhook format
        const requester = req.body.ticket.requester;
        const ticket = req.body.ticket;

        email = requester.email;
        aktenzeichen = requester.aktenzeichen; // This is the custom field!
        zendesk_ticket_id = ticket.id;
        zendesk_user_id = requester.id;
        phone = requester.phone || "";
        address = requester.adresse || "";
        geburtstag = requester.geburtstag || "";

        // Parse name - assume "FirstName LastName" format
        const nameParts = (requester.name || "").split(" ");
        firstName = nameParts[0] || "";
        lastName = nameParts.slice(1).join(" ") || "";

        console.log("📋 Parsed Zendesk webhook data:", {
          email,
          aktenzeichen,
          firstName,
          lastName,
          zendesk_ticket_id,
          zendesk_user_id,
          address,
          geburtstag,
        });
      } else {
        // Direct format (for backward compatibility)
        ({
          email,
          aktenzeichen,
          firstName,
          lastName,
          zendesk_ticket_id,
          zendesk_user_id,
          phone,
          address,
          geburtstag,
        } = req.body);
      }

      // Sanitize aktenzeichen: Replace / with _ and other dangerous characters
      if (aktenzeichen) {
        const originalAktenzeichen = aktenzeichen;
        try {
          aktenzeichen = sanitizeAktenzeichen(aktenzeichen);
          if (originalAktenzeichen !== aktenzeichen) {
            console.log(`🔧 Sanitized aktenzeichen: "${originalAktenzeichen}" → "${aktenzeichen}"`);
          }
        } catch (error) {
          console.error(`❌ Failed to sanitize aktenzeichen "${originalAktenzeichen}":`, error.message);
          return res.status(400).json({
            error: "Invalid aktenzeichen format",
            message: error.message,
            received: originalAktenzeichen
          });
        }
      }

      // Validate required fields
      if (!email || !aktenzeichen || !firstName || !lastName) {
        return res.status(400).json({
          error:
            "Missing required fields: email, aktenzeichen, firstName, lastName",
        });
      }

      // Check if client already exists
      let client = await Client.findOne({
        $or: [{ email: email }, { aktenzeichen: aktenzeichen }],
      });

      if (client) {
        console.log(
          `📋 Client exists in MongoDB, updating: ${client.aktenzeichen}`
        );

        try {
          // Update only specific fields to avoid document validation issues
          const updateData = {
            zendesk_ticket_id: zendesk_ticket_id,
            zendesk_user_id: zendesk_user_id,
            portal_link_sent: true,
            portal_link_sent_at: new Date(),
            updated_at: new Date(),
          };

          // Don't override current_status if client is already in a more advanced status
          const advancedStatuses = ['awaiting_client_confirmation', 'client_confirmation', 'creditor_review', 'creditor_contact_initiated', 'creditor_contact_active', 'settlement_documents_generated', 'settlement_plan_sent_to_creditors', 'completed'];
          if (!advancedStatuses.includes(client.current_status)) {
            console.log(`⚠️ Status would be reset from ${client.current_status} to portal_access_sent for client ${client.aktenzeichen} - ALLOWING because not in advanced status`);
            updateData.current_status = "portal_access_sent";
          } else {
            console.log(`✅ Status protection: Client ${client.aktenzeichen} stays at ${client.current_status} (advanced status)`);
          }

          // Update address and geburtstag if provided
          if (address) updateData.address = address;
          if (geburtstag) updateData.geburtstag = geburtstag;

          // Update with $push and $set to avoid document array validation
          const updatedClient = await Client.findOneAndUpdate(
            { _id: client._id },
            {
              $set: updateData,
              $push: {
                zendesk_tickets: {
                  ticket_id: zendesk_ticket_id,
                  ticket_type: "portal_access",
                  status: "active",
                  created_at: new Date(),
                },
                status_history: {
                  id: uuidv4(),
                  status: "portal_access_sent",
                  changed_by: "agent",
                  zendesk_ticket_id: zendesk_ticket_id,
                  metadata: {
                    action: "portal_link_resent",
                    agent_action: "Portal-Link senden macro",
                  },
                },
              },
            },
            {
              new: true,
              runValidators: false, // Skip validation for legacy documents
              strict: false, // Allow fields not in schema
            }
          );

          // Use the updated client directly - no reload needed
          client = updatedClient;
        } catch (updateError) {
          console.error(
            "❌ Error updating existing client, falling back to basic update:",
            updateError.message
          );

          // Fallback: Just update the critical fields without touching documents
          client.zendesk_ticket_id = zendesk_ticket_id;
          client.zendesk_user_id = zendesk_user_id;
          client.portal_link_sent = true;
          client.portal_link_sent_at = new Date();
          // Don't override current_status if client is already in a more advanced status
          const advancedStatuses = ['awaiting_client_confirmation', 'client_confirmation', 'creditor_review', 'creditor_contact_initiated', 'creditor_contact_active', 'settlement_documents_generated', 'settlement_plan_sent_to_creditors', 'completed'];
          if (!advancedStatuses.includes(client.current_status)) {
            console.log(`⚠️ FALLBACK: Status would be reset from ${client.current_status} to portal_access_sent for client ${client.aktenzeichen} - ALLOWING because not in advanced status`);
            client.current_status = "portal_access_sent";
          } else {
            console.log(`✅ FALLBACK: Status protection: Client ${client.aktenzeichen} stays at ${client.current_status} (advanced status)`);
          }
          client.updated_at = new Date();
          if (address) client.address = address;
          if (geburtstag) client.geburtstag = geburtstag;

          // Save without validation for documents
          await client.save({ validateModifiedOnly: true });
        }
      } else {
        console.log(
          `👤 No existing client found, creating new client: ${aktenzeichen}`
        );

        // Create new client
        client = new Client({
          id: uuidv4(),
          aktenzeichen: aktenzeichen,
          firstName: firstName,
          lastName: lastName,
          email: email,
          phone: phone || "",
          address: address || "",
          geburtstag: geburtstag || "",

          // Zendesk integration
          zendesk_user_id: zendesk_user_id,
          zendesk_ticket_id: zendesk_ticket_id,
          zendesk_tickets: [
            {
              ticket_id: zendesk_ticket_id,
              ticket_type: "portal_access",
              status: "active",
              created_at: new Date(),
            },
          ],

          // Portal access
          portal_link_sent: true,
          portal_link_sent_at: new Date(),
          portal_token: uuidv4(),

          // Status
          current_status: "portal_access_sent",
          workflow_status: "portal_access_sent", // Legacy compatibility

          // Status tracking
          status_history: [
            {
              id: uuidv4(),
              status: "created",
              changed_by: "system",
              zendesk_ticket_id: zendesk_ticket_id,
              metadata: {
                created_via: "zendesk_webhook",
              },
            },
            {
              id: uuidv4(),
              status: "portal_access_sent",
              changed_by: "agent",
              zendesk_ticket_id: zendesk_ticket_id,
              metadata: {
                agent_action: "Portal-Link senden macro",
              },
            },
          ],
        });

        try {
          await client.save();
          console.log(`✅ New client saved to MongoDB: ${client.aktenzeichen}`);
        } catch (saveError) {
          console.error(
            `❌ Error saving new client to MongoDB:`,
            saveError.message
          );
          console.error(`📋 Client data:`, {
            aktenzeichen: client.aktenzeichen,
            email: client.email,
            firstName: client.firstName,
            lastName: client.lastName,
          });
          throw saveError;
        }
      }

      console.log(
        `✅ Client updated/created successfully: ${client.aktenzeichen}`
      );
      console.log(`   📋 Client details:`, {
        id: client.id,
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email,
        aktenzeichen: client.aktenzeichen,
        address: client.address,
        geburtstag: client.geburtstag,
        current_status: client.current_status,
        created_at: client.created_at,
        updated_at: client.updated_at,
      });

      // DEACTIVATED: Send welcome email via side conversation
      // console.log(`📧 Sending welcome email to new user: ${email}`);
      
      // const welcomeEmailResult = await welcomeEmailService.sendWelcomeEmail(
      //   zendesk_ticket_id,
      //   {
      //     email: email,
      //     firstName: firstName,
      //     lastName: lastName,
      //     aktenzeichen: aktenzeichen,
      //   }
      // );

      let welcomeEmailStatus = "not_sent"; // Always not_sent since deactivated
      let sideConversationId = null;

      // DEACTIVATED: Welcome email sending logic
      // if (welcomeEmailResult.success) {
      //   console.log(`✅ Welcome email sent successfully via public comment on ticket: ${welcomeEmailResult.ticket_id}`);
      //   welcomeEmailStatus = "sent";
      //   sideConversationId = null; // Not using side conversations anymore
      //   
      //   // Update client with welcome email info
      //   client.welcome_email_sent = true;
      //   client.welcome_email_sent_at = new Date();
      //   client.welcome_side_conversation_id = null; // Not applicable for public comments
      //   
      //   // Add to status history
      //   client.status_history.push({
      //     id: uuidv4(),
      //     status: "welcome_email_sent",
      //     changed_by: "system",
      //     zendesk_ticket_id: zendesk_ticket_id,
      //     metadata: {
      //       action: "welcome_email_sent_via_public_comment",
      //       method: "public_comment",
      //       ticket_id: welcomeEmailResult.ticket_id,
      //     },
      //   });
      //   
      //   await client.save();
      //   
      // } else {
      //   console.error(`❌ Failed to send welcome email: ${welcomeEmailResult.error}`);
      // }
      
      console.log(`ℹ️ Welcome email system is DEACTIVATED - no email will be sent to ${email}`);

      // Return success response to Zendesk
      res.json({
        success: true,
        message: "Portal access configured and welcome email sent via public comment",
        client_id: client.id,
        aktenzeichen: client.aktenzeichen,
        portal_status: "active",
        welcome_email_status: welcomeEmailStatus,
        email_method: "public_comment",
        ticket_id: zendesk_ticket_id,
        next_step: "Client should receive portal access email with credentials",
      });
    } catch (error) {
      console.error("❌ Error in portal-link-sent webhook:", error);
      res.status(500).json({
        error: "Failed to process portal link webhook",
        details: error.message,
      });
    }
  }
);

// NEW: Zendesk Webhook: User Payment Confirmed (Phase 2)
// Triggered when agent checks "erste_rate_bezahlt_user" checkbox on USER profile
router.post(
  "/user-payment-confirmed",
  parseZendeskPayload,
  rateLimits.general,
  async (req, res) => {
    try {
      console.log(
        "💰 Zendesk Webhook: User-Payment-Confirmed received",
        req.body
      );

      const {
        user_id, // Zendesk user ID
        email,
        external_id, // This is the aktenzeichen
        name,
        agent_email,
      } = req.body;

      if (!external_id && !email) {
        return res.status(400).json({
          error: "Missing required field: external_id (aktenzeichen) or email",
        });
      }

      // Find client by aktenzeichen (external_id) or email
      const client = await Client.findOne({
        $or: [{ aktenzeichen: external_id }, { email: email }],
      });

      if (!client) {
        return res.status(404).json({
          error: "Client not found",
          external_id: external_id,
          email: email,
        });
      }

      console.log(
        `📋 Processing user payment confirmation for: ${client.firstName} ${client.lastName}`
      );

      // Update client status
      client.first_payment_received = true;
      client.current_status = "payment_confirmed";
      client.updated_at = new Date();

      // Add status history
      client.status_history.push({
        id: uuidv4(),
        status: "payment_confirmed",
        changed_by: "agent",
        zendesk_user_id: user_id,
        metadata: {
          agent_email: agent_email || "system",
          agent_action: "erste_rate_bezahlt_user checkbox on user profile",
          payment_date: new Date(),
        },
      });

      // Skip to the main logic section below

      // Check if both conditions (payment + documents) are met for 7-day review
      const conditionCheckResult =
        await conditionCheckService.handlePaymentConfirmed(client.id);
      console.log(`🔍 Condition check result:`, conditionCheckResult);

      // Check which creditors need manual review (confidence < 80%)
      const needsReview = creditors.filter(
        (c) => (c.ai_confidence || c.confidence || 0) < 0.8
      );
      const confidenceOk = creditors.filter(
        (c) => (c.ai_confidence || c.confidence || 0) >= 0.8
      );

      // Generate automatic review ticket content
      const reviewTicketContent = generateCreditorReviewTicketContent(
        client,
        documents,
        creditors,
        needsReview.length > 0
      );

      // Prepare data for Zendesk ticket creation
      const ticketData = {
        subject: `Gläubiger-Review: ${client.firstName} ${client.lastName} (${client.aktenzeichen})`,
        requester_email: client.email,
        requester_id: user_id,
        tags: [
          "gläubiger-review",
          "payment-confirmed",
          needsReview.length > 0 ? "manual-review-needed" : "auto-approved",
        ],
        priority: needsReview.length > 0 ? "normal" : "low",
        type: "task",
        comment: {
          body: reviewTicketContent,
          public: false, // Internal note
        },
      };

      console.log(
        `✅ Payment confirmed for ${client.aktenzeichen}. Ticket Type: ${ticketType}, Documents: ${documents.length}, Creditors: ${creditors.length}, Need Review: ${needsReview.length}`
      );

      res.json({
        success: true,
        message: `User payment confirmation processed - ${ticketType}`,
        client_status: "payment_confirmed",
        payment_ticket_type: ticketType,
        next_action: nextAction,
        documents_count: documents.length,
        creditor_documents: creditorDocs.length,
        extracted_creditors: creditors.length,
        creditors_need_review: needsReview.length,
        creditors_confidence_ok: confidenceOk.length,
        manual_review_required: needsReview.length > 0,
        zendesk_ticket_data: ticketData,
        review_dashboard_url:
          needsReview.length > 0
            ? `${
                process.env.FRONTEND_URL ||
                "https://mandanten-portal.onrender.com"
              }/agent/review/${client.id}`
            : null,
        scenario_analysis: {
          hasDocuments: state.hasDocuments,
          allProcessed: state.allProcessed,
          hasCreditors: state.hasCreditors,
          needsManualReview: state.needsManualReview,
        },
      });
    } catch (error) {
      console.error("❌ Error in user-payment-confirmed webhook:", error);
      res.status(500).json({
        error: "Failed to process user payment confirmation",
        details: error.message,
      });
    }
  }
);

// PRIMARY: Zendesk Webhook: Payment Confirmed
// Triggered when agent checks "erste_rate_bezahlt" checkbox on a ticket
router.post(
  "/payment-confirmed",
  parseZendeskPayload,
  rateLimits.general,
  async (req, res) => {
    try {
      console.log("💰 Zendesk Webhook: Payment-Confirmed received....");
      console.log("Request Headers:", req.headers);
      console.log("Request Body:", JSON.stringify(req.body, null, 2));
      console.log("Body Type:", typeof req.body);
      console.log(
        "Is req.body an object?",
        req.body && typeof req.body === "object"
      );

      // Extract data from the webhook payload
      // The aktenzeichen comes from ticket.requester.aktenzeichen (custom field)
      let aktenzeichen,
        zendesk_ticket_id,
        requester_email,
        requester_name,
        agent_email;

      if (req.body.ticket) {
        // Standard webhook format with ticket data
        const ticket = req.body.ticket;
        const requester = ticket.requester || {};

        aktenzeichen = requester.aktenzeichen; // This is the custom field!
        zendesk_ticket_id = ticket.id;
        requester_email = requester.email;
        requester_name = requester.name;
        agent_email =
          req.body.agent_email || req.body.current_user?.email || "system";

        console.log("📋 Extracted ticket data:", {
          aktenzeichen,
          zendesk_ticket_id,
          requester_email,
          requester_name,
        });
      } else {
        ({ aktenzeichen, zendesk_ticket_id, agent_email } = req.body);
      }

      if (!aktenzeichen) {
        console.error("❌ Missing aktenzeichen in webhook payload:", req.body);
        return res.status(400).json({
          error: "Missing required field: aktenzeichen",
          hint: "Make sure ticket.requester.aktenzeichen is populated in Zendesk webhook",
        });
      }

      // Sanitize aktenzeichen: Replace / with _ and other dangerous characters
      const originalAktenzeichen = aktenzeichen;
      try {
        aktenzeichen = sanitizeAktenzeichen(aktenzeichen);
        if (originalAktenzeichen !== aktenzeichen) {
          console.log(`🔧 Sanitized aktenzeichen: "${originalAktenzeichen}" → "${aktenzeichen}"`);
        }
      } catch (error) {
        console.error(`❌ Failed to sanitize aktenzeichen "${originalAktenzeichen}":`, error.message);
        return res.status(400).json({
          error: "Invalid aktenzeichen format",
          message: error.message,
          received: originalAktenzeichen
        });
      }

      // Find client by aktenzeichen
      const client = await Client.findOne({ aktenzeichen: aktenzeichen });

      if (!client) {
        return res.status(404).json({
          error: "Client not found",
          aktenzeichen: aktenzeichen,
        });
      }

      console.log(
        `📋 Processing payment confirmation for: ${client.firstName} ${client.lastName}`
      );

      // Ensure client has email address - use from webhook if missing
      if (!client.email && requester_email) {
        console.log(
          `📧 Updating client email from webhook: ${requester_email}`
        );
        client.email = requester_email;
      }

      // Check if payment was already confirmed to prevent duplicate processing
      if (client.first_payment_received && client.payment_processed_at) {
        console.log(
          `⚠️ Payment already confirmed for ${client.aktenzeichen} at ${client.payment_processed_at}`
        );
        return res.json({
          success: true,
          message: "Payment already confirmed",
          client_id: client.id,
          aktenzeichen: client.aktenzeichen,
          already_processed: true,
          processed_at: client.payment_processed_at,
        });
      }

      // Update client status
      client.first_payment_received = true;
      client.current_status = "payment_confirmed";
      client.payment_processed_at = new Date();
      client.updated_at = new Date();

      // === NEW: create main ticket for payment-first clients ===
      if (
        zendeskService.isConfigured() &&
        (!client.documents || client.documents.length === 0)
      ) {
        try {
          const subject = `💰 Zahlung bestätigt – Dokumente benötigt (${client.firstName} ${client.lastName}, ${client.aktenzeichen})`;

          const body = `
    👋 Hallo ${client.firstName} ${client.lastName},
    
    vielen Dank für Ihre Zahlung! 💰  
    Ihre **erste Rate wurde erfolgreich bestätigt.**
    
    Damit wir mit der Bearbeitung Ihres Falls fortfahren können, benötigen wir bitte noch Ihre **Gläubigerdokumente**.
    
    📎 **Dokumente hochladen:**  
    ${
      process.env.FRONTEND_URL || "https://mandanten-portal.onrender.com"
    }/portal?token=${client.portal_token}
    
    📂 **Benötigte Unterlagen:**  
    • 📄 Mahnungen oder Zahlungsaufforderungen  
    • 🧾 Inkasso-Schreiben  
    • ⚖️ Gerichtliche Beschlüsse oder Vollstreckungsbescheide  
    • 📬 Sonstige Schreiben Ihrer Gläubiger
    
    🧠 **Was passiert danach?**  
    Nach dem Upload werden Ihre Dokumente automatisch analysiert.  
    Sie erhalten anschließend **innerhalb weniger Tage** eine Rückmeldung zum weiteren Vorgehen.
    
    📞 **Bei Fragen stehen wir Ihnen selbstverständlich gerne zur Verfügung.**
    
    Mit freundlichen Grüßen  
    👨‍⚖️ Ihr Kanzlei-Team
    `;

          const ticket = await zendeskService.createTicket({
            subject,
            content: body,
            requesterEmail: client.email,
            tags: [
              "payment-first",
              "payment-confirmed",
              "awaiting-documents",
              "main-ticket",
            ],
            priority: "normal",
            type: "task",
          });

          if (ticket.success) {
            console.log(
              `✅ Main payment ticket created for ${client.aktenzeichen}: ${ticket.ticket_id}`
            );
            client.zendesk_tickets = client.zendesk_tickets || [];
            client.zendesk_tickets.push({
              ticket_id: ticket.ticket_id,
              ticket_type: "main_payment_ticket",
              status: "active",
              created_at: new Date(),
            });
            client.status_history.push({
              id: uuidv4(),
              status: "zendesk_main_ticket_created",
              changed_by: "system",
              metadata: {
                zendesk_ticket_id: ticket.ticket_id,
                scenario: "payment-first",
              },
            });
            await client.save({ validateModifiedOnly: true });
          } else {
            console.error(
              "❌ Failed to create payment-first ticket:",
              ticket.error
            );
          }
        } catch (err) {
          console.error(
            "❌ Exception while creating payment-first ticket:",
            err
          );
        }
      }

      // MANUAL CREDITOR EXTRACTION: Go through all documents and extract creditors
      console.log(
        `🔍 MANUAL CREDITOR EXTRACTION: Checking all documents for client ${client.aktenzeichen}`
      );
      const allDocuments = client.documents || [];

      // Ensure all documents have required fields (fix for legacy data)
      allDocuments.forEach((doc, index) => {
        // Ensure document has an ID
        if (!doc.id) {
          doc.id = doc._id?.toString() || uuidv4();
          console.log(
            `⚠️ Generated missing ID for document ${index + 1}: ${doc.id}`
          );
        }

        // Ensure document has a name (required by schema)
        if (!doc.name) {
          doc.name =
            doc.filename ||
            `Document_${index + 1}_${doc.id?.substring(0, 8) || "unknown"}`;
          console.log(
            `⚠️ Generated missing name for document ${index + 1}: ${doc.name}`
          );
        }
      });

      const creditorDocuments = allDocuments.filter(
        (doc) => doc.is_creditor_document === true
      );

      console.log(
        `📊 Found ${creditorDocuments.length} creditor documents out of ${allDocuments.length} total documents`
      );

      const manualExtractedCreditors = [];

      creditorDocuments.forEach((doc, index) => {
        console.log(`📄 Document ${index + 1}: ${doc.name || "Unnamed"}`);
        console.log(`   - Document ID: ${doc.id || "NO ID!"}`);
        console.log(`   - Is Creditor Document: ${doc.is_creditor_document}`);
        console.log(`   - Has extracted_data: ${!!doc.extracted_data}`);
        console.log(
          `   - Has creditor_data: ${!!doc.extracted_data?.creditor_data}`
        );

        if (doc.extracted_data?.creditor_data) {
          const creditorData = doc.extracted_data.creditor_data;
          console.log(`   - Creditor Data:`, creditorData);

          const creditor = {
            id: uuidv4(),
            sender_name: creditorData.sender_name || "Unbekannter Gläubiger",
            sender_address: creditorData.sender_address || "",
            sender_email: creditorData.sender_email || "",
            reference_number: creditorData.reference_number || "",
            claim_amount: creditorData.claim_amount || 0,
            is_representative: creditorData.is_representative || false,
            actual_creditor:
              creditorData.actual_creditor || creditorData.sender_name,
            source_document: doc.name || "Unbekannt",
            source_document_id: doc.id || doc._id || "",
            document_id: doc.id || doc._id || "",
            ai_confidence: doc.extracted_data?.confidence || 0,
            status: "confirmed",
            created_at: new Date(),
            confirmed_at: new Date(),
            extraction_method: "manual_payment_confirmation",
          };

          manualExtractedCreditors.push(creditor);
          console.log(
            `   ✅ Added creditor: ${creditor.sender_name} (${creditor.claim_amount}€)`
          );
        } else {
          console.log(
            `   ❌ No creditor data found in document despite is_creditor_document = true`
          );
        }
      });

      // Update client with manually extracted creditors (with deduplication)
      if (manualExtractedCreditors.length > 0) {
        console.log(`\n🎯 ================================`);
        console.log(`🎯 ZENDESK WEBHOOK: MANUAL CREDITOR EXTRACTION`);
        console.log(`🎯 ================================`);
        console.log(`👤 Client: ${client.aktenzeichen || 'NO_AKTENZEICHEN'}`);
        console.log(`📄 Total documents: ${allDocuments.length}`);
        console.log(`📄 Creditor documents: ${creditorDocuments.length}`);
        console.log(`📊 Extracted creditors: ${manualExtractedCreditors.length}`);
        console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
        
        console.log(`\n📋 ZENDESK WEBHOOK EXTRACTED CREDITORS:`);
        manualExtractedCreditors.forEach((creditor, index) => {
          console.log(`   ${index + 1}. ${creditor.sender_name || 'NO_NAME'} (${creditor.reference_number || 'NO_REF'}) - €${creditor.claim_amount || 0}`);
          console.log(`      - Email: ${creditor.sender_email || 'NO_EMAIL'}`);
          console.log(`      - Address: ${creditor.sender_address || 'NO_ADDRESS'}`);
          console.log(`      - Source: ${creditor.source_document || 'NO_SOURCE'}`);
        });
        
        console.log(`\n🔄 ZENDESK WEBHOOK: STARTING CREDITOR DEDUPLICATION...`);
        
        // Use deduplication utility to handle duplicate creditors
        const creditorDeduplication = require('../utils/creditorDeduplication');
        const deduplicatedCreditors = creditorDeduplication.deduplicateCreditors(
          manualExtractedCreditors, 
          'highest_amount' // Strategy: keep creditor with highest amount for same ref+name
        );
        
        // Merge with existing final_creditor_list if any
        const existingCreditors = client.final_creditor_list || [];
        console.log(`\n📊 ZENDESK WEBHOOK EXISTING CREDITORS: ${existingCreditors.length}`);
        
        const mergedCreditors = creditorDeduplication.mergeCreditorLists(
          existingCreditors, 
          deduplicatedCreditors, 
          'highest_amount'
        );
        
        client.final_creditor_list = mergedCreditors;
        
        console.log(`\n✅ ================================`);
        console.log(`✅ ZENDESK WEBHOOK: FINAL CREDITOR LIST UPDATED`);
        console.log(`✅ ================================`);
        console.log(`👤 Client: ${client.aktenzeichen}`);
        console.log(`📊 Final creditor count: ${mergedCreditors.length}`);
        console.log(`📄 Processed from: ${manualExtractedCreditors.length} extracted`);
        console.log(`🗑️ Duplicates removed: ${manualExtractedCreditors.length - deduplicatedCreditors.length}`);
        console.log(`⏰ Updated at: ${new Date().toISOString()}`);
        
        // Log final creditor list for monitoring
        console.log(`\n📋 ZENDESK WEBHOOK FINAL CREDITOR LIST FOR USER DETAIL VIEW:`);
        mergedCreditors.forEach((creditor, index) => {
          console.log(`   ${index + 1}. ${creditor.sender_name || 'NO_NAME'} (${creditor.reference_number || 'NO_REF'}) - €${creditor.claim_amount || 0}`);
          console.log(`      - Email: ${creditor.sender_email || 'NO_EMAIL'}`);
          console.log(`      - Address: ${creditor.sender_address || 'NO_ADDRESS'}`);
          console.log(`      - Status: ${creditor.status || 'NO_STATUS'}`);
          console.log(`      - Source: ${creditor.source_document || 'NO_SOURCE'}`);
        });
        console.log(`\n`);

        // Add extraction history
        client.status_history.push({
          id: uuidv4(),
          status: "manual_creditor_extraction_completed",
          changed_by: "system",
          metadata: {
            extracted_creditors: manualExtractedCreditors.length,
            final_creditors_after_deduplication: mergedCreditors.length,
            total_documents: allDocuments.length,
            creditor_documents: creditorDocuments.length,
            extraction_method: "manual_payment_confirmation",
            deduplication_strategy: "highest_amount"
          },
          created_at: new Date(),
        });
      } else {
        console.log(
          `⚠️ MANUAL EXTRACTION: No creditors extracted despite ${creditorDocuments.length} creditor documents`
        );
      }

      // Add status history
      client.status_history.push({
        id: uuidv4(),
        status: "payment_confirmed",
        changed_by: "agent",
        zendesk_ticket_id: zendesk_ticket_id,
        metadata: {
          agent_email: agent_email,
          agent_action: "erste_rate_bezahlt checkbox (legacy ticket-based)",
          payment_date: new Date(),
        },
      });

      // Save with validation workaround (need to mark documents as modified since we may have added IDs)
      try {
        client.markModified("documents");
        await client.save({ validateModifiedOnly: true });
      } catch (saveError) {
        console.error(
          "⚠️ Error saving client with full validation, trying without document validation:",
          saveError.message
        );

        // Update using findOneAndUpdate to bypass document validation
        await Client.findOneAndUpdate(
          { _id: client._id },
          {
            $set: {
              first_payment_received: true,
              current_status: "payment_confirmed",
              updated_at: new Date(),
            },
            $push: {
              status_history: {
                id: uuidv4(),
                status: "payment_confirmed",
                changed_by: "agent",
                zendesk_ticket_id: zendesk_ticket_id,
                metadata: {
                  agent_email: agent_email,
                  agent_action: "erste_rate_bezahlt checkbox",
                  payment_date: new Date(),
                },
              },
            },
          },
          { runValidators: false }
        );
      }

      // ANALYZE CURRENT STATE AND DETERMINE SCENARIO
      const documents = client.documents || [];
      const creditors = client.final_creditor_list || [];
      const completedDocs = documents.filter(
        (d) => d.processing_status === "completed"
      );
      const creditorDocs = documents.filter(
        (d) => d.is_creditor_document === true
      );

      const state = {
        hasDocuments: documents.length > 0,
        allProcessed:
          documents.length > 0 && completedDocs.length === documents.length,
        hasCreditors: creditors.length > 0,
        needsManualReview: creditors.some(
          (c) => (c.ai_confidence || c.confidence || 0) < 0.8
        ),
      };

      // DETERMINE TICKET TYPE AND CONTENT BASED ON SCENARIO
      let ticketType, ticketContent, nextAction, tags;

      if (!state.hasDocuments) {
        // SCENARIO 2: No documents uploaded yet - send automatic side conversation reminder
        ticketType = "document_reminder_side_conversation";
        nextAction = "send_side_conversation_reminder";
        client.payment_ticket_type = "document_reminder_side_conversation";

        // Send side conversation reminder instead of creating manual ticket
        try {
          if (!client.document_reminder_sent_via_side_conversation) {
            // If no ticket exists yet, use the current one or create connection
            let ticketIdForSideConversation =
              zendesk_ticket_id || client.zendesk_ticket_id;

            if (!ticketIdForSideConversation) {
              console.log(
                `📋 Creating initial ticket for payment-first client ${client.aktenzeichen}...`
              );

              const ticketResult = await zendeskService.createTicket({
                subject: `Payment confirmed - Document upload needed: ${client.firstName} ${client.lastName} (${client.aktenzeichen})`,
                requester_email: client.email || requester_email,
                tags: [
                  "payment-confirmed",
                  "document-upload-needed",
                  "automated",
                ],
                priority: "normal",
                type: "task",
                comment: {
                  body: `Client has paid but needs to upload documents. Automated reminder will be sent via side conversation.`,
                  public: false,
                },
              });

              if (ticketResult && ticketResult.id) {
                client.zendesk_ticket_id = ticketResult.id;
                client.zendesk_tickets = client.zendesk_tickets || [];
                client.zendesk_tickets.push({
                  ticket_id: ticketResult.id,
                  ticket_type: "payment_first_workflow",
                  ticket_scenario: "document_upload_reminder",
                  status: "open",
                  created_at: new Date(),
                });

                ticketIdForSideConversation = ticketResult.id;
                console.log(
                  `✅ Created initial ticket ${ticketResult.id} for ${client.aktenzeichen}`
                );
              }
            }

            const reminderText = `Hallo ${client.firstName} ${client.lastName},

vielen Dank für Ihre Zahlung! 💰

Um mit der Bearbeitung Ihres Falls fortzufahren, benötigen wir noch Ihre Gläubigerdokumente.

📎 **Bitte laden Sie Ihre Dokumente hoch:**

https://mandanten-portal.onrender.com/login

**Was Sie hochladen sollten:**

- Mahnungen, Forderungsschreiben
- Inkassobriefe
- Gerichtsbeschlüsse
- Vollstreckungsbescheide
- Sonstige Gläubigerdokumente

Nach dem Upload werden Ihre Dokumente analysiert und Sie erhalten innerhalb von 7 Tagen Feedback zur weiteren Bearbeitung.

Bei Fragen stehen wir Ihnen gerne zur Verfügung.

Ihr Team von der Rechtsanwaltskanzlei 

Thomas Scuric`;

            // Now send the side conversation if we have a ticket
            if (ticketIdForSideConversation) {
              const clientEmail = client.email || requester_email;
              if (!clientEmail) {
                throw new Error(
                  `No email address available for client ${client.aktenzeichen}`
                );
              }

              console.log(
                `📧 Creating Side Conversation on ticket ${ticketIdForSideConversation} to send email to ${clientEmail}...`
              );

              const sideConversationResult =
                await zendeskService.createSideConversation(
                  ticketIdForSideConversation,
                  {
                    recipientEmail: clientEmail,
                    recipientName: `${client.firstName} ${client.lastName}`,
                    subject: `Dokumenten-Upload Erinnerung für ${client.firstName} ${client.lastName}`,
                    body: reminderText,
                    internalNote: false,
                  }
                );

              if (
                sideConversationResult &&
                sideConversationResult.success &&
                sideConversationResult.side_conversation_id
              ) {
                client.document_reminder_sent_via_side_conversation = true;
                client.document_reminder_side_conversation_at = new Date();
                client.document_reminder_side_conversation_id =
                  sideConversationResult.side_conversation_id;

                console.log(
                  `✅ Document reminder sent via side conversation ${sideConversationResult.side_conversation_id} for ${client.aktenzeichen}`
                );
              } else {
                console.error(
                  `❌ Failed to create side conversation for ${client.aktenzeichen}`,
                  sideConversationResult
                );
                throw new Error("Side conversation creation failed");
              }
            } else {
              console.error(
                `❌ No Zendesk ticket ID available for ${client.aktenzeichen}`
              );
              throw new Error(
                "No Zendesk ticket available for side conversation"
              );
            }
          }
        } catch (sideConversationError) {
          console.error(
            "❌ Error sending side conversation reminder:",
            sideConversationError
          );

          // Try to schedule automatic reminder via DocumentReminderService instead
          console.log(
            `🔄 Scheduling automatic reminder for ${client.aktenzeichen} via DocumentReminderService...`
          );

          // Mark for automatic reminders - the DocumentReminderService will pick this up
          client.payment_ticket_type = "document_request";
          client.document_request_sent_at = new Date();

          // Do NOT create manual ticket - let automated system handle it
          ticketType = "automated_reminder_scheduled";
          nextAction = "automated_reminder_system_will_handle";

          console.log(
            `✅ Client ${client.aktenzeichen} marked for automated reminder system`
          );
        }

        client.document_request_sent_at = new Date();
      } else if (!state.allProcessed) {
        // SCENARIO 3: Documents uploaded but still processing
        ticketType = "processing_wait";
        ticketContent = generateProcessingWaitTicket(
          client,
          documents,
          completedDocs
        );
        nextAction = "wait_for_processing_complete";
        tags = ["payment-confirmed", "processing-wait", "ai-processing"];

        client.payment_ticket_type = "processing_wait";
      } else if (!state.hasCreditors) {
        // SCENARIO: Documents processed but no creditors found
        ticketType = "no_creditors_found";
        ticketContent = generateNoCreditorsTicket(client, documents);
        nextAction = "manual_document_check";
        tags = ["payment-confirmed", "no-creditors", "manual-check-needed"];

        client.payment_ticket_type = "no_creditors_found";
      } else {
        // SCENARIO 1: Documents processed, creditors found - ready for review
        if (state.needsManualReview) {
          ticketType = "manual_review";
          ticketContent = generateCreditorReviewTicketContent(
            client,
            documents,
            creditors,
            true
          );
          nextAction = "start_manual_review";
          tags = [
            "payment-confirmed",
            "manual-review-needed",
            "creditors-found",
          ];
          client.payment_ticket_type = "manual_review";
        } else {
          ticketType = "auto_approved";
          ticketContent = generateCreditorReviewTicketContent(
            client,
            documents,
            creditors,
            false
          );
          nextAction = "send_confirmation_to_client";
          tags = [
            "payment-confirmed",
            "auto-approved",
            "ready-for-confirmation",
          ];
          client.payment_ticket_type = "auto_approved";
        }
      }

      // Update client with payment processing info
      client.payment_processed_at = new Date();

      // Save client with error handling for document validation issues
      try {
        await client.save({ validateModifiedOnly: true });
      } catch (saveError) {
        console.error(
          "⚠️ Error saving client with payment_processed_at (line 604), using direct update:",
          saveError.message
        );

        // Use direct update to bypass validation
        await Client.findOneAndUpdate(
          { _id: client._id },
          {
            $set: {
              payment_processed_at: new Date(),
              payment_ticket_type: client.payment_ticket_type,
            },
          },
          { runValidators: false }
        );
      }

      // CONDITIONALLY CREATE ZENDESK TICKET (not for document reminder scenarios)
      let zendeskTicket = null;
      let ticketCreationError = null;

      // Skip automatic ticket creation for automated reminder scenarios
      const skipTicketCreation =
        ticketType === "document_reminder_side_conversation" ||
        ticketType === "automated_reminder_scheduled";

      if (zendeskService.isConfigured() && !skipTicketCreation) {
        try {
          console.log(
            `🎫 Creating automatic Zendesk ticket for scenario: ${ticketType}...`
          );

          zendeskTicket = await zendeskService.createTicket({
            subject: generateTicketSubject(client, ticketType),
            content: ticketContent,
            requesterEmail: client.email,
            tags: tags,
            priority: ticketType === "manual_review" ? "normal" : "low",
            type: "task",
          });

          if (zendeskTicket.success) {
            // Store the created ticket ID for reference
            client.zendesk_tickets = client.zendesk_tickets || [];
            client.zendesk_tickets.push({
              ticket_id: zendeskTicket.ticket_id,
              ticket_type: "payment_review",
              ticket_scenario: ticketType,
              status: "active",
              created_at: new Date(),
            });

            // Add to status history
            client.status_history.push({
              id: uuidv4(),
              status: "zendesk_ticket_created",
              changed_by: "system",
              metadata: {
                zendesk_ticket_id: zendeskTicket.ticket_id,
                ticket_scenario: ticketType,
                ticket_subject: generateTicketSubject(client, ticketType),
              },
            });

            // Save using update to avoid validation issues with legacy documents
            try {
              await client.save({ validateModifiedOnly: true });
            } catch (saveError) {
              console.error(
                "⚠️ Error saving after ticket creation, using direct update:",
                saveError.message
              );

              // Use direct update to bypass validation
              await Client.findOneAndUpdate(
                { _id: client._id },
                {
                  $push: {
                    zendesk_tickets: {
                      ticket_id: zendeskTicket.ticket_id,
                      ticket_type: "payment_review",
                      ticket_scenario: ticketType,
                      status: "active",
                      created_at: new Date(),
                    },
                    status_history: {
                      id: uuidv4(),
                      status: "zendesk_ticket_created",
                      changed_by: "system",
                      metadata: {
                        zendesk_ticket_id: zendeskTicket.ticket_id,
                        ticket_scenario: ticketType,
                        ticket_subject: generateTicketSubject(
                          client,
                          ticketType
                        ),
                      },
                    },
                  },
                },
                { runValidators: false }
              );
            }

            console.log(
              `✅ Zendesk ticket created: ${zendeskTicket.ticket_id}`
            );

            // Only manual actions for non-document scenarios
            if (
              ticketType === "manual_review" ||
              ticketType === "no_creditors_found"
            ) {
              console.log(
                `ℹ️ ${ticketType} payment confirmed for ${client.aktenzeichen} - agent review required`
              );
            }

            // MARK AS READY FOR AGENT REVIEW (even for auto-approved scenarios)
            if (ticketType === "auto_approved" && creditors.length > 0) {
              try {
                console.log(
                  `✅ Auto-approved client ${client.aktenzeichen} - Ready for agent confirmation...`
                );

                // Set status to creditor review (agent must review creditors)
                client.current_status = "creditor_review";
                client.updated_at = new Date();

                client.status_history.push({
                  id: uuidv4(),
                  status: "creditor_review",
                  changed_by: "system",
                  metadata: {
                    payment_confirmed: true,
                    auto_approved_eligible: true,
                    reason: "High AI confidence scores - awaiting agent review",
                    total_creditors: creditors.length,
                    requires_agent_confirmation: true,
                  },
                });

                // Save with error handling
                try {
                  await client.save({ validateModifiedOnly: true });
                } catch (saveError) {
                  console.error(
                    "⚠️ Error saving client status update, using direct update:",
                    saveError.message
                  );
                  await Client.findOneAndUpdate(
                    { _id: client._id },
                    {
                      $set: {
                        current_status: "creditor_review",
                        updated_at: new Date(),
                      },
                      $push: {
                        status_history: {
                          id: uuidv4(),
                          status: "creditor_review",
                          changed_by: "system",
                          metadata: {
                            payment_confirmed: true,
                            auto_approved_eligible: true,
                            reason:
                              "High AI confidence scores - awaiting agent review",
                            total_creditors: creditors.length,
                            requires_agent_confirmation: true,
                          },
                        },
                      },
                    },
                    { runValidators: false }
                  );
                }

                // NO CLIENT NOTIFICATION - Agent must confirm first
                console.log(
                  `ℹ️ Auto-approved creditors ready - waiting for agent confirmation before client notification`
                );
              } catch (error) {
                console.error(
                  `❌ Error updating auto-approved status for ${client.aktenzeichen}:`,
                  error.message
                );
              }
            }
          } else {
            ticketCreationError = zendeskTicket.error;
            console.error(
              "❌ Failed to create Zendesk ticket:",
              zendeskTicket.error
            );
          }
        } catch (error) {
          ticketCreationError = error.message;
          console.error("❌ Exception creating Zendesk ticket:", error);
        }
      } else {
        console.log(
          "⚠️ Zendesk service not configured - skipping automatic ticket creation"
        );
        ticketCreationError = "Zendesk API not configured";
      }

      console.log(
        `✅ Payment confirmed for ${client.aktenzeichen}. Scenario: ${ticketType}, Documents: ${documents.length}, Creditors: ${creditors.length}`
      );

      res.json({
        success: true,
        message: `Payment confirmation processed - ${ticketType} scenario`,
        scenario: ticketType,
        client_status: "payment_confirmed",
        state: state,
        ticket_data: {
          subject: generateTicketSubject(client, ticketType),
          content: ticketContent,
          tags: tags,
          priority: ticketType === "manual_review" ? "normal" : "low",
        },
        zendesk_ticket: zendeskTicket
          ? {
              created: zendeskTicket.success,
              ticket_id: zendeskTicket.ticket_id,
              scenario: ticketType,
              error: ticketCreationError,
            }
          : {
              created: false,
              error: ticketCreationError,
            },
        review_dashboard_url:
          ticketType === "manual_review"
            ? `${
                process.env.FRONTEND_URL ||
                "https://mandanten-portal.onrender.com"
              }/agent/review/${client.id}`
            : null,
        next_action: nextAction,
        documents_count: documents.length,
        creditor_documents_count: creditorDocs.length,
        extracted_creditors_count: creditors.length,
        processing_complete: state.allProcessed,
      });
    } catch (error) {
      console.error("❌ Error in payment-confirmed webhook:", error);
      res.status(500).json({
        error: "Failed to process payment confirmation",
        details: error.message,
      });
    }
  }
);

// Zendesk Webhook: Start Manual Review (Phase 2)
// Triggered when agent clicks "Manuelle Prüfung starten" button
router.post("/start-manual-review", rateLimits.general, async (req, res) => {
  try {
    console.log("🔍 Zendesk Webhook: Start-Manual-Review received", req.body);

    let { aktenzeichen, zendesk_ticket_id, agent_email } = req.body;

    if (!aktenzeichen) {
      return res.status(400).json({
        error: "Missing required field: aktenzeichen",
      });
    }

    // Sanitize aktenzeichen
    aktenzeichen = sanitizeAktenzeichenFromPayload(aktenzeichen, res);
    if (!aktenzeichen) return;

    const client = await Client.findOne({ aktenzeichen: aktenzeichen });

    if (!client) {
      return res.status(404).json({
        error: "Client not found",
        aktenzeichen: aktenzeichen,
      });
    }

    // Update client status to indicate review in progress
    client.current_status = "under_manual_review";
    client.updated_at = new Date();

    // Add status history
    client.status_history.push({
      id: uuidv4(),
      status: "under_manual_review",
      changed_by: "agent",
      zendesk_ticket_id: zendesk_ticket_id,
      metadata: {
        agent_email: agent_email,
        agent_action: "Started manual creditor review",
        review_started_at: new Date(),
      },
    });

    await client.save();

    const reviewUrl = `${
      process.env.FRONTEND_URL || "https://mandanten-portal.onrender.com"
    }/agent/review/${client.id}`;

    console.log(`✅ Manual review started for ${client.aktenzeichen}`);

    res.json({
      success: true,
      message: "Manual review session started",
      client_status: "under_manual_review",
      review_dashboard_url: reviewUrl,
      documents_to_review: (client.documents || []).filter(
        (d) => d.is_creditor_document
      ).length,
      creditors_need_review: (client.final_creditor_list || []).filter(
        (c) => (c.ai_confidence || c.confidence || 0) < 0.8
      ).length,
      next_step:
        "Agent should open review dashboard and correct AI extractions",
    });
  } catch (error) {
    console.error("❌ Error in start-manual-review webhook:", error);
    res.status(500).json({
      error: "Failed to start manual review",
      details: error.message,
    });
  }
});

// Zendesk Webhook: Manual Review Complete (Phase 2)
// Triggered when agent completes manual review and clicks "Review abgeschlossen"
router.post("/manual-review-complete", rateLimits.general, async (req, res) => {
  try {
    console.log(
      "✅ Zendesk Webhook: Manual-Review-Complete received",
      req.body
    );

    let { aktenzeichen, zendesk_ticket_id, agent_email } = req.body;

    if (!aktenzeichen) {
      return res.status(400).json({
        error: "Missing required field: aktenzeichen",
      });
    }

    // Sanitize aktenzeichen
    aktenzeichen = sanitizeAktenzeichenFromPayload(aktenzeichen, res);
    if (!aktenzeichen) return;

    const client = await Client.findOne({ aktenzeichen: aktenzeichen });

    if (!client) {
      return res.status(404).json({
        error: "Client not found",
        aktenzeichen: aktenzeichen,
      });
    }

    // Update client status
    client.current_status = "manual_review_complete";
    client.updated_at = new Date();

    // Add status history
    client.status_history.push({
      id: uuidv4(),
      status: "manual_review_complete",
      changed_by: "agent",
      zendesk_ticket_id: zendesk_ticket_id,
      metadata: {
        agent_email: agent_email,
        agent_action: "Completed manual creditor review",
        review_completed_at: new Date(),
      },
    });

    await client.save();

    // Generate final creditor summary for Zendesk ticket update
    const creditors = client.final_creditor_list || [];
    const totalDebt = creditors.reduce(
      (sum, c) => sum + (c.claim_amount || 0),
      0
    );

    const finalCreditorsList = creditors
      .map(
        (c) =>
          `✅ ${c.sender_name || "Unbekannt"} - ${c.claim_amount || "N/A"}€`
      )
      .join("\n");

    const finalTicketContent = `✅ REVIEW ABGESCHLOSSEN

📊 FINALE GLÄUBIGER-LISTE:
${finalCreditorsList}

💰 FINALE GESAMTSCHULD: ${totalDebt.toFixed(2)}€

🚀 BEREIT FÜR KUNDEN-BESTÄTIGUNG
[BUTTON: Gläubigerliste zur Bestätigung senden]
🔗 Portal-Link: ${
      process.env.FRONTEND_URL || "https://mandanten-portal.onrender.com"
    }/portal?token=${client.portal_token}

📁 Mandant: ${client.firstName} ${client.lastName} (${client.aktenzeichen})`;

    console.log(`✅ Manual review completed for ${client.aktenzeichen}`);

    res.json({
      success: true,
      message: "Manual review completed successfully",
      client_status: "manual_review_complete",
      creditors_count: creditors.length,
      total_debt: totalDebt,
      final_ticket_content: finalTicketContent,
      next_step: "Ready to send creditor confirmation request to client",
    });
  } catch (error) {
    console.error("❌ Error in manual-review-complete webhook:", error);
    res.status(500).json({
      error: "Failed to complete manual review",
      details: error.message,
    });
  }
});

// NEW: Processing Complete Webhook
// Triggered when AI processing finishes for a client who paid first rate
router.post("/processing-complete", rateLimits.general, async (req, res) => {
  try {
    console.log("🔄 Zendesk Webhook: Processing-Complete received", req.body);
    console.log(
      "🎯 PAYMENT-FIRST FLOW: Processing complete webhook triggered for payment-first client"
    );

    const { client_id, document_id } = req.body;

    if (!client_id) {
      return res.status(400).json({
        error: "Missing required field: client_id",
      });
    }

    // Find client directly
    const client = await Client.findOne({ id: client_id });

    if (!client) {
      console.log(
        "❌ PAYMENT-FIRST FLOW: Client not found for processing-complete webhook"
      );
      return res.status(404).json({
        error: "Client not found",
        client_id: client_id,
      });
    }

    console.log(
      `📋 PAYMENT-FIRST FLOW: Found client ${client.firstName} ${client.lastName} (${client.aktenzeichen})`
    );
    console.log(
      `💰 Payment status: first_payment_received=${client.first_payment_received}, payment_ticket_type=${client.payment_ticket_type}`
    );

    // Check if this client paid first rate and is waiting for processing
    // For payment-first clients, we need to handle them even if payment_ticket_type is not 'processing_wait'
    const isPaymentFirstClient =
      client.first_payment_received &&
      (client.payment_ticket_type === "processing_wait" ||
        client.payment_ticket_type === "document_reminder_side_conversation" ||
        client.payment_ticket_type === "automated_reminder_scheduled" ||
        client.payment_ticket_type === "document_request" ||
        !client.payment_ticket_type);

    if (!isPaymentFirstClient) {
      return res.json({
        success: true,
        message: "Processing complete but client not in waiting state",
        client_status: client.current_status,
        payment_ticket_type: client.payment_ticket_type,
      });
    }

    // Check if all documents are now processed
    const documents = client.documents || [];
    const completedDocs = documents.filter(
      (d) => d.processing_status === "completed"
    );

    if (completedDocs.length < documents.length) {
      console.log(
        `Still processing: ${
          documents.length - completedDocs.length
        } documents remaining`
      );
      return res.json({
        success: true,
        message: "Still processing remaining documents",
        progress: `${completedDocs.length}/${documents.length}`,
      });
    }

    // All documents processed - analyze and create review ticket
    const creditors = client.final_creditor_list || [];
    // Check if documents need manual review based on Claude AI confidence
    const lowConfidenceDocuments = documents.filter(
      (d) => d.extracted_data?.confidence && d.extracted_data.confidence < 0.8
    );
    const manualReviewRequired = documents.some(
      (d) =>
        d.extracted_data?.manual_review_required === true ||
        (d.extracted_data?.confidence && d.extracted_data.confidence < 0.8)
    );

    const state = {
      hasCreditors: creditors.length > 0,
      needsManualReview: manualReviewRequired,
      lowConfidenceCount: lowConfidenceDocuments.length,
    };

    let ticketType, ticketContent, tags;

    if (!state.hasCreditors) {
      ticketType = "no_creditors_found";
      ticketContent = generateNoCreditorsTicket(client, documents);
      tags = ["processing-complete", "no-creditors", "manual-check-needed"];
      client.payment_ticket_type = "no_creditors_found";
    } else if (state.needsManualReview) {
      ticketType = "manual_review";
      ticketContent = generateCreditorReviewTicketContent(
        client,
        documents,
        creditors,
        true
      );
      tags = ["processing-complete", "manual-review-needed", "creditors-found"];
      client.payment_ticket_type = "manual_review";
    } else {
      ticketType = "auto_approved";
      ticketContent = generateCreditorReviewTicketContent(
        client,
        documents,
        creditors,
        false
      );
      tags = ["processing-complete", "auto-approved", "ready-for-confirmation"];
      client.payment_ticket_type = "auto_approved";
    }

    // Mark all documents processed timestamp
    client.all_documents_processed_at = new Date();

    // Add status history
    client.status_history.push({
      id: uuidv4(),
      status: "processing_complete",
      changed_by: "system",
      metadata: {
        documents_processed: documents.length,
        creditors_found: creditors.length,
        processing_duration_ms:
          Date.now() - new Date(client.payment_processed_at).getTime(),
        final_ticket_type: ticketType,
      },
    });

    // Preserve settlement fields before saving to prevent race conditions
    const preserveSettlementFields = {};
    if (
      client.creditor_calculation_table &&
      client.creditor_calculation_table.length > 0
    ) {
      preserveSettlementFields.creditor_calculation_table =
        client.creditor_calculation_table;
      preserveSettlementFields.creditor_calculation_total_debt =
        client.creditor_calculation_total_debt;
      preserveSettlementFields.creditor_calculation_created_at =
        client.creditor_calculation_created_at;
      preserveSettlementFields.calculated_settlement_plan =
        client.calculated_settlement_plan;

      // Also preserve settlement Side Conversation IDs
      client.final_creditor_list.forEach((creditor) => {
        if (
          creditor.settlement_side_conversation_id ||
          creditor.settlement_plan_sent_at
        ) {
          console.log(
            `🔧 Preserving settlement fields for ${creditor.sender_name}: side_conversation_id=${creditor.settlement_side_conversation_id}, sent_at=${creditor.settlement_plan_sent_at}`
          );
        }
      });
    }

    // ✅ Fix missing document fields before saving (prevent validation crash)
    (client.documents || []).forEach((doc, index) => {
      if (!doc.id) {
        doc.id = doc._id?.toString() || uuidv4();
        console.log(`⚙️ Added missing id for document ${index + 1}: ${doc.id}`);
      }
      if (!doc.name) {
        doc.name =
          doc.filename || `Document_${index + 1}_${doc.id.substring(0, 6)}`;
        console.log(
          `⚙️ Added missing name for document ${index + 1}: ${doc.name}`
        );
      }
    });
    client.markModified("documents");

    // 🩹 Safe save wrapper to bypass Mongoose validation if needed
    try {
      await client.save({ validateModifiedOnly: true });
      console.log(
        `✅ Processing complete webhook saved client ${client.aktenzeichen} with preserved settlement fields`
      );
    } catch (err) {
      console.warn(
        "⚠️ Validation failed on client.save(), retrying without validators..."
      );
      await Client.findOneAndUpdate(
        { _id: client._id },
        { $set: { documents: client.documents } },
        { runValidators: false }
      );
      console.log(
        `✅ Fallback save succeeded for client ${client.aktenzeichen}`
      );
    }

    console.log(
      `✅ Processing complete webhook saved client ${client.aktenzeichen} with preserved settlement fields`
    );

    // CREATE NEW SEPARATE TICKET FOR CREDITOR REVIEW (like existing flow)
    let zendeskTicket = null;
    let ticketCreationError = null;

    if (zendeskService.isConfigured()) {
      try {
        console.log(
          `🎫 PAYMENT-FIRST FLOW: Creating NEW separate Zendesk ticket for creditor review...`
        );
        console.log(
          `📝 PAYMENT-FIRST FLOW: Ticket type: ${ticketType}, Subject: ${generateTicketSubject(
            client,
            ticketType
          )}`
        );

        zendeskTicket = await zendeskService.createTicket({
          subject: generateTicketSubject(client, ticketType),
          content: ticketContent,
          requesterEmail: client.email,
          tags: tags,
          priority: ticketType === "manual_review" ? "normal" : "low",
          type: "task",
        });

        if (zendeskTicket.success) {
          console.log(
            `✅ PAYMENT-FIRST FLOW: NEW ticket created successfully: ${zendeskTicket.ticket_id}`
          );

          // Store the created ticket ID for reference
          client.zendesk_tickets = client.zendesk_tickets || [];
          client.zendesk_tickets.push({
            ticket_id: zendeskTicket.ticket_id,
            ticket_type: "creditor_review",
            ticket_scenario: ticketType,
            status: "active",
            created_at: new Date(),
          });

          // Add to status history
          client.status_history.push({
            id: uuidv4(),
            status: "creditor_review_ticket_created",
            changed_by: "system",
            metadata: {
              zendesk_ticket_id: zendeskTicket.ticket_id,
              ticket_scenario: ticketType,
              ticket_subject: generateTicketSubject(client, ticketType),
              payment_first_flow: true,
            },
          });

          // Save client with new ticket info
          try {
            await client.save({ validateModifiedOnly: true });
            console.log(
              `✅ PAYMENT-FIRST FLOW: Client saved with new ticket ${zendeskTicket.ticket_id}`
            );
          } catch (saveError) {
            console.error(
              "⚠️ Error saving client with new ticket, using direct update:",
              saveError.message
            );
            await Client.findOneAndUpdate(
              { _id: client._id },
              {
                $push: {
                  zendesk_tickets: {
                    ticket_id: zendeskTicket.ticket_id,
                    ticket_type: "creditor_review",
                    ticket_scenario: ticketType,
                    status: "active",
                    created_at: new Date(),
                  },
                  status_history: {
                    id: uuidv4(),
                    status: "creditor_review_ticket_created",
                    changed_by: "system",
                    metadata: {
                      zendesk_ticket_id: zendeskTicket.ticket_id,
                      ticket_scenario: ticketType,
                      ticket_subject: generateTicketSubject(client, ticketType),
                      payment_first_flow: true,
                    },
                  },
                },
              },
              { runValidators: false }
            );
          }

          console.log(
            `🎯 PAYMENT-FIRST FLOW: SUCCESS - NEW separate creditor review ticket created: ${zendeskTicket.ticket_id}`
          );
        } else {
          ticketCreationError = zendeskTicket.error;
          console.error(
            "❌ PAYMENT-FIRST FLOW: Failed to create new ticket:",
            zendeskTicket.error
          );
        }
      } catch (error) {
        ticketCreationError = error.message;
        console.error(
          "❌ PAYMENT-FIRST FLOW: Exception creating new ticket:",
          error
        );
      }
    } else {
      console.log(
        "⚠️ PAYMENT-FIRST FLOW: Zendesk service not configured - skipping new ticket creation"
      );
      ticketCreationError = "Zendesk API not configured";
    }

    console.log(
      `✅ Processing complete for ${client.aktenzeichen}. Ticket type: ${ticketType}`
    );

    res.json({
      success: true,
      message: "Processing complete - NEW creditor review ticket created",
      scenario: ticketType,
      client_status: client.current_status,
      ticket_data: {
        subject: generateTicketSubject(client, ticketType),
        content: ticketContent,
        tags: tags,
        priority: ticketType === "manual_review" ? "normal" : "low",
      },
      zendesk_ticket: zendeskTicket
        ? {
            created: zendeskTicket.success,
            ticket_id: zendeskTicket.ticket_id,
            scenario: ticketType,
            error: ticketCreationError,
          }
        : {
            created: false,
            error: ticketCreationError,
          },
      review_dashboard_url:
        ticketType === "manual_review"
          ? `${
              process.env.FRONTEND_URL ||
              "https://mandanten-portal.onrender.com"
            }/agent/review/${client.id}`
          : null,
      processing_duration_seconds: Math.round(
        (Date.now() - new Date(client.payment_processed_at).getTime()) / 1000
      ),
      documents_processed: documents.length,
      creditors_found: creditors.length,
    });
  } catch (error) {
    console.error("❌ Error in processing-complete webhook:", error);
    res.status(500).json({
      error: "Failed to process completion webhook",
      details: error.message,
    });
  }
});

// Zendesk Webhook: Creditor Confirmation Request
// Triggered when agent uses "Gläubigerliste zur Bestätigung" macro
router.post(
  "/creditor-confirmation-request",
  rateLimits.general,
  async (req, res) => {
    try {
      console.log(
        "📋 Zendesk Webhook: Creditor-Confirmation-Request received",
        req.body
      );

      let { aktenzeichen, zendesk_ticket_id, agent_email } = req.body;

      if (!aktenzeichen) {
        return res.status(400).json({
          error: "Missing required field: aktenzeichen",
        });
      }

      // Sanitize aktenzeichen
      aktenzeichen = sanitizeAktenzeichenFromPayload(aktenzeichen, res);
      if (!aktenzeichen) return;

      const client = await Client.findOne({ aktenzeichen: aktenzeichen });

      if (!client) {
        return res.status(404).json({
          error: "Client not found",
          aktenzeichen: aktenzeichen,
        });
      }

      // Update client status
      client.current_status = "awaiting_client_confirmation";
      client.updated_at = new Date();

      // Add status history
      client.status_history.push({
        id: uuidv4(),
        status: "awaiting_client_confirmation",
        changed_by: "agent",
        zendesk_ticket_id: zendesk_ticket_id,
        metadata: {
          agent_email: agent_email,
          agent_action: "Gläubigerliste zur Bestätigung macro",
          creditors_count: client.final_creditor_list?.length || 0,
        },
      });

      await client.save();

      // Add Zendesk comment with agent review link
      if (zendeskService.isConfigured() && zendesk_ticket_id) {
        try {
          const agentReviewUrl = `${
            process.env.FRONTEND_URL || "https://mandanten-portal.onrender.com"
          }/agent/review/${client.id}`;
          const creditorsList =
            client.final_creditor_list
              ?.map(
                (c) =>
                  `• ${c.sender_name || "Unbekannt"} - €${
                    c.claim_amount || "N/A"
                  } (${Math.round(
                    (c.ai_confidence || c.confidence || 0) * 100
                  )}% confidence)`
              )
              .join("\n") || "Keine Gläubiger gefunden";

          const confirmationComment = `**📋 GLÄUBIGER-BESTÄTIGUNG ANGEFORDERT**

👤 **Client:** ${client.firstName} ${client.lastName} (${client.aktenzeichen})
📧 **Agent:** ${agent_email || "System"}
⏰ **Angefordert:** ${new Date().toLocaleString("de-DE")}

📊 **GLÄUBIGER-LISTE (${client.final_creditor_list?.length || 0}):**
${creditorsList}

🔧 **AGENT-OPTIONEN:**
→ **[AGENT REVIEW]** ${agentReviewUrl}
  • Gläubiger bearbeiten/korrigieren
  • Zusätzliche Gläubiger hinzufügen  
  • Gläubiger entfernen/ablehnen

🏛️ **CLIENT-PORTAL:**
→ **[CLIENT BESTÄTIGUNG]** ${
            process.env.FRONTEND_URL || "https://mandanten-portal.onrender.com"
          }/portal?token=${client.portal_token}

📋 **STATUS:** Wartet auf Mandanten-Bestätigung
✅ **Nächste Schritte:** Mandant erhält E-Mail mit Bestätigungslink`;

          await zendeskService.addInternalComment(zendesk_ticket_id, {
            content: confirmationComment,
          });

          console.log(
            `✅ Added creditor confirmation comment to ticket ${zendesk_ticket_id}`
          );
        } catch (error) {
          console.error(
            `❌ Failed to add creditor confirmation comment:`,
            error.message
          );
        }
      }

      console.log(
        `✅ Creditor confirmation request processed for ${client.aktenzeichen}`
      );

      res.json({
        success: true,
        message: "Creditor confirmation request processed",
        client_status: "awaiting_client_confirmation",
        portal_url: `${
          process.env.FRONTEND_URL || "https://mandanten-portal.onrender.com"
        }/portal?token=${client.portal_token}`,
        agent_review_url: `${
          process.env.FRONTEND_URL || "https://mandanten-portal.onrender.com"
        }/agent/review/${client.id}`,
        creditors_count: client.final_creditor_list?.length || 0,
        next_step:
          "Client will receive confirmation email with portal link. Agent can also review/modify creditors via agent_review_url.",
      });
    } catch (error) {
      console.error(
        "❌ Error in creditor-confirmation-request webhook:",
        error
      );
      res.status(500).json({
        error: "Failed to process creditor confirmation request",
        details: error.message,
      });
    }
  }
);

// Zendesk Webhook: Client Creditor Confirmation
// Triggered when client confirms creditors in the portal
router.post(
  "/client-creditor-confirmed",
  rateLimits.general,
  async (req, res) => {
    try {
      console.log(
        "✅ Zendesk Webhook: Client-Creditor-Confirmed received",
        req.body
      );

      let { aktenzeichen, confirmed_at, creditors_confirmed } = req.body;

      if (!aktenzeichen) {
        return res.status(400).json({
          error: "Missing required field: aktenzeichen",
        });
      }

      // Sanitize aktenzeichen
      aktenzeichen = sanitizeAktenzeichenFromPayload(aktenzeichen, res);
      if (!aktenzeichen) return;

      const client = await Client.findOne({ aktenzeichen: aktenzeichen });

      if (!client) {
        return res.status(404).json({
          error: "Client not found",
          aktenzeichen: aktenzeichen,
        });
      }

      // Check if agent/admin has already approved
      if (!client.admin_approved) {
        return res.status(400).json({
          error: "Admin approval required before client confirmation",
          message: "Creditors must be reviewed and approved by agent first",
        });
      }

      // Update client confirmation status
      client.client_confirmed_creditors = true;
      client.client_confirmed_at = confirmed_at || new Date();
      client.updated_at = new Date();

      // Add status history
      client.status_history.push({
        id: uuidv4(),
        status: "client_creditors_confirmed",
        changed_by: "client",
        metadata: {
          confirmed_at: confirmed_at || new Date(),
          creditors_count:
            creditors_confirmed || client.final_creditor_list?.length || 0,
          admin_approved: client.admin_approved,
          admin_approved_at: client.admin_approved_at,
        },
      });

      await client.save();

      // NOW TRIGGER CREDITOR CONTACT AUTOMATICALLY
      let creditorContactResult = null;
      let creditorContactError = null;

      const creditors = client.final_creditor_list || [];

      if (creditors.length > 0) {
        try {
          console.log(
            `🚀 Auto-triggering creditor contact after client confirmation for ${client.aktenzeichen}...`
          );

          console.log("📝 Attempting to instantiate CreditorContactService...");
          const creditorService = new CreditorContactService();
          console.log("✅ CreditorContactService instantiated successfully");

          console.log("📞 Calling processClientCreditorConfirmation...");
          creditorContactResult =
            await creditorService.processClientCreditorConfirmation(
              client.aktenzeichen
            );
          console.log(
            "✅ processClientCreditorConfirmation completed:",
            creditorContactResult
          );

          console.log(
            `✅ Creditor contact process started: Main ticket ID ${creditorContactResult.main_ticket_id}, ${creditorContactResult.emails_sent}/${creditors.length} emails sent`
          );

          // AUTO-START SIDE CONVERSATION MONITORING
          try {
            console.log(
              `🔄 Auto-starting Side Conversation monitoring for client ${client.aktenzeichen}...`
            );

            // Pass the same creditor service instance to monitor so it can access the contact data
            sideConversationMonitor.creditorContactService = creditorService;

            // Small delay to ensure all side conversations are fully created
            await new Promise((resolve) => setTimeout(resolve, 2000));

            const monitorResult =
              sideConversationMonitor.startMonitoringForClient(
                client.aktenzeichen,
                1
              );

            if (monitorResult.success) {
              console.log(
                `✅ Started monitoring ${monitorResult.side_conversations_count} Side Conversations for ${client.aktenzeichen}`
              );
            } else {
              console.log(
                `⚠️ Failed to start monitoring for ${client.aktenzeichen}: ${monitorResult.message}`
              );
            }
          } catch (error) {
            console.error(
              `❌ Error auto-starting monitoring for ${client.aktenzeichen}:`,
              error.message
            );
          }

          // Update client status to indicate creditor contact has started
          client.current_status = "creditor_contact_initiated";
          client.creditor_contact_started = true;
          client.creditor_contact_started_at = new Date();
          client.updated_at = new Date();

          client.status_history.push({
            id: uuidv4(),
            status: "creditor_contact_initiated",
            changed_by: "system",
            metadata: {
              triggered_by: "client_confirmation",
              main_ticket_id: creditorContactResult.main_ticket_id,
              emails_sent: creditorContactResult.emails_sent,
              total_creditors: creditors.length,
              side_conversations_created:
                creditorContactResult.side_conversation_results?.length || 0,
            },
          });

          await client.save();
        } catch (error) {
          console.error(
            `❌ Failed to auto-trigger creditor contact for ${client.aktenzeichen}:`,
            error.message
          );
          creditorContactError = error.message;

          // Still update status but mark as error
          client.current_status = "creditor_contact_failed";
          client.status_history.push({
            id: uuidv4(),
            status: "creditor_contact_failed",
            changed_by: "system",
            metadata: {
              error_message: error.message,
              requires_manual_action: true,
            },
          });

          await client.save();
        }
      }

      // Add Zendesk comment about client confirmation
      const zendeskService = new ZendeskService();
      const originalTicket = client.zendesk_tickets?.find(
        (t) => t.ticket_type === "main_ticket" || t.status === "active"
      );
      const zendesk_ticket_id =
        originalTicket?.ticket_id || client.zendesk_ticket_id;

      if (zendeskService.isConfigured() && zendesk_ticket_id) {
        try {
          const totalDebt = creditors.reduce(
            (sum, c) => sum + (c.claim_amount || 0),
            0
          );

          let confirmationComment = `**✅ CLIENT HAT GLÄUBIGER BESTÄTIGT**

👤 **Mandant:** ${client.firstName} ${client.lastName} (${client.aktenzeichen})
⏰ **Bestätigt:** ${new Date(client.client_confirmed_at).toLocaleString(
            "de-DE"
          )}
📊 **Gläubiger:** ${creditors.length}
💰 **Gesamtschuld:** €${totalDebt.toFixed(2)}

✅ **Admin-Prüfung:** ${
            client.admin_approved_at
              ? new Date(client.admin_approved_at).toLocaleString("de-DE")
              : "Nicht verfügbar"
          }
✅ **Client-Bestätigung:** ${new Date(
            client.client_confirmed_at
          ).toLocaleString("de-DE")}`;

          if (creditorContactResult) {
            confirmationComment += `

🚀 **GLÄUBIGER-KONTAKT GESTARTET**
• Main Ticket ID: ${creditorContactResult.main_ticket_id}
• E-Mails versendet: ${creditorContactResult.emails_sent}/${creditors.length}
• Side Conversations: ${
              creditorContactResult.side_conversation_results?.length || 0
            }

📋 **STATUS:** Gläubiger-Kontakt läuft automatisch`;
          } else if (creditorContactError) {
            confirmationComment += `

❌ **FEHLER BEI GLÄUBIGER-KONTAKT**
• Fehler: ${creditorContactError}
• Aktion erforderlich: Manueller Gläubiger-Kontakt nötig`;
          }

          await zendeskService.addInternalComment(zendesk_ticket_id, {
            content: confirmationComment,
            status: creditorContactResult ? "open" : "pending",
          });

          console.log(
            `✅ Added client confirmation comment to ticket ${zendesk_ticket_id}`
          );
        } catch (error) {
          console.error(
            `❌ Failed to add client confirmation comment:`,
            error.message
          );
        }
      }

      console.log(
        `✅ Client creditor confirmation processed for ${client.aktenzeichen}`
      );

      res.json({
        success: true,
        message: "Client creditor confirmation processed successfully",
        client_status: client.current_status,
        creditors_confirmed: creditors.length,
        creditor_contact: creditorContactResult
          ? {
              success: true,
              main_ticket_id: creditorContactResult.main_ticket_id,
              emails_sent: creditorContactResult.emails_sent,
              side_conversations_created:
                creditorContactResult.side_conversation_results?.length || 0,
            }
          : {
              success: false,
              error: creditorContactError,
            },
        next_step: creditorContactResult
          ? "Creditor contact initiated - monitor responses in Zendesk"
          : "Manual creditor contact required",
      });
    } catch (error) {
      console.error("❌ Error in client-creditor-confirmed webhook:", error);
      res.status(500).json({
        error: "Failed to process client creditor confirmation",
        details: error.message,
      });
    }
  }
);

// Webhook: Process creditor responses (ticket comments)
router.post("/creditor-response", rateLimits.general, async (req, res) => {
  try {
    console.log("🚨 WEBHOOK EMPFANGEN! Creditor Response received");
    console.log("📥 Full webhook data:", JSON.stringify(req.body, null, 2));
    console.log("📝 Headers:", req.headers);
    console.log("📊 Body type:", typeof req.body);

    console.log("📋 Parsed webhook info:", {
      type: req.body.type,
      ticket_id: req.body.ticket?.id,
      has_comment: !!req.body.comment,
      comment_public: req.body.comment?.public,
      via_channel: req.body.comment?.via?.channel,
    });

    const webhookData = req.body;

    // Check if this is a ticket comment update from creditor response
    if (webhookData.type === "ticket_comment_created") {
      const ticketId = webhookData.ticket?.id;
      const comment = webhookData.comment;

      console.log(
        `📧 Processing potential creditor response for ticket ${ticketId}`
      );
      console.log(`📝 Comment details:`, {
        public: comment?.public,
        channel: comment?.via?.channel,
        author_id: comment?.author_id,
        body_preview: comment?.body?.substring(0, 100),
      });

      // RELAXED CONDITIONS FOR TESTING: Process public comments OR test comments
      const isValidCreditorResponse =
        comment?.public || (comment?.body && comment.body.includes("Schulden"));
      const skipWebFilter =
        comment?.via?.channel !== "web" || comment?.body?.includes("Schulden"); // Allow test replies

      if (isValidCreditorResponse && skipWebFilter) {
        console.log(
          `✅ Valid creditor response detected for ticket ${ticketId} (relaxed conditions)`
        );
        console.log(`📝 Processing comment: "${comment.body}"`);

        const CreditorContactService = require("../services/creditorContactService");
        const creditorContactService = new CreditorContactService();

        const result =
          await creditorContactService.processIncomingCreditorResponse(
            ticketId,
            comment
          );

        if (result.success) {
          console.log(
            `✅ Processed creditor response: ${result.creditor_name} - €${result.final_amount}`
          );

          res.json({
            success: true,
            message: "Creditor response processed successfully",
            creditor: result.creditor_name,
            amount: result.final_amount,
            extraction_confidence: result.confidence,
            processing_details: result,
          });
        } else {
          console.log(
            `❌ Failed to process creditor response: ${result.error}`
          );

          res.json({
            success: false,
            message: "Failed to process creditor response",
            error: result.error,
            debug_info: result,
          });
        }
      } else {
        console.log(
          `ℹ️ Skipping comment for ticket ${ticketId} - does not match creditor response criteria`
        );
        console.log(`   - Public: ${comment?.public}`);
        console.log(`   - Channel: ${comment?.via?.channel}`);
        console.log(
          `   - Contains 'Schulden': ${comment?.body?.includes("Schulden")}`
        );

        res.json({
          success: true,
          message: "Comment ignored - not a creditor response",
          debug_info: {
            comment_public: comment?.public,
            via_channel: comment?.via?.channel,
            contains_schulden: comment?.body?.includes("Schulden"),
            body_preview: comment?.body?.substring(0, 50),
          },
        });
      }
    } else {
      console.log(
        `ℹ️ Webhook type ${webhookData.type} - not a comment, ignoring`
      );
      res.json({
        success: true,
        message: "Webhook processed - not a comment event",
      });
    }
  } catch (error) {
    console.error("❌ Error in creditor-response webhook:", error);
    res.status(500).json({
      error: "Failed to process creditor response webhook",
      details: error.message,
    });
  }
});

// TEST: Simple webhook endpoint to debug trigger issues
router.post("/test-trigger", rateLimits.general, async (req, res) => {
  console.log("🧪 TEST WEBHOOK TRIGGERED!");
  console.log("📝 Received data:", JSON.stringify(req.body, null, 2));
  console.log("📋 Headers:", req.headers);

  res.json({
    success: true,
    message: "Test webhook received successfully!",
    timestamp: new Date().toISOString(),
    received_data: req.body,
    headers: req.headers,
  });
});

// DEBUG: Enhanced creditor response webhook with more logging
router.post(
  "/debug-creditor-response",
  rateLimits.general,
  async (req, res) => {
    console.log("🔍 DEBUG CREDITOR RESPONSE WEBHOOK TRIGGERED!");
    console.log("📝 Full request data:", JSON.stringify(req.body, null, 2));
    console.log("📋 Headers:", req.headers);
    console.log("🎯 Body type:", typeof req.body);
    console.log("📊 Is object?", req.body && typeof req.body === "object");

    if (req.body) {
      console.log("🔬 Detailed Analysis:");
      console.log("   - Type:", req.body.type);
      console.log("   - Has ticket?", !!req.body.ticket);
      console.log("   - Ticket ID:", req.body.ticket?.id);
      console.log("   - Has comment?", !!req.body.comment);
      console.log("   - Comment public?", req.body.comment?.public);
      console.log("   - Comment channel:", req.body.comment?.via?.channel);
      console.log(
        "   - Comment body preview:",
        req.body.comment?.body?.substring(0, 100)
      );
      console.log("   - Author ID:", req.body.comment?.author_id);
    }

    // Test the debt extraction with your example
    if (req.body.comment?.body) {
      try {
        const DebtAmountExtractor = require("../services/debtAmountExtractor");
        const extractor = new DebtAmountExtractor();
        const result = await extractor.extractDebtAmount(req.body.comment.body);
        console.log("💰 Debt extraction test result:", result);
      } catch (error) {
        console.error("❌ Debt extraction test failed:", error.message);
      }
    }

    res.json({
      success: true,
      message: "Debug webhook received and analyzed!",
      timestamp: new Date().toISOString(),
      analysis: {
        body_type: typeof req.body,
        has_ticket: !!req.body.ticket,
        has_comment: !!req.body.comment,
        webhook_type: req.body.type,
        comment_public: req.body.comment?.public,
        comment_channel: req.body.comment?.via?.channel,
        would_process:
          req.body.type === "ticket_comment_created" &&
          req.body.comment?.public &&
          req.body.comment.via?.channel !== "web",
      },
      received_data: req.body,
    });
  }
);

// Helper function to generate ticket subject based on type
function generateTicketSubject(client, ticketType) {
  const name = `${client.firstName} ${client.lastName}`;
  const aktenzeichen = client.aktenzeichen;

  switch (ticketType) {
    case "document_request":
      return `Dokumente benötigt: ${name} (${aktenzeichen})`;
    case "processing_wait":
      return `AI-Verarbeitung läuft: ${name} (${aktenzeichen})`;
    case "no_creditors_found":
      return `Keine Gläubiger gefunden: ${name} (${aktenzeichen})`;
    case "manual_review":
      return `Gläubiger-Review: ${name} - Manuelle Prüfung (${aktenzeichen})`;
    case "auto_approved":
      return `Gläubiger-Review: ${name} - Bereit zur Bestätigung (${aktenzeichen})`;
    default:
      return `Gläubiger-Review: ${name} (${aktenzeichen})`;
  }
}

// Helper function to generate document request ticket content
function generateDocumentRequestTicket(client) {
  return `📄 DOKUMENTE BENÖTIGT

👤 MANDANT: ${client.firstName} ${client.lastName}
📧 E-Mail: ${client.email}
📁 Aktenzeichen: ${client.aktenzeichen}
✅ Erste Rate: BEZAHLT am ${
    client.payment_processed_at
      ? new Date(client.payment_processed_at).toLocaleDateString("de-DE")
      : "heute"
  }

⚠️ STATUS: Keine Dokumente hochgeladen

🔧 AGENT-AKTIONEN:
1. [BUTTON: Dokumenten-Upload-Email senden]
2. [BUTTON: Mandant anrufen]
3. [BUTTON: SMS senden]

📝 EMAIL-VORLAGE:
Sehr geehrte/r ${client.firstName} ${client.lastName},

vielen Dank für Ihre erste Ratenzahlung! 

Um mit Ihrem Insolvenzverfahren fortzufahren, benötigen wir noch Ihre Gläubigerdokumente.

Bitte laden Sie alle Mahnungen, Rechnungen und Schreiben Ihrer Gläubiger hier hoch:
🔗 ${
    process.env.FRONTEND_URL || "https://mandanten-portal.onrender.com"
  }/login?token=${client.portal_token}

📋 Benötigte Dokumente:
• Mahnungen und Zahlungsaufforderungen
• Rechnungen und Verträge
• Inkasso-Schreiben
• Kreditverträge
• Sonstige Gläubigerschreiben

Mit freundlichen Grüßen
Ihr Insolvenz-Team

🔗 Portal-Zugang: ${
    process.env.FRONTEND_URL || "https://mandanten-portal.onrender.com"
  }/login?token=${client.portal_token}`;
}

// Helper function to generate processing wait ticket content
function generateProcessingWaitTicket(client, documents, completedDocs) {
  const processing = documents.filter(
    (d) => d.processing_status !== "completed"
  );
  const estimatedTime = processing.length * 30; // 30 seconds per document

  return `⏳ AI-VERARBEITUNG LÄUFT

👤 MANDANT: ${client.firstName} ${client.lastName}
📧 E-Mail: ${client.email}
📁 Aktenzeichen: ${client.aktenzeichen}
✅ Erste Rate: BEZAHLT

🔄 VERARBEITUNGSSTATUS:
• Dokumente hochgeladen: ${documents.length}
• Bereits verarbeitet: ${completedDocs.length}/${documents.length}
• Noch in Bearbeitung: ${processing.length}

⏱️ Geschätzte Wartezeit: ${Math.ceil(estimatedTime / 60)} Minuten

📋 DOKUMENTE IN BEARBEITUNG:
${
  processing
    .map((d) => `• ${d.name || "Unbekannt"} (${d.processing_status})`)
    .join("\n") || "Alle Dokumente verarbeitet"
}

🔧 AGENT-AKTIONEN:
• ⏳ Warten Sie auf Verarbeitungsabschluss
• 🔄 Sie erhalten automatisch ein Update-Ticket wenn fertig
• 📞 Bei Problemen nach 10+ Minuten: Support kontaktieren

📝 HINWEIS: Dieses Ticket wird automatisch aktualisiert, sobald die AI-Verarbeitung abgeschlossen ist.

🔗 Portal-Zugang: ${
    process.env.FRONTEND_URL || "https://mandanten-portal.onrender.com"
  }/login?token=${client.portal_token}`;
}

// Helper function to generate no creditors ticket content
function generateNoCreditorsTicket(client, documents) {
  const creditorDocs = documents.filter((d) => d.is_creditor_document === true);
  const nonCreditorDocs = documents.filter(
    (d) => d.is_creditor_document === false
  );

  return `⚠️ KEINE GLÄUBIGER GEFUNDEN

👤 MANDANT: ${client.firstName} ${client.lastName}
📧 E-Mail: ${client.email}
📁 Aktenzeichen: ${client.aktenzeichen}
✅ Erste Rate: BEZAHLT

📊 DOKUMENT-ANALYSE ERGEBNIS:
• Hochgeladen: ${documents.length} Dokumente
• Als Gläubigerdokument erkannt: ${creditorDocs.length}
• Als Nicht-Gläubigerdokument eingestuft: ${nonCreditorDocs.length}
• Extrahierte Gläubiger: 0

⚠️ PROBLEM: Keine Gläubigerdaten extrahiert

🔍 MÖGLICHE URSACHEN:
• Falsche Dokumenttypen hochgeladen
• Schlechte Bildqualität
• Unvollständige Scans
• AI-Klassifizierung fehlerhaft

🔧 AGENT-AKTIONEN:
1. [BUTTON: Dokumente manuell prüfen] → ${
    process.env.FRONTEND_URL || "https://mandanten-portal.onrender.com"
  }/agent/review/${client.id}
2. [BUTTON: Mandant kontaktieren - bessere Dokumente anfordern]
3. [BUTTON: Manuelle Gläubiger-Erfassung starten]

📋 HOCHGELADENE DOKUMENTE:
${documents
  .map(
    (d) =>
      `• ${d.name || "Unbekannt"} - ${
        d.is_creditor_document ? "✅ Gläubiger" : "❌ Kein Gläubiger"
      }`
  )
  .join("\n")}

📝 NÄCHSTE SCHRITTE:
1. Manuelle Dokumentenprüfung durchführen
2. Bei Bedarf bessere Dokumente beim Mandant anfordern
3. Ggf. Gläubiger manuell erfassen

🔗 Portal-Zugang: ${
    process.env.FRONTEND_URL || "https://mandanten-portal.onrender.com"
  }/login?token=${client.portal_token}`;
}

// Helper function to generate creditor review ticket content for Phase 2
function generateCreditorReviewTicketContent(
  client,
  documents,
  creditors,
  needsManualReview
) {
  const completedDocs = documents.filter(
    (d) => d.processing_status === "completed"
  );
  const creditorDocs = documents.filter((d) => d.is_creditor_document === true);
  const totalDebt = creditors.reduce(
    (sum, c) => sum + (c.claim_amount || 0),
    0
  );

  // Separate creditors by confidence level (use AI confidence from Claude)
  const confidenceOk = creditors.filter(
    (c) => (c.ai_confidence || c.confidence || 0) >= 0.8
  );
  const needsReview = creditors.filter(
    (c) => (c.ai_confidence || c.confidence || 0) < 0.8
  );

  // Generate creditor lists
  const verifiedCreditors = confidenceOk
    .map(
      (c) =>
        `✅ ${c.sender_name || "Unbekannt"} - ${
          c.claim_amount || "N/A"
        }€ (Confidence: ${Math.round(
          (c.ai_confidence || c.confidence || 0) * 100
        )}%)`
    )
    .join("\n");

  const reviewCreditors = needsReview
    .map(
      (c) =>
        `⚠️ ${c.sender_name || "Unbekannt"} - ${
          c.claim_amount || "N/A"
        }€ (Confidence: ${Math.round(
          (c.ai_confidence || c.confidence || 0) * 100
        )}%) → PRÜFUNG NÖTIG`
    )
    .join("\n");

  const reviewUrl = `${
    process.env.FRONTEND_URL || "https://mandanten-portal.onrender.com"
  }/agent/review/${client.id}`;

  return `🤖 GLÄUBIGER-ANALYSE FÜR: ${client.firstName} ${client.lastName}

📊 AI-VERARBEITUNG ABGESCHLOSSEN:
• Dokumente verarbeitet: ${completedDocs.length}/${documents.length}
• Gläubiger erkannt: ${creditors.length}
• Manuelle Prüfung erforderlich: ${needsReview.length} ${
    needsManualReview ? "⚠️" : "✅"
  }

📋 ERKANNTE GLÄUBIGER:
${verifiedCreditors || "Keine verifizierten Gläubiger"}

${
  reviewCreditors
    ? `🔍 MANUELLE PRÜFUNG ERFORDERLICH:
${reviewCreditors}`
    : ""
}

💰 GESCHÄTZTE GESAMTSCHULD: ${totalDebt.toFixed(2)}€

${
  needsManualReview
    ? `🔧 AGENT-AKTIONEN:
[BUTTON: Manuelle Prüfung starten] → ${reviewUrl}

⚠️ AGENT MUSS GLÄUBIGER BESTÄTIGEN:
🔗 Agent-Dashboard: ${reviewUrl}

Nach Agent-Bestätigung wird automatisch E-Mail an Mandant versendet.`
    : `✅ ALLE GLÄUBIGER VERIFIZIERT - AGENT-BESTÄTIGUNG ERFORDERLICH:
🔗 Agent-Dashboard: ${reviewUrl}

Nach Agent-Bestätigung wird automatisch E-Mail an Mandant versendet.`
}

🔗 Mandant Portal: ${
    process.env.FRONTEND_URL || "https://mandanten-portal.onrender.com"
  }/login?token=${client.portal_token}
📁 Aktenzeichen: ${client.aktenzeichen}`;
}

// Helper function to generate Zendesk ticket content (legacy)
function generateGlaeubierProcessContent(client, documents, creditors) {
  const completedDocs = documents.filter(
    (d) => d.processing_status === "completed"
  );
  const creditorDocs = documents.filter((d) => d.is_creditor_document === true);
  const totalDebt = creditors.reduce(
    (sum, c) => sum + (c.claim_amount || 0),
    0
  );

  const creditorsList = creditors
    .map(
      (c) =>
        `• ${c.sender_name || "Unbekannt"} - ${
          c.claim_amount || "N/A"
        }€ (Ref: ${c.reference_number || "N/A"})`
    )
    .join("\n");

  return `🤖 AUTOMATISCHE DOKUMENTEN-ANALYSE ABGESCHLOSSEN

👤 MANDANT: ${client.firstName} ${client.lastName}
📧 E-Mail: ${client.email}
📁 Aktenzeichen: ${client.aktenzeichen}

📊 DOKUMENTE-STATUS:
- Hochgeladen: ${documents.length} Dokumente
- Verarbeitet: ${completedDocs.length} Dokumente
- Gläubigerdokumente erkannt: ${creditorDocs.length}
- Verarbeitung: ${
    completedDocs.length === documents.length
      ? "✅ Abgeschlossen"
      : "⏳ In Bearbeitung"
  }

📋 ERKANNTE GLÄUBIGER (${creditors.length}):
${creditorsList || "Keine Gläubiger erkannt"}

💰 GESCHÄTZTE GESAMTSCHULD: ${totalDebt.toFixed(2)} EUR

⚠️ AGENT-AKTION ERFORDERLICH:
${
  creditors.length > 0
    ? "📤 Gläubigerliste zur Bestätigung an Mandant senden"
    : "📄 Dokumente beim Mandant anfordern - keine Gläubigerdokumente gefunden"
}

🔗 Portal-Link: ${
    process.env.FRONTEND_URL || "https://mandanten-portal.onrender.com"
  }/login?token=${client.portal_token}`;
}

// Helper function to generate internal comment for original ticket
function generateInternalComment(
  client,
  ticketType,
  documents,
  creditors,
  state
) {
  const baseInfo = `**💰 PAYMENT CONFIRMED - AUTOMATED ANALYSIS**\n\n👤 **Client:** ${
    client.firstName
  } ${client.lastName} (${client.aktenzeichen})\n📧 **Email:** ${
    client.email
  }\n⏰ **Processed:** ${new Date().toLocaleString("de-DE")}`;

  switch (ticketType) {
    case "document_request":
      return `${baseInfo}\n\n⚠️ **STATUS: DOCUMENTS REQUIRED**\n\n📊 **Analysis:**\n• Documents uploaded: ${
        documents.length
      }\n• Processing status: No documents found\n\n🔧 **AGENT ACTION REQUIRED:**\n→ **[CLIENT PORTAL ACCESS]** ${
        process.env.FRONTEND_URL || "https://mandanten-portal.onrender.com"
      }/login?token=${
        client.portal_token
      }\n\n📧 **Email Template:**\n\"Sehr geehrte/r ${client.firstName} ${
        client.lastName
      },\n\nvielen Dank für Ihre erste Ratenzahlung!\n\nBitte laden Sie Ihre Gläubigerdokumente hier hoch:\n${
        process.env.FRONTEND_URL || "https://mandanten-portal.onrender.com"
      }/login?token=${
        client.portal_token
      }\n\nBenötigte Dokumente: Mahnungen, Rechnungen, Inkasso-Schreiben\"\n\n📋 **Automatic Process:**\n• After document upload, system re-analyzes automatically\n• This ticket will be updated with results\n• No further agent action needed until then
`;

    case "auto_approved":
      const totalDebt = creditors.reduce(
        (sum, c) => sum + (c.claim_amount || 0),
        0
      );
      const creditorsList = creditors
        .map(
          (c) =>
            `• ${c.sender_name || "Unknown"} - €${
              c.claim_amount || "N/A"
            } (${Math.round(
              (c.ai_confidence || c.confidence || 0) * 100
            )}% confidence)`
        )
        .join("\n");

      return `${baseInfo}\n\n✅ **STATUS: AI PROCESSED - FULLY AUTOMATED**\n\n📊 **Analysis Results:**\n• Documents processed: ${
        documents.length
      }\n• Creditors found: ${
        creditors.length
      }\n• Total debt: €${totalDebt.toFixed(
        2
      )}\n• All creditors ≥80% confidence\n\n🏛️ **VERIFIED CREDITORS:**\n${creditorsList}\n\n🚀 **AUTOMATED ACTIONS:**\n• ✅ Creditor contact process started automatically\n• ✅ Client portal access granted\n• ✅ Creditor list sent for confirmation\n\n📋 **NO AGENT ACTION REQUIRED** - Process fully automated`;

    case "manual_review":
      const needsReview = creditors.filter(
        (c) => (c.ai_confidence || c.confidence || 0) < 0.8
      );
      const confident = creditors.filter(
        (c) => (c.ai_confidence || c.confidence || 0) >= 0.8
      );

      return `${baseInfo}\n\n⚠️ **STATUS: MANUAL REVIEW REQUIRED**\n\n📊 **Analysis Results:**\n• Documents processed: ${
        documents.length
      }\n• Creditors found: ${creditors.length}\n• Need manual review: ${
        needsReview.length
      }\n• Auto-verified: ${
        confident.length
      }\n\n🔍 **CREDITORS NEEDING REVIEW:**\n${needsReview
        .map(
          (c) =>
            `• ${c.sender_name || "Unknown"} - €${
              c.claim_amount || "N/A"
            } (${Math.round(
              (c.ai_confidence || c.confidence || 0) * 100
            )}% confidence)`
        )
        .join(
          "\n"
        )}\n\n🔧 **AGENT ACTION REQUIRED:**\n→ **[MANUAL REVIEW DASHBOARD]** ${
        process.env.FRONTEND_URL || "https://mandanten-portal.onrender.com"
      }/agent/review/${
        client.id
      }\n\n📋 **Process:**\n1. Click link above to open Review Dashboard\n2. Manually verify and correct low-confidence extractions\n3. System automatically continues after completion\n4. Creditor contact starts automatically\n5. This ticket gets updated with final results\n\n✅ **Auto-verified creditors will be processed automatically**
`;

    case "no_creditors_found":
      return `${baseInfo}\n\n⚠️ **STATUS: NO CREDITORS FOUND**\n\n📊 **Analysis Results:**\n• Documents processed: ${
        documents.length
      }\n• Creditor documents detected: ${
        documents.filter((d) => d.is_creditor_document).length
      }\n• Creditors extracted: 0\n\n🔍 **POSSIBLE ISSUES:**\n• Documents may not contain creditor information\n• Poor document quality / non-standard format\n• AI classification error\n\n🔧 **AGENT ACTION REQUIRED:**\n→ **[DOCUMENT REVIEW]** ${
        process.env.FRONTEND_URL || "https://mandanten-portal.onrender.com"
      }/admin/clients/${client.id}\n\n📋 **Documents Uploaded:**\n${documents
        .map(
          (d) =>
            `• ${d.name} - ${
              d.is_creditor_document ? "✅ Creditor doc" : "❌ Other doc"
            }`
        )
        .join(
          "\n"
        )}\n\n📧 **Options:**\n1. Review documents manually via link above\n2. Request better quality documents from client\n3. Manual creditor entry if needed
`;

    case "processing_wait":
      const processing = documents.filter(
        (d) => d.processing_status !== "completed"
      );
      return `${baseInfo}\n\n⏳ **STATUS: AI PROCESSING IN PROGRESS**\n\n📊 **Processing Status:**\n• Documents uploaded: ${
        documents.length
      }\n• Processing complete: ${documents.length - processing.length}/${
        documents.length
      }\n• Estimated time remaining: ${Math.ceil(
        processing.length * 0.5
      )} minutes\n\n🔄 **DOCUMENTS IN QUEUE:**\n${processing
        .map((d) => `• ${d.name} (${d.processing_status})`)
        .join(
          "\n"
        )}\n\n⏰ **NO AGENT ACTION REQUIRED**\n• System will automatically update this ticket when processing completes\n• Appropriate workflow will continue based on analysis results\n\n📋 **Next Steps:**\n• Wait for AI processing to complete\n• Ticket will be updated automatically with results`;

    default:
      return `${baseInfo}\n\n❓ **STATUS: UNKNOWN SCENARIO**\n\nPlease check system logs for details.`;
  }
}

// Helper function to get ticket status based on scenario
function getTicketStatusForScenario(ticketType) {
  switch (ticketType) {
    case "document_request":
      return "pending"; // Waiting for customer
    case "auto_approved":
      return "open"; // Automated process active
    case "manual_review":
      return "pending"; // Waiting for agent review
    case "no_creditors_found":
      return "pending"; // Needs agent investigation
    case "processing_wait":
      return "open"; // System processing
    default:
      return "open";
  }
}

// API: Start Side Conversation monitoring for a specific client
router.post(
  "/monitor/start-client/:clientReference",
  rateLimits.general,
  async (req, res) => {
    try {
      const { clientReference } = req.params;
      const { interval_minutes = 1 } = req.body;

      console.log(
        `🚀 Starting Side Conversation monitoring for client: ${clientReference}`
      );

      const result = sideConversationMonitor.startMonitoringForClient(
        clientReference,
        interval_minutes
      );

      if (result.success) {
        res.json({
          success: true,
          message: `Side Conversation monitoring started for client ${clientReference}`,
          client_reference: clientReference,
          side_conversations_count: result.side_conversations_count,
          session: result.session,
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message,
          client_reference: clientReference,
        });
      }
    } catch (error) {
      console.error("❌ Error starting client monitoring:", error);
      res.status(500).json({
        error: "Failed to start client monitoring",
        details: error.message,
      });
    }
  }
);

// API: Stop Side Conversation monitoring for a specific client
router.post(
  "/monitor/stop-client/:clientReference",
  rateLimits.general,
  async (req, res) => {
    try {
      const { clientReference } = req.params;

      const result =
        sideConversationMonitor.stopMonitoringForClient(clientReference);

      res.json({
        success: result,
        message: result
          ? `Side Conversation monitoring stopped for client ${clientReference}`
          : `No active monitoring for client ${clientReference}`,
        client_reference: clientReference,
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to stop client monitoring",
        details: error.message,
      });
    }
  }
);

// API: Get overall monitoring status
router.get("/monitor/status", rateLimits.general, async (req, res) => {
  try {
    const status = sideConversationMonitor.getStatus();
    res.json({
      success: true,
      status: status,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to get status",
      details: error.message,
    });
  }
});

// API: Get monitoring status for specific client
router.get(
  "/monitor/status/:clientReference",
  rateLimits.general,
  async (req, res) => {
    try {
      const { clientReference } = req.params;
      const status = sideConversationMonitor.getClientStatus(clientReference);
      res.json({
        success: true,
        status: status,
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to get client status",
        details: error.message,
      });
    }
  }
);

// API: Restart monitoring for all active clients
router.post("/monitor/restart", rateLimits.general, async (req, res) => {
  try {
    console.log("🔄 Restarting Side Conversation monitoring...");

    // Get current active sessions
    const currentStatus = sideConversationMonitor.getStatus();
    const activeSessions = currentStatus.active_sessions || [];

    // Stop all monitoring
    sideConversationMonitor.stopGlobalMonitoring();

    // Restart monitoring for each active client
    let restartedCount = 0;
    const results = [];

    for (const session of activeSessions) {
      try {
        const result = sideConversationMonitor.startMonitoringForClient(
          session.client_reference,
          1
        );
        if (result.success) {
          restartedCount++;
          results.push({
            client_reference: session.client_reference,
            success: true,
            side_conversations_count: result.side_conversations_count,
          });
        } else {
          results.push({
            client_reference: session.client_reference,
            success: false,
            error: result.message,
          });
        }
      } catch (error) {
        results.push({
          client_reference: session.client_reference,
          success: false,
          error: error.message,
        });
      }
    }

    console.log(
      `✅ Monitoring restarted for ${restartedCount}/${activeSessions.length} clients`
    );

    res.json({
      success: true,
      message: `Monitoring restarted for ${restartedCount}/${activeSessions.length} clients`,
      restarted_count: restartedCount,
      total_clients: activeSessions.length,
      results: results,
    });
  } catch (error) {
    console.error("❌ Error restarting monitoring:", error.message);
    res.status(500).json({
      error: "Failed to restart monitoring",
      details: error.message,
    });
  }
});

// API: Manual check for specific client
router.post(
  "/monitor/check-client/:clientReference",
  rateLimits.general,
  async (req, res) => {
    try {
      const { clientReference } = req.params;

      console.log(
        `🔍 Manual Side Conversation check requested for client ${clientReference}`
      );

      await sideConversationMonitor.checkClientSideConversations(
        clientReference
      );

      const status = sideConversationMonitor.getClientStatus(clientReference);

      res.json({
        success: true,
        message: `Manual check completed for client ${clientReference}`,
        client_reference: clientReference,
        status: status,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`❌ Error in manual client check: ${error.message}`);
      res.status(500).json({
        error: "Failed to check client",
        details: error.message,
      });
    }
  }
);

// API: Check all active clients
router.post("/monitor/check-all", rateLimits.general, async (req, res) => {
  try {
    console.log("🔍 Manual check requested for all active clients");

    await sideConversationMonitor.checkAllActiveSessions();

    res.json({
      success: true,
      message: "Manual check completed for all active clients",
      status: sideConversationMonitor.getStatus(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`❌ Error in manual check: ${error.message}`);
    res.status(500).json({
      error: "Failed to perform manual check",
      details: error.message,
    });
  }
});

// Zendesk Webhook: Creditor Review Ready
// Triggered after 7-day delay when both payment and documents are uploaded
router.post(
  "/creditor-review-ready",
  parseZendeskPayload,
  rateLimits.general,
  async (req, res) => {
    try {
      console.log(
        "📋 Zendesk Webhook: Creditor-Review-Ready received",
        req.body
      );

      const { client_id, review_type, triggered_by } = req.body;

      console.log(`🔍 Looking for client with ID: ${client_id}`);

      if (!client_id) {
        return res.status(400).json({
          error: "Missing required field: client_id",
        });
      }

      // Find client
      const client = await Client.findOne({ id: client_id });

      if (!client) {
        console.error(`❌ Client not found with ID: ${client_id}`);
        // Try to find any clients to debug
        const allClients = await Client.find(
          {},
          { id: 1, aktenzeichen: 1, firstName: 1, lastName: 1 }
        ).limit(5);
        console.log(
          `📋 Available clients:`,
          allClients.map((c) => `${c.id} (${c.aktenzeichen})`)
        );

        return res.status(404).json({
          error: "Client not found",
          client_id: client_id,
          debug_available_clients: allClients.map((c) => ({
            id: c.id,
            aktenzeichen: c.aktenzeichen,
          })),
        });
      }

      console.log(
        `✅ Found client: ${client.firstName} ${client.lastName} (${client.aktenzeichen})`
      );

      console.log(
        `📋 Processing creditor review for: ${client.firstName} ${client.lastName} (${client.aktenzeichen})`
      );

      // Get documents and creditors
      const documents = client.documents || [];
      const creditors = client.final_creditor_list || [];
      const creditorDocs = documents.filter(
        (d) => d.is_creditor_document === true
      );

      // Check which creditors need manual review (confidence < 80%)
      const needsReview = creditors.filter(
        (c) => (c.ai_confidence || c.confidence || 0) < 0.8
      );
      const confidenceOk = creditors.filter(
        (c) => (c.ai_confidence || c.confidence || 0) >= 0.8
      );

      // Generate review ticket content
      const ticketSubject = `7-Day Review: ${client.firstName} ${client.lastName} (${client.aktenzeichen})`;
      const ticketBody = `## 7-Tage Überprüfung abgeschlossen

**Client:** ${client.firstName} ${client.lastName}
**Aktenzeichen:** ${client.aktenzeichen}
**E-Mail:** ${client.email}

### Status:
- **Zahlung erhalten:** ✅ ${
        client.both_conditions_met_at
          ? new Date(client.both_conditions_met_at).toLocaleDateString("de-DE")
          : "N/A"
      }
- **Dokumente hochgeladen:** ${documents.length}
- **Gläubiger-Dokumente:** ${creditorDocs.length}
- **Extrahierte Gläubiger:** ${creditors.length}

### Gläubiger-Überprüfung:
- **Gläubiger mit hoher Konfidenz (≥80%):** ${confidenceOk.length}
- **Gläubiger benötigen manuelle Überprüfung (<80%):** ${needsReview.length}

${
  needsReview.length > 0
    ? `### ⚠️ Manuelle Überprüfung erforderlich für:
${needsReview
  .map(
    (c) =>
      `- ${c.sender_name} (Konfidenz: ${Math.round(
        (c.ai_confidence || c.confidence || 0) * 100
      )}%)`
  )
  .join("\n")}

**Dashboard-Link:** ${
        process.env.FRONTEND_URL || "https://mandanten-portal.onrender.com"
      }/agent/review/${client.id}`
    : "✅ Alle Gläubiger haben ausreichende Konfidenz. Keine manuelle Überprüfung erforderlich."
}

### Nächste Schritte:
1. Gläubigerliste überprüfen
2. Ggf. manuelle Korrekturen vornehmen
3. Client-Bestätigung anfordern
4. Gläubiger-Kontakt initialisieren
`;

      // Check Zendesk configuration before creating ticket
      const zendeskDomain =
        process.env.ZENDESK_DOMAIN || process.env.ZENDESK_SUBDOMAIN;
      const zendeskEmail =
        process.env.ZENDESK_API_EMAIL || process.env.ZENDESK_EMAIL;
      const zendeskToken =
        process.env.ZENDESK_API_TOKEN || process.env.ZENDESK_TOKEN;

      if (!zendeskDomain || !zendeskEmail || !zendeskToken) {
        console.warn(
          "⚠️ Zendesk service not configured - skipping ticket creation",
          {
            hasDomain: !!zendeskDomain,
            hasEmail: !!zendeskEmail,
            hasToken: !!zendeskToken,
          }
        );

        // Still update client status without ticket
        await Client.updateOne(
          { _id: client._id },
          {
            $set: { current_status: "creditor_review" },
            $push: {
              status_history: {
                id: uuidv4(),
                status: "creditor_review_initiated_no_zendesk",
                changed_by: "system",
                metadata: {
                  review_type: review_type,
                  triggered_by: triggered_by,
                  needs_manual_review: needsReview.length > 0,
                  creditors_count: creditors.length,
                  documents_count: documents.length,
                  zendesk_error: "Configuration missing",
                },
              },
            },
          }
        );
      } else {
        // Create or update Zendesk ticket
        try {
          let ticketId = client.zendesk_ticket_id;
          let ticketResult;

          if (ticketId) {
            // Update existing ticket
            ticketResult = await zendeskService.updateTicket(ticketId, {
              comment: {
                body: ticketBody,
                public: false,
              },
              tags: [
                "7-day-review",
                "creditor-review-ready",
                review_type === "scheduled_7_day"
                  ? "automated-review"
                  : "manual-review",
              ],
              priority: needsReview.length > 0 ? "normal" : "low",
              status: "open",
            });
            console.log(
              `✅ Updated existing ticket ${ticketId} with creditor review information`
            );
          } else {
            // Create new ticket
            ticketResult = await zendeskService.createTicket({
              subject: ticketSubject,
              content: ticketBody,
              requesterEmail: client.email,
              tags: [
                "7-day-review",
                "creditor-review-ready",
                review_type === "scheduled_7_day"
                  ? "automated-review"
                  : "manual-review",
              ],
              priority: needsReview.length > 0 ? "normal" : "low",
              type: "task",
            });

            if (ticketResult.success && ticketResult.ticket_id) {
              ticketId = ticketResult.ticket_id;
              console.log(
                `✅ Created new ticket ${ticketId} for creditor review`
              );
            } else {
              throw new Error(
                `Failed to create creditor review ticket: ${
                  ticketResult.error || "Unknown error"
                }`
              );
            }
          }

          // Prepare status history entry
          const statusHistoryEntry = {
            id: uuidv4(),
            status: "creditor_review_ticket_created",
            changed_by: "system",
            zendesk_ticket_id: ticketId,
            metadata: {
              review_type: review_type,
              triggered_by: triggered_by,
              needs_manual_review: needsReview.length > 0,
              creditors_count: creditors.length,
              documents_count: documents.length,
            },
          };

          // Use direct update to avoid document validation issues
          await Client.updateOne(
            { _id: client._id },
            {
              $set: {
                current_status: "creditor_review",
                zendesk_ticket_id: ticketId,
              },
              $push: {
                status_history: statusHistoryEntry,
                zendesk_tickets: {
                  ticket_id: ticketId,
                  ticket_type: "glaeubieger_process",
                  ticket_scenario: "7_day_review",
                  status: "open",
                  created_at: new Date(),
                },
              },
            }
          );
        } catch (zendeskError) {
          console.error("❌ Error creating/updating Zendesk ticket:", {
            message: zendeskError.message,
            response: zendeskError.response?.data,
            status: zendeskError.response?.status,
            config: {
              domain:
                process.env.ZENDESK_DOMAIN || process.env.ZENDESK_SUBDOMAIN,
              email: process.env.ZENDESK_API_EMAIL || process.env.ZENDESK_EMAIL,
              hasToken: !!(
                process.env.ZENDESK_API_TOKEN || process.env.ZENDESK_TOKEN
              ),
            },
          });
          // Continue anyway - ticket creation failure shouldn't break the process
        }
      }

      res.json({
        success: true,
        message: "Creditor review process initiated",
        client_status: "creditor_review",
        documents_count: documents.length,
        creditor_documents: creditorDocs.length,
        extracted_creditors: creditors.length,
        creditors_need_review: needsReview.length,
        creditors_confidence_ok: confidenceOk.length,
        manual_review_required: needsReview.length > 0,
        review_dashboard_url:
          needsReview.length > 0
            ? `${
                process.env.FRONTEND_URL ||
                "https://mandanten-portal.onrender.com"
              }/agent/review/${client.id}`
            : null,
      });
    } catch (error) {
      console.error("❌ Error in creditor-review-ready webhook:", error);
      res.status(500).json({
        error: "Failed to process creditor review webhook",
        details: error.message,
      });
    }
  }
);


module.exports = router;
