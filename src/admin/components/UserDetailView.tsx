import React, { useState, useEffect } from 'react';
import { 
  XMarkIcon,
  UserIcon,
  DocumentTextIcon,
  BuildingOfficeIcon,
  ChartBarIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import { API_BASE_URL } from '../../config/api';

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
  processing_status: 'processing' | 'completed' | 'failed';
  is_creditor_document?: boolean;
  confidence?: number;
  document_status?: string;
  extracted_data?: {
    creditor_data?: {
      sender_name?: string;
      sender_email?: string;
      sender_address?: string;
      reference_number?: string;
      claim_amount?: number;
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUserDetails();
  }, [userId]);

  const fetchUserDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch user data
      const userResponse = await fetch(`${API_BASE_URL}/clients/${userId}`, {
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
        const documentsResponse = await fetch(`${API_BASE_URL}/clients/${userId}/documents`, {
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
      
      setUser(userData);
      
    } catch (error) {
      console.error('Error fetching user details:', error);
      setError('Failed to load user details');
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
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
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
                user.documents.map((doc) => (
                  <div key={doc.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-2">
                        {getDocumentStatusIcon(doc)}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
                          <p className="text-xs text-gray-500">
                            {doc.processing_status === 'completed' ? 'Processed' : 
                             doc.processing_status === 'processing' ? 'Processing...' : 'Failed'}
                          </p>
                          {doc.extracted_data?.creditor_data && (
                            <div className="mt-2 text-xs text-gray-600">
                              <p><strong>Creditor:</strong> {doc.extracted_data.creditor_data.sender_name || 'N/A'}</p>
                              {doc.extracted_data.creditor_data.claim_amount && (
                                <p><strong>Amount:</strong> €{doc.extracted_data.creditor_data.claim_amount}</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
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
    </div>
  );
};

export default UserDetailView;