const { v4: uuidv4 } = require('uuid');
const axios = require('axios'); // For local trigger if needed, or we inject it
const creditorDeduplication = require('../utils/creditorDeduplication');
const { sanitizeAktenzeichenSafe } = require('../utils/sanitizeAktenzeichen');
const ConditionCheckService = require('../services/conditionCheckService');

// Initialize services locally if not injected (but we prefer injection for services too if possible)
// conditionCheckService is stateless-ish so new instance is fine, but better to inject if singleton.
const conditionCheckService = new ConditionCheckService();

const createPortalWebhookController = ({ Client, safeClientUpdate, triggerProcessingCompleteWebhook }) => {
    return {
        handleDocumentsUploaded: async (req, res) => {
            try {
                console.log('📄 Portal Webhook: Documents-Uploaded received', req.body);

                let {
                    client_id,
                    aktenzeichen,
                    uploaded_documents,
                    total_count
                } = req.body;

                if (!client_id && !aktenzeichen) {
                    return res.status(400).json({
                        error: 'Missing required field: client_id or aktenzeichen'
                    });
                }

                // Sanitize aktenzeichen if provided
                if (aktenzeichen) {
                    const sanitized = sanitizeAktenzeichenSafe(aktenzeichen);
                    if (sanitized) {
                        aktenzeichen = sanitized;
                    }
                }

                // Find client
                const client = await Client.findOne({
                    $or: [
                        { id: client_id },
                        { aktenzeichen: aktenzeichen }
                    ]
                });

                if (!client) {
                    return res.status(404).json({
                        error: 'Client not found',
                        client_id: client_id,
                        aktenzeichen: aktenzeichen
                    });
                }

                console.log(`📋 Processing document upload for: ${client.firstName} ${client.lastName}`);

                const documentsCount = client.documents?.length || 0;

                // ===== ITERATIVE LOOP: Check if client is in awaiting_client_confirmation status =====
                const isInConfirmationPhase = client.current_status === 'awaiting_client_confirmation' &&
                    client.admin_approved === true;

                // Update client status (but NOT if in confirmation phase - will be handled below)
                if (documentsCount > 0 && !isInConfirmationPhase) {
                    client.current_status = 'documents_uploaded';
                    client.updated_at = new Date();

                    // Add status history
                    client.status_history.push({
                        id: uuidv4(),
                        status: 'documents_uploaded',
                        changed_by: 'client',
                        metadata: {
                            documents_uploaded: total_count || documentsCount,
                            upload_session: new Date().toISOString(),
                            document_names: uploaded_documents?.map(d => d.name) || []
                        }
                    });

                    // Update to processing status once documents start being processed
                    client.status_history.push({
                        id: uuidv4(),
                        status: 'documents_processing',
                        changed_by: 'system',
                        metadata: {
                            processing_started: new Date().toISOString(),
                            ai_pipeline: 'google_document_ai + claude_ai'
                        }
                    });

                    client.current_status = 'documents_processing';
                }

                if (isInConfirmationPhase && documentsCount > 0) {
                    console.log(`📄 Additional documents uploaded during confirmation phase for ${client.aktenzeichen}`);

                    // Mark that additional documents were uploaded after agent review
                    client.additional_documents_uploaded_after_review = true;
                    client.additional_documents_uploaded_at = new Date();

                    // Add to status history
                    client.status_history.push({
                        id: uuidv4(),
                        status: 'additional_documents_uploaded',
                        changed_by: 'client',
                        metadata: {
                            documents_count: documentsCount,
                            upload_type: 'additional_after_review',
                            previous_status: 'awaiting_client_confirmation',
                            iteration: (client.review_iteration_count || 0) + 1
                        }
                    });

                    // Change status back to additional_documents_review
                    client.current_status = 'additional_documents_review';
                }

                await client.save();

                // ===== ITERATIVE LOOP: Create new Zendesk ticket for additional review =====
                if (isInConfirmationPhase && documentsCount > 0) {
                    try {
                        const ZendeskService = require('../services/zendeskService');
                        const zendeskService = new ZendeskService();

                        if (zendeskService.isConfigured()) {
                            const newDocsList = uploaded_documents?.map((d, i) =>
                                `${i + 1}. ${d.name}`
                            ).join('\n') || 'Neue Dokumente';

                            const ticketResult = await zendeskService.createTicket({
                                subject: `🔄 Zusätzliche Dokumente hochgeladen: ${client.firstName} ${client.lastName} (${client.aktenzeichen})`,
                                content: `**🔄 ZUSÄTZLICHE DOKUMENTE NACH AGENT REVIEW**

👤 **Client:** ${client.firstName} ${client.lastName}
📧 **Email:** ${client.email}
📁 **Aktenzeichen:** ${client.aktenzeichen}
📅 **Hochgeladen:** ${new Date().toLocaleString('de-DE')}

📊 **Situation:**
• Status: Wartend auf Client-Bestätigung
• Vorherige Agent-Review: Abgeschlossen am ${client.admin_approved_at?.toLocaleString('de-DE')}
• Anzahl bereits bestätigter Gläubiger: ${(client.final_creditor_list || []).length}
• **NEUE** Dokumente hochgeladen: ${documentsCount}
• Review-Iteration: ${(client.review_iteration_count || 0) + 1}

📄 **Neue Dokumente:**
${newDocsList}

⚠️ **AKTION ERFORDERLICH:**
1. Bitte die neuen Dokumente im Agent Portal prüfen
2. Neue Gläubiger extrahieren und bestätigen
3. Diese werden zur bestehenden Gläubigerliste hinzugefügt
4. Client erhält automatisch aktualisierte Liste zur erneuten Bestätigung

🔗 **Agent Portal:** ${process.env.FRONTEND_URL || 'https://mandanten-portal.onrender.com'}/agent/review/${client.id}

📋 **STATUS:** Zusätzliche Dokumente - Review erforderlich`,
                                requesterEmail: client.email,
                                tags: ['additional-documents', 'agent-review-required', 'creditor-documents', 'iterative-review'],
                                priority: 'normal'
                            });

                            if (ticketResult.success) {
                                console.log(`✅ New review ticket created for additional documents: ${ticketResult.ticket_id}`);

                                // Store new ticket
                                if (!client.zendesk_tickets) {
                                    client.zendesk_tickets = [];
                                }
                                client.zendesk_tickets.push({
                                    ticket_id: ticketResult.ticket_id,
                                    ticket_type: 'additional_creditor_review',
                                    ticket_scenario: 'additional_documents_after_confirmation',
                                    status: 'open',
                                    created_at: new Date()
                                });

                                await client.save();
                            } else {
                                console.error(`❌ Failed to create Zendesk ticket for additional documents:`, ticketResult.error);
                            }
                        } else {
                            console.log(`⚠️ Zendesk not configured - skipping ticket creation for additional documents`);
                        }
                    } catch (zendeskError) {
                        console.error(`❌ Failed to create Zendesk ticket for additional documents:`, zendeskError.message);
                    }
                }

                // Check if both conditions (payment + documents) are met for 7-day review
                const conditionCheckResult = await conditionCheckService.handleDocumentUploaded(client.id);
                console.log(`🔍 Condition check result:`, conditionCheckResult);

                console.log(`✅ Document upload processed for ${client.aktenzeichen}. Total documents: ${documentsCount}`);

                res.json({
                    success: true,
                    message: 'Document upload processed',
                    client_status: client.current_status,
                    documents_count: documentsCount,
                    next_step: 'Documents are being processed by AI',
                    seven_day_review_scheduled: conditionCheckResult.scheduled || false,
                    seven_day_review_date: conditionCheckResult.scheduledFor || null
                });

            } catch (error) {
                console.error('❌ Error in documents-uploaded webhook:', error);
                res.status(500).json({
                    error: 'Failed to process document upload webhook',
                    details: error.message
                });
            }
        },

        handleCreditorsConfirmed: async (req, res) => {
            try {
                console.log('✅ Portal Webhook: Creditors-Confirmed received', req.body);

                let {
                    client_id,
                    aktenzeichen,
                    confirmed_creditors,
                    confirmation_data
                } = req.body;

                if (!client_id && !aktenzeichen) {
                    return res.status(400).json({
                        error: 'Missing required field: client_id or aktenzeichen'
                    });
                }

                // Sanitize aktenzeichen if provided
                if (aktenzeichen) {
                    const sanitized = sanitizeAktenzeichenSafe(aktenzeichen);
                    if (sanitized) {
                        aktenzeichen = sanitized;
                    }
                }

                if (!confirmed_creditors || !Array.isArray(confirmed_creditors)) {
                    return res.status(400).json({
                        error: 'Missing or invalid confirmed_creditors array'
                    });
                }

                // Find client
                const client = await Client.findOne({
                    $or: [
                        { id: client_id },
                        { aktenzeichen: aktenzeichen }
                    ]
                });

                if (!client) {
                    return res.status(404).json({
                        error: 'Client not found',
                        client_id: client_id,
                        aktenzeichen: aktenzeichen
                    });
                }

                console.log(`📋 Processing creditor confirmation for: ${client.firstName} ${client.lastName}`);
                console.log(`📊 Confirmed creditors: ${confirmed_creditors.length}`);

                // Update client with confirmed creditors
                client.final_creditor_list = confirmed_creditors.map(creditor => ({
                    id: creditor.id || uuidv4(),
                    sender_name: creditor.sender_name,
                    sender_address: creditor.sender_address,
                    sender_email: creditor.sender_email,
                    reference_number: creditor.reference_number,
                    claim_amount: creditor.claim_amount,
                    is_representative: creditor.is_representative || false,
                    actual_creditor: creditor.actual_creditor || '',
                    source_document: creditor.source_document,
                    source_document_id: creditor.source_document_id,
                    ai_confidence: creditor.ai_confidence || 0,
                    status: 'confirmed',
                    created_at: new Date(),
                    confirmed_at: new Date()
                }));

                // Update status
                client.client_confirmed_creditors = true;
                client.client_confirmed_at = new Date();
                client.current_status = 'creditor_contact_active';
                client.creditor_contact_started = true;
                client.creditor_contact_started_at = new Date();
                client.updated_at = new Date();

                // Add status history
                client.status_history.push({
                    id: uuidv4(),
                    status: 'creditor_contact_active',
                    changed_by: 'client',
                    metadata: {
                        confirmed_creditors_count: confirmed_creditors.length,
                        confirmation_timestamp: new Date().toISOString(),
                        client_confirmation: true,
                        creditor_names: confirmed_creditors.map(c => c.sender_name),
                        total_debt: confirmed_creditors.reduce((sum, c) => sum + (c.claim_amount || 0), 0)
                    }
                });

                await client.save();

                console.log(`✅ Creditor confirmation processed for ${client.aktenzeichen}`);
                console.log(`📊 Final creditor list: ${client.final_creditor_list.length} creditors`);

                res.json({
                    success: true,
                    message: 'Creditor confirmation processed',
                    client_status: 'creditor_contact_active',
                    confirmed_creditors_count: confirmed_creditors.length,
                    total_debt: confirmed_creditors.reduce((sum, c) => sum + (c.claim_amount || 0), 0),
                    next_step: 'Creditor contact process will be initiated',
                    zendesk_action_required: 'Create creditor contact ticket and side conversations'
                });

            } catch (error) {
                console.error('❌ Error in creditors-confirmed webhook:', error);
                res.status(500).json({
                    error: 'Failed to process creditor confirmation webhook',
                    details: error.message
                });
            }
        },

        handleDocumentProcessingComplete: async (req, res) => {
            try {
                console.log('🤖 Portal Webhook: Document-Processing-Complete received', req.body);

                const {
                    client_id,
                    aktenzeichen,
                    document_id,
                    processing_results
                } = req.body;

                if (!client_id && !aktenzeichen) {
                    return res.status(400).json({
                        error: 'Missing required field: client_id or aktenzeichen'
                    });
                }

                // Find client
                const client = await Client.findOne({
                    $or: [
                        { id: client_id },
                        { aktenzeichen: aktenzeichen }
                    ]
                });

                if (!client) {
                    return res.status(404).json({
                        error: 'Client not found'
                    });
                }

                // Check if all documents are processed
                const allDocuments = client.documents || [];
                const completedDocs = allDocuments.filter(d => d.processing_status === 'completed');
                const processingDocs = allDocuments.filter(d => d.processing_status === 'processing');

                console.log(`📊 Document processing status: ${completedDocs.length}/${allDocuments.length} completed`);

                // If this was the last document to be processed
                if (processingDocs.length === 0 && completedDocs.length === allDocuments.length && allDocuments.length > 0) {
                    // All documents are now processed
                    // Filter creditor documents that DON'T require manual review (auto-approved only)
                    const creditorDocs = allDocuments.filter(d =>
                        d.is_creditor_document === true &&
                        !d.validation?.requires_manual_review &&
                        !d.extracted_data?.manual_review_required
                    );

                    const creditorDocsNeedingReview = allDocuments.filter(d =>
                        d.is_creditor_document === true &&
                        (d.validation?.requires_manual_review || d.extracted_data?.manual_review_required)
                    );

                    console.log(`📊 Auto-approved creditor documents: ${creditorDocs.length}`);
                    console.log(`⚠️ Creditor documents needing manual review: ${creditorDocsNeedingReview.length}`);

                    if (client.current_status === 'documents_processing') {
                        client.current_status = 'documents_completed';
                        client.updated_at = new Date();

                        // Add status history
                        client.status_history.push({
                            id: uuidv4(),
                            status: 'documents_completed',
                            changed_by: 'system',
                            metadata: {
                                processing_completed: new Date().toISOString(),
                                total_documents: allDocuments.length,
                                creditor_documents: creditorDocs.length,
                                processing_results: processing_results || {}
                            }
                        });

                        console.log(`✅ All documents processed for ${client.aktenzeichen}. Proceeding to creditor analysis (no payment gate).`);

                        // Update final creditor list with deduplication
                        if (creditorDocs.length > 0) {
                            console.log(`📊 Document analysis: ${completedDocs.length} completed, ${creditorDocs.length} creditor docs`);

                            const deduplicatedCreditors = creditorDeduplication.deduplicateCreditorsFromDocuments(
                                creditorDocs,
                                'highest_amount'
                            );

                            const existingCreditors = client.final_creditor_list || [];
                            const mergedCreditors = creditorDeduplication.mergeCreditorLists(
                                existingCreditors,
                                deduplicatedCreditors,
                                'highest_amount'
                            );

                            client.final_creditor_list = mergedCreditors;
                            console.log(`📊 Final creditor count: ${mergedCreditors.length}`);

                            // Determine next step based on creditor review + 30-day upload window
                            const hasCreditorsNeedingReview = mergedCreditors.some(c => c.needs_manual_review === true);
                            if (hasCreditorsNeedingReview) {
                                client.workflow_status = 'admin_review';
                                client.current_status = 'creditor_review';
                                console.log(`🔍 Creditors need review → admin_review`);
                            } else {
                                // Check if 30-day upload window has passed (timer starts from payment)
                                const paymentAt = client.payment_received_at;
                                const UPLOAD_WINDOW_DAYS = 30;
                                const now = new Date();
                                const hasPayment = !!paymentAt;
                                const windowExpired = hasPayment && ((now - new Date(paymentAt)) / (1000 * 60 * 60 * 24)) >= UPLOAD_WINDOW_DAYS;

                                client.admin_approved = true;
                                client.admin_approved_at = now;
                                client.admin_approved_by = 'system_auto';

                                if (windowExpired) {
                                    // Payment received + 30 days passed → client confirmation
                                    client.workflow_status = 'client_confirmation';
                                    client.current_status = 'awaiting_client_confirmation';
                                    console.log(`✅ No review needed + payment 30-day window expired → client_confirmation`);
                                } else {
                                    // No payment yet OR window still open → park in upload_window_active
                                    client.workflow_status = 'upload_window_active';
                                    client.current_status = 'upload_window_active';
                                    if (!hasPayment) {
                                        console.log(`⏳ No review needed but no payment yet → upload_window_active (waiting for 1. Rate)`);
                                    } else {
                                        const daysLeft = Math.ceil(UPLOAD_WINDOW_DAYS - ((now - new Date(paymentAt)) / (1000 * 60 * 60 * 24)));
                                        console.log(`⏳ No review needed but payment window still open (${daysLeft} days left) → upload_window_active`);
                                    }
                                }
                            }
                        } else {
                            // No creditor documents — route to review for manual handling
                            client.workflow_status = 'admin_review';
                            client.current_status = 'creditor_review';
                            console.log(`⚠️ No creditor documents found — routing to admin_review`);
                        }

                        await client.save();

                        // Trigger the processing-complete webhook asynchronously
                        setTimeout(async () => {
                            console.log(`🚀 Triggering processing-complete webhook for client ${client.id}`);
                            await triggerProcessingCompleteWebhook(client.id, document_id);
                        }, 1000);
                    }
                }

                res.json({
                    success: true,
                    message: 'Document processing status updated',
                    client_status: client.current_status,
                    total_documents: allDocuments.length,
                    completed_documents: completedDocs.length,
                    creditor_documents: allDocuments.filter(d => d.is_creditor_document === true).length
                });

            } catch (error) {
                console.error('❌ Error in document-processing-complete webhook:', error);
                res.status(500).json({
                    error: 'Failed to process document processing webhook',
                    details: error.message
                });
            }
        }
    };
};

module.exports = createPortalWebhookController;
