import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  UserIcon, 
  DocumentTextIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  XMarkIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import DocumentViewer from '../components/DocumentViewer';
import CorrectionForm from '../components/CorrectionForm';
import ProgressBar from '../components/ProgressBar';
import HighConfidenceSummary from '../components/HighConfidenceSummary';
import { API_BASE_URL } from '../../config/api';

interface ReviewData {
  client: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    aktenzeichen: string;
    current_status: string;
  };
  documents: {
    all: Document[];
    need_review: Document[];
    total_count: number;
    review_count: number;
  };
  creditors: {
    all: Creditor[];
    need_review: Creditor[];
    verified: Creditor[];
    total_count: number;
    review_count: number;
  };
  review_session: {
    status: string;
    progress: {
      total_items: number;
      completed_items: number;
      remaining_items: number;
    };
  };
}

interface Document {
  id: string;
  name: string;
  filename?: string;
  type?: string;
  size?: number;
  uploadedAt?: string;
  processing_status: string;
  is_creditor_document: boolean;
  manually_reviewed?: boolean;
  extracted_data?: {
    creditor_data?: any;
    confidence?: number;
    manual_review_required?: boolean;
  };
}

interface Creditor {
  id: string;
  sender_name: string;
  sender_email: string;
  reference_number: string;
  claim_amount: number;
  confidence: number;
  source_document: string;
  manually_reviewed?: boolean;
}

const ReviewDashboard: React.FC = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [currentDocIndex, setCurrentDocIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reviewPhase, setReviewPhase] = useState<'manual' | 'summary'>('manual');

  // Check authentication
  useEffect(() => {
    const token = localStorage.getItem('agent_token');
    const agentData = localStorage.getItem('agent_data');
    
    if (!token || !agentData) {
      navigate(`/agent/login?clientId=${clientId}`);
      return;
    }
  }, [clientId, navigate]);

  // Load review data
  useEffect(() => {
    if (clientId) {
      loadReviewData();
    }
  }, [clientId]);

  const loadReviewData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('agent_token');
      const response = await fetch(`${API_BASE_URL}/agent-review/${clientId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          navigate(`/agent/login?clientId=${clientId}`);
          return;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error('Failed to load review data');
      }

      setReviewData(data);
      console.log(`📊 Loaded review data for ${data.client.aktenzeichen}:`, data);
      
      // If no manual reviews needed, go straight to summary
      if (!data.documents.need_review || data.documents.need_review.length === 0) {
        console.log('📊 No documents need review, switching to summary phase');
        setReviewPhase('summary');
      }
      
    } catch (error: any) {
      console.error('❌ Error loading review data:', error);
      setError(error.message || 'Failed to load review data');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCorrections = async (corrections: any, action: 'correct' | 'skip' | 'confirm') => {
    if (!reviewData || !reviewData.documents.need_review[currentDocIndex]) return;
    
    setSaving(true);
    
    try {
      const currentDoc = reviewData.documents.need_review[currentDocIndex];
      const token = localStorage.getItem('agent_token');
      
      console.log(`📤 Sending correction request:`, {
        clientId,
        document_id: currentDoc.id,
        action,
        corrections,
        hasToken: !!token
      });
      
      const response = await fetch(`${API_BASE_URL}/agent-review/${clientId}/correct`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          document_id: currentDoc.id,
          corrections: corrections,
          action: action
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error(`❌ Server error response:`, errorData);
        throw new Error(errorData.error || `Failed to save ${action}`);
      }

      const result = await response.json();
      console.log(`✅ Document ${action}ed successfully:`, result);

      // Move to next document or switch to summary phase
      if (currentDocIndex < reviewData.documents.need_review.length - 1) {
        setCurrentDocIndex(currentDocIndex + 1);
      } else {
        // All manual reviews done, switch to summary phase
        setReviewPhase('summary');
      }
      
    } catch (error: any) {
      console.error(`❌ Error saving ${action}:`, error);
      setError(error.message || `Failed to save ${action}`);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmAll = async () => {
    if (!reviewData) return;
    
    setSaving(true);
    
    try {
      const token = localStorage.getItem('agent_token');
      
      // First, auto-confirm all high-confidence creditors
      const highConfidenceCreditors = reviewData.creditors.verified || [];
      for (const creditor of highConfidenceCreditors) {
        // Find the related document
        const relatedDoc = reviewData.documents.all.find(doc => 
          doc.extracted_data?.creditor_data?.sender_name === creditor.sender_name ||
          doc.name === creditor.source_document
        );
        
        if (relatedDoc && !relatedDoc.manually_reviewed) {
          // Auto-confirm high-confidence creditor
          await fetch(`${API_BASE_URL}/agent-review/${clientId}/correct`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              document_id: relatedDoc.id,
              corrections: {},
              action: 'confirm'
            })
          });
        }
      }
      
      // Now complete the entire session
      const response = await fetch(`${API_BASE_URL}/agent-review/${clientId}/complete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          zendesk_ticket_id: reviewData.client.id // Or get from elsewhere if needed
        })
      });

      if (!response.ok) {
        throw new Error('Failed to complete session');
      }

      const result = await response.json();
      console.log('✅ Review session completed:', result);

      // Show completion message and redirect
      alert(`✅ Review erfolgreich abgeschlossen!\n\n${result.summary?.creditors?.total_count || 0} Gläubiger bestätigt.\n\n📧 Gläubigerliste wurde automatisch an den Mandanten gesendet.\n\n${result.creditor_contact?.success ? '✅ Gläubiger-Kontakt wurde gestartet.' : '⚠️ Gläubiger-Kontakt muss manuell gestartet werden.'}`);
      
      // Redirect to agent dashboard
      navigate('/agent/dashboard');
      
    } catch (error: any) {
      console.error('❌ Error completing session:', error);
      setError(error.message || 'Failed to complete session');
    } finally {
      setSaving(false);
    }
  };

  const nextDocument = () => {
    if (reviewData && currentDocIndex < reviewData.documents.need_review.length - 1) {
      setCurrentDocIndex(currentDocIndex + 1);
    }
  };

  const previousDocument = () => {
    if (currentDocIndex > 0) {
      setCurrentDocIndex(currentDocIndex - 1);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{borderBottomColor: '#9f1a1d'}}></div>
          <p className="text-gray-600">Lade Review-Daten...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <ExclamationTriangleIcon className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Fehler beim Laden</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={loadReviewData}
            className="px-4 py-2 text-white rounded-md hover:opacity-90"
            style={{backgroundColor: '#9f1a1d'}}
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  if (!reviewData) {
    return null;
  }

  const documentsToReview = reviewData.documents.need_review || [];
  const currentDoc = documentsToReview[currentDocIndex];
  
  // Log for debugging
  console.log('📄 Current document:', currentDoc);
  console.log('📑 Documents to review:', documentsToReview);
  
  // Get high-confidence documents and creditors
  const highConfidenceDocuments = reviewData.documents.all.filter(doc => 
    doc.is_creditor_document && 
    doc.extracted_data?.confidence && 
    doc.extracted_data.confidence >= 0.8
  );
  
  const highConfidenceCreditors = reviewData.creditors.verified || [];

  // If no manual review needed, go straight to summary
  if (documentsToReview.length === 0 && reviewPhase === 'manual') {
    setReviewPhase('summary');
  }

  // Show summary phase if all manual reviews are done or if no manual reviews needed
  if (reviewPhase === 'summary') {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white shadow-sm border-b p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <UserIcon className="h-8 w-8 text-gray-400" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  Review Abschluss: {reviewData.client.firstName} {reviewData.client.lastName}
                </h1>
                <p className="text-sm text-gray-600">
                  Aktenzeichen: {reviewData.client.aktenzeichen}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <CheckCircleIcon className="h-6 w-6 text-green-500" />
              <span className="text-sm font-medium text-green-600">
                Manuelle Prüfung abgeschlossen
              </span>
            </div>
          </div>
        </div>

        {/* Summary Content */}
        <div className="max-w-4xl mx-auto p-6">
          <HighConfidenceSummary
            documents={highConfidenceDocuments}
            creditors={highConfidenceCreditors}
            onConfirmAll={handleConfirmAll}
            loading={saving}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <UserIcon className="h-8 w-8 text-gray-400" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                Review Session: {reviewData.client.firstName} {reviewData.client.lastName}
              </h1>
              <p className="text-sm text-gray-600">
                Aktenzeichen: {reviewData.client.aktenzeichen} • Status: {reviewData.client.current_status}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-500">
              <span className="font-medium">{reviewData.documents.review_count}</span> manuelle Prüfungen • 
              <span className="font-medium ml-2">{reviewData.creditors.verified?.length || 0}</span> automatisch erkannt
            </div>
            {saving && (
              <div className="flex items-center text-sm text-blue-600">
                <ClockIcon className="h-4 w-4 mr-1 animate-spin" />
                Speichert...
              </div>
            )}
          </div>
        </div>
        
        <ProgressBar 
          current={currentDocIndex + 1} 
          total={documentsToReview.length}
          className="mt-4"
        />
      </div>

      {/* Main Content */}
      <div className="flex h-[calc(100vh-140px)]">
        {/* Document Viewer */}
        <div className="w-1/2 p-4">
          {currentDoc ? (
            <DocumentViewer 
              clientId={clientId!}
              document={currentDoc}
              className="h-full"
            />
          ) : (
            <div className="h-full flex items-center justify-center bg-gray-50 rounded-lg">
              <p className="text-gray-500">Kein Dokument zum Anzeigen</p>
            </div>
          )}
        </div>

        {/* Correction Form */}
        <div className="w-1/2 p-4">
          {currentDoc ? (
            <CorrectionForm
              document={currentDoc}
              onSave={(corrections) => handleSaveCorrections(corrections, 'correct')}
              onSkip={(reason) => handleSaveCorrections({ skip_reason: reason }, 'skip')}
              onConfirm={() => handleSaveCorrections({}, 'confirm')}
              disabled={saving}
              className="h-full"
            />
          ) : (
            <div className="h-full flex items-center justify-center bg-gray-50 rounded-lg">
              <p className="text-gray-500">Keine Dokumente zur Überprüfung</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Footer */}
      <div className="bg-white border-t p-4 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <DocumentTextIcon className="h-5 w-5 text-gray-400" />
          <span className="text-sm text-gray-700">
            Dokument {currentDocIndex + 1} von {documentsToReview.length}: {currentDoc.filename || currentDoc.name}
          </span>
        </div>
        
        <div className="flex items-center space-x-2">
          <button 
            onClick={previousDocument}
            disabled={currentDocIndex === 0 || saving}
            className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-1" />
            Vorheriges
          </button>
          
          <button 
            onClick={nextDocument}
            disabled={currentDocIndex === documentsToReview.length - 1 || saving}
            className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{backgroundColor: '#9f1a1d'}}
          >
            Nächstes
            <ArrowRightIcon className="h-4 w-4 ml-1" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReviewDashboard;