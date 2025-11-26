/**
 * SKU Merge UI
 * Teklifbul Rule v1.0 - SKU birleştirme arayüzü
 */

import { db, auth, requireAuth } from '/firebase.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { searchStocks } from '/scripts/lib/stock-search.js';
import { getSkuMergePreview, mergeSkus } from '/scripts/inventory-sku-merge.js';
import { toast } from '../../src/shared/ui/toast.js';

const qs = s => document.querySelector(s);

const state = {
  sourceStock: null,
  targetStock: null,
  companyId: null,
  stocks: [],
  preview: null
};

// Initialize
(async () => {
  try {
    const user = await requireAuth();
    
    // Company ID'yi al
    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js');
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const userData = userDoc.exists() ? userDoc.data() : {};
    state.companyId = userData.companyId;
    
    if (!state.companyId) {
      toast.error('Kullanıcı company ID bulunamadı!');
      return;
    }
    
    // Stocks yükle
    await loadStocks();
    
    // Event listeners
    setupEventListeners();
  } catch (error) {
    console.error('Initialization error:', error);
    toast.error('Sayfa yüklenemedi: ' + error.message);
  }
})();

async function loadStocks() {
  try {
    const snap = await getDocs(collection(db, 'stocks'));
    state.stocks = [];
    snap.forEach(doc => {
      const data = doc.data();
      // Arşivlenmiş (merged) stock'ları gösterme
      if (!data.archived && !data.merged) {
        state.stocks.push({ id: doc.id, ...data });
      }
    });
  } catch (error) {
    console.error('Stocks load error:', error);
    toast.error('Stoklar yüklenemedi');
  }
}

function setupEventListeners() {
  // Source SKU search
  const sourceInput = qs('#sourceSku');
  sourceInput.addEventListener('input', (e) => {
    handleSearch(e.target.value, 'source');
  });
  
  // F6 tuşu ile source arama listesi açma
  sourceInput.addEventListener('keydown', (e) => {
    if (e.key === 'F6') {
      e.preventDefault();
      if (sourceInput.value.trim().length === 0) {
        // Eğer input boşsa, tüm stokları göster
        showAllStocks('source');
      } else {
        // Mevcut aramayı göster
        handleSearch(sourceInput.value, 'source');
      }
      const resultsDiv = qs('#sourceSearchResults');
      if (resultsDiv) {
        resultsDiv.style.display = 'block';
        sourceInput.focus();
      }
    }
  });
  
  // Target SKU search
  const targetInput = qs('#targetSku');
  targetInput.addEventListener('input', (e) => {
    handleSearch(e.target.value, 'target');
  });
  
  // F6 tuşu ile target arama listesi açma
  targetInput.addEventListener('keydown', (e) => {
    if (e.key === 'F6') {
      e.preventDefault();
      if (targetInput.value.trim().length === 0) {
        // Eğer input boşsa, tüm stokları göster
        showAllStocks('target');
      } else {
        // Mevcut aramayı göster
        handleSearch(targetInput.value, 'target');
      }
      const resultsDiv = qs('#targetSearchResults');
      if (resultsDiv) {
        resultsDiv.style.display = 'block';
        targetInput.focus();
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
  
  // Minimum 1 karakter (F6 ile tüm listeyi açabilmek için)
  if (!query || query.trim().length === 0) {
    resultsDiv.style.display = 'none';
    errorDiv.style.display = 'none';
    if (type === 'source') state.sourceStock = null;
    if (type === 'target') state.targetStock = null;
    updateButtons();
    return;
  }
  
  // Gelişmiş arama fonksiyonunu kullan
  const matches = searchStocks(state.stocks, query, 50);
  
  if (matches.length === 0) {
    resultsDiv.style.display = 'none';
    errorDiv.textContent = 'Stok bulunamadı';
    errorDiv.style.display = 'block';
    if (type === 'source') state.sourceStock = null;
    if (type === 'target') state.targetStock = null;
    updateButtons();
    return;
  }
  
  errorDiv.style.display = 'none';
  resultsDiv.style.display = 'block';
  resultsDiv.innerHTML = '';
  
  // Sonuç sayısı başlığı
  const header = document.createElement('div');
  header.style.padding = '8px 12px';
  header.style.background = '#f3f4f6';
  header.style.borderBottom = '1px solid #e5e7eb';
  header.style.fontSize = '12px';
  header.style.fontWeight = '600';
  header.style.color = '#374151';
  header.textContent = `${matches.length} sonuç bulundu${matches.length >= 50 ? ' (İlk 50 gösteriliyor)' : ''}`;
  resultsDiv.appendChild(header);
  
  matches.forEach((stock, index) => {
    const div = document.createElement('div');
    div.className = 'search-result-item';
    div.setAttribute('tabindex', '0');
    div.setAttribute('role', 'option');
    div.setAttribute('aria-label', `${stock.sku} - ${stock.name}`);
    div.innerHTML = `
      <div class="stock-info">
        <div>
          <div class="stock-sku">${stock.sku}</div>
          <div class="stock-name">${stock.name}</div>
        </div>
      </div>
    `;
    
    // Tıklama ile seçim
    div.addEventListener('click', () => {
      selectStock(stock, type);
    });
    
    // Enter tuşu ile seçim
    div.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        selectStock(stock, type);
      }
      // Ok tuşları ile gezinme
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = div.nextElementSibling;
        if (next) next.focus();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = div.previousElementSibling;
        if (prev) prev.focus();
        else {
          const input = type === 'source' ? qs('#sourceSku') : qs('#targetSku');
          if (input) input.focus();
        }
      }
    });
    
    // Hover efekti
    div.addEventListener('mouseenter', () => {
      div.style.background = '#f9fafb';
    });
    div.addEventListener('mouseleave', () => {
      div.style.background = '';
    });
    
    resultsDiv.appendChild(div);
  });
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

// F6 ile tüm stokları gösterme
function showAllStocks(type) {
  const resultsDiv = qs(`#${type}SearchResults`);
  const errorDiv = qs(`#${type}Error`);
  
  if (state.stocks.length === 0) {
    errorDiv.textContent = 'Stok bulunamadı';
    errorDiv.style.display = 'block';
    resultsDiv.style.display = 'none';
    return;
  }
  
  errorDiv.style.display = 'none';
  resultsDiv.style.display = 'block';
  resultsDiv.innerHTML = '';
  
  // Sonuç sayısı başlığı
  const header = document.createElement('div');
  header.style.padding = '8px 12px';
  header.style.background = '#f3f4f6';
  header.style.borderBottom = '1px solid #e5e7eb';
  header.style.fontSize = '12px';
  header.style.fontWeight = '600';
  header.style.color = '#374151';
  header.textContent = `${state.stocks.length} stok bulundu (İlk 50 gösteriliyor)`;
  resultsDiv.appendChild(header);
  
  // İlk 50 stoku göster
  state.stocks.slice(0, 50).forEach((stock) => {
    const div = document.createElement('div');
    div.className = 'search-result-item';
    div.setAttribute('tabindex', '0');
    div.setAttribute('role', 'option');
    div.setAttribute('aria-label', `${stock.sku} - ${stock.name}`);
    div.innerHTML = `
      <div class="stock-info">
        <div>
          <div class="stock-sku">${stock.sku}</div>
          <div class="stock-name">${stock.name}</div>
        </div>
      </div>
    `;
    
    div.addEventListener('click', () => {
      selectStock(stock, type);
    });
    
    div.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        selectStock(stock, type);
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = div.nextElementSibling;
        if (next) next.focus();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = div.previousElementSibling;
        if (prev) prev.focus();
        else {
          const input = type === 'source' ? qs('#sourceSku') : qs('#targetSku');
          if (input) input.focus();
        }
      }
    });
    
    div.addEventListener('mouseenter', () => {
      div.style.background = '#f9fafb';
    });
    div.addEventListener('mouseleave', () => {
      div.style.background = '';
    });
    
    resultsDiv.appendChild(div);
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
      toast.error('Lütfen kaynak ve hedef SKU seçin');
      return;
    }
    
    if (state.sourceStock.sku === state.targetStock.sku) {
      toast.error('Kaynak ve hedef SKU aynı olamaz');
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
    console.error('Preview error:', error);
    toast.error('Önizleme hatası: ' + error.message);
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
      toast.error('Lütfen önce önizleme yapın');
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
    
    toast.success('SKU birleştirme başarıyla tamamlandı!');
    
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
    console.error('Merge error:', error);
    toast.error('Birleştirme hatası: ' + error.message);
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

