import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_BASE_URL } from '../../config/api';

const baseQuery = fetchBaseQuery({
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
});

const baseQueryWithReauth = async (args: any, api: any, extraOptions: any) => {
    let result = await baseQuery(args, api, extraOptions);

    if (result.error && (result.error.status === 401)) {
        // Token expired or invalid
        const activeRole = localStorage.getItem('active_role');

        // Clear all tokens
        localStorage.removeItem('admin_token');
        localStorage.removeItem('auth_token');
        localStorage.removeItem('portal_session_token');
        localStorage.removeItem('portal_client_data');
        localStorage.removeItem('active_role'); // Clear role last

        // Determine redirect based on role or current path
        let loginPath = '/login';
        if (activeRole === 'admin' || window.location.pathname.startsWith('/admin')) {
            loginPath = '/admin/login';
        } else if (activeRole === 'agent' || window.location.pathname.startsWith('/agent')) {
            loginPath = '/agent/login';
        }

        // Force redirect
        window.location.href = loginPath;
    }
    return result;
};

export const baseApi = createApi({
    reducerPath: 'api',
    baseQuery: baseQueryWithReauth,
    tagTypes: ['User', 'Document', 'Creditor', "Client", 'Documents', 'CreditorConfirmation', 'FinancialForm'],
    endpoints: () => ({}),
});
