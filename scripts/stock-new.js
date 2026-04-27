/**
 * Stock Card Create/Edit - Teklifbul Rule v1.0
 * ERP-like stock card management with clean data helper
 */
import { db, auth, requireAuth } from '/firebase.js';
import { collection, addDoc, updateDoc, doc, getDoc, getDocs, query, where, serverTimestamp, arrayUnion, limit } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { normalizeTRLower, tokenizeForIndex } from '/scripts/lib/tr-utils.js';
import { toast } from '../src/shared/ui/toast.js';
import { logger } from '../src/shared/log/logger.js';
import { requireCompanyContext } from '../assets/js/state/company-context.js';
import { initPermissions, can, requirePerm, getStockPerms } from '../assets/js/state/permissions.js';

const qs = s => document.querySelector(s);
const STOCK_PERMS = getStockPerms();

let companyId = null;
let editMode = false;
let editStockId = null;
let stockGroups = [];

// ────────────────────────────────────────
// cleanStockData: undefined ve boş alanları temizler
// Firestore'a undefined göndermez, boş stringleri kaldırır
// ────────────────────────────────────────
function cleanStockData(data) {
  const cleaned = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (value === '') continue;
    if (value === null) { cleaned[key] = null; continue; }
    if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      const sub = cleanStockData(value);
      if (Object.keys(sub).length > 0) cleaned[key] = sub;
      continue;
    }
    cleaned[key] = value;
  }
  return cleaned;
}

// ────────────────────────────────────────
// Form → Data
// ────────────────────────────────────────
function collectFormData() {
  const str = id => (qs(id)?.value || '').trim();
  const num = id => { const v = parseFloat(qs(id)?.value); return isFinite(v) ? v : null; };
  const normalizedSku = str('#fieldSku').toUpperCase();

  return {
    // Temel
    sku: normalizedSku,
    name: str('#fieldName'),
    description: str('#fieldDescription') || null,
    barcode: str('#fieldBarcode') || null,
    type: str('#fieldType') || 'stok',
    // Kategori
    brand: str('#fieldBrand') || null,
    model: str('#fieldModel') || null,
    groupCode: str('#fieldGroupCode') || null,
    shelfCode: str('#fieldShelfCode') || null,
    // Birim
    unit: str('#fieldUnit') || 'ADT',
    subUnit: str('#fieldSubUnit') || null,
    unitMultiplier: num('#fieldUnitMultiplier'),
    weight: num('#fieldWeight'),
    volume: num('#fieldVolume'),
    dimensions: {
      width: num('#fieldDimWidth'),
      height: num('#fieldDimHeight'),
      length: num('#fieldDimLength'),
    },
    // Fiyat
    lastPurchasePrice: num('#fieldPurchasePrice') || 0,
    salePrice: num('#fieldSalePrice') || 0,
    currency: str('#fieldCurrency') || 'TRY',
    vatRate: num('#fieldVatRate') ?? 20,
    discountRate: num('#fieldDiscountRate'),
    // Stok Yönetimi
    minStockLevel: num('#fieldMinStock'),
    maxCapacity: num('#fieldMaxStock'),
    stockTrackingType: str('#fieldTrackingType') || 'none',
    hasExpiry: str('#fieldHasExpiry') === 'true',
    shelfLifeDays: num('#fieldShelfLifeDays'),
    // Tedarik
    supplierId: str('#fieldSupplierId') || null,
    supplierProductCode: str('#fieldSupplierProductCode') || null,
    leadTimeDays: num('#fieldLeadTimeDays'),
    // Ek Alanlar
    gtin: str('#fieldGtin') || null,
    origin: str('#fieldOrigin') || null,
    notes: str('#fieldNotes') || null,
    warehouseCode: str('#fieldWarehouseCode') || null,
    groupIds: getSelectedGroupIds(),
  };
}

// ────────────────────────────────────────
// Data → Form (düzenleme modu)
// ────────────────────────────────────────
function populateForm(data) {
  const set = (id, val) => { const el = qs(id); if (el && val !== null && val !== undefined) el.value = val; };

  set('#fieldSku', data.sku);
  set('#fieldName', data.name);
  set('#fieldDescription', data.description);
  set('#fieldBarcode', data.barcode);
  set('#fieldType', data.type || 'stok');
  set('#fieldBrand', data.brand);
  set('#fieldModel', data.model);
  set('#fieldGroupCode', data.groupCode);
  set('#fieldShelfCode', data.shelfCode);
  set('#fieldUnit', data.unit);
  set('#fieldSubUnit', data.subUnit);
  set('#fieldUnitMultiplier', data.unitMultiplier);
  set('#fieldWeight', data.weight);
  set('#fieldVolume', data.volume);
  if (data.dimensions) {
    set('#fieldDimWidth', data.dimensions.width);
    set('#fieldDimHeight', data.dimensions.height);
    set('#fieldDimLength', data.dimensions.length);
  }
  set('#fieldPurchasePrice', data.lastPurchasePrice);
  set('#fieldSalePrice', data.salePrice);
  set('#fieldCurrency', data.currency);
  set('#fieldVatRate', data.vatRate);
  set('#fieldDiscountRate', data.discountRate);
  set('#fieldMinStock', data.minStockLevel);
  set('#fieldMaxStock', data.maxCapacity);
  set('#fieldTrackingType', data.stockTrackingType);
  set('#fieldHasExpiry', data.hasExpiry ? 'true' : 'false');
  set('#fieldShelfLifeDays', data.shelfLifeDays);
  set('#fieldSupplierId', data.supplierId);
  set('#fieldSupplierProductCode', data.supplierProductCode);
  set('#fieldLeadTimeDays', data.leadTimeDays);
  set('#fieldGtin', data.gtin);
  set('#fieldOrigin', data.origin);
  set('#fieldNotes', data.notes);
  set('#fieldWarehouseCode', data.warehouseCode);

  // Check group checkboxes
  if (data.groupIds && Array.isArray(data.groupIds)) {
    data.groupIds.forEach(gId => {
      const cb = document.querySelector(`#groupPicker_${gId}`);
      if (cb) cb.checked = true;
    });
  }
}

// ────────────────────────────────────────
// Save
// ────────────────────────────────────────
async function saveStock() {
  const raw = collectFormData();

  if (!raw.sku) { toast.error('Stok Kodu (SKU) zorunludur.'); qs('#fieldSku')?.focus(); return; }
  if (!raw.name) { toast.error('Ürün Adı zorunludur.'); qs('#fieldName')?.focus(); return; }
  if (!raw.warehouseCode) { toast.error('Depo / Lokasyon seçimi zorunludur.'); qs('#fieldWarehouseCode')?.focus(); return; }
  if (raw.hasExpiry && raw.shelfLifeDays !== null && raw.shelfLifeDays < 0) {
    toast.error('Varsayılan raf ömrü 0 veya pozitif olmalıdır.');
    qs('#fieldShelfLifeDays')?.focus();
    return;
  }

  // Teklifbul Rule v1.0 - Kayıt/güncelleme için explicit permission kontrolü
  const hasEditPerm = STOCK_PERMS.edit ? can(STOCK_PERMS.edit) : true;
  const hasCreatePerm = STOCK_PERMS.create ? can(STOCK_PERMS.create) : true;
  if (editMode && !hasEditPerm) {
    toast.error('Stok kartı düzenleme yetkiniz yok.');
    return;
  }
  if (!editMode && !hasCreatePerm) {
    toast.error('Stok kartı oluşturma yetkiniz yok.');
    return;
  }

  const btn = qs('#btnSave');
  btn.disabled = true;
  btn.textContent = '⏳ Kaydediliyor...';

  try {
    // Normalize & search keywords
    raw.name_norm = normalizeTRLower(raw.name);
    raw.search_keywords = tokenizeForIndex(raw.name);
    raw.sku_norm = raw.sku;
    raw.companyId = companyId;
    raw.updatedAt = serverTimestamp();

    // Clean data
    const stockData = cleanStockData(raw);

    if (editMode && editStockId) {
      // Update
      await updateDoc(doc(db, 'stocks', editStockId), stockData);
      toast.success('Stok kartı güncellendi.');
      logger.info('Stock updated', { sku: stockData.sku, id: editStockId });
    } else {
      // Duplicate check
      const existing = await getDocs(query(
        collection(db, 'stocks'),
        where('companyId', '==', companyId),
        where('sku_norm', '==', raw.sku_norm)
      ));
      if (!existing.empty) {
        toast.error('Bu stok kodu zaten mevcut! Farklı bir SKU kullanın.');
        btn.disabled = false;
        btn.textContent = '💾 Kaydet';
        qs('#fieldSku')?.focus();
        return;
      }

      stockData.createdAt = serverTimestamp();
      stockData.avgCost = 0;
      const docRef = await addDoc(collection(db, 'stocks'), stockData);

      // Update selected groups with productId
      const selectedGroups = getSelectedGroupIds();
      for (const gId of selectedGroups) {
        try {
          await updateDoc(doc(db, 'stockGroups', gId), {
            productIds: arrayUnion(docRef.id)
          });
        } catch (e) { /* ignore */ }
      }

      toast.success('Stok kartı oluşturuldu.');
      logger.info('Stock created', { sku: stockData.sku, id: docRef.id });

      // Redirect to stock list after short delay
      setTimeout(() => { window.location.href = '/pages/stock-list.html'; }, 1200);
    }
  } catch (error) {
    logger.error('Stock save error', error);
    toast.error('Kayıt hatası: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Kaydet';
  }
}

// ────────────────────────────────────────
// Load existing stock (edit mode)
// ────────────────────────────────────────
async function loadStock(id) {
  try {
    const snap = await getDoc(doc(db, 'stocks', id));
    if (!snap.exists()) {
      toast.error('Stok kartı bulunamadı.');
      return;
    }
    const data = snap.data();

    // Teklifbul Rule v1.0 - Cross-company access guard
    if (data.companyId !== companyId) {
      toast.error('Bu stok kartını görüntüleme/düzenleme yetkiniz yok.');
      window.location.href = '/pages/stock-list.html';
      return;
    }

    populateForm(data);
    editStockId = id;
    editMode = true;

    // Update UI for edit mode
    qs('#formTitle').textContent = '✏️ Stok Kartı Düzenle';
    qs('#pageTitle').textContent = 'Stok Kartı Düzenle';
    document.title = 'Stok Kartı Düzenle';
    qs('#fieldSku').readOnly = true;
    qs('#fieldSku').style.background = '#f3f4f6';
  } catch (error) {
    logger.error('Stock load error', error);
    toast.error('Stok yüklenemedi: ' + error.message);
  }
}

// ────────────────────────────────────────
// Section collapse toggle
// ────────────────────────────────────────
function setupSections() {
  document.querySelectorAll('.form-section-header').forEach(header => {
    header.addEventListener('click', () => {
      const section = header.closest('.form-section');
      section.classList.toggle('collapsed');
    });
  });
}

// ────────────────────────────────────────
// Group Picker
// ────────────────────────────────────────
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getSelectedGroupIds() {
  const ids = [];
  document.querySelectorAll('.group-picker-cb:checked').forEach(cb => ids.push(cb.value));
  return ids;
}

async function loadStockGroups() {
  try {
    if (!companyId) return;

    const snap = await getDocs(query(
      collection(db, 'stockGroups'),
      where('companyId', '==', companyId),
      limit(500)
    ));
    stockGroups = [];
    snap.forEach(d => stockGroups.push({ id: d.id, ...d.data() }));
    stockGroups.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
    renderGroupPicker();
  } catch (e) {
    logger.error('Load stock groups error', e);
  }
}

async function loadLocations() {
  try {
    if (!companyId) return;

    logger.info('Lokasyonlar yükleniyor...', { companyId });
    const q = query(
      collection(db, 'stock_locations'),
      where('companyId', '==', companyId),
      limit(100)
    );
    const snap = await getDocs(q);
    const locations = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const select = qs('#fieldWarehouseCode');
    if (!select) return;

    // Preserve existing placeholder
    select.innerHTML = '<option value="">Lokasyon seçiniz</option>';
    
    locations.forEach(loc => {
      const option = document.createElement('option');
      option.value = loc.id;
      option.textContent = loc.name;
      select.appendChild(option);
    });

    logger.info('Lokasyonlar yüklendi', { count: locations.length });
  } catch (error) {
    logger.error('Lokasyon yükleme hatası', error);
    toast.error('Lokasyonlar yüklenemedi');
  }
}

function renderGroupPicker() {
  const el = document.querySelector('#groupPickerList');
  if (!el) return;
  if (!stockGroups.length) {
    el.innerHTML = '<span style="color:#9ca3af;font-size:12px">Henüz özel kod grubu oluşturulmamış. <a href="/pages/stock-groups.html" style="color:#2563eb">Grup oluştur →</a></span>';
    return;
  }
  el.innerHTML = stockGroups.map(g => `
    <label style="display:flex;align-items:center;gap:12px;padding:8px;cursor:pointer;font-size:13px;border-bottom:1px solid #f3f4f6; transition: background 0.2s;">
      <input type="checkbox" class="group-picker-cb" id="groupPicker_${g.id}" value="${g.id}" style="width:18px;height:18px;accent-color:#2563eb" />
      <div style="display:flex; flex-direction:column;">
        <span style="font-weight:700;color:#1d4ed8;font-size:14px;">${escapeHtml(g.code || 'KODSUZ')} - ${escapeHtml(g.name)}</span>
        <span style="color:#6b7280; font-size:12px;">${escapeHtml(g.description || 'Açıklama yok')}</span>
      </div>
    </label>
  `).join('');
}

// ────────────────────────────────────────
// Init
// ────────────────────────────────────────
(async () => {
  try {
    const ctx = await requireCompanyContext({ redirectOnPending: true });
    if (!ctx || !ctx.companyId) {
      toast.error('Şirket bilgisi doğrulanamadı.');
      return;
    }
    companyId = ctx.companyId;

    const permState = await initPermissions({ redirectOnPending: true });
    if (!permState) return;

    if (STOCK_PERMS.view && !can(STOCK_PERMS.view)) {
      toast.error('Stok modülünü görüntüleme yetkiniz yok.');
      window.location.href = '/inventory-index.html';
      return;
    }

    setupSections();
    await Promise.all([
      loadStockGroups(),
      loadLocations()
    ]);

    // Check for edit mode (?id=xxx)
    const params = new URLSearchParams(window.location.search);
    const stockId = params.get('id');
    if (stockId) {
      await loadStock(stockId);
    }

    // Save button
    qs('#btnSave').addEventListener('click', saveStock);

  } catch (error) {
    logger.error('Stock new page init error', error);
    toast.error('Sayfa yüklenirken hata: ' + error.message);
  }
})();
