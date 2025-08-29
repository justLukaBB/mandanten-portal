import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircleIcon, XCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';

interface Creditor {
  id: string;
  sender_name: string;
  sender_email?: string;
  reference_number?: string;
  claim_amount?: number;
  status: string;
}

interface ConfirmCreditorsData {
  workflow_status: string;
  creditors: Creditor[];
  client_confirmed: boolean;
  message?: string;
}

const ConfirmCreditors: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ConfirmCreditorsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Kein gültiger Token gefunden');
      setLoading(false);
      return;
    }

    // Login with token first
    loginWithToken();
  }, [token]);

  const loginWithToken = async () => {
    try {
      console.log('🔐 Logging in with token...');
      const loginResponse = await axios.post(`${API_BASE_URL}/api/clients/login`, { token });
      
      if (loginResponse.data.success) {
        const { clientId: cId, sessionToken, client } = loginResponse.data;
        
        // Store auth data
        localStorage.setItem('portal_client_id', cId);
        localStorage.setItem('portal_session_token', sessionToken);
        localStorage.setItem('portal_client_name', `${client.firstName} ${client.lastName}`);
        
        setClientId(cId);
        
        // Now fetch creditor confirmation data
        fetchCreditorData(cId);
      } else {
        throw new Error('Login fehlgeschlagen');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      setError('Ungültiger oder abgelaufener Link');
      setLoading(false);
    }
  };

  const fetchCreditorData = async (cId: string) => {
    try {
      console.log('📋 Fetching creditor confirmation data...');
      const response = await axios.get(`${API_BASE_URL}/api/clients/${cId}/creditor-confirmation`);
      
      setData(response.data);
      setLoading(false);
    } catch (error: any) {
      console.error('Error fetching creditor data:', error);
      setError('Fehler beim Laden der Gläubigerdaten');
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!clientId || !data || data.creditors.length === 0) return;
    
    setConfirming(true);
    
    try {
      const response = await axios.post(`${API_BASE_URL}/api/clients/${clientId}/confirm-creditors`);
      
      if (response.data.success) {
        // Refresh data to show confirmed status
        await fetchCreditorData(clientId);
        
        // Show success message
        alert('Gläubigerliste erfolgreich bestätigt! Wir werden nun Kontakt mit Ihren Gläubigern aufnehmen.');
        
        // Redirect to main portal after 3 seconds
        setTimeout(() => {
          navigate('/portal');
        }, 3000);
      }
    } catch (error: any) {
      console.error('Error confirming creditors:', error);
      alert(error.response?.data?.message || 'Fehler bei der Bestätigung');
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{borderBottomColor: '#9f1a1d'}}></div>
          <p className="text-gray-600">Lade Gläubigerdaten...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
          <XCircleIcon className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Fehler</h2>
          <p className="text-gray-600">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="mt-6 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Zum Login
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const totalDebt = data.creditors.reduce((sum, c) => sum + (c.claim_amount || 0), 0);
  const confirmedCreditors = data.creditors.filter(c => c.status === 'confirmed');

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white shadow rounded-lg mb-6">
          <div className="px-6 py-4 border-b border-gray-200" style={{borderTopColor: '#9f1a1d', borderTopWidth: '3px'}}>
            <h1 className="text-2xl font-bold text-gray-900">Gläubiger-Bestätigung</h1>
            <p className="mt-1 text-sm text-gray-500">
              Bitte überprüfen und bestätigen Sie Ihre Gläubigerliste
            </p>
          </div>
        </div>

        {/* Status Messages */}
        {data.client_confirmed && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-md p-4">
            <div className="flex">
              <CheckCircleIcon className="h-5 w-5 text-green-400" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800">
                  Gläubigerliste bereits bestätigt
                </h3>
                <p className="mt-1 text-sm text-green-700">
                  Sie haben Ihre Gläubigerliste bereits bestätigt. Wir sind dabei, Kontakt mit Ihren Gläubigern aufzunehmen.
                </p>
              </div>
            </div>
          </div>
        )}

        {data.message && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-md p-4">
            <div className="flex">
              <ExclamationCircleIcon className="h-5 w-5 text-yellow-400" />
              <div className="ml-3">
                <p className="text-sm text-yellow-700">{data.message}</p>
              </div>
            </div>
          </div>
        )}

        {/* Creditor List */}
        {confirmedCreditors.length > 0 && (
          <div className="bg-white shadow rounded-lg mb-6">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                Ihre Gläubiger ({confirmedCreditors.length})
              </h2>
              <p className="text-sm text-gray-500">
                Gesamtschulden: <span className="font-semibold" style={{color: '#9f1a1d'}}>
                  €{totalDebt.toFixed(2)}
                </span>
              </p>
            </div>
            
            <ul className="divide-y divide-gray-200">
              {confirmedCreditors.map((creditor, index) => (
                <li key={creditor.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-gray-900">
                          {index + 1}. {creditor.sender_name}
                        </h3>
                        <p className="text-sm font-semibold" style={{color: '#9f1a1d'}}>
                          €{(creditor.claim_amount || 0).toFixed(2)}
                        </p>
                      </div>
                      {creditor.reference_number && (
                        <p className="mt-1 text-sm text-gray-500">
                          Referenz: {creditor.reference_number}
                        </p>
                      )}
                      {creditor.sender_email && (
                        <p className="text-sm text-gray-500">
                          E-Mail: {creditor.sender_email}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Action Buttons */}
        {!data.client_confirmed && confirmedCreditors.length > 0 && (
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Bestätigung erforderlich
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              Bitte überprüfen Sie die oben aufgeführte Gläubigerliste sorgfältig. 
              Mit Ihrer Bestätigung autorisieren Sie uns, in Ihrem Namen Kontakt 
              mit den genannten Gläubigern aufzunehmen.
            </p>
            
            <div className="flex gap-4">
              <button
                onClick={handleConfirm}
                disabled={confirming}
                className="flex-1 px-4 py-2 text-white font-medium rounded-md hover:opacity-90 disabled:opacity-50"
                style={{backgroundColor: '#9f1a1d'}}
              >
                {confirming ? 'Wird bestätigt...' : 'Gläubigerliste bestätigen'}
              </button>
              
              <button
                onClick={() => navigate('/portal')}
                className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-md hover:bg-gray-50"
              >
                Zurück zum Portal
              </button>
            </div>
          </div>
        )}

        {/* No Creditors Message */}
        {confirmedCreditors.length === 0 && (
          <div className="bg-white shadow rounded-lg p-6 text-center">
            <ExclamationCircleIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Keine Gläubiger gefunden
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {data.message || 'Es wurden noch keine bestätigten Gläubiger für Ihr Konto gefunden.'}
            </p>
            <button
              onClick={() => navigate('/portal')}
              className="px-4 py-2 text-white font-medium rounded-md hover:opacity-90"
              style={{backgroundColor: '#9f1a1d'}}
            >
              Zum Portal
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConfirmCreditors;