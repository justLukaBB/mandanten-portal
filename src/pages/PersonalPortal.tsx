import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowPathIcon,
  EllipsisVerticalIcon,
  XMarkIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline';
import {
  useGetCurrentClientQuery,
  useGetClientDocumentsQuery,
  useGetCreditorConfirmationStatusQuery,
  useGetFinancialFormStatusQuery,
  useUpdatePasswordMutation
} from '../store/features/clientApi';
import { useDispatch } from 'react-redux';
import { logout, clearImpersonation } from '../store/features/authSlice';
import { useEndImpersonationMutation } from '../store/features/authApi';
import CreditorUploadComponent from '../components/CreditorUploadComponent';
import CreditorConfirmation from '../components/CreditorConfirmation';
import FinancialDataForm from '../components/FinancialDataForm';
import ClientAddressForm from '../components/ClientAddressForm';
import AddCreditorForm from '../components/AddCreditorForm';
import api from '../config/api';

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
  const dispatch = useDispatch();
  const clientId = propClientId || paramClientId;

  // RTK Query Hooks
  const {
    data: client,
    isLoading: clientLoading,
    error: clientError,
    refetch: refetchClient
  } = useGetCurrentClientQuery(clientId, { skip: !clientId });

  const {
    data: documents = [],
    refetch: refetchDocuments
  } = useGetClientDocumentsQuery(clientId, { skip: !clientId });

  const {
    data: creditorConfirmationData,
    refetch: refetchCreditorConfirmation
  } = useGetCreditorConfirmationStatusQuery(clientId, { skip: !clientId });

  const {
    data: financialStatusData,
    refetch: refetchFinancialStatus
  } = useGetFinancialFormStatusQuery(clientId, { skip: !clientId });

  const [updatePassword, { isLoading: passwordLoading, error: passwordMutationError }] = useUpdatePasswordMutation();
  const [endImpersonation] = useEndImpersonationMutation();

  // Derived state from query data
  const [showingCreditorConfirmation, setShowingCreditorConfirmation] = useState(false);
  const [showingFinancialForm, setShowingFinancialForm] = useState(false);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [financialDataSubmitted, setFinancialDataSubmitted] = useState(false);
  const [creditorResponsePeriod, setCreditorResponsePeriod] = useState<any>(null);

  // Password change modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    fileNumber: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [forcePasswordChange, setForcePasswordChange] = useState(false);

  const [previewFile, setPreviewFile] = useState<{
    loading?: boolean;
    url?: string;
    name?: string;
    type?: string;
  } | null>(null);

  // Impersonation state
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonationData, setImpersonationData] = useState<any>(null);

  // Default progress phases
  const defaultProgressPhases = [
    { name: 'Anfrage', description: 'Ihre Anfrage wurde erfasst und bearbeitet.' },
    { name: 'Vertrag', description: 'Der Vertrag wurde unterzeichnet.' },
    { name: 'Dokumente', description: 'Wir sammeln alle relevanten Gläubigerbriefe.' },
    { name: 'Bearbeitung', description: 'Wir analysieren Ihre Situation und erstellen einen Plan.' },
    { name: 'Abschluss', description: 'Der Prozess wird abgeschlossen.' }
  ];

  const progressPhases = customProgressPhases || defaultProgressPhases;

  // Effect to process derived state from API data
  useEffect(() => {
    if (client && creditorConfirmationData) {
      // Show creditor confirmation logic
      const shouldShowCreditorConfirmation =
        (
          creditorConfirmationData.workflow_status === 'awaiting_client_confirmation' ||
          creditorConfirmationData.workflow_status === 'client_confirmation' ||
          creditorConfirmationData.workflow_status === 'creditor_review' ||
          (client.first_payment_received &&
            client.seven_day_review_triggered === true &&
            client.current_status === 'creditor_review')
        ) &&
        !creditorConfirmationData.client_confirmed;

      setShowingCreditorConfirmation(shouldShowCreditorConfirmation);
    }

    if (financialStatusData) {
      const shouldShowFinancialForm = financialStatusData.should_show_form === true;
      const alreadySubmitted = financialStatusData.form_submitted === true;
      const periodInfo = financialStatusData.creditor_response_period || null;

      setShowingFinancialForm(shouldShowFinancialForm && !alreadySubmitted);
      setFinancialDataSubmitted(alreadySubmitted);
      setCreditorResponsePeriod(periodInfo);

      const shouldShowAddressForm = shouldShowFinancialForm || alreadySubmitted;
      setShowAddressForm(shouldShowAddressForm);
    }
  }, [client, creditorConfirmationData, financialStatusData]);

  // Handle upload complete
  const handleUploadComplete = (newDocuments: any) => {
    // RTK Query automatically handles this via tag invalidation if configured, 
    // but we can manually refetch if needed
    refetchDocuments();
  };

  // Handle financial form submission
  const handleFinancialFormSubmitted = (data: any) => {
    setFinancialDataSubmitted(true);
    setShowingFinancialForm(false);
    refetchClient();
    refetchFinancialStatus();
  };

  // Handle logout
  const handleLogout = () => {
    dispatch(logout()); // Use global action

    if (onLogout) {
      onLogout();
    } else {
      navigate('/login');
    }
  };

  // Handle exit impersonation
  const handleExitImpersonation = async () => {
    try {
      // Call backend to end impersonation session using RTK Query mutation
      await endImpersonation(undefined).unwrap();
    } catch (error) {
      console.error('Error ending impersonation session:', error);
    }

    // Clear local storage and state using Redux action
    dispatch(clearImpersonation());

    // Close window (since it was opened in a new tab)
    window.close();

    // If window.close() doesn't work (some browsers prevent it), redirect
    setTimeout(() => {
      window.location.href = '/admin';
    }, 100);
  };

  // Password change functions
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    setPasswordError(null);
    setPasswordSuccess(false);

    // Validation
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Passwörter stimmen nicht überein');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setPasswordError('Passwort muss mindestens 6 Zeichen lang sein');
      return;
    }

    try {
      // Use RTK Mutation
      await updatePassword({
        fileNumber: passwordForm.fileNumber,
        newPassword: passwordForm.newPassword
      }).unwrap();

      setPasswordSuccess(true);
      setPasswordForm({ fileNumber: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordSuccess(false);
        setForcePasswordChange(false);
        // refresh client data to update isPasswordSet
        refetchClient();
      }, 2000);
    } catch (error: any) {
      const apiError = error?.data?.error || error?.message || 'Netzwerkfehler';
      setPasswordError(apiError);
    }
  };

  const openPasswordModal = () => {
    setShowPasswordModal(true);
    setShowDropdown(false);
    setPasswordForm({ fileNumber: client?.aktenzeichen || '', newPassword: '', confirmPassword: '' });
    setPasswordError(null);
    setPasswordSuccess(false);
  };

  // Password change no longer required - using email verification flow

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

  if (clientLoading) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-8 flex flex-col items-center justify-center">
        <ArrowPathIcon className={`h-8 w-8 animate-spin mb-4`} style={{ color: customColors.primary }} />
        <p className="text-gray-600">Daten werden geladen...</p>
      </div>
    );
  }

  if (clientError) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-8 flex flex-col items-center justify-center">
        <div className="w-full max-w-lg text-center">
          <h2 className="text-xl font-bold mb-2" style={{ color: customColors.primary }}>Fehler</h2>
          <p className="text-gray-600 mb-4">{(clientError as any)?.data?.error || (clientError as any)?.message || 'Ein Fehler ist aufgetreten'}</p>
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

      {/* Impersonation Banner */}
      {isImpersonating && impersonationData && (
        <div className="bg-yellow-100 border-b-2 border-yellow-600 px-4 py-3">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-yellow-800">
                    Admin-Modus: Sie betrachten das Portal als Benutzer
                  </p>
                  <p className="text-xs text-yellow-700">
                    {client?.firstName} {client?.lastName} ({client?.email})
                  </p>
                </div>
              </div>
              <button
                onClick={handleExitImpersonation}
                className="flex-shrink-0 px-4 py-2 bg-yellow-600 text-white text-sm font-medium rounded-md hover:bg-yellow-700 transition-colors"
              >
                Admin-Modus beenden
              </button>
            </div>
          </div>
        </div>
      )}

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

        {/* Creditor upload component - conditional display based on workflow status and creditor confirmation */}
        {!client?.client_confirmed_creditors && !creditorConfirmationData?.client_confirmed ? (
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

            <AddCreditorForm
              clientId={clientId!}
              onClose={() => {
                // No longer needed for closing
              }}
              customColors={customColors}
              onSuccess={() => {
                // Refresh logic if needed
                refetchDocuments();
                refetchCreditorConfirmation();
              }}
            />
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
                {(client?.client_confirmed_creditors || creditorConfirmationData?.client_confirmed)
                  ? 'Gläubigerliste bestätigt'
                  : 'Dokumentensammlung abgeschlossen'}
              </h3>
              <p className="text-gray-600 mb-4">
                {(client?.client_confirmed_creditors || creditorConfirmationData?.client_confirmed)
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
        <CreditorConfirmation
          clientId={clientId!}
          onConfirmationComplete={() => {
            refetchClient();
            refetchCreditorConfirmation();
          }}
        />

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