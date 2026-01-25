import React, { useState } from 'react';
import api from '../config/api';
import { MapPinIcon, PhoneIcon, UserIcon } from 'lucide-react';
import { BuildingOfficeIcon, ExclamationTriangleIcon, HashtagIcon, HomeIcon } from '@heroicons/react/24/outline';

interface ClientAddressFormProps {
    clientId: string;
    client?: any;
    onFormSubmitted?: (data: any) => void;
    customColors?: {
        primary: string;
        primaryHover: string;
    };
}

interface AddressFormData {
    street: string;
    house_number: string;
    zip_code: string;
    city: string;
    phone?: string;
}

interface AddressFormErrors {
    street?: string;
    house_number?: string;
    zip_code?: string;
    city?: string;
    phone?: string;
    submit?: string;
}

const ClientAddressForm: React.FC<ClientAddressFormProps> = ({
    clientId,
    client,
    onFormSubmitted,
    customColors = {
        primary: '#9f1a1d',
        primaryHover: '#7d1517',
    },
}) => {
    const [formData, setFormData] = useState<AddressFormData>({
        street: client?.strasse || '',
        house_number: client?.hausnummer || '',
        zip_code: client?.plz || '',
        city: client?.ort || '',
        phone: client?.telefon || '',
    });

    const [errors, setErrors] = useState<AddressFormErrors>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const validateForm = (): AddressFormErrors => {
        const newErrors: AddressFormErrors = {};
        if (!formData.street.trim()) {
          newErrors.street = 'Straße ist erforderlich';
        }
        if (!formData.house_number.trim()) {
          newErrors.house_number = 'Hausnummer ist erforderlich';
        }
        if (!formData.zip_code.trim()) {
          newErrors.zip_code = 'PLZ ist erforderlich';
        }
        if (!formData.city.trim()) {
          newErrors.city = 'Ort ist erforderlich';
        }
        return newErrors;
    };

    const handleInputChange = (field: keyof AddressFormData, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors((prev) => ({ ...prev, [field]: undefined }));
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
        try {
            const response = await api.post(`/api/clients/${clientId}/address`, formData);
            if (response.data.success) {
                setSubmitted(true);
                onFormSubmitted?.(response.data);
            } else {
                setErrors({ submit: response.data.error || 'Fehler beim Speichern der Adresse' });
            }
        } catch (err: any) {
            console.error('Error submitting address:', err);
            setErrors({
                submit:
                    err.response?.data?.error ||
                    'Fehler beim Speichern der Adresse. Bitte versuchen Sie es erneut.',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (submitted) {
        return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
                <div className="w-12 h-12 mx-auto mb-3 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Adresse gespeichert</h3>
                <p className="text-gray-600">Ihre persönlichen Daten wurden erfolgreich übermittelt.</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="mb-6">
                <div className="flex items-center mb-2">
                    <UserIcon
                        className="w-6 h-6 mr-2"
                        style={{ color: customColors.primary }}
                    />
                    <h2 className="text-lg font-semibold text-gray-900">
                        Persönliche Daten
                    </h2>
                </div>
                <p className="text-gray-600 text-sm">
                    Bitte geben Sie Ihre persönlichen Informationen und aktuelle Adresse an.
                    Diese Daten sind erforderlich, um Ihren Schuldenbereinigungsplan eindeutig
                    zuordnen und die Kommunikation sicherzustellen.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Street */}
                <div>
                    <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                        <HomeIcon className="w-4 h-4 mr-1" />
                        Straße
                    </label>
                    <input
                        type="text"
                        value={formData.street}
                        onChange={(e) => handleInputChange('street', e.target.value)}
                        placeholder="z. B. Musterstraße"
                        className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.street
                            ? 'border-red-300 focus:border-red-500 focus:ring-red-200'
                            : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'
                            } focus:outline-none focus:ring-2 text-gray-900`}
                    />
                    {errors.street && (
                        <p className="mt-1 text-sm text-red-600">{errors.street}</p>
                    )}
                    <p className="mt-1 text-xs text-gray-500">
                        Geben Sie den Straßennamen Ihrer aktuellen Wohnadresse an.
                    </p>
                </div>

                {/* House Number */}
                <div>
                    <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                        <HashtagIcon className="w-4 h-4 mr-1" />
                        Hausnummer
                    </label>
                    <input
                        type="text"
                        value={formData.house_number}
                        onChange={(e) => handleInputChange('house_number', e.target.value)}
                        placeholder="z. B. 12A"
                        className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.house_number
                            ? 'border-red-300 focus:border-red-500 focus:ring-red-200'
                            : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'
                            } focus:outline-none focus:ring-2 text-gray-900`}
                    />
                    {errors.house_number && (
                        <p className="mt-1 text-sm text-red-600">{errors.house_number}</p>
                    )}
                </div>

                {/* ZIP + City */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                            <MapPinIcon className="w-4 h-4 mr-1" />
                            PLZ
                        </label>
                        <input
                            type="text"
                            value={formData.zip_code}
                            onChange={(e) => handleInputChange('zip_code', e.target.value)}
                            placeholder="z. B. 12345"
                            className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.zip_code
                                ? 'border-red-300 focus:border-red-500 focus:ring-red-200'
                                : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'
                                } focus:outline-none focus:ring-2 text-gray-900`}
                        />
                        {errors.zip_code && (
                            <p className="mt-1 text-sm text-red-600">{errors.zip_code}</p>
                        )}
                    </div>

                    <div>
                        <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                            <BuildingOfficeIcon className="w-4 h-4 mr-1" />
                            Ort
                        </label>
                        <input
                            type="text"
                            value={formData.city}
                            onChange={(e) => handleInputChange('city', e.target.value)}
                            placeholder="z. B. Berlin"
                            className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.city
                                ? 'border-red-300 focus:border-red-500 focus:ring-red-200'
                                : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'
                                } focus:outline-none focus:ring-2 text-gray-900`}
                        />
                        {errors.city && (
                            <p className="mt-1 text-sm text-red-600">{errors.city}</p>
                        )}
                    </div>
                </div>

                {/* Optional Phone */}
                <div>
                    <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                        <PhoneIcon className="w-4 h-4 mr-1" />
                        Telefon (optional)
                    </label>
                    <input
                        type="text"
                        value={formData.phone}
                        onChange={(e) => handleInputChange('phone', e.target.value)}
                        placeholder="z. B. +49 170 1234567"
                        className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.phone
                            ? 'border-red-300 focus:border-red-500 focus:ring-red-200'
                            : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'
                            } focus:outline-none focus:ring-2 text-gray-900`}
                    />
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
                    className={`w-full py-3.5 px-6 rounded-lg text-white font-semibold transition-colors duration-200 ${isSubmitting
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-green-700 hover:bg-green-800 shadow-md hover:shadow-lg'
                        }`}
                >
                    <span className="flex items-center justify-center space-x-2">
                        {isSubmitting ? (
                            <>
                                <svg
                                    className="animate-spin h-5 w-5 text-white"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                >
                                    <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                    ></circle>
                                    <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 
              5.291A7.962 7.962 0 014 12H0c0 
              3.042 1.135 5.824 3 7.938l3-2.647z"
                                    ></path>
                                </svg>
                                <span>Speichern...</span>
                            </>
                        ) : (
                            <>
                                <svg
                                    className="w-5 h-5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M5 13l4 4L19 7"
                                    />
                                </svg>
                                <span>Persönliche Daten speichern</span>
                            </>
                        )}
                    </span>
                </button>
            </form>

        </div>
    );
};

export default ClientAddressForm;
