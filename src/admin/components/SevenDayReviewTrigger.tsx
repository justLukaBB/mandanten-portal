import React, { useState } from 'react';
import { Button, Alert, CircularProgress } from '@mui/material';
import { PlayArrow, Schedule } from '@mui/icons-material';
import api from '../../utils/api';

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

  // Don't show if not scheduled or already triggered
  if (!sevenDayReviewScheduled || sevenDayReviewTriggered) {
    return null;
  }

  const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;
  const daysRemaining = scheduledDate 
    ? Math.ceil((scheduledDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <div className="seven-day-review-trigger" style={{ marginTop: '20px' }}>
      <Alert severity="info" icon={<Schedule />} style={{ marginBottom: '10px' }}>
        <strong>7-Tage Review geplant</strong>
        <br />
        Automatische Gläubiger-Review ist geplant für: {scheduledDate?.toLocaleDateString('de-DE')}
        <br />
        ({daysRemaining > 0 ? `In ${daysRemaining} Tagen` : 'Heute'})
      </Alert>

      <Button
        variant="contained"
        color="primary"
        startIcon={loading ? <CircularProgress size={20} /> : <PlayArrow />}
        onClick={handleTrigger}
        disabled={loading}
        fullWidth
      >
        {loading ? 'Triggere Review...' : 'Review jetzt starten (7-Tage überspringen)'}
      </Button>

      {error && (
        <Alert severity="error" style={{ marginTop: '10px' }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" style={{ marginTop: '10px' }}>
          ✅ 7-Tage Review erfolgreich gestartet! Zendesk Ticket wird erstellt...
        </Alert>
      )}
    </div>
  );
};

export default SevenDayReviewTrigger;