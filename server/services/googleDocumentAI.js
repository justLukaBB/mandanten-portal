const { DocumentProcessorServiceClient } = require('@google-cloud/documentai');
const fs = require('fs-extra');
const path = require('path');

class GoogleDocumentAI {
  constructor() {
    // Initialize Google Document AI client exactly as per Google documentation
    try {
      // Set environment variable for authentication
      const credentialsPath = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
      console.log('Setting GOOGLE_APPLICATION_CREDENTIALS to:', credentialsPath);
      
      // Verify credentials file exists
      if (!fs.existsSync(credentialsPath)) {
        throw new Error(`Service account key file not found: ${credentialsPath}`);
      }
      
      // Explicitly set the environment variable for Google Cloud authentication
      process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
      
      // Initialize client with explicit configuration as per Google docs
      this.client = new DocumentProcessorServiceClient({
        keyFilename: credentialsPath,
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
      });
      
      this.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
      this.location = process.env.GOOGLE_CLOUD_LOCATION;
      this.processorId = process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID;
      this.processorName = `projects/${this.projectId}/locations/${this.location}/processors/${this.processorId}`;
      
      console.log('Google Document AI Client initialized successfully');
      console.log('Project ID:', this.projectId);
      console.log('Location:', this.location);
      console.log('Processor ID:', this.processorId);
      console.log('Full processor name:', this.processorName);
      
    } catch (error) {
      console.error('Failed to initialize Google Document AI client:', error);
      throw error;
    }
  }

  /**
   * Test authentication and basic connectivity
   */
  async testConnection() {
    try {
      console.log('Testing Google Document AI connection...');
      const parent = `projects/${this.projectId}/locations/${this.location}`;
      
      // Try to list processors as a connectivity test
      const [processors] = await this.client.listProcessors({ parent });
      console.log(`Found ${processors.length} processors in project`);
      
      // Check if our target processor exists
      const targetProcessor = processors.find(p => p.name === this.processorName);
      if (targetProcessor) {
        console.log('Target processor found:', targetProcessor.displayName);
        console.log('Processor type:', targetProcessor.type);
        console.log('Processor state:', targetProcessor.state);
        return true;
      } else {
        console.error('Target processor not found!');
        console.log('Available processors:');
        processors.forEach((p, i) => {
          console.log(`${i + 1}. ${p.name} (${p.displayName}) - ${p.type} - ${p.state}`);
        });
        return false;
      }
    } catch (error) {
      console.error('Connection test failed:', error.message);
      return false;
    }
  }

  /**
   * Process document using Google Document AI - following official Google documentation
   */
  async processDocument(filePath, originalName) {
    try {
      console.log(`=== GOOGLE DOCUMENT AI PROCESSING START ===`);
      console.log(`Processing document: ${originalName}`);
      console.log(`File path: ${filePath}`);
      
      // Verify file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      // Read the file as binary
      const fileBuffer = await fs.readFile(filePath);
      console.log('File size:', fileBuffer.length, 'bytes');
      
      // Determine MIME type
      const fileExtension = path.extname(originalName).toLowerCase();
      let mimeType;
      
      switch (fileExtension) {
        case '.pdf':
          mimeType = 'application/pdf';
          break;
        case '.png':
          mimeType = 'image/png';
          break;
        case '.jpg':
        case '.jpeg':
          mimeType = 'image/jpeg';
          break;
        default:
          throw new Error(`Unsupported file type: ${fileExtension}`);
      }
      
      console.log('MIME type:', mimeType);

      // Encode content as base64 (required by Google Document AI)
      const base64Content = fileBuffer.toString('base64');
      console.log('Base64 encoded content length:', base64Content.length);
      
      // Create request object exactly as per Google documentation
      const request = {
        name: this.processorName,
        rawDocument: {
          content: base64Content,
          mimeType: mimeType,
        }
      };
      
      console.log('Request processor name:', request.name);
      console.log('Request MIME type:', request.rawDocument.mimeType);
      console.log('Request content preview:', base64Content.substring(0, 50) + '...');

      // Send the request to Google Document AI (skip connection test to avoid permission issues)
      console.log('=== SENDING REQUEST TO GOOGLE DOCUMENT AI ===');
      
      // Try processing the document
      const [result] = await this.client.processDocument(request);
      console.log('=== REQUEST SUCCESSFUL ===');
      
      console.log('=== FULL DOCUMENT AI RESPONSE ===');
      console.log('Result keys:', Object.keys(result));
      console.log('Document keys:', result.document ? Object.keys(result.document) : 'No document');
      console.log('Document structure:');
      console.log(JSON.stringify(result.document, null, 2).substring(0, 2000));
      console.log('=== END FULL RESPONSE ===');
      
      // Extract text from the response
      const extractedText = result.document.text;
      console.log('=== GOOGLE DOCUMENT AI RESPONSE ===');
      console.log('Extracted text length:', extractedText?.length || 0);
      console.log('First 500 chars of extracted text:', extractedText?.substring(0, 500));
      console.log('=== END RESPONSE ===');
      
      if (!extractedText || extractedText.trim().length === 0) {
        console.error('ERROR: No text was extracted from the document');
        throw new Error('No text was extracted from the document');
      }
      
      // Parse the extracted text to structure it for creditor documents
      console.log('Starting text parsing...');
      try {
        const structuredData = await this.parseExtractedText(extractedText, originalName);
        console.log('=== FINAL STRUCTURED DATA ===');
        console.log(JSON.stringify(structuredData, null, 2));
        console.log('=== END STRUCTURED DATA ===');
        
        return structuredData;
      } catch (parseError) {
        console.error('Text parsing failed, returning basic structure:', parseError);
        // Return basic structure with extracted text if parsing fails
        return {
          sender: {
            name: "Parsing fehlgeschlagen",
            address: null,
            email: null,
            phone: null
          },
          reference_number: null,
          creditor_vs_representative: {
            is_representative: false,
            actual_creditor: null,
            relationship: null
          },
          claim_amount: null,
          document_type: "OCR-Dokument",
          recipient: null,
          classification: {
            is_creditor_document: false,
            addressed_to_client: false,
            demands_payment: false,
            confidence_score: 0.1
          },
          extracted_text_key_phrases: [],
          raw_text: extractedText.substring(0, 1000),
          parsing_error: parseError.message
        };
      }
      
    } catch (error) {
      console.error('Google Document AI processing error:', error);
      throw new Error(`Google Document AI failed: ${error.message}`);
    }
  }

  /**
   * Parse extracted text and structure it for creditor documents
   */
  async parseExtractedText(text, filename) {
    if (!text || text.trim().length === 0) {
      throw new Error('No text was extracted from the document');
    }

    console.log('Parsing extracted text for creditor information...');
    
    // Initialize result object
    const result = {
      sender: {
        name: null,
        address: null,
        email: null,
        phone: null
      },
      reference_number: null,
      creditor_vs_representative: {
        is_representative: false,
        actual_creditor: null,
        relationship: null
      },
      claim_amount: null,
      document_type: null,
      recipient: null,
      classification: {
        is_creditor_document: false,
        addressed_to_client: false,
        demands_payment: false,
        confidence_score: 0.8
      },
      extracted_text_key_phrases: [],
      raw_text: text.substring(0, 1000) // First 1000 chars for debugging
    };

    // Parse different sections
    this.extractSenderInfo(text, result);
    this.extractReferenceNumbers(text, result);
    this.extractAmounts(text, result);
    this.extractDocumentType(text, result);
    this.extractRecipientInfo(text, result);
    this.classifyDocument(text, result);
    this.extractRepresentativeInfo(text, result);
    this.extractKeyPhrases(text, result);

    console.log('Parsed document data:', JSON.stringify(result, null, 2));
    return result;
  }

  /**
   * Extract sender information from text
   */
  extractSenderInfo(text, result) {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // Look for company names (usually in first few lines)
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const line = lines[i];
      
      // Skip common header words
      if (line.match(/^(Seite|Page|\d+|Datum|Date)/i)) continue;
      
      // Look for company patterns
      if (line.match(/(GmbH|AG|KG|e\.?V\.?|Rechtsanwälte?|Kanzlei|Inkasso)/i)) {
        if (!result.sender.name) {
          result.sender.name = line;
        }
      }
    }

    // Extract email addresses
    const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      result.sender.email = emailMatch[1];
    }

    // Extract phone numbers
    const phoneMatch = text.match(/(\+?49\s?[-\s]?\(?0?\)?\s?\d{2,4}\s?[-\s]?\d{3,8}|\d{4,5}\s?[-\/\s]?\d{3,8})/);
    if (phoneMatch) {
      result.sender.phone = phoneMatch[1];
    }

    // Extract address (look for postal codes)
    const addressMatch = text.match(/(\d{5}\s+[A-ZÄÖÜ][a-zäöüß\s]+)/);
    if (addressMatch) {
      // Find the line containing this and potentially the line before
      const addressLine = addressMatch[0];
      const addressIndex = text.indexOf(addressLine);
      const beforeAddress = text.substring(Math.max(0, addressIndex - 100), addressIndex);
      const streetMatch = beforeAddress.match(/([A-ZÄÖÜ][a-zäöüß\s]+\s+\d+[a-z]?)\s*$/);
      
      if (streetMatch) {
        result.sender.address = streetMatch[1] + ', ' + addressLine;
      } else {
        result.sender.address = addressLine;
      }
    }
  }

  /**
   * Extract reference numbers
   */
  extractReferenceNumbers(text, result) {
    const patterns = [
      /(?:Az\.?|Aktenzeichen|Referenz|Kundennummer|Vertragsnummer|Rechnungsnummer)[\s:]+([A-Z0-9\-\/\.]+)/i,
      /(?:Az|AZ)[\s:]+([A-Z0-9\-\/\.]+)/,
      /Betreff[\s:]+.*?([A-Z0-9\-\/\.]{5,})/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        result.reference_number = match[1].trim();
        break;
      }
    }
  }

  /**
   * Extract monetary amounts
   */
  extractAmounts(text, result) {
    const patterns = [
      /(?:Forderung|Betrag|Summe|zu zahlen|Gesamtbetrag)[\s:]+(\d{1,3}(?:\.\d{3})*,\d{2})\s*(?:€|EUR|Euro)/i,
      /(\d{1,3}(?:\.\d{3})*,\d{2})\s*(?:€|EUR|Euro)/g
    ];

    for (const pattern of patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          result.claim_amount = match[1] + ' €';
          break;
        }
      }
      if (result.claim_amount) break;
    }
  }

  /**
   * Extract document type
   */
  extractDocumentType(text, result) {
    const types = [
      { pattern: /mahnung/i, type: 'Mahnung' },
      { pattern: /rechnung/i, type: 'Rechnung' },
      { pattern: /zahlungsaufforderung/i, type: 'Zahlungsaufforderung' },
      { pattern: /forderung/i, type: 'Forderungsschreiben' },
      { pattern: /inkasso/i, type: 'Inkassoschreiben' },
      { pattern: /vollstreckung/i, type: 'Vollstreckungsbescheid' }
    ];

    for (const { pattern, type } of types) {
      if (text.match(pattern)) {
        result.document_type = type;
        break;
      }
    }

    if (!result.document_type) {
      result.document_type = 'Unbekannter Dokumenttyp';
    }
  }

  /**
   * Extract recipient information
   */
  extractRecipientInfo(text, result) {
    // Look for recipient after common patterns
    const recipientPatterns = [
      /(?:An:|Herrn|Frau|Familie)\s+([A-ZÄÖÜ][a-zäöüß\s]+)/,
      /^([A-ZÄÖÜ][a-zäöüß]+\s+[A-ZÄÖÜ][a-zäöüß]+)/m
    ];

    for (const pattern of recipientPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        result.recipient = match[1].trim();
        break;
      }
    }
  }

  /**
   * Classify the document
   */
  classifyDocument(text, result) {
    // Check if it's a creditor document
    const creditorKeywords = ['zahlung', 'forderung', 'betrag', 'mahnung', 'rechnung', 'inkasso'];
    const hasCreditorKeywords = creditorKeywords.some(keyword => 
      text.toLowerCase().includes(keyword)
    );

    // Check if it demands payment
    const paymentKeywords = ['zu zahlen', 'überweisen', 'begleichen', 'bezahlen'];
    const demandsPayment = paymentKeywords.some(keyword => 
      text.toLowerCase().includes(keyword)
    );

    // Check if addressed to client (not to law firm)
    const lawFirmKeywords = ['rechtsanwalt', 'kanzlei', 'anwaltskanzlei'];
    const addressedToLawFirm = lawFirmKeywords.some(keyword => 
      text.toLowerCase().includes(keyword)
    );

    result.classification.is_creditor_document = hasCreditorKeywords;
    result.classification.demands_payment = demandsPayment;
    result.classification.addressed_to_client = !addressedToLawFirm;

    // Calculate confidence score
    let confidence = 0.5;
    if (hasCreditorKeywords) confidence += 0.2;
    if (demandsPayment) confidence += 0.2;
    if (result.claim_amount) confidence += 0.1;
    if (result.sender.name) confidence += 0.1;
    if (result.reference_number) confidence += 0.1;

    result.classification.confidence_score = Math.min(1.0, confidence);
  }

  /**
   * Extract representative information
   */
  extractRepresentativeInfo(text, result) {
    const representativePatterns = [
      /im\s+(?:namen|auftrag)\s+(?:von|der|des)\s+([^.]+)/i,
      /für\s+([A-ZÄÖÜ][a-zäöüß\s&.]+)(?:\s+gegen\s+)/i,
      /als\s+rechtsanwalt\s+für\s+([^.]+)/i
    ];

    for (const pattern of representativePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        result.creditor_vs_representative.is_representative = true;
        result.creditor_vs_representative.actual_creditor = match[1].trim();
        
        if (text.toLowerCase().includes('rechtsanwalt')) {
          result.creditor_vs_representative.relationship = 'Rechtsanwalt';
        } else if (text.toLowerCase().includes('inkasso')) {
          result.creditor_vs_representative.relationship = 'Inkassobüro';
        } else {
          result.creditor_vs_representative.relationship = 'Vertreter';
        }
        break;
      }
    }
  }

  /**
   * Extract key phrases for analysis
   */
  extractKeyPhrases(text, result) {
    const keyPhrases = [];
    const patterns = [
      /(?:Az\.?|Aktenzeichen)[\s:]+[A-Z0-9\-\/\.]+/i,
      /\d{1,3}(?:\.\d{3})*,\d{2}\s*(?:€|EUR|Euro)/g,
      /(?:mahnung|rechnung|forderung|zahlungsaufforderung)/gi,
      /im\s+(?:namen|auftrag)\s+(?:von|der|des)\s+[^.]+/gi
    ];

    for (const pattern of patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        keyPhrases.push(match[0].trim());
      }
    }

    result.extracted_text_key_phrases = [...new Set(keyPhrases)]; // Remove duplicates
  }
}

module.exports = GoogleDocumentAI;