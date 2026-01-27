const config = require('../config');
const { v4: uuidv4 } = require('uuid');
const creditorDeduplication = require('../utils/creditorDeduplication');

/**
 * Agent Review Controller Factory
 * Handles business logic for the Agent Review Dashboard
 * @param {Object} dependencies - Dependencies injected from route
 * @param {Object} dependencies.Client - Client model
 * @param {Function} dependencies.getGCSFileStream - Function to get GCS file stream
 * @param {String} dependencies.uploadsDir - Uploads directory path
 * @param {Object} dependencies.zendeskService - Zendesk service instance
 */
const createAgentReviewController = ({ Client, getGCSFileStream, uploadsDir, zendeskService }) => {

    /**
     * Helper function to get all documents linked to a creditor
     * Uses multiple linking strategies for reliability
     * Note: source_documents may have timestamp prefixes (e.g., "1768854930943-Screenshot.jpg")
     * while doc.name may not, so we use flexible matching
     */
    const getDocumentsForCreditor = (creditor, allDocuments) => {
        return allDocuments.filter(doc =>
            creditor.document_id === doc.id ||
            creditor.source_document === doc.name ||
            (creditor.source_documents && creditor.source_documents.some(srcDoc =>
                srcDoc === doc.name || srcDoc.endsWith(doc.name) || doc.name.endsWith(srcDoc)
            ))
        );
    };

    /**
     * Generate creditor confirmation email content
     */
    const generateCreditorConfirmationEmailContent = (client, creditors, portalUrl, totalDebt) => {
        const { firstName, lastName, aktenzeichen } = client;

        // Plain text creditor list with reference numbers
        const creditorListPlain = creditors
            .map((c, i) => {
                const refNum = c.reference_number && c.reference_number !== "N/A" ? `\n   Referenz: ${c.reference_number}` : "";
                return `${i + 1}. ${c.sender_name || "Unbekannt"}\n   Forderung: €${(c.claim_amount || 0).toLocaleString("de-DE")}${refNum}`;
            })
            .join("\n\n");

        // HTML creditor list rows with reference numbers
        const creditorListHtml = creditors
            .map((c, i) => {
                const refNum = c.reference_number && c.reference_number !== "N/A"
                    ? `<div style="font-size: 12px; color: #6b7280; margin-top: 4px;">Referenz: ${c.reference_number}</div>`
                    : "";
                return `
                <tr>
                    <td style="padding: 16px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #111827; vertical-align: top;">${i + 1}.</td>
                    <td style="padding: 16px; border-bottom: 1px solid #e5e7eb; vertical-align: top;">
                        <div style="font-weight: 600; color: #111827; margin-bottom: 4px;">${c.sender_name || "Unbekannt"}</div>
                        <div style="font-size: 14px; color: #16a34a; font-weight: 500;">Forderung: €${(c.claim_amount || 0).toLocaleString("de-DE")}</div>
                        ${refNum}
                    </td>
                </tr>`;
            })
            .join("");

        const plainText = `
Sehr geehrte/r ${firstName} ${lastName},

wir haben Ihre im Mandantenportal eingereichten Unterlagen gesichtet und daraus folgende Gläubiger für Sie erfasst:

📋 GLÄUBIGERLISTE:
${creditorListPlain}

Gesamtschulden: €${totalDebt.toLocaleString("de-DE")}

👉 Bitte loggen Sie sich in Ihr Mandantenportal ein, prüfen Sie die Liste sorgfältig und bestätigen Sie anschließend über den dort angezeigten Button, dass die Gläubigerliste vollständig ist.

⚠️ WICHTIG - 7-TAGE-FRIST:
Sollten Sie innerhalb von 7 Tagen keine Bestätigung abgeben, gehen wir davon aus, dass die Gläubigerliste vollständig ist. In diesem Fall werden wir die genannten Gläubiger anschreiben und die aktuellen Forderungshöhen erfragen.

Den Zugang zum Portal finden Sie hier:
${portalUrl}

Bei Fragen stehe ich Ihnen selbstverständlich gerne zur Verfügung.

Mit freundlichen Grüßen
Rechtsanwalt Thomas Scuric

📁 Aktenzeichen: ${aktenzeichen}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Diese E-Mail wurde automatisch generiert.
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

        <!-- Header with Logo -->
        <div style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb;">
            <img src="https://www.anwalt-privatinsolvenz-online.de/wp-content/uploads/2015/08/Logo-T-Scuric.png" alt="Scuric Logo" style="height: 40px; display: block;">
        </div>

        <!-- Main Content -->
        <div style="padding: 24px 20px;">

            <!-- Title Section -->
            <div style="text-align: center; margin-bottom: 32px;">
                <h1 style="font-size: 28px; font-weight: 600; color: #111827; margin: 0 0 12px 0;">📋 Ihre Gläubigerliste</h1>
                <p style="font-size: 16px; color: #6b7280; margin: 0;">Bitte überprüfen und bestätigen</p>
            </div>

            <!-- Greeting -->
            <p style="font-size: 15px; color: #374151; line-height: 1.6; margin: 0 0 20px 0;">
                Sehr geehrte/r <strong>${firstName} ${lastName}</strong>,<br><br>
                wir haben Ihre im Mandantenportal eingereichten Unterlagen gesichtet und daraus folgende Gläubiger für Sie erfasst:
            </p>

            <!-- Creditor List -->
            <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; margin: 20px 0; overflow: hidden;">
                <div style="padding: 16px; background-color: #111827; color: #ffffff; font-weight: 600; font-size: 16px;">
                    📋 Gläubigerliste
                </div>
                <table style="width: 100%; border-collapse: collapse;">
                    <tbody>
                        ${creditorListHtml}
                    </tbody>
                </table>
                <!-- Total Row -->
                <div style="padding: 16px; background-color: #111827; color: #ffffff; display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-weight: 600; font-size: 16px;">Gesamtschulden</div>
                    <div style="font-weight: 700; font-size: 20px; color: #10b981;">€${totalDebt.toLocaleString("de-DE")}</div>
                </div>
            </div>

            <!-- Instructions -->
            <h2 style="font-size: 18px; font-weight: 600; color: #111827; margin: 24px 0 16px 0;">Was Sie jetzt tun sollten</h2>
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 8px 0;">
                        <table style="width: 100%; background-color: #f9fafb; border-radius: 8px;">
                            <tr>
                                <td style="width: 28px; padding: 12px 0 12px 12px; vertical-align: top;">
                                    <div style="background-color: #111827; color: #ffffff; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 600; font-size: 14px;">1</div>
                                </td>
                                <td style="padding: 16px 12px 12px 12px; color: #374151; font-size: 14px; line-height: 1.5;">
                                    Loggen Sie sich in Ihr Mandantenportal ein
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 8px 0;">
                        <table style="width: 100%; background-color: #f9fafb; border-radius: 8px;">
                            <tr>
                                <td style="width: 28px; padding: 12px 0 12px 12px; vertical-align: top;">
                                    <div style="background-color: #111827; color: #ffffff; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 600; font-size: 14px;">2</div>
                                </td>
                                <td style="padding: 16px 12px 12px 12px; color: #374151; font-size: 14px; line-height: 1.5;">
                                    Prüfen Sie die Gläubigerliste sorgfältig auf Vollständigkeit
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 8px 0;">
                        <table style="width: 100%; background-color: #f9fafb; border-radius: 8px;">
                            <tr>
                                <td style="width: 28px; padding: 12px 0 12px 12px; vertical-align: top;">
                                    <div style="background-color: #111827; color: #ffffff; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 600; font-size: 14px;">3</div>
                                </td>
                                <td style="padding: 16px 12px 12px 12px; color: #374151; font-size: 14px; line-height: 1.5;">
                                    Bestätigen Sie über den Button, dass die Liste vollständig ist
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>

            <!-- 7-Day Warning -->
            <div style="background-color: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 14px; color: #78350f;">
                <div style="font-weight: 600; color: #92400e; margin-bottom: 8px;">⚠️ WICHTIG - 7-Tage-Frist:</div>
                <p style="margin: 0; line-height: 1.6;">
                    Sollten Sie innerhalb von <strong>7 Tagen</strong> keine Bestätigung abgeben, gehen wir davon aus, dass die Gläubigerliste vollständig ist. In diesem Fall werden wir die genannten Gläubiger anschreiben und die aktuellen Forderungshöhen erfragen.
                </p>
            </div>

            <!-- CTA Button -->
            <div style="text-align: center; margin: 32px 0;">
                <a href="${portalUrl}" style="display: inline-block; background-color: #16a34a; color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                    Jetzt im Portal bestätigen
                </a>
            </div>

            <!-- Help Note -->
            <div style="background-color: #dbeafe; border: 1px solid #93c5fd; border-radius: 8px; padding: 12px; margin: 16px 0; font-size: 14px; color: #1e40af;">
                <strong>Hinweis:</strong> Sie können jederzeit weitere Dokumente im Portal hochladen. Bei Fragen stehe ich Ihnen selbstverständlich gerne zur Verfügung.
            </div>

            <!-- Signature -->
            <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #1a1a1a;">
                <p style="margin: 0 0 12px;">
                    <img src="https://www.anwalt-privatinsolvenz-online.de/wp-content/uploads/2015/08/Logo-T-Scuric.png" alt="Thomas Scuric Rechtsanwalt" style="display: block; max-width: 300px; height: auto;">
                </p>
                <p style="margin: 0 0 4px; color: #961919; font-weight: bold;">Rechtsanwaltskanzlei Thomas Scuric</p>
                <p style="margin: 0 0 8px; color: #1f497d;">
                    Bongardstraße 33<br>
                    44787 Bochum
                </p>
                <p style="margin: 0 0 12px; color: #1f497d;">
                    Fon: 0234 913 681 0<br>
                    Fax: 0234 913 681 29<br>
                    E-Mail: <a href="mailto:kontakt@schuldnerberatung-anwalt.de" style="color: #0563c1; text-decoration: none;">kontakt@schuldnerberatung-anwalt.de</a>
                </p>
                <p style="margin: 0; font-size: 11px; line-height: 1.5; color: #a6a6a6;">
                    Der Inhalt dieser E-Mail ist vertraulich und ausschließlich für den bezeichneten Adressaten bestimmt. Wenn Sie nicht der vorgesehene Adressat dieser E-Mail oder dessen Vertreter sein sollten, so beachten Sie bitte, daß jede Form der Kenntnisnahme, Veröffentlichung, Vervielfältigung oder Weitergabe des Inhalts dieser E-Mail unzulässig ist. Wir bitten Sie, sich in diesem Fall mit dem Absender der E-Mail in Verbindung zu setzen. Aussagen gegenüber dem Adressaten unterliegen den Regelungen des zugrundeliegenden Auftrags, insbesondere den Allgemeinen Auftragsbedingungen. Wir möchten Sie außerdem darauf hinweisen, daß die Kommunikation per E-Mail über das Internet unsicher ist, da für unberechtigte Dritte grundsätzlich die Möglichkeit der Kenntnisnahme und Manipulation besteht.<br><br>
                    Wir weisen Sie auf unsere aktuelle <a href="https://www.schuldnerberatung-anwalt.de/datenschutz/" style="color: #a0191d; text-decoration: underline;" target="_blank">Datenschutzerklärung</a> hin.
                </p>
            </div>

            <!-- Media Section -->
            <div style="text-align: center; margin-top: 48px; padding-top: 32px; border-top: 1px solid #e5e7eb;">
                <p style="font-size: 13px; color: #6b7280; font-weight: 500; margin: 0 0 20px 0;">Bekannt aus:</p>
                <img src="https://www.anwalt-privatinsolvenz-online.de/wp-content/uploads/2019/11/medien.png" alt="Bekannt aus verschiedenen Medien" style="max-width: 100%; height: auto; max-height: 48px; opacity: 0.6;">
            </div>

            <!-- Footer Links -->
            <div style="text-align: center; margin-top: 32px; padding-top: 24px;">
                <div style="margin-bottom: 12px;">
                    <a href="https://www.schuldnerberatung-anwalt.de/impressum/" style="color: #6b7280; text-decoration: none; font-size: 13px;">Impressum</a>
                    <span style="color: #9ca3af; margin: 0 12px;">•</span>
                    <a href="https://www.schuldnerberatung-anwalt.de/datenschutz/" style="color: #6b7280; text-decoration: none; font-size: 13px;">Datenschutz</a>
                </div>
                <p style="font-size: 12px; color: #9ca3af; margin: 0;">© 2025 Scuric. Alle Rechte vorbehalten.</p>
            </div>

            <!-- Auto-generated Notice -->
            <div style="font-size: 11px; color: #9ca3af; margin-top: 24px; padding: 12px; background-color: #f9fafb; border-radius: 6px;">
                📎 Diese E-Mail wurde automatisch generiert. Bitte antworten Sie nicht direkt auf diese Nachricht.<br>
                📁 Aktenzeichen: <strong style="color: #6b7280;">${aktenzeichen}</strong>
            </div>
        </div>
    </div>
</body>
</html>
        `.trim();

        return { plainText, html };
    };

    return {

    /**
     * Get available clients for review
     * GET /api/agent-review/available-clients
     */
    getAvailableClients: async (req, res) => {
        try {
            console.log(`🔍 Agent Review: Getting available clients for agent ${req.agentUsername}`);

            // Find clients that still need action:
            //  - creditors flagged for manual review OR
            //  - session in creditor_review (not yet completed via summary button)
       

            const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
            const perPage = Math.max(parseInt(req.query.limit, 10) || 10, 1);

            const clients = await Client.find({
              $or: [
                {
                  final_creditor_list: {
                    $elemMatch: { needs_manual_review: true }
                  }
                },
                { current_status: 'creditor_review' },
                {
                  $and: [
                    { current_status: 'awaiting_client_confirmation' },
                    {
                      final_creditor_list: {
                        $elemMatch: { needs_manual_review: true }
                      }
                    }
                  ]
                }
              ]
            });

            clients.map(client=>{
                if(client.id==="MAND_2026_7576"){  
                    console.log(client.final_creditor_list.map(c=>c.needs_manual_review))
                }
            })
           

            const availableClients = [];

            for (const client of clients) {
                const documents = client.documents || [];
                const creditors = client.final_creditor_list || [];

                    // if(client.id==="MAND_2026_3191"){
                    //     console.log(client.documents.map(d=>d.filename))
                    //     console.log(client.final_creditor_list.map(c=>c.source_documents))
                    // }

                // Build docs-to-review directly from creditors that need manual review
                const findDocForCreditor = (cred) => {
                    const ids = [];
                    if (cred?.source_document_id) ids.push(cred.source_document_id);
                    if (cred?.primary_document_id) ids.push(cred.primary_document_id);
                    if (Array.isArray(cred?.document_links)) {
                        cred.document_links.forEach(l => { if (l?.id) ids.push(l.id); });
                    }
                    const srcDocs = Array.isArray(cred?.source_documents) ? cred.source_documents : [];

                    // Try id matches first
                    const byId = documents.find(d => ids.includes(d.id));
                    if (byId) return byId;

                    // Fallback to legacy filename/name matches if no id match
                    const byName = documents.find(d =>
                        srcDocs.includes(d.id) ||
                        (d.filename && srcDocs.includes(d.filename)) ||
                        (d.name && srcDocs.includes(d.name))
                    );
                    return byName || null;
                };

                const documentsToReview = creditors
                    .filter(c => c?.needs_manual_review === true || c?.needs_manual_review === 'true')
                    .map(c => findDocForCreditor(c))
                    .filter(Boolean);

            //    console.log('documentsToReview', documentsToReview);

                // Only include clients that still need action:
                // either docs still need manual review OR the review session is not completed (awaiting button click)
                const reviewPending = documentsToReview.length > 0 || client.current_status === 'creditor_review';
                if (reviewPending) {
                    // Calculate priority based on various factors
                    let priority = 'medium';
                    const daysSincePayment = (Date.now() - new Date(client.payment_processed_at).getTime()) / (1000 * 60 * 60 * 24);
                    const avgConfidence = documentsToReview.reduce((sum, doc) => {
                        const relatedCreditor = creditors.find(c => c.document_id === doc.id);
                        return sum + (relatedCreditor?.confidence || 0);
                    }, 0) / documentsToReview.length;

                    // Priority logic
                    if (daysSincePayment > 3 || avgConfidence < 0.4) {
                        priority = 'high';
                    } else if (daysSincePayment > 1 || avgConfidence < 0.6) {
                        priority = 'medium';
                    } else {
                        priority = 'low';
                    }

                    availableClients.push({
                        id: client.id,
                        name: `${client.firstName} ${client.lastName}`,
                        aktenzeichen: client.aktenzeichen,
                        documents_to_review: documentsToReview.length,
                        total_documents: documents.length,
                        priority: priority,
                        payment_received_at: client.payment_processed_at,
                        days_since_payment: Math.round(daysSincePayment)
                    });
                }
            }

            // Sort by priority (high first) then by days since payment
            availableClients.sort((a, b) => {
                const priorityOrder = { high: 3, medium: 2, low: 1 };
                if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
                    return priorityOrder[b.priority] - priorityOrder[a.priority];
                }
                return b.days_since_payment - a.days_since_payment;
            });

            // Paginate results
            const total = availableClients.length;
            const pages = Math.max(Math.ceil(total / perPage), 1);
            const safePage = Math.min(page, pages);
            const start = (safePage - 1) * perPage;
            const end = start + perPage;
            const pagedClients = availableClients.slice(start, end);

            console.log(`📊 Found ${availableClients.length} clients needing review for agent ${req.agentUsername}`);

            res.json({
                success: true,
                clients: pagedClients,
                total,
                page: safePage,
                per_page: perPage,
                pages,
                confidence_threshold: config.MANUAL_REVIEW_CONFIDENCE_THRESHOLD
            });

        } catch (error) {
            console.error('❌ Error getting available clients:', error);
            res.status(500).json({
                error: 'Failed to get available clients',
                details: error.message
            });
        }
    },

    /**
     * Get review data for a specific client
     * GET /api/agent-review/:clientId
     */
    getClientReviewData: async (req, res) => {
        try {
            const { clientId } = req.params;

            console.log(`🔍 Agent Review: Getting review data for client ${clientId}`);

            const client = await Client.findOne({ id: clientId });

            if (!client) {
                return res.status(404).json({
                    error: 'Client not found',
                    client_id: clientId
                });
            }

            // Get documents that need review (creditor documents with low confidence)
            const documents = client.documents || [];
            const creditors = client.final_creditor_list || [];

             
            // Build docs-to-review directly from creditors that need manual review
            const findDocForCreditor = (cred) => {
                const ids = [];
                if (cred?.source_document_id) ids.push(cred.source_document_id);
                if (cred?.primary_document_id) ids.push(cred.primary_document_id);
                if (Array.isArray(cred?.document_links)) {
                    cred.document_links.forEach(l => { if (l?.id) ids.push(l.id); });
                }
                const srcDocs = Array.isArray(cred?.source_documents) ? cred.source_documents : [];

                // Try id matches first
                const byId = documents.find(d => ids.includes(d.id));
                if (byId) return byId;

                // Fallback to legacy filename/name matches if no id match
                const byName = documents.find(d =>
                    srcDocs.includes(d.id) ||
                    (d.filename && srcDocs.includes(d.filename)) ||
                    (d.name && srcDocs.includes(d.name))
                );
                return byName || null;
            };

            const documentsToReview = creditors
                .filter(c => c?.needs_manual_review === true || c?.needs_manual_review === 'true')
                .map(c => findDocForCreditor(c))
                .filter(Boolean);


            // Determine if we're in summary phase (all docs reviewed but session not completed)
            const hasCreditorManualFlags = creditors.some(c => c.needs_manual_review === true || c.needs_manual_review === 'true');
            const summaryPhase = documentsToReview.length === 0 &&
                !hasCreditorManualFlags &&
                (client.current_status === 'creditor_review' || client.current_status === 'awaiting_client_confirmation');

            console.log(`📊 Review data for ${client.aktenzeichen}: ${documentsToReview.length} docs need review; phase=${summaryPhase ? 'summary' : 'manual'}`);

            // Log document structure for debugging
            if (documentsToReview.length > 0) {
                console.log(`📄 First document to review:`, {
                    id: documentsToReview[0].id,
                    name: documentsToReview[0].name,
                    hasId: !!documentsToReview[0].id,
                    documentStructure: Object.keys(documentsToReview[0])
                });
            }

            // Build creditors with their associated documents for the new UI
            // Helper to check if a value is missing/empty
            const isMissingValue = (val) => {
                if (val === undefined || val === null) return true;
                if (typeof val === 'string') {
                    const trimmed = val.trim().toLowerCase();
                    if (!trimmed || trimmed === 'nicht gefunden' || trimmed === 'n/a' || trimmed === 'na') return true;
                }
                return false;
            };

            // Check needs_manual_review from linked document's validation flags
            // AND also check if email or address is missing (matches AdminCreditorDataTable.tsx logic)
            const creditorsWithDocuments = creditors.map(creditor => {
                const creditorDocs = getDocumentsForCreditor(creditor, documents);

                // Check if ANY linked document needs manual review (document-level flags)
                const documentNeedsReview = creditorDocs.some(doc =>
                    doc.manual_review_required === true ||
                    doc.validation?.requires_manual_review === true ||
                    doc.extracted_data?.manual_review_required === true
                );

                // Check if email OR address is missing for ANY creditor (not just creditor documents)
                const creditorEmail = creditor.email || creditor.sender_email;
                const creditorAddress = creditor.address || creditor.sender_address;
                const missingEmail = isMissingValue(creditorEmail);
                const missingAddress = isMissingValue(creditorAddress);
                const missingContactInfo = missingEmail || missingAddress;

                const needsManualReview = documentNeedsReview || missingContactInfo;

                // Collect review reasons from documents + add reason for missing contact info
                const allReviewReasons = [
                    ...creditorDocs.flatMap(doc => doc.validation?.review_reasons || [])
                ];
                if (missingContactInfo) {
                    if (missingEmail) allReviewReasons.push('E-Mail-Adresse fehlt');
                    if (missingAddress) allReviewReasons.push('Postadresse fehlt');
                }

                console.log(`   Creditor ${creditor.sender_name}: needsManualReview=${needsManualReview} (docFlag=${documentNeedsReview}, missingContact=${missingContactInfo})`);

                return {
                    creditor: creditor,
                    documents: creditorDocs,
                    needs_manual_review: needsManualReview,
                    review_reasons: [...new Set(allReviewReasons)] // Remove duplicates
                };
            });

            // Separate creditors needing review from verified ones
            const creditorsNeedingReview = creditorsWithDocuments.filter(c => c.needs_manual_review);
            const verifiedCreditorsWithDocs = creditorsWithDocuments.filter(c => !c.needs_manual_review);

            console.log(`📊 Creditors grouped: ${creditorsNeedingReview.length} need review, ${verifiedCreditorsWithDocs.length} verified`);

            res.json({
                success: true,
                client: {
                    id: client.id,
                    firstName: client.firstName,
                    lastName: client.lastName,
                    email: client.email,
                    aktenzeichen: client.aktenzeichen,
                    current_status: client.current_status
                },
                documents: {
                    all: documents,
                    need_review: documentsToReview,
                    total_count: documents.length,
                    review_count: documentsToReview.length
                },
                creditors: {
                    all: creditors,
                    // Use doc-based flags for need_review/verified (not confidence threshold)
                    need_review: creditorsNeedingReview.map(c => c.creditor),
                    verified: verifiedCreditorsWithDocs.map(c => c.creditor),
                    total_count: creditors.length,
                    review_count: creditorsNeedingReview.length,
                    // Creditors with their associated documents for the agent review UI
                    with_documents: creditorsWithDocuments,
                    needing_review_with_docs: creditorsNeedingReview,
                    verified_with_docs: verifiedCreditorsWithDocs
                },
                review_state: {
                    phase: summaryPhase ? 'summary' : 'manual'
                },
                review_diffs: Array.isArray(client.review_diffs) ? client.review_diffs : [],
                review_session: {
                    status: client.current_status,
                    progress: {
                        total_items: creditorsNeedingReview.length,
                        completed_items: 0, // Will be calculated based on corrections
                        remaining_items: creditorsNeedingReview.length
                    }
                }
            });

        } catch (error) {
            console.error('❌ Error getting review data:', error);
            res.status(500).json({
                error: 'Failed to get review data',
                details: error.message
            });
        }
    },

    /**
     * Save corrections for a specific document
     * POST /api/agent-review/:clientId/correct
     */
    saveCorrections: async (req, res) => {
        try {
            const { clientId } = req.params;
            const { document_id, creditor_id, corrections, action } = req.body; // action: 'correct', 'skip', 'confirm'

            console.log(`✏️ Agent Review: Saving corrections for client ${clientId}, document ${document_id}, creditor ${creditor_id}, action: ${action}`);

            // Enhanced input validation with debugging
            console.log(`📝 Correction request data:`, {
                document_id,
                creditor_id,
                action,
                corrections: corrections ? Object.keys(corrections) : 'null',
                agentId: req.agentId,
                agentUsername: req.agentUsername
            });

            // Either document_id or creditor_id is required
            if (!document_id && !creditor_id) {
                console.log(`❌ Missing both document_id and creditor_id in correction request`);
                return res.status(400).json({
                    error: 'Either document_id or creditor_id is required'
                });
            }

            if (!action || !['correct', 'skip', 'confirm'].includes(action)) {
                console.log(`❌ Invalid action: ${action}`);
                return res.status(400).json({
                    error: 'Valid action is required (correct, skip, confirm)'
                });
            }

            if (action === 'correct' && (!corrections || typeof corrections !== 'object')) {
                console.log(`❌ Missing corrections for action 'correct':`, corrections);
                return res.status(400).json({
                    error: 'corrections object is required for correct action'
                });
            }

            const client = await Client.findOne({ id: clientId });

            if (!client) {
                return res.status(404).json({
                    error: 'Client not found',
                    client_id: clientId
                });
            }

            // Safe document lookup - document is optional now
            const documents = client.documents || [];
            let document = null;
            if (document_id) {
                document = documents.find(d => d.id === document_id);
                // Document not found is only an error if we don't have a creditor_id fallback
                if (!document && !creditor_id) {
                    return res.status(404).json({
                        error: 'Document not found',
                        document_id: document_id
                    });
                }
            }

            // Helper to build diff entry
            const buildDiff = (docObj, origCred, updatedCred, creditorId, prevOriginal, clientOriginal) => {
                const pickFields = (c) => {
                    const res = {};
                    if (!c) return res;
                    const setIf = (key, val) => {
                        if (val !== undefined && val !== null && val !== '') {
                            res[key] = val;
                        }
                    };
                    // Prefer German fields; fallback to English fields on the same creditor object
                    setIf('sender_name', c.glaeubiger_name ?? c.sender_name);
                    setIf('sender_email', c.email_glaeubiger ?? c.sender_email);
                    setIf('sender_address', c.glaeubiger_adresse ?? c.sender_address);
                    setIf('reference_number', c.reference_number);
                    const amt = c.claim_amount ?? (c.claim_amount_raw ? parseFloat(c.claim_amount_raw) : undefined);
                    if (amt !== undefined && !isNaN(amt)) setIf('claim_amount', amt);
                    setIf('dokumenttyp', c.dokumenttyp);
                    return res;
                };

                const originalPicked = clientOriginal && Object.keys(clientOriginal).length ? clientOriginal : pickFields(origCred);
                const original = Object.keys(originalPicked).length ? originalPicked : {};
                const updated = pickFields(updatedCred);

                const docId = docObj?.id || docObj?.document_id || docObj?.documentId || docObj?.name;
                const credId = creditorId || updatedCred?.id || origCred?.id;

                // Preserve the very first "original" snapshot if it already exists for this key
                const finalOriginal = prevOriginal || original;

                return {
                    docId,
                    creditorId: credId,
                    key: `${docId || 'unknown'}:${credId || 'unknown'}`,
                    name: docObj?.name || docObj?.filename || docObj?.id,
                    creditor_name: updatedCred?.sender_name || updatedCred?.glaeubiger_name || origCred?.sender_name || origCred?.glaeubiger_name,
                    original: finalOriginal,
                    updated,
                    reviewed_at: new Date()
                };
            };

            // Find related creditor - try multiple methods
            let creditorIndex = -1;
            const creditors = client.final_creditor_list || [];

            const docId = document?.id || document_id || null;
            const docName = document ? (document.name || '') : '';
            const docFilename = document ? (document.filename || '') : '';

            const matchesDocLinks = (c) => {
                if (!docId && !docName && !docFilename) return false;
                
                // Direct ID matches (most reliable)
                if (docId) {
                    if (c.primary_document_id === docId) return true;
                    if (c.document_id === docId) return true;
                    if (c.source_document_id === docId) return true;
                }
                
                // Name/filename matches (flexible matching for timestamp prefixes)
                if (docName || docFilename) {
                    // Check source_document field
                    if (c.source_document) {
                        const srcDoc = c.source_document;
                        if (docName && (srcDoc === docName || docName.endsWith(srcDoc) || srcDoc.endsWith(docName))) return true;
                        if (docFilename && (srcDoc === docFilename || docFilename.endsWith(srcDoc) || srcDoc.endsWith(docFilename))) return true;
                    }
                    
                    // Check source_documents array
                    if (Array.isArray(c.source_documents)) {
                        if (c.source_documents.some(s => {
                            if (!s) return false;
                            if (docId && s === docId) return true;
                            if (docName && (s === docName || docName.endsWith(s) || s.endsWith(docName))) return true;
                            if (docFilename && (s === docFilename || docFilename.endsWith(s) || s.endsWith(docFilename))) return true;
                            return false;
                        })) return true;
                    }
                    
                    // Check document_links array
                    if (Array.isArray(c.document_links)) {
                        if (c.document_links.some(l => {
                            if (!l) return false;
                            if (docId && l.id === docId) return true;
                            if (docName && l.name && (l.name === docName || docName.endsWith(l.name) || l.name.endsWith(docName))) return true;
                            if (docFilename && l.filename && (l.filename === docFilename || docFilename.endsWith(l.filename) || l.filename.endsWith(docFilename))) return true;
                            return false;
                        })) return true;
                    }
                }
                
                return false;
            };

            // Method 1: Find by creditor_id directly
            if (creditor_id) {
                creditorIndex = creditors.findIndex(c => c.id === creditor_id);
                console.log(`   Looking for creditor by id ${creditor_id}: found at index ${creditorIndex}`);
            }

            // Method 2: Find by document_id or source_document (IMPORTANT: This must run even if creditor_id was provided but not found)
            if (creditorIndex === -1 && document_id) {
                console.log(`   Creditor not found by ID, trying document matching for document_id: ${document_id}`);
                for (let i = 0; i < creditors.length; i++) {
                    if (matchesDocLinks(creditors[i])) {
                        creditorIndex = i;
                        console.log(`   ✅ Found creditor "${creditors[i].sender_name}" by document match at index ${creditorIndex}`);
                        break;
                    }
                }
                if (creditorIndex === -1) {
                    console.log(`   ⚠️ No creditor found by document matching for document_id: ${document_id}`);
                    // Log all creditors for debugging
                    console.log(`   Available creditors:`, creditors.map((c, idx) => ({
                        index: idx,
                        id: c.id,
                        name: c.sender_name,
                        document_id: c.document_id,
                        source_document_id: c.source_document_id,
                        primary_document_id: c.primary_document_id,
                        source_document: c.source_document,
                        source_documents: c.source_documents
                    })));
                }
            }

            if (action === 'correct' && corrections) {
                // Apply corrections
                if (creditorIndex >= 0 && creditorIndex < creditors.length) {
                    // Update existing creditor - safe access
                    const existing = creditors[creditorIndex];
                    const originalData = { ...existing };

                    console.log(`✅ Updating existing creditor "${existing.sender_name}" (index: ${creditorIndex}, id: ${existing.id})`);

                    // Helper to prefer provided non-empty values, else keep existing
                    const pick = (incoming, current) => {
                        if (incoming === undefined || incoming === null) return current;
                        if (typeof incoming === 'string' && incoming.trim() === '') return current;
                        return incoming;
                    };

                    const parsedCorrectionAmount = (corrections.claim_amount !== undefined)
                        ? parseFloat(corrections.claim_amount)
                        : undefined;

                    const updated = {
                        ...existing,
                        dokumenttyp: existing.dokumenttyp || document?.extracted_data?.classification?.document_type || existing.dokumenttyp,
                        // English fields
                        sender_name: pick(corrections.sender_name, existing.sender_name),
                        sender_email: pick(corrections.sender_email, existing.sender_email),
                        sender_address: pick(corrections.sender_address, existing.sender_address),
                        reference_number: pick(corrections.reference_number, existing.reference_number),
                        claim_amount: (parsedCorrectionAmount !== undefined && !isNaN(parsedCorrectionAmount))
                            ? parsedCorrectionAmount
                            : existing.claim_amount,
                        claim_amount_raw: pick(corrections.claim_amount_raw, existing.claim_amount_raw),

                        // German fields (mirror from English inputs)
                        glaeubiger_name: pick(corrections.sender_name, existing.glaeubiger_name ?? existing.sender_name),
                        glaeubiger_adresse: pick(corrections.sender_address, existing.glaeubiger_adresse ?? existing.sender_address),
                        email_glaeubiger: pick(corrections.sender_email, existing.email_glaeubiger ?? existing.sender_email),

                        // Preserve representative fields unless explicitly provided
                        glaeubigervertreter_name: pick(corrections.glaeubigervertreter_name, existing.glaeubigervertreter_name),
                        glaeubigervertreter_adresse: pick(corrections.glaeubigervertreter_adresse, existing.glaeubigervertreter_adresse),
                        email_glaeubiger_vertreter: pick(corrections.email_glaeubiger_vertreter, existing.email_glaeubiger_vertreter),

                        primary_document_id: existing.primary_document_id || docId || existing.document_id,
                        document_links: (() => {
                            const links = Array.isArray(existing.document_links) ? [...existing.document_links] : [];
                            const addLink = (l) => {
                                if (!l) return;
                                const key = `${l.id || ''}|${l.name || ''}|${l.filename || ''}`;
                                if (!links.some(x => `${x.id || ''}|${x.name || ''}|${x.filename || ''}` === key)) {
                                    links.push(l);
                                }
                            };
                            addLink({ id: docId, name: docName || existing.source_document, filename: docFilename });
                            return links;
                        })(),

                        // Preserve source_documents; only add docId if none exist
                        source_document_id: existing.source_document_id || docId || existing.document_id,
                        source_documents: (() => {
                            const arr = Array.isArray(existing.source_documents) ? [...existing.source_documents] : [];
                            if (arr.length === 0 && docId) arr.push(docId);
                            // Also ensure docId is in the array if not already present
                            if (docId && !arr.includes(docId) && !arr.some(s => s === docName || s === docFilename)) {
                                arr.push(docId);
                            }
                            return arr;
                        })(),

                        confidence: 1.0, // Manual correction = 100% confidence
                        status: 'confirmed', // Change status from pending to confirmed
                        manually_reviewed: true,
                        needs_manual_review: false,
                        review_reasons: Array.isArray(corrections.review_reasons)
                            ? corrections.review_reasons
                            : [],
                        reviewed_by: req.agentId,
                        reviewed_at: new Date(),
                        confirmed_at: new Date(), // Add confirmation timestamp
                        original_ai_data: originalData,
                        correction_notes: pick(corrections.notes, existing.correction_notes),
                        review_action: 'corrected'
                    };

                    creditors[creditorIndex] = updated;

                    // Store diff
                    client.review_diffs = client.review_diffs || [];
                    const existingDiff = client.review_diffs?.find(d => d.key === `${document?.id || docId || 'unknown'}:${(creditor_id || existing.id) || 'unknown'}`);
                    const newDiff = buildDiff(
                        document || { id: docId, name: docName, filename: docFilename },
                        originalData,
                        updated,
                        updated.id || existing.id,
                        existingDiff?.original,
                        req.body.original
                    );
                    const existingIdx = client.review_diffs.findIndex(d => d.key === newDiff.key);
                    if (existingIdx >= 0) client.review_diffs[existingIdx] = newDiff;
                    else client.review_diffs.push(newDiff);

                    console.log(`✅ Successfully updated existing creditor "${updated.sender_name}" (creditor_id: ${creditor_id || existing.id}, document_id: ${document_id})`);
                } else if (document) {
                    // CRITICAL: Only create new creditor if we truly can't find an existing one
                    // This should be rare - most documents should already have associated creditors
                    console.log(`⚠️ WARNING: Creating NEW creditor for document ${document_id} - no existing creditor found!`);
                    console.log(`   This may indicate a data integrity issue. Document: ${document.name || document_id}`);
                    console.log(`   Attempted to find creditor by: creditor_id=${creditor_id}, document_id=${document_id}`);
                    // Create new creditor from corrections (we have a document)
                    const parsedCorrectionAmount = (corrections.claim_amount !== undefined)
                        ? parseFloat(corrections.claim_amount)
                        : undefined;
                    const claimAmount = (parsedCorrectionAmount !== undefined && !isNaN(parsedCorrectionAmount))
                        ? parsedCorrectionAmount
                        : (document.extracted_data?.creditor_data?.claim_amount || 0);

                    const newCreditor = {
                        id: uuidv4(),
                        document_id: document_id,
                        primary_document_id: document_id,
                        source_document: document.name,
                        source_document_id: document_id,
                        source_documents: (() => {
                            const vals = [document.name, document.filename, document_id].filter(Boolean);
                            // Prefer name if available, else filename, else id
                            return vals.length ? [vals[0]] : [];
                        })(),
                        sender_name: corrections.sender_name || 'Unbekannt',
                        sender_email: corrections.sender_email || '',
                        sender_address: corrections.sender_address || '',
                        reference_number: corrections.reference_number || '',
                        claim_amount: isNaN(claimAmount) ? 0 : claimAmount,
                        claim_amount_raw: corrections.claim_amount_raw,
                        glaeubiger_name: corrections.sender_name || corrections.glaeubiger_name,
                        glaeubiger_adresse: corrections.sender_address || corrections.glaeubiger_adresse,
                        glaeubigervertreter_name: corrections.glaeubigervertreter_name,
                        glaeubigervertreter_adresse: corrections.glaeubigervertreter_adresse,
                        email_glaeubiger: corrections.sender_email || corrections.email_glaeubiger,
                        email_glaeubiger_vertreter: corrections.email_glaeubiger_vertreter,
                        dokumenttyp: document?.extracted_data?.classification?.document_type || document?.type || corrections.dokumenttyp,
                        document_links: [
                            { id: document_id, name: document.name, filename: document.filename }
                        ],
                        confidence: 1.0, // Manual entry = 100% confidence
                        status: 'confirmed', // New creditors from manual review are confirmed
                        manually_reviewed: true,
                        needs_manual_review: false,
                        review_reasons: Array.isArray(corrections.review_reasons)
                            ? corrections.review_reasons
                            : [],
                        reviewed_by: req.agentId,
                        reviewed_at: new Date(),
                        confirmed_at: new Date(), // Add confirmation timestamp
                        created_via: 'manual_review',
                        correction_notes: corrections.notes || ''
                    };

                    // Before creating, do one final check to see if a similar creditor already exists
                    // (maybe with slightly different linking that we missed)
                    const similarCreditor = creditors.find(c => {
                        // Check if creditor has same name and similar amount (within 10%)
                        const nameMatch = c.sender_name && corrections.sender_name && 
                                         c.sender_name.toLowerCase().trim() === corrections.sender_name.toLowerCase().trim();
                        const amountMatch = c.claim_amount && corrections.claim_amount &&
                                          Math.abs(c.claim_amount - corrections.claim_amount) / Math.max(c.claim_amount, corrections.claim_amount) < 0.1;
                        return nameMatch && amountMatch;
                    });

                    if (similarCreditor) {
                        console.log(`⚠️ Found similar existing creditor "${similarCreditor.sender_name}" - updating instead of creating duplicate`);
                        const similarIndex = creditors.findIndex(c => c.id === similarCreditor.id);
                        if (similarIndex >= 0) {
                            // Update the similar creditor instead
                            const existing = creditors[similarIndex];
                            Object.assign(creditors[similarIndex], {
                                ...newCreditor,
                                id: existing.id, // Keep existing ID
                                document_id: existing.document_id || newCreditor.document_id,
                                source_document_id: existing.source_document_id || newCreditor.source_document_id,
                                primary_document_id: existing.primary_document_id || newCreditor.primary_document_id,
                                source_documents: Array.isArray(existing.source_documents) 
                                    ? [...new Set([...existing.source_documents, ...newCreditor.source_documents])]
                                    : newCreditor.source_documents,
                                document_links: Array.isArray(existing.document_links)
                                    ? [...existing.document_links, ...newCreditor.document_links].filter((link, idx, arr) => 
                                        arr.findIndex(l => l.id === link.id && l.name === link.name) === idx
                                      )
                                    : newCreditor.document_links
                            });
                            console.log(`✅ Updated similar creditor instead of creating duplicate`);
                        } else {
                            creditors.push(newCreditor);
                            console.log(`✅ Created new creditor for document ${document_id}`);
                        }
                    } else {
                        creditors.push(newCreditor);
                        console.log(`✅ Created new creditor for document ${document_id}`);
                    }

                    // Store diff for newly created creditor
                    client.review_diffs = client.review_diffs || [];
                    const existingDiff = client.review_diffs?.find(d => d.key === `${document?.id || document_id || 'unknown'}:${newCreditor.id || 'unknown'}`);
                    const newDiff = buildDiff(
                        document,
                        {},
                        newCreditor,
                        newCreditor.id,
                        existingDiff?.original,
                        req.body.original
                    );
                    const existingIdx = client.review_diffs.findIndex(d => d.key === newDiff.key);
                    if (existingIdx >= 0) client.review_diffs[existingIdx] = newDiff;
                    else client.review_diffs.push(newDiff);
                } else {
                    // No existing creditor and no document - cannot correct
                    console.log(`⚠️ Cannot correct: creditor not found (creditor_id: ${creditor_id}) and no document available`);
                    return res.status(404).json({
                        error: 'Creditor not found for correction',
                        creditor_id: creditor_id,
                        document_id: document_id
                    });
                }
            } else if (action === 'skip') {
                // Remove creditor from list when skipped (document is not a creditor document)
                if (creditorIndex >= 0 && creditorIndex < creditors.length) {
                    // Remove the creditor completely from the list
                    const removedCreditor = creditors.splice(creditorIndex, 1)[0];
                    console.log(`❌ Removed creditor "${removedCreditor.sender_name}" from list - marked as non-creditor`);
                } else {
                    console.log(`⏭️ No creditor found to remove (creditor_id: ${creditor_id}, document_id: ${document_id})`);
                }

                // Also mark the document as not a creditor document (if we have one)
                if (document) {
                    document.is_creditor_document = false;
                    document.document_status = 'not_a_creditor'; // CRITICAL: Change document_status to prevent re-generation
                    document.manually_reviewed = true;
                    document.reviewed_by = req.agentId;
                    document.reviewed_at = new Date();
                    document.review_action = 'skipped_not_creditor';
                    
                    // ✅ CRITICAL FIX: Clear document-level manual review flags to prevent loop
                    if (document.validation) {
                        document.validation.requires_manual_review = false;
                    }
                    if (document.extracted_data) {
                        document.extracted_data.manual_review_required = false;
                    }
                    document.manual_review_required = false;
                    
                    console.log(`⏭️ Document ${document_id} marked as non-creditor document with document_status='not_a_creditor'`);
                }
            } else if (action === 'confirm') {
                // Confirm AI extraction is correct
                if (creditorIndex >= 0 && creditorIndex < creditors.length) {
                    // Update existing creditor
                    const originalData = { ...creditors[creditorIndex] };
                    Object.assign(creditors[creditorIndex], {
                        confidence: 1.0, // Confirmed = 100% confidence
                        status: 'confirmed', // Change status from pending to confirmed
                        manually_reviewed: true,
                        needs_manual_review: false,
                        review_reasons: Array.isArray(creditors[creditorIndex]?.review_reasons)
                            ? creditors[creditorIndex].review_reasons
                            : [],
                        reviewed_by: req.agentId,
                        reviewed_at: new Date(),
                        confirmed_at: new Date(), // Add confirmation timestamp
                        review_action: 'confirmed'
                    });
                    // Store diff for confirm (may be identical)
                    client.review_diffs = client.review_diffs || [];
                    const existingDiff = client.review_diffs?.find(d => d.key === `${document?.id || docId || 'unknown'}:${(creditor_id || creditors[creditorIndex]?.id || originalData?.id) || 'unknown'}`);
                    const newDiff = buildDiff(
                        document || { id: docId, name: docName, filename: docFilename },
                        originalData,
                        creditors[creditorIndex],
                        creditors[creditorIndex]?.id || originalData?.id,
                        existingDiff?.original,
                        req.body.original
                    );
                    const existingIdx = client.review_diffs.findIndex(d => d.key === newDiff.key);
                    if (existingIdx >= 0) client.review_diffs[existingIdx] = newDiff;
                    else client.review_diffs.push(newDiff);
                    console.log(`✅ Confirmed existing creditor (index ${creditorIndex}) - creditor_id: ${creditor_id}, document_id: ${document_id}`);
                } else if (document) {
                    // No existing creditor found but we have a document - create one from document AI data
                    const creditorData = document.extracted_data?.creditor_data;
                    if (creditorData) {
                        const newCreditor = {
                            id: uuidv4(),
                            document_id: document_id,
                            source_document: document.name,
                            sender_name: creditorData.sender_name || 'Unbekannter Gläubiger',
                            sender_email: creditorData.sender_email || '',
                            sender_address: creditorData.sender_address || '',
                            reference_number: creditorData.reference_number || '',
                            claim_amount: creditorData.claim_amount || 0,
                            is_representative: creditorData.is_representative || false,
                            actual_creditor: creditorData.actual_creditor || creditorData.sender_name,
                            ai_confidence: document.extracted_data?.confidence || 0,
                            confidence: 1.0, // Confirmed = 100% confidence
                            status: 'confirmed',
                            manually_reviewed: true,
                            needs_manual_review: false,
                            review_reasons: Array.isArray(corrections.review_reasons)
                                ? corrections.review_reasons
                                : [],
                            reviewed_by: req.agentId,
                            reviewed_at: new Date(),
                            confirmed_at: new Date(),
                            created_via: 'agent_confirmation',
                            review_action: 'confirmed'
                        };

                        creditors.push(newCreditor);
                        console.log(`✅ Created new confirmed creditor from AI data for document ${document_id}: ${newCreditor.sender_name}`);
                    } else {
                        console.log(`⚠️ No AI creditor data found for document ${document_id} - cannot confirm`);
                    }
                } else {
                    // No creditor found and no document - cannot confirm
                    console.log(`⚠️ Cannot confirm: creditor not found (creditor_id: ${creditor_id}) and no document available`);
                    return res.status(404).json({
                        error: 'Creditor not found',
                        creditor_id: creditor_id,
                        document_id: document_id
                    });
                }
            }

            // Run duplicate check on creditors after agent confirmation
            if (action === 'confirm' && creditors.length > 0) {
                const deduplicatedCreditors = creditorDeduplication.deduplicateCreditors(creditors, 'highest_amount');

                if (deduplicatedCreditors.length < creditors.length) {
                    console.log(`🔍 Duplicate check after agent confirmation for ${clientId}: ${creditors.length - deduplicatedCreditors.length} duplicates removed, ${deduplicatedCreditors.length} creditors remaining`);
                }

                // Update the client's final_creditor_list with deduplicated creditors
                client.final_creditor_list = deduplicatedCreditors;
            } else {
                // Update the client with corrected data (no deduplication needed)
                client.final_creditor_list = creditors;
            }

            // Ensure every creditor has an id and finalize review flags
            if (Array.isArray(client.final_creditor_list)) {
                client.final_creditor_list = client.final_creditor_list.map(c => {
                    const safeId = c.id || uuidv4();
                    return {
                        ...c,
                        id: safeId,
                        needs_manual_review: c.manually_reviewed ? false : c.needs_manual_review,
                        review_reasons: Array.isArray(c.review_reasons) ? c.review_reasons : []
                    };
                });
            }

            // Update the client with corrected data
            console.log(`🔄 Updating client ${clientId} with corrected data...`);
            client.updated_at = new Date();

            // Mark document as reviewed (if we have one)
            if (document) {
                console.log(`📝 Marking document ${document_id} as reviewed...`);
                document.manually_reviewed = true;
                document.reviewed_at = new Date();
                document.reviewed_by = req.agentId;
                
                // ✅ CRITICAL FIX: Clear document-level manual review flags to prevent loop
                if (document.validation) {
                    document.validation.requires_manual_review = false;
                }
                if (document.extracted_data) {
                    document.extracted_data.manual_review_required = false;
                }
                document.manual_review_required = false;
            }

            console.log(`💾 Saving client to database...`);
            await client.save();
            console.log(`✅ Client saved successfully`);

            console.log(`📊 Calculating review progress...`);

            // Calculate review progress
            const documentsToReview = client.documents.filter(d => d.is_creditor_document === true);
            const reviewedDocuments = documentsToReview.filter(d => d.manually_reviewed === true);
            const progress = {
                total_items: documentsToReview.length,
                completed_items: reviewedDocuments.length,
                remaining_items: documentsToReview.length - reviewedDocuments.length
            };

            res.json({
                success: true,
                message: `Document ${action}ed successfully`,
                document_id: document_id,
                action: action,
                creditors_count: creditors.length,
                progress: progress,
                is_review_complete: progress.remaining_items === 0
            });

        } catch (error) {
            console.error('❌ Error saving corrections:', error);
            console.error('Error stack:', error.stack);
            console.error('Client ID:', req.params.clientId);
            console.error('Document ID:', req.body.document_id);
            console.error('Action:', req.body.action);
            console.error('Corrections:', JSON.stringify(req.body.corrections || {}, null, 2));

            res.status(500).json({
                error: 'Failed to save corrections',
                details: error.message,
                debug: {
                    clientId: req.params.clientId,
                    documentId: req.body.document_id,
                    action: req.body.action,
                    errorType: error.constructor.name
                }
            });
        }
    },

    /**
     * Complete the review session
     * POST /api/agent-review/:clientId/complete
     *
     * After agent completes review:
     * 1. Set admin_approved = true
     * 2. Set status to awaiting_client_confirmation
     * 3. Send email to client with creditor list
     * 4. Creditors become visible in client portal
     */
    completeReviewSession: async (req, res) => {
        try {
            const { clientId } = req.params;
            const agentId = req.agentId || req.agentUsername || 'agent';

            console.log(`🏁 Agent Review: Completing review session for client ${clientId}`);

            const client = await Client.findOne({ id: clientId });

            if (!client) {
                return res.status(404).json({
                    error: 'Client not found',
                    client_id: clientId
                });
            }

            // Check creditors that need manual review and haven't been reviewed yet
            const creditors = client.final_creditor_list || [];
            const documents = client.documents || [];

            // Helper to check if a value is missing/empty
            const isMissingValue = (val) => {
                if (val === undefined || val === null) return true;
                if (typeof val === 'string') {
                    const trimmed = val.trim().toLowerCase();
                    if (!trimmed || trimmed === 'nicht gefunden' || trimmed === 'n/a' || trimmed === 'na') return true;
                }
                return false;
            };

            // Helper to check if creditor needs review (document flags OR missing contact info)
            // Match same logic as AdminCreditorDataTable.tsx
            const creditorNeedsManualReview = (creditor) => {
                // Check linked document's flags (flexible matching for timestamp prefixes)
                const linkedDocs = documents.filter(doc =>
                    creditor.document_id === doc.id ||
                    creditor.source_document === doc.name ||
                    (creditor.source_documents && creditor.source_documents.some(srcDoc =>
                        srcDoc === doc.name || srcDoc.endsWith(doc.name) || doc.name.endsWith(srcDoc)
                    ))
                );

                const documentNeedsReview = linkedDocs.some(doc =>
                    doc.manual_review_required === true ||
                    doc.validation?.requires_manual_review === true ||
                    doc.extracted_data?.manual_review_required === true
                );

                // Check if email OR address is missing for ANY creditor (not just creditor documents)
                const creditorEmail = creditor.email || creditor.sender_email;
                const creditorAddress = creditor.address || creditor.sender_address;
                const missingEmail = isMissingValue(creditorEmail);
                const missingAddress = isMissingValue(creditorAddress);
                const missingContactInfo = missingEmail || missingAddress;

                return documentNeedsReview || missingContactInfo;
            };

            // Find unreviewed creditors that need manual review
            const unreviewed_manual_review = creditors.filter(c => {
                const needsReview = creditorNeedsManualReview(c);
                const wasReviewed = c.manually_reviewed === true || c.status === 'confirmed';
                return needsReview && !wasReviewed;
            });

            if (unreviewed_manual_review.length > 0) {
                console.log(`⚠️ Cannot complete review: ${unreviewed_manual_review.length} creditors need manual review`);
                console.log(`   Unreviewed creditors:`, unreviewed_manual_review.map(c => c.sender_name));
                return res.status(400).json({
                    error: 'Review incomplete',
                    creditors_remaining: unreviewed_manual_review.length,
                    creditor_names: unreviewed_manual_review.map(c => c.sender_name)
                });
            }

            // Auto-confirm all creditors that don't need manual review
            let autoConfirmedCount = 0;
            creditors.forEach(c => {
                if (!c.manually_reviewed && !creditorNeedsManualReview(c)) {
                    c.manually_reviewed = true;
                    c.status = 'confirmed';
                    c.confirmed_at = new Date();
                    c.review_action = 'auto_confirmed_no_manual_review_needed';
                    autoConfirmedCount++;
                }
            });

            if (autoConfirmedCount > 0) {
                console.log(`✅ Auto-confirmed ${autoConfirmedCount} creditors (no document-level manual review flags)`);
            }

            // Also mark all creditor documents as reviewed
            documents.forEach(doc => {
                if (doc.is_creditor_document === true && !doc.manually_reviewed) {
                    doc.manually_reviewed = true;
                    doc.reviewed_at = new Date();
                    doc.reviewed_by = agentId;
                    doc.review_action = 'auto_reviewed_at_completion';
                    
                    // ✅ CRITICAL FIX: Clear document-level manual review flags to prevent loop
                    if (doc.validation) {
                        doc.validation.requires_manual_review = false;
                    }
                    if (doc.extracted_data) {
                        doc.extracted_data.manual_review_required = false;
                    }
                    doc.manual_review_required = false;
                }
            });

            // Calculate total debt for email
            const totalDebt = creditors.reduce((sum, c) => sum + (c.claim_amount || 0), 0);

            // Update final_creditor_list with any auto-confirmations
            client.final_creditor_list = creditors;

            // Update client status - AUTO APPROVE and set to awaiting_client_confirmation
            client.current_status = 'awaiting_client_confirmation';
            client.admin_approved = true;
            client.admin_approved_at = new Date();
            client.admin_approved_by = agentId;
            client.updated_at = new Date();
            client.review_diffs = []; // clear diffs after completion

            // Add status history
            client.status_history = client.status_history || [];
            client.status_history.push({
                id: uuidv4(),
                status: 'awaiting_client_confirmation',
                changed_by: 'agent',
                metadata: {
                    agent_id: agentId,
                    agent_action: 'Review completed - auto approved',
                    creditors_count: creditors.length,
                    total_debt: totalDebt,
                    admin_approved: true,
                }
            });

            await client.save();

            console.log(`✅ Review complete for ${client.aktenzeichen}. Status: awaiting_client_confirmation, admin_approved: true`);

            // SEND EMAIL TO CLIENT with creditor list
            let clientEmailSent = false;
            const zendesk_ticket_id = client.zendesk_review_ticket_id || client.zendesk_ticket_id;

            if (zendeskService && zendeskService.isConfigured() && creditors.length > 0) {
                try {
                    console.log(`📧 Sending creditor confirmation email to client ${client.email}`);

                    const portalUrl = `${process.env.FRONTEND_URL || "https://mandanten-portal.onrender.com"}/portal?token=${client.portal_token}`;

                    const emailContent = generateCreditorConfirmationEmailContent(
                        client,
                        creditors,
                        portalUrl,
                        totalDebt
                    );

                    // If we have a ticket, add public comment (sends email)
                    if (zendesk_ticket_id) {
                        const emailResult = await zendeskService.addPublicComment(zendesk_ticket_id, {
                            content: emailContent.plainText,
                            htmlContent: emailContent.html,
                            tags: ["creditor-confirmation-email-sent", "agent-review-completed"],
                        });

                        if (emailResult?.success) {
                            clientEmailSent = true;
                            console.log(`✅ Creditor confirmation email sent to ${client.email} via Zendesk ticket ${zendesk_ticket_id}`);
                        } else {
                            console.error(`❌ Failed to send email via Zendesk: ${emailResult?.error}`);
                        }
                    } else {
                        // No ticket - create new ticket and send email
                        console.log(`📧 No existing ticket found, creating new ticket for email...`);

                        const ticketResult = await zendeskService.createTicket({
                            subject: `Gläubigerliste zur Bestätigung: ${client.firstName} ${client.lastName} (${client.aktenzeichen})`,
                            content: emailContent.plainText,
                            requesterEmail: client.email,
                            requesterName: `${client.firstName || ''} ${client.lastName || ''}`.trim() || client.email,
                            tags: ["creditor-confirmation", "agent-review-completed"],
                            priority: "normal",
                            type: "task",
                        });

                        if (ticketResult?.success || ticketResult?.ticket_id) {
                            // Add public comment to send email
                            const emailResult = await zendeskService.addPublicComment(ticketResult.ticket_id, {
                                content: emailContent.plainText,
                                htmlContent: emailContent.html,
                                tags: ["creditor-confirmation-email-sent"],
                            });

                            if (emailResult?.success) {
                                clientEmailSent = true;
                                client.zendesk_review_ticket_id = ticketResult.ticket_id;
                                await client.save();
                                console.log(`✅ New ticket created and email sent: ${ticketResult.ticket_id}`);
                            }
                        }
                    }
                } catch (emailError) {
                    console.error(`❌ Error sending creditor confirmation email:`, emailError.message);
                }
            } else {
                console.log(`⚠️ Zendesk not configured or no creditors - skipping email`);
            }

            const portalUrl = `${process.env.FRONTEND_URL || "https://mandanten-portal.onrender.com"}/portal?token=${client.portal_token}`;

            res.json({
                success: true,
                message: 'Review session completed - Client notified',
                client: {
                    id: client.id,
                    current_status: client.current_status,
                    admin_approved: client.admin_approved
                },
                creditors_count: creditors.length,
                total_debt: totalDebt,
                client_email_sent: clientEmailSent,
                portal_url: portalUrl,
                next_step: clientEmailSent
                    ? 'Email mit Gläubigerliste wurde an den Mandanten gesendet. Mandant kann im Portal bestätigen.'
                    : 'Gläubiger sind im Portal sichtbar. Email konnte nicht gesendet werden.'
            });

        } catch (error) {
            console.error('❌ Error completing review session:', error);
            res.status(500).json({
                error: 'Failed to complete review session',
                details: error.message
            });
        }
    }
    };
};

module.exports = createAgentReviewController;
