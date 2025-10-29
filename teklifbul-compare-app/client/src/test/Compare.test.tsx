import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ComparePage from '../pages/Compare';
import * as apiService from '../lib/api';

// Mock the API service
vi.mock('../lib/api', () => ({
  apiService: {
    getComparison: vi.fn(),
    getStatistics: vi.fn(),
    exportData: vi.fn(),
  },
}));

// Mock data
const mockComparisonData = [
  {
    urun_kodu: 'PRD001',
    urun_adi: 'Test Product 1',
    kategori: 'Test Category',
    kaynak_fiyat: 100,
    tedarikci: 'Supplier A',
    teklif_fiyati: 90,
    fark: 10,
    fark_yuzde: 10,
    en_iyi_teklif: true,
    para_birimi: 'TRY',
    min_siparis: 10,
    teslim_suresi_gun: 5,
    teklif_tarihi: '2025-01-21',
    durum: 'aktif',
  },
  {
    urun_kodu: 'PRD002',
    urun_adi: 'Test Product 2',
    kategori: 'Test Category',
    kaynak_fiyat: 200,
    tedarikci: 'Supplier B',
    teklif_fiyati: 220,
    fark: -20,
    fark_yuzde: -10,
    en_iyi_teklif: false,
    para_birimi: 'TRY',
    min_siparis: 20,
    teslim_suresi_gun: 7,
    teklif_tarihi: '2025-01-20',
    durum: 'aktif',
  },
];

const mockStatistics = {
  toplam_urun: 2,
  toplam_teklif: 2,
  en_iyi_teklif_sayisi: 1,
  ortalama_fark_yuzde: 0,
  en_yuksek_tasarruf: 10,
  en_yuksek_tasarruf_urun: 'Test Product 1',
};

describe('ComparePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mocks
    vi.mocked(apiService.apiService.getComparison).mockResolvedValue({
      success: true,
      data: mockComparisonData,
      count: mockComparisonData.length,
      timestamp: new Date().toISOString(),
    });
    
    vi.mocked(apiService.apiService.getStatistics).mockResolvedValue(mockStatistics);
    
    vi.mocked(apiService.apiService.exportData).mockResolvedValue(
      new Blob(['mock data'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    );
  });

  it('renders loading state initially', async () => {
    render(<ComparePage />);
    
    expect(screen.getByText('Veriler yükleniyor...')).toBeInTheDocument();
  });

  it('renders comparison data after loading', async () => {
    render(<ComparePage />);
    
    await waitFor(() => {
      expect(screen.getByText('Ürün Teklif Karşılaştırması')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Test Product 1')).toBeInTheDocument();
    expect(screen.getByText('Test Product 2')).toBeInTheDocument();
    expect(screen.getByText('Supplier A')).toBeInTheDocument();
    expect(screen.getByText('Supplier B')).toBeInTheDocument();
  });

  it('displays statistics correctly', async () => {
    render(<ComparePage />);
    
    await waitFor(() => {
      expect(screen.getByText('Toplam Ürün')).toBeInTheDocument();
    });
    
    expect(screen.getByText('2')).toBeInTheDocument(); // Total products
    expect(screen.getByText('En İyi Teklif')).toBeInTheDocument();
  });

  it('handles search functionality', async () => {
    const user = userEvent.setup();
    render(<ComparePage />);
    
    await waitFor(() => {
      expect(screen.getByText('Test Product 1')).toBeInTheDocument();
    });
    
    const searchInput = screen.getByPlaceholderText('Ara...');
    await user.type(searchInput, 'Product 1');
    
    expect(screen.getByText('Test Product 1')).toBeInTheDocument();
    expect(screen.queryByText('Test Product 2')).not.toBeInTheDocument();
  });

  it('handles export functionality', async () => {
    const user = userEvent.setup();
    render(<ComparePage />);
    
    await waitFor(() => {
      expect(screen.getByText('Excel İndir')).toBeInTheDocument();
    });
    
    const excelButton = screen.getByText('Excel İndir');
    await user.click(excelButton);
    
    await waitFor(() => {
      expect(apiService.apiService.exportData).toHaveBeenCalledWith('xlsx');
    });
  });

  it('displays error state when API fails', async () => {
    vi.mocked(apiService.apiService.getComparison).mockRejectedValue(
      new Error('API Error')
    );
    
    render(<ComparePage />);
    
    await waitFor(() => {
      expect(screen.getByText('Veri yüklenirken hata oluştu. Lütfen sayfayı yenileyin.')).toBeInTheDocument();
    });
  });

  it('handles refresh functionality', async () => {
    const user = userEvent.setup();
    render(<ComparePage />);
    
    await waitFor(() => {
      expect(screen.getByText('Yenile')).toBeInTheDocument();
    });
    
    const refreshButton = screen.getByText('Yenile');
    await user.click(refreshButton);
    
    expect(apiService.apiService.getComparison).toHaveBeenCalledTimes(2);
    expect(apiService.apiService.getStatistics).toHaveBeenCalledTimes(2);
  });

  it('displays best offer indicators correctly', async () => {
    render(<ComparePage />);
    
    await waitFor(() => {
      expect(screen.getByText('🏆 Evet')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Hayır')).toBeInTheDocument();
  });
});
