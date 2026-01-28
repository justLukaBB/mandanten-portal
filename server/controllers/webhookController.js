/**
 * Webhook Controller
 *
 * Enterprise-grade webhook handling with queue-based processing.
 * Implements "Acknowledge-First" pattern used by Stripe, GitHub, etc.
 */

const { v4: uuidv4 } = require('uuid');
const webhookVerifier = require('../utils/webhookVerifier');
const creditorDeduplication = require('../utils/creditorDeduplication');
const { documentNeedsManualReview, getDocumentReviewReasons } = require('../utils/creditorDeduplication');
const { findCreditorByName } = require('../utils/creditorLookup');
const webhookQueueService = require('../services/webhookQueueService');

const MANUAL_REVIEW_CONFIDENCE_THRESHOLD =
    parseFloat(process.env.MANUAL_REVIEW_CONFIDENCE_THRESHOLD) || 0.8;

// Helper: ensure creditor carries stable document links
const ensureCreditorLinks = (cred, docHint = null) => {
    if (!cred) return cred;

    const links = Array.isArray(cred.document_links) ? [...cred.document_links] : [];
    const addLink = (id, name, filename) => {
        if (!id && !name && !filename) return;
        const exists = links.some(l =>
            (l.id && id && l.id === id) ||
            (l.name && name && l.name === name) ||
            (l.filename && filename && l.filename === filename)
        );
        if (!exists) links.push({ id, name, filename });
    };

    // Try to pull a doc id from the provided hint
    const hintId = docHint?.id || docHint?.document_id || docHint?.primary_document_id;
    const hintName = docHint?.name || docHint?.source_document;
    const hintFilename = docHint?.filename;

    // Primary / legacy ids
    const primaryId = cred.primary_document_id || cred.document_id || hintId;
    if (primaryId) {
        cred.primary_document_id = primaryId;
        addLink(primaryId, cred.source_document || hintName, cred.filename || hintFilename);
    }

    // Legacy source_document / source_documents
    if (Array.isArray(cred.source_documents)) {
        cred.source_documents.forEach(s => addLink(null, s, null));
    } else if (cred.source_document) {
        addLink(null, cred.source_document, null);
    }

    cred.document_links = links;

    // Best-effort: set source_document_id from first linked id (or hint) if missing
    if (!cred.source_document_id) {
        const firstLinkWithId = links.find(l => l.id);
        if (firstLinkWithId?.id) {
            cred.source_document_id = firstLinkWithId.id;
        } else if (hintId) {
            cred.source_document_id = hintId;
            addLink(hintId, hintName, hintFilename);
        }
    }

    return cred;
};

// Helper: Enrich creditor contact info
async function enrichCreditorContactFromDb(docResult, cache) {
    if (!docResult?.is_creditor_document) return;

    const isMissing = (val) => {
        if (val === undefined || val === null) return true;
        if (typeof val === 'string') {
            const trimmed = val.trim();
            if (!trimmed) return true;
            const lower = trimmed.toLowerCase();
            if (lower === 'n/a' || lower === 'na' || lower === 'n.a') return true;
        }
        return false;
    };

    const creditorData = docResult.extracted_data?.creditor_data || {};
    const missingEmail = isMissing(creditorData.email);
    const missingSenderEmail = isMissing(creditorData.sender_email);
    const missingAddress = isMissing(creditorData.address);
    const missingSenderAddress = isMissing(creditorData.sender_address);
    const needEmail = missingEmail || missingSenderEmail;
    const needAddress = missingAddress || missingSenderAddress;

    if (!needEmail && !needAddress) return;

    const candidateName =
        creditorData.sender_name ||
        creditorData.glaeubiger_name ||
        creditorData.creditor_name ||
        creditorData.name ||
        creditorData.creditor ||
        docResult.creditor_name ||
        docResult.sender_name ||
        docResult.name;

    if (!candidateName) return;

    const cacheKey = candidateName.toLowerCase().trim();
    let match = cache.get(cacheKey);
    if (match === undefined) {
        match = await findCreditorByName(candidateName);
        cache.set(cacheKey, match || null);
    }

    if (!match) return;

    const updatedCreditorData = { ...creditorData };
    const beforeEmail = updatedCreditorData.email;
    const beforeAddress = updatedCreditorData.address;
    const beforeSenderEmail = updatedCreditorData.sender_email;
    const beforeSenderAddress = updatedCreditorData.sender_address;

    if (match.email) {
        if (missingEmail) {
            updatedCreditorData.email = match.email;
        }
        if (missingSenderEmail) {
            updatedCreditorData.sender_email = match.email;
        }
    }
    if (match.address) {
        if (missingAddress) {
            updatedCreditorData.address = match.address;
        }
        if (missingSenderAddress) {
            updatedCreditorData.sender_address = match.address;
        }
    }

    const matchedId = match._id?.toString?.() || match.id || match._id;
    if (matchedId) {
        updatedCreditorData.creditor_database_id = matchedId;
    }
    updatedCreditorData.creditor_database_match = true;

    docResult.extracted_data = docResult.extracted_data || {};

    // Ensure we write back to the normalized location
    if (!docResult.extracted_data.creditor_data) {
        docResult.extracted_data.creditor_data = {};
    }

    // Merge updates
    Object.assign(docResult.extracted_data.creditor_data, updatedCreditorData);

    console.log('[webhook] creditor enrichment applied', {
        name: candidateName,
        email_before: beforeEmail || null,
        email_after: updatedCreditorData.email || null,
        sender_email_before: beforeSenderEmail || null,
        sender_email_after: updatedCreditorData.sender_email || null,
        address_before: beforeAddress || null,
        address_after: updatedCreditorData.address || null,
        sender_address_before: beforeSenderAddress || null,
        sender_address_after: updatedCreditorData.sender_address || null,
        match_id: matchedId || null,
    });
}

/**
 * Enrich deduplicated creditor entry (table data) with local DB info for creditor and representative.
 * Supports BOTH German field names (glaeubiger_name, etc.) AND English field names (sender_name, etc.)
 * This is critical for late uploads which use English field names from deduplicateCreditorsFromDocuments()
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

    // Representative - support BOTH German (glaeubigervertreter_name) AND English (actual_creditor for representatives)
    const repName = entry.glaeubigervertreter_name || (entry.is_representative ? entry.actual_creditor : null);
    if (repName) {
        const needAddrGerman = isMissing(entry.glaeubigervertreter_adresse);
        const needEmailGerman = isMissing(entry.email_glaeubiger_vertreter);
        if (needAddrGerman || needEmailGerman) {
            const match = await ensureMatch(repName);
            if (match) {
                if (needAddrGerman && match.address) entry.glaeubigervertreter_adresse = match.address;
                if (needEmailGerman && match.email) entry.email_glaeubiger_vertreter = match.email;
            }
        }
    }
}

const createWebhookController = ({ Client, safeClientUpdate, getClient, triggerProcessingCompleteWebhook, getIO }) => {
    /**
     * Process AI Processing Webhook (called by WebhookWorker)
     *
     * This is the actual processing logic, extracted from the handler.
     * It runs asynchronously in the background worker.
     *
     * @param {object} data - The webhook payload
     */
    const processAiProcessingWebhook = async (data) => {
        const startTime = Date.now();

        const {
            job_id,
            client_id,
            status,
            manual_review_required,
            review_reasons,
            results,
            summary,
            deduplication,
            deduplicated_creditors,
        } = data;

        console.log(`\n🔄 [WebhookQueue] PROCESSING JOB ${job_id}`);
        console.log(`👤 Client ID: ${client_id}`);
        console.log(`📊 Status: ${status}`);
        console.log(`📄 Documents: ${results?.length || 0}`);
        console.log(`👥 Deduplicated creditors received: ${Array.isArray(deduplicated_creditors) ? deduplicated_creditors.length : 'NOT AN ARRAY - ' + typeof deduplicated_creditors}`);

        // Validate client exists
        let client = await Client.findOne({ id: client_id });
        if (!client) client = await Client.findOne({ aktenzeichen: client_id });
        if (!client) {
            throw new Error(`Client not found: ${client_id}`);
        }

        const processedDocuments = [];
        const creditorDocuments = [];
        const documentsNeedingReview = [];
        const creditorLookupCache = new Map();

        // Per-document status handling
        for (const docResult of results || []) {
            // VALIDATION: Ensure all required fields exist to prevent undefined documents
            if (!docResult.id) {
                console.error('⚠️ Document result missing ID, generating fallback:', docResult);
                docResult.id = `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            }

            if (!docResult.name && !docResult.filename) {
                console.error('⚠️ Document result missing name/filename:', { id: docResult.id, status: docResult.processing_status });
                docResult.name = `Unbekanntes Dokument ${docResult.id}`;
                docResult.filename = 'unknown.pdf';
            } else {
                // Ensure both name and filename are set
                if (!docResult.name && docResult.filename) {
                    docResult.name = docResult.filename;
                }
                if (!docResult.filename && docResult.name) {
                    docResult.filename = docResult.name;
                }
            }

            let finalDocumentStatus = docResult.document_status || 'pending';
            let statusReason = '';

            if (docResult.processing_status === 'completed') {
                if (docResult.is_creditor_document) {
                    const confidence = docResult.confidence || 0;
                    if (confidence >= MANUAL_REVIEW_CONFIDENCE_THRESHOLD && !docResult.manual_review_required) {
                        finalDocumentStatus = 'creditor_confirmed';
                        statusReason = `KI: Gläubigerdokument bestätigt (${Math.round(confidence * 100)}% Sicherheit)`;
                        creditorDocuments.push(docResult);
                    } else {
                        finalDocumentStatus = 'needs_review';
                        statusReason = docResult.manual_review_required
                            ? 'KI: Manuelle Prüfung erforderlich'
                            : `KI: Niedrige Sicherheit (${Math.round(confidence * 100)}%)`;
                        documentsNeedingReview.push(docResult);
                    }
                } else {
                    finalDocumentStatus = 'non_creditor_confirmed';
                    statusReason = `KI: Kein Gläubigerdokument (${docResult.classification?.document_type || 'Unbekannt'})`;
                }
            } else if (docResult.processing_status === 'error' || docResult.processing_status === 'failed') {
                finalDocumentStatus = 'needs_review';
                const errorMsg = docResult.processing_error || docResult.error || 'Unbekannter Fehler';
                statusReason = `Verarbeitungsfehler: ${errorMsg}`;
                documentsNeedingReview.push(docResult);

                // Ensure error documents have valid fields for display
                if (!docResult.name || docResult.name === 'undefined' || docResult.name.includes('undefined')) {
                    docResult.name = docResult.filename || `Fehlerhaftes Dokument ${docResult.id || 'unknown'}`;
                }
                if (!docResult.filename || docResult.filename === 'undefined') {
                    docResult.filename = docResult.name || 'error.pdf';
                }

                console.log('⚠️ Error document processed:', {
                    id: docResult.id,
                    name: docResult.name,
                    error: errorMsg
                });
            }

            await enrichCreditorContactFromDb(docResult, creditorLookupCache);

            // Normalize extracted_data structure if needed
            if (docResult.creditor_data && !docResult.extracted_data?.creditor_data) {
                docResult.extracted_data = docResult.extracted_data || {};
                docResult.extracted_data.creditor_data = docResult.creditor_data;
            }

            // NEW RULE: Check if email/address still missing AFTER DB enrichment
            if (docResult.is_creditor_document) {
                const enrichedEmail = docResult.extracted_data?.creditor_data?.email;
                const enrichedSenderEmail = docResult.extracted_data?.creditor_data?.sender_email;
                const enrichedAddress = docResult.extracted_data?.creditor_data?.address;
                const enrichedSenderAddress = docResult.extracted_data?.creditor_data?.sender_address;

                // Check if email OR address is missing after enrichment
                const hasEmail = (enrichedEmail && enrichedEmail !== 'N/A') || (enrichedSenderEmail && enrichedSenderEmail !== 'N/A');
                const hasAddress = (enrichedAddress && enrichedAddress !== 'N/A') || (enrichedSenderAddress && enrichedSenderAddress !== 'N/A');

                if (!hasEmail || !hasAddress) {
                    // Setze manual_review_required Flag
                    docResult.manual_review_required = true;

                    // Stelle sicher, dass validation Objekt existiert
                    if (!docResult.validation) {
                        docResult.validation = {};
                    }
                    docResult.validation.requires_manual_review = true;

                    // Füge spezifische Review Reasons hinzu
                    if (!docResult.validation.review_reasons) {
                        docResult.validation.review_reasons = [];
                    }
                    if (!hasEmail) {
                        docResult.validation.review_reasons.push('Fehlende Gläubiger-E-Mail');
                    }
                    if (!hasAddress) {
                        docResult.validation.review_reasons.push('Fehlende Gläubiger-Adresse');
                    }

                    // Override status zu needs_review
                    if (finalDocumentStatus === 'creditor_confirmed') {
                        finalDocumentStatus = 'needs_review';
                        const missingFields = [];
                        if (!hasEmail) missingFields.push('Email');
                        if (!hasAddress) missingFields.push('Adresse');
                        statusReason = `KI: Kontaktdaten fehlen - Manuelle Prüfung erforderlich (${missingFields.join(' und ')} nicht gefunden)`;
                        documentsNeedingReview.push(docResult);
                    }

                    // Verbesserte Log-Nachricht
                    console.log('[webhook] Manual review triggered: Missing contact info after DB enrichment', {
                        doc_id: docResult.id,
                        creditor_name: docResult.extracted_data?.creditor_data?.sender_name || 'N/A',
                        missing_email: !hasEmail,
                        missing_address: !hasAddress
                    });
                }

                if (hasEmail || hasAddress) {
                    console.log('[webhook] creditor doc after enrichment', {
                        doc_id: docResult.id,
                        email: enrichedEmail || null,
                        sender_email: enrichedSenderEmail || null,
                        address: enrichedAddress || null,
                        sender_address: enrichedSenderAddress || null,
                    });
                }
            }

            processedDocuments.push({
                ...docResult,
                document_status: finalDocumentStatus,
                status_reason: statusReason,
                // Explicitly ensure extracted_data is passed through
                extracted_data: docResult.extracted_data || {
                    creditor_data: docResult.creditor_data || {}
                }
            });
        }

        // Duplicate detection against existing docs
        for (const doc of processedDocuments) {
            if (
                doc.document_status === 'creditor_confirmed' &&
                doc.extracted_data?.creditor_data?.reference_number
            ) {
                const refNumber = doc.extracted_data.creditor_data.reference_number;
                const existingDoc = client.documents?.find(
                    (d) =>
                        d.id !== doc.id &&
                        d.extracted_data?.creditor_data?.reference_number === refNumber &&
                        (d.document_status === 'creditor_confirmed' || d.document_status === 'needs_review')
                );
                if (existingDoc) {
                    doc.is_duplicate = true;
                    doc.duplicate_reason = `Duplikat gefunden - Referenznummer "${refNumber}" bereits vorhanden in "${existingDoc.name}"`;
                    doc.document_status = 'duplicate';
                }
            }
        }

        // Persist documents + merge FastAPI-deduped creditors into final_creditor_list
        await safeClientUpdate(client_id, async (clientDoc) => {
            // Handle multi-creditor splits and standard updates
            for (const docResult of processedDocuments) {
                // KRITISCH: Skip documents with invalid IDs to prevent undefined in DB
                if (!docResult.id || docResult.id === 'undefined') {
                    console.error('⚠️ Skipping document with invalid ID:', {
                        id: docResult.id,
                        name: docResult.name,
                        status: docResult.processing_status
                    });
                    continue;
                }
                if (docResult.source_document_id) {
                    const sourceDoc = clientDoc.documents.find((d) => d.id === docResult.source_document_id);
                    if (sourceDoc) {
                        const creditorName =
                            docResult.extracted_data?.creditor_data?.sender_name ||
                            docResult.extracted_data?.creditor_data?.glaeubiger_name ||
                            `Creditor ${docResult.creditor_index}`;
                        const displayName = `${sourceDoc.name} - Gläubiger ${docResult.creditor_index}/${docResult.creditor_count}: ${creditorName}`;

                        const newCreditorEntry = {
                            id: docResult.id,
                            name: displayName,
                            filename: sourceDoc.filename,
                            type: sourceDoc.type,
                            size: sourceDoc.size,
                            url: sourceDoc.url,
                            uploadedAt: sourceDoc.uploadedAt,
                            source_document_id: docResult.source_document_id,
                            creditor_index: docResult.creditor_index,
                            creditor_count: docResult.creditor_count,
                            hidden_from_portal: true,
                            primary_document_id: docResult.id,
                            document_links: [
                                {
                                    id: docResult.id,
                                    name: displayName,
                                    filename: sourceDoc.filename
                                }
                            ],
                            processing_status: docResult.processing_status,
                            document_status: docResult.document_status,
                            status_reason: docResult.status_reason,
                            is_creditor_document: docResult.is_creditor_document,
                            confidence: docResult.confidence,
                            classification_success: docResult.classification_success,
                            manual_review_required: docResult.manual_review_required,
                            is_duplicate: docResult.is_duplicate || false,
                            duplicate_reason: docResult.duplicate_reason,
                            extracted_data: docResult.extracted_data,
                            validation: docResult.validation,
                            summary: docResult.summary,
                            processing_error: docResult.processing_error || docResult.error,
                            processing_time_ms: docResult.processing_time_ms,
                            processed_at: new Date().toISOString(),
                            processing_method: 'fastapi_gemini_ai',
                            processing_job_id: job_id,
                        };

                        clientDoc.documents.push(newCreditorEntry);
                    }
                } else {
                    const idx = clientDoc.documents.findIndex((d) => d.id === docResult.id);
                    if (idx !== -1) {
                        const existingDoc = clientDoc.documents[idx];
                        const existingObj = existingDoc.toObject ? existingDoc.toObject() : existingDoc;

                        // Ensure links are retained/augmented
                        const mergedLinks = new Map();
                        const addLink = (l) => {
                            if (!l) return;
                            const key = `${l.id || ''}|${l.name || ''}|${l.filename || ''}`;
                            mergedLinks.set(key, l);
                        };
                        (existingObj.document_links || []).forEach(addLink);
                        addLink({ id: docResult.id, name: existingDoc.name, filename: existingDoc.filename });

                        clientDoc.documents[idx] = {
                            ...existingObj,
                            id: existingDoc.id,
                            name: existingDoc.name,
                            filename: existingDoc.filename,
                            type: existingDoc.type,
                            size: existingDoc.size,
                            url: existingDoc.url,
                            uploadedAt: existingDoc.uploadedAt,
                            primary_document_id: existingDoc.primary_document_id || existingDoc.id,
                            document_links: Array.from(mergedLinks.values()),
                            processing_status: docResult.processing_status,
                            document_status: docResult.document_status,
                            status_reason: docResult.status_reason,
                            is_creditor_document: docResult.is_creditor_document,
                            confidence: docResult.confidence,
                            classification_success: docResult.classification_success,
                            manual_review_required: docResult.manual_review_required,
                            is_duplicate: docResult.is_duplicate || false,
                            duplicate_reason: docResult.duplicate_reason,
                            extracted_data: docResult.extracted_data,
                            validation: docResult.validation,
                            summary: docResult.summary,
                            processing_error: docResult.processing_error || docResult.error,
                            processing_time_ms: docResult.processing_time_ms,
                            processed_at: new Date().toISOString(),
                            processing_method: 'fastapi_gemini_ai',
                            processing_job_id: job_id,
                        };
                    }
                }
            }

            // Update source documents for multi-creditor splits
            const sourceDocumentIds = new Set();
            const creditorEntriesBySource = new Map();
            clientDoc.documents.forEach((doc) => {
                if (doc.source_document_id) {
                    sourceDocumentIds.add(doc.source_document_id);
                    if (!creditorEntriesBySource.has(doc.source_document_id)) {
                        creditorEntriesBySource.set(doc.source_document_id, []);
                    }
                    creditorEntriesBySource.get(doc.source_document_id).push(doc);
                }
            });
            sourceDocumentIds.forEach((sourceId) => {
                const sourceDocIndex = clientDoc.documents.findIndex((d) => d.id === sourceId);
                if (sourceDocIndex !== -1) {
                    const creditorEntries = creditorEntriesBySource.get(sourceId) || [];
                    const needsReviewCount = creditorEntries.filter((c) => c.document_status === 'needs_review').length;
                    const confirmedCount = creditorEntries.filter((c) => c.document_status === 'creditor_confirmed').length;
                    let overallStatus = 'creditor_confirmed';
                    let overallReason = `${creditorEntries.length} Gläubiger erkannt`;
                    if (needsReviewCount > 0) {
                        overallStatus = 'needs_review';
                        overallReason = `${needsReviewCount} von ${creditorEntries.length} Gläubigern benötigen Prüfung`;
                    }
                    clientDoc.documents[sourceDocIndex].processing_status = 'completed';
                    clientDoc.documents[sourceDocIndex].document_status = overallStatus;
                    clientDoc.documents[sourceDocIndex].status_reason = overallReason;
                    clientDoc.documents[sourceDocIndex].is_creditor_document = true;
                    clientDoc.documents[sourceDocIndex].creditor_count = creditorEntries.length;
                }
            });

            // Stats and status updates
            const completedDocs = clientDoc.documents.filter((doc) => doc.processing_status === 'completed');
            const creditorDocs = completedDocs.filter((doc) => doc.is_creditor_document === true);
            const totalDocs = clientDoc.documents.length;
            const allDocsCompleted = completedDocs.length === totalDocs && totalDocs > 0;

            if (clientDoc.current_status === 'documents_uploaded' && completedDocs.length > 0) {
                if (allDocsCompleted) {
                    if (creditorDocs.length > 0) {
                        clientDoc.current_status = 'documents_completed';
                    } else {
                        clientDoc.current_status = 'no_creditors_found';
                    }
                    clientDoc.status_history = clientDoc.status_history || [];
                    clientDoc.status_history.push({
                        id: uuidv4(),
                        status: clientDoc.current_status,
                        changed_by: 'system',
                        metadata: {
                            total_documents: totalDocs,
                            completed_documents: completedDocs.length,
                            creditor_documents: creditorDocs.length,
                            processing_job_id: job_id,
                            processing_completed_timestamp: new Date().toISOString(),
                        },
                        created_at: new Date(),
                    });
                } else {
                    clientDoc.current_status = 'documents_processing';
                }
            }

            // Node-side merge of FastAPI-deduped creditors
            if (Array.isArray(deduplicated_creditors) && deduplicated_creditors.length > 0) {
                // Enrich missing addresses/emails for creditor and representative from local DB
                try {
                    console.log(`[webhook] Enriching ${deduplicated_creditors.length} creditors from local DB...`);
                    const credCache = new Map();
                    await Promise.all(
                        deduplicated_creditors.map(c => {
                            // Try to link creditor to a processed doc (id-first)
                            const matchDoc = processedDocuments.find(pd => {
                                const fn = pd.filename || pd.name;
                                const srcs = Array.isArray(c.source_documents) ? c.source_documents : [];
                                return (
                                    (c.document_id && c.document_id === pd.id) ||
                                    (c.source_document_id && c.source_document_id === pd.id) ||
                                    (c.primary_document_id && c.primary_document_id === pd.id) ||
                                    srcs.includes(pd.id) ||
                                    (fn && srcs.includes(fn))
                                );
                            });

                            if (matchDoc) {
                                // Prefer the actual doc id for linking
                                c.document_id = c.document_id || matchDoc.id;
                                c.source_document_id = c.source_document_id || matchDoc.id;
                                c.primary_document_id = c.primary_document_id || matchDoc.source_document_id || matchDoc.primary_document_id || matchDoc.id;
                                // Ensure source_documents contains the id (not only filename)
                                const srcArr = Array.isArray(c.source_documents) ? [...c.source_documents] : [];
                                if (matchDoc.id && !srcArr.includes(matchDoc.id)) srcArr.unshift(matchDoc.id);
                                if (matchDoc.filename && !srcArr.includes(matchDoc.filename)) srcArr.push(matchDoc.filename);
                                c.source_documents = srcArr;

                                // NEW: Set needs_manual_review based on document flags
                                if (documentNeedsManualReview(matchDoc)) {
                                    c.needs_manual_review = true;
                                    if (!c.review_reasons) c.review_reasons = [];
                                    const docReasons = getDocumentReviewReasons(matchDoc);
                                    docReasons.forEach(reason => {
                                        if (!c.review_reasons.includes(reason)) {
                                            c.review_reasons.push(reason);
                                        }
                                    });
                                    console.log(`[webhook] Manual review set from document flag for creditor: ${c.sender_name || c.glaeubiger_name}`, {
                                        doc_id: matchDoc.id,
                                        reasons: c.review_reasons
                                    });
                                }
                            }

                            ensureCreditorLinks(c, matchDoc || null);
                            return enrichDedupedCreditorFromDb(c, credCache);
                        })
                    );
                    console.log(`[webhook] ✅ Enrichment complete. Cache hits: ${credCache.size}`);
                } catch (enrichError) {
                    console.error('[webhook] ⚠️ Enrichment failed, continuing without enrichment:', enrichError);
                    // Continue processing even if enrichment fails
                }

                // NEW RULE: Check if email/address still missing AFTER DB enrichment
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

                        console.log(`[webhook] Manual review triggered for creditor: ${creditor.sender_name || creditor.glaeubiger_name}`, {
                            missing_email: !hasEmail,
                            missing_address: !hasAddress
                        });
                    }
                }

                const existing = clientDoc.final_creditor_list || [];
                clientDoc.final_creditor_list = creditorDeduplication.mergeCreditorLists(
                    existing,
                    deduplicated_creditors,
                    'highest_amount'
                );
                clientDoc.deduplication_stats = deduplication || {
                    original_count: deduplicated_creditors.length,
                    unique_count: deduplicated_creditors.length,
                    duplicates_removed: 0,
                };
            }

            // NEW: Instant Add for Late Uploads
            if (
                (clientDoc.current_status === 'awaiting_client_confirmation' || clientDoc.current_status === 'client_confirmation') &&
                clientDoc.admin_approved
            ) {
                const newCreditorDocs = processedDocuments.filter(doc =>
                    doc.is_creditor_document === true
                );

                if (newCreditorDocs.length > 0) {
                    console.log(`[webhook] Found ${newCreditorDocs.length} late uploads. Auto-adding to final list (Bypassing Review).`);

                    newCreditorDocs.forEach(doc => {
                        const originalDocIndex = clientDoc.documents.findIndex(d => d.id === doc.id);
                        if (originalDocIndex !== -1) {
                            clientDoc.documents[originalDocIndex].manually_reviewed = true;
                            clientDoc.documents[originalDocIndex].document_status = 'creditor_confirmed';
                            clientDoc.documents[originalDocIndex].status_reason = 'Late upload - Auto-added to list';
                            clientDoc.documents[originalDocIndex].review_action = 'auto_confirmed';
                        }
                        doc.manually_reviewed = true;
                        doc.document_status = 'creditor_confirmed';
                    });

                    const newCreditors = creditorDeduplication.deduplicateCreditorsFromDocuments(
                        newCreditorDocs,
                        'highest_amount'
                    );

                    if (newCreditors.length > 0) {
                        // Enrich missing addresses/emails for late upload creditors from local DB
                        try {
                            console.log(`[webhook] Enriching ${newCreditors.length} late upload creditors from local DB...`);
                            const credCache = new Map();
                            await Promise.all(
                        newCreditors.map(c => {
                            const matchDoc = processedDocuments.find(pd => {
                                const fn = pd.filename || pd.name;
                                const srcs = Array.isArray(c.source_documents) ? c.source_documents : [];
                                return (
                                    (c.document_id && c.document_id === pd.id) ||
                                    (c.source_document_id && c.source_document_id === pd.id) ||
                                    (c.primary_document_id && c.primary_document_id === pd.id) ||
                                    srcs.includes(pd.id) ||
                                    (fn && srcs.includes(fn))
                                );
                            });

                            if (matchDoc) {
                                c.document_id = c.document_id || matchDoc.id;
                                c.source_document_id = c.source_document_id || matchDoc.id;
                                c.primary_document_id = c.primary_document_id || matchDoc.source_document_id || matchDoc.primary_document_id || matchDoc.id;
                                const srcArr = Array.isArray(c.source_documents) ? [...c.source_documents] : [];
                                if (matchDoc.id && !srcArr.includes(matchDoc.id)) srcArr.unshift(matchDoc.id);
                                if (matchDoc.filename && !srcArr.includes(matchDoc.filename)) srcArr.push(matchDoc.filename);
                                c.source_documents = srcArr;

                                // NEW: Set needs_manual_review based on document flags for late uploads
                                if (documentNeedsManualReview(matchDoc)) {
                                    c.needs_manual_review = true;
                                    if (!c.review_reasons) c.review_reasons = [];
                                    const docReasons = getDocumentReviewReasons(matchDoc);
                                    docReasons.forEach(reason => {
                                        if (!c.review_reasons.includes(reason)) {
                                            c.review_reasons.push(reason);
                                        }
                                    });
                                    console.log(`[webhook] Manual review set from document flag for late upload creditor: ${c.sender_name || c.glaeubiger_name}`, {
                                        doc_id: matchDoc.id,
                                        reasons: c.review_reasons
                                    });
                                }
                            }

                            ensureCreditorLinks(c, matchDoc || null);
                            return enrichDedupedCreditorFromDb(c, credCache);
                        })
                            );
                            console.log(`[webhook] ✅ Late upload enrichment complete`);
                        } catch (enrichError) {
                            console.error('[webhook] ⚠️ Late upload enrichment failed, continuing without enrichment:', enrichError);
                            // Continue processing even if enrichment fails
                        }

                        // NEW RULE: Check if email/address still missing AFTER DB enrichment for late uploads
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

                        for (const creditor of newCreditors) {
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

                                console.log(`[webhook] Manual review triggered for late upload creditor: ${creditor.sender_name || creditor.glaeubiger_name}`, {
                                    missing_email: !hasEmail,
                                    missing_address: !hasAddress
                                });
                            }
                        }

                        const existingList = clientDoc.final_creditor_list || [];
                        clientDoc.final_creditor_list = creditorDeduplication.mergeCreditorLists(
                            existingList,
                            newCreditors,
                            'highest_amount'
                        );

                        clientDoc.status_history = clientDoc.status_history || [];
                        clientDoc.status_history.push({
                            id: uuidv4(),
                            status: clientDoc.current_status,
                            changed_by: 'system',
                            metadata: {
                                reason: 'Late uploads auto-added (User Request)',
                                added_creditors_count: newCreditors.length,
                                document_ids: newCreditorDocs.map(d => d.id)
                            },
                            created_at: new Date(),
                        });
                    }
                }
            }

            // Existing auto-confirmation timer reset logic
            if (
                clientDoc.current_status === 'awaiting_client_confirmation' &&
                clientDoc.admin_approved &&
                clientDoc.admin_approved_at
            ) {
                const docsNeedingReview = clientDoc.documents.filter((doc) => {
                    const isJustProcessed = processedDocuments.some(pd => pd.id === doc.id);
                    if (!isJustProcessed) return false;
                    const needsReview = doc.document_status === 'needs_review' || doc.manual_review_required === true;
                    const notReviewed = !doc.manually_reviewed;
                    return needsReview && notReviewed;
                });

                if (docsNeedingReview.length > 0) {
                    clientDoc.current_status = 'creditor_review';
                    clientDoc.admin_approved = false;
                    clientDoc.admin_approved_at = null;
                    clientDoc.status_history.push({
                        id: uuidv4(),
                        status: 'reverted_to_creditor_review',
                        changed_by: 'system',
                        metadata: {
                            reason: 'New documents processed requiring agent review',
                            documents_needing_review: docsNeedingReview.length,
                            auto_confirmation_timer_reset: true,
                        },
                        created_at: new Date(),
                    });
                }
            }

            // Payment + all docs complete flow
            if (allDocsCompleted && clientDoc.first_payment_received) {
                const autoApprovedCreditorDocs = completedDocs.filter(
                    (doc) =>
                        doc.is_creditor_document === true &&
                        !doc.validation?.requires_manual_review &&
                        !doc.manual_review_required &&
                        doc.document_status === 'creditor_confirmed'
                );
                if (autoApprovedCreditorDocs.length > 0) {
                    const dedupedFromDocs = creditorDeduplication.deduplicateCreditorsFromDocuments(
                        autoApprovedCreditorDocs,
                        'highest_amount'
                    );
                    const existingCreditors = clientDoc.final_creditor_list || [];
                    const mergedCreditors = creditorDeduplication.mergeCreditorLists(
                        existingCreditors,
                        dedupedFromDocs,
                        'highest_amount'
                    );
                    clientDoc.final_creditor_list = mergedCreditors;
                }
            }

            return clientDoc;
        });

        // Emit socket update to admins (if socket server available)
        try {
            const io = getIO ? getIO() : null;
            if (io) {
                const updatedClient = await getClient(client_id);
                io.to(`client:${client_id}`).emit('client_updated', {
                    client_id,
                    documents: updatedClient?.documents || [],
                    final_creditor_list: updatedClient?.final_creditor_list || [],
                    deduplication_stats: updatedClient?.deduplication_stats || {},
                });
            }
        } catch (emitErr) {
            console.error('[webhook] ⚠️ Socket emit failed', emitErr);
        }

        // Zendesk logic
        if (documentsNeedingReview.length > 0) {
            const updatedClient = await getClient(client_id);
            const docsByReason = {};
            documentsNeedingReview.forEach((doc) => {
                const reason =
                    doc.status_reason || doc.validation?.review_reasons?.join(', ') || 'Manuelle Prüfung erforderlich';
                if (!docsByReason[reason]) docsByReason[reason] = [];
                docsByReason[reason].push(doc);
            });

            setImmediate(async () => {
                try {
                    const ZendeskService = require('../services/zendeskService');
                    const zendeskService = new ZendeskService();
                    const clientForTicket = await getClient(client_id);
                    for (const doc of documentsNeedingReview) {
                        const docRecord = clientForTicket.documents?.find((d) => d.id === doc.id);
                        const gcsUrl = docRecord?.url || docRecord?.gcs_path || 'N/A';
                        const originalName = doc.filename || doc.name || 'Unbekanntes Dokument';
                        const reviewReasons =
                            doc.validation?.review_reasons ||
                            (doc.status_reason ? [doc.status_reason] : []) ||
                            ['Manuelle Prüfung erforderlich'];

                        const ticketResult = await zendeskService.createTicket({
                            subject: `🔄 Dokumentprüfung erforderlich: ${clientForTicket.firstName} ${clientForTicket.lastName} (${clientForTicket.aktenzeichen})`,
                            content: `**🔄 DOKUMENTPRÜFUNG ERFORDERLICH**
👤 Client: ${clientForTicket.firstName} ${clientForTicket.lastName}
📧 Email: ${clientForTicket.email}
📁 Aktenzeichen: ${clientForTicket.aktenzeichen}
📄 Dokument: ${originalName}
⚠️ Gründe: ${reviewReasons.map((r) => `• ${r}`).join('\n')}
🔗 GCS: ${gcsUrl}
Job ID: ${job_id}`,
                            requesterEmail: clientForTicket.email,
                            tags: ['document-review', 'ai-processing', 'manual-review-required', 'creditor-documents'],
                            priority: 'normal',
                        });

                        if (ticketResult.success) {
                            await safeClientUpdate(client_id, (clientDoc) => {
                                clientDoc.zendesk_tickets = clientDoc.zendesk_tickets || [];
                                clientDoc.zendesk_tickets.push({
                                    ticket_id: ticketResult.ticket_id,
                                    ticket_type: 'creditor_review',
                                    ticket_scenario: 'document_review',
                                    status: 'open',
                                    created_at: new Date(),
                                    document_ids: [doc.id],
                                });
                                return clientDoc;
                            });
                        }
                    }
                } catch (zendeskError) {
                    console.error(`❌ Failed to create Zendesk ticket:`, zendeskError);
                }
            });
        }

        if (status === 'completed' || status === 'partial') {
            const firstDocId = processedDocuments[0]?.id;
            setImmediate(async () => {
                try {
                    await triggerProcessingCompleteWebhook(client_id, firstDocId);
                } catch (err) {
                    console.error('Failed to trigger internal webhook:', err);
                }
            });
        }

        const processingTime = Date.now() - startTime;
        console.log(`[WebhookQueue] ✅ Job ${job_id} processed in ${processingTime}ms`);

        return {
            success: true,
            processed_documents: processedDocuments.length,
            processing_time_ms: processingTime
        };
    };

    return {
        /**
         * Handle AI Processing Webhook (HTTP Endpoint)
         *
         * Implements "Acknowledge-First" pattern:
         * 1. Send 200 OK IMMEDIATELY (before ANY processing)
         * 2. Parse and queue job asynchronously after response
         *
         * This prevents webhook timeouts from FastAPI.
         */
        handleAiProcessing: async (req, res) => {
            // 🚀 SEND 200 OK IMMEDIATELY - Before ANY processing!
            // This is the absolute fastest response possible
            console.log('📨 WEBHOOK RECEIVED FROM FASTAPI');
            res.status(200).json({
                success: true,
                message: 'Webhook received',
                received_at: new Date().toISOString()
            });

            // Get raw body for async processing
            const rawBody = req.body.toString('utf8');

            // ALL processing happens AFTER response is sent
            setImmediate(async () => {
                try {
                    // Parse JSON (after response already sent)
                    let data;
                    try {
                        data = JSON.parse(rawBody);
                    } catch (parseError) {
                        console.error('❌ JSON parse error:', parseError.message);
                        return; // Can't recover - webhook already acknowledged
                    }

                    const { job_id, client_id } = data;

                    if (!client_id || !job_id) {
                        console.error('❌ Missing client_id or job_id in webhook payload');
                        return;
                    }

                    console.log(`🔑 Job: ${job_id} | Client: ${client_id} | Docs: ${data.results?.length || 0}`);

                    // Enqueue for background processing
                    const enqueueResult = await webhookQueueService.enqueue(
                        job_id,
                        'ai-processing',
                        data
                    );

                    if (enqueueResult.skipped) {
                        console.log(`📥 Job ${job_id} skipped: ${enqueueResult.reason}`);
                    } else {
                        console.log(`📥 Job ${job_id} queued`);
                    }
                } catch (error) {
                    console.error(`❌ Failed to process webhook:`, error.message);
                }
            });
        },

        /**
         * Process AI Processing Webhook (for WebhookWorker)
         *
         * This is exported so the WebhookWorker can call it.
         */
        processAiProcessingWebhook
    };
};

module.exports = createWebhookController;
