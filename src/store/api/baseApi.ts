import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_BASE_URL } from '../../config/api';

export const baseApi = createApi({
    reducerPath: 'api',
    baseQuery: fetchBaseQuery({
        baseUrl: API_BASE_URL,
        prepareHeaders: (headers: Headers) => {
            // Priority 1: Admin token
            const adminToken = localStorage.getItem('admin_token');
            // Priority 2: Auth token
            const authToken = localStorage.getItem('auth_token');
            // Priority 3: Session token
            const sessionToken = localStorage.getItem('portal_session_token');

            const token = adminToken || authToken || sessionToken;

            if (token) {
                headers.set('authorization', `Bearer ${token}`);
            }
            return headers;
        },
    }),
    tagTypes: ['User', 'Document', 'Creditor', "Client"],
    endpoints: () => ({}),
});
