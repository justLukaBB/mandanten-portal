const { v4: uuidv4 } = require('uuid');

const createAdminClientCreditorController = ({ Client, safeClientUpdate, DelayedProcessingService }) => {
    return {
        // Admin: Add manual creditor to any client (unrestricted)
        addCreditor: async (req, res) => {
            try {
                const { clientId } = req.params;
                const {
                    sender_name,
                    sender_email,
                    sender_address,
                    reference_number,
                    claim_amount,
                    notes,
                    is_representative,
                    actual_creditor
                } = req.body;

                console.log(`👤 Admin adding manual creditor to client ${clientId}`);

                // Validate required fields
                if (!sender_name) {
                    return res.status(400).json({
                        error: 'sender_name is required'
                    });
                }

                // Find client (any client, no workflow restrictions)
                let client;
                try {
                    // First try with string fields
                    client = await Client.findOne({
                        $or: [
                            { id: clientId },
                            { aktenzeichen: clientId }
                        ]
                    });

                    // If not found and clientId looks like a MongoDB ObjectId, try _id
                    if (!client && /^[0-9a-fA-F]{24}$/.test(clientId)) {
                        client = await Client.findOne({ _id: clientId });
                    }
                } catch (findError) {
                    console.error('Error finding client:', findError);
                    client = null;
                }

                if (!client) {
                    return res.status(404).json({
                        error: 'Client not found',
                        client_id: clientId
                    });
                }

                console.log(`📋 Adding creditor to ${client.firstName} ${client.lastName} (${client.aktenzeichen})`);

                // Create new creditor
                const newCreditor = {
                    id: uuidv4(),
                    sender_name: sender_name.trim(),
                    sender_email: sender_email?.trim() || '',
                    sender_address: sender_address?.trim() || '',
                    reference_number: reference_number?.trim() || '',
                    claim_amount: claim_amount ? parseFloat(claim_amount) : 0,
                    is_representative: is_representative === true,
                    actual_creditor: actual_creditor?.trim() || '',

                    // Manual creation metadata
                    status: 'confirmed',
                    confidence: 1.0, // Manual entry = 100% confidence
                    ai_confidence: 1.0,
                    manually_reviewed: true,
                    reviewed_by: req.adminId || req.agentId || 'admin',
                    reviewed_at: new Date(),
                    confirmed_at: new Date(),
                    created_at: new Date(),
                    created_via: 'admin_manual_entry',
                    correction_notes: notes?.trim() || 'Manually created by admin',
                    review_action: 'manually_created',

                    // Document association (optional)
                    document_id: null,
                    source_document: 'Manual Entry',
                    source_document_id: null
                };

                // Initialize final_creditor_list if it doesn't exist
                if (!client.final_creditor_list) {
                    client.final_creditor_list = [];
                }

                // Add creditor to the list
                client.final_creditor_list.push(newCreditor);

                // Add to status history
                client.status_history.push({
                    id: uuidv4(),
                    status: 'manual_creditor_added',
                    changed_by: 'admin',
                    metadata: {
                        creditor_name: sender_name,
                        creditor_amount: claim_amount || 0,
                        added_by: req.adminId || req.agentId || 'admin',
                        admin_action: 'manual_creditor_creation',
                        total_creditors: client.final_creditor_list.length
                    }
                });

                // Save client
                await client.save();

                console.log(`✅ Successfully added creditor "${sender_name}" to client ${client.aktenzeichen}`);

                res.json({
                    success: true,
                    message: `Creditor "${sender_name}" added successfully`,
                    creditor: {
                        id: newCreditor.id,
                        sender_name: newCreditor.sender_name,
                        sender_email: newCreditor.sender_email,
                        claim_amount: newCreditor.claim_amount,
                        status: newCreditor.status
                    },
                    client: {
                        id: client.id,
                        name: `${client.firstName} ${client.lastName}`,
                        aktenzeichen: client.aktenzeichen,
                        total_creditors: client.final_creditor_list.length
                    }
                });

            } catch (error) {
                console.error('❌ Error adding manual creditor:', error);
                res.status(500).json({
                    error: 'Failed to add creditor',
                    details: error.message
                });
            }
        },

        // Admin: Get all creditors for a specific client
        getCreditors: async (req, res) => {
            try {
                const { clientId } = req.params;

                console.log(`📋 Admin requesting creditors for client ${clientId}`);

                // Find client
                let client;
                try {
                    // First try with string fields
                    client = await Client.findOne({
                        $or: [
                            { id: clientId },
                            { aktenzeichen: clientId }
                        ]
                    });

                    // If not found and clientId looks like a MongoDB ObjectId, try _id
                    if (!client && /^[0-9a-fA-F]{24}$/.test(clientId)) {
                        client = await Client.findOne({ _id: clientId });
                    }
                } catch (findError) {
                    console.error('Error finding client:', findError);
                    client = null;
                }

                if (!client) {
                    return res.status(404).json({
                        error: 'Client not found',
                        client_id: clientId
                    });
                }

                const creditors = client.final_creditor_list || [];

                res.json({
                    success: true,
                    client: {
                        id: client.id,
                        name: `${client.firstName} ${client.lastName}`,
                        aktenzeichen: client.aktenzeichen,
                        current_status: client.current_status,
                        workflow_status: client.workflow_status
                    },
                    creditors: creditors.map(creditor => ({
                        id: creditor.id,
                        sender_name: creditor.sender_name,
                        sender_email: creditor.sender_email,
                        sender_address: creditor.sender_address,
                        reference_number: creditor.reference_number,
                        claim_amount: creditor.claim_amount,
                        status: creditor.status,
                        confidence: creditor.confidence || creditor.ai_confidence,
                        manually_reviewed: creditor.manually_reviewed,
                        created_via: creditor.created_via,
                        created_at: creditor.created_at,
                        reviewed_by: creditor.reviewed_by,
                        correction_notes: creditor.correction_notes
                    })),
                    total_creditors: creditors.length,
                    manual_creditors: creditors.filter(c => c.created_via === 'admin_manual_entry').length,
                    ai_creditors: creditors.filter(c => c.created_via !== 'admin_manual_entry').length
                });

            } catch (error) {
                console.error('❌ Error getting client creditors:', error);
                res.status(500).json({
                    error: 'Failed to get creditors',
                    details: error.message
                });
            }
        },

        // Admin: Update/Edit existing creditor
        updateCreditor: async (req, res) => {
            try {
                const { clientId, creditorId } = req.params;
                const {
                    sender_name,
                    sender_email,
                    sender_address,
                    reference_number,
                    claim_amount,
                    notes,
                    is_representative,
                    actual_creditor
                } = req.body;

                console.log(`✏️ Admin updating creditor ${creditorId} for client ${clientId}`);

                // Find client
                let client;
                try {
                    // First try with string fields
                    client = await Client.findOne({
                        $or: [
                            { id: clientId },
                            { aktenzeichen: clientId }
                        ]
                    });

                    // If not found and clientId looks like a MongoDB ObjectId, try _id
                    if (!client && /^[0-9a-fA-F]{24}$/.test(clientId)) {
                        client = await Client.findOne({ _id: clientId });
                    }
                } catch (findError) {
                    console.error('Error finding client:', findError);
                    client = null;
                }

                if (!client) {
                    return res.status(404).json({
                        error: 'Client not found',
                        client_id: clientId
                    });
                }

                // Find creditor
                const creditorIndex = client.final_creditor_list?.findIndex(c => c.id === creditorId);
                if (creditorIndex === -1 || creditorIndex === undefined) {
                    return res.status(404).json({
                        error: 'Creditor not found',
                        creditor_id: creditorId
                    });
                }

                const originalCreditor = { ...client.final_creditor_list[creditorIndex] };

                // Update creditor fields
                Object.assign(client.final_creditor_list[creditorIndex], {
                    sender_name: sender_name?.trim() || originalCreditor.sender_name,
                    sender_email: sender_email?.trim() || originalCreditor.sender_email || '',
                    sender_address: sender_address?.trim() || originalCreditor.sender_address || '',
                    reference_number: reference_number?.trim() || originalCreditor.reference_number || '',
                    claim_amount: claim_amount !== undefined ? parseFloat(claim_amount) : originalCreditor.claim_amount,
                    is_representative: is_representative !== undefined ? is_representative : originalCreditor.is_representative,
                    actual_creditor: actual_creditor?.trim() || originalCreditor.actual_creditor || '',

                    // Update metadata
                    manually_reviewed: true,
                    reviewed_by: req.adminId || req.agentId || 'admin',
                    reviewed_at: new Date(),
                    correction_notes: notes?.trim() || originalCreditor.correction_notes || 'Updated by admin',
                    review_action: 'manually_updated'
                });

                // Add to status history
                client.status_history.push({
                    id: uuidv4(),
                    status: 'creditor_updated',
                    changed_by: 'admin',
                    metadata: {
                        creditor_id: creditorId,
                        creditor_name: sender_name || originalCreditor.sender_name,
                        updated_by: req.adminId || req.agentId || 'admin',
                        admin_action: 'creditor_update',
                        changes: {
                            name_changed: sender_name && sender_name !== originalCreditor.sender_name,
                            amount_changed: claim_amount !== undefined && claim_amount !== originalCreditor.claim_amount,
                            email_changed: sender_email && sender_email !== originalCreditor.sender_email
                        }
                    }
                });

                // Save client
                await client.save();

                console.log(`✅ Successfully updated creditor "${client.final_creditor_list[creditorIndex].sender_name}" for client ${client.aktenzeichen}`);

                res.json({
                    success: true,
                    message: `Creditor "${client.final_creditor_list[creditorIndex].sender_name}" updated successfully`,
                    creditor: {
                        id: client.final_creditor_list[creditorIndex].id,
                        sender_name: client.final_creditor_list[creditorIndex].sender_name,
                        sender_email: client.final_creditor_list[creditorIndex].sender_email,
                        claim_amount: client.final_creditor_list[creditorIndex].claim_amount,
                        status: client.final_creditor_list[creditorIndex].status
                    }
                });

            } catch (error) {
                console.error('❌ Error updating creditor:', error);
                res.status(500).json({
                    error: 'Failed to update creditor',
                    details: error.message
                });
            }
        },

        // Admin: Delete creditor
        deleteCreditor: async (req, res) => {
            try {
                const { clientId, creditorId } = req.params;

                console.log(`🗑️ Admin deleting creditor ${creditorId} for client ${clientId}`);

                // Find client
                let client;
                try {
                    // First try with string fields
                    client = await Client.findOne({
                        $or: [
                            { id: clientId },
                            { aktenzeichen: clientId }
                        ]
                    });

                    // If not found and clientId looks like a MongoDB ObjectId, try _id
                    if (!client && /^[0-9a-fA-F]{24}$/.test(clientId)) {
                        client = await Client.findOne({ _id: clientId });
                    }
                } catch (findError) {
                    console.error('Error finding client:', findError);
                    client = null;
                }

                if (!client) {
                    return res.status(404).json({
                        error: 'Client not found',
                        client_id: clientId
                    });
                }

                // Find creditor
                const creditorIndex = client.final_creditor_list?.findIndex(c => c.id === creditorId);
                if (creditorIndex === -1 || creditorIndex === undefined) {
                    return res.status(404).json({
                        error: 'Creditor not found',
                        creditor_id: creditorId
                    });
                }

                const deletedCreditor = client.final_creditor_list[creditorIndex];

                // Remove creditor from list
                client.final_creditor_list.splice(creditorIndex, 1);

                // Add to status history
                client.status_history.push({
                    id: uuidv4(),
                    status: 'creditor_deleted',
                    changed_by: 'admin',
                    metadata: {
                        creditor_id: creditorId,
                        creditor_name: deletedCreditor.sender_name,
                        creditor_amount: deletedCreditor.claim_amount,
                        deleted_by: req.adminId || req.agentId || 'admin',
                        admin_action: 'creditor_deletion',
                        remaining_creditors: client.final_creditor_list.length
                    }
                });

                // Save client
                await client.save();

                console.log(`✅ Successfully deleted creditor "${deletedCreditor.sender_name}" for client ${client.aktenzeichen}`);

                res.json({
                    success: true,
                    message: `Creditor "${deletedCreditor.sender_name}" deleted successfully`,
                    deleted_creditor: {
                        id: deletedCreditor.id,
                        sender_name: deletedCreditor.sender_name,
                        claim_amount: deletedCreditor.claim_amount
                    },
                    remaining_creditors: client.final_creditor_list.length
                });

            } catch (error) {
                console.error('❌ Error deleting creditor:', error);
                res.status(500).json({
                    error: 'Failed to delete creditor',
                    details: error.message
                });
            }
        },

        // Admin: Skip 7-day delay and trigger immediate review (for testing)
        skipSevenDayDelay: async (req, res) => {
            try {
                const { clientId } = req.params;

                console.log(`⚡ Admin skipping 7-day delay for client ${clientId}`);

                // Find client
                let client;
                try {
                    // First try with string fields
                    client = await Client.findOne({
                        $or: [
                            { id: clientId },
                            { aktenzeichen: clientId }
                        ]
                    });

                    // If not found and clientId looks like a MongoDB ObjectId, try _id
                    if (!client && /^[0-9a-fA-F]{24}$/.test(clientId)) {
                        client = await Client.findOne({ _id: clientId });
                    }
                } catch (findError) {
                    console.error('Error finding client:', findError);
                    client = null;
                }

                if (!client) {
                    return res.status(404).json({
                        error: 'Client not found',
                        client_id: clientId
                    });
                }

                // Check if client has both conditions met
                const hasPayment = client.first_payment_received === true;
                const hasDocuments = client.documents && client.documents.length > 0;

                if (!hasPayment || !hasDocuments) {
                    return res.status(400).json({
                        error: 'Cannot skip delay - both payment and documents are required',
                        has_payment: hasPayment,
                        has_documents: hasDocuments,
                        documents_count: client.documents?.length || 0
                    });
                }

                // Cancel any existing 7-day schedule
                if (client.seven_day_review_scheduled && !client.seven_day_review_triggered) {
                    client.seven_day_review_scheduled = false;
                    client.seven_day_review_triggered = true;
                    client.seven_day_review_triggered_at = new Date();
                }

                // Mark both conditions as met
                if (!client.both_conditions_met_at) {
                    client.both_conditions_met_at = new Date();
                }

                // Add to status history
                client.status_history.push({
                    id: uuidv4(),
                    status: 'seven_day_delay_skipped_by_admin',
                    changed_by: 'admin',
                    metadata: {
                        admin_action: 'skip_seven_day_delay',
                        skipped_by: req.adminId || req.agentId || 'admin',
                        original_scheduled_at: client.seven_day_review_scheduled_at,
                        immediate_trigger: true,
                        reason: 'Admin testing override'
                    }
                });

                // Update status to creditor_review
                client.current_status = 'creditor_review';

                await client.save();

                // Trigger immediate review process
                const delayedService = new DelayedProcessingService();

                try {
                    await delayedService.triggerCreditorReviewProcess(client.id);
                    console.log(`✅ Immediate creditor review triggered for ${client.aktenzeichen}`);
                } catch (reviewError) {
                    console.error('❌ Error triggering immediate review:', reviewError);
                    // Continue anyway - the status is updated
                }

                res.json({
                    success: true,
                    message: `7-day delay skipped for ${client.firstName} ${client.lastName}`,
                    client: {
                        id: client.id,
                        name: `${client.firstName} ${client.lastName}`,
                        aktenzeichen: client.aktenzeichen,
                        current_status: client.current_status,
                        both_conditions_met_at: client.both_conditions_met_at,
                        seven_day_review_triggered: client.seven_day_review_triggered
                    },
                    immediate_review_triggered: true,
                    skipped_at: new Date()
                });

            } catch (error) {
                console.error('❌ Error skipping 7-day delay:', error);
                res.status(500).json({
                    error: 'Failed to skip 7-day delay',
                    details: error.message
                });
            }
        }
    };
};

module.exports = createAdminClientCreditorController;
