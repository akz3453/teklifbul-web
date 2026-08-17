/**
 * SKU Merge UI
 * Teklifbul Rule v1.0 - SKU birleştirme arayüzü
 */

import { db, requireAuth } from '/firebase.js';
import { collection, getDocs, query, where, limit } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { searchStocks } from '/scripts/lib/stock-search.js';
import { getSkuMergePreview, mergeSkus } from '/scripts/inventory-sku-merge.js';
import { toast } from '/src/shared/ui/toast.js';
import { MESSAGES } from '/src/shared/constants/messages.js';
import { logger } from '/src/shared/log/logger.js';
import { requireCompanyContext } from '/assets/js/state/company-context.js';

const qs = s => document.querySelector(s);

const state = {
  sourceStock: null,
  targetStock: null,
  companyId: null,
  stocks: [],
  preview: null,
  isLoadingStocks: false,
  stocksLoaded: false,
  emptyWarned: false
};

// Teklifbul Rule v1.0 - Debounce için timer'lar
let sourceSearchTimer = null;
let targetSearchTimer = null;

// Initialize
(async () => {
  try {
    await requireAuth();

    // Teklifbul Rule v1.0 - Stok listesi ile aynı şirket bağlamı
    const companyContext = await requireCompanyContext({ redirectOnPending: true });
    if (!companyContext?.companyId) {
      logger.error('Company ID bulunamadı');
      toast.error(MESSAGES.ERROR_SKU_COMPANY_ID_NOT_FOUND || 'Şirket bilgisi bulunamadı');
      return;
    }
    state.companyId = companyContext.companyId;

    logger.info('SKU merge şirket bağlamı', {
      companyId: state.companyId,
      resolvedFrom: companyContext.resolvedFrom,
      joinStatus: companyContext.joinStatus
    });

    await loadStocks();
    setupEventListeners();
  } catch (error) {
    logger.error('Initialization error', error);
    toast.error(error?.message || 'Sayfa başlatılamadı');
  }
})();

/**
 * Teklifbul Rule v1.0 — yalnızca companyId filtreli sorgu + limit.
 * Tüm stocks koleksiyonunu okumak Firestore kurallarında yasak (permission denied).
 */
async function loadStocks() {
  if (state.isLoadingStocks) {
    logger.info('Stoklar zaten yükleniyor, bekleniyor');
    return;
  }

  try {
    state.isLoadingStocks = true;

    if (!state.companyId) {
      logger.warn('Company ID yok, stoklar yüklenemiyor');
      toast.error(MESSAGES.ERROR_SKU_COMPANY_NOT_FOUND || 'Şirket bilgisi yok');
      return;
    }

    logger.info(`Stoklar yükleniyor (companyId: ${state.companyId})`);
    toast.info(MESSAGES.INFO_STOCK_LOADING || 'Stoklar yükleniyor...');

    const stocksQuery = query(
      collection(db, 'stocks'),
      where('companyId', '==', state.companyId),
      limit(10000)
    );
    const snap = await getDocs(stocksQuery);

    const allStocks = [];
    snap.forEach((d) => {
      allStocks.push({ id: d.id, ...d.data() });
    });

    state.stocks = allStocks.filter((s) => !s.archived && !s.merged);
    state.stocksLoaded = true;

    logger.info('SKU merge stoklar yüklendi', {
      total: allStocks.length,
      active: state.stocks.length,
      companyId: state.companyId
    });

    if (state.stocks.length === 0 && !state.emptyWarned) {
      state.emptyWarned = true;
      if (allStocks.length === 0) {
        toast.warn('Bu şirkete ait stok bulunamadı. Önce stok listesine ürün ekleyin.');
      } else {
        toast.warn(`Bu şirkette ${allStocks.length} stok var; hepsi arşivlenmiş veya birleştirilmiş.`);
      }
    }
  } catch (error) {
    logger.error('Stocks load error', error);
    state.stocksLoaded = false;
    state.stocks = [];
    const code = error?.code || '';
    if (code === 'permission-denied' || /insufficient permissions/i.test(String(error?.message || ''))) {
      toast.error('Stok okuma izni yok. Üyelik durumunuzu kontrol edin veya sayfayı yenileyin.');
    } else {
      toast.error(`${MESSAGES.ERROR_SKU_LOAD || 'Stok yükleme hatası'}: ${error.message}`);
    }
  } finally {
    state.isLoadingStocks = false;
  }
}

function setupEventListeners() {
  // Source SKU search - Teklifbul Rule v1.0 - Debounce: 3 harfte bir veya 500ms sonra
  const sourceInput = qs('#sourceSku');
  sourceInput.addEventListener('input', (e) => {
    const value = e.target.value.trim();
    // Minimum 3 karakter veya boş ise hemen çalıştır
    if (value.length === 0 || value.length >= 3) {
      // Önceki timer'ı iptal et
      if (sourceSearchTimer) {
        clearTimeout(sourceSearchTimer);
      }
      // Hemen çalıştır (3+ karakter) veya 500ms bekle (1-2 karakter)
      if (value.length >= 3) {
        handleSearch(value, 'source');
      } else {
        sourceSearchTimer = setTimeout(() => {
          handleSearch(value, 'source');
        }, 500);
      }
    }
  });
  
  // Target SKU search - Teklifbul Rule v1.0 - Debounce: 3 harfte bir veya 500ms sonra
  const targetInput = qs('#targetSku');
  targetInput.addEventListener('input', (e) => {
    const value = e.target.value.trim();
    // Minimum 3 karakter veya boş ise hemen çalıştır
    if (value.length === 0 || value.length >= 3) {
      // Önceki timer'ı iptal et
      if (targetSearchTimer) {
        clearTimeout(targetSearchTimer);
      }
      // Hemen çalıştır (3+ karakter) veya 500ms bekle (1-2 karakter)
      if (value.length >= 3) {
        handleSearch(value, 'target');
      } else {
        targetSearchTimer = setTimeout(() => {
          handleSearch(value, 'target');
        }, 500);
      }
    }
  });
  
  // Preview button
  qs('#btnPreview').addEventListener('click', async () => {
    await handlePreview();
  });
  
  // Merge button
  qs('#btnMerge').addEventListener('click', async () => {
    await handleMerge();
  });
  
  // Dışarı tıklandığında dropdown'u kapat
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#sourceSku') && !e.target.closest('#sourceSearchResults')) {
      qs('#sourceSearchResults').style.display = 'none';
    }
    if (!e.target.closest('#targetSku') && !e.target.closest('#targetSearchResults')) {
      qs('#targetSearchResults').style.display = 'none';
    }
  });
  
  // ESC tuşu ile dropdown'u kapat
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      qs('#sourceSearchResults').style.display = 'none';
      qs('#targetSearchResults').style.display = 'none';
    }
  });
}

// Teklifbul Rule v1.0 - Gelişmiş stok arama (ETA programı gibi)
function handleSearch(query, type) {
  const resultsDiv = qs(`#${type}SearchResults`);
  const errorDiv = qs(`#${type}Error`);
  
  // Boş sorgu kontrolü
  if (!query || query.trim().length === 0) {
    resultsDiv.style.display = 'none';
    errorDiv.style.display = 'none';
    if (type === 'source') state.sourceStock = null;
    if (type === 'target') state.targetStock = null;
    updateButtons();
    return;
  }
  
  // Stoklar yüklü mü kontrol et
  if (!state.stocksLoaded || state.isLoadingStocks) {
    resultsDiv.style.display = 'none';
    errorDiv.textContent = 'Stoklar yükleniyor... Lütfen bekleyin.';
    errorDiv.style.display = 'block';
    
    // Eğer yükleme başlamadıysa başlat
    if (!state.isLoadingStocks && !state.stocksLoaded) {
      loadStocks().then(() => {
        // Stoklar yüklendikten sonra tekrar arama yap (sadece bir kez)
        if (query && query.trim().length > 0 && state.stocks.length > 0) {
          handleSearch(query, type);
        } else if (state.stocks.length === 0) {
          errorDiv.textContent = 'Stok bulunamadı. Lütfen stok içe aktarma sayfasından stok ekleyin.';
          errorDiv.style.display = 'block';
        }
      });
    }
    return;
  }
  
  // Stoklar yüklü ama boşsa
  if (state.stocks.length === 0) {
    resultsDiv.style.display = 'none';
    errorDiv.textContent = 'Stok bulunamadı. Lütfen stok içe aktarma sayfasından stok ekleyin.';
    errorDiv.style.display = 'block';
    if (type === 'source') state.sourceStock = null;
    if (type === 'target') state.targetStock = null;
    updateButtons();
    return;
  }
  
  // Gelişmiş arama fonksiyonunu kullan
  const matches = searchStocks(state.stocks, query, 50);
  
  logger.info(`Arama: "${query}" → ${matches.length} sonuç bulundu`, matches.slice(0, 3));
  
  if (matches.length === 0) {
    resultsDiv.style.display = 'none';
    errorDiv.textContent = `"${query}" için stok bulunamadı. Yıldız (*) ile arama yapabilirsiniz. Örnek: *${query}*`;
    errorDiv.style.display = 'block';
    if (type === 'source') state.sourceStock = null;
    if (type === 'target') state.targetStock = null;
    updateButtons();
    return;
  }
  
  errorDiv.style.display = 'none';
  resultsDiv.style.display = 'block';
  
  // Tablo formatında sonuçları göster
  renderStocksTable(matches, type);
}

function selectStock(stock, type) {
  const resultsDiv = qs(`#${type}SearchResults`);
  if (type === 'source') {
    state.sourceStock = stock;
    qs('#sourceSku').value = stock.sku;
  } else {
    state.targetStock = stock;
    qs('#targetSku').value = stock.sku;
  }
  resultsDiv.style.display = 'none';
  updateButtons();
}

// Yardımcı fonksiyonlar
function formatCurrency(value) {
  if (!value || value === 0) return '₺0,00';
  return `₺${Number(value).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function escapeHtml(text) {
  if (!text) return '-';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderStocksTable(stocks, type) {
  const resultsDiv = qs(`#${type}SearchResults`);
  
  resultsDiv.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>SKU</th>
          <th>Ürün Adı</th>
          <th>Marka</th>
          <th>Model</th>
          <th>Birim</th>
          <th>Ort. Maliyet</th>
          <th>Satış Fiyatı</th>
          <th>Durum</th>
        </tr>
      </thead>
      <tbody>
        ${stocks.map((stock, index) => {
          const isArchived = stock.archived || stock.merged;
          return `
            <tr class="stock-row" data-stock-index="${index}" tabindex="0" role="option" aria-label="${escapeHtml(stock.sku)} - ${escapeHtml(stock.name)}">
              <td class="stock-sku">${escapeHtml(stock.sku || '-')}</td>
              <td class="stock-name">${escapeHtml(stock.name || '-')}</td>
              <td>${escapeHtml(stock.brand || '-')}</td>
              <td>${escapeHtml(stock.model || '-')}</td>
              <td>${escapeHtml(stock.unit || 'ADT')}</td>
              <td>${formatCurrency(stock.avgCost)}</td>
              <td>${formatCurrency(stock.salePrice)}</td>
              <td>
                <span class="badge badge-active">
                  Aktif
                </span>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
  
  // Her satıra event listener ekle
  const rows = resultsDiv.querySelectorAll('.stock-row');
  rows.forEach((row, index) => {
    const stock = stocks[index];
    
    // Tıklama ile seçim
    row.addEventListener('click', () => {
      selectStock(stock, type);
    });
    
    // Enter tuşu ile seçim
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        selectStock(stock, type);
      }
      // Ok tuşları ile gezinme
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = row.nextElementSibling;
        if (next) {
          next.focus();
          next.classList.add('selected');
          row.classList.remove('selected');
        }
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = row.previousElementSibling;
        if (prev) {
          prev.focus();
          prev.classList.add('selected');
          row.classList.remove('selected');
        } else {
          const input = type === 'source' ? qs('#sourceSku') : qs('#targetSku');
          if (input) input.focus();
        }
      }
    });
    
    // Hover efekti
    row.addEventListener('mouseenter', () => {
      row.classList.add('selected');
    });
    row.addEventListener('mouseleave', () => {
      row.classList.remove('selected');
    });
  });
}

function updateButtons() {
  const canPreview = state.sourceStock && state.targetStock && 
                     state.sourceStock.sku !== state.targetStock.sku;
  qs('#btnPreview').disabled = !canPreview;
  qs('#btnMerge').disabled = !canPreview || !state.preview;
}

async function handlePreview() {
  try {
    if (!state.sourceStock || !state.targetStock) {
      toast.error(MESSAGES.ERROR_SKU_SOURCE_TARGET_REQUIRED);
      return;
    }
    
    if (state.sourceStock.sku === state.targetStock.sku) {
      toast.error(MESSAGES.ERROR_SKU_SAME_SOURCE_TARGET);
      return;
    }
    
    qs('#btnPreview').disabled = true;
    qs('#btnPreview').textContent = 'Yükleniyor...';
    
    const preview = await getSkuMergePreview(
      state.companyId,
      state.sourceStock.sku,
      state.targetStock.sku
    );
    
    state.preview = preview;
    
    // Preview göster
    renderPreview(preview);
    
    qs('#previewCard').style.display = 'block';
    qs('#btnPreview').textContent = 'Önizleme';
    qs('#btnPreview').disabled = false;
    updateButtons();
    
  } catch (error) {
    logger.error('Preview error', error);
    toast.error(`${MESSAGES.ERROR_SKU_PREVIEW}: ${error.message}`);
    qs('#btnPreview').textContent = 'Önizleme';
    qs('#btnPreview').disabled = false;
  }
}

function renderPreview(preview) {
  const content = qs('#previewContent');
  
  content.innerHTML = `
    <div class="preview-section">
      <h3>Kaynak SKU: ${preview.sourceStock.sku}</h3>
      <div class="preview-row">
        <span class="preview-label">Ürün Adı:</span>
        <span class="preview-value">${preview.sourceStock.name}</span>
      </div>
      <div class="preview-row">
        <span class="preview-label">Marka:</span>
        <span class="preview-value">${preview.sourceStock.brand || '-'}</span>
      </div>
      <div class="preview-row">
        <span class="preview-label">Toplam Miktar:</span>
        <span class="preview-value">${preview.sourceTotalQty} ${preview.sourceStock.unit || 'ADT'}</span>
      </div>
      <div class="preview-row">
        <span class="preview-label">Ortalama Maliyet:</span>
        <span class="preview-value">${preview.sourceStock.avgCost?.toFixed(2) || '0.00'} ₺</span>
      </div>
      <div class="preview-row">
        <span class="preview-label">Hareket Sayısı:</span>
        <span class="preview-value">${preview.sourceMovementsCount}</span>
      </div>
      <div class="preview-row">
        <span class="preview-label">Lokasyon Sayısı:</span>
        <span class="preview-value">${preview.sourceBalances.length}</span>
      </div>
    </div>
    
    <div class="preview-section" style="margin-top:16px">
      <h3>Hedef SKU: ${preview.targetStock.sku}</h3>
      <div class="preview-row">
        <span class="preview-label">Ürün Adı:</span>
        <span class="preview-value">${preview.targetStock.name}</span>
      </div>
      <div class="preview-row">
        <span class="preview-label">Marka:</span>
        <span class="preview-value">${preview.targetStock.brand || '-'}</span>
      </div>
      <div class="preview-row">
        <span class="preview-label">Mevcut Miktar:</span>
        <span class="preview-value">${preview.targetTotalQty} ${preview.targetStock.unit || 'ADT'}</span>
      </div>
      <div class="preview-row">
        <span class="preview-label">Ortalama Maliyet:</span>
        <span class="preview-value">${preview.targetStock.avgCost?.toFixed(2) || '0.00'} ₺</span>
      </div>
      <div class="preview-row">
        <span class="preview-label">Hareket Sayısı:</span>
        <span class="preview-value">${preview.targetMovementsCount}</span>
      </div>
      <div class="preview-row">
        <span class="preview-label">Lokasyon Sayısı:</span>
        <span class="preview-value">${preview.targetBalances.length}</span>
      </div>
    </div>
    
    <div class="preview-section" style="margin-top:16px;background:#f0f9ff;border-color:#3b82f6">
      <h3>Birleştirme Sonrası (Tahmini)</h3>
      <div class="preview-row">
        <span class="preview-label">Toplam Miktar:</span>
        <span class="preview-value" style="color:#2563eb;font-size:16px">${preview.estimatedNewQty} ${preview.targetStock.unit || 'ADT'}</span>
      </div>
      <div class="preview-row">
        <span class="preview-label">Toplam Hareket:</span>
        <span class="preview-value" style="color:#2563eb">${preview.sourceMovementsCount + preview.targetMovementsCount}</span>
      </div>
      <div class="preview-row">
        <span class="preview-label">⚠️ Kaynak SKU arşivlenecek:</span>
        <span class="preview-value" style="color:#ef4444">${preview.sourceStock.sku}</span>
      </div>
    </div>
  `;
}

async function handleMerge() {
  try {
    if (!state.preview) {
      toast.error(MESSAGES.ERROR_SKU_PREVIEW_REQUIRED);
      return;
    }
    
    if (!confirm(`⚠️ DİKKAT: ${state.sourceStock.sku} SKU'su ${state.targetStock.sku} SKU'suna birleştirilecek.\n\nBu işlem geri alınamaz. Devam etmek istediğinize emin misiniz?`)) {
      return;
    }
    
    const user = await requireAuth();
    
    qs('#btnMerge').disabled = true;
    qs('#btnMerge').textContent = 'Birleştiriliyor...';
    
    const result = await mergeSkus({
      companyId: state.companyId,
      sourceSku: state.sourceStock.sku,
      targetSku: state.targetStock.sku,
      userId: user.uid
    });
    
    // Sonuç göster
    renderResult(result);
    
    qs('#resultCard').style.display = 'block';
    qs('#btnMerge').textContent = 'Birleştir';
    qs('#btnMerge').disabled = true;
    
    toast.success(MESSAGES.SUCCESS_SKU_MERGE);
    
    // Stocks listesini yenile
    await loadStocks();
    
    // Formu temizle
    state.sourceStock = null;
    state.targetStock = null;
    state.preview = null;
    qs('#sourceSku').value = '';
    qs('#targetSku').value = '';
    qs('#previewCard').style.display = 'none';
    updateButtons();
    
  } catch (error) {
    logger.error('Merge error', error);
    toast.error(`${MESSAGES.ERROR_SKU_MERGE}: ${error.message}`);
    qs('#btnMerge').textContent = 'Birleştir';
    qs('#btnMerge').disabled = false;
    updateButtons();
  }
}

function renderResult(result) {
  const content = qs('#resultContent');
  
  content.innerHTML = `
    <div class="preview-section" style="background:#d1fae5;border-color:#10b981">
      <h3 style="color:#065f46">✅ Birleştirme Başarılı</h3>
      <div class="preview-row">
        <span class="preview-label">Güncellenen Hareket:</span>
        <span class="preview-value">${result.movementsUpdated}</span>
      </div>
      <div class="preview-row">
        <span class="preview-label">Birleştirilen Lokasyon:</span>
        <span class="preview-value">${result.balancesMerged}</span>
      </div>
      <div class="preview-row">
        <span class="preview-label">Yeni Ortalama Maliyet:</span>
        <span class="preview-value">${result.newAvgCost?.toFixed(2) || '0.00'} ₺</span>
      </div>
      <div class="preview-row">
        <span class="preview-label">Yeni Son Alış Fiyatı:</span>
        <span class="preview-value">${result.newLastPurchasePrice?.toFixed(2) || '0.00'} ₺</span>
      </div>
      <div class="preview-row">
        <span class="preview-label">Yeni Satış Fiyatı:</span>
        <span class="preview-value">${result.newSalePrice?.toFixed(2) || '0.00'} ₺</span>
      </div>
    </div>
  `;
}

