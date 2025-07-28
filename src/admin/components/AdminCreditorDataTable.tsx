import React, { useState, useEffect } from 'react';
import { 
  PencilIcon, 
  CheckCircleIcon, 
  ExclamationTriangleIcon,
  ArrowDownTrayIcon,
  EyeIcon,
  DocumentTextIcon,
  UserGroupIcon,
  BuildingOfficeIcon
} from '@heroicons/react/24/outline';
import api from '../../config/api';

interface CreditorData {
  sender_name?: string;
  sender_address?: string;
  sender_email?: string;
  reference_number?: string;
  is_representative?: boolean;
  actual_creditor?: string;
  claim_amount?: number;
}

interface Document {
  id: string;
  name: string;
  processing_status: 'processing' | 'completed' | 'failed';
  is_creditor_document?: boolean;
  confidence?: number;
  manual_review_required?: boolean;
  document_status?: 'creditor_confirmed' | 'non_creditor_confirmed' | 'needs_review' | 'duplicate_detected' | 'processing_failed' | 'unknown';
  status_reason?: string;
  is_duplicate?: boolean;
  duplicate_reason?: string;
  extracted_data?: {
    creditor_data?: CreditorData;
    confidence?: number;
    reasoning?: string;
    workflow_status?: 'GLÄUBIGERDOKUMENT' | 'KEIN_GLÄUBIGERDOKUMENT' | 'MITARBEITER_PRÜFUNG';
    status_reason?: string;
  };
  validation?: {
    is_valid: boolean;
    warnings: string[];
    confidence: number;
    claude_confidence?: number;
    data_completeness?: number;
    requires_manual_review?: boolean;
  };
  summary?: string;
  uploadedAt?: string;
  processed_at?: string;
}

interface ClientData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  documents: Document[];
}

interface AdminCreditorTableRow {
  clientId: string;
  clientName: string;
  clientEmail: string;
  documentId: string;
  documentName: string;
  creditorName: string;
  email: string;
  address: string;
  referenceNumber: string;
  claimAmount: number | null;
  isRepresentative: boolean;
  actualCreditor: string;
  confidence: number;
  dataCompleteness: number;
  status: 'ready' | 'needs_review' | 'incomplete' | 'duplicate' | 'non_creditor';
  warnings: string[];
  processedAt: string;
  aiClassifiedAsCreditor?: boolean;
  aiWorkflowStatus?: 'GLÄUBIGERDOKUMENT' | 'KEIN_GLÄUBIGERDOKUMENT' | 'MITARBEITER_PRÜFUNG';
  aiStatusReason?: string;
  originalDocumentStatus?: string;
  manualReviewRequired?: boolean;
}

const AdminCreditorDataTable: React.FC = () => {
  const [creditorData, setCreditorData] = useState<AdminCreditorTableRow[]>([]);
  const [clients, setClients] = useState<ClientData[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<AdminCreditorTableRow>>({});
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [selectedClient, setSelectedClient] = useState<string>('all');

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      // For demo, we're fetching the single demo client
      // In production, you'd fetch all clients
      const clientIds = ['12345']; // Add more client IDs as needed
      const clientsData: ClientData[] = [];

      for (const clientId of clientIds) {
        try {
          const response = await api.get(`/clients/${clientId}`);
          const client = response.data;
          
          // Fetch documents separately
          const documentsResponse = await api.get(`/clients/${clientId}/documents`);
          client.documents = documentsResponse.data || [];
          
          clientsData.push(client);
        } catch (error) {
          console.error(`Error fetching client ${clientId}:`, error);
        }
      }

      setClients(clientsData);
      
      // Convert to admin creditor table rows
      const allCreditorRows: AdminCreditorTableRow[] = [];
      
      clientsData.forEach(client => {
        const allDocs = client.documents?.filter(doc => 
          doc.processing_status === 'completed'
        ) || [];
        
        allDocs.forEach(doc => {
          const creditor = doc.extracted_data?.creditor_data;
          const validation = doc.validation;
          
          // Determine row status based on new document_status system OR legacy data
          let rowStatus: 'ready' | 'needs_review' | 'incomplete' | 'duplicate' | 'non_creditor' = 'incomplete';
          let rowWarnings = validation?.warnings || [];
          
          if (doc.document_status) {
            // New system
            switch (doc.document_status) {
              case 'creditor_confirmed':
                rowStatus = 'ready';
                break;
              case 'non_creditor_confirmed':
                rowStatus = 'non_creditor';
                rowWarnings = ['Kein Gläubigerdokument'];
                break;
              case 'needs_review':
                rowStatus = 'needs_review';
                break;
              case 'duplicate_detected':
                rowStatus = 'duplicate';
                if (doc.duplicate_reason) {
                  rowWarnings = [...rowWarnings, doc.duplicate_reason];
                }
                break;
              case 'processing_failed':
                rowStatus = 'incomplete';
                rowWarnings = ['Verarbeitungsfehler'];
                break;
              default:
                rowStatus = 'needs_review';
                break;
            }
          } else {
            // Legacy system - determine status from old fields
            if (doc.is_creditor_document === true) {
              const confidence = validation?.claude_confidence || doc.confidence || 0;
              if (confidence >= 0.8) {
                rowStatus = 'ready';
              } else {
                rowStatus = 'needs_review';
              }
            } else if (doc.is_creditor_document === false) {
              rowStatus = 'non_creditor';
              rowWarnings = ['Kein Gläubigerdokument'];
            } else {
              rowStatus = 'needs_review';
            }
          }
          
          // Add ALL processed documents to the admin table (not just creditor docs)
          // Admins need to see everything for review
          allCreditorRows.push({
            clientId: client.id,
            clientName: `${client.firstName} ${client.lastName}`,
            clientEmail: client.email,
            documentId: doc.id,
            documentName: doc.name,
            creditorName: creditor?.sender_name || 'Nicht gefunden',
            email: creditor?.sender_email || 'Nicht gefunden',
            address: creditor?.sender_address || 'Nicht gefunden',
            referenceNumber: creditor?.reference_number || 'Nicht gefunden',
            claimAmount: creditor?.claim_amount || null,
            isRepresentative: creditor?.is_representative || false,
            actualCreditor: creditor?.actual_creditor || '',
            confidence: validation?.claude_confidence || doc.confidence || 0,
            dataCompleteness: validation?.data_completeness || 0,
            status: rowStatus,
            warnings: rowWarnings,
            processedAt: doc.processed_at || doc.uploadedAt || new Date().toISOString(),
            // Store original AI classification and status for CSV export
            aiClassifiedAsCreditor: doc.is_creditor_document,
            aiWorkflowStatus: doc.extracted_data?.workflow_status,
            aiStatusReason: doc.extracted_data?.status_reason,
            originalDocumentStatus: doc.document_status,
            manualReviewRequired: doc.manual_review_required || validation?.requires_manual_review || false
          });
        });
      });

      setCreditorData(allCreditorRows);
    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredData = selectedClient === 'all' 
    ? creditorData 
    : creditorData.filter(row => row.clientId === selectedClient);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready': return 'text-green-700 bg-green-100';
      case 'needs_review': return 'text-orange-700 bg-orange-100';
      case 'incomplete': return 'text-red-700 bg-red-100';
      case 'duplicate': return 'text-purple-700 bg-purple-100';
      case 'non_creditor': return 'text-blue-700 bg-blue-100';
      default: return 'text-gray-700 bg-gray-100';
    }
  };

  const getStatusText = (row: AdminCreditorTableRow) => {
    // Use AI workflow status if available, otherwise fallback to logic
    if (row.aiWorkflowStatus) {
      switch (row.aiWorkflowStatus) {
        case 'GLÄUBIGERDOKUMENT': return 'Gläubigerdokument';
        case 'KEIN_GLÄUBIGERDOKUMENT': return 'Kein Gläubigerdokument';
        case 'MITARBEITER_PRÜFUNG': return 'Mitarbeiter-Prüfung';
        default: return 'Unbekannt';
      }
    }
    
    // Fallback logic for legacy documents
    if (row.status === 'duplicate') {
      return 'Duplikat';
    } else if (row.aiClassifiedAsCreditor === true) {
      if (row.manualReviewRequired || row.status === 'needs_review') {
        return 'Mitarbeiter-Prüfung';
      } else {
        return 'Gläubigerdokument';
      }
    } else if (row.aiClassifiedAsCreditor === false) {
      return 'Kein Gläubigerdokument';
    } else {
      return 'Mitarbeiter-Prüfung';
    }
  };

  const handleEdit = (row: AdminCreditorTableRow) => {
    setEditingRow(row.documentId);
    setEditData(row);
  };

  const handleSave = async (documentId: string) => {
    try {
      // Update local state
      setCreditorData(prev => 
        prev.map(row => 
          row.documentId === documentId 
            ? { ...row, ...editData, status: 'ready' }
            : row
        )
      );
      setEditingRow(null);
      setEditData({});
    } catch (error) {
      console.error('Error saving creditor data:', error);
    }
  };

  const handleCancel = () => {
    setEditingRow(null);
    setEditData({});
  };

  const handleSelectRow = (documentId: string) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(documentId)) {
      newSelected.delete(documentId);
    } else {
      newSelected.add(documentId);
    }
    setSelectedRows(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedRows.size === filteredData.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredData.map(row => row.documentId)));
    }
  };

  const exportToCSV = () => {
    console.log('🔍 Export Debug Info:');
    console.log('Total creditorData:', creditorData.length);
    console.log('FilteredData:', filteredData.length);
    console.log('SelectedRows:', selectedRows.size);
    console.log('Sample data:', creditorData.slice(0, 2));
    
    const selectedData = filteredData.filter(row => selectedRows.has(row.documentId));
    const dataToExport = selectedData.length > 0 ? selectedData : filteredData;
    
    console.log('DataToExport:', dataToExport.length);
    
    if (dataToExport.length === 0) {
      alert('Keine Daten zum Exportieren verfügbar. Bitte überprüfen Sie, ob Gläubigerdokumente verarbeitet wurden.');
      return;
    }
    
    const headers = [
      'Mandant',
      'Mandant E-Mail',
      'Gläubiger',
      'E-Mail',
      'Adresse',
      'Aktenzeichen',
      'Forderung (€)',
      'Ist Vertreter',
      'Eigentlicher Gläubiger',
      'Status',
      'Ist Gläubigerdokument',
      'Mitarbeiterprüfung erforderlich',
      'AI Sicherheit (%)',
      'Datenqualität (%)',
      'Dokument',
      'Verarbeitet am'
    ];
    
    const csvContent = [
      headers.join(','),
      ...dataToExport.map(row => {
        // Use ACTUAL AI classification, not derived status
        const isCreditorDoc = row.aiClassifiedAsCreditor === true ? 'Ja' : 
                             row.aiClassifiedAsCreditor === false ? 'Nein' : 
                             'Unbekannt';
        
        // Use ACTUAL manual review requirement from AI or validation
        const needsReview = row.manualReviewRequired === true ? 'Ja' : 
                           row.status === 'needs_review' || row.status === 'duplicate' ? 'Ja' : 
                           'Nein';
        
        return [
          `"${row.clientName}"`,
          `"${row.clientEmail}"`,
          `"${row.creditorName}"`,
          `"${row.email}"`,
          `"${row.address.replace(/"/g, '""')}"`,
          `"${row.referenceNumber}"`,
          row.claimAmount || '',
          row.isRepresentative ? 'Ja' : 'Nein',
          `"${row.actualCreditor}"`,
          getStatusText(row),
          isCreditorDoc,
          needsReview,
          Math.round(row.confidence * 100),
          Math.round(row.dataCompleteness * 100),
          `"${row.documentName}"`,
          new Date(row.processedAt).toLocaleString('de-DE')
        ].join(',');
      })
    ].join('\n');
    
    console.log('CSV Content Preview:', csvContent.substring(0, 500));
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `admin_glaeubiger_daten_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    console.log('✅ CSV Export completed');
  };

  const getStats = () => {
    const total = filteredData.length;
    const ready = filteredData.filter(r => r.status === 'ready').length;
    const needsReview = filteredData.filter(r => r.status === 'needs_review').length;
    const incomplete = filteredData.filter(r => r.status === 'incomplete').length;
    const duplicate = filteredData.filter(r => r.status === 'duplicate').length;
    const highConfidence = filteredData.filter(r => r.confidence >= 0.9).length;
    
    return { total, ready, needsReview, incomplete, duplicate, highConfidence };
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            <div className="h-4 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  const stats = getStats();

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <DocumentTextIcon className="h-8 w-8 text-blue-500 mr-3" />
            <div>
              <p className="text-sm font-medium text-gray-600">Gesamt</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <CheckCircleIcon className="h-8 w-8 text-green-500 mr-3" />
            <div>
              <p className="text-sm font-medium text-gray-600">Bereit</p>
              <p className="text-2xl font-bold text-green-600">{stats.ready}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <ExclamationTriangleIcon className="h-8 w-8 text-orange-500 mr-3" />
            <div>
              <p className="text-sm font-medium text-gray-600">Prüfung</p>
              <p className="text-2xl font-bold text-orange-600">{stats.needsReview}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <ExclamationTriangleIcon className="h-8 w-8 text-purple-500 mr-3" />
            <div>
              <p className="text-sm font-medium text-gray-600">Duplikate</p>
              <p className="text-2xl font-bold text-purple-600">{stats.duplicate}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <BuildingOfficeIcon className="h-8 w-8 text-purple-500 mr-3" />
            <div>
              <p className="text-sm font-medium text-gray-600">Hohe KI-Sicherheit</p>
              <p className="text-2xl font-bold text-purple-600">{stats.highConfidence}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              Admin Gläubiger-Daten ({filteredData.length})
            </h3>
            <div className="flex items-center space-x-3">
              {/* Client Filter */}
              <select
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="all">Alle Mandanten</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>
                    {client.firstName} {client.lastName}
                  </option>
                ))}
              </select>
              
              {selectedRows.size > 0 && (
                <span className="text-sm text-gray-600">
                  {selectedRows.size} ausgewählt
                </span>
              )}
              <button
                onClick={exportToCSV}
                className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                CSV Export
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    checked={selectedRows.size === filteredData.length && filteredData.length > 0}
                    onChange={handleSelectAll}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mandant
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Gläubiger
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Kontaktdaten
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Forderung
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status & KI
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredData.map((row) => (
                <tr key={`${row.clientId}-${row.documentId}`} className={selectedRows.has(row.documentId) ? 'bg-blue-50' : ''}>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedRows.has(row.documentId)}
                      onChange={() => handleSelectRow(row.documentId)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <UserGroupIcon className="w-5 h-5 text-gray-400 mr-2" />
                      <div>
                        <div className="text-sm font-medium text-gray-900">{row.clientName}</div>
                        <div className="text-sm text-gray-500">{row.clientEmail}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {editingRow === row.documentId ? (
                      <input
                        type="text"
                        value={editData.creditorName || row.creditorName}
                        onChange={(e) => setEditData({...editData, creditorName: e.target.value})}
                        className="block w-full border-gray-300 rounded-md shadow-sm text-sm"
                      />
                    ) : (
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {row.creditorName}
                        </div>
                        {row.isRepresentative && row.actualCreditor && (
                          <div className="text-xs text-gray-500">
                            für: {row.actualCreditor}
                          </div>
                        )}
                        <div className="text-xs text-gray-500">
                          Ref: {row.referenceNumber}
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {editingRow === row.documentId ? (
                      <div className="space-y-2">
                        <input
                          type="email"
                          placeholder="E-Mail"
                          value={editData.email || row.email}
                          onChange={(e) => setEditData({...editData, email: e.target.value})}
                          className="block w-full border-gray-300 rounded-md shadow-sm text-sm"
                        />
                      </div>
                    ) : (
                      <div className="text-sm">
                        <div className="text-gray-900">{row.email}</div>
                        <div className="text-gray-500 text-xs mt-1 max-w-xs truncate">
                          {row.address}
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {editingRow === row.documentId ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editData.claimAmount || row.claimAmount || ''}
                        onChange={(e) => setEditData({...editData, claimAmount: parseFloat(e.target.value) || null})}
                        className="block w-full border-gray-300 rounded-md shadow-sm text-sm"
                      />
                    ) : (
                      <div className="text-sm">
                        <div className="font-medium text-gray-900">
                          {row.claimAmount ? `${row.claimAmount.toFixed(2)} €` : 'Nicht gefunden'}
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(row.status)}`}>
                        {getStatusText(row)}
                      </span>
                      <div className="flex items-center space-x-3 text-xs">
                        <span className="text-gray-500">KI: {Math.round(row.confidence * 100)}%</span>
                        <span className="text-gray-500">Daten: {Math.round(row.dataCompleteness * 100)}%</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center space-x-2">
                      {editingRow === row.documentId ? (
                        <>
                          <button
                            onClick={() => handleSave(row.documentId)}
                            className="text-green-600 hover:text-green-900"
                          >
                            <CheckCircleIcon className="w-5 h-5" />
                          </button>
                          <button
                            onClick={handleCancel}
                            className="text-gray-600 hover:text-gray-900"
                          >
                            ✕
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleEdit(row)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Bearbeiten"
                          >
                            <PencilIcon className="w-4 h-4" />
                          </button>
                          <button
                            className="text-gray-600 hover:text-gray-900"
                            title="Details anzeigen"
                          >
                            <EyeIcon className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredData.length === 0 && (
          <div className="text-center py-8">
            <DocumentTextIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Keine Gläubigerdokumente gefunden.</p>
          </div>
        )}
      </div>

      {/* Warnings Section */}
      {filteredData.some(row => row.warnings.length > 0) && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h4 className="text-lg font-medium text-gray-900 mb-4">Systemhinweise</h4>
          <div className="space-y-2">
            {filteredData.map(row => 
              row.warnings.map((warning, idx) => (
                <div key={`${row.documentId}-${idx}`} className="flex items-start space-x-2 text-sm">
                  <ExclamationTriangleIcon className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>{row.clientName} - {row.creditorName}:</strong> {warning}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCreditorDataTable;