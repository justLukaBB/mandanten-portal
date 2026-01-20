import React, { useState } from 'react';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  DocumentTextIcon,
  EyeIcon,
  CheckIcon,
  XMarkIcon,
  PencilIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

interface Document {
  id: string;
  name: string;
  filename?: string;
  type?: string;
  extracted_data?: {
    creditor_data?: any;
    confidence?: number;
  };
  manually_reviewed?: boolean;
}

interface Creditor {
  id: string;
  sender_name: string;
  sender_email?: string;
  sender_address?: string;
  reference_number?: string;
  claim_amount?: number;
  confidence?: number;
  status?: string;
  needs_manual_review?: boolean;
  review_reasons?: string[];
  manually_reviewed?: boolean;
  document_id?: string;
  source_document?: string;
}

interface CreditorWithDocuments {
  creditor: Creditor;
  documents: Document[];
  needs_manual_review: boolean;
  review_reasons: string[];
}

interface CorrectionFormData {
  sender_name: string;
  sender_email: string;
  sender_address: string;
  reference_number: string;
  claim_amount: string;
  notes: string;
}

interface CreditorReviewCardProps {
  creditorData: CreditorWithDocuments;
  onViewDocument: (doc: Document) => void;
  onConfirmCreditor: (creditorId: string, documentId?: string) => void;
  onCorrectCreditor: (creditorId: string, corrections: any, documentId?: string) => void;
  onSkipCreditor: (creditorId: string, reason: string, documentId?: string) => void;
  disabled?: boolean;
  isExpanded?: boolean;
}

const CreditorReviewCard: React.FC<CreditorReviewCardProps> = ({
  creditorData,
  onViewDocument,
  onConfirmCreditor,
  onCorrectCreditor,
  onSkipCreditor,
  disabled = false,
  isExpanded: initialExpanded = false
}) => {
  const { creditor, documents = [], needs_manual_review, review_reasons = [] } = creditorData;
  const [expanded, setExpanded] = useState(initialExpanded || needs_manual_review);
  const [showCorrectionForm, setShowCorrectionForm] = useState(false);
  const [showSkipForm, setShowSkipForm] = useState(false);
  const [skipReason, setSkipReason] = useState('');
  const [formData, setFormData] = useState<CorrectionFormData>({
    sender_name: creditor.sender_name || '',
    sender_email: creditor.sender_email || '',
    sender_address: creditor.sender_address || '',
    reference_number: creditor.reference_number || '',
    claim_amount: creditor.claim_amount?.toString() || '',
    notes: ''
  });

  const confidence = creditor.confidence || 0;
  const confidencePercent = Math.round(confidence * 100);
  const isHighConfidence = confidence >= 0.8;
  const isReviewed = creditor.manually_reviewed || creditor.status === 'confirmed';

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveCorrections = () => {
    const corrections = {
      sender_name: formData.sender_name.trim(),
      sender_email: formData.sender_email.trim(),
      sender_address: formData.sender_address.trim(),
      reference_number: formData.reference_number.trim(),
      claim_amount: parseFloat(formData.claim_amount) || 0,
      notes: formData.notes.trim()
    };

    // Get the document ID from: 1) first document, 2) creditor.document_id
    const documentId = documents[0]?.id || creditor.document_id;
    onCorrectCreditor(creditor.id, corrections, documentId);
    setShowCorrectionForm(false);
  };

  const handleSkip = () => {
    if (!skipReason.trim()) {
      alert('Bitte wählen Sie einen Grund aus.');
      return;
    }
    // Get the document ID from: 1) first document, 2) creditor.document_id
    const documentId = documents[0]?.id || creditor.document_id;
    onSkipCreditor(creditor.id, skipReason, documentId);
    setShowSkipForm(false);
    setSkipReason('');
  };

  const handleConfirm = () => {
    // Try to get document ID from: 1) first document, 2) creditor.document_id, 3) creditor.source_document
    const documentId = documents[0]?.id || creditor.document_id;
    if (!documentId) {
      console.error('No document ID found for creditor:', creditor.id, creditor.sender_name);
    }
    onConfirmCreditor(creditor.id, documentId);
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm border ${
      isReviewed ? 'border-green-300 bg-green-50' :
      needs_manual_review ? 'border-yellow-300' : 'border-gray-200'
    } overflow-hidden`}>
      {/* Card Header */}
      <div
        className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
          isReviewed ? 'bg-green-50 hover:bg-green-100' : ''
        }`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {isReviewed ? (
              <CheckCircleIcon className="h-6 w-6 text-green-500 flex-shrink-0" />
            ) : needs_manual_review ? (
              <ExclamationTriangleIcon className="h-6 w-6 text-yellow-500 flex-shrink-0" />
            ) : (
              <CheckCircleIcon className="h-6 w-6 text-green-500 flex-shrink-0" />
            )}

            <div>
              <h3 className="font-semibold text-gray-900">
                {creditor.sender_name || 'Unbekannter Gläubiger'}
              </h3>
              <div className="flex items-center space-x-3 text-sm text-gray-500">
                {creditor.claim_amount != null && (
                  <span className="font-medium text-gray-700">
                    €{creditor.claim_amount.toLocaleString('de-DE', { minimumFractionDigits: 2 })}
                  </span>
                )}
                {creditor.reference_number && (
                  <span>Az: {creditor.reference_number}</span>
                )}
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  isHighConfidence ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {confidencePercent}% Confidence
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="flex items-center text-sm text-gray-500">
              <DocumentTextIcon className="h-4 w-4 mr-1" />
              {documents.length} Dokument{documents.length !== 1 ? 'e' : ''}
            </div>

            {expanded ? (
              <ChevronUpIcon className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronDownIcon className="h-5 w-5 text-gray-400" />
            )}
          </div>
        </div>

        {/* Review Reasons */}
        {needs_manual_review && review_reasons.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {review_reasons.map((reason, idx) => (
              <span
                key={idx}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-800"
              >
                {reason}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-gray-200">
          {/* Documents Section */}
          <div className="p-4 bg-gray-50">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Zugehörige Dokumente</h4>
            <div className="space-y-2">
              {documents.length > 0 ? (
                documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-center space-x-3">
                      <DocumentTextIcon className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {doc.filename || doc.name}
                        </p>
                        {doc.extracted_data?.confidence != null && (
                          <p className="text-xs text-gray-500">
                            Dokument-Confidence: {Math.round((doc.extracted_data.confidence || 0) * 100)}%
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewDocument(doc);
                      }}
                      className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100"
                    >
                      <EyeIcon className="h-4 w-4 mr-1" />
                      Ansehen
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500 italic">Keine Dokumente verknüpft</p>
              )}
            </div>
          </div>

          {/* Creditor Details & Actions */}
          {!showCorrectionForm && !showSkipForm && (
            <div className="p-4 space-y-4">
              {/* Creditor Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">E-Mail:</span>
                  <p className="font-medium">{creditor.sender_email || '-'}</p>
                </div>
                <div>
                  <span className="text-gray-500">Adresse:</span>
                  <p className="font-medium">{creditor.sender_address || '-'}</p>
                </div>
              </div>

              {/* Action Buttons */}
              {!isReviewed && (
                <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-200">
                  <button
                    onClick={handleConfirm}
                    disabled={disabled}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-white rounded-md hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: '#16a34a' }}
                  >
                    <CheckIcon className="h-4 w-4 mr-1" />
                    Bestätigen
                  </button>

                  <button
                    onClick={() => setShowCorrectionForm(true)}
                    disabled={disabled}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-white rounded-md hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: '#9f1a1d' }}
                  >
                    <PencilIcon className="h-4 w-4 mr-1" />
                    Korrigieren
                  </button>

                  <button
                    onClick={() => setShowSkipForm(true)}
                    disabled={disabled}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 disabled:opacity-50"
                  >
                    <XMarkIcon className="h-4 w-4 mr-1" />
                    Überspringen
                  </button>
                </div>
              )}

              {isReviewed && (
                <div className="flex items-center text-green-600 text-sm pt-3 border-t border-gray-200">
                  <CheckCircleIcon className="h-5 w-5 mr-2" />
                  Dieser Gläubiger wurde bereits geprüft und bestätigt.
                </div>
              )}
            </div>
          )}

          {/* Correction Form */}
          {showCorrectionForm && (
            <div className="p-4 space-y-4">
              <h4 className="font-medium text-gray-900">Gläubiger-Daten korrigieren</h4>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Gläubiger Name *
                  </label>
                  <input
                    type="text"
                    name="sender_name"
                    value={formData.sender_name}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-red-500 focus:border-red-500"
                    placeholder="Gläubiger Name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    E-Mail
                  </label>
                  <input
                    type="email"
                    name="sender_email"
                    value={formData.sender_email}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-red-500 focus:border-red-500"
                    placeholder="email@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Forderungsbetrag (EUR) *
                  </label>
                  <input
                    type="number"
                    name="claim_amount"
                    value={formData.claim_amount}
                    onChange={handleInputChange}
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-red-500 focus:border-red-500"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Aktenzeichen
                  </label>
                  <input
                    type="text"
                    name="reference_number"
                    value={formData.reference_number}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-red-500 focus:border-red-500"
                    placeholder="Az: 123/456"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Adresse
                  </label>
                  <textarea
                    name="sender_address"
                    value={formData.sender_address}
                    onChange={handleInputChange}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-red-500 focus:border-red-500"
                    placeholder="Straße, PLZ Ort"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSaveCorrections}
                  disabled={!formData.sender_name.trim() || !formData.claim_amount}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white rounded-md hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: '#9f1a1d' }}
                >
                  <CheckIcon className="h-4 w-4 mr-1" />
                  Speichern
                </button>
                <button
                  onClick={() => setShowCorrectionForm(false)}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}

          {/* Skip Form */}
          {showSkipForm && (
            <div className="p-4 space-y-4">
              <h4 className="font-medium text-gray-900">Gläubiger überspringen</h4>
              <p className="text-sm text-gray-600">Warum möchten Sie diesen Gläubiger überspringen?</p>

              <div className="space-y-2">
                {[
                  { value: 'not_creditor_document', label: 'Kein Gläubiger-Dokument' },
                  { value: 'insufficient_information', label: 'Unzureichende Informationen' },
                  { value: 'unclear_document', label: 'Unklares/unlesbares Dokument' },
                  { value: 'duplicate_document', label: 'Duplikat eines anderen Gläubigers' },
                  { value: 'other', label: 'Sonstiger Grund' }
                ].map(option => (
                  <label key={option.value} className="flex items-center">
                    <input
                      type="radio"
                      name="skip_reason"
                      value={option.value}
                      checked={skipReason === option.value}
                      onChange={(e) => setSkipReason(e.target.value)}
                      className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300"
                    />
                    <span className="ml-2 text-sm text-gray-700">{option.label}</span>
                  </label>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSkip}
                  disabled={!skipReason}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  <XMarkIcon className="h-4 w-4 mr-1" />
                  Überspringen bestätigen
                </button>
                <button
                  onClick={() => {
                    setShowSkipForm(false);
                    setSkipReason('');
                  }}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CreditorReviewCard;
