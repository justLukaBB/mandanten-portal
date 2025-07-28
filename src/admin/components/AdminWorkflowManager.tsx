import React, { useState, useEffect } from 'react';
import { 
  CheckCircleIcon, 
  ClockIcon,
  DocumentCheckIcon,
  UserIcon,
  ExclamationTriangleIcon,
  ArrowRightIcon,
  CurrencyEuroIcon
} from '@heroicons/react/24/outline';
import api from '../../config/api';

interface WorkflowStatus {
  client_name: string;
  workflow_status: 'documents_processing' | 'admin_review' | 'client_confirmation' | 'completed';
  first_payment_received: boolean;
  admin_approved: boolean;
  client_confirmed_creditors: boolean;
  stats: {
    total_documents: number;
    creditor_documents: number;
    needs_manual_review: number;
    final_creditor_count: number;
  };
  admin_approved_at?: string;
  admin_approved_by?: string;
  client_confirmed_at?: string;
}

interface Creditor {
  id: string;
  sender_name: string;
  sender_address: string;
  sender_email: string;
  reference_number: string;
  claim_amount: number;
  is_representative: boolean;
  actual_creditor: string;
  source_document: string;
  ai_confidence: number;
  status: string;
  created_at: string;
}

interface AdminWorkflowManagerProps {
  clientId?: string;
}

const AdminWorkflowManager: React.FC<AdminWorkflowManagerProps> = ({ clientId = '12345' }) => {
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus | null>(null);
  const [creditorList, setCreditorList] = useState<Creditor[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [adminName, setAdminName] = useState('');

  useEffect(() => {
    fetchWorkflowStatus();
  }, []);

  const fetchWorkflowStatus = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/admin/clients/${clientId}/workflow-status`);
      setWorkflowStatus(response.data);
    } catch (error) {
      console.error('Error fetching workflow status:', error);
    } finally {
      setLoading(false);
    }
  };

  const markPaymentReceived = async () => {
    try {
      setProcessing(true);
      await api.post(`/admin/clients/${clientId}/mark-payment-received`);
      await fetchWorkflowStatus();
    } catch (error) {
      console.error('Error marking payment received:', error);
    } finally {
      setProcessing(false);
    }
  };

  const generateCreditorList = async () => {
    try {
      setProcessing(true);
      const response = await api.post(`/admin/clients/${clientId}/generate-creditor-list`, {
        adminName: adminName || 'Admin'
      });
      setCreditorList(response.data.creditors);
      await fetchWorkflowStatus();
    } catch (error) {
      console.error('Error generating creditor list:', error);
    } finally {
      setProcessing(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-700 bg-green-100';
      case 'client_confirmation': return 'text-blue-700 bg-blue-100';
      case 'admin_review': return 'text-orange-700 bg-orange-100';
      default: return 'text-gray-700 bg-gray-100';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'documents_processing': return 'Dokumente werden verarbeitet';
      case 'admin_review': return 'Bereit für Admin-Prüfung';
      case 'client_confirmation': return 'Warten auf Kundenbestätigung';
      case 'completed': return 'Abgeschlossen';
      default: return 'Unbekannt';
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!workflowStatus) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <p className="text-red-600">Fehler beim Laden des Workflow-Status</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Workflow Status Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            Workflow-Manager: {workflowStatus.client_name}
          </h2>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(workflowStatus.workflow_status)}`}>
            {getStatusText(workflowStatus.workflow_status)}
          </span>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center space-x-8 mb-6">
          {/* Step 1: Documents */}
          <div className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              workflowStatus.stats.creditor_documents > 0 ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'
            }`}>
              <DocumentCheckIcon className="w-5 h-5" />
            </div>
            <span className="ml-2 text-sm font-medium text-gray-700">Dokumente</span>
          </div>

          <ArrowRightIcon className="w-4 h-4 text-gray-400" />

          {/* Step 2: Payment */}
          <div className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              workflowStatus.first_payment_received ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'
            }`}>
              <CurrencyEuroIcon className="w-5 h-5" />
            </div>
            <span className="ml-2 text-sm font-medium text-gray-700">Erste Rate</span>
          </div>

          <ArrowRightIcon className="w-4 h-4 text-gray-400" />

          {/* Step 3: Admin Review */}
          <div className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              workflowStatus.admin_approved ? 'bg-green-500 text-white' : 
              workflowStatus.workflow_status === 'admin_review' ? 'bg-orange-500 text-white' : 'bg-gray-300 text-gray-600'
            }`}>
              <CheckCircleIcon className="w-5 h-5" />
            </div>
            <span className="ml-2 text-sm font-medium text-gray-700">Admin-Freigabe</span>
          </div>

          <ArrowRightIcon className="w-4 h-4 text-gray-400" />

          {/* Step 4: Client Confirmation */}
          <div className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              workflowStatus.client_confirmed_creditors ? 'bg-green-500 text-white' : 
              workflowStatus.workflow_status === 'client_confirmation' ? 'bg-blue-500 text-white' : 'bg-gray-300 text-gray-600'
            }`}>
              <UserIcon className="w-5 h-5" />
            </div>
            <span className="ml-2 text-sm font-medium text-gray-700">Kundenbestätigung</span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-sm text-gray-600">Dokumente</p>
            <p className="text-xl font-bold text-gray-900">{workflowStatus.stats.total_documents}</p>
          </div>
          <div className="bg-green-50 p-3 rounded-lg">
            <p className="text-sm text-gray-600">Gläubiger erkannt</p>
            <p className="text-xl font-bold text-green-600">{workflowStatus.stats.creditor_documents}</p>
          </div>
          <div className="bg-orange-50 p-3 rounded-lg">
            <p className="text-sm text-gray-600">Manuell prüfen</p>
            <p className="text-xl font-bold text-orange-600">{workflowStatus.stats.needs_manual_review}</p>
          </div>
          <div className="bg-blue-50 p-3 rounded-lg">
            <p className="text-sm text-gray-600">Finale Liste</p>
            <p className="text-xl font-bold text-blue-600">{workflowStatus.stats.final_creditor_count}</p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Aktionen</h3>
        
        {/* Step 1: Mark Payment Received */}
        {!workflowStatus.first_payment_received && (
          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-2">
              ⏳ Warten auf erste Rate vom Mandanten
            </p>
            <button
              onClick={markPaymentReceived}
              disabled={processing}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {processing ? 'Verarbeite...' : '💰 Erste Rate erhalten markieren'}
            </button>
          </div>
        )}

        {/* Step 2: Admin Review and Approval */}
        {workflowStatus.first_payment_received && !workflowStatus.admin_approved && (
          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-2">
              🔍 Bereit für Admin-Prüfung und Freigabe der Gläubigerliste
            </p>
            <div className="flex items-center space-x-3">
              <input
                type="text"
                placeholder="Admin Name (optional)"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <button
                onClick={generateCreditorList}
                disabled={processing}
                className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {processing ? 'Generiere...' : '✅ Gläubigerliste freigeben'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Waiting for Client */}
        {workflowStatus.workflow_status === 'client_confirmation' && (
          <div className="mb-4">
            <p className="text-sm text-blue-600 mb-2">
              ⏳ Warten auf Kundenbestätigung der Gläubigerliste
            </p>
            <p className="text-xs text-gray-500">
              Freigegeben am: {workflowStatus.admin_approved_at ? new Date(workflowStatus.admin_approved_at).toLocaleString('de-DE') : 'N/A'}
              {workflowStatus.admin_approved_by && ` von ${workflowStatus.admin_approved_by}`}
            </p>
          </div>
        )}

        {/* Step 4: Completed */}
        {workflowStatus.workflow_status === 'completed' && (
          <div className="mb-4">
            <p className="text-sm text-green-600 mb-2">
              ✅ Workflow abgeschlossen - Gläubigerliste vom Kunden bestätigt
            </p>
            <p className="text-xs text-gray-500">
              Bestätigt am: {workflowStatus.client_confirmed_at ? new Date(workflowStatus.client_confirmed_at).toLocaleString('de-DE') : 'N/A'}
            </p>
          </div>
        )}
      </div>

      {/* Creditor List Preview */}
      {creditorList.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Generierte Gläubigerliste ({creditorList.length})
          </h3>
          <div className="space-y-3">
            {creditorList.map((creditor, index) => (
              <div key={creditor.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{creditor.sender_name}</p>
                    <p className="text-sm text-gray-600">{creditor.sender_email}</p>
                    <p className="text-sm text-gray-500">Ref: {creditor.reference_number}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">
                      {creditor.claim_amount ? `${creditor.claim_amount.toFixed(2)} €` : 'N/A'}
                    </p>
                    <p className="text-xs text-gray-500">
                      KI: {Math.round(creditor.ai_confidence * 100)}%
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminWorkflowManager;