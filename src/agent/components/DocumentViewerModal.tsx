import React, { useState, useEffect } from 'react';
import { XMarkIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon } from '@heroicons/react/24/outline';
import { API_BASE_URL } from '../../config/api';

interface Document {
  id: string;
  name: string;
  filename?: string;
  type?: string;
  extracted_data?: {
    creditor_data?: any;
    confidence?: number;
  };
}

interface DocumentViewerModalProps {
  document: Document | null;
  clientId: string;
  isOpen: boolean;
  onClose: () => void;
}

const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  document,
  clientId,
  isOpen,
  onClose
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!isOpen || !document) {
      setDocumentUrl(null);
      setError(null);
      return;
    }

    const loadDocument = async () => {
      setLoading(true);
      setError(null);

      try {
        const token = localStorage.getItem('agent_token');
        const fileName = encodeURIComponent(document.filename || document.name);
        const url = `${API_BASE_URL}/api/agent-review/${clientId}/document/${fileName}`;

        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error(`Failed to load document: ${response.statusText}`);
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        setDocumentUrl(objectUrl);
      } catch (err: any) {
        console.error('Error loading document:', err);
        setError(err.message || 'Failed to load document');
      } finally {
        setLoading(false);
      }
    };

    loadDocument();

    // Cleanup blob URL on unmount
    return () => {
      if (documentUrl) {
        URL.revokeObjectURL(documentUrl);
      }
    };
  }, [isOpen, document, clientId]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      window.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, isFullscreen, onClose]);

  if (!isOpen || !document) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={`absolute transition-all duration-300 ${
        isFullscreen
          ? 'inset-0'
          : 'inset-4 md:inset-8 lg:inset-16'
      } bg-white rounded-lg shadow-xl flex flex-col overflow-hidden`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center space-x-3">
            <h3 className="text-lg font-medium text-gray-900 truncate max-w-md">
              {document.filename || document.name}
            </h3>
            {document.extracted_data?.confidence !== undefined && (
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                (document.extracted_data.confidence || 0) >= 0.8
                  ? 'bg-green-100 text-green-700'
                  : 'bg-yellow-100 text-yellow-700'
              }`}>
                {Math.round((document.extracted_data.confidence || 0) * 100)}% Confidence
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
              title={isFullscreen ? 'Verkleinern' : 'Vollbild'}
            >
              {isFullscreen ? (
                <ArrowsPointingInIcon className="h-5 w-5" />
              ) : (
                <ArrowsPointingOutIcon className="h-5 w-5" />
              )}
            </button>

            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
              title="Schließen (Esc)"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden bg-gray-100">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div
                  className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4"
                  style={{ borderBottomColor: '#9f1a1d' }}
                />
                <p className="text-gray-600">Dokument wird geladen...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md">
                <div className="text-red-500 mb-4">
                  <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <p className="text-gray-800 font-medium mb-2">Fehler beim Laden</p>
                <p className="text-gray-600 text-sm">{error}</p>
              </div>
            </div>
          )}

          {!loading && !error && documentUrl && (
            <iframe
              src={documentUrl}
              className="w-full h-full border-0"
              title={document.filename || document.name}
            />
          )}
        </div>

        {/* Footer with extracted data */}
        {document.extracted_data?.creditor_data && (
          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center space-x-6 text-sm">
              <span className="text-gray-500">AI-Extraktion:</span>
              {document.extracted_data.creditor_data.sender_name && (
                <span>
                  <span className="font-medium">Gläubiger:</span>{' '}
                  {document.extracted_data.creditor_data.sender_name}
                </span>
              )}
              {document.extracted_data.creditor_data.claim_amount != null && (
                <span>
                  <span className="font-medium">Betrag:</span>{' '}
                  €{document.extracted_data.creditor_data.claim_amount.toLocaleString('de-DE', { minimumFractionDigits: 2 })}
                </span>
              )}
              {document.extracted_data.creditor_data.reference_number && (
                <span>
                  <span className="font-medium">Az:</span>{' '}
                  {document.extracted_data.creditor_data.reference_number}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentViewerModal;
