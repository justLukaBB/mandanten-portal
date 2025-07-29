import React, { useState, useEffect } from 'react';
import { 
  UserIcon, 
  DocumentTextIcon, 
  EyeIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import DocumentExtractionViewer from '../../components/DocumentExtractionViewer';
import api from '../../config/api';

interface Client {
  _id: string;
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  aktenzeichen: string;
  phone?: string;
  workflow_status: string;
  documents: any[];
  created_at: string;
}

const ClientManagement: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchClients();
    const interval = setInterval(fetchClients, 15000); // Refresh every 15 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchClients = async () => {
    try {
      const response = await api.get('/admin/clients');
      const clientsData = response.data.clients || [];
      setClients(clientsData);
      
      if (selectedClient) {
        const updatedClient = clientsData.find((c: Client) => c._id === selectedClient._id);
        if (updatedClient) {
          setSelectedClient(updatedClient);
        }
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching clients:', error);
      setLoading(false);
    }
  };

  const getDocumentStats = (documents: any[]) => {
    return {
      total: documents.length,
      processing: documents.filter(doc => doc.processing_status === 'processing').length,
      completed: documents.filter(doc => doc.processing_status === 'completed').length,
      failed: documents.filter(doc => doc.processing_status === 'failed').length,
      needsReview: documents.filter(doc => doc.validation?.requires_manual_review).length
    };
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processing':
        return <ClockIcon className="w-4 h-4 text-blue-500" />;
      case 'completed':
        return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <ExclamationTriangleIcon className="w-4 h-4 text-red-500" />;
      default:
        return <DocumentTextIcon className="w-4 h-4 text-gray-400" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <UserIcon className="h-8 w-8 text-red-800 mr-3" />
              <h1 className="text-3xl font-bold text-gray-900">Mandantenverwaltung</h1>
            </div>
            <button
              onClick={fetchClients}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-800"
            >
              <ArrowPathIcon className="h-4 w-4 mr-2" />
              Aktualisieren
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Client List */}
          <div className="lg:col-span-1">
            <div className="bg-white shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  Mandanten ({clients.length})
                </h3>
                
                <div className="space-y-3">
                  {clients.map((client) => {
                    const stats = getDocumentStats(client.documents || []);
                    const isSelected = selectedClient?._id === client._id;
                    
                    return (
                      <div
                        key={client._id}
                        onClick={() => setSelectedClient(client)}
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                          isSelected 
                            ? 'border-blue-500 bg-blue-50' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium text-gray-900">
                              {client.firstName} {client.lastName}
                            </h4>
                            <p className="text-sm text-gray-500">{client.email}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              {client.aktenzeichen}
                            </p>
                            <p className="text-xs text-gray-400">
                              Status: {client.workflow_status}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center space-x-1 mb-1">
                              <DocumentTextIcon className="w-4 h-4 text-gray-400" />
                              <span className="text-sm font-medium">{stats.total}</span>
                            </div>
                            <div className="flex items-center space-x-2 text-xs">
                              {stats.processing > 0 && (
                                <span className="flex items-center text-red-800">
                                  <ClockIcon className="w-3 h-3 mr-1" />
                                  {stats.processing}
                                </span>
                              )}
                              {stats.needsReview > 0 && (
                                <span className="flex items-center text-orange-600">
                                  <ExclamationTriangleIcon className="w-3 h-3 mr-1" />
                                  {stats.needsReview}
                                </span>
                              )}
                              {stats.failed > 0 && (
                                <span className="flex items-center text-red-600">
                                  <ExclamationTriangleIcon className="w-3 h-3 mr-1" />
                                  {stats.failed}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Document Analysis */}
          <div className="lg:col-span-2">
            {selectedClient ? (
              <div className="space-y-6">
                {/* Client Info */}
                <div className="bg-white shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                      Mandant: {selectedClient.firstName} {selectedClient.lastName}
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">E-Mail</label>
                        <p className="mt-1 text-sm text-gray-900">{selectedClient.email}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Telefon</label>
                        <p className="mt-1 text-sm text-gray-900">{(selectedClient as any).phone || 'Nicht verfügbar'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Document Analysis */}
                <DocumentExtractionViewer 
                  documents={selectedClient.documents || []} 
                  clientId={selectedClient._id}
                  onRefresh={fetchClients}
                />
              </div>
            ) : (
              <div className="bg-white shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6 text-center">
                  <UserIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Mandant auswählen
                  </h3>
                  <p className="text-gray-500">
                    Wählen Sie einen Mandanten aus der Liste aus, um dessen Dokumente und AI-Analysen zu sehen.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default ClientManagement;