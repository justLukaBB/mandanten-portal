import React from 'react';
import { useAddCreditorMutation } from '../store/features/creditorApi';
import { useGetCurrentClientQuery } from '../store/features/clientApi';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { PlusCircleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

interface Client {
    id: string;
    name: string;
    aktenzeichen: string;
}

const baseSchema = z.object({
    name: z.string().min(1, 'Gläubigername ist erforderlich'),
    email: z.string().email('Ungültige E-Mail-Adresse').optional().or(z.literal('')),
    referenceNumber: z.string().min(1, 'Aktenzeichen ist erforderlich'),
    amount: z.string().optional(),
    address: z.string().optional(),
    isRepresentative: z.boolean(),
    actualCreditor: z.string().optional(),
    notes: z.string().optional(),
});

const creditorSchema = baseSchema.refine(data => {
    if (data.isRepresentative && (!data.actualCreditor || data.actualCreditor.trim() === '')) {
        return false;
    }
    return true;
}, {
    message: "Tatsächlicher Gläubiger ist erforderlich, wenn 'Vertretung' ausgewählt ist",
    path: ["actualCreditor"]
});

type CreditorFormData = z.infer<typeof creditorSchema>;

interface AddCreditorFormProps {
    clientId: string;
    onClose: () => void;
    onSuccess?: () => void;
    customColors: {
        primary: string;
        primaryHover: string;
    };
}

const AddCreditorForm: React.FC<AddCreditorFormProps> = ({
    clientId,
    onClose,
    onSuccess,
    customColors
}) => {
    const {
        register,
        handleSubmit,
        watch,
        reset,
        formState: { errors }
    } = useForm<CreditorFormData>({
        resolver: zodResolver(creditorSchema),
        defaultValues: {
            name: '',
            email: '',
            referenceNumber: '',
            amount: '',
            address: '',
            isRepresentative: false,
            actualCreditor: '',
            notes: ''
        }
    });

    const isRepresentative = watch('isRepresentative');
    const [addCreditor, { isLoading, error: apiError }] = useAddCreditorMutation();

    // Fetch current client info
    const { data: clientData, isLoading: isLoadingClient, error: clientError } = useGetCurrentClientQuery(clientId);
    const client = clientData as Client | undefined;

    console.log('🔍 Client Query Debug:', {
        clientId,
        clientData,
        client,
        isLoadingClient,
        clientError,
        hasName: client?.name,
        hasAktenzeichen: client?.aktenzeichen
    });

    const onSubmit = async (data: CreditorFormData) => {
        try {
            await addCreditor({
                clientId,
                ...data,
                amount: data.amount ? parseFloat(data.amount) : 0
            }).unwrap();

            toast.success('Gläubiger erfolgreich hinzugefügt');
            reset();
            if (onSuccess) onSuccess();
        } catch (err) {
            console.error('Failed to add creditor:', err);
            toast.error('Fehler beim Hinzufügen des Gläubigers');
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mt-12">
            {/* Header */}
            <div className="bg-gradient-to-r from-gray-50 to-gray-100/50 px-8 py-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-white rounded-lg shadow-sm">
                            <PlusCircleIcon className="h-6 w-6 text-gray-700" />
                        </div>
                        <div>
                            <h3 className="text-xl font-semibold text-gray-900">Gläubiger manuell hinzufügen</h3>
                            <p className="text-sm text-gray-500 mt-0.5">Fügen Sie einen fehlenden Gläubiger zu Ihrer Liste hinzu</p>
                        </div>
                    </div>
                    {client && (
                        <div className="text-right">
                            <p className="text-xs text-gray-500">Mandant</p>
                            <p className="text-sm font-medium text-gray-900">{client.name}</p>
                            <p className="text-xs text-gray-500">{client.aktenzeichen}</p>
                        </div>
                    )}
                    {isLoadingClient && (
                        <span className="text-sm text-gray-400 animate-pulse">Lade Daten...</span>
                    )}
                </div>
            </div>

            {/* Info Banner */}
            <div className="px-8 py-4 bg-blue-50 border-b border-blue-100">
                <div className="flex items-start space-x-3">
                    <InformationCircleIcon className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-900">
                        <p className="font-medium">Hinweis zur manuellen Eingabe</p>
                        <p className="text-blue-700 mt-1">
                            Bitte tragen Sie alle bekannten Informationen zum Gläubiger ein. Pflichtfelder sind mit * gekennzeichnet.
                        </p>
                    </div>
                </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit(onSubmit)} className="px-8 py-6">
                <div className="space-y-6">
                    {/* Section: Gläubiger Informationen */}
                    <div>
                        <h4 className="text-sm font-semibold text-gray-900 mb-4 text-center">
                            Gläubiger-Informationen
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Name des Gläubigers <span className="text-red-500">*</span>
                                </label>
                                <input
                                    {...register('name')}
                                    placeholder="z.B. Vodafone GmbH"
                                    className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 transition-all text-sm ${
                                        errors.name
                                            ? 'border-red-300 bg-red-50 text-red-900 placeholder-red-400 focus:ring-red-500/20 focus:border-red-500'
                                            : 'border-gray-300 bg-white focus:ring-gray-900/10 focus:border-gray-900'
                                    }`}
                                />
                                {errors.name && (
                                    <p className="mt-1.5 text-xs text-red-600 flex items-center">
                                        <span className="mr-1">⚠</span> {errors.name.message}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    E-Mail-Adresse
                                </label>
                                <input
                                    type="email"
                                    {...register('email')}
                                    placeholder="kontakt@glaeubiger.de"
                                    className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 transition-all text-sm ${
                                        errors.email
                                            ? 'border-red-300 bg-red-50 text-red-900 placeholder-red-400 focus:ring-red-500/20 focus:border-red-500'
                                            : 'border-gray-300 bg-white focus:ring-gray-900/10 focus:border-gray-900'
                                    }`}
                                />
                                {errors.email && (
                                    <p className="mt-1.5 text-xs text-red-600 flex items-center">
                                        <span className="mr-1">⚠</span> {errors.email.message}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Section: Forderungsdetails */}
                    <div>
                        <h4 className="text-sm font-semibold text-gray-900 mb-4 text-center">
                            Forderungsdetails
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Aktenzeichen / Referenznummer <span className="text-red-500">*</span>
                                </label>
                                <input
                                    {...register('referenceNumber')}
                                    placeholder="z.B. AZ-2024-12345"
                                    className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 transition-all text-sm ${
                                        errors.referenceNumber
                                            ? 'border-red-300 bg-red-50 text-red-900 placeholder-red-400 focus:ring-red-500/20 focus:border-red-500'
                                            : 'border-gray-300 bg-white focus:ring-gray-900/10 focus:border-gray-900'
                                    }`}
                                />
                                {errors.referenceNumber && (
                                    <p className="mt-1.5 text-xs text-red-600 flex items-center">
                                        <span className="mr-1">⚠</span> {errors.referenceNumber.message}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Forderungsbetrag (€)
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        step="0.01"
                                        {...register('amount')}
                                        placeholder="0,00"
                                        className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 transition-all text-sm ${
                                            errors.amount
                                                ? 'border-red-300 bg-red-50 text-red-900 focus:ring-red-500/20 focus:border-red-500'
                                                : 'border-gray-300 bg-white focus:ring-gray-900/10 focus:border-gray-900'
                                        }`}
                                    />
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">€</span>
                                </div>
                                {errors.amount && (
                                    <p className="mt-1.5 text-xs text-red-600 flex items-center">
                                        <span className="mr-1">⚠</span> {errors.amount.message}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Section: Adresse */}
                    <div>
                        <h4 className="text-sm font-semibold text-gray-900 mb-4 text-center">
                            Kontaktadresse
                        </h4>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Vollständige Adresse
                            </label>
                            <textarea
                                {...register('address')}
                                rows={3}
                                placeholder="Straße, Hausnummer&#10;PLZ Ort&#10;Land"
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900 transition-all text-sm resize-none bg-white"
                            />
                        </div>
                    </div>

                    {/* Section: Vertretung */}
                    <div>
                        <h4 className="text-sm font-semibold text-gray-900 mb-4 text-center">
                            Vertretung
                        </h4>
                        <div className="space-y-4">
                            <div className="flex items-start p-4 bg-gray-50 rounded-lg border border-gray-200">
                                <div className="flex items-center h-5">
                                    <input
                                        type="checkbox"
                                        id="isRepresentative"
                                        {...register('isRepresentative')}
                                        className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900 cursor-pointer transition-all"
                                    />
                                </div>
                                <div className="ml-3">
                                    <label htmlFor="isRepresentative" className="text-sm font-medium text-gray-900 cursor-pointer">
                                        Handelt als Vertreter (z.B. Inkassobüro, Rechtsanwalt)
                                    </label>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Aktivieren Sie diese Option, wenn es sich um einen Vertreter im Auftrag eines anderen Gläubigers handelt
                                    </p>
                                </div>
                            </div>

                            {isRepresentative && (
                                <div className="animate-in slide-in-from-top-2 duration-300 pl-4 border-l-2 border-gray-300">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Tatsächlicher Gläubiger <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        {...register('actualCreditor')}
                                        placeholder="Name des ursprünglichen Gläubigers"
                                        className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 transition-all text-sm ${
                                            errors.actualCreditor
                                                ? 'border-red-300 bg-red-50 text-red-900 placeholder-red-400 focus:ring-red-500/20 focus:border-red-500'
                                                : 'border-gray-300 bg-white focus:ring-gray-900/10 focus:border-gray-900'
                                        }`}
                                    />
                                    {errors.actualCreditor && (
                                        <p className="mt-1.5 text-xs text-red-600 flex items-center">
                                            <span className="mr-1">⚠</span> {errors.actualCreditor.message}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Section: Notizen */}
                    <div>
                        <h4 className="text-sm font-semibold text-gray-900 mb-4 text-center">
                            Zusätzliche Informationen
                        </h4>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Notizen (optional)
                            </label>
                            <textarea
                                {...register('notes')}
                                rows={3}
                                placeholder="Weitere Hinweise oder Besonderheiten zu diesem Gläubiger..."
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900 transition-all text-sm resize-none bg-white"
                            />
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end items-center space-x-3 pt-8 mt-8 border-t border-gray-200">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900/10 transition-all"
                    >
                        Abbrechen
                    </button>
                    <button
                        type="submit"
                        disabled={isLoading}
                        style={{ backgroundColor: customColors.primary }}
                        className="px-8 py-2.5 text-white rounded-lg font-medium shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center space-x-2"
                    >
                        {isLoading ? (
                            <>
                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span>Wird hinzugefügt...</span>
                            </>
                        ) : (
                            <>
                                <PlusCircleIcon className="h-4 w-4" />
                                <span>Gläubiger hinzufügen</span>
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default AddCreditorForm;
