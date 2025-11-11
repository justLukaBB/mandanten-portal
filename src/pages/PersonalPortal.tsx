import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CreditorUploadComponent from '../components/CreditorUploadComponent';
import ClientDataComponent from '../components/ClientDataComponent';
import ClientProgressTracker from '../components/ClientProgressTracker';
import ClientDocumentsViewer from '../components/ClientDocumentsViewer';
import ClientInvoicesViewer from '../components/ClientInvoicesViewer';
import CreditorConfirmation from '../components/CreditorConfirmation';
import FinancialDataForm from '../components/FinancialDataForm';
import { ArrowPathIcon, EllipsisVerticalIcon, XMarkIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import api from '../config/api';
import ClientAddressForm from '../components/ClientAddressForm';

/**
 * Personal/Client Portal Function Component
 * Combines all portal functionality into a reusable component
 * Optimized for mobile-first experience
 */
export const PersonalPortal = ({
  clientId: propClientId,
  onLogout,
  customProgressPhases,
  customLogo,
  customTitle = 'Mandantenportal',
  customColors = {
    primary: '#9f1a1d',
    primaryHover: '#7d1517'
  }
}: {
  clientId?: string;
  onLogout?: () => void;
  customProgressPhases?: Array<{ name: string; description: string }>;
  customLogo?: string;
  customTitle?: string;
  customColors?: {
    primary: string;
    primaryHover: string;
  };
}) => {
  const { clientId: paramClientId } = useParams();
  const navigate = useNavigate();
  const clientId = propClientId || paramClientId;

  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [creditorConfirmationData, setCreditorConfirmationData] = useState<any>(null);
  const [showingCreditorConfirmation, setShowingCreditorConfirmation] = useState(false);
  const [showingFinancialForm, setShowingFinancialForm] = useState(false);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [financialDataSubmitted, setFinancialDataSubmitted] = useState(false);
  
  // Password change modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    fileNumber: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [forcePasswordChange, setForcePasswordChange] = useState(false);
  const [creditorResponsePeriod, setCreditorResponsePeriod] = useState<any>(null);
  const [previewFile, setPreviewFile] = useState<{
    loading?: boolean;
    url?: string;
    name?: string;
    type?: string;
  } | null>(null);


  // Default progress phases
  const defaultProgressPhases = [
    { name: 'Anfrage', description: 'Ihre Anfrage wurde erfasst und bearbeitet.' },
    { name: 'Vertrag', description: 'Der Vertrag wurde unterzeichnet.' },
    { name: 'Dokumente', description: 'Wir sammeln alle relevanten Gläubigerbriefe.' },
    { name: 'Bearbeitung', description: 'Wir analysieren Ihre Situation und erstellen einen Plan.' },
    { name: 'Abschluss', description: 'Der Prozess wird abgeschlossen.' }
  ];

  const progressPhases = customProgressPhases || defaultProgressPhases;

  // Fetch client data and documents
  const fetchClientData = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/clients/${clientId}`);
      const clientData = response.data;

      if (clientData.clickupId) {
        try {
          const formResponse = await api.get(`/api/proxy/forms/${clientData.clickupId}`);
          if (formResponse.data) {
            clientData.formData = formResponse.data;
          }
        } catch (formErr) {
          console.error('Error fetching form data:', formErr);
        }
      }

      // Fetch documents separately for better state management
      try {
        const documentsResponse = await api.get(`/api/clients/${clientId}/documents`);
        setDocuments(documentsResponse.data || []);
      } catch (docErr) {
        console.error('Error fetching documents:', docErr);
        setDocuments([]);
      }

      // Check for creditor confirmation status
      try {
        const creditorResponse = await api.get(`/api/clients/${clientId}/creditor-confirmation`);
        console.log('🔍 Creditor confirmation API response:', creditorResponse.data);
        setCreditorConfirmationData(creditorResponse.data);

        // Show creditor confirmation only after 7-day review is triggered or explicitly in review status
        // Do NOT show during the 7-day waiting period after payment + documents
        const shouldShowCreditorConfirmation =
          creditorResponse.data &&
          (
            creditorResponse.data.workflow_status === 'awaiting_client_confirmation' ||
            creditorResponse.data.workflow_status === 'client_confirmation' ||
            creditorResponse.data.workflow_status === 'creditor_review' ||
            (clientData.first_payment_received &&
              clientData.seven_day_review_triggered === true &&
              clientData.current_status === 'creditor_review')
          ) &&
          !creditorResponse.data.client_confirmed;

        console.log('🎯 Should show creditor confirmation:', shouldShowCreditorConfirmation, {
          workflow_status: creditorResponse.data?.workflow_status,
          client_confirmed: creditorResponse.data?.client_confirmed,
          current_status: clientData.current_status,
          admin_approved: clientData.admin_approved
        });

        setShowingCreditorConfirmation(shouldShowCreditorConfirmation);
      } catch (creditorErr) {
        console.log('No creditor confirmation data available yet');
        setCreditorConfirmationData(null);
        setShowingCreditorConfirmation(false);
      }

      // Check if financial data form should be shown (after creditor response period)
      try {
        const financialResponse = await api.get(`/api/clients/${clientId}/financial-form-status`);

        // Defensive programming - validate response structure
        if (financialResponse?.data) {
          const responseData = financialResponse.data;
          const shouldShowFinancialForm = responseData.should_show_form === true;
          const alreadySubmitted = responseData.form_submitted === true;
          const periodInfo = responseData.creditor_response_period || null;

          console.log('📋 Financial form status:', {
            shouldShow: shouldShowFinancialForm,
            submitted: alreadySubmitted,
            periodStatus: periodInfo?.status,
            daysRemaining: periodInfo?.days_remaining,
            responseReceived: true
          });

          // setShowAddressForm(!responseData.)

          setShowingFinancialForm(shouldShowFinancialForm && !alreadySubmitted);
          setFinancialDataSubmitted(alreadySubmitted);
          setCreditorResponsePeriod(periodInfo);
          const shouldShowAddressForm = shouldShowFinancialForm || alreadySubmitted;

          setShowAddressForm(shouldShowAddressForm);
        } else {
          console.warn('Invalid financial form status response structure');
          setShowingFinancialForm(false);
          setFinancialDataSubmitted(false);
          setCreditorResponsePeriod(null);
        }
      } catch (financialErr: any) {
        console.error('Financial form status error:', financialErr);
        // Differentiate between network errors and other errors
        if (financialErr.code === 'NETWORK_ERROR' || financialErr.response?.status >= 500) {
          console.log('Server error - financial form status not available');
        } else {
          console.log('Financial form not ready yet - creditor period may not be expired');
        }
        setShowingFinancialForm(false);
        setFinancialDataSubmitted(false);
        setCreditorResponsePeriod(null);
      }

      setClient(clientData);
      setError(null);
    } catch (err) {
      console.error('Error fetching client data:', err);
      setError(
        "Es tut uns leid, wir können die Inhalte oder die Seite für Sie nicht anzeigen. Bitte versuchen Sie es erneut oder melden Sie sich mit Ihren Zugangsdaten erneut an."
      );

    } finally {
      setLoading(false);
    }
  };

  // Refresh documents and creditor confirmation status
  const refreshDocuments = async () => {
    try {
      const documentsResponse = await api.get(`/api/clients/${clientId}/documents`);
      setDocuments(documentsResponse.data || []);

      // Also refresh creditor confirmation status
      try {
        const creditorResponse = await api.get(`/api/clients/${clientId}/creditor-confirmation`);
        setCreditorConfirmationData(creditorResponse.data);

        const shouldShowCreditorConfirmation =
          creditorResponse.data &&
          (
            creditorResponse.data.workflow_status === 'awaiting_client_confirmation' ||
            creditorResponse.data.workflow_status === 'client_confirmation' ||
            creditorResponse.data.workflow_status === 'creditor_review'
          ) &&
          !creditorResponse.data.client_confirmed;

        setShowingCreditorConfirmation(shouldShowCreditorConfirmation);
      } catch (creditorErr) {
        console.log('No creditor confirmation data available during refresh');
        setCreditorConfirmationData(null);
        setShowingCreditorConfirmation(false);
      }
    } catch (error) {
      console.error('Error refreshing documents:', error);
    }
  };

  useEffect(() => {
    if (clientId) {
      fetchClientData();
    }
  }, [clientId]);

  // Add polling to check for status updates
  useEffect(() => {
    if (!clientId) return;

    // Poll every 30 seconds when creditor confirmation or financial form is not showing
    const interval = setInterval(() => {
      if (!showingCreditorConfirmation && !showingFinancialForm && !previewFile) {
        fetchClientData();
      }
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [clientId, showingCreditorConfirmation, showingFinancialForm, previewFile]);

  // Handle upload complete
  const handleUploadComplete = (newDocuments: any) => {
    // Add new documents to existing documents list
    // setDocuments(prevDocuments => [...prevDocuments, ...newDocuments]);
    // refreshDocuments()
  };

  // Handle financial form submission
  const handleFinancialFormSubmitted = (data: any) => {
    setFinancialDataSubmitted(true);
    setShowingFinancialForm(false);

    // Refresh client data to get updated status
    fetchClientData();
  };

  // Handle logout
  const handleLogout = () => {
    localStorage.clear();

    if (onLogout) {
      onLogout();
    } else {
      navigate('/login');
    }
  };

  // Password change functions
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordLoading(true);
    setPasswordError(null);
    setPasswordSuccess(false);

    // Validation
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Passwörter stimmen nicht überein');
      setPasswordLoading(false);
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setPasswordError('Passwort muss mindestens 6 Zeichen lang sein');
      setPasswordLoading(false);
      return;
    }

    try {
      const { data } = await api.post('/api/client/make-new-password', {
        file_number: passwordForm.fileNumber,
        new_password: passwordForm.newPassword
      });
      if (data?.success) {
        setPasswordSuccess(true);
        setPasswordForm({ fileNumber: '', newPassword: '', confirmPassword: '' });
        setTimeout(() => {
          setShowPasswordModal(false);
          setPasswordSuccess(false);
          setForcePasswordChange(false);
          // refresh client data to update isPasswordSet
          fetchClientData();
        }, 2000);
      } else {
        setPasswordError(data?.error || 'Fehler beim Ändern des Passworts');
      }
    } catch (error: any) {
      const apiError = error?.response?.data?.error || error?.message || 'Netzwerkfehler';
      setPasswordError(apiError);
    } finally {
      setPasswordLoading(false);
    }
  };

  const openPasswordModal = () => {
    setShowPasswordModal(true);
    setShowDropdown(false);
    setPasswordForm({ fileNumber: client?.aktenzeichen || '', newPassword: '', confirmPassword: '' });
    setPasswordError(null);
    setPasswordSuccess(false);
  };

  // Force password change on first login (if backend indicates no password yet)
  useEffect(() => {
    if (client && client.isPasswordSet === false) {
      setForcePasswordChange(true);
      setShowPasswordModal(true);
      setPasswordForm({ fileNumber: client?.aktenzeichen || '', newPassword: '', confirmPassword: '' });
    } else {
      setForcePasswordChange(false);
    }
  }, [client]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (showDropdown && !target.closest('.dropdown-container')) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-8 flex flex-col items-center justify-center">
        <ArrowPathIcon className={`h-8 w-8 animate-spin mb-4`} style={{ color: customColors.primary }} />
        <p className="text-gray-600">Daten werden geladen...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-8 flex flex-col items-center justify-center">
        <div className="w-full max-w-lg text-center">
          <h2 className="text-xl font-bold mb-2" style={{ color: customColors.primary }}>Fehler</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-white rounded-lg"
            style={{ backgroundColor: customColors.primary }}
          >
            Erneut versuchen
          </button>
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-white rounded-lg ms-1"
            style={{ backgroundColor: customColors.primary }}
          >
            Abmelden
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-8 md:h-10">
              <img
                src={customLogo || "https://www.schuldnerberatung-anwalt.de/wp-content/uploads/2024/10/Logo-T-Scuric.png"}
                alt="Logo"
                className="h-full object-contain"
              />
            </div>
            <h1 className="text-lg md:text-2xl font-semibold" style={{ color: customColors.primary }}>
              {customTitle}
            </h1>
          </div>
          
          {/* Three-dot dropdown menu */}
          <div className="relative dropdown-container">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors"
            >
              <EllipsisVerticalIcon className="h-6 w-6 text-gray-600" />
            </button>
            
            {showDropdown && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-50">
                <div className="py-1">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('Kennwort ändern clicked');
                      openPasswordModal();
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Kennwort ändern
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('Abmelden clicked');
                      handleLogout();
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Abmelden
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Progress tracker */}
        {/* <ClientProgressTracker 
          currentPhase={client?.phase || 2} 
          phases={progressPhases} 
        /> */}

        {/* Client data */}
        {/* <ClientDataComponent client={client} /> */}

        {/* Invoice viewer */}
        {/* <ClientInvoicesViewer client={client} /> */}

        {/* Previously uploaded documents viewer */}
        {/* <ClientDocumentsViewer client={client} /> */}

        {/* Creditor upload component - ALWAYS ACTIVE (iterative loop enabled) */}
        {client?.workflow_status !== 'completed' ? (
          <div className="relative">
            <CreditorUploadComponent
              client={client}
              onUploadComplete={handleUploadComplete}
              showingCreditorConfirmation={showingCreditorConfirmation}
              documents={documents}
              previewFile={previewFile}
              setPreviewFile={setPreviewFile}
            />

            {/* Info banner when creditor confirmation is pending */}
            {showingCreditorConfirmation && (
              <div className="mt-4 bg-blue-50 border-l-4 border-blue-400 rounded-lg p-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-blue-800">
                      <strong className="font-semibold">💡 Weitere Dokumente hochladen:</strong> Falls Ihnen auffällt, dass noch Gläubigerbriefe fehlen, können Sie diese jederzeit hier hochladen. Nach dem Upload werden die neuen Dokumente von unserem Team geprüft und Sie erhalten eine aktualisierte Gläubigerliste zur Bestätigung.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="text-center">
              <div className="mb-4">
                <div className="w-12 h-12 mx-auto rounded-full bg-green-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {client?.client_confirmed_creditors
                  ? 'Gläubigerliste bestätigt'
                  : 'Dokumentensammlung abgeschlossen'}
              </h3>
              <p className="text-gray-600 mb-4">
                {client?.client_confirmed_creditors
                  ? 'Sie haben Ihre Gläubigerliste bestätigt. Weitere Dokumenten-Uploads sind nicht mehr möglich.'
                  : 'Der Workflow ist abgeschlossen. Die Dokumentensammlung ist beendet.'}
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-red-800 mt-0.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-sm">
                    <p className="font-medium text-blue-800 mb-1">Weitere Gläubiger?</p>
                    <p className="text-blue-700">
                      Falls Sie weitere Gläubigerdokumente haben, wenden Sie sich bitte an unseren Support.
                      Weitere Uploads über das Portal sind nicht mehr möglich.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Creditor confirmation component - shows when ready for client confirmation */}
        <CreditorConfirmation clientId={clientId!} />

        {/* Creditor Response Period Status - shows during 30-day waiting period */}
        {creditorResponsePeriod && creditorResponsePeriod.status === 'active' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="text-center">
              <div className="mb-4">
                <div className="w-12 h-12 mx-auto rounded-full bg-blue-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Warten auf Gläubiger-Antworten
              </h3>
              <p className="text-gray-600 mb-4">
                Wir haben alle Gläubiger kontaktiert und warten auf ihre Antworten zu den Schuldenbeträgen.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3a4 4 0 118 0v4m-4 12h0m0 0h0m0 0h0" />
                  </svg>
                  <div className="text-center">
                    <p className="font-medium text-blue-800">
                      {creditorResponsePeriod.days_remaining} Tage verbleibend
                    </p>
                    <p className="text-sm text-blue-700 mt-1">
                      von 30 Tagen Antwortzeit für Gläubiger
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-500">
                Sobald die 30-Tage-Frist abgelaufen ist, werden Sie aufgefordert, Ihre aktuellen Finanzdaten
                für die Erstellung Ihres Schuldenbereinigungsplans anzugeben.
              </p>
            </div>
          </div>
        )}

        {/* Financial Data Form - shows after 30-day creditor response period */}
        {showingFinancialForm && (
          <>
            <FinancialDataForm
              clientId={clientId!}
              onFormSubmitted={handleFinancialFormSubmitted}
              customColors={customColors}
            />

          </>
        )}

        {showAddressForm && (
          <ClientAddressForm
            clientId={clientId!}
            client={client}
            customColors={customColors}
            onFormSubmitted={() => console.log('✅ Address form submitted')}
          />
        )}

        {/* Financial Data Submitted Status */}
        {financialDataSubmitted && !showingFinancialForm && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="text-center">
              <div className="mb-4">
                <div className="w-12 h-12 mx-auto rounded-full bg-green-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Finanzdaten übermittelt
              </h3>
              <p className="text-gray-600 mb-4">
                Ihre Finanzdaten wurden erfolgreich übermittelt und werden zur Erstellung Ihres Schuldenbereinigungsplans verwendet.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-sm">
                    <p className="font-medium text-blue-800 mb-1">In Bearbeitung</p>
                    <p className="text-blue-700">
                      Unser Team erstellt jetzt Ihren individuellen Schuldenbereinigungsplan.
                      Sie werden benachrichtigt, sobald dieser zur Überprüfung bereit ist.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}



        {/* Rating prompt - only show when NOT showing creditor confirmation */}
        {console.log('🎯 ProvenExpert display check:', { showingCreditorConfirmation, showingFinancialForm, clientConfirmed: client?.client_confirmed_creditors })}
        {!showingCreditorConfirmation && !showingFinancialForm && (
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-4 mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-start flex-1">
                <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center mr-3"
                  style={{ backgroundColor: `${customColors.primary}10` }}>
                  <img
                    src="https://cdn.brandfetch.io/idk-hgfUQ2/w/400/h/400/theme/dark/icon.jpeg?c=1dxbfHSJFAPEGdCLU4o5B"
                    alt="ProvenExpert"
                    className="h-10 w-10 object-cover rounded-full"
                  />
                </div>
                <div>
                  <h4 className="font-medium text-gray-900 text-sm">Ihre Erfahrung zählt</h4>
                  <p className="text-gray-600 text-xs mt-1">
                    Mit Ihrer Bewertung helfen Sie uns, unseren Service kontinuierlich zu verbessern.
                  </p>
                </div>
              </div>
              <a
                href="https://www.provenexpert.com/rechtsanwalt-thomas-scuric/9298/"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-full text-white text-xs font-medium transition-colors ml-4 whitespace-nowrap"
                style={{
                  backgroundColor: '#047857',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#065f46'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#047857'}
              >
                Jetzt bewerten
              </a>
            </div>
          </div>
        )}

        {/* Footer note */}
        <div className="text-center text-xs text-gray-500 pt-4 pb-16">
          <div className="flex justify-center mb-3">
            <div className="h-8 flex items-center justify-center">
              <img
                src={customLogo || "https://www.anwalt-privatinsolvenz-online.de/wp-content/uploads/2015/08/Logo-T-Scuric.png"}
                alt="Logo"
                className="h-auto w-auto max-h-full max-w-[80px] object-contain opacity-70"
              />
            </div>
          </div>
          <p>© 2025 T. Scuric Rechtsanwälte</p>
          <p className="mt-1">Bei Fragen nutzen Sie bitte die Support-Funktion</p>
        </div>
      </main>

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Kennwort ändern</h2>
              {!forcePasswordChange && (
                <button
                  onClick={() => setShowPasswordModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              )}
            </div>

            {passwordSuccess ? (
              <div className="text-center py-4">
                <div className="text-green-600 text-lg font-medium mb-2">✓ Passwort erfolgreich geändert!</div>
                <p className="text-gray-600">Das Modal schließt sich automatisch...</p>
              </div>
            ) : (
              <form onSubmit={handlePasswordChange} className="space-y-4">
                {forcePasswordChange && (
                  <div className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 p-3 rounded">
                    Aus Sicherheitsgründen müssen Sie jetzt ein Kennwort festlegen, bevor Sie fortfahren können.
                  </div>
                )}
                <div>
                  <label htmlFor="fileNumber" className="block text-sm font-medium text-gray-700 mb-1">
                    Aktenzeichen
                  </label>
                  <input
                    type="text"
                    id="fileNumber"
                    value={passwordForm.fileNumber}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 cursor-not-allowed"
                    required
                    disabled
                    readOnly
                  />
                </div>

                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    Neues Passwort
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      id="newPassword"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      aria-label={showNewPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                    >
                      {showNewPassword ? (
                        <EyeSlashIcon className="h-5 w-5" />
                      ) : (
                        <EyeIcon className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    Passwort bestätigen
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      id="confirmPassword"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-label={showConfirmPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                    >
                      {showConfirmPassword ? (
                        <EyeSlashIcon className="h-5 w-5" />
                      ) : (
                        <EyeIcon className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                {passwordError && (
                  <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md">
                    {passwordError}
                  </div>
                )}

                <div className="flex space-x-3 pt-4">
                  {!forcePasswordChange && (
                    <button
                      type="button"
                      onClick={() => setShowPasswordModal(false)}
                      className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                      disabled={passwordLoading}
                    >
                      Abbrechen
                    </button>
                  )}
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 text-white rounded-md transition-colors"
                    style={{ 
                      backgroundColor: customColors.primary,
                      opacity: passwordLoading ? 0.6 : 1
                    }}
                    disabled={passwordLoading}
                  >
                    {passwordLoading ? 'Wird geändert...' : 'Passwort ändern'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PersonalPortal;