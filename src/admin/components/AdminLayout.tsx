import React, { useState } from 'react';
import { 
  ChartBarIcon, 
  UserGroupIcon, 
  Cog6ToothIcon,
  ArrowLeftOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  CurrencyEuroIcon,
  PresentationChartLineIcon
} from '@heroicons/react/24/outline';

interface AdminLayoutProps {
  children: React.ReactNode;
  currentPage: 'analytics' | 'settings' | 'create-user';
  onNavigate: (page: 'analytics' | 'settings' | 'create-user') => void;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children, currentPage, onNavigate }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navigation = [
    { 
      name: 'Analytics', 
      key: 'analytics' as const, 
      icon: PresentationChartLineIcon,
      description: '📊 Read-Only Monitoring & Analytics (NEU)'
    },
    { 
      name: 'Dashboard (Legacy)', 
      key: 'dashboard' as const, 
      icon: ChartBarIcon,
      description: '⚠️ Alt - wird durch Analytics ersetzt'
    },
    { 
      name: 'Mandanten', 
      key: 'clients' as const, 
      icon: UserGroupIcon,
      description: 'Mandantenverwaltung und Dokumentenanalyse'
    },
    { 
      name: 'Schuldenregulierung', 
      key: 'debt-restructuring' as const, 
      icon: CurrencyEuroIcon,
      description: 'Phase 2: Pfändungsberechnung & Gläubiger-Quoten'
    },
    { 
      name: 'Einstellungen', 
      key: 'settings' as const, 
      icon: Cog6ToothIcon,
      description: 'System- und AI-Konfiguration'
    }
  ];

  const handleLogout = () => {
    localStorage.removeItem('admin_auth');
    window.location.href = '/admin/login';
  };

  return (
    <div className="h-screen flex overflow-hidden bg-gray-100">
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 flex z-40 md:hidden ${sidebarOpen ? '' : 'pointer-events-none'}`}>
        <div className={`fixed inset-0 bg-gray-600 bg-opacity-75 ${sidebarOpen ? 'opacity-100' : 'opacity-0'} transition-opacity ease-linear duration-300`} onClick={() => setSidebarOpen(false)} />
        
        <div className={`relative flex-1 flex flex-col max-w-xs w-full bg-white ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform ease-in-out duration-300`}>
          <div className="absolute top-0 right-0 -mr-12 pt-2">
            <button
              type="button"
              className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
              onClick={() => setSidebarOpen(false)}
            >
              <XMarkIcon className="h-6 w-6 text-white" />
            </button>
          </div>
          <SidebarContent navigation={navigation} currentPage={currentPage} onNavigate={onNavigate} onLogout={handleLogout} />
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:flex md:flex-shrink-0">
        <div className="flex flex-col w-64">
          <SidebarContent navigation={navigation} currentPage={currentPage} onNavigate={onNavigate} onLogout={handleLogout} />
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col w-0 flex-1 overflow-hidden">
        {/* Mobile header */}
        <div className="md:hidden">
          <div className="relative z-10 flex-shrink-0 flex h-16 bg-white shadow">
            <button
              type="button"
              className="px-4 border-r border-gray-200 text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-red-800 md:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Bars3Icon className="h-6 w-6" />
            </button>
            <div className="flex-1 px-4 flex justify-between">
              <div className="flex-1 flex">
                <div className="w-full flex md:ml-0">
                  <div className="relative w-full text-gray-400 focus-within:text-gray-600">
                    <div className="flex items-center h-16">
                      <h1 className="text-lg font-semibold text-gray-900">Admin Portal</h1>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 relative overflow-y-auto focus:outline-none">
          {children}
        </main>
      </div>
    </div>
  );
};

const SidebarContent: React.FC<{
  navigation: any[];
  currentPage: string;
  onNavigate: (page: 'analytics' | 'settings' | 'create-user') => void;
  onLogout: () => void;
}> = ({ navigation, currentPage, onNavigate, onLogout }) => {
  return (
    <div className="flex flex-col h-0 flex-1 border-r border-gray-200 bg-white">
      {/* Logo/Brand */}
      <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
        <div className="flex items-center flex-shrink-0 px-4 mb-8">
          <ChartBarIcon className="h-8 w-8 mr-3" style={{color: '#9f1a1d'}} />
          <h1 className="text-xl font-bold text-gray-900">Admin Portal</h1>
        </div>
        
        {/* Navigation */}
        <nav className="mt-5 flex-1 px-2 bg-white space-y-1">
          {navigation.map((item) => {
            const isActive = currentPage === item.key;
            return (
              <button
                key={item.name}
                onClick={() => onNavigate(item.key)}
                className={`w-full group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActive
                    ? 'text-white' 
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
                style={isActive ? {backgroundColor: '#9f1a1d'} : {}}
              >
                <item.icon
                  className={`mr-3 flex-shrink-0 h-6 w-6 ${
                    isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-500'
                  }`}
                />
                <div className="text-left">
                  <div>{item.name}</div>
                  <div className={`text-xs ${isActive ? 'text-gray-200' : 'text-gray-500'}`}>{item.description}</div>
                </div>
              </button>
            );
          })}
        </nav>
      </div>
      
      {/* User section */}
      <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
        <div className="flex-shrink-0 w-full group block">
          <div className="flex items-center">
            <div className="ml-3 flex-1">
              <p className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                Administrator
              </p>
              <p className="text-xs font-medium text-gray-500 group-hover:text-gray-700">
                Angemeldet
              </p>
            </div>
            <button
              onClick={onLogout}
              className="ml-3 p-2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Abmelden"
            >
              <ArrowLeftOnRectangleIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLayout;