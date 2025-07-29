import React, { useState, useEffect } from 'react';
import {
  DocumentTextIcon,
  UserGroupIcon,
  CurrencyEuroIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowRightIcon,
  ChartBarIcon,
  PlayIcon,
  PauseIcon
} from '@heroicons/react/24/outline';
import api from '../../config/api';

// Sub-components
import Phase1Dashboard from './phases/Phase1Dashboard';
import Phase2Dashboard from './phases/Phase2Dashboard';
import WorkflowProgress from './WorkflowProgress';

interface ClientStatus {
  id: string;
  firstName: string;
  lastName: string;
  phase: number;
  workflow_status: string;
  stats: {
    total_documents: number;
    creditor_documents: number;
    needs_manual_review: number;
    final_creditor_count: number;
  };
  totalDebt?: number;
  garnishableIncome?: number;
}

interface DashboardStats {
  totalClients: number;
  phase1Clients: number;
  phase2Clients: number;
  completedClients: number;
  totalDebt: number;
  avgProcessingTime: number;
}

type ViewMode = 'overview' | 'phase1' | 'phase2' | 'analytics';

const HybridDashboard: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewMode>('overview');
  const [clients, setClients] = useState<ClientStatus[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalClients: 0,
    phase1Clients: 0,
    phase2Clients: 0,
    completedClients: 0,
    totalDebt: 0,
    avgProcessingTime: 0
  });
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<string>('12345'); // Default demo client

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Fetch demo client data (in real app, this would be a proper admin endpoint)
      const clientResponse = await api.get(`/clients/${selectedClient}`);
      const client = clientResponse.data;
      
      const clientStatus: ClientStatus = {
        id: client.id,
        firstName: client.firstName,
        lastName: client.lastName,
        phase: client.phase,
        workflow_status: client.workflow_status,
        stats: {
          total_documents: client.documents?.length || 0,
          creditor_documents: client.final_creditor_list?.length || 0,
          needs_manual_review: client.documents?.filter((doc: any) => doc.processing_status === 'needs_review')?.length || 0,
          final_creditor_count: client.final_creditor_list?.length || 0
        }
      };

      // Try to get debt and garnishment data
      try {
        const debtResponse = await api.get(`/clients/${selectedClient}/total-debt`);
        clientStatus.totalDebt = debtResponse.data.totalDebt;
      } catch (error) {
        // Debt data not yet available - this is expected for new clients
      }

      setClients([clientStatus]);
      
      // Calculate aggregated stats
      setStats({
        totalClients: 1,
        phase1Clients: client.phase === 1 ? 1 : 0,
        phase2Clients: client.phase === 2 ? 1 : 0,
        completedClients: client.workflow_status === 'completed' ? 1 : 0,
        totalDebt: clientStatus.totalDebt || 0,
        avgProcessingTime: 14 // Mock average processing time in days
      });

      setLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setLoading(false);
    }
  };

  const getWorkflowStatusColor = (status: string) => {
    const statusMap: Record<string, { color: string; bg: string; text: string; icon: any }> = {
      'documents_processing': { 
        color: 'text-red-800', 
        bg: 'bg-blue-100', 
        text: 'Dokumente werden verarbeitet',
        icon: ClockIcon
      },
      'admin_review': { 
        color: 'text-yellow-600', 
        bg: 'bg-yellow-100', 
        text: 'Admin-Prüfung erforderlich',
        icon: ExclamationTriangleIcon
      },
      'client_confirmation': { 
        color: 'text-purple-600', 
        bg: 'bg-purple-100', 
        text: 'Mandanten-Bestätigung',
        icon: UserGroupIcon
      },
      'creditor_contact_ready': { 
        color: 'text-orange-600', 
        bg: 'bg-orange-100', 
        text: 'Zendesk-Kontakt bereit',
        icon: PlayIcon
      },
      'creditor_contact_in_progress': { 
        color: 'text-indigo-600', 
        bg: 'bg-indigo-100', 
        text: 'Gläubiger-Kontakt läuft',
        icon: ClockIcon
      },
      'creditor_contact_completed': { 
        color: 'text-green-600', 
        bg: 'bg-green-100', 
        text: 'Phase 2 bereit',
        icon: CheckCircleIcon
      },
      'completed': { 
        color: 'text-emerald-600', 
        bg: 'bg-emerald-100', 
        text: 'Abgeschlossen',
        icon: CheckCircleIcon
      }
    };
    return statusMap[status] || statusMap['documents_processing'];
  };

  const getNextAction = (client: ClientStatus) => {
    switch (client.workflow_status) {
      case 'documents_processing':
        return { text: 'Dokumente prüfen', action: () => setCurrentView('phase1') };
      case 'admin_review':
        return { text: 'Admin-Freigabe', action: () => setCurrentView('phase1') };
      case 'client_confirmation':
        return { text: 'Bestätigung verfolgen', action: () => setCurrentView('phase1') };
      case 'creditor_contact_ready':
        return { text: 'Zendesk-Tickets erstellen', action: () => setCurrentView('phase1') };
      case 'creditor_contact_in_progress':
        return { text: 'Antworten überwachen', action: () => setCurrentView('phase1') };
      case 'creditor_contact_completed':
        return { text: 'Pfändung berechnen', action: () => setCurrentView('phase2') };
      default:
        return { text: 'Details anzeigen', action: () => setCurrentView('overview') };
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const renderOverview = () => (
    <div className="space-y-6">
      {/* Quick Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white overflow-hidden shadow rounded-lg border-l-4 border-blue-500">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <UserGroupIcon className="h-6 w-6 text-red-800" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Aktive Mandanten
                  </dt>
                  <dd className="text-2xl font-bold text-gray-900">
                    {stats.totalClients}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg border-l-4 border-green-500">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <DocumentTextIcon className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Phase 1 (Analyse)
                  </dt>
                  <dd className="text-2xl font-bold text-gray-900">
                    {stats.phase1Clients}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg border-l-4 border-purple-500">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CurrencyEuroIcon className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Phase 2 (Pfändung)
                  </dt>
                  <dd className="text-2xl font-bold text-gray-900">
                    {stats.phase2Clients}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg border-l-4 border-emerald-500">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircleIcon className="h-6 w-6 text-emerald-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Gesamtschulden
                  </dt>
                  <dd className="text-2xl font-bold text-gray-900">
                    {formatCurrency(stats.totalDebt)}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Clients Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {clients.map((client) => {
          const statusConfig = getWorkflowStatusColor(client.workflow_status);
          const nextAction = getNextAction(client);
          const IconComponent = statusConfig.icon;

          return (
            <div key={client.id} className="bg-white shadow-lg rounded-lg border border-gray-200 hover:shadow-xl transition-shadow">
              <div className="p-6">
                {/* Client Header */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {client.firstName} {client.lastName}
                    </h3>
                    <p className="text-sm text-gray-500">Mandant #{client.id}</p>
                  </div>
                  <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusConfig.bg} ${statusConfig.color}`}>
                    <IconComponent className="w-4 h-4 mr-1" />
                    Phase {client.phase}
                  </div>
                </div>

                {/* Workflow Progress */}
                <WorkflowProgress 
                  currentStatus={client.workflow_status}
                  phase={client.phase}
                  compact={true}
                />

                {/* Current Status */}
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center">
                    <IconComponent className={`w-5 h-5 mr-2 ${statusConfig.color}`} />
                    <span className="text-sm font-medium text-gray-900">
                      {statusConfig.text}
                    </span>
                  </div>
                </div>

                {/* Key Stats */}
                <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Dokumente:</span>
                    <span className="ml-2 font-medium">{client.stats.total_documents}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Gläubiger:</span>
                    <span className="ml-2 font-medium">{client.stats.creditor_documents}</span>
                  </div>
                  {client.totalDebt && (
                    <div className="col-span-2">
                      <span className="text-gray-500">Gesamtschuld:</span>
                      <span className="ml-2 font-medium text-red-600">{formatCurrency(client.totalDebt)}</span>
                    </div>
                  )}
                </div>

                {/* Action Button */}
                <div className="mt-6">
                  <button
                    onClick={nextAction.action}
                    className="w-full flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-800 hover:bg-red-900 transition-colors"
                  >
                    {nextAction.text}
                    <ArrowRightIcon className="ml-2 w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with Navigation Tabs */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <ChartBarIcon className="h-8 w-8 text-red-800 mr-3" />
              <h1 className="text-2xl font-bold text-gray-900">Hybrid Dashboard</h1>
            </div>
            <div className="text-sm text-gray-500">
              Letzte Aktualisierung: {new Date().toLocaleTimeString('de-DE')}
            </div>
          </div>
          
          {/* Navigation Tabs */}
          <div className="flex space-x-8 border-b border-gray-200">
            {[
              { key: 'overview', label: 'Übersicht', icon: ChartBarIcon },
              { key: 'phase1', label: 'Phase 1: Analyse', icon: DocumentTextIcon },
              { key: 'phase2', label: 'Phase 2: Pfändung', icon: CurrencyEuroIcon },
              { key: 'analytics', label: 'Analytics', icon: ChartBarIcon }
            ].map((tab) => {
              const isActive = currentView === tab.key;
              const IconComponent = tab.icon;
              
              return (
                <button
                  key={tab.key}
                  onClick={() => setCurrentView(tab.key as ViewMode)}
                  className={`flex items-center px-1 py-4 border-b-2 font-medium text-sm transition-colors ${
                    isActive
                      ? 'border-blue-500 text-red-800'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <IconComponent className="w-5 h-5 mr-2" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {currentView === 'overview' && renderOverview()}
        {currentView === 'phase1' && <Phase1Dashboard clientId={selectedClient} />}
        {currentView === 'phase2' && <Phase2Dashboard clientId={selectedClient} />}
        {currentView === 'analytics' && (
          <div className="text-center py-12">
            <ChartBarIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Analytics Dashboard</h3>
            <p className="mt-1 text-sm text-gray-500">Detaillierte Statistiken und Berichte werden hier implementiert.</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default HybridDashboard;