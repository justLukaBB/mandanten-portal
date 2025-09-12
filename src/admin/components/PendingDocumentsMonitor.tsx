import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { AlertCircle, Clock, Mail, Phone, FileX, AlertTriangle } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { de } from 'date-fns/locale';
import axios from 'axios';
import { API_BASE_URL } from '../../config/api';

interface ClientWithPendingDocs {
  id: string;
  aktenzeichen: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  first_payment_received: boolean;
  payment_processed_at: string;
  document_reminder_count: number;
  last_document_reminder_at?: string;
  documents: any[];
  zendesk_ticket_id?: string;
}

export const PendingDocumentsMonitor: React.FC = () => {
  const [clients, setClients] = useState<ClientWithPendingDocs[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);

  useEffect(() => {
    fetchPendingClients();
    // Refresh every 5 minutes
    const interval = setInterval(fetchPendingClients, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchPendingClients = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/admin/clients/pending-documents`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        }
      });
      setClients(response.data.clients || []);
    } catch (error) {
      console.error('Error fetching pending clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendManualReminder = async (clientId: string) => {
    setSendingReminder(clientId);
    try {
      await axios.post(
        `${API_BASE_URL}/admin/clients/${clientId}/send-reminder`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
          }
        }
      );
      // Refresh the list
      await fetchPendingClients();
    } catch (error) {
      console.error('Error sending reminder:', error);
    } finally {
      setSendingReminder(null);
    }
  };

  const getDaysWaiting = (paymentDate: string) => {
    return differenceInDays(new Date(), new Date(paymentDate));
  };

  const getUrgencyLevel = (daysWaiting: number, reminderCount: number) => {
    if (daysWaiting >= 10 || reminderCount >= 4) return 'critical';
    if (daysWaiting >= 5 || reminderCount >= 2) return 'warning';
    return 'normal';
  };

  const getUrgencyBadge = (urgency: string) => {
    switch (urgency) {
      case 'critical':
        return <Badge variant="destructive" className="flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Kritisch
        </Badge>;
      case 'warning':
        return <Badge variant="secondary" className="flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> Warnung
        </Badge>;
      default:
        return <Badge variant="outline" className="flex items-center gap-1">
          <Clock className="w-3 h-3" /> Ausstehend
        </Badge>;
    }
  };

  if (loading) {
    return <div>Lade ausstehende Dokumente...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileX className="w-5 h-5" />
              Mandanten ohne Dokumente
            </CardTitle>
            <CardDescription>
              {clients.length} Mandanten haben bezahlt aber keine Dokumente hochgeladen
            </CardDescription>
          </div>
          <Button onClick={fetchPendingClients} variant="outline" size="sm">
            Aktualisieren
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {clients.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Alle zahlenden Mandanten haben Dokumente hochgeladen ✅
            </p>
          ) : (
            clients.map((client) => {
              const daysWaiting = getDaysWaiting(client.payment_processed_at);
              const urgency = getUrgencyLevel(daysWaiting, client.document_reminder_count);
              
              return (
                <div 
                  key={client.id} 
                  className={`border rounded-lg p-4 ${
                    urgency === 'critical' ? 'border-red-500 bg-red-50' : 
                    urgency === 'warning' ? 'border-orange-500 bg-orange-50' : 
                    'border-gray-200'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <h4 className="font-semibold">
                          {client.firstName} {client.lastName}
                        </h4>
                        {getUrgencyBadge(urgency)}
                        <span className="text-sm text-muted-foreground">
                          {client.aktenzeichen}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Zahlung seit:</span>{' '}
                          <span className="font-medium">{daysWaiting} Tagen</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Erinnerungen:</span>{' '}
                          <span className="font-medium">{client.document_reminder_count || 0}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Bezahlt am:</span>{' '}
                          <span className="font-medium">
                            {format(new Date(client.payment_processed_at), 'dd.MM.yyyy', { locale: de })}
                          </span>
                        </div>
                        {client.last_document_reminder_at && (
                          <div>
                            <span className="text-muted-foreground">Letzte Erinnerung:</span>{' '}
                            <span className="font-medium">
                              {format(new Date(client.last_document_reminder_at), 'dd.MM.yyyy', { locale: de })}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => sendManualReminder(client.id)}
                        disabled={sendingReminder === client.id}
                      >
                        <Mail className="w-4 h-4 mr-1" />
                        {sendingReminder === client.id ? 'Sende...' : 'Erinnern'}
                      </Button>
                      
                      {client.phone && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(`tel:${client.phone}`)}
                        >
                          <Phone className="w-4 h-4 mr-1" />
                          Anrufen
                        </Button>
                      )}
                      
                      {client.zendesk_ticket_id && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(`https://yourcompany.zendesk.com/agent/tickets/${client.zendesk_ticket_id}`, '_blank')}
                        >
                          Ticket
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {urgency === 'critical' && (
                    <div className="mt-3 p-2 bg-red-100 rounded text-sm text-red-700">
                      ⚠️ Dieser Mandant wartet seit über {daysWaiting} Tagen. Bitte dringend kontaktieren!
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
};