import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import {
  useGetInsolvenzantragFormQuery,
  useSaveInsolvenzantragSectionMutation,
  useSubmitInsolvenzantragFormMutation,
} from '../store/features/clientApi';

interface InsolvenzantragDataFormProps {
  clientId: string;
  client: any;
  onFormSubmitted: () => void;
  customColors?: { primary: string; primaryHover: string };
}

type SectionKey = 'personal_data' | 'address' | 'contact' | 'family_status' | 'employment' | 'financial' | 'assets';

const SECTION_CONFIG: { key: SectionKey; label: string; required: boolean }[] = [
  { key: 'personal_data', label: 'Persoenliche Daten', required: true },
  { key: 'address', label: 'Adresse', required: true },
  { key: 'contact', label: 'Kontaktdaten', required: true },
  { key: 'family_status', label: 'Familienstand', required: true },
  { key: 'employment', label: 'Berufliche Situation', required: true },
  { key: 'financial', label: 'Einkommen', required: true },
  { key: 'assets', label: 'Vermoegen & Sicherheiten', required: false },
];

const FAMILIENSTAND_OPTIONS = [
  { value: '', label: 'Bitte waehlen...' },
  { value: 'ledig', label: 'Ledig' },
  { value: 'verheiratet', label: 'Verheiratet' },
  { value: 'geschieden', label: 'Geschieden' },
  { value: 'verwitwet', label: 'Verwitwet' },
  { value: 'getrennt_lebend', label: 'Getrennt lebend' },
  { value: 'lebenspartnerschaft', label: 'Eingetragene Lebenspartnerschaft' },
];

const BERUFSSTATUS_OPTIONS = [
  { value: '', label: 'Bitte waehlen...' },
  { value: 'angestellt', label: 'Angestellt' },
  { value: 'selbststaendig', label: 'Selbstaendig' },
  { value: 'arbeitslos', label: 'Arbeitslos' },
  { value: 'rentner', label: 'Rentner/in' },
  { value: 'in_ausbildung', label: 'In Ausbildung' },
];

const GESCHLECHT_OPTIONS = [
  { value: '', label: 'Bitte waehlen...' },
  { value: 'maennlich', label: 'Maennlich' },
  { value: 'weiblich', label: 'Weiblich' },
  { value: 'divers', label: 'Divers' },
];

const InsolvenzantragDataForm: React.FC<InsolvenzantragDataFormProps> = ({
  clientId,
  client,
  onFormSubmitted,
  customColors = { primary: '#9f1a1d', primaryHover: '#7d1517' },
}) => {
  const { data: formResponse, isLoading, refetch } = useGetInsolvenzantragFormQuery(clientId);
  const [saveSection] = useSaveInsolvenzantragSectionMutation();
  const [submitForm, { isLoading: isSubmitting }] = useSubmitInsolvenzantragFormMutation();

  const [formData, setFormData] = useState<Record<string, Record<string, any>>>({});
  const [sectionsCompleted, setSectionsCompleted] = useState<Record<string, boolean>>({});
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ personal_data: true });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [savedSections, setSavedSections] = useState<Record<string, boolean>>({});
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Initialize form data from API response
  useEffect(() => {
    if (formResponse?.form_data) {
      setFormData(formResponse.form_data);
      setSectionsCompleted(formResponse.form_meta?.sections_completed || {});

      // Open first incomplete section
      const firstIncomplete = SECTION_CONFIG.find(
        s => s.required && !formResponse.form_meta?.sections_completed?.[s.key]
      );
      if (firstIncomplete) {
        setOpenSections({ [firstIncomplete.key]: true });
      }
    }
  }, [formResponse]);

  // Auto-save with debounce
  const debouncedSave = useCallback(
    (section: SectionKey, data: Record<string, any>) => {
      if (debounceTimers.current[section]) {
        clearTimeout(debounceTimers.current[section]);
      }
      debounceTimers.current[section] = setTimeout(async () => {
        setSavingSection(section);
        try {
          const result = await saveSection({ clientId, section, data }).unwrap();
          if (result.success) {
            setSectionsCompleted(result.sections_completed);
            setSavedSections(prev => ({ ...prev, [section]: true }));
            setTimeout(() => setSavedSections(prev => ({ ...prev, [section]: false })), 2000);
          }
        } catch (err) {
          console.error(`Auto-save failed for section ${section}:`, err);
        } finally {
          setSavingSection(null);
        }
      }, 2000);
    },
    [clientId, saveSection]
  );

  // Cleanup debounce timers
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout);
    };
  }, []);

  const handleFieldChange = (section: SectionKey, field: string, value: any) => {
    setFormData(prev => {
      const updated = {
        ...prev,
        [section]: { ...prev[section], [field]: value },
      };
      debouncedSave(section, updated[section]);
      return updated;
    });
  };

  const handleManualSave = async (section: SectionKey) => {
    // Clear any pending debounce
    if (debounceTimers.current[section]) {
      clearTimeout(debounceTimers.current[section]);
    }
    setSavingSection(section);
    try {
      const result = await saveSection({ clientId, section, data: formData[section] || {} }).unwrap();
      if (result.success) {
        setSectionsCompleted(result.sections_completed);
        setSavedSections(prev => ({ ...prev, [section]: true }));
        setTimeout(() => setSavedSections(prev => ({ ...prev, [section]: false })), 2000);
      }
    } catch (err) {
      console.error(`Save failed for section ${section}:`, err);
    } finally {
      setSavingSection(null);
    }
  };

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    try {
      const result = await submitForm(clientId).unwrap();
      if (result.success) {
        onFormSubmitted();
      }
    } catch (err: any) {
      const errData = err?.data;
      if (errData?.missing_sections) {
        const labels = errData.missing_sections.map((s: string) =>
          SECTION_CONFIG.find(c => c.key === s)?.label || s
        );
        setSubmitError(`Bitte fuelln Sie folgende Sektionen aus: ${labels.join(', ')}`);
      } else {
        setSubmitError(errData?.error || 'Fehler beim Absenden');
      }
    }
  };

  const completedCount = SECTION_CONFIG.filter(s => sectionsCompleted[s.key]).length;
  const totalCount = SECTION_CONFIG.length;

  // If already submitted, show confirmation
  if (client?.insolvenzantrag_form?.status === 'submitted' || client?.current_status === 'insolvenzantrag_ready') {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="text-center">
          <div className="mb-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-green-100 flex items-center justify-center">
              <CheckIcon className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Daten fuer Insolvenzantrag eingereicht
          </h3>
          <p className="text-gray-600 mb-4">
            Ihre Daten wurden erfolgreich uebermittelt. Ihr Rechtsanwalt erstellt nun Ihren Insolvenzantrag.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start justify-center">
              <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-blue-700">
                Sie werden benachrichtigt, sobald Ihr Insolvenzantrag fertig ist.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center py-8">
          <svg className="animate-spin h-5 w-5 mr-2" style={{ color: customColors.primary }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-gray-600 text-sm">Formulardaten werden geladen...</span>
        </div>
      </div>
    );
  }

  const inputClass = (hasError = false) =>
    `w-full border rounded-lg px-3 py-2 text-sm ${
      hasError
        ? 'border-red-300 focus:border-red-500 focus:ring-red-200'
        : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'
    } focus:outline-none focus:ring-2`;

  const sectionData = (key: SectionKey) => formData[key] || {};

  const renderSectionHeader = (config: typeof SECTION_CONFIG[0], index: number) => {
    const isOpen = openSections[config.key];
    const isCompleted = sectionsCompleted[config.key];
    const isSaving = savingSection === config.key;
    const justSaved = savedSections[config.key];

    return (
      <button
        onClick={() => toggleSection(config.key)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center space-x-3">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
              isCompleted
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {isCompleted ? <CheckIcon className="w-4 h-4" /> : index + 1}
          </div>
          <span className={`text-sm font-medium ${isCompleted ? 'text-gray-900' : 'text-gray-700'}`}>
            {config.label}
          </span>
          {!config.required && (
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Optional</span>
          )}
          {isSaving && (
            <span className="text-xs text-blue-500">Speichert...</span>
          )}
          {justSaved && (
            <span className="text-xs text-green-600">Gespeichert</span>
          )}
        </div>
        {isOpen ? (
          <ChevronUpIcon className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDownIcon className="w-4 h-4 text-gray-400" />
        )}
      </button>
    );
  };

  const renderPersonalData = () => {
    const d = sectionData('personal_data');
    return (
      <div className="space-y-4 px-4 pb-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vorname *</label>
            <input
              type="text"
              value={d.vorname || ''}
              onChange={e => handleFieldChange('personal_data', 'vorname', e.target.value)}
              className={inputClass()}
              placeholder="Vorname"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nachname *</label>
            <input
              type="text"
              value={d.nachname || ''}
              onChange={e => handleFieldChange('personal_data', 'nachname', e.target.value)}
              className={inputClass()}
              placeholder="Nachname"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Geburtsdatum *</label>
            <input
              type="text"
              value={d.geburtsdatum || ''}
              onChange={e => handleFieldChange('personal_data', 'geburtsdatum', e.target.value)}
              className={inputClass()}
              placeholder="TT.MM.JJJJ"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Geburtsort *</label>
            <input
              type="text"
              value={d.geburtsort || ''}
              onChange={e => handleFieldChange('personal_data', 'geburtsort', e.target.value)}
              className={inputClass()}
              placeholder="Geburtsort"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Geschlecht</label>
          <select
            value={d.geschlecht || ''}
            onChange={e => handleFieldChange('personal_data', 'geschlecht', e.target.value)}
            className={inputClass()}
          >
            {GESCHLECHT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <SaveButton section="personal_data" />
      </div>
    );
  };

  const renderAddress = () => {
    const d = sectionData('address');
    return (
      <div className="space-y-4 px-4 pb-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Strasse *</label>
            <input
              type="text"
              value={d.strasse || ''}
              onChange={e => handleFieldChange('address', 'strasse', e.target.value)}
              className={inputClass()}
              placeholder="Strassenname"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hausnummer *</label>
            <input
              type="text"
              value={d.hausnummer || ''}
              onChange={e => handleFieldChange('address', 'hausnummer', e.target.value)}
              className={inputClass()}
              placeholder="Nr."
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">PLZ *</label>
            <input
              type="text"
              value={d.plz || ''}
              onChange={e => handleFieldChange('address', 'plz', e.target.value)}
              className={inputClass()}
              placeholder="PLZ"
              maxLength={5}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Ort *</label>
            <input
              type="text"
              value={d.ort || ''}
              onChange={e => handleFieldChange('address', 'ort', e.target.value)}
              className={inputClass()}
              placeholder="Stadt"
            />
          </div>
        </div>
        <SaveButton section="address" />
      </div>
    );
  };

  const renderContact = () => {
    const d = sectionData('contact');
    return (
      <div className="space-y-4 px-4 pb-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefon *</label>
            <input
              type="tel"
              value={d.telefon || ''}
              onChange={e => handleFieldChange('contact', 'telefon', e.target.value)}
              className={inputClass()}
              placeholder="z.B. 0234 9136810"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mobiltelefon</label>
            <input
              type="tel"
              value={d.mobiltelefon || ''}
              onChange={e => handleFieldChange('contact', 'mobiltelefon', e.target.value)}
              className={inputClass()}
              placeholder="z.B. 0170 1234567"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail *</label>
          <input
            type="email"
            value={d.email || ''}
            onChange={e => handleFieldChange('contact', 'email', e.target.value)}
            className={inputClass()}
            placeholder="ihre@email.de"
          />
        </div>
        <SaveButton section="contact" />
      </div>
    );
  };

  const renderFamilyStatus = () => {
    const d = sectionData('family_status');
    const needsDate = ['verheiratet', 'geschieden', 'verwitwet', 'getrennt_lebend', 'lebenspartnerschaft'].includes(d.familienstand);
    return (
      <div className="space-y-4 px-4 pb-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Familienstand *</label>
            <select
              value={d.familienstand || ''}
              onChange={e => handleFieldChange('family_status', 'familienstand', e.target.value)}
              className={inputClass()}
            >
              {FAMILIENSTAND_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          {needsDate && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Seit wann?</label>
              <input
                type="text"
                value={d.familienstand_seit || ''}
                onChange={e => handleFieldChange('family_status', 'familienstand_seit', e.target.value)}
                className={inputClass()}
                placeholder="TT.MM.JJJJ"
              />
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Anzahl Kinder</label>
            <select
              value={String(d.kinder_anzahl ?? '0')}
              onChange={e => handleFieldChange('family_status', 'kinder_anzahl', e.target.value)}
              className={inputClass()}
            >
              {Array.from({ length: 11 }, (_, i) => (
                <option key={i} value={i.toString()}>
                  {i === 0 ? 'Keine Kinder' : i === 1 ? '1 Kind' : `${i} Kinder`}
                </option>
              ))}
            </select>
          </div>
          {Number(d.kinder_anzahl) > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Alter der Kinder</label>
              <input
                type="text"
                value={d.kinder_alter || ''}
                onChange={e => handleFieldChange('family_status', 'kinder_alter', e.target.value)}
                className={inputClass()}
                placeholder="z.B. 5, 8, 12"
              />
            </div>
          )}
        </div>
        <SaveButton section="family_status" />
      </div>
    );
  };

  const renderEmployment = () => {
    const d = sectionData('employment');
    const isEmployed = d.berufsstatus === 'angestellt';
    return (
      <div className="space-y-4 px-4 pb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Berufsstatus *</label>
          <select
            value={d.berufsstatus || ''}
            onChange={e => handleFieldChange('employment', 'berufsstatus', e.target.value)}
            className={inputClass()}
          >
            {BERUFSSTATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Erlernter Beruf</label>
            <input
              type="text"
              value={d.erlernter_beruf || ''}
              onChange={e => handleFieldChange('employment', 'erlernter_beruf', e.target.value)}
              className={inputClass()}
              placeholder="z.B. Kaufmann"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Derzeitige Taetigkeit</label>
            <input
              type="text"
              value={d.derzeitige_taetigkeit || ''}
              onChange={e => handleFieldChange('employment', 'derzeitige_taetigkeit', e.target.value)}
              className={inputClass()}
              placeholder="z.B. Lagerist"
            />
          </div>
        </div>
        {isEmployed && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Arbeitgeber (Name)</label>
              <input
                type="text"
                value={d.arbeitgeber_name || ''}
                onChange={e => handleFieldChange('employment', 'arbeitgeber_name', e.target.value)}
                className={inputClass()}
                placeholder="Name des Arbeitgebers"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Arbeitgeber (Adresse)</label>
              <input
                type="text"
                value={d.arbeitgeber_adresse || ''}
                onChange={e => handleFieldChange('employment', 'arbeitgeber_adresse', e.target.value)}
                className={inputClass()}
                placeholder="Adresse des Arbeitgebers"
              />
            </div>
          </div>
        )}
        <SaveButton section="employment" />
      </div>
    );
  };

  const renderFinancial = () => {
    const d = sectionData('financial');
    return (
      <div className="space-y-4 px-4 pb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Monatliches Netto-Einkommen *</label>
          <div className="relative">
            <input
              type="text"
              value={d.netto_einkommen || ''}
              onChange={e => handleFieldChange('financial', 'netto_einkommen', e.target.value)}
              className={inputClass()}
              placeholder="z.B. 2.500,00"
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <span className="text-gray-400 text-sm">EUR</span>
            </div>
          </div>
          <p className="mt-1 text-xs text-gray-500">Nach Abzug aller Steuern und Sozialversicherungsbeitraege</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sonstige monatl. Einkuenfte</label>
            <input
              type="text"
              value={d.sonstige_einkuenfte_betrag || ''}
              onChange={e => handleFieldChange('financial', 'sonstige_einkuenfte_betrag', e.target.value)}
              className={inputClass()}
              placeholder="z.B. 200,00"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Art der Einkuenfte</label>
            <input
              type="text"
              value={d.sonstige_einkuenfte_beschreibung || ''}
              onChange={e => handleFieldChange('financial', 'sonstige_einkuenfte_beschreibung', e.target.value)}
              className={inputClass()}
              placeholder="z.B. Mieteinnahmen"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sozialleistungen (monatl.)</label>
            <input
              type="text"
              value={d.sozialleistungen_betrag || ''}
              onChange={e => handleFieldChange('financial', 'sozialleistungen_betrag', e.target.value)}
              className={inputClass()}
              placeholder="z.B. 500,00"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Art der Leistung</label>
            <input
              type="text"
              value={d.sozialleistungen_art || ''}
              onChange={e => handleFieldChange('financial', 'sozialleistungen_art', e.target.value)}
              className={inputClass()}
              placeholder="z.B. ALG II"
            />
          </div>
        </div>
        <SaveButton section="financial" />
      </div>
    );
  };

  const renderAssets = () => {
    const d = sectionData('assets');

    const ToggleRow = ({ label, field, detailField, detailLabel, detailPlaceholder, valueField, valueLabel }: {
      label: string;
      field: string;
      detailField?: string;
      detailLabel?: string;
      detailPlaceholder?: string;
      valueField?: string;
      valueLabel?: string;
    }) => (
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">{label}</label>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={d[field] || false}
              onChange={e => handleFieldChange('assets', field, e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-300 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
          </label>
        </div>
        {d[field] && (
          <div className="space-y-2">
            {detailField && (
              <input
                type="text"
                value={d[detailField] || ''}
                onChange={e => handleFieldChange('assets', detailField, e.target.value)}
                placeholder={detailPlaceholder || detailLabel}
                className={inputClass()}
              />
            )}
            {valueField && (
              <input
                type="text"
                value={d[valueField] || ''}
                onChange={e => handleFieldChange('assets', valueField, e.target.value)}
                placeholder={valueLabel || 'Wert in Euro'}
                className={inputClass()}
              />
            )}
          </div>
        )}
      </div>
    );

    return (
      <div className="space-y-4 px-4 pb-4">
        <p className="text-sm text-gray-500">
          Falls zutreffend, aktivieren Sie die entsprechenden Punkte.
        </p>
        <ToggleRow
          label="Immobilieneigentum"
          field="immobilieneigentum_vorhanden"
          detailField="immobilieneigentum_beschreibung"
          detailPlaceholder="z.B. Eigentumswohnung in Berlin"
        />
        <ToggleRow
          label="Fahrzeuge"
          field="fahrzeuge_vorhanden"
          detailField="fahrzeuge_beschreibung"
          detailPlaceholder="z.B. VW Golf, Baujahr 2018"
          valueField="fahrzeuge_wert"
          valueLabel="Geschaetzter Wert in Euro"
        />
        <ToggleRow
          label="Sparkonten / Geldanlagen"
          field="sparkonten_vorhanden"
          valueField="sparkonten_wert"
          valueLabel="Ungefaehrer Gesamtwert in Euro"
        />
        <ToggleRow
          label="Lebensversicherungen"
          field="lebensversicherungen_vorhanden"
          valueField="lebensversicherungen_rueckkaufswert"
          valueLabel="Rueckkaufswert in Euro"
        />
        <ToggleRow
          label="Buergschaften"
          field="buergschaften_vorhanden"
          detailField="buergschaften_details"
          detailPlaceholder="Fuer wen und in welcher Hoehe?"
        />
        <ToggleRow
          label="Pfandrechte"
          field="pfandrechte_vorhanden"
          detailField="pfandrechte_details"
          detailPlaceholder="Details zu bestehenden Pfandrechten"
        />
        <SaveButton section="assets" />
      </div>
    );
  };

  // Save button for each section
  function SaveButton({ section }: { section: SectionKey }) {
    const isSaving = savingSection === section;
    const justSaved = savedSections[section];
    return (
      <div className="flex justify-end pt-2">
        <button
          onClick={() => handleManualSave(section)}
          disabled={isSaving}
          className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <svg className="animate-spin h-3 w-3 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Speichert...
            </>
          ) : justSaved ? (
            <>
              <CheckIcon className="w-3 h-3 mr-1 text-green-600" />
              Gespeichert
            </>
          ) : (
            'Speichern'
          )}
        </button>
      </div>
    );
  }

  const SECTION_RENDERERS: Record<SectionKey, () => React.ReactNode> = {
    personal_data: renderPersonalData,
    address: renderAddress,
    contact: renderContact,
    family_status: renderFamilyStatus,
    employment: renderEmployment,
    financial: renderFinancial,
    assets: renderAssets,
  };

  const allRequiredComplete = SECTION_CONFIG
    .filter(s => s.required)
    .every(s => sectionsCompleted[s.key]);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-4 border-b border-gray-200">
        <div className="flex items-center mb-2">
          <svg className="w-6 h-6 mr-2" style={{ color: customColors.primary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900">
            Daten fuer Ihren Insolvenzantrag
          </h3>
        </div>
        <p className="text-gray-600 text-sm mb-3">
          Bitte pruefen und vervollstaendigen Sie die folgenden Angaben. Vorhandene Daten sind bereits eingetragen.
          Ihre Eingaben werden automatisch gespeichert.
        </p>

        {/* Progress bar */}
        <div className="flex items-center space-x-3">
          <div className="flex-1 bg-gray-200 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all duration-300"
              style={{
                width: `${(completedCount / totalCount) * 100}%`,
                backgroundColor: completedCount === totalCount ? '#22C55E' : customColors.primary,
              }}
            />
          </div>
          <span className="text-xs font-medium text-gray-500 whitespace-nowrap">
            {completedCount} von {totalCount}
          </span>
        </div>
      </div>

      {/* Sections */}
      <div className="divide-y divide-gray-200">
        {SECTION_CONFIG.map((config, index) => (
          <div key={config.key}>
            {renderSectionHeader(config, index)}
            {openSections[config.key] && SECTION_RENDERERS[config.key]()}
          </div>
        ))}
      </div>

      {/* Submit Error */}
      {submitError && (
        <div className="mx-4 mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <ExclamationTriangleIcon className="w-5 h-5 text-red-600 mr-2 flex-shrink-0" />
            <p className="text-sm text-red-700">{submitError}</p>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <div className="px-4 py-4 border-t border-gray-200 bg-gray-50">
        <button
          onClick={() => setShowConfirmModal(true)}
          disabled={!allRequiredComplete || isSubmitting}
          className={`w-full py-3 px-6 rounded-lg text-white font-semibold transition-colors duration-200 ${
            !allRequiredComplete || isSubmitting
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-green-700 hover:bg-green-800'
          }`}
        >
          <span className="flex items-center justify-center space-x-2">
            <CheckIcon className="w-5 h-5" />
            <span>Daten bestaetigen & absenden</span>
          </span>
        </button>
        {!allRequiredComplete && (
          <p className="text-xs text-gray-500 text-center mt-2">
            Bitte fuellen Sie alle Pflicht-Sektionen aus, bevor Sie absenden.
          </p>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center mr-3 flex-shrink-0">
                <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">
                Angaben verbindlich absenden?
              </h2>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Bitte pruefen Sie Ihre Angaben sorgfaeltig. Nach dem Absenden werden Ihre Daten
              fuer die Erstellung des Insolvenzantrags verwendet und koennen nicht mehr
              eigenstaendig geaendert werden.
            </p>

            {/* Summary of entered data */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4 max-h-60 overflow-y-auto">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Zusammenfassung</div>
              <div className="space-y-2 text-sm">
                {formData.personal_data?.vorname && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Name</span>
                    <span className="text-gray-900 font-medium">{formData.personal_data.vorname} {formData.personal_data.nachname}</span>
                  </div>
                )}
                {formData.personal_data?.geburtsdatum && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Geburtsdatum</span>
                    <span className="text-gray-900">{formData.personal_data.geburtsdatum}</span>
                  </div>
                )}
                {formData.address?.strasse && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Adresse</span>
                    <span className="text-gray-900">{formData.address.strasse} {formData.address.hausnummer}, {formData.address.plz} {formData.address.ort}</span>
                  </div>
                )}
                {formData.contact?.email && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">E-Mail</span>
                    <span className="text-gray-900">{formData.contact.email}</span>
                  </div>
                )}
                {formData.family_status?.familienstand && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Familienstand</span>
                    <span className="text-gray-900">{FAMILIENSTAND_OPTIONS.find(o => o.value === formData.family_status.familienstand)?.label || formData.family_status.familienstand}</span>
                  </div>
                )}
                {formData.employment?.berufsstatus && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Berufsstatus</span>
                    <span className="text-gray-900">{BERUFSSTATUS_OPTIONS.find(o => o.value === formData.employment.berufsstatus)?.label || formData.employment.berufsstatus}</span>
                  </div>
                )}
                {formData.financial?.netto_einkommen && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Netto-Einkommen</span>
                    <span className="text-gray-900">{formData.financial.netto_einkommen} EUR</span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-5">
              <p className="text-xs text-blue-700">
                Mit dem Absenden bestaetigen Sie die Richtigkeit und Vollstaendigkeit Ihrer Angaben.
                Bei Aenderungswuenschen wenden Sie sich bitte an Ihren Rechtsanwalt.
              </p>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors text-sm"
              >
                Zurueck zur Pruefung
              </button>
              <button
                onClick={async () => {
                  await handleSubmit();
                  setShowConfirmModal(false);
                }}
                disabled={isSubmitting}
                className={`flex-1 px-4 py-2.5 text-white rounded-lg font-medium transition-colors text-sm ${
                  isSubmitting ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-700 hover:bg-green-800'
                }`}
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Wird uebermittelt...
                  </span>
                ) : (
                  'Verbindlich absenden'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Privacy Notice */}
      <div className="mx-4 mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm">
            <p className="font-medium text-blue-800 mb-1">Datenschutz & Sicherheit</p>
            <p className="text-blue-700">
              Ihre Daten werden verschluesselt uebertragen und ausschliesslich fuer die Erstellung Ihres
              Insolvenzantrags verwendet. Die Verarbeitung erfolgt gemaess DSGVO.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InsolvenzantragDataForm;
