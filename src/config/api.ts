import axios from 'axios';

// Mock data for demo purposes
const mockClient = {
  id: '12345',
  firstName: 'Max',
  lastName: 'Mustermann',
  email: 'max.mustermann@example.com',
  phone: '+49 123 456789',
  address: 'Musterstraße 123, 12345 Musterstadt',
  phase: 2,
  documents: [
    {
      id: '1',
      name: 'Gläubigerbrief_Bank.pdf',
      type: 'pdf',
      size: 245760,
      uploadedAt: '2025-01-15T10:30:00Z',
      url: '#'
    },
    {
      id: '2',
      name: 'Vertrag_Kreditkarte.pdf',
      type: 'pdf',
      size: 189440,
      uploadedAt: '2025-01-10T14:20:00Z',
      url: '#'
    }
  ],
  invoices: [
    {
      id: '1',
      invoiceNumber: '2025-001',
      amount: 450.00,
      dueDate: '2025-02-15',
      status: 'pending',
      description: 'Beratungshonorar Januar 2025',
      downloadUrl: '#'
    },
    {
      id: '2',
      invoiceNumber: '2024-089',
      amount: 300.00,
      dueDate: '2024-12-31',
      status: 'paid',
      description: 'Erstberatung und Vertragsunterzeichnung',
      downloadUrl: '#'
    }
  ]
};

// Conditional logging function
const log = (message: string, ...args: any[]) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(message, ...args);
  }
};

// API Base URL - automatically detects environment
const getApiBaseUrl = () => {
  // Force production URL if on Render
  if (window.location.hostname.includes('onrender.com')) {
    log('🌐 Using production API URL');
    return 'https://mandanten-portal-docker.onrender.com';
  }

  // If explicitly set in environment
  if (process.env.REACT_APP_API_URL) {
    log('🌐 Using environment API URL:', process.env.REACT_APP_API_URL);
    return process.env.REACT_APP_API_URL;
  }

  // Production detection
  if (process.env.NODE_ENV === 'production') {
    log('🌐 Using production mode API URL');
    return 'https://mandanten-portal-docker.onrender.com';
  }

  // Development default
  log('🌐 Using development API URL');
  return 'http://localhost:3001';
};

export const API_BASE_URL = getApiBaseUrl();

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Mock the API responses for demo
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    const status = error.response?.status;

    // ✅ Handle token expired / unauthorized
    if (status === 401 || error.response?.data?.error === "Token expired") {
      console.warn("⚠️ Token expired, clearing storage and redirecting...");

      // Save role before clearing
      const role = localStorage.getItem("active_role");

      // Clear everything
      localStorage.clear();

      // Redirect user to the correct login page
      if (role === "admin") {
        window.location.href = "/admin/login";
      } else if (role === "agent") {
        window.location.href = "/agent/login";
      } else {
        window.location.href = "/login";
      }
    }

    // ✅ Handle mock data for network errors
    if (error.code === "ECONNREFUSED" || error.code === "ERR_NETWORK") {
      if (url.includes("/clients/")) {
        return Promise.resolve({
          data: mockClient,
          status: 200,
          statusText: "OK",
          headers: {},
          config: error.config,
        });
      }

      if (url.includes("/proxy/forms/")) {
        return Promise.resolve({
          data: { additionalInfo: "Demo form data" },
          status: 200,
          statusText: "OK",
          headers: {},
          config: error.config,
        });
      }
    }

    // Otherwise, reject as usual
    return Promise.reject(error);
  }
);


// Request interceptor to add auth token if available
api.interceptors.request.use(
  (config) => {
    let token: string | null = null;
    let tokenType = 'None';

    // Priority 1: Admin token for admin endpoints (takes precedence)
    if (config.url?.includes('/admin/')) {
      token = localStorage.getItem('admin_token');
      if (token) {
        tokenType = 'Admin';
        log('🔑 Using admin token for admin endpoint:', config.url);
      }
    }

    // Priority 2: JWT token for authenticated requests
    if (!token) {
      token = localStorage.getItem('auth_token');
      if (token) {
        tokenType = 'JWT';
      }
    }

    // Priority 3: Portal session token as fallback
    if (!token) {
      token = localStorage.getItem('portal_session_token');
      if (token) {
        tokenType = 'Session';
      }
    }

    // Priority 4: Admin token as final fallback (if not admin endpoint)
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
  (error) => {
    return Promise.reject(error);
  }
);

export default api;