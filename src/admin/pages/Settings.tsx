import React, { useState, useEffect } from 'react';
import { 
  ExclamationTriangleIcon,
  TrashIcon,
  CheckCircleIcon,
  UserPlusIcon,
  UsersIcon,
  EyeIcon,
  EyeSlashIcon,
  PencilIcon,
  BeakerIcon,
  DocumentTextIcon,
  PlayIcon,
  PaperAirplaneIcon
} from '@heroicons/react/24/outline';
import { API_BASE_URL } from '../../config/api';

interface Agent {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login?: string;
  stats: {
    total_sessions: number;
    completed_sessions: number;
    documents_reviewed: number;
  };
}

interface NewAgent {
  username: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role: 'agent' | 'senior_agent' | 'supervisor';
}

const Settings: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [clearResult, setClearResult] = useState<any>(null);
  
  // Agent Management State
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [agentLoading, setAgentLoading] = useState(false);
  const [newAgent, setNewAgent] = useState<NewAgent>({
    username: '',
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    role: 'agent'
  });

  // Email Test Mode State
  const [emailTestMode, setEmailTestMode] = useState(false);
  const [emailTestAddress, setEmailTestAddress] = useState('justlukax@gmail.com');
  const [emailTestLoading, setEmailTestLoading] = useState(false);

  // Confirmation Email Delay State
  const [confirmationDelayHours, setConfirmationDelayHours] = useState(3);
  const [confirmationDelayLoading, setConfirmationDelayLoading] = useState(false);

  // Test Scenario State
  const [testScenarios, setTestScenarios] = useState<any[]>([]);
  const [testLoading, setTestLoading] = useState(false);
  const [lastTestResult, setLastTestResult] = useState<any>(null);

  // Load agents and test scenarios on component mount
  useEffect(() => {
    loadAgents();
    loadTestScenarios();
    loadEmailTestMode();
    loadConfirmationDelay();
  }, []);

  const loadEmailTestMode = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/settings/email-test-mode`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setEmailTestMode(data.enabled);
        setEmailTestAddress(data.testAddress);
      }
    } catch (error) {
      console.error('Error loading email test mode:', error);
    }
  };

  const loadConfirmationDelay = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/settings/confirmation-email-delay`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setConfirmationDelayHours(data.hours);
      }
    } catch (error) {
      console.error('Error loading confirmation delay:', error);
    }
  };

  const saveConfirmationDelay = async (hours: number) => {
    setConfirmationDelayLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/settings/confirmation-email-delay`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        },
        body: JSON.stringify({ hours })
      });
      if (!response.ok) {
        throw new Error('Failed to update confirmation email delay');
      }
      const data = await response.json();
      setConfirmationDelayHours(data.hours);
      setMessage({
        type: 'success',
        text: data.hours === 0
          ? 'Bestätigungsmail wird sofort nach Gläubigerbestätigung gesendet.'
          : `Bestätigungsmail wird ${data.hours} Stunde${data.hours !== 1 ? 'n' : ''} nach Gläubigerbestätigung gesendet.`
      });
    } catch (error: any) {
      setMessage({ type: 'error', text: `Fehler: ${error.message}` });
    } finally {
      setConfirmationDelayLoading(false);
    }
  };

  const toggleEmailTestMode = async () => {
    setEmailTestLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/settings/email-test-mode`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        },
        body: JSON.stringify({ enabled: !emailTestMode, testAddress: emailTestAddress })
      });
      if (!response.ok) {
        throw new Error('Failed to toggle email test mode');
      }
      const data = await response.json();
      setEmailTestMode(data.enabled);
      setEmailTestAddress(data.testAddress);
      setMessage({
        type: 'success',
        text: data.enabled
          ? `E-Mail Testmodus aktiviert. Alle E-Mails gehen an ${data.testAddress}`
          : 'E-Mail Testmodus deaktiviert. E-Mails gehen an echte Empfänger.'
      });
    } catch (error: any) {
      setMessage({ type: 'error', text: `Fehler: ${error.message}` });
    } finally {
      setEmailTestLoading(false);
    }
  };

  const loadAgents = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/agent-auth/list`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setAgents(data.agents || []);
        console.log(`📋 Loaded ${data.agents?.length || 0} agents`);
      } else {
        console.error('Failed to load agents:', response.status);
        setAgents([]);
      }
    } catch (error) {
      console.error('Error loading agents:', error);
      setAgents([]);
    }
  };

  const handleCreateAgent = async () => {
    if (!newAgent.username.trim() || !newAgent.email.trim() || !newAgent.password.trim() || 
        !newAgent.first_name.trim() || !newAgent.last_name.trim()) {
      setMessage({
        type: 'error',
        text: 'Bitte füllen Sie alle Pflichtfelder aus.'
      });
      return;
    }

    setAgentLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/agent-auth/create-via-admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        },
        body: JSON.stringify(newAgent)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create agent');
      }

      const result = await response.json();
      
      setMessage({
        type: 'success',
        text: `✅ Agent "${result.agent.username}" erfolgreich erstellt!`
      });

      // Reset form
      setNewAgent({
        username: '',
        email: '',
        password: '',
        first_name: '',
        last_name: '',
        role: 'agent'
      });
      
      setShowCreateAgent(false);
      loadAgents(); // Reload agents list

    } catch (error: any) {
      console.error('Error creating agent:', error);
      setMessage({
        type: 'error',
        text: `❌ Fehler beim Erstellen des Agents: ${error.message}`
      });
    } finally {
      setAgentLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setNewAgent(prev => ({ ...prev, [name]: value }));
  };

  // Test Scenario Functions
  const loadTestScenarios = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/test/agent-review/scenarios`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setTestScenarios(data.scenarios || []);
      }
    } catch (error) {
      console.error('Error loading test scenarios:', error);
    }
  };

  const createTestScenario = async () => {
    setTestLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/test/agent-review/create-test-scenario`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to create test scenario');
      }

      const result = await response.json();
      setLastTestResult(result);
      
      setMessage({
        type: 'success',
        text: `✅ Test-Szenario erstellt! Client: ${result.test_client.aktenzeichen} mit ${result.test_client.documents.need_review} problematischen Dokumenten.`
      });

      loadTestScenarios(); // Reload scenarios

    } catch (error: any) {
      console.error('Error creating test scenario:', error);
      setMessage({
        type: 'error',
        text: `❌ Fehler beim Erstellen des Test-Szenarios: ${error.message}`
      });
    } finally {
      setTestLoading(false);
    }
  };

  const cleanupTestScenarios = async () => {
    setTestLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/test/agent-review/cleanup`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to cleanup test scenarios');
      }

      const result = await response.json();
      
      setMessage({
        type: 'success',
        text: `✅ ${result.deleted_count} Test-Szenarien gelöscht.`
      });

      setTestScenarios([]);
      setLastTestResult(null);

    } catch (error: any) {
      console.error('Error cleaning up test scenarios:', error);
      setMessage({
        type: 'error',
        text: `❌ Fehler beim Löschen: ${error.message}`
      });
    } finally {
      setTestLoading(false);
    }
  };

  const handleClearDatabase = async () => {
    setLoading(true);
    setMessage(null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/clear-database`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to clear database');
      }

      const result = await response.json();
      setClearResult(result);
      setMessage({
        type: 'success',
        text: `✅ Database erfolgreich geleert! ${result.stats.clients_deleted} Clients gelöscht.`
      });
      
      setShowConfirm(false);
      
    } catch (error) {
      console.error('Error clearing database:', error);
      setMessage({
        type: 'error',
        text: '❌ Fehler beim Leeren der Database. Bitte versuchen Sie es erneut.'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">⚙️ Einstellungen</h1>
        <p className="text-gray-600 mt-1">
          System-Konfiguration und Datenbank-Verwaltung
        </p>
      </div>

      {/* Email Test Mode Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <PaperAirplaneIcon className="w-5 h-5 mr-2" />
            E-Mail Versand
          </h2>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            emailTestMode
              ? 'bg-yellow-100 text-yellow-800'
              : 'bg-green-100 text-green-800'
          }`}>
            {emailTestMode ? 'Testmodus' : 'Produktionsmodus'}
          </span>
        </div>

        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <p className="font-medium text-gray-900">E-Mail Testmodus</p>
            <p className="text-sm text-gray-500 mt-1">
              {emailTestMode
                ? 'Alle Gläubiger-E-Mails werden an die Testadresse umgeleitet'
                : 'E-Mails werden an die echten Gläubiger-Adressen gesendet'}
            </p>
          </div>
          <button
            onClick={toggleEmailTestMode}
            disabled={emailTestLoading}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              emailTestMode
                ? 'bg-yellow-500 focus:ring-yellow-500'
                : 'bg-gray-300 focus:ring-gray-400'
            } ${emailTestLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                emailTestMode ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {emailTestMode && (
          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>Testadresse:</strong> {emailTestAddress}
            </p>
            <p className="text-xs text-yellow-700 mt-1">
              Alle Gläubiger-E-Mails (1. Anschreiben + Schuldenbereinigungspläne) werden an diese Adresse gesendet. Der originale Empfänger wird im Betreff angezeigt.
            </p>
          </div>
        )}

        {/* Confirmation Email Delay */}
        <div className="mt-4 flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <p className="font-medium text-gray-900">Bestätigungsmail Verzögerung</p>
            <p className="text-sm text-gray-500 mt-1">
              Wartezeit nach Gläubigerbestätigung, bevor die Bestätigungsmail an den Mandanten gesendet wird.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="number"
              min="0"
              max="72"
              step="0.5"
              value={confirmationDelayHours}
              onChange={(e) => setConfirmationDelayHours(Number(e.target.value))}
              className="w-20 px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500"
            />
            <span className="text-sm text-gray-600">Stunden</span>
            <button
              onClick={() => saveConfirmationDelay(confirmationDelayHours)}
              disabled={confirmationDelayLoading}
              className="px-3 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              style={{backgroundColor: '#9f1a1d'}}
            >
              {confirmationDelayLoading ? '...' : 'Speichern'}
            </button>
          </div>
        </div>
      </div>

      {/* Test Agent Review Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <BeakerIcon className="w-5 h-5 mr-2" />
            Agent Review Testing
          </h2>
          <div className="flex space-x-2">
            <button
              onClick={createTestScenario}
              disabled={testLoading}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              style={{backgroundColor: '#9f1a1d'}}
            >
              {testLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Erstelle...
                </>
              ) : (
                <>
                  <PlayIcon className="w-4 h-4 mr-2" />
                  Test-Szenario erstellen
                </>
              )}
            </button>
            {testScenarios.length > 0 && (
              <button
                onClick={cleanupTestScenarios}
                disabled={testLoading}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                <TrashIcon className="w-4 h-4 mr-2" />
                Aufräumen
              </button>
            )}
          </div>
        </div>

        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="text-sm font-medium text-blue-900 mb-2">🧪 Was wird erstellt:</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• <strong>Test-Client</strong> mit problematischen Dokumenten</li>
            <li>• <strong>3 Dokumente</strong> mit niedriger Confidence (&lt;80%) - benötigen manuelle Prüfung</li>
            <li>• <strong>1 Dokument</strong> mit hoher Confidence (&gt;95%) - keine Prüfung nötig</li>
            <li>• <strong>Verschiedene Probleme:</strong> Fehlende E-Mails, unklare Namen, schlechte OCR-Qualität</li>
          </ul>
        </div>

        {lastTestResult && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <h3 className="text-sm font-medium text-green-900 mb-2">✅ Letztes Test-Szenario:</h3>
            <div className="text-sm text-green-800">
              <p><strong>Client:</strong> {lastTestResult.test_client.name} ({lastTestResult.test_client.aktenzeichen})</p>
              <p><strong>Dokumente zur Prüfung:</strong> {lastTestResult.test_client.documents.need_review} von {lastTestResult.test_client.documents.total}</p>
              <p><strong>Gläubiger zur Prüfung:</strong> {lastTestResult.test_client.creditors.need_review} von {lastTestResult.test_client.creditors.total}</p>
              
              <div className="mt-2 p-2 bg-white rounded border">
                <p className="font-medium">🔗 Review-Links:</p>
                <div className="mt-1 space-y-1">
                  <div>
                    <span className="text-xs text-gray-600">Direct Link:</span>
                    <code className="ml-2 text-xs bg-gray-100 px-1 rounded">
                      {lastTestResult.test_client.direct_review_url}
                    </code>
                  </div>
                  <div>
                    <span className="text-xs text-gray-600">Relative Path:</span>
                    <code className="ml-2 text-xs bg-gray-100 px-1 rounded">
                      {lastTestResult.test_client.review_url}
                    </code>
                  </div>
                </div>
              </div>

              {lastTestResult.review_summary && (
                <div className="mt-2">
                  <p className="font-medium">📋 Problematische Dokumente:</p>
                  <ul className="mt-1 space-y-1 text-xs">
                    {lastTestResult.review_summary.documents_to_review.map((doc: any, index: number) => (
                      <li key={index} className="flex justify-between">
                        <span>{doc.name}</span>
                        <span className="text-red-600">{Math.round(doc.confidence * 100)}% confidence</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="text-sm text-gray-600">
          <p className="mb-2">
            <strong>Aktuelle Test-Szenarien:</strong> {testScenarios.length}
          </p>
          {testScenarios.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <BeakerIcon className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p>Keine Test-Szenarien vorhanden.</p>
              <p className="text-xs mt-1">Erstellen Sie ein Test-Szenario zum Testen des Agent Review Dashboards.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {testScenarios.map((scenario) => (
                <div key={scenario.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium">{scenario.name}</p>
                    <p className="text-xs text-gray-500">
                      {scenario.aktenzeichen} • {scenario.documents_needing_review} von {scenario.total_documents} Dokumenten brauchen Review
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-500">
                      {new Date(scenario.created_at).toLocaleDateString('de-DE')}
                    </span>
                    <a
                      href={scenario.direct_review_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-2 py-1 text-xs font-medium rounded text-white hover:opacity-90"
                      style={{backgroundColor: '#9f1a1d'}}
                    >
                      <DocumentTextIcon className="w-3 h-3 mr-1" />
                      Review
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Agent Management Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <UsersIcon className="w-5 h-5 mr-2" />
            Agent-Verwaltung
          </h2>
          <button
            onClick={() => setShowCreateAgent(!showCreateAgent)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:opacity-90"
            style={{backgroundColor: '#9f1a1d'}}
          >
            <UserPlusIcon className="w-4 h-4 mr-2" />
            Neuen Agent erstellen
          </button>
        </div>

        {showCreateAgent && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
            <h3 className="text-md font-medium text-gray-900 mb-4">👤 Neuen Agent erstellen</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Benutzername *
                </label>
                <input
                  type="text"
                  name="username"
                  value={newAgent.username}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500"
                  placeholder="agent.mustermann"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  E-Mail *
                </label>
                <input
                  type="email"
                  name="email"
                  value={newAgent.email}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500"
                  placeholder="agent@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vorname *
                </label>
                <input
                  type="text"
                  name="first_name"
                  value={newAgent.first_name}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500"
                  placeholder="Max"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nachname *
                </label>
                <input
                  type="text"
                  name="last_name"
                  value={newAgent.last_name}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500"
                  placeholder="Mustermann"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rolle
                </label>
                <select
                  name="role"
                  value={newAgent.role}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500"
                >
                  <option value="agent">Agent</option>
                  <option value="senior_agent">Senior Agent</option>
                  <option value="supervisor">Supervisor</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Passwort *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={newAgent.password}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500"
                    placeholder="Sicheres Passwort"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    {showPassword ? (
                      <EyeSlashIcon className="h-4 w-4 text-gray-400" />
                    ) : (
                      <EyeIcon className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Mindestens 6 Zeichen
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-4">
              <button
                onClick={() => {
                  setShowCreateAgent(false);
                  setNewAgent({
                    username: '',
                    email: '',
                    password: '',
                    first_name: '',
                    last_name: '',
                    role: 'agent'
                  });
                }}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Abbrechen
              </button>
              <button
                onClick={handleCreateAgent}
                disabled={agentLoading}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                style={{backgroundColor: '#9f1a1d'}}
              >
                {agentLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2 inline-block"></div>
                    Erstelle Agent...
                  </>
                ) : (
                  'Agent erstellen'
                )}
              </button>
            </div>
          </div>
        )}

        <div className="text-sm text-gray-600">
          <p className="mb-2">
            <strong>Aktuelle Agents:</strong> {agents.length} registriert
          </p>
          {agents.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <UsersIcon className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p>Noch keine Agents erstellt.</p>
              <p className="text-xs mt-1">Erstellen Sie den ersten Agent mit dem Button oben.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {agents.map((agent) => (
                <div key={agent.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium">{agent.first_name} {agent.last_name}</p>
                    <p className="text-xs text-gray-500">@{agent.username} • {agent.email} • {agent.role}</p>
                  </div>
                  <div className="text-xs text-gray-500">
                    {agent.last_login ? `Letzter Login: ${new Date(agent.last_login).toLocaleDateString('de-DE')}` : 'Nie eingeloggt'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>💡 Tipp:</strong> Nach der Erstellung können sich Agents unter{' '}
            <code className="bg-blue-100 px-1 rounded">https://your-domain.com/agent/login</code> anmelden.
          </p>
        </div>
      </div>

      {/* Database Management Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">🗄️ Datenbank-Verwaltung</h2>
        
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <div className="flex items-start space-x-3">
            <ExclamationTriangleIcon className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
            <div>
              <h3 className="text-sm font-medium text-red-800 mb-1">⚠️ ACHTUNG - GEFÄHRLICHE AKTION!</h3>
              <p className="text-sm text-red-700">
                Diese Aktion löscht <strong>ALLE</strong> Daten aus der MongoDB Datenbank:
              </p>
              <ul className="mt-2 text-sm text-red-700 list-disc ml-5">
                <li>Alle Clients/Users</li>
                <li>Alle hochgeladenen Dokumente</li>
                <li>Alle AI-Analysen und extrahierten Daten</li>
                <li>Alle Gläubiger-Informationen</li>
                <li>Upload-Verzeichnisse werden geleert</li>
              </ul>
              <p className="mt-2 text-sm font-semibold text-red-800">
                Diese Aktion kann NICHT rückgängig gemacht werden!
              </p>
            </div>
          </div>
        </div>

        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            className="inline-flex items-center px-4 py-2 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-white hover:bg-red-50"
          >
            <TrashIcon className="w-5 h-5 mr-2" />
            Database leeren
          </button>
        ) : (
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-yellow-800 mb-2">🔒 Bestätigung erforderlich</h4>
              <p className="text-sm text-yellow-700 mb-3">
                Sind Sie sich sicher, dass Sie ALLE Daten aus der Datenbank löschen möchten?
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={handleClearDatabase}
                  disabled={loading}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Lösche Daten...
                    </>
                  ) : (
                    <>
                      <TrashIcon className="w-5 h-5 mr-2" />
                      JA, alles löschen!
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  disabled={loading}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          </div>
        )}

        {message && (
          <div className={`mt-4 p-4 rounded-lg flex items-start space-x-3 ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}>
            {message.type === 'success' ? (
              <CheckCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            ) : (
              <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            )}
            <span className="text-sm">{message.text}</span>
          </div>
        )}

        {clearResult && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-900 mb-2">📊 Lösch-Statistiken</h4>
            <div className="space-y-1 text-sm text-gray-600">
              <p><strong>Clients gelöscht:</strong> {clearResult.stats.clients_deleted}</p>
              <p><strong>Upload-Verzeichnisse bereinigt:</strong> {clearResult.stats.upload_dirs_cleaned}</p>
              <p><strong>Timestamp:</strong> {new Date(clearResult.timestamp).toLocaleString('de-DE')}</p>
            </div>
          </div>
        )}
      </div>

      {/* System Information */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">ℹ️ System-Information</h2>
        <div className="space-y-2 text-sm text-gray-600">
          <p><strong>Environment:</strong> Production</p>
          <p><strong>Database:</strong> MongoDB</p>
          <p><strong>Backend:</strong> Node.js + Express</p>
          <p><strong>Frontend:</strong> React + TypeScript</p>
          <p><strong>AI Services:</strong> Google Document AI + Claude</p>
        </div>
      </div>
    </div>
  );
};

export default Settings;