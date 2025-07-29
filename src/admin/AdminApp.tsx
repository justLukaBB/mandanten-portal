import React, { useState, useEffect } from 'react';
import AdminLayout from './components/AdminLayout';
import AdminLogin from './pages/AdminLogin';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import CreateUser from './pages/CreateUser';
import Settings from './pages/Settings';
import UserList from './pages/UserList';
import api from '../config/api';

const AdminApp: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentPage, setCurrentPage] = useState<'analytics' | 'settings' | 'create-user' | 'user-list'>('analytics');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      // Check if user is authenticated
      const authToken = localStorage.getItem('admin_auth');
      const adminToken = localStorage.getItem('admin_token');
      
      if (authToken === 'true' && adminToken) {
        try {
          // Set API auth header
          api.defaults.headers.common['Authorization'] = `Bearer ${adminToken}`;
          
          // Validate token by making a test request
          const response = await api.get('/admin/clients');
          if (response.status === 200) {
            setIsAuthenticated(true);
          } else {
            throw new Error('Token validation failed');
          }
        } catch (error) {
          console.warn('Token validation failed, clearing auth:', error);
          // Clear invalid tokens
          localStorage.removeItem('admin_auth');
          localStorage.removeItem('admin_token');
          localStorage.removeItem('admin_email');
          delete api.defaults.headers.common['Authorization'];
          setIsAuthenticated(false);
        }
      } else {
        setIsAuthenticated(false);
      }
      
      setLoading(false);
    };
    
    checkAuth();
  }, []);

  const handleLogin = () => {
    // Set API auth header when logging in
    const adminToken = localStorage.getItem('admin_token');
    if (adminToken) {
      api.defaults.headers.common['Authorization'] = `Bearer ${adminToken}`;
    }
    setIsAuthenticated(true);
  };

  const handleNavigate = (page: 'analytics' | 'settings' | 'create-user' | 'user-list') => {
    setCurrentPage(page);
  };

  const handleNavigateToUserList = () => {
    setCurrentPage('user-list');
  };

  const handleBackToAnalytics = () => {
    setCurrentPage('analytics');
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'analytics':
        return <AnalyticsDashboard onNavigateToUserList={handleNavigateToUserList} />;
      case 'create-user':
        return <CreateUser />;
      case 'settings':
        return <Settings />;
      case 'user-list':
        return <UserList onBack={handleBackToAnalytics} />;
      default:
        return <AnalyticsDashboard onNavigateToUserList={handleNavigateToUserList} />;
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