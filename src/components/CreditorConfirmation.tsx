import React, { useState, useEffect } from 'react';
import {
  CheckCircleIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  BuildingOfficeIcon,
  EnvelopeIcon,
  DocumentTextIcon,
  CurrencyEuroIcon
} from '@heroicons/react/24/outline';
import api from '../config/api';

interface Creditor {
  id: string;
  sender_name: string;
  sender_address: string;
  sender_email: string;
  reference_number: string;
  claim_amount: number;
  is_representative: boolean;
  actual_creditor: string;
  source_document: string;
  ai_confidence: number;
  status: string;
  created_at: string;
}

interface CreditorConfirmationData {
  workflow_status: string;
  creditors: Creditor[];
  client_confirmed: boolean;
  confirmation_deadline: string | null;
}

interface CreditorConfirmationProps {
  clientId: string;
}

const CreditorConfirmation: React.FC<CreditorConfirmationProps> = ({ clientId }) => {
  const [confirmationData, setConfirmationData] = useState<CreditorConfirmationData | null>(null);
  const [selectedCreditors, setSelectedCreditors] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completionResult, setCompletionResult] = useState<any>(null);

  useEffect(() => {
    fetchConfirmationData();
  }, [clientId]);

  const fetchConfirmationData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/api/clients/${clientId}/creditor-confirmation`);
      setConfirmationData(response.data);

      // Pre-select all creditors by default
      const allCreditorIds = new Set<string>(response.data.creditors.map((c: Creditor) => c.id));
      setSelectedCreditors(allCreditorIds);
    } catch (error: any) {
      console.error('Error fetching confirmation data:', error);

      // Don't show error if workflow isn't ready yet - this is expected
      if (error.response?.status === 400 && error.response?.data?.current_status) {
        setError(null); // No error, just not ready yet
        setConfirmationData(null);
      } else {
        setError(error.response?.data?.error || 'Fehler beim Laden der Gläubigerdaten');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreditorToggle = (creditorId: string) => {
    const newSelected = new Set(selectedCreditors);
    if (newSelected.has(creditorId)) {
      newSelected.delete(creditorId);
    } else {
      newSelected.add(creditorId);
    }
    setSelectedCreditors(newSelected);
  };

  const handleSelectAll = () => {
    if (!confirmationData) return;

    if (selectedCreditors.size === confirmationData.creditors.length) {
      setSelectedCreditors(new Set());
    } else {
      const allIds = new Set(confirmationData.creditors.map(c => c.id));
      setSelectedCreditors(allIds);
    }
  };

  const handleConfirmation = async () => {
    try {
      setSubmitting(true);
      const confirmedCreditors = Array.from(selectedCreditors);

      await api.post(`/api/clients/${clientId}/confirm-creditors`, {
        confirmed_creditors: confirmedCreditors
      });

      // Refresh data to show updated status
      // await fetchConfirmationData();

      // alert(`✅ ${response.data.confirmed_count} Gläubiger erfolgreich bestätigt!`);

      setShowCompletionModal(true)
    } catch (error: any) {
      console.error('Error confirming creditors:', error);
      setError(error.response?.data?.error || 'Fehler beim Bestätigen der Gläubiger');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
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
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center text-red-600">
          <ExclamationTriangleIcon className="w-5 h-5 mr-2" />
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!confirmationData) {
    // Don't render anything if workflow isn't ready yet
    return null;
  }

  // Only show creditor confirmation when admin has approved it
  if (confirmationData.workflow_status !== 'awaiting_client_confirmation' &&
    confirmationData.workflow_status !== 'client_confirmation' &&
    confirmationData.workflow_status !== 'completed') {
    return null;
  }

  if (confirmationData.client_confirmed) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="text-center">
          <CheckCircleIcon className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Gläubigerliste bereits bestätigt
          </h3>
          <p className="text-gray-600">
            Sie haben Ihre Gläubigerliste bereits bestätigt. Vielen Dank!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          Gläubiger-Bestätigung erforderlich
        </h3>
        <p className="text-gray-600">
          Basierend auf Ihren hochgeladenen Dokumenten haben wir {confirmationData.creditors.length} Gläubiger identifiziert.
          Bitte überprüfen Sie diese Liste und bestätigen Sie die Richtigkeit.
        </p>
      </div>

      {/* Selection Bar */}
      <div className="flex items-center justify-between mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-4">
          <button
            onClick={handleSelectAll}
            className="text-red-800 hover:text-blue-700 font-medium text-sm"
          >
            {selectedCreditors.size === confirmationData.creditors.length ? 'Alle abwählen' : 'Alle auswählen'}
          </button>
          <span className="text-sm text-gray-600">
            {selectedCreditors.size} von {confirmationData.creditors.length} ausgewählt
          </span>
        </div>
      </div>

      {/* Creditor List */}
      <div className="space-y-4">
        {confirmationData.creditors.map((creditor) => {
          const isSelected = selectedCreditors.has(creditor.id);

          return (
            <div
              key={creditor.id}
              className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${isSelected
                ? 'border-green-500 bg-green-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              onClick={() => handleCreditorToggle(creditor.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                  {/* Selection Indicator */}
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center mt-1 ${isSelected ? 'border-green-500 bg-green-500' : 'border-gray-300'
                    }`}>
                    {isSelected && <CheckCircleIcon className="w-3 h-3 text-white" />}
                  </div>

                  {/* Creditor Info */}
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <BuildingOfficeIcon className="w-5 h-5 text-gray-400" />
                      <h4 className="font-semibold text-gray-900">{creditor.sender_name}</h4>
                      {creditor.is_representative && creditor.actual_creditor && (
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                          Vertreter für: {creditor.actual_creditor}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <EnvelopeIcon className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600">{creditor.sender_email || 'Keine E-Mail'}</span>
                        </div>
                        <div className="flex items-start space-x-2">
                          <BuildingOfficeIcon className="w-4 h-4 text-gray-400 mt-0.5" />
                          <span className="text-gray-600">{creditor.sender_address || 'Keine Adresse'}</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <DocumentTextIcon className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600">Ref: {creditor.reference_number || 'N/A'}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <CurrencyEuroIcon className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600">
                            {creditor.claim_amount ? `${creditor.claim_amount.toFixed(2)} €` : 'Betrag unbekannt'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                      <span>Quelle: {creditor.source_document}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showCompletionModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full text-center">
            <svg
              className="w-12 h-12 text-green-500 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2l4-4m6 2a9 9 0 11-18 0a9 9 0 0118 0z"
              />
            </svg>

            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {selectedCreditors.size} Gläubiger erfolgreich bestätigt!
            </h2>

            <button
              onClick={async () => {
                setShowCompletionModal(false);
                await fetchConfirmationData();
              }}
              className="px-4 py-2 bg-red-800 text-white rounded-lg hover:bg-red-900 transition"
            >
              Okay
            </button>
          </div>
        </div>
      )}


      {/* Warning */}
      <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <div className="flex items-start space-x-2">
          <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-yellow-800">Wichtiger Hinweis:</p>
            <p className="text-yellow-700 mt-1">
              Bitte überprüfen Sie alle Gläubiger sorgfältig. Nur bestätigte Gläubiger werden in den weiteren Prozess einbezogen.
              Falls ein Gläubiger fehlt oder falsch ist, wenden Sie sich an unseren Support.
            </p>
          </div>
        </div>
      </div>

      {/* Confirmation Button - Bottom */}
      <div className="mt-12 flex justify-center">
        <button
          onClick={handleConfirmation}
          disabled={submitting || selectedCreditors.size === 0}
          className="group relative overflow-hidden bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-300 disabled:to-gray-400 text-white px-10 py-4 rounded-2xl text-lg font-bold transition-all duration-300 shadow-2xl hover:shadow-green-500/50 transform hover:scale-105 disabled:transform-none disabled:hover:scale-100 disabled:cursor-not-allowed"
          style={{
            boxShadow: selectedCreditors.size > 0 ? '0 20px 40px -12px rgba(16, 185, 129, 0.5)' : 'none'
          }}
        >
          {/* Animated background effect */}
          <span className="absolute inset-0 bg-gradient-to-r from-green-400/20 to-emerald-400/20 transform -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out"></span>

          {/* Icon */}
          <span className="relative flex items-center justify-center space-x-3">
            {submitting ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Wird verarbeitet...</span>
              </>
            ) : (
              <>
                <CheckCircleIcon className="w-6 h-6 group-hover:rotate-12 transition-transform duration-300" />
                <span>{selectedCreditors.size} Gläubiger bestätigen</span>
                <span className="ml-2 text-xl group-hover:translate-x-1 transition-transform duration-300">→</span>
              </>
            )}
          </span>

          {/* Pulse effect when enabled */}
          {selectedCreditors.size > 0 && !submitting && (
            <span className="absolute inset-0 rounded-2xl animate-ping opacity-20 bg-green-400"></span>
          )}
        </button>
      </div>
    </div>
  );
};

export default CreditorConfirmation;