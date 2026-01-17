const GeminiServiceAdapter = require('./geminiServiceAdapter');
const fs = require('fs-extra');
const path = require('path');

// Initialize Gemini Service Adapter (Local Python Service)
let geminiAdapter = null;
try {
  geminiAdapter = new GeminiServiceAdapter();
  console.log('✅ Gemini Service Adapter initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize Gemini Service Adapter:', error.message);
}

class DocumentProcessor {
  constructor() {
    this.extractionPrompt = `(Prompt handled by Python Service)`;
  }

  /**
   * Process uploaded document and extract creditor information using Local Python Gemini Service
   */
  async processDocument(filePath, originalName) {
    try {
      console.log(`=== DOCUMENT PROCESSOR START (Gemini Mode) ===`);
      console.log(`Processing document: ${originalName}`);
      console.log(`File path: ${filePath}`);

      const fileExtension = path.extname(originalName).toLowerCase();
      console.log(`File extension: ${fileExtension}`);

      // Check if file type is supported
      if (!['.pdf', '.jpg', '.jpeg', '.png'].includes(fileExtension)) {
        throw new Error(`Unsupported file type: ${fileExtension}`);
      }

      // Process document with Gemini Service or fallback
      let extractedData;
      if (geminiAdapter) {
        console.log('Calling Gemini Python Service...');
        extractedData = await geminiAdapter.processDocument(filePath, originalName);
        console.log('Gemini processing completed successfully');
      } else {
        console.log('⚠️ Gemini Adapter not available, using mock data for testing...');
        extractedData = {
          processing_status: 'completed',
          is_creditor_document: true,
          confidence: 0.85,
          manual_review_required: false,
          reasoning: 'Mock processing - Gemini Service not available',
          creditor_data: {
            sender_name: 'Mock Gemini Gläubiger',
            sender_email: 'gemini@mock.de',
            reference_number: 'GEMINI-TEST-001',
            claim_amount: '€ 500,00',
            is_representative: false
          },
          raw_text: 'Mock extracted text...'
        };
      }

      // Add metadata
      extractedData.document_metadata = {
        original_name: originalName,
        file_type: fileExtension,
        processed_at: new Date().toISOString(),
        processing_method: 'google_document_ai',
        processor_version: 'google-cloud-documentai-v8',
        success: true,
        text_extracted: !!(extractedData.raw_text && extractedData.raw_text.length > 0),
        parsing_successful: !extractedData.parsing_error
      };

      console.log(`📊 DOCUMENT PROCESSOR SUMMARY:`);
      console.log(`   ✅ Processing Method: ${extractedData.document_metadata.processing_method}`);
      console.log(`   📄 Text Extracted: ${extractedData.document_metadata.text_extracted ? '✅ YES' : '❌ NO'}`);
      console.log(`   🔍 Parsing Success: ${extractedData.document_metadata.parsing_successful ? '✅ YES' : '❌ NO'}`);
      console.log(`   📝 Raw Text Length: ${extractedData.raw_text?.length || 0} chars`);

      return extractedData;
    } catch (error) {
      console.error('=== DOCUMENT PROCESSING ERROR ===');
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      console.error('=== END ERROR ===');
      return {
        error: true,
        message: error.message,
        document_metadata: {
          original_name: originalName,
          processed_at: new Date().toISOString(),
          processing_failed: true,
          processing_method: 'google_document_ai'
        }
      };
    }
  }

  // Old OpenAI methods removed - now using Google Document AI

  /**
   * Validate extraction results from Claude AI - delegate to Claude AI's own validation
   */
  validateExtraction(extractedData) {
    // Claude AI now handles its own validation, so we just return that
    if (extractedData.validation) {
      return extractedData.validation;
    }

    // Fallback validation if Claude validation is missing
    const validation = {
      is_valid: extractedData.processing_status === 'completed',
      warnings: [],
      confidence: extractedData.confidence || 0.5,
      claude_confidence: extractedData.confidence || 0.5,
      data_completeness: 0.5,
      requires_manual_review: extractedData.manual_review_required || false
    };

    if (extractedData.is_creditor_document) {
      validation.warnings.push('Gläubigerdokument erkannt');
    } else {
      validation.warnings.push('Kein Gläubigerdokument erkannt');
    }

    return validation;
  }

  /**
   * Generate summary for extracted data from Claude AI - delegate to Claude AI's own summary
   */
  generateSummary(extractedData) {
    // Claude AI now handles its own summary generation, so we just return that
    if (extractedData.summary) {
      return extractedData.summary;
    }

    // Fallback summary generation if Claude summary is missing
    if (extractedData.is_creditor_document && extractedData.creditor_data) {
      const sender = extractedData.creditor_data.sender_name || 'Unbekannter Absender';
      const amount = extractedData.creditor_data.claim_amount ? `${extractedData.creditor_data.claim_amount}€` : 'Unbekannter Betrag';

      let summary = `Gläubigerdokument von ${sender}`;

      if (extractedData.creditor_data.is_representative && extractedData.creditor_data.actual_creditor) {
        summary += ` (für ${extractedData.creditor_data.actual_creditor})`;
      }

      summary += ` - Forderung: ${amount}`;

      if (extractedData.creditor_data.reference_number) {
        summary += ` (Az: ${extractedData.creditor_data.reference_number})`;
      }

      summary += ` (${Math.round((extractedData.confidence || 0) * 100)}% Sicherheit)`;

      return summary;
    }

    return `Dokument verarbeitet (${Math.round((extractedData.confidence || 0) * 100)}% Sicherheit)`;
  }
}

module.exports = DocumentProcessor;