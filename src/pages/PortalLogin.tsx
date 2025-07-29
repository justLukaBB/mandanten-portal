import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScaleIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';

const PortalLogin: React.FC = () => {
  const navigate = useNavigate();
  const [credentials, setCredentials] = useState({
    email: '',
    aktenzeichen: ''
  });
  const [showAktenzeichen, setShowAktenzeichen] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await axios.post(`${API_BASE_URL}/portal/login`, credentials);
      
      if (response.data.success) {
        // Store session token
        localStorage.setItem('portal_session_token', response.data.session_token);
        localStorage.setItem('portal_client_id', response.data.client.id);
        localStorage.setItem('portal_client_data', JSON.stringify(response.data.client));
        
        // Redirect to personal portal
        navigate('/portal');
      }
    } catch (error: any) {
      if (error.response?.data?.error) {
        setError(error.response.data.error);
      } else {
        setError('Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCredentials(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="flex justify-center">
            <div className="bg-red-800 p-3 rounded-full">
              <ScaleIcon className="h-12 w-12 text-white" />
            </div>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Mandanten-Portal
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Melden Sie sich mit Ihren Zugangsdaten an
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                E-Mail-Adresse
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-red-800 focus:border-red-800 focus:z-10 sm:text-sm"
                placeholder="max.mustermann@example.com"
                value={credentials.email}
                onChange={handleInputChange}
              />
            </div>
            
            <div>
              <label htmlFor="aktenzeichen" className="block text-sm font-medium text-gray-700">
                Aktenzeichen
              </label>
              <div className="mt-1 relative">
                <input
                  id="aktenzeichen"
                  name="aktenzeichen"
                  type={showAktenzeichen ? 'text' : 'password'}
                  required
                  className="appearance-none relative block w-full px-3 py-2 pr-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-red-800 focus:border-red-800 focus:z-10 sm:text-sm"
                  placeholder="MAND_2024_001"
                  value={credentials.aktenzeichen}
                  onChange={handleInputChange}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowAktenzeichen(!showAktenzeichen)}
                >
                  {showAktenzeichen ? (
                    <EyeSlashIcon className="h-5 w-5 text-gray-400" />
                  ) : (
                    <EyeIcon className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Ihr Aktenzeichen finden Sie in der E-Mail, die Sie von uns erhalten haben
              </p>
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">
                {error}
              </div>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-red-800 hover:bg-red-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            >
              {loading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Anmeldung läuft...
                </div>
              ) : (
                'Anmelden'
              )}
            </button>
          </div>

          <div className="text-center space-y-4">
            <div className="text-sm text-gray-600">
              <p>
                Haben Sie Probleme beim Anmelden?
              </p>
              <p className="mt-1">
                Kontaktieren Sie uns unter:{' '}
                <a href="mailto:support@kanzlei.de" className="font-medium text-red-800 hover:text-red-900">
                  support@kanzlei.de
                </a>
              </p>
            </div>
            
            <div className="pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                Ihre Daten werden sicher übertragen und gemäß DSGVO verarbeitet.
              </p>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PortalLogin;