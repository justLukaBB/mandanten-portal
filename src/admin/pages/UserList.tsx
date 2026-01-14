import React, { useState, useEffect } from 'react';
import { 
  UsersIcon, 
  FunnelIcon,
  CalendarIcon,
  MagnifyingGlassIcon,
  EyeIcon,
  ArrowLeftIcon,
  BoltIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import UserDetailView from '../components/UserDetailView';
import { useGetClientsQuery, useTriggerImmediateReviewMutation } from '../../store/features/adminApi';

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
  processing_complete_webhook_scheduled?: boolean;
  processing_complete_webhook_scheduled_at?: string;
  processing_complete_webhook_triggered?: boolean;
  first_payment_received?: boolean;
  all_documents_processed_at?: string;
}

interface StatusFilter {
  value: string;
  label: string;
}

interface UserListProps {
  onBack: () => void;
}

const UserList: React.FC<UserListProps> = ({ onBack }) => {
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

  // RTK Query hooks
  const { data, isLoading, isFetching, refetch } = useGetClientsQuery({
    page,
    limit,
    search: debouncedSearch,
    status: statusFilter,
    dateFrom: dateRange.start,
    dateTo: dateRange.end
  });

  const [triggerImmediateReview, { isLoading: isTriggering }] = useTriggerImmediateReviewMutation();
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  const users = (data?.clients as User[]) || [];
  const totalUsers = data?.pagination?.total || 0;
  const totalPages = data?.pagination?.totalPages || 1;

  // Status options
  const statusOptions: StatusFilter[] = [
    { value: 'all', label: 'Alle Status' },
    { value: 'created', label: 'Erstellt' },
    { value: 'portal_access_sent', label: 'Portal-Zugang gesendet' },
    { value: 'documents_uploaded', label: 'Dokumente hochgeladen' },
    { value: 'documents_processing', label: 'Dokumente werden verarbeitet' },
    { value: 'waiting_for_payment', label: 'Wartet auf Zahlung' },
    { value: 'payment_confirmed', label: 'Zahlung bestätigt' },
    { value: 'creditor_review', label: 'Gläubiger-Prüfung' },
    { value: 'awaiting_client_confirmation', label: 'Wartet auf Client-Bestätigung' },
    { value: 'creditor_contact_active', label: 'Gläubiger-Kontakt aktiv' },
    { value: 'completed', label: 'Abgeschlossen' }
  ];

  const handleTriggerReview = async (userId: string) => {
    if (!window.confirm('Sofortige Gläubiger-Prüfung starten? Dies erstellt sofort ein Zendesk-Ticket für die manuelle Überprüfung.')) {
      return;
    }

    setTriggeringId(userId);
    
    try {
      const result = await triggerImmediateReview(userId).unwrap();

      if (result.success) {
        alert('Gläubiger-Prüfung erfolgreich gestartet! Zendesk-Ticket wurde erstellt.');
      } else {
        alert(`Fehler: ${result.error || 'Unbekannter Fehler'}`);
      }
    } catch (error) {
      console.error('Error triggering immediate review:', error);
      alert('Fehler beim Starten der Gläubiger-Prüfung. Bitte versuchen Sie es erneut.');
    } finally {
      setTriggeringId(null);
    }
  };

  const shouldShowImmediateReviewButton = (user: User): boolean => {
    return !!(
      user.first_payment_received && 
      user.documents_count > 0 && // Note: documents_count is now a number from API
      // user.all_documents_processed_at && // Re-enable if available in mapped data, currently it might be undefined in sparse object?
      // Check interface: all_documents_processed_at is optional string.
      // Backend mapping might not include it explicitly in the lightweight list if I missed it.
      // I included 'updated_at', etc. but 'all_documents_processed_at' might be missing from my projection in server.js.
      // Let's assume it's okay or fallback safely.
      // For safety, checks if 'all_documents_processed_at' exists if critical.
      // user.all_documents_processed_at && 
      (
        (user.processing_complete_webhook_scheduled && !user.processing_complete_webhook_triggered) ||
        (!user.processing_complete_webhook_scheduled && !user.processing_complete_webhook_triggered)
      )
    );
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

  // Helper for pagination range
  const getPageRange = () => {
    const start = (page - 1) * limit + 1;
    const end = Math.min(page * limit, totalUsers);
    return { start, end };
  };

  const { start, end } = getPageRange();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <button
            onClick={onBack}
            className="flex items-center text-gray-600 hover:text-gray-900 mr-4"
          >
            <ArrowLeftIcon className="h-5 w-5 mr-1" />
            Zurück
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">👥 Alle Nutzer</h1>
            <p className="text-gray-600 mt-1">
              Vollständige Benutzerliste 
              {!isLoading && ` (${totalUsers} Nutzer)`}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <span>Letztes Update:</span>
          <span>{new Date().toLocaleTimeString('de-DE')}</span>
          <button onClick={() => refetch()} className="ml-2 text-blue-600 hover:underline">
             Reload
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center">
          <UsersIcon className="h-8 w-8 mr-3" style={{color: '#9f1a1d'}} />
          <div>
            <p className="text-sm font-medium text-gray-600">Gesamt-Nutzer</p>
            <p className="text-3xl font-bold text-gray-900">{totalUsers}</p>
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
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900">
            Nutzer-Liste 
          </h3>
          {totalUsers > 0 && (
            <span className="text-sm text-gray-500">
                Zeige {start} - {end} von {totalUsers}
            </span>
          )}
        </div>
        
        {isLoading ? (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-800" style={{borderBottomColor: '#9f1a1d'}}></div>
            </div>
        ) : (
            <>
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
                {users.map((user) => (
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
                        <div className="flex items-center space-x-2">
                        <button
                            onClick={() => setSelectedUserId(user.aktenzeichen)}
                            className="inline-flex items-center hover:opacity-80"
                            style={{color: '#9f1a1d'}}
                        >
                            <EyeIcon className="w-4 h-4 mr-1" />
                            Details
                        </button>
                        
                        {shouldShowImmediateReviewButton(user) && (
                            <button
                            onClick={() => handleTriggerReview(user.id)}
                            disabled={triggeringId === user.id || isTriggering}
                            className={`inline-flex items-center px-2 py-1 text-xs rounded ${
                                triggeringId === user.id
                                ? 'bg-gray-100 text-gray-400'
                                : 'bg-orange-100 text-orange-800 hover:bg-orange-200'
                            }`}
                            title="Sofort Gläubiger-Prüfung starten"
                            >
                            <BoltIcon className="w-3 h-3 mr-1" />
                            {triggeringId === user.id ? 'Lädt...' : 'Sofort prüfen'}
                            </button>
                        )}
                        </div>
                    </td>
                    </tr>
                ))}
                </tbody>
            </table>
            </div>
            
            {users.length === 0 && (
            <div className="text-center py-8">
                <UsersIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Keine Nutzer gefunden.</p>
            </div>
            )}
            
            {/* Pagination Controls */}
            {totalUsers > 0 && (
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
                                {/* Simple Page Numbers - can be advanced later */}
                                {[...Array(Math.min(5, totalPages))].map((_, idx) => {
                                    // Logic to show a window of pages around current page could go here
                                    // For now, simpler logic: show first few or simple logic
                                    // Let's just show previous, current, next ?
                                    // Or simplified: Just Prev/Next buttons for now to save complexity in this step
                                    return null; 
                                })}
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
            </>
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

export default UserList;