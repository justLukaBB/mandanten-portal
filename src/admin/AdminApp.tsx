import React, { useState, useEffect } from 'react';
import AdminLayout from './components/AdminLayout';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import ClientManagement from './pages/ClientManagement';
import DebtRestructuring from './pages/DebtRestructuring';

const AdminApp: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'clients' | 'settings' | 'debt-restructuring'>('dashboard');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is authenticated
    const authToken = localStorage.getItem('admin_auth');
    setIsAuthenticated(authToken === 'true');
    setLoading(false);
  }, []);

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleNavigate = (page: 'dashboard' | 'clients' | 'settings' | 'debt-restructuring') => {
    setCurrentPage(page);
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <AdminDashboard />;
      case 'clients':
        return <ClientManagement />;
      case 'debt-restructuring':
        return <DebtRestructuring />;
      case 'settings':
        return (
          <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Einstellungen</h2>
              <p className="text-gray-600">Einstellungsseite wird noch entwickelt...</p>
            </div>
          </div>
        );
      default:
        return <AdminDashboard />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AdminLogin onLogin={handleLogin} />;
  }

  return (
    <AdminLayout currentPage={currentPage} onNavigate={handleNavigate}>
      {renderPage()}
    </AdminLayout>
  );
};

export default AdminApp;