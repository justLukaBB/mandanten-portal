import { baseApi } from '../api/baseApi';

export interface AdminUser {
    id: string; // Mapped from _id by transformResponse
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    aktenzeichen: string;
    workflow_status: string;
    current_status: string;
    documents_count: number;
    creditors_count: number;
    created_at: string;
    updated_at: string;
    last_login?: string;
    zendesk_ticket_id?: string;
    first_payment_received?: boolean;
    admin_approved?: boolean;
    client_confirmed_creditors?: boolean;
    processing_complete_webhook_scheduled?: boolean;
    processing_complete_webhook_scheduled_at?: string;
    processing_complete_webhook_triggered?: boolean;
    all_documents_processed_at?: string;
}

export interface ClientListResponse {
    clients: AdminUser[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }
}

export const adminApi = baseApi.injectEndpoints({
    endpoints: (builder) => ({
        getClients: builder.query<ClientListResponse, { page: number; limit: number; search?: string; status?: string; dateFrom?: string; dateTo?: string }>({
            query: ({ page = 1, limit = 50, search = '', status = 'all', dateFrom, dateTo }) => {
                const params = new URLSearchParams({
                    page: page.toString(),
                    limit: limit.toString(),
                    status, // 'all' is default
                });

                if (search) params.append('search', search);
                if (dateFrom) params.append('dateFrom', dateFrom);
                if (dateTo) params.append('dateTo', dateTo);

                return {
                    url: `/api/admin/clients?${params.toString()}`,
                    method: 'GET',
                };
            },
            providesTags: ['User'],
            transformResponse: (response: any) => {
                // Map _id to id to match UserList expectation if needed
                if (response.clients) {
                    response.clients = response.clients.map((client: any) => ({
                        ...client,
                        id: client._id || client.id // Handle both cases
                    }));
                }
                return response;
            }
        }),
        getWorkflowStatus: builder.query<{ status: string; label: string }, string>({
            query: (clientId) => `/api/admin/clients/${clientId}/workflow-status`,
            providesTags: ['User'],
        }),
        getSettlementResponses: builder.query<any, string>({
            query: (clientId) => `/api/admin/clients/${clientId}/settlement-responses`,
            providesTags: ['User'],
        }),
        getNullplanResponses: builder.query<any, string>({
            query: (clientId) => `/api/admin/clients/${clientId}/nullplan-responses`,
            providesTags: ['User'],
        }),
        triggerImmediateReview: builder.mutation<{ success: boolean; error?: string }, string>({
            query: (userId) => ({
                url: `/api/admin/immediate-review/${userId}`,
                method: 'POST',
            }),
            invalidatesTags: ['User'],
        }),
        skipSevenDayDelay: builder.mutation<{ success: boolean }, string>({
            query: (clientId) => ({
                url: `/api/admin/clients/${clientId}/skip-seven-day-delay`,
                method: 'POST',
            }),
            invalidatesTags: ['User'],
        }),
        triggerAIDedup: builder.mutation<{ success: boolean; message?: string }, string>({
            query: (clientId) => ({
                url: `/api/admin/clients/${clientId}/trigger-ai-dedup`,
                method: 'POST',
            }),
            invalidatesTags: ['User'],
        }),
        simulate30DayPeriod: builder.mutation<{ success: boolean; message?: string }, string>({
            query: (clientId) => ({
                url: `/api/admin/clients/${clientId}/simulate-30-day-period`,
                method: 'POST',
            }),
            invalidatesTags: ['User'],
        }),
        deleteUser: builder.mutation<{ success: boolean; message?: string }, string>({
            query: (userId) => ({
                url: `/api/admin/users/${userId}`,
                method: 'DELETE',
            }),
            invalidatesTags: ['User'],
        }),
    }),
});

export interface DashboardStats {
    total_users: number;
    payment_confirmed: number;
    processing: number;
    needs_attention: number;
    awaiting_documents: number;
    active_users: number;
    total_documents: number;
    total_creditors: number;
    status_counts: Record<string, number>;
}

export const adminApiExtended = adminApi.injectEndpoints({
    endpoints: (builder) => ({
        getDashboardStats: builder.query<DashboardStats, { search?: string; status?: string; dateFrom?: string; dateTo?: string } | void>({
            query: (params) => {
                if (!params) return '/api/admin/dashboard-stats';
                const queryParams = new URLSearchParams();
                if (params.search) queryParams.append('search', params.search);
                if (params.status && params.status !== 'all') queryParams.append('status', params.status);
                if (params.dateFrom) queryParams.append('dateFrom', params.dateFrom);
                if (params.dateTo) queryParams.append('dateTo', params.dateTo);

                return `/api/admin/dashboard-stats?${queryParams.toString()}`;
            },
            providesTags: ['User'], // Invalidate when Users change
        }),
    }),
});

export const {
    useGetClientsQuery,
    useGetWorkflowStatusQuery,
    useGetSettlementResponsesQuery,
    useGetNullplanResponsesQuery,
    useTriggerImmediateReviewMutation,
    useSkipSevenDayDelayMutation,
    useGetDashboardStatsQuery,
    useDeleteUserMutation
} = adminApiExtended;
