import React, { useState } from 'react';
import { ClockIcon, PlayIcon } from '@heroicons/react/24/outline';
import api from '../../config/api';

interface SevenDayReviewTriggerProps {
  clientId: string;
  clientName: string;
  sevenDayReviewScheduled: boolean;
  sevenDayReviewTriggered: boolean;
  scheduledAt?: string;
  onTriggerSuccess?: () => void;
}

const SevenDayReviewTrigger: React.FC<SevenDayReviewTriggerProps> = ({
  clientId,
  clientName,
  sevenDayReviewScheduled,
  sevenDayReviewTriggered,
  scheduledAt,
  onTriggerSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleTrigger = async () => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await api.post(`/api/admin/clients/${clientId}/trigger-seven-day-review`);
      
      if (response.data.success) {
        setSuccess(true);
        if (onTriggerSuccess) {
          onTriggerSuccess();
        }
        
        // Refresh page after 2 seconds
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        setError(response.data.error || 'Failed to trigger review');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to trigger 7-day review');
    } finally {
      setLoading(false);
    }
  };

  // Don't show if already triggered
  if (sevenDayReviewTriggered) {
    return null;
  }

  const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;
  const daysRemaining = scheduledDate 
    ? Math.ceil((scheduledDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <div className="mt-6 bg-blue-50 rounded-lg p-6 border border-blue-200">
      <div className="flex items-center mb-4">
        <ClockIcon className="w-6 h-6 mr-2 text-blue-600" />
        <h3 className="text-lg font-semibold text-blue-800">7-Tage Review Trigger</h3>
      </div>
      
      {sevenDayReviewScheduled ? (
        <div className="bg-blue-100 rounded-lg p-4 mb-4 border border-blue-300">
          <div className="flex items-start space-x-3">
            <ClockIcon className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-900">
                <strong>7-Tage Review geplant</strong>
              </p>
              <p className="text-sm text-blue-800 mt-1">
                Automatische Gläubiger-Review ist geplant für: {scheduledDate?.toLocaleDateString('de-DE')}
              </p>
              <p className="text-sm text-blue-700">
                ({daysRemaining > 0 ? `In ${daysRemaining} Tagen` : 'Heute'})
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-yellow-100 rounded-lg p-4 mb-4 border border-yellow-300">
          <div className="flex items-start space-x-3">
            <ClockIcon className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-900">
                <strong>7-Tage Review nicht geplant</strong>
              </p>
              <p className="text-sm text-yellow-800 mt-1">
                Klicken Sie den Button um den 7-Tage Review-Prozess zu starten und sofort zu triggern.
              </p>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={handleTrigger}
        disabled={loading}
        className="w-full inline-flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
      >
        {loading ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
            Triggere Review...
          </>
        ) : (
          <>
            <PlayIcon className="w-5 h-5 mr-2" />
            {sevenDayReviewScheduled ? 'Review jetzt starten (7-Tage überspringen)' : '7-Tage Review sofort starten'}
          </>
        )}
      </button>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-3">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="mt-4 bg-green-50 border border-green-200 rounded-md p-3">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-green-700">
                ✅ 7-Tage Review erfolgreich gestartet! Zendesk Ticket wird erstellt...
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SevenDayReviewTrigger;