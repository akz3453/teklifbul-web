import { TaxService, MANUAL_TOKEN } from '../tax/taxService';
import { renderTaxSelect } from '../tax/render';
import { bindTaxSelect } from '../tax/bind';
import { TaxOffice } from '../types/taxOffice';
// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../../../src/shared/log/logger.js';

// 1) Veriyi yükle (API/Firestore → TaxOffice[])
async function loadTaxOffices(): Promise<TaxOffice[]> {
  // Firestore'dan yükle
  try {
    const response = await fetch('/api/taxoffices').then(r => r.json()).catch(() => null);
    if (Array.isArray(response) && response.length > 0) {
      return response;
    }
  } catch (e) {
    logger.warn('API\'den vergi dairesi yüklenemedi, fallback kullanılıyor', e);
  }
  
  // Fallback: LOCAL_TAX_OFFICES (window global)
  if (typeof window !== 'undefined' && (window as any).LOCAL_TAX_OFFICES) {
    const local = (window as any).LOCAL_TAX_OFFICES;
    // Eğer string array ise TaxOffice[]'e dönüştür
    if (Array.isArray(local)) {
      return local.map((name: string, idx: number): TaxOffice => ({
        id: `local-${idx}`,
        name: String(name),
        cityCode: '', // Bilinmiyor
        scope: 'district' // Varsayılan
      }));
    }
  }
  
  return [];
}

export async function initTaxUI() {
  const selCity   = document.getElementById('mainAddr_il')   as HTMLSelectElement;   // value=cityCode
  const selDist   = document.getElementById('mainAddr_ilce') as HTMLSelectElement;   // value=districtCode
  const selVD     = document.getElementById('mainAddr_taxOfficeSelect') as HTMLSelectElement;
  const inpVD     = document.getElementById('mainAddr_taxOffice')       as HTMLInputElement;

  if (!selVD || !inpVD) {
    logger.warn('Tax office select/input elements not found');
    return;
  }

  const data = await loadTaxOffices();
  const svc  = new TaxService(data);

  const idToName = (id: string) => svc.findById(id)?.name;

  bindTaxSelect(selVD, inpVD, idToName);

  const build = () => {
    const cityCode     = selCity?.value || '';
    const districtCode = selDist?.value || '';
    const currentName  = inpVD.value || '';

    // Kritik: **text değil kod** kullan!
    const lists = svc.splitByScope({ cityCode, districtCode });
    renderTaxSelect(selVD, inpVD, lists, currentName);
  };

  build(); // ilk yükleme (il/ilçe henüz seçili değilse tüm liste gruplu gelir)
  
  selCity?.addEventListener('change', build);
  selDist?.addEventListener('change', build);
  
  const refreshBtn = document.getElementById('mainAddr_refreshTaxOfficesBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      try {
        refreshBtn.setAttribute('disabled', 'disabled');
        refreshBtn.textContent = '⏳ Yükleniyor...';
        const fresh = await loadTaxOffices();
        svc.setOffices(fresh);
        build();
        logger.info("Vergi dairesi listesi yenilendi");
      } catch (error) {
        logger.error("Liste yenilenemedi", error);
      } finally {
        refreshBtn.removeAttribute('disabled');
        refreshBtn.textContent = '🔄 Yenile';
      }
    });
  }
}
