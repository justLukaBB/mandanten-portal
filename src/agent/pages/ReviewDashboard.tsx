import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  UserIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import CreditorReviewCard from '../components/CreditorReviewCard';
import DocumentViewerModal from '../components/DocumentViewerModal';
import HighConfidenceSummary from '../components/HighConfidenceSummary';
import ProgressBar from '../components/ProgressBar';
import { API_BASE_URL } from '../../config/api';

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
  sender_email?: string;
  sender_address?: string;
  reference_number?: string;
  claim_amount?: number;
  confidence?: number;
  source_document?: string;
  source_documents?: string[];
  document_id?: string;
  manually_reviewed?: boolean;
  status?: string;
  needs_manual_review?: boolean;
  review_reasons?: string[];
}

interface CreditorWithDocuments {
  creditor: Creditor;
  documents: Document[];
  needs_manual_review: boolean;
  review_reasons: string[];
}

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
    with_documents: CreditorWithDocuments[];
    needing_review_with_docs: CreditorWithDocuments[];
    verified_with_docs: CreditorWithDocuments[];
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

const ReviewDashboard: React.FC = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();

  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completionResult, setCompletionResult] = useState<any>(null);

  // Document viewer modal state
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [isDocumentViewerOpen, setIsDocumentViewerOpen] = useState(false);

  // Track reviewed creditors locally
  const [reviewedCreditorIds, setReviewedCreditorIds] = useState<Set<string>>(new Set());

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

  // Authentication helper
  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem('agent_token');

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (response.status === 401) {
      console.warn('Token expired, redirecting to login...');
      localStorage.removeItem('agent_token');
      localStorage.removeItem('agent_data');
      navigate(`/agent/login?clientId=${clientId}`);
      throw new Error('AUTH_REDIRECT');
    }

    return response;
  };

  const loadReviewData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetchWithAuth(`${API_BASE_URL}/api/agent-review/${clientId}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error('Failed to load review data');
      }

      setReviewData(data);
      console.log(`Loaded review data for ${data.client.aktenzeichen}:`, data);

      // Initialize reviewed creditor IDs from data
      const alreadyReviewed = new Set<string>();
      (data.creditors.all || []).forEach((c: Creditor) => {
        if (c.manually_reviewed || c.status === 'confirmed') {
          alreadyReviewed.add(c.id);
        }
      });
      setReviewedCreditorIds(alreadyReviewed);

    } catch (error: any) {
      if (error.message === 'AUTH_REDIRECT') return;
      console.error('Error loading review data:', error);
      setError(error.message || 'Failed to load review data');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDocument = (doc: Document) => {
    setSelectedDocument(doc);
    setIsDocumentViewerOpen(true);
  };

  const handleCloseDocumentViewer = () => {
    setIsDocumentViewerOpen(false);
    setSelectedDocument(null);
  };

  const handleConfirmCreditor = async (creditorId: string, documentId?: string) => {
    if (!reviewData) return;

    setSaving(true);
    try {
      // Find the creditor and get document ID if not provided
      const creditorData = reviewData.creditors.with_documents?.find(
        c => c.creditor.id === creditorId
      );

      const docId = documentId ||
        creditorData?.creditor.document_id ||
        creditorData?.documents[0]?.id;

      if (!docId) {
        throw new Error('No document ID found for this creditor');
      }

      console.log(`Confirming creditor ${creditorId} with document ${docId}`);

      const response = await fetchWithAuth(`${API_BASE_URL}/api/agent-review/${clientId}/correct`, {
        method: 'POST',
        body: JSON.stringify({
          document_id: docId,
          corrections: {},
          action: 'confirm'
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to confirm creditor');
      }

      const result = await response.json();
      console.log('Creditor confirmed:', result);

      // Update local state
      setReviewedCreditorIds(prev => new Set([...prev, creditorId]));

      // Reload data to get updated state
      await loadReviewData();

    } catch (error: any) {
      if (error.message === 'AUTH_REDIRECT') return;
      console.error('Error confirming creditor:', error);
      setError(error.message || 'Failed to confirm creditor');
    } finally {
      setSaving(false);
    }
  };

  const handleCorrectCreditor = async (creditorId: string, corrections: any, documentId?: string) => {
    if (!reviewData) return;

    setSaving(true);
    try {
      // Find the creditor and get document ID if not provided
      const creditorData = reviewData.creditors.with_documents?.find(
        c => c.creditor.id === creditorId
      );

      const docId = documentId ||
        creditorData?.creditor.document_id ||
        creditorData?.documents[0]?.id;

      if (!docId) {
        throw new Error('No document ID found for this creditor');
      }

      console.log(`Correcting creditor ${creditorId} with document ${docId}`, corrections);

      const response = await fetchWithAuth(`${API_BASE_URL}/api/agent-review/${clientId}/correct`, {
        method: 'POST',
        body: JSON.stringify({
          document_id: docId,
          corrections: corrections,
          action: 'correct'
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save corrections');
      }

      const result = await response.json();
      console.log('Corrections saved:', result);

      // Update local state
      setReviewedCreditorIds(prev => new Set([...prev, creditorId]));

      // Reload data to get updated state
      await loadReviewData();

    } catch (error: any) {
      if (error.message === 'AUTH_REDIRECT') return;
      console.error('Error saving corrections:', error);
      setError(error.message || 'Failed to save corrections');
    } finally {
      setSaving(false);
    }
  };

  const handleSkipCreditor = async (creditorId: string, reason: string, documentId?: string) => {
    if (!reviewData) return;

    setSaving(true);
    try {
      // Find the creditor and get document ID if not provided
      const creditorData = reviewData.creditors.with_documents?.find(
        c => c.creditor.id === creditorId
      );

      const docId = documentId ||
        creditorData?.creditor.document_id ||
        creditorData?.documents[0]?.id;

      if (!docId) {
        throw new Error('No document ID found for this creditor');
      }

      console.log(`Skipping creditor ${creditorId} with document ${docId}, reason: ${reason}`);

      const response = await fetchWithAuth(`${API_BASE_URL}/api/agent-review/${clientId}/correct`, {
        method: 'POST',
        body: JSON.stringify({
          document_id: docId,
          corrections: { skip_reason: reason },
          action: 'skip'
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to skip creditor');
      }

      const result = await response.json();
      console.log('Creditor skipped:', result);

      // Update local state
      setReviewedCreditorIds(prev => new Set([...prev, creditorId]));

      // Reload data to get updated state
      await loadReviewData();

    } catch (error: any) {
      if (error.message === 'AUTH_REDIRECT') return;
      console.error('Error skipping creditor:', error);
      setError(error.message || 'Failed to skip creditor');
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteReview = async () => {
    if (!reviewData) return;

    setSaving(true);
    try {
      // First, auto-confirm all remaining high-confidence creditors
      const verifiedCreditors = reviewData.creditors.verified_with_docs || [];
      for (const creditorData of verifiedCreditors) {
        const creditor = creditorData.creditor;
        if (!reviewedCreditorIds.has(creditor.id) && !creditor.manually_reviewed) {
          // Find document ID using reliable linking
          const docId = creditor.document_id ||
            creditorData.documents[0]?.id;

          if (docId) {
            try {
              await fetchWithAuth(`${API_BASE_URL}/api/agent-review/${clientId}/correct`, {
                method: 'POST',
                body: JSON.stringify({
                  document_id: docId,
                  corrections: {},
                  action: 'confirm'
                })
              });
              console.log(`Auto-confirmed creditor ${creditor.sender_name}`);
            } catch (err) {
              console.warn(`Could not auto-confirm creditor ${creditor.sender_name}:`, err);
            }
          }
        }
      }

      // Now complete the entire session
      const response = await fetchWithAuth(`${API_BASE_URL}/api/agent-review/${clientId}/complete`, {
        method: 'POST',
        body: JSON.stringify({
          zendesk_ticket_id: reviewData.client.id
        })
      });

      if (!response.ok) {
        throw new Error('Failed to complete session');
      }

      const result = await response.json();
      console.log('Review session completed:', result);

      // Show completion modal
      setCompletionResult(result);
      setShowCompletionModal(true);

    } catch (error: any) {
      if (error.message === 'AUTH_REDIRECT') return;
      console.error('Error completing session:', error);
      setError(error.message || 'Failed to complete session');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderBottomColor: '#9f1a1d' }}></div>
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
            style={{ backgroundColor: '#9f1a1d' }}
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

  // Get creditors grouped by review status
  const creditorsNeedingReview = reviewData.creditors.needing_review_with_docs || [];
  const verifiedCreditors = reviewData.creditors.verified_with_docs || [];

  // Calculate progress
  const totalCreditors = creditorsNeedingReview.length + verifiedCreditors.length;
  const reviewedCount = reviewedCreditorIds.size;
  const unreviewedNeedingReview = creditorsNeedingReview.filter(
    c => !reviewedCreditorIds.has(c.creditor.id) && !c.creditor.manually_reviewed
  );

  const canComplete = unreviewedNeedingReview.length === 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b p-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <UserIcon className="h-8 w-8 text-gray-400" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  Gläubiger-Prüfung: {reviewData.client.firstName} {reviewData.client.lastName}
                </h1>
                <p className="text-sm text-gray-600">
                  Aktenzeichen: {reviewData.client.aktenzeichen}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-500">
                <span className="font-medium">{creditorsNeedingReview.length}</span> manuelle Prüfungen •
                <span className="font-medium ml-2">{verifiedCreditors.length}</span> automatisch erkannt
              </div>

              {saving && (
                <div className="flex items-center text-sm text-blue-600">
                  <ClockIcon className="h-4 w-4 mr-1 animate-spin" />
                  Speichert...
                </div>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-4">
            <ProgressBar
              current={creditorsNeedingReview.filter(c =>
                reviewedCreditorIds.has(c.creditor.id) || c.creditor.manually_reviewed
              ).length}
              total={creditorsNeedingReview.length}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        {/* Section: Creditors Needing Manual Review */}
        {creditorsNeedingReview.length > 0 && (
          <section>
            <div className="flex items-center space-x-3 mb-4">
              <ExclamationTriangleIcon className="h-6 w-6 text-yellow-500" />
              <h2 className="text-lg font-semibold text-gray-900">
                Gläubiger mit manueller Prüfung ({unreviewedNeedingReview.length} offen)
              </h2>
            </div>

            <div className="space-y-4">
              {creditorsNeedingReview.map((creditorData) => (
                <CreditorReviewCard
                  key={creditorData.creditor.id}
                  creditorData={creditorData}
                  onViewDocument={handleViewDocument}
                  onConfirmCreditor={handleConfirmCreditor}
                  onCorrectCreditor={handleCorrectCreditor}
                  onSkipCreditor={handleSkipCreditor}
                  disabled={saving}
                  isExpanded={!reviewedCreditorIds.has(creditorData.creditor.id) && !creditorData.creditor.manually_reviewed}
                />
              ))}
            </div>
          </section>
        )}

        {/* Section: Verified Creditors (High Confidence) */}
        {verifiedCreditors.length > 0 && (
          <section>
            <div className="flex items-center space-x-3 mb-4">
              <CheckCircleIcon className="h-6 w-6 text-green-500" />
              <h2 className="text-lg font-semibold text-gray-900">
                Automatisch erkannte Gläubiger ({verifiedCreditors.length})
              </h2>
              <span className="text-sm text-gray-500">
                (Confidence ≥ 80% - werden automatisch bestätigt)
              </span>
            </div>

            <div className="space-y-4">
              {verifiedCreditors.map((creditorData) => (
                <CreditorReviewCard
                  key={creditorData.creditor.id}
                  creditorData={creditorData}
                  onViewDocument={handleViewDocument}
                  onConfirmCreditor={handleConfirmCreditor}
                  onCorrectCreditor={handleCorrectCreditor}
                  onSkipCreditor={handleSkipCreditor}
                  disabled={saving}
                  isExpanded={false}
                />
              ))}
            </div>
          </section>
        )}

        {/* No Creditors State */}
        {totalCreditors === 0 && (
          <div className="text-center py-12">
            <DocumentTextIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Keine Gläubiger gefunden</h3>
            <p className="text-gray-600">
              Es wurden noch keine Gläubiger aus den Dokumenten extrahiert.
            </p>
          </div>
        )}

        {/* Complete Review Button */}
        {totalCreditors > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6 text-center">
            {canComplete ? (
              <>
                <CheckCircleIcon className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Alle manuellen Prüfungen abgeschlossen
                </h3>
                <p className="text-gray-600 mb-6">
                  Sie können die Prüfung jetzt abschließen. Die Gläubigerliste wird automatisch an den Mandanten gesendet.
                </p>
                <button
                  onClick={handleCompleteReview}
                  disabled={saving}
                  className="inline-flex items-center px-6 py-3 text-base font-medium text-white rounded-md hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: '#9f1a1d' }}
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                      Verarbeite...
                    </>
                  ) : (
                    <>
                      <CheckCircleIcon className="h-5 w-5 mr-2" />
                      Review abschließen und Gläubigerliste senden
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <ExclamationTriangleIcon className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {unreviewedNeedingReview.length} Gläubiger benötigen noch Prüfung
                </h3>
                <p className="text-gray-600">
                  Bitte prüfen Sie alle Gläubiger mit "Manuelle Prüfung = Ja" bevor Sie die Review abschließen.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Document Viewer Modal */}
      <DocumentViewerModal
        document={selectedDocument}
        clientId={clientId || ''}
        isOpen={isDocumentViewerOpen}
        onClose={handleCloseDocumentViewer}
      />

      {/* Completion Modal */}
      {showCompletionModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full text-center">
            <svg className="w-12 h-12 text-green-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2l4-4m6 2a9 9 0 11-18 0a9 9 0 0118 0z" />
            </svg>

            <h2 className="text-lg font-semibold text-gray-900 mb-2">Review erfolgreich abgeschlossen!</h2>

            <p className="text-gray-700 mb-2">
              {completionResult?.creditors_count || 0} Gläubiger bestätigt.
            </p>
            <p className="text-gray-700 mb-2">
              {completionResult?.client_email_sent
                ? "E-Mail mit Gläubigerliste wurde an den Mandanten gesendet."
                : "Gläubigerliste ist im Portal sichtbar."}
            </p>

            <button
              onClick={() => {
                setShowCompletionModal(false);
                navigate('/agent/dashboard');
              }}
              className="mt-4 px-4 py-2 text-white rounded-lg hover:opacity-90 transition"
              style={{ backgroundColor: '#9f1a1d' }}
            >
              Zum Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewDashboard;
