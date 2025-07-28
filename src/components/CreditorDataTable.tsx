import React, { useState, useEffect } from 'react';
import { 
  PencilIcon, 
  CheckCircleIcon, 
  ExclamationTriangleIcon,
  ArrowDownTrayIcon,
  EyeIcon,
  TrashIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';
import api from '../config/api';

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
  extracted_data?: {
    creditor_data?: CreditorData;
    confidence?: number;
    reasoning?: string;
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
}

interface CreditorTableRow {
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
  status: 'ready' | 'needs_review' | 'incomplete';
  warnings: string[];
}

interface CreditorDataTableProps {
  documents: Document[];
  clientId: string;
  onRefresh: () => void;
}

const CreditorDataTable: React.FC<CreditorDataTableProps> = ({ 
  documents, 
  clientId, 
  onRefresh 
}) => {
  const [creditorData, setCreditorData] = useState<CreditorTableRow[]>([]);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<CreditorTableRow>>({});
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Convert documents to creditor table rows
    const creditorRows: CreditorTableRow[] = documents
      .filter(doc => doc.is_creditor_document && doc.processing_status === 'completed')
      .map(doc => {
        const creditor = doc.extracted_data?.creditor_data;
        const validation = doc.validation;
        
        return {
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
          status: validation?.requires_manual_review ? 'needs_review' : 
                  (validation?.data_completeness || 0) < 0.6 ? 'incomplete' : 'ready',
          warnings: validation?.warnings || []
        };
      });

    setCreditorData(creditorRows);
  }, [documents]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready': return 'text-green-600 bg-green-50';
      case 'needs_review': return 'text-orange-600 bg-orange-50';
      case 'incomplete': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ready': return 'Bereit';
      case 'needs_review': return 'Prüfung nötig';
      case 'incomplete': return 'Unvollständig';
      default: return 'Unbekannt';
    }
  };

  const handleEdit = (row: CreditorTableRow) => {
    setEditingRow(row.documentId);
    setEditData(row);
  };

  const handleSave = async (documentId: string) => {
    try {
      // Here you would typically save to your backend
      // For now, we'll just update the local state
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
    if (selectedRows.size === creditorData.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(creditorData.map(row => row.documentId)));
    }
  };

  const exportToCSV = () => {
    const selectedData = creditorData.filter(row => selectedRows.has(row.documentId));
    const dataToExport = selectedData.length > 0 ? selectedData : creditorData;
    
    const headers = [
      'Gläubiger',
      'E-Mail',
      'Adresse',
      'Aktenzeichen',
      'Forderung (€)',
      'Ist Vertreter',
      'Eigentlicher Gläubiger',
      'Status',
      'Dokument'
    ];
    
    const csvContent = [
      headers.join(','),
      ...dataToExport.map(row => [
        `"${row.creditorName}"`,
        `"${row.email}"`,
        `"${row.address.replace(/"/g, '""')}"`,
        `"${row.referenceNumber}"`,
        row.claimAmount || '',
        row.isRepresentative ? 'Ja' : 'Nein',
        `"${row.actualCreditor}"`,
        getStatusText(row.status),
        `"${row.documentName}"`
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `glaeubiger_daten_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (creditorData.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Gläubiger-Daten</h3>
        <div className="text-center py-8">
          <DocumentTextIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Noch keine Gläubigerdokumente verarbeitet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Gläubiger-Daten ({creditorData.length})
        </h3>
        <div className="flex items-center space-x-2">
          {selectedRows.size > 0 && (
            <span className="text-sm text-gray-600">
              {selectedRows.size} ausgewählt
            </span>
          )}
          <button
            onClick={exportToCSV}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <ArrowDownTrayIcon className="w-4 h-4 mr-1" />
            CSV Export
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <input
                  type="checkbox"
                  checked={selectedRows.size === creditorData.length}
                  onChange={handleSelectAll}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Gläubiger
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Kontakt
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Referenz
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Forderung
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Aktionen
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {creditorData.map((row) => (
              <tr key={row.documentId} className={selectedRows.has(row.documentId) ? 'bg-blue-50' : ''}>
                <td className="px-3 py-4 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={selectedRows.has(row.documentId)}
                    onChange={() => handleSelectRow(row.documentId)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
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
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div>
                    {editingRow === row.documentId ? (
                      <div className="space-y-2">
                        <input
                          type="email"
                          placeholder="E-Mail"
                          value={editData.email || row.email}
                          onChange={(e) => setEditData({...editData, email: e.target.value})}
                          className="block w-full border-gray-300 rounded-md shadow-sm text-sm"
                        />
                        <textarea
                          placeholder="Adresse"
                          value={editData.address || row.address}
                          onChange={(e) => setEditData({...editData, address: e.target.value})}
                          className="block w-full border-gray-300 rounded-md shadow-sm text-sm"
                          rows={2}
                        />
                      </div>
                    ) : (
                      <div className="text-sm">
                        <div className="text-gray-900">{row.email}</div>
                        <div className="text-gray-500 text-xs mt-1">
                          {row.address}
                        </div>
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {editingRow === row.documentId ? (
                    <input
                      type="text"
                      value={editData.referenceNumber || row.referenceNumber}
                      onChange={(e) => setEditData({...editData, referenceNumber: e.target.value})}
                      className="block w-full border-gray-300 rounded-md shadow-sm text-sm"
                    />
                  ) : (
                    <div className="text-sm text-gray-900">{row.referenceNumber}</div>
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
                    <div className="text-sm text-gray-900">
                      {row.claimAmount ? `${row.claimAmount.toFixed(2)} €` : 'Nicht gefunden'}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(row.status)}`}>
                    {getStatusText(row.status)}
                  </span>
                  <div className="mt-1 flex items-center space-x-2 text-xs">
                    <span className="text-gray-500">AI: {Math.round(row.confidence * 100)}%</span>
                    <span className="text-gray-500">Daten: {Math.round(row.dataCompleteness * 100)}%</span>
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

      {creditorData.some(row => row.warnings.length > 0) && (
        <div className="mt-4 bg-yellow-50 p-3 rounded-md">
          <h4 className="text-sm font-medium text-yellow-800 mb-2">Hinweise:</h4>
          <ul className="text-sm text-yellow-700 space-y-1">
            {creditorData.map(row => 
              row.warnings.map((warning, idx) => (
                <li key={`${row.documentId}-${idx}`}>
                  <strong>{row.creditorName}:</strong> {warning}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default CreditorDataTable;