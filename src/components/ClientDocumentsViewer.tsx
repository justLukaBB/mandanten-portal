import React from 'react';
import { DocumentIcon, EyeIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';

interface Document {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
  url?: string;
  hidden_from_portal?: boolean;
  source_document_id?: string;
  creditor_index?: number;
  creditor_count?: number;
}

interface Client {
  id?: string;
  documents?: Document[];
}

interface ClientDocumentsViewerProps {
  client: Client | null;
}

const ClientDocumentsViewer: React.FC<ClientDocumentsViewerProps> = ({ client }) => {
  // Filter out documents hidden from portal (source docs that were split into multiple creditors)
  const documents = (client?.documents || []).filter(doc => !doc.hidden_from_portal);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (documents.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Ihre Dokumente</h3>
        <div className="text-center py-8">
          <DocumentIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Noch keine Dokumente hochgeladen.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Ihre Dokumente</h3>
      
      <div className="space-y-3">
        {documents.map((document) => (
          <div key={document.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center flex-1 min-w-0">
              <DocumentIcon className="w-5 h-5 text-gray-400 mr-3 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">{document.name}</p>
                <p className="text-xs text-gray-500">
                  {formatFileSize(document.size)} • {formatDate(document.uploadedAt)}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2 ml-4">
              {document.url && (
                <>
                  <button
                    onClick={() => window.open(document.url, '_blank')}
                    className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    title="Ansehen"
                  >
                    <EyeIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      const link = window.document.createElement('a');
                      link.href = document.url!;
                      link.download = document.name;
                      link.click();
                    }}
                    className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    title="Herunterladen"
                  >
                    <ArrowDownTrayIcon className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ClientDocumentsViewer;