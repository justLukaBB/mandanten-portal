import React, { useState, useEffect } from 'react';
import { 
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  ArrowsPointingOutIcon
} from '@heroicons/react/24/outline';
import { API_BASE_URL } from '../../config/api';

interface DocumentViewerProps {
  clientId: string;
  document: {
    id: string;
    name: string;
    filename?: string;
    type?: string;
    size?: number;
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

      const token = localStorage.getItem('agent_token');
      
      // First get document metadata
      console.log(`📄 Loading document: ${document.id} for client: ${clientId}`);
      const metadataResponse = await fetch(`${API_BASE_URL}/api/agent-review/${clientId}/document/${document.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!metadataResponse.ok) {
        throw new Error('Failed to load document metadata');
      }

      const metadata = await metadataResponse.json();
      
      // Create document URL for secure access
      const fileUrl = `${API_BASE_URL}/api/agent-review/${clientId}/document/${document.id}/file`;
      
      // Add auth header by creating a blob URL
      const fileResponse = await fetch(fileUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!fileResponse.ok) {
        throw new Error('Failed to load document file');
      }

      const blob = await fileResponse.blob();
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

  const isPDF = document.type?.includes('pdf') || document.name?.toLowerCase().endsWith('.pdf');
  const isImage = document.type?.includes('image') || /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(document.name || '');

  if (loading) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-4" style={{borderBottomColor: '#9f1a1d'}}></div>
            <p className="text-gray-600">Lade Dokument...</p>
          </div>
        </div>
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
              style={{backgroundColor: '#9f1a1d'}}
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
              {document.filename || document.name}
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
                  style={{backgroundColor: '#9f1a1d'}}
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