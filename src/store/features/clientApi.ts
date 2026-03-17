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

        // === Phase 2: Extended Financial Data & Settlement Plan ===

        getExtendedFinancialFormStatus: builder.query({
            query: (clientId) => `/api/clients/${clientId}/extended-financial-form-status`,
            providesTags: ['ExtendedFinancialForm'],
        }),
        getExtendedFinancialData: builder.query({
            query: (clientId) => `/api/clients/${clientId}/financial-data-extended`,
            providesTags: ['ExtendedFinancialForm'],
        }),
        submitExtendedFinancialData: builder.mutation({
            query: ({ clientId, data }) => ({
                url: `/api/clients/${clientId}/financial-data-extended`,
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['ExtendedFinancialForm', 'User', 'SettlementPlan'],
        }),
        getSettlementPlanStatus: builder.query({
            query: (clientId) => `/api/clients/${clientId}/settlement-plan/status`,
            providesTags: ['SettlementPlan'],
        }),
        generateSettlementPlan: builder.mutation({
            query: ({ clientId, planTypeOverride, planlaufzeitOverride }) => ({
                url: `/api/clients/${clientId}/settlement-plan/generate`,
                method: 'POST',
                body: {
                    plan_type_override: planTypeOverride,
                    planlaufzeit_override: planlaufzeitOverride,
                },
            }),
            invalidatesTags: ['SettlementPlan'],
        }),
        sendSettlementPlan: builder.mutation({
            query: ({ clientId, sendToCreditorIds }) => ({
                url: `/api/clients/${clientId}/settlement-plan/send`,
                method: 'POST',
                body: { send_to_creditor_ids: sendToCreditorIds },
            }),
            invalidatesTags: ['SettlementPlan'],
        }),

        // === Second Letter Form (inline portal) ===

        getSecondLetterFormData: builder.query({
            query: (clientId) => `/api/clients/${clientId}/second-letter-form`,
            providesTags: ['SecondLetterForm'],
        }),
        submitSecondLetterForm: builder.mutation({
            query: ({ clientId, data }) => ({
                url: `/api/clients/${clientId}/second-letter-form`,
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['SecondLetterForm', 'User'],
        }),

        // === Insolvenzantrag Data Collection Form ===

        getInsolvenzantragForm: builder.query({
            query: (clientId) => `/api/clients/${clientId}/insolvenzantrag-form`,
            providesTags: ['InsolvenzantragForm'],
        }),
        saveInsolvenzantragSection: builder.mutation({
            query: ({ clientId, section, data }) => ({
                url: `/api/clients/${clientId}/insolvenzantrag-form/save-section`,
                method: 'POST',
                body: { section, data },
            }),
            invalidatesTags: ['InsolvenzantragForm'],
        }),
        submitInsolvenzantragForm: builder.mutation({
            query: (clientId) => ({
                url: `/api/clients/${clientId}/insolvenzantrag-form/submit`,
                method: 'POST',
            }),
            invalidatesTags: ['InsolvenzantragForm', 'User'],
        }),
    }),
});

export const {
    useGetCurrentClientQuery,
    useGetClientDocumentsQuery,
    useGetCreditorConfirmationStatusQuery,
    useGetFinancialFormStatusQuery,
    useUpdatePasswordMutation,
    // Phase 2
    useGetExtendedFinancialFormStatusQuery,
    useGetExtendedFinancialDataQuery,
    useSubmitExtendedFinancialDataMutation,
    useGetSettlementPlanStatusQuery,
    useGenerateSettlementPlanMutation,
    useSendSettlementPlanMutation,
    // Second Letter
    useGetSecondLetterFormDataQuery,
    useSubmitSecondLetterFormMutation,
    // Insolvenzantrag Form
    useGetInsolvenzantragFormQuery,
    useSaveInsolvenzantragSectionMutation,
    useSubmitInsolvenzantragFormMutation,
} = clientApi;
