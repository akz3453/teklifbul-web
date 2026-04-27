/**
 * Template Help Modal
 * Teklifbul Rule v1.0 - Şablon Yardımı
 * 
 * Kullanıcıya şablon kullanımı hakkında bilgi verir
 */

import { logger } from '../../../src/shared/log/logger.js';

/**
 * Şablon yardım modal'ını başlat
 */
function initTemplateHelpModal() {
  logger.group('Template Help Modal Initialization');
  
  // Mevcut modal'ı kaldır
  const existingModal = document.getElementById('templateHelpModal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // Modal HTML
  const modalHTML = `
    <div id="templateHelpModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000;">
      <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 24px; border-radius: 12px; max-width: 700px; width: 90%; max-height: 85vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
        
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #e5e7eb; padding-bottom: 16px;">
          <h2 style="margin: 0; color: #1f2937; font-size: 20px;">📋 Şablon Kullanım Kılavuzu</h2>
          <button id="closeTemplateHelpModal" style="background: none; border: none; font-size: 28px; cursor: pointer; color: #6b7280; padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">&times;</button>
        </div>
        
        <!-- Content -->
        <div style="line-height: 1.6; color: #374151;">
          
          <!-- Şablon İndirme -->
          <div style="margin-bottom: 24px;">
            <h3 style="color: #1f2937; font-size: 18px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
              <span>📥</span> Şablon İndirme
            </h3>
            <p style="margin: 0 0 8px 0;">
              "Şablon İndir" butonuna tıklayarak standart Excel şablonunu indirebilirsiniz.
            </p>
            <ul style="margin: 8px 0; padding-left: 24px;">
              <li>Şablon iki sayfadan oluşur: <strong>Talep Bilgileri</strong> ve <strong>Kalemler</strong></li>
              <li>Zorunlu alanlar <strong>*</strong> işareti ile belirtilmiştir</li>
              <li>Örnek veriler şablonda mevcuttur</li>
            </ul>
          </div>
          
          <!-- Şablon Doldurma -->
          <div style="margin-bottom: 24px;">
            <h3 style="color: #1f2937; font-size: 18px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
              <span>✏️</span> Şablon Doldurma
            </h3>
            <p style="margin: 0 0 8px 0;">
              Şablonu doldururken dikkat edilmesi gerekenler:
            </p>
            <ul style="margin: 8px 0; padding-left: 24px;">
              <li><strong>Talep Bilgileri</strong> sayfasında başlık, tarih ve para birimi bilgilerini girin</li>
              <li><strong>Kalemler</strong> sayfasında ürün bilgilerini ekleyin</li>
              <li>Örnek satırları silip kendi kalemlerinizi ekleyebilirsiniz</li>
              <li>Birim ve KDV % alanları için dropdown menüleri kullanılabilir</li>
            </ul>
          </div>
          
          <!-- Şablon Yükleme -->
          <div style="margin-bottom: 24px;">
            <h3 style="color: #1f2937; font-size: 18px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
              <span>📤</span> Şablon Yükleme
            </h3>
            <p style="margin: 0 0 8px 0;">
              Doldurduğunuz şablonu yüklemek için:
            </p>
            <ol style="margin: 8px 0; padding-left: 24px;">
              <li>"Excel'den İçe Aktar" butonuna tıklayın</li>
              <li>Doldurduğunuz şablon dosyasını seçin</li>
              <li>Sistem otomatik olarak şablonu tanıyacak ve yüksek güven skoru ile işleyecektir</li>
              <li>Gerekirse kolon eşleştirmelerini kontrol edip düzeltebilirsiniz</li>
            </ol>
          </div>
          
          <!-- Avantajlar -->
          <div style="margin-bottom: 24px; background: #f0f9ff; border: 1px solid #3b82f6; border-radius: 8px; padding: 16px;">
            <h3 style="color: #1e40af; font-size: 18px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
              <span>✨</span> Standart Şablon Avantajları
            </h3>
            <ul style="margin: 8px 0; padding-left: 24px; color: #1e40af;">
              <li><strong>%95+ güven skoru:</strong> Otomatik yüksek güven ile işlenir</li>
              <li><strong>Hızlı işleme:</strong> Kolon eşleştirme gerekmez</li>
              <li><strong>Hata azaltma:</strong> Standart format sayesinde daha az hata</li>
              <li><strong>Kolay kullanım:</strong> Örnek veriler ve açıklamalar mevcut</li>
            </ul>
          </div>
          
          <!-- İpuçları -->
          <div style="margin-bottom: 24px; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px;">
            <h3 style="color: #92400e; font-size: 18px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
              <span>💡</span> İpuçları
            </h3>
            <ul style="margin: 8px 0; padding-left: 24px; color: #92400e;">
              <li>Şablonu doldururken örnek satırları referans alabilirsiniz</li>
              <li>Zorunlu alanları mutlaka doldurun</li>
              <li>Birim alanında dropdown menüsünden seçim yapın</li>
              <li>KDV % alanı için geçerli oranları kullanın (0, 1, 10, 18, 20)</li>
              <li>Şablonu değiştirmeyin, sadece verileri doldurun</li>
            </ul>
          </div>
          
        </div>
        
        <!-- Footer -->
        <div style="display: flex; gap: 12px; justify-content: flex-end; border-top: 2px solid #e5e7eb; padding-top: 16px; margin-top: 24px;">
          <button id="closeTemplateHelpBtn" style="padding: 10px 20px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">Anladım</button>
        </div>
        
      </div>
    </div>
  `;
  
  // Modal'ı sayfaya ekle
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  logger.info('Template help modal HTML added');
  
  // Elementler
  const modal = document.getElementById('templateHelpModal');
  const closeBtn = document.getElementById('closeTemplateHelpModal');
  const closeBtnFooter = document.getElementById('closeTemplateHelpBtn');
  
  /**
   * Modal'ı kapat
   */
  function closeModal() {
    modal.style.display = 'none';
  }
  
  /**
   * Modal'ı göster
   */
  function showModal() {
    modal.style.display = 'block';
  }
  
  // Event listeners
  closeBtn.addEventListener('click', closeModal);
  closeBtnFooter.addEventListener('click', closeModal);
  
  // Dışarı tıklayınca kapat
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });
  
  // ESC tuşu ile kapat
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.style.display === 'block') {
      closeModal();
    }
  });
  
  logger.info('Template help modal initialized');
  logger.end();
  
  // Public API
  return {
    showModal
  };
}

// Initialize modal
const templateHelpModal = initTemplateHelpModal();

// Export
export { templateHelpModal };

