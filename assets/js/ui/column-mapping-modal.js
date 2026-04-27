/**
 * Column Mapping Modal
 * Teklifbul Rule v1.0 - Akıllı Eşleştirme Sistemi
 * 
 * Kolon eşleştirme modal'ı - kullanıcı manuel düzeltme yapabilir
 */

import { logger } from '../../../src/shared/log/logger.js';
import { toast } from '../../../src/shared/ui/toast.js';
import { MESSAGES } from '../../../src/shared/constants/messages.js';
// Teklifbul Rule v1.0 - XSS savunma derinligi (Excel kolon adlari kullanici girdisi olabilir)
import DOMPurify from 'dompurify';

/**
 * Kolon eşleştirme modal'ını başlat
 */
function initColumnMappingModal() {
  logger.group('Column Mapping Modal Initialization');
  
  // Mevcut modal'ı kaldır
  const existingModal = document.getElementById('columnMappingModal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // Modal HTML
  const modalHTML = `
    <div id="columnMappingModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000;">
      <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 24px; border-radius: 12px; max-width: 900px; width: 90%; max-height: 85vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
        
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #e5e7eb; padding-bottom: 16px;">
          <h2 style="margin: 0; color: #1f2937; font-size: 20px;">🔍 Kolon Eşleştirme</h2>
          <button id="closeMappingModal" style="background: none; border: none; font-size: 28px; cursor: pointer; color: #6b7280; padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">&times;</button>
        </div>
        
        <!-- Info -->
        <div id="mappingInfo" style="background: #f0f9ff; border: 1px solid #3b82f6; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
          <p style="margin: 0; font-size: 14px; color: #1e40af;">
            <strong>Bilgi:</strong> Sistem otomatik eşleştirme yaptı. Lütfen eşleştirmeleri kontrol edin ve gerekirse düzeltin.
          </p>
        </div>
        
        <!-- Mapping Table -->
        <div style="margin-bottom: 20px;">
          <table id="mappingTable" style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead>
              <tr style="background: #f9fafb; border-bottom: 2px solid #e5e7eb;">
                <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">Excel Kolonu</th>
                <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">Eşleşen Alan</th>
                <th style="padding: 12px; text-align: center; font-weight: 600; color: #374151;">Güven Skoru</th>
                <th style="padding: 12px; text-align: center; font-weight: 600; color: #374151;">İşlem</th>
              </tr>
            </thead>
            <tbody id="mappingTableBody">
              <!-- Mappings will be populated here -->
            </tbody>
          </table>
        </div>
        
        <!-- Footer -->
        <div style="display: flex; gap: 12px; justify-content: flex-end; border-top: 2px solid #e5e7eb; padding-top: 16px;">
          <button id="cancelMapping" style="padding: 10px 20px; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">İptal</button>
          <button id="confirmMapping" style="padding: 10px 20px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">Onayla ve Devam Et</button>
        </div>
        
      </div>
    </div>
  `;
  
  // Modal'ı sayfaya ekle
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  logger.info('Column mapping modal HTML added');
  
  // Elementler
  const modal = document.getElementById('columnMappingModal');
  const closeBtn = document.getElementById('closeMappingModal');
  const cancelBtn = document.getElementById('cancelMapping');
  const confirmBtn = document.getElementById('confirmMapping');
  const tableBody = document.getElementById('mappingTableBody');
  
  // State
  let currentMappings = [];
  let originalMappings = [];
  let onConfirmCallback = null;
  let filename = '';
  let supplierId = null;
  let isTemplate = false;
  let templateConfidence = 0;
  
  // Alan seçenekleri - Kalemler için
  const ITEM_FIELD_OPTIONS = [
    { value: '', label: '-- Seçiniz --' },
    { value: 'itemName', label: 'Ürün Adı' },
    { value: 'qty', label: 'Miktar' },
    { value: 'unit', label: 'Birim' },
    { value: 'brand', label: 'Marka' },
    { value: 'model', label: 'Model' },
    { value: 'sku', label: 'Stok Kodu' },
    { value: 'unitPriceExcl', label: 'Birim Fiyat (KDV Hariç)' },
    { value: 'vatPct', label: 'KDV %' },
    { value: 'deliveryDate', label: 'Teslim Tarihi' },
    { value: 'note', label: 'Açıklama' },
  ];
  
  // Talep bilgileri için alan seçenekleri
  const DEMAND_FIELD_OPTIONS = [
    { value: '', label: '-- Seçiniz --' },
    { value: 'title', label: 'Başlık' },
    { value: 'siteName', label: 'Şantiye' },
    { value: 'demandDate', label: 'Talep Oluşturma Tarihi' },
    { value: 'dueDate', label: 'Termin' },
    { value: 'deliveryAddress', label: 'Teslimat Adresi' },
    { value: 'invoiceAddress', label: 'Fatura Adresi' },
    { value: 'purchaseLocation', label: 'Alım Yeri (İl)' }, // Teklifbul Rule v1.0 - Alım Yeri eklendi
    { value: 'categories', label: 'Kategoriler' },
    { value: 'currency', label: 'Para Birimi' },
    { value: 'requester', label: 'Talep Eden' },
    { value: 'priority', label: 'Öncelik' }, // Teklifbul Rule v1.0 - Öncelik eklendi
    { value: 'biddingMode', label: 'Talep Tipi' }, // Teklifbul Rule v1.0 - Talep Tipi eklendi
    { value: 'paymentTerms', label: 'Ödeme Şartları' }, // Teklifbul Rule v1.0 - Ödeme Şartları eklendi
    { value: 'deliveryMethod', label: 'Teslim Şekli' }, // Teklifbul Rule v1.0 - Teslim Şekli eklendi
    { value: 'approver', label: 'Onaylayan' }, // Teklifbul Rule v1.0 - Onaylayan eklendi
    { value: 'note', label: 'Açıklama' },
  ];
  
  // Varsayılan olarak kalem alanlarını kullan
  let FIELD_OPTIONS = ITEM_FIELD_OPTIONS;
  
  /**
   * Güven skoruna göre renk döndür
   */
  function getConfidenceColor(score) {
    if (score >= 0.8) return '#10b981'; // Yeşil
    if (score >= 0.6) return '#f59e0b'; // Turuncu
    return '#ef4444'; // Kırmızı
  }
  
  /**
   * Güven skoruna göre badge metni
   */
  function getConfidenceBadge(score) {
    if (score >= 0.8) return 'Yüksek';
    if (score >= 0.6) return 'Orta';
    return 'Düşük';
  }
  
  /**
   * Modal'ı göster
   */
  function showModal(mappings, options = {}) {
    // Teklifbul Rule v1.0 - Template bilgilerini sakla
    isTemplate = options.isTemplate || false;
    templateConfidence = options.templateConfidence || 0;
    logger.group('Show Column Mapping Modal');
    
    currentMappings = JSON.parse(JSON.stringify(mappings)); // Deep copy
    originalMappings = JSON.parse(JSON.stringify(mappings));
    filename = options.filename || '';
    supplierId = options.supplierId || null;
    onConfirmCallback = options.onConfirm || null;
    isTemplate = options.isTemplate || false;
    templateConfidence = options.templateConfidence || 0;
    
    // Şablon bilgisi göster
    const infoDiv = document.getElementById('mappingInfo');
    if (infoDiv) {
      if (isTemplate && templateConfidence >= 0.95) {
        infoDiv.style.background = '#d1fae5';
        infoDiv.style.borderColor = '#10b981';
        infoDiv.innerHTML = `
          <p style="margin: 0; font-size: 14px; color: #065f46;">
            <strong>✅ Standart Şablon Tespit Edildi!</strong> Yüksek güven skoru: ${Math.round(templateConfidence * 100)}%. 
            Eşleştirmeler otomatik olarak yapıldı. Lütfen kontrol edin.
          </p>
        `;
      } else {
        infoDiv.style.background = '#f0f9ff';
        infoDiv.style.borderColor = '#3b82f6';
        infoDiv.innerHTML = `
          <p style="margin: 0; font-size: 14px; color: #1e40af;">
            <strong>Bilgi:</strong> Sistem otomatik eşleştirme yaptı. Lütfen eşleştirmeleri kontrol edin ve gerekirse düzeltin.
          </p>
        `;
      }
    }
    
    // Tabloyu doldur
    renderTable();
    
    modal.style.display = 'block';
    logger.info('Modal displayed', { mappingsCount: currentMappings.length, isTemplate, templateConfidence });
    logger.end();
  }
  
  /**
   * Tabloyu render et
   */
  function renderTable() {
    tableBody.innerHTML = '';
    
    if (currentMappings.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="4" style="padding: 40px; text-align: center; color: #6b7280;">
            Eşleştirilecek kolon bulunamadı.
          </td>
        </tr>
      `;
      return;
    }
    
    currentMappings.forEach((mapping, index) => {
      const row = document.createElement('tr');
      row.style.borderBottom = '1px solid #e5e7eb';
      
      // Teklifbul Rule v1.0 - Type'a göre doğru field options'ı kullan
      const mappingType = mapping.type || 'item'; // Varsayılan: item
      const fieldOptions = mappingType === 'demand' ? DEMAND_FIELD_OPTIONS : ITEM_FIELD_OPTIONS;
      
      const confidenceColor = getConfidenceColor(mapping.confidence || mapping.score || 0);
      const confidenceBadge = getConfidenceBadge(mapping.confidence || mapping.score || 0);
      
      // Kolon etiketi - talep bilgileri için farklı gösterim
      const columnLabel = mapping.columnLabel || 
                         (mapping.columnIndex >= 0 ? `Kolon ${mapping.columnIndex + 1}` : 'Excel Alanı');
      
      // Teklifbul Rule v1.0 - XSS koruma: columnLabel ve mapping.field DOMPurify ile sanitize
      const safeColumnLabel = DOMPurify.sanitize(String(columnLabel), { ALLOWED_TAGS: [] });
      const safeFieldOptions = fieldOptions.map(opt => {
        const safeValue = DOMPurify.sanitize(String(opt.value || ''), { ALLOWED_TAGS: [] });
        const safeLabel = DOMPurify.sanitize(String(opt.label || ''), { ALLOWED_TAGS: [] });
        const selected = mapping.field === opt.value ? 'selected' : '';
        return `<option value="${safeValue}" ${selected}>${safeLabel}</option>`;
      }).join('');
      const safeConfidenceColor = DOMPurify.sanitize(String(confidenceColor || '#6b7280'), { ALLOWED_TAGS: [] });
      const safeConfidenceBadge = DOMPurify.sanitize(String(confidenceBadge || ''), { ALLOWED_TAGS: [] });
      const confidencePercent = Math.round((mapping.confidence || mapping.score || 0) * 100);

      row.innerHTML = DOMPurify.sanitize(`
        <td style="padding: 12px; font-weight: 500; color: #1f2937;">
          ${safeColumnLabel}
          ${mappingType === 'demand' ? ' <span style="color: #6b7280; font-size: 12px;">(Talep Bilgisi)</span>' : ''}
        </td>
        <td style="padding: 12px;">
          <select class="field-select" data-index="${index}" style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
            ${safeFieldOptions}
          </select>
        </td>
        <td style="padding: 12px; text-align: center;">
          <span style="display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; background: ${safeConfidenceColor}20; color: ${safeConfidenceColor};">
            ${safeConfidenceBadge} (${confidencePercent}%)
          </span>
        </td>
        <td style="padding: 12px; text-align: center;">
          <button class="remove-mapping" data-index="${index}" style="padding: 6px 12px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Kaldır</button>
        </td>
      `, { ADD_ATTR: ['style', 'data-index', 'selected'] });
      
      tableBody.appendChild(row);
    });
    
    // Event listeners
    document.querySelectorAll('.field-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.index);
        currentMappings[index].field = e.target.value;
      });
    });
    
    document.querySelectorAll('.remove-mapping').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        currentMappings.splice(index, 1);
        renderTable();
      });
    });
  }
  
  /**
   * Modal'ı kapat
   */
  function closeModal() {
    modal.style.display = 'none';
    currentMappings = [];
    originalMappings = [];
    onConfirmCallback = null;
  }
  
  /**
   * Eşleştirmeyi onayla
   */
  async function confirmMapping() {
    logger.group('Confirm Column Mapping');
    
    try {
      // Boş eşleştirmeleri filtrele
      const validMappings = currentMappings.filter(m => m.field && m.field !== '');
      
      // Eğer yüksek güven skorlu şablon ise ve mappings boşsa, direkt onayla
      if (validMappings.length === 0) {
        if (isTemplate && templateConfidence >= 0.95) {
          // Yüksek güven skorlu şablon, mappings boş olsa bile onayla
          logger.info('High confidence template, confirming without mappings');
          if (onConfirmCallback) {
            await onConfirmCallback([], originalMappings);
          }
          closeModal();
          logger.end();
          return;
        }
        toast.error(MESSAGES.ERROR_COLUMN_MAPPING_REQUIRED);
        logger.end();
        return;
      }
      
      // Callback varsa çağır
      if (onConfirmCallback) {
        await onConfirmCallback(validMappings, originalMappings);
      }
      
      // Backend'e kaydet
      const API_BASE = window.location.hostname === 'localhost' 
        ? 'http://localhost:5174' 
        : window.location.origin;
      
      try {
        const response = await fetch(`${API_BASE}/api/import/confirm-mapping`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            supplierId,
            filename,
            mappings: validMappings,
            originalMappings
          })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
        logger.info('Mapping saved', result);
        toast.success(MESSAGES.SUCCESS_COLUMN_MAPPING_SAVED);
      } catch (error) {
        logger.warn('Mapping save failed', error);
        // Devam et, kritik değil
      }
      
      closeModal();
      logger.end();
    } catch (error) {
      logger.error('Confirm mapping error', error);
      toast.error(MESSAGES.ERROR_COLUMN_MAPPING_SAVE);
      logger.end();
    }
  }
  
  // Event listeners
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  confirmBtn.addEventListener('click', confirmMapping);
  
  // Dışarı tıklayınca kapat
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });
  
  logger.info('Column mapping modal initialized');
  logger.end();
  
  // Public API
  return {
    showModal
  };
}

// Initialize modal
const columnMappingModal = initColumnMappingModal();

// Export
export { columnMappingModal };

