import React, { useState, useEffect } from 'react';
import {
  DocumentTextIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  EyeIcon,
  CogIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';
import api from '../config/api';

// Simplified structure for creditor document classification
interface ExtractedData {
  is_creditor_document?: boolean;
  confidence?: number;
  reasoning?: string;
  creditor_data?: {
    sender_name?: string;
    sender_address?: string;
    sender_email?: string;
    reference_number?: string;
    is_representative?: boolean;
    actual_creditor?: string;
    claim_amount?: number;
  };
  document_id?: string;
  original_name?: string;
  processing_status?: string;
  manual_review_required?: boolean;
  timestamp?: string;
  processing_method?: string;
  token_usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  error?: string;
}

interface Document {
  id: string;
  name: string;
  processing_status: 'processing' | 'completed' | 'failed';
  classification_success?: boolean;
  is_creditor_document?: boolean;
  confidence?: number;
  manual_review_required?: boolean;
  extracted_data?: ExtractedData;
  validation?: {
    is_valid: boolean;
    warnings: string[];
    confidence: number;
    claude_confidence?: number;
    data_completeness?: number;
    requires_manual_review?: boolean;
  };
  summary?: string;
  processing_error?: string;
  processing_time_ms?: number;
}

interface DocumentExtractionViewerProps {
  documents: Document[];
  clientId: string;
  onRefresh: () => void;
}

const DocumentExtractionViewer: React.FC<DocumentExtractionViewerProps> = ({
  documents,
  clientId,
  onRefresh
}) => {
  const [selectedDocument, setSelectedDocument] = useState<string | null>(null);
  const [extractionDetails, setExtractionDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Auto-refresh every 5 seconds to check for processing updates
  useEffect(() => {
    const interval = setInterval(() => {
      const hasProcessing = documents.some(doc => doc.processing_status === 'processing');
      if (hasProcessing) {
        onRefresh();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [documents, onRefresh]);

  const getStatusIcon = (status: string, isCreditor?: boolean, confidence?: number) => {
    switch (status) {
      case 'processing':
        return <ArrowPathIcon className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'completed':
        if (isCreditor === true) {
          return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
        } else if (isCreditor === false) {
          return <ExclamationCircleIcon className="w-5 h-5 text-yellow-500" />;
        } else {
          return <ExclamationTriangleIcon className="w-5 h-5 text-orange-500" />;
        }
      case 'failed':
        return <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />;
      default:
        return <DocumentTextIcon className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusText = (status: string, isCreditor?: boolean, confidence?: number) => {
    switch (status) {
      case 'processing':
        return 'Wird klassifiziert...';
      case 'completed':
        if (isCreditor === true) {
          return `Gläubigerdokument erkannt (${Math.round((confidence || 0) * 100)}% Sicherheit)`;
        } else if (isCreditor === false) {
          return `Kein Gläubigerdokument (${Math.round((confidence || 0) * 100)}% Sicherheit)`;
        } else {
          return 'Klassifizierung unbestimmt';
        }
      case 'failed':
        return 'Klassifizierung fehlgeschlagen';
      default:
        return 'Unbekannter Status';
    }
  };

  const getConfidenceColor = (confidence: number, isCreditor?: boolean) => {
    if (confidence >= 0.9) return 'text-green-600';
    if (confidence >= 0.8) return 'text-yellow-600';
    return 'text-red-600';
  };

  const viewExtractionDetails = (documentId: string) => {
    const doc = documents.find(d => d.id === documentId);
    if (doc && doc.extracted_data) {
      setExtractionDetails({ extracted_data: doc.extracted_data });
      setSelectedDocument(documentId);
    } else {
      console.warn('No extraction details found for document', documentId);
      // Fallback: if we really needed to fetch, we would need an endpoint. 
      // But for now, we assume data is in the list.
    }
  };

  const reprocessDocument = async (documentId: string) => {
    setLoading(true);
    try {
      // FIXED: Use correct admin route
      await api.post(`/admin/clients/${clientId}/documents/${documentId}/reprocess`);
      onRefresh();
      // Allow some time for background processing to start
      setTimeout(onRefresh, 1000);
    } catch (error) {
      console.error('Error reprocessing document:', error);
    } finally {
      setLoading(false);
    }
  };

  if (documents.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Gläubigerdokument-Klassifizierung</h3>
        <div className="text-center py-8">
          <DocumentTextIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Noch keine Dokumente zur Klassifizierung vorhanden.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Gläubigerdokument-Klassifizierung</h3>

      <div className="space-y-4">
        {documents.map((document) => (
          <div key={document.id} className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  {getStatusIcon(document.processing_status, document.is_creditor_document, document.confidence)}
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {document.name}
                  </span>
                  {document.manual_review_required && (
                    <span className="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full">
                      Manuelle Prüfung
                    </span>
                  )}
                </div>

                <p className="text-xs text-gray-500 mb-2">
                  {getStatusText(document.processing_status, document.is_creditor_document, document.confidence)}
                </p>

                {document.processing_status === 'completed' && document.summary && (
                  <div className="mb-2">
                    <p className="text-sm text-gray-700">{document.summary}</p>
                    {document.confidence !== undefined && (
                      <div className="flex items-center space-x-4 mt-1">
                        <div className="flex items-center space-x-1">
                          <span className="text-xs text-gray-500">Claude:</span>
                          <span className={`text-xs font-medium ${getConfidenceColor(document.confidence, document.is_creditor_document)}`}>
                            {Math.round(document.confidence * 100)}%
                          </span>
                        </div>
                        {document.validation?.data_completeness !== undefined && (
                          <div className="flex items-center space-x-1">
                            <span className="text-xs text-gray-500">Daten:</span>
                            <span className={`text-xs font-medium ${getConfidenceColor(document.validation.data_completeness, document.is_creditor_document)}`}>
                              {Math.round(document.validation.data_completeness * 100)}%
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Show creditor data preview if available */}
                {document.is_creditor_document && document.extracted_data?.creditor_data && (
                  <div className="mt-2 bg-green-50 p-2 rounded text-xs">
                    <p><strong>Absender:</strong> {document.extracted_data.creditor_data.sender_name || 'Nicht gefunden'}</p>
                    {document.extracted_data.creditor_data.claim_amount && (
                      <p><strong>Forderung:</strong> {document.extracted_data.creditor_data.claim_amount}€</p>
                    )}
                  </div>
                )}

                {document.processing_status === 'failed' && document.processing_error && (
                  <p className="text-xs text-red-600 mb-2">
                    Fehler: {document.processing_error}
                  </p>
                )}

                {document.validation?.warnings && document.validation.warnings.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 mb-1">Status:</p>
                    <ul className="text-xs space-y-1">
                      {document.validation.warnings.map((warning, index) => {
                        const isSuccess = warning.includes('✅') || warning.includes('erfolgreich');
                        const isInfo = warning.includes('klassifiziert');
                        return (
                          <li key={index} className={
                            isSuccess ? 'text-green-600' :
                              isInfo ? 'text-red-800' :
                                'text-orange-600'
                          }>
                            • {warning}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-2 ml-4">
                {document.processing_status === 'completed' && (
                  <button
                    onClick={() => viewExtractionDetails(document.id)}
                    className="p-1 text-gray-400 hover:text-red-800 transition-colors"
                    title="Details anzeigen"
                    disabled={loading}
                  >
                    <EyeIcon className="w-4 h-4" />
                  </button>
                )}

                {(document.processing_status === 'failed' || document.processing_status === 'completed') && (
                  <button
                    onClick={() => reprocessDocument(document.id)}
                    className="p-1 text-gray-400 hover:text-green-600 transition-colors"
                    title="Erneut klassifizieren"
                    disabled={loading}
                  >
                    <CogIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Simplified Extraction Details Modal */}
      {selectedDocument && extractionDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-semibold">Klassifizierung & Datenextraktion</h4>
                <button
                  onClick={() => setSelectedDocument(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              {extractionDetails.extracted_data && (
                <div className="space-y-4">
                  {/* Classification Results */}
                  <div>
                    <h5 className="font-medium text-gray-900 mb-2">Klassifizierung</h5>
                    <div className="bg-gray-50 p-3 rounded text-sm">
                      <p><strong>Gläubigerdokument:</strong> {extractionDetails.extracted_data.is_creditor_document ? 'Ja' : 'Nein'}</p>
                      <p><strong>Vertrauen:</strong> {Math.round((extractionDetails.extracted_data.confidence || 0) * 100)}%</p>
                      <p><strong>Begründung:</strong> {extractionDetails.extracted_data.reasoning || 'Keine Begründung'}</p>
                      <p><strong>Manuelle Prüfung:</strong> {extractionDetails.extracted_data.manual_review_required ? 'Ja' : 'Nein'}</p>
                    </div>
                  </div>

                  {/* Claude AI Processing Info */}
                  <div className="bg-blue-50 p-3 rounded text-sm">
                    <p className="font-medium text-blue-900 mb-1">🤖 Verarbeitet mit Claude AI</p>
                    <div className="text-blue-700 text-xs space-y-1">
                      <p>Methode: {extractionDetails.extracted_data.processing_method}</p>
                      {extractionDetails.extracted_data.token_usage && (
                        <p>Tokens: {extractionDetails.extracted_data.token_usage.input_tokens}→{extractionDetails.extracted_data.token_usage.output_tokens}</p>
                      )}
                      <p>Verarbeitet: {new Date(extractionDetails.extracted_data.timestamp).toLocaleString('de-DE')}</p>
                    </div>
                  </div>

                  {/* Creditor Data - Only show if creditor document */}
                  {extractionDetails.extracted_data.is_creditor_document && extractionDetails.extracted_data.creditor_data && (
                    <>
                      {/* Sender Information */}
                      <div>
                        <h5 className="font-medium text-gray-900 mb-2">Absender/Gläubiger</h5>
                        <div className="bg-gray-50 p-3 rounded text-sm">
                          <p><strong>Name:</strong> {extractionDetails.extracted_data.creditor_data.sender_name || 'Nicht gefunden'}</p>
                          <p><strong>Adresse:</strong> {extractionDetails.extracted_data.creditor_data.sender_address || 'Nicht gefunden'}</p>
                          <p><strong>E-Mail:</strong> {extractionDetails.extracted_data.creditor_data.sender_email || 'Nicht gefunden'}</p>
                        </div>
                      </div>

                      {/* Reference Number */}
                      <div>
                        <h5 className="font-medium text-gray-900 mb-2">Aktenzeichen</h5>
                        <div className="bg-gray-50 p-3 rounded text-sm">
                          {extractionDetails.extracted_data.creditor_data.reference_number || 'Nicht gefunden'}
                        </div>
                      </div>

                      {/* Representative Information */}
                      <div>
                        <h5 className="font-medium text-gray-900 mb-2">Vertretung</h5>
                        <div className="bg-gray-50 p-3 rounded text-sm">
                          <p><strong>Ist Vertreter:</strong> {extractionDetails.extracted_data.creditor_data.is_representative ? 'Ja' : 'Nein'}</p>
                          {extractionDetails.extracted_data.creditor_data.actual_creditor && (
                            <p><strong>Eigentlicher Gläubiger:</strong> {extractionDetails.extracted_data.creditor_data.actual_creditor}</p>
                          )}
                        </div>
                      </div>

                      {/* Claim Amount */}
                      {extractionDetails.extracted_data.creditor_data.claim_amount && (
                        <div>
                          <h5 className="font-medium text-gray-900 mb-2">Forderungsbetrag</h5>
                          <div className="bg-gray-50 p-3 rounded text-sm">
                            {extractionDetails.extracted_data.creditor_data.claim_amount}€
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Non-Creditor Information */}
                  {!extractionDetails.extracted_data.is_creditor_document && (
                    <div className="bg-yellow-50 p-3 rounded text-sm">
                      <p className="font-medium text-yellow-900 mb-1">📄 Nicht-Gläubigerdokument</p>
                      <p className="text-yellow-800">Dieses Dokument ist nicht für "Anschreiben an die Gläubiger" relevant.</p>
                      <p className="text-yellow-700 text-xs mt-1">Begründung: {extractionDetails.extracted_data.reasoning}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentExtractionViewer;