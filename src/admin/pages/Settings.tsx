import React, { useState } from 'react';
import { 
  ExclamationTriangleIcon,
  TrashIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import { API_BASE_URL } from '../../config/api';

const Settings: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [clearResult, setClearResult] = useState<any>(null);

  const handleClearDatabase = async () => {
    setLoading(true);
    setMessage(null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/admin/clear-database`, {
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