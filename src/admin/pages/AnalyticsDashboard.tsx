import React, { useState, useEffect } from 'react';
import { 
  UsersIcon, 
  DocumentTextIcon, 
  ChartBarIcon,
  FunnelIcon,
  CalendarIcon,
  MagnifyingGlassIcon,
  EyeIcon,
  ClockIcon,
  ArrowUturnLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import api from '../../config/api';
import UserDetailView from '../components/UserDetailView';
import { useGetClientsQuery, useGetDashboardStatsQuery, AdminUser } from '../../store/features/adminApi';

interface AnalyticsDashboardProps {
  onNavigateToUserList?: () => void;
}

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ onNavigateToUserList }) => {
  // Local State
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [dateRange, setDateRange] = useState<{start: string, end: string}>({
    start: '',
    end: ''
  });

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, dateRange]);

  // Data Queries
  // Fetch Stats (Global counts, now filtered!)
  const { data: statsData, isLoading: statsLoading, refetch: refetchStats } = useGetDashboardStatsQuery({
    search: debouncedSearch,
    status: statusFilter,
    dateFrom: dateRange.start,
    dateTo: dateRange.end
  });
  
  // Fetch List (Paginated)
  const { data: usersData, isLoading: usersLoading, isFetching: usersFetching, refetch: refetchUsers } = useGetClientsQuery({
    page,
    limit,
    search: debouncedSearch,
    status: statusFilter,
    dateFrom: dateRange.start,
    dateTo: dateRange.end
  });

  const users = usersData?.clients || [];
  const totalUsersInList = usersData?.pagination?.total || 0;
  const totalPages = usersData?.pagination?.totalPages || 1;

  // Status options
  const statusOptions = [
    { value: 'all', label: 'Alle Status' },
    { value: 'needs_attention', label: '🚨 Benötigt Aufmerksamkeit' },
    { value: 'waiting_for_payment', label: '💰 Warte auf erste Rate' },
    { value: 'document_upload', label: '📄 Warte auf Dokumente' },
    { value: 'processing', label: '⏳ AI verarbeitet' },
    { value: 'manual_review', label: '🔍 Manuelle Prüfung' },
    { value: 'completed', label: 'Abgeschlossen' }
  ];

  const resetPaymentStatus = async (userId: string, aktenzeichen: string) => {
    if (!window.confirm(`Möchten Sie den Zahlungsstatus für ${aktenzeichen} zurücksetzen? Dies setzt den Client auf "waiting_for_payment" zurück.`)) {
      return;
    }

    try {
      const response = await api.post(`/api/admin/clients/${userId}/reset-payment`);
      
      if (response.data.success) {
        alert(`✅ Zahlungsstatus für ${aktenzeichen} erfolgreich zurückgesetzt!`);
        refetchUsers();
        refetchStats();
      } else {
        alert('❌ Fehler beim Zurücksetzen des Status');
      }
    } catch (error: any) {
      console.error('Error resetting payment status:', error);
      alert(error.response?.data?.message || 'Fehler beim Zurücksetzen des Status');
    }
  };

  const getStatusBadgeColor = (status: string, needsAttention?: boolean) => {
    if (needsAttention) return 'bg-red-100 text-red-800 border border-red-300';
    
    // Simplified mapping for brevity, extend as needed
    if (status.includes('payment') || status === 'waiting_for_payment') return 'bg-orange-100 text-orange-800';
    if (status === 'completed' || status === 'payment_confirmed') return 'bg-green-100 text-green-800';
    if (status === 'processing') return 'bg-blue-100 text-blue-800';
    
    return 'bg-gray-100 text-gray-800';
  };

  const handleRefresh = () => {
    refetchStats();
    refetchUsers();
  };

  // Only show loading if stats are missing, otherwise show stale data while fetching (better UX)
  if (statsLoading && !statsData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-800" style={{borderBottomColor: '#9f1a1d'}}></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📊 Analytics Dashboard</h1>
          <p className="text-gray-600 mt-1">Enhanced Payment & Document Monitoring - Real-time Status</p>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={handleRefresh}
            className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md border hover:bg-red-50 transition-colors"
            style={{color: '#9f1a1d', borderColor: '#9f1a1d'}}
            title="Daten aktualisieren"
          >
            <svg className={`w-4 h-4 mr-1 ${usersFetching ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <div className="text-sm text-gray-500">
             <span>Gesamt: {statsData?.total_users || 0} Nutzer</span>
          </div>
        </div>
      </div>

      {/* Enhanced Stats with Payment Data (From new API) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div 
          className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 cursor-pointer hover:shadow-md transition-shadow duration-200"
          onClick={onNavigateToUserList}
        >
          <div className="flex items-center">
            <UsersIcon className="h-6 w-6 mr-3 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-600">Total Clients</p>
              <p className="text-2xl font-bold text-gray-900">{statsData?.total_users || 0}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <svg className="h-6 w-6 mr-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-gray-600">Payment Confirmed</p>
              <p className="text-2xl font-bold text-gray-900">{statsData?.payment_confirmed || 0}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <ClockIcon className="h-6 w-6 mr-3 text-blue-400" />
            <div>
              <p className="text-sm font-medium text-gray-600">Processing</p>
              <p className="text-2xl font-bold text-gray-900">{statsData?.processing || 0}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <svg className="h-6 w-6 mr-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-gray-600">Needs Attention</p>
              <p className="text-2xl font-bold text-gray-900">{statsData?.needs_attention || 0}</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Secondary Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <DocumentTextIcon className="h-5 w-5 mr-2 text-gray-400" />
            <div>
              <p className="text-xs font-medium text-gray-500">Dokumente</p>
              <p className="text-lg font-semibold text-gray-900">{statsData?.total_documents || 0}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <ChartBarIcon className="h-5 w-5 mr-2 text-gray-400" />
            <div>
              <p className="text-xs font-medium text-gray-500">Gläubiger</p>
              <p className="text-lg font-semibold text-gray-900">{statsData?.total_creditors || 0}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <svg className="h-5 w-5 mr-2 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div>
              <p className="text-xs font-medium text-gray-500">Awaiting Docs</p>
              <p className="text-lg font-semibold text-gray-900">{statsData?.awaiting_documents || 0}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <UsersIcon className="h-5 w-5 mr-2 text-gray-400" />
            <div>
              <p className="text-xs font-medium text-gray-500">Active Users</p>
              <p className="text-lg font-semibold text-gray-900">{statsData?.active_users || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <FunnelIcon className="w-4 h-4 inline mr-1" />
              Status Filter
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              {statusOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <MagnifyingGlassIcon className="w-4 h-4 inline mr-1" />
              Suche
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Name, E-Mail oder Aktenzeichen..."
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          
          {/* Date Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <CalendarIcon className="w-4 h-4 inline mr-1" />
              Erstellungsdatum
            </label>
            <div className="flex space-x-2">
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* User List Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Nutzer-Liste ({totalUsersInList} gefunden)
          </h3>
        </div>
        
        <div className="overflow-x-auto">
          {usersLoading && !usersData ? (
             // Only show 'Loading...' text if initial load, otherwise show stale table with spinner on button
            <div className="p-8 text-center text-gray-500">Lade Daten...</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dokumente</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Review</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Aktionen</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{user.firstName} {user.lastName}</div>
                          <div className="text-sm text-gray-500">{user.aktenzeichen} • {user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(user.workflow_status)}`}>
                        {user.workflow_status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.documents_count} Docs / {user.creditors_count} Gläubiger
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.admin_approved ? '✅ Genehmigt' : '⏳ Ausstehend'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex space-x-2 justify-end">
                        <button
                          onClick={() => setSelectedUserId(user.aktenzeichen)}
                          className="text-red-700 hover:text-red-900"
                        >
                          Details
                        </button>
                        {user.first_payment_received && (
                          <button
                           onClick={() => resetPaymentStatus(user.id, user.aktenzeichen)}
                           className="text-orange-600 hover:text-orange-900"
                           title="Reset Status"
                          >
                           <ArrowUturnLeftIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        
        {/* Pagination Controls */}
        {totalUsersInList > 0 && (
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <div className="flex-1 flex justify-between sm:hidden">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className={`relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 ${page === 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        Zurück
                    </button>
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className={`relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 ${page === totalPages ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        Weiter
                    </button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                    <div>
                        <p className="text-sm text-gray-700">
                            Seite <span className="font-medium">{page}</span> von <span className="font-medium">{totalPages}</span>
                        </p>
                    </div>
                    <div>
                        <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 ${page === 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                <span className="sr-only">Zurück</span>
                                <ChevronLeftIcon className="h-5 w-5" aria-hidden="true" />
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 ${page === totalPages ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                <span className="sr-only">Weiter</span>
                                <ChevronRightIcon className="h-5 w-5" aria-hidden="true" />
                            </button>
                        </nav>
                    </div>
                </div>
            </div>
        )}
      </div>

      {/* User Detail Modal */}
      {selectedUserId && (
        <UserDetailView
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
        />
      )}
    </div>
  );
};

export default AnalyticsDashboard;