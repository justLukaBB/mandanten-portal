const Anthropic = require('@anthropic-ai/sdk');

class ClaudeAI {
  constructor() {
    try {
      // Initialize Claude API client
      this.client = new Anthropic({
        apiKey: process.env.CLAUDE_API_KEY,
      });
      
      console.log('Claude AI Client initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize Claude AI client:', error);
      throw error;
    }
  }

  /**
   * Simplified creditor document classification and data extraction
   * Single prompt strategy for efficiency
   */
  async processDocument(extractedText, documentId, originalName) {
    try {
      console.log(`=== SIMPLIFIED CREDITOR DOCUMENT PROCESSING START ===`);
      console.log(`Document ID: ${documentId}`);
      console.log(`Original name: ${originalName}`);
      console.log(`Text length: ${extractedText.length} characters`);
      
      const professionalPrompt = `Sie sind ein spezialisierter KI-Assistent für deutsche Insolvenzanwaltskanzleien. Ihre Aufgabe ist die präzise Analyse von Dokumenten zur Identifikation von Gläubigerdokumenten und Extraktion relevanter Daten für das "Anschreiben an die Gläubiger".

DEFINITION GLÄUBIGERDOKUMENT:
Ein Dokument ist ein Gläubigerdokument wenn ALLE drei Kriterien erfüllt sind:
1. ADRESSAT: Das Dokument ist an den Mandanten adressiert (NICHT an die Anwaltskanzlei)
2. FORDERUNG: Es wird eine konkrete Geldforderung vom Mandanten verlangt
3. ABSENDER: Von einem Gläubiger oder dessen Vertreter (Inkasso, Anwalt, Bank, etc.)

GLÄUBIGERDOKUMENT-TYPEN:
✓ Mahnungen (1., 2., 3. Mahnung)
✓ Inkassoschreiben
✓ Anwaltliche Zahlungsaufforderungen
✓ Bankforderungen
✓ Vollstreckungsbescheide (vor anwaltlicher Vertretung)

KEINE GLÄUBIGERDOKUMENTE:
✗ An die Anwaltskanzlei adressierte Dokumente
✗ Gerichtspost/Behördenschreiben
✗ Rechnungen für erhaltene Leistungen (Handwerker, Dienstleister)
✗ Verträge, Kündigungen ohne direkte Zahlungsaufforderung
✗ Informationsschreiben ohne Geldforderung

DOKUMENT-TEXT:
${extractedText.substring(0, 4000)}

ANALYSEAUFTRAG:

1. KLASSIFIKATION:
   Prüfen Sie, ob dieses Dokument ein Gläubigerdokument gemäß Definition ist.

2. DATENEXTRAKTION (nur bei Gläubigerdokumenten):
   
   a) ABSENDER-INFORMATION:
      - Vollständiger Name des Absenders (aus Briefkopf)
      - Komplette Anschrift
      - E-Mail-Adresse (falls vorhanden)
      - Telefonnummer (falls vorhanden)
   
   b) AKTENZEICHEN/REFERENZ:
      Suchen Sie nach: "Aktenzeichen:", "Az:", "Unser Zeichen:", "Ref:", "Zeichen:", "Kundennummer:"
   
   c) GLÄUBIGER-VERTRETUNGS-VERHÄLTNIS:
      - Handelt der Absender für sich selbst oder vertritt er einen anderen Gläubiger?
      - Erkennungsmerkmale: "Im Namen und Auftrag von...", "für unseren Mandanten...", "Inkassobüro für..."
      - Falls Vertreter: Wer ist der ursprüngliche Gläubiger?
   
   d) FORDERUNGSDETAILS:
      - Geforderte Summe (falls angegeben)
      - Währung
      - Art der Forderung (falls erkennbar)

DEUTSCHE RECHTSTERMINOLOGIE beachten:
- "Gläubiger", "Schuldner", "Forderung", "Mahnung"
- "Inkassobüro", "Rechtsanwaltskanzlei", "Forderungsmanagement"
- "Vollstreckung", "Zwangsvollstreckung", "Mahnbescheid"

PROFESSIONELLE CONFIDENCE-BEWERTUNG:
Bewerte deine Sicherheit basierend auf mehreren Faktoren und bestimme dynamisch:

BEWERTUNGSFAKTOREN (jeweils 0.0-1.0):
1. **Klassifikations-Sicherheit** - Wie eindeutig sind die Gläubiger-Kriterien erfüllt?
2. **Text-Qualität** - Ist der Text klar lesbar oder verzerrt/unvollständig?
3. **Daten-Vollständigkeit** - Sind alle wichtigen Informationen extrahierbar?
4. **Kontext-Eindeutigkeit** - Ist die Dokumentstruktur typisch für den Dokumenttyp?

DYNAMISCHE CONFIDENCE-KALKULATION:
- Berechne Gesamtsicherheit als gewichteten Durchschnitt
- Klassifikation (40%) + Textqualität (25%) + Datenvollständigkeit (25%) + Kontext (10%)
- Finale confidence sollte realistisch deine tatsächliche Unsicherheit widerspiegeln

WORKFLOW-STATUS basierend auf DEINER berechneten Confidence:
1. "GLÄUBIGERDOKUMENT" - Wenn du dir sehr sicher bist (≥ 0.85) UND alle Daten vollständig
2. "KEIN_GLÄUBIGERDOKUMENT" - Wenn du dir sehr sicher bist (≥ 0.85) dass es KEIN Gläubigerdokument ist
3. "MITARBEITER_PRÜFUNG" - Bei jeder Unsicherheit (< 0.85) ODER wenn wichtige Daten fehlen

AUSGABE als strukturiertes JSON:

{
  "is_creditor_document": boolean,
  "confidence": float (0.0-1.0),
  "confidence_breakdown": {
    "classification_certainty": float (0.0-1.0),
    "text_quality": float (0.0-1.0),
    "data_completeness": float (0.0-1.0),
    "context_clarity": float (0.0-1.0)
  },
  "workflow_status": "GLÄUBIGERDOKUMENT" | "KEIN_GLÄUBIGERDOKUMENT" | "MITARBEITER_PRÜFUNG",
  "status_reason": "Begründung für den gewählten Status basierend auf Confidence-Faktoren",
  "reasoning": "Detaillierte Begründung der Klassifikationsentscheidung",
  
  "creditor_data": {
    "sender_name": "Vollständiger Name des Absenders",
    "sender_address": "Komplette Anschrift", 
    "sender_email": "email@domain.de",
    "reference_number": "Aktenzeichen/Referenz",
    "is_representative": boolean,
    "actual_creditor": "Ursprünglicher Gläubiger falls Vertreter",
    "claim_amount": float
  }
}

WICHTIG: 
- Antworte NUR mit dem JSON-Objekt
- Sei ehrlich und realistisch bei der Confidence-Bewertung - lieber vorsichtig als überoptimistisch
- Alle 4 Confidence-Faktoren einzeln bewerten, dann gewichteten Durchschnitt als finale confidence
- creditor_data nur ausgeben wenn is_creditor_document = true
- workflow_status basierend auf DEINER berechneten confidence (≥0.85 = sicher, <0.85 = Mitarbeiterprüfung)
- confidence_breakdown IMMER vollständig ausfüllen für Transparenz
- status_reason soll die Confidence-Faktoren erklären
- Bei schlechter Textqualität oder fehlenden Daten: niedrigere Scores
- Fokus auf Briefkopf und ersten Absatz für Absenderinformationen`;

      console.log('=== SENDING REQUEST TO CLAUDE API ===');
      
      const response = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        temperature: 0.2, // Optimized for both classification and data extraction
        messages: [
          {
            role: 'user',
            content: professionalPrompt
          }
        ]
      });
      
      console.log('=== CLAUDE API RESPONSE RECEIVED ===');
      
      // Extract and parse the JSON response
      const responseText = response.content[0].text;
      console.log('Response text length:', responseText.length);
      
      // Parse JSON response
      let result;
      try {
        // Extract JSON from response and clean it
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        let jsonText = jsonMatch ? jsonMatch[0] : responseText;
        
        // Clean the JSON text from control characters and fix formatting
        jsonText = jsonText
          .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
          .replace(/\n\s*/g, ' ') // Replace newlines with spaces
          .replace(/\s+/g, ' ') // Replace multiple spaces with single space
          .trim();
        
        console.log('Cleaned JSON length:', jsonText.length);
        console.log('First 200 chars:', jsonText.substring(0, 200));
        
        result = JSON.parse(jsonText);
        console.log('✅ Successfully parsed cleaned JSON');
      } catch (parseError) {
        console.error('Failed to parse Claude response as JSON:', parseError);
        console.error('Raw response length:', responseText.length);
        console.error('Raw response preview:', responseText.substring(0, 600));
        
        // Create fallback result
        result = {
          is_creditor_document: false,
          confidence: 0.0,
          reasoning: `JSON parsing failed: ${parseError.message}. Raw response available for manual review.`,
          workflow_status: 'PARSING_ERROR',
          status_reason: 'Claude AI response could not be parsed - manual review required',
          manual_review_required: true,
          error: parseError.message,
          raw_response: responseText.substring(0, 1000)
        };
        console.log('📝 Created fallback result due to parsing error');
      }
      
      // Add processing metadata
      const CONFIDENCE_THRESHOLD = 0.80;
      
      result.document_id = documentId;
      result.original_name = originalName;
      result.processing_status = 'completed';
      result.manual_review_required = result.confidence < CONFIDENCE_THRESHOLD;
      result.timestamp = new Date().toISOString();
      result.processing_method = 'claude_simplified_creditor_classification';
      
      // Add token usage info
      result.token_usage = {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens
      };
      
      console.log('=== PROCESSING RESULTS ===');
      console.log(`Is creditor document: ${result.is_creditor_document}`);
      console.log(`Workflow Status: ${result.workflow_status}`);
      console.log(`Status Reason: ${result.status_reason}`);
      console.log(`Overall Confidence: ${Math.round(result.confidence * 100)}%`);
      
      if (result.confidence_breakdown) {
        console.log('=== CONFIDENCE BREAKDOWN ===');
        console.log(`Classification Certainty: ${Math.round(result.confidence_breakdown.classification_certainty * 100)}%`);
        console.log(`Text Quality: ${Math.round(result.confidence_breakdown.text_quality * 100)}%`);
        console.log(`Data Completeness: ${Math.round(result.confidence_breakdown.data_completeness * 100)}%`);
        console.log(`Context Clarity: ${Math.round(result.confidence_breakdown.context_clarity * 100)}%`);
      }
      
      console.log(`Manual review required: ${result.manual_review_required}`);
      console.log(`Reasoning: ${result.reasoning}`);
      
      if (result.is_creditor_document && result.creditor_data) {
        console.log('=== EXTRACTED CREDITOR DATA ===');
        console.log(`Sender: ${result.creditor_data.sender_name || 'Not found'}`);
        console.log(`Email: ${result.creditor_data.sender_email || 'Not found'}`);
        console.log(`Reference: ${result.creditor_data.reference_number || 'Not found'}`);
        console.log(`Is representative: ${result.creditor_data.is_representative}`);
        console.log(`Amount: ${result.creditor_data.claim_amount || 'Not found'}`);
      }
      
      console.log('=== SIMPLIFIED PROCESSING COMPLETE ===');
      
      return result;
      
    } catch (error) {
      console.error('Simplified creditor document processing error:', error);
      
      // Return error structure compatible with the simplified flow
      return {
        document_id: documentId,
        original_name: originalName,
        is_creditor_document: false,
        confidence: 0.0,
        reasoning: `Processing error: ${error.message}`,
        processing_status: 'failed',
        manual_review_required: true,
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  /**
   * Enhanced validation for extracted data - preserves Claude's confidence, adds data quality assessment
   */
  validateExtraction(result) {
    const validation = {
      is_valid: result.processing_status === 'completed',
      warnings: [],
      confidence: result.confidence || 0.0, // Keep Claude's original confidence
      claude_confidence: result.confidence || 0.0, // Store original Claude confidence
      data_completeness: 0.0,
      requires_manual_review: result.manual_review_required || false
    };

    // For creditor documents, assess data completeness separately
    if (result.is_creditor_document && result.creditor_data) {
      // Count essential fields that were found
      let essentialFieldsFound = 0;
      let totalEssentialFields = 3; // sender_name, reference_number, sender_email
      let optionalFieldsFound = 0;
      let totalOptionalFields = 2; // sender_address, claim_amount
      let foundFields = [];
      let missingFields = [];

      // Check essential fields with better validation
      const senderName = result.creditor_data.sender_name;
      if (senderName && senderName.trim() !== '' && senderName !== 'Nicht gefunden' && senderName !== 'Not found') {
        essentialFieldsFound++;
        foundFields.push('Absendername');
      } else {
        missingFields.push('Absendername');
      }

      const referenceNumber = result.creditor_data.reference_number;
      if (referenceNumber && referenceNumber.trim() !== '' && referenceNumber !== 'Nicht gefunden' && referenceNumber !== 'Not found') {
        essentialFieldsFound++;
        foundFields.push('Aktenzeichen');
      } else {
        missingFields.push('Aktenzeichen');
      }

      const senderEmail = result.creditor_data.sender_email;
      if (senderEmail && senderEmail.trim() !== '' && senderEmail !== 'Nicht gefunden' && senderEmail !== 'Not found' && senderEmail.includes('@')) {
        essentialFieldsFound++;
        foundFields.push('E-Mail-Adresse');
      } else {
        missingFields.push('E-Mail-Adresse');
      }

      // Check optional fields
      const senderAddress = result.creditor_data.sender_address;
      if (senderAddress && senderAddress.trim() !== '' && senderAddress !== 'Nicht gefunden' && senderAddress !== 'Not found') {
        optionalFieldsFound++;
        foundFields.push('Adresse');
      } else {
        missingFields.push('Adresse');
      }

      const claimAmount = result.creditor_data.claim_amount;
      if (claimAmount && claimAmount > 0) {
        optionalFieldsFound++;
        foundFields.push('Forderungsbetrag');
      }

      // Calculate data completeness (essential fields weighted higher)
      const essentialScore = (essentialFieldsFound / totalEssentialFields) * 0.8;
      const optionalScore = (optionalFieldsFound / totalOptionalFields) * 0.2;
      validation.data_completeness = essentialScore + optionalScore;
      
      // Determine if manual review is needed based on Claude confidence AND data completeness
      const lowClaudeConfidence = validation.claude_confidence < 0.8;
      const lowDataCompleteness = essentialFieldsFound < 2;
      const noEssentialData = essentialFieldsFound === 0;
      
      if (lowClaudeConfidence || lowDataCompleteness || noEssentialData) {
        validation.requires_manual_review = true;
        
        if (lowClaudeConfidence) {
          validation.warnings.push('⚠️ Claude AI ist unsicher bei der Klassifikation');
        }
        if (lowDataCompleteness) {
          validation.warnings.push('⚠️ Wichtige Kontaktdaten fehlen');
        }
        if (noEssentialData) {
          validation.warnings.push('❌ Keine essentiellen Daten extrahiert');
        }
      }

      // Add success message if all essential fields found AND high Claude confidence
      if (essentialFieldsFound === totalEssentialFields && validation.claude_confidence >= 0.8) {
        validation.warnings.push('✅ Alle wichtigen Daten erfolgreich extrahiert');
        validation.warnings.push(`📋 Gefunden: ${foundFields.join(', ')}`);
      } else if (essentialFieldsFound > 0) {
        // Partial success - show what was found and what's missing
        if (foundFields.length > 0) {
          validation.warnings.push(`✅ Gefunden: ${foundFields.join(', ')}`);
        }
        if (missingFields.length > 0) {
          validation.warnings.push(`❌ Fehlt: ${missingFields.join(', ')}`);
        }
      } else {
        validation.warnings.push('❌ Keine Daten konnten extrahiert werden');
      }

      console.log(`=== VALIDATION RESULTS ===`);
      console.log(`Claude Confidence: ${Math.round(validation.claude_confidence * 100)}%`);
      console.log(`Data Completeness: ${Math.round(validation.data_completeness * 100)}%`);
      console.log(`Essential Fields: ${essentialFieldsFound}/${totalEssentialFields}`);
      console.log(`Manual Review Required: ${validation.requires_manual_review}`);
    }

    // For non-creditor documents, just confirm classification
    if (!result.is_creditor_document) {
      validation.warnings = ['Dokument als Nicht-Gläubigerdokument klassifiziert'];
      validation.data_completeness = 1.0; // Classification is complete for non-creditor docs
      
      // Only require manual review if Claude confidence is very low
      if (validation.claude_confidence < 0.7) {
        validation.requires_manual_review = true;
        validation.warnings.push('Niedrige Klassifikationssicherheit - manuelle Prüfung empfohlen');
      } else {
        validation.requires_manual_review = false;
      }
    }

    return validation;
  }

  /**
   * Generate simple summary for extracted data
   */
  generateSummary(result) {
    if (!result.is_creditor_document) {
      return `Nicht-Gläubigerdokument (${Math.round(result.confidence * 100)}% Sicherheit) - ${result.reasoning}`;
    }

    if (!result.creditor_data) {
      return `Gläubigerdokument erkannt (${Math.round(result.confidence * 100)}% Sicherheit) - Keine Daten extrahiert`;
    }

    const sender = result.creditor_data.sender_name || 'Unbekannter Absender';
    const amount = result.creditor_data.claim_amount ? `${result.creditor_data.claim_amount}€` : 'Betrag unbekannt';
    
    let summary = `Gläubigerdokument von ${sender}`;
    
    if (result.creditor_data.is_representative && result.creditor_data.actual_creditor) {
      summary += ` (für ${result.creditor_data.actual_creditor})`;
    }
    
    summary += ` - Forderung: ${amount}`;
    
    if (result.creditor_data.reference_number) {
      summary += ` (Az: ${result.creditor_data.reference_number})`;
    }
    
    summary += ` (${Math.round(result.confidence * 100)}% Sicherheit)`;
    
    return summary;
  }
}

module.exports = ClaudeAI;