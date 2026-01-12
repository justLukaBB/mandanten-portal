import React from 'react';
import { useAddCreditorMutation } from '../store/features/creditorApi';
import { useGetCurrentClientQuery } from '../store/features/clientApi';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

interface Client {
    id: string;
    name: string;
    aktenzeichen: string;
}

const baseSchema = z.object({
    name: z.string().min(1, 'Gläubigername ist erforderlich'),
    email: z.string().email('Ungültige E-Mail-Adresse').optional().or(z.literal('')),
    referenceNumber: z.string().optional(),
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
    message: "Tatsächlicher Gläubiger ist erforderlich, wenn 'Is representative' ausgewählt ist",
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mt-6">
            <div className="mb-8 flex items-center justify-between">
                <div className="">
                    <h3 className="text-xl font-bold text-gray-900">Add new creditor</h3>
                    {isLoadingClient && <span className="text-sm text-gray-500 animate-pulse">Loading client info...</span>}
                </div>
                <div>
                    {client && (
                        <p className="mt-2 text-sm text-gray-600">
                            {client.name} ({client.aktenzeichen})
                        </p>
                    )}
                </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Creditor name *
                        </label>
                        <input
                            {...register('name')}
                            className={`w-full px-4 py-3 bg-gray-50/50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm ${errors.name ? 'border-red-500 text-red-900 placeholder-red-300' : 'border-gray-100 focus:border-blue-500'
                                }`}
                        />
                        {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            E-mail
                        </label>
                        <input
                            type="email"
                            {...register('email')}
                            className={`w-full px-4 py-3 bg-gray-50/50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm ${errors.email ? 'border-red-500 text-red-900 placeholder-red-300' : 'border-gray-100 focus:border-blue-500'
                                }`}
                        />
                        {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Reference number
                        </label>
                        <input
                            {...register('referenceNumber')}
                            className="w-full px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Amount claimed (€)
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            {...register('amount')}
                            className={`w-full px-4 py-3 bg-gray-50/50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm ${errors.amount ? 'border-red-500 text-red-900 placeholder-red-300' : 'border-gray-100 focus:border-blue-500'
                                }`}
                        />
                        {errors.amount && <p className="mt-1 text-xs text-red-500">{errors.amount.message}</p>}
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Address
                    </label>
                    <textarea
                        {...register('address')}
                        rows={3}
                        className="w-full px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm resize-none"
                    />
                </div>

                <div className="flex flex-col space-y-4 py-2">
                    <div className="flex items-center">
                        <input
                            type="checkbox"
                            id="isRepresentative"
                            {...register('isRepresentative')}
                            className="h-5 w-5 text-blue-600 focus:ring-blue-500/20 border-gray-300 rounded cursor-pointer transition-all"
                        />
                        <label htmlFor="isRepresentative" className="ml-3 block text-sm font-medium text-gray-700 cursor-pointer">
                            Is representative
                        </label>
                    </div>
                    {isRepresentative && (
                        <div className="flex-1 animate-in fade-in slide-in-from-top-2 duration-300">
                            <input
                                {...register('actualCreditor')}
                                className={`w-full px-4 py-3 bg-gray-50/50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm ${errors.actualCreditor ? 'border-red-500 text-red-900 placeholder-red-300' : 'border-gray-100 focus:border-blue-500'
                                    }`}
                                placeholder="Tatsächlicher Gläubiger"
                            />
                            {errors.actualCreditor && <p className="mt-1 text-xs text-red-500">{errors.actualCreditor.message}</p>}
                        </div>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Notes
                    </label>
                    <textarea
                        {...register('notes')}
                        rows={2}
                        className="w-full px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm resize-none"
                        placeholder="Additional Information..."
                    />
                </div>



                <div className="flex justify-end space-x-3 pt-6">
                    {/* <button
                        type="button"
                        onClick={onClose}
                        className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all"
                    >
                        Cancel
                    </button> */}
                    <button
                        type="submit"
                        disabled={isLoading}
                        style={{ backgroundColor: customColors.primary }}
                        className="px-8 py-2.5 text-white rounded-lg hover:opacity-95 transition-all disabled:opacity-50 text-sm font-bold shadow-sm shadow-blue-900/10 active:scale-[0.98]"
                    >
                        {isLoading ? 'Adding...' : 'Add Creditor'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default AddCreditorForm;
