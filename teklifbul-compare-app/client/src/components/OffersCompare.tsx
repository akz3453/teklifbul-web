import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Download, 
  Filter, 
  Search, 
  RefreshCw, 
  TrendingUp, 
  Award,
  MoreHorizontal,
  Eye,
  EyeOff
} from 'lucide-react';
import { apiService, downloadFile, formatCurrency, formatDate } from '../lib/api';
import ExportToolbar from './ExportToolbar';
import type { 
  ComparisonResult, 
  ComparisonRow, 
  VendorOffer, 
  MembershipConfig,
  SavingsData
} from '../types';

interface OffersCompareProps {
  requestId?: string;
  membership?: MembershipConfig;
  onExport?: (mode: 'template' | 'csv') => void;
}

export const OffersCompare: React.FC<OffersCompareProps> = ({
  requestId,
  membership = { tier: 'standard', maxVendors: 3, maxVendorsPerSheet: 5 },
  onExport
}) => {
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [savings, setSavings] = useState<SavingsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'pivot'>('table');
  const [filters, setFilters] = useState({
    search: '',
    vendor: '',
    brand: '',
    maxLeadTime: '',
    paymentTerms: '',
    minSavings: ''
  });
  const [sortConfig, setSortConfig] = useState<{
    key: keyof ComparisonRow | 'bestTotalTL';
    direction: 'asc' | 'desc';
  }>({ key: 'bestTotalTL', direction: 'asc' });

  // Load comparison data
  useEffect(() => {
    loadComparison();
  }, [requestId, membership]);

  const loadComparison = async () => {
    setLoading(true);
    setError(null);
    try {
      const [comparisonData, savingsData] = await Promise.all([
        apiService.getEnhancedComparison(requestId, membership),
        apiService.getSavings(requestId)
      ]);
      setComparison(comparisonData);
      setSavings(savingsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Veri yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort data
  const filteredAndSortedRows = useMemo(() => {
    if (!comparison?.rows) return [];

    const filtered = comparison.rows.filter(row => {
      // Search filter
      if (filters.search && !row.productName.toLowerCase().includes(filters.search.toLowerCase()) &&
          !row.productCode.toLowerCase().includes(filters.search.toLowerCase())) {
        return false;
      }

      // Vendor filter
      if (filters.vendor && !row.vendors.some(v => v.vendor.toLowerCase().includes(filters.vendor.toLowerCase()))) {
        return false;
      }

      // Brand filter
      if (filters.brand && !row.vendors.some(v => v.brand?.toLowerCase().includes(filters.brand.toLowerCase()))) {
        return false;
      }

      // Lead time filter
      if (filters.maxLeadTime && !row.vendors.some(v => 
        v.leadTimeDays && v.leadTimeDays <= parseInt(filters.maxLeadTime)
      )) {
        return false;
      }

      // Payment terms filter
      if (filters.paymentTerms && !row.vendors.some(v => 
        v.paymentTerms?.includes(filters.paymentTerms)
      )) {
        return false;
      }

      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;
      
      if (sortConfig.key === 'bestTotalTL') {
        aValue = a.bestTotalTL;
        bValue = b.bestTotalTL;
      } else {
        aValue = a[sortConfig.key];
        bValue = b[sortConfig.key];
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [comparison?.rows, filters, sortConfig]);

  const handleSort = (key: keyof ComparisonRow | 'bestTotalTL') => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleExport = async (mode: 'template' | 'csv') => {
    try {
      setLoading(true);
      const blob = await apiService.exportComparison(requestId, mode, membership);
      const filename = mode === 'template' 
        ? `mukayese_${new Date().toISOString().slice(0, 10)}.xlsx`
        : `mukayese_${new Date().toISOString().slice(0, 10)}.csv`;
      
      downloadFile(blob, filename);
      onExport?.(mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export sırasında hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const getRankBadge = (rank: number) => {
    const badges = {
      1: { icon: '🥇', color: 'bg-yellow-100 text-yellow-800' },
      2: { icon: '🥈', color: 'bg-gray-100 text-gray-800' },
      3: { icon: '🥉', color: 'bg-orange-100 text-orange-800' },
    };
    
    const badge = badges[rank as keyof typeof badges];
    return badge ? (
      <Badge className={badge.color}>
        {badge.icon} {rank}
      </Badge>
    ) : (
      <Badge variant="outline">#{rank}</Badge>
    );
  };

  const getCurrencySymbol = (currency: string) => {
    const symbols: Record<string, string> = {
      'TRY': '₺',
      'USD': '$',
      'EUR': '€',
      'GBP': '£'
    };
    return symbols[currency] || currency;
  };

  if (loading && !comparison) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Veriler yükleniyor...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="pt-6">
          <div className="text-center text-red-600">
            <p>{error}</p>
            <Button onClick={loadComparison} className="mt-4" variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Tekrar Dene
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!comparison) return null;

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <div className="ml-2">
                <p className="text-sm font-medium">En İyi Firma</p>
                <p className="text-2xl font-bold">{comparison.bestOverallVendor}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <Award className="h-4 w-4 text-muted-foreground" />
              <div className="ml-2">
                <p className="text-sm font-medium">Toplam Ürün</p>
                <p className="text-2xl font-bold">{comparison.totalProducts}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <div className="ml-2">
                <p className="text-sm font-medium">Toplam Tasarruf</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(savings?.totalSavingsTL || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <Award className="h-4 w-4 text-muted-foreground" />
              <div className="ml-2">
                <p className="text-sm font-medium">Ortalama Tasarruf</p>
                <p className="text-2xl font-bold text-blue-600">
                  %{savings?.averageSavingsPercent.toFixed(1) || '0'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Export Toolbar */}
      <ExportToolbar 
        requestId={requestId}
        membership={membership.tier}
        onExportStart={() => setLoading(true)}
        onExportComplete={() => setLoading(false)}
        onExportError={(error) => setError(error)}
      />

      {/* Filters and Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Teklif Karşılaştırması</CardTitle>
            <div className="flex items-center space-x-2">
              <Button onClick={loadComparison} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Yenile
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-4">
            <Input
              placeholder="Ürün ara..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              className="col-span-2"
            />
            <Input
              placeholder="Tedarikçi ara..."
              value={filters.vendor}
              onChange={(e) => setFilters(prev => ({ ...prev, vendor: e.target.value }))}
            />
            <Input
              placeholder="Marka ara..."
              value={filters.brand}
              onChange={(e) => setFilters(prev => ({ ...prev, brand: e.target.value }))}
            />
            <Input
              placeholder="Max teslim (gün)"
              type="number"
              value={filters.maxLeadTime}
              onChange={(e) => setFilters(prev => ({ ...prev, maxLeadTime: e.target.value }))}
            />
            <Select value={filters.paymentTerms} onValueChange={(value) => 
              setFilters(prev => ({ ...prev, paymentTerms: value }))
            }>
              <SelectTrigger>
                <SelectValue placeholder="Ödeme şartı" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Tümü</SelectItem>
                <SelectItem value="Peşin">Peşin</SelectItem>
                <SelectItem value="30">30 Gün</SelectItem>
                <SelectItem value="45">45 Gün</SelectItem>
                <SelectItem value="60">60 Gün</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* View Mode Tabs */}
          <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'table' | 'pivot')}>
            <TabsList>
              <TabsTrigger value="table">Tablo Görünümü</TabsTrigger>
              <TabsTrigger value="pivot">Pivot Görünümü</TabsTrigger>
            </TabsList>
            
            <TabsContent value="table" className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => handleSort('productCode')}
                    >
                      Ürün Kodu
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => handleSort('productName')}
                    >
                      Ürün Adı
                    </TableHead>
                    <TableHead>Miktar / Birim</TableHead>
                    <TableHead>Tedarikçi</TableHead>
                    <TableHead>Fiyat</TableHead>
                    <TableHead>Nakliye</TableHead>
                    <TableHead>Ödeme Şartı</TableHead>
                    <TableHead>Teslim</TableHead>
                    <TableHead>Marka</TableHead>
                    <TableHead>Min. Sipariş</TableHead>
                    <TableHead>KDV %</TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => handleSort('bestTotalTL')}
                    >
                      Toplam (TL)
                    </TableHead>
                    <TableHead>Durum / Not</TableHead>
                    <TableHead>Sıralama</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedRows.map((row, rowIndex) => 
                    row.vendors.map((vendor, vendorIndex) => (
                      <TableRow key={`${row.productCode}-${vendor.vendor}`}>
                        {vendorIndex === 0 && (
                          <>
                            <TableCell rowSpan={row.vendors.length}>
                              {row.productCode}
                            </TableCell>
                            <TableCell rowSpan={row.vendors.length}>
                              {row.productName}
                            </TableCell>
                            <TableCell rowSpan={row.vendors.length}>
                              {row.qty} {row.unit}
                            </TableCell>
                          </>
                        )}
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <span>{vendor.vendor}</span>
                            {vendor.isBest && (
                              <Badge variant="default" className="bg-green-100 text-green-800">
                                En İyi
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-1">
                            <span>{getCurrencySymbol(vendor.currency)}</span>
                            <span>{vendor.unitPrice.toFixed(2)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>{vendor.shippingType}</div>
                            {vendor.shippingCost && vendor.shippingCost > 0 && (
                              <div className="text-muted-foreground">
                                {formatCurrency(vendor.shippingCost, vendor.currency)}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{vendor.paymentTerms || '-'}</TableCell>
                        <TableCell>
                          {vendor.deliveryDate ? (
                            <div className="text-sm">
                              <div>{formatDate(vendor.deliveryDate)}</div>
                              {vendor.leadTimeDays && (
                                <div className="text-muted-foreground">
                                  ({vendor.leadTimeDays} gün)
                                </div>
                              )}
                            </div>
                          ) : vendor.leadTimeDays ? (
                            `${vendor.leadTimeDays} gün`
                          ) : '-'}
                        </TableCell>
                        <TableCell>{vendor.brand || '-'}</TableCell>
                        <TableCell>{vendor.minOrderQty || '-'}</TableCell>
                        <TableCell>{vendor.vatRate || 20}%</TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {formatCurrency(vendor.totalTL)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-xs truncate">
                            {vendor.notes || '-'}
                          </div>
                        </TableCell>
                        <TableCell>
                          {getRankBadge(vendor.rank)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>
            
            <TabsContent value="pivot" className="mt-4">
              <div className="space-y-4">
                {filteredAndSortedRows.map((row) => (
                  <Card key={row.productCode}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold">{row.productName}</h3>
                          <p className="text-sm text-muted-foreground">
                            {row.productCode} - {row.qty} {row.unit}
                          </p>
                        </div>
                        <Badge variant="outline">
                          En İyi: {row.bestVendor}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {row.vendors.map((vendor) => (
                          <Card key={vendor.vendor} className={`${vendor.isBest ? 'ring-2 ring-green-500' : ''}`}>
                            <CardContent className="pt-4">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="font-medium">{vendor.vendor}</h4>
                                {getRankBadge(vendor.rank)}
                              </div>
                              <div className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                  <span>Birim Fiyat:</span>
                                  <span>{getCurrencySymbol(vendor.currency)}{vendor.unitPrice.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Termin:</span>
                                  <span>{vendor.leadTimeDays || '-'} gün</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Toplam (TL):</span>
                                  <span className="font-medium">{formatCurrency(vendor.totalTL)}</span>
                                </div>
                                {vendor.shippingType && (
                                  <div className="flex justify-between">
                                    <span>Nakliye:</span>
                                    <span>{vendor.shippingType}</span>
                                  </div>
                                )}
                                {vendor.paymentTerms && (
                                  <div className="flex justify-between">
                                    <span>Ödeme:</span>
                                    <span>{vendor.paymentTerms}</span>
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default OffersCompare;
