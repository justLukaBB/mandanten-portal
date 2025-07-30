import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CreditorUploadComponent from '../components/CreditorUploadComponent';
import ClientDataComponent from '../components/ClientDataComponent';
import ClientProgressTracker from '../components/ClientProgressTracker';
import ClientDocumentsViewer from '../components/ClientDocumentsViewer';
import ClientInvoicesViewer from '../components/ClientInvoicesViewer';
import CreditorConfirmation from '../components/CreditorConfirmation';
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
  customTitle = 'Kundenportal',
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

  // Check authentication on load
  useEffect(() => {
    const sessionToken = localStorage.getItem('portal_session_token');
    const storedClientId = localStorage.getItem('portal_client_id');
    
    console.log('🔍 PersonalPortal: Auth check:', {
      hasSessionToken: !!sessionToken,
      hasStoredClientId: !!storedClientId,
      storedClientId,
      expectedClientId: clientId,
      match: storedClientId === clientId
    });
    
    if (!sessionToken || !storedClientId || storedClientId !== clientId) {
      console.warn('❌ PersonalPortal: Authentication failed, redirecting to login');
      navigate('/login', { replace: true });
    } else {
      console.log('✅ PersonalPortal: Authentication successful');
    }
  }, [clientId, navigate]);

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
      const response = await api.get(`/clients/${clientId}`);
      const clientData = response.data;

      if (clientData.clickupId) {
        try {
          const formResponse = await api.get(`/proxy/forms/${clientData.clickupId}`);
          if (formResponse.data) {
            clientData.formData = formResponse.data;
          }
        } catch (formErr) {
          console.error('Error fetching form data:', formErr);
        }
      }

      // Fetch documents separately for better state management
      try {
        const documentsResponse = await api.get(`/clients/${clientId}/documents`);
        setDocuments(documentsResponse.data || []);
      } catch (docErr) {
        console.error('Error fetching documents:', docErr);
        setDocuments([]);
      }

      setClient(clientData);
      setError(null);
    } catch (err) {
      console.error('Error fetching client data:', err);
      setError('Fehler beim Laden Ihrer Daten. Bitte versuchen Sie es später erneut.');
    } finally {
      setLoading(false);
    }
  };

  // Refresh documents only
  const refreshDocuments = async () => {
    try {
      const documentsResponse = await api.get(`/clients/${clientId}/documents`);
      setDocuments(documentsResponse.data || []);
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
    setDocuments(prevDocuments => [...prevDocuments, ...newDocuments]);
  };

  // Handle logout
  const handleLogout = () => {
    // Clear all portal authentication data
    localStorage.removeItem('portal_session_token');
    localStorage.removeItem('portal_client_id');
    localStorage.removeItem('portal_client_data');
    localStorage.removeItem('portal_auth_' + clientId);
    
    if (onLogout) {
      onLogout();
    } else {
      navigate('/login');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-8 flex flex-col items-center justify-center">
        <ArrowPathIcon className={`h-8 w-8 animate-spin mb-4`} style={{color: customColors.primary}} />
        <p className="text-gray-600">Daten werden geladen...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-8 flex flex-col items-center justify-center">
        <div className="w-full max-w-lg text-center">
          <h2 className="text-xl font-bold mb-2" style={{color: customColors.primary}}>Fehler</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-white rounded-lg"
            style={{backgroundColor: customColors.primary}}
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
      <header className="bg-white shadow-sm border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="h-10 flex items-center justify-center">
            <img 
              src={customLogo || "https://www.anwalt-privatinsolvenz-online.de/wp-content/uploads/2015/08/Logo-T-Scuric.png"} 
              alt="Logo" 
              className="h-auto w-auto max-h-full max-w-[100px] object-contain" 
            />
          </div>
          <div className="flex items-center space-x-3">
            <h1 className="text-xl font-bold" style={{color: customColors.primary}}>
              {customTitle}
            </h1>
            <button 
              onClick={handleLogout}
              className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 py-1 px-2 rounded-full transition-colors"
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

        {/* Creditor upload component - only show if workflow not completed */}
        {client?.workflow_status !== 'completed' ? (
          <CreditorUploadComponent 
            client={client} 
            onUploadComplete={handleUploadComplete} 
          />
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



        {/* Rating prompt */}
        <div className="rounded-lg bg-gray-50 border border-gray-100 p-4 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-start flex-1">
              <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center mr-3" 
                   style={{backgroundColor: `${customColors.primary}10`}}>
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
                backgroundColor: customColors.primary,
              }}
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