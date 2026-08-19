// Teklifbul Rule v1.0 - Ortak Permission Helper
// Amaç: companies/{companyId}/rolePermissions/{roleKey} + rolePermissionsTemplate.json üzerinden
// tüm modüller için tek merkezden, cache'li ve güvenli yetki kontrolü sağlamak.

import { db, auth } from '../firebase.js';
import { logger } from '../../../src/shared/log/logger.js';
import { toast } from '../../../src/shared/ui/toast.js';
import { MESSAGES } from '../../../src/shared/constants/messages.js';
import { requireCompanyContext } from './company-context.js';
import rolePermissionsTemplate from '../../../src/shared/data/rolePermissionsTemplate.json';

// Yönetim rollerinin set'i (Rol & Yetki Yönetimi ekranıyla uyumlu tutulmalı)
const ROLE_PERMISSIONS_EDITORS = new Set([
  'buyer:isveren',
  'buyer:yonetim_kurulu_baskani',
  'buyer:yonetim_kurulu_uyesi',
  'buyer:ceo',
  'buyer:genel_mudur',
  'buyer:genel_mudur_yardimcisi',
  'supplier:isveren',
  'supplier:yonetim_kurulu_baskani',
  'supplier:yonetim_kurulu_uyesi',
  'supplier:ceo',
  'supplier:genel_mudur',
  'supplier:genel_mudur_yardimcisi'
]);

const PERM_CACHE_TTL_MS = 60_000; // 60 saniye

/**
 * Demand ekranları için izin key'lerini JSON şablonundan türetir.
 * Hard-coded permKey yerine tek kaynaktan (rolePermissionsTemplate) okunur.
 */
function buildDemandPerms() {
  const perms = (rolePermissionsTemplate && rolePermissionsTemplate.permissions) || [];

  const findByLabel = (label) => {
    const p = perms.find((x) => x.label === label);
    return p ? p.key : null;
  };

  const findByKey = (key) => {
    const p = perms.find((x) => x.key === key);
    return p ? p.key : null;
  };

  // Temel talep izinleri
  const viewKey = findByKey('demands.view') || findByLabel('Talep Gör');
  const editKey = findByKey('demands.edit') || findByLabel('Talep Düzenle');

  // Yeni Satın Alma Talebi
  const purchaseCreateKey =
    findByKey('demands.purchaseCreate') ||
    findByLabel('Yeni Satın Alma Talebi Oluştur') ||
    viewKey;

  // Şirket İçi Talep
  const internalCreateKey =
    findByKey('demands.internalCreate') ||
    findByLabel('Şirket İçi Talep Oluştur') ||
    purchaseCreateKey ||
    viewKey;

  return {
    purchase: {
      view: viewKey || 'demands.view',
      create: purchaseCreateKey || viewKey || 'demands.view',
      edit: editKey || viewKey || 'demands.view'
    },
    internal: {
      // Ayrı bir \"internal view\" key'i olmadığı için Talep Gör ile korunur
      view: viewKey || 'demands.view',
      create: internalCreateKey || purchaseCreateKey || viewKey || 'demands.view',
      edit: editKey || viewKey || 'demands.view'
    }
  };
}

const DEMAND_PERMS = buildDemandPerms();

/**
 * Stok modülü için izin key'lerini JSON şablonundan türetir.
 * Hard-coded permKey yerine tek kaynaktan (rolePermissionsTemplate) okunur.
 */
function buildStockPerms() {
  const perms = (rolePermissionsTemplate && rolePermissionsTemplate.permissions) || [];

  const findByLabel = (label) => {
    const p = perms.find((x) => x.label === label);
    return p ? p.key : null;
  };

  const findByKey = (key) => {
    const p = perms.find((x) => x.key === key);
    return p ? p.key : null;
  };

  const viewKey = findByKey('stock.view') || findByLabel('Stok Listesi Gör');
  const createKey = findByKey('stock.create') || findByLabel('Yeni Stok Aç');
  const editKey = findByKey('stock.edit') || findByLabel('Stok Bilgisi Düzenle');

  const mvInKey = findByKey('stock.movements.in') || findByLabel('Stok Hareketi: Giriş');
  const mvOutKey = findByKey('stock.movements.out') || findByLabel('Stok Hareketi: Çıkış');
  const mvTransferKey =
    findByKey('stock.movements.transfer') || findByLabel('Stok Hareketi: Transfer');
  const mvAdjustKey =
    findByKey('stock.movements.adjust') || findByLabel('Stok Hareketi: Düzeltme');

  // Eğer ayrı hareket key'leri yoksa hepsini tek bir use anahtarına bağlamak için fallback
  const mvUseKey = mvInKey || mvOutKey || mvTransferKey || mvAdjustKey;

  const importKey = findByKey('stock.import') || findByLabel('Stok Kartı İçe Aktar');
  const bulkPriceKey = findByKey('stock.priceUpdate') || findByLabel('Toplu Fiyat Güncelle');
  const reportsKey = findByKey('stock.reports') || findByLabel('Stok Raporları');
  const allowNegativeKey =
    findByKey('stock.allowNegative') || findByLabel('Stok Eksiye Düşme Ayarı');

  return {
    // Template'de yoksa null; uydurma key yok
    view: viewKey || null,
    create: createKey || null,
    edit: editKey || null,
    movements: {
      // Genel kullanım (herhangi bir hareket kaydı için)
      use: mvUseKey || null,
      in: mvInKey || null,
      out: mvOutKey || null,
      transfer: mvTransferKey || null,
      adjust: mvAdjustKey || null
    },
    import: importKey || null,
    bulkPriceUpdate: bulkPriceKey || null,
    reports: reportsKey || null,
    allowNegative: {
      manage: allowNegativeKey || null
    },
    groups: {
      view: findByKey('stock.groups.view') || findByLabel('Özel Kod Gruplarını Gör'),
      edit: findByKey('stock.groups.edit') || findByLabel('Özel Kod Gruplarını Düzenle')
    }
  };
}

/**
 * Hakediş (interim) modülü için izin key'lerini JSON şablonundan türetir.
 * Hard-coded permKey yerine tek kaynaktan (rolePermissionsTemplate) okunur.
 * { view, manage }
 */
function buildInterimPerms() {
  const perms = (rolePermissionsTemplate && rolePermissionsTemplate.permissions) || [];

  const findByLabel = (label) => {
    const p = perms.find((x) => x.label === label);
    return p ? p.key : null;
  };

  const findByKey = (key) => {
    const p = perms.find((x) => x.key === key);
    return p ? p.key : null;
  };

  // Excel/JSON'da mevcut key öncelikli, yoksa label'a göre bul
  const viewKey =
    findByKey('interim.view') ||
    findByLabel('Hakediş Gör') ||
    findByLabel('Hakediş Görüntüleme');

  const manageKey =
    findByKey('interim.manage') ||
    findByLabel('Hakediş İşlem') ||
    findByLabel('Hakediş İşlem Yapma / Düzenleme');

  return {
    view: viewKey || 'interim.view',
    manage: manageKey || 'interim.manage',
  };
}

/**
 * Ödeme talep (payments) modülü için izin key'lerini JSON şablonundan türetir.
 * { view, create, edit, approve, export }
 */
function buildPaymentsPerms() {
  const perms = (rolePermissionsTemplate && rolePermissionsTemplate.permissions) || [];

  const findByLabel = (label) => {
    const p = perms.find((x) => x.label === label);
    return p ? p.key : null;
  };

  const findByKey = (key) => {
    const p = perms.find((x) => x.key === key);
    return p ? p.key : null;
  };

  const viewKey =
    findByKey('payments.view') || findByLabel('Ödeme Talep Gör');
  const createKey =
    findByKey('payments.create') || findByLabel('Ödeme Talep Oluştur');
  const editKey =
    findByKey('payments.edit') || findByLabel('Ödeme Talep Düzenle');
  const approveKey =
    findByKey('payments.approve') || findByLabel('Ödeme Talep Onay');
  const exportKey =
    findByKey('payments.export') || findByLabel('Ödeme Talep Dışa Aktar');

  return {
    // Template'de yoksa null; uydurma key yok
    view: viewKey || null,
    create: createKey || null,
    edit: editKey || null,
    approve: approveKey || null,
    export: exportKey || null
  };
}

/**
 * E-Fatura / E-İrsaliye modülü için izin key'lerini JSON şablonundan türetir.
 * {
 *   einvoice: { view, manage },
 *   edespatch: { view, manage }
 * }
 */
function buildEinvoicePerms() {
  const perms = (rolePermissionsTemplate && rolePermissionsTemplate.permissions) || [];

  const findByLabel = (label) => {
    const p = perms.find((x) => x.label === label);
    return p ? p.key : null;
  };

  const findByKey = (key) => {
    const p = perms.find((x) => x.key === key);
    return p ? p.key : null;
  };

  const einvoiceViewKey =
    findByKey('einvoice.view') || findByLabel('E-Fatura Gör');
  const einvoiceCreateKey =
    findByKey('einvoice.create') || findByLabel('E-Fatura Oluştur');
  const einvoiceSendKey =
    findByKey('einvoice.send') || findByLabel('E-Fatura Gönder');
  const einvoiceStatusKey =
    findByKey('einvoice.status') || findByLabel('E-Fatura Durum Sorgula');
  const einvoiceCancelKey =
    findByKey('einvoice.cancel') || findByLabel('E-Fatura İptal');
  const einvoiceManageKey =
    findByKey('einvoice.manage') ||
    findByLabel('E-Fatura İşlemleri');

  const edespatchViewKey =
    findByKey('edespatch.view') || findByLabel('E-İrsaliye Gör');
  const edespatchCreateKey =
    findByKey('edespatch.create') || findByLabel('E-İrsaliye Oluştur');
  const edespatchSendKey =
    findByKey('edespatch.send') || findByLabel('E-İrsaliye Gönder');
  const edespatchStatusKey =
    findByKey('edespatch.status') || findByLabel('E-İrsaliye Durum Sorgula');
  const edespatchCancelKey =
    findByKey('edespatch.cancel') || findByLabel('E-İrsaliye İptal');
  const edespatchManageKey =
    findByKey('edespatch.manage') ||
    findByLabel('E-İrsaliye İşlemleri');

  return {
    einvoice: {
      view: einvoiceViewKey || null,
      create: einvoiceCreateKey || null,
      send: einvoiceSendKey || null,
      status: einvoiceStatusKey || null,
      cancel: einvoiceCancelKey || null,
      manage: einvoiceManageKey || null
    },
    edespatch: {
      view: edespatchViewKey || null,
      create: edespatchCreateKey || null,
      send: edespatchSendKey || null,
      status: edespatchStatusKey || null,
      cancel: edespatchCancelKey || null,
      manage: edespatchManageKey || null
    }
  };
}

/**
 * Teklif (bids) modülü için izin key'lerini JSON şablonundan türetir.
 * Hard-coded permKey yerine tek kaynaktan (rolePermissionsTemplate) okunur.
 */
function buildBidPerms() {
  const perms = (rolePermissionsTemplate && rolePermissionsTemplate.permissions) || [];

  const findByLabel = (label) => {
    const p = perms.find((x) => x.label === label);
    return p ? p.key : null;
  };

  const findByKey = (key) => {
    const p = perms.find((x) => x.key === key);
    return p ? p.key : null;
  };

  const viewKey = findByKey('bids.view') || findByLabel('Teklif Gör');
  const createKey = findByKey('bids.create') || findByLabel('Teklif Oluştur');
  const editKey = findByKey('bids.edit') || findByLabel('Teklif Düzenle');
  const approveKey = findByKey('bids.approve') || findByLabel('Teklif Onay');
  const compareKey = findByKey('bids.compare') || findByLabel('Teklif Karşılaştır') || null;

  return {
    view: viewKey || 'bids.view',
    create: createKey || 'bids.create',
    edit: editKey || 'bids.edit',
    approve: approveKey || 'bids.approve',
    compare: compareKey // JSON'da yoksa null, bu durumda default-allow davranır
  };
}

/**
 * Ayarlar modülü (firma bilgileri, adresler, premium, AI) için izin key'lerini JSON şablonundan türetir.
 * { companyInfo: { view, edit }, companyProfile: { edit }, addresses: { view, manage }, premium: { purchase }, ai: { use } }
 */
function buildSettingsPerms() {
  const perms = (rolePermissionsTemplate && rolePermissionsTemplate.permissions) || [];

  const findByLabel = (label) => {
    const p = perms.find((x) => x.label === label);
    return p ? p.key : null;
  };

  const findByKey = (key) => {
    const p = perms.find((x) => x.key === key);
    return p ? p.key : null;
  };

  // Firma bilgileri
  const companyViewKey =
    findByKey('settings.company.view') || findByLabel('Firma Bilgileri Gör');
  const companyEditKey =
    findByKey('settings.company.edit') || findByLabel('Firma Bilgileri Düzenle');

  // Şirket profili
  const profileEditKey =
    findByKey('settings.company.profileEdit') || findByLabel('Şirket Profili Düzenle');

  // Adres yönetimi
  const addrViewKey =
    findByKey('settings.address.view') || findByLabel('Adres Yönetimi Gör');
  const addrCreateKey =
    findByKey('settings.address.create') || findByLabel('Adres Yönetimi Ekle');
  const addrEditKey =
    findByKey('settings.address.edit') || findByLabel('Adres Yönetimi Düzenle');
  const addrManageKey = addrEditKey || addrCreateKey;

  // Premium & AI
  const premiumPurchaseKey =
    findByKey('premium.manage') || findByLabel('Premium Satın Alma');
  const aiUseKey =
    findByKey('premium.ai.useAssistant') || findByLabel('AI Asistan Kullan');

  // Teklifbul Rule v1.0 - E-Belge ayarları
  const edocSettingsManageKey =
    findByKey('edoc.settings.manage') || findByLabel('E-Belge Entegratör Ayarları');

  return {
    companyInfo: {
      // Template'de yoksa null dön (uydurma key yok)
      view: companyViewKey || null,
      edit: companyEditKey || null,
    },
    companyProfile: {
      edit: profileEditKey || null,
    },
    addresses: {
      view: addrViewKey || null,
      // Manage: ekleme/düzenleme işlemlerini kapsar
      manage: addrManageKey || null,
    },
    premium: {
      purchase: premiumPurchaseKey || null,
    },
    ai: {
      use: aiUseKey || null,
    },
    edoc: {
      // Teklifbul Rule v1.0 - E-Belge ayarları yönetimi
      manage: edocSettingsManageKey || null,
    },
  };
}

/**
 * Kullanıcı yönetimi (bekleyen istekler, rol düzenleme) için izin key'lerini JSON şablonundan türetir.
 * { userInvites: { approve }, userRoles: { edit } }
 */
function buildUserMgmtPerms() {
  const perms = (rolePermissionsTemplate && rolePermissionsTemplate.permissions) || [];

  const findByLabel = (label) => {
    const p = perms.find((x) => x.label === label);
    return p ? p.key : null;
  };

  const findByKey = (key) => {
    const p = perms.find((x) => x.key === key);
    return p ? p.key : null;
  };

  const approveInvitesKey =
    findByKey('settings.users.approveRequests') || findByLabel('Kullanıcı İstek Onayla');
  const editRolesKey =
    findByKey('settings.users.editRoles') || findByLabel('Kullanıcı Rol Düzenle');

  return {
    userInvites: {
      // Template'de yoksa null (uydurma key yok)
      approve: approveInvitesKey || null,
    },
    userRoles: {
      edit: editRolesKey || null,
    },
  };
}

/**
 * Rol matrisi ve onay limitleri için izin key'lerini JSON şablonundan türetir.
 * { roleMatrix: { view, edit }, approvalLimits: { manage } }
 *
 * Not: Şu an Excel'de rol matrisi için ayrı bir permKey yoksa, view/edit null kalabilir.
 * approvalLimits.manage ise 'settings.approval.setLimit' üzerinden yönetilir.
 */
function buildRoleMatrixPerms() {
  const perms = (rolePermissionsTemplate && rolePermissionsTemplate.permissions) || [];

  const findByLabel = (label) => {
    const p = perms.find((x) => x.label === label);
    return p ? p.key : null;
  };

  const findByKey = (key) => {
    const p = perms.find((x) => x.key === key);
    return p ? p.key : null;
  };

  const roleMatrixViewKey =
    findByKey('settings.roleMatrix.view') || findByLabel('Rol & Yetki Yönetimi Gör');
  const roleMatrixEditKey =
    findByKey('settings.roleMatrix.edit') || findByLabel('Rol & Yetki Yönetimi Düzenle');

  const approvalLimitKey =
    findByKey('settings.approval.setLimit') || findByLabel('Onay Limiti Belirle');

  return {
    roleMatrix: {
      // Template'de yoksa null (rol matrisi perm'i tanımlı değil)
      view: roleMatrixViewKey || null,
      edit: roleMatrixEditKey || null,
    },
    approvalLimits: {
      // Onay limiti perm'i tanımlı değilse null
      manage: approvalLimitKey || null,
    },
  };
}

/**
 * Admin / Sistem modülü için izin key'lerini JSON şablonundan türetir.
 * Teklifbul Rule v1.0 - Admin permissions
 */
function buildAdminPerms() {
  const perms = (rolePermissionsTemplate && rolePermissionsTemplate.permissions) || [];

  const findByLabel = (label) => {
    const p = perms.find((x) => x.label === label);
    return p ? p.key : null;
  };

  const findByKey = (key) => {
    const p = perms.find((x) => x.key === key);
    return p ? p.key : null;
  };

  const metricsViewKey =
    findByKey('admin.metrics.view') || findByLabel('Sistem Metrikleri Gör');
  const errorsViewKey =
    findByKey('admin.errors.view') || findByLabel('Client Hata Raporları Gör');
  const categoryRulesManageKey =
    findByKey('admin.categoryRules.manage') || findByLabel('Kategori Kuralları Yönet');

  return {
    metrics: {
      view: metricsViewKey || 'admin.metrics.view'
    },
    errors: {
      view: errorsViewKey || 'admin.errors.view'
    },
    categoryRules: {
      manage: categoryRulesManageKey || 'admin.categoryRules.manage'
    }
  };
}

const STOCK_PERMS = buildStockPerms();
const INTERIM_PERMS = buildInterimPerms();
const PAYMENTS_PERMS = buildPaymentsPerms();
const EINVOICE_PERMS = buildEinvoicePerms();
const BID_PERMS = buildBidPerms();
const SETTINGS_PERMS = buildSettingsPerms();
const USER_MGMT_PERMS = buildUserMgmtPerms();
const ROLE_MATRIX_PERMS = buildRoleMatrixPerms();
const ADMIN_PERMS = buildAdminPerms();

/**
 * Basit in-memory cache (companyId + roleKey bazlı)
 * key: `${companyId}::${roleKeyInternal}`
 * value: { companyId, roleKeyInternal, loadedAt, perms }
 */
const permCache = new Map();

/**
 * Geçerli kullanıcı context'i için son yüklenen permission state
 * { companyId, roleKey, permissions, isEditor, loadedAt }
 */
let currentState = {
  companyId: /** @type {string | null} */ (null),
  roleKey: /** @type {string | null} */ (null),
  permissions: /** @type {Record<string, boolean>} */ ({}),
  isEditor: false,
  isAdmin: false,
  isOwner: false,
  loadedAt: 0
};

/** Teklifbul Rule v1.0 — Logout / şirket değişiminde permission cache sıfırla */
export function clearPermissionCache() {
  permCache.clear();
  currentState = {
    companyId: null,
    roleKey: null,
    permissions: {},
    isEditor: false,
    isAdmin: false,
    isOwner: false,
    loadedAt: 0
  };
}

function getCacheKey(companyId, roleKeyInternal) {
  return `${companyId}::${roleKeyInternal}`;
}

async function getFirestoreModules() {
  const mod = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js');
  return {
    doc: mod.doc,
    getDoc: mod.getDoc
  };
}

/**
 * Belirli bir companyId + roleKeyInternal için yetki haritasını yükler.
 * Firestore'dan okur; doc yoksa JSON template + default true kuralını uygular.
 * Cache TTL dolmadıysa Firestore'a tekrar gitmez.
 * @param {string} companyId
 * @param {string} roleKeyInternal - Gerçek roleKey veya '__no_role__' gibi fallback
 * @returns {Promise<Record<string, boolean>>}
 */
async function loadRolePermissions(companyId, roleKeyInternal) {
  if (!companyId) {
    logger.warn('loadRolePermissions: companyId eksik', { companyId, roleKeyInternal });
    return {};
  }

  const cacheKey = getCacheKey(companyId, roleKeyInternal);
  const existing = permCache.get(cacheKey);
  const now = Date.now();

  if (existing && now - existing.loadedAt < PERM_CACHE_TTL_MS) {
    return existing.perms;
  }

  try {
    const { doc, getDoc } = await getFirestoreModules();

    const allPermKeys = (rolePermissionsTemplate?.permissions || []).map((p) => p.key);
    const defaults = rolePermissionsTemplate?.matrixDefaults || {};
    const roleDefaults = defaults[roleKeyInternal] || {};

    let docPerms = {};
    try {
      const ref = doc(db, 'companies', companyId, 'rolePermissions', roleKeyInternal);
      const snap = await getDoc(ref);
      const data = snap && snap.exists() ? snap.data() || {} : {};
      // Nested permissions map
      if (data.permissions && typeof data.permissions === 'object' && !Array.isArray(data.permissions)) {
        docPerms = { ...data.permissions };
      }
      // Legacy: setDoc dotted keys (permissions.foo top-level alanları)
      Object.keys(data).forEach((k) => {
        if (k.startsWith('permissions.') && typeof data[k] === 'boolean') {
          const permKey = k.slice('permissions.'.length);
          if (!(permKey in docPerms)) docPerms[permKey] = data[k];
        }
      });
    } catch (e) {
      logger.warn('loadRolePermissions: Firestore doc okunamadı', {
        companyId,
        roleKeyInternal,
        error: e && e.message
      });
    }

    /** @type {Record<string, boolean>} */
    const perms = {};
    allPermKeys.forEach((permKey) => {
      if (typeof docPerms[permKey] === 'boolean') {
        // Firestore override
        perms[permKey] = docPerms[permKey];
      } else if (typeof roleDefaults[permKey] === 'boolean') {
        // Template default
        perms[permKey] = roleDefaults[permKey];
      } else if (permKey === 'admin.categoryRules.manage') {
        // Teklifbul Rule v1.0 - Yeni admin yetkisi için fail-closed varsayılan
        perms[permKey] = false;
      } else {
        // Varsayılan: izin ver (EVET)
        perms[permKey] = true;
      }
    });

    permCache.set(cacheKey, {
      companyId,
      roleKeyInternal,
      loadedAt: now,
      perms
    });

    return perms;
  } catch (error) {
    logger.error('loadRolePermissions hata', { companyId, roleKeyInternal, error });
    return {};
  }
}

/**
 * Permission state'ini başlatır veya günceller.
 * - requireCompanyContext ile companyId + roleKey çözümler
 * - JSON template ve Firestore'u okuyarak permissions map oluşturur
 * - Cache TTL dolmadıysa Firestore'a tekrar gitmez
 * - company/role değişirse cache'i sıfırlar
 *
 * @param {{ redirectOnPending?: boolean }} options
 * @returns {Promise<{ companyId: string; roleKey: string | null; permissions: Record<string, boolean>; isEditor: boolean } | null>}
 */
export async function initPermissions(options = {}) {
  const { redirectOnPending = true } = options || {};

  try {
    const ctx = await requireCompanyContext({ redirectOnPending });
    if (!ctx || !ctx.companyId) {
      logger.warn('initPermissions: company context alınamadı');
      return null;
    }

    const userData = ctx.userDocData || {};
    const roleKey = userData.companyRoleKey || userData.companyRole || null;
    const companyId = ctx.companyId;
    const roleKeyInternal = roleKey || '__no_role__';

    const prevCompanyId = currentState.companyId;
    const prevRoleKeyInternal = currentState.roleKey ? currentState.roleKey : '__no_role__';

    if (prevCompanyId && (prevCompanyId !== companyId || prevRoleKeyInternal !== roleKeyInternal)) {
      // Şirket veya rol değiştiğinde cache'i sıfırla
      permCache.clear();
      logger.info('initPermissions: company/role değişti, permission cache temizlendi', {
        prevCompanyId,
        prevRoleKeyInternal,
        companyId,
        roleKeyInternal
      });
    }

    const perms = await loadRolePermissions(companyId, roleKeyInternal);
    const isEditor = !!(roleKey && ROLE_PERMISSIONS_EDITORS.has(roleKey));
    const isPremium = !!(userData.isPremium === true || userData.isPremium === 'true' || userData.isPremium === 1);
    let isAdmin = false;
    try {
      const tokenResult = await auth.currentUser?.getIdTokenResult();
      const claims = tokenResult?.claims || {};
      isAdmin = claims.superAdmin === true || claims.admin === true || claims.isAdmin === true || claims.role === 'admin';
    } catch (_claimErr) {
      isAdmin = false;
    }
    const email = String(auth.currentUser?.email || '').toLowerCase();
    const adminEmails = String((typeof window !== 'undefined' && window.ADMIN_EMAILS) || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (email && adminEmails.includes(email)) isAdmin = true;
    const uid = auth.currentUser?.uid || null;
    const companyDoc = ctx.companyDocData || {};
    const isOwner = !!(
      uid && (
        companyDoc.ownerId === uid ||
        companyDoc.ownerUid === uid
      )
    );

    currentState = {
      companyId,
      roleKey,
      permissions: perms,
      isEditor,
      isAdmin,
      isOwner,
      isPremium,
      loadedAt: Date.now()
    };

    return {
      companyId,
      roleKey,
      permissions: perms,
      isEditor,
      isAdmin,
      isOwner,
      isPremium
    };
  } catch (error) {
    logger.error('initPermissions hata', error);
    toast.error(MESSAGES.ERROR_PERMISSION || 'Yetki bilgileri yüklenirken bir hata oluştu');
    return null;
  }
}

/**
 * Belirli bir permKey için izin kontrolü yapar.
 * Teklifbul Rule v1.0 — Fail-closed: state yok / bilinmeyen key / hata → false
 *
 * @param {string} permKey
 * @returns {boolean}
 */
export function can(permKey) {
  if (!permKey) return false;

  try {
    if (!currentState.companyId) {
      logger.warn('can(): permissions state henüz init edilmemiş, varsayılan false (fail-closed)', {
        permKey,
        uid: auth.currentUser?.uid || null
      });
      return false;
    }

    // Teklifbul Rule v1.0 - Admin / şirket sahibi / yönetim rolleri kilitlenmesin
    if (currentState.isAdmin || currentState.isOwner || currentState.isEditor) return true;

    const value = currentState.permissions[permKey];
    if (typeof value === 'boolean') return value;

    logger.warn('can(): permKey bulunamadı, varsayılan false (fail-closed)', {
      permKey,
      companyId: currentState.companyId,
      roleKey: currentState.roleKey
    });
    return false;
  } catch (error) {
    logger.error('can() hata', error);
    return false;
  }
}

/**
 * Yetki gerektiren bir işlemden önce çağrılır.
 * - Gerekirse initPermissions() çağırarak state'i hazırlar
 * - Yetki yoksa toast ve opsiyonel redirect yapar
 *
 * @param {string} permKey
 * @param {{ toastMessage?: string; redirectTo?: string }} options
 * @returns {Promise<boolean>} true: izin var, false: bloklandı
 */
export async function requirePerm(permKey, options = {}) {
  const { toastMessage, redirectTo } = options || {};

  if (!permKey) return true;

  try {
    // Eğer henüz state yoksa veya TTL dolmuşsa, yeniden init et
    const now = Date.now();
    const ttlExpired = !currentState.loadedAt || now - currentState.loadedAt > PERM_CACHE_TTL_MS;
    if (!currentState.companyId || ttlExpired) {
      await initPermissions({ redirectOnPending: true });
    }

    if (!currentState.companyId) {
      // requireCompanyContext zaten toast/redirect ile kullanıcıyı bilgilendirdi
      return false;
    }

    const allowed = can(permKey);
    if (allowed) return true;

    const msg =
      toastMessage ||
      MESSAGES.ERROR_PERMISSION_DENIED ||
      MESSAGES.ERROR_PERMISSION ||
      'Bu işlem için yetkiniz yok';

    toast.error(msg);
    logger.warn('Permission denied', {
      permKey,
      companyId: currentState.companyId,
      roleKey: currentState.roleKey,
      uid: auth.currentUser?.uid || null
    });

    if (redirectTo && typeof window !== 'undefined') {
      try {
        window.location.href = redirectTo;
      } catch (_) {
        // ignore
      }
    }

    return false;
  } catch (error) {
    logger.error('requirePerm hata', error);
    const msg =
      toastMessage ||
      MESSAGES.ERROR_PERMISSION ||
      MESSAGES.ERROR_GENERAL ||
      'Bu işlem için yetkiniz yok';
    toast.error(msg);

    if (redirectTo && typeof window !== 'undefined') {
      try {
        window.location.href = redirectTo;
      } catch (_) {
        // ignore
      }
    }

    return false;
  }
}

/**
 * Belirli bir permKey'in hem template'te tanımlı hem de izinli olmasını zorunlu kılar.
 * - permKey null/undefined ise: "şablon eksik" kabul edilir, toast + warn log ve false döner
 * - permKey dolu ise can(permKey) sonucunu döner
 *
 * Bu helper özellikle payments / einvoice / edespatch / AI gibi
 * "eksik template varsa kesin kapalı" olması gereken modüller için kullanılır.
 *
 * @param {string | null | undefined} permKey
 * @param {string} [fallbackMessage]
 * @returns {boolean}
 */
export function mustHavePerm(permKey, fallbackMessage) {
  if (!permKey) {
    const msg =
      fallbackMessage ||
      MESSAGES?.ERROR_PERMISSION_TEMPLATE_MISSING ||
      'Yetki şablonu eksik (Excel export gerekli).';
    try {
      toast.error(msg);
    } catch (_) {
      // ignore toast errors
    }
    try {
      logger.warn('PERM_TEMPLATE_MISSING', { permKey });
    } catch (_) {
      // ignore logger errors
    }
    return false;
  }

  return can(permKey);
}

/**
 * requirePerm ile aynı davranır, ancak permKey'in template'te tanımlı olmasını zorunlu kılar.
 * - permKey null/undefined ise: "şablon eksik" toast + warn log ve false döner
 * - aksi halde requirePerm(permKey, { toastMessage }) çağrılır
 *
 * @param {string | null | undefined} permKey
 * @param {{ toastMessage?: string }} [options]
 * @returns {Promise<boolean>}
 */
export async function requireExistingPerm(permKey, options = {}) {
  const { toastMessage } = options || {};

  if (!permKey) {
    const msg =
      toastMessage ||
      MESSAGES?.ERROR_PERMISSION_TEMPLATE_MISSING ||
      'Yetki şablonu eksik (Excel export gerekli).';
    try {
      toast.error(msg);
    } catch (_) {
      // ignore toast errors
    }
    try {
      logger.warn('PERM_TEMPLATE_MISSING', { permKey });
    } catch (_) {
      // ignore logger errors
    }
    return false;
  }

  return requirePerm(permKey, { toastMessage });
}

/**
 * Debug / test için mevcut permission state ve cache dump'ını döndürür.
 * @returns {{ companyId: string | null; roleKey: string | null; isEditor: boolean; permissions: Record<string, boolean>; cache: Record<string, any> }}
 */
export function getAllPermissions() {
  /** @type {Record<string, any>} */
  const cacheDump = {};

  for (const [key, entry] of permCache.entries()) {
    cacheDump[key] = {
      companyId: entry.companyId,
      roleKeyInternal: entry.roleKeyInternal,
      loadedAt: entry.loadedAt,
      permissions: { ...(entry.perms || {}) }
    };
  }

  return {
    companyId: currentState.companyId,
    roleKey: currentState.roleKey,
    isEditor: currentState.isEditor,
    permissions: { ...(currentState.permissions || {}) },
    cache: cacheDump
  };
}

// Dev ortamında hızlı test için global debug objesi
if (typeof window !== 'undefined') {
  const isDev =
    (typeof import.meta !== 'undefined' && import.meta.env && (import.meta.env.DEV || import.meta.env.MODE === 'development')) ||
    window.location.hostname === 'localhost';

  if (isDev) {
     
    window.__perm = {
      initPermissions,
      can,
      requirePerm,
      dump: getAllPermissions
    };
  }
}

/**
 * Demand sayfalarında kullanılacak permKey mapping'ini döndürür.
 * { purchase: { view, create, edit }, internal: { view, create, edit } }
 */
export function getDemandPerms() {
  return DEMAND_PERMS;
}

/**
 * Stok modülünde kullanılacak permKey mapping'ini döndürür.
 * {
 *   view,
 *   create,
 *   edit,
 *   movements: { use, in, out, transfer, adjust },
 *   import,
 *   bulkPriceUpdate,
 *   reports,
 *   allowNegative: { manage }
 * }
 */
export function getStockPerms() {
  return STOCK_PERMS;
}

/**
 * Teklif (bids) modülünde kullanılacak permKey mapping'ini döndürür.
 * { view, create, edit, approve, compare }
 */
export function getBidPerms() {
  return BID_PERMS;
}

/**
 * Hakediş modülünde kullanılacak permKey mapping'ini döndürür.
 * { view, manage }
 */
export function getInterimPerms() {
  return INTERIM_PERMS;
}

/**
 * Ödeme talep (payments) modülünde kullanılacak permKey mapping'ini döndürür.
 * { view, create, edit, approve, export }
 */
export function getPaymentsPerms() {
  return PAYMENTS_PERMS;
}

/**
 * E-Fatura / E-İrsaliye modülünde kullanılacak permKey mapping'ini döndürür.
 * {
 *   einvoice: { view, manage },
 *   edespatch: { view, manage }
 * }
 */
export function getEinvoicePerms() {
  return EINVOICE_PERMS;
}

/**
 * AI modülünde (AI asistan, AI destekli özellikler) kullanılacak permKey mapping'ini döndürür.
 * { use }
 */
export function getAiPerms() {
  // Şu an tek alan: AI Asistan Kullan
  const settingsAi = SETTINGS_PERMS && SETTINGS_PERMS.ai ? SETTINGS_PERMS.ai.use : null;
  return {
    use: settingsAi || null
  };
}

/**
 * Ayarlar sekmesinde (firma bilgileri, adresler, premium, AI) kullanılacak permKey mapping'ini döndürür.
 * {
 *   companyInfo: { view, edit },
 *   companyProfile: { edit },
 *   addresses: { view, manage },
 *   premium: { purchase },
 *   ai: { use }
 * }
 */
export function getSettingsPerms() {
  return SETTINGS_PERMS;
}

/**
 * Şirket kullanıcıları yönetimi için permKey mapping'ini döndürür.
 * { userInvites: { approve }, userRoles: { edit } }
 */
export function getUserMgmtPerms() {
  return USER_MGMT_PERMS;
}

/**
 * Rol matrisi ve onay limitleri için permKey mapping'ini döndürür.
 * { roleMatrix: { view, edit }, approvalLimits: { manage } }
 */
export function getRoleMatrixPerms() {
  return ROLE_MATRIX_PERMS;
}

/**
 * Admin / Sistem modülü için permKey mapping'ini döndürür.
 * Teklifbul Rule v1.0 - Admin permissions
 * { metrics: { view } }
 */
export function getAdminPerms() {
  return ADMIN_PERMS;
}

/**
 * Satış (sales) modülü için izin key'lerini JSON şablonundan türetir.
 * Hard-coded permKey yerine tek kaynaktan (rolePermissionsTemplate) okunur.
 */
function buildSalesPerms() {
  const perms = (rolePermissionsTemplate && rolePermissionsTemplate.permissions) || [];

  const findByLabel = (label) => {
    const p = perms.find((x) => x.label === label);
    return p ? p.key : null;
  };

  const findByKey = (key) => {
    const p = perms.find((x) => x.key === key);
    return p ? p.key : null;
  };

  const viewKey = findByKey('sales.view') || findByLabel('Satış Gör');
  const createKey = findByKey('sales.create') || findByLabel('Satış Oluştur');
  const editKey = findByKey('sales.edit') || findByLabel('Satış Düzenle');
  const editAfterApproveKey = findByKey('sales.edit_after_approve') || findByLabel('Onay Sonrası Satış Düzenle');
  const approveKey = findByKey('sales.approve') || findByLabel('Satış Onay');
  const cancelKey = findByKey('sales.cancel') || findByLabel('Satış İptal');
  const archiveKey = findByKey('sales.archive') || findByLabel('Satış Arşivle');
  const deleteKey = findByKey('sales.delete') || findByLabel('Satış Sil');
  const createInvoiceKey = findByKey('sales.invoice') || findByLabel('Fatura Oluştur');
  const createDeliveryNoteKey = findByKey('sales.delivery') || findByLabel('İrsaliye Oluştur');
  const recordPaymentKey = findByKey('sales.recordPayment') || findByLabel('Ödeme Kaydet');

  return {
    // Template'de yoksa null; uydurma key yok
    view: viewKey || null,
    create: createKey || null,
    edit: editKey || null,
    editAfterApprove: editAfterApproveKey || null,
    approve: approveKey || null,
    cancel: cancelKey || null,
    archive: archiveKey || null,
    delete: deleteKey || null,
    createInvoice: createInvoiceKey || null,
    createDeliveryNote: createDeliveryNoteKey || null,
    recordPayment: recordPaymentKey || null
  };
}

const SALES_PERMS_BUILT = buildSalesPerms();

/**
 * Satış (sales) modülünde kullanılacak permKey mapping'ini döndürür.
 * { view, create, edit, editAfterApprove, approve, cancel, archive, delete, createInvoice, createDeliveryNote, recordPayment }
 */
export function getSalesPerms() {
  return SALES_PERMS_BUILT;
}

/**
 * Müşteri (customers) modülü için izin key'lerini JSON şablonundan türetir.
 * Hard-coded permKey yerine tek kaynaktan (rolePermissionsTemplate) okunur.
 */
function buildCustomerPerms() {
  const perms = (rolePermissionsTemplate && rolePermissionsTemplate.permissions) || [];

  const findByLabel = (label) => {
    const p = perms.find((x) => x.label === label);
    return p ? p.key : null;
  };

  const findByKey = (key) => {
    const p = perms.find((x) => x.key === key);
    return p ? p.key : null;
  };

  const viewKey = findByKey('customers.view') || findByLabel('Müşteri Gör');
  const createKey = findByKey('customers.create') || findByLabel('Müşteri Oluştur');
  const editKey = findByKey('customers.edit') || findByLabel('Müşteri Düzenle');
  const deleteKey = findByKey('customers.delete') || findByLabel('Müşteri Sil');
  const archiveKey = findByKey('customers.archive') || findByLabel('Müşteri Arşivle');

  return {
    // Template'de yoksa null; uydurma key yok
    view: viewKey || null,
    create: createKey || null,
    edit: editKey || null,
    delete: deleteKey || null,
    archive: archiveKey || null
  };
}

const CUSTOMER_PERMS = buildCustomerPerms();

/**
 * Müşteri (customers) modülünde kullanılacak permKey mapping'ini döndürür.
 * { view, create, edit, delete, archive }
 */
export function getCustomerPerms() {
  return CUSTOMER_PERMS;
}

/**
 * Enterprise+ UI Gizleme ve Lock Mekanizması
 * @param {HTMLElement|Document} container Aranacak HTML düğümü.
 * Bu fonksiyon, `data-perm-require` attribütü taşıyan tüm DOM elemanlarını tarar,
 * eğer kullanıcının yetkisi yoksa kalıcı olarak ekrandan 'gizler' (hidden).
 */
export function applyEnterpriseUIRules(container = document) {
  const elements = container.querySelectorAll('[data-perm-require]');
  elements.forEach(el => {
    const permKey = el.getAttribute('data-perm-require');
    if (permKey && !can(permKey)) {
      // Disabled değil, tamamen dom'dan gizle. Enterprise standardı.
      el.style.display = 'none';
      el.classList.add('enterprise-hidden');
    }
  });

  // Soft-Lock Enforcer (Örn: form onayı sonrası donan inputlar)
  const lockableForms = container.querySelectorAll('.enterprise-soft-lock[data-status="approved"]');
  lockableForms.forEach(form => {
    form.querySelectorAll('input, select, textarea').forEach(input => {
      input.setAttribute('readonly', 'true');
      if (input.tagName === 'SELECT') {
        input.setAttribute('disabled', 'true');
      }
    });
    // Onay sonrası hard delete butonları yok edilir
    form.querySelectorAll('.btn-delete, [data-action="delete"]').forEach(btn => {
      btn.style.display = 'none';
    });
  });
}

