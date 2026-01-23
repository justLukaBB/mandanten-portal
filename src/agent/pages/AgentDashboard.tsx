// import React, { useState, useEffect } from 'react';
// import { useNavigate } from 'react-router-dom';
// import { 
//   DocumentTextIcon, 
//   ChartBarIcon, 
//   ClockIcon, 
//   CheckCircleIcon,
//   ExclamationTriangleIcon,
//   ArrowRightIcon,
//   UserCircleIcon,
//   ArrowLeftOnRectangleIcon
// } from '@heroicons/react/24/outline';
// import { API_BASE_URL } from '../../config/api';

// interface Agent {
//   id: string;
//   username: string;
//   email: string;
//   first_name: string;
//   last_name: string;
//   role: string;
//   stats: {
//     total_sessions: number;
//     completed_sessions: number;
//     documents_reviewed: number;
//     creditors_corrected: number;
//   };
// }

// interface AvailableClient {
//   id: string;
//   name: string;
//   aktenzeichen: string;
//   documents_to_review: number;
//   priority: 'high' | 'medium' | 'low';
// }

// const AgentDashboard: React.FC = () => {
//   const navigate = useNavigate();
//   const [agent, setAgent] = useState<Agent | null>(null);
//   const [availableClients, setAvailableClients] = useState<AvailableClient[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState('');

//   useEffect(() => {
//     loadDashboardData();
//   }, []);

//   const loadDashboardData = async () => {
//     try {
//       const agentToken = localStorage.getItem('agent_token');
//       console.log('🔍 AgentDashboard loading data, token exists:', !!agentToken);
//       console.log('🔍 Token preview:', agentToken ? `${agentToken.substring(0, 20)}...` : 'null');

//       if (!agentToken) {
//         console.log('❌ No agent token found, redirecting to login');
//         navigate('/agent/login');
//         return;
//       }

//       // Load agent profile
//       const profileResponse = await fetch(`${API_BASE_URL}/api/agent-auth/profile`, {
//         headers: {
//           'Authorization': `Bearer ${agentToken}`
//         }
//       });

//       if (profileResponse.ok) {
//         const profileData = await profileResponse.json();
//         console.log('✅ Agent profile loaded successfully:', profileData.agent?.username);
//         setAgent(profileData.agent);
//       } else {
//         console.log('❌ Profile response failed:', profileResponse.status, profileResponse.statusText);
//         const errorText = await profileResponse.text();
//         console.log('❌ Profile error details:', errorText);
//       }

//       // Load available clients for review
//       const clientsResponse = await fetch(`${API_BASE_URL}/api/agent-review/available-clients`, {
//         headers: {
//           'Authorization': `Bearer ${agentToken}`
//         }
//       });

//       if (clientsResponse.ok) {
//         const clientsData = await clientsResponse.json();
//         console.log('✅ Available clients loaded:', clientsData.clients?.length || 0);
//         setAvailableClients(clientsData.clients || []);
//       } else {
//         console.log('❌ Available clients response failed:', clientsResponse.status, clientsResponse.statusText);
//         const errorText = await clientsResponse.text();
//         console.log('❌ Available clients error details:', errorText);
//       }

//     } catch (error: any) {
//       console.error('Error loading dashboard data:', error);
//       setError('Failed to load dashboard data');
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleLogout = () => {
//     localStorage.clear();
//     navigate('/agent/login');
//   };

//   const startReview = (clientId: string) => {
//     navigate(`/agent/review/${clientId}`);
//   };

//   if (loading) {
//     return (
//       <div className="min-h-screen flex items-center justify-center bg-gray-50">
//         <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-800"></div>
//       </div>
//     );
//   }

//   if (error || !agent) {
//     return (
//       <div className="min-h-screen flex items-center justify-center bg-gray-50">
//         <div className="text-center">
//           <ExclamationTriangleIcon className="w-12 h-12 text-red-500 mx-auto mb-4" />
//           <p className="text-gray-600">{error || 'Failed to load agent data'}</p>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div className="min-h-screen bg-gray-50">
//       {/* Header */}
//       <div className="bg-white shadow-sm border-b">
//         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
//           <div className="flex justify-between items-center py-4">
//             <div>
//               <h1 className="text-2xl font-bold text-gray-900">Agent Dashboard</h1>
//               <p className="text-gray-600">
//                 Willkommen, {agent.first_name} {agent.last_name}
//               </p>
//             </div>
//             <div className="flex items-center space-x-4">
//               <div className="flex items-center text-sm text-gray-600">
//                 <UserCircleIcon className="w-5 h-5 mr-2" />
//                 {agent.username} ({agent.role})
//               </div>
//               <button
//                 onClick={handleLogout}
//                 className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
//               >
//                 <ArrowLeftOnRectangleIcon className="w-4 h-4 mr-2" />
//                 Abmelden
//               </button>
//             </div>
//           </div>
//         </div>
//       </div>

//       <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
//         {/* Statistics Cards */}
//         <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
//           <div className="bg-white rounded-lg shadow-sm p-6">
//             <div className="flex items-center">
//               <ChartBarIcon className="w-8 h-8 text-blue-500" />
//               <div className="ml-4">
//                 <p className="text-sm font-medium text-gray-500">Gesamt Sessions</p>
//                 <p className="text-2xl font-bold text-gray-900">{agent.stats.total_sessions}</p>
//               </div>
//             </div>
//           </div>

//           <div className="bg-white rounded-lg shadow-sm p-6">
//             <div className="flex items-center">
//               <CheckCircleIcon className="w-8 h-8 text-green-500" />
//               <div className="ml-4">
//                 <p className="text-sm font-medium text-gray-500">Abgeschlossen</p>
//                 <p className="text-2xl font-bold text-gray-900">{agent.stats.completed_sessions}</p>
//               </div>
//             </div>
//           </div>

//           <div className="bg-white rounded-lg shadow-sm p-6">
//             <div className="flex items-center">
//               <DocumentTextIcon className="w-8 h-8 text-purple-500" />
//               <div className="ml-4">
//                 <p className="text-sm font-medium text-gray-500">Dokumente geprüft</p>
//                 <p className="text-2xl font-bold text-gray-900">{agent.stats.documents_reviewed}</p>
//               </div>
//             </div>
//           </div>

//           <div className="bg-white rounded-lg shadow-sm p-6">
//             <div className="flex items-center">
//               <ClockIcon className="w-8 h-8 text-orange-500" />
//               <div className="ml-4">
//                 <p className="text-sm font-medium text-gray-500">Korrekturen</p>
//                 <p className="text-2xl font-bold text-gray-900">{agent.stats.creditors_corrected}</p>
//               </div>
//             </div>
//           </div>
//         </div>

//         {/* Available Reviews */}
//         <div className="bg-white rounded-lg shadow-sm">
//           <div className="px-6 py-4 border-b border-gray-200">
//             <h2 className="text-lg font-semibold text-gray-900">Verfügbare Reviews</h2>
//             <p className="text-sm text-gray-600">
//               Clients mit Dokumenten, die eine manuelle Prüfung benötigen
//             </p>
//           </div>

//           <div className="p-6">
//             {availableClients.length === 0 ? (
//               <div className="text-center py-12">
//                 <CheckCircleIcon className="w-16 h-16 text-green-400 mx-auto mb-4" />
//                 <h3 className="text-lg font-medium text-gray-900 mb-2">
//                   Keine Reviews verfügbar
//                 </h3>
//                 <p className="text-gray-600">
//                   Alle Dokumente wurden bereits geprüft oder benötigen keine manuelle Prüfung.
//                 </p>
//               </div>
//             ) : (
//               <div className="space-y-4">
//                 {availableClients.map((client) => (
//                   <div
//                     key={client.id}
//                     className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
//                   >
//                     <div className="flex-1">
//                       <div className="flex items-center space-x-4">
//                         <div>
//                           <h3 className="font-medium text-gray-900">{client.name}</h3>
//                           <p className="text-sm text-gray-600">
//                             Aktenzeichen: {client.aktenzeichen}
//                           </p>
//                         </div>

//                         <div className="flex items-center space-x-2">
//                           <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
//                             client.priority === 'high' 
//                               ? 'bg-red-100 text-red-800'
//                               : client.priority === 'medium'
//                               ? 'bg-yellow-100 text-yellow-800'
//                               : 'bg-green-100 text-green-800'
//                           }`}>
//                             {client.priority === 'high' ? 'Hoch' : 
//                              client.priority === 'medium' ? 'Mittel' : 'Niedrig'}
//                           </span>

//                           <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
//                             {client.documents_to_review} Dokument{client.documents_to_review !== 1 ? 'e' : ''}
//                           </span>
//                         </div>
//                       </div>
//                     </div>

//                     <button
//                       onClick={() => startReview(client.id)}
//                       className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:opacity-90 transition-opacity"
//                       style={{backgroundColor: '#9f1a1d'}}
//                     >
//                       Review starten
//                       <ArrowRightIcon className="w-4 h-4 ml-2" />
//                     </button>
//                   </div>
//                 ))}
//               </div>
//             )}
//           </div>
//         </div>

//         {/* Instructions */}
//         <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
//           <h3 className="text-lg font-medium text-blue-900 mb-2">📋 Anleitung</h3>
//           <div className="text-sm text-blue-800 space-y-2">
//             <p>• <strong>Reviews starten:</strong> Wählen Sie einen Client aus der Liste oben aus</p>
//             <p>• <strong>Priorität:</strong> Rote Labels haben höchste Priorität</p>
//             <p>• <strong>Dokumente:</strong> Nur Dokumente mit niedriger Confidence (&lt;80%) werden angezeigt</p>
//             <p>• <strong>Korrekturen:</strong> Bearbeiten Sie Gläubigerdaten direkt im Review-Interface</p>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default AgentDashboard;

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DocumentTextIcon,
  ChartBarIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowRightIcon,
  UserCircleIcon,
  ArrowLeftOnRectangleIcon
} from '@heroicons/react/24/outline';
import { API_BASE_URL } from '../../config/api';

interface Agent {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  stats: {
    total_sessions: number;
    completed_sessions: number;
    documents_reviewed: number;
    creditors_corrected: number;
  };
}

interface AvailableClient {
  id: string;
  name: string;
  aktenzeichen: string;
  documents_to_review: number;
  priority: 'high' | 'medium' | 'low';
}

const AgentDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [availableClients, setAvailableClients] = useState<AvailableClient[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const ITEMS_PER_PAGE = 10;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDashboardData(page);
  }, [page]);

  const loadDashboardData = async (pageToLoad: number) => {
    try {
      const agentToken = localStorage.getItem('agent_token');
      console.log('🔍 AgentDashboard loading data, token exists:', !!agentToken);
      console.log('🔍 Token preview:', agentToken ? `${agentToken.substring(0, 20)}...` : 'null');

      if (!agentToken) {
        console.log('❌ No agent token found, redirecting to login');
        navigate('/agent/login');
        return;
      }

      // Load agent profile
      const profileResponse = await fetch(`${API_BASE_URL}/api/agent-auth/profile`, {
        headers: {
          'Authorization': `Bearer ${agentToken}`
        }
      });

      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        console.log('✅ Agent profile loaded successfully:', profileData.agent?.username);
        setAgent(profileData.agent);
      } else {
        console.log('❌ Profile response failed:', profileResponse.status, profileResponse.statusText);
        const errorText = await profileResponse.text();
        console.log('❌ Profile error details:', errorText);
      }

      // Load available clients for review
      const clientsResponse = await fetch(`${API_BASE_URL}/api/agent-review/available-clients?page=${pageToLoad}&limit=${ITEMS_PER_PAGE}`, {
        headers: {
          'Authorization': `Bearer ${agentToken}`
        }
      });

      if (clientsResponse.ok) {
        const clientsData = await clientsResponse.json();
        console.log('✅ Available clients loaded:', clientsData.clients?.length || 0);
        setAvailableClients(clientsData.clients || []);
        setTotal(clientsData.total || 0);
        setPages(clientsData.pages || 1);
        if (clientsData.page && clientsData.page !== page) {
          setPage(clientsData.page);
        }
      } else {
        console.log('❌ Available clients response failed:', clientsResponse.status, clientsResponse.statusText);
        const errorText = await clientsResponse.text();
        console.log('❌ Available clients error details:', errorText);
      }

    } catch (error: any) {
      console.error('Error loading dashboard data:', error);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/agent/login');
  };

  const startReview = (clientId: string) => {
    navigate(`/agent/review/${clientId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-800"></div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <ExclamationTriangleIcon className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600">{error || 'Failed to load agent data'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Agent Dashboard</h1>
              <p className="text-gray-600">
                Willkommen, {agent.first_name} {agent.last_name}
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center text-sm text-gray-600">
                <UserCircleIcon className="w-5 h-5 mr-2" />
                {agent.username} ({agent.role})
              </div>
              <button
                onClick={handleLogout}
                className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <ArrowLeftOnRectangleIcon className="w-4 h-4 mr-2" />
                Abmelden
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center">
              <ChartBarIcon className="w-8 h-8 text-blue-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Gesamt Sessions</p>
                <p className="text-2xl font-bold text-gray-900">{agent.stats.total_sessions}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center">
              <CheckCircleIcon className="w-8 h-8 text-green-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Abgeschlossen</p>
                <p className="text-2xl font-bold text-gray-900">{agent.stats.completed_sessions}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center">
              <DocumentTextIcon className="w-8 h-8 text-purple-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Dokumente geprüft</p>
                <p className="text-2xl font-bold text-gray-900">{agent.stats.documents_reviewed}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center">
              <ClockIcon className="w-8 h-8 text-orange-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Korrekturen</p>
                <p className="text-2xl font-bold text-gray-900">{agent.stats.creditors_corrected}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Available Reviews */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Verfügbare Reviews</h2>
            <p className="text-sm text-gray-600">
              Clients mit Dokumenten, die eine manuelle Prüfung benötigen
            </p>
          </div>

          <div className="p-6">
            {availableClients.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircleIcon className="w-16 h-16 text-green-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Keine Reviews verfügbar
                </h3>
                <p className="text-gray-600">
                  Alle Dokumente wurden bereits geprüft oder benötigen keine manuelle Prüfung.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {availableClients.map((client) => (
                  <div
                    key={client.id}
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center space-x-4">
                        <div>
                          <h3 className="font-medium text-gray-900">{client.name}</h3>
                          <p className="text-sm text-gray-600">
                            Aktenzeichen: {client.aktenzeichen}
                          </p>
                        </div>

                        <div className="flex items-center space-x-2">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${client.priority === 'high'
                            ? 'bg-red-100 text-red-800'
                            : client.priority === 'medium'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-green-100 text-green-800'
                            }`}>
                            {client.priority === 'high' ? 'Hoch' :
                              client.priority === 'medium' ? 'Mittel' : 'Niedrig'}
                          </span>

                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {client.documents_to_review} Dokument{client.documents_to_review !== 1 ? 'e' : ''}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => startReview(client.id)}
                      className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:opacity-90 transition-opacity"
                      style={{ backgroundColor: '#9f1a1d' }}
                    >
                      Review starten
                      <ArrowRightIcon className="w-4 h-4 ml-2" />
                    </button>
                  </div>
                ))}

                {/* Pagination controls */}
                {pages > 1 && (
                  <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                    <div className="text-sm text-gray-600">
                      Seite {page} von {pages} • Gesamt: {total}
                    </div>
                    <div className="space-x-2">
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-3 py-1 text-sm border border-gray-300 rounded-md bg-white text-gray-700 disabled:opacity-50"
                      >
                        Zurück
                      </button>
                      <button
                        onClick={() => setPage((p) => Math.min(pages, p + 1))}
                        disabled={page >= pages}
                        className="px-3 py-1 text-sm border border-gray-300 rounded-md bg-white text-gray-700 disabled:opacity-50"
                      >
                        Weiter
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <h4>test tags</h4>
        {/* Instructions */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-blue-900 mb-2">📋 Anleitung</h3>
          <div className="text-sm text-blue-800 space-y-2">
            <p>• <strong>Reviews starten:</strong> Wählen Sie einen Client aus der Liste oben aus</p>
            <p>• <strong>Priorität:</strong> Rote Labels haben höchste Priorität</p>
            <p>• <strong>Dokumente:</strong> Nur Dokumente mit niedriger Confidence (&lt;80%) werden angezeigt</p>
            <p>• <strong>Korrekturen:</strong> Bearbeiten Sie Gläubigerdaten direkt im Review-Interface</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentDashboard;