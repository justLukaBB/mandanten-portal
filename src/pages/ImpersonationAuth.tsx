import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';

/**
 * ImpersonationAuth Component
 *
 * This page handles admin impersonation authentication.
 * When an admin clicks "Login as User", they're redirected here with a token.
 * This component validates the token and sets up the impersonation session.
 */
const ImpersonationAuth: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Authenticating...');

  useEffect(() => {
    const authenticateImpersonation = async () => {
      try {
        const token = searchParams.get('token');

        if (!token) {
          setStatus('error');
          setMessage('Missing authentication token');
          return;
        }

        // Validate the impersonation token with the backend
        const response = await fetch(`${API_BASE_URL}/api/auth/impersonate?token=${encodeURIComponent(token)}`);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Authentication failed');
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error('Invalid impersonation token');
        }

        // Store the impersonation session data
        localStorage.setItem('auth_token', result.auth_token);
        localStorage.setItem('portal_session_token', result.auth_token);
        localStorage.setItem('active_role', 'portal');
        localStorage.setItem('portal_client_data', JSON.stringify(result.client_data));

        // Store impersonation metadata
        localStorage.setItem('is_impersonating', 'true');
        localStorage.setItem('impersonation_data', JSON.stringify(result.impersonation));

        console.log('✅ Impersonation session established:', {
          client: result.client_data.email,
          admin: result.impersonation.admin_id
        });

        setStatus('success');
        setMessage(`Logging in as ${result.client_data.firstName} ${result.client_data.lastName}...`);

        // Redirect to portal after a brief delay
        setTimeout(() => {
          navigate(`/portal/${result.client_id}`);
        }, 1000);

      } catch (error: any) {
        console.error('❌ Impersonation authentication error:', error);
        setStatus('error');
        setMessage(error.message || 'Failed to authenticate impersonation session');
      }
    };

    authenticateImpersonation();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <div className="flex flex-col items-center">
          {status === 'loading' && (
            <>
              <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-yellow-600 mb-4"></div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Authenticating</h2>
              <p className="text-gray-600 text-center">{message}</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
                <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-green-600 mb-2">Success!</h2>
              <p className="text-gray-600 text-center">{message}</p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
                <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-red-600 mb-2">Authentication Failed</h2>
              <p className="text-gray-600 text-center mb-6">{message}</p>
              <button
                onClick={() => window.close()}
                className="px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              >
                Close Window
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImpersonationAuth;
