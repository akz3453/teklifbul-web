import React, { useState, useEffect, useMemo } from 'react';
import { 
  RefreshCw, 
  Download, 
  FileSpreadsheet, 
  FileText, 
  Search,
  Filter,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Award
} from 'lucide-react';
import { 
  useReactTable, 
  getCoreRowModel, 
  getFilteredRowModel, 
  getSortedRowModel, 
  getPaginationRowModel,
  createColumnHelper,
  flexRender,
  ColumnDef,
  SortingState,
  ColumnFiltersState,
} from '@tanstack/react-table';
import type { ComparisonResult, Statistics } from '../types';
import { apiService } from '../lib/api';
import { 
  formatCurrency, 
  formatPercentage, 
  formatDate, 
  downloadFile, 
  generateTimestamp,
  cn 
} from '../lib/utils';

const columnHelper = createColumnHelper<ComparisonResult>();

export default function ComparePage() {
  const [data, setData] = useState<ComparisonResult[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [exporting, setExporting] = useState<'xlsx' | 'csv' | null>(null);

  // Load data
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [comparisonResponse, statsResponse] = await Promise.all([
        apiService.getComparison(),
        apiService.getStatistics()
      ]);
      
      setData(comparisonResponse.data);
      setStatistics(statsResponse);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Veri yüklenirken hata oluştu. Lütfen sayfayı yenileyin.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Export functions
  const handleExport = async (type: 'xlsx' | 'csv') => {
    try {
      setExporting(type);
      const blob = await apiService.exportData(type);
      const filename = `mukayese_${generateTimestamp()}.${type}`;
      downloadFile(blob, filename);
    } catch (err) {
      console.error('Export error:', err);
      alert('Dosya indirilirken hata oluştu.');
    } finally {
      setExporting(null);
    }
  };

  // Table columns - Format B: Detaylı Karşılaştırma
  const columns = useMemo<ColumnDef<ComparisonResult, any>[]>(
    () => [
      columnHelper.accessor('urun_kodu', {
        header: 'Ürün Kodu',
        cell: ({ getValue }) => (
          <span className="font-mono text-sm">{getValue()}</span>
        ),
      }),
      columnHelper.accessor('urun_adi', {
        header: 'Ürün Adı',
        cell: ({ getValue }) => (
          <span className="font-medium">{getValue()}</span>
        ),
      }),
      columnHelper.accessor('kategori', {
        header: 'Kategori',
        cell: ({ getValue }) => (
          <span className="text-sm text-gray-600">{getValue()}</span>
        ),
      }),
      columnHelper.accessor('tedarikci', {
        header: 'Tedarikçi',
        cell: ({ getValue, row }) => (
          <span className={cn(
            row.original.en_iyi_teklif && "font-semibold text-green-700"
          )}>
            {getValue()}
          </span>
        ),
      }),
      columnHelper.accessor('teklif_fiyati', {
        header: 'Teklif Fiyatı',
        cell: ({ getValue, row }) => (
          <span className={cn(
            "font-medium",
            row.original.en_iyi_teklif && "text-green-600 font-semibold"
          )}>
            {formatCurrency(getValue())}
          </span>
        ),
      }),
      columnHelper.accessor('kaynak_fiyat', {
        header: 'Kaynak Fiyat',
        cell: ({ getValue }) => (
          <span className="font-medium">{formatCurrency(getValue())}</span>
        ),
      }),
      columnHelper.accessor('fark', {
        header: 'Fark',
        cell: ({ getValue }) => {
          const diff = getValue();
          return (
            <span className={cn(
              "font-medium",
              diff > 0 ? "text-green-600" : diff < 0 ? "text-red-600" : "text-gray-600"
            )}>
              {formatCurrency(Math.abs(diff))}
              {diff > 0 && " ⬇️"}
              {diff < 0 && " ⬆️"}
            </span>
          );
        },
      }),
      columnHelper.accessor('fark_yuzde', {
        header: 'Fark %',
        cell: ({ getValue }) => {
          const percent = getValue();
          return (
            <span className={cn(
              "font-medium",
              percent > 0 ? "text-green-600" : percent < 0 ? "text-red-600" : "text-gray-600"
            )}>
              {formatPercentage(percent)}
            </span>
          );
        },
      }),
      columnHelper.accessor('teslim_suresi_gun', {
        header: 'Teslim (Gün)',
        cell: ({ getValue }) => (
          <span className="text-center">{getValue()}</span>
        ),
      }),
      columnHelper.accessor('teklif_tarihi', {
        header: 'Teklif Tarihi',
        cell: ({ getValue }) => (
          <span className="text-sm text-gray-600">{formatDate(getValue())}</span>
        ),
      }),
      columnHelper.accessor('en_iyi_teklif', {
        header: 'En İyi',
        cell: ({ getValue }) => (
          <span className={cn(
            "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium",
            getValue() 
              ? "bg-green-100 text-green-800" 
              : "bg-gray-100 text-gray-800"
          )}>
            {getValue() ? "🏆 Evet" : "Hayır"}
          </span>
        ),
      }),
    ],
    []
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Veriler yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button 
            onClick={loadData}
            className="btn-primary"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Tekrar Dene
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          📊 Ürün Teklif Karşılaştırması
        </h1>
        <p className="text-muted-foreground">
          Tüm ürünlerin tekliflerini karşılaştırın ve en iyi fiyatları bulun
        </p>
      </div>

      {/* Statistics */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-card p-6 rounded-lg border">
            <div className="flex items-center">
              <BarChart3 className="h-8 w-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Toplam Ürün</p>
                <p className="text-2xl font-bold">{statistics.toplam_urun}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-card p-6 rounded-lg border">
            <div className="flex items-center">
              <TrendingUp className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Toplam Teklif</p>
                <p className="text-2xl font-bold">{statistics.toplam_teklif}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-card p-6 rounded-lg border">
            <div className="flex items-center">
              <Award className="h-8 w-8 text-yellow-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">En İyi Teklif</p>
                <p className="text-2xl font-bold">{statistics.en_iyi_teklif_sayisi}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-card p-6 rounded-lg border">
            <div className="flex items-center">
              <TrendingDown className="h-8 w-8 text-red-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">En Yüksek Tasarruf</p>
                <p className="text-2xl font-bold">{formatCurrency(statistics.en_yuksek_tasarruf)}</p>
                <p className="text-xs text-muted-foreground">{statistics.en_yuksek_tasarruf_urun}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-card p-4 rounded-lg border mb-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          {/* Search */}
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Ara..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="px-3 py-2 border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={loading}
              className="btn-outline btn-sm"
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
              Yenile
            </button>
            
            <button
              onClick={() => handleExport('xlsx')}
              disabled={exporting === 'xlsx'}
              className="btn-primary btn-sm"
            >
              {exporting === 'xlsx' ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4 mr-2" />
              )}
              Excel İndir
            </button>
            
            <button
              onClick={() => handleExport('csv')}
              disabled={exporting === 'csv'}
              className="btn-secondary btn-sm"
            >
              {exporting === 'csv' ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              CSV İndir
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="comparison-table w-full">
            <thead>
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <th 
                      key={header.id}
                      className="cursor-pointer hover:bg-muted/80"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center gap-2">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc' && '↑'}
                        {header.column.getIsSorted() === 'desc' && '↓'}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map(row => (
                <tr 
                  key={row.id}
                  className={cn(
                    "hover:bg-muted/50",
                    row.original.en_iyi_teklif && "bg-green-50"
                  )}
                >
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between p-4 border-t">
          <div className="flex items-center gap-2">
            <button
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              className="btn-outline btn-sm"
            >
              İlk
            </button>
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="btn-outline btn-sm"
            >
              Önceki
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="btn-outline btn-sm"
            >
              Sonraki
            </button>
            <button
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
              className="btn-outline btn-sm"
            >
              Son
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Sayfa {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
            </span>
            <select
              value={table.getState().pagination.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              className="px-2 py-1 border border-input rounded text-sm"
            >
              {[10, 20, 30, 40, 50].map(pageSize => (
                <option key={pageSize} value={pageSize}>
                  {pageSize} satır
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-sm text-muted-foreground">
        <p>Son güncelleme: {new Date().toLocaleString('tr-TR')}</p>
        <p className="mt-1">
          Toplam {data.length} kayıt • 
          En iyi teklif: {data.filter(d => d.en_iyi_teklif).length} adet
        </p>
      </div>
    </div>
  );
}
