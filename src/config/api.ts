import axios from 'axios';
import { updateStoredTokens, clearAuthStorage } from './tokenStorage';

// Conditional logging function
const log = (message: string, ...args: any[]) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(message, ...args);
  }
};

// API Base URL - automatically detects environment
const getApiBaseUrl = () => {
  if (window.location.hostname.includes('onrender.com')) {
    log('🌐 Using production API URL');
    return 'https://mandanten-portal-docker.onrender.com';
  }
  if (process.env.REACT_APP_API_URL) {
    log('🌐 Using environment API URL:', process.env.REACT_APP_API_URL);
    return process.env.REACT_APP_API_URL;
  }
  if (process.env.NODE_ENV === 'production') {
    log('🌐 Using production mode API URL');
    return 'https://mandanten-portal-docker.onrender.com';
  }
  log('🌐 Using development API URL');
  return 'http://localhost:10000';
};

export const API_BASE_URL = getApiBaseUrl();

// Token refresh state
let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: any) => void }> = [];

const processQueue = (error: any, token: string | null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (token) {
      resolve(token);
    } else {
      reject(error);
    }
  });
  failedQueue = [];
};

const getLoginPath = () => {
  const role = localStorage.getItem('active_role');
  if (role === 'admin') {
    return '/admin/login';
  }
  if (role === 'agent') {
    return '/agent/login';
  }
  return '/login';
};

const SKIP_REFRESH_PATTERNS = ['/login', '/verify-code', '/refresh-token', '/request-verification-code'];

const shouldSkipRefresh = (url: string) => {
  return SKIP_REFRESH_PATTERNS.some(pattern => url.includes(pattern));
};

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor — refresh token on 401 before redirecting
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const url = originalRequest?.url || '';
    const status = error.response?.status;

    // Handle 401 with token refresh
    if (status === 401 && !originalRequest._retry && !shouldSkipRefresh(url)) {
      if (isRefreshing) {
        // Another refresh in progress — queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(api(originalRequest));
            },
            reject: (err: any) => {
              reject(err);
            },
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const currentToken =
          localStorage.getItem('admin_token') ||
          localStorage.getItem('auth_token') ||
          localStorage.getItem('portal_session_token');

        if (!currentToken) {
          throw new Error('No token available');
        }

        const refreshResponse = await axios.post(
          `${API_BASE_URL}/api/auth/refresh-token`,
          {},
          { headers: { Authorization: `Bearer ${currentToken}` } }
        );

        const { token: newToken, type } = refreshResponse.data;

        updateStoredTokens(newToken, type);

        log('🔄 Token refreshed successfully');

        processQueue(null, newToken);

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);

        // Refresh failed — clear auth storage and redirect
        console.warn('⚠️ Token refresh failed, redirecting to login');
        const loginPath = getLoginPath();
        clearAuthStorage();
        window.location.href = loginPath;

        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Handle network errors with mock data (existing behavior)
    if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK') {
      if (url.includes('/clients/')) {
        return Promise.resolve({
          data: { id: 'mock' },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: error.config,
        });
      }
    }

    return Promise.reject(error);
  }
);

// Request interceptor to add auth token if available
api.interceptors.request.use(
  (config) => {
    let token: string | null = null;
    let tokenType = 'None';

    if (config.url?.includes('/admin/')) {
      token = localStorage.getItem('admin_token');
      if (token) {
        tokenType = 'Admin';
        log('🔑 Using admin token for admin endpoint:', config.url);
      }
    }

    if (!token) {
      token = localStorage.getItem('auth_token');
      if (token) {
        tokenType = 'JWT';
      }
    }

    if (!token) {
      token = localStorage.getItem('portal_session_token');
      if (token) {
        tokenType = 'Session';
      }
    }

    if (!token) {
      token = localStorage.getItem('admin_token');
      if (token) {
        tokenType = 'Admin (fallback)';
      }
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      log('🔑 API request with token:', {
        url: config.url,
        hasToken: !!token,
        tokenType,
        tokenPreview: `${token.substring(0, 10)}...`
      });
    } else {
      log('⚠️ API request without token:', config.url);
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Proactive token refresh — schedule refresh before expiry
let proactiveRefreshTimer: ReturnType<typeof setTimeout> | null = null;

function decodeTokenPayload(token: string): any {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

async function refreshTokenNow(): Promise<boolean> {
  const currentToken =
    localStorage.getItem('admin_token') ||
    localStorage.getItem('auth_token') ||
    localStorage.getItem('portal_session_token');

  if (!currentToken) {
    return false;
  }

  try {
    const response = await axios.post(
      `${API_BASE_URL}/api/auth/refresh-token`,
      {},
      { headers: { Authorization: `Bearer ${currentToken}` } }
    );

    const { token: newToken, type } = response.data;

    updateStoredTokens(newToken, type);

    log('🔄 Proactive token refresh successful');
    return true;
  } catch {
    log('⚠️ Proactive token refresh failed');
    return false;
  }
}

export function startProactiveTokenRefresh(): void {
  if (proactiveRefreshTimer) {
    clearTimeout(proactiveRefreshTimer);
    proactiveRefreshTimer = null;
  }

  const token = localStorage.getItem('auth_token');
  if (!token) {
    return;
  }

  const payload = decodeTokenPayload(token);
  if (!payload?.exp) {
    return;
  }

  // Refresh 15 minutes before expiry
  const msUntilRefresh = (payload.exp * 1000) - Date.now() - (15 * 60 * 1000);

  if (msUntilRefresh <= 0) {
    // Token about to expire or already near expiry — refresh now
    refreshTokenNow().then((success) => {
      if (success) {
        startProactiveTokenRefresh();
      }
    });
    return;
  }

  log(`⏰ Proactive token refresh scheduled in ${Math.round(msUntilRefresh / 60000)} min`);

  proactiveRefreshTimer = setTimeout(async () => {
    const success = await refreshTokenNow();
    if (success) {
      startProactiveTokenRefresh();
    }
  }, msUntilRefresh);
}

export default api;
