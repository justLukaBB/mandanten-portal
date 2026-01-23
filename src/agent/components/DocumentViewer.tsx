import React, { useState, useEffect } from 'react';
import {
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  ArrowsPointingOutIcon
} from '@heroicons/react/24/outline';
import { API_BASE_URL } from '../../config/api';
import { truncateFilename } from '../../lib/stringUtils';


interface DocumentViewerProps {
  clientId: string;
  document: {
    id: string;
    name: string;
    filename?: string;
    type?: string;
    size?: number;
    url?: string;
  };
  className?: string;
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({
  clientId,
  document,
  className = ''
}) => {
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  console.log('document url', document.url);

  useEffect(() => {
    if (clientId && document?.id) {
      loadDocument();
    } else {
      console.warn('⚠️ DocumentViewer: Missing clientId or document.id', { clientId, documentId: document?.id });
      setError('Document ID fehlt');
      setLoading(false);
    }
  }, [clientId, document?.id]);

  const loadDocument = async () => {
    try {
      setLoading(true);
      setError(null);

      // If the document already carries a direct URL (e.g., pre-signed), try it first.
      // If it is expired/invalid (403/ExpiredToken), fall back to the authenticated proxy endpoint.
      if (document.url) {
        try {
          const directResp = await fetch(document.url);
          if (directResp.ok) {
            const directBlob = await directResp.blob();
            if (!document.type && directBlob.type) {
              document.type = directBlob.type;
            }
            const directUrl = URL.createObjectURL(directBlob);
            setDocumentUrl(directUrl);
            setLoading(false);
            return;
          }
          console.warn('[DocumentViewer] Direct URL failed, falling back to proxy', {
            status: directResp.status,
            statusText: directResp.statusText
          });
        } catch (directErr) {
          console.warn('[DocumentViewer] Direct URL error, falling back to proxy', directErr);
        }
      }

      const token = localStorage.getItem('agent_token');

      // NOTE: Metadata fetch removed as the endpoint returns the file content (binary), causing JSON parse error.
      // We rely on the 'document' prop passed to this component for metadata.
      console.log(`📄 Loading document: ${document.id} for client: ${clientId}`);

      // Create document URL for secure access (matches backend route)
      const fileUrl = `${API_BASE_URL}/api/agent-review/${clientId}/document/${document.id}`;

      // Add auth header by creating a blob URL
      const fileResponse = await fetch(fileUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!fileResponse.ok) {
        if (fileResponse.status === 401) {
          console.warn('⚠️ Token expired in DocumentViewer, redirecting...');
          localStorage.removeItem('agent_token');
          localStorage.removeItem('agent_data');
          window.location.href = `/agent/login?clientId=${clientId}`;
          return;
        }
        if (fileResponse.status === 404) {
          setError('FILE_NOT_FOUND');
          return;
        }
        throw new Error('Failed to load document file');
      }

      const blob = await fileResponse.blob();
      console.log('📄 File blob received:', { type: blob.type, size: blob.size });

      // Update document type from blob if not already set
      if (!document.type && blob.type) {
        document.type = blob.type;
      }

      const url = URL.createObjectURL(blob);
      setDocumentUrl(url);

    } catch (error: any) {
      console.error('❌ Error loading document:', error);
      setError(error.message || 'Failed to load document');
    } finally {
      setLoading(false);
    }
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.25, 0.5));
  };

  const handleFitToWidth = () => {
    setZoom(1);
  };

  // Enhanced type detection from multiple sources
  const detectFileType = () => {
    // Check document.type first
    if (document.type?.includes('pdf')) return { isPDF: true, isImage: false };
    if (document.type?.includes('image')) return { isPDF: false, isImage: true };

    // Check file extensions from document name
    const fileName = document.filename || document.name || '';
    const lowerName = fileName.toLowerCase();

    if (lowerName.endsWith('.pdf')) return { isPDF: true, isImage: false };
    if (/\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(lowerName)) return { isPDF: false, isImage: true };

    // Check blob content type if available
    if (documentUrl) {
      // For blob URLs, we can't directly check content type, but we can infer from successful loading
      return { isPDF: false, isImage: true }; // Default to image for display
    }

    return { isPDF: false, isImage: false };
  };

  const { isPDF, isImage } = detectFileType();

  if (loading) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-4" style={{ borderBottomColor: '#9f1a1d' }}></div>
            <p className="text-gray-600">Lade Dokument...</p>
          </div>
        </div>
      </div>
    );
  }

  const DocumentNotFoundPlaceholder = () => (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
      <div className="relative mb-6">
        <div className="absolute -inset-1 bg-gradient-to-r from-red-100 to-orange-100 rounded-full blur opacity-75"></div>
        <div className="relative bg-white p-4 rounded-full shadow-sm">
          <svg className="w-16 h-16 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" className="text-red-500" />
          </svg>
        </div>
      </div>
      <h3 className="text-xl font-bold text-gray-900 mb-2">Dokument nicht gefunden</h3>
      <p className="text-gray-600 max-w-xs mx-auto mb-6">
        Dieses Dokument ist im Speicher nicht mehr verfügbar. Dies kann bei älteren Datensätzen oder nach einer Systemmigration vorkommen.
      </p>
      <div className="flex flex-col space-y-3 w-full max-w-xs">
        <div className="bg-white p-3 rounded-md border border-gray-200 text-left">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Details</p>
          <p className="text-sm text-gray-700 truncate">ID: {document.id}</p>
          <p className="text-sm text-gray-700 truncate">Datei: {document.filename || document.name}</p>
        </div>
        <button
          onClick={loadDocument}
          className="px-4 py-2 text-white rounded-md hover:opacity-90 shadow-sm transition-all"
          style={{ backgroundColor: '#9f1a1d' }}
        >
          Erneut versuchen
        </button>
      </div>
    </div>
  );

  if (error === 'FILE_NOT_FOUND') {
    return (
      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
        <DocumentNotFoundPlaceholder />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <ExclamationTriangleIcon className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={loadDocument}
              className="px-4 py-2 text-white rounded-md hover:opacity-90"
              style={{ backgroundColor: '#9f1a1d' }}
            >
              Erneut versuchen
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col ${className}`}>
      {/* Header with controls */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <DocumentTextIcon className="h-5 w-5 text-gray-400" />
          <div>
            <h3 className="text-sm font-medium text-gray-900">
              {truncateFilename(document.filename || document.name || '', 10)}
            </h3>
            <p className="text-xs text-gray-500">
              {document.type || 'Unknown type'} • {document.size ? Math.round(document.size / 1024) + ' KB' : 'Unknown size'}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleZoomOut}
            disabled={zoom <= 0.5}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Verkleinern"
          >
            <MagnifyingGlassMinusIcon className="h-4 w-4 text-gray-600" />
          </button>

          <span className="text-xs text-gray-600 min-w-[3rem] text-center">
            {Math.round(zoom * 100)}%
          </span>

          <button
            onClick={handleZoomIn}
            disabled={zoom >= 3}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Vergrößern"
          >
            <MagnifyingGlassPlusIcon className="h-4 w-4 text-gray-600" />
          </button>

          <button
            onClick={handleFitToWidth}
            className="p-1 rounded hover:bg-gray-100"
            title="An Breite anpassen"
          >
            <ArrowsPointingOutIcon className="h-4 w-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Document content */}
      <div className="flex-1 overflow-auto p-4">
        {documentUrl && (
          <div className="flex justify-center">
            {isPDF ? (
              <iframe
                src={documentUrl}
                className="w-full h-full min-h-[600px] border rounded"
                style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
                title={document.name}
              />
            ) : isImage ? (
              <img
                src={documentUrl}
                alt={document.name}
                className="max-w-full h-auto border rounded shadow-sm"
                style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
              />
            ) : (
              <div className="text-center py-12">
                <DocumentTextIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Vorschau nicht verfügbar</h3>
                <p className="text-gray-600 mb-4">
                  Dokumenttyp wird nicht unterstützt: {document.type}
                </p>
                <a
                  href={documentUrl}
                  download={document.filename || document.name}
                  className="inline-flex items-center px-4 py-2 text-white rounded-md hover:opacity-90"
                  style={{ backgroundColor: '#9f1a1d' }}
                >
                  Dokument herunterladen
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentViewer;