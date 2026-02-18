import React, { useState, useEffect } from 'react';
import {
  BriefcaseIcon,
  CurrencyEuroIcon,
  HomeIcon,
  ShieldCheckIcon,
  AdjustmentsHorizontalIcon,
  CheckIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import api from '../config/api';

interface ExtendedFinancialDataWizardProps {
  clientId: string;
  onFormSubmitted: (data: any) => void;
  customColors?: {
    primary: string;
    primaryHover: string;
  };
}

interface FormData {
  // Step 1: Persoenliches
  berufsstatus: string;
  arbeitgeber_name: string;
  arbeitgeber_adresse: string;
  anzahl_unterhaltsberechtigte: string;

  // Step 2: Einkommen
  sonstige_monatliche_einkuenfte_betrag: string;
  sonstige_monatliche_einkuenfte_beschreibung: string;
  sozialleistungen_betrag: string;
  sozialleistungen_art: string;

  // Step 3: Vermoegen
  immobilieneigentum_vorhanden: boolean;
  immobilieneigentum_beschreibung: string;
  fahrzeuge_vorhanden: boolean;
  fahrzeuge_beschreibung: string;
  fahrzeuge_wert: string;
  sparkonten_vorhanden: boolean;
  sparkonten_wert: string;
  lebensversicherungen_vorhanden: boolean;
  lebensversicherungen_rueckkaufswert: string;
  sonstiges_vermoegen: string;

  // Step 4: Sicherheiten
  buergschaften_vorhanden: boolean;
  buergschaften_details: string;
  pfandrechte_vorhanden: boolean;
  pfandrechte_details: string;
  sonstige_sicherheiten_vorhanden: boolean;
  sonstige_sicherheiten_details: string;

  // Step 5: Plan-Parameter
  gewuenschte_planlaufzeit: string;
  drittmittel_verfuegbar: boolean;
  drittmittel_betrag: string;
  bevorzugter_plantyp: string;
}

interface FormErrors {
  [key: string]: string | undefined;
}

const STEPS = [
  { title: 'Persönliches', icon: BriefcaseIcon, label: 'Persönliches' },
  { title: 'Einkommen', icon: CurrencyEuroIcon, label: 'Einkommen' },
  { title: 'Vermögen', icon: HomeIcon, label: 'Vermögen' },
  { title: 'Sicherheiten', icon: ShieldCheckIcon, label: 'Sicherheiten' },
  { title: 'Plan-Parameter', icon: AdjustmentsHorizontalIcon, label: 'Plandetails' },
];

const berufsstatus_options = [
  { value: '', label: 'Bitte wählen...' },
  { value: 'angestellt', label: 'Angestellt' },
  { value: 'selbststaendig', label: 'Selbständig' },
  { value: 'arbeitslos', label: 'Arbeitslos' },
  { value: 'rentner', label: 'Rentner/in' },
  { value: 'in_ausbildung', label: 'In Ausbildung' },
];

const planlaufzeit_options = [
  { value: '36', label: '36 Monate (3 Jahre)' },
  { value: '48', label: '48 Monate (4 Jahre)' },
  { value: '60', label: '60 Monate (5 Jahre)' },
];

const plantyp_options = [
  { value: '', label: 'Keine Präferenz (automatisch)' },
  { value: 'ratenzahlung', label: 'Ratenzahlung' },
  { value: 'einmalzahlung', label: 'Einmalzahlung' },
  { value: 'nullplan', label: 'Nullplan' },
];

const ExtendedFinancialDataWizard: React.FC<ExtendedFinancialDataWizardProps> = ({
  clientId,
  onFormSubmitted,
  customColors = { primary: '#9f1a1d', primaryHover: '#7d1517' },
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<FormData>({
    berufsstatus: '',
    arbeitgeber_name: '',
    arbeitgeber_adresse: '',
    anzahl_unterhaltsberechtigte: '0',
    sonstige_monatliche_einkuenfte_betrag: '',
    sonstige_monatliche_einkuenfte_beschreibung: '',
    sozialleistungen_betrag: '',
    sozialleistungen_art: '',
    immobilieneigentum_vorhanden: false,
    immobilieneigentum_beschreibung: '',
    fahrzeuge_vorhanden: false,
    fahrzeuge_beschreibung: '',
    fahrzeuge_wert: '',
    sparkonten_vorhanden: false,
    sparkonten_wert: '',
    lebensversicherungen_vorhanden: false,
    lebensversicherungen_rueckkaufswert: '',
    sonstiges_vermoegen: '',
    buergschaften_vorhanden: false,
    buergschaften_details: '',
    pfandrechte_vorhanden: false,
    pfandrechte_details: '',
    sonstige_sicherheiten_vorhanden: false,
    sonstige_sicherheiten_details: '',
    gewuenschte_planlaufzeit: '36',
    drittmittel_verfuegbar: false,
    drittmittel_betrag: '',
    bevorzugter_plantyp: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitResult, setSubmitResult] = useState<any>(null);
  const [prefillLoading, setPrefillLoading] = useState(true);

  // Prefill: Load saved extended financial data on mount
  useEffect(() => {
    const loadSavedData = async () => {
      try {
        const response = await api.get(`/api/clients/${clientId}/financial-data-extended`);
        if (response.data.success && response.data.has_extended_data && response.data.extended_financial_data) {
          const saved = response.data.extended_financial_data;
          setFormData((prev) => ({
            ...prev,
            berufsstatus: saved.berufsstatus || '',
            arbeitgeber_name: saved.arbeitgeber_name || '',
            arbeitgeber_adresse: saved.arbeitgeber_adresse || '',
            anzahl_unterhaltsberechtigte: String(saved.anzahl_unterhaltsberechtigte ?? 0),
            sonstige_monatliche_einkuenfte_betrag: saved.sonstige_monatliche_einkuenfte?.betrag ? String(saved.sonstige_monatliche_einkuenfte.betrag) : '',
            sonstige_monatliche_einkuenfte_beschreibung: saved.sonstige_monatliche_einkuenfte?.beschreibung || '',
            sozialleistungen_betrag: saved.sozialleistungen?.betrag ? String(saved.sozialleistungen.betrag) : '',
            sozialleistungen_art: saved.sozialleistungen?.art_der_leistung || '',
            immobilieneigentum_vorhanden: saved.immobilieneigentum?.vorhanden || false,
            immobilieneigentum_beschreibung: saved.immobilieneigentum?.beschreibung || '',
            fahrzeuge_vorhanden: saved.fahrzeuge?.vorhanden || false,
            fahrzeuge_beschreibung: saved.fahrzeuge?.beschreibung || '',
            fahrzeuge_wert: saved.fahrzeuge?.geschaetzter_wert ? String(saved.fahrzeuge.geschaetzter_wert) : '',
            sparkonten_vorhanden: saved.sparkonten?.vorhanden || false,
            sparkonten_wert: saved.sparkonten?.ungefaehrer_wert ? String(saved.sparkonten.ungefaehrer_wert) : '',
            lebensversicherungen_vorhanden: saved.lebensversicherungen?.vorhanden || false,
            lebensversicherungen_rueckkaufswert: saved.lebensversicherungen?.rueckkaufswert ? String(saved.lebensversicherungen.rueckkaufswert) : '',
            sonstiges_vermoegen: saved.sonstiges_vermoegen || '',
            buergschaften_vorhanden: saved.buergschaften?.vorhanden || false,
            buergschaften_details: saved.buergschaften?.details || '',
            pfandrechte_vorhanden: saved.pfandrechte?.vorhanden || false,
            pfandrechte_details: saved.pfandrechte?.details || '',
            sonstige_sicherheiten_vorhanden: saved.sonstige_sicherheiten?.vorhanden || false,
            sonstige_sicherheiten_details: saved.sonstige_sicherheiten?.details || '',
            gewuenschte_planlaufzeit: String(saved.gewuenschte_planlaufzeit || 36),
            drittmittel_verfuegbar: saved.drittmittel?.verfuegbar || false,
            drittmittel_betrag: saved.drittmittel?.betrag ? String(saved.drittmittel.betrag) : '',
            bevorzugter_plantyp: saved.bevorzugter_plantyp || '',
          }));
        }
      } catch (err) {
        // Silently ignore — wizard starts with empty defaults
        console.log('No saved extended financial data found, starting fresh');
      } finally {
        setPrefillLoading(false);
      }
    };
    loadSavedData();
  }, [clientId]);

  const handleChange = (field: keyof FormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const validateStep = (step: number): FormErrors => {
    const newErrors: FormErrors = {};
    if (step === 0) {
      if (!formData.berufsstatus) {
        newErrors.berufsstatus = 'Berufsstatus ist erforderlich';
      }
      if (formData.berufsstatus === 'angestellt' && !formData.arbeitgeber_name) {
        newErrors.arbeitgeber_name = 'Arbeitgebername ist bei Angestellten erforderlich';
      }
    }
    if (step === 4) {
      if (formData.drittmittel_verfuegbar) {
        const betrag = parseFloat(formData.drittmittel_betrag.replace(',', '.'));
        if (!formData.drittmittel_betrag || isNaN(betrag) || betrag <= 0) {
          newErrors.drittmittel_betrag = 'Bitte geben Sie den Drittmittel-Betrag ein';
        }
      }
    }
    return newErrors;
  };

  const goNext = () => {
    const stepErrors = validateStep(currentStep);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }
    setErrors({});
    setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  const goBack = () => {
    setErrors({});
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const buildSubmitPayload = () => {
    return {
      berufsstatus: formData.berufsstatus,
      arbeitgeber_name: formData.arbeitgeber_name || undefined,
      arbeitgeber_adresse: formData.arbeitgeber_adresse || undefined,
      anzahl_unterhaltsberechtigte: parseInt(formData.anzahl_unterhaltsberechtigte) || 0,
      sonstige_monatliche_einkuenfte: {
        betrag: parseFloat(formData.sonstige_monatliche_einkuenfte_betrag.replace(',', '.')) || 0,
        beschreibung: formData.sonstige_monatliche_einkuenfte_beschreibung || undefined,
      },
      sozialleistungen: {
        betrag: parseFloat(formData.sozialleistungen_betrag.replace(',', '.')) || 0,
        art_der_leistung: formData.sozialleistungen_art || undefined,
      },
      immobilieneigentum: {
        vorhanden: formData.immobilieneigentum_vorhanden,
        beschreibung: formData.immobilieneigentum_beschreibung || undefined,
      },
      fahrzeuge: {
        vorhanden: formData.fahrzeuge_vorhanden,
        beschreibung: formData.fahrzeuge_beschreibung || undefined,
        geschaetzter_wert: parseFloat(formData.fahrzeuge_wert.replace(',', '.')) || undefined,
      },
      sparkonten: {
        vorhanden: formData.sparkonten_vorhanden,
        ungefaehrer_wert: parseFloat(formData.sparkonten_wert.replace(',', '.')) || undefined,
      },
      lebensversicherungen: {
        vorhanden: formData.lebensversicherungen_vorhanden,
        rueckkaufswert: parseFloat(formData.lebensversicherungen_rueckkaufswert.replace(',', '.')) || undefined,
      },
      sonstiges_vermoegen: formData.sonstiges_vermoegen || undefined,
      buergschaften: {
        vorhanden: formData.buergschaften_vorhanden,
        details: formData.buergschaften_details || undefined,
      },
      pfandrechte: {
        vorhanden: formData.pfandrechte_vorhanden,
        details: formData.pfandrechte_details || undefined,
      },
      sonstige_sicherheiten: {
        vorhanden: formData.sonstige_sicherheiten_vorhanden,
        details: formData.sonstige_sicherheiten_details || undefined,
      },
      gewuenschte_planlaufzeit: parseInt(formData.gewuenschte_planlaufzeit),
      drittmittel: {
        verfuegbar: formData.drittmittel_verfuegbar,
        betrag: formData.drittmittel_verfuegbar
          ? parseFloat(formData.drittmittel_betrag.replace(',', '.')) || 0
          : undefined,
      },
      bevorzugter_plantyp: formData.bevorzugter_plantyp || undefined,
    };
  };

  const handleSubmit = async () => {
    const stepErrors = validateStep(currentStep);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      const payload = buildSubmitPayload();
      const response = await api.post(`/api/clients/${clientId}/financial-data-extended`, payload);

      if (response.data.success) {
        setSubmitted(true);
        setSubmitResult(response.data);
        onFormSubmitted(response.data);
      } else {
        setErrors({ submit: response.data.error || 'Fehler beim Speichern' });
      }
    } catch (error: any) {
      setErrors({
        submit: error.response?.data?.error || 'Fehler beim Speichern. Bitte versuchen Sie es erneut.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (prefillLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center py-8">
          <svg className="animate-spin h-5 w-5 mr-2" style={{ color: customColors.primary }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-gray-600 text-sm">Daten werden geladen...</span>
        </div>
      </div>
    );
  }

  if (submitted) {
    const planTypeLabels: Record<string, string> = {
      nullplan: 'Nullplan',
      ratenzahlung: 'Ratenzahlung',
      einmalzahlung: 'Einmalzahlung',
    };

    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="text-center">
          <div className="mb-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-green-100 flex items-center justify-center">
              <CheckIcon className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Erweiterte Finanzdaten erfolgreich übermittelt
          </h3>
          <p className="text-gray-600 mb-4">
            Vielen Dank! Ihre erweiterten Finanzdaten wurden erfolgreich gespeichert.
          </p>
          {submitResult && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
              <p className="text-sm font-medium text-blue-800 mb-2">Ermittelter Plantyp:</p>
              <p className="text-lg font-bold text-blue-900">
                {planTypeLabels[submitResult.determined_plan_type] || submitResult.determined_plan_type}
              </p>
              <p className="text-sm text-blue-700 mt-1">{submitResult.determined_plan_type_reason}</p>
            </div>
          )}
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm">
                <p className="font-medium text-blue-800 mb-1">Nächste Schritte</p>
                <p className="text-blue-700">
                  Unser Team wird nun Ihren individuellen Schuldenbereinigungsplan erstellen und an Ihre
                  Gläubiger versenden. Sie werden über den Fortschritt benachrichtigt.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Input helper components
  const inputClass = (field: string) =>
    `w-full border rounded-lg px-3 py-2 text-sm ${
      errors[field]
        ? 'border-red-300 focus:border-red-500 focus:ring-red-200'
        : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'
    } focus:outline-none focus:ring-2`;

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Berufsstatus *</label>
              <select
                value={formData.berufsstatus}
                onChange={(e) => handleChange('berufsstatus', e.target.value)}
                className={inputClass('berufsstatus')}
              >
                {berufsstatus_options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {errors.berufsstatus && <p className="mt-1 text-sm text-red-600">{errors.berufsstatus}</p>}
            </div>

            {formData.berufsstatus === 'angestellt' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Arbeitgeber (Name) *</label>
                  <input
                    type="text"
                    value={formData.arbeitgeber_name}
                    onChange={(e) => handleChange('arbeitgeber_name', e.target.value)}
                    placeholder="Name des Arbeitgebers"
                    className={inputClass('arbeitgeber_name')}
                  />
                  {errors.arbeitgeber_name && <p className="mt-1 text-sm text-red-600">{errors.arbeitgeber_name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Arbeitgeber (Adresse)</label>
                  <input
                    type="text"
                    value={formData.arbeitgeber_adresse}
                    onChange={(e) => handleChange('arbeitgeber_adresse', e.target.value)}
                    placeholder="Adresse des Arbeitgebers"
                    className={inputClass('arbeitgeber_adresse')}
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Anzahl Unterhaltsberechtigte</label>
              <select
                value={formData.anzahl_unterhaltsberechtigte}
                onChange={(e) => handleChange('anzahl_unterhaltsberechtigte', e.target.value)}
                className={inputClass('anzahl_unterhaltsberechtigte')}
              >
                {Array.from({ length: 11 }, (_, i) => (
                  <option key={i} value={i.toString()}>
                    {i === 0 ? 'Keine' : i}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Personen, denen Sie gesetzlich zum Unterhalt verpflichtet sind (Kinder, Ehepartner etc.)
              </p>
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sonstige monatliche Einkünfte
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.sonstige_monatliche_einkuenfte_betrag}
                  onChange={(e) => handleChange('sonstige_monatliche_einkuenfte_betrag', e.target.value)}
                  placeholder="z.B. 200,00"
                  className={inputClass('sonstige_monatliche_einkuenfte_betrag')}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Nebeneinkünfte, Mieteinnahmen, Unterhaltszahlungen etc. (monatlich, in Euro)
              </p>
            </div>

            {formData.sonstige_monatliche_einkuenfte_betrag && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Beschreibung der sonstigen Einkünfte
                </label>
                <input
                  type="text"
                  value={formData.sonstige_monatliche_einkuenfte_beschreibung}
                  onChange={(e) => handleChange('sonstige_monatliche_einkuenfte_beschreibung', e.target.value)}
                  placeholder="z.B. Mieteinnahmen"
                  className={inputClass('sonstige_monatliche_einkuenfte_beschreibung')}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sozialleistungen (monatlich)
              </label>
              <input
                type="text"
                value={formData.sozialleistungen_betrag}
                onChange={(e) => handleChange('sozialleistungen_betrag', e.target.value)}
                placeholder="z.B. 500,00"
                className={inputClass('sozialleistungen_betrag')}
              />
              <p className="mt-1 text-xs text-gray-500">
                Arbeitslosengeld, Sozialhilfe, Wohngeld etc. (monatlich, in Euro)
              </p>
            </div>

            {formData.sozialleistungen_betrag && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Art der Sozialleistung</label>
                <input
                  type="text"
                  value={formData.sozialleistungen_art}
                  onChange={(e) => handleChange('sozialleistungen_art', e.target.value)}
                  placeholder="z.B. Arbeitslosengeld II"
                  className={inputClass('sozialleistungen_art')}
                />
              </div>
            )}

            {!formData.sonstige_monatliche_einkuenfte_betrag && !formData.sozialleistungen_betrag && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
                Falls Sie keine weiteren Einkünfte oder Sozialleistungen beziehen, können Sie diesen
                Schritt überspringen.
              </div>
            )}
          </div>
        );

      case 2:
        return (
          <div className="space-y-5">
            {/* Immobilien */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">Immobilieneigentum</label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.immobilieneigentum_vorhanden}
                    onChange={(e) => handleChange('immobilieneigentum_vorhanden', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-300 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
              </div>
              {formData.immobilieneigentum_vorhanden && (
                <input
                  type="text"
                  value={formData.immobilieneigentum_beschreibung}
                  onChange={(e) => handleChange('immobilieneigentum_beschreibung', e.target.value)}
                  placeholder="Beschreibung (z.B. Eigentumswohnung in Berlin)"
                  className={inputClass('immobilieneigentum_beschreibung')}
                />
              )}
            </div>

            {/* Fahrzeuge */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">Fahrzeuge</label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.fahrzeuge_vorhanden}
                    onChange={(e) => handleChange('fahrzeuge_vorhanden', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-300 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
              </div>
              {formData.fahrzeuge_vorhanden && (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={formData.fahrzeuge_beschreibung}
                    onChange={(e) => handleChange('fahrzeuge_beschreibung', e.target.value)}
                    placeholder="z.B. VW Golf, Baujahr 2018"
                    className={inputClass('fahrzeuge_beschreibung')}
                  />
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.fahrzeuge_wert}
                      onChange={(e) => handleChange('fahrzeuge_wert', e.target.value)}
                      placeholder="Geschätzter Wert in Euro"
                      className={inputClass('fahrzeuge_wert')}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Sparkonten */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">Sparkonten / Geldanlagen</label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.sparkonten_vorhanden}
                    onChange={(e) => handleChange('sparkonten_vorhanden', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-300 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
              </div>
              {formData.sparkonten_vorhanden && (
                <input
                  type="text"
                  value={formData.sparkonten_wert}
                  onChange={(e) => handleChange('sparkonten_wert', e.target.value)}
                  placeholder="Ungefährer Gesamtwert in Euro"
                  className={inputClass('sparkonten_wert')}
                />
              )}
            </div>

            {/* Lebensversicherungen */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">Lebensversicherungen</label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.lebensversicherungen_vorhanden}
                    onChange={(e) => handleChange('lebensversicherungen_vorhanden', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-300 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
              </div>
              {formData.lebensversicherungen_vorhanden && (
                <input
                  type="text"
                  value={formData.lebensversicherungen_rueckkaufswert}
                  onChange={(e) => handleChange('lebensversicherungen_rueckkaufswert', e.target.value)}
                  placeholder="Rückkaufswert in Euro"
                  className={inputClass('lebensversicherungen_rueckkaufswert')}
                />
              )}
            </div>

            {/* Sonstiges Vermoegen */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sonstiges Vermögen</label>
              <textarea
                value={formData.sonstiges_vermoegen}
                onChange={(e) => handleChange('sonstiges_vermoegen', e.target.value)}
                placeholder="Weitere Vermögenswerte (optional)"
                rows={2}
                className={inputClass('sonstiges_vermoegen')}
              />
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-5">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">Bürgschaften</label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.buergschaften_vorhanden}
                    onChange={(e) => handleChange('buergschaften_vorhanden', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-300 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
              </div>
              {formData.buergschaften_vorhanden && (
                <textarea
                  value={formData.buergschaften_details}
                  onChange={(e) => handleChange('buergschaften_details', e.target.value)}
                  placeholder="Für wen und in welcher Höhe?"
                  rows={2}
                  className={inputClass('buergschaften_details')}
                />
              )}
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">Pfandrechte</label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.pfandrechte_vorhanden}
                    onChange={(e) => handleChange('pfandrechte_vorhanden', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-300 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
              </div>
              {formData.pfandrechte_vorhanden && (
                <textarea
                  value={formData.pfandrechte_details}
                  onChange={(e) => handleChange('pfandrechte_details', e.target.value)}
                  placeholder="Details zu bestehenden Pfandrechten"
                  rows={2}
                  className={inputClass('pfandrechte_details')}
                />
              )}
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">Sonstige Sicherheiten</label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.sonstige_sicherheiten_vorhanden}
                    onChange={(e) => handleChange('sonstige_sicherheiten_vorhanden', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-300 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
              </div>
              {formData.sonstige_sicherheiten_vorhanden && (
                <textarea
                  value={formData.sonstige_sicherheiten_details}
                  onChange={(e) => handleChange('sonstige_sicherheiten_details', e.target.value)}
                  placeholder="Details zu sonstigen Sicherheiten"
                  rows={2}
                  className={inputClass('sonstige_sicherheiten_details')}
                />
              )}
            </div>

            {!formData.buergschaften_vorhanden && !formData.pfandrechte_vorhanden && !formData.sonstige_sicherheiten_vorhanden && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
                Falls keine Sicherheiten vorliegen, können Sie diesen Schritt überspringen.
              </div>
            )}
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Gewünschte Planlaufzeit
              </label>
              <select
                value={formData.gewuenschte_planlaufzeit}
                onChange={(e) => handleChange('gewuenschte_planlaufzeit', e.target.value)}
                className={inputClass('gewuenschte_planlaufzeit')}
              >
                {planlaufzeit_options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Die Standardlaufzeit beträgt 36 Monate. Eine längere Laufzeit kann die monatliche
                Belastung reduzieren.
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <label className="text-sm font-medium text-gray-700">Drittmittel verfügbar?</label>
                  <p className="text-xs text-gray-500">
                    Z.B. Unterstützung von Verwandten für eine Einmalzahlung
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.drittmittel_verfuegbar}
                    onChange={(e) => handleChange('drittmittel_verfuegbar', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-300 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
              </div>
              {formData.drittmittel_verfuegbar && (
                <div>
                  <input
                    type="text"
                    value={formData.drittmittel_betrag}
                    onChange={(e) => handleChange('drittmittel_betrag', e.target.value)}
                    placeholder="Verfügbarer Betrag in Euro"
                    className={inputClass('drittmittel_betrag')}
                  />
                  {errors.drittmittel_betrag && (
                    <p className="mt-1 text-sm text-red-600">{errors.drittmittel_betrag}</p>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bevorzugter Plantyp
              </label>
              <select
                value={formData.bevorzugter_plantyp}
                onChange={(e) => handleChange('bevorzugter_plantyp', e.target.value)}
                className={inputClass('bevorzugter_plantyp')}
              >
                {plantyp_options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Der Plantyp wird automatisch auf Basis Ihrer finanziellen Situation empfohlen. Sie
                können hier eine Präferenz angeben.
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center mb-2">
          <AdjustmentsHorizontalIcon className="w-6 h-6 mr-2" style={{ color: customColors.primary }} />
          <h3 className="text-lg font-semibold text-gray-900">
            Erweiterte Finanzdaten für Ihren Schuldenbereinigungsplan
          </h3>
        </div>
        <p className="text-gray-600 text-sm">
          Bitte geben Sie die folgenden Informationen an, damit wir den optimalen Schuldenbereinigungsplan
          für Sie erstellen können.
        </p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center mb-6 overflow-x-auto pb-2">
        {STEPS.map((step, index) => {
          const StepIcon = step.icon;
          const isActive = index === currentStep;
          const isCompleted = index < currentStep;
          return (
            <React.Fragment key={index}>
              {index > 0 && (
                <div
                  className={`flex-1 h-0.5 mx-1 ${
                    isCompleted ? 'bg-green-500' : 'bg-gray-200'
                  }`}
                />
              )}
              <button
                onClick={() => {
                  if (index < currentStep) {
                    setCurrentStep(index);
                    setErrors({});
                  }
                }}
                className={`flex flex-col items-center min-w-[60px] ${
                  index < currentStep ? 'cursor-pointer' : 'cursor-default'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 transition-colors ${
                    isCompleted
                      ? 'bg-green-500 text-white'
                      : isActive
                      ? 'text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                  style={isActive ? { backgroundColor: customColors.primary } : undefined}
                >
                  {isCompleted ? (
                    <CheckIcon className="w-4 h-4" />
                  ) : (
                    <StepIcon className="w-4 h-4" />
                  )}
                </div>
                <span
                  className={`text-xs whitespace-nowrap ${
                    isActive ? 'font-medium text-gray-900' : 'text-gray-500'
                  }`}
                >
                  {step.label}
                </span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Step Title */}
      <h4 className="text-md font-semibold text-gray-800 mb-4">
        Schritt {currentStep + 1}: {STEPS[currentStep].title}
      </h4>

      {/* Step Content */}
      {renderStepContent()}

      {/* Submit Error */}
      {errors.submit && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <ExclamationTriangleIcon className="w-5 h-5 text-red-600 mr-2 flex-shrink-0" />
            <p className="text-sm text-red-700">{errors.submit}</p>
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between mt-6">
        <button
          onClick={goBack}
          disabled={currentStep === 0}
          className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            currentStep === 0
              ? 'text-gray-400 bg-gray-100 cursor-not-allowed'
              : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
          }`}
        >
          <ArrowLeftIcon className="w-4 h-4 mr-1" />
          Zurück
        </button>

        {currentStep < STEPS.length - 1 ? (
          <button
            onClick={goNext}
            className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: customColors.primary }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = customColors.primaryHover)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = customColors.primary)}
          >
            Weiter
            <ArrowRightIcon className="w-4 h-4 ml-1" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`inline-flex items-center px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors ${
              isSubmitting ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-700 hover:bg-green-800'
            }`}
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Wird gespeichert...
              </>
            ) : (
              <>
                <CheckIcon className="w-4 h-4 mr-1" />
                Daten absenden
              </>
            )}
          </button>
        )}
      </div>

      {/* Privacy Notice */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <ExclamationTriangleIcon className="w-5 h-5 text-blue-600 mt-0.5 mr-2 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-blue-800 mb-1">Datenschutz & Sicherheit</p>
            <p className="text-blue-700">
              Ihre Daten werden verschlüsselt übertragen und nur für die Erstellung Ihres
              Schuldenbereinigungsplans verwendet. Die Verarbeitung erfolgt gemäß DSGVO.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExtendedFinancialDataWizard;
