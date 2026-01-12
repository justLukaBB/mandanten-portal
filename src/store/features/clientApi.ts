import { baseApi } from '../api/baseApi';

export const clientApi = baseApi.injectEndpoints({
    endpoints: (builder) => ({
        // Use the existing creditors endpoint which also returns client info
        getCurrentClient: builder.query({
            query: (clientId) => `/api/clients/${clientId}/creditors`,
            providesTags: ['User', 'Creditor'],
            transformResponse: (response: any) => response.client, // Extract just the client data
        }),
    }),
});

export const { useGetCurrentClientQuery } = clientApi;
