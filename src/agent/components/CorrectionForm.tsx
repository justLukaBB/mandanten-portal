import React, { useState, useEffect } from 'react';
import { 
  WrenchScrewdriverIcon,
  CheckIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';

interface CorrectionFormProps {
  document: {
    id: string;
    name: string;
    filename?: string;
    extracted_data?: {
      creditor_data?: {
        sender_name?: string;
        sender_email?: string;
        sender_address?: string;
        reference_number?: string;
        claim_amount?: number;
      };
      confidence?: number;
    };
    manually_reviewed?: boolean;
  };
  creditor?: {
    id?: string;
    sender_name?: string;
    sender_email?: string;
    sender_address?: string;
    glaeubiger_name?: string;
    glaeubiger_adresse?: string;
    email_glaeubiger?: string;
    reference_number?: string;
    claim_amount?: number;
    claim_amount_raw?: string;
    needs_manual_review?: boolean;
  };
  onSave: (corrections: any) => void;
  onSkip: (reason: string) => void;
  disabled?: boolean;
  className?: string;
}

interface FormData {
  sender_name: string;
  sender_email: string;
  sender_address: string;
  reference_number: string;
  claim_amount: string;
  notes: string;
}

const CorrectionForm: React.FC<CorrectionFormProps> = ({
  document,
  creditor,
  onSave,
  onSkip,
  disabled = false,
  className = ''
}) => {
  const [formData, setFormData] = useState<FormData>({
    sender_name: '',
    sender_email: '',
    sender_address: '',
    reference_number: '',
    claim_amount: '',
    notes: ''
  });
  
  const [skipReason, setSkipReason] = useState('');
  const [showSkipForm, setShowSkipForm] = useState(false);

  const parseAmount = (raw?: string | number) => {
    if (raw === undefined || raw === null) {
      return '';
    }
    if (typeof raw === 'number') {
      return raw.toString();
    }
    const normalized = raw.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
    const num = parseFloat(normalized);
    return isNaN(num) ? '' : num.toString();
  };

  // Initialize form preferring creditor (final list) data, fallback to AI-extracted doc data
  useEffect(() => {
    const cred = creditor || {};
    const aiData = document.extracted_data?.creditor_data || {};
    setFormData({
      sender_name: cred.glaeubiger_name || cred.sender_name || aiData.sender_name || '',
      sender_email: cred.email_glaeubiger || cred.sender_email || aiData.sender_email || '',
      sender_address: cred.glaeubiger_adresse || cred.sender_address || aiData.sender_address || '',
      reference_number: cred.reference_number || aiData.reference_number || '',
      claim_amount: parseAmount(cred.claim_amount ?? cred.claim_amount_raw ?? aiData.claim_amount),
      notes: ''
    });
  }, [document, creditor]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    const corrections = {
      sender_name: formData.sender_name.trim(),
      sender_email: formData.sender_email.trim(),
      sender_address: formData.sender_address.trim(),
      reference_number: formData.reference_number.trim(),
      claim_amount: parseFloat(formData.claim_amount) || 0,
      notes: formData.notes.trim()
    };
    
    console.log('📤 CorrectionForm sending corrections:', corrections);
    onSave(corrections);
  };

  const handleSkip = () => {
    if (!skipReason.trim()) {
      alert('Bitte geben Sie einen Grund für das Überspringen an.');
      return;
    }

    onSkip(skipReason.trim());
    setShowSkipForm(false);
    setSkipReason('');
  };

  const confidence = document.extracted_data?.confidence || 0;
  const confidenceColor = confidence >= 0.8 ? 'text-green-600' : confidence >= 0.5 ? 'text-yellow-600' : 'text-red-600';
  const confidenceIcon = confidence >= 0.8 ? CheckIcon : confidence >= 0.5 ? ExclamationTriangleIcon : XMarkIcon;

  // Form is valid if we have at least a sender name and a valid claim amount
  const isFormValid = formData.sender_name.trim().length > 0 && 
                      formData.claim_amount.trim().length > 0 && 
                      !isNaN(parseFloat(formData.claim_amount)) &&
                      parseFloat(formData.claim_amount) >= 0;
  
  // Debug log for form validation
  console.log('📋 Form validation:', {
    sender_name: formData.sender_name,
    claim_amount: formData.claim_amount,
    isFormValid,
    disabled,
    buttonDisabled: disabled || !isFormValid
  });

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <WrenchScrewdriverIcon className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">Manuelle Prüfung</h3>
          </div>
          
          <div className="flex items-center space-x-2">
            {React.createElement(confidenceIcon, { className: `h-4 w-4 ${confidenceColor}` })}
            <span className={`text-sm font-medium ${confidenceColor}`}>
              {Math.round(confidence * 100)}% Confidence
            </span>
          </div>
        </div>
        
        {confidence < 0.8 && (
          <div className="mt-2 flex items-start space-x-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <InformationCircleIcon className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium">Niedrige Confidence-Bewertung</p>
              <p>Bitte überprüfen und korrigieren Sie die extrahierten Daten sorgfältig.</p>
            </div>
          </div>
        )}
      </div>

      {/* Form Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {!showSkipForm ? (
          <>
            {/* Gläubiger Name */}
            <div>
              <label htmlFor="sender_name" className="block text-sm font-medium text-gray-700 mb-1">
                Gläubiger Name *
              </label>
              <input
                type="text"
                id="sender_name"
                name="sender_name"
                value={formData.sender_name}
                onChange={handleInputChange}
                disabled={disabled}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 disabled:bg-gray-50 disabled:text-gray-500"
                placeholder="Deutsche Bank AG"
              />
            </div>

            {/* E-Mail Adresse */}
            <div>
              <label htmlFor="sender_email" className="block text-sm font-medium text-gray-700 mb-1">
                E-Mail Adresse
              </label>
              <input
                type="email"
                id="sender_email"
                name="sender_email"
                value={formData.sender_email}
                onChange={handleInputChange}
                disabled={disabled}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 disabled:bg-gray-50 disabled:text-gray-500"
                placeholder="forderungen@deutsche-bank.de"
              />
            </div>

            {/* Adresse */}
            <div>
              <label htmlFor="sender_address" className="block text-sm font-medium text-gray-700 mb-1">
                Adresse
              </label>
              <textarea
                id="sender_address"
                name="sender_address"
                value={formData.sender_address}
                onChange={handleInputChange}
                disabled={disabled}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 disabled:bg-gray-50 disabled:text-gray-500"
                placeholder="Musterstraße 123, 12345 Musterstadt"
              />
            </div>

            {/* Aktenzeichen */}
            <div>
              <label htmlFor="reference_number" className="block text-sm font-medium text-gray-700 mb-1">
                Aktenzeichen / Referenz
              </label>
              <input
                type="text"
                id="reference_number"
                name="reference_number"
                value={formData.reference_number}
                onChange={handleInputChange}
                disabled={disabled}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 disabled:bg-gray-50 disabled:text-gray-500"
                placeholder="DB/2024/123456"
              />
            </div>

            {/* Forderungsbetrag */}
            <div>
              <label htmlFor="claim_amount" className="block text-sm font-medium text-gray-700 mb-1">
                Forderungsbetrag (EUR) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  id="claim_amount"
                  name="claim_amount"
                  value={formData.claim_amount}
                  onChange={handleInputChange}
                  disabled={disabled}
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 disabled:bg-gray-50 disabled:text-gray-500"
                  placeholder="1500.00"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <span className="text-gray-500 text-sm">€</span>
                </div>
              </div>
            </div>

            {/* Notizen */}
            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                Notizen (optional)
              </label>
              <textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleInputChange}
                disabled={disabled}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 disabled:bg-gray-50 disabled:text-gray-500"
                placeholder="Zusätzliche Bemerkungen zur Korrektur..."
              />
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={handleSave}
                disabled={disabled || !isFormValid}
                className="flex items-center justify-center px-4 py-3 text-sm font-medium text-white rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{backgroundColor: '#9f1a1d'}}
              >
                <CheckIcon className="h-4 w-4 mr-2" />
                Speichern und weiter
              </button>

              <button
                onClick={() => setShowSkipForm(true)}
                disabled={disabled}
                className="flex items-center justify-center px-4 py-3 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <XMarkIcon className="h-4 w-4 mr-2" />
                Dokument überspringen
              </button>
            </div>
          </>
        ) : (
          /* Skip Form */
          <div className="space-y-4">
            <div>
              <h4 className="text-lg font-medium text-gray-900 mb-2">Dokument überspringen</h4>
              <p className="text-sm text-gray-600 mb-4">
                Warum möchten Sie dieses Dokument überspringen?
              </p>
              
              <div className="space-y-2">
                {[
                  'insufficient_information',
                  'unclear_document',
                  'duplicate_document',
                  'not_creditor_document',
                  'technical_issues',
                  'other'
                ].map((reason) => (
                  <label key={reason} className="flex items-center">
                    <input
                      type="radio"
                      name="skip_reason"
                      value={reason}
                      checked={skipReason === reason}
                      onChange={(e) => setSkipReason(e.target.value)}
                      className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300"
                    />
                    <span className="ml-2 text-sm text-gray-700">
                      {reason === 'insufficient_information' && 'Unzureichende Informationen'}
                      {reason === 'unclear_document' && 'Unklares/unlesbares Dokument'}
                      {reason === 'duplicate_document' && 'Duplikat'}
                      {reason === 'not_creditor_document' && 'Kein Gläubiger-Dokument'}
                      {reason === 'technical_issues' && 'Technische Probleme'}
                      {reason === 'other' && 'Sonstiger Grund'}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={handleSkip}
                disabled={disabled || !skipReason}
                className="flex-1 flex items-center justify-center px-4 py-3 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <XMarkIcon className="h-4 w-4 mr-2" />
                Überspringen bestätigen
              </button>
              
              <button
                onClick={() => {
                  setShowSkipForm(false);
                  setSkipReason('');
                }}
                disabled={disabled}
                className="flex-1 flex items-center justify-center px-4 py-3 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-300 rounded-md hover:bg-gray-100"
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CorrectionForm;