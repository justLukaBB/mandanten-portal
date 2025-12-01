import React, { useState, useEffect } from 'react';
import AdminLayout from './components/AdminLayout';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import CreateUser from './pages/CreateUser';
import Settings from './pages/Settings';
import UserList from './pages/UserList';
import CreditorDatabase from './pages/CreditorDatabase';

const AdminApp: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<'analytics' | 'settings' | 'create-user' | 'user-list' | 'creditor-database'>('analytics');

  useEffect(() => {
    console.log(currentPage);
    
  })

  const handleNavigate = (page: 'analytics' | 'settings' | 'create-user' | 'user-list' | 'creditor-database') => {
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
      case 'creditor-database':
        return <CreditorDatabase />;
      case 'settings':
        return <Settings />;
      case 'user-list':
        return <UserList onBack={handleBackToAnalytics} />;
      default:
        return <AnalyticsDashboard onNavigateToUserList={handleNavigateToUserList} />;
    }
  };

  return (
    <AdminLayout currentPage={currentPage} onNavigate={handleNavigate}>
      {renderPage()}
    </AdminLayout>
  );
};

export default AdminApp;