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

// API Base URL - automatically detects environment
const getApiBaseUrl = () => {
  // Force production URL if on Render
  if (window.location.hostname.includes('onrender.com')) {
    console.log('🌐 Using production API URL');
    return 'https://mandanten-portal-backend.onrender.com/api';
  }
  
  // If explicitly set in environment
  if (process.env.REACT_APP_API_URL) {
    console.log('🌐 Using environment API URL:', process.env.REACT_APP_API_URL);
    return process.env.REACT_APP_API_URL;
  }
  
  // Production detection
  if (process.env.NODE_ENV === 'production') {
    console.log('🌐 Using production mode API URL');
    return 'https://mandanten-portal-backend.onrender.com/api';
  }
  
  // Development default
  console.log('🌐 Using development API URL');
  return 'http://localhost:3001/api';
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
    // If API is not available, return mock data
    if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK') {
      const url = error.config?.url || '';
      
      if (url.includes('/clients/')) {
        return Promise.resolve({
          data: mockClient,
          status: 200,
          statusText: 'OK',
          headers: {},
          config: error.config
        });
      }
      
      if (url.includes('/proxy/forms/')) {
        return Promise.resolve({
          data: { additionalInfo: 'Demo form data' },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: error.config
        });
      }
    }
    
    return Promise.reject(error);
  }
);

// Request interceptor to add auth token if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;