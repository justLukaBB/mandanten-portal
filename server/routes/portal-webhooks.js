const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Client = require('../models/Client');
const { rateLimits } = require('../middleware/security');

const router = express.Router();

// Portal Webhook: Documents Uploaded
// Triggered when client uploads documents in portal
router.post('/documents-uploaded', rateLimits.general, async (req, res) => {
  try {
    console.log('📄 Portal Webhook: Documents-Uploaded received', req.body);
    
    const {
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

    // Update client status
    const documentsCount = client.documents?.length || 0;
    if (documentsCount > 0) {
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

    await client.save();

    console.log(`✅ Document upload processed for ${client.aktenzeichen}. Total documents: ${documentsCount}`);

    res.json({
      success: true,
      message: 'Document upload processed',
      client_status: client.current_status,
      documents_count: documentsCount,
      next_step: 'Documents are being processed by AI'
    });

  } catch (error) {
    console.error('❌ Error in documents-uploaded webhook:', error);
    res.status(500).json({
      error: 'Failed to process document upload webhook',
      details: error.message
    });
  }
});

// Portal Webhook: Creditors Confirmed
// Triggered when client confirms creditor list in portal
router.post('/creditors-confirmed', rateLimits.general, async (req, res) => {
  try {
    console.log('✅ Portal Webhook: Creditors-Confirmed received', req.body);
    
    const {
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

    // TODO: Integrate with Zendesk API to create creditor contact ticket
    // This would be where we create Side Conversations for each creditor

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
});

// Portal Webhook: Document Processing Complete
// Triggered when AI processing of documents is complete
router.post('/document-processing-complete', rateLimits.general, async (req, res) => {
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
      const creditorDocs = allDocuments.filter(d => d.is_creditor_document === true);
      
      if (client.current_status === 'documents_processing') {
        client.current_status = 'waiting_for_payment';
        client.updated_at = new Date();

        // Add status history
        client.status_history.push({
          id: uuidv4(),
          status: 'waiting_for_payment',
          changed_by: 'system',
          metadata: {
            processing_completed: new Date().toISOString(),
            total_documents: allDocuments.length,
            creditor_documents: creditorDocs.length,
            processing_results: processing_results || {}
          }
        });

        await client.save();
        
        console.log(`✅ All documents processed for ${client.aktenzeichen}. Status: waiting_for_payment`);
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
});

module.exports = router;