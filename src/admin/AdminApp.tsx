import React, { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      console.log('🔍 AdminApp: Checking authentication...');
      
      // Check if user is authenticated
      const authToken = localStorage.getItem('admin_auth');
      const adminToken = localStorage.getItem('admin_token');
      
      console.log('🔑 AdminApp: Auth check:', { 
        hasAuthFlag: authToken === 'true', 
        hasToken: !!adminToken,
        tokenLength: adminToken?.length || 0
      });
      
      if (authToken === 'true' && adminToken) {
        try {
          // Don't manually set headers - let the interceptor handle it
          // The API interceptor will automatically add the admin_token
          
          // Add a small delay to ensure localStorage is fully synced
          await new Promise(resolve => setTimeout(resolve, 50));
          
          // Validate token by making a test request
          console.log('🧪 AdminApp: Testing token with API request...');
          const response = await api.get('/api/admin/clients');
          
          if (response.status === 200) {
            console.log('✅ AdminApp: Authentication successful!');
            navigate("/admin");
            setIsAuthenticated(true);
            
          } else {
            throw new Error(`Token validation failed with status: ${response.status}`);
          }
        } catch (error: any) {
          console.warn('❌ AdminApp: Token validation failed, clearing auth:', error.message);
          
          // Clear invalid tokens
          localStorage.removeItem('admin_auth');
          localStorage.removeItem('admin_token');
          localStorage.removeItem('admin_email');
          
          // Don't manually delete headers, let interceptor handle it
          setIsAuthenticated(false);
        }
      } else {
        console.log('🚫 AdminApp: No valid auth tokens found');
        setIsAuthenticated(false);
      }
      
      setLoading(false);
    };
    
    checkAuth();
  }, []);

  const handleLogin = () => {
    // Don't manually set headers - let the interceptor handle it
    console.log('✅ AdminApp: Login successful, authentication state updated');
    setIsAuthenticated(true);
    navigate("/admin");
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