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

        const creditorListPlain = creditors
            .map((c, i) => `${i + 1}. ${c.sender_name || "Unbekannt"} - €${(c.claim_amount || 0).toLocaleString("de-DE")}`)
            .join("\n");

        const creditorListHtml = creditors
            .map((c, i) => `
                <tr>
                    <td style="padding: 12px 15px; border-bottom: 1px solid #e9ecef;">${i + 1}</td>
                    <td style="padding: 12px 15px; border-bottom: 1px solid #e9ecef; font-weight: 500;">${c.sender_name || "Unbekannt"}</td>
                    <td style="padding: 12px 15px; border-bottom: 1px solid #e9ecef; text-align: right; font-weight: 600; color: #dc3545;">€${(c.claim_amount || 0).toLocaleString("de-DE")}</td>
                </tr>
            `)
            .join("");

        const plainText = `
📋 Ihre Gläubigerliste zur Überprüfung

Sehr geehrte/r ${firstName} ${lastName},

wir haben Ihre hochgeladenen Dokumente geprüft und folgende Gläubiger identifiziert:

${creditorListPlain}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Gesamtschulden: €${totalDebt.toLocaleString("de-DE")}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔍 Was Sie jetzt tun sollten:

1. Überprüfen Sie die Liste auf Vollständigkeit und Richtigkeit
2. Falls Gläubiger fehlen, laden Sie weitere Dokumente hoch
3. Bestätigen Sie die Gläubigerliste in Ihrem Portal

👉 Jetzt im Portal überprüfen:
${portalUrl}

Wichtig:
• Sie können jederzeit weitere Dokumente hochladen
• Erst nach Ihrer Bestätigung werden wir die Gläubiger kontaktieren
• Bei Fragen stehen wir Ihnen gerne zur Verfügung

Mit freundlichen Grüßen
Ihr Team von Rechtsanwalt Thomas Scuric

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
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; line-height: 1.6; color: #2c3e50; background: #f8f9fa; margin: 0; padding: 0;">
    <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 20px; margin-bottom: 20px;">
        <div style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); color: white; padding: 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px; font-weight: 600;">📋 Ihre Gläubigerliste</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 16px;">wurde geprüft und ist bereit</p>
        </div>
        <div style="padding: 30px;">
            <p style="font-size: 16px; margin-bottom: 20px;">
                Sehr geehrte/r <strong>${firstName} ${lastName}</strong>,
            </p>
            <p style="font-size: 15px; color: #5a6c7d; margin-bottom: 25px;">
                wir haben Ihre hochgeladenen Dokumente geprüft und folgende Gläubiger identifiziert:
            </p>
            <div style="background: #f8f9fa; border-radius: 8px; overflow: hidden; margin-bottom: 25px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #e9ecef;">
                            <th style="padding: 12px 15px; text-align: left; font-weight: 600; color: #495057;">#</th>
                            <th style="padding: 12px 15px; text-align: left; font-weight: 600; color: #495057;">Gläubiger</th>
                            <th style="padding: 12px 15px; text-align: right; font-weight: 600; color: #495057;">Betrag</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${creditorListHtml}
                    </tbody>
                    <tfoot>
                        <tr style="background: #1e3c72; color: white;">
                            <td colspan="2" style="padding: 15px; font-weight: 600;">Gesamtschulden</td>
                            <td style="padding: 15px; text-align: right; font-weight: 700; font-size: 18px;">€${totalDebt.toLocaleString("de-DE")}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; border-radius: 4px; margin-bottom: 25px;">
                <h3 style="margin: 0 0 10px 0; color: #856404; font-size: 16px;">🔍 Was Sie jetzt tun sollten:</h3>
                <ol style="margin: 0; padding-left: 20px; color: #856404;">
                    <li>Überprüfen Sie die Liste auf Vollständigkeit</li>
                    <li>Falls Gläubiger fehlen, laden Sie weitere Dokumente hoch</li>
                    <li>Bestätigen Sie die Gläubigerliste</li>
                </ol>
            </div>
            <div style="text-align: center; margin: 30px 0;">
                <a href="${portalUrl}" style="display: inline-block; background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; text-decoration: none; padding: 15px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3);">
                    👉 Jetzt im Portal überprüfen
                </a>
            </div>
            <div style="background: #e7f5ff; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
                <p style="margin: 0; color: #0c63e4; font-size: 14px;">
                    <strong>💡 Wichtig:</strong><br>
                    • Sie können jederzeit weitere Dokumente hochladen<br>
                    • Erst nach Ihrer Bestätigung werden wir die Gläubiger kontaktieren<br>
                    • Bei Fragen stehen wir Ihnen gerne zur Verfügung
                </p>
            </div>
            <p style="font-size: 15px; color: #5a6c7d;">
                Mit freundlichen Grüßen<br>
                <strong>Ihr Team von Rechtsanwalt Thomas Scuric</strong>
            </p>
        </div>
        <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
            <p style="margin: 0; color: #6c757d; font-size: 13px;">
                📁 Aktenzeichen: <strong>${aktenzeichen}</strong>
            </p>
            <p style="margin: 10px 0 0 0; color: #adb5bd; font-size: 12px;">
                Diese E-Mail wurde automatisch generiert.
            </p>
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

            // Find clients with documents that need manual review
            const clients = await Client.find({
                // Only clients who have received payment (ready for review)
                first_payment_received: true,
                // Include clients that need creditor review or exclude completed ones
                $or: [
                    { current_status: 'creditor_review' },
                    { current_status: { $nin: ['manual_review_complete', 'creditor_contact_initiated', 'completed', 'awaiting_client_confirmation'] } }
                ]
            }).sort({ payment_processed_at: -1 }).limit(20);

            const availableClients = [];

            for (const client of clients) {
                const documents = client.documents || [];
                const creditors = client.final_creditor_list || [];

                // Find documents that need review
                const documentsToReview = documents.filter(doc => {
                    const relatedCreditor = creditors.find(c =>
                        c.document_id === doc.id ||
                        c.source_document === doc.name
                    );

                    const manualReviewRequired = doc.extracted_data?.manual_review_required === true ||
                        doc.validation?.requires_manual_review === true;

                    return (
                        doc.is_creditor_document === true &&
                        !doc.manually_reviewed &&
                        (manualReviewRequired ||
                            !relatedCreditor ||
                            (relatedCreditor.confidence || 0) < config.MANUAL_REVIEW_CONFIDENCE_THRESHOLD)
                    );
                });

                // Only include clients with documents that actually need review
                if (documentsToReview.length > 0) {
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

            console.log(`📊 Found ${availableClients.length} clients needing review for agent ${req.agentUsername}`);

            res.json({
                success: true,
                clients: availableClients,
                total: availableClients.length,
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

            // Filter documents that need manual review based on Claude AI document confidence
            const documentsToReview = documents.filter(doc => {
                // Check if document needs manual review based on Claude AI confidence or manual_review_required flag
                const documentConfidence = doc.extracted_data?.confidence || 0;
                const manualReviewRequired = doc.extracted_data?.manual_review_required === true ||
                    doc.validation?.requires_manual_review === true; // ✅ ALSO CHECK validation flag
                const isCreditorDocument = doc.is_creditor_document === true;
                const alreadyReviewed = doc.manually_reviewed === true;

                const needsReview = !alreadyReviewed && (manualReviewRequired ||
                    (isCreditorDocument && documentConfidence < config.MANUAL_REVIEW_CONFIDENCE_THRESHOLD));

                // Debug logging for each document
                console.log(`📄 Document ${doc.name || doc.id}:`, {
                    is_creditor_document: isCreditorDocument,
                    confidence: documentConfidence,
                    manual_review_required: manualReviewRequired,
                    validation_requires_review: doc.validation?.requires_manual_review,
                    extracted_data_requires_review: doc.extracted_data?.manual_review_required,
                    review_reasons: doc.validation?.review_reasons || [],
                    manually_reviewed: alreadyReviewed,
                    needsReview: needsReview
                });

                // Include if:
                // 1. Not already manually reviewed AND
                // 2. Either manual review is explicitly required (from validation OR extracted_data) OR
                //    (it's a creditor document AND document confidence is low)
                return needsReview;
            });

            // Note: creditorsToReview/verifiedCreditors will be set AFTER creditorsWithDocuments is built
            // (see below) - we use doc-based flags, not confidence threshold

            console.log(`📊 Review data for ${client.aktenzeichen}: ${documentsToReview.length} docs need review`);

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

                // NEW: Check if email OR address is missing for creditor documents
                const hasCreditorDocs = creditorDocs.some(doc => doc.is_creditor_document === true);
                const creditorEmail = creditor.email || creditor.sender_email;
                const creditorAddress = creditor.address || creditor.sender_address;
                const missingContactInfo = hasCreditorDocs && (isMissingValue(creditorEmail) || isMissingValue(creditorAddress));

                const needsManualReview = documentNeedsReview || missingContactInfo;

                // Collect review reasons from documents + add reason for missing contact info
                const allReviewReasons = [
                    ...creditorDocs.flatMap(doc => doc.validation?.review_reasons || [])
                ];
                if (missingContactInfo) {
                    if (isMissingValue(creditorEmail)) allReviewReasons.push('E-Mail-Adresse fehlt');
                    if (isMissingValue(creditorAddress)) allReviewReasons.push('Postadresse fehlt');
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

            // Find related creditor - try multiple methods
            let creditorIndex = -1;
            const creditors = client.final_creditor_list || [];

            // Method 1: Find by creditor_id directly
            if (creditor_id) {
                creditorIndex = creditors.findIndex(c => c.id === creditor_id);
                console.log(`   Looking for creditor by id ${creditor_id}: found at index ${creditorIndex}`);
            }

            // Method 2: Find by document_id or source_document
            if (creditorIndex === -1 && document_id) {
                for (let i = 0; i < creditors.length; i++) {
                    if (creditors[i].document_id === document_id ||
                        (document && creditors[i].source_document === document.name)) {
                        creditorIndex = i;
                        console.log(`   Found creditor by document match at index ${creditorIndex}`);
                        break;
                    }
                }
            }

            if (action === 'correct' && corrections) {
                // Apply corrections
                if (creditorIndex >= 0 && creditorIndex < creditors.length) {
                    // Update existing creditor - safe access
                    const originalData = { ...creditors[creditorIndex] };

                    // Preserve the original creditor object and only update specific fields
                    Object.assign(creditors[creditorIndex], {
                        sender_name: corrections.sender_name || creditors[creditorIndex].sender_name || 'Unbekannt',
                        sender_email: corrections.sender_email || creditors[creditorIndex].sender_email || '',
                        sender_address: corrections.sender_address || creditors[creditorIndex].sender_address || '',
                        reference_number: corrections.reference_number || creditors[creditorIndex].reference_number || '',
                        claim_amount: corrections.claim_amount ? parseFloat(corrections.claim_amount) : (creditors[creditorIndex].claim_amount || 0),
                        confidence: 1.0, // Manual correction = 100% confidence
                        status: 'confirmed', // Change status from pending to confirmed
                        manually_reviewed: true,
                        reviewed_by: req.agentId,
                        reviewed_at: new Date(),
                        confirmed_at: new Date(), // Add confirmation timestamp
                        original_ai_data: originalData,
                        correction_notes: corrections.notes || '',
                        review_action: 'corrected'
                    });

                    console.log(`✅ Updated existing creditor (creditor_id: ${creditor_id}, document_id: ${document_id})`);
                } else if (document) {
                    // Create new creditor from corrections (we have a document)
                    const claimAmount = corrections.claim_amount ? parseFloat(corrections.claim_amount) : 0;

                    const newCreditor = {
                        id: uuidv4(),
                        document_id: document_id,
                        source_document: document.name,
                        sender_name: corrections.sender_name || 'Unbekannt',
                        sender_email: corrections.sender_email || '',
                        sender_address: corrections.sender_address || '',
                        reference_number: corrections.reference_number || '',
                        claim_amount: isNaN(claimAmount) ? 0 : claimAmount,
                        confidence: 1.0, // Manual entry = 100% confidence
                        status: 'confirmed', // New creditors from manual review are confirmed
                        manually_reviewed: true,
                        reviewed_by: req.agentId,
                        reviewed_at: new Date(),
                        confirmed_at: new Date(), // Add confirmation timestamp
                        created_via: 'manual_review',
                        correction_notes: corrections.notes || ''
                    };

                    creditors.push(newCreditor);
                    console.log(`✅ Created new creditor for document ${document_id}`);
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
                    console.log(`⏭️ Document ${document_id} marked as non-creditor document with document_status='not_a_creditor'`);
                }
            } else if (action === 'confirm') {
                // Confirm AI extraction is correct
                if (creditorIndex >= 0 && creditorIndex < creditors.length) {
                    // Update existing creditor
                    Object.assign(creditors[creditorIndex], {
                        confidence: 1.0, // Confirmed = 100% confidence
                        status: 'confirmed', // Change status from pending to confirmed
                        manually_reviewed: true,
                        reviewed_by: req.agentId,
                        reviewed_at: new Date(),
                        confirmed_at: new Date(), // Add confirmation timestamp
                        review_action: 'confirmed'
                    });
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

            // Update the client with corrected data
            console.log(`🔄 Updating client ${clientId} with corrected data...`);
            client.updated_at = new Date();

            // Mark document as reviewed (if we have one)
            if (document) {
                console.log(`📝 Marking document ${document_id} as reviewed...`);
                document.manually_reviewed = true;
                document.reviewed_at = new Date();
                document.reviewed_by = req.agentId;
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

                // NEW: Check if email OR address is missing
                const hasCreditorDocs = linkedDocs.some(doc => doc.is_creditor_document === true);
                const creditorEmail = creditor.email || creditor.sender_email;
                const creditorAddress = creditor.address || creditor.sender_address;
                const missingContactInfo = hasCreditorDocs && (isMissingValue(creditorEmail) || isMissingValue(creditorAddress));

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
