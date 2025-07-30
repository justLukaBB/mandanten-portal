const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Client = require('../models/Client');
const { authenticateAdmin } = require('../middleware/auth');
const { rateLimits } = require('../middleware/security');

const router = express.Router();

// Create test client with problematic documents for agent review
// POST /api/test/agent-review/create-test-scenario
router.post('/create-test-scenario', authenticateAdmin, rateLimits.general, async (req, res) => {
  try {
    console.log('🧪 Creating test scenario for agent review...');

    const testClientId = uuidv4();
    const testAktenzeichen = `TEST_REVIEW_${Date.now()}`;

    // Create test client with problematic documents
    const testClient = new Client({
      id: testClientId,
      aktenzeichen: testAktenzeichen,
      firstName: 'Max',
      lastName: 'Testmann',
      email: 'max.testmann@example.com',
      phone: '+49 123 456789',
      address: 'Teststraße 123, 12345 Berlin',
      
      // Portal access
      portal_link_sent: true,
      portal_link_sent_at: new Date(),
      current_status: 'documents_uploaded',
      
      // Payment received (so documents should be reviewed)
      first_payment_received: true,
      payment_processed_at: new Date(),
      
      // Test documents with varying confidence levels
      documents: [
        // Document 1: Very low confidence - needs review
        {
          id: uuidv4(),
          name: 'Problematic_Invoice_1.pdf',
          filename: 'problematic_invoice_1.pdf',
          type: 'application/pdf',
          size: 245760,
          uploadedAt: new Date(),
          processing_status: 'completed',
          is_creditor_document: true,
          confidence: 0.35, // Very low confidence
          extracted_data: {
            creditor_data: {
              sender_name: 'Unklare Bank AG', // Unclear name
              sender_email: 'inkasso@unclear-bank.de',
              reference_number: 'UB/2024/???', // Unclear reference
              claim_amount: 850.50
            },
            confidence: 0.35,
            reasoning: 'Document quality is poor, text partially unreadable, amounts unclear',
            manual_review_required: true
          }
        },
        
        // Document 2: Low confidence - needs review
        {
          id: uuidv4(),
          name: 'Damaged_Document_2.pdf',
          filename: 'damaged_document_2.pdf',
          type: 'application/pdf',
          size: 189440,
          uploadedAt: new Date(),
          processing_status: 'completed',
          is_creditor_document: true,
          confidence: 0.55, // Low confidence
          extracted_data: {
            creditor_data: {
              sender_name: 'Credit Solutions', // Incomplete name
              sender_email: '', // Missing email
              reference_number: 'CS-24-1234',
              claim_amount: 1200.00
            },
            confidence: 0.55,
            reasoning: 'Missing email address, company name seems incomplete',
            manual_review_required: true
          }
        },
        
        // Document 3: Borderline confidence - needs review
        {
          id: uuidv4(),
          name: 'Questionable_Bill_3.pdf',
          filename: 'questionable_bill_3.pdf',
          type: 'application/pdf',
          size: 156890,
          uploadedAt: new Date(),
          processing_status: 'completed',
          is_creditor_document: true,
          confidence: 0.72, // Borderline confidence (below 0.8 threshold)
          extracted_data: {
            creditor_data: {
              sender_name: 'Forderungsmanagement Schmidt & Partner GmbH',
              sender_email: 'info@schmidt-partner.de',
              reference_number: 'SP/2024/7891',
              claim_amount: 2150.75
            },
            confidence: 0.72,
            reasoning: 'Long company name, some OCR uncertainty in amount field',
            manual_review_required: true
          }
        },
        
        // Document 4: High confidence - should NOT need review
        {
          id: uuidv4(),
          name: 'Clear_Invoice_4.pdf',
          filename: 'clear_invoice_4.pdf',
          type: 'application/pdf',
          size: 198560,
          uploadedAt: new Date(),
          processing_status: 'completed',
          is_creditor_document: true,
          confidence: 0.95, // High confidence - no review needed
          extracted_data: {
            creditor_data: {
              sender_name: 'Deutsche Inkasso GmbH',
              sender_email: 'forderungen@deutsche-inkasso.de',
              reference_number: 'DI/2024/12345',
              claim_amount: 750.00
            },
            confidence: 0.95,
            reasoning: 'Clear document, all fields easily readable',
            manual_review_required: false
          }
        },
        
        // Document 5: Non-creditor document
        {
          id: uuidv4(),
          name: 'Personal_Document.pdf',
          filename: 'personal_document.pdf',
          type: 'application/pdf',
          size: 123450,
          uploadedAt: new Date(),
          processing_status: 'completed',
          is_creditor_document: false, // Not a creditor document
          confidence: 0.88
        }
      ],
      
      // Initial creditor list from AI extraction (problematic entries)
      final_creditor_list: [
        {
          id: uuidv4(),
          document_id: testClient?.documents?.[0]?.id,
          source_document: 'Problematic_Invoice_1.pdf',
          sender_name: 'Unklare Bank AG',
          sender_email: 'inkasso@unclear-bank.de',
          reference_number: 'UB/2024/???',
          claim_amount: 850.50,
          confidence: 0.35,
          status: 'pending',
          created_at: new Date()
        },
        {
          id: uuidv4(),
          document_id: testClient?.documents?.[1]?.id,
          source_document: 'Damaged_Document_2.pdf',
          sender_name: 'Credit Solutions',
          sender_email: '',
          reference_number: 'CS-24-1234',
          claim_amount: 1200.00,
          confidence: 0.55,
          status: 'pending',
          created_at: new Date()
        },
        {
          id: uuidv4(),
          document_id: testClient?.documents?.[2]?.id,
          source_document: 'Questionable_Bill_3.pdf',
          sender_name: 'Forderungsmanagement Schmidt & Partner GmbH',
          sender_email: 'info@schmidt-partner.de',
          reference_number: 'SP/2024/7891',
          claim_amount: 2150.75,
          confidence: 0.72,
          status: 'pending',
          created_at: new Date()
        },
        {
          id: uuidv4(),
          document_id: testClient?.documents?.[3]?.id,
          source_document: 'Clear_Invoice_4.pdf',
          sender_name: 'Deutsche Inkasso GmbH',
          sender_email: 'forderungen@deutsche-inkasso.de',
          reference_number: 'DI/2024/12345',
          claim_amount: 750.00,
          confidence: 0.95,
          status: 'confirmed',
          created_at: new Date()
        }
      ],
      
      // Status history
      status_history: [
        {
          id: uuidv4(),
          status: 'created',
          changed_by: 'system',
          metadata: { action: 'test_client_created' },
          created_at: new Date(Date.now() - 24 * 60 * 60 * 1000) // 1 day ago
        },
        {
          id: uuidv4(),
          status: 'portal_access_sent',
          changed_by: 'agent',
          metadata: { action: 'portal_link_sent' },
          created_at: new Date(Date.now() - 20 * 60 * 60 * 1000) // 20 hours ago
        },
        {
          id: uuidv4(),
          status: 'documents_uploaded',
          changed_by: 'client',
          metadata: { documents_count: 5 },
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
        }
      ],
      
      created_at: new Date(Date.now() - 24 * 60 * 60 * 1000),
      updated_at: new Date()
    });

    // Fix document references after client creation
    testClient.final_creditor_list[0].document_id = testClient.documents[0].id;
    testClient.final_creditor_list[1].document_id = testClient.documents[1].id;
    testClient.final_creditor_list[2].document_id = testClient.documents[2].id;
    testClient.final_creditor_list[3].document_id = testClient.documents[3].id;

    await testClient.save();

    // Count documents that need review
    const documentsNeedingReview = testClient.documents.filter(doc => 
      doc.is_creditor_document === true && 
      (doc.confidence || 0) < 0.8
    );

    const creditorsNeedingReview = testClient.final_creditor_list.filter(c => 
      (c.confidence || 0) < 0.8
    );

    console.log(`✅ Test scenario created successfully!`);
    console.log(`📊 Client: ${testClient.aktenzeichen} (${testClient.firstName} ${testClient.lastName})`);
    console.log(`📄 Documents: ${testClient.documents.length} total, ${documentsNeedingReview.length} need review`);
    console.log(`👥 Creditors: ${testClient.final_creditor_list.length} total, ${creditorsNeedingReview.length} need review`);

    res.json({
      success: true,
      message: 'Test scenario created successfully',
      test_client: {
        id: testClient.id,
        aktenzeichen: testClient.aktenzeichen,
        name: `${testClient.firstName} ${testClient.lastName}`,
        email: testClient.email,
        documents: {
          total: testClient.documents.length,
          need_review: documentsNeedingReview.length,
          high_confidence: testClient.documents.length - documentsNeedingReview.length
        },
        creditors: {
          total: testClient.final_creditor_list.length,
          need_review: creditorsNeedingReview.length,
          verified: testClient.final_creditor_list.length - creditorsNeedingReview.length
        },
        review_url: `/agent/review/${testClient.id}`,
        direct_review_url: `https://mandanten-portal.onrender.com/agent/review/${testClient.id}`
      },
      review_summary: {
        documents_to_review: documentsNeedingReview.map(doc => ({
          name: doc.name,
          confidence: doc.confidence,
          issue: doc.extracted_data?.reasoning || 'Low confidence extraction'
        })),
        creditors_to_review: creditorsNeedingReview.map(cred => ({
          name: cred.sender_name,
          confidence: cred.confidence,
          missing_data: !cred.sender_email ? 'Email missing' : null
        }))
      }
    });

  } catch (error) {
    console.error('❌ Error creating test scenario:', error);
    res.status(500).json({
      error: 'Failed to create test scenario',
      details: error.message
    });
  }
});

// Get test scenarios for agent review
// GET /api/test/agent-review/scenarios
router.get('/scenarios', authenticateAdmin, rateLimits.general, async (req, res) => {
  try {
    const testClients = await Client.find({
      aktenzeichen: { $regex: /^TEST_REVIEW_/ }
    }).sort({ created_at: -1 }).limit(10);

    const scenarios = testClients.map(client => {
      const documentsNeedingReview = client.documents.filter(doc => 
        doc.is_creditor_document === true && 
        (doc.confidence || 0) < 0.8
      );

      return {
        id: client.id,
        aktenzeichen: client.aktenzeichen,
        name: `${client.firstName} ${client.lastName}`,
        created_at: client.created_at,
        documents_needing_review: documentsNeedingReview.length,
        total_documents: client.documents.length,
        review_url: `/agent/review/${client.id}`,
        direct_review_url: `https://mandanten-portal.onrender.com/agent/review/${client.id}`
      };
    });

    res.json({
      success: true,
      scenarios: scenarios,
      total: scenarios.length
    });

  } catch (error) {
    console.error('❌ Error getting test scenarios:', error);
    res.status(500).json({
      error: 'Failed to get test scenarios',
      details: error.message
    });
  }
});

// Clean up test scenarios
// DELETE /api/test/agent-review/cleanup
router.delete('/cleanup', authenticateAdmin, rateLimits.general, async (req, res) => {
  try {
    const result = await Client.deleteMany({
      aktenzeichen: { $regex: /^TEST_REVIEW_/ }
    });

    console.log(`🧹 Cleaned up ${result.deletedCount} test scenarios`);

    res.json({
      success: true,
      message: `Cleaned up ${result.deletedCount} test scenarios`,
      deleted_count: result.deletedCount
    });

  } catch (error) {
    console.error('❌ Error cleaning up test scenarios:', error);
    res.status(500).json({
      error: 'Failed to clean up test scenarios',
      details: error.message
    });
  }
});

module.exports = router;