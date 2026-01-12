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
    }),
});

export const { useAddCreditorMutation } = creditorApi;
