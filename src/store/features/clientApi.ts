import { baseApi } from '../api/baseApi';

export const clientApi = baseApi.injectEndpoints({
    endpoints: (builder) => ({
        // Use the existing creditors endpoint which also returns client info
        getCurrentClient: builder.query({
            query: (clientId) => `/api/clients/${clientId}/creditors`,
            providesTags: ['User', 'Creditor'],
            transformResponse: (response: any) => response.client, // Extract just the client data
        }),
        getClientDocuments: builder.query({
            query: (clientId) => `/api/clients/${clientId}/documents`,
            providesTags: ['Documents'],
        }),
        getCreditorConfirmationStatus: builder.query({
            query: (clientId) => `/api/clients/${clientId}/creditor-confirmation`,
            providesTags: ['CreditorConfirmation'],
        }),
        getFinancialFormStatus: builder.query({
            query: (clientId) => `/api/clients/${clientId}/financial-form-status`,
            providesTags: ['FinancialForm'],
        }),
        updatePassword: builder.mutation({
            query: ({ fileNumber, newPassword }) => ({
                url: '/api/client/make-new-password',
                method: 'POST',
                body: { file_number: fileNumber, new_password: newPassword },
            }),
        }),
    }),
});

export const {
    useGetCurrentClientQuery,
    useGetClientDocumentsQuery,
    useGetCreditorConfirmationStatusQuery,
    useGetFinancialFormStatusQuery,
    useUpdatePasswordMutation
} = clientApi;
