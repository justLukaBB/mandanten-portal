import React, { useState, useEffect } from 'react';
import { 
  UsersIcon, 
  DocumentTextIcon, 
  ChartBarIcon,
  FunnelIcon,
  CalendarIcon,
  MagnifyingGlassIcon,
  EyeIcon
} from '@heroicons/react/24/outline';
import { API_BASE_URL } from '../../config/api';
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
}

interface StatusFilter {
  value: string;
  label: string;
  count: number;
}

const AnalyticsDashboard: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateRange, setDateRange] = useState<{start: string, end: string}>({
    start: '',
    end: ''
  });

  // Status options
  const statusOptions: StatusFilter[] = [
    { value: 'all', label: 'Alle Status', count: 0 },
    { value: 'created', label: 'Erstellt', count: 0 },
    { value: 'portal_access_sent', label: 'Portal-Zugang gesendet', count: 0 },
    { value: 'documents_uploaded', label: 'Dokumente hochgeladen', count: 0 },
    { value: 'documents_processing', label: 'Dokumente werden verarbeitet', count: 0 },
    { value: 'waiting_for_payment', label: 'Wartet auf Zahlung', count: 0 },
    { value: 'payment_confirmed', label: 'Zahlung bestätigt', count: 0 },
    { value: 'creditor_review', label: 'Gläubiger-Prüfung', count: 0 },
    { value: 'awaiting_client_confirmation', label: 'Wartet auf Client-Bestätigung', count: 0 },
    { value: 'creditor_contact_active', label: 'Gläubiger-Kontakt aktiv', count: 0 },
    { value: 'completed', label: 'Abgeschlossen', count: 0 }
  ];

  useEffect(() => {
    fetchUsers();
    const interval = setInterval(fetchUsers, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    applyFilters();
  }, [users, statusFilter, searchQuery, dateRange]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      
      // Fetch all clients from admin endpoint
      const response = await fetch(`${API_BASE_URL}/admin/clients`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }
      
      const data = await response.json();
      const clientsData = data.clients || [];
      
      // Transform client data for analytics view
      const transformedUsers: User[] = clientsData.map((client: any) => ({
        id: client.id || client._id,
        aktenzeichen: client.aktenzeichen,
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email,
        current_status: client.current_status || client.workflow_status || 'created',
        created_at: client.created_at || client.createdAt || new Date().toISOString(),
        updated_at: client.updated_at || client.updatedAt || new Date().toISOString(),
        last_login: client.last_login,
        documents_count: client.documents?.length || 0,
        creditors_count: client.final_creditor_list?.length || 0,
        zendesk_ticket_id: client.zendesk_ticket_id
      }));
      
      setUsers(transformedUsers);
      console.log(`📊 Loaded ${transformedUsers.length} users for analytics dashboard`);
      
    } catch (error) {
      console.error('Error fetching users:', error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...users];
    
    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(user => user.current_status === statusFilter);
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

  const getStatusLabel = (status: string) => {
    const option = statusOptions.find(opt => opt.value === status);
    return option?.label || status;
  };

  const getStatusCounts = () => {
    const counts: Record<string, number> = {};
    users.forEach(user => {
      counts[user.current_status] = (counts[user.current_status] || 0) + 1;
    });
    return counts;
  };

  const statusCounts = getStatusCounts();
  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.last_login).length;
  const totalDocuments = users.reduce((sum, u) => sum + u.documents_count, 0);
  const totalCreditors = users.reduce((sum, u) => sum + u.creditors_count, 0);

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
          <p className="text-gray-600 mt-1">Monitoring und Analyse - Nur zur Übersicht (Keine Aktionen)</p>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <span>Letztes Update:</span>
          <span>{new Date().toLocaleTimeString('de-DE')}</span>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <UsersIcon className="h-8 w-8 mr-3" style={{color: '#9f1a1d'}} />
            <div>
              <p className="text-sm font-medium text-gray-600">Gesamt-Nutzer</p>
              <p className="text-2xl font-bold text-gray-900">{totalUsers}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <DocumentTextIcon className="h-8 w-8 mr-3" style={{color: '#9f1a1d'}} />
            <div>
              <p className="text-sm font-medium text-gray-600">Dokumente</p>
              <p className="text-2xl font-bold text-gray-900">{totalDocuments}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <ChartBarIcon className="h-8 w-8 mr-3" style={{color: '#9f1a1d'}} />
            <div>
              <p className="text-sm font-medium text-gray-600">Gläubiger</p>
              <p className="text-2xl font-bold text-gray-900">{totalCreditors}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <UsersIcon className="h-8 w-8 mr-3" style={{color: '#9f1a1d'}} />
            <div>
              <p className="text-sm font-medium text-gray-600">Aktive Nutzer</p>
              <p className="text-2xl font-bold text-gray-900">{activeUsers}</p>
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
                  Nutzer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Dokumente
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Gläubiger
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Erstellt
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Letzte Aktivität
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {user.firstName} {user.lastName}
                      </div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                      <div className="text-xs text-gray-400">{user.aktenzeichen}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(user.current_status)}`}>
                      {getStatusLabel(user.current_status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {user.documents_count}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {user.creditors_count}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(user.created_at).toLocaleDateString('de-DE')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.last_login 
                      ? new Date(user.last_login).toLocaleDateString('de-DE')
                      : 'Nie angemeldet'
                    }
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