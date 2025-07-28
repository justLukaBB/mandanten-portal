const fs = require('fs-extra');
const path = require('path');
const { GoogleAuth } = require('google-auth-library');
const ClaudeAI = require('./claudeAI');

class GoogleDocumentAI_REST {
  constructor() {
    try {
      // Initialize Google Auth for getting access tokens
      const credentialsPath = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
      console.log('Setting up REST API with credentials:', credentialsPath);
      
      // Verify credentials file exists
      if (!fs.existsSync(credentialsPath)) {
        throw new Error(`Service account key file not found: ${credentialsPath}`);
      }
      
      this.auth = new GoogleAuth({
        keyFile: credentialsPath,
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      });
      
      this.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
      this.location = process.env.GOOGLE_CLOUD_LOCATION;
      this.processorId = process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID;
      
      // REST API endpoint from your Google Cloud Console
      this.endpoint = `https://${this.location}-documentai.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/processors/${this.processorId}:process`;
      
      // Initialize Claude AI for text analysis
      this.claudeAI = new ClaudeAI();
      
      console.log('Google Document AI REST Client initialized successfully');
      console.log('Project ID:', this.projectId);
      console.log('Location:', this.location);
      console.log('Processor ID:', this.processorId);
      console.log('REST Endpoint:', this.endpoint);
      
    } catch (error) {
      console.error('Failed to initialize Google Document AI REST client:', error);
      throw error;
    }
  }

  /**
   * Process document using Google Document AI REST API
   */
  async processDocument(filePath, originalName) {
    try {
      console.log(`=== GOOGLE DOCUMENT AI REST PROCESSING START ===`);
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

      // Encode content as base64 (required by REST API)
      const base64Content = fileBuffer.toString('base64');
      console.log('Base64 encoded content length:', base64Content.length);
      
      // Get access token
      console.log('=== GETTING ACCESS TOKEN ===');
      const authClient = await this.auth.getClient();
      const accessToken = await authClient.getAccessToken();
      console.log('Access token obtained successfully');
      
      // Create request body exactly as per Google REST API documentation
      const requestBody = {
        rawDocument: {
          content: base64Content,
          mimeType: mimeType,
        }
      };
      
      console.log('Request body structure:', {
        rawDocument: {
          mimeType: requestBody.rawDocument.mimeType,
          contentLength: requestBody.rawDocument.content.length
        }
      });

      // Send the REST API request
      console.log('=== SENDING REST API REQUEST ===');
      console.log('Endpoint:', this.endpoint);
      
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json',
          'x-goog-user-project': this.projectId
        },
        body: JSON.stringify(requestBody)
      });
      
      console.log('Response status:', response.status);
      console.log('Response statusText:', response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('REST API Error Response:', errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
      }
      
      // Parse response
      const result = await response.json();
      console.log('=== REST API REQUEST SUCCESSFUL ===');
      
      console.log('=== DOCUMENT AI REST RESPONSE ===');
      console.log('Response keys:', Object.keys(result));
      console.log('Document keys:', result.document ? Object.keys(result.document) : 'No document');
      
      // Extract text from the response
      const extractedText = result.document?.text;
      console.log('Extracted text length:', extractedText?.length || 0);
      console.log('First 500 chars of extracted text:', extractedText?.substring(0, 500));
      
      if (!extractedText || extractedText.trim().length === 0) {
        console.error('ERROR: No text was extracted from the document');
        throw new Error('No text was extracted from the document');
      }
      
      // Analyze the extracted text with simplified Claude AI
      console.log('Starting simplified Claude AI classification...');
      const structuredData = await this.claudeAI.processDocument(
        extractedText, 
        `doc_${Date.now()}`, 
        originalName
      );
      
      // Validate the extraction results
      const validation = this.claudeAI.validateExtraction(structuredData);
      structuredData.validation = validation;
      
      // Generate human-readable summary
      const summary = this.claudeAI.generateSummary(structuredData);
      structuredData.summary = summary;
      
      console.log('=== FINAL STRUCTURED DATA ===');
      console.log('Summary:', summary);
      console.log('Overall confidence:', structuredData.extraction_quality?.overall_confidence);
      console.log('Manual review required:', structuredData.extraction_quality?.manual_review_required);
      
      return structuredData;
      
    } catch (error) {
      console.error('Google Document AI REST processing error:', error);
      throw new Error(`Google Document AI REST failed: ${error.message}`);
    }
  }

  // Note: Text parsing functions have been replaced by Claude AI analysis
  // The old parsing methods have been removed in favor of more sophisticated
  // LLM-based extraction that better handles German legal documents
}

module.exports = GoogleDocumentAI_REST;