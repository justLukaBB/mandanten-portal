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
 */
const createAgentReviewController = ({ Client, getGCSFileStream, uploadsDir }) => {
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

            // Get creditors that need review
            const creditorsToReview = creditors.filter(c => (c.confidence || 0) < config.MANUAL_REVIEW_CONFIDENCE_THRESHOLD);
            const verifiedCreditors = creditors.filter(c => (c.confidence || 0) >= config.MANUAL_REVIEW_CONFIDENCE_THRESHOLD);

            console.log(`📊 Review data for ${client.aktenzeichen}: ${documentsToReview.length} docs, ${creditorsToReview.length} creditors need review`);
            console.log(`📊 Creditor details:`, {
                totalCreditors: creditors.length,
                verifiedCreditors: verifiedCreditors.length,
                confidenceThreshold: config.MANUAL_REVIEW_CONFIDENCE_THRESHOLD,
                creditorsSample: creditors.slice(0, 2).map(c => ({
                    id: c.id,
                    name: c.sender_name,
                    amount: c.claim_amount,
                    confidence: c.confidence
                })),
                verifiedSample: verifiedCreditors.slice(0, 2).map(c => ({
                    id: c.id,
                    name: c.sender_name,
                    amount: c.claim_amount,
                    amountType: typeof c.claim_amount,
                    confidence: c.confidence,
                    confidenceType: typeof c.confidence
                }))
            });

            // Log document structure for debugging
            if (documentsToReview.length > 0) {
                console.log(`📄 First document to review:`, {
                    id: documentsToReview[0].id,
                    name: documentsToReview[0].name,
                    hasId: !!documentsToReview[0].id,
                    documentStructure: Object.keys(documentsToReview[0])
                });
            }

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
                    need_review: creditorsToReview,
                    verified: creditors.filter(c => (c.confidence || 0) >= config.MANUAL_REVIEW_CONFIDENCE_THRESHOLD),
                    total_count: creditors.length,
                    review_count: creditorsToReview.length
                },
                review_session: {
                    status: client.current_status,
                    progress: {
                        total_items: documentsToReview.length,
                        completed_items: 0, // Will be calculated based on corrections
                        remaining_items: documentsToReview.length
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
            const { document_id, corrections, action } = req.body; // action: 'correct', 'skip', 'confirm'

            console.log(`✏️ Agent Review: Saving corrections for client ${clientId}, document ${document_id}, action: ${action}`);

            // Enhanced input validation with debugging
            console.log(`📝 Correction request data:`, {
                document_id,
                action,
                corrections: corrections ? Object.keys(corrections) : 'null',
                agentId: req.agentId,
                agentUsername: req.agentUsername
            });

            if (!document_id) {
                console.log(`❌ Missing document_id in correction request`);
                return res.status(400).json({
                    error: 'document_id is required'
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

            // Safe document lookup
            const documents = client.documents || [];
            const document = documents.find(d => d.id === document_id);
            if (!document) {
                return res.status(404).json({
                    error: 'Document not found',
                    document_id: document_id
                });
            }

            // Find related creditor (if any)
            let creditorIndex = -1;
            const creditors = client.final_creditor_list || [];

            for (let i = 0; i < creditors.length; i++) {
                if (creditors[i].document_id === document_id ||
                    creditors[i].source_document === document.name) {
                    creditorIndex = i;
                    break;
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

                    console.log(`✅ Updated existing creditor for document ${document_id}`);
                } else {
                    // Create new creditor from corrections
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
                }
            } else if (action === 'skip') {
                // Remove creditor from list when skipped (document is not a creditor document)
                if (creditorIndex >= 0 && creditorIndex < creditors.length) {
                    // Remove the creditor completely from the list
                    creditors.splice(creditorIndex, 1);
                    console.log(`❌ Removed creditor from list for document ${document_id} - marked as non-creditor document`);
                } else {
                    console.log(`⏭️ No creditor found to remove for document ${document_id} - document correctly identified as non-creditor`);
                }

                // Also mark the document as not a creditor document
                document.is_creditor_document = false;
                document.document_status = 'not_a_creditor'; // CRITICAL: Change document_status to prevent re-generation
                document.manually_reviewed = true;
                document.reviewed_by = req.agentId;
                document.reviewed_at = new Date();
                document.review_action = 'skipped_not_creditor';

                console.log(`⏭️ Document ${document_id} marked as non-creditor document with document_status='not_a_creditor'`);
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
                    console.log(`✅ Confirmed existing creditor for document ${document_id}`);
                } else {
                    // No existing creditor found - create one from document AI data
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

            // Mark document as reviewed
            console.log(`📝 Marking document ${document_id} as reviewed...`);
            document.manually_reviewed = true;
            document.reviewed_at = new Date();
            document.reviewed_by = req.agentId;

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
     */
    completeReviewSession: async (req, res) => {
        try {
            const { clientId } = req.params;

            console.log(`🏁 Agent Review: Completing review session for client ${clientId}`);

            const client = await Client.findOne({ id: clientId });

            if (!client) {
                return res.status(404).json({
                    error: 'Client not found',
                    client_id: clientId
                });
            }

            // Verify all documents have been reviewed
            const documents = client.documents || [];
            const documentsToReview = documents.filter(doc =>
                doc.is_creditor_document === true &&
                !doc.manually_reviewed
            );

            if (documentsToReview.length > 0) {
                console.log(`⚠️ Cannot complete review: ${documentsToReview.length} documents still need review`);
                return res.status(400).json({
                    error: 'Review incomplete',
                    documents_remaining: documentsToReview.length
                });
            }

            // Update client status
            client.current_status = 'manual_review_complete';
            client.workflow_status = 'admin_review'; // Or appropriate next step
            // client.admin_approved = true; // Optional: auto-approve?
            client.updated_at = new Date();

            // Log the review completion
            console.log(`✅ Review complete for ${client.aktenzeichen}. Status updated to manual_review_complete`);

            await client.save();

            res.json({
                success: true,
                message: 'Review session completed successfully',
                client: {
                    id: client.id,
                    current_status: client.current_status,
                    workflow_status: client.workflow_status
                }
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
