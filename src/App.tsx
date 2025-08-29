import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import PersonalPortal from './pages/PersonalPortal';
import PortalLogin from './pages/PortalLogin';
import ConfirmCreditors from './pages/ConfirmCreditors';
import AdminApp from './admin/AdminApp';
import AgentApp from './agent/AgentApp';

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = React.useState<boolean | null>(null);
  
  React.useEffect(() => {
    const checkAuth = () => {
      const sessionToken = localStorage.getItem('portal_session_token');
      const clientId = localStorage.getItem('portal_client_id');
      
      console.log('🔍 ProtectedRoute: Checking auth tokens:', {
        hasSessionToken: !!sessionToken,
        hasClientId: !!clientId
      });
      
      if (sessionToken && clientId) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
    };
    
    // Check immediately
    checkAuth();
    
    // Listen for localStorage changes (from login)
    const handleStorageChange = () => {
      checkAuth();
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // Custom event for localStorage changes within the same tab
    const handleLoginSuccess = () => {
      checkAuth();
    };
    
    window.addEventListener('loginSuccess', handleLoginSuccess);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('loginSuccess', handleLoginSuccess);
    };
  }, []);
  
  // Show loading state while checking authentication
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-800"></div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);

  React.useEffect(() => {
    // Check if user is already logged in
    const sessionToken = localStorage.getItem('portal_session_token');
    if (sessionToken) {
      setIsAuthenticated(true);
    }
  }, []);

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<PortalLogin />} />
          <Route 
            path="/portal" 
            element={
              <ProtectedRoute>
                <PersonalPortal 
                  clientId={localStorage.getItem('portal_client_id') || ''}
                  customTitle="Mandanten Portal"
                  customColors={{
                    primary: '#9f1a1d',
                    primaryHover: '#7d1517'
                  }}
                />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/portal/confirm-creditors" 
            element={
              <ConfirmCreditors />
            } 
          />
          <Route path="/admin/*" element={<AdminApp />} />
          <Route path="/agent/*" element={<AgentApp />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;