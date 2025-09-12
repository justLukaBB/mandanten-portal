import React, { useState } from 'react';
import { 
  UserPlusIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { API_BASE_URL } from '../../config/api';

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  aktenzeichen: string;
}

const CreateUser: React.FC = () => {
  const [formData, setFormData] = useState<FormData>({
    firstName: '',
    lastName: '',
    email: '',
    aktenzeichen: ''
  });
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [createdUser, setCreatedUser] = useState<any>(null);

  const generateAktenzeichen = () => {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 9000) + 1000;
    return `MAND_${year}_${random}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    
    try {
      // Create user in MongoDB
      const userData = {
        ...formData,
        id: formData.aktenzeichen,
        current_status: 'created',
        workflow_status: 'portal_access_sent',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        documents: [],
        final_creditor_list: [],
        status_history: [{
          status: 'created',
          timestamp: new Date().toISOString(),
          updated_by: 'admin'
        }]
      };

      const response = await fetch(`${API_BASE_URL}/api/admin/clients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        },
        body: JSON.stringify(userData)
      });

      if (!response.ok) {
        throw new Error('Failed to create user');
      }

      const result = await response.json();
      
      setCreatedUser(result);
      setMessage({
        type: 'success',
        text: `✅ User erfolgreich erstellt! Aktenzeichen: ${result.aktenzeichen}`
      });
      
      // Reset form
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        aktenzeichen: generateAktenzeichen()
      });
      
    } catch (error) {
      console.error('Error creating user:', error);
      setMessage({
        type: 'error',
        text: '❌ Fehler beim Erstellen des Users. Bitte versuchen Sie es erneut.'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  // Initialize with generated Aktenzeichen
  React.useEffect(() => {
    setFormData(prev => ({
      ...prev,
      aktenzeichen: generateAktenzeichen()
    }));
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">➕ Test-User erstellen</h1>
        <p className="text-gray-600 mt-1">
          Erstellen Sie manuell einen Test-User für die Dokumentenanalyse
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-2">
                Vorname *
              </label>
              <input
                type="text"
                id="firstName"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-red-800"
                placeholder="Max"
              />
            </div>

            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-2">
                Nachname *
              </label>
              <input
                type="text"
                id="lastName"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-red-800"
                placeholder="Mustermann"
              />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              E-Mail-Adresse *
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-red-800"
              placeholder="max.mustermann@example.com"
            />
          </div>

          <div>
            <label htmlFor="aktenzeichen" className="block text-sm font-medium text-gray-700 mb-2">
              Aktenzeichen (wird automatisch generiert)
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                id="aktenzeichen"
                name="aktenzeichen"
                value={formData.aktenzeichen}
                onChange={handleChange}
                required
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 font-mono"
                readOnly
              />
              <button
                type="button"
                onClick={() => setFormData({...formData, aktenzeichen: generateAktenzeichen()})}
                className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Neu generieren
              </button>
            </div>
          </div>

          {message && (
            <div className={`p-4 rounded-lg flex items-start space-x-3 ${
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

          <div className="flex items-center justify-between pt-4 border-t">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white disabled:opacity-50"
              style={{backgroundColor: loading ? '#ccc' : '#9f1a1d'}}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Erstelle User...
                </>
              ) : (
                <>
                  <UserPlusIcon className="w-5 h-5 mr-2" />
                  User erstellen
                </>
              )}
            </button>

            <div className="text-sm text-gray-500">
              * Pflichtfelder
            </div>
          </div>
        </form>

        {createdUser && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-medium text-gray-900 mb-2">🎉 User erfolgreich erstellt!</h3>
            <div className="space-y-1 text-sm text-gray-600">
              <p><strong>Name:</strong> {createdUser.firstName} {createdUser.lastName}</p>
              <p><strong>E-Mail:</strong> {createdUser.email}</p>
              <p><strong>Aktenzeichen:</strong> <span className="font-mono">{createdUser.aktenzeichen}</span></p>
              <p><strong>Status:</strong> Portal-Zugang gesendet</p>
            </div>
            <div className="mt-4 p-3 bg-blue-50 rounded text-sm text-blue-800">
              <strong>Nächste Schritte:</strong>
              <ol className="mt-1 ml-4 list-decimal">
                <li>Wechseln Sie zur Analytics Dashboard</li>
                <li>Suchen Sie nach dem User mit Aktenzeichen: <span className="font-mono">{createdUser.aktenzeichen}</span></li>
                <li>Der User kann sich jetzt einloggen und Dokumente hochladen</li>
              </ol>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-800">
            <p className="font-medium mb-1">Hinweis für Test-User:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Test-User können sich mit ihrer E-Mail-Adresse im Personal Portal anmelden</li>
              <li>Die Dokumente werden von der AI analysiert und klassifiziert</li>
              <li>Alle Daten werden in MongoDB gespeichert</li>
              <li>Sie können den Fortschritt im Analytics Dashboard verfolgen</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateUser;