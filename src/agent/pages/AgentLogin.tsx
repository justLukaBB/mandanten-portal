import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheckIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { API_BASE_URL } from '../../config/api';

const AgentLogin: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setError('');
    setLoading(true);

    try {
      console.log('🔄 Agent login attempt for:', credentials.username);

      const response = await fetch(`${API_BASE_URL}/agent-auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      console.log('✅ Agent login successful');
      
      // Store agent token and data
      localStorage.setItem('agent_token', data.token);
      localStorage.setItem('agent_data', JSON.stringify(data.agent));
      
      // Check if there's a redirect URL (for direct review links)
      const clientId = searchParams.get('clientId');
      if (clientId) {
        navigate(`/agent/review/${clientId}`, { replace: true });
      } else {
        navigate('/agent/dashboard', { replace: true });
      }
      
    } catch (error: any) {
      console.error('❌ Agent login error:', error);
      setError(error.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCredentials(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="flex justify-center">
            <div className="p-3 rounded-full" style={{backgroundColor: '#9f1a1d'}}>
              <ShieldCheckIcon className="h-12 w-12 text-white" />
            </div>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Agent Review Dashboard
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Melden Sie sich mit Ihren Agent-Zugangsdaten an
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                Benutzername oder E-Mail
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-red-800 focus:border-red-800 focus:z-10 sm:text-sm"
                placeholder="agent.mustermann oder max@example.com"
                value={credentials.username}
                onChange={handleInputChange}
              />
            </div>
            
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Passwort
              </label>
              <div className="mt-1 relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  className="appearance-none relative block w-full px-3 py-2 pr-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-red-800 focus:border-red-800 focus:z-10 sm:text-sm"
                  placeholder="••••••••••"
                  value={credentials.password}
                  onChange={handleInputChange}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeSlashIcon className="h-5 w-5 text-gray-400" />
                  ) : (
                    <EyeIcon className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
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
              disabled={loading || !credentials.username.trim() || !credentials.password.trim()}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              style={{
                backgroundColor: loading ? '#6b7280' : '#9f1a1d',
                ':hover': { backgroundColor: '#7f1616' }
              }}
            >
              {loading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Anmeldung läuft...
                </div>
              ) : (
                'Als Agent anmelden'
              )}
            </button>
          </div>

          <div className="text-center space-y-4">
            <div className="text-sm text-gray-600">
              <p>
                Sind Sie ein Mandant?{' '}
                <a href="/login" className="font-medium hover:opacity-80" style={{color: '#9f1a1d'}}>
                  Zum Mandanten-Portal →
                </a>
              </p>
            </div>
            
            <div className="pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                Sichere Agent-Authentifizierung für die manuelle Dokumentenprüfung
              </p>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AgentLogin;