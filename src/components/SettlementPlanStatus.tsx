import React from 'react';
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { useGetSettlementPlanStatusQuery } from '../store/features/clientApi';

interface SettlementPlanStatusProps {
  clientId: string;
  customColors?: {
    primary: string;
    primaryHover: string;
  };
}

const planTypeLabels: Record<string, string> = {
  nullplan: 'Nullplan',
  ratenzahlung: 'Ratenzahlung',
  einmalzahlung: 'Einmalzahlung',
};

const statusConfig: Record<string, { label: string; color: string; bgColor: string; Icon: any }> = {
  accepted: {
    label: 'Angenommen',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    Icon: CheckCircleIcon,
  },
  declined: {
    label: 'Abgelehnt',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    Icon: XCircleIcon,
  },
  counter_offer: {
    label: 'Gegenangebot',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-100',
    Icon: ExclamationTriangleIcon,
  },
  no_response: {
    label: 'Keine Antwort',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    Icon: ClockIcon,
  },
  pending: {
    label: 'Ausstehend',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    Icon: ClockIcon,
  },
};

const SettlementPlanStatus: React.FC<SettlementPlanStatusProps> = ({
  clientId,
  customColors = { primary: '#9f1a1d', primaryHover: '#7d1517' },
}) => {
  const { data, isLoading, error } = useGetSettlementPlanStatusQuery(clientId, {
    pollingInterval: 60000, // Poll every minute for status updates
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center py-4">
          <svg className="animate-spin h-5 w-5 mr-2" style={{ color: customColors.primary }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-gray-600 text-sm">Status wird geladen...</span>
        </div>
      </div>
    );
  }

  if (error || !data?.success) {
    return null; // Don't show anything if there's no settlement plan data
  }

  const { plan_type, response_summary, creditor_details, days_remaining, sent_at } = data;

  // Don't show if plan hasn't been sent yet
  if (!sent_at) {
    return null;
  }

  const summary = response_summary;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center mb-4">
        <DocumentTextIcon className="w-6 h-6 mr-2" style={{ color: customColors.primary }} />
        <h3 className="text-lg font-semibold text-gray-900">
          Schuldenbereinigungsplan - Status
        </h3>
      </div>

      {/* Plan Type & Summary */}
      <div className="bg-gray-50 rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm text-gray-600">Plantyp</p>
            <p className="text-lg font-bold text-gray-900">
              {planTypeLabels[plan_type] || plan_type}
            </p>
          </div>
          {days_remaining > 0 && (
            <div className="text-right">
              <p className="text-sm text-gray-600">Antwortfrist</p>
              <p className="text-lg font-bold" style={{ color: customColors.primary }}>
                {days_remaining} Tage
              </p>
            </div>
          )}
        </div>

        {/* Response Summary Bar */}
        <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
          <div className="flex h-3 rounded-full overflow-hidden">
            {summary.accepted > 0 && (
              <div
                className="bg-green-500 transition-all"
                style={{ width: `${(summary.accepted / summary.total_creditors) * 100}%` }}
              />
            )}
            {summary.declined > 0 && (
              <div
                className="bg-red-500 transition-all"
                style={{ width: `${(summary.declined / summary.total_creditors) * 100}%` }}
              />
            )}
            {summary.counter_offer > 0 && (
              <div
                className="bg-yellow-500 transition-all"
                style={{ width: `${(summary.counter_offer / summary.total_creditors) * 100}%` }}
              />
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="flex items-center">
            <span className="w-2 h-2 rounded-full bg-green-500 mr-1" />
            Angenommen: {summary.accepted}
          </span>
          <span className="flex items-center">
            <span className="w-2 h-2 rounded-full bg-red-500 mr-1" />
            Abgelehnt: {summary.declined}
          </span>
          <span className="flex items-center">
            <span className="w-2 h-2 rounded-full bg-yellow-500 mr-1" />
            Gegenangebot: {summary.counter_offer}
          </span>
          <span className="flex items-center">
            <span className="w-2 h-2 rounded-full bg-gray-400 mr-1" />
            Ausstehend: {summary.pending + summary.no_response}
          </span>
        </div>
      </div>

      {/* Creditor Detail List */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700 mb-2">
          Gläubiger-Antworten ({summary.total_creditors} Gläubiger)
        </p>
        {creditor_details.map((creditor: any, index: number) => {
          const status = statusConfig[creditor.settlement_response_status] || statusConfig.pending;
          const StatusIcon = status.Icon;

          return (
            <div
              key={index}
              className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50"
            >
              <div className="flex items-center min-w-0">
                <span className="text-sm text-gray-500 w-6 flex-shrink-0">{index + 1}.</span>
                <span className="text-sm text-gray-900 truncate">{creditor.creditor_name}</span>
              </div>
              <div className={`flex items-center flex-shrink-0 ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${status.bgColor} ${status.color}`}>
                <StatusIcon className="w-3.5 h-3.5 mr-1" />
                {status.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Info Box */}
      {days_remaining > 0 && (
        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <ClockIcon className="w-5 h-5 text-blue-600 mt-0.5 mr-2 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-blue-800 mb-1">Antwortfrist läuft</p>
              <p className="text-blue-700">
                Die Gläubiger haben noch {days_remaining} Tage Zeit, auf den Schuldenbereinigungsplan
                zu antworten. Sollte keine Antwort eingehen, gilt dies rechtlich als Zustimmung.
              </p>
            </div>
          </div>
        </div>
      )}

      {days_remaining === 0 && summary.pending + summary.no_response === 0 && (
        <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start">
            <CheckCircleIcon className="w-5 h-5 text-green-600 mt-0.5 mr-2 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-green-800 mb-1">Alle Antworten eingegangen</p>
              <p className="text-green-700">
                Alle Gläubiger haben auf den Schuldenbereinigungsplan geantwortet. Unser Team wird
                sich in Kürze bei Ihnen melden, um die nächsten Schritte zu besprechen.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettlementPlanStatus;
