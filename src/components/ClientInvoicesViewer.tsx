import React from 'react';
import { CurrencyEuroIcon, CalendarIcon, DocumentTextIcon } from '@heroicons/react/24/outline';

interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  dueDate: string;
  status: 'paid' | 'pending' | 'overdue';
  description?: string;
  downloadUrl?: string;
}

interface Client {
  id?: string;
  invoices?: Invoice[];
}

interface ClientInvoicesViewerProps {
  client: Client | null;
}

const ClientInvoicesViewer: React.FC<ClientInvoicesViewerProps> = ({ client }) => {
  const invoices = client?.invoices || [];

  const formatAmount = (amount: number): string => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string): string => {
    switch (status) {
      case 'paid':
        return 'Bezahlt';
      case 'pending':
        return 'Offen';
      case 'overdue':
        return 'Überfällig';
      default:
        return status;
    }
  };

  if (invoices.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Rechnungen</h3>
        <div className="text-center py-8">
          <CurrencyEuroIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Keine Rechnungen vorhanden.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Rechnungen</h3>
      
      <div className="space-y-4">
        {invoices.map((invoice) => (
          <div key={invoice.id} className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  <DocumentTextIcon className="w-5 h-5 text-gray-400" />
                  <span className="text-sm font-medium text-gray-900">
                    Rechnung #{invoice.invoiceNumber}
                  </span>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(invoice.status)}`}>
                    {getStatusText(invoice.status)}
                  </span>
                </div>
                
                {invoice.description && (
                  <p className="text-sm text-gray-600 mb-2">{invoice.description}</p>
                )}
                
                <div className="flex items-center space-x-4 text-sm text-gray-500">
                  <div className="flex items-center">
                    <CurrencyEuroIcon className="w-4 h-4 mr-1" />
                    <span className="font-medium">{formatAmount(invoice.amount)}</span>
                  </div>
                  <div className="flex items-center">
                    <CalendarIcon className="w-4 h-4 mr-1" />
                    <span>Fällig: {formatDate(invoice.dueDate)}</span>
                  </div>
                </div>
              </div>
              
              {invoice.downloadUrl && (
                <button
                  onClick={() => window.open(invoice.downloadUrl, '_blank')}
                  className="ml-4 px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors"
                >
                  PDF
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ClientInvoicesViewer;