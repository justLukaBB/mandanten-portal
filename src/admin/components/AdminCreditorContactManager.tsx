import React, { useState, useEffect } from 'react';
import { 
  PaperAirplaneIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CurrencyEuroIcon,
  DocumentTextIcon,
  UserGroupIcon,
  BuildingOfficeIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import api from '../../config/api';

interface CreditorContact {
  id: string;
  client_reference: string;
  creditor_name: string;
  creditor_email: string;
  reference_number: string;
  original_claim_amount: number;
  current_debt_amount?: number;
  final_debt_amount: number;
  amount_source: 'pending' | 'creditor_response' | 'original_document' | 'fallback';
  contact_status: 'pending' | 'main_ticket_created' | 'email_sent' | 'responded' | 'timeout' | 'failed';
  ticket_status: string;
  main_zendesk_ticket_id?: number;  // Changed from zendesk_ticket_id
  side_conversation_id?: string;    // New field for Side Conversations
  email_sent_at?: string;
  response_received_at?: string;
  creditor_response_text?: string;
  created_at: string;
  updated_at: string;
}

interface ClientCreditorStatus {
  client_reference: string;
  main_ticket_id?: number;
  sync_info?: any;
  creditor_contacts: CreditorContact[];
  summary: {
    total_creditors: number;
    main_tickets_created: number;
    side_conversations_sent: number;
    emails_sent: number;
    responses_received: number;
    total_debt: number;
  };
  client_info?: {
    name: string;
    email: string;
    workflow_status: string;
    creditor_contact_started: boolean;
    creditor_contact_started_at?: string;
  };
}

interface AdminCreditorContactManagerProps {
  clientId?: string;
}

const AdminCreditorContactManager: React.FC<AdminCreditorContactManagerProps> = ({ 
  clientId 
}) => {
  const [creditorStatus, setCreditorStatus] = useState<ClientCreditorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<CreditorContact | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    fetchCreditorContactStatus();
    const interval = setInterval(fetchCreditorContactStatus, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [clientId]);

  const fetchCreditorContactStatus = async () => {
    if (!clientId) {
      setError('Keine Client-ID verfügbar');
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const response = await api.get(`/clients/${clientId}/creditor-contact-status`);
      setCreditorStatus(response.data);
      setError(null);
    } catch (error) {
      console.error('Error fetching creditor contact status:', error);
      setError('Fehler beim Laden des Gläubiger-Kontakt-Status');
    } finally {
      setLoading(false);
    }
  };

  const startCreditorContactProcess = async () => {
    try {
      setProcessing(true);
      setError(null);
      
      const response = await api.post(`/clients/${clientId}/start-creditor-contact`);
      
      if (response.data.success) {
        
        // Refresh status
        await fetchCreditorContactStatus();
        
        alert(`✅ Gläubiger-Kontakt erfolgreich gestartet!\n\nErgebnisse:\n- ${response.data.tickets_created} Main-Ticket erstellt\n- ${response.data.emails_sent} Side Conversation E-Mails versendet (an online@ra-scuric.de)\n- ${response.data.total_creditors} Gläubiger insgesamt\n\n🎫 Main Ticket: ${response.data.main_ticket_subject || `ID ${response.data.main_ticket_id}`}\n🔗 Zendesk: https://scuric.zendesk.com`);
      } else {
        // Handle user action required errors specially
        if (response.data.user_action_required) {
          alert(response.data.error);
        } else {
          throw new Error(response.data.error || 'Unbekannter Fehler');
        }
      }
    } catch (error: any) {
      console.error('Error starting creditor contact process:', error);
      const errorMessage = error.response?.data?.details || error.message || 'Unbekannter Fehler';
      setError(`Fehler beim Starten des Gläubiger-Kontakt-Prozesses: ${errorMessage}`);
      alert(`Fehler: ${errorMessage}`);
    } finally {
      setProcessing(false);
    }
  };

  const processTimeoutCreditors = async () => {
    try {
      setProcessing(true);
      const response = await api.post('/admin/process-timeout-creditors', { timeout_days: 14 });
      
      alert(`Timeout-Verarbeitung abgeschlossen!\n\n${response.data.processed_count} Gläubiger verarbeitet.`);
      
      // Refresh status
      await fetchCreditorContactStatus();
    } catch (error: any) {
      console.error('Error processing timeout creditors:', error);
      alert(`Fehler bei Timeout-Verarbeitung: ${error.response?.data?.details || error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const resendCreditorEmails = async () => {
    try {
      setProcessing(true);
      setError(null);
      
      const response = await api.post(`/clients/${clientId}/resend-creditor-emails`);
      
      if (response.data.success) {
        
        // Refresh status
        await fetchCreditorContactStatus();
        
        alert(`✅ Gläubiger-E-Mails erneut versendet!\n\nErgebnisse:\n- ${response.data.emails_sent} Side Conversation E-Mails versendet (an online@ra-scuric.de)\n- ${response.data.total_creditors} Gläubiger insgesamt\n\n📧 Prüfen Sie Ihr E-Mail-Postfach: online@ra-scuric.de\n🎫 Main Ticket: ${response.data.main_ticket_subject || 'Siehe Zendesk'}`);
      } else {
        throw new Error(response.data.error || 'Unbekannter Fehler');
      }
    } catch (error: any) {
      console.error('Error re-sending creditor emails:', error);
      const errorMessage = error.response?.data?.details || error.message || 'Unbekannter Fehler';
      setError(`Fehler beim erneuten Senden der E-Mails: ${errorMessage}`);
      alert(`Fehler: ${errorMessage}`);
    } finally {
      setProcessing(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'responded':
        return <CheckCircleIcon className="w-5 h-5 text-green-600" />;
      case 'email_sent':
        return <PaperAirplaneIcon className="w-5 h-5 text-blue-600" />;
      case 'timeout':
        return <ClockIcon className="w-5 h-5 text-orange-600" />;
      case 'failed':
        return <ExclamationTriangleIcon className="w-5 h-5 text-red-600" />;
      case 'main_ticket_created':
        return <DocumentTextIcon className="w-5 h-5 text-purple-600" />;
      case 'ticket_created':
        return <DocumentTextIcon className="w-5 h-5 text-purple-600" />;
      default:
        return <ClockIcon className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'responded': return 'bg-green-100 text-green-800';
      case 'email_sent': return 'bg-blue-100 text-blue-800';
      case 'timeout': return 'bg-orange-100 text-orange-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'main_ticket_created': return 'bg-purple-100 text-purple-800';
      case 'ticket_created': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'responded': return 'Antwort erhalten';
      case 'email_sent': return 'E-Mail versendet';
      case 'timeout': return 'Timeout';
      case 'failed': return 'Fehler';
      case 'main_ticket_created': return 'Main Ticket erstellt';
      case 'ticket_created': return 'Ticket erstellt';
      case 'pending': return 'Ausstehend';
      default: return 'Unbekannt';
    }
  };

  const getAmountSourceText = (source: string) => {
    switch (source) {
      case 'creditor_response': return 'Gläubiger-Antwort';
      case 'original_document': return 'Original-Dokument';
      case 'fallback': return 'Fallback (100€)';
      default: return 'Ausstehend';
    }
  };

  const handleViewDetails = (contact: CreditorContact) => {
    setSelectedContact(contact);
    setShowDetails(true);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-red-200 p-6">
        <div className="text-center">
          <ExclamationTriangleIcon className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-red-900 mb-2">Fehler</h3>
          <p className="text-red-700 mb-4">{error}</p>
          <button
            onClick={fetchCreditorContactStatus}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  const canStartProcess = creditorStatus?.client_info?.workflow_status === 'completed' && 
                         !creditorStatus?.client_info?.creditor_contact_started;
  
  const canResendEmails = creditorStatus?.client_info?.creditor_contact_started && 
                         creditorStatus?.creditor_contacts && 
                         creditorStatus.creditor_contacts.length > 0;

  return (
    <div className="space-y-6">
      {/* Header and Actions */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <ChatBubbleLeftRightIcon className="w-6 h-6 text-blue-600" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Zendesk Gläubiger-Kontakt Manager
              </h3>
              <p className="text-sm text-gray-500">
                Automatisierte Gläubiger-Kommunikation über Zendesk
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            {canStartProcess && (
              <button
                onClick={startCreditorContactProcess}
                disabled={processing}
                className="flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
              >
                {processing ? (
                  <ArrowPathIcon className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <PaperAirplaneIcon className="w-4 h-4 mr-2" />
                )}
                {processing ? 'Wird gestartet...' : 'Gläubiger-Kontakt starten'}
              </button>
            )}
            
            {canResendEmails && (
              <button
                onClick={resendCreditorEmails}
                disabled={processing}
                className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
              >
                {processing ? (
                  <ArrowPathIcon className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <PaperAirplaneIcon className="w-4 h-4 mr-2" />
                )}
                {processing ? 'Wird gesendet...' : 'E-Mails erneut senden'}
              </button>
            )}
          </div>
        </div>

        {/* Client Info */}
        {creditorStatus?.client_info && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center">
              <UserGroupIcon className="w-5 h-5 text-gray-500 mr-2" />
              <div>
                <p className="text-sm font-medium text-gray-900">{creditorStatus.client_info.name}</p>
                <p className="text-xs text-gray-500">{creditorStatus.client_info.email}</p>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">Workflow-Status</p>
              <p className="text-sm text-gray-900">{creditorStatus.client_info.workflow_status}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">Gläubiger-Kontakt</p>
              <p className="text-sm text-gray-900">
                {creditorStatus.client_info.creditor_contact_started ? 'Aktiv' : 'Noch nicht gestartet'}
              </p>
            </div>
          </div>
        )}

        {!canStartProcess && creditorStatus?.client_info?.creditor_contact_started && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start">
              <ChatBubbleLeftRightIcon className="w-5 h-5 text-blue-600 mt-0.5 mr-2" />
              <div>
                <p className="text-sm font-medium text-blue-800 mb-1">Gläubiger-Kontakt aktiv</p>
                <p className="text-sm text-blue-700">
                  Der automatisierte Gläubiger-Kontakt-Prozess wurde gestartet am{' '}
                  {creditorStatus.client_info.creditor_contact_started_at && 
                    new Date(creditorStatus.client_info.creditor_contact_started_at).toLocaleString('de-DE')}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Summary Statistics */}
      {creditorStatus?.summary && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <DocumentTextIcon className="h-8 w-8 text-blue-500 mr-3" />
              <div>
                <p className="text-sm font-medium text-gray-600">Gläubiger gesamt</p>
                <p className="text-2xl font-bold text-blue-600">{creditorStatus.summary.total_creditors}</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <DocumentTextIcon className="h-8 w-8 text-orange-500 mr-3" />
              <div>
                <p className="text-sm font-medium text-gray-600">Main Ticket</p>
                <p className="text-2xl font-bold text-orange-600">{creditorStatus.summary.main_tickets_created}</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <ChatBubbleLeftRightIcon className="h-8 w-8 text-indigo-500 mr-3" />
              <div>
                <p className="text-sm font-medium text-gray-600">Side Conversations</p>
                <p className="text-2xl font-bold text-indigo-600">{creditorStatus.summary.side_conversations_sent}</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <PaperAirplaneIcon className="h-8 w-8 text-green-500 mr-3" />
              <div>
                <p className="text-sm font-medium text-gray-600">E-Mails versendet</p>
                <p className="text-2xl font-bold text-green-600">{creditorStatus.summary.emails_sent}</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <CheckCircleIcon className="h-8 w-8 text-purple-500 mr-3" />
              <div>
                <p className="text-sm font-medium text-gray-600">Antworten</p>
                <p className="text-2xl font-bold text-purple-600">{creditorStatus.summary.responses_received}</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <CurrencyEuroIcon className="h-8 w-8 text-red-500 mr-3" />
              <div>
                <p className="text-sm font-medium text-gray-600">Gesamtschuld</p>
                <p className="text-2xl font-bold text-red-600">
                  {creditorStatus.summary.total_debt.toFixed(2)} €
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Creditor Contacts List */}
      {creditorStatus?.creditor_contacts && creditorStatus.creditor_contacts.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Gläubiger-Kontakte ({creditorStatus.creditor_contacts.length})
              </h3>
              <button
                onClick={processTimeoutCreditors}
                disabled={processing}
                className="px-3 py-1 text-sm bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white rounded transition-colors"
              >
                Timeout verarbeiten
              </button>
            </div>
          </div>

          <div className="divide-y divide-gray-200">
            {creditorStatus.creditor_contacts.map((contact) => (
              <div key={contact.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-start space-x-4 flex-1">
                    {/* Status Icon */}
                    <div className="flex-shrink-0 mt-1">
                      {getStatusIcon(contact.contact_status)}
                    </div>
                    
                    {/* Creditor Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-3 mb-2">
                        <h4 className="text-sm font-medium text-gray-900 truncate">
                          {contact.creditor_name}
                        </h4>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(contact.contact_status)}`}>
                          {getStatusText(contact.contact_status)}
                        </span>
                        {contact.main_zendesk_ticket_id && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            Main Ticket #{contact.main_zendesk_ticket_id}
                          </span>
                        )}
                        {contact.side_conversation_id && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                            Side Conv. #{contact.side_conversation_id}
                          </span>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs text-gray-500">
                        <div>
                          <span className="font-medium">Aktenzeichen:</span>
                          <p>{contact.reference_number}</p>
                        </div>
                        <div>
                          <span className="font-medium">Forderung:</span>
                          <p>{contact.final_debt_amount.toFixed(2)} € ({getAmountSourceText(contact.amount_source)})</p>
                        </div>
                        <div>
                          <span className="font-medium">Kontakt-Status:</span>
                          <p>{getStatusText(contact.contact_status)}</p>
                        </div>
                        <div>
                          <span className="font-medium">Aktualisiert:</span>
                          <p>{new Date(contact.updated_at).toLocaleString('de-DE')}</p>
                        </div>
                      </div>

                      {contact.response_received_at && (
                        <div className="mt-2 text-xs text-gray-600">
                          <span className="font-medium text-green-700">Antwort erhalten:</span>
                          <span className="ml-1">{new Date(contact.response_received_at).toLocaleString('de-DE')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex items-center space-x-2 ml-4">
                    <button
                      onClick={() => handleViewDetails(contact)}
                      className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Details anzeigen"
                    >
                      <DocumentTextIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Contacts Message */}
      {creditorStatus?.creditor_contacts && creditorStatus.creditor_contacts.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="text-center">
            <ChatBubbleLeftRightIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Keine Gläubiger-Kontakte</h3>
            <p className="text-gray-500 mb-4">
              {canStartProcess 
                ? 'Starten Sie den Gläubiger-Kontakt-Prozess, um automatisch alle bestätigten Gläubiger zu kontaktieren.'
                : 'Der Gläubiger-Kontakt-Prozess wurde noch nicht gestartet oder es sind keine bestätigten Gläubiger vorhanden.'
              }
            </p>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {showDetails && selectedContact && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Gläubiger-Details: {selectedContact.creditor_name}
              </h3>
              <button
                onClick={() => setShowDetails(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="sr-only">Schließen</span>
                ✕
              </button>
            </div>
            
            {/* Modal Content */}
            <div className="px-6 py-4 space-y-6">
              {/* Basic Info */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3">Grundinformationen</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-700">Gläubiger:</span>
                    <span className="ml-2 text-gray-600">{selectedContact.creditor_name}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">E-Mail:</span>
                    <span className="ml-2 text-gray-600">{selectedContact.creditor_email}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Aktenzeichen:</span>
                    <span className="ml-2 text-gray-600">{selectedContact.reference_number}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Main Zendesk Ticket:</span>
                    <span className="ml-2 text-gray-600">
                      {selectedContact.main_zendesk_ticket_id ? `#${selectedContact.main_zendesk_ticket_id}` : 'Nicht verfügbar'}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Side Conversation:</span>
                    <span className="ml-2 text-gray-600">
                      {selectedContact.side_conversation_id ? `${selectedContact.side_conversation_id}` : 'Nicht verfügbar'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Amounts */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3">Forderungsbeträge</h4>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-gray-700">Original-Betrag:</span>
                    <span className="text-gray-900">{selectedContact.original_claim_amount.toFixed(2)} €</span>
                  </div>
                  {selectedContact.current_debt_amount && (
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-gray-700">Aktuelle Forderung:</span>
                      <span className="text-gray-900">{selectedContact.current_debt_amount.toFixed(2)} €</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-semibold">
                    <span className="text-gray-700">Finaler Betrag:</span>
                    <span className="text-gray-900">{selectedContact.final_debt_amount.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Quelle:</span>
                    <span className="text-gray-700">{getAmountSourceText(selectedContact.amount_source)}</span>
                  </div>
                </div>
              </div>

              {/* Status Information */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3">Status-Information</h4>
                <div className="space-y-2">
                  <div className="flex items-center">
                    {getStatusIcon(selectedContact.contact_status)}
                    <span className="ml-2 text-sm font-medium">{getStatusText(selectedContact.contact_status)}</span>
                  </div>
                  {selectedContact.email_sent_at && (
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">E-Mail versendet:</span>
                      <span className="ml-1">{new Date(selectedContact.email_sent_at).toLocaleString('de-DE')}</span>
                    </div>
                  )}
                  {selectedContact.response_received_at && (
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Antwort erhalten:</span>
                      <span className="ml-1">{new Date(selectedContact.response_received_at).toLocaleString('de-DE')}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Creditor Response */}
              {selectedContact.creditor_response_text && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Gläubiger-Antwort</h4>
                  <div className="bg-blue-50 rounded-lg p-4">
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
                      {selectedContact.creditor_response_text}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCreditorContactManager;