import React, { useState, useEffect } from 'react';
import {
  XMarkIcon,
  UserIcon,
  DocumentTextIcon,
  BuildingOfficeIcon,
  ChartBarIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  EyeIcon,
  InformationCircleIcon,
  ArrowPathIcon,
  ArrowDownTrayIcon,
  CalculatorIcon,
  CurrencyEuroIcon,
  ArrowUturnLeftIcon
} from '@heroicons/react/24/outline';
import { API_BASE_URL } from '../../config/api';
import SchuldenbereinigungsplanView from './SchuldenbereinigungsplanView';
import InsolvenzantragDownloadButton from './InsolvenzantragDownloadButton';
import ManualCreditorManager from './ManualCreditorManager';
import SevenDayReviewTrigger from './SevenDayReviewTrigger';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../components/ui/dialog';

interface UserDetailProps {
  userId: string;
  onClose: () => void;
}

interface FinancialData {
  net_income: number;
  dependents: number;
  marital_status: 'ledig' | 'verheiratet' | 'geschieden' | 'verwitwet';
  pfaendbar_amount: number;
  input_date: string;
  input_by: string;
  recommended_plan_type?: 'nullplan' | 'quotenplan';
  garnishable_amount?: number;
}

interface DetailedUser {
  id: string;
  aktenzeichen: string;
  firstName: string;
  lastName: string;
  email: string;
  current_status: string;
  created_at: string;
  updated_at: string;
  last_login?: string;
  documents: Document[];
  settlement_plan_sent_at?: string;
  final_creditor_list?: Creditor[];
  zendesk_ticket_id?: string;
  workflow_status?: string;
  has_financial_data?: boolean;
  financial_data?: FinancialData;
  seven_day_review_scheduled?: boolean;
  seven_day_review_triggered?: boolean;
  seven_day_review_scheduled_at?: string;
}

interface Document {
  id: string;
  name: string;
  size?: number;
  processing_status: 'processing' | 'completed' | 'failed';
  is_creditor_document?: boolean;
  confidence?: number;
  document_status?: string;
  manual_review_required?: boolean;
  summary?: string;
  extracted_data?: {
    creditor_data?: {
      sender_name?: string;
      sender_email?: string;
      sender_address?: string;
      reference_number?: string;
      claim_amount?: number;
      is_representative?: boolean;
      actual_creditor?: string;
    };
    reasoning?: string;
    workflow_status?: string;
    processing_method?: string;
    token_usage?: {
      total_tokens?: number;
    };
  };
  uploadedAt: string;
  processed_at?: string;
}

interface Creditor {
  id: string;
  sender_name: string;
  sender_email?: string;
  sender_address?: string;
  reference_number?: string;
  claim_amount?: number;
  status: string;
  settlement_plan_sent_at?: string;
  settlement_side_conversation_id?: string;
  settlement_response_status?: string;
  settlement_response_received_at?: string;
  nullplan_sent_at?: string;
  nullplan_side_conversation_id?: string;
  nullplan_response_status?: string;
  nullplan_response_received_at?: string;
}

const UserDetailView: React.FC<UserDetailProps> = ({ userId, onClose }) => {
  const [user, setUser] = useState<DetailedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSettlementPlan, setShowSettlementPlan] = useState(false);
  const [settlementSummary, setSettlementSummary] = useState<any>(null);
  const [loadingSettlement, setLoadingSettlement] = useState(false);
  const [showNullplan, setShowNullplan] = useState(false);
  const [nullplanSummary, setNullplanSummary] = useState<any>(null);
  const [loadingNullplan, setLoadingNullplan] = useState(false);
  const [skippingDelay, setSkippingDelay] = useState(false);

  // Delete user state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Financial data form state
  const [financialForm, setFinancialForm] = useState({
    net_income: '',
    dependents: '0',
    marital_status: 'ledig' as const
  });
  const [pfaendbarAmount, setPfaendbarAmount] = useState<number | null>(null);
  const [savingFinancial, setSavingFinancial] = useState(false);

  // Check if client has settlement plans sent (to determine if we should show the table)
  const hasSettlementPlansSent = user?.final_creditor_list?.some(creditor =>
    creditor.settlement_plan_sent_at
  );

  // Check if client has nullplan sent (to determine if we should show the nullplan table)
  const hasNullplanSent = user?.final_creditor_list?.some(creditor =>
    creditor.nullplan_sent_at
  );

  // Check if client is on nullplan based on financial data
  const isNullplanClient = user?.financial_data?.recommended_plan_type === 'nullplan';

  useEffect(() => {
    fetchUserDetails();
  }, [userId]);

  // Auto-fetch settlement responses if settlement plans have been sent
  useEffect(() => {
    if (hasSettlementPlansSent) {
      // Initial fetch
      fetchSettlementResponses();

      // Set up 1-minute interval for auto-refresh
      const interval = setInterval(() => {
        fetchSettlementResponses();
      }, 60000); // 1 minute = 60,000ms

      return () => clearInterval(interval);
    } else {
      // If no settlement plans detected yet, periodically check if they've been sent
      // This handles the case where settlement emails are sent after the admin panel is open
      const checkInterval = setInterval(async () => {
        await fetchUserDetails(); // Refresh user data to check for new settlement_plan_sent_at fields
      }, 30000); // Check every 30 seconds

      return () => clearInterval(checkInterval);
    }
  }, [hasSettlementPlansSent, userId]);

  // Auto-fetch nullplan responses if nullplan has been sent
  useEffect(() => {
    if (isNullplanClient && hasNullplanSent) {
      // Initial fetch
      fetchNullplanResponses();

      // Set up 1-minute interval for auto-refresh
      const interval = setInterval(() => {
        fetchNullplanResponses();
      }, 60000); // 1 minute = 60,000ms

      return () => clearInterval(interval);
    } else if (isNullplanClient) {
      // If nullplan client but no nullplan sent yet, periodically check if they've been sent
      // This handles the case where nullplan emails are sent after the admin panel is open
      const checkInterval = setInterval(async () => {
        await fetchUserDetails(); // Refresh user data to check for new nullplan_sent_at fields
      }, 30000); // Check every 30 seconds

      return () => clearInterval(checkInterval);
    }
  }, [isNullplanClient, hasNullplanSent, userId]);

  // Re-process documents state
  const [reprocessingDocuments, setReprocessingDocuments] = useState(false);
  const [showReprocessModal, setShowReprocessModal] = useState(false);
  const [reprocessConfirmText, setReprocessConfirmText] = useState('');

  const [downloadingDocs, setDownloadingDocs] = useState<Record<string, boolean>>({});
  const [deletingDocs, setDeletingDocs] = useState<Record<string, boolean>>({});

  const downloadDocument = async (documentId: string, documentName: string) => {
    try {
      console.log(`📥 Downloading document ${documentId} (${documentName})`);
      setDownloadingDocs(prev => ({ ...prev, [documentId]: true }));

      const response = await fetch(`${API_BASE_URL}/api/clients/${userId}/documents/${documentId}/download`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        }
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = documentName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      console.log(`✅ Document downloaded successfully`);
    } catch (error) {
      console.error('❌ Error downloading document:', error);
      alert(`Fehler beim Herunterladen des Dokuments: ${error}`);
    } finally {
      setDownloadingDocs(prev => ({ ...prev, [documentId]: false }));
    }
  };

  const [downloadingAllDocuments, setDownloadingAllDocuments] = useState(false);

  const downloadAllDocuments = async () => {
    if (!user) return;

    try {
      setDownloadingAllDocuments(true);
      console.log(`📦 Downloading all documents for client ${userId}`);

      const response = await fetch(`${API_BASE_URL}/api/clients/${userId}/documents/download-all`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.message || errorData.error || `Download failed: ${response.status}`);
      }

      // Get blob and trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // Extract filename from Content-Disposition header if available
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `Client_${user.aktenzeichen || userId}_Documents.zip`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1];
        }
      }

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      console.log(`✅ All documents downloaded successfully as ${filename}`);
      alert(`✅ Alle Dokumente erfolgreich heruntergeladen als ${filename}`);
    } catch (error) {
      console.error('❌ Error downloading all documents:', error);
      alert(`Fehler beim Herunterladen aller Dokumente: ${error}`);
    } finally {
      setDownloadingAllDocuments(false);
    }
  };

  const deleteDocument = async (documentId: string, documentName: string) => {
    if (!user) return;

    // Confirm deletion
    const confirmDelete = window.confirm(
      `Möchten Sie das Dokument "${documentName}" wirklich löschen?\n\nDieser Vorgang kann nicht rückgängig gemacht werden.`
    );

    if (!confirmDelete) return;

    try {
      console.log(`🗑️ Deleting document ${documentId} (${documentName})`);
      setDeletingDocs(prev => ({ ...prev, [documentId]: true }));

      const response = await fetch(`${API_BASE_URL}/api/clients/${userId}/documents/${documentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Delete failed: ${response.status}`);
      }

      const result = await response.json();
      console.log(`✅ Document deleted successfully:`, result);
      alert(`✅ Dokument "${documentName}" wurde erfolgreich gelöscht.`);

      // Close the modal if it's open
      setSelectedDocument(null);

      // Refresh user data to update the documents list
      await fetchUserDetails();
    } catch (error) {
      console.error('❌ Error deleting document:', error);
      alert(`Fehler beim Löschen des Dokuments: ${error}`);
    } finally {
      setDeletingDocs(prev => ({ ...prev, [documentId]: false }));
    }
  };

  const reprocessAllDocuments = async () => {
    if (!user) return;

    try {
      setReprocessingDocuments(true);
      console.log(`♻️ Re-processing all documents for client ${userId}`);

      const response = await fetch(`${API_BASE_URL}/api/clients/${userId}/documents/reprocess-all`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          confirmation: true,
          admin_id: localStorage.getItem('admin_id') || 'admin',
          reason: reprocessConfirmText || 'Admin-initiated bulk reprocessing'
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.message || errorData.error || `Reprocessing failed: ${response.status}`);
      }

      const result = await response.json();
      console.log(`✅ Bulk reprocessing started:`, result);

      alert(`✅ Dokumenten-Neuverarbeitung gestartet!\n\n📄 Dokumente: ${result.documents_count}\n⏱️ Geschätzte Zeit: ${result.estimated_time_minutes} Minuten\n\n✓ Alle AI-Ergebnisse werden gelöscht\n✓ Dokumente werden neu verarbeitet\n✓ Gläubiger-Liste wird aktualisiert\n\nDie Seite wird automatisch aktualisiert, wenn die Verarbeitung abgeschlossen ist.`);

      // Close modal
      setShowReprocessModal(false);
      setReprocessConfirmText('');

      // Set up polling to refresh user data
      const pollInterval = setInterval(async () => {
        await fetchUserDetails();

        // Check if all documents are processed
        const allProcessed = user?.documents?.every(doc =>
          doc.processing_status === 'completed' || doc.processing_status === 'failed'
        );

        if (allProcessed) {
          clearInterval(pollInterval);
          // alert(`✅ Dokumenten-Neuverarbeitung abgeschlossen!\n\nAlle Dokumente wurden erfolgreich neu verarbeitet.`);
        }
      }, 10000); // Poll every 10 seconds

      // Stop polling after estimated time + buffer
      setTimeout(() => {
        clearInterval(pollInterval);
      }, (result.estimated_time_minutes * 60 * 1000) + 60000); // estimated time + 1 minute buffer

    } catch (error: any) {
      console.error('❌ Error reprocessing documents:', error);
      alert(`Fehler beim Neuverarbeiten der Dokumente: ${error.message}`);
    } finally {
      setReprocessingDocuments(false);
    }
  };

  const skipSevenDayDelay = async () => {
    if (!user) return;

    // eslint-disable-next-line no-restricted-globals
    if (!confirm(`⚡ 7-Day Delay Skip\n\nDies überspringt die 7-Tage-Wartezeit für ${user.firstName} ${user.lastName} (${user.aktenzeichen}) und startet sofort die Gläubiger-Überprüfung.\n\n⚠️ Nur für Testing verwenden!\n\nFortfahren?`)) {
      return;
    }

    setSkippingDelay(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/clients/${userId}/skip-seven-day-delay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to skip delay');
      }

      const result = await response.json();
      console.log('✅ 7-day delay skipped:', result);

      // Refresh user data to show updated status
      await fetchUserDetails();

      alert(`✅ 7-Tage-Wartezeit übersprungen!\n\nGläubiger-Überprüfung wurde sofort gestartet für ${user.firstName} ${user.lastName}.`);

    } catch (error: any) {
      console.error('❌ Error skipping delay:', error);
      alert(`Fehler beim Überspringen der Wartezeit: ${error.message}`);
    } finally {
      setSkippingDelay(false);
    }
  };

  const handleImpersonation = async () => {
    if (!user) return;

    // eslint-disable-next-line no-restricted-globals
    if (!confirm(`🔐 Login as User\n\nYou are about to log in as:\n${user.firstName} ${user.lastName} (${user.email})\n\nThis will open their portal in a new tab.\n\nContinue?`)) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/impersonate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        },
        body: JSON.stringify({
          client_id: userId,
          reason: 'Admin support and troubleshooting'
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate impersonation token');
      }

      const result = await response.json();
      console.log('✅ Impersonation token generated:', result);

      // Open portal in new tab with the impersonation token
      window.open(result.portal_url, '_blank');

    } catch (error: any) {
      console.error('❌ Error generating impersonation token:', error);
      alert(`Failed to login as user: ${error.message}`);
    }
  };

  const handleDeleteUser = async () => {
    if (!user) return;

    // Validate confirmation text
    const expectedText = user.email;
    if (deleteConfirmText !== expectedText) {
      alert(`Please type "${expectedText}" to confirm deletion`);
      return;
    }

    setDeleting(true);

    try {
      console.log('🗑️ Deleting user:', userId);

      const response = await fetch(`${API_BASE_URL}/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        },
        body: JSON.stringify({
          reason: 'Admin-initiated deletion via dashboard'
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete user');
      }

      const result = await response.json();
      console.log('✅ User deleted successfully:', result);

      // Show success message
      alert(`✅ User deleted successfully!\n\nDeleted:\n- Documents: ${result.deletion_summary.documents}\n- Creditors: ${result.deletion_summary.creditors}\n- Files: ${result.deletion_summary.files}\n\nDuration: ${result.duration_ms}ms`);

      // Close modal and parent
      setShowDeleteModal(false);
      onClose();

    } catch (error: any) {
      console.error('❌ Error deleting user:', error);
      alert(`Failed to delete user: ${error.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const calculatePfaendbarAmount = async (netIncome: number, maritalStatus: string, dependents: number) => {
    try {
      console.log('🧮 Calculating pfändbar amount:', { netIncome, maritalStatus, dependents });

      const response = await fetch(`${API_BASE_URL}/api/clients/${userId}/calculate-garnishable-income`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        },
        body: JSON.stringify({
          netIncome,
          maritalStatus,
          numberOfChildren: dependents
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Pfändbar calculation failed:', response.status, errorText);
        throw new Error(`Failed to calculate garnishable income: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Pfändbar calculation result:', result);
      return result.garnishable_amount || 0;
    } catch (error) {
      console.error('Error calculating pfändbar amount:', error);
      return null;
    }
  };

  const handleFinancialFormChange = async (field: string, value: string) => {
    const newForm = { ...financialForm, [field]: value };
    setFinancialForm(newForm);

    // Real-time pfändbar calculation
    if (newForm.net_income && !isNaN(parseFloat(newForm.net_income))) {
      const netIncome = parseFloat(newForm.net_income);
      const dependents = parseInt(newForm.dependents) || 0;

      const pfaendbar = await calculatePfaendbarAmount(netIncome, newForm.marital_status, dependents);
      setPfaendbarAmount(pfaendbar);
    } else {
      setPfaendbarAmount(null);
    }
  };

  const saveFinancialData = async () => {
    try {
      setSavingFinancial(true);

      const response = await fetch(`${API_BASE_URL}/api/clients/${userId}/financial-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        },
        body: JSON.stringify({
          net_income: parseFloat(financialForm.net_income),
          dependents: parseInt(financialForm.dependents) || 0,
          marital_status: financialForm.marital_status,
          input_by: 'admin'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save financial data');
      }

      const result = await response.json();
      console.log('Financial data saved:', result);

      // Refresh user data
      await fetchUserDetails();

      // Clear form
      setFinancialForm({
        net_income: '',
        dependents: '0',
        marital_status: 'ledig'
      });
      setPfaendbarAmount(null);

    } catch (error) {
      console.error('Error saving financial data:', error);
      setError(error instanceof Error ? error.message : 'Failed to save financial data');
    } finally {
      setSavingFinancial(false);
    }
  };

  const fetchUserDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch user data
      const userResponse = await fetch(`${API_BASE_URL}/api/clients/${userId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        }
      });

      if (!userResponse.ok) {
        throw new Error('Failed to fetch user details');
      }

      const userData = await userResponse.json();

      // Fetch documents separately
      try {
        const documentsResponse = await fetch(`${API_BASE_URL}/api/clients/${userId}/documents`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
          }
        });

        if (documentsResponse.ok) {
          const documentsData = await documentsResponse.json();
          userData.documents = documentsData || [];

          console.log("=====================documentsData========================", documentsData)
        } else {
          userData.documents = [];
        }
      } catch (docError) {
        console.warn('Could not fetch documents:', docError);
        userData.documents = [];
      }

      console.log('UserDetailView: Loaded user data:', userData);
      console.log('UserDetailView: Documents loaded:', userData.documents);
      setUser(userData);

    } catch (error) {
      console.error('Error fetching user details:', error);
      setError('Failed to load user details');
    } finally {
      setLoading(false);
    }
  };

  const simulate30DayPeriod = async () => {
    if (!window.confirm(`🕐 30-Day Period Simulation\n\nDies simuliert das Ende der 30-Tage-Periode für Client ${user?.firstName} ${user?.lastName} (${user?.aktenzeichen}).\n\n✅ Erstellt Gläubiger-Berechnungstabelle\n✅ Aktiviert Finanzdaten-Formular im Client Portal\n\n⚠️ Settlement-E-Mails werden ERST nach Finanzdaten-Eingabe versendet!\n\nFortfahren?`)) {
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`${API_BASE_URL}/api/admin/clients/${userId}/simulate-30-day-period`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Simulation failed: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        const emailStatus = result.email_sent
          ? `\n\n📧 E-Mail versendet an: ${user?.email}\n✅ Client wurde benachrichtigt`
          : result.email_details?.skipped
            ? '\n\n⚠️ E-Mail übersprungen (fehlende Daten)'
            : `\n\n⚠️ E-Mail-Versand fehlgeschlagen: ${result.email_details?.error || 'Unbekannter Fehler'}`;

        alert(`✅ 30-Day Simulation erfolgreich!\n\n${result.message}${emailStatus}\n\nGläubiger: ${result.creditor_count || 'N/A'}\nGesamtschuld: €${result.total_debt?.toFixed(2) || 'N/A'}`);

        // Refresh user data to show updated status
        await fetchUserDetails();

        // Force show settlement table immediately after 30-day simulation
        console.log('🎯 30-day simulation completed - forcing settlement table display');

        // Wait a moment for settlement emails to be sent, then fetch settlement data
        setTimeout(async () => {
          await fetchSettlementResponses();
          // Force table to show by setting a flag
          setShowSettlementPlan(true);
        }, 3000); // Wait 3 seconds for settlement emails to be processed

      } else {
        alert(`❌ Simulation fehlgeschlagen: ${result.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error running 30-day simulation:', error);
      alert(`❌ Fehler bei der 30-Day Simulation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchSettlementResponses = async () => {
    try {
      const adminToken = localStorage.getItem('admin_token');
      console.log('🔄 Fetching settlement responses for userId:', userId);
      console.log('🔑 Admin token available:', !!adminToken);
      console.log('🔑 Token preview:', adminToken ? adminToken.substring(0, 20) + '...' : 'No token');

      // Fetch settlement summary (silently, no loading state for auto-refresh)
      const summaryResponse = await fetch(`${API_BASE_URL}/api/admin/clients/${userId}/settlement-responses`, {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });

      console.log('📡 Settlement API response status:', summaryResponse.status);

      if (summaryResponse.ok) {
        const result = await summaryResponse.json();
        console.log('✅ Settlement API result:', result);
        setSettlementSummary(result.summary);
      } else {
        const errorText = await summaryResponse.text();
        console.log('❌ Settlement API error:', summaryResponse.status, errorText);
        // If settlement data doesn't exist yet, clear any existing data
        setSettlementSummary(null);
      }
    } catch (error) {
      console.error('❌ Error fetching settlement responses:', error);
      setSettlementSummary(null);
    }
  };

  const fetchNullplanResponses = async () => {
    try {
      const adminToken = localStorage.getItem('admin_token');
      console.log('🔄 Fetching nullplan responses for userId:', userId);
      console.log('🔑 Admin token available:', !!adminToken);
      console.log('🔑 Token preview:', adminToken ? adminToken.substring(0, 20) + '...' : 'No token');

      // Fetch nullplan summary (silently, no loading state for auto-refresh)
      const summaryResponse = await fetch(`${API_BASE_URL}/api/admin/clients/${userId}/nullplan-responses`, {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });

      console.log('📡 Nullplan API response status:', summaryResponse.status);

      if (summaryResponse.ok) {
        const result = await summaryResponse.json();
        console.log('✅ Nullplan API result:', result);
        setNullplanSummary(result.summary);
      } else {
        const errorText = await summaryResponse.text();
        console.log('❌ Nullplan API error:', summaryResponse.status, errorText);
        // If nullplan data doesn't exist yet, clear any existing data
        setNullplanSummary(null);
      }
    } catch (error) {
      console.error('❌ Error fetching nullplan responses:', error);
      setNullplanSummary(null);
    }
  };

  // Debug logging
  React.useEffect(() => {
    console.log('🔍 Settlement Debug Info:', {
      hasUser: !!user,
      creditorCount: user?.final_creditor_list?.length || 0,
      hasSettlementPlansSent,
      settlementSummary: !!settlementSummary,
      creditorsWithSettlementDate: user?.final_creditor_list?.filter(c => c.settlement_plan_sent_at)?.length || 0,
      fullCreditorData: user?.final_creditor_list?.map(c => ({
        name: c.sender_name,
        settlement_plan_sent_at: c.settlement_plan_sent_at,
        settlement_side_conversation_id: c.settlement_side_conversation_id,
        settlement_response_status: c.settlement_response_status
      }))
    });

    // Log the settlement API response
    if (settlementSummary) {
      console.log('📊 Settlement Summary Data:', settlementSummary);
    }
  }, [user, hasSettlementPlansSent, settlementSummary]);

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

  const getDocumentStatusInfo = (doc: Document) => {
    if (doc.processing_status === 'processing') {
      return {
        badge: { color: 'bg-yellow-100 text-yellow-800', text: 'Wird verarbeitet...' },
        showCreditorInfo: false
      };
    }

    if (doc.processing_status === 'failed') {
      return {
        badge: { color: 'bg-red-100 text-red-800', text: 'Verarbeitung fehlgeschlagen' },
        showCreditorInfo: false
      };
    }

    if (doc.processing_status === 'completed') {
      if (doc.manual_review_required) {
        return {
          badge: { color: 'bg-orange-100 text-orange-800', text: 'Manuelle Prüfung erforderlich' },
          showCreditorInfo: true
        };
      }

      if (doc.is_creditor_document) {
        return {
          badge: { color: 'bg-red-100 text-red-800', text: 'Gläubigerdokument' },
          showCreditorInfo: true
        };
      } else {
        return {
          badge: { color: 'bg-green-100 text-green-800', text: 'Kein Gläubigerdokument' },
          showCreditorInfo: false
        };
      }
    }

    return {
      badge: { color: 'bg-gray-100 text-gray-800', text: 'Unbekannt' },
      showCreditorInfo: false
    };
  };

  const getDocumentStatusIcon = (doc: Document) => {
    if (doc.processing_status === 'processing') {
      return <ClockIcon className="w-5 h-5 text-yellow-500" />;
    } else if (doc.processing_status === 'completed' && doc.is_creditor_document) {
      return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
    } else if (doc.processing_status === 'failed') {
      return <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />;
    }
    return <DocumentTextIcon className="w-5 h-5 text-gray-400" />;
  };

  if (loading && !user) {
    return (
      <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className=" bg-white" showCloseButton={false}>
          <div className="flex items-center justify-center space-x-3 p-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderBottomColor: '#9f1a1d' }}></div>
            <span className="text-lg">Loading user details...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (error || !user) {
    return (
      <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className=" bg-white" showCloseButton={false}>
          <DialogHeader className="flex flex-row justify-between items-center">
            <DialogTitle className="text-xl font-bold text-red-600">Error</DialogTitle>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <XMarkIcon className="w-6 h-6" />
            </button>
          </DialogHeader>
          <DialogDescription className="text-gray-600 mb-4">{error || 'User not found'}</DialogDescription>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
          >
            Close
          </button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="!max-w-[1250px] h-[calc(100vh_-_50px)] overflow-hidden p-0 bg-white flex flex-col " showCloseButton={false}>
        {loading && user && (
          <div className="absolute top-0 left-0 right-0 bg-yellow-100 text-yellow-800 text-center text-xs py-1 z-50">
            Refreshing data...
          </div>
        )}
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 absolute right-3 top-3"
        >
          <XMarkIcon className="w-6 h-6" />
        </button>
        {/* Fixed Header */}
        <div className="flex-shrink-0 flex flex-col justify-between items-center p-6 border-b border-gray-200 bg-white">
          <h2 className="text-xl font-bold text-gray-900">
            📄 User Details: {user.firstName} {user.lastName}
          </h2>
          <div className="flex items-center space-x-3">
            <InsolvenzantragDownloadButton
              userId={userId}
              className=""
            />

            {/* Skip 7-Day Delay Button (for testing) */}
            {/* {user?.first_payment_received && user.documents?.length > 0 && (
              <button
                onClick={skipSevenDayDelay}
                disabled={skippingDelay}
                className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md bg-yellow-600 text-white hover:bg-yellow-700 disabled:opacity-50 transition-colors"
                title="Skip 7-day delay and trigger immediate review (Testing only)"
              >
                {skippingDelay ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Skipping...
                  </>
                ) : (
                  <>
                    ⚡ Skip 7-Day Delay
                  </>
                )}
              </button>
            )} */}

            <button
              onClick={() => setShowSettlementPlan(true)}
              className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md border border-blue-600 text-blue-600 hover:bg-blue-50 transition-colors"
              title="Open Schuldenbereinigungsplan"
            >
              <CalculatorIcon className="w-4 h-4 mr-1" />
              Settlement Plan
            </button>
            <button
              onClick={simulate30DayPeriod}
              disabled={loading}
              className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md border border-orange-600 text-orange-600 hover:bg-orange-50 transition-colors"
              title="Simulate 30-day period and start creditor contact process"
            >
              <ClockIcon className={`w-4 h-4 mr-1 ${loading ? 'animate-pulse' : ''}`} />
              Letzte Zahlung bestätigen
            </button>
            <button
              onClick={fetchUserDetails}
              disabled={loading}
              className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md border hover:bg-red-50 transition-colors"
              style={{ color: '#9f1a1d', borderColor: '#9f1a1d' }}
              title="Refresh user data"
            >
              <ArrowPathIcon className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={handleImpersonation}
              className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md bg-yellow-600 text-white hover:bg-yellow-700 transition-colors shadow-sm"
              title="Login as this user to access their portal"
            >
              <UserIcon className="w-4 h-4 mr-1" />
              Login as User
            </button>
            {/* Debug info */}
            {process.env.NODE_ENV === 'development' && (
              <div className="flex flex-col text-xs text-gray-500 space-y-1">
                <div>
                  Plans sent: {hasSettlementPlansSent ? 'Yes' : 'No'} |
                  Summary: {settlementSummary ? 'Yes' : 'No'} |
                  Creditors: {user?.final_creditor_list?.length || 0}
                </div>
                <button
                  onClick={fetchSettlementResponses}
                  className="bg-blue-500 text-white px-2 py-1 rounded text-xs"
                >
                  Test Settlement API
                </button>
                <button
                  onClick={async () => {
                    const token = localStorage.getItem('admin_token');
                    console.log('🔑 Testing admin token:', {
                      hasToken: !!token,
                      tokenLength: token?.length,
                      tokenPreview: token ? token.substring(0, 50) + '...' : 'No token'
                    });

                    try {
                      // Test a simple admin endpoint
                      const response = await fetch(`${API_BASE_URL}/api/clients`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                      });
                      console.log('🔑 Token test result:', response.status, response.statusText);
                    } catch (error) {
                      console.error('🔑 Token test error:', error);
                    }
                  }}
                  className="bg-red-500 text-white px-2 py-1 rounded text-xs"
                >
                  Test Token
                </button>
              </div>
            )}

          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex flex-col md:flex-row gap-2 max-h-[500px]">
            {/* User Profile */}
            <div className="bg-gray-50 rounded-lg p-4 w-[25%] ">
              <div className="flex items-center mb-4">
                <UserIcon className="w-8 h-8 mr-3" style={{ color: '#9f1a1d' }} />
                <h3 className="text-lg font-semibold">Profile</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-600">Name</label>
                  <p className="text-gray-900">{user.firstName} {user.lastName}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Email</label>
                  <p className="text-gray-900">{user.email}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Aktenzeichen</label>
                  <p className="text-gray-900 font-mono">{user.aktenzeichen}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Status</label>
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(user.current_status)}`}>
                    {user.current_status}
                  </span>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Created</label>
                  <p className="text-gray-900">{new Date(user.created_at).toLocaleDateString('de-DE')}</p>
                </div>
                {user.last_login && (
                  <div>
                    <label className="text-sm font-medium text-gray-600">Last Login</label>
                    <p className="text-gray-900">{new Date(user.last_login).toLocaleDateString('de-DE')}</p>
                  </div>
                )}
                {user?.zendesk_ticket_id && (
                  <div>
                    <label className="text-sm font-medium text-gray-600">Zendesk Ticket</label>
                    <p className="text-gray-900 font-mono">{user.zendesk_ticket_id}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Documents */}
            <div className="bg-gray-50 rounded-lg p-4  w-[50%] ">
              <div className="flex items-center justify-between mb-4 gap-3 max-h-[80px]">
                <div className="flex items-center shrink-0">
                  <DocumentTextIcon className="w-8 h-8 mr-3" style={{ color: '#9f1a1d' }} />
                  <h3 className="text-lg font-semibold">Documents ({user.documents?.length || 0})</h3>
                </div>
                {user.documents && user.documents.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={downloadAllDocuments}
                      disabled={downloadingAllDocuments}
                      className={`flex w-fit gap-2 items-center px-2 py-3 text-sm font-medium rounded-md transition-colors ${downloadingAllDocuments
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'text-white hover:opacity-90'
                        }`}
                      style={downloadingAllDocuments ? {} : { backgroundColor: '#9f1a1d' }}
                      title="Download all documents as ZIP archive"
                    >
                      {downloadingAllDocuments ? (
                        <>
                          <ArrowPathIcon className="w-4 h-4 mr-2 animate-spin" />
                          Wird vorbereitet...
                        </>
                      ) : (
                        <>
                          <ArrowDownTrayIcon className="w-4 h-4 " />
                          Alle Dokumente herunterladen
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setShowReprocessModal(true)}
                      disabled={reprocessingDocuments}
                      className={`inline-flex items-center px-2 py-3 text-sm font-medium rounded-md transition-colors border-2 ${reprocessingDocuments
                        ? 'bg-gray-300 text-gray-500 border-gray-300 cursor-not-allowed'
                        : 'bg-orange-50 text-orange-700 border-orange-400 hover:bg-orange-100'
                        }`}
                      title="Re-process all documents through AI pipeline (DESTRUCTIVE)"
                    >
                      {reprocessingDocuments ? (
                        <>
                          <ArrowPathIcon className="w-4 h-4 mr-2 animate-spin" />
                          Wird neu verarbeitet...
                        </>
                      ) : (
                        <>
                          <ArrowUturnLeftIcon className="w-4 h-4 mr-2" />
                          Alle neu verarbeiten
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
              <div className="space-y-3  overflow-y-auto max-h-[400px]">
                {user?.documents && user?.documents?.length > 0 ? (
                  user?.documents?.map((doc, idx) => {
                    const statusInfo = getDocumentStatusInfo(doc);
                    return (
                      <div key={doc.id} className={`border border-gray-200 rounded-lg p-3 `}>
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3">

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-col items-start gap-1  mb-1">
                                <p className="text-sm font-medium text-gray-900 truncate flex gap-2" title={doc.name}>
                                  {getDocumentStatusIcon(doc)}
                                  {(() => {
                                    const name = doc.name;
                                    const lastDotIndex = name?.lastIndexOf('.');
                                    if (lastDotIndex === -1 || name?.length <= 25) return name;
                                    const extension = name?.slice(lastDotIndex);
                                    const baseName = name?.slice(0, lastDotIndex);
                                    const maxBaseLength = 25 - extension?.length - 3; // 3 for "..."
                                    if (baseName?.length <= maxBaseLength) return name;
                                    return baseName?.slice(0, maxBaseLength) + '...' + extension;
                                  })()}
                                </p>
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusInfo.badge.color}`}>
                                  {statusInfo.badge.text}
                                </span>
                              </div>

                              {/* AI Confidence - always show if available */}
                              {doc.confidence && (
                                <p className="text-xs text-gray-500 mb-2">
                                  <strong>AI-Sicherheit:</strong> {Math.round(doc.confidence * 100)}%
                                </p>
                              )}

                              {/* Creditor Information - only show for creditor documents or manual review */}
                              {statusInfo?.showCreditorInfo && doc.extracted_data?.creditor_data && (
                                <div className="mt-2 p-2 bg-red-50 rounded text-xs border border-red-200">
                                  <div className="space-y-1">
                                    {doc.extracted_data.creditor_data.sender_name && (
                                      <p><strong>Gläubiger:</strong> {doc.extracted_data.creditor_data.sender_name}</p>
                                    )}
                                    {doc.extracted_data.creditor_data.claim_amount && (
                                      <p><strong>Forderung:</strong> <span className="font-semibold text-red-700">€{doc.extracted_data.creditor_data.claim_amount}</span></p>
                                    )}
                                    {doc.extracted_data.creditor_data.reference_number && (
                                      <p><strong>Aktenzeichen:</strong> <span className="font-mono">{doc.extracted_data.creditor_data.reference_number}</span></p>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Summary for non-creditor documents */}
                              {!statusInfo.showCreditorInfo && doc.processing_status === 'completed' && (
                                <div className="mt-2 text-xs text-gray-600">
                                  <p className="italic">Dieses Dokument enthält keine Gläubigerforderung</p>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex-shrink-0 space-x-2">
                            <button
                              onClick={() => downloadDocument(doc.id, doc.name)}
                              disabled={downloadingDocs[doc.id]}
                              className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-md border hover:bg-gray-50 transition-colors text-gray-600 border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {downloadingDocs[doc.id] ? (
                                <ArrowPathIcon className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <ArrowDownTrayIcon className="w-3 h-3 mr-1" />
                              )}
                              {downloadingDocs[doc.id] ? 'Loading...' : 'Download'}
                            </button>
                            <button
                              onClick={() => {
                                console.log('Details button clicked for document:', doc);
                                setSelectedDocument(doc);
                              }}
                              className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-md border hover:bg-red-50 transition-colors"
                              style={{ color: '#9f1a1d', borderColor: '#9f1a1d' }}
                            >
                              <EyeIcon className="w-3 h-3 mr-1" />
                              Details
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-gray-500 text-sm">No documents uploaded</p>
                )}
              </div>
            </div>

            {/* Creditors */}
            <div className="bg-gray-50 rounded-lg p-4  w-[25%]">
              <div className="flex items-center mb-4">
                <BuildingOfficeIcon className="w-8 h-8 mr-3" style={{ color: '#9f1a1d' }} />
                <h3 className="text-lg font-semibold">Creditors ({user.final_creditor_list?.length || 0})</h3>
              </div>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {user.final_creditor_list && user.final_creditor_list.length > 0 ? (
                  user.final_creditor_list.map((creditor) => (
                    <div key={creditor.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-gray-900">{creditor.sender_name}</p>
                        {creditor.sender_email && (
                          <p className="text-xs text-gray-600">{creditor.sender_email}</p>
                        )}
                        {creditor.claim_amount && (
                          <p className="text-xs text-gray-600">Amount: €{creditor.claim_amount}</p>
                        )}
                        {creditor.reference_number && (
                          <p className="text-xs text-gray-500">Ref: {creditor.reference_number}</p>
                        )}
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${creditor.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                          creditor.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                          {creditor.status}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-sm">No creditors identified</p>
                )}
              </div>
            </div>
          </div>

          {/* Analytics Summary */}
          <div className="mt-6 bg-gray-50 rounded-lg p-6">
            <div className="flex items-center mb-4">
              <ChartBarIcon className="w-8 h-8 mr-3" style={{ color: '#9f1a1d' }} />
              <h3 className="text-lg font-semibold">Analytics Summary</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold" style={{ color: '#9f1a1d' }}>{user.documents?.length || 0}</p>
                <p className="text-sm text-gray-600">Total Documents</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">
                  {user.documents?.filter(d => d.processing_status === 'completed').length || 0}
                </p>
                <p className="text-sm text-gray-600">Processed</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-yellow-600">
                  {user.documents?.filter(d => d.processing_status === 'processing').length || 0}
                </p>
                <p className="text-sm text-gray-600">Processing</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold" style={{ color: '#9f1a1d' }}>{user.final_creditor_list?.length || 0}</p>
                <p className="text-sm text-gray-600">Creditors</p>
              </div>
            </div>
          </div>

          {/* Settlement Response Tracking Section */}
          {/* {showSettlementPlan && ( */}
          <div className="mt-6 bg-purple-50 rounded-lg p-6 border border-purple-200">
            <div className="flex items-center mb-4">
              <ChartBarIcon className="w-6 h-6 mr-2 text-purple-600" />
              <h3 className="text-lg font-semibold text-purple-800">Settlement Plan Response Tracking</h3>
              <div className="ml-auto text-sm text-purple-600">
                Auto-refreshing every minute
              </div>
            </div>

            {/* Summary Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              <div className="bg-white rounded-lg p-3 text-center border border-purple-200">
                <p className="text-lg font-bold text-purple-600">{settlementSummary?.total_creditors}</p>
                <p className="text-xs text-purple-800">Total</p>
              </div>
              <div className="bg-white rounded-lg p-3 text-center border border-green-200">
                <p className="text-lg font-bold text-green-600">{settlementSummary?.accepted}</p>
                <p className="text-xs text-green-800">Accepted</p>
              </div>
              <div className="bg-white rounded-lg p-3 text-center border border-red-200">
                <p className="text-lg font-bold text-red-600">{settlementSummary?.declined}</p>
                <p className="text-xs text-red-800">Declined</p>
              </div>
              <div className="bg-white rounded-lg p-3 text-center border border-yellow-200">
                <p className="text-lg font-bold text-yellow-600">{settlementSummary?.counter_offers}</p>
                <p className="text-xs text-yellow-800">Counter</p>
              </div>
              <div className="bg-white rounded-lg p-3 text-center border border-gray-200">
                <p className="text-lg font-bold text-gray-600">{settlementSummary?.no_responses}</p>
                <p className="text-xs text-gray-800">No Response</p>
              </div>
            </div>

            {/* Acceptance Rate */}
            <div className="bg-white rounded-lg p-3 mb-4 border border-purple-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-purple-900">Acceptance Rate</span>
                <div className="text-right">
                  <span className="text-xl font-bold text-purple-600">{settlementSummary?.acceptance_rate}%</span>
                  <span className="text-xs text-purple-800 ml-2">
                    ({settlementSummary?.accepted}/{settlementSummary?.total_creditors})
                  </span>
                </div>
              </div>
            </div>

            {/* Creditor Response Table */}
            <div className="bg-white rounded-lg border border-purple-200 overflow-hidden">
              <div className="px-4 py-3 bg-purple-100 border-b border-purple-200">
                <h4 className="text-sm font-medium text-purple-900">Creditor Responses</h4>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Creditor
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Amount
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Response
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {user?.final_creditor_list?.filter(creditor => creditor.settlement_side_conversation_id || creditor.settlement_plan_sent_at).map((creditor: Creditor, index: number) => {
                      // Use settlement status from database, fallback to 'pending'
                      const status = creditor.settlement_response_status || 'pending';

                      const getStatusColor = (status: string) => {
                        switch (status) {
                          case 'accepted': return 'bg-green-100 text-green-800';
                          case 'declined': return 'bg-red-100 text-red-800';
                          case 'counter_offer': return 'bg-yellow-100 text-yellow-800';
                          case 'no_response': return 'bg-gray-100 text-gray-800';
                          case 'pending': return 'bg-blue-100 text-blue-800';
                          default: return 'bg-gray-100 text-gray-800';
                        }
                      };

                      const getStatusIcon = (status: string) => {
                        switch (status) {
                          case 'accepted': return '✅';
                          case 'declined': return '❌';
                          case 'counter_offer': return '🔄';
                          case 'no_response': return '⏰';
                          case 'pending': return '⏳';
                          default: return '❓';
                        }
                      };

                      return (
                        <tr key={creditor.id || index} className="hover:bg-gray-50">
                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{creditor.sender_name}</div>
                            <div className="text-xs text-gray-500">{creditor.sender_email}</div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="text-sm font-semibold text-gray-900">
                              {creditor.claim_amount ? `€${creditor.claim_amount.toFixed(2)}` : 'N/A'}
                            </div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
                              {getStatusIcon(status)} {status === 'no_response' ? 'No Answer' : status === 'counter_offer' ? 'Counter' : status.charAt(0).toUpperCase() + status.slice(1)}
                            </span>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-600">
                            {creditor.settlement_response_received_at
                              ? new Date(creditor.settlement_response_received_at).toLocaleDateString('de-DE')
                              : creditor.settlement_plan_sent_at
                                ? new Date(creditor.settlement_plan_sent_at).toLocaleDateString('de-DE') + ' (sent)'
                                : '-'
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {(!user?.final_creditor_list?.some(creditor => creditor.settlement_side_conversation_id || creditor.settlement_plan_sent_at)) && (
                  <div className="text-center py-8 text-gray-500">
                    <p>No settlement plans have been sent yet.</p>
                    <p className="text-xs mt-1">Click the "Letzte Zahlung bestätigen" button to trigger settlement emails.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* )} */}

          {/* Nullplan Response Tracking Section */}
          {isNullplanClient && hasNullplanSent && (
            <div className="mt-6 bg-green-50 rounded-lg p-6 border border-green-200">
              <div className="flex items-center mb-4">
                <ChartBarIcon className="w-6 h-6 mr-2 text-green-600" />
                <h3 className="text-lg font-semibold text-green-800">Nullplan Response Tracking</h3>
                <div className="ml-auto text-sm text-green-600">
                  Auto-refreshing every minute
                </div>
              </div>

              {/* Summary Statistics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-white rounded-lg p-3 text-center border border-green-200">
                  <p className="text-lg font-bold text-green-600">{nullplanSummary?.total_creditors || 0}</p>
                  <p className="text-xs text-green-800">Total</p>
                </div>
                <div className="bg-white rounded-lg p-3 text-center border border-blue-200">
                  <p className="text-lg font-bold text-blue-600">{nullplanSummary?.accepted || 0}</p>
                  <p className="text-xs text-blue-800">Accepted</p>
                </div>
                <div className="bg-white rounded-lg p-3 text-center border border-red-200">
                  <p className="text-lg font-bold text-red-600">{nullplanSummary?.declined || 0}</p>
                  <p className="text-xs text-red-800">Declined</p>
                </div>
                <div className="bg-white rounded-lg p-3 text-center border border-gray-200">
                  <p className="text-lg font-bold text-gray-600">{nullplanSummary?.no_responses || 0}</p>
                  <p className="text-xs text-gray-800">No Response</p>
                </div>
              </div>

              {/* Legal Information */}
              <div className="bg-white rounded-lg p-3 mb-4 border border-green-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-green-900">Nullplan Status</span>
                  <div className="text-right">
                    <span className="text-sm font-medium text-green-600">§ 305 Abs. 1 Nr. 1 InsO</span>
                    <span className="text-xs text-green-800 ml-2 block">
                      Pfändbares Einkommen: 0,00 EUR
                    </span>
                  </div>
                </div>
              </div>

              {/* Creditor Response Table */}
              <div className="bg-white rounded-lg border border-green-200 overflow-hidden">
                <div className="px-4 py-3 bg-green-100 border-b border-green-200">
                  <h4 className="text-sm font-medium text-green-900">Creditor Responses</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Creditor
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Amount
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Response
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Date
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {user?.final_creditor_list?.filter(creditor => creditor.nullplan_side_conversation_id || creditor.nullplan_sent_at).map((creditor: Creditor, index: number) => {
                        // Use nullplan status from database, fallback to 'pending'
                        const status = creditor.nullplan_response_status || 'pending';

                        const getStatusColor = (status: string) => {
                          switch (status) {
                            case 'accepted': return 'bg-blue-100 text-blue-800';
                            case 'declined': return 'bg-red-100 text-red-800';
                            case 'no_response': return 'bg-gray-100 text-gray-800';
                            case 'pending': return 'bg-yellow-100 text-yellow-800';
                            default: return 'bg-gray-100 text-gray-800';
                          }
                        };

                        const getStatusIcon = (status: string) => {
                          switch (status) {
                            case 'accepted': return '✅';
                            case 'declined': return '❌';
                            case 'no_response': return '⏰';
                            case 'pending': return '⏳';
                            default: return '❓';
                          }
                        };

                        return (
                          <tr key={creditor.id || index} className="hover:bg-gray-50">
                            <td className="px-3 py-3 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">{creditor.sender_name}</div>
                              <div className="text-xs text-gray-500">{creditor.sender_email}</div>
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <div className="text-sm font-semibold text-gray-900">
                                {creditor.claim_amount ? `€${creditor.claim_amount.toFixed(2)}` : 'N/A'}
                              </div>
                              <div className="text-xs text-red-600 font-medium">Payment: €0.00</div>
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
                                {getStatusIcon(status)} {status === 'no_response' ? 'No Answer' : status.charAt(0).toUpperCase() + status.slice(1)}
                              </span>
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-600">
                              {creditor.nullplan_response_received_at
                                ? new Date(creditor.nullplan_response_received_at).toLocaleDateString('de-DE')
                                : creditor.nullplan_sent_at
                                  ? new Date(creditor.nullplan_sent_at).toLocaleDateString('de-DE') + ' (sent)'
                                  : '-'
                              }
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {(!user?.final_creditor_list?.some(creditor => creditor.nullplan_side_conversation_id || creditor.nullplan_sent_at)) && (
                    <div className="text-center py-8 text-gray-500">
                      <p>No nullplan documents have been sent yet.</p>
                      <p className="text-xs mt-1">Nullplan will be automatically sent when financial data shows 0 garnishable income.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Financial Data Section */}
          {/* <div className="mt-6 bg-yellow-50 rounded-lg p-6 border border-yellow-200">
          <div className="flex items-center mb-4">
            <CurrencyEuroIcon className="w-6 h-6 mr-2 text-yellow-600" />
            <h3 className="text-lg font-semibold text-yellow-800">Financial Data</h3>
          </div>
          
          {user.has_financial_data && user.financial_data ? (
            <div className="bg-white rounded-lg p-4 border">
              <h4 className="font-medium text-gray-900 mb-3">✅ Current Financial Data</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="font-medium text-gray-700">Net Income</p>
                  <p className="text-lg font-bold text-green-600">€{user.financial_data.net_income ? user.financial_data.net_income.toFixed(2) : '0.00'}</p>
                </div>
                <div>
                  <p className="font-medium text-gray-700">Dependents</p>
                  <p className="text-lg font-bold">{user.financial_data.dependents ?? 0}</p>
                </div>
                <div>
                  <p className="font-medium text-gray-700">Marital Status</p>
                  <p className="text-lg font-bold capitalize">{user.financial_data.marital_status || 'ledig'}</p>
                </div>
                <div>
                  <p className="font-medium text-gray-700">Pfändbar Amount</p>
                  <p className="text-lg font-bold text-red-600">€{user.financial_data.pfaendbar_amount ? user.financial_data.pfaendbar_amount.toFixed(2) : '0.00'}</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Entered on {user.financial_data.input_date ? new Date(user.financial_data.input_date).toLocaleDateString('de-DE') : 'Unknown'} by {user.financial_data.input_by || 'Unknown'}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-lg p-4 border">
              <h4 className="font-medium text-gray-900 mb-3">💰 Enter Financial Data</h4>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Net Income (€)
                    </label>
                    <input
                      type="number"
                      value={financialForm.net_income}
                      onChange={(e) => handleFinancialFormChange('net_income', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                      placeholder="2500.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Dependents
                    </label>
                    <input
                      type="number"
                      value={financialForm.dependents}
                      onChange={(e) => handleFinancialFormChange('dependents', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Marital Status
                    </label>
                    <select
                      value={financialForm.marital_status}
                      onChange={(e) => handleFinancialFormChange('marital_status', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                    >
                      <option value="ledig">Ledig</option>
                      <option value="verheiratet">Verheiratet</option>
                      <option value="geschieden">Geschieden</option>
                      <option value="verwitwet">Verwitwet</option>
                    </select>
                  </div>
                </div>
                
                {pfaendbarAmount !== null && (
                  <div className="bg-yellow-100 rounded-lg p-3 border border-yellow-300">
                    <p className="text-sm font-medium text-yellow-800">
                      💰 Calculated Pfändbar Amount: <span className="text-lg font-bold">€{pfaendbarAmount.toFixed(2)}</span> per month
                    </p>
                  </div>
                )}
                
                <button
                  onClick={saveFinancialData}
                  disabled={savingFinancial || !financialForm.net_income || pfaendbarAmount === null}
                  className="inline-flex items-center px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingFinancial ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircleIcon className="w-4 h-4 mr-2" />
                      Save Financial Data
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div> */}

          {/* Manual Creditor Management Section */}
          <div className="mt-6">
            <ManualCreditorManager
              clientId={userId}
              onCreditorAdded={fetchUserDetails}
              onCreditorUpdated={fetchUserDetails}
              onCreditorDeleted={fetchUserDetails}
            />
          </div>

          {/* Seven Day Review Trigger Section */}
          <div className="mt-6">
            <SevenDayReviewTrigger
              clientId={userId}
              clientName={`${user.firstName} ${user.lastName}`}
              sevenDayReviewScheduled={user.seven_day_review_scheduled || false}
              sevenDayReviewTriggered={user.seven_day_review_triggered || false}
              scheduledAt={user.seven_day_review_scheduled_at}
              onTriggerSuccess={fetchUserDetails}
            />
          </div>

          {/* Delete User Section - Danger Zone */}
          <div className="mt-8 border-t-2 border-red-200 pt-6">
            <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6">
              <h3 className="text-lg font-bold text-red-900 mb-2">⚠️ Danger Zone</h3>
              <p className="text-sm text-red-700 mb-4">
                Permanently delete this user and all associated data. This action cannot be undone.
              </p>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="px-6 py-2 bg-red-600 text-white font-medium rounded-md hover:bg-red-700 transition-colors inline-flex items-center"
              >
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete User Permanently
              </button>
            </div>
          </div>

        </div>
        {/* End Scrollable Content */}

        {/* Fixed Footer */}
        <div className="flex-shrink-0 flex justify-end p-6 border-t border-gray-200 bg-white">
          <button
            onClick={onClose}
            className="px-6 py-2 text-gray-700 rounded-md hover:bg-gray-400"
            style={{ backgroundColor: '#f3f4f6' }}
          >
            Close
          </button>
        </div>

        {/* Document Detail Modal */}
        <Dialog open={!!selectedDocument} onOpenChange={(open) => !open && setSelectedDocument(null)}>
          <DialogContent className=" w-[700px]  max-h-[90vh] p-0 bg-white flex flex-col" showCloseButton={false}>
            {selectedDocument && (
              <>
                {/* Fixed Header */}
                <DialogHeader className="flex flex-row items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
                  <div className="flex items-center space-x-3 pr-8">
                    <InformationCircleIcon className="w-8 h-8 flex-shrink-0" style={{ color: '#9f1a1d' }} />
                    <div className="min-w-0">
                      <DialogTitle className="text-xl font-semibold text-gray-900">Dokument Details</DialogTitle>
                      <DialogDescription className="text-sm text-gray-600 truncate">{selectedDocument.name}</DialogDescription>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedDocument(null)}
                    className="text-gray-400 hover:text-gray-600 absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 transition-colors"
                    title="Close"
                  >
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                </DialogHeader>

                {/* Scrollable Content */}
                <div className="p-6 space-y-6 overflow-y-auto flex-1">
                  {/* Document Status & Basic Info */}
                  <div className="flex flex-col  gap-3">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="text-lg font-semibold mb-3 text-gray-900">📄 Dokument Information</h3>
                      <div className="space-y-2">
                        <div>
                          <span className="font-medium text-gray-600">Status:</span>
                          <span className={`ml-2 px-2 py-1 text-xs rounded-full ${selectedDocument.processing_status === 'completed' ? 'bg-green-100 text-green-800' :
                            selectedDocument.processing_status === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                            {selectedDocument.processing_status === 'completed' ? 'Verarbeitet' :
                              selectedDocument.processing_status === 'processing' ? 'Wird verarbeitet...' : 'Fehler'}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-600">Hochgeladen:</span>
                          <span className="ml-2 text-gray-900">{new Date(selectedDocument.uploadedAt).toLocaleString('de-DE')}</span>
                        </div>
                        {selectedDocument.processed_at && (
                          <div>
                            <span className="font-medium text-gray-600">Verarbeitet:</span>
                            <span className="ml-2 text-gray-900">{new Date(selectedDocument.processed_at).toLocaleString('de-DE')}</span>
                          </div>
                        )}
                        {selectedDocument.size && (
                          <div>
                            <span className="font-medium text-gray-600">Dateigröße:</span>
                            <span className="ml-2 text-gray-900">{(selectedDocument.size / (1024 * 1024)).toFixed(2)} MB</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="text-lg font-semibold mb-3 text-gray-900">🤖 KI-Analyse</h3>
                      <div className="space-y-2">
                        <div>
                          <span className="font-medium text-gray-600">Gläubigerdokument:</span>
                          <span className={`ml-2 px-2 py-1 text-xs rounded-full ${selectedDocument.is_creditor_document ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                            }`}>
                            {selectedDocument.is_creditor_document ? 'JA' : 'NEIN'}
                          </span>
                        </div>
                        {selectedDocument.confidence && (
                          <div>
                            <span className="font-medium text-gray-600">Sicherheit:</span>
                            <span className="ml-2 text-gray-900 font-mono">{Math.round(selectedDocument.confidence * 100)}%</span>
                          </div>
                        )}
                        {selectedDocument.document_status && (
                          <div>
                            <span className="font-medium text-gray-600">Dokumentstatus:</span>
                            <span className="ml-2 text-gray-900">{selectedDocument.document_status}</span>
                          </div>
                        )}
                        {selectedDocument.manual_review_required && (
                          <div>
                            <span className="font-medium text-gray-600">Manuelle Prüfung:</span>
                            <span className="ml-2 px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">Erforderlich</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Creditor Data - Show for all documents with creditor_data */}
                  {selectedDocument.extracted_data?.creditor_data && (
                    <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                      <h3 className="text-lg font-semibold mb-3 text-red-900">🏛️ Gläubiger-Informationen</h3>

                      {/* Key Information Summary */}
                      <div className="bg-white rounded-lg p-3 mb-4 border border-red-300">
                        <h4 className="font-semibold text-red-800 mb-2">📋 Wichtige Daten im Überblick</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                          <div>
                            <span className="font-medium text-gray-600">Aktenzeichen:</span>
                            <p className="text-gray-900 font-mono">{selectedDocument.extracted_data.creditor_data.reference_number || 'Nicht verfügbar'}</p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-600">Forderungssumme:</span>
                            <p className="text-red-700 font-bold">{selectedDocument.extracted_data.creditor_data.claim_amount ? `€${selectedDocument.extracted_data.creditor_data.claim_amount}` : 'Nicht verfügbar'}</p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-600">Forderung gegen:</span>
                            <p className="text-gray-900">{user?.firstName} {user?.lastName} ({user?.aktenzeichen})</p>
                          </div>
                        </div>
                      </div>

                      {/* Detailed Information */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-3">
                          <div>
                            <span className="font-medium text-red-700">Absender/Gläubiger:</span>
                            <p className="text-red-900 mt-1">{selectedDocument.extracted_data.creditor_data.sender_name || 'Nicht verfügbar'}</p>
                          </div>
                          {selectedDocument.extracted_data.creditor_data.sender_email && (
                            <div>
                              <span className="font-medium text-red-700">E-Mail:</span>
                              <p className="text-red-900 mt-1">{selectedDocument.extracted_data.creditor_data.sender_email}</p>
                            </div>
                          )}
                          {selectedDocument.extracted_data.creditor_data.sender_address && (
                            <div>
                              <span className="font-medium text-red-700">Adresse:</span>
                              <p className="text-red-900 mt-1">{selectedDocument.extracted_data.creditor_data.sender_address}</p>
                            </div>
                          )}
                        </div>
                        <div className="space-y-3">
                          {selectedDocument.extracted_data.creditor_data.reference_number && (
                            <div>
                              <span className="font-medium text-red-700">Aktenzeichen/Referenz:</span>
                              <p className="text-red-900 mt-1 font-mono">{selectedDocument.extracted_data.creditor_data.reference_number}</p>
                            </div>
                          )}
                          {selectedDocument.extracted_data.creditor_data.claim_amount && (
                            <div>
                              <span className="font-medium text-red-700">Forderungssumme:</span>
                              <p className="text-red-900 mt-1 text-xl font-bold">€{selectedDocument.extracted_data.creditor_data.claim_amount}</p>
                            </div>
                          )}
                          {selectedDocument.extracted_data.creditor_data.is_representative && (
                            <div>
                              <span className="font-medium text-red-700">Vertreter:</span>
                              <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                                {selectedDocument.extracted_data.creditor_data.is_representative ? 'JA' : 'NEIN'}
                              </span>
                            </div>
                          )}
                          {selectedDocument.extracted_data.creditor_data.actual_creditor && (
                            <div>
                              <span className="font-medium text-red-700">Tatsächlicher Gläubiger:</span>
                              <p className="text-red-900 mt-1">{selectedDocument.extracted_data.creditor_data.actual_creditor}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* AI Reasoning */}
                  {selectedDocument.extracted_data?.reasoning && (
                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                      <h3 className="text-lg font-semibold mb-3 text-blue-900">🧠 KI-Begründung</h3>
                      <p className="text-blue-800 text-sm leading-relaxed">{selectedDocument.extracted_data.reasoning}</p>
                    </div>
                  )}

                  {/* Summary */}
                  {selectedDocument.summary && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="text-lg font-semibold mb-3 text-gray-900">📋 Zusammenfassung</h3>
                      <p className="text-gray-700 text-sm leading-relaxed">{selectedDocument.summary}</p>
                    </div>
                  )}

                  {/* Technical Details */}
                  {selectedDocument.extracted_data && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="text-lg font-semibold mb-3 text-gray-900">⚙️ Technische Details</h3>
                      <div className="flex flex-col gap-4 text-sm">
                        {selectedDocument.extracted_data.processing_method && (
                          <div>
                            <span className="font-medium text-gray-600">Verarbeitungsmethode:</span>
                            <p className="text-gray-900 mt-1 break-all">{selectedDocument.extracted_data.processing_method}</p>
                          </div>
                        )}
                        {selectedDocument.extracted_data.workflow_status && (
                          <div>
                            <span className="font-medium text-gray-600">Workflow-Status:</span>
                            <p className="text-gray-900 mt-1 break-words">{selectedDocument.extracted_data.workflow_status}</p>
                          </div>
                        )}
                        {selectedDocument.extracted_data.token_usage && (
                          <div>
                            <span className="font-medium text-gray-600">Token-Verbrauch:</span>
                            <p className="text-gray-900 mt-1">{selectedDocument.extracted_data.token_usage.total_tokens || 'N/A'} Tokens</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between pt-4 border-t border-gray-200">
                    <button
                      onClick={() => deleteDocument(selectedDocument.id, selectedDocument.name)}
                      disabled={deletingDocs[selectedDocument.id]}
                      className={`px-6 py-2 text-white rounded-md transition-colors ${
                        deletingDocs[selectedDocument.id]
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-red-600 hover:bg-red-700'
                      }`}
                      title="Dokument unwiderruflich löschen"
                    >
                      {deletingDocs[selectedDocument.id] ? 'Wird gelöscht...' : 'Dokument löschen'}
                    </button>
                    <button
                      onClick={() => setSelectedDocument(null)}
                      className="px-6 py-2 text-white rounded-md hover:opacity-90"
                      style={{ backgroundColor: '#9f1a1d' }}
                    >
                      Schließen
                    </button>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Settlement Plan Modal */}
        {showSettlementPlan && (
          <SchuldenbereinigungsplanView
            userId={userId}
            onClose={() => setShowSettlementPlan(false)}
            onBack={() => setShowSettlementPlan(false)}
          />
        )}

        {/* Re-Process All Documents Confirmation Modal */}
        <Dialog open={showReprocessModal && !!user} onOpenChange={(open) => {
          if (!open) {
            setShowReprocessModal(false);
            setReprocessConfirmText('');
          }
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] p-0 bg-white flex flex-col" showCloseButton={false}>
            {user && (
              <>
                {/* Fixed Header */}
                <div className="bg-orange-600 text-white p-6 rounded-t-lg flex-shrink-0 relative">
                  <div className="flex items-center space-x-3 pr-8">
                    <ExclamationTriangleIcon className="w-10 h-10 flex-shrink-0" />
                    <div>
                      <DialogTitle className="text-2xl font-bold text-white">Re-Process All Documents</DialogTitle>
                      <DialogDescription className="text-orange-100 text-sm mt-1">Destructive Action: This will delete all current AI processing results</DialogDescription>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowReprocessModal(false);
                      setReprocessConfirmText('');
                    }}
                    className="absolute top-4 right-4 text-white/80 hover:text-white bg-orange-700/30 hover:bg-orange-700/50 rounded-full p-1 transition-colors"
                    title="Close modal"
                  >
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                </div>

                {/* Scrollable Content */}
                <div className="p-6 space-y-6 overflow-y-auto flex-1">
                  {/* Warning Message */}
                  <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                    <p className="text-lg font-bold text-yellow-900 mb-2">
                      Are you sure you want to re-process all documents?
                    </p>
                    <div className="text-yellow-800">
                      <p className="font-semibold mb-1">User: {user.firstName} {user.lastName}</p>
                      <p className="font-semibold mb-1">Documents: {user.documents?.length || 0}</p>
                      <p className="font-semibold">Aktenzeichen: {user.aktenzeichen}</p>
                    </div>
                  </div>

                  {/* What will happen */}
                  <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-4">
                    <h3 className="font-bold text-orange-900 text-lg mb-3">This will DELETE and RE-CREATE:</h3>
                    <ul className="space-y-2 text-orange-800">
                      <li className="flex items-start">
                        <span className="mr-2">♻️</span>
                        <span><strong>All AI extraction results</strong> (creditor data, confidence scores, summaries)</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">♻️</span>
                        <span><strong>Document processing status</strong> (will be reset to 'pending')</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">♻️</span>
                        <span><strong>Creditor list</strong> (AI-extracted creditors will be removed and re-created)</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">♻️</span>
                        <span><strong>Document classifications</strong> (creditor vs. non-creditor)</span>
                      </li>
                    </ul>
                  </div>

                  {/* What will be preserved */}
                  <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
                    <h3 className="font-bold text-green-900 text-lg mb-3">✅ PRESERVED (will NOT be changed):</h3>
                    <ul className="space-y-2 text-green-800">
                      <li className="flex items-start">
                        <span className="mr-2">✓</span>
                        <span><strong>Original uploaded files</strong> (same file IDs, filenames, upload dates)</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">✓</span>
                        <span><strong>User account data</strong> (profile, email, credentials)</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">✓</span>
                        <span><strong>Manually-added creditors</strong> (only AI-extracted ones are removed)</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">✓</span>
                        <span><strong>Workflow status</strong> and history</span>
                      </li>
                    </ul>
                  </div>

                  {/* Confirmation Input */}
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">
                      To confirm, type "REPROCESS" in the box below:
                    </label>
                    <input
                      type="text"
                      value={reprocessConfirmText}
                      onChange={(e) => setReprocessConfirmText(e.target.value)}
                      placeholder="REPROCESS"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 font-mono"
                      disabled={reprocessingDocuments}
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex space-x-3 pt-4">
                    <button
                      onClick={() => {
                        setShowReprocessModal(false);
                        setReprocessConfirmText('');
                      }}
                      className="flex-1 px-6 py-3 bg-gray-200 text-gray-800 font-medium rounded-md hover:bg-gray-300 transition-colors"
                      disabled={reprocessingDocuments}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={reprocessAllDocuments}
                      disabled={reprocessingDocuments || reprocessConfirmText !== 'REPROCESS'}
                      className="flex-1 px-6 py-3 bg-orange-600 text-white font-bold rounded-md hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center"
                    >
                      {reprocessingDocuments ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                          Processing...
                        </>
                      ) : (
                        <>
                          <ArrowUturnLeftIcon className="w-5 h-5 mr-2" />
                          Re-Process All Documents
                        </>
                      )}
                    </button>
                  </div>

                  <p className="text-xs text-gray-500 text-center">
                    This action will be logged in the audit trail. Original files and metadata will be preserved.
                  </p>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete User Confirmation Modal */}
        <Dialog open={showDeleteModal && !!user} onOpenChange={(open) => {
          if (!open) {
            setShowDeleteModal(false);
            setDeleteConfirmText('');
          }
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 bg-white" showCloseButton={false}>
            {user && (
              <>
                <DialogHeader className="bg-red-600 text-white p-6 rounded-t-lg">
                  <div className="flex items-center space-x-3">
                    <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <DialogTitle className="text-2xl font-bold text-white">Delete User Account - Permanent Action</DialogTitle>
                      <DialogDescription className="text-red-100 text-sm mt-1">This action cannot be undone</DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                <div className="p-6 space-y-6">
                  {/* Warning Message */}
                  <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                    <p className="text-lg font-bold text-yellow-900 mb-2">
                      Are you sure you want to permanently delete this user?
                    </p>
                    <div className="text-yellow-800">
                      <p className="font-semibold mb-1">User: {user.firstName} {user.lastName}</p>
                      <p className="font-semibold mb-1">Email: {user.email}</p>
                      <p className="font-semibold">Aktenzeichen: {user.aktenzeichen}</p>
                    </div>
                  </div>

                  {/* What will be deleted */}
                  <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
                    <h3 className="font-bold text-red-900 text-lg mb-3">⚠️ WARNING: This will permanently delete:</h3>
                    <ul className="space-y-2 text-red-800">
                      <li className="flex items-start">
                        <span className="mr-2">🗑️</span>
                        <span><strong>User account</strong> and login credentials</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">📄</span>
                        <span><strong>{user.documents?.length || 0} documents</strong> and all uploaded files</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">🏢</span>
                        <span><strong>{user.final_creditor_list?.length || 0} creditors</strong> and all creditor data</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">💰</span>
                        <span><strong>Financial data</strong> {user.has_financial_data ? '(exists)' : '(none)'}</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">📋</span>
                        <span><strong>Workflow status</strong> and all processing history</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">💬</span>
                        <span><strong>Communication records</strong> and notes</span>
                      </li>
                    </ul>
                  </div>

                  {/* Confirmation Input */}
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">
                      To confirm deletion, type the user's email address exactly:
                      <span className="text-red-600 ml-2">{user.email}</span>
                    </label>
                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder={user.email}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono"
                      disabled={deleting}
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex space-x-3 pt-4">
                    <button
                      onClick={() => {
                        setShowDeleteModal(false);
                        setDeleteConfirmText('');
                      }}
                      className="flex-1 px-6 py-3 bg-gray-200 text-gray-800 font-medium rounded-md hover:bg-gray-300 transition-colors"
                      disabled={deleting}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteUser}
                      disabled={deleting || deleteConfirmText !== user.email}
                      className="flex-1 px-6 py-3 bg-red-600 text-white font-bold rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center"
                    >
                      {deleting ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                          Deleting...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete Permanently
                        </>
                      )}
                    </button>
                  </div>

                  <p className="text-xs text-gray-500 text-center">
                    This deletion will be logged in the audit trail for compliance purposes.
                  </p>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

      </DialogContent>
    </Dialog>
  );
};

export default UserDetailView;