import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type PageStatus = 'loading' | 'form' | 'already_submitted' | 'unavailable' | 'success' | 'error';

interface NewCreditor {
  name: string;
  amount: string;
}

interface FormData {
  monthly_net_income: string;
  income_source: string;
  marital_status: string;
  number_of_dependents: string;
  active_garnishments: boolean;
  has_new_creditors: boolean;
  new_creditors: NewCreditor[];
  confirmation: boolean;
}

interface FormErrors {
  monthly_net_income?: string;
  income_source?: string;
  marital_status?: string;
  number_of_dependents?: string;
  active_garnishments?: string;
  has_new_creditors?: string;
  new_creditors?: string;
  confirmation?: string;
  submit?: string;
  [key: string]: string | undefined;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INCOME_SOURCE_OPTIONS = [
  { value: '', label: 'Bitte wählen...' },
  { value: 'angestellt', label: 'Angestellt' },
  { value: 'selbststaendig', label: 'Selbstständig' },
  { value: 'arbeitslos', label: 'Arbeitslos' },
  { value: 'rentner', label: 'Rentner' },
  { value: 'in_ausbildung', label: 'In Ausbildung' },
];

const MARITAL_STATUS_OPTIONS = [
  { value: '', label: 'Bitte wählen...' },
  { value: 'ledig', label: 'Ledig' },
  { value: 'verheiratet', label: 'Verheiratet' },
  { value: 'geschieden', label: 'Geschieden' },
  { value: 'verwitwet', label: 'Verwitwet' },
];

const EMPTY_CREDITOR: NewCreditor = { name: '', amount: '' };

const DEFAULT_FORM_DATA: FormData = {
  monthly_net_income: '',
  income_source: '',
  marital_status: '',
  number_of_dependents: '0',
  active_garnishments: false,
  has_new_creditors: false,
  new_creditors: [{ ...EMPTY_CREDITOR }],
  confirmation: false,
};

// ─── Component ────────────────────────────────────────────────────────────────

const SecondLetterForm: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<PageStatus>('loading');
  const [formData, setFormData] = useState<FormData>(DEFAULT_FORM_DATA);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  // ─── Fetch pre-fill data on mount ───────────────────────────────────────────
  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }

    const fetchFormData = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/second-letter-form`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const { second_letter_status, second_letter_form_submitted_at, pre_fill } = response.data;

        if (second_letter_status === 'PENDING') {
          setFormData({
            monthly_net_income: pre_fill?.monthly_net_income !== null && pre_fill?.monthly_net_income !== undefined ? String(pre_fill.monthly_net_income) : '',
            income_source: pre_fill?.income_source ?? '',
            marital_status: pre_fill?.marital_status ?? '',
            number_of_dependents: pre_fill?.number_of_dependents !== null && pre_fill?.number_of_dependents !== undefined ? String(pre_fill.number_of_dependents) : '0',
            active_garnishments: pre_fill?.active_garnishments === true,
            has_new_creditors: false,
            new_creditors: [{ ...EMPTY_CREDITOR }],
            confirmation: false,
          });
          setStatus('form');
        } else if (second_letter_status === 'FORM_SUBMITTED' || second_letter_status === 'SENT') {
          setSubmittedAt(second_letter_form_submitted_at ?? null);
          setStatus('already_submitted');
        } else {
          // IDLE or any other status
          setStatus('unavailable');
        }
      } catch (error: any) {
        const httpStatus = error?.response?.status;
        if (httpStatus === 401 || httpStatus === 403) {
          setStatus('error');
        } else {
          setStatus('unavailable');
        }
      }
    };

    fetchFormData();
  }, [token]);

  // ─── Validation ─────────────────────────────────────────────────────────────

  const validateField = (fieldName: keyof FormData | string): string | undefined => {
    switch (fieldName) {
      case 'monthly_net_income': {
        const val = parseFloat(String(formData.monthly_net_income).replace(',', '.'));
        if (!formData.monthly_net_income) { return 'Monatliches Nettoeinkommen ist erforderlich'; }
        if (isNaN(val) || val <= 0) { return 'Bitte geben Sie einen gültigen Betrag ein (> 0)'; }
        return undefined;
      }
      case 'income_source':
        if (!formData.income_source) { return 'Einkommensquelle ist erforderlich'; }
        return undefined;
      case 'marital_status':
        if (!formData.marital_status) { return 'Familienstand ist erforderlich'; }
        return undefined;
      case 'number_of_dependents': {
        const val = parseInt(formData.number_of_dependents);
        if (formData.number_of_dependents === '' || isNaN(val) || val < 0) {
          return 'Anzahl Unterhaltspflichten muss 0 oder höher sein';
        }
        return undefined;
      }
      case 'confirmation':
        if (!formData.confirmation) { return 'Bitte bestätigen Sie die Richtigkeit Ihrer Angaben'; }
        return undefined;
      default:
        return undefined;
    }
  };

  const validateForm = (): FormErrors => {
    const newErrors: FormErrors = {};

    const fieldsToValidate: Array<keyof FormData> = [
      'monthly_net_income',
      'income_source',
      'marital_status',
      'number_of_dependents',
      'confirmation',
    ];

    for (const field of fieldsToValidate) {
      const err = validateField(field);
      if (err) { newErrors[field] = err; }
    }

    // Validate new creditors if toggle is on
    if (formData.has_new_creditors) {
      if (formData.new_creditors.length === 0) {
        newErrors.new_creditors = 'Mindestens ein Gläubiger ist erforderlich';
      } else {
        formData.new_creditors.forEach((cred, i) => {
          if (!cred.name.trim()) {
            newErrors[`new_creditor_name_${i}`] = 'Gläubiger Name ist erforderlich';
          }
          const amt = parseFloat(cred.amount);
          if (!cred.amount || isNaN(amt) || amt <= 0) {
            newErrors[`new_creditor_amount_${i}`] = 'Betrag muss größer als 0 sein';
          }
        });
      }
    }

    return newErrors;
  };

  const handleBlur = (field: keyof FormData) => {
    const err = validateField(field);
    setErrors(prev => ({ ...prev, [field]: err }));
  };

  // ─── Field updaters ─────────────────────────────────────────────────────────

  const updateField = (field: keyof FormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const updateCreditor = (index: number, field: keyof NewCreditor, value: string) => {
    const updated = formData.new_creditors.map((c, i) =>
      i === index ? { ...c, [field]: value } : c
    );
    setFormData(prev => ({ ...prev, new_creditors: updated }));
    setErrors(prev => ({ ...prev, [`new_creditor_${field}_${index}`]: undefined }));
  };

  const addCreditor = () => {
    setFormData(prev => ({
      ...prev,
      new_creditors: [...prev.new_creditors, { ...EMPTY_CREDITOR }],
    }));
  };

  const removeCreditor = (index: number) => {
    setFormData(prev => ({
      ...prev,
      new_creditors: prev.new_creditors.filter((_, i) => i !== index),
    }));
  };

  // ─── Submit flow ─────────────────────────────────────────────────────────────

  const handleSubmitClick = (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setShowConfirmDialog(true);
  };

  const handleConfirmSubmit = async () => {
    setShowConfirmDialog(false);
    setIsSubmitting(true);
    setErrors(prev => ({ ...prev, submit: undefined }));

    const payload = {
      monthly_net_income: parseFloat(String(formData.monthly_net_income).replace(',', '.')),
      income_source: formData.income_source,
      marital_status: formData.marital_status,
      number_of_dependents: parseInt(formData.number_of_dependents),
      active_garnishments: formData.active_garnishments,
      has_new_creditors: formData.has_new_creditors,
      new_creditors: formData.has_new_creditors
        ? formData.new_creditors.map(c => ({ name: c.name.trim(), amount: parseFloat(c.amount) }))
        : [],
      confirmation: formData.confirmation,
    };

    try {
      const response = await axios.post(`${API_BASE_URL}/api/second-letter-form`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data.success) {
        setStatus('success');
      } else {
        setErrors({ submit: 'Es ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.' });
        setIsSubmitting(false);
      }
    } catch (error: any) {
      const httpStatus = error?.response?.status;
      if (httpStatus === 409) {
        setStatus('already_submitted');
      } else {
        setErrors({ submit: 'Es ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.' });
        setIsSubmitting(false);
      }
    }
  };

  // ─── Shared branding header ──────────────────────────────────────────────────

  const BrandingHeader = () => (
    <div className="text-center mb-8">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-50 mb-4">
        <svg className="w-6 h-6 text-red-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      </div>
      <h1 className="text-xl font-bold text-gray-900">Schuldenanalyse24</h1>
      <p className="text-sm text-gray-500 mt-1">Rechtsanwälte · Schuldnerberatung</p>
    </div>
  );

  // ─── Loading state ──────────────────────────────────────────────────────────

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 text-gray-400 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg"
            fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-gray-500">Formular wird geladen...</p>
        </div>
      </div>
    );
  }

  // ─── Error state (no token / auth error) ────────────────────────────────────

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-lg w-full bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <BrandingHeader />
          <div className="w-12 h-12 mx-auto rounded-full bg-red-100 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Link ungültig</h2>
          <p className="text-gray-600 text-sm">
            Ein Fehler ist aufgetreten. Bitte verwenden Sie den Link aus Ihrer E-Mail.
          </p>
        </div>
      </div>
    );
  }

  // ─── Already submitted state ─────────────────────────────────────────────────

  if (status === 'already_submitted') {
    const dateStr = submittedAt
      ? new Date(submittedAt).toLocaleDateString('de-DE')
      : 'unbekanntem Datum';

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-lg w-full bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <BrandingHeader />
          <div className="w-12 h-12 mx-auto rounded-full bg-blue-100 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Bereits eingereicht</h2>
          <p className="text-gray-600 text-sm">
            Ihre Daten wurden am <strong>{dateStr}</strong> eingereicht. Sie können dieses Fenster nun
            schließen.
          </p>
        </div>
      </div>
    );
  }

  // ─── Unavailable state ───────────────────────────────────────────────────────

  if (status === 'unavailable') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-lg w-full bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <BrandingHeader />
          <div className="w-12 h-12 mx-auto rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Formular nicht verfügbar</h2>
          <p className="text-gray-600 text-sm">
            Dieses Formular ist derzeit nicht verfügbar. Bei Fragen wenden Sie sich bitte an unsere Kanzlei.
          </p>
        </div>
      </div>
    );
  }

  // ─── Success state ───────────────────────────────────────────────────────────

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-lg w-full bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <BrandingHeader />
          <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-6">
            <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd"
                d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z"
                clipRule="evenodd" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-3">Vielen Dank!</h2>
          <p className="text-gray-600 text-sm">
            Ihre Finanzdaten wurden erfolgreich eingereicht. Sie können dieses Fenster nun schließen.
          </p>
        </div>
      </div>
    );
  }

  // ─── Helper for input className ─────────────────────────────────────────────

  const inputClass = (hasError: boolean) =>
    `w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
      hasError
        ? 'border-red-500 focus:ring-red-200'
        : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'
    }`;

  // ─── Form state (main render) ────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className={`max-w-lg mx-auto ${isSubmitting ? 'pointer-events-none opacity-50' : ''}`}>

        {/* Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 md:p-8">

          {/* Branding */}
          <BrandingHeader />
          <p className="text-sm text-gray-600 text-center mb-8 -mt-4">
            Bitte überprüfen und bestätigen Sie Ihre aktuellen Finanzdaten für das 2. Gläubigeranschreiben.
          </p>

          {/* Global submit error */}
          {errors.submit && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
              <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-sm text-red-700">{errors.submit}</p>
            </div>
          )}

          <form onSubmit={handleSubmitClick} noValidate className="space-y-8">

            {/* ── Section 1: Einkommensdaten ─────────────────────────────── */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Einkommensdaten</h2>
              <div className="space-y-4">

                {/* Monthly net income */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="monthly_net_income">
                    Monatliches Nettoeinkommen <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="monthly_net_income"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.monthly_net_income}
                      onChange={e => updateField('monthly_net_income', e.target.value)}
                      onBlur={() => handleBlur('monthly_net_income')}
                      placeholder="z.B. 2500"
                      className={`${inputClass(!!errors.monthly_net_income)} pr-8`}
                      disabled={isSubmitting}
                    />
                    <span className="absolute inset-y-0 right-3 flex items-center text-gray-400 text-sm pointer-events-none">
                      €
                    </span>
                  </div>
                  {errors.monthly_net_income && (
                    <p className="mt-1 text-sm text-red-600">{errors.monthly_net_income}</p>
                  )}
                </div>

                {/* Income source */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="income_source">
                    Einkommensquelle <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="income_source"
                    value={formData.income_source}
                    onChange={e => updateField('income_source', e.target.value)}
                    onBlur={() => handleBlur('income_source')}
                    className={inputClass(!!errors.income_source)}
                    disabled={isSubmitting}
                  >
                    {INCOME_SOURCE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  {errors.income_source && (
                    <p className="mt-1 text-sm text-red-600">{errors.income_source}</p>
                  )}
                </div>

              </div>
            </section>

            {/* ── Section 2: Persönliche Daten ──────────────────────────── */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Persönliche Daten</h2>
              <div className="space-y-4">

                {/* Marital status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="marital_status">
                    Familienstand <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="marital_status"
                    value={formData.marital_status}
                    onChange={e => updateField('marital_status', e.target.value)}
                    onBlur={() => handleBlur('marital_status')}
                    className={inputClass(!!errors.marital_status)}
                    disabled={isSubmitting}
                  >
                    {MARITAL_STATUS_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  {errors.marital_status && (
                    <p className="mt-1 text-sm text-red-600">{errors.marital_status}</p>
                  )}
                </div>

                {/* Number of dependents */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="number_of_dependents">
                    Anzahl Unterhaltspflichten <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="number_of_dependents"
                    type="number"
                    min="0"
                    step="1"
                    value={formData.number_of_dependents}
                    onChange={e => updateField('number_of_dependents', e.target.value)}
                    onBlur={() => handleBlur('number_of_dependents')}
                    placeholder="0"
                    className={inputClass(!!errors.number_of_dependents)}
                    disabled={isSubmitting}
                  />
                  {errors.number_of_dependents && (
                    <p className="mt-1 text-sm text-red-600">{errors.number_of_dependents}</p>
                  )}
                </div>

              </div>
            </section>

            {/* ── Section 3: Weitere Angaben ────────────────────────────── */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Weitere Angaben</h2>
              <div className="space-y-5">

                {/* Active garnishments toggle */}
                <div className="flex items-center justify-between py-3 border border-gray-200 rounded-md px-4">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Aktuelle Lohnpfändungen</p>
                    <p className="text-xs text-gray-500 mt-0.5">Bestehen derzeit aktive Pfändungen Ihres Lohns?</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateField('active_garnishments', !formData.active_garnishments)}
                    disabled={isSubmitting}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      formData.active_garnishments ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                    aria-checked={formData.active_garnishments}
                    role="switch"
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-150 ${
                        formData.active_garnishments ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* New creditors toggle */}
                <div>
                  <div className="flex items-center justify-between py-3 border border-gray-200 rounded-md px-4">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Neue Gläubiger hinzugekommen?</p>
                      <p className="text-xs text-gray-500 mt-0.5">Sind seit dem letzten Schreiben neue Gläubiger dazugekommen?</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateField('has_new_creditors', !formData.has_new_creditors)}
                      disabled={isSubmitting}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                        formData.has_new_creditors ? 'bg-blue-600' : 'bg-gray-300'
                      }`}
                      aria-checked={formData.has_new_creditors}
                      role="switch"
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-150 ${
                          formData.has_new_creditors ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Animated new creditors container */}
                  <div
                    className="overflow-hidden transition-all duration-200"
                    style={{ maxHeight: formData.has_new_creditors ? '600px' : '0px' }}
                  >
                    <div className="mt-4 space-y-4 border border-gray-200 rounded-md p-4 bg-gray-50">
                      <p className="text-sm font-medium text-gray-700">Neue Gläubiger</p>

                      {errors.new_creditors && (
                        <p className="text-sm text-red-600">{errors.new_creditors}</p>
                      )}

                      {formData.new_creditors.map((cred, i) => (
                        <div key={i} className="space-y-3 border border-gray-200 rounded-md p-3 bg-white relative">
                          {i > 0 && (
                            <button
                              type="button"
                              onClick={() => removeCreditor(i)}
                              disabled={isSubmitting}
                              className="absolute top-2 right-2 text-gray-400 hover:text-red-500 transition-colors"
                              aria-label="Gläubiger entfernen"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Gläubiger Name <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={cred.name}
                              onChange={e => updateCreditor(i, 'name', e.target.value)}
                              placeholder="z.B. Telekom AG"
                              className={inputClass(!!errors[`new_creditor_name_${i}`])}
                              disabled={isSubmitting}
                            />
                            {errors[`new_creditor_name_${i}`] && (
                              <p className="mt-1 text-sm text-red-600">{errors[`new_creditor_name_${i}`]}</p>
                            )}
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Forderungsbetrag (€) <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={cred.amount}
                                onChange={e => updateCreditor(i, 'amount', e.target.value)}
                                placeholder="z.B. 500"
                                className={`${inputClass(!!errors[`new_creditor_amount_${i}`])} pr-8`}
                                disabled={isSubmitting}
                              />
                              <span className="absolute inset-y-0 right-3 flex items-center text-gray-400 text-sm pointer-events-none">
                                €
                              </span>
                            </div>
                            {errors[`new_creditor_amount_${i}`] && (
                              <p className="mt-1 text-sm text-red-600">{errors[`new_creditor_amount_${i}`]}</p>
                            )}
                          </div>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={addCreditor}
                        disabled={isSubmitting}
                        className="w-full py-2 px-4 border border-dashed border-gray-300 rounded-md text-sm text-gray-600 hover:border-gray-400 hover:text-gray-700 transition-colors"
                      >
                        + Weiteren Gläubiger hinzufügen
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            </section>

            {/* ── Section 4: Bestätigung ────────────────────────────────── */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Bestätigung</h2>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.confirmation}
                  onChange={e => {
                    updateField('confirmation', e.target.checked);
                  }}
                  onBlur={() => handleBlur('confirmation')}
                  disabled={isSubmitting}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                  Ich bestätige, dass die obigen Angaben korrekt und vollständig sind.
                </span>
              </label>
              {errors.confirmation && (
                <p className="mt-2 text-sm text-red-600">{errors.confirmation}</p>
              )}
            </section>

            {/* ── Submit button ─────────────────────────────────────────── */}
            <button
              type="submit"
              disabled={isSubmitting || !formData.confirmation}
              className={`w-full py-3 px-6 rounded-md text-white font-semibold transition-colors duration-150 ${
                isSubmitting || !formData.confirmation
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-red-800 hover:bg-red-900'
              }`}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg"
                    fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Wird eingereicht...
                </span>
              ) : (
                'Daten einreichen'
              )}
            </button>

          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-6 pb-8">
          © 2025 T. Scuric Rechtsanwälte · Alle Rechte vorbehalten
        </p>
      </div>

      {/* ── Confirmation Dialog ──────────────────────────────────────────────── */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Daten einreichen?</h2>
            <p className="text-sm text-gray-600 mb-6">
              Ihre Daten können nach dem Absenden nicht mehr geändert werden. Möchten Sie fortfahren?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmDialog(false)}
                className="flex-1 py-2 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleConfirmSubmit}
                className="flex-1 py-2 px-4 rounded-md text-sm font-medium text-white bg-red-800 hover:bg-red-900 transition-colors"
              >
                Bestätigen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SecondLetterForm;
