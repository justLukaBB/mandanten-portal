import { baseApi } from '../api/baseApi';

export const creditorApi = baseApi.injectEndpoints({
    endpoints: (builder) => ({
        addCreditor: builder.mutation({
            query: ({ clientId, ...creditorData }) => ({
                url: `/api/clients/${clientId}/creditors`,
                method: 'POST',
                body: creditorData,
            }),
            invalidatesTags: ['Creditor'],
        }),
        addCreditorAdmin: builder.mutation({
            query: ({ clientId, ...creditorData }) => ({
                url: `/api/admin/clients/${clientId}/add-creditor`,
                method: 'POST',
                body: creditorData,
            }),
            invalidatesTags: ['Creditor', 'Client'],
        }),
    }),
});

export const { useAddCreditorMutation, useAddCreditorAdminMutation } = creditorApi;
