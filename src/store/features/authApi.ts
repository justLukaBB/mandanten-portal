import { baseApi } from '../api/baseApi';

export const authApi = baseApi.injectEndpoints({
    endpoints: (builder) => ({
        login: builder.mutation({
            query: (credentials) => ({
                url: '/api/portal/login',
                method: 'POST',
                body: credentials,
            }),
        }),
        endImpersonation: builder.mutation({
            query: () => ({
                url: '/api/auth/end-impersonation',
                method: 'POST',
            }),
        }),
    }),
});

export const { useLoginMutation, useEndImpersonationMutation } = authApi;
