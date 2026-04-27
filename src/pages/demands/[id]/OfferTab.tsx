/**
 * Teklif Sekmesi - React Komponenti
 * 
 * Talep detay sayfasında tedarikçinin tek ekranda teklif doldurmasını sağlar.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { OfferSchema } from '../../../domain/offer/schema';
import type { Offer, Currency } from '../../../domain/offer/schema';
import { mapDemandToOfferHeader, mapDemandItemsToOfferLines, calculateDifference } from '../../../domain/offer/mapping';
import type { DifferenceResult } from '../../../domain/offer/mapping';
import { requiresCurrencyInfo, getCurrencyNameTR } from '../../../services/currency';
import type { DemandData } from '../../../domain/offer/schema';
// @ts-expect-error -- shared/ui/toast.js JS modülü, type tanımı eklenecek
import { toast } from '../../../shared/ui/toast.js';
// @ts-expect-error -- shared/constants/messages.js JS modülü, type tanımı eklenecek
import { MESSAGES } from '../../../shared/constants/messages.js';
// Teklifbul Rule v1.0 - Permission Matrix (bids.view/create/edit/approve/compare)
// @ts-expect-error -- assets/js/state/permissions.js JS modülü, type tanımı eklenecek
import {
  initPermissions,
  can as canPermission,
  requirePerm,
  getBidPerms,
} from '../../../../assets/js/state/permissions.js';
import { exportSupplierOfferBrowser } from '../../../export/excel/supplierOfferExport';
import { importSupplierOfferBrowser } from '../../../import/excel/supplierOfferImport';
import { useCancellableTask } from '../../../shared/hooks/useCancellableTask';
import { ProgressBar } from '../../../shared/ui/ProgressBar';

interface OfferTabProps {
  demandData: DemandData;
  onSubmit?: (offer: Offer) => Promise<void>;
}

/**
 * Hesaplama fonksiyonları
 */
function calculateNetUnitWithVat(unitPrice: number, vatRate: number): number {
  return unitPrice * (1 + vatRate / 100);
}

function calculateTotalExVat(quantity: number, unitPrice: number): number {
  return quantity * unitPrice;
}

function calculateTotalWithVat(quantity: number, netUnitWithVat: number): number {
  return quantity * netUnitWithVat;
}

/**
 * Fark gösterimi komponenti
 */
function DifferenceBadge({ diff }: { diff: DifferenceResult }) {
  if (!diff.hasDifference) return null;
  
  const badges: React.JSX.Element[] = [];
  
  if (diff.quantityDiff !== undefined && diff.quantityDiff !== 0) {
    const sign = diff.quantityDiff > 0 ? '+' : '';
    badges.push(
      <span key="qty" style={{ backgroundColor: '#fef3c7', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', marginLeft: '4px' }}>
        {sign}{diff.quantityDiff}
      </span>
    );
  }
  
  if (diff.pricePercentDiff !== undefined && diff.pricePercentDiff !== 0) {
    const sign = diff.pricePercentDiff > 0 ? '+' : '';
    badges.push(
      <span key="price" style={{ backgroundColor: diff.pricePercentDiff > 0 ? '#fee2e2' : '#d1fae5', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', marginLeft: '4px' }}>
        %{sign}{diff.pricePercentDiff.toFixed(1)}
      </span>
    );
  }
  
  if (diff.deliveryDateDiff !== undefined && diff.deliveryDateDiff !== 0) {
    const sign = diff.deliveryDateDiff > 0 ? '+' : '';
    badges.push(
      <span key="date" style={{ backgroundColor: '#dbeafe', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', marginLeft: '4px' }}>
        {sign}{diff.deliveryDateDiff} gün
      </span>
    );
  }
  
  return <>{badges}</>;
}

export default function OfferTab({ demandData, onSubmit }: OfferTabProps) {
  const [showCurrencySection, setShowCurrencySection] = useState(false);
  const [currencyInfo, setCurrencyInfo] = useState<any>(null);
  const bidPerms = useMemo(() => getBidPerms(), []);
  const [permLoading, setPermLoading] = useState(true);
  const [perm, setPerm] = useState({
    canView: true,
    canCreate: true,
    canEdit: true,
    canApprove: true,
    canCompare: true,
  });
  
  // Excel export için progress tracking
  const exportTask = useCancellableTask<Blob>();
  // Excel import için progress tracking
  const importTask = useCancellableTask<Offer>();
  
  // Form başlangıç değerleri
  const defaultValues = useMemo(() => {
    const header = mapDemandToOfferHeader(demandData);
    const lines = mapDemandItemsToOfferLines(demandData);
    
    // Hesaplanan değerleri doldur
    const linesWithCalculations = lines.map(line => ({
      ...line,
      netUnitWithVat: calculateNetUnitWithVat(line.unitPrice || 0, line.vatRate || 18),
      totalExVat: calculateTotalExVat(line.quantity || 0, line.unitPrice || 0),
      totalWithVat: calculateTotalWithVat(
        line.quantity || 0,
        calculateNetUnitWithVat(line.unitPrice || 0, line.vatRate || 18)
      ),
    }));
    
    return {
      header,
      lines: linesWithCalculations,
      currencyInfo: null,
      validUntil: undefined,
    };
  }, [demandData]);
  
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors: _errors },
  } = useForm<Offer>({
    resolver: zodResolver(OfferSchema) as any,
    defaultValues: defaultValues as any,
  });
  
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'lines',
  });
  
  const watchedLines = watch('lines');
  const watchedCurrency = watch('header.currency');

  // Permission init - Teklif sekmesi (React) bids.view/create/edit/approve/compare
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const permState = await initPermissions({ redirectOnPending: true });
        if (!permState) {
          if (mounted) {
            setPerm({
              canView: false,
              canCreate: false,
              canEdit: false,
              canApprove: false,
              canCompare: false,
            });
            setPermLoading(false);
          }
          return;
        }

        let canView = true;
        let canCreate = true;
        let canEdit = true;
        let canApprove = true;
        let canCompare = true;

        if (bidPerms.view) canView = canPermission(bidPerms.view);
        if (bidPerms.create) canCreate = canPermission(bidPerms.create);
        if (bidPerms.edit) canEdit = canPermission(bidPerms.edit);
        if (bidPerms.approve) canApprove = canPermission(bidPerms.approve);
        if (bidPerms.compare) canCompare = canPermission(bidPerms.compare);

        if (mounted) {
          setPerm({ canView, canCreate, canEdit, canApprove, canCompare });
          setPermLoading(false);
        }
      } catch (error: any) {
        // Fail-open yerine minimum bilgilendirme; HTML tarafındaki can() davranışı ile uyumlu
        toast.error(
          (MESSAGES.ERROR_PERMISSION as string) ||
            'Yetki bilgileri yüklenirken bir hata oluştu.',
        );
        if (mounted) {
          setPerm({
            canView: true,
            canCreate: true,
            canEdit: true,
            canApprove: true,
            canCompare: true,
          });
          setPermLoading(false);
        }
      }
    };

    void init();

    return () => {
      mounted = false;
    };
  }, [bidPerms]);
  
  // Para birimi değiştiğinde kur bölümünü göster/gizle
  useEffect(() => {
    if (watchedCurrency && requiresCurrencyInfo(watchedCurrency as Currency)) {
      setShowCurrencySection(true);
    } else {
      setShowCurrencySection(false);
      setCurrencyInfo(null);
    }
  }, [watchedCurrency]);
  
  // Satır değiştiğinde hesaplamaları güncelle
  useEffect(() => {
    watchedLines.forEach((line, index) => {
      const quantity = line.quantity || 0;
      const unitPrice = line.unitPrice || 0;
      const vatRate = line.vatRate || 18;
      
      const netUnitWithVat = calculateNetUnitWithVat(unitPrice, vatRate);
      const totalExVat = calculateTotalExVat(quantity, unitPrice);
      const totalWithVat = calculateTotalWithVat(quantity, netUnitWithVat);
      
      setValue(`lines.${index}.netUnitWithVat`, netUnitWithVat);
      setValue(`lines.${index}.totalExVat`, totalExVat);
      setValue(`lines.${index}.totalWithVat`, totalWithVat);
    });
  }, [watchedLines, setValue]);
  
  const onSubmitForm = async (data: Offer) => {
    try {
      // Permission Write Guard - Teklif Gönder (bids.create)
      if (bidPerms.create) {
        const ok = await requirePerm(bidPerms.create, {
          toastMessage:
            (MESSAGES.ERROR_PERMISSION_BIDS_CREATE as string) ||
            'Teklif gönderme yetkiniz yok.',
        });
        if (!ok) {
          return;
        }
      }

      if (currencyInfo) {
        data.currencyInfo = currencyInfo;
      }
      
      if (onSubmit) {
        await onSubmit(data);
      } else {
        // Teklifbul Rule v1.0 - authFetch ile token + x-company-id otomatik
        // @ts-expect-error -- assets/js/utils/api-helpers.js JS modülü, type tanımı eklenecek
        const { authFetch } = await import('../../../../assets/js/utils/api-helpers.js');
        const response = await authFetch('/api/offers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          throw new Error('Teklif gonderilemedi');
        }

        toast.success(MESSAGES.SUCCESS_BID_SENT_ALT);
      }
    } catch (error: any) {
      toast.error(`Hata: ${error.message}`);
    }
  };

  // Excel export handler
  const handleExcelExport = async () => {
    const formData = watch();
    if (!formData) {
      toast.error(MESSAGES.ERROR_BID_FORM_DATA_NOT_FOUND);
      return;
    }

    try {
      await exportTask.start(async (signal, reportProgress) => {
        const blob = await exportSupplierOfferBrowser(formData, signal, reportProgress);
        
        // Blob'u indir
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        // @ts-expect-error -- demandData.header tipi optional, runtime'da kontrol edilmis
        a.download = `teklif_${demandData.header?.satfkCode || 'export'}_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        toast.success(MESSAGES.SUCCESS_EXCEL_DOWNLOADED);
        return blob;
      });
    } catch (error: any) {
      if (error.message !== 'İşlem iptal edildi') {
        toast.error(`Excel export hatası: ${error.message}`);
      }
    }
  };

  // Excel import handler
  const handleExcelImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    // Dosya tipi kontrolü
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast.error(MESSAGES.ERROR_EXCEL_FILE_TYPE);
      return;
    }

    try {
      await importTask.start(async (signal, reportProgress) => {
        const offer = await importSupplierOfferBrowser(file, signal, reportProgress);
        
        // Form'u import edilen verilerle doldur
        setValue('header', offer.header);
        setValue('lines', offer.lines);
        if (offer.currencyInfo) {
          setCurrencyInfo(offer.currencyInfo);
        }
        
        toast.success(MESSAGES.SUCCESS_EXCEL_UPLOADED);
        return offer;
      });
    } catch (error: any) {
      if (error.message !== 'İşlem iptal edildi') {
        toast.error(`Excel import hatası: ${error.message}`);
      }
    } finally {
      // Input'u temizle
      event.target.value = '';
    }
  };
  
  // Permission loading & view guard
  if (permLoading) {
    return (
      <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
        <p>Yetki bilgileri yükleniyor...</p>
      </div>
    );
  }

  if (!perm.canView) {
    return (
      <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
        <h2 style={{ marginBottom: '12px' }}>Teklif Formu</h2>
        <div
          style={{
            padding: '16px',
            borderRadius: '8px',
            border: '1px solid #fee2e2',
            backgroundColor: '#fef2f2',
            color: '#b91c1c',
            fontSize: '14px',
          }}
        >
          <strong>Teklifleri görüntüleme yetkiniz yok.</strong>
          <div style={{ marginTop: '4px' }}>
            Bu talep için teklif göndermek veya görüntülemek için şirket
            yöneticinizden yetki talep etmeniz gerekir.
          </div>
        </div>
      </div>
    );
  }

  const isSubmitDisabled =
    importTask.isRunning || exportTask.isRunning || !perm.canCreate;

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '20px' }}>Teklif Formu</h2>
      
      { }
      <form onSubmit={handleSubmit(onSubmitForm) as any}>
        {/* Başlık Bilgileri */}
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #e5e7eb' }}>
          <h3 style={{ marginBottom: '16px' }}>Başlık Bilgileri</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            <div>
              <label>SATFK Kodu</label>
              <input {...register('header.satfkCode')} readOnly style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }} />
            </div>
            <div>
              <label>Başlık</label>
              <input {...register('header.title')} readOnly style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }} />
            </div>
            <div>
              <label>Şantiye</label>
              <input {...register('header.site')} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }} />
            </div>
            <div>
              <label>Alım Yeri (İl)</label>
              <input {...register('header.purchaseCity')} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }} />
            </div>
            <div>
              <label>Para Birimi</label>
              <select {...register('header.currency')} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}>
                <option value="TRY">TRY - Türk Lirası</option>
                <option value="USD">USD - Dolar</option>
                <option value="EUR">EUR - Euro</option>
                <option value="GBP">GBP - Sterlin</option>
              </select>
            </div>
            <div>
              <label>Termin Tarihi</label>
              <input
                type="date"
                {...register('header.dueDate')}
                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
              />
            </div>
          </div>
        </div>
        
        {/* Kur Bilgileri (TRY dışı için) */}
        {showCurrencySection && (
          <div style={{ backgroundColor: '#f0f9ff', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #bae6fd' }}>
            <h3 style={{ marginBottom: '16px' }}>Kur Bilgileri</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              <div>
                <label>Para Birimi</label>
                <input value={getCurrencyNameTR(watchedCurrency as Currency)} readOnly style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }} />
              </div>
              <div>
                <label>Kur</label>
                <input
                  type="number"
                  step="0.0001"
                  onChange={(e) => setCurrencyInfo({ ...currencyInfo, fxRate: parseFloat(e.target.value) })}
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                />
              </div>
              <div>
                <label>Kur Tarihi</label>
                <input
                  type="date"
                  onChange={(e) => setCurrencyInfo({ ...currencyInfo, fxDate: new Date(e.target.value).toISOString() })}
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                />
              </div>
            </div>
          </div>
        )}
        
        {/* Ürün Satırları */}
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #e5e7eb', overflowX: 'auto' }}>
          <h3 style={{ marginBottom: '16px' }}>Ürün Satırları</h3>
          
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1200px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #e5e7eb' }}>Ürün Adı</th>
                <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #e5e7eb' }}>Miktar</th>
                <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #e5e7eb' }}>Birim</th>
                <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #e5e7eb' }}>Birim Fiyat (KDV Hariç)</th>
                <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #e5e7eb' }}>KDV Oranı (%)</th>
                <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #e5e7eb' }}>KDV Dahil Birim Fiyat</th>
                <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #e5e7eb' }}>KDV Hariç Toplam</th>
                <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #e5e7eb' }}>KDV Dahil Toplam</th>
                <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #e5e7eb' }}>Ödeme Şartları</th>
                <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #e5e7eb' }}>Termin</th>
                <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #e5e7eb' }}>Aksiyon</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => {
                const line = watchedLines[index];
                const diff = calculateDifference(
                  { demandQuantity: line.demandQuantity, demandUnitPrice: line.demandUnitPrice, demandDeliveryDate: line.demandDeliveryDate, demandUom: line.demandUom },
                  line
                );
                const bgColor = diff.hasDifference ? '#fef3c7' : 'transparent';
                
                return (
                  <tr key={field.id} style={{ backgroundColor: bgColor }}>
                    <td style={{ padding: '8px', border: '1px solid #e5e7eb' }}>
                      <input
                        {...register(`lines.${index}.itemName`)}
                        style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                      />
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #e5e7eb' }}>
                      <input
                        type="number"
                        step="0.01"
                        {...register(`lines.${index}.quantity`, { valueAsNumber: true })}
                        style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                      />
                      <DifferenceBadge diff={diff} />
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #e5e7eb' }}>
                      <input
                        {...register(`lines.${index}.uom`)}
                        style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                      />
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #e5e7eb' }}>
                      <input
                        type="number"
                        step="0.01"
                        {...register(`lines.${index}.unitPrice`, { valueAsNumber: true })}
                        style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                      />
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #e5e7eb' }}>
                      <input
                        type="number"
                        step="0.01"
                        {...register(`lines.${index}.vatRate`, { valueAsNumber: true })}
                        style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                      />
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                      {line.netUnitWithVat?.toFixed(2) || '0.00'}
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                      {line.totalExVat?.toFixed(2) || '0.00'}
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                      {line.totalWithVat?.toFixed(2) || '0.00'}
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #e5e7eb' }}>
                      <input
                        placeholder="Peşin, Kredi Kartı, vb."
                        style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '12px' }}
                      />
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #e5e7eb' }}>
                      <input
                        type="date"
                        {...register(`lines.${index}.deliveryDate`)}
                        style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                      />
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #e5e7eb' }}>
                      <button type="button" onClick={() => remove(index)} style={{ padding: '6px 12px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                        Sil
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          
          <button
            type="button"
            onClick={() => append({
              itemName: '',
              uom: '',
              quantity: 0,
              unitPrice: 0,
              vatRate: 18,
              netUnitWithVat: 0,
              totalExVat: 0,
              totalWithVat: 0,
            })}
            style={{ marginTop: '12px', padding: '10px 20px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            + Satır Ekle
          </button>
        </div>
        
        {/* Excel Export Progress */}
        {exportTask.isRunning && (
          <div style={{ marginBottom: '20px' }}>
            <ProgressBar
              value={exportTask.progress}
              onCancel={exportTask.cancel}
              label="Excel dosyası oluşturuluyor..."
              showPercentage={true}
            />
          </div>
        )}

        {/* Excel Import Progress */}
        {importTask.isRunning && (
          <div style={{ marginBottom: '20px' }}>
            <ProgressBar
              value={importTask.progress}
              onCancel={importTask.cancel}
              label="Excel dosyası yükleniyor..."
              showPercentage={true}
            />
          </div>
        )}

        {/* Gönder Butonu */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', alignItems: 'center' }}>
          <label
            style={{ 
              padding: '12px 24px', 
              backgroundColor: importTask.isRunning ? '#9ca3af' : '#10b981', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px', 
              cursor: importTask.isRunning ? 'not-allowed' : 'pointer',
              opacity: importTask.isRunning ? 0.6 : 1,
              display: 'inline-block',
              fontWeight: 500
            }}
          >
            {importTask.isRunning ? 'Yükleniyor...' : 'Excel\'den Yükle'}
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => { void handleExcelImport(e); }}
              disabled={importTask.isRunning}
              style={{ display: 'none' }}
            />
          </label>
          <button
            type="button"
            onClick={() => { void handleExcelExport(); }}
            disabled={exportTask.isRunning || importTask.isRunning}
            style={{ 
              padding: '12px 24px', 
              backgroundColor: (exportTask.isRunning || importTask.isRunning) ? '#9ca3af' : '#6b7280', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px', 
              cursor: (exportTask.isRunning || importTask.isRunning) ? 'not-allowed' : 'pointer',
              opacity: (exportTask.isRunning || importTask.isRunning) ? 0.6 : 1
            }}
          >
            {exportTask.isRunning ? 'İndiriliyor...' : 'Excel İndir'}
          </button>
          <button
            type="submit"
            disabled={isSubmitDisabled}
            title={
              !perm.canCreate
                ? ((MESSAGES.ERROR_PERMISSION_BIDS_CREATE as string) ||
                  'Teklif gönderme yetkiniz yok.')
                : undefined
            }
            style={{ 
              padding: '12px 24px', 
              backgroundColor: isSubmitDisabled ? '#9ca3af' : '#2563eb', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px', 
              cursor: isSubmitDisabled ? 'not-allowed' : 'pointer', 
              fontWeight: 'bold',
              opacity: isSubmitDisabled ? 0.6 : 1
            }}
          >
            Teklifi Gönder
          </button>
        </div>
      </form>
    </div>
  );
}

