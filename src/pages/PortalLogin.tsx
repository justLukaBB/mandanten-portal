import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';

const PortalLogin: React.FC = () => {
  const navigate = useNavigate();
  const [credentials, setCredentials] = useState({
    email: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Clear any previous errors but keep credentials
    setError('');
    setLoading(true);

    try {
      console.log('🔄 Attempting login with credentials:', {
        email: credentials.email,
        hasPassword: !!credentials.password
      });

      // For now, we'll adapt the new design to work with existing aktenzeichen backend
      // TODO: Update backend to support password-based login
      const loginData = {
        email: credentials.email,
        aktenzeichen: credentials.password // Temporarily map password to aktenzeichen
      };

      const response = await axios.post(`${API_BASE_URL}/api/portal/login`, loginData);

      if (response.data && response.data.success) {
        console.log('✅ Login API call successful');

        // Store all required data
        const sessionToken = response.data.session_token;
        const jwtToken = response.data.token || sessionToken;
        const clientId = response.data.client.id;
        const clientData = JSON.stringify(response.data.client);

        // Store tokens synchronously
        localStorage.clear();
        localStorage.setItem("active_role", "portal");
        localStorage.setItem('portal_session_token', sessionToken);
        localStorage.setItem('auth_token', jwtToken);
        localStorage.setItem('portal_client_id', clientId);
        localStorage.setItem('portal_client_data', clientData);

        console.log('💾 Tokens stored successfully');

        // Dispatch custom event to notify ProtectedRoute
        window.dispatchEvent(new CustomEvent('loginSuccess'));

        // Navigate immediately without setTimeout
        console.log('🚀 Navigating to portal...');
        navigate(`/portal/${clientId}`, { replace: true });

      } else {
        console.error('❌ Login failed - invalid response structure:', response.data);
        setError('Login fehlgeschlagen. Bitte überprüfen Sie Ihre Eingaben.');
      }
    } catch (error: any) {
      console.error('❌ Login error:', error);

      // Handle different types of errors
      if (error.response) {
        // Server responded with error status
        const serverMessage = error.response.data?.error || error.response.data?.message;
        if (serverMessage) {
          setError(serverMessage);
        } else if (error.response.status === 401) {
          setError('Ungültige Anmeldedaten. Bitte überprüfen Sie E-Mail und Passwort.');
        } else if (error.response.status === 429) {
          setError('Zu viele Login-Versuche. Bitte warten Sie einen Moment.');
        } else {
          setError(`Server-Fehler (${error.response.status}). Bitte versuchen Sie es später erneut.`);
        }
      } else if (error.request) {
        // Network error
        setError('Verbindungsfehler. Bitte überprüfen Sie Ihre Internetverbindung.');
      } else {
        // Other error
        setError('Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCredentials(prev => ({ ...prev, [name]: value }));
  };

  // Load saved email on mount
  useEffect(() => {
    const savedEmail = localStorage.getItem('savedEmail');
    if (savedEmail) {
      setCredentials(prev => ({ ...prev, email: savedEmail }));
      setRememberMe(true);
    }
  }, []);

  // Save email when remember me is checked
  useEffect(() => {
    if (rememberMe && credentials.email) {
      localStorage.setItem('savedEmail', credentials.email);
    } else {
      localStorage.removeItem('savedEmail');
    }
  }, [rememberMe, credentials.email]);

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 flex justify-start items-center">
        <div className="h-8 md:h-10">
          <img 
            src="https://www.schuldnerberatung-anwalt.de/wp-content/uploads/2024/10/Logo-T-Scuric.png" 
            alt="Scuric Logo" 
            className="h-full object-contain"
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-5 py-8">
        <div className="max-w-sm mx-auto">
          {/* Welcome Section */}
          <div className="text-center mb-12">
            <h1 className="text-2xl md:text-3xl font-semibold mb-4 text-gray-900 leading-tight">
              Willkommen im Mandanten Portal
            </h1>
            <p className="text-base text-gray-600">
              Melden Sie sich an, um fortzufahren
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-4">
              <div className="relative">
                <input
                  type="email"
                  id="email"
                  name="email"
                  placeholder="E-Mail-Adresse"
                  autoComplete="email"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck="false"
                  required
                  value={credentials.email}
                  onChange={handleInputChange}
                  className="w-full h-12 bg-gray-50 border border-gray-300 rounded-lg px-4 text-base text-gray-900 placeholder-gray-500 transition-all duration-200 focus:outline-none focus:bg-white focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                />
              </div>

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  placeholder="Passwort"
                  autoComplete="current-password"
                  required
                  value={credentials.password}
                  onChange={handleInputChange}
                  className="w-full h-12 bg-gray-50 border border-gray-300 rounded-lg px-4 pr-12 text-base text-gray-900 placeholder-gray-500 transition-all duration-200 focus:outline-none focus:bg-white focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 rounded hover:bg-gray-100 transition-colors"
                >
                  {showPassword ? (
                    <EyeSlashIcon className="h-5 w-5 text-gray-400" />
                  ) : (
                    <EyeIcon className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center pt-1">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="remember"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 text-gray-800 bg-gray-50 border border-gray-300 rounded focus:ring-gray-500 focus:ring-2"
                />
                <span className="text-gray-700 font-medium text-sm">Angemeldet bleiben</span>
              </label>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading || !credentials.email.trim() || !credentials.password.trim()}
                className={`w-full h-12 ${
                  credentials.email.trim() && credentials.password.trim() 
                    ? 'bg-green-600 hover:bg-green-700' 
                    : 'bg-gray-900 hover:bg-black'
                } disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-base rounded-lg transition-all duration-200 hover:shadow-md`}
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Wird geladen...
                  </div>
                ) : (
                  'Anmelden'
                )}
              </button>
            </div>

            <div className="text-center pt-4">
              <button 
                type="button"
                onClick={() => {
                  alert('Passwort-Wiederherstellung wurde an Ihre E-Mail gesendet.');
                }}
                className="text-red-600 hover:text-red-700 font-medium text-sm transition-colors bg-transparent border-none cursor-pointer hover:underline"
              >
                Passwort vergessen?
              </button>
            </div>
          </form>

          {/* Media Section */}
          <div className="text-center mt-16 pt-12 border-t border-gray-200">
            <p className="text-sm text-gray-500 mb-6 font-medium">Bekannt aus:</p>
            <div className="flex justify-center">
              <img 
                src="https://www.anwalt-privatinsolvenz-online.de/wp-content/uploads/2019/11/medien.png" 
                alt="Bekannt aus verschiedenen Medien"
                className="max-w-full h-auto max-h-12 object-contain opacity-60 hover:opacity-80 transition-opacity"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="text-center mt-12 pt-8">
            <div className="mb-4">
              <a 
                href="https://www.schuldnerberatung-anwalt.de/impressum/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-red-600 text-sm transition-colors hover:underline"
              >
                Impressum
              </a>
              <span className="text-gray-400 mx-3 text-sm">•</span>
              <a 
                href="https://www.schuldnerberatung-anwalt.de/datenschutz/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-red-600 text-sm transition-colors hover:underline"
              >
                Datenschutz
              </a>
            </div>
            <p className="text-xs text-gray-400">© 2025 Scuric. Alle Rechte vorbehalten.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortalLogin;