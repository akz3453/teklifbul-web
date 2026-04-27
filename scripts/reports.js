// Teklifbul Rule v1.0 - XSS Protection
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.2/+esm';
import { db, auth, requireAuth } from '/firebase.js';
import { collection, getDocs, query, where, orderBy, getDoc, doc, limit } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { getActiveCompanyId, resolveActiveCompany, setActiveCompanyId } from '/assets/js/state/company.js';
import { toast } from '/src/shared/ui/toast.js';
import { logger } from '/src/shared/log/logger.js';
import { MESSAGES } from '/src/shared/constants/messages.js';
import { requireCompanyContext } from '../assets/js/state/company-context.js';
import { initPermissions, can, getStockPerms } from '../assets/js/state/permissions.js';

const qs = s => document.querySelector(s);

const state = {
  stocks: [],
  movements: [],
  locations: [],
  balances: [],
  companyId: null,
  allowNegativeStock: false // Teklifbul Rule v1.0 - Şirket ayarı cache
};

const STOCK_PERMS = getStockPerms();

// Teklifbul Rule v1.0 - Chart.js: Chart instances (Min Stock Chart kaldırıldı)
let costSaleTrendChartInstance = null;
let locationDistributionChartInstance = null;

// Tab switching
qs('.tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  
  qs('.tab.active').classList.remove('active');
  tab.classList.add('active');
  
  const panelName = tab.dataset.tab + 'Panel';
  document.querySelectorAll('[id$="Panel"]').forEach(p => p.classList.add('hidden'));
  qs('#' + panelName).classList.remove('hidden');
  
  // Load report data
  if (tab.dataset.tab === 'minstock') loadMinStockReport();
  else if (tab.dataset.tab === 'costsale') loadCostSaleReport();
  else if (tab.dataset.tab === 'location') loadLocationReport();
  else if (tab.dataset.tab === 'cost') loadCostReport();
});

async function loadInitialData() {
  try {
    const user = await requireAuth();
    // Company context + permission state (stok raporları)
    const ctx = await requireCompanyContext({ redirectOnPending: true });
    if (!ctx || !ctx.companyId) {
      logger.warn('Reports: company context alınamadı, raporlar yüklenmiyor', { ctx });
      toast.error(
        (MESSAGES.ERROR_COMPANY_ID_REQUIRED || 'Şirket bilgisi doğrulanamadı') +
          '. Stok raporları yüklenemedi.'
      );
      return;
    }

    const permState = await initPermissions({ redirectOnPending: true });
    if (!permState) {
      logger.warn('Reports: initPermissions sonuç vermedi, raporlar yüklenmiyor');
      return;
    }

    if (STOCK_PERMS.reports && !can(STOCK_PERMS.reports)) {
      const msg =
        MESSAGES.ERROR_PERMISSION_STOCK_REPORTS ||
        MESSAGES.ERROR_PERMISSION_DENIED ||
        'Stok raporlarını görüntüleme yetkiniz yok.';
      toast.error(msg);
      logger.warn('Reports: stock.reports izni yok, URL guard tetiklendi', {
        permKey: STOCK_PERMS.reports,
        companyId: permState.companyId,
        roleKey: permState.roleKey
      });
      const container = document.querySelector('.container') || document.body;
      // Teklifbul Rule v1.0 - XSS Protection
      container.innerHTML = DOMPurify.sanitize(`
        <div style="max-width:640px;margin:40px auto;padding:24px;border-radius:12px;border:1px solid #fee2e2;background:#fef2f2;color:#b91c1c;">
          <h2 style="margin:0 0 8px 0;">Stok raporlarını görüntüleme yetkiniz yok.</h2>
          <p style="margin:0;font-size:14px;">
            Bu ekranda raporları görebilmek için şirket yöneticinizden ilgili yetkiyi talep edebilirsiniz.
          </p>
        </div>
      `, {
        ALLOWED_TAGS: ['div', 'h2', 'p'],
        ALLOWED_ATTR: ['style']
      });
      return;
    }
    // Teklifbul Rule v1.0 - Company ID filtresi
    // Company context'ten companyId al (requireCompanyContext zaten çağrıldı)
    state.companyId = ctx.companyId;
    
    logger.group('Reports - Data Loading');
    logger.info('Company ID resolved', { 
      companyId: state.companyId,
      fromContext: ctx.companyId,
      fromGetActive: await getActiveCompanyId()
    });
    
    if (!state.companyId && user?.uid) {
      logger.info('Active company missing, resolving from memberships', { uid: user.uid });
      const resolved = await resolveActiveCompany(user.uid);
      if (resolved) {
        state.companyId = resolved;
        setActiveCompanyId(resolved);
        logger.info('Active company resolved', { companyId: resolved });
      }
    }
    
    if (!state.companyId) {
      logger.error('Company ID bulunamadı');
      toast.error(MESSAGES.ERROR_REPORT_COMPANY_NOT_FOUND);
      logger.end();
      return;
    }
    
    logger.info('Starting data load with companyId', { companyId: state.companyId });
    
    // Stocks - companyId filtresi ile
    try {
      logger.info('Loading stocks', { companyId: state.companyId, collection: 'stocks' });
      const stocksQuery = query(
        collection(db, 'stocks'),
        where('companyId', '==', state.companyId),
        limit(10000) // Teklifbul Rule v1.0 - Limit eklendi
      );
      logger.info('Stocks query created', { query: 'stocks where companyId == ' + state.companyId });
      const stocksSnap = await getDocs(stocksQuery);
      logger.info('Stocks query executed', { 
        size: stocksSnap.size, 
        empty: stocksSnap.empty,
        docsCount: stocksSnap.docs.length
      });
      state.stocks = [];
      stocksSnap.forEach(doc => {
        const stockData = { id: doc.id, ...doc.data() };
        state.stocks.push(stockData);
        
        // Teklifbul Rule v1.0 - Debug: 001-RC3680 SKU için log
        if (stockData.sku === '001-RC3680') {
          logger.info('Debug: Found 001-RC3680 stock', {
            stockId: stockData.id,
            sku: stockData.sku,
            name: stockData.name,
            companyId: stockData.companyId
          });
        }
      });
      
      logger.info('Stocks loaded', {
        count: state.stocks.length,
        // Teklifbul Rule v1.0 - Debug: 001-RC3680 için özel sayım
        debugSKUCount: state.stocks.filter(s => s.sku === '001-RC3680').length,
        firstStockSample: state.stocks.length > 0 ? {
          id: state.stocks[0].id,
          sku: state.stocks[0].sku,
          companyId: state.stocks[0].companyId
        } : null
      });
    } catch (error) {
      logger.error('Error loading stocks', { error: error.message, companyId: state.companyId });
      toast.error(MESSAGES.ERROR_REPORT_STOCKS_LOAD.replace('{message}', error.message));
    }
    
    // Movements - companyId filtresi ile
    const movementsQuery = query(
      collection(db, 'stock_movements'),
      where('companyId', '==', state.companyId),
      orderBy('createdAt', 'desc')
    );
    const movementsSnap = await getDocs(movementsQuery);
    state.movements = [];
    movementsSnap.forEach(doc => {
      state.movements.push({ id: doc.id, ...doc.data() });
    });
    
    // Locations - companyId filtresi ile
    try {
      logger.info('Loading locations', { companyId: state.companyId, collection: 'stock_locations' });
      const locsQuery = query(
        collection(db, 'stock_locations'),
        where('companyId', '==', state.companyId),
        limit(1000) // Teklifbul Rule v1.0 - Limit eklendi
      );
      logger.info('Locations query created', { query: 'stock_locations where companyId == ' + state.companyId });
      const locsSnap = await getDocs(locsQuery);
      logger.info('Locations query executed', { 
        size: locsSnap.size, 
        empty: locsSnap.empty,
        docsCount: locsSnap.docs.length
      });
      state.locations = [];
      locsSnap.forEach(doc => {
        const locationData = { id: doc.id, ...doc.data() };
        state.locations.push(locationData);
        
        // Teklifbul Rule v1.0 - Debug: ADANADEPO lokasyonu için log
        if (locationData.name && locationData.name.toUpperCase().includes('ADANADEPO')) {
          logger.info('Debug: Found ADANADEPO location', {
            locationId: locationData.id,
            locationName: locationData.name,
            companyId: locationData.companyId
          });
        }
      });
      
      logger.info('Locations loaded', {
        count: state.locations.length,
        locationNames: state.locations.map(l => l.name).slice(0, 10),
        firstLocationSample: state.locations.length > 0 ? {
          id: state.locations[0].id,
          name: state.locations[0].name,
          companyId: state.locations[0].companyId
        } : null
      });
    } catch (error) {
      logger.error('Error loading locations', { error: error.message, companyId: state.companyId });
      toast.error(MESSAGES.ERROR_REPORT_LOCATIONS_LOAD.replace('{message}', error.message));
    }
    
    // Stock Balances - companyId filtresi ile (mevcut stok miktarları için)
    try {
      logger.info('Loading balances', { companyId: state.companyId, collection: 'stock_balances' });
      const balancesQuery = query(
        collection(db, 'stock_balances'),
        where('companyId', '==', state.companyId)
      );
      logger.info('Balances query created', { query: 'stock_balances where companyId == ' + state.companyId });
      const balancesSnap = await getDocs(balancesQuery);
      logger.info('Balances query executed', { 
        size: balancesSnap.size, 
        empty: balancesSnap.empty,
        docsCount: balancesSnap.docs.length
      });
      state.balances = [];
      balancesSnap.forEach(doc => {
        const balanceData = doc.data();
        const balance = { 
          id: doc.id, 
          ...balanceData,
          // Teklifbul Rule v1.0 - minStockLevel ve maxStockLevel alanlarını doğru oku
          minStockLevel: balanceData.minStockLevel !== undefined ? balanceData.minStockLevel : null,
          maxStockLevel: balanceData.maxStockLevel !== undefined ? balanceData.maxStockLevel : null
        };
        state.balances.push(balance);
        
        // Teklifbul Rule v1.0 - Debug: Belirli SKU için log
        if (balance.sku === '001-RC3680') {
          logger.info('Debug: Found 001-RC3680 balance', {
            balanceId: balance.id,
            sku: balance.sku,
            locationId: balance.locationId,
            quantity: balance.quantity,
            minStockLevel: balance.minStockLevel,
            maxStockLevel: balance.maxStockLevel,
            companyId: balance.companyId
          });
        }
      });
      
      logger.info('Balances loaded', {
        count: state.balances.length,
        withMinStock: state.balances.filter(b => b.minStockLevel && b.minStockLevel > 0).length,
        // Teklifbul Rule v1.0 - Debug: 001-RC3680 için özel sayım
        debugSKUCount: state.balances.filter(b => b.sku === '001-RC3680').length,
        firstBalanceSample: state.balances.length > 0 ? {
          id: state.balances[0].id,
          sku: state.balances[0].sku,
          locationId: state.balances[0].locationId,
          companyId: state.balances[0].companyId
        } : null
      });
    } catch (error) {
      logger.error('Error loading balances', { error: error.message, companyId: state.companyId });
      toast.error(MESSAGES.ERROR_REPORT_BALANCES_LOAD.replace('{message}', error.message));
    }
    
    logger.end(); // Reports - Data Loading grubunu kapat
    
    // Teklifbul Rule v1.0 - Şirket ayarını yükle
    try {
      const companyDoc = await getDoc(doc(db, 'companies', state.companyId));
      if (companyDoc.exists()) {
        const companyData = companyDoc.data();
        state.allowNegativeStock = companyData.allowNegativeStock === true;
      }
    } catch (error) {
      console.warn('Şirket ayarı yüklenemedi', error);
    }
    
    // Load first report
    loadMinStockReport();
    
  } catch (error) {
    console.error('Initial load error:', error);
  }
}

async function loadMinStockReport() {
  // Permission Query Guard - Stok Raporları
  if (STOCK_PERMS.reports && !can(STOCK_PERMS.reports)) {
    logger.warn('Reports: stock.reports izni yok, loadMinStockReport iptal edildi', {
      permKey: STOCK_PERMS.reports
    });
    return;
  }

  // Teklifbul Rule v1.0 - Lokasyon bazlı minimum stok kontrolü
  // Her lokasyon için ayrı ayrı kontrol et
  const lowStocks = [];
  
  logger.group('Min Stock Report');
  logger.info('Checking min stock levels', {
    locationsCount: state.locations.length,
    stocksCount: state.stocks.length,
    balancesCount: state.balances.length
  });
  
  // Lokasyon bazlı kontrol
  // Teklifbul Rule v1.0 - Önce tüm balance'ları kontrol et (daha verimli)
  // Her balance için ilgili stok ve lokasyonu bul
  state.balances.forEach(balance => {
    // Balance'ın minStockLevel'ı var mı kontrol et
    const minStock = balance.minStockLevel;
    
    // Teklifbul Rule v1.0 - Debug: Belirli SKU ve lokasyon için detaylı log
    const isDebugSKU = balance.sku === '001-RC3680';
    if (isDebugSKU) {
      logger.info('Debug balance check', {
        balanceId: balance.id,
        sku: balance.sku,
        locationId: balance.locationId,
        quantity: balance.quantity,
        minStockLevel: balance.minStockLevel,
        minStock: minStock
      });
    }
    
    if (!minStock || minStock <= 0) {
      // Teklifbul Rule v1.0 - Lokasyon bazlı min stok yoksa stok kartındaki global değeri kullan
      const stock = state.stocks.find(s => s.sku === balance.sku);
      const globalMin = stock?.minStockLevel;
      
      if (globalMin && globalMin > 0) {
        // Devam et, globalMin'i kullanacağız
      } else {
        if (isDebugSKU) {
          logger.warn('Debug: Min stock not defined or invalid (global and local)', { minStock, minStockLevel: balance.minStockLevel, globalMin });
        }
        return; // Min stock tanımlı değilse atla
      }
    }
    
    // Bu balance'a ait stoku bul
    const stock = state.stocks.find(s => s.sku === balance.sku);
    if (!stock) {
      if (isDebugSKU) {
        logger.warn('Debug: Stock not found', { sku: balance.sku, availableSKUs: state.stocks.map(s => s.sku).slice(0, 5) });
      }
      return; // Stok bulunamadıysa atla
    }
    
    // Değeri kesinleştir
    const finalMinStock = (balance.minStockLevel && balance.minStockLevel > 0) ? balance.minStockLevel : stock.minStockLevel;
    
    // Bu balance'a ait lokasyonu bul
    // Teklifbul Rule v1.0 - locationId eşleşmesi için hem id hem de name kontrolü
    let location = state.locations.find(l => l.id === balance.locationId);
    
    // Eğer id ile bulunamazsa, name ile de dene (case-insensitive)
    if (!location && balance.locationId) {
      location = state.locations.find(l => 
        l.name && balance.locationId && 
        l.name.toUpperCase().trim() === balance.locationId.toUpperCase().trim()
      );
    }
    
    if (!location) {
      if (isDebugSKU) {
        logger.warn('Debug: Location not found', { 
          balanceLocationId: balance.locationId,
          balanceLocationIdType: typeof balance.locationId,
          availableLocations: state.locations.map(l => ({ 
            id: l.id, 
            name: l.name,
            idType: typeof l.id
          })).slice(0, 10) 
        });
      }
      return; // Lokasyon bulunamadıysa atla
    }
    
    // Teklifbul Rule v1.0 - Debug: ADANADEPO lokasyonu için kontrol
    const isDebugLocation = location.name && location.name.toUpperCase().includes('ADANADEPO');
    if (isDebugLocation && isDebugSKU) {
      logger.info('Debug: Found ADANADEPO location', {
        locationId: location.id,
        locationName: location.name,
        balanceLocationId: balance.locationId
      });
    }
    
    // Bu lokasyondaki mevcut miktar
    let currentQty = balance.quantity || 0;
    // Teklifbul Rule v1.0 - Ayar kapalıysa ve negatifse 0 göster
    if (!state.allowNegativeStock && currentQty < 0) {
      currentQty = 0;
    }
    
    // Min stock'un altındaysa listeye ekle
    if (currentQty < finalMinStock) {
      logger.info('Low stock found', {
        sku: stock.sku,
        name: stock.name,
        location: location.name,
        locationId: location.id,
        currentQty,
        minStock: finalMinStock,
        balanceId: balance.id,
        balanceQuantity: balance.quantity
      });
      
      // Teklifbul Rule v1.0 - Duplicate kontrolü (aynı stok + lokasyon kombinasyonu)
      const existing = lowStocks.find(ls => 
        ls.sku === stock.sku && ls.locationId === location.id
      );
      if (!existing) {
        lowStocks.push({
          ...stock,
          locationId: location.id,
          locationName: location.name,
          currentQty: currentQty,
          minStock: finalMinStock
        });
      } else {
        logger.warn('Duplicate low stock entry skipped', {
          sku: stock.sku,
          locationId: location.id
        });
      }
    } else if (isDebugSKU && isDebugLocation) {
      logger.info('Debug: Stock is NOT below min', {
        sku: stock.sku,
        location: location.name,
        currentQty,
        minStock: finalMinStock,
        comparison: `${currentQty} >= ${finalMinStock}`
      });
    }
  });
  
  // Teklifbul Rule v1.0 - Bakiyesi olmayan (hiç hareketi olmamış) ürünleri de kontrol et
  state.stocks.forEach(stock => {
    // Eğer bu ürünün herhangi bir bakiyesi varsa zaten yukarıda kontrol edildi
    const hasBalance = state.balances.some(b => b.sku === stock.sku);
    if (hasBalance) return;
    
    const globalMin = stock.minStockLevel || 0;
    if (globalMin > 0) {
      // 0 adet < globalMin ise düşük stoktur
      const alreadyListed = lowStocks.some(p => p.sku === stock.sku);
      if (!alreadyListed) {
        lowStocks.push({
          ...stock,
          locationId: 'GLOBAL',
          locationName: 'Tüm Lokasyonlar (Kayıt Yok)',
          currentQty: 0,
          minStock: globalMin
        });
      }
    }
  });

  logger.info('Low stocks count', { count: lowStocks.length });
  logger.end();
  
  const stats = qs('#minstockStats');
  // Teklifbul Rule v1.0 - XSS Protection
  stats.innerHTML = DOMPurify.sanitize(`
    <div class="stat-card">
      <div class="stat-value">${lowStocks.length}</div>
      <div class="stat-label">Düşük Stok (Lokasyon Bazlı)</div>
    </div>
  `, {
    ALLOWED_TAGS: ['div'],
    ALLOWED_ATTR: ['class']
  });
  
  const tbody = qs('#minstockTable tbody');
  tbody.innerHTML = '';
  
  if (!lowStocks.length) {
    // Teklifbul Rule v1.0 - XSS Protection
    tbody.innerHTML = DOMPurify.sanitize('<tr><td colspan="8" style="text-align:center;color:#6b7280">Düşük stok bulunamadı.</td></tr>', {
      ALLOWED_TAGS: ['tr', 'td'],
      ALLOWED_ATTR: ['colspan', 'style']
    });
    return;
  }
  
  lowStocks.forEach(stock => {
    const tr = document.createElement('tr');
    let current = stock.currentQty || 0;
    // Teklifbul Rule v1.0 - Ayar kapalıysa ve negatifse 0 göster
    if (!state.allowNegativeStock && current < 0) {
      current = 0;
    }
    const minStock = stock.minStock || 0;
    // Teklifbul Rule v1.0 - XSS Protection
    const safeSku = DOMPurify.sanitize(stock.sku || '', { ALLOWED_TAGS: [] });
    const safeName = DOMPurify.sanitize(stock.name || '', { ALLOWED_TAGS: [] });
    const safeBrand = DOMPurify.sanitize(stock.brand || '-', { ALLOWED_TAGS: [] });
    tr.innerHTML = DOMPurify.sanitize(`
      <td>${safeSku}</td>
      <td>${safeName}</td>
      <td>${safeBrand}</td>
      <td>${stock.unit || 'ADT'}</td>
      <td>${stock.locationName || '-'}</td>
      <td>${current.toFixed(2)}</td>
      <td>${minStock.toFixed(2)}</td>
      <td><span class="badge b-error">⚠️ Düşük</span></td>
    `, {
      ALLOWED_TAGS: ['td', 'span'],
      ALLOWED_ATTR: ['class']
    });
    tbody.appendChild(tr);
  });
}

// Teklifbul Rule v1.0 - Min Stock Chart kaldırıldı (kullanıcı isteği)

async function loadCostSaleReport() {
  if (STOCK_PERMS.reports && !can(STOCK_PERMS.reports)) {
    logger.warn('Reports: stock.reports izni yok, loadCostSaleReport iptal edildi', {
      permKey: STOCK_PERMS.reports
    });
    return;
  }
  // Teklifbul Rule v1.0 - Stock balances'den avgCost al (stocks'tan değil)
  const belowCost = state.movements.filter(m => {
    if (m.type !== 'OUT') return false;
    const stock = state.stocks.find(s => s.id === m.stockId);
    if (!stock) return false;
    
    // Stock balance'den avgCost al (en güncel)
    const balance = state.balances.find(b => b.sku === m.sku && b.locationId === m.locationId);
    const avgCost = balance?.avgCost || stock.avgCost || 0;
    
    return avgCost > 0 && m.unitCost > 0 && m.unitCost < avgCost;
  });
  
  const stats = qs('#costsaleStats');
  // Teklifbul Rule v1.0 - XSS Protection
  stats.innerHTML = DOMPurify.sanitize(`
    <div class="stat-card">
      <div class="stat-value">${belowCost.length}</div>
      <div class="stat-label">Maliyet Altı</div>
    </div>
  `, {
    ALLOWED_TAGS: ['div'],
    ALLOWED_ATTR: ['class']
  });
  
  // Teklifbul Rule v1.0 - Chart.js: Update Cost Sale Trend Chart
  updateCostSaleTrendChart(belowCost);
  
  const tbody = qs('#costsaleTable tbody');
  tbody.innerHTML = '';
  
  if (!belowCost.length) {
    // Teklifbul Rule v1.0 - XSS Protection
    tbody.innerHTML = DOMPurify.sanitize('<tr><td colspan="7" style="text-align:center;color:#6b7280">Maliyet altı satış bulunamadı.</td></tr>', {
      ALLOWED_TAGS: ['tr', 'td'],
      ALLOWED_ATTR: ['colspan', 'style']
    });
    return;
  }
  
  belowCost.forEach(mv => {
    const stock = state.stocks.find(s => s.id === mv.stockId);
    const balance = state.balances.find(b => b.sku === mv.sku && b.locationId === mv.locationId);
    const avgCost = balance?.avgCost || stock?.avgCost || 0;
    const date = mv.createdAt ? new Date(mv.createdAt.toDate()).toLocaleDateString('tr-TR') : '-';
    const diff = avgCost - (mv.unitCost || 0);
    
    const tr = document.createElement('tr');
    // Teklifbul Rule v1.0 - XSS Protection
    const safeSku = DOMPurify.sanitize(mv.sku || '', { ALLOWED_TAGS: [] });
    const safeStockName = DOMPurify.sanitize(stock?.name || '-', { ALLOWED_TAGS: [] });
    tr.innerHTML = DOMPurify.sanitize(`
      <td>${date}</td>
      <td>${safeSku}</td>
      <td>${safeStockName}</td>
      <td>${mv.qty}</td>
      <td>${avgCost.toFixed(2)}</td>
      <td>${mv.unitCost?.toFixed(2) || 0}</td>
      <td><span class="badge b-error">${diff.toFixed(2)}</span></td>
    `, {
      ALLOWED_TAGS: ['td', 'span'],
      ALLOWED_ATTR: ['class']
    });
    tbody.appendChild(tr);
  });
}

// Teklifbul Rule v1.0 - Chart.js: Cost Sale Trend Chart
function updateCostSaleTrendChart(belowCost) {
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js not loaded');
    return;
  }
  
  const ctx = qs('#costSaleTrendChart');
  if (!ctx) return;
  
  const ChartLib = window.Chart;
  
  // Destroy existing chart
  if (costSaleTrendChartInstance) {
    costSaleTrendChartInstance.destroy();
  }
  
  if (belowCost.length === 0) {
    return;
  }
  
  // Group by date (daily)
  const groupedByDate = {};
  belowCost.forEach(mv => {
    if (!mv.createdAt) return;
    const date = new Date(mv.createdAt.toDate()).toISOString().split('T')[0];
    if (!groupedByDate[date]) {
      groupedByDate[date] = [];
    }
    groupedByDate[date].push(mv);
  });
  
  // Sort dates
  const sortedDates = Object.keys(groupedByDate).sort();
  const labels = sortedDates.map(d => {
    const date = new Date(d);
    return date.toLocaleDateString('tr-TR', { month: 'short', day: 'numeric' });
  });
  const data = sortedDates.map(d => groupedByDate[d].length);
  
  costSaleTrendChartInstance = new ChartLib(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Maliyet Altı Satış Sayısı',
        data: data,
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        tension: 0.4,
        fill: true,
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top'
        },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label}: ${context.parsed.y} adet`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          }
        }
      }
    }
  });
}

async function loadLocationReport() {
  if (STOCK_PERMS.reports && !can(STOCK_PERMS.reports)) {
    logger.warn('Reports: stock.reports izni yok, loadLocationReport iptal edildi', {
      permKey: STOCK_PERMS.reports
    });
    return;
  }
  const select = qs('#locationFilter');
  // Teklifbul Rule v1.0 - XSS Protection
  select.innerHTML = DOMPurify.sanitize('<option value="">Tüm Lokasyonlar</option>', {
    ALLOWED_TAGS: ['option'],
    ALLOWED_ATTR: ['value']
  });
  state.locations.forEach(loc => {
    const opt = document.createElement('option');
    opt.value = loc.id;
    // Teklifbul Rule v1.0 - XSS Protection
    const safeLocName = DOMPurify.sanitize(loc.name || '', { ALLOWED_TAGS: [] });
    const safeLocType = DOMPurify.sanitize(loc.type || '', { ALLOWED_TAGS: [] });
    opt.textContent = `${safeLocName} (${safeLocType})`;
    select.appendChild(opt);
  });
  
  select.addEventListener('change', () => {
    const locationId = select.value;
    renderLocationTable(locationId);
  });
  
  renderLocationTable('');
}

function renderLocationTable(locationId) {
  // Teklifbul Rule v1.0 - Stock balances'den lokasyon bazlı stok miktarlarını göster
  let filteredBalances = state.balances;
  
  if (locationId) {
    filteredBalances = state.balances.filter(b => b.locationId === locationId);
  }
  
  // Sadece stoku olan (quantity > 0) balance'ları göster
  const activeBalances = filteredBalances.filter(b => (b.quantity || 0) > 0);
  
  const stats = qs('#locationStats');
  // Teklifbul Rule v1.0 - XSS Protection
  stats.innerHTML = DOMPurify.sanitize(`
    <div class="stat-card">
      <div class="stat-value">${activeBalances.length}</div>
      <div class="stat-label">Stoklu Ürün</div>
    </div>
  `, {
    ALLOWED_TAGS: ['div'],
    ALLOWED_ATTR: ['class']
  });
  
  // Teklifbul Rule v1.0 - Chart.js: Update Location Distribution Chart
  updateLocationDistributionChart(filteredBalances);
  
  const tbody = qs('#locationTable tbody');
  tbody.innerHTML = '';
  
  if (!activeBalances.length) {
    // Teklifbul Rule v1.0 - XSS Protection
    tbody.innerHTML = DOMPurify.sanitize('<tr><td colspan="5" style="text-align:center;color:#6b7280">Veri bulunamadı.</td></tr>', {
      ALLOWED_TAGS: ['tr', 'td'],
      ALLOWED_ATTR: ['colspan', 'style']
    });
    return;
  }
  
  activeBalances.forEach(balance => {
    const stock = state.stocks.find(s => s.sku === balance.sku);
    const loc = state.locations.find(l => l.id === balance.locationId);
    
    // Teklifbul Rule v1.0 - Ayar kapalıysa ve negatifse 0 göster
    let displayQty = balance.quantity || 0;
    if (!state.allowNegativeStock && displayQty < 0) {
      displayQty = 0;
    }
    
    const tr = document.createElement('tr');
    // Teklifbul Rule v1.0 - XSS Protection
    const safeSku = DOMPurify.sanitize(balance.sku || '', { ALLOWED_TAGS: [] });
    const safeStockName = DOMPurify.sanitize(stock?.name || '-', { ALLOWED_TAGS: [] });
    const safeLocName = DOMPurify.sanitize(loc?.name || '-', { ALLOWED_TAGS: [] });
    const safeUnit = DOMPurify.sanitize(stock?.unit || 'ADT', { ALLOWED_TAGS: [] });
    tr.innerHTML = DOMPurify.sanitize(`
      <td>${safeSku}</td>
      <td>${safeStockName}</td>
      <td>${safeLocName}</td>
      <td>${displayQty.toFixed(2)}</td>
      <td>${safeUnit}</td>
    `, {
      ALLOWED_TAGS: ['td'],
      ALLOWED_ATTR: []
    });
    tbody.appendChild(tr);
  });
}

// Teklifbul Rule v1.0 - Chart.js: Location Distribution Chart
function updateLocationDistributionChart(movements) {
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js not loaded');
    return;
  }
  
  const ctx = qs('#locationDistributionChart');
  if (!ctx) return;
  
  const ChartLib = window.Chart;
  
  // Destroy existing chart
  if (locationDistributionChartInstance) {
    locationDistributionChartInstance.destroy();
  }
  
  if (movements.length === 0) {
    return;
  }
  
  // Group by location (stock balances'den)
  const locationCounts = {};
  movements.forEach(balance => {
    const loc = state.locations.find(l => l.id === balance.locationId);
    const locName = loc?.name || 'Bilinmeyen';
    locationCounts[locName] = (locationCounts[locName] || 0) + (balance.quantity || 0);
  });
  
  // Sort by count (descending) and take top 10
  const sortedLocations = Object.entries(locationCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  if (sortedLocations.length === 0) {
    return;
  }
  
  const labels = sortedLocations.map(([name]) => name);
  const data = sortedLocations.map(([, count]) => count);
  const colors = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'
  ];
  
  locationDistributionChartInstance = new ChartLib(ctx, {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors.slice(0, labels.length),
        borderColor: '#fff',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'bottom'
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const total = data.reduce((sum, val) => sum + val, 0);
              const percentage = ((context.parsed / total) * 100).toFixed(1);
              return `${context.label}: ${context.parsed} (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

async function loadCostReport() {
  if (STOCK_PERMS.reports && !can(STOCK_PERMS.reports)) {
    logger.warn('Reports: stock.reports izni yok, loadCostReport iptal edildi', {
      permKey: STOCK_PERMS.reports
    });
    return;
  }
  const inMovements = state.movements.filter(m => m.type === 'IN');
  
  const stats = qs('#costStats');
  // Teklifbul Rule v1.0 - XSS Protection
  stats.innerHTML = DOMPurify.sanitize(`
    <div class="stat-card">
      <div class="stat-value">${inMovements.length}</div>
      <div class="stat-label">Giriş Hareketi</div>
    </div>
  `, {
    ALLOWED_TAGS: ['div'],
    ALLOWED_ATTR: ['class']
  });
  
  const tbody = qs('#costTable tbody');
  tbody.innerHTML = '';
  
  if (!inMovements.length) {
    // Teklifbul Rule v1.0 - XSS Protection
    tbody.innerHTML = DOMPurify.sanitize('<tr><td colspan="8" style="text-align:center;color:#6b7280">Giriş hareketi bulunamadı.</td></tr>', {
      ALLOWED_TAGS: ['tr', 'td'],
      ALLOWED_ATTR: ['colspan', 'style']
    });
    return;
  }
  
  inMovements.slice(0, 50).forEach(mv => {
    const stock = state.stocks.find(s => s.id === mv.stockId);
    const date = mv.createdAt ? new Date(mv.createdAt.toDate()).toLocaleDateString('tr-TR') : '-';
    const extras = mv.extras?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0;
    
    const tr = document.createElement('tr');
    // Teklifbul Rule v1.0 - XSS Protection
    const safeSku = DOMPurify.sanitize(mv.sku || '', { ALLOWED_TAGS: [] });
    const safeStockName = DOMPurify.sanitize(stock?.name || '-', { ALLOWED_TAGS: [] });
    tr.innerHTML = DOMPurify.sanitize(`
      <td>${date}</td>
      <td>${safeSku}</td>
      <td>${safeStockName}</td>
      <td>📥 Giriş</td>
      <td>${mv.qty}</td>
      <td>${mv.unitCost?.toFixed(2) || 0}</td>
      <td>${extras.toFixed(2)}</td>
      <td>${mv.totalCost?.toFixed(2) || 0}</td>
    `, {
      ALLOWED_TAGS: ['td'],
      ALLOWED_ATTR: []
    });
    tbody.appendChild(tr);
  });
}

// Initialize
(async () => {
  try {
    await requireAuth();
    await loadInitialData();
  } catch (error) {
    console.error('Reports initialization error:', error);
  }
})();

