import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import PersonalPortal from './pages/PersonalPortal';
import PortalLogin from './pages/PortalLogin';
import AdminApp from './admin/AdminApp';

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const sessionToken = localStorage.getItem('portal_session_token');
  const clientId = localStorage.getItem('portal_client_id');
  
  if (!sessionToken || !clientId) {
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
                    primary: '#1e40af',
                    primaryHover: '#1e3a8a'
                  }}
                />
              </ProtectedRoute>
            } 
          />
          <Route path="/admin/*" element={<AdminApp />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;