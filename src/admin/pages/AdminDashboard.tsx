import React, { useState, useEffect } from 'react';
import { 
  DocumentTextIcon, 
  UserGroupIcon, 
  ChartBarIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import api from '../../config/api';
import AdminCreditorDataTable from '../components/AdminCreditorDataTable';
import AdminWorkflowManager from '../components/AdminWorkflowManager';
import AdminDocumentViewer from '../components/AdminDocumentViewer';
import AdminCreditorContactManager from '../components/AdminCreditorContactManager';

interface DashboardStats {
  totalClients: number;
  totalDocuments: number;
  processingDocuments: number;
  completedDocuments: number;
  failedDocuments: number;
  recentActivity: any[];
}

interface Client {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  aktenzeichen: string;
  workflow_status: string;
  documents: any[];
  created_at: string;
  first_payment_received: boolean;
  admin_approved: boolean;
  client_confirmed_creditors: boolean;
}

const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalClients: 0,
    totalDocuments: 0,
    processingDocuments: 0,
    completedDocuments: 0,
    failedDocuments: 0,
    recentActivity: []
  });
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Fetch all clients from MongoDB
      const response = await api.get('/admin/clients');
      const clientsData = response.data.clients || [];
      setClients(clientsData);
      
      // Calculate stats from all clients
      let totalDocuments = 0;
      let processingDocuments = 0;
      let completedDocuments = 0;
      let failedDocuments = 0;
      const allRecentActivity: any[] = [];
      
      clientsData.forEach((client: Client) => {
        const documents = client.documents || [];
        totalDocuments += documents.length;
        
        documents.forEach((doc: any) => {
          if (doc.processing_status === 'processing') processingDocuments++;
          else if (doc.processing_status === 'completed') completedDocuments++;
          else if (doc.processing_status === 'failed') failedDocuments++;
          
          allRecentActivity.push({
            ...doc,
            clientName: `${client.firstName} ${client.lastName}`,
            clientId: client._id
          });
        });
      });
      
      // Sort by upload time and take last 10
      allRecentActivity.sort((a, b) => new Date(b.uploadedAt || b.created_at).getTime() - new Date(a.uploadedAt || a.created_at).getTime());
      
      setStats({
        totalClients: clientsData.length,
        totalDocuments,
        processingDocuments,
        completedDocuments,
        failedDocuments,
        recentActivity: allRecentActivity.slice(0, 10)
      });
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processing':
        return <ClockIcon className="w-5 h-5 text-blue-500" />;
      case 'completed':
        return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />;
      default:
        return <DocumentTextIcon className="w-5 h-5 text-gray-400" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('de-DE');
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
              <ChartBarIcon className="h-8 w-8 text-blue-600 mr-3" />
              <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
            </div>
            <div className="text-sm text-gray-500">
              Letzte Aktualisierung: {new Date().toLocaleTimeString('de-DE')}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <UserGroupIcon className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Mandanten
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {stats.totalClients}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <DocumentTextIcon className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Dokumente
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {stats.totalDocuments}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <ClockIcon className="h-6 w-6 text-blue-500" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      In Bearbeitung
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {stats.processingDocuments}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <CheckCircleIcon className="h-6 w-6 text-green-500" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Abgeschlossen
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {stats.completedDocuments}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <ExclamationTriangleIcon className="h-6 w-6 text-red-500" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Fehlgeschlagen
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {stats.failedDocuments}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Client List */}
        <div className="bg-white shadow rounded-lg mb-8">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              Alle Mandanten
            </h3>
            
            {clients.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                Noch keine Mandanten
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Mandant
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Aktenzeichen
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Dokumente
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Erstellt
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Aktionen
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {clients.map((client) => (
                      <tr key={client._id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {client.firstName} {client.lastName}
                            </div>
                            <div className="text-sm text-gray-500">{client.email}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {client.aktenzeichen}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            client.workflow_status === 'completed' ? 'bg-green-100 text-green-800' :
                            client.workflow_status === 'client_confirmation' ? 'bg-blue-100 text-blue-800' :
                            client.workflow_status === 'admin_review' ? 'bg-orange-100 text-orange-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {client.workflow_status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {(client.documents || []).length}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(client.created_at).toLocaleDateString('de-DE')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <a
                            href={`/admin/client/${client._id}`}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Verwalten
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Workflow Manager - Show for first client if exists */}
        {clients.length > 0 && <AdminWorkflowManager clientId={clients[0]._id} />}

        {/* Zendesk Creditor Contact Manager */}
        <AdminCreditorContactManager />

        {/* Document Viewer and Management */}
        <AdminDocumentViewer />

        {/* Admin Creditor Data Table */}
        <AdminCreditorDataTable />

        {/* Recent Activity */}
        <div className="bg-white shadow rounded-lg mt-8">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              Aktuelle Aktivitäten
            </h3>
            
            {stats.recentActivity.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                Noch keine Dokumentenaktivitäten
              </p>
            ) : (
              <div className="space-y-4">
                {stats.recentActivity.map((document: any, index: number) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(document.processing_status)}
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {document.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {document.clientName} • {formatTimestamp(document.uploadedAt || document.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                        document.processing_status === 'completed' 
                          ? 'bg-green-100 text-green-800'
                          : document.processing_status === 'processing'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {document.processing_status === 'completed' 
                          ? 'Abgeschlossen'
                          : document.processing_status === 'processing'
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
      </main>
    </div>
  );
};

export default AdminDashboard;