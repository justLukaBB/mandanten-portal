import React, { useState, useEffect } from 'react';
import {
  DocumentTextIcon,
  FolderOpenIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  UserGroupIcon,
  EyeIcon,
  PencilIcon,
  PlayIcon,
  EnvelopeIcon
} from '@heroicons/react/24/outline';
import api from '../../../config/api';
import AdminDocumentViewer from '../AdminDocumentViewer';
import AdminCreditorDataTable from '../AdminCreditorDataTable';
import AdminWorkflowManager from '../AdminWorkflowManager';

interface Phase1DashboardProps {
  clientId: string;
}

interface DocumentStatus {
  id: string;
  name: string;
  processing_status: string;
  uploadedAt: string;
  extraction_data?: any;
  creditor_extracted?: boolean;
}

interface ClientData {
  id: string;
  firstName: string;
  lastName: string;
  workflow_status: string;
  documents: DocumentStatus[];
  final_creditor_list: any[];
  phase: number;
}

const Phase1Dashboard: React.FC<Phase1DashboardProps> = ({ clientId }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'documents' | 'creditors' | 'workflow'>('overview');
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zendeskLoading, setZendeskLoading] = useState(false);

  useEffect(() => {
    fetchClientData();
  }, [clientId]);

  const fetchClientData = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/clients/${clientId}`);
      setClientData(response.data);
      setError(null);
    } catch (err: any) {
      setError('Fehler beim Laden der Mandantendaten: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const getDocumentStatusStats = () => {
    if (!clientData?.documents) return { processing: 0, completed: 0, failed: 0, total: 0 };
    
    const docs = clientData.documents;
    return {
      processing: docs.filter(d => d.processing_status === 'processing').length,
      completed: docs.filter(d => d.processing_status === 'completed').length,
      failed: docs.filter(d => d.processing_status === 'failed').length,
      total: docs.length
    };
  };

  const startZendeskContact = async () => {
    if (!clientData) return;
    
    setZendeskLoading(true);
    setError(null);
    
    try {
      const response = await api.post(`/admin/clients/${clientId}/start-creditor-contact`);
      
      if (response.data.success) {
        // Refresh client data to show updated status
        await fetchClientData();
        alert(`✅ ${response.data.message}`);
      } else {
        setError('Fehler beim Starten des Zendesk-Kontakts: ' + response.data.error);
      }
    } catch (err: any) {
      setError('Fehler beim Starten des Zendesk-Kontakts: ' + (err.response?.data?.error || err.message));
    } finally {
      setZendeskLoading(false);
    }
  };

  const getWorkflowStatusColor = (status: string) => {
    const statusMap: Record<string, { color: string; bg: string; text: string }> = {
      'documents_processing': { color: 'text-red-800', bg: 'bg-blue-100', text: 'Dokumente werden verarbeitet' },
      'admin_review': { color: 'text-yellow-600', bg: 'bg-yellow-100', text: 'Admin-Prüfung erforderlich' },
      'client_confirmation': { color: 'text-purple-600', bg: 'bg-purple-100', text: 'Mandanten-Bestätigung' },
      'creditor_contact_ready': { color: 'text-orange-600', bg: 'bg-orange-100', text: 'Zendesk-Kontakt bereit' },
      'creditor_contact_in_progress': { color: 'text-indigo-600', bg: 'bg-indigo-100', text: 'Gläubiger-Kontakt läuft' },
      'creditor_contact_completed': { color: 'text-green-600', bg: 'bg-green-100', text: 'Phase 1 abgeschlossen' }
    };
    return statusMap[status] || statusMap['documents_processing'];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex">
          <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Fehler</h3>
            <div className="mt-2 text-sm text-red-700">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  if (!clientData) {
    return <div>Keine Mandantendaten gefunden.</div>;
  }

  const docStats = getDocumentStatusStats();
  const statusConfig = getWorkflowStatusColor(clientData.workflow_status);

  const tabs = [
    { key: 'overview', label: 'Übersicht', icon: FolderOpenIcon },
    { key: 'documents', label: 'Dokumente', icon: DocumentTextIcon, count: docStats.total },
    { key: 'creditors', label: 'Gläubiger', icon: UserGroupIcon, count: clientData.final_creditor_list.length },
    { key: 'workflow', label: 'Workflow', icon: CheckCircleIcon }
  ];

  const renderOverview = () => (
    <div className="space-y-6">
      {/* Client Info Header */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                {clientData.firstName} {clientData.lastName}
              </h3>
              <p className="text-sm text-gray-500">Mandant #{clientData.id} • Phase {clientData.phase}</p>
            </div>
            <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusConfig.bg} ${statusConfig.color}`}>
              {statusConfig.text}
            </div>
          </div>
        </div>
        
        <div className="px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{docStats.total}</div>
              <div className="text-sm text-gray-500">Dokumente gesamt</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{docStats.completed}</div>
              <div className="text-sm text-gray-500">Verarbeitet</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-800">{clientData.final_creditor_list.length}</div>
              <div className="text-sm text-gray-500">Gläubiger identifiziert</div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div 
          onClick={() => setActiveTab('documents')}
          className="bg-white shadow rounded-lg p-6 cursor-pointer hover:shadow-lg transition-shadow border-l-4 border-blue-500"
        >
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <DocumentTextIcon className="h-8 w-8 text-red-800" />
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">Dokumente verwalten</h3>
              <p className="text-sm text-gray-500">
                {docStats.processing} in Bearbeitung, {docStats.failed} fehlgeschlagen
              </p>
            </div>
          </div>
          {docStats.processing > 0 && (
            <div className="mt-4">
              <div className="flex items-center">
                <ClockIcon className="w-4 h-4 text-yellow-500 mr-2" />
                <span className="text-sm text-yellow-600">Verarbeitung läuft...</span>
              </div>
            </div>
          )}
        </div>

        <div 
          onClick={() => setActiveTab('creditors')}
          className="bg-white shadow rounded-lg p-6 cursor-pointer hover:shadow-lg transition-shadow border-l-4 border-green-500"
        >
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <UserGroupIcon className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">Gläubiger-Daten</h3>
              <p className="text-sm text-gray-500">
                {clientData.final_creditor_list.length} Gläubiger identifiziert
              </p>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center">
              <EyeIcon className="w-4 h-4 text-green-500 mr-2" />
              <span className="text-sm text-green-600">Bereit zur Prüfung</span>
            </div>
          </div>
        </div>

        <div 
          onClick={() => setActiveTab('workflow')}
          className="bg-white shadow rounded-lg p-6 cursor-pointer hover:shadow-lg transition-shadow border-l-4 border-purple-500"
        >
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CheckCircleIcon className="h-8 w-8 text-purple-600" />
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">Workflow-Status</h3>
              <p className="text-sm text-gray-500">Nächste Schritte verwalten</p>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center">
              <PencilIcon className="w-4 h-4 text-purple-500 mr-2" />
              <span className="text-sm text-purple-600">Workflow konfigurieren</span>
            </div>
          </div>
        </div>

        {/* Zendesk Contact Card - Only show when ready */}
        {clientData.workflow_status === 'creditor_contact_ready' && (
          <div className="bg-orange-50 shadow rounded-lg p-6 border-l-4 border-orange-500">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <EnvelopeIcon className="h-8 w-8 text-orange-600" />
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-medium text-gray-900">Zendesk-Kontakt starten</h3>
                  <p className="text-sm text-gray-500">
                    {clientData.final_creditor_list.filter(c => c.status === 'confirmed').length} bestätigte Gläubiger kontaktieren
                  </p>
                </div>
              </div>
              <div className="ml-4">
                <button
                  onClick={startZendeskContact}
                  disabled={zendeskLoading}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {zendeskLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  ) : (
                    <PlayIcon className="h-4 w-4 mr-2" />
                  )}
                  {zendeskLoading ? 'Wird gestartet...' : 'Tickets erstellen'}
                </button>
              </div>
            </div>
            <div className="mt-4 text-sm text-orange-700">
              ⚡ Erstellt automatisch Zendesk-Tickets und wartet auf Gläubiger-Antworten mit aktuellen Forderungsbeträgen.
            </div>
          </div>
        )}

        {/* Contact Progress Card - Show when in progress */}
        {clientData.workflow_status === 'creditor_contact_in_progress' && (
          <div className="bg-indigo-50 shadow rounded-lg p-6 border-l-4 border-indigo-500">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ClockIcon className="h-8 w-8 text-indigo-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-medium text-gray-900">Gläubiger-Kontakt läuft</h3>
                <p className="text-sm text-gray-500">
                  Warten auf Antworten der Gläubiger via Zendesk
                </p>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center">
                <ClockIcon className="w-4 h-4 text-indigo-500 mr-2" />
                <span className="text-sm text-indigo-600">Kontakt-Prozess aktiv</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Letzte Aktivitäten</h3>
        </div>
        <div className="px-6 py-4">
          {docStats.total === 0 ? (
            <p className="text-gray-500 text-center py-8">
              Noch keine Dokumente hochgeladen
            </p>
          ) : (
            <div className="space-y-3">
              {clientData.documents
                .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
                .slice(0, 5)
                .map((doc, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <DocumentTextIcon className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{doc.name}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(doc.uploadedAt).toLocaleString('de-DE')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                        doc.processing_status === 'completed' 
                          ? 'bg-green-100 text-green-800'
                          : doc.processing_status === 'processing'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {doc.processing_status === 'completed' 
                          ? 'Abgeschlossen'
                          : doc.processing_status === 'processing'
                          ? 'In Bearbeitung'
                          : 'Fehlgeschlagen'
                        }
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            const IconComponent = tab.icon;
            
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                  isActive
                    ? 'border-blue-500 text-red-800'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <IconComponent className="w-5 h-5 mr-2" />
                {tab.label}
                {tab.count !== undefined && (
                  <span className={`ml-2 py-0.5 px-2 rounded-full text-xs font-medium ${
                    isActive ? 'bg-blue-100 text-red-800' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'documents' && (
          <div className="bg-white shadow rounded-lg">
            <AdminDocumentViewer />
          </div>
        )}
        {activeTab === 'creditors' && (
          <div className="bg-white shadow rounded-lg">
            <AdminCreditorDataTable />
          </div>
        )}
        {activeTab === 'workflow' && (
          <div className="bg-white shadow rounded-lg">
            <AdminWorkflowManager />
          </div>
        )}
      </div>
    </div>
  );
};

export default Phase1Dashboard;