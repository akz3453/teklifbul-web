// Teklifbul Rule v1.0 - Import required functions
import { requireAuth } from "/firebase.js";
import { normalizeToIds, getNameById } from "/src/categories/category-service.js";
import { getCategoryNameById } from "/categories.js";
import { slugifyTr } from "/utils/slugify-tr.js";
import { logger } from '/src/shared/log/logger.js';
import { getDemandPerms } from '/assets/js/state/permissions.js';

// Use normalizeToIds from category-service.js for all conversions
function nameToCategoryId(name) {
  if (!name) return null;
  // Use new normalizeToIds function which handles all formats (ID/name/slug)
  const ids = normalizeToIds([name]);
  return ids.length > 0 ? ids[0] : null;
}

// Convert category ID to display name (using new system)
function categoryIdToName(id) {
  if (!id) return id;
  // Try new system first
  const name = getNameById(id);
  if (name && name !== id) return name;
  // Fallback to legacy system
  const legacyName = getCategoryNameById(id);
  return legacyName || id;
}

// Use unified slugifyTr function from utils
// Alias for backward compatibility with existing code
function toSlug(name) {
  return slugifyTr(name);
}

const user = await requireAuth();

// Teklifbul Rule v1.0 - Premium plan kontrolü ve listing limit hesaplama
let userPlanLimit = 0; // Free = 0, Premium = 1, Premium Plus = 3
let userPlanId = 'free';

async function loadUserPlanLimit() {
  try {
    const { authFetch } = await import('/assets/js/utils/api-helpers.js');
    const response = await authFetch('/api/account/subscription');
    if (response.ok) {
      const summary = await response.json();
      userPlanId = summary?.plan?.planId || summary?.planId || 'free';

      // Limit hesaplama: Free=0, Premium=1, Premium Plus=3
      if (userPlanId === 'premium_plus_monthly' || userPlanId === 'premium_plus_yearly') {
        userPlanLimit = 3;
      } else if (userPlanId === 'premium_monthly' || userPlanId === 'premium_yearly') {
        userPlanLimit = 1;
      } else {
        userPlanLimit = 0;
      }

      logger.info('User plan limit loaded', { planId: userPlanId, limit: userPlanLimit });
    } else {
      logger.warn('Failed to load subscription summary, defaulting to free', { status: response.status });
      userPlanLimit = 0;
      userPlanId = 'free';
    }
  } catch (error) {
    logger.error('Error loading user plan limit', error);
    userPlanLimit = 0;
    userPlanId = 'free';
  }
}

await loadUserPlanLimit();

// Teklifbul Rule v1.0 - DEMAND_PERMS module scope'ta tanımla (createBtn.onclick için)
// Not: İlk script bloğunda da DEMAND_PERMS var, bu yüzden burada aynı ismi kullanıyoruz
// (farklı module scope'lar olduğu için sorun yok, linter uyarısı yanlış pozitif)
const DEMAND_PERMS = getDemandPerms();

// Dashboard kısayolu için: ?prefill=excel-upload geldiğinde localStorage'dan Excel dosyasını yükle
const excelParams = new URLSearchParams(window.location.search);
const triggerExcel = excelParams.get('prefill') === 'excel-upload';
const autoTriggerFlag = sessionStorage.getItem('excelImportAutoTrigger') === 'true';

if (triggerExcel || autoTriggerFlag) {
  // Flag'i temizle
  if (autoTriggerFlag) {
    sessionStorage.removeItem('excelImportAutoTrigger');
  }

  // localStorage'dan Excel dosyasını al ve import işlemini başlat
  const excelPrefillRaw = localStorage.getItem('excelImportPrefill');
  if (excelPrefillRaw) {
    try {
      const prefill = JSON.parse(excelPrefillRaw);
      if (prefill.data && prefill.name) {
        // Base64'ü Blob'a çevir
        const byteCharacters = atob(prefill.data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

        // File objesi oluştur
        const file = new File([blob], prefill.name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

        // Import işlemini başlat
        logger.info("Excel import auto-triggered from dashboard shortcut", { fileName: prefill.name });
        toast.success(`Excel dosyası yüklendi: ${prefill.name}`);

        // previewSelected fonksiyonunu çağır (sayfa yüklendikten ve fonksiyon hazır olduktan sonra)
        const startImport = () => {
          try {
            const previewFn = window.previewSelected;
            if (typeof previewFn === 'function') {
              previewFn(file, 'xlsx');
            } else {
              // previewSelected henüz yüklenmemiş, biraz bekle
              setTimeout(() => {
                const previewFnRetry = window.previewSelected;
                if (typeof previewFnRetry === 'function') {
                  previewFnRetry(file, 'xlsx');
                } else {
                  logger.warn("previewSelected fonksiyonu bulunamadı");
                  toast.error(MESSAGES.ERROR_EXCEL_IMPORT_REFRESH);
                }
              }, 500);
            }
          } catch (err) {
            logger.error("Excel import başlatılamadı", err);
            toast.error(MESSAGES.ERROR_EXCEL_IMPORT_START);
          }
        };

        // Sayfa yüklendikten sonra import'u başlat
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
          setTimeout(startImport, 200);
        } else {
          window.addEventListener('load', () => {
            setTimeout(startImport, 200);
          });
        }
      }
    } catch (err) {
      logger.error("Excel prefill parse hatası", err);
      toast.error(MESSAGES.ERROR_EXCEL_FILE_UPLOAD);
    }
  } else {
    logger.warn("Excel prefill data bulunamadı");
    toast.info(MESSAGES.INFO_EXCEL_FILE_NOT_SELECTED);
  }
}

// Excel prefill - localStorage'dan oku ve formu doldur
const excelPrefillRaw = localStorage.getItem('excelImportPrefill');
if (excelPrefillRaw) {
  try {
    const prefill = JSON.parse(excelPrefillRaw);
    // TODO: Excel parse edilen alan eşlemesi henüz yok. Burada sadece bilgi notu göstereceğiz.
    // İleride: base64 Excel'i parse edip satır/sütun eşlemesiyle form alanlarını doldur.
    if (prefill?.name) {
      toast.info(`Excel yükleme hazır: ${prefill.name}`);
    }
  } catch (err) {
    logger.warn('Excel prefill okunamadı', err);
  } finally {
    // Tek seferlik kullanıp temizle
    localStorage.removeItem('excelImportPrefill');
  }
}
// Role-based permission: only specific company roles can open demand
try {
  const snap = await getDoc(doc(db, "users", user.uid));
  const profile = snap.exists() ? (snap.data() || {}) : {};
  const joinOk = !profile.companyJoinStatus || profile.companyJoinStatus === 'approved' || profile.companyJoinStatus === 'accepted';

  // Teklifbul Rule v1.0 - Role kontrolü: Hem prefix'li (buyer:genel_mudur) hem prefix'siz (genel_mudur) kontrol et
  const allowedRoles = new Set(['satinalma_yetkilisi', 'genel_mudur', 'isveren', 'buyer:satinalma_yetkilisi', 'buyer:genel_mudur', 'buyer:isveren']);
  const userRole = profile.companyRole || profile.companyRoleKey || '';
  const userRoleSimple = userRole.includes(':') ? userRole.split(':')[1] : userRole; // Prefix'i kaldır
  const canOpen = joinOk && (userRole ? (allowedRoles.has(userRole) || allowedRoles.has(userRoleSimple)) : true);

  if (!canOpen) {
    const btn = document.getElementById('createBtn');
    if (btn) {
      btn.disabled = true;
      btn.title = 'Bu işlem için yetkili değilsiniz. (Satın Alma Yetkilisi / Genel Müdür / İşveren)';
    }
    logger.warn('Demand create disabled for role', { role: userRole, roleSimple: userRoleSimple, status: profile.companyJoinStatus });
  } else {
    logger.info('Demand create enabled for role', { role: userRole, roleSimple: userRoleSimple, status: profile.companyJoinStatus });
  }
} catch (e) { logger.warn('Role check failed', e); }

const el = id => {
  const element = document.getElementById(id);
  if (!element) {
    logger.warn(`Element bulunamadı`, { id });
    return null;
  }
  return element;
};
const createBtn = el("createBtn");
const defaultCreateLabel = createBtn?.textContent || 'Talep Oluştur';
const addLineBtn = el("addLineBtn");
// SATFK field (readonly, auto-generated)
const satfkField = el("satfk");
const itemsBody = el("itemsBody");

// TEST: Test amaçlı ürün listesi (İleride kaldırılabilir)
const TEST_PRODUCTS = [
  { name: "Çimento 32 KG", sku: "CEM-32KG", brandModel: "Portland", qty: 100, unit: "Çuval", stockQty: 50, targetPrice: 45 },
  { name: "Demir 12 mm", sku: "DEM-12MM", brandModel: "İsdemir", qty: 500, unit: "Ton", stockQty: 200, targetPrice: 8500 },
  { name: "Elektrik Kablosu NYY 3x1.5", sku: "ELEK-NYY-3X15", brandModel: "Standard", qty: 500, unit: "Metre", stockQty: 200, targetPrice: 12.5 },
  { name: "Boya Astar", sku: "BOYA-ASTAR", brandModel: "Dyo", qty: 20, unit: "Kutu", stockQty: 10, targetPrice: 85 },
  { name: "PVC Boru 20mm", sku: "PVC-20MM", brandModel: "Pimaş", qty: 200, unit: "Metre", stockQty: 100, targetPrice: 8.5 },
  { name: "LED Armatür 50W", sku: "LED-50W", brandModel: "Philips", qty: 30, unit: "Adet", stockQty: 15, targetPrice: 250 },
  { name: "Hırdavat Seti", sku: "HIR-SET", brandModel: "Bosch", qty: 5, unit: "Takım", stockQty: 2, targetPrice: 450 },
  { name: "Temizlik Malzemesi", sku: "TEM-MAL", brandModel: "Cif", qty: 50, unit: "Adet", stockQty: 25, targetPrice: 15 },
  { name: "İş Güvenliği Baret", sku: "ISG-BARET", brandModel: "3M", qty: 20, unit: "Adet", stockQty: 10, targetPrice: 35 },
  { name: "Ambalaj Koli", sku: "AMB-KOLI", brandModel: "Kraft", qty: 100, unit: "Adet", stockQty: 50, targetPrice: 2.5 },
  { name: "Kimyasal Solvent", sku: "KIM-SOLV", brandModel: "Tiner", qty: 10, unit: "Litre", stockQty: 5, targetPrice: 25 },
  { name: "Plastik Palet", sku: "PLA-PALET", brandModel: "Standard", qty: 20, unit: "Adet", stockQty: 10, targetPrice: 120 },
  { name: "Mobilya Masa", sku: "MOB-MASA", brandModel: "Ofis", qty: 5, unit: "Adet", stockQty: 2, targetPrice: 850 },
  { name: "Gıda Paketi", sku: "GID-PAKET", brandModel: "Çay", qty: 50, unit: "Paket", stockQty: 25, targetPrice: 8 },
  { name: "Lojistik Hizmeti", sku: "LOJ-HIZ", brandModel: "Nakliye", qty: 1, unit: "Sefer", stockQty: 0, targetPrice: 5000 },
  { name: "HVAC Klima", sku: "HVAC-KLIMA", brandModel: "Daikin", qty: 3, unit: "Adet", stockQty: 1, targetPrice: 15000 },
  { name: "Yangın Tüpü", sku: "YAN-TUP", brandModel: "6KG", qty: 10, unit: "Adet", stockQty: 5, targetPrice: 350 },
  { name: "Peyzaj Çim", sku: "PEY-CIM", brandModel: "Rulo", qty: 50, unit: "m²", stockQty: 25, targetPrice: 15 },
  { name: "Tesisat Vana", sku: "TES-VANA", brandModel: "Küresel", qty: 15, unit: "Adet", stockQty: 8, targetPrice: 85 },
  { name: "Marangoz Kereste", sku: "MAR-KER", brandModel: "5x10", qty: 200, unit: "Metre", stockQty: 100, targetPrice: 12 }
];

// TEST: Test verisi doldurma fonksiyonu (İleride kaldırılabilir)
async function fillTestData() {
  try {
    logger.group('Test Verisi Doldurma');
    toast.info(MESSAGES.INFO_DEMAND_TEST_DATA_FILLING);

    // Tarih hesaplamaları
    const today = new Date();
    const dueDate = new Date(today);
    dueDate.setDate(dueDate.getDate() + 30);

    // Form alanlarını doldur
    const demandDateEl = el("demandDate");
    if (demandDateEl) demandDateEl.value = today.toISOString().split('T')[0];

    const siteNameEl = el("siteName");
    if (siteNameEl) siteNameEl.value = "Test Şantiye 1";

    const purchaseLocationEl = el("purchaseLocation");
    if (purchaseLocationEl) purchaseLocationEl.value = "İstanbul";

    const titleEl = el("title");
    if (titleEl) titleEl.value = `Test Talep - ${today.toLocaleDateString('tr-TR')}`;

    const specEl = document.getElementById("spec");
    if (specEl) specEl.value = "Test amaçlı teknik şartname";

    const dueDateEl = el("dueDate");
    if (dueDateEl) dueDateEl.value = dueDate.toISOString().split('T')[0];

    const priorityEl = el("priority");
    if (priorityEl) priorityEl.value = "price";

    const currencyEl = el("currency");
    if (currencyEl) currencyEl.value = "TRY";

    const paymentTermsEl = el("paymentTerms");
    if (paymentTermsEl) paymentTermsEl.value = "%30 peşin, %70 vade";

    const requesterEl = el("requester");
    if (requesterEl) requesterEl.value = "Test Kullanıcı";

    const purchaseManagerEl = el("purchaseManager");
    if (purchaseManagerEl) purchaseManagerEl.value = "Test Satın Alma Müdürü";

    const generalManagerEl = el("generalManager");
    if (generalManagerEl) generalManagerEl.value = "Test Genel Müdür";

    const approverEl = el("approver");
    if (approverEl) approverEl.value = "Test Onay Veren";

    const deliveryCityEl = document.getElementById("deliveryCity");
    if (deliveryCityEl) deliveryCityEl.value = "İstanbul";

    const deliveryAddressEl = el("deliveryAddress");
    if (deliveryAddressEl) deliveryAddressEl.value = "Test Adresi, Test Mahallesi, Test Sokak No:1";

    // Radio button'ları seç
    const deliveryMethodRadio = document.querySelector('input[name="deliveryMethod"][value="nakliye_dahil"]');
    if (deliveryMethodRadio) deliveryMethodRadio.checked = true;

    const unloadingMethodRadio = document.querySelector('input[name="unloadingMethod"][value="personel_var"]');
    if (unloadingMethodRadio) unloadingMethodRadio.checked = true;

    // Rastgele 3 ürün seç
    const shuffled = [...TEST_PRODUCTS].sort(() => 0.5 - Math.random());
    const selectedProducts = shuffled.slice(0, 3);

    // Seçilen ürünleri ekle
    // addRow fonksiyonu aynı module scope içinde tanımlı, event listener tıklandığında zaten yüklenmiş olur
    if (itemsBody) {
      // addRow fonksiyonunun tanımlı olup olmadığını kontrol et
      if (typeof addRow === 'function') {
        selectedProducts.forEach((product, index) => {
          addRow({
            lineNo: index + 1,
            name: product.name,
            sku: product.sku,
            brandModel: product.brandModel,
            qty: product.qty,
            unit: product.unit,
            stockQty: product.stockQty,
            targetPrice: product.targetPrice
          });
        });
      } else {
        logger.warn('addRow fonksiyonu bulunamadı, ürünler eklenemedi');
        toast.warn(MESSAGES.WARN_DEMAND_ADD_ROW_NOT_LOADED);
      }

      // Event listener'ları tetikle (auto-resize, kategori önerisi vb.)
      setTimeout(() => {
        selectedProducts.forEach((_, index) => {
          const row = itemsBody.querySelector(`tr[data-line-no="${index + 1}"]`);
          if (row) {
            const itemNameTextarea = row.querySelector('.itemName');
            if (itemNameTextarea) {
              itemNameTextarea.dispatchEvent(new Event('input', { bubbles: true }));
            }
            const skuInput = row.querySelector('.sku');
            if (skuInput) {
              skuInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }
        });
        // Kategori uyumluluğunu yeniden hesapla
        recalcCategoryCompatibility(true);
      }, 100);
    }

    logger.info('Test verileri başarıyla dolduruldu', {
      productCount: selectedProducts.length,
      products: selectedProducts.map(p => p.name)
    });
    logger.end();
    toast.success(`${selectedProducts.length} ürün kalemi eklendi. Form dolduruldu.`);

  } catch (error) {
    logger.error('Test verisi doldurma hatası', error);
    logger.end();
    toast.error(MESSAGES.ERROR_DEMAND_TEST_DATA_FILL.replace('{message}', error.message || 'Beklenmeyen hata'));
  }
}
// TEST END

const recalcCategoryCompatibility = (forceProfile = false) => {
  markMaterialProfileDirty();
  updateCategoryCompatibilitySummary(forceProfile);
  renderGroupButtons();
};
// Teklifbul Rule v1.0 - Satır bazlı otomatik kategori seçimi için event listener
// Sadece Stok Kodu (.sku) alanında tetiklenmeli
// Malzeme Tanımı (.itemName) için setupCategorySuggestionForItemName zaten kategori seçimi yapıyor
itemsBody?.addEventListener('input', (e) => {
  const target = e.target;
  // Sadece stok kodu alanında kategori seçimi yap (itemName için setupCategorySuggestionForItemName var)
  if (target.classList.contains('sku')) {
    const row = target.closest('tr');
    if (row && row.dataset.lineNo) {
      const lineNo = parseInt(row.dataset.lineNo, 10);
      if (!isNaN(lineNo)) {
        autoSelectCategoriesForLine(lineNo);
      }
    }
  }
  // Diğer alanlar için sadece kategori uyumluluğunu yeniden hesapla
  recalcCategoryCompatibility(true);
});
itemsBody?.addEventListener('change', (e) => {
  const target = e.target;
  // Sadece stok kodu alanında kategori seçimi yap (itemName için setupCategorySuggestionForItemName var)
  if (target.classList.contains('sku')) {
    const row = target.closest('tr');
    if (row && row.dataset.lineNo) {
      const lineNo = parseInt(row.dataset.lineNo, 10);
      if (!isNaN(lineNo)) {
        autoSelectCategoriesForLine(lineNo);
      }
    }
  }
  // Diğer alanlar için sadece kategori uyumluluğunu yeniden hesapla
  recalcCategoryCompatibility(true);
});
const pageTitle = el("pageTitle");

// Category Groups system
const btnGroupHub = el("btnGroupHub");

// Dropdown'ı tamamen kaldır (artık sadece butonlar kullanılacak)
// Opsiyonel olduğu için uyarı üretmemek adına doğrudan native API kullan
const categoryGroupSelect = document.getElementById("categoryGroupSelect");
if (categoryGroupSelect) categoryGroupSelect.remove();

// Modal artık otomatik olarak yükleniyor - window.categoryGroupsModal kullan

let lineCounter = 0;

// Check for edit mode
const params = new URLSearchParams(location.search);
const editId = params.get("id");
let editing = false;
let demandRef = null;

// Set today as default demand date
el("demandDate").valueAsDate = new Date();

// Category chip system
const chips = new Set();

// Satır bazlı otomatik seçilen kategoriler (lineNo -> { categoryId, categoryName })
const autoSelectedCategoriesByLine = new Map();

// Category Groups system
const categoryGroups = new Map(); // groupName -> Set of categories
let currentGroupName = null;
const categorySummaryEl = document.getElementById('categoryCompatibilitySummary');
const categorySnapshotEl = document.getElementById('categoryCompatibilitySnapshot');
const refreshCompatibilityBtn = document.getElementById('refreshCompatibilityBtn');

// Private demand system
let selectedSuppliers = new Set(); // Set of supplier IDs
let allSuppliers = []; // All available suppliers

let materialProfileCache = null;
let materialProfileDirty = true;

// CRITICAL FIX: Category ID system - chips now store category IDs, not slugs
// Cache for category ID -> name mapping
let categoryIdToNameMap = null;

function loadCategoryMapping() {
  if (categoryIdToNameMap) return categoryIdToNameMap;

  // Use ID-based system from categories.js
  categoryIdToNameMap = new Map();
  CATEGORIES.forEach(cat => {
    categoryIdToNameMap.set(cat.id, cat.name);
    // Backward compatibility: also support slugs and names
    categoryIdToNameMap.set(toSlug(cat.name), cat.name);
    categoryIdToNameMap.set(cat.name, cat.name);
  });

  return categoryIdToNameMap;
}

refreshCompatibilityBtn?.addEventListener('click', () => {
  recalcCategoryCompatibility(true);
});

function markMaterialProfileDirty() {
  materialProfileDirty = true;
}

function getMaterialProfile(force = false) {
  if (!materialProfileCache || materialProfileDirty || force) {
    const itemsSnapshot = collectItemsFromForm();
    materialProfileCache = buildMaterialProfile(itemsSnapshot, {
      title: el('title')?.value || '',
      spec: document.getElementById('spec')?.value || ''
    });
    materialProfileDirty = false;
  }
  return materialProfileCache;
}

function evaluateCategoryForCurrentItems(categoryId, options = {}) {
  if (!categoryId) return null;
  const profile = getMaterialProfile(options.forceProfile);
  return evaluateCategoryRule(categoryId, profile);
}

function updateCategoryCompatibilitySummary(force = false) {
  if (!categorySummaryEl || !categorySnapshotEl) return;
  const profile = getMaterialProfile(force);
  const selectedIds = [...chips];

  if (!selectedIds.length) {
    categorySnapshotEl.textContent = "Henüz kategori seçilmedi";
    categorySummaryEl.style.borderColor = "#e5e7eb";
    categorySummaryEl.style.background = "#f8fafc";
    return;
  }

  const details = selectedIds.map(id => ({
    id,
    name: categoryIdToName(id),
    result: evaluateCategoryRule(id, profile)
  }));

  const blocked = details.filter(d => d.result?.status === 'blocked');
  const mismatched = details.filter(d => d.result?.status === 'mismatch');
  const warning = details.filter(d => d.result?.status === 'warning');

  if (blocked.length) {
    categorySummaryEl.style.borderColor = "#fecaca";
    categorySummaryEl.style.background = "#fef2f2";
    categorySnapshotEl.textContent = `${blocked.length} kategori malzeme tanımıyla çakışıyor`;
  } else if (mismatched.length) {
    categorySummaryEl.style.borderColor = "#fde68a";
    categorySummaryEl.style.background = "#fffbeb";
    categorySnapshotEl.textContent = `${mismatched.length} kategori uyumsuz görünüyor`;
  } else if (warning.length) {
    categorySummaryEl.style.borderColor = "#bfdbfe";
    categorySummaryEl.style.background = "#eff6ff";
    categorySnapshotEl.textContent = `${warning.length} kategori için ek bilgi gerekli`;
  } else {
    categorySummaryEl.style.borderColor = "#bbf7d0";
    categorySummaryEl.style.background = "#ecfdf5";
    categorySnapshotEl.textContent = MESSAGES.INFO_COMPATIBILITY_SUMMARY
      .replace("{compatible}", String(selectedIds.length))
      .replace("{total}", String(selectedIds.length));
  }
}

function renderChips() {
  const box = el("catChips");
  if (!box) return;

  // Load category mapping
  loadCategoryMapping();
  box.innerHTML = "";

  const profile = getMaterialProfile();
  [...chips].forEach(categoryId => {
    const displayName = categoryIdToName(categoryId);
    const compat = evaluateCategoryRule(categoryId, profile);

    const span = document.createElement("span");
    span.className = "badge";
    span.textContent = displayName + " ✕";
    span.dataset.value = categoryId;
    if (compat?.status === 'blocked') {
      span.style.backgroundColor = '#fee2e2';
      span.style.color = '#991b1b';
    } else if (compat?.status === 'mismatch') {
      span.style.backgroundColor = '#fef3c7';
      span.style.color = '#92400e';
    }
    span.onclick = () => {
      chips.delete(categoryId);
      renderChips();
    };
    box.appendChild(span);
  });

  updateCategoryCompatibilitySummary();
}

function createCategorySelectionStats() {
  return {
    added: [],
    blocked: [],
    mismatch: [],
    warning: [],
    duplicate: []
  };
}

function formatCategoryReasonList(entries = [], limit = 3) {
  if (!entries.length) {
    return '';
  }
  const preview = entries.slice(0, limit).map(entry => {
    const name = categoryIdToName(entry.id);
    if (entry.reason) {
      return `${name}: ${entry.reason}`;
    }
    return name;
  });
  if (entries.length > limit) {
    preview.push(`+${entries.length - limit}`);
  }
  return preview.join(', ');
}

function notifyCategorySelectionStats(stats) {
  if (!stats) return;
  const blockedList = stats.blocked?.length
    ? (MESSAGES.ERROR_CATEGORY_BLOCKED_LIST || 'Engellenen kategoriler: {list}')
      .replace('{list}', formatCategoryReasonList(stats.blocked))
    : null;
  const mismatchList = !blockedList && stats.mismatch?.length
    ? (MESSAGES.WARN_CATEGORY_MISMATCH_LIST || 'Uyumsuz kategoriler: {list}')
      .replace('{list}', formatCategoryReasonList(stats.mismatch))
    : null;

  if (blockedList) {
    toast.error(blockedList);
  } else if (mismatchList) {
    toast.warn(mismatchList);
  } else if (stats.warning?.length) {
    const warningList = formatCategoryReasonList(stats.warning);
    if (warningList) {
      toast.info((MESSAGES.INFO_CATEGORY_WARNING || 'Ek bilgi gerekli: {details}')
        .replace('{details}', warningList));
    }
  }

  if (stats.added?.length) {
    toast.info(
      (MESSAGES.INFO_CATEGORY_ADDED_COUNT || '{count} kategori eklendi')
        .replace('{count}', stats.added.length)
    );
  }
}

function tryAddCategoryChip(categoryIdOrSlug, options = {}) {
  if (!categoryIdOrSlug) return false;
  const categoryId = nameToCategoryId(categoryIdOrSlug) || categoryIdOrSlug;
  if (!categoryId) return false;
  const stats = options.stats;
  if (chips.has(categoryId)) {
    stats?.duplicate?.push({ id: categoryId });
    return false;
  }

  const compat = evaluateCategoryForCurrentItems(categoryId, options);
  if (compat) {
    if (compat.status === 'blocked') {
      stats?.blocked?.push({ id: categoryId, reason: compat.reason });
      if (!options.silent) {
        const message = (MESSAGES.ERROR_CATEGORY_BLOCKED || 'Kategori uyumsuz')
          .replace('{name}', categoryIdToName(categoryId))
          .replace('{reason}', compat.reason || '');
        toast.warn(message); // Teklifbul Rule v1.0 - error yerine warn (engelleme kaldırıldı)
      }
      // Teklifbul Rule v1.0 - Engelleme kaldırıldı, sadece uyarı ver ama kategoriyi ekle
    }
    if (compat.status === 'mismatch') {
      stats?.mismatch?.push({ id: categoryId, reason: compat.reason });
      if (!options.silent) {
        const message = (MESSAGES.WARN_CATEGORY_MISMATCH || 'Kategori uyumsuz')
          .replace('{name}', categoryIdToName(categoryId));
        toast.warn(message);
      }
      // Teklifbul Rule v1.0 - Engelleme kaldırıldı, sadece uyarı ver ama kategoriyi ekle
    }
    if (compat.status === 'warning') {
      stats?.warning?.push({ id: categoryId, reason: compat.reason });
      if (!options.silent) {
        const message = (MESSAGES.INFO_CATEGORY_WARNING || 'Ek bilgi gerekli')
          .replace('{name}', categoryIdToName(categoryId))
          .replace('{details}', compat.reason || '');
        toast.info(message);
      }
    }
  }

  chips.add(categoryId);
  stats?.added?.push({ id: categoryId });
  return true;
}

/**
 * Formdaki kalemleri tek seferde topla (create + edit için ortak)
 */
function collectItemsFromForm() {
  const rows = itemsBody?.querySelectorAll("tr") || [];
  const items = [];

  rows.forEach((row) => {
    const sku = row.querySelector(".sku")?.value?.trim() || "";
    const itemName = row.querySelector(".itemName")?.value?.trim() || "";
    const brandModel = row.querySelector(".brandModel")?.value?.trim() || "";
    const qty = parseFloat(row.querySelector(".qty")?.value) || 0;
    const unit = row.querySelector(".unit")?.value?.trim() || "";
    const itemDueDate = row.querySelector(".itemDueDate")?.value || "";

    if (itemName && qty > 0 && unit) {
      const stockQty = parseFloat(row.querySelector(".stockQty")?.value) || 0;
      const targetPrice = parseFloat(row.querySelector(".targetPrice")?.value) || 0;
      const productImage = row.querySelector('.itemImageData')?.value || '';
      const featuresJson = row.querySelector('.featuresJson')?.value || '[]';
      const certsJson = row.querySelector('.certsJson')?.value || '[]';
      const altVal = row.querySelector('.altAcceptVal')?.value || '';
      const publishToMarket = row.querySelector('.publishToMarket')?.checked === true;
      let ozellikler = [];
      let kaliteSertifika = [];
      try { ozellikler = JSON.parse(featuresJson).filter(p => (p.key || '').trim() || (p.value || '').trim()); } catch { }
      try { kaliteSertifika = Array.from(new Set(JSON.parse(certsJson) || [])); } catch { }
      const alternatifKabul = altVal === 'true' ? true : (altVal === 'false' ? false : null);

      const itemData = {
        lineNo: parseInt(row.dataset.lineNo || (items.length + 1)),
        sku,
        name: itemName,
        brandModel,
        qty,
        unit,
        itemDueDate: itemDueDate || null,
        stockQty: stockQty > 0 ? stockQty : null,
        targetPrice: targetPrice > 0 ? targetPrice : null,
        productImage: productImage || null,
        ozellikler: ozellikler.length ? ozellikler : null,
        alternatifKabul: typeof alternatifKabul === 'boolean' ? alternatifKabul : null,
        kaliteSertifika: (kaliteSertifika && kaliteSertifika.length) ? kaliteSertifika : null,
        publishToMarket: publishToMarket
      };
      items.push(itemData);
    }
  });

  return items;
}

/**
 * AI tabanlı kategori doğrulama isteği
 */
async function runCategoryGuardCheck(payload) {
  try {
    const aiPerms = AI_PERMS || getAiPerms();
    const aiUseKey = aiPerms && aiPerms.use;

    const ok = await requireExistingPerm(aiUseKey, {
      toastMessage:
        (MESSAGES.ERROR_PERMISSION_AI_USE ||
          MESSAGES.ERROR_PERMISSION_DENIED ||
          MESSAGES.ERROR_PERMISSION) ??
        'AI asistanını kullanma yetkiniz yok.'
    });
    if (!ok) {
      logger.warn('Kategori guard: ai.use izni yok veya şablonu eksik, AI doğrulama atlandı', {
        permKey: aiUseKey || 'premium.ai.useAssistant'
      });
      // Yetki veya template yoksa backend çağrısını atla, varsayılan allow + skipped dön
      return { allowed: true, skipped: true, reason: 'permission_or_template' };
    }

    const currentUser = auth.currentUser || await requireAuth();
    if (!currentUser) {
      throw new Error('Kimlik doğrulaması başarısız');
    }
    const token = await currentUser.getIdToken();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch('/api/ai/category-guard', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      throw new Error(errorBody?.message || `Kategori doğrulama hatası (HTTP ${response.status})`);
    }

    return await response.json();
  } catch (error) {
    logger.warn('Kategori doğrulama atlandı', error);
    return { allowed: true, skipped: true, reason: 'Doğrulama atlandı' };
  }
}

function buildGroupTooltip(stats, categories = []) {
  const lines = [];
  if (categories.length) {
    lines.push(`Kategoriler: ${categories.join(', ')}`);
  }
  lines.push(`Uyumlu: ${stats.compatible}/${stats.total}`);
  const blocked = (stats.details || []).filter(entry => entry.status === 'blocked');
  const mismatched = (stats.details || []).filter(entry => entry.status === 'mismatch');
  if (blocked.length) {
    const list = blocked.slice(0, 3).map(entry => categoryIdToName(entry.categoryId) || entry.categoryId);
    if (blocked.length > 3) list.push(`+${blocked.length - 3}`);
    lines.push(`Bloklanan: ${list.join(', ')}`);
  } else if (mismatched.length) {
    const list = mismatched.slice(0, 3).map(entry => categoryIdToName(entry.categoryId) || entry.categoryId);
    if (mismatched.length > 3) list.push(`+${mismatched.length - 3}`);
    lines.push(`Uyumsuz: ${list.join(', ')}`);
  }
  return lines.join('\n');
}

function getGroupButtonStyles(stats = {}, isActive = false) {
  // Dark mode kontrolü
  const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';

  if (isActive) {
    return { background: '#10b981', color: '#ffffff', border: '#10b981' };
  }
  const hasIssues = (stats.blocked || 0) > 0 || (stats.mismatch || 0) > 0;
  if (hasIssues) {
    // Dark mode'da kırmızı arka plan, beyaz metin
    if (isDarkMode) {
      return { background: '#dc2626', color: '#ffffff', border: '#dc2626' };
    }
    return { background: '#fee2e2', color: '#991b1b', border: '#fecaca' };
  }
  const isCompatible = (stats.compatible || 0) > 0;
  if (isCompatible) {
    // Dark mode'da yeşil arka plan, beyaz metin
    if (isDarkMode) {
      return { background: '#10b981', color: '#ffffff', border: '#10b981' };
    }
    return { background: '#dcfce7', color: '#065f46', border: '#86efac' };
  }
  // Normal durum - dark mode'da koyu arka plan, beyaz metin
  if (isDarkMode) {
    return { background: '#111827', color: '#ffffff', border: 'rgba(255,255,255,0.25)' };
  }
  // Açık mod - beyaz arka plan, koyu metin
  return { background: '#ffffff', color: '#1f2937', border: '#e5e7eb' };
}

function renderGroupButtons() {
  const container = el("groupButtons");
  container.innerHTML = "";
  const profile = getMaterialProfile();

  // Varsayılan gruplar - 25 kategori mantıklı gruplara ayrıldı
  const defaultGroups = [
    { name: "İnşaat & Yapı", categories: ["İnşaat Malzemeleri", "Hırdavat", "Boya"] },
    { name: "Elektrik & Elektronik", categories: ["Elektrik", "Elektronik", "Aydınlatma", "Alçak/Orta Gerilim", "Otomasyon (PLC/SCADA)"] },
    { name: "Makine & İmalat", categories: ["Makine-İmalat", "Sac/Metal", "Kaynak & Sarf", "Rulman & Güç Aktarım", "Otomotiv Yan Sanayi"] },
    { name: "Kimya & Plastik", categories: ["Kimyasal", "Plastik", "Ambalaj"] },
    { name: "Güvenlik & Sağlık", categories: ["İş Güvenliği", "Yangın Güvenliği", "HVAC"] },
    { name: "Temizlik & Bakım", categories: ["Temizlik"] },
    { name: "Hizmetler & Diğer", categories: ["Gıda", "Hizmet", "Lojistik", "Ekipman Kiralama", "Mobilya", "Peyzaj & Bahçe", "Tesisat", "Marangoz & Ahşap İşleri", "Akaryakıt & Yağlar"] }
  ];

  // Varsayılan grupları ekle
  defaultGroups.forEach(group => {
    if (!categoryGroups.has(group.name)) {
      categoryGroups.set(group.name, new Set(group.categories));
    }
  });

  // Grup butonlarını render et
  categoryGroups.forEach((categories, groupName) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "group-btn";
    const idsForStats = Array.from(categories).map(nameToCategoryId).filter(Boolean);
    const stats = summarizeGroupCompatibility(idsForStats, profile);
    const style = getGroupButtonStyles(stats, currentGroupName === groupName);
    const background = style.background;
    const color = style.color;
    const border = style.border;
    button.style.cssText = `
          padding: 8px 12px;
          margin: 4px;
          background: ${background};
          color: ${color};
          border: 1px solid ${border};
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s;
        `;
    button.textContent = `${groupName} (${categories.size})`;
    button.title = buildGroupTooltip(stats, [...categories]);

    button.addEventListener("click", () => {
      if (currentGroupName === groupName) {
        // Grup seçimini kaldır
        currentGroupName = null;
        button.style.background = '#f3f4f6';
        button.style.color = '#374151';
      } else {
        // Grup seç
        currentGroupName = groupName;
        // Önceki seçimi temizle
        container.querySelectorAll('.group-btn').forEach(btn => {
          btn.style.background = '#f3f4f6';
          btn.style.color = '#374151';
        });
        button.style.background = '#10b981';
        button.style.color = 'white';

        const selectionStats = createCategorySelectionStats();
        for (const cat of categories) {
          const categoryId = nameToCategoryId(cat);
          if (!categoryId) {
            logger.warn('Unknown category', { category: cat });
            continue;
          }
          tryAddCategoryChip(categoryId, { silent: true, stats: selectionStats });
        }
        notifyCategorySelectionStats(selectionStats);
        renderChips();
      }
    });

    // Sağ tık menüsü ekle
    button.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const action = confirm(`"${groupName}" grubunu düzenlemek istiyor musunuz?\n\nTamam = Düzenle\nİptal = Sil`);
      if (action) {
        editGroup(groupName);
      } else {
        if (confirm(`"${groupName}" grubunu silmek istediğinizden emin misiniz?`)) {
          categoryGroups.delete(groupName);
          if (currentGroupName === groupName) {
            currentGroupName = null;
          }
          renderGroupButtons();
        }
      }
    });

    container.appendChild(button);
  });
}

// SATFK is auto-generated by Cloud Function

// Private Demand Functions
async function loadSuppliers() {
  try {
    const supplierMap = new Map();

    const queriesToRun = [
      // New roles object format: roles.supplier === true
      query(
        collection(db, 'users'),
        where('roles.supplier', '==', true)
      ),
      // Legacy single role field: role === 'supplier'
      query(
        collection(db, 'users'),
        where('role', '==', 'supplier')
      ),
      // Legacy roles array: roles array-contains 'supplier'
      query(
        collection(db, 'users'),
        where('roles', 'array-contains', 'supplier')
      )
    ];

    for (const qRef of queriesToRun) {
      try {
        const snap = await getDocs(qRef);
        snap.docs.forEach(doc => {
          const data = doc.data();
          supplierMap.set(doc.id, { id: doc.id, ...data });
        });
      } catch (e) {
        // CRITICAL FIX: Enhanced error logging with code and message
        logger.error('Supplier query failed', {
          code: e?.code || 'unknown',
          message: e?.message || String(e),
          error: e
        });
        // Log Firestore index link if available
        if (e?.code === 'failed-precondition') {
          logger.error('This query requires a Firestore composite index. Check the error message for the index creation link.');
        }
      }
    }

    // isActive alanı false olanları hariç tut; undefined/true olanlar dahil
    allSuppliers = Array.from(supplierMap.values()).filter(s => s?.isActive !== false);
    logger.info(`${allSuppliers.length} tedarikçi yüklendi`);
  } catch (error) {
    logger.error('Tedarikçi yükleme hatası', error);
    allSuppliers = [];
  }
}

function renderSupplierList(searchTerm = '') {
  const supplierList = el('supplierList');
  supplierList.innerHTML = '';

  const filteredSuppliers = allSuppliers.filter(supplier =>
    supplier.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    supplier.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (filteredSuppliers.length === 0) {
    // Teklifbul Rule v1.0 - XSS Protection
    const emptyMessage = DOMPurify.sanitize('<div style="padding: 16px; text-align: center; color: #6b7280;">Tedarikçi bulunamadı</div>', {
      ALLOWED_TAGS: ['div'],
      ALLOWED_ATTR: ['style']
    });
    supplierList.innerHTML = emptyMessage;
    return;
  }

  filteredSuppliers.forEach(supplier => {
    const div = document.createElement('div');
    div.style.cssText = `
          padding: 12px; 
          border-bottom: 1px solid #e5e7eb; 
          display: grid; 
          grid-template-columns: 24px 1fr;
          align-items: start; 
          column-gap: 12px;
          cursor: pointer;
          transition: background-color 0.2s;
        `;

    // Teklifbul Rule v1.0 - XSS Protection - Kullanıcı girdilerini sanitize et
    const safeCompanyName = DOMPurify.sanitize(supplier.companyName || 'İsimsiz Firma', { ALLOWED_TAGS: [] });
    const safeEmail = DOMPurify.sanitize(supplier.email || 'E-posta yok', { ALLOWED_TAGS: [] });
    const safeSupplierId = DOMPurify.sanitize(supplier.id || '', { ALLOWED_TAGS: [] });

    div.innerHTML = DOMPurify.sanitize(`
          <input type="checkbox" ${selectedSuppliers.has(supplier.id) ? 'checked' : ''} style="margin: 0;">
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 600; color: #1f2937; word-break: break-word;">${safeCompanyName}</div>
            <div style="font-size: 12px; color: #6b7280; word-break: break-word;">${safeEmail}</div>
            <div style="font-size: 11px; color: #9ca3af; word-break: break-word; white-space: normal;">Kategoriler: ${(supplier.supplierCategories || supplier.categories || []).join(', ') || 'Belirtilmemiş'}</div>
          </div>
        `);

    div.addEventListener('click', (e) => {
      if (e.target.type === 'checkbox') return;

      const checkbox = div.querySelector('input[type="checkbox"]');
      checkbox.checked = !checkbox.checked;

      if (checkbox.checked) {
        selectedSuppliers.add(supplier.id);
        div.style.backgroundColor = '#f0f9ff';
      } else {
        selectedSuppliers.delete(supplier.id);
        div.style.backgroundColor = '';
      }

      updateSelectedCount();
    });

    const checkbox = div.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedSuppliers.add(supplier.id);
        div.style.backgroundColor = '#f0f9ff';
      } else {
        selectedSuppliers.delete(supplier.id);
        div.style.backgroundColor = '';
      }
      updateSelectedCount();
    });

    supplierList.appendChild(div);
  });
}

function updateSelectedCount() {
  const count = selectedSuppliers.size;
  el('selectedCount').textContent = `Seçilen: ${count} tedarikçi`;
}

function updateSelectedSuppliersDisplay() {
  const display = el('selectedSuppliers');

  if (selectedSuppliers.size === 0) {
    // Teklifbul Rule v1.0 - XSS Protection
    display.textContent = 'Henüz tedarikçi seçilmedi';
    return;
  }

  // Teklifbul Rule v1.0 - XSS Protection
  const selectedNames = Array.from(selectedSuppliers).map(id => {
    const supplier = allSuppliers.find(s => s.id === id);
    const companyName = supplier?.companyName || 'Bilinmeyen';
    return DOMPurify.sanitize(companyName, { ALLOWED_TAGS: [] });
  });

  const safeNamesText = selectedNames.join(', ');
  display.innerHTML = DOMPurify.sanitize(`
        <div style="margin-bottom: 4px;"><strong>Seçilen Tedarikçiler:</strong></div>
        <div style="font-size: 11px;">${safeNamesText}</div>
      `, {
    ALLOWED_TAGS: ['div', 'strong'],
    ALLOWED_ATTR: ['style']
  });
}

function showSupplierModal() {
  el('supplierSelectionModal').style.display = 'block';
  renderSupplierList();
  updateSelectedCount();
}

function hideSupplierModal() {
  el('supplierSelectionModal').style.display = 'none';
}


function editGroup(groupName) {
  const categories = categoryGroups.get(groupName);
  const currentCategories = [...categories].join(', ');

  const newCategories = prompt(
    `"${groupName}" grubu için kategorileri girin (virgülle ayırın):\n\nMevcut: ${currentCategories}`,
    currentCategories
  );

  if (newCategories === null) return; // İptal edildi

  // Kategorileri güncelle
  const categoryArray = newCategories.split(',').map(cat => cat.trim()).filter(cat => cat);
  categories.clear();
  categoryArray.forEach(cat => categories.add(cat));

  // UI'yi güncelle
  renderGroupButtons();
}



// Termin tarihi değiştiğinde tüm talep kalemlerine otomatik doldur
el("dueDate").addEventListener('change', function () {
  const selectedDate = this.value;
  if (selectedDate) {
    // Tüm mevcut talep kalemlerinin termin tarihlerini güncelle
    const itemDueDates = document.querySelectorAll('.itemDueDate');
    itemDueDates.forEach(input => {
      if (!input.value) { // Sadece boş olanları doldur
        input.value = selectedDate;
      }
    });
    logger.info(`Termin tarihi tüm talep kalemlerine uygulandı`, { date: selectedDate });
  }
});



// SATFK will be auto-generated by Cloud Function

// Private demand event listeners (custom invite editor)
el("selectSuppliersBtn").addEventListener("click", showSupplierModal);
el("closeSupplierModal").addEventListener("click", hideSupplierModal);
el("cancelSupplierSelection").addEventListener("click", hideSupplierModal);
el("confirmSupplierSelection").addEventListener("click", () => {
  updateSelectedSuppliersDisplay();
  hideSupplierModal();
});

// Supplier search (debounced - Teklifbul Rule v1.0)
const debouncedRenderSupplierList = debounce((query) => {
  renderSupplierList(query);
}, 300);

el("supplierSearch").addEventListener("input", (e) => {
  debouncedRenderSupplierList(e.target.value);
});

// ====================
// Demand Visibility + Invite Mode (new)
// ====================
let autoInvitees = [];

const selectedInviteGroups = new Set();

function renderInviteGroupPicker() {
  const host = el('inviteGroupPicker');
  if (!host) return;
  host.innerHTML = '';
  categoryGroups.forEach((_, groupName) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = groupName;
    btn.style.padding = '6px 10px';
    btn.style.borderRadius = '16px';
    btn.style.border = '1px solid #d1d5db';
    btn.style.background = selectedInviteGroups.has(groupName) ? '#2563eb' : '#ffffff';
    btn.style.color = selectedInviteGroups.has(groupName) ? '#ffffff' : '#111827';
    btn.addEventListener('click', () => {
      if (selectedInviteGroups.has(groupName)) selectedInviteGroups.delete(groupName);
      else selectedInviteGroups.add(groupName);
      renderInviteGroupPicker();
      const mode = document.querySelector('input[name="inviteMode"]:checked')?.value || 'auto';
      if (document.querySelector('input[name="demandVisibility"]:checked')?.value === 'ozel' && mode === 'auto') {
        loadGroupMembers();
      }
    });
    host.appendChild(btn);
  });
}

function getSelectedGroupIds() {
  return Array.from(selectedInviteGroups);
}

async function loadGroupMembers() {
  const ids = getSelectedGroupIds();
  if (!ids.length) {
    autoInvitees = [];
    el('autoInviteCount').textContent = '0';
    return;
  }
  try {
    const res = await fetch(`/api/groups/members?ids=${ids.join(',')}`);
    const list = await res.json();
    autoInvitees = Array.isArray(list) ? list : [];
    el('autoInviteCount').textContent = String(autoInvitees.length);
  } catch (e) {
    logger.error('Grup üyeleri alınamadı', e);
    autoInvitees = [];
    el('autoInviteCount').textContent = '0';
  }
}

const visibilityRadios = document.querySelectorAll('input[name="demandVisibility"]');
const inviteModeRadios = document.querySelectorAll('input[name="inviteMode"]');

function updateVisibilitySections() {
  const v = document.querySelector('input[name="demandVisibility"]:checked')?.value;
  const isPrivate = v === 'ozel';
  const container = el('privateVisibilitySettings');
  container.style.display = isPrivate ? 'block' : 'none';
  if (isPrivate && allSuppliers.length === 0) {
    // preload supplier list for custom editor
    loadSuppliers();
  }
  updateInviteModeSections();
}

function updateInviteModeSections() {
  const mode = document.querySelector('input[name="inviteMode"]:checked')?.value || 'auto';
  el('autoInviteSummary').style.display = mode === 'auto' ? 'block' : 'none';
  el('customInviteEditor').style.display = mode === 'custom' ? 'block' : 'none';
}

visibilityRadios.forEach(r => r.addEventListener('change', updateVisibilitySections));
inviteModeRadios.forEach(r => r.addEventListener('change', updateInviteModeSections));
el('loadGroupMembersBtn').addEventListener('click', loadGroupMembers);
// group picker events bağlama render sırasında yapılacak
// initial (görünürlük alanı kaldırıldı)

// SATFK Preview System
let previewSatfk = null;

function generatePreviewSATFK() {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase().padStart(4, '0');
  return `SATFK-${dateStr}-${randomSuffix}`;
}

function updateSATFKPreview() {
  previewSatfk = generatePreviewSATFK();
  el("satfk").value = previewSatfk;
  el("satfkStatus").textContent = `Önizleme: ${previewSatfk} (Talep kaydedilene kadar değişebilir)`;
  el("copySatfkBtn").style.display = "inline-block";
}

// SATFK Copy functionality
el("copySatfkBtn").addEventListener("click", async () => {
  const satfkValue = el("satfk").value;
  if (satfkValue) {
    try {
      await navigator.clipboard.writeText(satfkValue);
      el("satfkStatus").textContent = "✅ Kod panoya kopyalandı!";
      setTimeout(() => {
        el("satfkStatus").textContent = `Önizleme: ${satfkValue} (Talep kaydedilene kadar değişebilir)`;
      }, 2000);
    } catch (error) {
      logger.error('Kopyalama hatası', error);
      el("satfkStatus").textContent = "❌ Kopyalama başarısız";
    }
  }
});

// SATFK Refresh functionality
el("refreshSatfkBtn").addEventListener("click", () => {
  updateSATFKPreview();
});

// Initial SATFK preview
updateSATFKPreview();

// Sayfa yüklendiğinde grup butonlarını render et
renderGroupButtons();
updateCategoryCompatibilitySummary(true);

// ====================
// Bidding Mode & Time-Bound Logic
// ====================
const isTimeBoundCheckbox = el("isTimeBound");
const timeBoundFields = el("timeBoundFields");
const singlePhaseTime = el("singlePhaseTime");
const hybridPhaseTime = el("hybridPhaseTime");
const biddingModeRadios = document.getElementsByName("biddingMode");

// Toggle time-bound fields (hidden + dynamic hint)
const scheduleHint = document.getElementById('scheduleHint');
function updateScheduleUI() {
  const on = !!isTimeBoundCheckbox.checked;
  if (timeBoundFields) timeBoundFields.hidden = !on;
  if (on) updateTimeFieldsVisibility();
  if (scheduleHint) scheduleHint.textContent = on
    ? 'Süreli seçilirse talep başlangıç tarihi ile başlar, bitiş tarihi ile kapanır.'
    : 'Seçilmezse talep şimdi başlar ve manuel olarak kapatılana kadar devam eder.';
}
isTimeBoundCheckbox.addEventListener("change", updateScheduleUI);
updateScheduleUI();

// Toggle between single/hybrid time fields based on mode
biddingModeRadios.forEach(radio => {
  radio.addEventListener("change", () => {
    if (isTimeBoundCheckbox.checked) {
      updateTimeFieldsVisibility();
    }

    // Hibrit mod ayarlarını göster/gizle
    updateHybridSettingsVisibility();
  });
});

function updateHybridSettingsVisibility() {
  const hybridSettings = el("hybridSettings");
  const selectedMode = document.querySelector('input[name="biddingMode"]:checked').value;

  if (selectedMode === 'hybrid') {
    hybridSettings.style.display = 'block';
  } else {
    hybridSettings.style.display = 'none';
  }
}

function updateTimeFieldsVisibility() {
  const mode = document.querySelector('input[name="biddingMode"]:checked').value;
  if (mode === "hybrid") {
    singlePhaseTime.style.display = "none";
    hybridPhaseTime.style.display = "";
  } else {
    singlePhaseTime.style.display = "";
    hybridPhaseTime.style.display = "none";
  }
}

// ====================
// Load Internal Demand Data (fromInternal=true)
// ====================
const fromInternal = params.get("fromInternal") === "true";
let internalDemandId = null; // Geri dön butonu için sakla

if (fromInternal && !editId) {
  try {
    logger.group('İç talep verileri yükleniyor');
    const internalDemandDataStr = localStorage.getItem('internalDemandData');

    if (internalDemandDataStr) {
      const internalDemandData = JSON.parse(internalDemandDataStr);
      internalDemandId = internalDemandData.internalDemandId; // ID'yi sakla

      logger.info('İç talep verileri bulundu', {
        title: internalDemandData.title,
        itemsCount: internalDemandData.items?.length || 0,
        internalDemandId: internalDemandData.internalDemandId
      });

      // Navigasyon kutusunu göster
      const navBox = document.getElementById('internalDemandNavigation');
      if (navBox) {
        navBox.style.display = 'flex';
        navBox.style.alignItems = 'center';
        navBox.style.gap = '12px';
        navBox.style.flexWrap = 'wrap';
      }

      // Geri dön butonunu bağla
      const backBtn = document.getElementById('backToInternalDemandBtn');
      if (backBtn && internalDemandId) {
        backBtn.onclick = () => {
          window.location.href = `/internal-demand-detail.html?id=${internalDemandId}`;
        };
      }

      // Form alanlarını doldur
      if (internalDemandData.title) {
        el("title").value = internalDemandData.title;
      }

      if (internalDemandData.description) {
        const specEl = document.getElementById("spec");
        if (specEl) specEl.value = internalDemandData.description;
      }

      // Talep Eden (iç talep oluşturan kullanıcı)
      if (internalDemandData.createdByName) {
        el("requester").value = internalDemandData.createdByName;
      }

      // Termin Tarihi
      if (internalDemandData.terminDate) {
        el("dueDate").value = internalDemandData.terminDate;
      }

      // Şantiye bilgisi
      if (internalDemandData.siteName) {
        el("siteName").value = internalDemandData.siteName;
      }

      // Teslimat Adresi (siteAddress adres başlığı olarak kullanılacak)
      if (internalDemandData.siteAddress) {
        // siteAddress bir adres başlığı olabilir (örneğin "depo", "ev" gibi)
        // veya tam adres string'i olabilir
        const siteAddressValue = internalDemandData.siteAddress.trim();

        // Önce adres başlığı olarak eşleştirmeyi dene
        // setupDeliveryAddressHandlers çalıştıktan sonra adresler yüklenecek
        // Bu yüzden bir flag set edip sonra işleyeceğiz
        window.__pendingSiteAddress = siteAddressValue;

        // Adresten il bilgisini çıkar (Alım Yeri için)
        // Adres formatı genellikle: "... İlçe / İl" veya "... İl" şeklinde
        const ilMatch = siteAddressValue.match(/([A-ZÇĞİÖŞÜ][a-zçğıöşü]+)\s*\/\s*([A-ZÇĞİÖŞÜ][a-zçğıöşü]+)|([A-ZÇĞİÖŞÜ][a-zçğıöşü]+)\s*(?:İl|İli)/);
        if (ilMatch) {
          // İl bilgisini bul (son kısımdan)
          const il = ilMatch[2] || ilMatch[3] || ilMatch[1];
          if (il && il.length > 2) {
            // purchaseLocation'a yaz (Alım Yeri)
            el("purchaseLocation").value = il;
          }
        }
      }

      // Teslimat Şekli
      if (internalDemandData.deliveryMethod) {
        const deliveryMethodValue = internalDemandData.deliveryMethod;
        // İç talep'teki değerleri yeni talep'teki değerlere eşleştir
        let mappedValue = deliveryMethodValue;
        if (deliveryMethodValue === 'nakliye_dahil' || deliveryMethodValue === 'nakliye_haric' || deliveryMethodValue === 'ozel_teslimat') {
          // Değerler aynı veya benzer, direkt kullan
          if (deliveryMethodValue === 'ozel_teslimat') {
            mappedValue = 'custom';
          }
        }

        const radio = document.querySelector(`input[name="deliveryMethod"][value="${mappedValue}"]`);
        if (radio) {
          radio.checked = true;
          // setupDeliveryMethodHandlers'ı tetikle
          if (typeof setupDeliveryMethodHandlers === 'function') {
            setupDeliveryMethodHandlers();
          }
        } else if (deliveryMethodValue) {
          // Özel değer ise custom input'a yaz
          const customInput = document.getElementById('deliveryMethodCustom');
          if (customInput) {
            customInput.value = deliveryMethodValue;
          }
        }
      }

      // İndirme Şekli
      if (internalDemandData.unloadingMethod) {
        const unloadingRadio = document.querySelector(`input[name="unloadingMethod"][value="${internalDemandData.unloadingMethod}"]`);
        if (unloadingRadio) {
          unloadingRadio.checked = true;
        }
      }

      // Kalemleri ekle
      if (internalDemandData.items && Array.isArray(internalDemandData.items)) {
        internalDemandData.items.forEach((item) => {
          // dueDate formatını düzelt (itemDueDate olarak gönderilmeli)
          let itemDueDate = '';
          if (item.dueDate) {
            try {
              // String (ISO format) veya Timestamp olabilir
              let date;
              if (typeof item.dueDate === 'string') {
                date = new Date(item.dueDate);
              } else if (item.dueDate.toDate) {
                date = item.dueDate.toDate();
              } else if (item.dueDate instanceof Date) {
                date = item.dueDate;
              } else {
                date = new Date(item.dueDate);
              }

              if (!isNaN(date.getTime())) {
                itemDueDate = date.toISOString().split('T')[0];
              }
            } catch (e) {
              logger.warn('Tarih formatı hatası', { dueDate: item.dueDate, error: e });
            }
          }

          addRow({
            sku: item.sku || '',
            name: item.itemName || item.name || '',
            brandModel: item.brandModel || '',
            qty: item.quantity || item.qty || '',
            unit: item.unit || '',
            stockQty: item.stockQty || null, // Depodaki Miktar
            itemDueDate: itemDueDate,
            lineNo: item.lineNo || lineCounter
          });
        });
      }

      // localStorage'dan temizle
      localStorage.removeItem('internalDemandData');

      toast.success(MESSAGES.SUCCESS_DEMAND_INTERNAL_LOADED);
      logger.info('İç talep verileri forma yüklendi');
      logger.end();
    } else {
      logger.warn('İç talep verileri bulunamadı');
      logger.end();
    }
  } catch (error) {
    logger.error('İç talep verileri yüklenirken hata oluştu', error);
    toast.error(MESSAGES.ERROR_DEMAND_INTERNAL_LOAD);
    logger.end();
  }
}

// ====================
// Edit Mode: Load Existing Demand
// ====================
if (editId) {
  editing = true;
  pageTitle.textContent = "Talebi Düzenle";
  createBtn.textContent = "Değişiklikleri Kaydet";

  try {
    demandRef = doc(db, "demands", editId);
    const snap = await getDoc(demandRef);

    if (!snap.exists()) {
      toast.error(MESSAGES.ERROR_DEMAND_NOT_FOUND);
      location.href = "./demands.html";
      throw new Error("NOT_FOUND");
    }

    const d = snap.data();

    // Check ownership
    if (d.createdBy !== user.uid) {
      toast.error(MESSAGES.ERROR_DEMAND_EDIT_PERMISSION);
      location.href = "./demands.html";
      throw new Error("UNAUTHORIZED");
    }

    // Check if published
    if (d.published) {
      toast.warn(MESSAGES.WARN_PUBLISHED_EDIT);
      location.href = `./demand-detail.html?id=${editId}`;
      throw new Error("PUBLISHED");
    }

    // Load header data into form
    el("satfk").value = d.satfk || "";
    el("demandDate").value = d.demandDate || d.createdAt?.toDate?.()?.toISOString?.()?.split('T')[0] || "";
    el("siteName").value = d.siteName || "";
    el("purchaseLocation").value = d.purchaseLocation || "";
    el("title").value = d.title || "";
    const _specEl = document.getElementById("spec"); if (_specEl) _specEl.value = d.spec || "";
    el("dueDate").value = d.dueDate || "";
    el("priority").value = d.priority || "price";
    el("currency").value = d.currency || "TRY";
    el("paymentTerms").value = d.paymentTerms || "";
    // paymentSchedule kaldırıldı
    const _deliveryCityEl = document.getElementById("deliveryCity"); if (_deliveryCityEl) _deliveryCityEl.value = d.deliveryCity || "";
    el("deliveryAddress").value = d.deliveryAddress || "";
    // Edit modunda teslimat adresi select'ini eşleştirmek için içeriği paylaş
    window.__desiredDeliveryAddress = d.deliveryAddress || "";

    // SATFK is always readonly
    el("satfk").readOnly = true;
    el("satfk").style.background = "#f9fafb";

    // Load categories (tek kategori kuralı)
    const existingCategories = Array.isArray(d.categoryTags) ? d.categoryTags : [];
    let restoredCategory = null;
    for (const c of existingCategories) {
      const categoryId = nameToCategoryId(c) || c;
      if (categoryId && tryAddCategoryChip(categoryId, { silent: true })) {
        restoredCategory = categoryId;
        break;
      }
    }
    if (existingCategories.length > 1) {
      toast.info(MESSAGES.INFO_DEMAND_SINGLE_CATEGORY_RULE);
    }
    if (d.customCategory) el("catInput").value = d.customCategory;
    renderChips();

    // Load bidding mode and time-bound settings
    const mode = d.biddingMode || "secret";
    document.querySelector(`input[name="biddingMode"][value="${mode}"]`).checked = true;

    // Teslim şekli restore
    const dmVal = d.deliveryMethod || '';
    const dmRadio = document.querySelector(`input[name="deliveryMethod"][value="${dmVal}"]`);
    const dmCustom = document.getElementById('deliveryMethodCustom');
    if (dmRadio) {
      dmRadio.checked = true;
    } else if (dmCustom) {
      dmCustom.value = dmVal;
    }

    // İndirme şekli restore
    if (d.unloadingMethod) {
      const unloadingRadio = document.querySelector(`input[name="unloadingMethod"][value="${d.unloadingMethod}"]`);
      if (unloadingRadio) {
        unloadingRadio.checked = true;
      }
    }

    // Hibrit ayarlarını yükle
    if (d.hybridSettings) {
      if (d.hybridSettings.firstRoundDays) {
        el("firstRoundDays").value = d.hybridSettings.firstRoundDays;
      }
      if (d.hybridSettings.secondRoundSupplierVisibility) {
        el("secondRoundSupplierVisibility").value = d.hybridSettings.secondRoundSupplierVisibility;
      }
      if (d.hybridSettings.secondRoundDays) {
        el("secondRoundDays").value = d.hybridSettings.secondRoundDays;
      }
    }

    // Hibrit ayarlarını göster/gizle
    updateHybridSettingsVisibility();

    if (d.isTimeBound) {
      isTimeBoundCheckbox.checked = true;
      timeBoundFields.style.display = "";

      if (mode === "hybrid") {
        hybridPhaseTime.style.display = "";
        singlePhaseTime.style.display = "none";
        if (d.round1Start) el("round1Start").value = timestampToDatetimeLocal(d.round1Start);
        if (d.round1End) el("round1End").value = timestampToDatetimeLocal(d.round1End);
        if (d.round2Start) el("round2Start").value = timestampToDatetimeLocal(d.round2Start);
        if (d.round2End) el("round2End").value = timestampToDatetimeLocal(d.round2End);
      } else {
        singlePhaseTime.style.display = "";
        hybridPhaseTime.style.display = "none";
        if (d.phaseStartAt) el("phaseStart").value = timestampToDatetimeLocal(d.phaseStartAt);
        if (d.phaseEndAt) el("phaseEnd").value = timestampToDatetimeLocal(d.phaseEndAt);
      }
    }

    // Load items
    const itemsQ = query(collection(db, "demands", editId, "items"), orderBy("lineNo", "asc"));
    const itemsSnap = await getDocs(itemsQ);

    // Teklifbul Rule v1.0 - public_listings'den publishToMarket bilgisini yükle
    const listingsQuery = query(
      collection(db, 'public_listings'),
      where('demandId', '==', editId),
      where('status', '==', 'active')
    );
    const listingsSnap = await getDocs(listingsQuery);
    const publishedItemIndexes = new Set(
      listingsSnap.docs.map(doc => {
        const data = doc.data();
        return data.itemIndex || parseInt(doc.id.split('_').pop()) || null;
      }).filter(idx => idx !== null)
    );

    itemsSnap.docs.forEach(docSnap => {
      const item = docSnap.data();
      const itemIndex = item.lineNo || parseInt(docSnap.id) || null;
      // public_listings'de varsa publishToMarket=true
      item.publishToMarket = publishedItemIndexes.has(itemIndex);
      addRow(item);
    });

    // Teklifbul Rule v1.0 - Yüklenen satırlar için kategori önerisi setup
    // NOT: setupExistingItemNameFields başka bir script bloğunda zaten çağrılıyor, burada tekrar çağırmaya gerek yok

  } catch (error) {
    logger.error("Yeni talep yükleme hatası", error);
    // Already redirected
  }
}

// Helper: Öneri kartını kaldır
function removeSuggestionCard(cardId) {
  const card = document.getElementById(cardId);
  if (card) {
    card.remove();
  }
}

// Teklifbul Rule v1.0 - Stok kodu için stok kontrolü
async function setupStockSearchForSku(skuInput, tr) {
  if (!skuInput) return;

  let debounceTimeout = null;
  let lastQuery = '';

  skuInput.addEventListener('input', async (e) => {
    const text = e.target.value.trim();

    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
      debounceTimeout = null;
    }

    // 3 harften az ise arama yapma
    if (text.length < 3) {
      lastQuery = '';
      return;
    }

    // Aynı sorguyu tekrar etme
    if (text === lastQuery) return;

    debounceTimeout = setTimeout(async () => {
      const currentText = skuInput.value.trim();
      if (currentText.length >= 3 && currentText === text) {
        lastQuery = currentText;
        await searchStockBySku(currentText, tr);
      }
      debounceTimeout = null;
    }, 500);
  });
}

// Teklifbul Rule v1.0 - Malzeme tanımı için stok kontrolü
// NOT: Bu fonksiyon kaldırıldı - stok araması setupCategorySuggestionForItemName içine entegre edildi
// Duplicate event listener sorununu önlemek için

// Teklifbul Rule v1.0 - Stok kodu ile stok arama
async function searchStockBySku(sku, tr) {
  try {
    logger.group('Stok kodu ile arama');
    const user = await requireAuth();
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const userData = userDoc.exists() ? userDoc.data() : {};
    const companyId = userData.companyId;

    if (!companyId) {
      logger.warn('Company ID bulunamadı');
      logger.end();
      return;
    }

    // Firestore'da stok arama
    const stocksQuery = query(
      collection(db, 'stocks'),
      where('sku', '==', sku),
      where('companyId', '==', companyId),
      limit(1)
    );
    const snap = await getDocs(stocksQuery);

    if (snap.empty) {
      logger.info('Stok bulunamadı', { sku });
      logger.end();
      return;
    }

    const stockDoc = snap.docs[0];
    const stockData = stockDoc.data();

    logger.info('Stok bulundu', { sku, name: stockData.name });

    // Kullanıcıya seçenek sun
    showStockSelectionCard(stockData, tr, 'sku');

    logger.end();
  } catch (error) {
    logger.error('Stok arama hatası', error);
    logger.end();
  }
}

// Teklifbul Rule v1.0 - Malzeme tanımı ile stok arama
async function searchStockByName(name, tr) {
  try {
    logger.group('Malzeme tanımı ile arama');
    const user = await requireAuth();
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const userData = userDoc.exists() ? userDoc.data() : {};
    const companyId = userData.companyId;

    if (!companyId) {
      logger.warn('Company ID bulunamadı');
      logger.end();
      return;
    }

    // Firestore'da tüm stokları yükle ve client-side filtrele
    const stocksQuery = query(
      collection(db, 'stocks'),
      where('companyId', '==', companyId),
      limit(200)
    );
    const snap = await getDocs(stocksQuery);

    const matches = [];
    // Teklifbul Rule v1.0 - Türkçe karakter normalizasyonu ile arama
    const normalizedName = normalizeTRLower(name.trim());

    snap.forEach(doc => {
      const data = doc.data();
      const stockName = normalizeTRLower(data.name || '');
      // Normalize edilmiş string'lerde arama yap
      if (stockName.includes(normalizedName) || stockName.startsWith(normalizedName)) {
        matches.push({ id: doc.id, ...data });
      }
    });

    if (matches.length === 0) {
      logger.info('Stok bulunamadı', { name, normalized: normalizedName });
      logger.end();
      return;
    }

    // En iyi eşleşmeyi seç (tam eşleşme varsa onu, yoksa ilkini)
    const exactMatch = matches.find(m => normalizeTRLower(m.name || '').trim() === normalizedName);
    const selectedStock = exactMatch || matches[0];

    logger.info('Stok bulundu', { name, matches: matches.length, selected: selectedStock.name });

    // Kullanıcıya seçenek sun
    showStockSelectionCard(selectedStock, tr, 'name');

    logger.end();
  } catch (error) {
    logger.error('Stok arama hatası', error);
    logger.end();
  }
}

// Teklifbul Rule v1.0 - Stok seçim kartı göster
function showStockSelectionCard(stockData, tr, searchType) {
  // Mevcut kartı kaldır
  const existingCard = tr.querySelector('.stock-selection-card');
  if (existingCard) {
    existingCard.remove();
  }

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const bgColor = isDark ? '#111827' : '#ffffff';
  const textColor = isDark ? '#ffffff' : '#1f2937';
  const borderColor = isDark ? 'rgba(255,255,255,0.25)' : '#d1d5db';

  // Yeni kart oluştur
  const card = document.createElement('div');
  card.className = 'stock-selection-card';
  card.style.cssText = `
        margin-top: 8px;
        padding: 12px;
        background: ${bgColor};
        border: 1px solid ${borderColor};
        border-radius: 8px;
        font-size: 13px;
        position: relative;
        z-index: 10;
      `;

  card.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 8px; color: ${textColor};">
          📦 Sistemde Stok Bulundu
        </div>
        <div style="margin-bottom: 8px; padding: 8px; background: ${isDark ? '#1f2937' : '#f3f4f6'}; border-radius: 6px;">
          <div style="color: ${textColor}; margin-bottom: 4px;"><strong>Stok Kodu:</strong> ${stockData.sku || '-'}</div>
          <div style="color: ${textColor}; margin-bottom: 4px;"><strong>Ürün Adı:</strong> ${stockData.name || '-'}</div>
          ${stockData.brand ? `<div style="color: ${textColor}; margin-bottom: 4px;"><strong>Marka:</strong> ${stockData.brand}</div>` : ''}
          ${stockData.unit ? `<div style="color: ${textColor};"><strong>Birim:</strong> ${stockData.unit}</div>` : ''}
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="apply-stock-btn" data-stock-id="${stockData.id || ''}" 
                  style="flex: 1; padding: 8px 12px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
            ✓ Bu Stoku Kullan
          </button>
          <button class="dismiss-stock-btn" 
                  style="padding: 8px 12px; background: ${isDark ? '#374151' : '#e5e7eb'}; color: ${textColor}; border: 1px solid ${borderColor}; border-radius: 6px; cursor: pointer;">
            ✕ İptal
          </button>
        </div>
      `;

  // Kartı textarea veya input'un altına ekle
  const targetElement = searchType === 'sku' ? tr.querySelector('.sku') : tr.querySelector('.itemName');
  if (targetElement) {
    targetElement.parentElement.appendChild(card);
  }

  // Stok seçme butonu
  card.querySelector('.apply-stock-btn').addEventListener('click', async () => {
    await applyStockToRow(stockData, tr);
    card.remove();
  });

  // İptal butonu
  card.querySelector('.dismiss-stock-btn').addEventListener('click', () => {
    card.remove();
  });
}

// Teklifbul Rule v1.0 - Stok verilerini satıra uygula
async function applyStockToRow(stockData, tr) {
  try {
    logger.group('Stok verilerini satıra uygulama');

    // Stok kodu
    const skuInput = tr.querySelector('.sku');
    if (skuInput && stockData.sku) {
      skuInput.value = stockData.sku;
    }

    // Malzeme tanımı
    const itemNameTextarea = tr.querySelector('.itemName');
    if (itemNameTextarea && stockData.name) {
      // Teklifbul Rule v1.0 - Duplicate event listener sorununu önlemek için
      // value değişikliği otomatik olarak input event'ini tetikler, manuel tetikleme gerekmez
      itemNameTextarea.value = stockData.name;
      // Auto-resize için sadece resize event'i tetikle (input event'i tetikleme - duplicate çağrı önlenir)
      if (itemNameTextarea.dispatchEvent) {
        itemNameTextarea.dispatchEvent(new Event('resize'));
      }
    }

    // Marka/Model
    const brandModelInput = tr.querySelector('.brandModel');
    if (brandModelInput && stockData.brand) {
      brandModelInput.value = stockData.brand;
    }

    // Birim
    const unitInput = tr.querySelector('.unit');
    if (unitInput && stockData.unit) {
      unitInput.value = stockData.unit;
    }

    logger.info('Stok verileri satıra uygulandı', { sku: stockData.sku, name: stockData.name });
    toast.success(MESSAGES.SUCCESS_DEMAND_STOCK_AUTO_FILLED);

    logger.end();
  } catch (error) {
    logger.error('Stok uygulama hatası', error);
    toast.error(MESSAGES.ERROR_DEMAND_STOCK_APPLY);
  }
}

// Duplicate tanım kaldırıldı - fonksiyonlar addRow'dan önce tanımlı

// Teklifbul Rule v1.0 - Satır bazlı otomatik kategori seçimi
// Debounce mekanizması: Aynı satır için kısa süre içinde birden fazla çağrıyı önle
const categorySelectionDebounceMap = new Map();

async function autoSelectCategoriesForLine(lineNo) {
  try {
    // Debounce: Eğer bu satır için son 500ms içinde çağrıldıysa, atla
    const lastCall = categorySelectionDebounceMap.get(lineNo);
    const now = Date.now();
    if (lastCall && (now - lastCall) < 500) {
      return; // Çok yakın zamanda çağrıldı, atla
    }
    categorySelectionDebounceMap.set(lineNo, now);

    const row = itemsBody?.querySelector(`tr[data-line-no="${lineNo}"]`);
    if (!row) return;

    const itemName = row.querySelector('.itemName')?.value?.trim() || '';
    const sku = row.querySelector('.sku')?.value?.trim() || '';

    // Teklifbul Rule v1.0 - Sadece sku değiştiğinde kategori seçimi yap
    // itemName için setupCategorySuggestionForItemName zaten kategori seçimi yapıyor
    // brandModel, qty, unit, stockQty, targetPrice, itemImage, itemDueDate alanları için kategori seçimi yapılmaz

    // En az 3 karakter olmalı (sku için)
    if (sku.length < 3) return;

    // Bu satır için malzeme profili oluştur (sadece sku kullan, itemName varsa onu da ekle)
    const lineItems = [{
      name: itemName || sku, // itemName varsa onu kullan, yoksa sku kullan
      brandModel: '', // brandModel kategori seçiminde kullanılmaz
      description: ''
    }];

    const profile = buildMaterialProfile(lineItems, {
      title: el('title')?.value || '',
      spec: document.getElementById('spec')?.value || ''
    });

    // Kategori önerileri al
    const suggestedCategoryIds = suggestCategoriesForProfile(profile, 3);

    if (suggestedCategoryIds.length > 0) {
      logger.group(`Satır ${lineNo} için otomatik kategori seçimi`);
      logger.info('Önerilen kategoriler', {
        lineNo,
        itemName,
        count: suggestedCategoryIds.length,
        categories: suggestedCategoryIds.map(id => categoryIdToName(id))
      });

      // En iyi eşleşen kategoriyi otomatik seç
      const bestCategoryId = suggestedCategoryIds[0];
      const bestCategoryName = categoryIdToName(bestCategoryId);

      // Eğer bu satır için zaten bir otomatik seçim varsa ve aynıysa, tekrar seçme
      const existingAuto = autoSelectedCategoriesByLine.get(lineNo);
      if (existingAuto && existingAuto.categoryId === bestCategoryId) {
        logger.info('Kategori zaten seçili', { categoryId: bestCategoryId });
        logger.end();
        return;
      }

      // Kategoriyi ekle
      const stats = createCategorySelectionStats();
      const added = tryAddCategoryChip(bestCategoryId, { silent: true, stats });

      if (added) {
        // Bu satır için otomatik seçilen kategoriyi kaydet
        autoSelectedCategoriesByLine.set(lineNo, { categoryId: bestCategoryId, categoryName: bestCategoryName });
        renderChips();
        logger.info('Kategori otomatik seçildi', { categoryId: bestCategoryId, name: bestCategoryName });
        logger.end();
      } else {
        logger.warn('Kategori eklenemedi', { categoryId: bestCategoryId });
        logger.end();
      }
    }
  } catch (error) {
    logger.error('Satır bazlı otomatik kategori seçimi hatası', error);
  }
}

// Teklifbul Rule v1.0 - Kategori önerisi ve stok araması birleştirildi (duplicate event listener sorunu çözüldü)
async function setupCategorySuggestionForItemName(textarea, lineNo, tr) {
  if (!textarea) return;

  let suggestionCardId = `itemCategorySuggestion_${lineNo}`;
  let debounceTimeout = null;
  let lastQuery = '';
  let stockDebounceTimeout = null;
  let lastStockQuery = '';

  // Teklifbul Rule v1.0 - Duplicate event listener önlemek için tek bir input listener
  textarea.addEventListener('input', (e) => {
    const text = e.target.value.trim();

    // Önce mevcut timeout'ları temizle
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
      debounceTimeout = null;
    }
    if (stockDebounceTimeout) {
      clearTimeout(stockDebounceTimeout);
      stockDebounceTimeout = null;
    }

    // Ürün ismi silindi - önerilen kategoriyi temizle
    if (text.length < 3) {
      removeSuggestionCard(suggestionCardId);
      // Eğer önceki öneri otomatik seçildiyse, kategoriyi kaldır
      const autoSelected = autoSelectedCategoriesByLine.get(lineNo);
      if (autoSelected) {
        removeAutoSelectedCategoryForLine(lineNo, autoSelected.categoryName);
      }
      lastQuery = '';
      lastStockQuery = '';
      return;
    }

    // Aynı sorguyu tekrar etme (hem kategori hem stok için)
    if (text === lastQuery && text === lastStockQuery) return;

    // Eğer metin değiştiyse önceki öneri kartını kaldır
    if (text !== lastQuery && lastQuery.length >= 3) {
      removeSuggestionCard(suggestionCardId);
      // Eğer önceki öneri otomatik seçildiyse, kategoriyi kaldır
      const autoSelected = autoSelectedCategoriesByLine.get(lineNo);
      if (autoSelected) {
        removeAutoSelectedCategoryForLine(lineNo, autoSelected.categoryName);
      }
    }

    // Kategori önerisi için debounce (800ms)
    if (text !== lastQuery) {
      debounceTimeout = setTimeout(async () => {
        const currentText = textarea.value.trim();
        // Textarea hala aynı metni içeriyorsa ve 3+ karakter varsa istek gönder
        if (currentText.length >= 3 && currentText === text) {
          lastQuery = currentText;
          await suggestCategoriesForItemName(currentText, suggestionCardId, textarea, lineNo);
        }
        debounceTimeout = null;
      }, 800); // 800ms debounce - kullanıcı yazmayı bitirdikten sonra
    }

    // Stok araması için debounce (500ms - daha hızlı)
    if (text !== lastStockQuery && tr) {
      stockDebounceTimeout = setTimeout(async () => {
        const currentText = textarea.value.trim();
        if (currentText.length >= 3 && currentText === text) {
          lastStockQuery = currentText;
          await searchStockByName(currentText, tr);
        }
        stockDebounceTimeout = null;
      }, 500);
    }
  });

  // Textarea'dan çıkınca öneri kartını gizle (opsiyonel)
  textarea.addEventListener('blur', () => {
    setTimeout(() => {
      const card = document.getElementById(suggestionCardId);
      if (card) {
        // Kullanıcı kart ile etkileşimde değilse gizle
        if (!card.matches(':hover')) {
          card.style.display = 'none';
        }
      }
    }, 200);
  });

  textarea.addEventListener('focus', () => {
    const card = document.getElementById(suggestionCardId);
    if (card && lastQuery.length >= 3) {
      card.style.display = 'block';
    }
  });
}

// Teklifbul Rule v1.0 - Ürün ismi için kategori önerisi
async function suggestCategoriesForItemName(text, cardId, textarea, lineNo) {
  try {
    // API çağrısı
    const { suggestCategories } = await import('/assets/js/services/category-suggest.js');
    const result = await suggestCategories(text);

    if (!result || result.suggestions.length === 0) {
      removeSuggestionCard(cardId);
      return;
    }

    // Öneri kartını göster/güncelle
    showItemNameSuggestionCard(result, cardId, textarea, lineNo);

    // Auto-select (skor ≥0.70) - Teklifbul Rule v1.0
    if (result.auto_select) {
      await autoSelectCategoryForItem(result.auto_select, text, lineNo);
    }

  } catch (error) {
    logger.warn('Item name category suggestion failed', error);
    // Hata durumunda sessizce devam et, kullanıcıyı rahatsız etme
  }
}

// Teklifbul Rule v1.0 - Ürün ismi için öneri kartı göster
function showItemNameSuggestionCard(result, cardId, textarea, lineNo) {
  // Mevcut kartı kaldır
  removeSuggestionCard(cardId);

  // Yeni kart oluştur
  const card = document.createElement('div');
  card.id = cardId;
  card.className = 'category-suggestion-card';
  card.style.cssText = `
        margin-top: 8px;
        padding: 12px;
        background: #f0f9ff;
        border: 1px solid #3b82f6;
        border-radius: 8px;
        font-size: 13px;
        position: relative;
        z-index: 10;
      `;

  let content = `<div style="font-weight: 600; margin-bottom: 8px; color: #1e40af;">
        💡 Kategori Önerileri (${result.suggestions.length})
      </div>`;

  // Top-3 öneri göster
  result.suggestions.slice(0, 3).forEach((suggestion, idx) => {
    const scorePercent = Math.round(suggestion.score * 100);
    const isHighConfidence = suggestion.score >= 0.70;
    const badgeColor = isHighConfidence ? '#10b981' : '#f59e0b';

    content += `<div style="margin-bottom: 8px; padding: 8px; background: white; border-radius: 6px; border-left: 3px solid ${badgeColor};">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-weight: 600; color: #1f2937;">${idx + 1}. ${suggestion.name}</span>
            <span style="font-size: 11px; color: ${badgeColor}; font-weight: 600;">${scorePercent}%</span>
          </div>
          ${suggestion.reasons && suggestion.reasons.length > 0 ? `
            <div style="font-size: 11px; color: #6b7280; margin-top: 4px;">
              Eşleşen: ${suggestion.reasons.slice(0, 3).join(', ')}
            </div>
          ` : ''}
          <button class="apply-category-btn" data-category="${suggestion.name}" data-line="${lineNo}"
                  style="margin-top: 6px; padding: 4px 10px; background: ${badgeColor}; color: white; 
                         border: none; border-radius: 4px; font-size: 11px; cursor: pointer;">
            ${isHighConfidence ? '✅ Otomatik Uygula' : 'Seç'}
          </button>
        </div>`;
  });

  // Kapat butonu
  content += `<button class="close-suggestion-btn" style="margin-top: 8px; padding: 4px 10px; background: #6b7280; 
                color: white; border: none; border-radius: 4px; font-size: 11px; cursor: pointer;">
        Kapat
      </button>`;

  card.innerHTML = content;

  // Textarea'nın hemen altına ekle (satır içinde)
  const td = textarea.closest('td');
  if (td) {
    td.style.position = 'relative';
    // Kartı textarea'nın altına ekle
    const row = textarea.closest('tr');
    if (row && row.nextSibling) {
      // Advanced row varsa ondan önce ekle
      row.insertAdjacentElement('afterend', card);
    } else {
      td.appendChild(card);
    }
  } else {
    textarea.parentElement.appendChild(card);
  }

  // Event listeners
  card.querySelectorAll('.apply-category-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const categoryName = btn.dataset.category;
      const queryText = textarea.value.trim();
      await applyCategorySuggestionForItem(categoryName, queryText, lineNo);
      removeSuggestionCard(cardId);
    });
  });

  card.querySelector('.close-suggestion-btn')?.addEventListener('click', () => {
    removeSuggestionCard(cardId);
  });
}

// Teklifbul Rule v1.0 - Ürün ismi için kategori otomatik seç
async function autoSelectCategoryForItem(categoryName, queryText, lineNo) {
  try {
    // Kategori chip sistemine ekle
    const categoryId = nameToCategoryId(categoryName);
    if (categoryId) {
      // Eğer bu satır için zaten bir otomatik seçim varsa, önce onu kaldır
      const existingAuto = autoSelectedCategoriesByLine.get(lineNo);
      if (existingAuto && existingAuto.categoryId !== categoryId) {
        removeAutoSelectedCategoryForLine(lineNo, existingAuto.categoryName);
      }

      const stats = createCategorySelectionStats();
      const added = tryAddCategoryChip(categoryId, { silent: true, stats });
      if (added) {
        // Bu satır için otomatik seçilen kategoriyi kaydet
        autoSelectedCategoriesByLine.set(lineNo, { categoryId, categoryName });

        renderChips();
        notifyCategorySelectionStats(stats);
        toast.success(`Kategori otomatik seçildi: ${categoryName}`);

        // Feedback kaydet
        try {
          const { saveCategoryFeedback } = await import('/assets/js/services/category-suggest.js');
          await saveCategoryFeedback({
            query: queryText || '',
            suggested_category_id: categoryId,
            chosen_category_id: categoryId,
            auto_selected: true
          });
        } catch (error) {
          logger.warn('Save feedback failed', error);
        }

        return true;
      }
    }
    return false;
  } catch (error) {
    logger.warn('Auto-select category failed', error);
    return false;
  }
}

// Teklifbul Rule v1.0 - Ürün ismi için kategori önerisini uygula
async function applyCategorySuggestionForItem(categoryName, queryText, lineNo) {
  try {
    // Kategori chip sistemine ekle
    const categoryId = nameToCategoryId(categoryName);
    if (categoryId) {
      const stats = createCategorySelectionStats();
      const added = tryAddCategoryChip(categoryId, { silent: false, stats });
      if (added) {
        renderChips();
        notifyCategorySelectionStats(stats);
        toast.success(`Kategori eklendi: ${categoryName}`);
      }
    } else {
      toast.warn(`Kategori bulunamadı: ${categoryName}`);
    }

    // Feedback kaydet
    try {
      const { saveCategoryFeedback } = await import('/assets/js/services/category-suggest.js');
      const categoryId = nameToCategoryId(categoryName);
      await saveCategoryFeedback({
        query: queryText || '',
        suggested_category_id: categoryId || null,
        chosen_category_id: categoryId || null,
        auto_selected: false
      });
    } catch (error) {
      logger.warn('Save feedback failed', error);
    }
  } catch (error) {
    logger.error('Apply category suggestion failed', error);
    toast.error(MESSAGES.ERROR_DEMAND_CATEGORY_ADD);
  }
}

// Teklifbul Rule v1.0 - Belirli bir satır için otomatik seçilen kategoriyi kaldır
function removeAutoSelectedCategoryForLine(lineNo, categoryName) {
  const autoSelected = autoSelectedCategoriesByLine.get(lineNo);
  if (!autoSelected) return;

  const categoryId = autoSelected.categoryId;

  // Kategori başka satırlar tarafından da kullanılıyor mu kontrol et
  let usedByOtherLines = false;
  for (const [otherLineNo, otherAuto] of autoSelectedCategoriesByLine.entries()) {
    if (otherLineNo !== lineNo && otherAuto.categoryId === categoryId) {
      usedByOtherLines = true;
      break;
    }
  }

  // Eğer başka satırlar kullanmıyorsa ve kategori chip'lerde varsa kaldır
  if (!usedByOtherLines && chips.has(categoryId)) {
    chips.delete(categoryId);
    renderChips();
    toast.info(`Kategori kaldırıldı: ${categoryName}`);
  }

  // Bu satır için kaydı temizle
  autoSelectedCategoriesByLine.delete(lineNo);
}

// Teklifbul Rule v1.0 - Satır silindiğinde otomatik seçilen kategoriyi temizle
function cleanupAutoSelectedCategoryForDeletedLine(lineNo) {
  const autoSelected = autoSelectedCategoriesByLine.get(lineNo);
  if (autoSelected) {
    removeAutoSelectedCategoryForLine(lineNo, autoSelected.categoryName);
  }
}

// Helper: Add row with data
function addRow(data = {}) {
  lineCounter++;
  const tr = document.createElement("tr");
  tr.dataset.lineNo = data.lineNo || lineCounter;
  const publishToMarketChecked = data.publishToMarket === true ? 'checked' : '';
  const publishToMarketDisabled = userPlanLimit === 0 ? 'disabled' : '';
  const publishToMarketTitle = userPlanLimit === 0 ? 'Premium ile açılır' : '';
  // Teklifbul Rule v1.0 - XSS Protection - Kullanıcı girdilerini sanitize et
  const safeSku = DOMPurify.sanitize(data.sku || "", { ALLOWED_TAGS: [] });
  const safeName = DOMPurify.sanitize(data.name || "", { ALLOWED_TAGS: [] });
  const safeBrandModel = DOMPurify.sanitize(data.brandModel || "", { ALLOWED_TAGS: [] });

  tr.innerHTML = DOMPurify.sanitize(`
        <td>${data.lineNo || lineCounter}</td>
        <td><input type="text" class="sku" placeholder="Stok Kodu" value="${safeSku}" /></td>
        <td><textarea class="itemName auto-resize" placeholder="Malzeme tanımı" required rows="2" data-min-height="32" data-max-height="120">${safeName}</textarea></td>
        <td><input type="text" class="brandModel" placeholder="Marka/Model" value="${safeBrandModel}" /></td>
        <td><input type="number" class="qty" min="1" step="0.01" placeholder="Miktar" required value="${data.qty || ""}" /></td>
        <td><input type="text" class="unit" list="unitList" placeholder="Birim" required value="${data.unit || ""}" /></td>
        <td><input type="number" class="stockQty" min="0" step="0.01" placeholder="Depo" value="${data.stockQty || ""}" /></td>
        <td><input type="number" class="targetPrice" min="0" step="0.01" placeholder="Hedef" value="${data.targetPrice || ""}" /></td>
        <td>
          <input type="file" class="itemImage" accept="image/*" style="max-width:150px;">
          <input type="hidden" class="itemImageData" value="${data.productImage || ""}">
          <div class="itemImagePreview" style="font-size:11px;color:#6b7280;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${data.productImage ? 'Seçildi' : 'Seçilmedi'}</div>
        </td>
        <td><input type="date" class="itemDueDate" value="${data.itemDueDate || el("dueDate").value || ""}" /></td>
        <td style="text-align:center;">
          <input type="checkbox" class="publishToMarket" ${publishToMarketChecked} ${publishToMarketDisabled} title="${publishToMarketTitle}" />
        </td>
        <td>
          <button type="button" class="delBtn btn-sm">×</button>
          <input type="hidden" class="featuresJson" value='${JSON.stringify(Array.isArray(data.ozellikler) ? data.ozellikler : [])}'>
          <input type="hidden" class="certsJson" value='${JSON.stringify(Array.isArray(data.kaliteSertifika) ? data.kaliteSertifika : [])}'>
          <input type="hidden" class="altAcceptVal" value='${typeof data.alternatifKabul === "boolean" ? String(data.alternatifKabul) : ""}'>
        </td>
      `);
  itemsBody.appendChild(tr);

  // Advanced editor row (collapsible) tied to this item row
  const advTr = document.createElement('tr');
  advTr.dataset.parent = tr.dataset.lineNo;
  advTr.innerHTML = `
        <td colspan="12">
          <details style="margin-top:6px;">
            <summary style="cursor:pointer; font-size:13px; font-weight:600;">Varyant / Alternatif / Sertifika</summary>
            <div style="display:grid; grid-template-columns: 1fr 0.6fr 0.6fr; gap:12px; margin-top:8px;">
              <div>
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
                  <label style="font-size:12px; color:#6b7280;">Varyant / Özellikler</label>
                  <button type="button" class="btn-sm addPair">+ Satır</button>
                </div>
                <div class="pairs"></div>
                <p style="font-size:11px; color:#6b7280; margin-top:4px;">Renk, ölçü gibi teknik/lojistik özellikleri anahtar–değer olarak ekleyin.</p>
              </div>
              <div>
                <label style="font-size:12px; color:#6b7280; display:block; margin-bottom:6px;">Alternatif Ürün Kabulü?</label>
                <div style="display:flex; align-items:center; gap:12px;">
                  <label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="radio" name="alt-${tr.dataset.lineNo}" class="altYes"> Evet</label>
                  <label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="radio" name="alt-${tr.dataset.lineNo}" class="altNo"> Hayır</label>
                </div>
                <p style="font-size:11px; color:#6b7280; margin-top:4px;">Evet seçilirse tedarikçi teknik olarak uyumlu alternatif önerebilir.</p>
              </div>
              <div>
                <label style="font-size:12px; color:#6b7280; display:block;">Kalite / Sertifika</label>
                <div style="display:flex; gap:6px; margin-top:4px;">
                  <input type="text" class="certInput" placeholder="ISO 9001, CE, RoHS… (Enter)" style="border:1px solid #d1d5db; border-radius:4px; padding:4px 8px; flex:1;" />
                  <button type="button" class="btn-sm addCert">Ekle</button>
                </div>
                <div class="certTags" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px;"></div>
                <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px;">
                  ${["ISO 9001", "ISO 14001", "CE", "RoHS", "REACH"].map(s => `<button type="button" class="btn-sm quickCert" data-cert="${s}" style="display:inline-block;">${s}</button>`).join('')}
                </div>
              </div>
            </div>
          </details>
        </td>`;
  itemsBody.appendChild(advTr);
  recalcCategoryCompatibility(true);

  // Initialize auto-resize for new textarea
  reinitAutoResize(tr);

  // Teklifbul Rule v1.0 - Ürün ismi için kategori önerisi ve stok araması (birleştirildi)
  const itemNameTextarea = tr.querySelector('.itemName');
  if (itemNameTextarea) {
    setupCategorySuggestionForItemName(itemNameTextarea, tr.dataset.lineNo, tr);
  }

  // Teklifbul Rule v1.0 - Stok kodu için stok kontrolü
  const skuInput = tr.querySelector('.sku');
  if (skuInput) {
    setupStockSearchForSku(skuInput, tr);
  }

  // Görsel seçimi
  const fileInput = tr.querySelector('.itemImage');
  const hidden = tr.querySelector('.itemImageData');
  const preview = tr.querySelector('.itemImagePreview');
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error(MESSAGES.ERROR_FILE_IMAGE); e.target.value = ''; return; }
    if (file.size > 5 * 1024 * 1024) { toast.error(MESSAGES.ERROR_FILE_SIZE_MAX); e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => { hidden.value = reader.result; preview.textContent = file.name; };
    reader.readAsDataURL(file);
  });

  // Teklifbul Rule v1.0 - Ana İlanda Göster checkbox limit kontrolü
  const publishCheckbox = tr.querySelector('.publishToMarket');
  if (publishCheckbox) {
    publishCheckbox.addEventListener('change', function () {
      if (this.checked) {
        // Seçili checkbox sayısını kontrol et
        const selectedCount = itemsBody.querySelectorAll('.publishToMarket:checked').length;
        if (selectedCount > userPlanLimit) {
          // Limit aşıldı, checkbox'ı geri al
          this.checked = false;
          toast.error(`Paketinizde en fazla ${userPlanLimit} kalemi ana ilanda gösterebilirsiniz.`);
        }
      }
    });
  }

  // Delete row
  tr.querySelector(".delBtn").onclick = () => {
    const lineNo = tr.dataset.lineNo;
    // Teklifbul Rule v1.0 - Satır silindiğinde otomatik seçilen kategoriyi temizle
    cleanupAutoSelectedCategoryForDeletedLine(lineNo);
    advTr.remove();
    tr.remove();
    recalcCategoryCompatibility(true);
  };

  // Advanced editors bindings
  const featuresHidden = tr.querySelector('.featuresJson');
  const certsHidden = tr.querySelector('.certsJson');
  const altHidden = tr.querySelector('.altAcceptVal');

  let features = Array.isArray(data.ozellikler) ? data.ozellikler.filter(p => (p.key || '').trim() || (p.value || '').trim()) : [];
  let certs = Array.isArray(data.kaliteSertifika) ? Array.from(new Set(data.kaliteSertifika)) : [];
  let alt = typeof data.alternatifKabul === 'boolean' ? data.alternatifKabul : false;
  featuresHidden.value = JSON.stringify(features);
  certsHidden.value = JSON.stringify(certs);
  altHidden.value = String(alt);

  const pairsHost = advTr.querySelector('.pairs');
  const addPairBtn = advTr.querySelector('.addPair');
  const altYes = advTr.querySelector('.altYes');
  const altNo = advTr.querySelector('.altNo');
  const certInput = advTr.querySelector('.certInput');
  const certTagsHost = advTr.querySelector('.certTags');
  const addCertBtn = advTr.querySelector('.addCert');
  const quickCertBtns = advTr.querySelectorAll('.quickCert');

  function syncFeatures() {
    const cleaned = features.filter(p => (p.key || '').trim() || (p.value || '').trim());
    featuresHidden.value = JSON.stringify(cleaned);
  }
  function renderPairs() {
    pairsHost.innerHTML = '';
    features.forEach((r, idx) => {
      const rowDiv = document.createElement('div');
      rowDiv.style.display = 'flex'; rowDiv.style.gap = '6px'; rowDiv.style.marginBottom = '6px';
      rowDiv.innerHTML = `
            <input class="adv-input adv-key pairKey" placeholder="Özellik (renk)" value="${r.key || ''}" style="border:1px solid #d1d5db; border-radius:4px; padding:4px 8px;" />
            <input class="adv-input adv-val pairVal" placeholder="Değer (mavi)" value="${r.value || ''}" style="border:1px solid #d1d5db; border-radius:4px; padding:4px 8px; flex:1;" />
            <button type="button" class="btn-sm del" style="display:inline-block;">Sil</button>`;
      const keyEl = rowDiv.querySelector('.pairKey');
      const valEl = rowDiv.querySelector('.pairVal');
      const delEl = rowDiv.querySelector('.del');
      keyEl.addEventListener('input', () => { features[idx].key = keyEl.value; syncFeatures(); });
      valEl.addEventListener('input', () => { features[idx].value = valEl.value; syncFeatures(); });
      delEl.addEventListener('click', () => { features.splice(idx, 1); syncFeatures(); renderPairs(); });
      pairsHost.appendChild(rowDiv);
    });
  }
  addPairBtn.addEventListener('click', () => { features.push({ key: '', value: '' }); renderPairs(); syncFeatures(); });
  renderPairs();

  function syncAlt(val) { alt = val; altHidden.value = String(alt); }
  if (alt) altYes.checked = true; else altNo.checked = true;
  altYes.addEventListener('change', () => syncAlt(true));
  altNo.addEventListener('change', () => syncAlt(false));

  function syncCerts() { certsHidden.value = JSON.stringify(Array.from(new Set(certs))); }
  function renderCerts() {
    certTagsHost.innerHTML = '';
    Array.from(new Set(certs)).forEach(t => {
      const tag = document.createElement('span');
      tag.style.fontSize = '12px'; tag.style.padding = '2px 8px'; tag.style.border = '1px solid #1E40AF'; tag.style.borderRadius = '12px';
      tag.style.display = 'inline-flex'; tag.style.alignItems = 'center'; tag.style.gap = '6px'; tag.style.background = '#2563EB'; tag.style.color = '#fff';
      tag.textContent = t;
      const rm = document.createElement('button'); rm.type = 'button'; rm.textContent = '×';
      rm.style.color = '#dc2626'; rm.style.fontSize = '14px'; rm.style.marginLeft = '0';
      // beyaz zeminli, kırmızı X daha görünür olsun
      rm.style.background = '#ffffff'; rm.style.border = '1px solid #fca5a5'; rm.style.borderRadius = '50%'; rm.style.width = '18px'; rm.style.height = '18px'; rm.style.display = 'inline-flex'; rm.style.alignItems = 'center'; rm.style.justifyContent = 'center'; rm.style.padding = '0'; rm.style.lineHeight = '1'; rm.style.cursor = 'pointer'; rm.style.fontWeight = '800';
      rm.addEventListener('click', () => { certs = certs.filter(x => x !== t); syncCerts(); renderCerts(); });
      tag.appendChild(rm);
      certTagsHost.appendChild(tag);
    });
  }
  function tryAddCert(v) { const s = (v || '').trim(); if (!s) return; if (!certs.includes(s)) certs.push(s); certInput.value = ''; syncCerts(); renderCerts(); }
  certInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); tryAddCert(certInput.value); } });
  addCertBtn.addEventListener('click', () => tryAddCert(certInput.value));
  quickCertBtns.forEach(btn => btn.addEventListener('click', () => tryAddCert(btn.getAttribute('data-cert'))));
  renderCerts();
}

// Expose import preview applier for inline script
window.applyImportPreview = function (preview) {
  try {
    const demandValues = preview?.demand || {};
    const demandMeta = preview?.demandMeta || {};
    const itemMeta = Array.isArray(preview?.itemMeta) ? preview.itemMeta : [];
    const warnings = Array.isArray(preview?.warnings) ? preview.warnings : [];

    const normDate = (s) => {
      if (!s) return '';
      const str = String(s).trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
      const m = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
      if (m) { const dd = m[1].padStart(2, '0'), mm = m[2].padStart(2, '0'); let yy = m[3]; if (yy.length === 2) yy = '20' + yy; return `${yy}-${mm}-${dd}`; }
      return '';
    };

    const setVal = (id, val) => {
      const elx = document.getElementById(id);
      if (!elx) return;
      if (elx instanceof HTMLInputElement || elx instanceof HTMLTextAreaElement) {
        elx.value = val != null ? String(val) : '';
      }
    };

    const toggleReview = (id, meta) => {
      const elx = document.getElementById(id);
      if (!elx) return;
      if (meta?.needsReview) elx.classList.add('import-review'); else elx.classList.remove('import-review');
    };

    // Teklifbul Rule v1.0 - Şablon alanları eşleştirmesi
    // Object kontrolü: Eğer value object ise (value, score gibi), sadece value'yu al
    const getStringValue = function (val) {
      if (!val) return '';
      if (typeof val === 'object' && 'value' in val) {
        return String(val.value || '');
      }
      return String(val);
    };

    // Debug: Tüm demandValues'ı logla
    logger.info('Demand values debug', {
      demandValues,
      biddingMode: demandValues.biddingMode,
      categories: demandValues.categories,
      deliveryMethod: demandValues.deliveryMethod,
      deliveryType: demandValues.deliveryType
    });

    setVal('title', getStringValue(demandValues.title) || getStringValue(preview?.demand?.title) || '');
    // parseTwoSheetProfile'da requesterCompany olarak geliyor, requester ile uyumlu hale getir
    const requesterValue = getStringValue(demandValues.requesterCompany) || getStringValue(demandValues.requester);
    setVal('requester', requesterValue || '');
    setVal('demandDate', normDate(getStringValue(demandValues.demandDate)));
    setVal('dueDate', normDate(getStringValue(demandValues.dueDate)));
    setVal('currency', getStringValue(demandValues.currency) || 'TRY');
    if (demandValues.note) setVal('note', getStringValue(demandValues.note));

    // Şantiye (A5 → B5)
    if (demandValues.siteName) {
      setVal('siteName', getStringValue(demandValues.siteName));
    }

    // Alım Yeri (İl) (A12 → B12) - Teklifbul Rule v1.0: Eksikti, eklendi
    if (demandValues.purchaseLocation) {
      const purchaseLocationValue = getStringValue(demandValues.purchaseLocation).trim();
      if (purchaseLocationValue) {
        const purchaseLocationInput = document.getElementById('purchaseLocation');
        if (purchaseLocationInput) {
          purchaseLocationInput.value = purchaseLocationValue;
          // Dropdown list'te varsa seçili hale getir
          const provinceList = document.getElementById('provinceList');
          if (provinceList) {
            const option = Array.from(provinceList.options).find(opt =>
              opt.value.toLowerCase() === purchaseLocationValue.toLowerCase() ||
              opt.text.toLowerCase() === purchaseLocationValue.toLowerCase()
            );
            if (option) {
              purchaseLocationInput.value = option.value;
            }
          }
        }
      }
    }

    // Teslimat Adresi (A9 → B9) - Varsa nakliye dahil demektir
    if (demandValues.deliveryAddress) {
      const deliveryTextarea = document.getElementById('deliveryAddress');
      if (deliveryTextarea) {
        deliveryTextarea.value = getStringValue(demandValues.deliveryAddress);
      }
    }

    // Teslim Şekli (A8 → B8) - Nakliye Dahil/Hariç/Özel Teslimat
    // Excel'den gelen değerleri sistem değerlerine eşleştir
    const deliveryTypeValue = getStringValue(demandValues.deliveryType) || getStringValue(demandValues.deliveryMethod);
    logger.info('Teslim Şekli işleniyor', { deliveryTypeValue, raw: demandValues.deliveryMethod, rawType: demandValues.deliveryType });

    if (deliveryTypeValue) {
      // Emoji'leri ve fazla boşlukları temizle
      const deliveryValue = deliveryTypeValue
        .replace(/[🚚📦✏️]/g, '') // Emoji'leri kaldır
        .replace(/\s+/g, ' ') // Çoklu boşlukları tek boşluğa çevir
        .trim() // Başta ve sonda boşlukları kaldır
        .toLowerCase();

      logger.info('Teslim Şekli temizlendi', { original: deliveryTypeValue, cleaned: deliveryValue });

      let deliveryMethodValue = null;

      // Excel'den gelen değerleri sistem değerlerine eşleştir
      if (deliveryValue.includes('nakliye dahil') || deliveryValue === 'nakliye dahil') {
        deliveryMethodValue = 'nakliye_dahil';
      } else if (deliveryValue.includes('nakliye hariç') || deliveryValue === 'nakliye hariç') {
        deliveryMethodValue = 'nakliye_haric';
      } else if (deliveryValue.includes('özel') || deliveryValue.includes('özel teslimat')) {
        deliveryMethodValue = 'custom';
      }

      logger.info('Teslim Şekli eşleştirme sonucu', { deliveryMethodValue, deliveryValue });

      if (deliveryMethodValue) {
        const radio = document.querySelector(`input[name="deliveryMethod"][value="${deliveryMethodValue}"]`);
        if (radio) {
          radio.checked = true;
          logger.info('Teslim Şekli radio seçildi', { value: deliveryMethodValue });

          // Radio button seçildiğinde setupDeliveryMethodHandlers mantığını manuel olarak tetikle
          const customContainer = document.getElementById('customDeliveryContainer');
          const customDeliveryInput = document.getElementById('customDelivery');
          const customInput = document.getElementById('deliveryMethodCustom');

          if (deliveryMethodValue === 'custom') {
            // Özel teslimat seçildiyse
            if (customContainer) {
              customContainer.style.display = 'block';
            }
            if (customDeliveryInput) {
              customDeliveryInput.required = true;
              // Özel teslimat açıklamasını yaz (emoji'leri temizle)
              const cleanValue = deliveryTypeValue.replace(/[🚚📦✏️]/g, '').replace(/özel\s*teslimat/gi, '').trim();
              customDeliveryInput.value = cleanValue || deliveryTypeValue.replace(/[🚚📦✏️]/g, '').trim();
            }
            if (customInput) {
              customInput.value = '';
              customInput.placeholder = 'Özel teslimat açıklamasını yazın';
            }
            logger.info('Özel teslimat seçildi, textarea açıldı', { customValue: customDeliveryInput?.value });
          } else {
            // Nakliye Dahil veya Nakliye Hariç seçildiyse
            if (customContainer) {
              customContainer.style.display = 'none';
            }
            if (customDeliveryInput) {
              customDeliveryInput.required = false;
              customDeliveryInput.value = '';
            }
            if (customInput) {
              // Seçilen teslim şeklinin ismini yaz
              if (deliveryMethodValue === 'nakliye_dahil') {
                customInput.value = 'Nakliye Dahil';
              } else if (deliveryMethodValue === 'nakliye_haric') {
                customInput.value = 'Nakliye Hariç';
              }
              customInput.placeholder = 'Teslim şeklini elle yazın';
            }
            logger.info('Teslim şekli input dolduruldu', { value: customInput?.value, method: deliveryMethodValue });
          }
        } else {
          logger.warn('Teslim Şekli radio bulunamadı', { value: deliveryMethodValue, availableRadios: Array.from(document.querySelectorAll('input[name="deliveryMethod"]')).map(r => r.value) });
        }
      } else {
        logger.warn('Teslim Şekli eşleştirilemedi', { deliveryValue, deliveryTypeValue });
      }
    }

    // Ödeme Şartları (A14 → B14)
    if (demandValues.paymentTerms) {
      setVal('paymentTerms', getStringValue(demandValues.paymentTerms));
    }

    // Talep Tipi (A15 → B15) - Gizli/Açık/Hibrit
    // Excel'den gelen değerleri sistem değerlerine eşleştir
    logger.info('Talep Tipi kontrol ediliyor', {
      biddingMode: demandValues.biddingMode,
      exists: !!demandValues.biddingMode,
      type: typeof demandValues.biddingMode,
      stringValue: getStringValue(demandValues.biddingMode)
    });
    if (demandValues.biddingMode) {
      const biddingModeRaw = getStringValue(demandValues.biddingMode);
      logger.info('Talep Tipi işleniyor', { biddingModeRaw, raw: demandValues.biddingMode });

      // Parantez içindeki metinleri ve fazla boşlukları temizle
      const biddingModeValue = biddingModeRaw.trim()
        .replace(/\s*\([^)]*\)/g, '') // Parantez içindeki metinleri kaldır
        .replace(/\s+/g, ' ') // Çoklu boşlukları tek boşluğa çevir
        .toLowerCase();

      logger.info('Talep Tipi temizlendi', { original: biddingModeRaw, cleaned: biddingModeValue });

      let biddingModeSystemValue = null;

      // Excel'den gelen değerleri sistem değerlerine eşleştir
      if (biddingModeValue.includes('gizli') || biddingModeValue === 'gizli' || biddingModeValue.includes('secret')) {
        biddingModeSystemValue = 'secret';
      } else if (biddingModeValue.includes('açık') || biddingModeValue === 'açık' || biddingModeValue.includes('open')) {
        biddingModeSystemValue = 'open';
      } else if (biddingModeValue.includes('hibrit') || biddingModeValue === 'hibrit' || biddingModeValue.includes('hybrid')) {
        biddingModeSystemValue = 'hybrid';
      }

      logger.info('Talep Tipi eşleştirme sonucu', { biddingModeSystemValue, biddingModeValue });

      if (biddingModeSystemValue) {
        const radio = document.querySelector(`input[name="biddingMode"][value="${biddingModeSystemValue}"]`);
        if (radio) {
          radio.checked = true;
          logger.info('Talep Tipi radio seçildi', { value: biddingModeSystemValue });
        } else {
          logger.warn('Talep Tipi radio bulunamadı', { value: biddingModeSystemValue, availableRadios: Array.from(document.querySelectorAll('input[name="biddingMode"]')).map(r => r.value) });
        }
      } else {
        logger.warn('Talep Tipi eşleştirilemedi', { biddingModeValue, biddingModeRaw });
      }
    }

    // Öncelik (A17 → B17) - Fiyat/Hız/Kalite
    if (demandValues.priority) {
      setVal('priority', getStringValue(demandValues.priority));
    }

    // Onaylayan (A18 → B18) - Eğer boşsa kullanıcı adı kullanılır
    if (demandValues.approver) {
      setVal('approver', getStringValue(demandValues.approver));
    }

    // Fatura Adresi (A10 → B10) - Sistem otomatik kullanır, gösterilebilir
    // Not: Fatura adresi genellikle sistem ayarlarından alınır, burada sadece gösterim için

    // Kategoriler (A21 → B21) - "Tüm Tedarikçi Gruplarım (25)" kontrolü
    logger.info('Kategoriler kontrol ediliyor', {
      categories: demandValues.categories,
      exists: !!demandValues.categories,
      type: typeof demandValues.categories,
      stringValue: getStringValue(demandValues.categories)
    });
    if (demandValues.categories) {
      const categoriesValue = getStringValue(demandValues.categories).trim();
      logger.info('Kategoriler işleniyor', { categoriesValue });

      if (categoriesValue === 'TÜM_KATEGORILER' || /tüm.*tedarikçi.*grup|all.*supplier.*group|hepsi/i.test(categoriesValue)) {
        // Tüm kategorileri seç - tüm kategori grupları butonlarına tıkla
        logger.info('Tüm kategoriler seçilecek', { categoriesValue });
        setTimeout(() => {
          const allGroupButtons = document.querySelectorAll('.group-btn');
          allGroupButtons.forEach(btn => {
            // Buton zaten seçili değilse tıkla
            const isSelected = btn.style.background === 'rgb(16, 185, 129)' || btn.style.background === '#10b981';
            if (!isSelected) {
              btn.click();
            }
          });
          logger.info('Tüm kategori grupları seçildi', { count: allGroupButtons.length });
        }, 500);
      } else {
        // Normal kategori değeri - kategori isimlerine göre grup butonlarını bul ve tıkla
        logger.info('Kategoriler eşleştirilecek', { categoriesValue });
        // Excel'den gelen kategori isimlerini parse et (parantez içindeki sayıları kaldır)
        const categoryNames = categoriesValue.split(/[,;]/).map(s => {
          // "İnşaat & Yapı (3)" -> "İnşaat & Yapı"
          return s.trim().replace(/\s*\([^)]*\)\s*$/, '').trim();
        }).filter(Boolean);

        logger.info('Kategori isimleri parse edildi', { categoryNames, original: categoriesValue });

        if (categoryNames.length > 0) {
          setTimeout(() => {
            // Kategori grupları butonlarını bul
            const groupButtons = document.querySelectorAll('.group-btn');
            logger.info('Kategori grup butonları bulundu', { count: groupButtons.length, buttons: Array.from(groupButtons).map(b => ({ text: b.textContent, title: b.getAttribute('title') })) });

            categoryNames.forEach(catName => {
              // Her grup butonunun title'ında kategori isimleri var
              const matchingButton = Array.from(groupButtons).find(btn => {
                const title = btn.getAttribute('title') || '';
                const buttonText = btn.textContent || '';
                // Button text'ten parantez içindeki sayıyı kaldır
                const cleanButtonText = buttonText.replace(/\s*\([^)]*\)\s*$/, '').trim();
                // Title'dan "Kategoriler: " prefix'ini kaldır
                const cleanTitle = title.replace(/^kategoriler:\s*/i, '').trim();

                // Eşleştirme: Grup ismi veya içindeki kategori isimleri
                const catNameLower = catName.toLowerCase().trim();
                const cleanButtonTextLower = cleanButtonText.toLowerCase().trim();
                const cleanTitleLower = cleanTitle.toLowerCase().trim();

                // 1. Grup ismi tam eşleşme
                if (cleanButtonTextLower === catNameLower) {
                  logger.info('Kategori tam eşleşme (grup ismi)', { catName, buttonText: cleanButtonText });
                  return true;
                }

                // 2. Grup ismi kısmi eşleşme (her iki yönde)
                if (cleanButtonTextLower.includes(catNameLower) || catNameLower.includes(cleanButtonTextLower)) {
                  logger.info('Kategori kısmi eşleşme (grup ismi)', { catName, buttonText: cleanButtonText });
                  return true;
                }

                // 3. Title'daki kategori isimlerinde eşleşme
                if (cleanTitleLower.includes(catNameLower)) {
                  logger.info('Kategori title eşleşmesi', { catName, title: cleanTitle });
                  return true;
                }

                // 4. Title'daki kategori isimlerinden birini içeriyor mu?
                const titleCategories = cleanTitle.split(',').map(c => c.trim().toLowerCase());
                const matchedCategory = titleCategories.find(tc => {
                  return tc.includes(catNameLower) || catNameLower.includes(tc) || tc === catNameLower;
                });
                if (matchedCategory) {
                  logger.info('Kategori title kategorilerinden eşleşme', { catName, matchedCategory, title: cleanTitle });
                  return true;
                }

                // 5. Ampersand (&) karakterini "ve" ile değiştirip tekrar dene
                const catNameWithVe = catNameLower.replace(/&/g, 've').replace(/\s+/g, ' ');
                const buttonTextWithVe = cleanButtonTextLower.replace(/&/g, 've').replace(/\s+/g, ' ');
                if (buttonTextWithVe === catNameWithVe || buttonTextWithVe.includes(catNameWithVe) || catNameWithVe.includes(buttonTextWithVe)) {
                  logger.info('Kategori eşleşmesi (ampersand düzeltmesi)', { catName, buttonText: cleanButtonText });
                  return true;
                }

                return false;
              });

              if (matchingButton) {
                // Buton zaten seçili değilse tıkla
                const isSelected = matchingButton.style.background === 'rgb(16, 185, 129)' || matchingButton.style.background === '#10b981';
                if (!isSelected) {
                  matchingButton.click();
                  logger.info('Kategori grubu seçildi', { catName, buttonText: matchingButton.textContent, title: matchingButton.getAttribute('title') });
                } else {
                  logger.info('Kategori grubu zaten seçili', { catName, buttonText: matchingButton.textContent });
                }
              } else {
                logger.warn('Kategori grubu bulunamadı', {
                  catName,
                  availableButtons: Array.from(groupButtons).map(b => ({
                    text: b.textContent,
                    title: b.getAttribute('title')
                  }))
                });
              }
            });
          }, 500);
        }
      }
    }

    toggleReview('title', demandMeta.title);
    toggleReview('requester', demandMeta.requester);
    toggleReview('demandDate', demandMeta.demandDate);
    toggleReview('dueDate', demandMeta.dueDate);
    toggleReview('currency', demandMeta.currency);
    toggleReview('siteName', demandMeta.siteName);
    toggleReview('deliveryAddress', demandMeta.deliveryAddress);

    if (warnings.length) {
      toast.warn(`${MESSAGES.WARN_IMPORT_WARNINGS_HEADING}\n${warnings.join('\n')}`);
    }

    if (Array.isArray(preview?.items)) {
      itemsBody.innerHTML = '';
      lineCounter = 0;
      let addedCount = 0;

      preview.items.forEach((it, idx) => {
        // Teklifbul Rule v1.0 - parseTwoSheetProfile formatı desteği
        // Hem yeni format (stockCode, requestedDate) hem eski format (model, deliveryDate) destekleniyor
        const itemName = it.itemName || it.name || '';
        const brand = it.brand || '';
        const model = it.model || '';
        const qty = typeof it.qty === 'number' ? it.qty : (parseFloat(String(it.qty || '')) || '');
        const unit = it.unit || '';
        const unitPriceExcl = typeof it.unitPriceExcl === 'number' ? it.unitPriceExcl : (parseFloat(String(it.unitPriceExcl || '')) || '');
        const deliveryDate = it.deliveryDate || it.requestedDate || '';

        // Brand/Model birleştir
        const brandModel = [brand, model].filter(Boolean).join(' ');

        // Teklifbul Rule v1.0 - Stok Kodu eklendi
        const sku = it.sku || it.stockCode || '';

        const data = {
          name: itemName,
          sku: sku, // Teklifbul Rule v1.0 - Stok Kodu eklendi
          qty: qty,
          unit: unit,
          brandModel: brandModel,
          targetPrice: unitPriceExcl,
          itemDueDate: deliveryDate ? normDate(deliveryDate) : ''
        };

        if (data.name && (data.qty || data.unit)) {
          const beforeCount = itemsBody.children.length;
          addRow(data);
          const rowsAdded = itemsBody.children.length - beforeCount;
          if (rowsAdded >= 2) {
            addedCount++;
            const detailRow = itemsBody.lastElementChild;
            const mainRow = detailRow?.previousElementSibling;
            const review = itemMeta[idx]?.needsReview;
            if (review) {
              mainRow?.classList.add('import-review');
            } else {
              mainRow?.classList.remove('import-review');
            }
          }
        }
      });

      logger.info('Kalemler forma eklendi', {
        totalItems: preview.items.length,
        addedItems: addedCount
      });
    } else {
      logger.warn('Önizleme verilerinde kalem bulunamadı');
    }
  } catch (e) { logger.error('applyImportPreview error', e); toast.error(MESSAGES.ERROR_PREVIEW_APPLY); }
};

// Hariç tut alanı kaldırıldı

// Helper: Convert Firestore Timestamp to datetime-local format
function timestampToDatetimeLocal(timestamp) {
  if (!timestamp) return "";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Helper: Convert datetime-local to Firestore Timestamp
function datetimeLocalToTimestamp(datetimeStr) {
  if (!datetimeStr) return null;
  return new Date(datetimeStr);
}

// toSlug already defined above as function for hoisting support

// SATFK is auto-generated by Cloud Function

// Category Groups Management - moved to new implementation below

// === Kategori Grubu Oluştur Sihirbazı & Grup Render ===

// Ekranda açık tutulan grupları hatırlamak için
const expandedGroups = new Set(); // groupId => açık

// ==== Grupları ekranda göster ve tıkla-aç/kapat ====

async function loadCategoryGroups() {
  try {
    const userGroups = await listGroupsForUser(user.uid);

    // Varsayılan gruplar (hard-coded) - 25 kategori mantıklı gruplara ayrıldı
    const defaultGroups = [
      {
        name: "İnşaat & Yapı",
        categories: ["İnşaat Malzemeleri", "Hırdavat", "Boya"],
        id: "default-insaat",
        isDefault: true
      },
      {
        name: "Elektrik & Elektronik",
        categories: ["Elektrik", "Elektronik", "Aydınlatma", "Alçak/Orta Gerilim", "Otomasyon (PLC/SCADA)"],
        id: "default-elektrik",
        isDefault: true
      },
      {
        name: "Makine & İmalat",
        categories: ["Makine-İmalat", "Sac/Metal", "Kaynak & Sarf", "Rulman & Güç Aktarım", "Otomotiv Yan Sanayi"],
        id: "default-makine",
        isDefault: true
      },
      {
        name: "Kimya & Plastik",
        categories: ["Kimyasal", "Plastik", "Ambalaj"],
        id: "default-kimya",
        isDefault: true
      },
      {
        name: "Güvenlik & Sağlık",
        categories: ["İş Güvenliği", "Yangın Güvenliği", "HVAC"],
        id: "default-guvenlik",
        isDefault: true
      },
      {
        name: "Temizlik & Bakım",
        categories: ["Temizlik"],
        id: "default-temizlik",
        isDefault: true
      },
      {
        name: "Hizmetler & Diğer",
        categories: ["Gıda", "Hizmet", "Lojistik", "Ekipman Kiralama", "Mobilya", "Peyzaj & Bahçe", "Tesisat", "Marangoz & Ahşap İşleri", "Akaryakıt & Yağlar"],
        id: "default-hizmet",
        isDefault: true
      }
    ];

    // Kullanıcı grupları + varsayılan gruplar
    const allGroups = [...defaultGroups, ...userGroups];

    // Grup butonlarını render et
    renderGroupButtonsFromData(allGroups);
  } catch (error) {
    logger.error('Grup listesi yüklenemedi', error);
  }
}

function renderGroupButtonsFromData(groups) {
  const container = document.getElementById('groupButtons');
  container.innerHTML = "";
  const profile = getMaterialProfile();

  groups.forEach(g => {
    const count = (g.categories || []).length;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "group-btn";
    const idsForStats = (g.categories || []).map(nameToCategoryId).filter(Boolean);
    const stats = summarizeGroupCompatibility(idsForStats, profile);
    const style = getGroupButtonStyles(stats, expandedGroups.has(g.id || g.name));
    btn.style.cssText = `
          padding:8px 12px; margin:4px; background:${style.background};
          color:${style.color}; border:1px solid ${style.border};
          border-radius:6px; cursor:pointer; font-size:12px;
          font-weight:500;`;

    btn.textContent = `${g.name} (${count})`;
    btn.title = buildGroupTooltip(stats, g.categories || []);

    btn.addEventListener("click", () => toggleGroupOnChips(g));

    // Sağ tık: varsayılan gruplar için farklı mesaj
    btn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (g.isDefault) {
        toast.info(MESSAGES.INFO_DEFAULT_GROUP);
      } else {
        toast.info(MESSAGES.INFO_GROUP_EDIT);
      }
    });

    container.appendChild(btn);
  });
}

// Tıkla-aç / tıkla-kapat (chips alanında göster/gizle)
function toggleGroupOnChips(group) {
  const cats = new Set(group.categories || []);
  const isOpen = expandedGroups.has(group.id || group.name);

  if (isOpen) {
    // kapat → bu grubun kategorilerini çiplerden kaldır
    // CRITICAL FIX: Convert category names/slugs to IDs before deleting (chips store IDs)
    cats.forEach(c => {
      const categoryId = nameToCategoryId(c);
      if (categoryId) {
        chips.delete(categoryId);
      } else {
        // Fallback: try deleting by name/slug if ID conversion fails
        chips.delete(c);
      }
    });
    expandedGroups.delete(group.id || group.name);
  } else {
    // aç → tüm uygun kategorileri ekle
    const selectionStats = createCategorySelectionStats();
    cats.forEach(c => {
      const categoryId = nameToCategoryId(c);
      if (!categoryId) {
        logger.warn('Unknown category in group', { category: c });
        return;
      }
      tryAddCategoryChip(categoryId, { silent: true, stats: selectionStats });
    });
    notifyCategorySelectionStats(selectionStats);
    expandedGroups.add(group.id || group.name);
  }
  renderChips();
}

// Apply selected group to category chips - dropdown kaldırıldığı için artık gerekli değil

// === Çoklu-Sekmeli Grup Hub Sistemi ===

// Giriş butonu
document.getElementById('btnGroupHub')?.addEventListener('click', () => {
  document.getElementById('groupHubModal').style.display = 'block';
  showTab('create'); // varsayılan Oluştur
  resetCreatePane();
  renderManageList(); // Yönet sekmesi için önceden yükle
});
document.getElementById('ghClose')?.addEventListener('click', () => {
  document.getElementById('groupHubModal').style.display = 'none';
});

// Sekme geçişi
document.getElementById('tabCreate')?.addEventListener('click', () => showTab('create'));
document.getElementById('tabManage')?.addEventListener('click', () => { showTab('manage'); renderManageList(); });

function showTab(which) {
  const cBtn = document.getElementById('tabCreate');
  const mBtn = document.getElementById('tabManage');
  const cPane = document.getElementById('paneCreate');
  const mPane = document.getElementById('paneManage');
  if (which === 'create') {
    cBtn.classList.add('gh-active'); mBtn.classList.remove('gh-active');
    cPane.style.display = ''; mPane.style.display = 'none';
  } else {
    mBtn.classList.add('gh-active'); cBtn.classList.remove('gh-active');
    mPane.style.display = ''; cPane.style.display = 'none';
  }
}

// Yönet toolbar'ındaki boş/adsız sol elemanı kaldır
(() => {
  const tb = document.querySelector('#paneManage > div'); // toolbar
  if (!tb) return;
  const first = tb.firstElementChild;
  if (first && first.textContent.trim() === '' && first.querySelectorAll('*').length === 0) {
    first.remove();
  }
})();

// === Normalizasyon (duplicate engelleme)
function normalizeName(s = '') {
  return s.toLocaleLowerCase('tr')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim();
}
async function getTakenGroupNames() {
  const groups = await listGroupsForUser(user.uid);
  return { set: new Set(groups.map(g => normalizeName(g.name))), list: groups };
}

// === Oluştur sekmesi
const ghCreateName = document.getElementById('ghCreateName');
const ghCreateStep = document.getElementById('ghCreateStepCats');
const ghCreateSearch = document.getElementById('ghCreateSearch');
const ghCreateCount = document.getElementById('ghCreateCount');
const ghCreateCats = document.getElementById('ghCreateCats');

// CRITICAL: Category selection state for new group creation (declared early)
let createSelected = new Set();

function resetCreatePane() {
  ghCreateName.value = '';
  ghCreateStep.style.display = 'none';
  document.getElementById('ghCreateNext').style.display = 'inline-block';
  document.getElementById('ghCreateSave').style.display = 'none';
  ghCreateCats.innerHTML = '';
  ghCreateSearch.value = '';
  ghCreateCount.textContent = '';
  // CRITICAL: Clear selection state when resetting form
  createSelected.clear();
}

// CRITICAL: Use new ID-based category system (25 categories instead of 17)
async function renderChecklist(container, countEl, filter = '', prechecked = new Set()) {
  // Get all categories from new system
  const allCategories = getAllCategories();
  const all = allCategories.map(cat => cat.name).filter(Boolean);
  const list = all.filter(n => n.toLowerCase().includes(filter.toLowerCase())).sort((a, b) => a.localeCompare(b, 'tr'));
  // Teklifbul Rule v1.0 - XSS Protection: Sanitize category names
  container.innerHTML = DOMPurify.sanitize(list.map(n => {
    const safeName = DOMPurify.sanitize(n, { ALLOWED_TAGS: [] });
    return `
        <label class="gh-grid-row">
          <input type="checkbox" value="${safeName}" ${prechecked.has(n) ? 'checked' : ''}>
          <span>${safeName}</span>
        </label>`;
  }).join(''), {
    ALLOWED_TAGS: ['label', 'input', 'span'],
    ALLOWED_ATTR: ['class', 'type', 'value', 'checked']
  });
  if (countEl) countEl.textContent = `${list.length} kategori`;
}

document.getElementById('ghCreateCancel')?.addEventListener('click', () => {
  document.getElementById('groupHubModal').style.display = 'none';
});

document.getElementById('ghCreateNext')?.addEventListener('click', async () => {
  const raw = ghCreateName.value;
  const key = normalizeName(raw);
  if (!key) { toast.warn(MESSAGES.WARN_GROUP_NAME); return; }
  const { set: taken } = await getTakenGroupNames();
  if (taken.has(key)) { toast.warn(MESSAGES.WARN_GROUP_EXISTS_FORMAT.replace('{name}', raw)); return; }
  ghCreateStep.style.display = '';
  document.getElementById('ghCreateCats').classList.add('gh-grid');
  document.getElementById('ghCreateCats').parentElement.style.maxHeight = '48vh';
  document.getElementById('ghCreateCats').parentElement.style.overflow = 'auto';
  // CRITICAL: Reset selection when starting category selection step
  createSelected.clear();
  // CRITICAL: Use async renderChecklist with empty selection set
  renderChecklist(document.getElementById('ghCreateCats'), document.getElementById('ghCreateCount'), '', createSelected).catch(err => logger.error('Render checklist error', err));
  rebindCreateCheckboxHandlers();
  document.getElementById('ghCreateNext').style.display = 'none';
  document.getElementById('ghCreateSave').style.display = 'inline-block';
  ghCreateSearch.focus();
});

// Helper function to rebind checkbox handlers for create mode
function rebindCreateCheckboxHandlers() {
  const createCatsBox = document.getElementById('ghCreateCats');
  if (!createCatsBox) return;

  createCatsBox.onchange = (ev) => {
    if (ev.target.type === 'checkbox') {
      const v = ev.target.value;
      if (ev.target.checked) createSelected.add(v);
      else createSelected.delete(v);
    }
  };
}

ghCreateSearch?.addEventListener('input', e => {
  // CRITICAL: Use async renderChecklist with preselected categories
  renderChecklist(document.getElementById('ghCreateCats'), document.getElementById('ghCreateCount'), e.target.value, createSelected).catch(err => logger.error('Render checklist error', err));
  rebindCreateCheckboxHandlers();
});

// CRITICAL: Tümünü Seç butonu (Yeni Grup Oluştur)
const createSelectAllBtn = document.getElementById('ghCreateSelectAll');
if (createSelectAllBtn) {
  createSelectAllBtn.addEventListener('click', () => {
    const allCategories = getAllCategories();
    const allNames = allCategories.map(cat => cat.name).filter(Boolean);
    allNames.forEach(name => createSelected.add(name));
    // Yeniden render et
    const searchValue = document.getElementById('ghCreateSearch')?.value || '';
    renderChecklist(document.getElementById('ghCreateCats'), document.getElementById('ghCreateCount'), searchValue, createSelected).catch(err => logger.error('Render checklist error', err));
    rebindCreateCheckboxHandlers();
  });
}

// CRITICAL: Temizle butonu (Yeni Grup Oluştur)
const createClearBtn = document.getElementById('ghCreateClear');
if (createClearBtn) {
  createClearBtn.addEventListener('click', () => {
    createSelected.clear();
    // Yeniden render et
    const searchValue = document.getElementById('ghCreateSearch')?.value || '';
    renderChecklist(document.getElementById('ghCreateCats'), document.getElementById('ghCreateCount'), searchValue, createSelected).catch(err => logger.error('Render checklist error', err));
    rebindCreateCheckboxHandlers();
  });
}

document.getElementById('ghCreateSave')?.addEventListener('click', async () => {
  const raw = ghCreateName.value;
  const key = normalizeName(raw);
  // CRITICAL: Use createSelected set instead of querying DOM
  const selected = createSelected.size > 0
    ? [...createSelected]
    : [...ghCreateCats.querySelectorAll('input[type="checkbox"]:checked')].map(i => i.value);
  if (!key) { toast.warn(MESSAGES.WARN_VALID_GROUP_NAME); return; }
  if (selected.length === 0) { toast.warn(MESSAGES.WARN_CATEGORY_SELECT); return; }

  const { set: taken } = await getTakenGroupNames();
  if (taken.has(key)) { toast.warn(MESSAGES.WARN_GROUP_EXISTS_FORMAT.replace('{name}', raw)); return; }

  await createGroup(user.uid, { name: raw.trim(), categories: selected });
  await loadCategoryGroups?.();
  showTab('manage');        // otomatik olarak Yönet sekmesine geç
  renderManageList();       // listeyi tazele
});

// === Yönet sekmesi
const ghManageList = document.getElementById('ghManageList');

let ghGroups = []; // {id,name,categories}
let ghSelectedIds = new Set();

// --- Yönet liste davranışı
function refreshRowStates() {
  const rows = document.querySelectorAll('#ghManageList .row');
  const single = ghSelectedIds.size === 1 ? [...ghSelectedIds][0] : null;
  rows.forEach(row => {
    const id = row.getAttribute('data-id');
    const btn = row.querySelector('.btn-edit');
    if (!btn) return;
    if (single && id === single) {
      btn.classList.add('enabled');
      btn.disabled = false;
    } else {
      btn.classList.remove('enabled');
      btn.disabled = true;
    }
  });

  // üstteki "Düzenle" butonu
  const topEdit = document.getElementById('ghEdit');
  if (topEdit) {
    const on = ghSelectedIds.size === 1;
    topEdit.disabled = !on;
    topEdit.style.background = on ? '#10b981' : '#f59e0b';
    topEdit.style.color = '#fff';
  }
}

async function renderManageList() {
  const { list } = await getTakenGroupNames();
  ghGroups = list;
  ghSelectedIds.clear();
  drawManageList();
  // düzenleme panelini kapat
  document.getElementById('ghEditPanel').style.display = 'none';
}

function drawManageList() {
  const searchEl = document.getElementById('ghManageSearch');
  const q = (searchEl?.value || '').toLocaleLowerCase('tr');
  const html = ghGroups
    .filter(g => g.name.toLocaleLowerCase('tr').includes(q))
    .map(g => `
          <div class="row" data-id="${g.id}">
            <input type="checkbox" class="gh-row-check" ${ghSelectedIds.has(g.id) ? 'checked' : ''}>
            <div><strong>${g.name}</strong> <small style="color:#6b7280;">(${(g.categories || []).length})</small></div>
            <button class="btn-edit" disabled>Düzenle</button>
          </div>`
    ).join('');
  ghManageList.innerHTML = html || `<div style="padding:12px;color:#6b7280;">Henüz grup yok.</div>`;
  refreshRowStates();
}
document.getElementById('ghManageSearch')?.addEventListener('input', drawManageList);

// satır checkbox change handler (liste çiziminden sonra bağla)
document.getElementById('ghManageList')?.addEventListener('change', (e) => {
  if (!e.target.classList.contains('gh-row-check')) return;
  const row = e.target.closest('.row'); const id = row?.dataset.id;
  if (!id) return;
  if (e.target.checked) ghSelectedIds.add(id); else ghSelectedIds.delete(id);
  refreshRowStates();
});

// satır "Düzenle" tık
document.getElementById('ghManageList')?.addEventListener('click', (e) => {
  if (!e.target.classList.contains('btn-edit')) return;
  if (e.target.disabled) return;
  const id = e.target.closest('.row')?.dataset.id;
  if (id) openEditPanel(id);
});

// Çoklu Sil
document.getElementById('ghDelete')?.addEventListener('click', async () => {
  if (ghSelectedIds.size === 0) { toast.warn(MESSAGES.WARN_GROUP_SELECT); return; }
  if (!confirm(`${ghSelectedIds.size} grup silinsin mi?`)) return;

  try {
    // Her grup için ayrı ayrı silme işlemi
    for (const groupId of ghSelectedIds) {
      await deleteGroup(user.uid, groupId);
    }
    await loadCategoryGroups?.();
    await renderManageList();
    toast.success(MESSAGES.SUCCESS_GROUPS_DELETED);
  } catch (error) {
    logger.error('Silme hatası', error);
    toast.error(MESSAGES.ERROR_GROUPS_DELETE + ': ' + error.message);
  }
});

// Tekli Düzenle butonu
document.getElementById('ghEdit')?.addEventListener('click', () => {
  if (ghSelectedIds.size !== 1) { toast.warn(MESSAGES.WARN_ONE_GROUP_SELECT); return; }
  const id = [...ghSelectedIds][0];
  openEditPanel(id);
});

// --- İsim/kat normalizasyonu
function normalizeCat(s = '') {
  return s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ç/g, 'c')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')   // boşluk, tire, eğik çizgi vb. tüm ayırıcıları kaldır
    .trim();
}

// Basit Levenshtein mesafesi: küçük diziler için yeterli
function editDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

// CRITICAL: Reusable grid checklist renderer (prechecked korumalı) - Updated to use new ID-based system (25 categories)
function renderChecklistGrid(container, countEl, { filter = '', prechecked = new Set() } = {}) {
  // Get all categories from new system
  const allCategories = getAllCategories();
  const all = allCategories.map(cat => cat.name).filter(Boolean);
  const preN = new Set([...prechecked].map(normalizeCat));    // normalize for compare
  const list = all
    .filter(n => n.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'tr'));

  // Teklifbul Rule v1.0 - XSS Protection: Sanitize category names
  container.innerHTML = DOMPurify.sanitize(list.map(n => {
    const safeName = DOMPurify.sanitize(n, { ALLOWED_TAGS: [] });
    const checked = preN.has(normalizeCat(n)) ? 'checked' : '';
    return `
          <label class="gh-grid-row">
            <input type="checkbox" value="${safeName}" ${checked}>
            <span>${safeName}</span>
          </label>`;
  }).join(''), {
    ALLOWED_TAGS: ['label', 'input', 'span'],
    ALLOWED_ATTR: ['class', 'type', 'value', 'checked']
  });

  if (countEl) countEl.textContent = `${list.length} kategori`;
}

// === Düzenleme paneli ===
let editingGroup = null;            // {id,name,categories}
let editingSelected = new Set();    // canlı seçim (preselected + kullanıcı değişiklikleri)

function openEditPanel(id) {
  // grubu bul ve başlığı yaz
  editingGroup = ghGroups.find(g => g.id === id);
  if (!editingGroup) return;

  document.getElementById('ghEditTitle').textContent = `Grup Düzenle: ${editingGroup.name}`;
  const nameInput = document.getElementById('ghEditName');
  if (nameInput) nameInput.value = editingGroup.name || '';

  // CRITICAL: PRESELECT - Use new ID-based category system (25 categories)
  const allCategories = getAllCategories();
  const allNames = allCategories.map(cat => cat.name).filter(Boolean);
  const nameByNorm = new Map(allNames.map(n => [normalizeCat(n), n]));
  const allNorms = Array.from(nameByNorm.keys());
  const mapped = (editingGroup.categories || [])
    .filter(Boolean)
    .map(c => {
      const norm = normalizeCat(c);
      // Özel alias eşleşmeler (bozuk kayıtlara tolerans)
      const aliasTargets = [
        { match: (n) => n.includes('gvenlik') || n.startsWith('isg') || n.startsWith('isguven'), target: 'isguvenligi' },
      ];
      for (const a of aliasTargets) {
        if (a.match(norm) && nameByNorm.has(a.target)) {
          return nameByNorm.get(a.target);
        }
      }
      if (nameByNorm.has(norm)) return nameByNorm.get(norm);
      // En yakın eşi bul (mesafe <= 2 veya uzunluğun %25'i)
      let best = null, bestDist = Infinity;
      for (const candidate of allNorms) {
        const d = editDistance(norm, candidate);
        if (d < bestDist) { bestDist = d; best = candidate; }
        if (bestDist === 0) break;
      }
      const threshold = Math.max(3, Math.floor(Math.max(norm.length, (best || '').length) * 0.35));
      return (best && bestDist <= threshold) ? nameByNorm.get(best) : c;
    });
  editingSelected = new Set(mapped);

  // ilk çizim
  const catsBox = document.getElementById('ghEditCats');
  catsBox.classList.add('gh-grid'); // düzenli grid
  renderChecklistGrid(catsBox, document.getElementById('ghEditCount'), {
    filter: '',
    prechecked: editingSelected
  });

  // checkbox değişimlerini canlı olarak editingSelected'a yansıt
  catsBox.onchange = (e) => {
    if (e.target.type === 'checkbox') {
      const val = e.target.value;
      if (e.target.checked) editingSelected.add(val);
      else editingSelected.delete(val);
    }
  };

  // aramada listeyi yeniden çizerken mevcut seçimleri KORU
  const search = document.getElementById('ghEditSearch');
  search.value = '';

  // Helper function to rebind event handlers
  function rebindCheckboxHandlers() {
    catsBox.onchange = (ev) => {
      if (ev.target.type === 'checkbox') {
        const v = ev.target.value;
        if (ev.target.checked) editingSelected.add(v);
        else editingSelected.delete(v);
      }
    };
  }

  search.oninput = (e) => {
    renderChecklistGrid(catsBox, document.getElementById('ghEditCount'), {
      filter: e.target.value || '',
      prechecked: editingSelected
    });
    rebindCheckboxHandlers();
  };

  // CRITICAL: Tümünü Seç butonu
  const selectAllBtn = document.getElementById('ghEditSelectAll');
  if (selectAllBtn) {
    selectAllBtn.onclick = () => {
      const allCategories = getAllCategories();
      const allNames = allCategories.map(cat => cat.name).filter(Boolean);
      allNames.forEach(name => editingSelected.add(name));
      // Yeniden render et
      renderChecklistGrid(catsBox, document.getElementById('ghEditCount'), {
        filter: search.value || '',
        prechecked: editingSelected
      });
      rebindCheckboxHandlers();
    };
  }

  // CRITICAL: Temizle butonu
  const clearBtn = document.getElementById('ghEditClear');
  if (clearBtn) {
    clearBtn.onclick = () => {
      editingSelected.clear();
      // Yeniden render et
      renderChecklistGrid(catsBox, document.getElementById('ghEditCount'), {
        filter: search.value || '',
        prechecked: editingSelected
      });
      rebindCheckboxHandlers();
    };
  }

  // paneli göster
  document.getElementById('ghEditPanel').style.display = '';
}

// Kaydet → editingSelected set'inden gönder
document.getElementById('ghEditSave')?.addEventListener('click', async () => {
  if (!editingGroup) return;
  const newCats = [...editingSelected];
  const nameInput = document.getElementById('ghEditName');
  const newNameRaw = (nameInput?.value || '').trim();
  const newNameKey = normalizeName(newNameRaw);
  if (!newNameKey) { toast.warn(MESSAGES.WARN_VALID_GROUP_NAME); return; }

  // Duplicate kontrol (kendi grubu hariç)
  const { list } = await getTakenGroupNames();
  const exists = list.some(g => g.id !== editingGroup.id && normalizeName(g.name) === newNameKey);
  if (exists) { toast.warn(MESSAGES.WARN_GROUP_EXISTS_FORMAT.replace('{name}', newNameRaw)); return; }

  await updateGroup(user.uid, editingGroup.id, { name: newNameRaw, categories: newCats });
  await loadCategoryGroups?.();
  await renderManageList();
  // panel açık kalabilir; istersen kapat:
  // document.getElementById('ghEditPanel').style.display = 'none';
});

// Vazgeç → paneli kapat
document.getElementById('ghEditCancel')?.addEventListener('click', () => {
  document.getElementById('ghEditPanel').style.display = 'none';
  editingGroup = null;
  editingSelected = new Set();
});


// Load category groups on page load
await loadCategoryGroups();
// Render invite group picker with same groups
renderInviteGroupPicker();

// Add line item (use helper)
if (addLineBtn) {
  addLineBtn.onclick = () => {
    addRow();
  };
}



if (createBtn) {
  logger.info("createBtn bulundu, event listener ekleniyor");
  createBtn.onclick = async () => {
    try {
      const busyLabel = editing ? 'Güncelleniyor...' : 'Talep oluşturuluyor...';
      createBtn.disabled = true;
      createBtn.textContent = busyLabel;

      // Permission Write Guard - Teklifbul Rule v1.0
      const params = new URLSearchParams(window.location.search);
      const isEditMode = !!(params.get('id') || params.get('edit'));
      // DEMAND_PERMS module scope'ta tanımlı
      const permKey = isEditMode
        ? DEMAND_PERMS?.purchase?.edit
        : DEMAND_PERMS?.purchase?.create;

      if (permKey) {
        const ok = await requirePerm(permKey, {
          toastMessage: isEditMode
            ? (MESSAGES.ERROR_PERMISSION_DEMAND_EDIT || 'Talep düzenleme yetkiniz yok.')
            : (MESSAGES.ERROR_PERMISSION_DEMAND_CREATE || 'Talep oluşturma yetkiniz yok.')
        });
        if (!ok) {
          createBtn.disabled = false;
          createBtn.textContent = defaultCreateLabel;
          return;
        }
      }

      // Header validation
      const demandDate = el("demandDate").value;
      const title = el("title").value.trim();
      const dueDate = el("dueDate").value;
      const priority = el("priority").value;
      const currency = el("currency").value;
      // New visibility model
      const demandVisibility = document.querySelector('input[name="demandVisibility"]:checked')?.value || 'genel';
      const inviteMode = document.querySelector('input[name="inviteMode"]:checked')?.value || 'auto';
      const selectedGroupIds = getSelectedGroupIds();

      const siteNameVal = el("siteName").value.trim();
      const purchaseVal = el("purchaseLocation").value.trim();
      if (!demandDate || !title || !dueDate || !siteNameVal || !purchaseVal) {
        throw new Error("Talep Tarihi, Şantiye, Alım Yeri, Başlık ve Termin zorunlu.");
      }

      // Validate purchase city from datalist
      const provinceOptions = Array.from(document.querySelectorAll('#provinceList option')).map(o => (o.value || '').trim());
      if (!provinceOptions.includes(purchaseVal)) {
        throw new Error("Lütfen Alım Yeri için listeden geçerli bir il seçin.");
      }

      // Özel + custom ise en az bir tedarikçi şart
      if (demandVisibility === 'ozel' && inviteMode === 'custom' && selectedSuppliers.size === 0) {
        throw new Error("Özel (Özelleştir) için en az bir tedarikçi seçmelisiniz.");
      }

      // Get companyId from profile with fallback strategy
      let companyId = null;
      try {
        // Try multiple collections in order of preference
        const collections = ["publicProfiles", "profiles", "users"];

        for (const collection of collections) {
          try {
            const profileSnap = await getDoc(doc(db, collection, user.uid));
            if (profileSnap.exists()) {
              const profile = profileSnap.data();
              companyId = profile.currentCompanyId || profile.companyId || profile.activeCompanyId || `solo-${user.uid}`;
              logger.info(`Found companyId from ${collection}`, { companyId });
              break;
            }
          } catch (collectionError) {
            logger.warn(`Could not read from ${collection}`, collectionError.message);
            continue;
          }
        }

        // Fallback if no collection worked
        if (!companyId) {
          companyId = `solo-${user.uid}`;
          logger.info("Using fallback companyId", { companyId });
        }
      } catch (e) {
        logger.warn("Profile read error, using fallback", e);
        companyId = `solo-${user.uid}`;
      }

      // Prepare header data
      // Teklif modu ve hibrit ayarları
      const biddingMode = document.querySelector('input[name="biddingMode"]:checked').value;
      const hybridSettings = {
        firstRoundDays: biddingMode === 'hybrid' ? parseInt(el("firstRoundDays").value) || 7 : null,
        secondRoundSupplierVisibility: biddingMode === 'hybrid' ? el("secondRoundSupplierVisibility").value : null,
        secondRoundDays: biddingMode === 'hybrid' ? parseInt(el("secondRoundDays").value) || 7 : null
      };

      const specValue = document.getElementById("spec")?.value?.trim() || null;
      const deliveryCityValue = document.getElementById("deliveryCity")?.value?.trim() || null;

      // Exclude suppliers (chips)
      const excludeSuppliers = Array.from(document.querySelectorAll('#excludeChips span[data-val]')).map(el => ({ nameOrCode: el.getAttribute('data-val') }));

      // Backward compatibility for legacy fields
      const demandType = demandVisibility === 'ozel' ? 'private' : 'public';
      const invitedSupplierIds = (demandVisibility === 'ozel')
        ? (inviteMode === 'custom' ? Array.from(selectedSuppliers) : (autoInvitees.map(s => s.id)))
        : [];

      // CRITICAL FIX: Chips now contain category IDs, not slugs
      // Ensure all chips are valid category IDs
      let categoryIds = [...chips].map(c => {
        // If it's already a valid category ID, use it
        if (CATEGORIES.find(cat => cat.id === c)) return c;
        // Try to convert name/slug to ID
        const id = nameToCategoryId(c);
        return id || c; // Fallback to original if conversion fails
      }).filter(Boolean);

      if (categoryIds.length === 0) {
        // Teklifbul Rule v1.0 - Otomatik kategori seçimi
        logger.group('Otomatik kategori seçimi');
        const profileForAutoSelect = getMaterialProfile(true);
        const suggestedCategoryIds = suggestCategoriesForProfile(profileForAutoSelect, 5);

        if (suggestedCategoryIds.length > 0) {
          logger.info('Otomatik kategori önerileri bulundu', { count: suggestedCategoryIds.length });
          // En iyi eşleşen kategorileri otomatik seç
          for (const categoryId of suggestedCategoryIds.slice(0, 3)) {
            const stats = createCategorySelectionStats();
            const added = tryAddCategoryChip(categoryId, { silent: true, stats });
            if (added) {
              logger.info('Kategori otomatik seçildi', { categoryId, name: categoryIdToName(categoryId) });
            }
          }
          renderChips();
          // Güncellenmiş kategori listesini al
          categoryIds = [...chips].map(c => {
            if (CATEGORIES.find(cat => cat.id === c)) return c;
            const id = nameToCategoryId(c);
            return id || c;
          }).filter(Boolean);

          if (categoryIds.length > 0) {
            toast.success(`${categoryIds.length} kategori otomatik olarak seçildi`);
            logger.end();
            // Devam et, kategori seçildi
          } else {
            logger.warn('Otomatik kategori seçimi başarısız');
            logger.end();
            createBtn.disabled = false;
            createBtn.textContent = defaultCreateLabel;
            toast.error(MESSAGES.ERROR_DEMAND_CATEGORY_AUTO_SELECT);
            const catChipsEl = el("catChips");
            if (catChipsEl) {
              catChipsEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
          }
        } else {
          logger.warn('Kategori önerisi bulunamadı');
          logger.end();
          createBtn.disabled = false;
          createBtn.textContent = defaultCreateLabel;
          toast.error(MESSAGES.ERROR_DEMAND_CATEGORY_REQUIRED);
          const catChipsEl = el("catChips");
          if (catChipsEl) {
            catChipsEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          return;
        }
      }

      // For backward compatibility, also generate slugs
      const categorySlugs = categoryIds.map(id => {
        const name = categoryIdToName(id);
        return toSlug(name || id);
      });

      const profileForSubmit = getMaterialProfile(true);
      const incompatibleSelections = categoryIds
        .map(id => ({
          id,
          name: categoryIdToName(id),
          result: evaluateCategoryRule(id, profileForSubmit)
        }))
        .filter(entry => entry.result && (entry.result.status === 'blocked' || entry.result.status === 'mismatch'));

      // Teklifbul Rule v1.0 - Kategori uyumsuzluğu kontrolü kaldırıldı, sadece uyarı ver
      if (incompatibleSelections.length) {
        const summary = incompatibleSelections.map(entry => {
          if (entry.result?.reason) {
            return `${entry.name}: ${entry.result.reason}`;
          }
          return entry.name;
        }).join(', ');
        logger.warn('Kategori uyumsuzluğu tespit edildi', { incompatibleSelections });
        toast.warn(`Uyarı: Bazı kategoriler malzeme tanımıyla uyumsuz görünüyor: ${summary}. Devam edebilirsiniz.`);
        // Hata fırlatma, sadece uyarı göster
      }

      const categoryNamesForGuard = categoryIds.map(id => categoryIdToName(id)).filter(Boolean);
      const itemsPayload = collectItemsFromForm();
      if (itemsPayload.length === 0) {
        throw new Error("En az bir talep kalemi eklemelisiniz.");
      }

      const guardResult = await runCategoryGuardCheck({
        title,
        spec: specValue,
        categories: categoryNamesForGuard.length ? categoryNamesForGuard : categoryIds,
        items: itemsPayload.slice(0, 10).map(item => ({
          name: item.name,
          brandModel: item.brandModel,
          unit: item.unit,
          qty: item.qty
        }))
      });

      // Teklifbul Rule v1.0 - Backend guard kontrolü kaldırıldı, sadece bilgilendirme amaçlı
      if (guardResult?.allowed === false) {
        // Teklifbul Rule v1.0 - Backend önerilerini filtrele (sadece mevcut kategorileri göster)
        const validCategoryNames = CATEGORIES.map(cat => cat.name);
        const filteredSuggestions = Array.isArray(guardResult.suggestedCategories)
          ? guardResult.suggestedCategories.filter(cat => validCategoryNames.includes(cat))
          : [];

        // Teklifbul Rule v1.0 - Backend uyarısını göster ama engelleme
        logger.info('Backend kategori kontrolü uyarısı', {
          categoryIds,
          incompatibleSelections: incompatibleSelections.length,
          guardReason: guardResult.reason,
          allowed: guardResult.allowed
        });

        // Sadece bilgilendirme amaçlı uyarı göster, engelleme yok
        if (filteredSuggestions.length > 0) {
          toast.info(`Önerilen kategoriler: ${filteredSuggestions.join(', ')}`);
        }
        // Teklifbul Rule v1.0 - Engelleme kaldırıldı, her durumda devam et
        // return; // Kaldırıldı - kullanıcı istediği kategorileri seçebilir
      }

      const headerData = {
        demandDate,
        siteName: siteNameVal,
        purchaseLocation: purchaseVal,
        title,
        spec: specValue,
        categoryIds: categoryIds, // NEW: Store category IDs (primary)
        categoryTags: categorySlugs, // Backward compatibility: also store slugs
        customCategory: document.getElementById("catInput")?.value?.trim() || null,
        dueDate,
        priority,
        currency,
        paymentTerms: el("paymentTerms").value.trim() || null,
        paymentPreference: (window.__getBuyerPaymentPref && window.__getBuyerPaymentPref()) || null,
        deliveryCity: deliveryCityValue,
        deliveryAddress: el("deliveryAddress").value.trim() || null,
        delivery_lat: el("delivery_lat")?.value ? parseFloat(el("delivery_lat").value) : null, // Teklifbul Rule v1.0 - Adres doğrulama koordinatı
        delivery_lng: el("delivery_lng")?.value ? parseFloat(el("delivery_lng").value) : null, // Teklifbul Rule v1.0 - Adres doğrulama koordinatı
        // paymentSchedule kaldırıldı
        // SATFK: kalıcı alan (CF henüz yazmadan taslakta da görünsün)
        satfk: (document.getElementById('satfk')?.value || (typeof previewSatfk !== 'undefined' ? previewSatfk : null)),
        // Yayın/Görünürlük kaldırıldı - otomatik gönderim
        demandType, // 'public' veya 'private' (uyumluluk)
        selectedSuppliers: null,
        excludeSuppliers,
        biddingMode, // 'secret', 'open', 'hybrid'
        hybridSettings, // Hibrit mod ayarları
        updatedAt: serverTimestamp(),
        companyId: companyId, // Set companyId from profile with fallback (backward compatibility)
        // REFACTORED: Yeni alanlar - refactor için
        creatorId: user.uid, // Talebi açan kullanıcı
        creatorCompanyId: companyId, // Talebi açan kullanıcının şirketi
        supplierCategoryKeys: categoryIds, // Tedarikçi kategori eşleşmesi için (ID format - primary)
        // New fields for publish functionality - will be updated when approved via modal
        isPublished: false, // Will be set to true when approved via modal
        visibility: 'private',
        // Yeni eklenen alanlar
        descriptions: getDescriptions(), // 1-2-3-4-5 numaralı açıklamalar
        requester: el("requester").value.trim() || null, // Talep Eden
        purchaseManager: el("purchaseManager").value.trim() || null, // Satın Alma Müdürü
        generalManager: el("generalManager").value.trim() || null, // Genel Müdür
        approver: el("approver").value.trim() || null, // Onay Veren
        deliveryMethod: getDeliveryMethod(), // Teslim Şekli
        unloadingMethod: document.querySelector('input[name="unloadingMethod"]:checked')?.value || null, // İndirme Şekli
        deliveryAddress: el("deliveryAddress").value.trim() || null, // Teslimat Adresi
        delivery_lat: el("delivery_lat")?.value ? parseFloat(el("delivery_lat").value) : null, // Teklifbul Rule v1.0 - Adres doğrulama koordinatı
        delivery_lng: el("delivery_lng")?.value ? parseFloat(el("delivery_lng").value) : null, // Teklifbul Rule v1.0 - Adres doğrulama koordinatı
        supplierEmails: el("supplierEmails")?.value ? el("supplierEmails").value.split('\n').map(e => e.trim()).filter(e => e.length > 0) : [],
        sendEmailOnNotification: el("sendEmailOnCreate") ? el("sendEmailOnCreate").checked : false
      };

      if (!editing) {
        // ====================
        // CREATE MODE
        // ====================
        headerData.createdBy = user.uid; // Backward compatibility
        headerData.createdAt = serverTimestamp();
        headerData.updatedAt = serverTimestamp(); // REFACTORED: updatedAt eklendi
        headerData.viewerIds = [user.uid];
        // Keep published field for backward compatibility (DEPRECATED)
        headerData.published = false; // Başlangıçta yayınlanmamış
        headerData.filesCount = 0;

        // REFACTORED: Talep durumu sistemi - sadece status kullanılıyor
        // FIX: Start as draft, but will be approved via modal
        headerData.status = 'draft'; // Başlangıçta taslak (modal'dan onaylanacak)
        headerData.published = false; // Explicitly false until approved
        headerData.statusHistory = [{
          status: 'draft',
          timestamp: Date.now(),
          userId: user.uid,
          note: 'Talep oluşturuldu'
        }];

        // Header-level target price is deprecated; keep null (item-level targetPrice is used)
        headerData.targetPrice = null;
        headerData.deliveryLocation = `${deliveryCityValue || ''} ${el("deliveryAddress").value.trim()}`.trim();

        logger.info("Creating new demand", {
          createdBy: user.uid,
          categoryIds: headerData.categoryIds,
          categoryTags: headerData.categoryTags,
          companyId: headerData.companyId,
          isPublished: headerData.isPublished,
          visibility: headerData.visibility
        });

        // Create demand header
        let newDemandRef;
        try {
          newDemandRef = await addDoc(collection(db, "demands"), headerData);
          logger.info("Demand created successfully", { demandId: newDemandRef.id });
        } catch (createError) {
          logger.error("Error creating demand", createError);
          if (createError.message && createError.message.includes("Missing or insufficient permissions")) {
            throw new Error("Yetki reddedildi. İlgili şirketin sahibi/üyesi misiniz?");
          } else {
            throw new Error("Talep oluşturulurken hata oluştu: " + (createError.message || createError));
          }
        }
        const demandId = newDemandRef.id;

        // Find matching suppliers or use selected suppliers
        let supplierUids = [];

        if (demandType === 'private') {
          // Özel talep: seçilen tedarikçileri kullan
          supplierUids = Array.from(selectedSuppliers);
          logger.info('Özel talep - seçilen tedarikçiler', { count: supplierUids.length });
        } else {
          // Genel talep: kategorilerdeki tedarikçileri bul
          if ((headerData.categoryIds && headerData.categoryIds.length) || (headerData.categoryTags && headerData.categoryTags.length)) {
            try {
              logger.info('Searching suppliers for categories', {
                categoryIds: headerData.categoryIds,
                categoryTags: headerData.categoryTags
              });

              // CRITICAL: Use match-service.js for supplier matching (same as publishDemandAndMatchSuppliers)
              try {
                const { matchSuppliers } = await import('/src/matching/match-service.js');

                // Prepare legacy formats for backward compatibility
                const legacySlugs = Array.isArray(headerData.categoryTags) ? headerData.categoryTags : [];
                const legacyNames = (headerData.categoryIds || []).map(id => {
                  const cat = getAllCategories().find(c => c.id === id);
                  return cat ? cat.name : null;
                }).filter(Boolean);

                // Use match service (same logic as publishDemandAndMatchSuppliers)
                const matchedSuppliers = await matchSuppliers(db, {
                  categoryIds: headerData.categoryIds || [],
                  legacySlugs: legacySlugs,
                  legacyNames: legacyNames
                });

                logger.info(`Matched ${matchedSuppliers.length} suppliers using match-service.js`);

                // CRITICAL: match-service now returns suppliers with uid/id attached
                // Extract supplier IDs (excluding demand creator)
                supplierUids = matchedSuppliers
                  .map(supplier => supplier.uid || supplier.id)
                  .filter(uid => uid && uid !== user.uid);

                logger.info("Supplier query returned", { count: supplierUids.length, supplierIds: supplierUids });

                // Log unmatched demands for debugging
                if (supplierUids.length === 0) {
                  logger.warn("No matching suppliers found", {
                    categoryIds: headerData.categoryIds,
                    categoryTags: headerData.categoryTags
                  });
                  // Log to unmatchedDemands collection for analysis
                  try {
                    await addDoc(collection(db, "unmatchedDemands"), {
                      demandId: demandId,
                      categoryIds: headerData.categoryIds,
                      categories: headerData.categoryTags,
                      createdAt: serverTimestamp()
                    });
                  } catch (logError) {
                    logger.warn("Could not log unmatched demand", logError.message);
                  }
                }
              } catch (innerError) {
                logger.warn("Inner supplier matching error", innerError.message);
              }
            } catch (supplierError) {
              logger.warn("Could not find suppliers", supplierError.message);
            }
          }
        }

        // Update viewerIds
        if (supplierUids.length) {
          const allViewers = Array.from(new Set([user.uid, ...supplierUids]));
          await updateDoc(newDemandRef, { viewerIds: allViewers });
          logger.info("Updated viewerIds", { count: allViewers.length });
        }

        // Add items
        for (const item of itemsPayload) {
          await addDoc(collection(db, "demands", demandId, "items"), {
            ...item,
            createdAt: serverTimestamp()
          });
        }

        // Teklifbul Rule v1.0 - public_listings koleksiyonuna yazma
        await syncPublicListings(demandId, itemsPayload, headerData);

        localStorage.setItem("lastDemandId", demandId);

        // Onay ekranı göster
        showApprovalModal(demandId);

      } else {
        // ====================
        // EDIT MODE
        // ====================
        logger.info("Updating existing demand", { demandId: editId });

        // Add companyId for multi-company support
        headerData.companyId = companyId;
        // Keep published field for backward compatibility
        headerData.published = headerData.isPublished;

        // Update header (keep published=false for safety)
        await updateDoc(demandRef, headerData);

        // Delete old items
        const oldItems = await getDocs(collection(db, "demands", editId, "items"));
        await Promise.all(oldItems.docs.map(d => deleteDoc(doc(db, "demands", editId, "items", d.id))));

        // Add new items
        for (const item of itemsPayload) {
          await addDoc(collection(db, "demands", editId, "items"), {
            ...item,
            createdAt: serverTimestamp()
          });
        }

        // Teklifbul Rule v1.0 - public_listings koleksiyonuna yazma (edit modunda)
        await syncPublicListings(editId, itemsPayload, headerData);

        toast.success(MESSAGES.SUCCESS_DEMAND_UPDATED);
        location.href = `./demand-detail.html?id=${editId}`;
      }
    } catch (e) {
      logger.error("Demand creation/update error", e);
      const code = e?.code || "";
      if (code === "permission-denied") toast.error(MESSAGES.ERROR_PERMISSION_DENIED);
      else if (code === "not-found") toast.error(MESSAGES.ERROR_NOT_FOUND);
      else toast.error(MESSAGES.ERROR_OPERATION_FAILED + ": " + (e?.message || e));
      createBtn.disabled = false;
      createBtn.textContent = defaultCreateLabel;
    }
  };
}

// ====================
// Onay Modal Fonksiyonları
// ====================
function showApprovalModal(demandId) {
  const modal = document.getElementById('approvalModal');
  const demandCodeEl = document.getElementById('approvalDemandCode');

  // SATFK'yi göster
  const satfk = document.getElementById('satfk').value;
  demandCodeEl.textContent = satfk || "Oluşturulacak...";

  // Modalı göster
  modal.style.display = 'block';

  // Event listener'ları ekle
  const approveBtn = document.getElementById('approveDemandBtn');
  const saveDraftBtn = document.getElementById('saveAsDraftBtn');
  const editBtn = document.getElementById('editDemandBtn');
  const closeBtn = document.getElementById('closeApprovalModalBtn');

  if (approveBtn) approveBtn.onclick = () => approveDemand(demandId);
  if (saveDraftBtn) saveDraftBtn.onclick = () => saveAsDraft(demandId);
  if (editBtn) editBtn.onclick = () => editDemand(demandId);
  if (closeBtn) closeBtn.onclick = () => closeApprovalModal();

  // Teklifbul Rule v1.0 - Modal dışına tıklandığında kapat
  const handleModalClick = (e) => {
    if (e.target === modal) {
      closeApprovalModal();
    }
  };
  modal.addEventListener('click', handleModalClick);

  // Teklifbul Rule v1.0 - ESC tuşu ile kapat
  const handleEscKey = (e) => {
    if (e.key === 'Escape' && modal.style.display === 'block') {
      closeApprovalModal();
      document.removeEventListener('keydown', handleEscKey);
    }
  };
  document.addEventListener('keydown', handleEscKey);
}

function closeApprovalModal() {
  document.getElementById('approvalModal').style.display = 'none';
  // Teklifbul Rule v1.0 - Modal kapatıldığında buton durumunu sıfırla
  if (createBtn) {
    createBtn.disabled = false;
    createBtn.textContent = defaultCreateLabel;
  }
}

// Teklifbul Rule v1.0 - public_listings koleksiyonuna senkronizasyon
async function syncPublicListings(demandId, itemsPayload, headerData) {
  try {
    logger.group('Sync Public Listings');

    // Mevcut import'ları kullan: query, collection, where, getDocs, setDoc, deleteDoc, doc zaten import edilmiş
    // Mevcut listing'leri bul ve sil (yeniden yazmak için)
    const existingListingsQuery = query(
      collection(db, 'public_listings'),
      where('demandId', '==', demandId)
    );
    const existingSnap = await getDocs(existingListingsQuery);
    const existingListingIds = existingSnap.docs.map(d => d.id);

    // publishToMarket=true olan kalemleri say
    const itemsToPublish = itemsPayload.filter(item => item.publishToMarket === true);
    logger.info('Items to publish to public listings', {
      total: itemsPayload.length,
      toPublish: itemsToPublish.length,
      limit: userPlanLimit
    });

    // Limit kontrolü (güvenlik için tekrar kontrol)
    if (itemsToPublish.length > userPlanLimit) {
      logger.warn('Publish limit exceeded, truncating', {
        requested: itemsToPublish.length,
        limit: userPlanLimit
      });
      itemsToPublish.splice(userPlanLimit);
    }

    // Normalize qty: item.qty || item.quantity || item.amount || item.adet || 0
    const normalizeQty = (item) => {
      return item.qty || item.quantity || item.amount || item.adet || 0;
    };

    // Normalize deliveryLocation ve deadline
    const deliveryLocation = headerData.deliveryLocation ||
      headerData.deliveryAddress ||
      'Belirtilmemiş';
    const deadline = headerData.dueDate ||
      headerData.deadline ||
      headerData.itemDueDate ||
      null;

    // Her publishToMarket=true olan kalem için listing oluştur
    const listingPromises = itemsToPublish.map(async (item, index) => {
      const listingId = `${demandId}_${item.lineNo || index}`;
      const listingData = {
        demandId: demandId,
        itemIndex: item.lineNo || index,
        title: item.name || 'Ürün Açıklaması',
        description: item.description || null,
        qty: normalizeQty(item),
        unit: item.unit || 'adet',
        categoryTags: headerData.categoryTags || [],
        deliveryLocation: deliveryLocation,
        deadline: deadline,
        createdAt: serverTimestamp(),
        buyerCompanyId: headerData.companyId || null,
        status: 'active',
        satfk: headerData.satfk || null
      };

      try {
        await setDoc(doc(db, 'public_listings', listingId), listingData, { merge: true });
        logger.info('Listing created/updated', { listingId, itemIndex: item.lineNo || index });
      } catch (error) {
        logger.error('Failed to create listing', { listingId, error: error.message });
        // Security rules hatası olabilir, kullanıcıya bilgi ver
        if (error.message && error.message.includes('permission')) {
          toast.warn(MESSAGES.WARN_DEMAND_AD_CREATE_PERMISSION);
        }
      }
    });

    await Promise.all(listingPromises);

    // publishToMarket=false olan kalemler için eski listing'leri sil
    // Yeni yazılan listing'lerin ID'lerini topla
    const publishedItemIndexes = new Set(itemsToPublish.map(item => item.lineNo || itemsPayload.indexOf(item)));

    // Mevcut listing'lerden, yeni yazılanlar hariç olanları sil
    const deletePromises = existingSnap.docs
      .filter(docSnap => {
        const listingData = docSnap.data();
        const itemIndex = listingData.itemIndex || parseInt(docSnap.id.split('_').pop()) || null;
        // Eğer bu itemIndex yeni yazılanlar arasında yoksa sil
        return itemIndex !== null && !publishedItemIndexes.has(itemIndex);
      })
      .map(async (docSnap) => {
        try {
          await deleteDoc(doc(db, 'public_listings', docSnap.id));
          logger.info('Listing deleted', { listingId: docSnap.id });
        } catch (error) {
          logger.warn('Failed to delete listing', { listingId: docSnap.id, error: error.message });
        }
      });

    await Promise.all(deletePromises);

    logger.info('Public listings sync completed', {
      created: itemsToPublish.length,
      deleted: deletePromises.length
    });
    logger.end();
  } catch (error) {
    logger.error('Public listings sync error', error);
    // Hata olsa bile talep kaydı devam etsin
    toast.warn(MESSAGES.WARN_DEMAND_AD_SYNC_ERROR);
  }
}

async function approveDemand(demandId) {
  try {
    // Talep durumunu 'approved' yap ve yayınla
    // CRITICAL FIX: Set both published and isPublished for compatibility
    await updateDoc(doc(db, 'demands', demandId), {
      status: 'approved',
      published: true,
      isPublished: true, // New system field
      statusHistory: arrayUnion({
        status: 'approved',
        timestamp: Date.now(),
        userId: user.uid,
        note: 'Talep onaylandı ve yayınlandı'
      }),
      updatedAt: serverTimestamp()
    });

    // Tedarikçi eşleştirmesi yap (even if no suppliers found, still publish)
    try {
      await publishDemandAndMatchSuppliers(demandId);
    } catch (matchError) {
      logger.warn('Tedarikçi eşleştirme hatası (talep yine de yayınlandı)', matchError);
      // Don't fail the entire approval if supplier matching fails
    }

    closeApprovalModal();
    toast.success(MESSAGES.SUCCESS_DEMAND_APPROVED);
    location.href = `./demand-detail.html?id=${demandId}`;

  } catch (error) {
    logger.error('Talep onaylama hatası', error);
    toast.error(MESSAGES.ERROR_DEMAND_APPROVE + ': ' + error.message);
  }
}

async function saveAsDraft(demandId) {
  try {
    // Talep durumunu 'draft' olarak bırak
    await updateDoc(doc(db, 'demands', demandId), {
      status: 'draft',
      published: false,
      isPublished: false, // Yeni sistem için
      visibility: 'private', // Taslaklar özel olmalı
      statusHistory: arrayUnion({
        status: 'draft',
        timestamp: Date.now(),
        userId: user.uid,
        note: 'Talep taslak olarak kaydedildi'
      }),
      updatedAt: serverTimestamp()
    });

    closeApprovalModal();
    toast.success(MESSAGES.SUCCESS_DEMAND_DRAFT);
    location.href = `./demand-detail.html?id=${demandId}`;

  } catch (error) {
    logger.error('Taslak kaydetme hatası', error);
    toast.error(MESSAGES.ERROR_DEMAND_DRAFT + ': ' + error.message);
  }
}

function editDemand(demandId) {
  // Modalı kapat ama sayfada kal - form verileri kaybolmasın
  closeApprovalModal();
  // Sayfayı yenileme veya yönlendirme yapma
  // Kullanıcı form üzerinde kalır ve istediği değişiklikleri yapabilir
}

// ====================
// Tedarikçi Eşleştirme Fonksiyonu
// ====================
async function publishDemandAndMatchSuppliers(demandId) {
  try {
    logger.info("Publishing demand and matching suppliers", { demandId });

    // Talep verilerini al
    const demandDoc = await getDoc(doc(db, 'demands', demandId));
    if (!demandDoc.exists()) {
      throw new Error('Talep bulunamadı');
    }

    const demandData = demandDoc.data();

    // CRITICAL: Import match service
    const { matchSuppliers } = await import('/src/matching/match-service.js');

    // Collect all category tokens and normalize to IDs
    const categoryTokens = [];
    if (Array.isArray(demandData.categoryIds)) {
      categoryTokens.push(...demandData.categoryIds);
    }
    if (Array.isArray(demandData.supplierCategoryKeys)) {
      categoryTokens.push(...demandData.supplierCategoryKeys);
    }
    if (Array.isArray(demandData.categoryTags)) {
      categoryTokens.push(...demandData.categoryTags);
    }

    // Normalize all tokens to IDs using new system
    const categoryIds = normalizeToIds(categoryTokens);

    const groups = demandData.groupIds || [];

    logger.info('Demand category data', {
      categoryIds: demandData.categoryIds,
      categoryTags: demandData.categoryTags,
      supplierCategoryKeys: demandData.supplierCategoryKeys,
      normalizedCategoryIds: categoryIds,
      groups: groups
    });

    // Belirlenecek tedarikçiler
    const allSuppliers = new Set();

    // CRITICAL: Use new match service for supplier matching
    if (categoryIds.length > 0) {
      // Prepare legacy formats for backward compatibility
      const legacySlugs = Array.isArray(demandData.categoryTags) ? demandData.categoryTags : [];
      const legacyNames = categoryIds.map(id => categoryIdToName(id)).filter(Boolean);

      // Use match service
      const matchedSuppliers = await matchSuppliers(db, {
        categoryIds: categoryIds,
        legacySlugs: legacySlugs,
        legacyNames: legacyNames
      });

      logger.info(`Matched ${matchedSuppliers.length} suppliers using new ID-based system`);

      // Collect supplier IDs (excluding demand creator)
      matchedSuppliers.forEach(supplier => {
        const supplierId = supplier.uid || supplier.id;
        if (supplierId && supplierId !== demandData.createdBy) {
          allSuppliers.add(supplierId);
        }
      });
    }

    // Grup bazlı tedarikçi sorgusu (keep for group matching)
    if (groups.length > 0) {
      try {
        const groupQuery = query(
          collection(db, 'users'),
          where('isActive', '==', true),
          where('groupIds', 'array-contains-any', groups)
        );
        const groupSnap = await getDocs(groupQuery);
        groupSnap.docs.forEach(doc => {
          if (doc.id !== demandData.createdBy) {
            allSuppliers.add(doc.id);
          }
        });
        logger.info(`Found ${groupSnap.docs.length} suppliers from groups`);
      } catch (groupError) {
        logger.error('Group query failed', groupError);
      }
    }

    logger.info(`Total unique suppliers found`, { count: allSuppliers.size });

    if (allSuppliers.size === 0) {
      logger.warn('No matching suppliers found', { categoryIds });
      logger.warn('Tip: Ensure suppliers have supplierCategoryIds populated with matching categories.');
    }


    // Exclude suppliers by name/code if provided (privacy-safe client filter; server can also enforce)
    const excludes = Array.isArray(demandData.excludeSuppliers) ? demandData.excludeSuppliers.map(x => (x?.nameOrCode || '').toLowerCase()).filter(Boolean) : [];
    if (excludes.length) {
      const kept = new Set();
      for (const sid of allSuppliers) {
        try {
          const sDoc = await getDoc(doc(db, 'users', sid));
          const d = sDoc.data() || {};
          const haystack = [d.displayName, d.companyName, d.taxNo, d.code, d.email].filter(Boolean).join(' ').toLowerCase();
          const match = excludes.some(x => haystack.includes(x));
          if (!match) kept.add(sid);
        } catch (e) { kept.add(sid); }
      }
      logger.info(`Excluding ${allSuppliers.size - kept.size} suppliers by user-provided exclude list`);
      allSuppliers.clear(); kept.forEach(id => allSuppliers.add(id));
    }

    // demandRecipients kayıtları oluştur
    const recipientPromises = Array.from(allSuppliers).map(supplierId =>
      addDoc(collection(db, 'demandRecipients'), {
        demandId: demandId,
        buyerId: demandData.createdBy,
        supplierId: supplierId,
        matchedAt: serverTimestamp(),
        status: 'pending',
        createdAt: serverTimestamp()
      })
    );

    await Promise.all(recipientPromises);

    logger.info(`Created ${recipientPromises.length} demandRecipients records`);

  } catch (error) {
    logger.error('Error in publishDemandAndMatchSuppliers', error);
    throw error;
  }
}

// ====================
// Yeni Özellikler - JavaScript Fonksiyonları
// ====================

// Açıklama yönetimi
let descriptionCounter = 0;

function addDescription() {
  const container = document.getElementById("descriptionsContainer");
  const index = container.children.length + 1;

  // Create description item row
  const row = document.createElement("div");
  row.className = "description-item";
  row.dataset.descriptionIndex = index;

  // Number label
  const numberLabel = document.createElement("span");
  numberLabel.className = "description-number";
  numberLabel.textContent = `${index}.`;
  row.appendChild(numberLabel);

  // Textarea
  const ta = document.createElement("textarea");
  ta.rows = 3;
  ta.id = `description_${index}`;
  ta.name = `description_${index}`;
  ta.placeholder = `${index}. Açıklama girin...`;
  row.appendChild(ta);

  // Delete button
  const del = document.createElement("button");
  del.className = "delete-btn";
  del.textContent = "×";
  del.title = "Sil";
  del.onclick = () => {
    row.remove();
    // Renumber remaining descriptions
    updateDescriptionNumbers();
  };
  row.appendChild(del);

  container.appendChild(row);
}

function updateDescriptionNumbers() {
  const container = document.getElementById("descriptionsContainer");
  const items = container.querySelectorAll('.description-item');
  items.forEach((item, index) => {
    const number = index + 1;
    item.dataset.descriptionIndex = number;
    const numberLabel = item.querySelector('.description-number');
    if (numberLabel) {
      numberLabel.textContent = `${number}.`;
    }
    const textarea = item.querySelector('textarea');
    if (textarea) {
      textarea.id = `description_${number}`;
      textarea.name = `description_${number}`;
      textarea.placeholder = `${number}. Açıklama girin...`;
    }
  });
}

function clearDescriptions() {
  const container = document.getElementById("descriptionsContainer");
  container.innerHTML = "";
}


function getDescriptions() {
  const textareas = document.querySelectorAll('#descriptionsContainer textarea');
  return Array.from(textareas).map(textarea => textarea.value.trim()).filter(val => val);
}

// Teslim şekli yönetimi
function setupDeliveryMethodHandlers() {
  const radioButtons = document.querySelectorAll('input[name="deliveryMethod"]');
  const customContainer = document.getElementById('customDeliveryContainer');
  const customInput = document.getElementById('customDelivery');
  const customTextInput = document.getElementById('deliveryMethodCustom');

  radioButtons.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.value === 'custom') {
        customContainer.style.display = 'block';
        customInput.required = true;
      } else {
        customContainer.style.display = 'none';
        customInput.required = false;
        customInput.value = '';
      }

      // Radio button seçildiğinde elle yazma alanını güncelle
      if (customTextInput) {
        if (radio.value === 'nakliye_dahil') {
          customTextInput.value = 'Nakliye Dahil';
        } else if (radio.value === 'nakliye_haric') {
          customTextInput.value = 'Nakliye Hariç';
        } else if (radio.value === 'custom') {
          customTextInput.value = '';
          customTextInput.placeholder = 'Özel teslimat açıklamasını yazın';
        }
      }
    });
  });

  // Elle yazma alanı değiştiğinde radio button'ları temizle
  if (customTextInput) {
    customTextInput.addEventListener('input', () => {
      if (customTextInput.value.trim()) {
        radioButtons.forEach(radio => radio.checked = false);
      }
    });
  }
}

function getDeliveryMethod() {
  // Önce elle yazılan değeri kontrol et
  const customInput = document.getElementById('deliveryMethodCustom');
  if (customInput && customInput.value.trim()) {
    return customInput.value.trim();
  }

  // Sonra radio button'ları kontrol et
  const selected = document.querySelector('input[name="deliveryMethod"]:checked');
  if (!selected) return null;

  if (selected.value === 'custom') {
    const customValue = document.getElementById('customDelivery').value.trim();
    return customValue || null;
  }

  return selected.value;
}

// İl bilgisini adresten çıkar ve purchaseLocation'a yaz
function extractAndSetProvinceFromAddress(addressText) {
  if (!addressText || !addressText.trim()) return;

  // Adres formatı: "... İlçe / İl" veya "... İl" veya "İl: ..." şeklinde olabilir
  const patterns = [
    /([A-ZÇĞİÖŞÜ][a-zçğıöşü]+)\s*\/\s*([A-ZÇĞİÖŞÜ][a-zçğıöşü]+)/, // İlçe / İl
    /İl:\s*([A-ZÇĞİÖŞÜ][a-zçğıöşü]+)/, // İl: ...
    /([A-ZÇĞİÖŞÜ][a-zçğıöşü]+)\s*(?:İl|İli)/, // ... İl
  ];

  for (const pattern of patterns) {
    const match = addressText.match(pattern);
    if (match) {
      // İl bilgisini bul (genellikle son kısım)
      const il = match[2] || match[1];
      if (il && il.length > 2 && !il.includes('İlçe') && !il.includes('Mahalle')) {
        const purchaseLocationEl = document.getElementById("purchaseLocation");
        if (purchaseLocationEl) purchaseLocationEl.value = il;
        logger.info('İl bilgisi adresten çıkarıldı', { il, addressText });
        return;
      }
    }
  }

  logger.warn('İl bilgisi adresten çıkarılamadı', { addressText });
}

// Teslimat adresi yönetimi
async function setupDeliveryAddressHandlers() {
  const select = document.getElementById('deliveryAddressSelect');
  const textarea = document.getElementById('deliveryAddress');
  const refreshBtn = document.getElementById('refreshAddressesBtn');
  const verifyBtn = document.getElementById('verifyDeliveryAddressBtn');
  const verifiedDiv = document.getElementById('deliveryAddressVerified');
  const coordsSpan = document.getElementById('deliveryAddressCoords');
  const latInput = document.getElementById('delivery_lat');
  const lngInput = document.getElementById('delivery_lng');

  // Adres doğrulama butonu
  // Teklifbul Rule v1.0 - Buton event listener'ı her zaman bağlanmalı
  if (verifyBtn) {
    // Önceki listener'ları temizle (tekrar bağlanma durumunda)
    verifyBtn.replaceWith(verifyBtn.cloneNode(true));
    const newVerifyBtn = document.getElementById('verifyDeliveryAddressBtn');

    newVerifyBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        logger.info('Adres doğrulama butonu tıklandı');
        const currentAddress = textarea?.value || '';

        if (!currentAddress || currentAddress.trim().length < 5) {
          toast.error(MESSAGES.ERROR_ADDRESS_MISSING);
          return;
        }

        // Modal'ı import et ve göster
        const { showAddressVerifyModal } = await import('/assets/js/address-verify-modal.js');

        showAddressVerifyModal({
          defaultAddress: currentAddress,
          onConfirm: (result) => {
            // Teklifbul Rule v1.0 - Adres doğrulama sonucu
            if (textarea) {
              textarea.value = result.address;
              textarea.removeAttribute('disabled'); // Doğrulama sonrası düzenlenebilir yap
            }
            if (latInput) latInput.value = result.lat.toString();
            if (lngInput) lngInput.value = result.lng.toString();

            // Doğrulama badge'i göster
            if (verifiedDiv) verifiedDiv.style.display = 'block';
            if (coordsSpan) {
              coordsSpan.textContent = `lat: ${result.lat.toFixed(6)} · lng: ${result.lng.toFixed(6)}`;
            }

            logger.info('Adres doğrulandı', result);
          },
          onCancel: () => {
            logger.info('Adres doğrulama iptal edildi');
          }
        });
      } catch (err) {
        logger.error('Adres doğrulama modal hatası', err);
        toast.error(MESSAGES.ERROR_ADDRESS_VERIFY + ': ' + (err.message || err));
      }
    });

    logger.info('Adres doğrulama butonu event listener bağlandı');
  } else {
    logger.warn('verifyDeliveryAddressBtn bulunamadı');
  }

  // Yenile butonu - Yeni sistem
  refreshBtn.addEventListener('click', async () => {
    try {
      const user = await requireAuth();

      // Mevcut seçenekleri temizle
      // Teklifbul Rule v1.0 - XSS Protection: Sanitize select options
      select.innerHTML = DOMPurify.sanitize('<option value="">Başlık seçin</option>', {
        ALLOWED_TAGS: ['option'],
        ALLOWED_ATTR: ['value']
      });

      // Kullanıcı verilerini yükle
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        logger.info("Kullanıcı verileri", userData);

        // Teklifbul Rule v1.0 - Şirket bazlı fatura adresi kontrolü
        let hasInvoiceAddress = false;

        // Önce kullanıcı dokümanından kontrol et
        if (userData.invoiceAddress || userData.invoiceAddressParts) {
          hasInvoiceAddress = true;
        } else {
          // Şirket dokümanından kontrol et
          const companyId = userData.companyId || userData.activeCompanyId || (Array.isArray(userData.companies) && userData.companies.length > 0 ? userData.companies[0] : null);
          if (companyId) {
            try {
              const companyDoc = await getDoc(doc(db, "companies", companyId));
              if (companyDoc.exists()) {
                const companyData = companyDoc.data() || {};
                if (companyData.invoiceAddressParts || companyData.invoiceAddress) {
                  hasInvoiceAddress = true;
                  logger.info("Fatura adresi şirket dokümanından bulundu", { companyId });
                }
              }
            } catch (e) {
              logger.warn("Şirket dokümanı yüklenemedi", e);
            }
          }
        }

        // Fatura adresini seçenek olarak ekle (varsa)
        if (hasInvoiceAddress) {
          const opt = document.createElement("option");
          opt.value = "invoice";
          opt.textContent = "Fatura Adresi";
          select.appendChild(opt);
          logger.info("Fatura adresi seçeneği eklendi");
        } else {
          logger.warn("Fatura adresi bulunamadı (kullanıcı ve şirket dokümanlarında)");
        }

        // İlave adresleri başlıkla listele
        const additionalAddresses = userData.additionalAddresses || [];
        logger.info("İlave adresler", { count: additionalAddresses.length });

        additionalAddresses.forEach((a, i) => {
          const opt = document.createElement("option");
          opt.value = `addr:${i}`;
          opt.textContent = a.title || `Adres ${i + 1}`;
          select.appendChild(opt);
          logger.info(`Adres seçeneği eklendi`, { title: a.title });
        });

        logger.info(`${additionalAddresses.length} adet ilave adres yüklendi`);

        // İç talep'ten gelen siteAddress'i eşleştir
        if (window.__pendingSiteAddress) {
          const pendingAddress = window.__pendingSiteAddress.trim().toLowerCase();

          // Önce başlık olarak eşleştir
          let matched = false;

          // Fatura adresi kontrolü
          if (pendingAddress.includes('fatura') || pendingAddress === 'invoice') {
            const invoiceOpt = Array.from(select.options).find(opt => opt.value === 'invoice');
            if (invoiceOpt) {
              select.value = 'invoice';
              select.dispatchEvent(new Event('change'));
              matched = true;
              logger.info('Fatura adresi eşleştirildi');
            }
          }

          // İlave adreslerde başlık eşleştirmesi
          if (!matched) {
            additionalAddresses.forEach((addr, i) => {
              const addrTitle = (addr.title || '').toLowerCase();
              if (addrTitle === pendingAddress || addrTitle.includes(pendingAddress) || pendingAddress.includes(addrTitle)) {
                const opt = Array.from(select.options).find(opt => opt.value === `addr:${i}`);
                if (opt) {
                  select.value = `addr:${i}`;
                  select.dispatchEvent(new Event('change'));
                  matched = true;
                  logger.info('Adres başlığı eşleştirildi', { title: addr.title, index: i });
                }
              }
            });
          }

          // Eğer başlık eşleşmediyse, adres içeriğinde ara
          if (!matched) {
            additionalAddresses.forEach((addr, i) => {
              const addrContent = (addr.content || '').toLowerCase();
              if (addrContent.includes(pendingAddress) || pendingAddress.includes(addrContent)) {
                const opt = Array.from(select.options).find(opt => opt.value === `addr:${i}`);
                if (opt) {
                  select.value = `addr:${i}`;
                  select.dispatchEvent(new Event('change'));
                  matched = true;
                  logger.info('Adres içeriği eşleştirildi', { title: addr.title, index: i });
                }
              }
            });
          }

          // Eğer hiç eşleşmediyse, direkt textarea'ya yaz
          if (!matched && pendingAddress.length > 10) {
            textarea.value = window.__pendingSiteAddress;
            textarea.disabled = false;
            logger.info('Adres direkt textarea\'ya yazıldı');
          }

          // Flag'i temizle
          delete window.__pendingSiteAddress;
        }
      } else {
        logger.error("Kullanıcı verisi bulunamadı");
      }
    } catch (error) {
      logger.error("Adresler yüklenemedi", error);
    }
  });

  // Select değişikliği - Yeni sistem
  select.addEventListener('change', async () => {
    if (!select.value) {
      // Inline stilleri kaldır, CSS'e güven
      textarea.style.removeProperty('background');
      textarea.style.removeProperty('color');
      textarea.value = "";
      textarea.disabled = false;
      textarea.placeholder = "Teslimat adresini yazın veya yukarıdan seçin";
      return;
    }

    if (select.value === "invoice") {
      try {
        const user = await requireAuth();
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const p = userData.invoiceAddressParts || {};
          const taxNo = userData.taxNumber || "";
          const taxOf = userData.taxOffice || "";
          // Compose in requested order: Mahalle - Cadde - Sokak - Kapı No - Daire - İlçe/İl - Vergi No - Vergi Dairesi
          const parts = [
            p.mahalle || null,
            p.cadde || null,
            p.sokak || null,
            p.kapiNo ? `Kapı No: ${p.kapiNo}` : null,
            p.daire ? `Daire: ${p.daire}` : null,
            (p.ilce && p.il) ? `${p.ilce} / ${p.il}` : (p.il || p.ilce || null),
            taxNo ? `Vergi No: ${taxNo}` : null,
            taxOf ? `Vergi Dairesi: ${taxOf}` : null
          ].filter(Boolean);
          const composed = parts.join(" - ");

          // Inline stilleri kaldır, CSS'e güven
          textarea.style.removeProperty('background');
          textarea.style.removeProperty('color');

          // Value set et
          textarea.value = composed || userData.invoiceAddress || "";
          // Placeholder'ı kaldır çünkü value var
          textarea.removeAttribute('placeholder');

          // Disabled yap (CSS otomatik olarak doğru renkleri uygulayacak)
          textarea.disabled = true;

          // İl bilgisini çıkar ve purchaseLocation'a yaz (iç talep'ten geliyorsa)
          if (window.__pendingSiteAddress || fromInternal) {
            extractAndSetProvinceFromAddress(composed || userData.invoiceAddress || '');
          }
        }
      } catch (error) {
        logger.error("Fatura adresi yüklenemedi", error);
      }
      return;
    }

    if (select.value.startsWith("addr:")) {
      try {
        const user = await requireAuth();
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const idx = Number(select.value.split(":")[1]);
          const addr = userData.additionalAddresses?.[idx];
          logger.info("Seçilen adres", { idx, addr, content: addr?.content });

          if (addr) {
            // Teklifbul Rule v1.0 - Adres içeriğini textarea'ya yaz (content varsa, yoksa structured data'dan oluştur)
            let addressContent = addr.content;

            // Eğer content yoksa, structured data'dan oluştur
            if (!addressContent || addressContent.trim() === '') {
              const parts = [];
              if (addr.mahalle) parts.push(`${addr.mahalle}${addr.mahalle.includes('Mahalle') ? '' : ' Mahalle'}`);
              if (addr.cadde) parts.push(`${addr.cadde}${addr.cadde.includes('Cadde') ? '' : ' Cadde'}`);
              if (addr.street) parts.push(`${addr.street}${addr.street.includes('Sokak') || addr.street.includes('Cadde') ? '' : ' Sokak'}`);
              if (addr.building || addr.kapi) parts.push(`Kapı No: ${addr.building || addr.kapi}`);
              if (addr.daire) parts.push(`Daire: ${addr.daire}`);
              if (addr.district || addr.ilce) parts.push(`İlçe: ${addr.district || addr.ilce}`);
              if (addr.city || addr.il) parts.push(`İl: ${addr.city || addr.il}`);
              if (addr.postakodu) parts.push(`Posta Kodu: ${addr.postakodu}`);
              parts.push('Türkiye');
              addressContent = parts.filter(Boolean).join(' - ');
            }

            // Inline stilleri kaldır, CSS'e güven
            textarea.style.removeProperty('background');
            textarea.style.removeProperty('color');
            textarea.style.setProperty('display', 'block', 'important');

            // Value set et
            textarea.value = addressContent || "";
            // Placeholder'ı kaldır çünkü value var
            textarea.removeAttribute('placeholder');

            // Disabled yap (CSS otomatik olarak doğru renkleri uygulayacak)
            textarea.disabled = true;

            // İl bilgisini structured data'dan al (varsa) - iç talep'ten geliyorsa
            if ((window.__pendingSiteAddress || fromInternal) && (addr.city || addr.il)) {
              const il = addr.city || addr.il;
              if (il) {
                const purchaseLocationEl = document.getElementById("purchaseLocation");
                if (purchaseLocationEl) purchaseLocationEl.value = il;
                logger.info('İl bilgisi adres structured data\'dan alındı', { il });
              }
            } else if ((window.__pendingSiteAddress || fromInternal) && addressContent) {
              // Structured data yoksa, adres içeriğinden çıkar
              extractAndSetProvinceFromAddress(addressContent);
            }

            logger.info("Adres içeriği textarea'ya yazıldı", { addressContent, length: textarea.value.length });
          } else {
            logger.warn("Adres bulunamadı", { index: idx });
          }
        }
      } catch (error) {
        logger.error("İlave adres yüklenemedi", error);
      }
      return;
    }

    // Varsayılan durum
    textarea.value = "";
    textarea.disabled = false;
    textarea.placeholder = "Teslimat adresini yazın veya yukarıdan seçin";
  });

  // İlk yükleme
  if (refreshBtn) {
    refreshBtn.click();
  }

  logger.info('setupDeliveryAddressHandlers tamamlandı');
}

// Event listener'ları ekle
function initDemandPageMain() {
  // Açıklama butonları
  const addDescBtn = document.getElementById('addDescriptionBtn');
  const clearDescBtn = document.getElementById('clearDescriptionsBtn');

  if (addDescBtn) addDescBtn.onclick = addDescription;
  if (clearDescBtn) clearDescBtn.onclick = clearDescriptions;

  // Teslim şekli
  setupDeliveryMethodHandlers();

  // Teklifbul Rule v1.0 - Teslimat adresi handler'larını başlat
  setupDeliveryAddressHandlers().catch(err => {
    logger.error("Teslimat adresi handler'ları başlatılamadı", err);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDemandPageMain);
} else {
  initDemandPageMain();
}
