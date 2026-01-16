import React, { act } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import PersonalPortal from './pages/PersonalPortal';
import PortalLogin from './pages/PortalLogin';
import ConfirmCreditors from './pages/ConfirmCreditors';
import ImpersonationAuth from './pages/ImpersonationAuth';
import AdminApp from './admin/AdminApp';
import AgentApp from './agent/AgentApp';
import AgentLogin from './agent/pages/AgentLogin';
import AdminLogin from './admin/pages/AdminLogin';
import NotFound from './pages/NotFound';
import { Toaster } from 'sonner';

const ProtectedRoute: React.FC<{ children: React.ReactElement, allowedRole: string }> = ({ children, allowedRole }) => {
  const activeRole = localStorage.getItem("active_role");
  const token = localStorage.getItem("auth_token");

  if (!token || activeRole !== allowedRole) {
    return <Navigate to={`/${allowedRole}/login`} replace />;
  }

  return children;
};

const PublicRoute: React.FC<{ children: React.ReactElement; allowedRole: string }> = ({ children, allowedRole }) => {
  const activeRole = localStorage.getItem("active_role");
  const token = localStorage.getItem("auth_token");

  const clientData = localStorage.getItem("portal_client_data");
  const data = clientData ? JSON.parse(clientData) : null;

  // If already logged in, redirect to dashboard
  if (token && activeRole === allowedRole) {
    if (activeRole === 'agent') {
      return <Navigate to={`/${allowedRole}/dashboard`} replace />;
    }

    if (activeRole === 'admin') {
      return <Navigate to={`/${allowedRole}`} replace />;
    }

    if (activeRole === 'portal' && data) {
      return <Navigate to={`/portal/${data.aktenzeichen}`} replace />;
    }
  }

  return children;
};

export { ProtectedRoute, PublicRoute };



function App() {
  return (
    <Router>
      <div className="App">
        <Toaster position="top-right" richColors closeButton />
        <Routes>
          <Route
            path="/"
            element={
              <PublicRoute allowedRole="portal">
                <Navigate to="/login" replace />
              </PublicRoute>
            }
          />

          <Route
            path="/login"
            element={
              <PublicRoute allowedRole="portal">
                <PortalLogin />
              </PublicRoute>
            }
          />

          {/* Backward-compat: redirect /portal/login to portal login */}
          <Route
            path="/portal/login"
            element={<Navigate to="/login" replace />}
          />

          <Route
            path="/auth/impersonate"
            element={<ImpersonationAuth />}
          />

          <Route
            path="admin/login"
            element={
              <PublicRoute allowedRole="admin">
                <AdminLogin />
              </PublicRoute>
            }
          />

          <Route
            path="agent/login"
            element={
              <PublicRoute allowedRole="agent">
                <AgentLogin />
              </PublicRoute>
            }
          />

          <Route
            path="/portal/confirm-creditors"
            element={
              <ConfirmCreditors />
            }
          />

          <Route
            path="/admin/*"
            element={
              <ProtectedRoute allowedRole="admin">
                <AdminApp />
              </ProtectedRoute>
            }
          />

          <Route
            path="/agent/*"
            element={
              <ProtectedRoute allowedRole="agent">
                <AgentApp />
              </ProtectedRoute>
            }
          />

          <Route
            path="/portal/:clientId"
            element={
              <ProtectedRoute allowedRole="portal">
                <PersonalPortal />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;