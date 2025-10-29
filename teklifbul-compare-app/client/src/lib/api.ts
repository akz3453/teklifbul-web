import axios from 'axios';
import type { 
  Product, 
  Offer, 
  ComparisonResult, 
  LegacyComparisonResult,
  VendorOffer,
  Statistics, 
  ApiResponse,
  ExportOptions,
  MembershipConfig,
  SavingsData
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('❌ API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    console.log(`✅ API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error('❌ API Response Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export const apiService = {
  // Products
  async getProducts(): Promise<Product[]> {
    const response = await api.get<ApiResponse<Product[]>>('/products');
    return response.data.data;
  },

  async getProductByCode(urun_kodu: string): Promise<Product> {
    const response = await api.get<ApiResponse<Product>>(`/products/${urun_kodu}`);
    return response.data.data;
  },

  // Offers
  async getOffers(requestId?: string): Promise<Offer[]> {
    const response = await api.get<ApiResponse<Offer[]>>('/offers', {
      params: requestId ? { requestId } : {}
    });
    return response.data.data;
  },

  async getOfferById(id: string): Promise<Offer> {
    const response = await api.get<ApiResponse<Offer>>(`/offers/${id}`);
    return response.data.data;
  },

  async createOffer(offerData: Partial<Offer>): Promise<Offer> {
    const response = await api.post<ApiResponse<Offer>>('/offers', offerData);
    return response.data.data;
  },

  // Comparison
  async getComparison(params?: {
    urun_kodu?: string;
    tedarikci?: string;
    en_iyi_teklif?: boolean;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<LegacyComparisonResult[]>> {
    const response = await api.get<ApiResponse<LegacyComparisonResult[]>>('/comparison', {
      params,
    });
    return response.data;
  },

  // Enhanced comparison
  async getEnhancedComparison(requestId?: string, membership?: MembershipConfig): Promise<ComparisonResult> {
    const response = await api.get<ApiResponse<ComparisonResult>>('/compare', {
      params: {
        requestId,
        membership: membership ? JSON.stringify(membership) : undefined
      }
    });
    return response.data.data;
  },

  // Vendor ranking
  async getVendorRanking(productCode: string): Promise<{ productCode: string; ranking: VendorOffer[]; count: number }> {
    const response = await api.get<ApiResponse<{ productCode: string; ranking: VendorOffer[]; count: number }>>(`/ranking/${productCode}`);
    return response.data.data;
  },

  // Savings calculation
  async getSavings(requestId?: string): Promise<SavingsData> {
    const response = await api.get<ApiResponse<SavingsData>>('/savings', {
      params: requestId ? { requestId } : {}
    });
    return response.data.data;
  },

  // Statistics
  async getStatistics(): Promise<Statistics> {
    const response = await api.get<ApiResponse<Statistics>>('/statistics');
    return response.data.data;
  },

  // Export
  async exportData(type: 'xlsx' | 'csv'): Promise<Blob> {
    const response = await api.get('/export', {
      params: { type },
      responseType: 'blob',
    });
    return response.data;
  },

  // Enhanced export with template injection
  async exportComparison(
    requestId?: string, 
    mode: 'template' | 'csv' = 'template', 
    membership?: MembershipConfig
  ): Promise<Blob> {
    const response = await api.get('/export/compare', {
      params: {
        requestId,
        mode,
        membership: membership ? JSON.stringify(membership) : undefined
      },
      responseType: 'blob',
    });
    return response.data;
  },
};

// Utility functions
export const downloadFile = (blob: Blob, filename: string): void => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

export const formatCurrency = (amount: number, currency = 'TRY'): string => {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const formatPercentage = (value: number): string => {
  return `${value.toFixed(2)}%`;
};

export const formatDate = (dateString: string): string => {
  try {
    return new Date(dateString).toLocaleDateString('tr-TR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return dateString;
  }
};

export default apiService;
