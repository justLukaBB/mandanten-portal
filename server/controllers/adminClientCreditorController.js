const { v4: uuidv4 } = require('uuid');
const XLSX = require('xlsx');
const { findCreditorByName } = require('../utils/creditorLookup');
const { runAIRededup } = require('../services/aiDedupScheduler');

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
                    actual_creditor,
                    // German field names (Glaeubiger-Tabelle convention)
                    glaeubiger_name,
                    glaeubiger_adresse,
                    glaeubigervertreter_name,
                    glaeubigervertreter_adresse,
                    aktenzeichen_glaeubigervertreter,
                    forderungbetrag,
                    email_glaeubiger,
                    email_glaeubiger_vertreter,
                    dokumenttyp
                } = req.body;

                console.log(`👤 Admin adding manual creditor to client ${clientId}`);

                // Validate required fields — accept EITHER sender_name OR glaeubiger_name
                if (!sender_name && !glaeubiger_name) {
                    return res.status(400).json({
                        error: 'sender_name or glaeubiger_name is required'
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
                const resolvedName = sender_name || glaeubiger_name;
                const resolvedEmail = sender_email || email_glaeubiger || '';
                const resolvedAddress = sender_address || glaeubiger_adresse || '';
                const resolvedAmount = claim_amount || forderungbetrag || '0';
                const newCreditor = {
                    id: uuidv4(),
                    sender_name: resolvedName.trim(),
                    sender_email: resolvedEmail.trim(),
                    sender_address: resolvedAddress.trim(),
                    reference_number: reference_number?.trim() || '',
                    claim_amount: parseFloat(String(resolvedAmount).replace(/[^\d.,\-]/g, '').replace(',', '.')) || 0,
                    is_representative: is_representative === true,
                    actual_creditor: actual_creditor?.trim() || '',

                    // German field names (Glaeubiger-Tabelle convention)
                    ...(glaeubiger_name !== undefined && { glaeubiger_name: glaeubiger_name.trim() }),
                    ...(glaeubiger_adresse !== undefined && { glaeubiger_adresse: glaeubiger_adresse.trim() }),
                    ...(glaeubigervertreter_name !== undefined && { glaeubigervertreter_name: glaeubigervertreter_name.trim() }),
                    ...(glaeubigervertreter_adresse !== undefined && { glaeubigervertreter_adresse: glaeubigervertreter_adresse.trim() }),
                    ...(aktenzeichen_glaeubigervertreter !== undefined && { aktenzeichen_glaeubigervertreter: aktenzeichen_glaeubigervertreter.trim() }),
                    ...(forderungbetrag !== undefined && { forderungbetrag: forderungbetrag.trim() }),
                    ...(email_glaeubiger !== undefined && { email_glaeubiger: email_glaeubiger.trim() }),
                    ...(email_glaeubiger_vertreter !== undefined && { email_glaeubiger_vertreter: email_glaeubiger_vertreter.trim() }),
                    ...(dokumenttyp !== undefined && { dokumenttyp: dokumenttyp.trim() }),

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
                        creditor_name: resolvedName,
                        creditor_amount: claim_amount || 0,
                        added_by: req.adminId || req.agentId || 'admin',
                        admin_action: 'manual_creditor_creation',
                        total_creditors: client.final_creditor_list.length
                    }
                });

                // Save client
                await client.save();

                console.log(`✅ Successfully added creditor "${resolvedName}" to client ${client.aktenzeichen}`);

                res.json({
                    success: true,
                    message: `Creditor "${resolvedName}" added successfully`,
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
                        current_debt_amount: creditor.current_debt_amount,
                        creditor_response_amount: creditor.creditor_response_amount,
                        amount_source: creditor.amount_source,
                        contact_status: creditor.contact_status,
                        response_received_at: creditor.response_received_at,
                        extraction_confidence: creditor.extraction_confidence,
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
                    actual_creditor,
                    // German field names (Glaubiger-Tabelle convention)
                    glaeubiger_name,
                    glaeubiger_adresse,
                    glaeubigervertreter_name,
                    glaeubigervertreter_adresse,
                    aktenzeichen_glaeubigervertreter,
                    forderungbetrag,
                    email_glaeubiger,
                    email_glaeubiger_vertreter,
                    dokumenttyp,
                    needs_manual_review,
                    review_reasons
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

                    // German field names (Glaubiger-Tabelle convention)
                    // Each field is only updated if it was explicitly sent (undefined check), to avoid
                    // overwriting existing values when only one field name convention is used.
                    ...(glaeubiger_name !== undefined && { glaeubiger_name: glaeubiger_name?.trim() || originalCreditor.glaeubiger_name || '' }),
                    ...(glaeubiger_adresse !== undefined && { glaeubiger_adresse: glaeubiger_adresse?.trim() || originalCreditor.glaeubiger_adresse || '' }),
                    ...(glaeubigervertreter_name !== undefined && { glaeubigervertreter_name: glaeubigervertreter_name?.trim() || originalCreditor.glaeubigervertreter_name || '' }),
                    ...(glaeubigervertreter_adresse !== undefined && { glaeubigervertreter_adresse: glaeubigervertreter_adresse?.trim() || originalCreditor.glaeubigervertreter_adresse || '' }),
                    ...(aktenzeichen_glaeubigervertreter !== undefined && { aktenzeichen_glaeubigervertreter: aktenzeichen_glaeubigervertreter?.trim() || originalCreditor.aktenzeichen_glaeubigervertreter || '' }),
                    ...(forderungbetrag !== undefined && { forderungbetrag: forderungbetrag?.trim() || originalCreditor.forderungbetrag || '' }),
                    ...(email_glaeubiger !== undefined && { email_glaeubiger: email_glaeubiger?.trim() || originalCreditor.email_glaeubiger || '' }),
                    ...(email_glaeubiger_vertreter !== undefined && { email_glaeubiger_vertreter: email_glaeubiger_vertreter?.trim() || originalCreditor.email_glaeubiger_vertreter || '' }),
                    ...(dokumenttyp !== undefined && { dokumenttyp: dokumenttyp?.trim() || originalCreditor.dokumenttyp || '' }),
                    ...(needs_manual_review !== undefined && { needs_manual_review: needs_manual_review }),
                    ...(review_reasons !== undefined && Array.isArray(review_reasons) && { review_reasons: review_reasons }),

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
                            email_changed: sender_email && sender_email !== originalCreditor.sender_email,
                            german_fields_updated: [
                                glaeubiger_name, glaeubiger_adresse, glaeubigervertreter_name,
                                glaeubigervertreter_adresse, forderungbetrag, email_glaeubiger,
                                email_glaeubiger_vertreter, dokumenttyp, needs_manual_review, review_reasons
                            ].some(f => f !== undefined)
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

                // Check if client has documents (payment gate removed)
                const hasDocuments = client.documents && client.documents.length > 0;

                if (!hasDocuments) {
                    return res.status(400).json({
                        error: 'Cannot skip delay - documents are required',
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

        // Admin: Export creditors as XLSX
        exportCreditors: async (req, res) => {
            try {
                const { clientId } = req.params;

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
                    return res.status(404).json({ error: 'Client not found' });
                }

                const creditors = client.final_creditor_list || [];

                const rows = creditors.map((c, i) => ({
                    'Nr.': i + 1,
                    'Gläubiger': c.glaeubiger_name || c.sender_name || '',
                    'Adresse': c.glaeubiger_adresse || c.sender_address || '',
                    'E-Mail': c.email_glaeubiger || c.sender_email || '',
                    'Vertreter': c.glaeubigervertreter_name || '',
                    'Vertreter Adresse': c.glaeubigervertreter_adresse || '',
                    'Vertreter E-Mail': c.email_glaeubiger_vertreter || '',
                    'Aktenzeichen Vertreter': c.aktenzeichen_glaeubigervertreter || '',
                    'Forderungsbetrag': c.forderungbetrag || c.claim_amount || 0,
                    'Dokumenttyp': c.dokumenttyp || '',
                    'Status': c.status || '',
                    'Erstellt am': c.created_at ? new Date(c.created_at).toLocaleDateString('de-DE') : '',
                }));

                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(rows);

                // Auto-size columns
                const colWidths = Object.keys(rows[0] || {}).map(key => ({
                    wch: Math.max(key.length, ...rows.map(r => String(r[key] || '').length).slice(0, 50)) + 2
                }));
                ws['!cols'] = colWidths;

                XLSX.utils.book_append_sheet(wb, ws, 'Gläubiger');

                const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

                const filename = `glaeubiger_${client.aktenzeichen || clientId}_${new Date().toISOString().slice(0, 10)}.xlsx`;
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                res.send(buf);

            } catch (error) {
                console.error('Error exporting creditors:', error);
                res.status(500).json({ error: 'Export failed', details: error.message });
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

                // Call shared service layer
                const result = await runAIRededup(client._id, (id) => Client.findById(id), {
                    source: 'admin'
                });

                // Handle concurrent operation (atomic guard failed)
                if (!result) {
                    // runAIRededup returns undefined for edge cases (no creditors, client not found)
                    return res.status(500).json({
                        error: 'Deduplication returned no result',
                        details: 'Unexpected state - check server logs'
                    });
                }

                if (!result.success && result.reason === 'dedup_already_in_progress') {
                    return res.status(409).json({
                        error: 'Deduplication already in progress',
                        message: 'Another dedup operation is currently running for this client. Please wait and try again.',
                        retry_after: 60
                    });
                }

                // Handle failure (retry exhausted, manual review flagged)
                if (!result.success) {
                    return res.status(500).json({
                        error: 'Failed to trigger AI re-deduplication',
                        details: result.error || result.failure_reason || 'Unknown error',
                        manual_review_flagged: result.manual_review_flagged || false
                    });
                }

                // Success: reload client for updated creditor list (frontend needs full array)
                const updatedClient = await Client.findById(client._id);

                res.json({
                    success: true,
                    message: 'AI re-deduplication completed successfully',
                    stats: {
                        original_count: result.before_count,
                        unique_count: result.after_count,
                        duplicates_removed: result.duplicates_removed
                    },
                    creditors: updatedClient.final_creditor_list
                });

            } catch (error) {
                console.error('[admin-rededup] Error triggering AI re-dedup:', error.message);
                res.status(500).json({
                    error: 'Failed to trigger AI re-deduplication',
                    details: error.message
                });
            }
        }
    };
};

module.exports = createAdminClientCreditorController;
