import React, { useState, useEffect } from 'react';
import { 
  DocumentTextIcon,
  EyeIcon,
  ArrowDownTrayIcon,
  PencilIcon,
  CheckCircleIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  FolderIcon,
  ClockIcon,
  UserIcon,
  BuildingOfficeIcon
} from '@heroicons/react/24/outline';
import api from '../../config/api';

interface CreditorData {
  sender_name?: string;
  sender_address?: string;
  sender_email?: string;
  reference_number?: string;
  is_representative?: boolean;
  actual_creditor?: string;
  claim_amount?: number;
}

interface Document {
  id: string;
  name: string;
  filename: string;
  type: string;
  size: number;
  uploadedAt: string;
  processing_status: 'processing' | 'completed' | 'failed';
  is_creditor_document?: boolean;
  confidence?: number;
  manual_review_required?: boolean;
  document_status?: 'creditor_confirmed' | 'non_creditor_confirmed' | 'needs_review' | 'duplicate' | 'processing_failed' | 'unknown';
  status_reason?: string;
  is_duplicate?: boolean;
  duplicate_reason?: string;
  url?: string;
  hidden_from_portal?: boolean;
  source_document_id?: string;
  creditor_index?: number;
  creditor_count?: number;
  extracted_data?: {
    creditor_data?: CreditorData;
    confidence?: number;
    reasoning?: string;
    workflow_status?: 'GLÄUBIGERDOKUMENT' | 'KEIN_GLÄUBIGERDOKUMENT' | 'MITARBEITER_PRÜFUNG';
    status_reason?: string;
  };
  validation?: {
    is_valid: boolean;
    warnings: string[];
    confidence: number;
  };
  summary?: string;
  processed_at?: string;
  processing_time_ms?: number;
}

interface AdminDocumentViewerProps {
  clientId?: string;
}

const AdminDocumentViewer: React.FC<AdminDocumentViewerProps> = ({ 
  clientId 
}) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [filter, setFilter] = useState<'all' | 'needs_review' | 'creditor' | 'non_creditor' | 'duplicates'>('all');

  useEffect(() => {
    fetchDocuments();
  }, [clientId]);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/clients/${clientId}/documents`);
      setDocuments(response.data || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = (doc: Document) => {
    try {
      // Construct the direct download URL
      const downloadUrl = `http://localhost:3001/api/clients/${clientId}/documents/${doc.filename}`;
      
      // Open in new tab as fallback, or direct download
      const link = window.document.createElement('a');
      link.href = downloadUrl;
      link.download = doc.name;
      link.target = '_blank'; // Fallback: open in new tab if download fails
      link.style.display = 'none';
      
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
      
    } catch (error) {
      console.error('Download error:', error);
      // Fallback: open directly in browser
      window.open(`http://localhost:3001/api/clients/${clientId}/documents/${doc.filename}`, '_blank');
    }
  };

  const handleViewDetails = (document: Document) => {
    setSelectedDocument(document);
    setShowDetails(true);
  };

  const handleManualReview = async (document: Document, newStatus: 'creditor_confirmed' | 'non_creditor_confirmed', adminNote?: string) => {
    try {
      setUpdating(true);
      
      // Update document status via API
      await api.patch(`/admin/clients/${clientId}/documents/${document.id}/review`, {
        document_status: newStatus,
        admin_note: adminNote || `Manuell geprüft: ${newStatus === 'creditor_confirmed' ? 'Als Gläubigerdokument bestätigt' : 'Als Nicht-Gläubigerdokument bestätigt'}`,
        reviewed_by: 'Admin',
        reviewed_at: new Date().toISOString()
      });

      // Refresh documents list
      await fetchDocuments();
      
      // Close details if this document was open
      if (selectedDocument?.id === document.id) {
        setShowDetails(false);
        setSelectedDocument(null);
      }

      alert(`Dokument erfolgreich als ${newStatus === 'creditor_confirmed' ? 'Gläubigerdokument' : 'Nicht-Gläubigerdokument'} markiert`);
    } catch (error) {
      console.error('Error updating document status:', error);
      alert('Fehler beim Aktualisieren des Dokument-Status');
    } finally {
      setUpdating(false);
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'creditor_confirmed': return 'bg-green-100 text-green-800';
      case 'non_creditor_confirmed': return 'bg-gray-100 text-gray-800';
      case 'needs_review': return 'bg-yellow-100 text-yellow-800';
      case 'duplicate_detected': return 'bg-orange-100 text-orange-800';
      case 'processing_failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getStatusText = (status?: string) => {
    switch (status) {
      case 'creditor_confirmed': return 'Gläubiger bestätigt';
      case 'non_creditor_confirmed': return 'Kein Gläubiger';
      case 'needs_review': return 'Prüfung erforderlich';
      case 'duplicate_detected': return 'Duplikat erkannt';
      case 'processing_failed': return 'Verarbeitung fehlgeschlagen';
      default: return 'Unbekannt';
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'creditor_confirmed': 
        return <CheckCircleIcon className="w-5 h-5 text-green-600" />;
      case 'non_creditor_confirmed': 
        return <XMarkIcon className="w-5 h-5 text-gray-600" />;
      case 'needs_review': 
        return <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600" />;
      case 'duplicate_detected': 
        return <FolderIcon className="w-5 h-5 text-orange-600" />;
      case 'processing_failed': 
        return <XMarkIcon className="w-5 h-5 text-red-600" />;
      default: 
        return <ClockIcon className="w-5 h-5 text-gray-400" />;
    }
  };

  const filteredDocuments = documents.filter(doc => {
    // Hide source documents that were split into multiple creditors
    if (doc.hidden_from_portal) {
      return false;
    }

    switch (filter) {
      case 'needs_review':
        return doc.document_status === 'needs_review';
      case 'creditor':
        return doc.document_status === 'creditor_confirmed';
      case 'non_creditor':
        return doc.document_status === 'non_creditor_confirmed';
      case 'duplicates':
        return doc.document_status === 'duplicate';
      default:
        return true;
    }
  });

  // Filter out hidden documents for all counts
  const visibleDocuments = documents.filter(doc => !doc.hidden_from_portal);
  const needsReviewCount = visibleDocuments.filter(doc => doc.document_status === 'needs_review').length;

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <DocumentTextIcon className="w-6 h-6 text-red-800" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Dokument-Manager
              </h3>
              <p className="text-sm text-gray-500">
                {visibleDocuments.length} Dokumente • {needsReviewCount} benötigen Prüfung
              </p>
            </div>
          </div>
          
          {/* Filter buttons */}
          <div className="flex space-x-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filter === 'all' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Alle ({visibleDocuments.length})
            </button>
            <button
              onClick={() => setFilter('needs_review')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filter === 'needs_review' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Prüfung ({needsReviewCount})
            </button>
            <button
              onClick={() => setFilter('creditor')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filter === 'creditor' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Gläubiger ({visibleDocuments.filter(d => d.document_status === 'creditor_confirmed').length})
            </button>
            <button
              onClick={() => setFilter('duplicates')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filter === 'duplicates' ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Duplikate ({visibleDocuments.filter(d => d.document_status === 'duplicate').length})
            </button>
          </div>
        </div>
      </div>

      {/* Document list */}
      <div className="divide-y divide-gray-200">
        {filteredDocuments.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            Keine Dokumente für diesen Filter gefunden.
          </div>
        ) : (
          filteredDocuments.map((document) => (
            <div key={document.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-start space-x-4 flex-1">
                  {/* Status icon */}
                  <div className="flex-shrink-0 mt-1">
                    {getStatusIcon(document.document_status)}
                  </div>
                  
                  {/* Document info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-3 mb-2">
                      <h4 className="text-sm font-medium text-gray-900 truncate">
                        {document.name}
                      </h4>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(document.document_status)}`}>
                        {getStatusText(document.document_status)}
                      </span>
                      {document.is_duplicate && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Duplikat
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-4 text-xs text-gray-500">
                      <span>{new Date(document.uploadedAt).toLocaleString('de-DE')}</span>
                      <span>•</span>
                      <span>{(document.size / 1024 / 1024).toFixed(2)} MB</span>
                      {document.confidence && (
                        <>
                          <span>•</span>
                          <span>KI-Sicherheit: {Math.round(document.confidence * 100)}%</span>
                        </>
                      )}
                    </div>
                    
                    {/* Creditor info preview */}
                    {document.extracted_data?.creditor_data && (
                      <div className="mt-2 text-xs text-gray-600">
                        <div className="flex items-center space-x-4">
                          <span className="flex items-center">
                            <BuildingOfficeIcon className="w-3 h-3 mr-1" />
                            {document.extracted_data.creditor_data.sender_name || 'Unbekannt'}
                          </span>
                          {document.extracted_data.creditor_data.reference_number && (
                            <span>Ref: {document.extracted_data.creditor_data.reference_number}</span>
                          )}
                          {document.extracted_data.creditor_data.claim_amount && (
                            <span>{document.extracted_data.creditor_data.claim_amount.toFixed(2)} €</span>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Status reason */}
                    {document.status_reason && (
                      <div className="mt-1 text-xs text-gray-500">
                        {document.status_reason}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Action buttons */}
                <div className="flex items-center space-x-2 ml-4">
                  <button
                    onClick={() => handleViewDetails(document)}
                    className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                    title="Details anzeigen"
                  >
                    <EyeIcon className="w-5 h-5" />
                  </button>
                  
                  <button
                    onClick={() => handleDownload(document)}
                    className="p-2 text-gray-400 hover:text-red-800 transition-colors"
                    title="Dokument herunterladen"
                  >
                    <ArrowDownTrayIcon className="w-5 h-5" />
                  </button>
                  
                  {/* Manual review buttons for documents that need review */}
                  {document.document_status === 'needs_review' && (
                    <div className="flex space-x-1 ml-2 border-l border-gray-200 pl-2">
                      <button
                        onClick={() => handleManualReview(document, 'creditor_confirmed')}
                        disabled={updating}
                        className="px-3 py-1 bg-green-100 hover:bg-green-200 text-green-700 text-xs font-medium rounded transition-colors disabled:opacity-50"
                        title="Als Gläubigerdokument bestätigen"
                      >
                        ✓ Gläubiger
                      </button>
                      <button
                        onClick={() => handleManualReview(document, 'non_creditor_confirmed')}
                        disabled={updating}
                        className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded transition-colors disabled:opacity-50"
                        title="Als Nicht-Gläubigerdokument bestätigen"
                      >
                        ✗ Kein Gläubiger
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Document Details Modal */}
      {showDetails && selectedDocument && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Dokument Details: {selectedDocument.name}
              </h3>
              <button
                onClick={() => setShowDetails(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>
            
            {/* Modal Content */}
            <div className="px-6 py-4 space-y-6">
              {/* Basic Info */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3">Grundinformationen</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-700">Status:</span>
                    <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedDocument.document_status)}`}>
                      {getStatusText(selectedDocument.document_status)}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Größe:</span>
                    <span className="ml-2 text-gray-600">{(selectedDocument.size / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Hochgeladen:</span>
                    <span className="ml-2 text-gray-600">{new Date(selectedDocument.uploadedAt).toLocaleString('de-DE')}</span>
                  </div>
                  {selectedDocument.processed_at && (
                    <div>
                      <span className="font-medium text-gray-700">Verarbeitet:</span>
                      <span className="ml-2 text-gray-600">{new Date(selectedDocument.processed_at).toLocaleString('de-DE')}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* AI Analysis */}
              {selectedDocument.extracted_data && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">KI-Analyse</h4>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-700">Vertrauen:</span>
                      <span className="text-gray-900">{Math.round((selectedDocument.confidence || 0) * 100)}%</span>
                    </div>
                    {selectedDocument.extracted_data.reasoning && (
                      <div>
                        <span className="font-medium text-gray-700">Begründung:</span>
                        <p className="mt-1 text-gray-600 text-sm">{selectedDocument.extracted_data.reasoning}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Creditor Data */}
              {selectedDocument.extracted_data?.creditor_data && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Extrahierte Gläubigerdaten</h4>
                  <div className="bg-blue-50 rounded-lg p-4 space-y-2">
                    {Object.entries(selectedDocument.extracted_data.creditor_data).map(([key, value]) => (
                      <div key={key} className="flex justify-between text-sm">
                        <span className="font-medium text-gray-700 capitalize">
                          {key.replace(/_/g, ' ')}:
                        </span>
                        <span className="text-gray-900">
                          {typeof value === 'boolean' ? (value ? 'Ja' : 'Nein') : (value || 'Nicht gefunden')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Manual Review Actions */}
              {selectedDocument.document_status === 'needs_review' && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Manuelle Prüfung</h4>
                  <div className="flex space-x-4">
                    <button
                      onClick={() => handleManualReview(selectedDocument, 'creditor_confirmed')}
                      disabled={updating}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                      {updating ? 'Wird gespeichert...' : 'Als Gläubigerdokument bestätigen'}
                    </button>
                    <button
                      onClick={() => handleManualReview(selectedDocument, 'non_creditor_confirmed')}
                      disabled={updating}
                      className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                      {updating ? 'Wird gespeichert...' : 'Als Nicht-Gläubigerdokument bestätigen'}
                    </button>
                  </div>
                </div>
              )}

              {/* Summary */}
              {selectedDocument.summary && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Zusammenfassung</h4>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-gray-700 text-sm">{selectedDocument.summary}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDocumentViewer;