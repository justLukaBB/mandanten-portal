import React, { useState, useEffect } from 'react';
import { 
  UsersIcon, 
  DocumentTextIcon, 
  ChartBarIcon,
  FunnelIcon,
  CalendarIcon,
  MagnifyingGlassIcon,
  EyeIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import api from '../../config/api';
import UserDetailView from '../components/UserDetailView';

interface User {
  id: string;
  aktenzeichen: string;
  firstName: string;
  lastName: string;
  email: string;
  current_status: string;
  created_at: string;
  updated_at: string;
  last_login?: string;
  documents_count: number;
  creditors_count: number;
  zendesk_ticket_id?: string;
  
  // Enhanced payment status fields
  payment: string;
  documents: string;
  processing: string;
  review: string;
  overall_status: string;
  first_payment_received?: boolean;
  payment_ticket_type?: string;
  needs_attention?: boolean;
  next_action?: string;
  payment_processed_at?: string;
  document_request_sent_at?: string;
  all_documents_processed_at?: string;
}

interface StatusFilter {
  value: string;
  label: string;
  count: number;
}

interface PaymentStats {
  total_clients: number;
  payment_confirmed: number;
  awaiting_documents: number;
  processing: number;
  manual_review_needed: number;
  auto_approved: number;
  no_creditors: number;
  needs_attention: number;
}

interface AnalyticsDashboardProps {
  onNavigateToUserList?: () => void;
}

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ onNavigateToUserList }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [paymentStats, setPaymentStats] = useState<PaymentStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateRange, setDateRange] = useState<{start: string, end: string}>({
    start: '',
    end: ''
  });

  // Status options - updated with payment workflow statuses
  const statusOptions: StatusFilter[] = [
    { value: 'all', label: 'Alle Status', count: 0 },
    { value: 'needs_attention', label: '🚨 Benötigt Aufmerksamkeit', count: 0 },
    { value: 'awaiting_payment', label: '💰 Warte auf erste Rate', count: 0 },
    { value: 'document_request', label: '📄 Warte auf Dokumente', count: 0 },
    { value: 'processing_wait', label: '⏳ AI verarbeitet', count: 0 },
    { value: 'manual_review', label: '🔍 Manuelle Prüfung', count: 0 },
    { value: 'auto_approved', label: '✅ Bereit zur Bestätigung', count: 0 },
    { value: 'creditor_contact_initiated', label: '📧 Gläubiger kontaktiert', count: 0 },
    { value: 'creditor_contact_failed', label: '❌ Gläubiger-Kontakt fehlgeschlagen', count: 0 },
    { value: 'no_creditors_found', label: '⚠️ Keine Gläubiger gefunden', count: 0 },
    { value: 'created', label: 'Erstellt', count: 0 },
    { value: 'portal_access_sent', label: 'Portal-Zugang gesendet', count: 0 },
    { value: 'documents_uploaded', label: 'Dokumente hochgeladen', count: 0 },
    { value: 'completed', label: 'Abgeschlossen', count: 0 }
  ];

  useEffect(() => {
    fetchUsers();
    
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(fetchUsers, 30000); // Refresh every 30 seconds
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  useEffect(() => {
    applyFilters();
  }, [users, statusFilter, searchQuery, dateRange]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Use enhanced dashboard endpoint for payment status data
      const response = await api.get('/admin/dashboard-status');
      
      if (!response.data.success) {
        throw new Error('Failed to fetch dashboard data');
      }
      
      const clientsData = response.data.clients || [];
      setPaymentStats(response.data.statistics);
      
      // Transform client data for enhanced analytics view
      const transformedUsers: User[] = clientsData.map((client: any) => ({
        id: client.id || client._id,
        aktenzeichen: client.aktenzeichen,
        firstName: client.name?.split(' ')[0] || '',
        lastName: client.name?.split(' ').slice(1).join(' ') || '',
        email: client.email,
        current_status: client.current_status || 'created',
        created_at: client.created_at || new Date().toISOString(),
        updated_at: client.updated_at || new Date().toISOString(),
        last_login: client.last_login,
        documents_count: client.documents_count || 0,
        creditors_count: client.creditors_count || 0,
        zendesk_ticket_id: client.zendesk_ticket_id,
        
        // Enhanced payment status fields
        payment: client.payment || '❌ Ausstehend',
        documents: client.documents || '0 Dokumente',
        processing: client.processing || 'Unbekannt',
        review: client.review || 'Ausstehend',
        overall_status: client.overall_status || 'created',
        first_payment_received: client.first_payment_received || false,
        payment_ticket_type: client.payment_ticket_type,
        needs_attention: client.needs_attention || false,
        next_action: client.next_action || 'Warten auf erste Rate',
        payment_processed_at: client.payment_processed_at,
        document_request_sent_at: client.document_request_sent_at,
        all_documents_processed_at: client.all_documents_processed_at
      }));
      
      setUsers(transformedUsers);
      console.log(`📊 Loaded ${transformedUsers.length} users for analytics dashboard`);
      
    } catch (err: any) {
      console.error('Error fetching dashboard data:', err);
      setError(err.response?.data?.error || 'Failed to load dashboard data');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...users];
    
    // Status filter - handle both old and new payment statuses
    if (statusFilter !== 'all') {
      if (statusFilter === 'needs_attention') {
        filtered = filtered.filter(user => user.needs_attention);
      } else if (['document_request', 'processing_wait', 'manual_review', 'auto_approved', 'no_creditors_found'].includes(statusFilter)) {
        filtered = filtered.filter(user => user.payment_ticket_type === statusFilter);
      } else if (statusFilter === 'awaiting_payment') {
        filtered = filtered.filter(user => !user.first_payment_received);
      } else if (['creditor_contact_initiated', 'creditor_contact_failed'].includes(statusFilter)) {
        filtered = filtered.filter(user => user.current_status === statusFilter);
      } else {
        filtered = filtered.filter(user => user.current_status === statusFilter || user.overall_status === statusFilter);
      }
    }
    
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(user => 
        user.firstName.toLowerCase().includes(query) ||
        user.lastName.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        user.aktenzeichen.toLowerCase().includes(query)
      );
    }
    
    // Date range filter
    if (dateRange.start && dateRange.end) {
      const startDate = new Date(dateRange.start);
      const endDate = new Date(dateRange.end);
      filtered = filtered.filter(user => {
        const userDate = new Date(user.created_at);
        return userDate >= startDate && userDate <= endDate;
      });
    }
    
    setFilteredUsers(filtered);
  };

  const getStatusBadgeColor = (status: string, needsAttention?: boolean) => {
    if (needsAttention) {
      return 'bg-red-100 text-red-800 border border-red-300';
    }
    
    const colors: Record<string, string> = {
      'awaiting_payment': 'bg-red-100 text-red-800',
      'awaiting_documents': 'bg-yellow-100 text-yellow-800',
      'processing': 'bg-blue-100 text-blue-800',
      'manual_review': 'bg-orange-100 text-orange-800',
      'ready_for_confirmation': 'bg-green-100 text-green-800',
      'problem': 'bg-red-100 text-red-800',
      'creditor_contact_initiated': 'bg-purple-100 text-purple-800',
      'creditor_contact_failed': 'bg-red-200 text-red-900',
      'created': 'bg-gray-100 text-gray-800',
      'portal_access_sent': 'bg-indigo-100 text-indigo-800',
      'documents_uploaded': 'bg-purple-100 text-purple-800',
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

  const getStatusLabel = (status: string, user?: User) => {
    if (user?.needs_attention) {
      return `🚨 ${user.next_action || status}`;
    }
    
    // Map overall_status to readable labels
    const statusLabels: Record<string, string> = {
      'awaiting_payment': '💰 Warte auf erste Rate',
      'awaiting_documents': '📄 Warte auf Dokumente',
      'processing': '⏳ AI verarbeitet',
      'manual_review': '🔍 Manuelle Prüfung',
      'ready_for_confirmation': '✅ Bereit zur Bestätigung',
      'problem': '⚠️ Problem',
      'creditor_contact_initiated': '📧 Gläubiger kontaktiert',
      'creditor_contact_failed': '❌ Gläubiger-Kontakt fehlgeschlagen',
      'payment_confirmed': '✅ Zahlung bestätigt',
      'created': 'Erstellt',
      'portal_access_sent': 'Portal-Zugang gesendet',
      'documents_uploaded': 'Dokumente hochgeladen',
      'completed': 'Abgeschlossen'
    };
    
    return statusLabels[status] || status;
  };

  const getStatusCounts = () => {
    const counts: Record<string, number> = {
      'all': users.length,
      'needs_attention': users.filter(u => u.needs_attention).length,
      'awaiting_payment': users.filter(u => !u.first_payment_received).length,
      'document_request': users.filter(u => u.payment_ticket_type === 'document_request').length,
      'processing_wait': users.filter(u => u.payment_ticket_type === 'processing_wait').length,
      'manual_review': users.filter(u => u.payment_ticket_type === 'manual_review').length,
      'auto_approved': users.filter(u => u.payment_ticket_type === 'auto_approved').length,
      'no_creditors_found': users.filter(u => u.payment_ticket_type === 'no_creditors_found').length,
      'creditor_contact_initiated': users.filter(u => u.current_status === 'creditor_contact_initiated').length,
      'creditor_contact_failed': users.filter(u => u.current_status === 'creditor_contact_failed').length
    };
    
    // Add legacy status counts
    users.forEach(user => {
      counts[user.current_status] = (counts[user.current_status] || 0) + 1;
      if (user.overall_status) {
        counts[user.overall_status] = (counts[user.overall_status] || 0) + 1;
      }
    });
    
    return counts;
  };

  const statusCounts = getStatusCounts();
  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.last_login).length;
  const totalDocuments = users.reduce((sum, u) => sum + u.documents_count, 0);
  const totalCreditors = users.reduce((sum, u) => sum + u.creditors_count, 0);
  
  // Payment-specific statistics
  const paymentConfirmed = users.filter(u => u.first_payment_received).length;
  const needsAttention = users.filter(u => u.needs_attention).length;
  const processing = users.filter(u => u.payment_ticket_type === 'processing_wait').length;
  const awaitingDocuments = users.filter(u => u.payment_ticket_type === 'document_request').length;

  if (loading) {
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
          {error && (
            <div className="mt-2 text-sm text-red-600 bg-red-50 px-3 py-1 rounded">
              {error}
            </div>
          )}
        </div>
        <div className="flex items-center space-x-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <span className="ml-2 text-sm text-gray-700">Auto-Refresh (30s)</span>
          </label>
          
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md border hover:bg-red-50 transition-colors"
            style={{color: '#9f1a1d', borderColor: '#9f1a1d'}}
            title="Daten aktualisieren"
          >
            <svg className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <div className="text-sm text-gray-500">
            <span>Letztes Update:</span>
            <span className="ml-1">{new Date().toLocaleTimeString('de-DE')}</span>
          </div>
        </div>
      </div>

      {/* Enhanced Stats with Payment Data */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div 
          className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 cursor-pointer hover:shadow-md transition-shadow duration-200"
          onClick={onNavigateToUserList}
        >
          <div className="flex items-center">
            <UsersIcon className="h-6 w-6 mr-3 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-600">Total Clients</p>
              <p className="text-2xl font-bold text-gray-900">{totalUsers}</p>
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
              <p className="text-2xl font-bold text-gray-900">{paymentConfirmed}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <ClockIcon className="h-6 w-6 mr-3 text-blue-400" />
            <div>
              <p className="text-sm font-medium text-gray-600">Processing</p>
              <p className="text-2xl font-bold text-gray-900">{processing}</p>
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
              <p className="text-2xl font-bold text-gray-900">{needsAttention}</p>
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
              <p className="text-lg font-semibold text-gray-900">{totalDocuments}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <ChartBarIcon className="h-5 w-5 mr-2 text-gray-400" />
            <div>
              <p className="text-xs font-medium text-gray-500">Gläubiger</p>
              <p className="text-lg font-semibold text-gray-900">{totalCreditors}</p>
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
              <p className="text-lg font-semibold text-gray-900">{awaitingDocuments}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <UsersIcon className="h-5 w-5 mr-2 text-gray-400" />
            <div>
              <p className="text-xs font-medium text-gray-500">Active Users</p>
              <p className="text-lg font-semibold text-gray-900">{activeUsers}</p>
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
                  {option.label} ({statusCounts[option.value] || 0})
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
            Nutzer-Liste ({filteredUsers.length} von {totalUsers})
          </h3>
        </div>
        
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
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.map((user) => (
                <tr key={user.id} className={`hover:bg-gray-50 ${user.needs_attention ? 'bg-red-50' : ''}`}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {user.firstName} {user.lastName}
                        </div>
                        <div className="text-sm text-gray-500">
                          {user.aktenzeichen} • {user.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{user.payment}</div>
                    {user.payment_processed_at && (
                      <div className="text-xs text-gray-500">
                        {new Date(user.payment_processed_at).toLocaleDateString('de-DE')}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{user.documents}</div>
                    {user.documents_count > 0 && (
                      <div className="text-xs text-gray-500">
                        {user.creditors_count} Gläubiger
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{user.processing}</div>
                    {user.all_documents_processed_at && (
                      <div className="text-xs text-gray-500">
                        Abgeschlossen: {new Date(user.all_documents_processed_at).toLocaleDateString('de-DE')}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(user.overall_status || user.current_status, user.needs_attention)}`}>
                      {getStatusLabel(user.overall_status || user.current_status, user)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{user.next_action}</div>
                    {user.document_request_sent_at && (
                      <div className="text-xs text-gray-500">
                        Angefordert: {new Date(user.document_request_sent_at).toLocaleDateString('de-DE')}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => setSelectedUserId(user.aktenzeichen)}
                      className="inline-flex items-center hover:opacity-80"
                      style={{color: '#9f1a1d'}}
                    >
                      <EyeIcon className="w-4 h-4 mr-1" />
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {filteredUsers.length === 0 && (
          <div className="text-center py-8">
            <UsersIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Keine Nutzer gefunden.</p>
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