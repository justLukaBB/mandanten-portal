import React, { useState, useEffect } from 'react';
import { DocumentArrowDownIcon, ExclamationTriangleIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import api from '../../config/api';

interface InsolvenzantragDownloadButtonProps {
  userId: string;
  className?: string;
}

interface Prerequisites {
  hasPersonalInfo: boolean;
  hasFinancialData: boolean;
  hasDebtSettlementPlan: boolean;
  hasCreditorList: boolean;
}

interface PrerequisiteCheckResponse {
  clientId: string;
  canGenerateInsolvenzantrag: boolean;
  prerequisites: Prerequisites;
  errors: string[];
}

const InsolvenzantragDownloadButton: React.FC<InsolvenzantragDownloadButtonProps> = ({
  userId,
  className = ''
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [prerequisites, setPrerequisites] = useState<PrerequisiteCheckResponse | null>(null);
  const [showPrerequisites, setShowPrerequisites] = useState(false);

  // Check prerequisites on component mount
  useEffect(() => {
    checkPrerequisites();
  }, [userId]);

  const checkPrerequisites = async () => {
    try {
      // Use the API instance which handles base URL and auth headers automatically
      const response = await api.get(`/api/insolvenzantrag/check-prerequisites/${userId}`);
      setPrerequisites(response.data);
    } catch (error) {
      console.error('Error checking prerequisites:', error);
    }
  };

  const handleDownload = async (downloadType: 'basic' | 'creditor-package' | 'complete' = 'basic') => {
    if (!prerequisites?.canGenerateInsolvenzantrag) {
      setShowPrerequisites(true);
      return;
    }

    setIsLoading(true);
    try {
      let endpoint = '';
      switch (downloadType) {
        case 'creditor-package':
          endpoint = `/api/insolvenzantrag/generate-creditor-package/${userId}`;
          break;
        case 'complete':
          endpoint = `/api/insolvenzantrag/generate-complete/${userId}`;
          break;
        default:
          endpoint = `/api/insolvenzantrag/generate/${userId}`;
      }

      const response = await api.get(endpoint, {
        responseType: 'blob'
      });

      // Axios automatically handles status codes 200-299 as success
      const blob = response.data; // axios puts blob data in response.data
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Get filename from response headers if available
      const contentDisposition = response.headers['content-disposition'];
      let filename = 'Insolvenzantrag.pdf';
      if (contentDisposition && typeof contentDisposition === 'string') {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading Insolvenzantrag:', error);
      alert('Ein Fehler ist beim Download aufgetreten.');
    } finally {
      setIsLoading(false);
    }
  };

  const getButtonStyle = () => {
    if (!prerequisites) {
      return 'bg-gray-300 text-gray-500 cursor-wait';
    }
    
    if (prerequisites.canGenerateInsolvenzantrag) {
      return 'bg-green-600 hover:bg-green-700 text-white cursor-pointer';
    }
    
    return 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50';
  };

  const getButtonText = () => {
    if (isLoading) {
      return 'Generiere...';
    }
    if (!prerequisites) {
      return 'Prüfe...';
    }
    if (prerequisites.canGenerateInsolvenzantrag) {
      return 'Insolvenzantrag herunterladen';
    }
    return 'Voraussetzungen nicht erfüllt';
  };

  const PrerequisiteItem: React.FC<{ label: string; met: boolean }> = ({ label, met }) => (
    <div className="flex items-center space-x-2">
      {met ? (
        <CheckCircleIcon className="w-5 h-5 text-green-500" />
      ) : (
        <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />
      )}
      <span className={met ? 'text-green-700' : 'text-red-700'}>{label}</span>
    </div>
  );

  return (
    <div className={`relative ${className}`}>
      <div className="flex space-x-2">
        {/* Main Insolvenzantrag Button */}
        <button
          onClick={() => handleDownload('basic')}
          disabled={isLoading || !prerequisites?.canGenerateInsolvenzantrag}
          className={`
            flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors duration-200
            ${getButtonStyle()}
          `}
        >
          <DocumentArrowDownIcon className="w-5 h-5" />
          <span>{getButtonText()}</span>
        </button>

        {/* Creditor Package Button */}
        {prerequisites?.canGenerateInsolvenzantrag && (
          <button
            onClick={() => handleDownload('creditor-package')}
            disabled={isLoading}
            className="flex items-center space-x-2 px-3 py-2 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors duration-200"
            title="Gläubiger-Dokumentenpaket (3 Dokumente als PDF)"
          >
            <DocumentArrowDownIcon className="w-4 h-4" />
            <span>Gläubiger-Paket</span>
          </button>
        )}

        {/* Complete Package Button */}
        {prerequisites?.canGenerateInsolvenzantrag && (
          <button
            onClick={() => handleDownload('complete')}
            disabled={isLoading}
            className="flex items-center space-x-2 px-3 py-2 rounded-lg font-medium text-white bg-purple-600 hover:bg-purple-700 transition-colors duration-200"
            title="Komplettes Paket: Insolvenzantrag + alle Gläubiger-Dokumente"
          >
            <DocumentArrowDownIcon className="w-4 h-4" />
            <span>Komplett</span>
          </button>
        )}
      </div>

      {showPrerequisites && prerequisites && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center space-x-2 mb-4">
              <ExclamationTriangleIcon className="w-6 h-6 text-amber-500" />
              <h3 className="text-lg font-semibold text-gray-900">
                Voraussetzungen nicht erfüllt
              </h3>
            </div>
            
            <div className="space-y-3 mb-6">
              <PrerequisiteItem 
                label="Persönliche Daten vollständig" 
                met={prerequisites.prerequisites.hasPersonalInfo} 
              />
              <PrerequisiteItem 
                label="Finanzielle Daten ausgefüllt" 
                met={prerequisites.prerequisites.hasFinancialData} 
              />
              <PrerequisiteItem 
                label="Schuldenbereinigungsplan erstellt" 
                met={prerequisites.prerequisites.hasDebtSettlementPlan} 
              />
              <PrerequisiteItem 
                label="Gläubigerliste finalisiert" 
                met={prerequisites.prerequisites.hasCreditorList} 
              />
            </div>

            {prerequisites.errors.length > 0 && (
              <div className="mb-6">
                <h4 className="font-medium text-red-800 mb-2">Fehlende Schritte:</h4>
                <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                  {prerequisites.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowPrerequisites(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Schließen
              </button>
              <button
                onClick={checkPrerequisites}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Neu prüfen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InsolvenzantragDownloadButton;