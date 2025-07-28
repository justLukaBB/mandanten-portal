import React, { useState, useEffect } from 'react';
import {
  CurrencyEuroIcon,
  CalculatorIcon,
  ChartBarIcon,
  DocumentChartBarIcon,
  UserGroupIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PlayIcon
} from '@heroicons/react/24/outline';
import api from '../../../config/api';
import DebtRestructuring from '../../pages/DebtRestructuring';

interface Phase2DashboardProps {
  clientId: string;
}

interface DebtSummary {
  totalDebt: number;
  creditorCount: number;
  averageDebt: number;
  largestDebt: number;
}

interface GarnishmentSummary {
  netIncome?: number;
  garnishableIncome?: number;
  remainingIncome?: number;
  garnishmentPercentage?: number;
  maritalStatus?: string;
  numberOfChildren?: number;
}

interface ClientPhase2Data {
  id: string;
  firstName: string;
  lastName: string;
  phase: number;
  workflow_status: string;
  final_creditor_list: any[];
  financial_data?: any;
}

const Phase2Dashboard: React.FC<Phase2DashboardProps> = ({ clientId }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'calculation' | 'analysis' | 'reports'>('overview');
  const [clientData, setClientData] = useState<ClientPhase2Data | null>(null);
  const [debtSummary, setDebtSummary] = useState<DebtSummary | null>(null);
  const [garnishmentSummary, setGarnishmentSummary] = useState<GarnishmentSummary>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPhase2Data();
  }, [clientId]);

  const fetchPhase2Data = async () => {
    try {
      setLoading(true);
      
      // Fetch client data
      const clientResponse = await api.get(`/clients/${clientId}`);
      setClientData(clientResponse.data);

      // Fetch debt summary
      try {
        const debtResponse = await api.get(`/clients/${clientId}/total-debt`);
        const debtData = debtResponse.data;
        
        if (debtData.creditorSummary && debtData.creditorSummary.length > 0) {
          const debts = debtData.creditorSummary.map((c: any) => c.final_debt_amount);
          setDebtSummary({
            totalDebt: debtData.totalDebt,
            creditorCount: debtData.creditorCount,
            averageDebt: debts.reduce((a: number, b: number) => a + b, 0) / debts.length,
            largestDebt: Math.max(...debts)
          });
        }
      } catch (debtError) {
        console.log('Debt data not yet available:', debtError);
      }

      // Check for existing financial data
      if (clientResponse.data.financial_data) {
        setGarnishmentSummary({
          netIncome: clientResponse.data.financial_data.netIncome,
          maritalStatus: clientResponse.data.financial_data.maritalStatus,
          numberOfChildren: clientResponse.data.financial_data.numberOfChildren
        });
      }

      setError(null);
    } catch (err: any) {
      setError('Fehler beim Laden der Phase 2 Daten: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatPercentage = (percentage: number) => {
    return `${percentage.toFixed(1)}%`;
  };

  const getPhase2ReadinessStatus = () => {
    if (!clientData) return { ready: false, reason: 'Keine Daten verfügbar' };
    
    if (clientData.phase < 2) {
      return { ready: false, reason: 'Phase 1 noch nicht abgeschlossen' };
    }
    
    if (!clientData.final_creditor_list || clientData.final_creditor_list.length === 0) {
      return { ready: false, reason: 'Keine Gläubiger identifiziert' };
    }
    
    if (!debtSummary || debtSummary.totalDebt === 0) {
      return { ready: false, reason: 'Gesamtschuldenbetrag nicht verfügbar' };
    }
    
    return { ready: true, reason: 'Bereit für Pfändungsberechnung' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex">
          <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Fehler</h3>
            <div className="mt-2 text-sm text-red-700">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  if (!clientData) {
    return <div>Keine Mandantendaten für Phase 2 gefunden.</div>;
  }

  const readinessStatus = getPhase2ReadinessStatus();
  const tabs = [
    { key: 'overview', label: 'Übersicht', icon: ChartBarIcon },
    { key: 'calculation', label: 'Pfändungsberechnung', icon: CalculatorIcon },
    { key: 'analysis', label: 'Schuldenanalyse', icon: DocumentChartBarIcon },
    { key: 'reports', label: 'Berichte', icon: DocumentChartBarIcon }
  ];

  const renderOverview = () => (
    <div className="space-y-6">
      {/* Phase 2 Status Banner */}
      <div className={`rounded-lg p-6 ${readinessStatus.ready ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
        <div className="flex items-center">
          <div className="flex-shrink-0">
            {readinessStatus.ready ? (
              <CheckCircleIcon className="h-8 w-8 text-green-600" />
            ) : (
              <ExclamationTriangleIcon className="h-8 w-8 text-yellow-600" />
            )}
          </div>
          <div className="ml-4">
            <h3 className={`text-lg font-medium ${readinessStatus.ready ? 'text-green-800' : 'text-yellow-800'}`}>
              {readinessStatus.ready ? 'Phase 2 bereit' : 'Phase 2 Vorbereitung'}
            </h3>
            <p className={`text-sm ${readinessStatus.ready ? 'text-green-700' : 'text-yellow-700'}`}>
              {readinessStatus.reason}
            </p>
          </div>
          {readinessStatus.ready && (
            <div className="ml-auto">
              <button
                onClick={() => setActiveTab('calculation')}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
              >
                <PlayIcon className="w-4 h-4 mr-2" />
                Berechnung starten
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white shadow rounded-lg p-6 border-l-4 border-red-500">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CurrencyEuroIcon className="h-8 w-8 text-red-600" />
            </div>
            <div className="ml-4">
              <div className="text-2xl font-bold text-red-600">
                {debtSummary ? formatCurrency(debtSummary.totalDebt) : '---'}
              </div>
              <div className="text-sm text-gray-500">Gesamtschuld</div>
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-6 border-l-4 border-blue-500">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <UserGroupIcon className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-4">
              <div className="text-2xl font-bold text-blue-600">
                {debtSummary ? debtSummary.creditorCount : clientData.final_creditor_list.length}
              </div>
              <div className="text-sm text-gray-500">Gläubiger</div>
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-6 border-l-4 border-green-500">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CalculatorIcon className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-4">
              <div className="text-2xl font-bold text-green-600">
                {garnishmentSummary.garnishableIncome 
                  ? formatCurrency(garnishmentSummary.garnishableIncome)
                  : '---'
                }
              </div>
              <div className="text-sm text-gray-500">Pfändbar</div>
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-6 border-l-4 border-purple-500">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <ChartBarIcon className="h-8 w-8 text-purple-600" />
            </div>
            <div className="ml-4">
              <div className="text-2xl font-bold text-purple-600">
                {garnishmentSummary.garnishmentPercentage 
                  ? formatPercentage(garnishmentSummary.garnishmentPercentage)
                  : '---'
                }
              </div>
              <div className="text-sm text-gray-500">Pfändungsquote</div>
            </div>
          </div>
        </div>
      </div>

      {/* Financial Summary */}
      {garnishmentSummary.netIncome && (
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Finanzielle Situation</h3>
          </div>
          <div className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <div className="text-sm text-gray-500">Nettoeinkommen</div>
                <div className="text-lg font-semibold text-gray-900">
                  {formatCurrency(garnishmentSummary.netIncome)}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Familienstand</div>
                <div className="text-lg font-semibold text-gray-900 capitalize">
                  {garnishmentSummary.maritalStatus || '---'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Anzahl Kinder</div>
                <div className="text-lg font-semibold text-gray-900">
                  {garnishmentSummary.numberOfChildren || 0}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Debt Breakdown */}
      {debtSummary && (
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Schuldenverteilung</h3>
          </div>
          <div className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">
                  {formatCurrency(debtSummary.averageDebt)}
                </div>
                <div className="text-sm text-gray-500">Durchschnittliche Schuld</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {formatCurrency(debtSummary.largestDebt)}
                </div>
                <div className="text-sm text-gray-500">Größte Einzelschuld</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {((debtSummary.largestDebt / debtSummary.totalDebt) * 100).toFixed(1)}%
                </div>
                <div className="text-sm text-gray-500">Anteil größter Gläubiger</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div 
          onClick={() => readinessStatus.ready && setActiveTab('calculation')}
          className={`bg-white shadow rounded-lg p-6 border-l-4 border-purple-500 ${
            readinessStatus.ready ? 'cursor-pointer hover:shadow-lg transition-shadow' : 'opacity-50 cursor-not-allowed'
          }`}
        >
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CalculatorIcon className="h-8 w-8 text-purple-600" />
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">Pfändungsberechnung</h3>
              <p className="text-sm text-gray-500">
                Berechnung von pfändbarem Einkommen und Gläubiger-Quoten
              </p>
            </div>
          </div>
        </div>

        <div 
          onClick={() => setActiveTab('analysis')}
          className="bg-white shadow rounded-lg p-6 cursor-pointer hover:shadow-lg transition-shadow border-l-4 border-blue-500"
        >
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <ChartBarIcon className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">Schuldenanalyse</h3>
              <p className="text-sm text-gray-500">
                Detaillierte Analyse der Gläubiger-Struktur
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            const IconComponent = tab.icon;
            
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                  isActive
                    ? 'border-purple-500 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <IconComponent className="w-5 h-5 mr-2" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'calculation' && (
          <div className="bg-white shadow rounded-lg">
            <DebtRestructuring />
          </div>
        )}
        {activeTab === 'analysis' && (
          <div className="bg-white shadow rounded-lg p-6">
            <div className="text-center py-12">
              <DocumentChartBarIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Schuldenanalyse</h3>
              <p className="mt-1 text-sm text-gray-500">
                Detaillierte Analyse-Dashboards werden hier implementiert.
              </p>
            </div>
          </div>
        )}
        {activeTab === 'reports' && (
          <div className="bg-white shadow rounded-lg p-6">
            <div className="text-center py-12">
              <DocumentChartBarIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Berichte</h3>
              <p className="mt-1 text-sm text-gray-500">
                PDF-Berichte und Exportfunktionen werden hier implementiert.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Phase2Dashboard;