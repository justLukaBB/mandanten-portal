import React, { useState } from 'react';
import { CurrencyEuroIcon, UserGroupIcon, HeartIcon, CheckIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import api from '../config/api';

interface FinancialDataFormProps {
  clientId: string;
  onFormSubmitted: (data: any) => void;
  customColors?: {
    primary: string;
    primaryHover: string;
  };
}

interface FormData {
  monthly_net_income: string;
  number_of_children: string;
  marital_status: string;
}

interface FormErrors {
  monthly_net_income?: string;
  number_of_children?: string;
  marital_status?: string;
  submit?: string;
}

const FinancialDataForm: React.FC<FinancialDataFormProps> = ({ 
  clientId, 
  onFormSubmitted,
  customColors = {
    primary: '#9f1a1d',
    primaryHover: '#7d1517'
  }
}) => {
  const [formData, setFormData] = useState<FormData>({
    monthly_net_income: '',
    number_of_children: '0',
    marital_status: ''
  });
  
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const maritalStatusOptions = [
    { value: '', label: 'Bitte wählen Sie...' },
    { value: 'ledig', label: 'Ledig' },
    { value: 'verheiratet', label: 'Verheiratet' },
    { value: 'geschieden', label: 'Geschieden' },
    { value: 'verwitwet', label: 'Verwitwet' },
    { value: 'getrennt_lebend', label: 'Getrennt lebend' }
  ];

  const validateForm = (): FormErrors => {
    const newErrors: FormErrors = {};

    // Validate monthly net income
    if (!formData.monthly_net_income) {
      newErrors.monthly_net_income = 'Monatliches Nettoeinkommen ist erforderlich';
    } else {
      const income = parseFloat(formData.monthly_net_income.replace(',', '.'));
      if (isNaN(income) || income < 0) {
        newErrors.monthly_net_income = 'Bitte geben Sie einen gültigen Betrag ein';
      } else if (income > 50000) {
        newErrors.monthly_net_income = 'Bitte prüfen Sie den eingegebenen Betrag';
      }
    }

    // Validate number of children
    if (!formData.number_of_children) {
      newErrors.number_of_children = 'Anzahl der Kinder ist erforderlich';
    } else {
      const children = parseInt(formData.number_of_children);
      if (isNaN(children) || children < 0 || children > 20) {
        newErrors.number_of_children = 'Bitte geben Sie eine gültige Anzahl ein (0-20)';
      }
    }

    // Validate marital status
    if (!formData.marital_status) {
      newErrors.marital_status = 'Familienstand ist erforderlich';
    }

    return newErrors;
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: undefined
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      // Convert form data to proper types
      const submitData = {
        monthly_net_income: parseFloat(formData.monthly_net_income.replace(',', '.')),
        number_of_children: parseInt(formData.number_of_children),
        marital_status: formData.marital_status
      };

      // Submit to backend
      const response = await api.post(`/api/clients/${clientId}/financial-data`, submitData);
      
      if (response.data.success) {
        setSubmitted(true);
        onFormSubmitted(response.data);
      } else {
        setErrors({
          submit: response.data.error || 'Fehler beim Speichern der Daten'
        });
      }
    } catch (error: any) {
      console.error('Error submitting financial data:', error);
      console.error('Error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        headers: error.response?.headers
      });
      // Log the response data separately for better visibility
      if (error.response?.data) {
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      }
      setErrors({
        submit: error.response?.data?.error || 'Fehler beim Speichern der Daten. Bitte versuchen Sie es erneut.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      // Reset client data on backend
      const response = await api.post(`/api/clients/${clientId}/reset-financial-data`);
      
      if (response.data.success) {
        // Reset local state
        setSubmitted(false);
        setFormData({
          monthly_net_income: '',
          number_of_children: '0',
          marital_status: ''
        });
        setErrors({});
        console.log('✅ Client data reset successfully');
      } else {
        console.error('❌ Failed to reset client data:', response.data.error);
        setErrors({
          submit: 'Fehler beim Zurücksetzen der Daten'
        });
      }
    } catch (error: any) {
      console.error('❌ Error resetting client data:', error);
      setErrors({
        submit: 'Fehler beim Zurücksetzen der Daten'
      });
    } finally {
      setIsResetting(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="text-center">
          <div className="mb-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-green-100 flex items-center justify-center">
              <CheckIcon className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Finanzdaten erfolgreich übermittelt
          </h3>
          <p className="text-gray-600 mb-6">
            Vielen Dank! Ihre Finanzdaten wurden erfolgreich gespeichert.
          </p>
          
          {/* Development Reset Button */}
          <button
            onClick={handleReset}
            disabled={isResetting}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {isResetting ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-gray-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Zurücksetzen...
              </>
            ) : (
              '🔄 Daten zurücksetzen (Test)'
            )}
          </button>
          
          {errors.submit && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{errors.submit}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="mb-6">
        <div className="flex items-center mb-2">
          <CurrencyEuroIcon className="w-6 h-6 mr-2" style={{ color: customColors.primary }} />
          <h3 className="text-lg font-semibold text-gray-900">
            Finanzdaten für Ihren Schuldenbereinigungsplan
          </h3>
        </div>
        <p className="text-gray-600 text-sm">
          Bitte geben Sie Ihre aktuellen Finanzdaten an. Diese Informationen werden zur Berechnung Ihres 
          individuellen Schuldenbereinigungsplans nach der aktuellen Pfändungstabelle benötigt.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Monthly Net Income */}
        <div>
          <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
            <CurrencyEuroIcon className="w-4 h-4 mr-1" />
            Monatliches Nettoeinkommen
          </label>
          <div className="relative">
            <input
              type="text"
              value={formData.monthly_net_income}
              onChange={(e) => handleInputChange('monthly_net_income', e.target.value)}
              placeholder="z.B. 2.500,00"
              className={`w-full border rounded-lg px-3 py-2 text-sm pr-8 ${
                errors.monthly_net_income 
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-200' 
                  : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'
              } focus:outline-none focus:ring-2`}
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <span className="text-gray-400 text-sm">€</span>
            </div>
          </div>
          {errors.monthly_net_income && (
            <p className="mt-1 text-sm text-red-600">{errors.monthly_net_income}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Ihr Nettoeinkommen nach Abzug aller Steuern und Sozialversicherungsbeiträge
          </p>
        </div>

        {/* Number of Children */}
        <div>
          <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
            <UserGroupIcon className="w-4 h-4 mr-1" />
            Anzahl der Kinder
          </label>
          <select
            value={formData.number_of_children}
            onChange={(e) => handleInputChange('number_of_children', e.target.value)}
            className={`w-full border rounded-lg px-3 py-2 text-sm ${
              errors.number_of_children 
                ? 'border-red-300 focus:border-red-500 focus:ring-red-200' 
                : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'
            } focus:outline-none focus:ring-2`}
          >
            {Array.from({ length: 11 }, (_, i) => (
              <option key={i} value={i.toString()}>
                {i === 0 ? 'Keine Kinder' : i === 1 ? '1 Kind' : `${i} Kinder`}
              </option>
            ))}
          </select>
          {errors.number_of_children && (
            <p className="mt-1 text-sm text-red-600">{errors.number_of_children}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Anzahl der unterhaltspflichtigen Kinder (relevant für die Pfändungsfreigrenze)
          </p>
        </div>

        {/* Marital Status */}
        <div>
          <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
            <HeartIcon className="w-4 h-4 mr-1" />
            Familienstand
          </label>
          <select
            value={formData.marital_status}
            onChange={(e) => handleInputChange('marital_status', e.target.value)}
            className={`w-full border rounded-lg px-3 py-2 text-sm ${
              errors.marital_status 
                ? 'border-red-300 focus:border-red-500 focus:ring-red-200' 
                : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'
            } focus:outline-none focus:ring-2`}
          >
            {maritalStatusOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {errors.marital_status && (
            <p className="mt-1 text-sm text-red-600">{errors.marital_status}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Ihr aktueller Familienstand (beeinflusst die Berechnung der Pfändungsfreigrenze)
          </p>
        </div>

        {/* Submit Error */}
        {errors.submit && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <ExclamationTriangleIcon className="w-5 h-5 text-red-600 mr-2" />
              <p className="text-sm text-red-700">{errors.submit}</p>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          className={`w-full py-3 px-4 rounded-lg text-white font-medium transition-colors ${
            isSubmitting
              ? 'bg-gray-400 cursor-not-allowed'
              : 'hover:opacity-90'
          }`}
          style={{
            backgroundColor: isSubmitting ? undefined : customColors.primary,
          }}
        >
          {isSubmitting ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Wird gespeichert...
            </div>
          ) : (
            'Finanzdaten speichern'
          )}
        </button>
      </form>

      {/* Info Box */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <ExclamationTriangleIcon className="w-5 h-5 text-blue-600 mt-0.5 mr-2" />
          <div className="text-sm">
            <p className="font-medium text-blue-800 mb-1">Datenschutz & Sicherheit</p>
            <p className="text-blue-700">
              Ihre Finanzdaten werden verschlüsselt übertragen und nur für die Berechnung Ihres 
              Schuldenbereinigungsplans verwendet. Die Daten werden gemäß DSGVO verarbeitet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinancialDataForm;