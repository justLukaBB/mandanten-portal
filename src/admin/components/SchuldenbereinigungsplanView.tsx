import React, { useState, useEffect } from 'react';
import { 
  XMarkIcon,
  ArrowLeftIcon,
  CalculatorIcon,
  CurrencyEuroIcon,
  BuildingOfficeIcon,
  UserIcon,
  InformationCircleIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  DocumentArrowDownIcon
} from '@heroicons/react/24/outline';
import { API_BASE_URL } from '../../config/api';

interface SchuldenbereinigungsplanViewProps {
  userId: string;
  onClose: () => void;
  onBack: () => void;
}

interface FinancialData {
  net_income: number;
  dependents: number;
  marital_status: 'ledig' | 'verheiratet' | 'geschieden' | 'verwitwet';
  pfaendbar_amount: number;
  input_date: string;
  input_by: string;
}

interface CreditorCalculationEntry {
  id: string;
  name: string;
  email: string;
  address: string;
  reference_number: string;
  original_amount: number;
  final_amount: number;
  amount_source: 'creditor_response' | 'original_document' | 'default_fallback';
  contact_status: 'responded' | 'no_response' | 'email_failed';
  is_representative: boolean;
  actual_creditor: string;
  ai_confidence: number;
  created_at: string;
}

interface SettlementPlanCalculation {
  success: boolean;
  clientReference: string;
  analysis_date: string;
  financialInput: {
    netIncome: number;
    maritalStatus: string;
    numberOfChildren: number;
  };
  garnishment: {
    success: boolean;
    garnishableAmount: number;
    baseAmount: number;
    exemptionAmount: number;
    exemptionBreakdown: any;
  };
  debtAnalysis: {
    totalDebt: number;
    creditorCount: number;
    garnishableIncome: number;
    creditorQuotas: Array<{
      creditor_name: string;
      reference_number: string;
      debt_amount: number;
      debt_percentage: number;
      monthly_quota: number;
      annual_quota: number;
      quota_36_months: number;
      amount_source: string;
      contact_status: string;
    }>;
  };
  error?: string;
}

interface ClientData {
  id: string;
  aktenzeichen: string;
  firstName: string;
  lastName: string;
  email: string;
  has_financial_data: boolean;
  financial_data?: FinancialData;
  has_creditor_calculation: boolean;
  creditor_calculation_table: CreditorCalculationEntry[];
  creditor_calculation_total_debt: number;
  creditor_calculation_created_at?: string;
  settlement_plan?: SettlementPlanCalculation;
}

const SchuldenbereinigungsplanView: React.FC<SchuldenbereinigungsplanViewProps> = ({ 
  userId, 
  onClose, 
  onBack 
}) => {
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [downloadingDocument, setDownloadingDocument] = useState(false);
  const [downloadingForderungsuebersicht, setDownloadingForderungsuebersicht] = useState(false);

  // Financial input form state
  const [financialForm, setFinancialForm] = useState({
    net_income: '',
    dependents: '0',
    marital_status: 'ledig' as const
  });
  const [pfaendbarAmount, setPfaendbarAmount] = useState<number | null>(null);
  const [savingFinancial, setSavingFinancial] = useState(false);

  // Phase 2: Settlement Plan generation & sending state
  const [generatingPhase2, setGeneratingPhase2] = useState(false);
  const [sendingPhase2, setSendingPhase2] = useState(false);
  const [phase2Result, setPhase2Result] = useState<any>(null);
  const [phase2SendResult, setPhase2SendResult] = useState<any>(null);
  const [previewingCreditor, setPreviewingCreditor] = useState<number | null>(null);
  const [phase2Status, setPhase2Status] = useState<any>(null);

  useEffect(() => {
    fetchClientData();
    fetchPhase2Status();
  }, [userId]);

  const fetchClientData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${API_BASE_URL}/api/clients/${userId}/settlement-plan`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch client data');
      }
      
      const data = await response.json();
      
      console.log('🔍 Settlement plan API response:', data);
      console.log('🔍 Creditor calculation data:', {
        has_creditor_calculation: data.has_creditor_calculation,
        table_length: data.creditor_calculation_table?.length,
        total_debt: data.creditor_calculation_total_debt
      });
      
      console.log('🔍 Raw API settlement plan data:', data.settlement_plan);
      
      // Extract client data from the response
      const clientDataFormatted = {
        id: data.client_id,
        aktenzeichen: data.aktenzeichen,
        firstName: data.firstName || 'Unknown',
        lastName: data.lastName || 'Unknown',
        email: data.email || '',
        has_financial_data: data.has_financial_data,
        financial_data: data.financial_data,
        has_creditor_calculation: data.has_creditor_calculation,
        creditor_calculation_table: data.creditor_calculation_table || [],
        creditor_calculation_total_debt: data.creditor_calculation_total_debt || 0,
        creditor_calculation_created_at: data.creditor_calculation_created_at,
        settlement_plan: data.settlement_plan
      };
      
      console.log('🔍 Formatted settlement plan:', clientDataFormatted.settlement_plan);
      
      setClientData(clientDataFormatted);
      
      // Pre-fill form if financial data exists
      if (data.financial_data) {
        setFinancialForm({
          net_income: data.financial_data.net_income ? data.financial_data.net_income.toString() : '',
          dependents: data.financial_data.dependents ? data.financial_data.dependents.toString() : '0',
          marital_status: data.financial_data.marital_status || 'ledig'
        });
        if (data.financial_data.pfaendbar_amount !== undefined) {
          setPfaendbarAmount(data.financial_data.pfaendbar_amount);
        }
      }
      
    } catch (error) {
      console.error('Error fetching client data:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const calculatePfaendbarAmount = async (netIncome: number, maritalStatus: string, dependents: number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/clients/${userId}/calculate-garnishable-income`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          netIncome,
          maritalStatus,
          numberOfChildren: dependents
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to calculate garnishable income');
      }
      
      const result = await response.json();
      return result.garnishable_amount;
    } catch (error) {
      console.error('Error calculating pfändbar amount:', error);
      return null;
    }
  };

  const handleFinancialFormChange = async (field: string, value: string) => {
    const newForm = { ...financialForm, [field]: value };
    setFinancialForm(newForm);
    
    // Real-time pfändbar calculation
    if (newForm.net_income && !isNaN(parseFloat(newForm.net_income))) {
      const netIncome = parseFloat(newForm.net_income);
      const dependents = parseInt(newForm.dependents) || 0;
      
      const pfaendbar = await calculatePfaendbarAmount(netIncome, newForm.marital_status, dependents);
      setPfaendbarAmount(pfaendbar);
    } else {
      setPfaendbarAmount(null);
    }
  };

  const saveFinancialData = async () => {
    try {
      setSavingFinancial(true);
      
      const response = await fetch(`${API_BASE_URL}/api/clients/${userId}/financial-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          net_income: parseFloat(financialForm.net_income),
          dependents: parseInt(financialForm.dependents) || 0,
          marital_status: financialForm.marital_status,
          input_by: 'admin'
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to save financial data');
      }
      
      const result = await response.json();
      console.log('Financial data saved:', result);
      
      // Refresh client data
      await fetchClientData();
      
    } catch (error) {
      console.error('Error saving financial data:', error);
      setError(error instanceof Error ? error.message : 'Failed to save financial data');
    } finally {
      setSavingFinancial(false);
    }
  };

  // ============ Phase 2: DOCX-Template-based plan generation & sending ============

  const fetchPhase2Status = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`${API_BASE_URL}/api/clients/${userId}/settlement-plan/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setPhase2Status(data);
        }
      }
    } catch (err) {
      console.error('Error fetching phase 2 status:', err);
    }
  };

  const generatePhase2Plan = async () => {
    try {
      setGeneratingPhase2(true);
      setError(null);
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`${API_BASE_URL}/api/clients/${userId}/settlement-plan/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Generation failed');
      }
      setPhase2Result(result);
      await fetchPhase2Status();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Plan generation failed');
    } finally {
      setGeneratingPhase2(false);
    }
  };

  const sendPhase2Plan = async () => {
    try {
      setSendingPhase2(true);
      setError(null);
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`${API_BASE_URL}/api/clients/${userId}/settlement-plan/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Sending failed');
      }
      setPhase2SendResult(result);
      await fetchPhase2Status();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Plan sending failed');
    } finally {
      setSendingPhase2(false);
    }
  };

  const previewCreditorDocument = async (creditorIndex: number) => {
    try {
      setPreviewingCreditor(creditorIndex);
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`${API_BASE_URL}/api/admin/clients/${userId}/settlement-plan/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ creditor_index: creditorIndex })
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Download failed' }));
        throw new Error(errData.error);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const contentDisposition = response.headers.get('content-disposition');
      let filename = `Preview_Creditor_${creditorIndex}.docx`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="([^"]+)"/);
        if (match) {
          filename = match[1];
        }
      }
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setPreviewingCreditor(null);
    }
  };

  // ============ Legacy download functions ============

  const downloadSchuldenbereinigungsplan = async () => {
    if (!clientData?.settlement_plan || !clientData.settlement_plan.success) {
      setError('No valid settlement plan data available for document generation');
      return;
    }

    try {
      setDownloadingDocument(true);
      setError(null);
      
      console.log('🔄 Generating Schuldenbereinigungsplan document...');

      // Prepare settlement data for document generation
      const totalPaymentAmount = (clientData.settlement_plan.garnishment?.garnishableAmount || 0) * 36;
      const totalDebt = clientData.settlement_plan.debtAnalysis.totalDebt;
      const overallQuotaPercentage = totalDebt > 0 ? (totalPaymentAmount / totalDebt) * 100 : 0;
      
      const settlementData = {
        monthly_payment: clientData.settlement_plan.garnishment?.garnishableAmount || 0,
        duration_months: 36,
        total_debt: totalDebt,
        creditor_payments: clientData.settlement_plan.debtAnalysis.creditorQuotas.map(quota => ({
          creditor_name: quota.creditor_name,
          debt_amount: quota.debt_amount,
          quota_percentage: overallQuotaPercentage // Same quota percentage for all creditors in settlement plan
        })),
        average_quota_percentage: overallQuotaPercentage,
        total_payment_amount: totalPaymentAmount
      };

      const response = await fetch(`${API_BASE_URL}/api/documents/schuldenbereinigungsplan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_reference: clientData.aktenzeichen,
          settlement_data: settlementData
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        
        if (response.status === 503 && errorData.code === 'SERVICE_UNAVAILABLE') {
          throw new Error('📄 Document generation is temporarily unavailable. The server is missing required dependencies. Please contact support.');
        }
        
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      // Get the document as a blob
      const blob = await response.blob();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Get filename from Content-Disposition header or create default
      const contentDisposition = response.headers.get('content-disposition');
      let filename = `Schuldenbereinigungsplan_${clientData.aktenzeichen}_${new Date().toISOString().split('T')[0]}.docx`;
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      console.log(`✅ Document downloaded: ${filename}`);
      
    } catch (error) {
      console.error('❌ Error downloading document:', error);
      setError(error instanceof Error ? error.message : 'Failed to download document');
    } finally {
      setDownloadingDocument(false);
    }
  };

  const downloadForderungsuebersicht = async () => {
    if (!clientData) {
      setError('No client data available for document generation');
      return;
    }

    try {
      setDownloadingForderungsuebersicht(true);
      setError(null);
      
      console.log('🔄 Generating Forderungsübersicht document...');

      const response = await fetch(`${API_BASE_URL}/api/documents/forderungsuebersicht`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_reference: clientData.aktenzeichen
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        
        if (response.status === 503 && errorData.code === 'SERVICE_UNAVAILABLE') {
          throw new Error('📄 Document generation is temporarily unavailable. The server is missing required dependencies. Please contact support.');
        }
        
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      // Get the document as a blob
      const blob = await response.blob();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Get filename from Content-Disposition header or create default
      const contentDisposition = response.headers.get('content-disposition');
      let filename = `Forderungsuebersicht_${clientData.aktenzeichen}_${new Date().toISOString().split('T')[0]}.docx`;
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      console.log(`✅ Document downloaded: ${filename}`);
      
    } catch (error) {
      console.error('❌ Error downloading Forderungsübersicht:', error);
      setError(error instanceof Error ? error.message : 'Failed to download Forderungsübersicht');
    } finally {
      setDownloadingForderungsuebersicht(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusColors = {
      'responded': 'bg-green-100 text-green-800',
      'no_response': 'bg-yellow-100 text-yellow-800',
      'email_failed': 'bg-red-100 text-red-800'
    };
    
    return statusColors[status as keyof typeof statusColors] || 'bg-gray-100 text-gray-800';
  };

  const getSourceBadge = (source: string) => {
    const sourceColors = {
      'creditor_response': 'bg-blue-100 text-blue-800',
      'original_document': 'bg-purple-100 text-purple-800', 
      'default_fallback': 'bg-gray-100 text-gray-800'
    };
    
    const sourceLabels = {
      'creditor_response': 'Response',
      'original_document': 'Document',
      'default_fallback': 'Default €100'
    };
    
    return {
      color: sourceColors[source as keyof typeof sourceColors] || 'bg-gray-100 text-gray-800',
      label: sourceLabels[source as keyof typeof sourceLabels] || source
    };
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600"></div>
            <p>Loading settlement plan data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !clientData) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-red-600">Error</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>
          <p className="text-gray-600 mb-4">{error || 'Failed to load client data'}</p>
          <div className="flex space-x-3">
            <button
              onClick={fetchClientData}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Retry
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-7xl w-full mx-4 max-h-screen overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-3">
            <button
              onClick={onBack}
              className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md border hover:bg-gray-50 transition-colors text-gray-600 border-gray-300"
            >
              <ArrowLeftIcon className="w-4 h-4 mr-1" />
              Back
            </button>
            <h2 className="text-2xl font-bold text-gray-900">
              📊 Schuldenbereinigungsplan: {clientData.firstName} {clientData.lastName}
            </h2>
            <span className="text-sm text-gray-500">({clientData.aktenzeichen})</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Financial Data Input Section */}
          <div className="bg-yellow-50 rounded-lg p-6 border border-yellow-200">
            <div className="flex items-center mb-4">
              <CurrencyEuroIcon className="w-6 h-6 mr-2 text-yellow-600" />
              <h3 className="text-lg font-semibold text-yellow-800">Financial Data (Manual Input)</h3>
            </div>
            
            {clientData.has_financial_data ? (
              <div className="bg-white rounded-lg p-4 border">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="font-medium text-gray-700">Net Income</p>
                    <p className="text-lg font-bold text-green-600">€{clientData.financial_data?.net_income ? clientData.financial_data.net_income.toFixed(2) : '0.00'}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-700">Dependents</p>
                    <p className="text-lg font-bold">{clientData.financial_data?.dependents ?? 0}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-700">Marital Status</p>
                    <p className="text-lg font-bold capitalize">{clientData.financial_data?.marital_status || 'ledig'}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-700">Pfändbar Amount</p>
                    <p className="text-lg font-bold text-red-600">€{clientData.financial_data?.pfaendbar_amount ? clientData.financial_data.pfaendbar_amount.toFixed(2) : '0.00'}</p>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Entered on {new Date(clientData.financial_data?.input_date || '').toLocaleDateString('de-DE')} by {clientData.financial_data?.input_by}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Net Income (€)
                    </label>
                    <input
                      type="number"
                      value={financialForm.net_income}
                      onChange={(e) => handleFinancialFormChange('net_income', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                      placeholder="2500.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Dependents
                    </label>
                    <input
                      type="number"
                      value={financialForm.dependents}
                      onChange={(e) => handleFinancialFormChange('dependents', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Marital Status
                    </label>
                    <select
                      value={financialForm.marital_status}
                      onChange={(e) => handleFinancialFormChange('marital_status', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    >
                      <option value="ledig">Ledig</option>
                      <option value="verheiratet">Verheiratet</option>
                      <option value="geschieden">Geschieden</option>
                      <option value="verwitwet">Verwitwet</option>
                    </select>
                  </div>
                </div>
                
                {pfaendbarAmount !== null && (
                  <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                    <p className="text-sm font-medium text-red-800">
                      💰 Pfändbar Amount: <span className="text-lg font-bold">€{pfaendbarAmount.toFixed(2)}</span> per month
                    </p>
                  </div>
                )}
                
                <button
                  onClick={saveFinancialData}
                  disabled={savingFinancial || !financialForm.net_income || pfaendbarAmount === null}
                  className="inline-flex items-center px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingFinancial ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircleIcon className="w-4 h-4 mr-2" />
                      Save Financial Data
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Creditor Calculation Table */}
          <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <CalculatorIcon className="w-6 h-6 mr-2 text-blue-600" />
                <h3 className="text-lg font-semibold text-blue-800">Creditor Calculation for Schuldenbereinigungsplan</h3>
              </div>
              <div className="flex items-center space-x-3">
                {clientData.has_creditor_calculation && clientData.creditor_calculation_table.length > 0 && (
                  <button
                    onClick={downloadForderungsuebersicht}
                    disabled={downloadingForderungsuebersicht}
                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {downloadingForderungsuebersicht ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Generating...
                      </>
                    ) : (
                      <>
                        <DocumentArrowDownIcon className="w-4 h-4 mr-2" />
                        Download Forderungsübersicht
                      </>
                    )}
                  </button>
                )}
                {clientData.creditor_calculation_created_at && (
                  <div className="text-sm text-gray-600">
                    Created: {new Date(clientData.creditor_calculation_created_at).toLocaleDateString('de-DE')}
                  </div>
                )}
              </div>
            </div>
            
            {clientData.has_creditor_calculation && clientData.creditor_calculation_table.length > 0 ? (
              <div className="space-y-4">
                {/* Summary */}
                <div className="bg-white rounded-lg p-4 border">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="font-medium text-gray-700">Total Creditors</p>
                      <p className="text-lg font-bold text-blue-600">{clientData.creditor_calculation_table.length}</p>
                    </div>
                    <div>
                      <p className="font-medium text-gray-700">Total Debt</p>
                      <p className="text-lg font-bold text-red-600">€{clientData.creditor_calculation_total_debt.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="font-medium text-gray-700">Status</p>
                      <p className="text-lg font-bold text-green-600">Ready for Calculation</p>
                    </div>
                  </div>
                </div>

                {/* Creditors Table */}
                <div className="bg-white rounded-lg border overflow-hidden">
                  <div className="px-4 py-3 border-b bg-gray-50">
                    <h4 className="font-semibold text-gray-900">Creditor Amounts for Calculation</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Creditor
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Reference
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Original Amount (AI)
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Final Amount
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Source
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {clientData.creditor_calculation_table.map((creditor, index) => {
                          const sourceBadge = getSourceBadge(creditor.amount_source);
                          return (
                            <tr key={creditor.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div>
                                  <div className="text-sm font-medium text-gray-900">{creditor.name}</div>
                                  <div className="text-sm text-gray-500">{creditor.email}</div>
                                  {creditor.is_representative && (
                                    <div className="text-xs text-blue-600">Rep for: {creditor.actual_creditor}</div>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {creditor.reference_number || 'N/A'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                €{creditor.original_amount.toFixed(2)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-600">
                                €{creditor.final_amount.toFixed(2)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${sourceBadge.color}`}>
                                  {sourceBadge.label}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(creditor.contact_status)}`}>
                                  {creditor.contact_status === 'responded' ? 'Response Received' : 
                                   creditor.contact_status === 'no_response' ? 'No Response' : 'Email Failed'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <InformationCircleIcon className="w-12 h-12 text-blue-400 mx-auto mb-3" />
                <p className="text-gray-600 mb-4">No creditor calculation table created yet.</p>
                <p className="text-sm text-gray-500">
                  Click the &quot;Letzte Zahlung bestätigen&quot; button in the client details header to create the creditor calculation table for the Schuldenbereinigungsplan.
                </p>
              </div>
            )}
          </div>

          {/* Settlement Plan Calculation Results */}
          {clientData.settlement_plan && (
            <div className="bg-green-50 rounded-lg p-6 border border-green-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <CalculatorIcon className="w-6 h-6 mr-2 text-green-600" />
                  <h3 className="text-lg font-semibold text-green-800">Schuldenbereinigungsplan Calculation Results</h3>
                </div>
                <div className="flex items-center space-x-2">
                  {/* Debug info - remove after testing */}
                  <span className="text-xs text-gray-500">
                    Success: {String(clientData.settlement_plan?.success || false)}
                  </span>
                  {(clientData.settlement_plan?.success || clientData.settlement_plan?.debtAnalysis?.creditorQuotas?.length > 0) && (
                    <button
                      onClick={downloadSchuldenbereinigungsplan}
                      disabled={downloadingDocument}
                      className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {downloadingDocument ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Generating...
                        </>
                      ) : (
                        <>
                          <DocumentArrowDownIcon className="w-4 h-4 mr-2" />
                          Download Word Document
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
              
              {clientData.settlement_plan && clientData.settlement_plan.success ? (
                <div className="space-y-4">
                  {/* Financial Summary */}
                  <div className="bg-white rounded-lg p-4 border">
                    <h4 className="font-semibold text-gray-900 mb-3">Financial Analysis</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="font-medium text-gray-700">Net Income</p>
                        <p className="text-lg font-bold text-blue-600">€{clientData.settlement_plan.financialInput.netIncome.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="font-medium text-gray-700">Garnishable Amount</p>
                        <p className="text-lg font-bold text-green-600">€{clientData.settlement_plan.garnishment?.garnishableAmount?.toFixed(2) || '0.00'}/month</p>
                      </div>
                      <div>
                        <p className="font-medium text-gray-700">Total Debt</p>
                        <p className="text-lg font-bold text-red-600">€{clientData.settlement_plan.debtAnalysis.totalDebt.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="font-medium text-gray-700">Creditors</p>
                        <p className="text-lg font-bold">{clientData.settlement_plan.debtAnalysis.creditorCount}</p>
                      </div>
                    </div>
                  </div>

                  {/* Monthly Payment Plan */}
                  {clientData.settlement_plan.debtAnalysis.creditorQuotas && clientData.settlement_plan.debtAnalysis.creditorQuotas.length > 0 && (
                    <div className="bg-white rounded-lg border overflow-hidden">
                      <div className="px-4 py-3 border-b bg-gray-50">
                        <h4 className="font-semibold text-gray-900">Monthly Payment Distribution</h4>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Creditor
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Debt Amount
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Percentage
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Monthly Payment
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Annual Payment
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                36-Month Total
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {clientData.settlement_plan.debtAnalysis.creditorQuotas.map((quota, index) => (
                              <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div>
                                    <div className="text-sm font-medium text-gray-900">{quota.creditor_name}</div>
                                    <div className="text-sm text-gray-500">{quota.reference_number}</div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                  €{quota.debt_amount.toFixed(2)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                  {quota.debt_percentage.toFixed(1)}%
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-600">
                                  €{quota.monthly_quota.toFixed(2)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                  €{quota.annual_quota.toFixed(2)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-medium">
                                  €{quota.quota_36_months.toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Plan Summary */}
                  <div className="bg-white rounded-lg p-4 border border-green-200">
                    <h4 className="font-semibold text-green-800 mb-2">📊 Settlement Plan Summary</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div className="text-center p-3 bg-green-100 rounded">
                        <p className="text-green-700 font-medium">Total Monthly Payment</p>
                        <p className="text-2xl font-bold text-green-800">€{clientData.settlement_plan.garnishment?.garnishableAmount?.toFixed(2) || '0.00'}</p>
                      </div>
                      <div className="text-center p-3 bg-blue-100 rounded">
                        <p className="text-blue-700 font-medium">Plan Duration</p>
                        <p className="text-2xl font-bold text-blue-800">36 months</p>
                      </div>
                      <div className="text-center p-3 bg-purple-100 rounded">
                        <p className="text-purple-700 font-medium">Total Payments</p>
                        <p className="text-2xl font-bold text-purple-800">€{((clientData.settlement_plan.garnishment?.garnishableAmount || 0) * 36).toFixed(2)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-gray-500 text-center">
                    Calculation generated on {new Date(clientData.settlement_plan.analysis_date).toLocaleString('de-DE')} | Based on German garnishment tables 2025-2026
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-red-600 font-medium">Settlement Plan Calculation Error</p>
                  <p className="text-sm text-gray-600">
                    {clientData.settlement_plan?.error || 'Unknown error occurred'}
                  </p>
                  <details className="mt-2 text-xs text-gray-500">
                    <summary className="cursor-pointer">Debug Info</summary>
                    <pre className="mt-1 text-left bg-gray-100 p-2 rounded text-xs overflow-auto">
                      {JSON.stringify(clientData.settlement_plan, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
            </div>
          )}

          {/* Phase 2: DOCX Template Plan Generation & Sending */}
          <div className="bg-purple-50 rounded-lg p-6 border border-purple-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <DocumentArrowDownIcon className="w-6 h-6 mr-2 text-purple-600" />
                <h3 className="text-lg font-semibold text-purple-800">Phase 2: Quotenplan-Dokumente (DOCX)</h3>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3 mb-4">
              <button
                onClick={generatePhase2Plan}
                disabled={generatingPhase2}
                className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {generatingPhase2 ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Generating...
                  </>
                ) : (
                  <>
                    <DocumentArrowDownIcon className="w-4 h-4 mr-2" />
                    Generate DOCX Plans
                  </>
                )}
              </button>

              <button
                onClick={sendPhase2Plan}
                disabled={sendingPhase2}
                className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {sendingPhase2 ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <CheckCircleIcon className="w-4 h-4 mr-2" />
                    Send to Creditors (Resend)
                  </>
                )}
              </button>
            </div>

            {/* Generation Result */}
            {phase2Result && (
              <div className="bg-white rounded-lg p-4 border mb-4">
                <h4 className="font-semibold text-gray-900 mb-2">Generation Result</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-gray-600">Plan Type</p>
                    <p className="font-bold capitalize">{phase2Result.plan_type}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Documents</p>
                    <p className="font-bold">{phase2Result.documents_generated || '?'}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Status</p>
                    <p className="font-bold text-green-600">{phase2Result.success ? 'Success' : 'Failed'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Send Result */}
            {phase2SendResult && (
              <div className="bg-white rounded-lg p-4 border mb-4">
                <h4 className="font-semibold text-gray-900 mb-2">Send Result</h4>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-gray-600">Sent</p>
                    <p className="font-bold text-green-600">{phase2SendResult.sent || 0}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Failed</p>
                    <p className="font-bold text-red-600">{phase2SendResult.failed || 0}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">No Email</p>
                    <p className="font-bold text-yellow-600">{phase2SendResult.no_email || 0}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Creditor Preview Downloads */}
            {clientData && clientData.creditor_calculation_table.length > 0 && (
              <div className="bg-white rounded-lg border overflow-hidden">
                <div className="px-4 py-3 border-b bg-gray-50">
                  <h4 className="font-semibold text-gray-900">Preview Individual Documents</h4>
                </div>
                <div className="divide-y divide-gray-100">
                  {clientData.creditor_calculation_table.map((creditor, index) => (
                    <div key={creditor.id} className="flex items-center justify-between px-4 py-2">
                      <div className="text-sm">
                        <span className="text-gray-500 mr-2">{index + 1}.</span>
                        <span className="font-medium text-gray-900">{creditor.name}</span>
                        <span className="text-gray-500 ml-2">({creditor.email || 'no email'})</span>
                      </div>
                      <button
                        onClick={() => previewCreditorDocument(index)}
                        disabled={previewingCreditor === index}
                        className="inline-flex items-center px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
                      >
                        {previewingCreditor === index ? (
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-700 mr-1"></div>
                        ) : (
                          <DocumentArrowDownIcon className="w-3 h-3 mr-1" />
                        )}
                        Preview DOCX
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Phase 2 Response Status */}
            {phase2Status && phase2Status.sent_at && (
              <div className="mt-4 bg-white rounded-lg border overflow-hidden">
                <div className="px-4 py-3 border-b bg-gray-50">
                  <h4 className="font-semibold text-gray-900">
                    Response Status (Sent: {new Date(phase2Status.sent_at).toLocaleDateString('de-DE')})
                  </h4>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-5 gap-3 text-sm text-center mb-3">
                    <div className="bg-green-50 rounded p-2">
                      <p className="text-green-700 font-bold text-lg">{phase2Status.response_summary.accepted}</p>
                      <p className="text-green-600 text-xs">Accepted</p>
                    </div>
                    <div className="bg-red-50 rounded p-2">
                      <p className="text-red-700 font-bold text-lg">{phase2Status.response_summary.declined}</p>
                      <p className="text-red-600 text-xs">Declined</p>
                    </div>
                    <div className="bg-yellow-50 rounded p-2">
                      <p className="text-yellow-700 font-bold text-lg">{phase2Status.response_summary.counter_offer}</p>
                      <p className="text-yellow-600 text-xs">Counter</p>
                    </div>
                    <div className="bg-gray-50 rounded p-2">
                      <p className="text-gray-700 font-bold text-lg">{phase2Status.response_summary.no_response}</p>
                      <p className="text-gray-600 text-xs">No Response</p>
                    </div>
                    <div className="bg-blue-50 rounded p-2">
                      <p className="text-blue-700 font-bold text-lg">{phase2Status.response_summary.pending}</p>
                      <p className="text-blue-600 text-xs">Pending</p>
                    </div>
                  </div>
                  <div className="text-sm text-gray-600 text-center">
                    Days remaining: <span className="font-bold">{phase2Status.days_remaining}</span> / {phase2Status.timeout_days}
                    {' | '}Acceptance rate: <span className="font-bold">{phase2Status.response_summary.acceptance_rate}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 rounded-lg p-4 border border-red-200">
              <div className="flex items-center">
                <ExclamationTriangleIcon className="w-5 h-5 text-red-400 mr-2" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SchuldenbereinigungsplanView;