import React, { useState } from 'react';
import { ChartBarIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import api from '../../config/api';
import { useNavigate } from 'react-router-dom';

const AdminLogin: React.FC = () => {
  const navigate = useNavigate();
  const [credentials, setCredentials] = useState({
    email: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api.post('/api/admin/login', {
        email: credentials.email,
        password: credentials.password
      });

      console.log(response)

      if (response.data.success) {
        console.log('🔑 AdminLogin: Login successful, storing tokens...');

        // Store admin token - let the API interceptor handle headers automatically
        localStorage.clear();
        localStorage.setItem("active_role", "admin");
        localStorage.setItem("auth_token", response.data.token);
        localStorage.setItem('admin_token', response.data.token);
        localStorage.setItem('admin_auth', 'true');
        localStorage.setItem('admin_email', response.data.user.email);

        console.log('✅ AdminLogin: Tokens stored successfully:', {
          hasToken: !!response.data.token,
          tokenLength: response.data.token?.length || 0,
          email: response.data.user.email
        });

        navigate("/admin");

        // Don't manually set headers - let the interceptor handle it
        // onLogin();
      }
    } catch (error: any) {
      console.error('Admin login error:', error);
      setError(error.response?.data?.error || 'Anmeldefehler');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCredentials(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="flex justify-center">
            <ChartBarIcon className="h-12 w-12 text-red-800" />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Admin Portal
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Melden Sie sich an, um auf das Admin-Dashboard zuzugreifen
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                E-Mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-red-800 focus:border-red-800 focus:z-10 sm:text-sm"
                placeholder="E-Mail"
                value={credentials.email}
                onChange={handleInputChange}
              />
            </div>
            <div className="relative">
              <label htmlFor="password" className="sr-only">
                Passwort
              </label>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 pr-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-red-800 focus:border-red-800 focus:z-10 sm:text-sm"
                placeholder="Passwort"
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
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-red-800 hover:bg-red-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                'Einloggen'
              )}
            </button>
          </div>


          <div className="text-center">
            <div className="text-sm text-gray-600 bg-gray-100 p-3 rounded-md">
              <strong>Demo-Anmeldedaten:</strong><br />
              E-Mail: <code className="bg-white px-1 py-0.5 rounded">admin@mandanten-portal.de</code><br />
              Passwort: <code className="bg-white px-1 py-0.5 rounded">admin123</code>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdminLogin;