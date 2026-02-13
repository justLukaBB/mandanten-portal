import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';

type LoginStep = 'credentials' | 'verification';

const PortalLogin: React.FC = () => {
  const navigate = useNavigate();

  // Step management
  const [step, setStep] = useState<LoginStep>('credentials');

  // Form state
  const [email, setEmail] = useState('');
  const [aktenzeichen, setAktenzeichen] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  // UI state
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);

  // Refs
  const codeInputRef = useRef<HTMLInputElement>(null);
  const cooldownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup cooldown interval on unmount
  useEffect(() => {
    return () => {
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current);
      }
    };
  }, []);

  // Load saved email on mount
  useEffect(() => {
    const savedEmail = localStorage.getItem('savedEmail');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  // Save email when remember me is checked
  useEffect(() => {
    if (rememberMe && email) {
      localStorage.setItem('savedEmail', email);
    } else if (!rememberMe) {
      localStorage.removeItem('savedEmail');
    }
  }, [rememberMe, email]);

  // Auto-focus code input when entering verification step
  useEffect(() => {
    if (step === 'verification' && codeInputRef.current) {
      codeInputRef.current.focus();
    }
  }, [step]);

  // Start cooldown timer
  const startResendCooldown = (seconds = 60) => {
    setResendCooldown(seconds);

    if (cooldownIntervalRef.current) {
      clearInterval(cooldownIntervalRef.current);
    }

    cooldownIntervalRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) {
          if (cooldownIntervalRef.current) {
            clearInterval(cooldownIntervalRef.current);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Handle login (request verification code)
  const handleLogin = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    if (!email.trim()) {
      setError('Bitte geben Sie Ihre E-Mail-Adresse ein.');
      return;
    }

    if (!aktenzeichen.trim()) {
      setError('Bitte geben Sie Ihr Aktenzeichen ein.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      console.log('🔄 Requesting verification code for:', aktenzeichen, email);

      const response = await axios.post(`${API_BASE_URL}/api/portal/request-verification-code`, {
        aktenzeichen: aktenzeichen.trim(),
        email: email.trim().toLowerCase()
      });

      if (response.data.success) {
        console.log('✅ Verification code sent');
        setMaskedEmail(response.data.masked_email || '***@***.de');
        setStep('verification');
        setVerificationCode('');
        setAttemptsRemaining(null);
        startResendCooldown(60);
      } else {
        setError(response.data.error || 'Fehler beim Senden des Codes.');
      }
    } catch (error: any) {
      console.error('❌ Error requesting code:', error);

      if (error.response?.status === 429) {
        const retryAfter = error.response.data?.retry_after_seconds || 60;
        setError(`Zu viele Anfragen. Bitte warten Sie ${Math.ceil(retryAfter / 60)} Minute(n).`);
      } else {
        setError(error.response?.data?.error || 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle verifying the code
  const handleVerifyCode = async (e?: React.FormEvent, codeOverride?: string) => {
    if (e) {
      e.preventDefault();
    }

    // Use override code (from auto-submit) or current state
    const codeToVerify = codeOverride || verificationCode;

    if (!codeToVerify.trim() || codeToVerify.length !== 6) {
      setError('Bitte geben Sie den 6-stelligen Code ein.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      console.log('🔄 Verifying code for:', aktenzeichen);

      const response = await axios.post(`${API_BASE_URL}/api/portal/verify-code`, {
        aktenzeichen: aktenzeichen.trim(),
        code: codeToVerify.trim()
      });

      if (response.data.success) {
        console.log('✅ Verification successful');

        // Store all required data
        const sessionToken = response.data.session_token;
        const jwtToken = response.data.token || sessionToken;
        const clientId = response.data.client.id;
        const clientData = JSON.stringify(response.data.client);

        // Store tokens
        localStorage.clear();
        localStorage.setItem("active_role", "portal");
        localStorage.setItem('portal_session_token', sessionToken);
        localStorage.setItem('auth_token', jwtToken);
        localStorage.setItem('portal_client_id', clientId);
        localStorage.setItem('portal_client_data', clientData);

        console.log('💾 Tokens stored successfully');

        // Dispatch custom event to notify ProtectedRoute
        window.dispatchEvent(new CustomEvent('loginSuccess'));

        // Navigate to portal
        console.log('🚀 Navigating to portal...');
        navigate(`/portal/${clientId}`, { replace: true });
      } else {
        setError(response.data.error || 'Verifizierung fehlgeschlagen.');
      }
    } catch (error: any) {
      console.error('❌ Error verifying code:', error);

      if (error.response?.status === 401) {
        const errorData = error.response.data;
        setError(errorData.error || 'Ungültiger Code.');

        if (errorData.attempts_remaining !== undefined) {
          setAttemptsRemaining(errorData.attempts_remaining);
        }
      } else if (error.response?.status === 429) {
        const retryAfter = error.response.data?.retry_after_seconds || 60;
        setError(`Zu viele Versuche. Bitte warten Sie ${Math.ceil(retryAfter / 60)} Minute(n).`);
      } else {
        setError(error.response?.data?.error || 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle resending code
  const handleResendCode = () => {
    if (resendCooldown > 0) {
      return;
    }
    handleLogin();
  };

  // Handle going back to credentials step
  const handleBack = () => {
    setStep('credentials');
    setVerificationCode('');
    setError('');
    setAttemptsRemaining(null);
  };

  // Handle code input change (only allow digits, auto-submit on 6 digits)
  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setVerificationCode(value);
    setError('');

    // Auto-submit when 6 digits entered
    if (value.length === 6) {
      setTimeout(() => {
        handleVerifyCode(undefined, value);
      }, 100);
    }
  };

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
              {step === 'credentials'
                ? 'Melden Sie sich an, um fortzufahren'
                : 'Geben Sie den Code ein, den wir an Ihre E-Mail gesendet haben'}
            </p>
          </div>

          {/* Step 1: Email + Aktenzeichen Input */}
          {step === 'credentials' && (
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-4">
                <div className="relative">
                  <input
                    type="email"
                    id="email"
                    placeholder="E-Mail-Adresse"
                    autoComplete="email"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck="false"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError('');
                    }}
                    className="w-full h-12 bg-gray-50 border border-gray-300 rounded-lg px-4 text-base text-gray-900 placeholder-gray-500 transition-all duration-200 focus:outline-none focus:bg-white focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                  />
                </div>

                <div className="relative">
                  <input
                    type="text"
                    id="aktenzeichen"
                    placeholder="Aktenzeichen"
                    autoComplete="off"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck="false"
                    required
                    value={aktenzeichen}
                    onChange={(e) => {
                      setAktenzeichen(e.target.value);
                      setError('');
                    }}
                    className="w-full h-12 bg-gray-50 border border-gray-300 rounded-lg px-4 text-base text-gray-900 placeholder-gray-500 transition-all duration-200 focus:outline-none focus:bg-white focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                  />
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
                  <span className="text-gray-700 font-medium text-sm">E-Mail merken</span>
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
                  disabled={loading || !email.trim() || !aktenzeichen.trim()}
                  className={`w-full h-12 ${
                    email.trim() && aktenzeichen.trim()
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
            </form>
          )}

          {/* Step 2: Verification Code Input */}
          {step === 'verification' && (
            <div className="space-y-5">
              {/* Email Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                <EnvelopeIcon className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-blue-800">
                    Ein 6-stelliger Code wurde an <strong>{maskedEmail}</strong> gesendet.
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    Der Code ist 5 Minuten gültig.
                  </p>
                </div>
              </div>

              <form onSubmit={handleVerifyCode} className="space-y-4">
                {/* Code Input */}
                <div className="relative">
                  <input
                    ref={codeInputRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    id="verificationCode"
                    placeholder="000000"
                    autoComplete="one-time-code"
                    required
                    maxLength={6}
                    value={verificationCode}
                    onChange={handleCodeChange}
                    className="w-full h-14 bg-gray-50 border border-gray-300 rounded-lg px-4 text-2xl text-center font-mono tracking-[0.5em] text-gray-900 placeholder-gray-300 transition-all duration-200 focus:outline-none focus:bg-white focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                    {error}
                    {attemptsRemaining !== null && attemptsRemaining > 0 && (
                      <span className="block mt-1 text-xs">
                        {attemptsRemaining} Versuch(e) verbleibend
                      </span>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || verificationCode.length !== 6}
                  className={`w-full h-12 ${
                    verificationCode.length === 6
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-gray-900 hover:bg-black'
                  } disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-base rounded-lg transition-all duration-200 hover:shadow-md`}
                >
                  {loading ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Wird überprüft...
                    </div>
                  ) : (
                    'Verifizieren'
                  )}
                </button>
              </form>

              {/* Resend & Back Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-1 text-gray-600 hover:text-gray-900 font-medium text-sm transition-colors"
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                  Zurück
                </button>

                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={resendCooldown > 0 || loading}
                  className={`text-sm font-medium transition-colors ${
                    resendCooldown > 0 || loading
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-red-600 hover:text-red-700 hover:underline'
                  }`}
                >
                  {resendCooldown > 0
                    ? `Code erneut senden (${resendCooldown}s)`
                    : 'Code erneut senden'}
                </button>
              </div>
            </div>
          )}


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
