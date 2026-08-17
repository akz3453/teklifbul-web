/**
 * Template Edit Modal
 * Teklifbul Rule v1.0 - Şablon düzenleme özelliği
 * 
 * Kullanıcıların şablon alanlarını özelleştirebilmesi için modal
 */

import { logger } from '../../../src/shared/log/logger.js';
import { toast } from '../../../src/shared/ui/toast.js';
import { MESSAGES } from '../../../src/shared/constants/messages.js';

// Teklifbul Rule v1.0 - Şablon alanları tanımları
const DEMAND_FIELDS = [
  { key: 'satfk', label: 'Satın Alma Talep Formu Kodu (SATFK)', required: false, enabled: true },
  { key: 'title', label: 'Başlık', required: true, enabled: true },
  { key: 'siteName', label: 'Şantiye', required: false, enabled: true },
  { key: 'demandDate', label: 'Talep Oluşturma Tarihi', required: false, enabled: true },
  { key: 'dueDate', label: 'Termin', required: false, enabled: true },
  { key: 'requester', label: 'Talep Eden Şirket Adı', required: false, enabled: true },
  { key: 'deliveryAddress', label: 'Teslimat Adresi', required: false, enabled: true },
  { key: 'deliveryMethod', label: 'Teslim Şekli', required: true, enabled: true },
  { key: 'invoiceAddress', label: 'Fatura Adresi', required: false, enabled: true },
  { key: 'purchaseLocation', label: 'Alım Yeri (İl)', required: false, enabled: true },
  { key: 'currency', label: 'Para Birimi', required: true, enabled: true },
  { key: 'paymentTerms', label: 'Ödeme Şartları', required: false, enabled: true },
  { key: 'biddingMode', label: 'Talep Tipi', required: false, enabled: true },
  { key: 'duration', label: 'Süre', required: false, enabled: true },
  { key: 'priority', label: 'Öncelik', required: true, enabled: true },
  { key: 'approver', label: 'Onaylayan', required: false, enabled: true },
  { key: 'purchasingManager', label: 'Satınalma Sorumlusu', required: false, enabled: true },
  { key: 'generalManager', label: 'Genel Müdür', required: false, enabled: true },
  { key: 'categories', label: 'Kategoriler', required: false, enabled: true }
];

const ITEM_FIELDS = [
  { key: 'rowNo', label: 'Sıra No', required: false, enabled: true },
  { key: 'sku', label: 'Stok Kodu', required: false, enabled: true },
  { key: 'itemName', label: 'Malzeme Tanımı', required: true, enabled: true },
  { key: 'brandModel', label: 'Marka/Model', required: false, enabled: true },
  { key: 'qty', label: 'Miktar', required: true, enabled: true },
  { key: 'unit', label: 'Birim', required: true, enabled: true },
  { key: 'stockQty', label: 'Depodaki Miktar', required: false, enabled: true },
  { key: 'targetPrice', label: 'Hedef Fiyat (TL)', required: false, enabled: true },
  { key: 'itemDueDate', label: 'İstenilen Teslim Tarihi', required: false, enabled: true }
];

class TemplateEditModal {
  constructor() {
    this.modal = null;
    this.currentConfig = {
      demandFields: [...DEMAND_FIELDS],
      itemFields: [...ITEM_FIELDS]
    };
    this.onSaveCallback = null;
  }

  /**
   * Modal'ı başlat
   */
  init() {
    if (this.modal) return; // Zaten başlatılmış

    // Modal HTML'i oluştur
    const modalHTML = `
      <div id="templateEditModal" style="display: none; position: fixed; z-index: 10000; left: 0; top: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); overflow: auto;">
        <div style="background: white; margin: 5% auto; padding: 0; border-radius: 12px; width: 90%; max-width: 900px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); max-height: 85vh; display: flex; flex-direction: column;">
          <!-- Header -->
          <div style="padding: 20px 24px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; background: #f9fafb; border-radius: 12px 12px 0 0;">
            <h2 style="margin: 0; font-size: 20px; font-weight: 600; color: #1f2937;">📝 Şablon Düzenle</h2>
            <button id="templateEditModalClose" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280; padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 6px; transition: all 0.2s;">
              &times;
            </button>
          </div>
          
          <!-- Content -->
          <div style="padding: 24px; overflow-y: auto; flex: 1;">
            <!-- Talep Bilgileri Bölümü -->
            <div style="margin-bottom: 32px;">
              <h3 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #1f2937; display: flex; align-items: center; gap: 8px;">
                📋 Talep Bilgileri Alanları
              </h3>
              <div id="demandFieldsList" style="display: flex; flex-direction: column; gap: 8px;">
                <!-- Alanlar buraya eklenecek -->
              </div>
            </div>
            
            <!-- Kalemler Bölümü -->
            <div>
              <h3 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #1f2937; display: flex; align-items: center; gap: 8px;">
                📦 Kalemler Alanları
              </h3>
              <div id="itemFieldsList" style="display: flex; flex-direction: column; gap: 8px;">
                <!-- Alanlar buraya eklenecek -->
              </div>
            </div>
          </div>
          
          <!-- Footer -->
          <div style="padding: 16px 24px; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end; gap: 12px; background: #f9fafb; border-radius: 0 0 12px 12px;">
            <button id="templateEditModalCancel" style="padding: 10px 20px; background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s;">
              İptal
            </button>
            <button id="templateEditModalSave" style="padding: 10px 20px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s;">
              💾 Kaydet ve Şablon Oluştur
            </button>
          </div>
        </div>
      </div>
    `;

    // Modal'ı DOM'a ekle
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    this.modal = document.getElementById('templateEditModal');

    // Event listeners
    document.getElementById('templateEditModalClose')?.addEventListener('click', () => this.close());
    document.getElementById('templateEditModalCancel')?.addEventListener('click', () => this.close());
    document.getElementById('templateEditModalSave')?.addEventListener('click', () => this.save());
    
    // Checkbox event listeners (delegation)
    this.modal?.addEventListener('change', (e) => {
      if (e.target.classList.contains('template-field-checkbox')) {
        const containerId = e.target.dataset.container;
        const index = parseInt(e.target.dataset.index);
        this.toggleField(containerId, index);
      }
    });

    // Modal dışına tıklayınca kapat
    this.modal?.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.close();
      }
    });

    // ESC tuşu ile kapat
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal?.style.display === 'block') {
        this.close();
      }
    });
  }

  /**
   * Alan listesini render et
   */
  renderFields(fields, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    fields.forEach((field, index) => {
      const fieldHTML = `
        <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: ${field.enabled ? '#ffffff' : '#f9fafb'}; border: 1px solid ${field.enabled ? '#e5e7eb' : '#d1d5db'}; border-radius: 8px; transition: all 0.2s;">
          <input 
            type="checkbox" 
            id="field_${field.key}" 
            ${field.enabled ? 'checked' : ''}
            data-container="${containerId}"
            data-index="${index}"
            style="width: 20px; height: 20px; cursor: pointer;"
            class="template-field-checkbox"
          />
          <label 
            for="field_${field.key}" 
            style="flex: 1; cursor: pointer; font-size: 14px; color: ${field.enabled ? '#1f2937' : '#9ca3af'}; margin: 0; display: flex; align-items: center; gap: 8px;"
          >
            ${field.label}
            ${field.required ? '<span style="color: #ef4444; font-size: 12px;">*</span>' : ''}
          </label>
          ${field.required ? '<span style="padding: 4px 8px; background: #fef3c7; color: #92400e; border-radius: 4px; font-size: 11px; font-weight: 500;">Zorunlu</span>' : ''}
        </div>
      `;
      container.insertAdjacentHTML('beforeend', fieldHTML);
    });
  }

  /**
   * Alanı aç/kapat
   */
  toggleField(containerId, index) {
    const isDemand = containerId === 'demandFieldsList';
    const fields = isDemand ? this.currentConfig.demandFields : this.currentConfig.itemFields;
    
    if (fields[index].required) {
      toast.warn(MESSAGES.WARN_TEMPLATE_REQUIRED_FIELDS);
      // Checkbox'ı tekrar işaretle
      const checkbox = document.getElementById(`field_${fields[index].key}`);
      if (checkbox) checkbox.checked = true;
      return;
    }

    fields[index].enabled = !fields[index].enabled;
    this.renderFields(fields, containerId);
  }

  /**
   * Modal'ı göster
   */
  showModal(onSave) {
    if (!this.modal) this.init();
    
    this.onSaveCallback = onSave;
    
    // Mevcut konfigürasyonu yükle
    this.renderFields(this.currentConfig.demandFields, 'demandFieldsList');
    this.renderFields(this.currentConfig.itemFields, 'itemFieldsList');
    
    this.modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
  }

  /**
   * Modal'ı kapat
   */
  close() {
    if (this.modal) {
      this.modal.style.display = 'none';
      document.body.style.overflow = '';
    }
  }

  /**
   * Kaydet ve şablon oluştur
   */
  async save() {
    try {
      logger.group('Şablon Düzenleme - Kaydet');
      toast.info(MESSAGES.INFO_TEMPLATE_CREATING);

      // Zorunlu alanların açık olduğunu kontrol et
      const allFields = [...this.currentConfig.demandFields, ...this.currentConfig.itemFields];
      const requiredFieldsClosed = allFields.filter(f => f.required && !f.enabled);
      
      if (requiredFieldsClosed.length > 0) {
        toast.error(MESSAGES.WARN_TEMPLATE_REQUIRED_FIELDS);
        logger.end();
        return;
      }

      // API'ye gönder
      const { authFetch, resolveApiBaseUrl } = await import('../utils/api-helpers.js');
      const { downloadBlobFile } = await import('../utils/download-file.js');
      const API_BASE = resolveApiBaseUrl();

      const response = await authFetch(`${API_BASE}/api/template/demand/custom`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          demandFields: this.currentConfig.demandFields.filter(f => f.enabled),
          itemFields: this.currentConfig.itemFields.filter(f => f.enabled)
        })
      });

      if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
          const errJson = await response.clone().json();
          detail = errJson?.message || errJson?.error || detail;
        } catch (_e) { /* ignore */ }
        throw new Error(detail);
      }

      const blob = await response.blob();
      const filename = `Ozel_Satin_Alma_Talep_Formu_Sablonu_${new Date().toISOString().split('T')[0]}.xlsx`;
      const result = await downloadBlobFile(blob, filename);
      if (result?.cancelled) {
        toast.info(MESSAGES.INFO_SHARE_CANCELLED);
        logger.end();
        return;
      }

      logger.info('Özelleştirilmiş şablon oluşturuldu');
      logger.end();
      toast.success(MESSAGES.SUCCESS_TEMPLATE_DOWNLOADED);

      this.close();

      if (this.onSaveCallback) {
        this.onSaveCallback(this.currentConfig);
      }
    } catch (error) {
      logger.error('Şablon düzenleme hatası', error);
      logger.end();
      toast.error(`${MESSAGES.ERROR_TEMPLATE_CREATE}: ${error.message || 'Beklenmeyen hata'}`);
    }
  }
}

// Global instance
export const templateEditModal = new TemplateEditModal();

