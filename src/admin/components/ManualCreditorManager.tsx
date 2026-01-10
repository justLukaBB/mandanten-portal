import React, { useState, useEffect } from 'react';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  CheckCircleIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline';
import api from '../../config/api';

interface Creditor {
  id: string;
  sender_name: string;
  sender_email: string;
  sender_address: string;
  reference_number: string;
  claim_amount: number;
  status: string;
  confidence: number;
  manually_reviewed: boolean;
  created_via: string;
  created_at: string;
  reviewed_by: string;
  correction_notes: string;
  is_representative?: boolean;
  actual_creditor?: string;
}

interface Client {
  id: string;
  name: string;
  aktenzeichen: string;
  current_status: string;
  workflow_status: string;
}

interface CreditorFormData {
  sender_name: string;
  sender_email: string;
  sender_address: string;
  reference_number: string;
  claim_amount: string;
  notes: string;
  is_representative: boolean;
  actual_creditor: string;
}

interface Props {
  clientId: string;
  onCreditorAdded?: () => void;
  onCreditorUpdated?: () => void;
  onCreditorDeleted?: () => void;
}

const ManualCreditorManager: React.FC<Props> = ({
  clientId,
  onCreditorAdded,
  onCreditorUpdated,
  onCreditorDeleted
}) => {
  const [creditors, setCreditors] = useState<Creditor[]>([]);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreditorFormData>({
    sender_name: '',
    sender_email: '',
    sender_address: '',
    reference_number: '',
    claim_amount: '',
    notes: '',
    is_representative: false,
    actual_creditor: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (clientId) {
      fetchCreditors();
    }
  }, [clientId]);

  const resetForm = () => {
    setFormData({
      sender_name: '',
      sender_email: '',
      sender_address: '',
      reference_number: '',
      claim_amount: '',
      notes: '',
      is_representative: false,
      actual_creditor: ''
    });
    setError(null);
  };

  const fetchCreditors = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/admin/clients/${clientId}/creditors`);
      if (response.data.success) {
        setCreditors(response.data.creditors);
        setClient(response.data.client);
      }
    } catch (error: any) {
      console.error('Error fetching creditors:', error);
      setError(error.response?.data?.error || 'Failed to fetch creditors');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    resetForm();
    setShowAddForm(true);
    setEditingId(null);
  };

  const handleEdit = (creditor: Creditor) => {
    setFormData({
      sender_name: creditor.sender_name,
      sender_email: creditor.sender_email,
      sender_address: creditor.sender_address,
      reference_number: creditor.reference_number,
      claim_amount: creditor.claim_amount.toString(),
      notes: creditor.correction_notes || '',
      is_representative: creditor.is_representative || false,
      actual_creditor: creditor.actual_creditor || ''
    });
    setEditingId(creditor.id);
    setShowAddForm(true);
    setError(null);
  };

  const handleCancel = () => {
    setShowAddForm(false);
    setEditingId(null);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.sender_name.trim()) {
      setError('Gläubigername ist erforderlich');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        sender_name: formData.sender_name.trim(),
        sender_email: formData.sender_email.trim(),
        sender_address: formData.sender_address.trim(),
        reference_number: formData.reference_number.trim(),
        claim_amount: formData.claim_amount ? parseFloat(formData.claim_amount) : 0,
        notes: formData.notes.trim(),
        is_representative: formData.is_representative,
        actual_creditor: formData.actual_creditor.trim()
      };

      if (editingId) {
        // Update existing creditor
        const response = await api.put(`/api/admin/clients/${clientId}/creditors/${editingId}`, payload);
        if (response.data.success) {
          await fetchCreditors();
          handleCancel();
          onCreditorUpdated?.();
        }
      } else {
        // Add new creditor
        const response = await api.post(`/api/admin/clients/${clientId}/add-creditor`, payload);
        if (response.data.success) {
          await fetchCreditors();
          handleCancel();
          onCreditorAdded?.();
        }
      }
    } catch (error: any) {
      console.error('Error saving creditor:', error);
      setError(error.response?.data?.error || 'Failed to save creditor');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (creditorId: string, creditorName: string) => {
    // eslint-disable-next-line no-restricted-globals
    if (!confirm(`Möchten Sie den Gläubiger "${creditorName}" wirklich löschen?`)) {
      return;
    }

    try {
      const response = await api.delete(`/api/admin/clients/${clientId}/creditors/${creditorId}`);
      if (response.data.success) {
        await fetchCreditors();
        onCreditorDeleted?.();
      }
    } catch (error: any) {
      console.error('Error deleting creditor:', error);
      setError(error.response?.data?.error || 'Failed to delete creditor');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-800"></div>
        <span className="ml-2 text-gray-600">Lade Gläubiger...</span>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Gläubiger-Verwaltung
            </h3>
            {client && (
              <p className="mt-1 text-sm text-gray-600">
                {client.name} ({client.aktenzeichen})
              </p>
            )}
          </div>
          <button
            onClick={handleAdd}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-800 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Gläubiger hinzufügen
          </button>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Fehler</h3>
                <div className="mt-2 text-sm text-red-700">{error}</div>
              </div>
            </div>
          </div>
        )}

        {/* Add/Edit Form */}
        {showAddForm && (
          <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-8">
            <h3 className="text-xl font-bold text-gray-900 mb-8">
              {editingId ? 'Edit Creditor' : 'Add New Creditor'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Creditor Name *
                  </label>
                  <input
                    type="text"
                    value={formData.sender_name}
                    onChange={(e) => setFormData({ ...formData, sender_name: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.sender_email}
                    onChange={(e) => setFormData({ ...formData, sender_email: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Reference Number
                  </label>
                  <input
                    type="text"
                    value={formData.reference_number}
                    onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Amount Claimed (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.claim_amount}
                    onChange={(e) => setFormData({ ...formData, claim_amount: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Address
                </label>
                <textarea
                  value={formData.sender_address}
                  onChange={(e) => setFormData({ ...formData, sender_address: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm resize-none"
                />
              </div>

              <div className="flex flex-col space-y-4 py-2">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isRepresentative"
                    checked={formData.is_representative}
                    onChange={(e) => setFormData({ ...formData, is_representative: e.target.checked })}
                    className="h-5 w-5 text-blue-600 focus:ring-blue-500/20 border-gray-300 rounded cursor-pointer transition-all"
                  />
                  <label htmlFor="isRepresentative" className="ml-3 block text-sm font-medium text-gray-700 cursor-pointer">
                    Is Representative
                  </label>
                </div>
                {formData.is_representative && (
                  <div className="flex-1 animate-in fade-in slide-in-from-top-2 duration-300">
                    <input
                      type="text"
                      placeholder="Actual creditor name"
                      value={formData.actual_creditor}
                      onChange={(e) => setFormData({ ...formData, actual_creditor: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm resize-none"
                  placeholder="Additional information..."
                />
              </div>

              <div className="flex justify-end space-x-3 pt-6">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-8 py-2.5 border border-transparent rounded-lg text-sm font-bold text-white bg-red-800 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all disabled:opacity-50 shadow-sm shadow-blue-900/10 active:scale-[0.98]"
                >
                  {saving ? 'Saving...' : (editingId ? 'Update Creditor' : 'Add Creditor')}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Creditors List */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-md font-medium text-gray-900">
              Gläubiger ({creditors.length})
            </h4>
            <div className="text-sm text-gray-500">
              Manuelle: {creditors.filter(c => c.created_via === 'admin_manual_entry').length} |
              KI-extrahiert: {creditors.filter(c => c.created_via !== 'admin_manual_entry').length}
            </div>
          </div>

          {creditors.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <UserGroupIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Keine Gläubiger</h3>
              <p className="mt-1 text-sm text-gray-500">
                Fügen Sie den ersten Gläubiger für diesen Client hinzu.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Gläubiger
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Kontakt
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Betrag
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Quelle
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Aktionen
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {creditors.map((creditor) => (
                    <tr key={creditor.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {creditor.sender_name}
                          </div>
                          {creditor.is_representative && creditor.actual_creditor && (
                            <div className="text-xs text-gray-500">
                              für: {creditor.actual_creditor}
                            </div>
                          )}
                          {creditor.reference_number && (
                            <div className="text-xs text-gray-500">
                              Ref: {creditor.reference_number}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{creditor.sender_email}</div>
                        {creditor.sender_address && (
                          <div className="text-xs text-gray-500 max-w-xs truncate">
                            {creditor.sender_address}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {creditor.claim_amount ? `${creditor.claim_amount.toFixed(2)} €` : 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-xs">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${creditor.created_via === 'admin_manual_entry'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-green-100 text-green-800'
                            }`}>
                            {creditor.created_via === 'admin_manual_entry' ? 'Manuell' : 'KI-extrahiert'}
                          </span>
                          <div className="mt-1 text-gray-500">
                            {Math.round((creditor.confidence || 0) * 100)}% Konfidenz
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleEdit(creditor)}
                            className="text-indigo-600 hover:text-indigo-900"
                            title="Bearbeiten"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(creditor.id, creditor.sender_name)}
                            className="text-red-600 hover:text-red-900"
                            title="Löschen"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ManualCreditorManager;