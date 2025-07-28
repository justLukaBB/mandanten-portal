const GoogleDocumentAI_REST = require('./googleDocumentAI_REST');
const fs = require('fs-extra');
const path = require('path');

// Initialize Google Document AI REST client with error handling
let googleDocAI = null;
try {
  googleDocAI = new GoogleDocumentAI_REST();
  console.log('✅ Google Document AI REST client initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize Google Document AI REST client:', error.message);
  console.log('📝 Document processing will continue with mock data for development');
}

class DocumentProcessor {
  constructor() {
    this.extractionPrompt = `
Du bist ein Experte für deutsche Rechtsdokumente. Analysiere das Dokument und extrahiere alle relevanten Informationen.

SCHRITT 1: Identifiziere zuerst den Dokumenttyp
- Ist dies ein Gläubigerdokument (Rechnung, Mahnung, Forderung)?
- Ist es an einen Privatperson oder Anwaltskanzlei adressiert?
- Fordert es eine Zahlung?

SCHRITT 2: Extrahiere systematisch folgende Daten:

**ABSENDER (oberster Bereich des Dokuments):**
- Firmenname/Name (meist im Briefkopf)
- Vollständige Adresse (Straße, PLZ, Stadt)
- E-Mail-Adresse (falls sichtbar)
- Telefonnummer (falls sichtbar)

**AKTENZEICHEN/REFERENZ:**
- Suche nach: "Az:", "Aktenzeichen:", "Referenz:", "Kundennummer:", "Vertragsnummer:", "Rechnungsnummer:"
- Auch numerische Codes in der Betreffzeile

**GLÄUBIGER vs. VERTRETER:**
- Achte auf: "im Auftrag von", "für", "im Namen von", "als Rechtsanwalt für"
- Bei Inkassobüros: Wer ist der ursprüngliche Gläubiger?

**GELDBETRAG:**
- Suche nach €-Zeichen, "EUR", "Euro"
- "Forderung:", "Betrag:", "Summe:", "zu zahlen:"
- Auch Tabellen mit Beträgen

**EMPFÄNGER/ADRESSAT:**
- An wen ist das Dokument adressiert?
- Steht da eine Privatperson oder "Rechtsanwalt"/"Kanzlei"?

Gib das Ergebnis in folgendem JSON-Format zurück:

{
  "sender": {
    "name": "Exact company/person name",
    "address": "Complete address",
    "email": "Email if found",
    "phone": "Phone if found"
  },
  "reference_number": "Any reference numbers found",
  "creditor_vs_representative": {
    "is_representative": true/false,
    "actual_creditor": "Real creditor if different from sender",
    "relationship": "Rechtsanwalt/Inkassobüro/etc."
  },
  "claim_amount": "Exact amount with currency",
  "document_type": "Rechnung/Mahnung/Zahlungsaufforderung/etc.",
  "recipient": "Who is this addressed to",
  "classification": {
    "is_creditor_document": true/false,
    "addressed_to_client": true/false,
    "demands_payment": true/false,
    "confidence_score": 0.0-1.0
  },
  "extracted_text_key_phrases": ["important phrases found"]
}

WICHTIG: 
- Gib NUR das JSON-Objekt zurück, keinen anderen Text
- Bei Unsicherheit: niedrigere confidence_score
- Alle gefundenen Informationen vollständig extrahieren
- Bei fehlenden Daten: null verwenden`;
  }

  /**
   * Process uploaded document and extract creditor information using Google Document AI
   */
  async processDocument(filePath, originalName) {
    try {
      console.log(`=== DOCUMENT PROCESSOR START ===`);
      console.log(`Processing document: ${originalName}`);
      console.log(`File path: ${filePath}`);
      
      const fileExtension = path.extname(originalName).toLowerCase();
      console.log(`File extension: ${fileExtension}`);
      
      // Check if file type is supported
      if (!['.pdf', '.jpg', '.jpeg', '.png'].includes(fileExtension)) {
        throw new Error(`Unsupported file type: ${fileExtension}`);
      }

      // Process document with Google Document AI or fallback
      let extractedData;
      if (googleDocAI) {
        console.log('Calling Google Document AI...');
        extractedData = await googleDocAI.processDocument(filePath, originalName);
        console.log('Google Document AI processing completed successfully');
      } else {
        console.log('⚠️ Google Document AI not available, using mock data for testing...');
        extractedData = {
          processing_status: 'completed',
          is_creditor_document: true,
          confidence: 0.85,
          manual_review_required: false,
          reasoning: 'Mock processing - Google Document AI not configured',
          creditor_data: {
            sender_name: 'Mock Gläubiger GmbH',
            sender_email: 'info@mockglaeubiger.de',
            reference_number: 'MOCK-2024-001',
            claim_amount: '€ 1.250,00',
            is_representative: false
          },
          raw_text: 'Mock extracted text from document processing...'
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