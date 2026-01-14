import { createSlice } from '@reduxjs/toolkit';
import { baseApi } from '../api/baseApi';
import { authApi } from './authApi';

const initialState = {
    isAuthenticated: !!localStorage.getItem('auth_token'),
};

export const authSlice = createSlice({
    name: 'auth',
    initialState,
    reducers: {
        logout: (state) => {
            localStorage.clear();
            state.isAuthenticated = false;
        },
        clearImpersonation: (state) => {
            // Clear impersonation data
            localStorage.removeItem('is_impersonating');
            localStorage.removeItem('impersonation_data');

            // Clear portal session
            localStorage.removeItem('auth_token');
            localStorage.removeItem('portal_session_token');
            localStorage.removeItem('active_role');
            localStorage.removeItem('portal_client_data');

            // Reset auth state
            state.isAuthenticated = false;
        },
    },
    extraReducers: (builder) => {
        builder.addMatcher(
            authApi.endpoints.login.matchFulfilled,
            (state) => {
                state.isAuthenticated = true;
            }
        );
    },
});

export const { logout, clearImpersonation } = authSlice.actions;
export default authSlice.reducer;
