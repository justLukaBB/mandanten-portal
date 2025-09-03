import React, { useState, useEffect } from 'react';
import { 
  XMarkIcon,
  UserIcon,
  DocumentTextIcon,
  BuildingOfficeIcon,
  ChartBarIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  EyeIcon,
  InformationCircleIcon,
  ArrowPathIcon,
  ArrowDownTrayIcon,
  CalculatorIcon
} from '@heroicons/react/24/outline';
import { API_BASE_URL } from '../../config/api';
import SchuldenbereinigungsplanView from './SchuldenbereinigungsplanView';

interface UserDetailProps {
  userId: string;
  onClose: () => void;
}

interface DetailedUser {
  id: string;
  aktenzeichen: string;
  firstName: string;
  lastName: string;
  email: string;
  current_status: string;
  created_at: string;
  updated_at: string;
  last_login?: string;
  documents: Document[];
  final_creditor_list?: Creditor[];
  zendesk_ticket_id?: string;
  workflow_status?: string;
}

interface Document {
  id: string;
  name: string;
  size?: number;
  processing_status: 'processing' | 'completed' | 'failed';
  is_creditor_document?: boolean;
  confidence?: number;
  document_status?: string;
  manual_review_required?: boolean;
  summary?: string;
  extracted_data?: {
    creditor_data?: {
      sender_name?: string;
      sender_email?: string;
      sender_address?: string;
      reference_number?: string;
      claim_amount?: number;
      is_representative?: boolean;
      actual_creditor?: string;
    };
    reasoning?: string;
    workflow_status?: string;
    processing_method?: string;
    token_usage?: {
      total_tokens?: number;
    };
  };
  uploadedAt: string;
  processed_at?: string;
}

interface Creditor {
  id: string;
  sender_name: string;
  sender_email?: string;
  sender_address?: string;
  reference_number?: string;
  claim_amount?: number;
  status: string;
}

const UserDetailView: React.FC<UserDetailProps> = ({ userId, onClose }) => {
  const [user, setUser] = useState<DetailedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSettlementPlan, setShowSettlementPlan] = useState(false);

  useEffect(() => {
    fetchUserDetails();
    // Removed auto-refresh to prevent session logout issues
  }, [userId]);

  const downloadDocument = async (documentId: string, documentName: string) => {
    try {
      console.log(`📥 Downloading document ${documentId} (${documentName})`);
      
      const response = await fetch(`${API_BASE_URL}/api/clients/${userId}/documents/${documentId}/download`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        }
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = documentName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      console.log(`✅ Document downloaded successfully`);
    } catch (error) {
      console.error('❌ Error downloading document:', error);
      alert(`Fehler beim Herunterladen des Dokuments: ${error}`);
    }
  };

  const fetchUserDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch user data
      const userResponse = await fetch(`${API_BASE_URL}/api/clients/${userId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        }
      });
      
      if (!userResponse.ok) {
        throw new Error('Failed to fetch user details');
      }
      
      const userData = await userResponse.json();
      
      // Fetch documents separately
      try {
        const documentsResponse = await fetch(`${API_BASE_URL}/api/clients/${userId}/documents`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
          }
        });
        
        if (documentsResponse.ok) {
          const documentsData = await documentsResponse.json();
          userData.documents = documentsData || [];
        } else {
          userData.documents = [];
        }
      } catch (docError) {
        console.warn('Could not fetch documents:', docError);
        userData.documents = [];
      }
      
      console.log('UserDetailView: Loaded user data:', userData);
      console.log('UserDetailView: Documents loaded:', userData.documents);
      setUser(userData);
      
    } catch (error) {
      console.error('Error fetching user details:', error);
      setError('Failed to load user details');
    } finally {
      setLoading(false);
    }
  };

  const simulate30DayPeriod = async () => {
    if (!window.confirm(`🕐 30-Day Period Simulation\n\nDies simuliert das Ende der 30-Tage-Periode für Client ${user?.firstName} ${user?.lastName} (${user?.aktenzeichen}).\n\nDer Gläubigerkontakt-Prozess wird gestartet.\n\nFortfahren?`)) {
      return;
    }

    try {
      setLoading(true);
      
      const response = await fetch(`${API_BASE_URL}/api/admin/clients/${userId}/simulate-30-day-period`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Simulation failed: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        alert(`✅ 30-Day Simulation erfolgreich!\n\n${result.message}\n\nStatus: ${result.new_status || 'N/A'}`);
        // Refresh user data to show updated status
        await fetchUserDetails();
      } else {
        alert(`❌ Simulation fehlgeschlagen: ${result.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error running 30-day simulation:', error);
      alert(`❌ Fehler bei der 30-Day Simulation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeColor = (status: string) => {
    const colors: Record<string, string> = {
      'created': 'bg-gray-100 text-gray-800',
      'portal_access_sent': 'bg-red-50 text-red-800',
      'documents_uploaded': 'bg-red-100 text-red-800',
      'documents_processing': 'bg-yellow-100 text-yellow-800',
      'waiting_for_payment': 'bg-orange-100 text-orange-800',
      'payment_confirmed': 'bg-green-100 text-green-800',
      'creditor_review': 'bg-red-200 text-red-900',
      'awaiting_client_confirmation': 'bg-pink-100 text-pink-800',
      'creditor_contact_active': 'bg-red-300 text-red-900',
      'completed': 'bg-emerald-100 text-emerald-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getDocumentStatusInfo = (doc: Document) => {
    if (doc.processing_status === 'processing') {
      return {
        badge: { color: 'bg-yellow-100 text-yellow-800', text: 'Wird verarbeitet...' },
        showCreditorInfo: false
      };
    }
    
    if (doc.processing_status === 'failed') {
      return {
        badge: { color: 'bg-red-100 text-red-800', text: 'Verarbeitung fehlgeschlagen' },
        showCreditorInfo: false
      };
    }

    if (doc.processing_status === 'completed') {
      if (doc.manual_review_required) {
        return {
          badge: { color: 'bg-orange-100 text-orange-800', text: 'Manuelle Prüfung erforderlich' },
          showCreditorInfo: true
        };
      }
      
      if (doc.is_creditor_document) {
        return {
          badge: { color: 'bg-red-100 text-red-800', text: 'Gläubigerdokument' },
          showCreditorInfo: true
        };
      } else {
        return {
          badge: { color: 'bg-green-100 text-green-800', text: 'Kein Gläubigerdokument' },
          showCreditorInfo: false
        };
      }
    }

    return {
      badge: { color: 'bg-gray-100 text-gray-800', text: 'Unbekannt' },
      showCreditorInfo: false
    };
  };

  const getDocumentStatusIcon = (doc: Document) => {
    if (doc.processing_status === 'processing') {
      return <ClockIcon className="w-5 h-5 text-yellow-500" />;
    } else if (doc.processing_status === 'completed' && doc.is_creditor_document) {
      return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
    } else if (doc.processing_status === 'failed') {
      return <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />;
    }
    return <DocumentTextIcon className="w-5 h-5 text-gray-400" />;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{borderBottomColor: '#9f1a1d'}}></div>
            <span className="text-lg">Loading user details...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-red-600">Error</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>
          <p className="text-gray-600 mb-4">{error || 'User not found'}</p>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-6xl w-full mx-4 max-h-screen overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            📄 User Details: {user.firstName} {user.lastName}
          </h2>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowSettlementPlan(true)}
              className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md border border-blue-600 text-blue-600 hover:bg-blue-50 transition-colors"
              title="Open Schuldenbereinigungsplan"
            >
              <CalculatorIcon className="w-4 h-4 mr-1" />
              Settlement Plan
            </button>
            <button
              onClick={simulate30DayPeriod}
              disabled={loading}
              className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md border border-orange-600 text-orange-600 hover:bg-orange-50 transition-colors"
              title="Simulate 30-day period and start creditor contact process"
            >
              <ClockIcon className={`w-4 h-4 mr-1 ${loading ? 'animate-pulse' : ''}`} />
              30-Day Simulation
            </button>
            <button
              onClick={fetchUserDetails}
              disabled={loading}
              className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md border hover:bg-red-50 transition-colors"
              style={{color: '#9f1a1d', borderColor: '#9f1a1d'}}
              title="Refresh user data"
            >
              <ArrowPathIcon className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* User Profile */}
          <div className="bg-gray-50 rounded-lg p-6">
            <div className="flex items-center mb-4">
              <UserIcon className="w-8 h-8 mr-3" style={{color: '#9f1a1d'}} />
              <h3 className="text-lg font-semibold">Profile</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-600">Name</label>
                <p className="text-gray-900">{user.firstName} {user.lastName}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Email</label>
                <p className="text-gray-900">{user.email}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Aktenzeichen</label>
                <p className="text-gray-900 font-mono">{user.aktenzeichen}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Status</label>
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(user.current_status)}`}>
                  {user.current_status}
                </span>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Created</label>
                <p className="text-gray-900">{new Date(user.created_at).toLocaleDateString('de-DE')}</p>
              </div>
              {user.last_login && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Last Login</label>
                  <p className="text-gray-900">{new Date(user.last_login).toLocaleDateString('de-DE')}</p>
                </div>
              )}
              {user.zendesk_ticket_id && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Zendesk Ticket</label>
                  <p className="text-gray-900 font-mono">{user.zendesk_ticket_id}</p>
                </div>
              )}
            </div>
          </div>

          {/* Documents */}
          <div className="bg-gray-50 rounded-lg p-6">
            <div className="flex items-center mb-4">
              <DocumentTextIcon className="w-8 h-8 mr-3" style={{color: '#9f1a1d'}} />
              <h3 className="text-lg font-semibold">Documents ({user.documents?.length || 0})</h3>
            </div>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {user.documents && user.documents.length > 0 ? (
                user.documents.map((doc) => {
                  const statusInfo = getDocumentStatusInfo(doc);
                  return (
                    <div key={doc.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3">
                          {getDocumentStatusIcon(doc)}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusInfo.badge.color}`}>
                                {statusInfo.badge.text}
                              </span>
                            </div>
                            
                            {/* AI Confidence - always show if available */}
                            {doc.confidence && (
                              <p className="text-xs text-gray-500 mb-2">
                                <strong>AI-Sicherheit:</strong> {Math.round(doc.confidence * 100)}%
                              </p>
                            )}

                            {/* Creditor Information - only show for creditor documents or manual review */}
                            {statusInfo.showCreditorInfo && doc.extracted_data?.creditor_data && (
                              <div className="mt-2 p-2 bg-red-50 rounded text-xs border border-red-200">
                                <div className="space-y-1">
                                  {doc.extracted_data.creditor_data.sender_name && (
                                    <p><strong>Gläubiger:</strong> {doc.extracted_data.creditor_data.sender_name}</p>
                                  )}
                                  {doc.extracted_data.creditor_data.claim_amount && (
                                    <p><strong>Forderung:</strong> <span className="font-semibold text-red-700">€{doc.extracted_data.creditor_data.claim_amount}</span></p>
                                  )}
                                  {doc.extracted_data.creditor_data.reference_number && (
                                    <p><strong>Aktenzeichen:</strong> <span className="font-mono">{doc.extracted_data.creditor_data.reference_number}</span></p>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Summary for non-creditor documents */}
                            {!statusInfo.showCreditorInfo && doc.processing_status === 'completed' && (
                              <div className="mt-2 text-xs text-gray-600">
                                <p className="italic">Dieses Dokument enthält keine Gläubigerforderung</p>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex-shrink-0 space-x-2">
                          <button
                            onClick={() => downloadDocument(doc.id, doc.name)}
                            className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-md border hover:bg-gray-50 transition-colors text-gray-600 border-gray-300"
                          >
                            <ArrowDownTrayIcon className="w-3 h-3 mr-1" />
                            Download
                          </button>
                          <button
                            onClick={() => {
                              console.log('Details button clicked for document:', doc);
                              setSelectedDocument(doc);
                            }}
                            className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-md border hover:bg-red-50 transition-colors"
                            style={{color: '#9f1a1d', borderColor: '#9f1a1d'}}
                          >
                            <EyeIcon className="w-3 h-3 mr-1" />
                            Details
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-gray-500 text-sm">No documents uploaded</p>
              )}
            </div>
          </div>

          {/* Creditors */}
          <div className="bg-gray-50 rounded-lg p-6">
            <div className="flex items-center mb-4">
              <BuildingOfficeIcon className="w-8 h-8 mr-3" style={{color: '#9f1a1d'}} />
              <h3 className="text-lg font-semibold">Creditors ({user.final_creditor_list?.length || 0})</h3>
            </div>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {user.final_creditor_list && user.final_creditor_list.length > 0 ? (
                user.final_creditor_list.map((creditor) => (
                  <div key={creditor.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-gray-900">{creditor.sender_name}</p>
                      {creditor.sender_email && (
                        <p className="text-xs text-gray-600">{creditor.sender_email}</p>
                      )}
                      {creditor.claim_amount && (
                        <p className="text-xs text-gray-600">Amount: €{creditor.claim_amount}</p>
                      )}
                      {creditor.reference_number && (
                        <p className="text-xs text-gray-500">Ref: {creditor.reference_number}</p>
                      )}
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        creditor.status === 'confirmed' ? 'bg-green-100 text-green-800' : 
                        creditor.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {creditor.status}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-sm">No creditors identified</p>
              )}
            </div>
          </div>
        </div>
        
        {/* Analytics Summary */}
        <div className="mt-6 bg-gray-50 rounded-lg p-6">
          <div className="flex items-center mb-4">
            <ChartBarIcon className="w-8 h-8 mr-3" style={{color: '#9f1a1d'}} />
            <h3 className="text-lg font-semibold">Analytics Summary</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold" style={{color: '#9f1a1d'}}>{user.documents?.length || 0}</p>
              <p className="text-sm text-gray-600">Total Documents</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">
                {user.documents?.filter(d => d.processing_status === 'completed').length || 0}
              </p>
              <p className="text-sm text-gray-600">Processed</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-600">
                {user.documents?.filter(d => d.processing_status === 'processing').length || 0}
              </p>
              <p className="text-sm text-gray-600">Processing</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold" style={{color: '#9f1a1d'}}>{user.final_creditor_list?.length || 0}</p>
              <p className="text-sm text-gray-600">Creditors</p>
            </div>
          </div>
        </div>
        
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 text-gray-700 rounded-md hover:bg-gray-400"
            style={{backgroundColor: '#f3f4f6'}}
          >
            Close
          </button>
        </div>
      </div>

      {/* Document Detail Modal */}
      {selectedDocument && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center space-x-3">
                <InformationCircleIcon className="w-8 h-8" style={{color: '#9f1a1d'}} />
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Dokument Details</h2>
                  <p className="text-sm text-gray-600">{selectedDocument.name}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedDocument(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Document Status & Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-3 text-gray-900">📄 Dokument Information</h3>
                  <div className="space-y-2">
                    <div>
                      <span className="font-medium text-gray-600">Status:</span>
                      <span className={`ml-2 px-2 py-1 text-xs rounded-full ${
                        selectedDocument.processing_status === 'completed' ? 'bg-green-100 text-green-800' :
                        selectedDocument.processing_status === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {selectedDocument.processing_status === 'completed' ? 'Verarbeitet' :
                         selectedDocument.processing_status === 'processing' ? 'Wird verarbeitet...' : 'Fehler'}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Hochgeladen:</span>
                      <span className="ml-2 text-gray-900">{new Date(selectedDocument.uploadedAt).toLocaleString('de-DE')}</span>
                    </div>
                    {selectedDocument.processed_at && (
                      <div>
                        <span className="font-medium text-gray-600">Verarbeitet:</span>
                        <span className="ml-2 text-gray-900">{new Date(selectedDocument.processed_at).toLocaleString('de-DE')}</span>
                      </div>
                    )}
                    {selectedDocument.size && (
                      <div>
                        <span className="font-medium text-gray-600">Dateigröße:</span>
                        <span className="ml-2 text-gray-900">{(selectedDocument.size / (1024 * 1024)).toFixed(2)} MB</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-3 text-gray-900">🤖 KI-Analyse</h3>
                  <div className="space-y-2">
                    <div>
                      <span className="font-medium text-gray-600">Gläubigerdokument:</span>
                      <span className={`ml-2 px-2 py-1 text-xs rounded-full ${
                        selectedDocument.is_creditor_document ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {selectedDocument.is_creditor_document ? 'JA' : 'NEIN'}
                      </span>
                    </div>
                    {selectedDocument.confidence && (
                      <div>
                        <span className="font-medium text-gray-600">Sicherheit:</span>
                        <span className="ml-2 text-gray-900 font-mono">{Math.round(selectedDocument.confidence * 100)}%</span>
                      </div>
                    )}
                    {selectedDocument.document_status && (
                      <div>
                        <span className="font-medium text-gray-600">Dokumentstatus:</span>
                        <span className="ml-2 text-gray-900">{selectedDocument.document_status}</span>
                      </div>
                    )}
                    {selectedDocument.manual_review_required && (
                      <div>
                        <span className="font-medium text-gray-600">Manuelle Prüfung:</span>
                        <span className="ml-2 px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">Erforderlich</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Creditor Data - Show for all documents with creditor_data */}
              {selectedDocument.extracted_data?.creditor_data && (
                <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                  <h3 className="text-lg font-semibold mb-3 text-red-900">🏛️ Gläubiger-Informationen</h3>
                  
                  {/* Key Information Summary */}
                  <div className="bg-white rounded-lg p-3 mb-4 border border-red-300">
                    <h4 className="font-semibold text-red-800 mb-2">📋 Wichtige Daten im Überblick</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <div>
                        <span className="font-medium text-gray-600">Aktenzeichen:</span>
                        <p className="text-gray-900 font-mono">{selectedDocument.extracted_data.creditor_data.reference_number || 'Nicht verfügbar'}</p>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Forderungssumme:</span>
                        <p className="text-red-700 font-bold">{selectedDocument.extracted_data.creditor_data.claim_amount ? `€${selectedDocument.extracted_data.creditor_data.claim_amount}` : 'Nicht verfügbar'}</p>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Forderung gegen:</span>
                        <p className="text-gray-900">{user?.firstName} {user?.lastName} ({user?.aktenzeichen})</p>
                      </div>
                    </div>
                  </div>

                  {/* Detailed Information */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div>
                        <span className="font-medium text-red-700">Absender/Gläubiger:</span>
                        <p className="text-red-900 mt-1">{selectedDocument.extracted_data.creditor_data.sender_name || 'Nicht verfügbar'}</p>
                      </div>
                      {selectedDocument.extracted_data.creditor_data.sender_email && (
                        <div>
                          <span className="font-medium text-red-700">E-Mail:</span>
                          <p className="text-red-900 mt-1">{selectedDocument.extracted_data.creditor_data.sender_email}</p>
                        </div>
                      )}
                      {selectedDocument.extracted_data.creditor_data.sender_address && (
                        <div>
                          <span className="font-medium text-red-700">Adresse:</span>
                          <p className="text-red-900 mt-1">{selectedDocument.extracted_data.creditor_data.sender_address}</p>
                        </div>
                      )}
                    </div>
                    <div className="space-y-3">
                      {selectedDocument.extracted_data.creditor_data.reference_number && (
                        <div>
                          <span className="font-medium text-red-700">Aktenzeichen/Referenz:</span>
                          <p className="text-red-900 mt-1 font-mono">{selectedDocument.extracted_data.creditor_data.reference_number}</p>
                        </div>
                      )}
                      {selectedDocument.extracted_data.creditor_data.claim_amount && (
                        <div>
                          <span className="font-medium text-red-700">Forderungssumme:</span>
                          <p className="text-red-900 mt-1 text-xl font-bold">€{selectedDocument.extracted_data.creditor_data.claim_amount}</p>
                        </div>
                      )}
                      {selectedDocument.extracted_data.creditor_data.is_representative && (
                        <div>
                          <span className="font-medium text-red-700">Vertreter:</span>
                          <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                            {selectedDocument.extracted_data.creditor_data.is_representative ? 'JA' : 'NEIN'}
                          </span>
                        </div>
                      )}
                      {selectedDocument.extracted_data.creditor_data.actual_creditor && (
                        <div>
                          <span className="font-medium text-red-700">Tatsächlicher Gläubiger:</span>
                          <p className="text-red-900 mt-1">{selectedDocument.extracted_data.creditor_data.actual_creditor}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* AI Reasoning */}
              {selectedDocument.extracted_data?.reasoning && (
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <h3 className="text-lg font-semibold mb-3 text-blue-900">🧠 KI-Begründung</h3>
                  <p className="text-blue-800 text-sm leading-relaxed">{selectedDocument.extracted_data.reasoning}</p>
                </div>
              )}

              {/* Summary */}
              {selectedDocument.summary && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-3 text-gray-900">📋 Zusammenfassung</h3>
                  <p className="text-gray-700 text-sm leading-relaxed">{selectedDocument.summary}</p>
                </div>
              )}

              {/* Technical Details */}
              {selectedDocument.extracted_data && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-3 text-gray-900">⚙️ Technische Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    {selectedDocument.extracted_data.processing_method && (
                      <div>
                        <span className="font-medium text-gray-600">Verarbeitungsmethode:</span>
                        <p className="text-gray-900 mt-1">{selectedDocument.extracted_data.processing_method}</p>
                      </div>
                    )}
                    {selectedDocument.extracted_data.workflow_status && (
                      <div>
                        <span className="font-medium text-gray-600">Workflow-Status:</span>
                        <p className="text-gray-900 mt-1">{selectedDocument.extracted_data.workflow_status}</p>
                      </div>
                    )}
                    {selectedDocument.extracted_data.token_usage && (
                      <div>
                        <span className="font-medium text-gray-600">Token-Verbrauch:</span>
                        <p className="text-gray-900 mt-1">{selectedDocument.extracted_data.token_usage.total_tokens || 'N/A'} Tokens</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-4 border-t border-gray-200">
                <button
                  onClick={() => setSelectedDocument(null)}
                  className="px-6 py-2 text-white rounded-md hover:opacity-90"
                  style={{backgroundColor: '#9f1a1d'}}
                >
                  Schließen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Settlement Plan Modal */}
      {showSettlementPlan && (
        <SchuldenbereinigungsplanView
          userId={userId}
          onClose={() => setShowSettlementPlan(false)}
          onBack={() => setShowSettlementPlan(false)}
        />
      )}
    </div>
  );
};

export default UserDetailView;