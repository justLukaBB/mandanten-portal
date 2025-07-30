import React, { useState, useEffect } from 'react';
import { 
  UsersIcon, 
  DocumentTextIcon, 
  ChartBarIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  EyeIcon
} from '@heroicons/react/24/outline';
import api from '../../config/api';

interface ClientStatus {
  id: string;
  aktenzeichen: string;
  name: string;
  email: string;
  created_at: string;
  updated_at: string;
  
  // Enhanced status info
  payment: string;
  documents: string;
  processing: string;
  review: string;
  overall_status: string;
  
  // Raw data
  first_payment_received: boolean;
  payment_ticket_type?: string;
  current_status: string;
  documents_count: number;
  creditors_count: number;
  
  // Timestamps
  payment_processed_at?: string;
  document_request_sent_at?: string;
  all_documents_processed_at?: string;
  
  // Actions
  needs_attention: boolean;
  next_action: string;
}

interface DashboardStats {
  total_clients: number;
  payment_confirmed: number;
  awaiting_documents: number;
  processing: number;
  manual_review_needed: number;
  auto_approved: number;
  no_creditors: number;
  needs_attention: number;
}

interface DashboardData {
  success: boolean;
  clients: ClientStatus[];
  statistics: DashboardStats;
  timestamp: string;
}

const EnhancedDashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientStatus | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch dashboard data
  const fetchData = async () => {
    try {
      setError(null);
      const response = await api.get('/dashboard-status');
      
      if (response.data.success) {
        setData(response.data);
      } else {
        setError('Failed to load dashboard data');
      }
    } catch (err: any) {
      console.error('Dashboard fetch error:', err);
      setError(err.response?.data?.error || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  // Initial load and auto-refresh
  useEffect(() => {
    fetchData();
    
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(fetchData, 30000); // Refresh every 30 seconds
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  // Filter clients
  const filteredClients = data?.clients?.filter(client => {
    const matchesSearch = 
      client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.aktenzeichen.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = 
      statusFilter === 'all' ||
      statusFilter === client.overall_status ||
      (statusFilter === 'needs_attention' && client.needs_attention);
    
    return matchesSearch && matchesStatus;
  }) || [];

  // Status badge component
  const StatusBadge: React.FC<{ status: string; className?: string }> = ({ status, className = '' }) => {
    const getStatusColor = (status: string) => {
      switch (status) {
        case 'awaiting_payment': return 'bg-red-100 text-red-800';
        case 'awaiting_documents': return 'bg-yellow-100 text-yellow-800';
        case 'processing': return 'bg-blue-100 text-blue-800';
        case 'manual_review': return 'bg-orange-100 text-orange-800';
        case 'ready_for_confirmation': return 'bg-green-100 text-green-800';
        case 'problem': return 'bg-red-100 text-red-800';
        default: return 'bg-gray-100 text-gray-800';
      }
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(status)} ${className}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-800"></div>
        <span className="ml-2">Dashboard wird geladen...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex">
          <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Fehler beim Laden</h3>
            <p className="mt-1 text-sm text-red-700">{error}</p>
            <button 
              onClick={fetchData}
              className="mt-2 bg-red-800 text-white px-3 py-1 rounded text-sm hover:bg-red-900"
            >
              Erneut versuchen
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Enhanced Dashboard</h2>
          <p className="text-sm text-gray-600">
            Letzte Aktualisierung: {new Date(data.timestamp).toLocaleString('de-DE')}
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <span className="ml-2 text-sm text-gray-700">Auto-Refresh</span>
          </label>
          
          <button
            onClick={fetchData}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            <ArrowPathIcon className="h-4 w-4 mr-1" />
            Aktualisieren
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <UsersIcon className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Clients</dt>
                  <dd className="text-lg font-medium text-gray-900">{data.statistics.total_clients}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircleIcon className="h-6 w-6 text-green-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Payment Confirmed</dt>
                  <dd className="text-lg font-medium text-gray-900">{data.statistics.payment_confirmed}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ClockIcon className="h-6 w-6 text-blue-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Processing</dt>
                  <dd className="text-lg font-medium text-gray-900">{data.statistics.processing}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ExclamationTriangleIcon className="h-6 w-6 text-red-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Needs Attention</dt>
                  <dd className="text-lg font-medium text-gray-900">{data.statistics.needs_attention}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Suche nach Name, Aktenzeichen oder E-Mail..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="focus:ring-red-500 focus:border-red-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md"
              />
            </div>
          </div>
          
          <div className="sm:w-48">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm rounded-md"
            >
              <option value="all">Alle Status ({data.statistics.total_clients})</option>
              <option value="needs_attention">Benötigt Aufmerksamkeit ({data.statistics.needs_attention})</option>
              <option value="awaiting_payment">Warte auf Zahlung</option>
              <option value="awaiting_documents">Warte auf Dokumente ({data.statistics.awaiting_documents})</option>
              <option value="processing">Verarbeitung ({data.statistics.processing})</option>
              <option value="manual_review">Manuelle Prüfung ({data.statistics.manual_review_needed})</option>
              <option value="ready_for_confirmation">Bereit zur Bestätigung ({data.statistics.auto_approved})</option>
              <option value="problem">Probleme ({data.statistics.no_creditors})</option>
            </select>
          </div>
        </div>
      </div>

      {/* Client List */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Clients ({filteredClients.length})
          </h3>
          
          {filteredClients.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">Keine Clients gefunden.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Client
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Payment
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Documents
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Processing
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Review Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Next Action
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredClients.map((client) => (
                    <tr key={client.id} className={client.needs_attention ? 'bg-red-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {client.name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {client.aktenzeichen} • {client.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {client.payment}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {client.documents}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {client.processing}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={client.overall_status} />
                        <div className="text-xs text-gray-500 mt-1">
                          {client.review}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className={client.needs_attention ? 'text-red-600 font-medium' : ''}>
                          {client.next_action}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => setSelectedClient(client)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <EyeIcon className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Client Detail Modal */}
      {selectedClient && (
        <ClientDetailModal 
          client={selectedClient} 
          onClose={() => setSelectedClient(null)}
        />
      )}
    </div>
  );
};

// Client Detail Modal Component
const ClientDetailModal: React.FC<{ client: ClientStatus; onClose: () => void }> = ({ client, onClose }) => {
  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900">Client Details</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <span className="sr-only">Close</span>
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <p className="mt-1 text-sm text-gray-900">{client.name}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Aktenzeichen</label>
              <p className="mt-1 text-sm text-gray-900">{client.aktenzeichen}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">E-Mail</label>
              <p className="mt-1 text-sm text-gray-900">{client.email}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Status</label>
              <p className="mt-1 text-sm text-gray-900">{client.overall_status}</p>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Payment</label>
              <p className="mt-1 text-sm text-gray-900">{client.payment}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Documents</label>
              <p className="mt-1 text-sm text-gray-900">{client.documents}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Processing</label>
              <p className="mt-1 text-sm text-gray-900">{client.processing}</p>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Next Action</label>
            <p className="mt-1 text-sm text-gray-900">{client.next_action}</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-xs text-gray-500">
            <div>
              <label className="block font-medium">Created</label>
              <p>{new Date(client.created_at).toLocaleString('de-DE')}</p>
            </div>
            <div>
              <label className="block font-medium">Updated</label>
              <p>{new Date(client.updated_at).toLocaleString('de-DE')}</p>
            </div>
          </div>
        </div>
        
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default EnhancedDashboard;