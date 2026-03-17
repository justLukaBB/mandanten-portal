import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_BASE_URL } from '../../config/api';
import { updateStoredTokens, clearAuthStorage } from '../../config/tokenStorage';

const baseQuery = fetchBaseQuery({
    baseUrl: API_BASE_URL,
    prepareHeaders: (headers: Headers) => {
        const adminToken = localStorage.getItem('admin_token');
        const authToken = localStorage.getItem('auth_token');
        const sessionToken = localStorage.getItem('portal_session_token');

        const token = adminToken || authToken || sessionToken;

        if (token) {
            headers.set('authorization', `Bearer ${token}`);
        }
        return headers;
    },
});

// Token refresh mutex for RTK Query
let isRefreshingRTK = false;
let refreshPromiseRTK: Promise<string | null> | null = null;

const SKIP_REFRESH_URLS = ['/login', '/verify-code', '/refresh-token', '/request-verification-code'];

async function attemptTokenRefresh(): Promise<string | null> {
    const currentToken =
        localStorage.getItem('admin_token') ||
        localStorage.getItem('auth_token') ||
        localStorage.getItem('portal_session_token');

    if (!currentToken) {
        return null;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/refresh-token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`,
            },
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        const { token: newToken, type } = data;

        updateStoredTokens(newToken, type);

        return newToken;
    } catch {
        return null;
    }
}

const baseQueryWithReauth = async (args: any, api: any, extraOptions: any) => {
    let result = await baseQuery(args, api, extraOptions);

    if (result.error && result.error.status === 401) {
        // Check if this URL should skip refresh
        const url = typeof args === 'string' ? args : args?.url || '';
        if (SKIP_REFRESH_URLS.some(pattern => url.includes(pattern))) {
            return result;
        }

        // Attempt token refresh (with mutex to prevent concurrent refreshes)
        let newToken: string | null = null;

        if (isRefreshingRTK && refreshPromiseRTK) {
            newToken = await refreshPromiseRTK;
        } else {
            isRefreshingRTK = true;
            refreshPromiseRTK = attemptTokenRefresh();
            newToken = await refreshPromiseRTK;
            isRefreshingRTK = false;
            refreshPromiseRTK = null;
        }

        if (newToken) {
            // Retry the original query with the new token
            result = await baseQuery(args, api, extraOptions);
        } else {
            // Refresh failed — redirect to login
            const activeRole = localStorage.getItem('active_role');

            clearAuthStorage();

            let loginPath = '/login';
            if (activeRole === 'admin' || window.location.pathname.startsWith('/admin')) {
                loginPath = '/admin/login';
            } else if (activeRole === 'agent' || window.location.pathname.startsWith('/agent')) {
                loginPath = '/agent/login';
            }

            window.location.href = loginPath;
        }
    }
    return result;
};

export const baseApi = createApi({
    reducerPath: 'api',
    baseQuery: baseQueryWithReauth,
    tagTypes: ['User', 'Document', 'Creditor', "Client", 'Documents', 'CreditorConfirmation', 'FinancialForm', 'ExtendedFinancialForm', 'SettlementPlan', 'SecondLetterForm', 'InsolvenzantragForm'],
    endpoints: () => ({}),
});
