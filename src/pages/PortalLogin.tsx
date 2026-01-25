import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';

type LoginStep = 'aktenzeichen' | 'verification';

const PortalLogin: React.FC = () => {
  const navigate = useNavigate();

  // Step management
  const [step, setStep] = useState<LoginStep>('aktenzeichen');

  // Form state
  const [aktenzeichen, setAktenzeichen] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');

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

  // Auto-focus code input when entering verification step
  useEffect(() => {
    if (step === 'verification' && codeInputRef.current) {
      codeInputRef.current.focus();
    }
  }, [step]);

  // Start cooldown timer
  const startResendCooldown = (seconds: number = 60) => {
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

  // Handle requesting verification code
  const handleRequestCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!aktenzeichen.trim()) {
      setError('Bitte geben Sie Ihr Aktenzeichen ein.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      console.log('🔄 Requesting verification code for:', aktenzeichen);

      const response = await axios.post(`${API_BASE_URL}/api/portal/request-verification-code`, {
        aktenzeichen: aktenzeichen.trim()
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
  const handleVerifyCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!verificationCode.trim() || verificationCode.length !== 6) {
      setError('Bitte geben Sie den 6-stelligen Code ein.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      console.log('🔄 Verifying code for:', aktenzeichen);

      const response = await axios.post(`${API_BASE_URL}/api/portal/verify-code`, {
        aktenzeichen: aktenzeichen.trim(),
        code: verificationCode.trim()
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
    if (resendCooldown > 0) return;
    handleRequestCode();
  };

  // Handle going back to aktenzeichen step
  const handleBack = () => {
    setStep('aktenzeichen');
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
        handleVerifyCode();
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
              {step === 'aktenzeichen'
                ? 'Geben Sie Ihr Aktenzeichen ein, um einen Anmeldecode zu erhalten'
                : 'Geben Sie den Code ein, den wir an Ihre E-Mail gesendet haben'}
            </p>
          </div>

          {/* Step 1: Aktenzeichen Input */}
          {step === 'aktenzeichen' && (
            <form onSubmit={handleRequestCode} className="space-y-5">
              <div className="space-y-4">
                <div className="relative">
                  <input
                    type="text"
                    id="aktenzeichen"
                    placeholder="Aktenzeichen (z.B. ABC-2024-001)"
                    autoComplete="off"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck="false"
                    required
                    value={aktenzeichen}
                    onChange={(e) => {
                      setAktenzeichen(e.target.value.toUpperCase());
                      setError('');
                    }}
                    className="w-full h-12 bg-gray-50 border border-gray-300 rounded-lg px-4 text-base text-gray-900 placeholder-gray-500 transition-all duration-200 focus:outline-none focus:bg-white focus:border-gray-500 focus:ring-2 focus:ring-gray-200 uppercase"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading || !aktenzeichen.trim()}
                  className={`w-full h-12 ${
                    aktenzeichen.trim()
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-gray-900 hover:bg-black'
                  } disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-base rounded-lg transition-all duration-200 hover:shadow-md`}
                >
                  {loading ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Code wird gesendet...
                    </div>
                  ) : (
                    'Code anfordern'
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
