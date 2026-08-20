import { db, auth, requireAuth } from '/firebase.js';
import { collection, getDocs, query, where, updateDoc, doc, addDoc, getDoc, serverTimestamp, limit } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { toast } from '../src/shared/ui/toast.js';
import { MESSAGES } from '../src/shared/constants/messages.js';
import { logger } from '../src/shared/log/logger.js';
import { requireCompanyContext } from '../assets/js/state/company-context.js';
import { initPermissions, can, requirePerm, getStockPerms } from '../assets/js/state/permissions.js';
import { loadCompanyStocksPaged } from '../assets/js/utils/stock-catalog-query.js';
import { STOCK_LOCATIONS_QUERY_LIMIT } from '../src/shared/constants/timing.js';

const qs = s => document.querySelector(s);

const state = {
  stocks: [],
  filteredStocks: [],
  warehouses: [],
  customCodes: [],
  companyId: null
};

const STOCK_PERMS = getStockPerms();

function renderTable() {
  const tbody = qs('#updateTable tbody');
  const table = qs('#updateTable');
  const productsCard = qs('#productsCard');
  
  tbody.innerHTML = '';
  
  if (!state.filteredStocks.length) {
    table.style.display = 'none';
    qs('#updateInfo').textContent = 'Stok bulunamadı.';
    qs('#btnApply').disabled = true;
    qs('#btnApply').style.display = 'none';
    if (productsCard) productsCard.style.display = 'none';
    return;
  }
  
  // Ürünler kartını göster
  if (productsCard) productsCard.style.display = 'block';
  
  table.style.display = 'table';
  state.filteredStocks.forEach(stock => {
    const tr = document.createElement('tr');
    // Orijinal değerleri sakla (zam uygulama için)
    const originalPurchasePrice = stock.lastPurchasePrice || 0;
    const originalSalePrice = stock.salePrice || 0;
    
    tr.innerHTML = `
      <td>${stock.sku}</td>
      <td>${stock.name}</td>
      <td>${stock.unit || 'ADT'}</td>
      <td>${stock.warehouseCode || '-'}</td>
      <td>${originalPurchasePrice.toFixed(2)}</td>
      <td><input type="number" step="0.01" data-sku="${stock.sku}" data-field="lastPurchasePrice" data-original="${originalPurchasePrice}" value="${originalPurchasePrice}" style="width:100px; padding:4px; border:1px solid #d1d5db; border-radius:4px;" /></td>
      <td>${originalSalePrice.toFixed(2)}</td>
      <td><input type="number" step="0.01" data-sku="${stock.sku}" data-field="salePrice" data-original="${originalSalePrice}" value="${originalSalePrice}" style="width:100px; padding:4px; border:1px solid #d1d5db; border-radius:4px;" /></td>
    `;
    tbody.appendChild(tr);
  });
  
  qs('#updateInfo').textContent = `${state.filteredStocks.length} ürün listelendi.`;
  qs('#btnApply').disabled = false;
  qs('#btnApply').style.display = 'inline-block';
  
  // Setup real-time search on rendered table
  setupTableSearch();
}

// Teklifbul Rule v1.0 - Depo kodlarını ve özel kodları yükle
async function loadFilters() {
  try {
    const user = await requireAuth();
    const companyId = state.companyId;
    
    if (!companyId) {
      console.warn('CompanyId bulunamadı, filtreler yüklenemedi');
      return;
    }
    
    // Depo kodlarını yükle
    const warehousesQuery = query(
      collection(db, 'stock_locations'),
      where('companyId', '==', companyId),
      where('type', '==', 'warehouse'),
      where('isActive', '==', true),
      limit(STOCK_LOCATIONS_QUERY_LIMIT)
    );
    const warehousesSnap = await getDocs(warehousesQuery);
    state.warehouses = [];
    warehousesSnap.forEach(doc => {
      const data = doc.data();
      if (data.warehouseCode) {
        state.warehouses.push({
          code: data.warehouseCode,
          name: data.name || data.warehouseCode
        });
      }
    });
    
    // Depo dropdown'unu doldur
    const warehouseSelect = qs('#filterWarehouse');
    warehouseSelect.innerHTML = '<option value="">Tüm Depolar</option>';
    state.warehouses.forEach(wh => {
      const option = document.createElement('option');
      option.value = wh.code;
      option.textContent = `${wh.name} (${wh.code})`;
      warehouseSelect.appendChild(option);
    });
    
    // Özel kodları stockGroups koleksiyonundan yükle (Özel Kod Yönetimi ile birebir)
    const groupsQuery = query(
      collection(db, 'stockGroups'),
      where('companyId', '==', companyId)
    );
    const groupsSnap = await getDocs(groupsQuery);
    const customCodesSet = new Set();
    groupsSnap.forEach(groupDoc => {
      const data = groupDoc.data() || {};
      const groupCode = String(data.code || '').trim();
      if (groupCode) customCodesSet.add(groupCode);
    });

    state.customCodes = Array.from(customCodesSet).sort((a, b) => a.localeCompare(b, 'tr'));
    
    // Özel kod dropdown'unu doldur
    const codeSelect = qs('#filterCode');
    codeSelect.innerHTML = '<option value="">Tüm Özel Kodlar</option>';
    state.customCodes.forEach(code => {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = code;
      codeSelect.appendChild(option);
    });
    
  } catch (error) {
    logger.error('Filtre yükleme hatası', error);
    toast.error('Filtreler yüklenemedi: ' + (error.message || error));
  }
}

async function loadStocks() {
  const user = await requireAuth();
  
  try {
    const warehouseCode = qs('#filterWarehouse').value.trim();
    const customCode = qs('#filterCode').value.trim();
    const brand = qs('#filterBrand').value.trim();
    const unit = qs('#filterUnit').value;
    
    const { rows, capped } = await loadCompanyStocksPaged(db, state.companyId);
    if (capped) {
      toast.warn(MESSAGES.WARN_STOCK_LIMIT_REACHED.replace('{count}', String(rows.length)));
    }
    state.stocks = [];

    rows.forEach((data) => {
      if (warehouseCode && data.warehouseCode !== warehouseCode) return;
      if (customCode) {
        const hasCustomCode =
          (data.customCodes?.code1 === customCode) ||
          (data.customCodes?.code2 === customCode) ||
          (data.customCodes?.code3 === customCode);
        if (!hasCustomCode) return;
      }
      if (brand && data.brand !== brand) return;
      if (unit && data.unit !== unit) return;
      state.stocks.push({ id: data.id, ...data });
    });
    
    state.filteredStocks = [...state.stocks];
    
    // Apply search filter
    const searchQuery = qs('#filterSearch')?.value?.trim()?.toLowerCase();
    if (searchQuery) {
      state.filteredStocks = state.filteredStocks.filter(stock => {
        const sku = (stock.sku || '').toLowerCase();
        const name = (stock.name || '').toLowerCase();
        return sku.includes(searchQuery) || name.includes(searchQuery);
      });
    }
    
    renderTable();
  } catch (error) {
    logger.error('Load error', error);
    toast.error((MESSAGES.ERROR_STOCK_PRICE_UPDATE_LOAD || 'Stoklar yüklenemedi') + ': ' + (error.message || error));
  }
}

// Real-time search on rendered table
function setupTableSearch() {
  const searchInput = qs('#filterSearch');
  if (!searchInput || searchInput._hasSearchListener) return;
  searchInput._hasSearchListener = true;
  
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) {
      state.filteredStocks = [...state.stocks];
    } else {
      state.filteredStocks = state.stocks.filter(stock => {
        const sku = (stock.sku || '').toLowerCase();
        const name = (stock.name || '').toLowerCase();
        return sku.includes(query) || name.includes(query);
      });
    }
    renderTable();
  });
}

function downloadExcel() {
  if (!state.filteredStocks.length) {
    alert('İndirilecek ürün bulunamadı!');
    return;
  }
  
  const rows = state.filteredStocks.map(s => ({
    'Stok Kodu': s.sku,
    'Ürün Adı': s.name,
    'Birim': s.unit || 'ADT',
    'Depo Kodu': s.warehouseCode || '',
    'Eski Alım Fiyatı': s.lastPurchasePrice || 0,
    'Yeni Alım Fiyatı': s.lastPurchasePrice || 0,
    'Eski Satış Fiyatı': s.salePrice || 0,
    'Yeni Satış Fiyatı': s.salePrice || 0
  }));
  
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fiyatlar');
  XLSX.writeFile(wb, `fiyat-guncelleme-${Date.now()}.xlsx`);
}

// Teklifbul Rule v1.0 - Excel'den fiyat güncellemelerini içe aktar
async function importExcel() {
  const fileInput = qs('#excelFileInput');
  const file = fileInput.files[0];
  
  if (!file) {
    alert('Lütfen bir Excel dosyası seçin!');
    return;
  }
  
  try {
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const workbook = XLSX.read(e.target.result, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          resolve(jsonData);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
    
    if (!data || data.length === 0) {
      alert('Excel dosyası boş veya geçersiz!');
      return;
    }
    
    // Excel'deki değerleri tabloya uygula
    const skuMap = new Map();
    data.forEach(row => {
      const sku = row['Stok Kodu'] || row['stok kodu'] || row['SKU'] || row['sku'];
      if (sku) {
        skuMap.set(String(sku).trim(), {
          newPurchasePrice: parseFloat(row['Yeni Alım Fiyatı'] || row['yeni alım fiyatı'] || row['Yeni Alim Fiyati'] || 0),
          newSalePrice: parseFloat(row['Yeni Satış Fiyatı'] || row['yeni satış fiyatı'] || row['Yeni Satis Fiyati'] || 0)
        });
      }
    });
    
    // Tablodaki input'ları güncelle
    const inputs = qs('#updateTable tbody').querySelectorAll('input[type=number]');
    let updatedCount = 0;
    
    inputs.forEach(input => {
      const sku = input.dataset.sku;
      const field = input.dataset.field;
      const excelData = skuMap.get(sku);
      
      if (excelData) {
        if (field === 'lastPurchasePrice' && excelData.newPurchasePrice > 0) {
          input.value = excelData.newPurchasePrice;
          updatedCount++;
        } else if (field === 'salePrice' && excelData.newSalePrice > 0) {
          input.value = excelData.newSalePrice;
          updatedCount++;
        }
      }
    });
    
    if (updatedCount > 0) {
      alert(`${updatedCount} fiyat güncellendi. Lütfen kontrol edip "Kaydet" butonuna tıklayın.`);
      qs('#btnApply').disabled = false;
    } else {
      alert('Excel dosyasında güncellenecek fiyat bulunamadı. Lütfen "Yeni Alım Fiyatı" ve "Yeni Satış Fiyatı" kolonlarını kontrol edin.');
    }
    
    // Dosya input'unu temizle
    fileInput.value = '';
    
  } catch (error) {
    console.error('Excel import hatası:', error);
    alert('Excel dosyası okunurken hata oluştu: ' + error.message);
  }
}

// Teklifbul Rule v1.0 - Yüzde zam uygula
function applyPercentageIncrease() {
  const percentageInput = qs('#percentageIncrease');
  const percentage = parseFloat(percentageInput.value);
  const applyToPurchase = qs('#applyToPurchase').checked;
  const applyToSale = qs('#applyToSale').checked;
  
  if (!percentage || isNaN(percentage) || percentage === 0) {
    alert('Lütfen geçerli bir yüzde değeri girin!');
    return;
  }
  
  if (!applyToPurchase && !applyToSale) {
    alert('Lütfen en az bir fiyat tipi seçin (Alım Fiyatı veya Satış Fiyatı)!');
    return;
  }
  
  const priceTypes = [];
  if (applyToPurchase) priceTypes.push('Alım');
  if (applyToSale) priceTypes.push('Satış');
  const priceTypesText = priceTypes.join(' ve ');
  
  if (!confirm(`Listelenen tüm ürünlerin ${priceTypesText} fiyatlarına %${percentage} zam yapılacak. Devam edilsin mi?`)) {
    return;
  }
  
  const inputs = qs('#updateTable tbody').querySelectorAll('input[type=number]');
  let updatedCount = 0;
  
  inputs.forEach(input => {
    const field = input.dataset.field;
    const shouldUpdate = 
      (field === 'lastPurchasePrice' && applyToPurchase) ||
      (field === 'salePrice' && applyToSale);
    
    if (shouldUpdate) {
      const originalValue = parseFloat(input.dataset.original) || 0;
      if (originalValue > 0) {
        const newValue = originalValue * (1 + percentage / 100);
        input.value = newValue.toFixed(2);
        updatedCount++;
      }
    }
  });
  
  if (updatedCount > 0) {
    alert(`${updatedCount} ürünün ${priceTypesText} fiyatına %${percentage} zam uygulandı. Lütfen kontrol edip "Kaydet" butonuna tıklayın.`);
    qs('#btnApply').disabled = false;
    percentageInput.value = ''; // Input'u temizle
  } else {
    alert('Zam uygulanacak ürün bulunamadı!');
  }
}

async function applyUpdates() {
  const user = await requireAuth();
  
  const inputs = qs('#updateTable tbody').querySelectorAll('input[type=number]');
  const updates = {};
  
  inputs.forEach(input => {
    const sku = input.dataset.sku;
    const field = input.dataset.field;
    const newValue = parseFloat(input.value) || 0;
    
    if (!updates[sku]) {
      updates[sku] = {};
    }
    updates[sku][field] = newValue;
  });
  
  if (!Object.keys(updates).length) {
    alert('Güncelleme yapılacak değişiklik yok!');
    return;
  }
  
  if (!confirm(`${Object.keys(updates).length} ürün güncellenecek. Devam edilsin mi?`)) {
    return;
  }

  // Permission Write Guard - Teklifbul Rule v1.0
  const bulkKey = STOCK_PERMS.bulkPriceUpdate;
  if (bulkKey) {
    const ok = await requirePerm(bulkKey, {
      toastMessage:
        MESSAGES.ERROR_PERMISSION_STOCK_PRICE_UPDATE ||
        'Toplu fiyat güncelleme yetkiniz yok.'
    });
    if (!ok) {
      logger.warn('price-update: requirePerm(bulkPriceUpdate) sonucu yetkisiz, işlem iptal', {
        permKey: bulkKey,
        uid: user.uid
      });
      return;
    }
  }
  
  qs('#btnApply').disabled = true;
  qs('#btnApply').textContent = 'Güncelleniyor...';
  
  let success = 0;
  let errors = 0;
  
  for (const sku in updates) {
    try {
      const stock = state.stocks.find(s => s.sku === sku);
      if (!stock) continue;
      
      await updateDoc(doc(db, 'stocks', stock.id), {
        ...updates[sku],
        updatedAt: serverTimestamp()
      });
      success++;
    } catch (error) {
      console.error('Update error:', sku, error);
      errors++;
    }
  }
  
  // Log price update
  await addDoc(collection(db, 'price_updates'), {
    companyId: state.companyId,
    fileName: `fiyat-guncelleme-${Date.now()}.xlsx`,
    appliedBy: user.uid,
    appliedAt: serverTimestamp(),
    totalUpdated: success,
    rules: { 
      warehouse: qs('#filterWarehouse').value, 
      code: qs('#filterCode').value, 
      brand: qs('#filterBrand').value, 
      unit: qs('#filterUnit').value 
    }
  });
  
  alert(`Güncelleme tamamlandı!\nBaşarılı: ${success}\nHata: ${errors}`);
  
  qs('#btnApply').textContent = 'Güncelle';
  qs('#btnApply').disabled = false;
  
  await loadStocks();
}

// Sayfa yüklendiğinde filtreleri yükle (Permission Pilot - Toplu Fiyat Güncelleme)
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const ctx = await requireCompanyContext({ redirectOnPending: true });
    if (!ctx || !ctx.companyId) {
      logger.warn('price-update: company context alınamadı, sayfa başlatılmıyor', { ctx });
      toast.error(
        (MESSAGES.ERROR_COMPANY_ID_REQUIRED || 'Şirket bilgisi doğrulanamadı') +
          '. Toplu fiyat güncelleme ekranı yüklenemedi.'
      );
      return;
    }
    
    state.companyId = ctx.companyId;

    const permState = await initPermissions({ redirectOnPending: true });
    if (!permState) {
      logger.warn('price-update: initPermissions sonuç vermedi, sayfa başlatılmıyor');
      return;
    }

    // Genel stok görüntüleme izni
    if (STOCK_PERMS.view && !can(STOCK_PERMS.view)) {
      const msg =
        MESSAGES.ERROR_PERMISSION_STOCK_VIEW ||
        MESSAGES.ERROR_PERMISSION_DENIED ||
        'Stok modülünü görüntüleme yetkiniz yok.';
      toast.error(msg);
      logger.warn('price-update: view yetkisi yok, URL guard tetiklendi', {
        permKey: STOCK_PERMS.view,
        companyId: permState.companyId,
        roleKey: permState.roleKey
      });
      window.location.href = '/inventory-index.html';
      return;
    }

    // Toplu fiyat güncelleme izni
    if (STOCK_PERMS.bulkPriceUpdate && !can(STOCK_PERMS.bulkPriceUpdate)) {
      const msg =
        MESSAGES.ERROR_PERMISSION_STOCK_PRICE_UPDATE ||
        'Toplu fiyat güncelleme yetkiniz yok.';
      toast.error(msg);
      logger.warn('price-update: bulkPriceUpdate yetkisi yok, ekran kilitlendi', {
        permKey: STOCK_PERMS.bulkPriceUpdate,
        companyId: permState.companyId,
        roleKey: permState.roleKey
      });

      const applyBtn = qs('#btnApply');
      if (applyBtn) {
        applyBtn.disabled = true;
        applyBtn.title = msg;
      }
      // Filtreleri yine de yükleyebiliriz; sadece "Kaydet" işlemleri kapalı olacak
    }

    await loadFilters();
  } catch (error) {
    logger.error('price-update initialize error', error);
    toast.error(
      (MESSAGES.ERROR_STOCK_PRICE_UPDATE_LOAD || 'Toplu fiyat güncelleme ekranı yüklenemedi') +
        ': ' +
        (error.message || error)
    );
  }
});

// Event listeners
qs('#btnLoad').addEventListener('click', loadStocks);
qs('#btnDownloadExcel').addEventListener('click', downloadExcel);
qs('#btnImportExcel').addEventListener('click', importExcel);
qs('#btnApplyPercentage').addEventListener('click', applyPercentageIncrease);
qs('#btnApply').addEventListener('click', applyUpdates);

// Enter tuşu ile yüzde zam uygula
qs('#percentageIncrease').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    applyPercentageIncrease();
  }
});

