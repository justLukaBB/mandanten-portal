import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

// In development, admin portal runs on port 5173 (Vite).
// In production, configure this to the actual admin portal domain/path.
const ADMIN_PORTAL_URL = import.meta.env.VITE_ADMIN_PORTAL_URL || 'http://localhost:5173';

function getAdminRedirectPath(pathname: string): string {
  if (pathname.startsWith('/agent/review')) {
    return '/review';
  }
  if (pathname.startsWith('/agent/dashboard')) {
    return '/dashboard';
  }
  return '/';
}

export default function AgentRedirect() {
  const location = useLocation();
  const [countdown, setCountdown] = useState(3);

  const isAuthenticated =
    !!localStorage.getItem('auth_token') &&
    localStorage.getItem('active_role') === 'agent';

  const adminPath = getAdminRedirectPath(location.pathname);
  const adminUrl = `${ADMIN_PORTAL_URL}${adminPath}`;

  useEffect(() => {
    if (!isAuthenticated) {
      window.location.replace('/agent/login');
      return;
    }

    // Countdown ticker
    const ticker = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(ticker);
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    // Auto-redirect after 3 seconds
    const timer = setTimeout(() => {
      window.location.href = adminUrl;
    }, 3000);

    return () => {
      clearInterval(ticker);
      clearTimeout(timer);
    };
  }, [isAuthenticated, adminUrl]);

  // Unauthenticated users — render nothing (redirect to login handled in useEffect)
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FAFAFA',
        fontFamily: 'DM Sans, sans-serif',
      }}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E5E7EB',
          borderRadius: '12px',
          padding: '40px 48px',
          maxWidth: '440px',
          width: '100%',
          textAlign: 'center',
        }}
      >
        {/* Spinner */}
        <div
          style={{
            width: '40px',
            height: '40px',
            border: '3px solid #E5E7EB',
            borderTopColor: '#F97316',
            borderRadius: '50%',
            margin: '0 auto 24px',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

        {/* Heading */}
        <h1
          style={{
            fontSize: '20px',
            fontWeight: 600,
            color: '#111827',
            marginBottom: '12px',
          }}
        >
          Seite verschoben
        </h1>

        {/* Message */}
        <p
          style={{
            fontSize: '14px',
            color: '#6B7280',
            lineHeight: 1.6,
            marginBottom: '24px',
          }}
        >
          Diese Seite ist jetzt im neuen Admin-Portal verfügbar. Sie werden automatisch
          weitergeleitet...{' '}
          <span style={{ fontWeight: 600, color: '#374151' }}>({countdown}s)</span>
        </p>

        {/* Manual link */}
        <a
          href={adminUrl}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#F97316',
            color: '#FFFFFF',
            borderRadius: '8px',
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: 600,
            textDecoration: 'none',
            transition: 'opacity 100ms',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          Jetzt zum Admin-Portal
        </a>
      </div>
    </div>
  );
}
