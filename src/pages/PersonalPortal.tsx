import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CreditorUploadComponent from '../components/CreditorUploadComponent';
import ClientDataComponent from '../components/ClientDataComponent';
import ClientProgressTracker from '../components/ClientProgressTracker';
import ClientDocumentsViewer from '../components/ClientDocumentsViewer';
import ClientInvoicesViewer from '../components/ClientInvoicesViewer';
import CreditorConfirmation from '../components/CreditorConfirmation';
import FinancialDataForm from '../components/FinancialDataForm';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import api from '../config/api';

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
  const [financialDataSubmitted, setFinancialDataSubmitted] = useState(false);
  const [creditorResponsePeriod, setCreditorResponsePeriod] = useState<any>(null);

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
        setCreditorConfirmationData(creditorResponse.data);

        // Show creditor confirmation if workflow is ready and not completed
        const shouldShowCreditorConfirmation =
          creditorResponse.data &&
          (
            creditorResponse.data.workflow_status === 'awaiting_client_confirmation' ||
            creditorResponse.data.workflow_status === 'client_confirmation' ||
            creditorResponse.data.workflow_status === 'creditor_review' ||
            clientData.first_payment_received
          ) &&
          !creditorResponse.data.client_confirmed;

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

          setShowingFinancialForm(shouldShowFinancialForm && !alreadySubmitted);
          setFinancialDataSubmitted(alreadySubmitted);
          setCreditorResponsePeriod(periodInfo);
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
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 px-4 py-5">
        <div className="flex items-center justify-between">
          <div className="h-14 flex items-center justify-center">
            <img
              src={customLogo || "https://www.anwalt-privatinsolvenz-online.de/wp-content/uploads/2015/08/Logo-T-Scuric.png"}
              alt="Logo"
              className="h-auto w-auto max-h-full max-w-[140px] object-contain"
            />
          </div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold" style={{ color: customColors.primary }}>
              {customTitle}
            </h1>
            <button
              onClick={handleLogout}
              className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 px-3 rounded-full transition-colors"
            >
              Abmelden
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
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

        {/* Creditor upload component - conditional display based on workflow status */}
        {client?.workflow_status !== 'completed' ? (
          <div className={`relative ${showingCreditorConfirmation ? 'pointer-events-none' : ''}`}>
            <div className={showingCreditorConfirmation ? 'filter blur-sm' : ''}>
              <CreditorUploadComponent
                client={client}
                onUploadComplete={handleUploadComplete}
                showingCreditorConfirmation={showingCreditorConfirmation}
                documents={documents}
              />
            </div>

            {/* Overlay message when creditor confirmation is shown */}
            {showingCreditorConfirmation && (
              <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 rounded-lg">
                <div className="text-center p-6 max-w-md">
                  <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Upload momentan nicht möglich
                  </h3>
                  <p className="text-gray-600 mb-4">
                    Ihre Gläubigerliste wird gerade überprüft. Der Dokumentenupload ist während dieser Zeit gesperrt.
                  </p>
                  <p className="text-sm text-gray-500">
                    Falls Sie weitere Gläubigerdokumente haben, schreiben Sie uns bitte eine E-Mail.
                  </p>
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
                Dokumentensammlung abgeschlossen
              </h3>
              <p className="text-gray-600 mb-4">
                Sie haben Ihre Gläubigerliste bestätigt. Die Dokumentensammlung ist damit abgeschlossen.
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
          <FinancialDataForm
            clientId={clientId!}
            onFormSubmitted={handleFinancialFormSubmitted}
            customColors={customColors}
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



        {/* Rating prompt */}
        <div className="rounded-lg bg-gray-50 border border-gray-100 p-4 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-start flex-1">
              <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center mr-3"
                style={{ backgroundColor: `${customColors.primary}10` }}>
                <img
                  src="https://www.provenexpert.com/favicon.ico"
                  alt="ProvenExpert"
                  className="h-6 w-6 object-contain"
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
                backgroundColor: '#10b981',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#059669'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#10b981'}
            >
              Jetzt bewerten
            </a>
          </div>
        </div>

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
    </div>
  );
};

export default PersonalPortal;