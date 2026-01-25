import React, { useState } from 'react';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

interface HighConfidenceDocument {
  id: string;
  name: string;
  confidence?: number;
  extracted_data?: {
    creditor_data?: {
      sender_name?: string;
      sender_email?: string;
      reference_number?: string;
      claim_amount?: number;
    };
    confidence?: number;
  };
}

interface HighConfidenceCreditor {
  id: string;
  sender_name: string;
  sender_email?: string;
  reference_number?: string;
  claim_amount?: number;
  confidence: number;
  source_document: string;
  status?: string;
}

interface ReviewedDocFields {
  sender_name?: string;
  sender_email?: string;
  sender_address?: string;
  reference_number?: string;
  claim_amount?: number;
  dokumenttyp?: string;
}

interface ReviewedDocDiff {
  docId: string;
  name: string;
  original: ReviewedDocFields;
  updated: ReviewedDocFields;
}

interface HighConfidenceSummaryProps {
  documents: HighConfidenceDocument[];
  creditors: HighConfidenceCreditor[];
  onConfirmAll: () => void;
  loading?: boolean;
  reviewedDiffs?: ReviewedDocDiff[]; // optional: reviewed docs with before/after values
}

const HighConfidenceSummary: React.FC<HighConfidenceSummaryProps> = ({
  documents,
  creditors,
  onConfirmAll,
  loading = false,
  reviewedDiffs = []
}) => {
  const [openDocId, setOpenDocId] = useState<string | null>(null);

  // Debug logging
  console.log('🔍 HighConfidenceSummary received:', {
    documentsCount: documents.length,
    creditorsCount: creditors.length,
    creditorsSample: creditors.slice(0, 2),
    creditorsWithAmounts: creditors.filter(c => c.claim_amount).length
  });

  const formatAmount = (value?: number) => {
    if (typeof value === 'number' && isFinite(value)) {
      return value.toFixed(2);
    }
    return '0.00';
  };

  const totalAmount = creditors.reduce((sum, cred) => sum + ((typeof cred.claim_amount === 'number' && isFinite(cred.claim_amount)) ? cred.claim_amount : 0), 0);

  const renderFieldRow = (label: string, original?: any, updated?: any) => {
    const same = original === updated || (formatAmount(original) === formatAmount(updated) && typeof original === 'number' && typeof updated === 'number');
    const display = (val: any) => {
      if (val === undefined || val === null || val === '') {
        return '—';
      }
      if (typeof val === 'number') {
        return formatAmount(val);
      }
      return String(val);
    };
    return (
      <div className="grid grid-cols-12 gap-2 text-sm py-1 border-b border-gray-100 last:border-b-0">
        <div className="col-span-3 font-medium text-gray-700">{label}</div>
        <div className={`col-span-4 ${same ? 'text-gray-700' : 'text-gray-900 font-semibold'}`}>
          {display(original)}
        </div>
        <div className={`col-span-4 ${same ? 'text-gray-700' : 'text-gray-900 font-semibold'}`}>
          {display(updated)}
        </div>
        <div className="col-span-1 text-right text-xs text-gray-400">{same ? '•' : '≠'}</div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 flex items-center">
          <CheckCircleIcon className="h-6 w-6 text-green-500 mr-2" />
          Automatisch erkannte Gläubiger
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Diese Gläubiger wurden mit hoher Sicherheit (≥80%) von der AI erkannt
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-green-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-700">{creditors.length}</div>
          <div className="text-sm text-green-600">Gläubiger erkannt</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-blue-700">{documents.length}</div>
          <div className="text-sm text-blue-600">Dokumente verarbeitet</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-purple-700">€{formatAmount(totalAmount)}</div>
          <div className="text-sm text-purple-600">Gesamtforderung</div>
        </div>
      </div>

      {/* Creditor List */}
      {/* <div className="space-y-3 max-h-96 overflow-y-auto mb-6">
        {creditors.map((creditor) => (
          <div key={creditor.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <h3 className="font-medium text-gray-900">{creditor.sender_name}</h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    {Math.round((creditor.confidence || 0) * 100)}% Sicherheit
                  </span>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-gray-600">
                  {creditor.sender_email && (
                    <div>
                      <span className="font-medium">E-Mail:</span> {creditor.sender_email}
                    </div>
                  )}
                  {creditor.reference_number && (
                    <div>
                      <span className="font-medium">Aktenzeichen:</span> {creditor.reference_number}
                    </div>
                  )}
                  {creditor.claim_amount !== undefined && (
                    <div>
                      <span className="font-medium">Forderung:</span> €{formatAmount(creditor.claim_amount)}
                    </div>
                  )}
                  <div>
                    <span className="font-medium">Quelle:</span> {creditor.source_document}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div> */}

      {/* Reviewed Docs Accordion */}
      {reviewedDiffs.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Geprüfte Dokumente</h3>
          <div className="space-y-2">
            {reviewedDiffs.map((item) => {
              const isOpen = openDocId === item.docId;
              return (
                <div key={item.docId} className="border border-gray-200 rounded-md">
                  <button
                    type="button"
                    className="w-full flex justify-between items-center px-4 py-3 text-left hover:bg-gray-50"
                    onClick={() => setOpenDocId(isOpen ? null : item.docId)}
                  >
                    <span className="text-sm font-semibold text-gray-900">{item.name || 'Unbenanntes Dokument'}</span>
                    <span className="text-xs text-gray-500">{isOpen ? '▼' : '▶'}</span>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4">
                      <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 mb-2">
                        <div className="col-span-3">Feld</div>
                        <div className="col-span-4">Original</div>
                        <div className="col-span-4">Geändert</div>
                        <div className="col-span-1 text-right">Diff</div>
                      </div>
                      <div className="border border-gray-100 rounded">
                        {renderFieldRow('Gläubiger Name', item.original.sender_name, item.updated.sender_name)}
                        {renderFieldRow('E-Mail', item.original.sender_email, item.updated.sender_email)}
                        {renderFieldRow('Adresse', item.original.sender_address, item.updated.sender_address)}
                        {renderFieldRow('Aktenzeichen', item.original.reference_number, item.updated.reference_number)}
                        {renderFieldRow('Forderungsbetrag', item.original.claim_amount, item.updated.claim_amount)}
                        {renderFieldRow('Dokumenttyp', item.original.dokumenttyp, item.updated.dokumenttyp)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-medium text-blue-900 mb-1">ℹ️ Information</h3>
        <p className="text-sm text-blue-800">
          Diese Gläubiger wurden automatisch erkannt und benötigen keine manuelle Prüfung.
          Sie können alle auf einmal bestätigen oder bei Bedarf im Admin-Dashboard einzeln bearbeiten.
        </p>
      </div>

      {/* Confirm Button */}
      <div className="flex justify-center">
        <button
          onClick={onConfirmAll}
          disabled={loading}
          className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          style={{
            backgroundColor: loading ? '#6b7280' : '#9f1a1d'
          }}
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
              Verarbeite...
            </>
          ) : (
            <>
              <CheckCircleIcon className="h-5 w-5 mr-2" />
              Alle bestätigen und Gläubigerliste an Mandant senden
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default HighConfidenceSummary;