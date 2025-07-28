import React, { useState, useEffect } from 'react';
import { 
  CurrencyEuroIcon,
  CalculatorIcon,
  UserGroupIcon,
  ChartPieIcon,
  DocumentTextIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import api from '../../config/api';

interface ClientFinancialData {
  netIncome: string;
  maritalStatus: 'ledig' | 'verheiratet' | 'geschieden' | 'verwitwet';
  numberOfChildren: number;
}

interface GarnishmentCalculation {
  garnishableIncome: number;
  calculationDetails: {
    netIncome: number;
    maritalStatus: string;
    numberOfChildren: number;
    protectedAmounts: {
      spouse: number;
      children: number;
      total: number;
    };
    finalGarnishableAmount: number;
    remainingIncome: number;
    garnishmentPercentage: number;
  };
}

interface DebtAnalysis {
  totalDebt: number;
  creditorCount: number;
  creditorSummary: Array<{
    creditor_name: string;
    reference_number: string;
    final_debt_amount: number;
    amount_source: string;
    contact_status: string;
  }>;
}

interface CreditorQuota {
  creditor_name: string;
  reference_number: string;
  debt_amount: number;
  debt_percentage: number;
  monthly_quota: number;
  annual_quota: number;
  quota_36_months: number;
  amount_source: string;
  contact_status: string;
}

const DebtRestructuring: React.FC = () => {
  const [clientId] = useState('MAND_TEST_001'); // TODO: Get from context/props
  const [financialData, setFinancialData] = useState<ClientFinancialData>({
    netIncome: '',
    maritalStatus: 'ledig',
    numberOfChildren: 0
  });
  const [garnishmentResult, setGarnishmentResult] = useState<GarnishmentCalculation | null>(null);
  const [debtAnalysis, setDebtAnalysis] = useState<DebtAnalysis | null>(null);
  const [creditorQuotas, setCreditorQuotas] = useState<CreditorQuota[]>([]);
  const [loading, setLoading] = useState({
    garnishment: false,
    debt: false,
    quotas: false
  });
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    fetchDebtAnalysis();
  }, []);

  const fetchDebtAnalysis = async () => {
    setLoading(prev => ({ ...prev, debt: true }));
    try {
      const response = await api.get(`/clients/${clientId}/total-debt`);
      setDebtAnalysis(response.data);
      setErrors([]);
    } catch (error: any) {
      console.error('Error fetching debt analysis:', error);
      setErrors(['Fehler beim Laden der Schuldendaten']);
    } finally {
      setLoading(prev => ({ ...prev, debt: false }));
    }
  };

  const calculateGarnishableIncome = async () => {
    if (!financialData.netIncome || parseFloat(financialData.netIncome) <= 0) {
      setErrors(['Bitte geben Sie ein gültiges Nettoeinkommen ein']);
      return;
    }

    setLoading(prev => ({ ...prev, garnishment: true }));
    setErrors([]);

    try {
      const response = await api.post(`/clients/${clientId}/calculate-garnishable-income`, {
        netIncome: parseFloat(financialData.netIncome),
        maritalStatus: financialData.maritalStatus,
        numberOfChildren: financialData.numberOfChildren
      });

      // Check if the calculation was successful
      if (!response.data.success || !response.data.calculationDetails) {
        throw new Error(response.data.error || 'Garnishment calculation failed');
      }

      setGarnishmentResult({
        garnishableIncome: response.data.garnishableIncome,
        calculationDetails: response.data.calculationDetails
      });

    } catch (error: any) {
      console.error('Error calculating garnishable income:', error);
      setErrors(['Fehler bei der Pfändungsberechnung: ' + (error.response?.data?.error || error.message)]);
    } finally {
      setLoading(prev => ({ ...prev, garnishment: false }));
    }
  };

  const calculateCreditorQuotas = async () => {
    if (!garnishmentResult) {
      setErrors(['Bitte berechnen Sie zuerst das pfändbare Einkommen']);
      return;
    }

    setLoading(prev => ({ ...prev, quotas: true }));
    setErrors([]);

    try {
      const response = await api.post(`/clients/${clientId}/calculate-creditor-quotas`, {
        garnishableIncome: garnishmentResult.garnishableIncome
      });

      setCreditorQuotas(response.data.creditorQuotas || []);

      // Handle case where garnishable income is 0
      if (garnishmentResult.garnishableIncome <= 0) {
        setErrors(['Kein pfändbares Einkommen vorhanden. Bei diesem Familienstand und Einkommen ist keine Ratenzahlung möglich.']);
      }

    } catch (error: any) {
      console.error('Error calculating creditor quotas:', error);
      setErrors(['Fehler bei der Quotenberechnung: ' + (error.response?.data?.error || error.message)]);
    } finally {
      setLoading(prev => ({ ...prev, quotas: false }));
    }
  };

  const getContactStatusBadge = (status: string) => {
    const statusConfig = {
      'responded': { color: 'bg-green-100 text-green-800', icon: CheckCircleIcon, text: 'Geantwortet' },
      'email_sent': { color: 'bg-blue-100 text-blue-800', icon: ClockIcon, text: 'E-Mail versendet' },
      'timeout': { color: 'bg-yellow-100 text-yellow-800', icon: ExclamationCircleIcon, text: 'Timeout' },
      'failed': { color: 'bg-red-100 text-red-800', icon: ExclamationCircleIcon, text: 'Fehlgeschlagen' }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.failed;
    const IconComponent = config.icon;

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        <IconComponent className="w-3 h-3 mr-1" />
        {config.text}
      </span>
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatPercentage = (percentage: number) => {
    return `${percentage.toFixed(2)}%`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <CurrencyEuroIcon className="h-8 w-8 text-green-600 mr-3" />
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Schuldenregulierung - Phase 2</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Deutsche Pfändungsberechnung & Gläubiger-Quotenverteilung
                </p>
              </div>
            </div>
            <div className="text-sm text-gray-500">
              Client ID: {clientId}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        
        {/* Error Messages */}
        {errors.length > 0 && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <ExclamationCircleIcon className="h-5 w-5 text-red-400" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Fehler aufgetreten</h3>
                <div className="mt-2 text-sm text-red-700">
                  <ul className="list-disc list-inside space-y-1">
                    {errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Phase 1 Status - Schuldendaten */}
        <div className="bg-white shadow rounded-lg mb-6">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4 flex items-center">
              <ChartPieIcon className="h-5 w-5 text-blue-500 mr-2" />
              Phase 1 Status: Gläubiger-Daten
            </h3>
            
            {loading.debt ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : debtAnalysis ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {formatCurrency(debtAnalysis.totalDebt)}
                  </div>
                  <div className="text-sm text-gray-600">Gesamtverschuldung</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {debtAnalysis.creditorCount}
                  </div>
                  <div className="text-sm text-gray-600">Gläubiger</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {debtAnalysis.creditorSummary.filter(c => c.contact_status === 'responded').length}
                  </div>
                  <div className="text-sm text-gray-600">Antworten erhalten</div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <ExclamationCircleIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p>Keine Schuldendaten verfügbar</p>
                <button 
                  onClick={fetchDebtAnalysis}
                  className="mt-2 inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200"
                >
                  Neu laden
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Financial Data Input */}
        <div className="bg-white shadow rounded-lg mb-6">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4 flex items-center">
              <UserGroupIcon className="h-5 w-5 text-green-500 mr-2" />
              Schritt 1: Finanzielle Daten erfassen
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nettoeinkommen (monatlich)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={financialData.netIncome}
                    onChange={(e) => setFinancialData(prev => ({ ...prev, netIncome: e.target.value }))}
                    className="block w-full pr-12 sm:text-sm border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
                    placeholder="2500"
                    step="0.01"
                    min="0"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <span className="text-gray-500 sm:text-sm">EUR</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Familienstand
                </label>
                <select
                  value={financialData.maritalStatus}
                  onChange={(e) => setFinancialData(prev => ({ 
                    ...prev, 
                    maritalStatus: e.target.value as 'ledig' | 'verheiratet' | 'geschieden' | 'verwitwet'
                  }))}
                  className="block w-full sm:text-sm border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
                >
                  <option value="ledig">Ledig</option>
                  <option value="verheiratet">Verheiratet</option>
                  <option value="geschieden">Geschieden</option>
                  <option value="verwitwet">Verwitwet</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Anzahl Kinder
                </label>
                <input
                  type="number"
                  value={financialData.numberOfChildren}
                  onChange={(e) => setFinancialData(prev => ({ 
                    ...prev, 
                    numberOfChildren: parseInt(e.target.value) || 0 
                  }))}
                  className="block w-full sm:text-sm border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
                  min="0"
                  max="10"
                />
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={calculateGarnishableIncome}
                disabled={loading.garnishment || !financialData.netIncome}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading.garnishment ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                ) : (
                  <CalculatorIcon className="h-4 w-4 mr-2" />
                )}
                Pfändungsberechnung durchführen
              </button>
            </div>
          </div>
        </div>

        {/* Garnishment Calculation Results */}
        {garnishmentResult && (
          <div className="bg-white shadow rounded-lg mb-6">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4 flex items-center">
                <CalculatorIcon className="h-5 w-5 text-green-500 mr-2" />
                Schritt 2: Pfändungsberechnung (Deutsche Pfändungstabelle 2024)
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {formatCurrency(garnishmentResult.garnishableIncome)}
                    </div>
                    <div className="text-sm text-gray-600">Pfändbares Einkommen (monatlich)</div>
                  </div>
                  
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">
                      {formatCurrency(garnishmentResult.calculationDetails?.remainingIncome || 0)}
                    </div>
                    <div className="text-sm text-gray-600">Verbleibendes Einkommen</div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Nettoeinkommen:</span>
                    <span className="font-medium">{formatCurrency(garnishmentResult.calculationDetails?.netIncome || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Familienstand:</span>
                    <span className="font-medium capitalize">{garnishmentResult.calculationDetails?.maritalStatus || 'unbekannt'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Anzahl Kinder:</span>
                    <span className="font-medium">{garnishmentResult.calculationDetails?.numberOfChildren || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Schutzbeträge:</span>
                    <span className="font-medium">{formatCurrency(garnishmentResult.calculationDetails?.protectedAmounts?.total || 0)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-sm text-gray-600">Pfändungsquote:</span>
                    <span className="font-medium">{formatPercentage(garnishmentResult.calculationDetails?.garnishmentPercentage || 0)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                {garnishmentResult.garnishableIncome > 0 ? (
                  <button
                    onClick={calculateCreditorQuotas}
                    disabled={loading.quotas || !debtAnalysis}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading.quotas ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    ) : (
                      <ChartPieIcon className="h-4 w-4 mr-2" />
                    )}
                    Gläubiger-Quoten berechnen
                  </button>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                    <div className="flex">
                      <ExclamationCircleIcon className="h-5 w-5 text-yellow-400" />
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-yellow-800">
                          Keine Ratenzahlung möglich
                        </h3>
                        <div className="mt-2 text-sm text-yellow-700">
                          <p>
                            Bei dem angegebenen Einkommen von {formatCurrency(garnishmentResult.calculationDetails?.netIncome || 0)} 
                            und dem Familienstand "{garnishmentResult.calculationDetails?.maritalStatus || 'unbekannt'}" 
                            mit {garnishmentResult.calculationDetails?.numberOfChildren || 0} Kindern 
                            ist kein pfändbares Einkommen vorhanden.
                          </p>
                          <p className="mt-2">
                            <strong>Schutzbeträge:</strong> {formatCurrency(garnishmentResult.calculationDetails?.protectedAmounts?.total || 0)}
                            <br />
                            <strong>Verbleibendes Einkommen:</strong> {formatCurrency(garnishmentResult.calculationDetails?.remainingIncome || 0)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Creditor Quotas */}
        {creditorQuotas.length > 0 && (
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4 flex items-center">
                <ChartPieIcon className="h-5 w-5 text-blue-500 mr-2" />
                Schritt 3: Gläubiger-Quoten (36 Monate Zahlungsplan)
              </h3>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Gläubiger
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Aktenzeichen
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Forderung
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Anteil
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Monatlich
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        36 Monate Gesamt
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {creditorQuotas.map((quota, index) => (
                      <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {quota.creditor_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                          {quota.reference_number}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                          {formatCurrency(quota.debt_amount)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatPercentage(quota.debt_percentage)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                          {formatCurrency(quota.monthly_quota)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
                          {formatCurrency(quota.quota_36_months)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getContactStatusBadge(quota.contact_status)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-100">
                    <tr>
                      <td colSpan={4} className="px-6 py-4 text-sm font-medium text-gray-900">
                        Gesamt:
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-green-600">
                        {formatCurrency(creditorQuotas.reduce((sum, quota) => sum + quota.monthly_quota, 0))}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-blue-600">
                        {formatCurrency(creditorQuotas.reduce((sum, quota) => sum + quota.quota_36_months, 0))}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Summary */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-green-50 p-4 rounded-lg text-center">
                  <div className="text-lg font-bold text-green-600">
                    {formatCurrency(garnishmentResult?.garnishableIncome || 0)}
                  </div>
                  <div className="text-sm text-gray-600">Monatliches Budget</div>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg text-center">
                  <div className="text-lg font-bold text-blue-600">
                    {formatCurrency((garnishmentResult?.garnishableIncome || 0) * 36)}
                  </div>
                  <div className="text-sm text-gray-600">36-Monats-Zahlung</div>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg text-center">
                  <div className="text-lg font-bold text-purple-600">
                    {debtAnalysis ? formatPercentage(((garnishmentResult?.garnishableIncome || 0) * 36 / debtAnalysis.totalDebt) * 100) : '0%'}
                  </div>
                  <div className="text-sm text-gray-600">Deckungsgrad</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default DebtRestructuring;