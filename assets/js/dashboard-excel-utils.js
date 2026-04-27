import { logger } from '../../src/shared/log/logger.js';
import { toast } from '../../src/shared/ui/toast.js';

export function initDashboardExcelImport() {
  const excelShortcut = document.getElementById('excel-import-shortcut');
  const excelInput = document.getElementById('dashboard-excel-input');

  if (excelShortcut && excelInput) {
    excelShortcut.addEventListener('click', async (e) => {
      e.preventDefault();

      try {
        // Önce dosya seçimini aç (user activation hala geçerli)
        excelInput.value = '';
        excelInput.click();

        // Dosya seçilmesini bekle
        excelInput.addEventListener('change', async function handler() {
          excelInput.removeEventListener('change', handler);

          const file = excelInput.files?.[0];
          if (!file) {
            toast.info('Dosya seçilmedi');
            return;
          }

          try {
            // Dosyayı base64'e çevir ve localStorage'a kaydet
            const reader = new FileReader();
            reader.onload = () => {
              try {
                const result = reader.result || '';
                const base64 = typeof result === 'string' ? result.split(',')[1] : '';
                if (!base64) {
                  toast.error('Excel dosyası okunamadı');
                  return;
                }

                localStorage.setItem('excelImportPrefill', JSON.stringify({
                  name: file.name,
                  data: base64,
                  timestamp: Date.now()
                }));

                // Flag set et (sayfa açıldığında Excel import'u başlatmak için)
                sessionStorage.setItem('excelImportAutoTrigger', 'true');

                // Sayfaya yönlendir
                window.location.href = './demand-new.html?prefill=excel-upload';
              } catch (err) {
                logger.error('Excel dosyası kaydedilemedi', err);
                toast.error('Excel dosyası kaydedilemedi');
              }
            };
            reader.onerror = () => {
              toast.error('Excel dosyası okunamadı');
            };
            reader.readAsDataURL(file);
          } catch (err) {
            logger.error('Excel dosyası işlenirken hata', err);
            toast.error('Excel dosyası işlenemedi');
          }
        }, { once: true });
      } catch (err) {
        logger.error('Excel import shortcut hatası', err);
        toast.error('Dosya seçimi açılamadı');
      }
    });
  }
}
