import React, { useState, useEffect } from 'react';
import AdminLayout from './components/AdminLayout';
import AdminLogin from './pages/AdminLogin';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import CreateUser from './pages/CreateUser';
import api from '../config/api';

const AdminApp: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentPage, setCurrentPage] = useState<'analytics' | 'settings' | 'create-user'>('analytics');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is authenticated
    const authToken = localStorage.getItem('admin_auth');
    const adminToken = localStorage.getItem('admin_token');
    
    if (authToken === 'true' && adminToken) {
      // Set API auth header
      api.defaults.headers.common['Authorization'] = `Bearer ${adminToken}`;
      setIsAuthenticated(true);
    } else {
      setIsAuthenticated(false);
    }
    
    setLoading(false);
  }, []);

  const handleLogin = () => {
    // Set API auth header when logging in
    const adminToken = localStorage.getItem('admin_token');
    if (adminToken) {
      api.defaults.headers.common['Authorization'] = `Bearer ${adminToken}`;
    }
    setIsAuthenticated(true);
  };

  const handleNavigate = (page: 'analytics' | 'settings' | 'create-user') => {
    setCurrentPage(page);
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'analytics':
        return <AnalyticsDashboard />;
      case 'create-user':
        return <CreateUser />;
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
        return <AnalyticsDashboard />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-4" style={{borderBottomColor: '#9f1a1d'}}></div>
          <p className="text-gray-600">Admin Portal wird geladen...</p>
        </div>
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