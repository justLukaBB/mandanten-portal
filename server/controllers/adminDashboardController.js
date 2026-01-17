const { v4: uuidv4 } = require('uuid');
const fs = require('fs-extra');
const path = require('path');

// Helper function for client display status
function getClientDisplayStatus(client) {
    const documents = client.documents || [];
    const creditors = client.final_creditor_list || [];

    const status = {
        payment: client.first_payment_received ? '✅ Bezahlt' : '❌ Ausstehend',
        documents: `${documents.length} Dokumente`,
        processing: 'Unbekannt',
        review: 'Ausstehend',
        overall_status: 'created',
        needs_attention: false,
        next_action: 'Warten auf erste Rate'
    };

    // Calculate processing status
    if (documents.length === 0) {
        status.processing = '❌ Keine Dokumente';
    } else {
        const completed = documents.filter(d => d.processing_status === 'completed');
        const processing = documents.filter(d => d.processing_status === 'processing');

        if (completed.length === documents.length) {
            status.processing = '✅ Abgeschlossen';
        } else if (processing.length > 0) {
            status.processing = `⏳ ${completed.length}/${documents.length}`;
        } else {
            status.processing = `📋 ${completed.length}/${documents.length}`;
        }
    }

    // Calculate review status based on payment state
    if (!client.first_payment_received) {
        status.overall_status = 'awaiting_payment';
        status.review = '💰 Warte auf erste Rate';
        status.next_action = 'Warten auf erste Rate';
        // Check for completed workflows first (current_status)
    } else if (client.current_status === 'manual_review_complete') {
        status.overall_status = 'review_complete';
        status.review = '✅ Prüfung abgeschlossen';
        status.next_action = 'Gläubiger-Kontakt initiieren';
        status.needs_attention = false;
    } else if (client.current_status === 'creditor_contact_initiated') {
        status.overall_status = 'creditor_contact_active';
        status.review = '📧 Gläubiger kontaktiert';
        status.next_action = 'Gläubiger-Antworten überwachen';
        status.needs_attention = false;
    } else if (client.current_status === 'creditor_contact_failed') {
        status.overall_status = 'creditor_contact_error';
        status.review = '❌ Gläubiger-Kontakt fehlgeschlagen';
        status.next_action = 'Manueller Gläubiger-Kontakt erforderlich';
        status.needs_attention = true;
    } else if (client.current_status === 'creditor_contact_active') {
        status.overall_status = 'creditor_contact_active';
        status.review = '📞 Gläubiger-Kontakt aktiv';
        status.next_action = 'Gläubiger-Kommunikation verfolgen';
        status.needs_attention = false;
    } else if (client.current_status === 'completed') {
        status.overall_status = 'completed';
        status.review = '🎉 Abgeschlossen';
        status.next_action = 'Fall abgeschlossen';
        status.needs_attention = false;
    } else if (client.payment_ticket_type) {
        switch (client.payment_ticket_type) {
            case 'document_request':
                status.overall_status = 'awaiting_documents';
                status.review = '📄 Warte auf Dokumente';
                status.next_action = 'Mandant kontaktieren - Dokumente anfordern';
                status.needs_attention = true;
                break;

            case 'processing_wait':
                status.overall_status = 'processing';
                status.review = '⏳ AI verarbeitet';
                status.next_action = 'Warten auf AI-Verarbeitung';
                break;

            case 'manual_review':
                status.overall_status = 'manual_review';
                status.review = '🔍 Manuelle Prüfung';
                status.next_action = 'Manuelle Gläubiger-Prüfung durchführen';
                status.needs_attention = true;
                break;

            case 'auto_approved':
                status.overall_status = 'ready_for_confirmation';
                status.review = '✅ Bereit zur Bestätigung';
                status.next_action = 'Gläubigerliste an Mandant senden';
                status.needs_attention = true;
                break;

            case 'no_creditors_found':
                status.overall_status = 'problem';
                status.review = '⚠️ Keine Gläubiger';
                status.next_action = 'Dokumente manuell prüfen';
                status.needs_attention = true;
                break;

            default:
                status.overall_status = 'unknown';
                status.review = '❓ Unbekannt';
                status.next_action = 'Status prüfen';
                status.needs_attention = true;
        }
    } else {
        // Payment received but no ticket type set yet (should not happen with new system)
        status.overall_status = 'payment_confirmed';
        status.review = '✅ Zahlung bestätigt';
        status.next_action = 'System prüfen - Ticket-Typ fehlt';
        status.needs_attention = true;
    }

    return status;
}

/**
 * Factory to create Admin Dashboard Controller
 * @param {Object} dependencies - dependencies specific to this module
 * @param {Model} dependencies.Client - Mongoose Client model
 * @param {Object} dependencies.databaseService - Database service for health checks
 * @param {Object} dependencies.clientsData - In-memory fallback data (optional)
 * @param {String} dependencies.uploadsDir - Path to uploads directory for cleanup
 */
const createAdminDashboardController = ({ Client, databaseService, clientsData = {}, uploadsDir, DelayedProcessingService, garnishmentCalculator, financialDataReminderService, safeClientUpdate }) => {
    return {
        // Dashboard Stats Endpoint
        getDashboardStats: async (req, res) => {
            try {
                const search = req.query.search;
                const status = req.query.status;
                const dateFrom = req.query.dateFrom;
                const dateTo = req.query.dateTo;

                // Build base query
                let baseQuery = {};

                // Status Filter
                if (status && status !== 'all') {
                    baseQuery.workflow_status = status;
                }

                // Search Filter
                if (search) {
                    baseQuery.$or = [
                        { firstName: { $regex: search, $options: 'i' } },
                        { lastName: { $regex: search, $options: 'i' } },
                        { email: { $regex: search, $options: 'i' } },
                        { aktenzeichen: { $regex: search, $options: 'i' } }
                    ];
                }

                // Date Filter
                if (dateFrom || dateTo) {
                    baseQuery.created_at = {};
                    if (dateFrom) baseQuery.created_at.$gte = new Date(dateFrom);
                    if (dateTo) baseQuery.created_at.$lte = new Date(dateTo);
                }

                // Initialize default stats structure
                const stats = {
                    total_users: 0,
                    payment_confirmed: 0,
                    processing: 0,
                    needs_attention: 0,
                    awaiting_documents: 0,
                    active_users: 0,
                    total_documents: 0,
                    total_creditors: 0,
                    status_counts: {}
                };

                if (databaseService.isHealthy()) {
                    // Helper to merge queries
                    const merge = (extra) => ({ ...baseQuery, ...extra });
                    // Note: For $or queries in baseQuery, merging another $or (like for 'needs_attention') requires $and
                    const mergeOr = (extraOr) => {
                        if (baseQuery.$or) {
                            return { $and: [baseQuery, extraOr] };
                        }
                        return { ...baseQuery, ...extraOr };
                    };

                    // Execute independent counts in parallel for performance
                    const [
                        totalCount,
                        paymentCount,
                        processingCount,
                        attentionCount,
                        awaitingDocsCount,
                        activeCount,
                        docCredSum
                    ] = await Promise.all([
                        Client.countDocuments(baseQuery),
                        Client.countDocuments(merge({ first_payment_received: true })),
                        Client.countDocuments(merge({ workflow_status: 'processing' })),
                        Client.countDocuments(mergeOr({
                            $or: [
                                { workflow_status: 'manual_review' },
                                { workflow_status: 'problem' },
                                { needs_attention: true }
                            ]
                        })),
                        Client.countDocuments(mergeOr({
                            $or: [
                                { workflow_status: 'document_upload' },
                                { payment_ticket_type: 'document_request' }
                            ]
                        })),
                        Client.countDocuments(merge({ last_login: { $exists: true, $ne: null } })),
                        Client.aggregate([
                            { $match: baseQuery },
                            {
                                $group: {
                                    _id: null,
                                    totalDocs: { $sum: { $size: { $ifNull: ["$documents", []] } } },
                                    totalCreds: { $sum: { $size: { $ifNull: ["$final_creditor_list", []] } } }
                                }
                            }
                        ])
                    ]);

                    stats.total_users = totalCount;
                    stats.payment_confirmed = paymentCount;
                    stats.processing = processingCount;
                    stats.needs_attention = attentionCount;
                    stats.awaiting_documents = awaitingDocsCount;
                    stats.active_users = activeCount;
                    stats.total_documents = docCredSum[0]?.totalDocs || 0;
                    stats.total_creditors = docCredSum[0]?.totalCreds || 0;

                } else {
                    // Fallback to memory data if database is offline
                    // Apply filters to memory array first
                    let filteredUsers = Object.values(clientsData);

                    if (status && status !== 'all') {
                        filteredUsers = filteredUsers.filter(u => u.workflow_status === status);
                    }
                    if (search) {
                        const lowerSearch = search.toLowerCase();
                        filteredUsers = filteredUsers.filter(u =>
                            (u.firstName && u.firstName.toLowerCase().includes(lowerSearch)) ||
                            (u.lastName && u.lastName.toLowerCase().includes(lowerSearch)) ||
                            (u.email && u.email.toLowerCase().includes(lowerSearch)) ||
                            (u.aktenzeichen && u.aktenzeichen.toLowerCase().includes(lowerSearch))
                        );
                    }

                    const users = filteredUsers;
                    stats.total_users = users.length;
                    stats.payment_confirmed = users.filter(u => u.first_payment_received).length;
                    stats.processing = users.filter(u => u.workflow_status === 'processing').length;
                    stats.needs_attention = users.filter(u => u.workflow_status === 'manual_review').length;
                    stats.awaiting_documents = users.filter(u => u.workflow_status === 'document_upload').length;
                    stats.active_users = users.filter(u => u.last_login).length;
                    stats.total_documents = users.reduce((sum, u) => sum + (u.documents ? u.documents.length : 0), 0);
                    stats.total_creditors = users.reduce((sum, u) => sum + (u.final_creditor_list ? u.final_creditor_list.length : 0), 0);
                }

                res.json(stats);

            } catch (error) {
                console.error('Error fetching dashboard stats:', error);
                res.status(500).json({ error: 'Failed to fetch stats' });
            }
        },

        // Create New Client Endpoint
        createClient: async (req, res) => {
            try {
                const clientData = req.body;
                console.log('📝 Received client creation request:', {
                    firstName: clientData.firstName,
                    lastName: clientData.lastName,
                    email: clientData.email,
                    aktenzeichen: clientData.aktenzeichen,
                    current_status: clientData.current_status,
                    workflow_status: clientData.workflow_status
                });

                // Validate required fields
                if (!clientData.firstName || !clientData.lastName || !clientData.email || !clientData.aktenzeichen) {
                    return res.status(400).json({
                        error: 'Missing required fields',
                        required: ['firstName', 'lastName', 'email', 'aktenzeichen']
                    });
                }

                // Check if client with same aktenzeichen already exists
                const existingClient = await Client.findOne({
                    $or: [
                        { aktenzeichen: clientData.aktenzeichen },
                        { email: clientData.email }
                    ]
                });

                if (existingClient) {
                    return res.status(409).json({
                        error: 'Client already exists',
                        details: existingClient.email === clientData.email ?
                            'Email already in use' : 'Aktenzeichen already exists'
                    });
                }

                // Create new client in MongoDB
                const newClient = new Client({
                    ...clientData,
                    id: clientData.aktenzeichen, // Use aktenzeichen as ID
                    _id: undefined, // Let MongoDB generate _id
                    created_at: new Date(),
                    updated_at: new Date(),
                    documents: [],
                    final_creditor_list: [],
                    // Grant immediate portal access for manually created users
                    portal_link_sent: true,
                    portal_link_sent_at: new Date(),
                    status_history: [{
                        id: uuidv4(),
                        status: clientData.current_status || 'created',
                        changed_by: 'system',
                        created_at: new Date()
                    }]
                });

                await newClient.save();

                console.log(`✅ Created new client: ${newClient.firstName} ${newClient.lastName} (${newClient.aktenzeichen})`);

                res.status(201).json({
                    id: newClient.id,
                    _id: newClient._id,
                    firstName: newClient.firstName,
                    lastName: newClient.lastName,
                    email: newClient.email,
                    aktenzeichen: newClient.aktenzeichen,
                    current_status: newClient.current_status,
                    workflow_status: newClient.workflow_status,
                    created_at: newClient.created_at
                });

            } catch (error) {
                console.error('❌ Error creating client:', error);

                // Enhanced error logging
                if (error.name === 'ValidationError') {
                    console.error('MongoDB Validation Error:', error.errors);
                    res.status(400).json({
                        error: 'Validation error',
                        details: error.message,
                        validation_errors: error.errors
                    });
                } else if (error.code === 11000) {
                    console.error('MongoDB Duplicate Key Error:', error);
                    res.status(409).json({
                        error: 'Duplicate entry',
                        details: 'Client with this email or aktenzeichen already exists'
                    });
                } else {
                    console.error('General Error:', error);
                    res.status(500).json({
                        error: 'Error creating client',
                        details: error.message,
                        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
                    });
                }
            }
        },

        // Clear Database Endpoint
        clearDatabase: async (req, res) => {
            try {
                console.log('🗑️ ADMIN REQUEST: Clearing all data from MongoDB...');

                if (!databaseService.isHealthy()) {
                    return res.status(503).json({
                        error: 'Database not available'
                    });
                }

                // Get counts before deletion for confirmation
                const clientCount = await Client.countDocuments();

                console.log(`📊 Found ${clientCount} clients in database`);

                // Delete all clients (this will cascade delete all related data)
                const deleteResult = await Client.deleteMany({});

                console.log(`✅ Deleted ${deleteResult.deletedCount} clients from MongoDB`);

                // Also clean up any uploaded files directory
                if (uploadsDir && fs.existsSync(uploadsDir)) {
                    console.log('🗂️ Cleaning up uploads directory...');
                    const clientDirs = fs.readdirSync(uploadsDir).filter(dir => {
                        const dirPath = path.join(uploadsDir, dir);
                        return fs.statSync(dirPath).isDirectory();
                    });

                    let filesDeleted = 0;
                    for (const clientDir of clientDirs) {
                        const clientDirPath = path.join(uploadsDir, clientDir);
                        try {
                            fs.removeSync(clientDirPath);
                            filesDeleted++;
                            console.log(`🗑️ Deleted directory: ${clientDir}`);
                        } catch (error) {
                            console.warn(`⚠️ Could not delete directory ${clientDir}:`, error.message);
                        }
                    }
                    console.log(`📂 Cleaned up ${filesDeleted} client directories`);
                }

                res.json({
                    success: true,
                    message: 'Database cleared successfully',
                    stats: {
                        clients_deleted: deleteResult.deletedCount,
                        upload_dirs_cleaned: (uploadsDir && fs.existsSync(uploadsDir)) ?
                            fs.readdirSync(uploadsDir).filter(dir =>
                                fs.statSync(path.join(uploadsDir, dir)).isDirectory()
                            ).length : 0
                    },
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                console.error('❌ Error clearing database:', error);
                res.status(500).json({
                    error: 'Error clearing database',
                    details: error.message
                });
            }
        },

        // Dashboard Status Endpoint with Helper
        getDashboardStatus: async (req, res) => {
            try {
                console.log('📊 Dashboard Status: Getting enhanced client statuses');

                const clients = await Client.find({}).sort({ updated_at: -1 });
                console.log(`📊 Found ${clients.length} clients in MongoDB`);

                // Debug: Log all clients with their basic info
                clients.forEach(client => {
                    console.log(`   - ${client.firstName} ${client.lastName} (${client.aktenzeichen}) - Email: ${client.email}`);
                });

                const clientStatuses = clients.map(client => {
                    const status = getClientDisplayStatus(client);

                    return {
                        id: client.id,
                        aktenzeichen: client.aktenzeichen,
                        name: `${client.firstName} ${client.lastName}`,
                        email: client.email,
                        created_at: client.created_at,
                        updated_at: client.updated_at,

                        // Enhanced status info
                        payment: status.payment,
                        documents: status.documents,
                        processing: status.processing,
                        review: status.review,
                        overall_status: status.overall_status,

                        // Raw data for detailed views
                        first_payment_received: client.first_payment_received,
                        payment_ticket_type: client.payment_ticket_type,
                        current_status: client.current_status,
                        documents_count: client.documents?.length || 0,
                        creditors_count: client.final_creditor_list?.length || 0,

                        // Timestamps
                        payment_processed_at: client.payment_processed_at,
                        document_request_sent_at: client.document_request_sent_at,
                        all_documents_processed_at: client.all_documents_processed_at,

                        // Actions needed
                        needs_attention: status.needs_attention,
                        next_action: status.next_action
                    };
                });

                // Statistics
                const stats = {
                    total_clients: clients.length,
                    payment_confirmed: clients.filter(c => c.first_payment_received).length,
                    awaiting_documents: clients.filter(c => c.payment_ticket_type === 'document_request').length,
                    processing: clients.filter(c => c.payment_ticket_type === 'processing_wait').length,
                    manual_review_needed: clients.filter(c => c.payment_ticket_type === 'manual_review').length,
                    auto_approved: clients.filter(c => c.payment_ticket_type === 'auto_approved').length,
                    no_creditors: clients.filter(c => c.payment_ticket_type === 'no_creditors_found').length,
                    needs_attention: clientStatuses.filter(c => c.needs_attention).length
                };

                res.json({
                    success: true,
                    clients: clientStatuses,
                    statistics: stats,
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                console.error('❌ Error getting dashboard status:', error);
                res.status(500).json({
                    error: 'Failed to get dashboard status',
                    details: error.message
                });
            }
        },

        // Mark Payment Received
        markPaymentReceived: async (req, res) => {
            try {
                const clientId = req.params.clientId;
                const client = await Client.findOne({ $or: [{ id: clientId }, { aktenzeichen: clientId }] });

                if (!client) {
                    return res.status(404).json({ error: 'Client not found' });
                }

                // Update client in MongoDB
                await Client.findByIdAndUpdate(client._id, {
                    first_payment_received: true,
                    payment_received_at: new Date(),
                    workflow_status: 'admin_review'
                });

                res.json({
                    success: true,
                    message: 'Payment marked as received',
                    workflow_status: 'admin_review'
                });
            } catch (error) {
                console.error('Error marking payment received:', error);
                res.status(500).json({
                    error: 'Error marking payment received',
                    details: error.message
                });
            }
        },

        // Reset Payment Status
        resetPaymentStatus: async (req, res) => {
            try {
                const clientId = req.params.clientId;
                const client = await Client.findOne({ $or: [{ id: clientId }, { aktenzeichen: clientId }] });

                if (!client) {
                    return res.status(404).json({ error: 'Client not found' });
                }

                console.log(`🔄 Admin resetting payment status for client ${client.aktenzeichen}`);

                // Reset payment and status fields
                client.first_payment_received = false;
                client.payment_processed_at = null;
                client.payment_ticket_type = null;
                client.current_status = 'waiting_for_payment';
                client.workflow_status = 'portal_access_sent';
                client.admin_approved = false;
                client.admin_approved_at = null;
                client.admin_approved_by = null;
                client.client_confirmed_creditors = false;
                client.client_confirmed_at = null;
                client.creditor_contact_started = false;
                client.creditor_contact_started_at = null;
                client.document_request_email_sent_at = null;
                client.all_documents_processed_at = null;

                // Clear final creditor list
                client.final_creditor_list = [];

                // Add status history entry
                if (!client.status_history) {
                    client.status_history = [];
                }

                client.status_history.push({
                    id: uuidv4(),
                    status: 'waiting_for_payment',
                    changed_by: 'admin',
                    metadata: {
                        action: 'reset_payment_status',
                        reason: 'Admin reset for testing',
                        reset_at: new Date().toISOString()
                    },
                    created_at: new Date()
                });

                // Save the client
                await client.save({ validateModifiedOnly: true });

                console.log(`✅ Payment status reset successfully for ${client.aktenzeichen}`);

                res.json({
                    success: true,
                    message: `Payment status reset for ${client.aktenzeichen}`,
                    new_status: client.current_status,
                    workflow_status: client.workflow_status
                });

            } catch (error) {
                console.error('Error resetting payment status:', error);
                res.status(500).json({
                    error: 'Error resetting payment status',
                    details: error.message
                });
            }
        },

        // Trigger 7-Day Review
        triggerSevenDayReview: async (req, res) => {
            try {
                const clientId = req.params.clientId;

                // Find client by ID or Aktenzeichen
                let client = await Client.findOne({ id: clientId });
                if (!client) {
                    client = await Client.findOne({ aktenzeichen: clientId });
                }

                if (!client) {
                    return res.status(404).json({
                        error: 'Client not found',
                        client_id: clientId
                    });
                }

                console.log(`🔄 Manual trigger of 7-day review for ${client.firstName} ${client.lastName} (${client.aktenzeichen})`);

                // Check if both conditions are met (payment + documents)
                const hasPayment = client.first_payment_received;
                const hasDocuments = (client.documents || []).length > 0;

                if (!hasPayment || !hasDocuments) {
                    return res.status(400).json({
                        error: 'Prerequisites not met for 7-day review',
                        missing: {
                            payment: !hasPayment,
                            documents: !hasDocuments
                        },
                        current_status: client.current_status
                    });
                }

                // Check if already triggered
                if (client.seven_day_review_triggered) {
                    return res.status(400).json({
                        error: '7-day review already triggered',
                        triggered_at: client.seven_day_review_triggered_at
                    });
                }

                // Initialized delayed service if available
                if (!DelayedProcessingService) {
                    return res.status(500).json({ error: 'DelayedProcessingService not initialized' });
                }
                const delayedService = new DelayedProcessingService();

                // Mark as triggered
                client.seven_day_review_triggered = true;
                client.seven_day_review_triggered_at = new Date();
                client.current_status = 'creditor_review';

                // Prepare status history entry
                const statusHistoryEntry = {
                    id: uuidv4(),
                    status: 'seven_day_review_manually_triggered',
                    changed_by: 'admin',
                    metadata: {
                        admin_action: 'Manual trigger via admin panel',
                        originally_scheduled_at: client.seven_day_review_scheduled_at,
                        triggered_at: new Date(),
                        days_skipped: client.seven_day_review_scheduled_at
                            ? Math.ceil((new Date(client.seven_day_review_scheduled_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                            : 0
                    }
                };

                // Use direct update to avoid document validation issues
                await Client.updateOne(
                    { _id: client._id },
                    {
                        $set: {
                            seven_day_review_triggered: true,
                            seven_day_review_triggered_at: new Date(),
                            current_status: 'creditor_review'
                        },
                        $push: {
                            status_history: statusHistoryEntry
                        }
                    }
                );

                // Trigger the creditor review process
                console.log(`🔄 Triggering creditor review process for client.id: "${client.id}" (${client.aktenzeichen})`);
                const result = await delayedService.triggerCreditorReviewProcess(client.id);

                res.json({
                    success: true,
                    message: '7-day review manually triggered',
                    client: {
                        id: client.id,
                        aktenzeichen: client.aktenzeichen,
                        name: `${client.firstName} ${client.lastName}`,
                        status: client.current_status
                    },
                    review_trigger: {
                        triggered_at: client.seven_day_review_triggered_at,
                        originally_scheduled: client.seven_day_review_scheduled_at,
                        zendesk_result: result
                    }
                });

            } catch (error) {
                console.error('❌ Error triggering 7-day review:', error);
                res.status(500).json({
                    error: 'Failed to trigger 7-day review',
                    details: error.message
                });
            }
        },

        // Generate Creditor List
        generateCreditorList: async (req, res) => {
            try {
                const clientId = req.params.clientId;
                const { adminName } = req.body;
                const client = await Client.findOne({ $or: [{ id: clientId }, { aktenzeichen: clientId }] });

                if (!client) {
                    return res.status(404).json({ error: 'Client not found' });
                }

                if (!client.first_payment_received) {
                    return res.status(400).json({
                        error: 'Payment not received yet',
                        current_status: client.workflow_status
                    });
                }

                // Generate creditor list from confirmed creditor documents
                const creditorDocuments = (client.documents || []).filter(doc =>
                    doc.document_status === 'creditor_confirmed' &&
                    doc.extracted_data?.creditor_data &&
                    doc.is_creditor_document !== false // Exclude documents marked as "not a creditor"
                );

                const finalCreditorList = creditorDocuments.map(doc => ({
                    id: doc.id,
                    sender_name: doc.extracted_data.creditor_data.sender_name,
                    sender_address: doc.extracted_data.creditor_data.sender_address,
                    sender_email: doc.extracted_data.creditor_data.sender_email,
                    reference_number: doc.extracted_data.creditor_data.reference_number,
                    claim_amount: doc.extracted_data.creditor_data.claim_amount,
                    is_representative: doc.extracted_data.creditor_data.is_representative,
                    actual_creditor: doc.extracted_data.creditor_data.actual_creditor,
                    source_document: doc.name,
                    ai_confidence: doc.extracted_data.confidence || 0,
                    status: 'pending_confirmation',
                    created_at: new Date().toISOString()
                }));

                // Update client in MongoDB
                await Client.findByIdAndUpdate(client._id, {
                    final_creditor_list: finalCreditorList,
                    admin_approved: true,
                    admin_approved_at: new Date(),
                    admin_approved_by: adminName || 'Admin',
                    workflow_status: 'client_confirmation'
                });

                res.json({
                    success: true,
                    message: 'Creditor list generated and approved',
                    creditors: finalCreditorList,
                    workflow_status: 'client_confirmation'
                });
            } catch (error) {
                console.error('Error generating creditor list:', error);
                res.status(500).json({
                    error: 'Error generating creditor list',
                    details: error.message
                });
            }
        },

        // Get Clients List (Admin Dashboard)
        getClients: async (req, res) => {
            try {
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 50;
                const skip = (page - 1) * limit;

                const search = req.query.search;
                const status = req.query.status;
                const dateFrom = req.query.dateFrom;
                const dateTo = req.query.dateTo;

                let query = {};

                if (status && status !== 'all') {
                    query.workflow_status = status;
                }

                if (search) {
                    query.$or = [
                        { firstName: { $regex: search, $options: 'i' } },
                        { lastName: { $regex: search, $options: 'i' } },
                        { email: { $regex: search, $options: 'i' } },
                        { aktenzeichen: { $regex: search, $options: 'i' } }
                    ];
                }

                if (dateFrom || dateTo) {
                    query.created_at = {};
                    if (dateFrom) query.created_at.$gte = new Date(dateFrom);
                    if (dateTo) query.created_at.$lte = new Date(dateTo);
                }

                let clients = [];
                let total = 0;

                // Try MongoDB first
                try {
                    if (databaseService.isHealthy()) {
                        total = await Client.countDocuments(query);

                        const pipeline = [
                            { $match: query },
                            { $sort: { created_at: -1 } },
                            { $skip: skip },
                            { $limit: limit },
                            {
                                $project: {
                                    _id: 1,
                                    firstName: 1,
                                    lastName: 1,
                                    email: 1,
                                    aktenzeichen: 1,
                                    workflow_status: 1,
                                    current_status: 1,
                                    created_at: 1,
                                    updated_at: 1,
                                    last_login: 1,
                                    zendesk_ticket_id: 1,
                                    first_payment_received: 1,
                                    admin_approved: 1,
                                    client_confirmed_creditors: 1,
                                    processing_complete_webhook_scheduled: 1,
                                    processing_complete_webhook_scheduled_at: 1,
                                    processing_complete_webhook_triggered: 1,
                                    all_documents_processed_at: 1,
                                    documents_count: { $size: { $ifNull: ["$documents", []] } },
                                    creditors_count: { $size: { $ifNull: ["$final_creditor_list", []] } }
                                }
                            }
                        ];

                        clients = await Client.aggregate(pipeline);

                        console.log(`📊 Found ${clients.length} clients in MongoDB (Page ${page}/${Math.ceil(total / limit)})`);
                    }
                } catch (mongoError) {
                    console.error('MongoDB query failed:', mongoError);
                }

                // Fallback to in-memory data if DB empty/offline (optional, matching original logic)
                if (clients.length === 0 && total === 0 && Object.keys(clientsData).length > 0) {
                    console.log('📊 Falling back to in-memory clients data');
                    let allMemoryClients = Object.values(clientsData).map(client => ({
                        _id: client.id,
                        firstName: client.firstName,
                        lastName: client.lastName,
                        email: client.email,
                        aktenzeichen: client.aktenzeichen,
                        workflow_status: client.workflow_status,
                        current_status: client.current_status,
                        documents_count: (client.documents || []).length,
                        creditors_count: (client.final_creditor_list || []).length,
                        created_at: client.created_at,
                        updated_at: client.updated_at,
                        last_login: client.last_login,
                        zendesk_ticket_id: client.zendesk_ticket_id,
                        first_payment_received: client.first_payment_received,
                        admin_approved: client.admin_approved,
                        client_confirmed_creditors: client.client_confirmed_creditors
                    }));

                    if (status && status !== 'all') {
                        allMemoryClients = allMemoryClients.filter(c => c.workflow_status === status);
                    }
                    if (search) {
                        const lowerSearch = search.toLowerCase();
                        allMemoryClients = allMemoryClients.filter(c =>
                            (c.firstName && c.firstName.toLowerCase().includes(lowerSearch)) ||
                            (c.lastName && c.lastName.toLowerCase().includes(lowerSearch)) ||
                            (c.email && c.email.toLowerCase().includes(lowerSearch)) ||
                            (c.aktenzeichen && c.aktenzeichen.toLowerCase().includes(lowerSearch))
                        );
                    }

                    total = allMemoryClients.length;
                    clients = allMemoryClients
                        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                        .slice(skip, skip + limit);
                }

                res.json({
                    clients,
                    pagination: {
                        total,
                        page,
                        limit,
                        totalPages: Math.ceil(total / limit)
                    }
                });
            } catch (error) {
                console.error('Error fetching clients:', error);
                res.status(500).json({
                    error: 'Error fetching clients',
                    details: error.message
                });
            }
        },

        // Get workflow status for a specific client
        getWorkflowStatus: async (req, res) => {
            try {
                const clientId = req.params.clientId;
                // Use database service directly if available, or Client model
                let client;
                if (databaseService && databaseService.isHealthy()) {
                    client = await Client.findOne({ $or: [{ id: clientId }, { aktenzeichen: clientId }] });
                } else {
                    // Fallback to in-memory if needed (legacy)
                    client = Object.values(clientsData).find(c => c.id === clientId || c.aktenzeichen === clientId);
                }

                if (!client) {
                    return res.status(404).json({ error: 'Client not found' });
                }

                const creditorDocuments = (client.documents || []).filter(doc =>
                    doc.document_status === 'creditor_confirmed' &&
                    doc.is_creditor_document !== false
                );

                const needsReview = (client.documents || []).filter(doc =>
                    doc.document_status === 'needs_review'
                );

                res.json({
                    client_name: `${client.firstName} ${client.lastName}`,
                    workflow_status: client.workflow_status,
                    first_payment_received: client.first_payment_received || false,
                    admin_approved: client.admin_approved || false,
                    client_confirmed_creditors: client.client_confirmed_creditors || false,
                    stats: {
                        total_documents: (client.documents || []).length,
                        creditor_documents: creditorDocuments.length,
                        needs_manual_review: needsReview.length,
                        final_creditor_count: (client.final_creditor_list || []).length
                    },
                    admin_approved_at: client.admin_approved_at,
                    admin_approved_by: client.admin_approved_by,
                    client_confirmed_at: client.client_confirmed_at
                });
            } catch (error) {
                console.error('Error fetching workflow status:', error);
                res.status(500).json({
                    error: 'Error fetching workflow status',
                    details: error.message
                });
            }
        },

        // Admin: Simulate 30-day period
        simulate30DayPeriod: async (req, res) => {
            try {
                const clientId = req.params.clientId;

                // Find client
                let client = await Client.findOne({ $or: [{ id: clientId }, { aktenzeichen: clientId }] });

                if (!client && clientsData[clientId]) {
                    client = clientsData[clientId];
                }

                if (!client) {
                    return res.status(404).json({ error: 'Client not found' });
                }

                console.log(`🕐 30-Day Simulation: Creating creditor calculation table for ${client.firstName} ${client.lastName} (${client.aktenzeichen})`);

                // Check if client has final_creditor_list
                if (!client.final_creditor_list || client.final_creditor_list.length === 0) {
                    return res.status(400).json({
                        error: 'No creditors found for calculation',
                        message: 'Client must have a final creditor list first. Please ensure documents are processed and creditors are approved.'
                    });
                }

                // Create creditor calculation table with 3-tier amount logic
                const currentTime = new Date().toISOString();
                const creditorCalculationTable = [];
                let totalDebt = 0;

                client.final_creditor_list.forEach((creditor, index) => {
                    let finalAmount = 0;
                    let amountSource = 'default_fallback';
                    let contactStatus = 'no_response';

                    // 3-Tier Logic:
                    // 1. Check if we got a creditor response (priority 1)
                    if (creditor.current_debt_amount && creditor.contact_status === 'responded') {
                        finalAmount = creditor.current_debt_amount;
                        amountSource = 'creditor_response';
                        contactStatus = 'responded';
                    }
                    else if (creditor.creditor_response_amount) {
                        finalAmount = creditor.creditor_response_amount;
                        amountSource = 'creditor_response';
                        contactStatus = 'responded';
                    }
                    // 2. Use AI-extracted amount from documents (priority 2)
                    else if (creditor.claim_amount) {
                        finalAmount = creditor.claim_amount;
                        amountSource = 'original_document';
                        contactStatus = creditor.contact_status || 'no_response';
                    }
                    // 3. Default €100 if no information available (priority 3)
                    else {
                        finalAmount = 100.00;
                        amountSource = 'default_fallback';
                        contactStatus = 'no_response';
                    }

                    totalDebt += finalAmount;

                    creditorCalculationTable.push({
                        id: creditor.id || `calc_${Date.now()}_${index}`,
                        name: creditor.sender_name || creditor.creditor_name || 'Unknown Creditor',
                        email: creditor.sender_email || creditor.creditor_email || '',
                        address: creditor.sender_address || creditor.creditor_address || '',
                        reference_number: creditor.reference_number || '',
                        original_amount: creditor.claim_amount || 0,
                        final_amount: finalAmount,
                        amount_source: amountSource,
                        contact_status: contactStatus,
                        is_representative: creditor.is_representative || false,
                        actual_creditor: creditor.actual_creditor || creditor.sender_name,
                        ai_confidence: creditor.ai_confidence || 0,
                        created_at: currentTime
                    });
                });

                // Store the creditor calculation table in the client record
                const updateFn = safeClientUpdate || (async (cid, updateCallback) => {
                    const c = await Client.findOne({ $or: [{ id: cid }, { aktenzeichen: cid }] });
                    if (!c) throw new Error('Client not found');
                    const updated = await updateCallback(c);
                    if (updated.save) await updated.save();
                    return updated;
                });

                const updatedClient = await updateFn(clientId, async (c) => {
                    c.creditor_calculation_table = creditorCalculationTable;
                    c.creditor_calculation_created_at = currentTime;
                    c.creditor_calculation_total_debt = totalDebt;
                    c.current_status = 'creditor_calculation_ready';

                    if (!c.admin_notes) c.admin_notes = [];
                    c.admin_notes.push({
                        timestamp: currentTime,
                        note: `🕐 30-Day Simulation: Created creditor calculation table with ${creditorCalculationTable.length} creditors, total debt: €${totalDebt.toFixed(2)}`,
                        admin: 'system_simulation'
                    });
                    return c;
                });

                // Generate automatic Schuldenbereinigungsplan calculation
                let settlementPlan = null;
                if (updatedClient.financial_data && updatedClient.financial_data.monthly_net_income && garnishmentCalculator) {
                    try {
                        console.log(`🧮 Generating automatic settlement plan calculation...`);
                        const financialData = {
                            netIncome: updatedClient.financial_data.monthly_net_income,
                            maritalStatus: updatedClient.financial_data.marital_status || 'ledig',
                            numberOfChildren: updatedClient.financial_data.number_of_children || 0
                        };

                        const creditorContacts = new Map();
                        creditorCalculationTable.forEach((creditor, index) => {
                            creditorContacts.set(`creditor_${index}`, {
                                client_reference: clientId,
                                creditor_name: creditor.name,
                                creditor_email: creditor.email,
                                reference_number: creditor.reference_number,
                                final_debt_amount: creditor.final_amount,
                                amount_source: creditor.amount_source,
                                contact_status: creditor.contact_status
                            });
                        });

                        settlementPlan = garnishmentCalculator.generateRestructuringAnalysis(
                            clientId,
                            financialData,
                            { creditorContacts }
                        );

                        if (settlementPlan && settlementPlan.success) {
                            await updateFn(clientId, async (c) => {
                                c.calculated_settlement_plan = settlementPlan;
                                return c;
                            });
                        }
                    } catch (error) {
                        console.error(`❌ Error generating settlement plan:`, error);
                    }
                }

                // Activate financial data form
                const finalUpdatedClient = await updateFn(clientId, async (c) => {
                    c.creditor_contact_started = true;
                    c.creditor_contact_started_at = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000); // 31 days ago
                    c.current_status = 'creditor_contact_active';
                    c.workflow_status = 'creditor_contact_active'; // Ensure workflow status is updated
                    return c;
                });

                // Send financial data reminder
                let emailResult = null;
                if (financialDataReminderService && finalUpdatedClient.zendesk_ticket_id && finalUpdatedClient.email) {
                    try {
                        emailResult = await financialDataReminderService.sendReminder(
                            finalUpdatedClient.zendesk_ticket_id,
                            {
                                firstName: finalUpdatedClient.firstName,
                                lastName: finalUpdatedClient.lastName,
                                email: finalUpdatedClient.email,
                                aktenzeichen: finalUpdatedClient.aktenzeichen
                            }
                        );

                        if (emailResult.success) {
                            await updateFn(clientId, async (c) => {
                                c.financial_data_reminder_sent_at = new Date();
                                if (emailResult.side_conversation_id) {
                                    c.financial_data_reminder_side_conversation_id = emailResult.side_conversation_id;
                                }
                                return c;
                            });
                        }
                    } catch (emailError) {
                        console.error(`❌ Error sending financial data reminder:`, emailError);
                    }
                }

                res.json({
                    success: true,
                    message: `30-Day simulation complete!`,
                    client_id: finalUpdatedClient.id,
                    aktenzeichen: finalUpdatedClient.aktenzeichen,
                    creditor_count: creditorCalculationTable.length,
                    total_debt: totalDebt
                });

            } catch (error) {
                console.error('❌ Error in 30-day simulation:', error.message);
                res.status(500).json({
                    error: 'Failed to run 30-day simulation',
                    details: error.message
                });
            }
        }
    };
};

module.exports = createAdminDashboardController;
