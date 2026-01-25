const { v4: uuidv4 } = require('uuid');
const { findCreditorByName } = require('../utils/creditorLookup');

/**
 * Enrich deduplicated creditor entry (table data) with local DB info for creditor and representative.
 * This is used for final_creditor_list entries that have German field names.
 */
async function enrichDedupedCreditorFromDb(entry, cache) {
    if (!entry) return;

    const isMissing = (val) => {
        if (val === undefined || val === null) return true;
        if (typeof val === 'string') {
            const t = val.trim();
            if (!t) return true;
            const lower = t.toLowerCase();
            if (lower === 'n/a' || lower === 'na' || lower === 'n.a') return true;
        }
        return false;
    };

    const ensureMatch = async (name) => {
        if (!name) return null;
        const key = name.toLowerCase().trim();
        if (cache.has(key)) return cache.get(key);
        const m = await findCreditorByName(name);
        cache.set(key, m || null);
        return m;
    };

    // Creditor - support BOTH German (glaeubiger_name) AND English (sender_name) field names
    const creditorName = entry.glaeubiger_name || entry.sender_name;
    if (creditorName) {
        // Check if address is missing in either field format
        const needAddrGerman = isMissing(entry.glaeubiger_adresse);
        const needAddrEnglish = isMissing(entry.sender_address);
        const needAddr = needAddrGerman && needAddrEnglish;

        // Check if email is missing in either field format
        const needEmailGerman = isMissing(entry.email_glaeubiger);
        const needEmailEnglish = isMissing(entry.sender_email);
        const needEmail = needEmailGerman && needEmailEnglish;

        if (needAddr || needEmail) {
            const match = await ensureMatch(creditorName);
            if (match) {
                if (needAddr && match.address) {
                    // Set BOTH field formats for compatibility
                    entry.glaeubiger_adresse = match.address;
                    entry.sender_address = match.address;
                }
                if (needEmail && match.email) {
                    // Set BOTH field formats for compatibility
                    entry.email_glaeubiger = match.email;
                    entry.sender_email = match.email;
                }
            }
        }
    }

    // Representative (glaeubigervertreter_name)
    if (entry.glaeubigervertreter_name) {
        const needAddr = isMissing(entry.glaeubigervertreter_adresse);
        const needEmail = isMissing(entry.email_glaeubiger_vertreter);
        if (needAddr || needEmail) {
            const match = await ensureMatch(entry.glaeubigervertreter_name);
            if (match) {
                if (needAddr && match.address) entry.glaeubigervertreter_adresse = match.address;
                if (needEmail && match.email) entry.email_glaeubiger_vertreter = match.email;
            }
        }
    }
}

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
        },

        // Admin: Trigger AI Re-Deduplication for a client
        triggerAIReDedup: async (req, res) => {
            try {
                const { clientId } = req.params;

                console.log(`🤖 Admin triggering AI re-deduplication for client ${clientId}`);

                // Find client
                let client;
                try {
                    client = await Client.findOne({
                        $or: [
                            { id: clientId },
                            { aktenzeichen: clientId }
                        ]
                    });

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

                // Check if client has creditors
                if (!client.final_creditor_list || client.final_creditor_list.length === 0) {
                    return res.status(400).json({
                        error: 'No creditors found',
                        message: 'Client has no creditors to deduplicate'
                    });
                }

                console.log(`📊 Starting AI re-deduplication for ${client.final_creditor_list.length} creditors`);

                // Call FastAPI deduplication endpoint
                const axios = require('axios');
                const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8000';

                const response = await axios.post(
                    `${FASTAPI_URL}/api/dedup/deduplicate-all`,
                    {
                        creditors: client.final_creditor_list
                    },
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            'X-API-Key': process.env.FASTAPI_API_KEY || ''
                        },
                        timeout: 300000 // 5 minutes timeout (increased from 2 minutes)
                    }
                );

                const { deduplicated_creditors, stats } = response.data;

                console.log(`✅ AI re-deduplication complete:`, stats);
                console.log(`📊 Received ${deduplicated_creditors?.length || 0} deduplicated creditors from FastAPI`);
                console.log(`📋 First creditor sample:`, JSON.stringify(deduplicated_creditors?.[0], null, 2));

                // Enrich missing addresses/emails from local DB
                try {
                    console.log(`🔍 Enriching ${deduplicated_creditors.length} creditors from local DB...`);
                    const credCache = new Map();
                    await Promise.all(
                        deduplicated_creditors.map(c => enrichDedupedCreditorFromDb(c, credCache))
                    );
                    console.log(`✅ Enrichment complete. Cache hits: ${credCache.size}`);
                } catch (enrichError) {
                    console.error('⚠️ Enrichment failed, continuing without enrichment:', enrichError);
                    // Continue processing even if enrichment fails
                }

                // ✅ NEW RULE: Check if email/address still missing AFTER DB enrichment
                const isMissing = (val) => {
                    if (val === undefined || val === null) return true;
                    if (typeof val === 'string') {
                        const t = val.trim();
                        if (!t) return true;
                        const lower = t.toLowerCase();
                        if (lower === 'n/a' || lower === 'na' || lower === 'n.a') return true;
                    }
                    return false;
                };

                for (const creditor of deduplicated_creditors) {
                    // Prüfe beide Feldnamen-Formate (deutsch und englisch)
                    const hasEmail = !isMissing(creditor.email_glaeubiger) || !isMissing(creditor.sender_email);
                    const hasAddress = !isMissing(creditor.glaeubiger_adresse) || !isMissing(creditor.sender_address);
                    
                    if (!hasEmail || !hasAddress) {
                        creditor.needs_manual_review = true;
                        if (!creditor.review_reasons) {
                            creditor.review_reasons = [];
                        }
                        if (!hasEmail && !creditor.review_reasons.includes('Fehlende Gläubiger-E-Mail')) {
                            creditor.review_reasons.push('Fehlende Gläubiger-E-Mail');
                        }
                        if (!hasAddress && !creditor.review_reasons.includes('Fehlende Gläubiger-Adresse')) {
                            creditor.review_reasons.push('Fehlende Gläubiger-Adresse');
                        }
                        
                        console.log(`[admin-rededup] Manual review triggered for creditor: ${creditor.sender_name || creditor.glaeubiger_name}`, {
                            missing_email: !hasEmail,
                            missing_address: !hasAddress
                        });
                    }
                }

                // Ensure all creditors have required fields (especially 'id')
                const processedCreditors = deduplicated_creditors.map(creditor => {
                    // If creditor has no id, generate one
                    if (!creditor.id) {
                        creditor.id = uuidv4();
                        console.log(`⚙️ Generated new ID for merged creditor: ${creditor.sender_name}`);
                    }

                    // Ensure other required fields have defaults
                    // Note: Keep existing review_reasons as-is (don't clean them)
                    return {
                        ...creditor,
                        contact_status: creditor.contact_status || 'no_response',
                        amount_source: creditor.amount_source || 'original_document',
                        settlement_response_status: creditor.settlement_response_status || 'pending',
                        nullplan_response_status: creditor.nullplan_response_status || 'pending',
                        manually_reviewed: creditor.manually_reviewed || false,
                        status: creditor.status || 'confirmed',
                        created_at: creditor.created_at || new Date().toISOString(),
                        needs_manual_review: creditor.needs_manual_review || false,
                        review_reasons: creditor.review_reasons || []
                    };
                });

                // Update client with deduplicated creditors
                console.log(`💾 Saving ${processedCreditors.length} processed creditors to database`);
                client.final_creditor_list = processedCreditors;
                client.updated_at = new Date();

                // Add to status history
                client.status_history.push({
                    id: uuidv4(),
                    status: 'ai_rededup_triggered',
                    changed_by: 'admin',
                    metadata: {
                        original_count: stats.original_count,
                        unique_count: stats.unique_count,
                        duplicates_removed: stats.duplicates_removed,
                        triggered_by: req.adminEmail || 'admin'
                    }
                });

                await client.save();

                console.log(`✅ Client saved successfully with ${client.final_creditor_list.length} creditors`);

                res.json({
                    success: true,
                    message: 'AI re-deduplication completed successfully',
                    stats: {
                        original_count: stats.original_count,
                        unique_count: stats.unique_count,
                        duplicates_removed: stats.duplicates_removed
                    },
                    creditors: deduplicated_creditors
                });

            } catch (error) {
                console.error('❌ Error triggering AI re-dedup:', error);

                let errorMessage = error.message;
                let statusCode = 500;

                if (error.response) {
                    // FastAPI returned an error
                    errorMessage = error.response.data?.detail || error.response.data?.error || error.message;
                    statusCode = error.response.status;
                }

                res.status(statusCode).json({
                    error: 'Failed to trigger AI re-deduplication',
                    details: errorMessage
                });
            }
        }
    };
};

module.exports = createAdminClientCreditorController;
