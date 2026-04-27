/**
 * SKU Merge UI
 * Teklifbul Rule v1.0 - SKU birleştirme arayüzü
 */

import { db, auth, requireAuth } from '/firebase.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { searchStocks } from '/scripts/lib/stock-search.js';
import { getSkuMergePreview, mergeSkus } from '/scripts/inventory-sku-merge.js';
import { toast } from '/src/shared/ui/toast.js';
import { MESSAGES } from '/src/shared/constants/messages.js';
import { logger } from '/src/shared/log/logger.js';

const qs = s => document.querySelector(s);

const state = {
  sourceStock: null,
  targetStock: null,
  companyId: null,
  stocks: [],
  preview: null,
  isLoadingStocks: false,
  stocksLoaded: false
};

// Teklifbul Rule v1.0 - Debounce için timer'lar
let sourceSearchTimer = null;
let targetSearchTimer = null;

// Initialize
(async () => {
  try {
    const user = await requireAuth();
    
    // Company ID'yi al
    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js');
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const userData = userDoc.exists() ? userDoc.data() : {};
    state.companyId = userData.companyId;
    
    logger.info('Kullanıcı bilgileri', {
      uid: user.uid,
      email: user.email,
      companyId: state.companyId,
      userData: userData
    });
    
    if (!state.companyId) {
      logger.error('Company ID bulunamadı');
      toast.error(MESSAGES.ERROR_SKU_COMPANY_ID_NOT_FOUND);
      return;
    }
    
    // Stocks yükle
    await loadStocks();
    
    // Event listeners
    setupEventListeners();
  } catch (error) {
    logger.error('Initialization error', error);
    toast.error(`${MESSAGES.ERROR_SKU_PAGE_LOAD}: ${error.message}`);
  }
})();

async function loadStocks() {
  // Teklifbul Rule v1.0 - Çoklu çağrı önleme
  if (state.isLoadingStocks) {
    logger.info('Stoklar zaten yükleniyor, bekleniyor');
    return;
  }
  
  try {
    state.isLoadingStocks = true;
    
    if (!state.companyId) {
      logger.warn('Company ID yok, stoklar yüklenemiyor');
      toast.error(MESSAGES.ERROR_SKU_COMPANY_NOT_FOUND);
      state.isLoadingStocks = false;
      return;
    }
    
    logger.info(`Stoklar yükleniyor (companyId: ${state.companyId})`);
    
    // Company ID ile filtrele
    let allStocks = []; // Teklifbul Rule v1.0 - allStocks'u dış scope'ta tanımla
    try {
      const stocksQuery = query(
        collection(db, 'stocks'),
        where('companyId', '==', state.companyId)
      );
      const snap = await getDocs(stocksQuery);
      
      // Tüm stokları önce yükle (debug için)
      snap.forEach(doc => {
        const data = doc.data();
        allStocks.push({ id: doc.id, ...data });
      });
      
      logger.info(`Toplam ${allStocks.length} stok bulundu (companyId: ${state.companyId})`, allStocks.slice(0, 3).map(s => ({ 
        sku: s.sku, 
        name: s.name, 
        companyId: s.companyId,
        archived: s.archived,
        merged: s.merged 
      })));
      
      // Arşivlenmiş (merged) stock'ları filtrele
      state.stocks = allStocks.filter(s => !s.archived && !s.merged);
      
      // Teklifbul Rule v1.0 - Eğer companyId ile hiç stok bulunamadıysa, tüm stokları yükle ve client-side filtrele
      if (allStocks.length === 0) {
        logger.warn('CompanyId ile stok bulunamadı, tüm stoklar yükleniyor (client-side filtreleme)');
        const allSnap = await getDocs(collection(db, 'stocks'));
        allSnap.forEach(doc => {
          const data = doc.data();
          allStocks.push({ id: doc.id, ...data });
        });
        
        logger.info(`Toplam ${allStocks.length} stok bulundu (filtre olmadan)`);
        
        // Teklifbul Rule v1.0 - Debug: Stokların yapısını detaylı kontrol et
        if (allStocks.length > 0) {
          const sampleStock = allStocks[0];
          logger.info('Örnek stok yapısı (DETAYLI)', {
            id: sampleStock.id,
            sku: sampleStock.sku,
            name: sampleStock.name,
            companyId: sampleStock.companyId,
            companyIdType: typeof sampleStock.companyId,
            company_id: sampleStock.company_id, // Alternatif alan adı
            company: sampleStock.company, // Alternatif alan adı
            targetCompanyId: state.companyId,
            targetCompanyIdType: typeof state.companyId,
            archived: sampleStock.archived,
            merged: sampleStock.merged,
            allFields: Object.keys(sampleStock).sort()
          });
          
          // İlk 5 stokun companyId değerlerini göster
          const companyIds = allStocks.slice(0, 5).map(s => ({
            sku: s.sku,
            companyId: s.companyId,
            company_id: s.company_id,
            company: s.company,
            archived: s.archived,
            merged: s.merged
          }));
          logger.info('İlk 5 stokun companyId değerleri', companyIds);
        }
        
        // Client-side filtreleme: companyId eşleşen ve aktif olanlar
        // Teklifbul Rule v1.0 - String karşılaştırması yap (tip farkı olabilir)
        // Ayrıca alternatif alan adlarını da kontrol et (company_id, company)
        let filteredStocks = allStocks.filter(s => {
          const stockCompanyId = String(s.companyId || s.company_id || s.company || '').trim();
          const targetCompanyId = String(state.companyId || '').trim();
          const matchesCompany = stockCompanyId === targetCompanyId;
          const isActive = !s.archived && !s.merged;
          
          // Debug için eşleşmeyen stokları logla (sadece ilk 3)
          if (!matchesCompany && allStocks.indexOf(s) < 3) {
            logger.info('CompanyId eşleşmedi (DETAYLI)', {
              stockSku: s.sku,
              stockCompanyId: stockCompanyId,
              stockCompanyIdRaw: s.companyId,
              stockCompany_id: s.company_id,
              stockCompany: s.company,
              targetCompanyId: targetCompanyId,
              match: matchesCompany,
              isActive: isActive
            });
          }
          
          return matchesCompany && isActive;
        });
        
        logger.info(`${filteredStocks.length} aktif stok filtrelendi (companyId: ${state.companyId})`);
        
        // Teklifbul Rule v1.0 - Eğer companyId ile eşleşen stok yoksa, tüm aktif stokları göster
        // (Stok listesi sayfası gibi davran - companyId olmayan stoklar da görünsün)
        if (filteredStocks.length === 0 && allStocks.length > 0) {
          const companyMatches = allStocks.filter(s => {
            const stockCompanyId = String(s.companyId || s.company_id || s.company || '').trim();
            const targetCompanyId = String(state.companyId || '').trim();
            return stockCompanyId === targetCompanyId;
          });
          const activeStocks = allStocks.filter(s => !s.archived && !s.merged);
          
          if (companyMatches.length === 0) {
            logger.warn('Hiçbir stok companyId ile eşleşmedi, tüm aktif stoklar gösteriliyor', {
              targetCompanyId: state.companyId,
              totalStocks: allStocks.length,
              activeStocksCount: activeStocks.length,
              sampleCompanyIds: [...new Set(allStocks.slice(0, 10).map(s => s.companyId || 'undefined'))]
            });
            // CompanyId eşleşmediyse, tüm aktif stokları göster (stok listesi sayfası gibi)
            filteredStocks = activeStocks;
            toast.info(`CompanyId ile eşleşen stok bulunamadı. Tüm aktif stoklar gösteriliyor (${activeStocks.length} stok).`);
          } else if (activeStocks.length === 0) {
            logger.warn('Tüm stoklar arşivlenmiş veya birleştirilmiş', {
              totalStocks: allStocks.length,
              archivedCount: allStocks.filter(s => s.archived).length,
              mergedCount: allStocks.filter(s => s.merged).length
            });
            toast.warn(`Bu şirkete ait ${companyMatches.length} stok var ama hepsi arşivlenmiş veya birleştirilmiş.`);
          }
        }
        
        state.stocks = filteredStocks;
      }
    } catch (queryError) {
      // Eğer companyId filtresi çalışmazsa, tüm stokları yükle ve client-side filtrele
      logger.warn('CompanyId filtresi başarısız, tüm stoklar yükleniyor', queryError);
      const allSnap = await getDocs(collection(db, 'stocks'));
      allSnap.forEach(doc => {
        const data = doc.data();
        allStocks.push({ id: doc.id, ...data });
      });
      
      logger.info(`Toplam ${allStocks.length} stok bulundu (filtre olmadan)`);
      
      // Teklifbul Rule v1.0 - Debug: Stokların yapısını kontrol et
      if (allStocks.length > 0) {
        const sampleStock = allStocks[0];
        logger.info('Örnek stok yapısı', {
          id: sampleStock.id,
          sku: sampleStock.sku,
          name: sampleStock.name,
          companyId: sampleStock.companyId,
          companyIdType: typeof sampleStock.companyId,
          targetCompanyId: state.companyId,
          targetCompanyIdType: typeof state.companyId,
          archived: sampleStock.archived,
          merged: sampleStock.merged,
          allFields: Object.keys(sampleStock)
        });
        
        // CompanyId eşleşmelerini kontrol et
        const companyMatches = allStocks.filter(s => {
          const matchesCompany = String(s.companyId || '') === String(state.companyId || '');
          return matchesCompany;
        });
        logger.info(`${companyMatches.length} stok companyId ile eşleşiyor`, companyMatches.slice(0, 3).map(s => ({
          sku: s.sku,
          companyId: s.companyId,
          archived: s.archived,
          merged: s.merged
        })));
        
        // Aktif stokları kontrol et
        const activeStocks = allStocks.filter(s => !s.archived && !s.merged);
        logger.info(`${activeStocks.length} stok aktif (archived/merged değil)`, activeStocks.slice(0, 3).map(s => ({
          sku: s.sku,
          companyId: s.companyId,
          archived: s.archived,
          merged: s.merged
        })));
      }
      
      // Client-side filtreleme: companyId eşleşen ve aktif olanlar
      // Teklifbul Rule v1.0 - String karşılaştırması yap (tip farkı olabilir)
      state.stocks = allStocks.filter(s => {
        const stockCompanyId = String(s.companyId || '').trim();
        const targetCompanyId = String(state.companyId || '').trim();
        const matchesCompany = stockCompanyId === targetCompanyId;
        const isActive = !s.archived && !s.merged;
        return matchesCompany && isActive;
      });
      
      logger.info(`${state.stocks.length} aktif stok filtrelendi (companyId: ${state.companyId})`);
      
      // Eğer hiç stok bulunamadıysa, kullanıcıya bilgi ver
      if (state.stocks.length === 0 && allStocks.length > 0) {
        const companyMatches = allStocks.filter(s => {
          const stockCompanyId = String(s.companyId || '').trim();
          const targetCompanyId = String(state.companyId || '').trim();
          return stockCompanyId === targetCompanyId;
        });
        const activeStocks = allStocks.filter(s => !s.archived && !s.merged);
        
        if (companyMatches.length === 0) {
          logger.warn('Hiçbir stok companyId ile eşleşmedi', {
            targetCompanyId: state.companyId,
            totalStocks: allStocks.length,
            sampleCompanyIds: [...new Set(allStocks.slice(0, 10).map(s => s.companyId))]
          });
          toast.warn(`Bu şirkete ait stok bulunamadı. Toplam ${allStocks.length} stok var ama hiçbiri companyId: ${state.companyId} ile eşleşmiyor.`);
        } else if (activeStocks.length === 0) {
          logger.warn('Tüm stoklar arşivlenmiş veya birleştirilmiş', {
            totalStocks: allStocks.length,
            archivedCount: allStocks.filter(s => s.archived).length,
            mergedCount: allStocks.filter(s => s.merged).length
          });
          toast.warn(`Bu şirkete ait ${companyMatches.length} stok var ama hepsi arşivlenmiş veya birleştirilmiş.`);
        }
      }
    }
    
    logger.info(`${state.stocks.length} aktif stok yüklendi (${allStocks.length - state.stocks.length} arşivlenmiş/merged)`);
    
    state.stocksLoaded = true;
    
    if (state.stocks.length === 0) {
      // Sadece bir kez uyarı göster
      if (!state.stocksLoaded) {
        toast.warn('Bu şirkete ait aktif stok bulunamadı.');
      }
    }
  } catch (error) {
    logger.error('Stocks load error', error);
    toast.error(`${MESSAGES.ERROR_SKU_LOAD}: ${error.message}`);
    state.stocksLoaded = false;
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

