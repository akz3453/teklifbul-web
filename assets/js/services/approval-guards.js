// Teklifbul Rol & Onay Sistemi - Guard Fonksiyonları
// Bu dosya PO (sipariş) oluşturma ve e-imza onay kontrollerini sağlar

import { db } from "../../firebase.js";
// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../../../src/shared/log/logger.js';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

// Global Onay Politikası Konfigürasyonu (varsayılan) - Teklifbul Rol & Onay Sistemi
export const defaultApprovalPolicy = {
  require_at_least_one_top_approver: true,
  top_approver_roles: [
    'buyer:genel_mudur',
    'buyer:genel_mudur_yardimcisi',
    'buyer:ceo',
    'buyer:isveren',
    'buyer:yonetim_kurulu_baskani',
    'buyer:yonetim_kurulu_uyesi'
  ],
  reminder_hours: [24, 48],
  strict_top_required: false,
  allowed_final_approver_roles: ['buyer:genel_mudur']
};

// Şirket düzeyindeki approvalPolicy'yi getir, yoksa global'i kullan
export async function getApprovalPolicy(companyId) {
  try {
    if (!companyId) return defaultApprovalPolicy;
    
    const companyDoc = await getDoc(doc(db, 'companies', companyId));
    if (companyDoc.exists()) {
      const companyData = companyDoc.data();
      if (companyData.approvalPolicy) {
        // Şirket düzeyindeki policy'yi global ile birleştir (şirket policy'si öncelikli)
        return {
          ...defaultApprovalPolicy,
          ...companyData.approvalPolicy
        };
      }
    }
    return defaultApprovalPolicy;
  } catch (e) {
    logger.warn('Approval policy yüklenirken hata, varsayılan kullanılıyor', e);
    return defaultApprovalPolicy;
  }
}

// Backward compatibility için export
export const approvalPolicy = defaultApprovalPolicy;

/**
 * Şirkette aktif kullanıcıları listeler
 * @param {string} companyId - Şirket ID
 * @returns {Promise<Array>} Aktif kullanıcılar listesi
 */
export async function listActiveUsers(companyId) {
  try {
    const usersRef = collection(db, 'users');
    
    // Hem companies array hem de companyId field'ını kontrol et
    const usersQuery1 = query(
      usersRef,
      where('companies', 'array-contains', companyId)
    );
    const usersQuery2 = query(
      usersRef,
      where('companyId', '==', companyId)
    );
    
    const [usersSnapshot1, usersSnapshot2] = await Promise.all([
      getDocs(usersQuery1).catch(() => ({ docs: [] })),
      getDocs(usersQuery2).catch(() => ({ docs: [] }))
    ]);
    
    // Kullanıcıları birleştir ve tekilleştir
    const allUsers = new Map();
    [...usersSnapshot1.docs, ...usersSnapshot2.docs].forEach(userDoc => {
      if (!allUsers.has(userDoc.id)) {
        allUsers.set(userDoc.id, userDoc);
      }
    });
    
    const activeUsers = [];
    allUsers.forEach((userDoc) => {
      const userData = userDoc.data();
      // Kullanıcının şirkette aktif olup olmadığını kontrol et
      if (userData.isActive !== false && userData.companyJoinStatus !== 'rejected') {
        activeUsers.push({
          id: userDoc.id,
          ...userData
        });
      }
    });
    
    return activeUsers;
  } catch (e) {
    logger.error('listActiveUsers hatası', e);
    return [];
  }
}

/**
 * Şirkette en az 1 üst onaycı var mı kontrol eder
 * @param {string} companyId - Şirket ID
 * @returns {Promise<boolean>} Üst onaycı varsa true
 */
export async function hasActiveTopApprover(companyId) {
  try {
    const policy = await getApprovalPolicy(companyId);
    const users = await listActiveUsers(companyId);
    const hasTopApprover = users.some(user => {
      const userRole = user.companyRole || user.requestedCompanyRole || '';
      return policy.top_approver_roles.includes(userRole);
    });
    
    return hasTopApprover;
  } catch (e) {
    logger.error('hasActiveTopApprover hatası', e);
    return false;
  }
}

/**
 * Şirkette tek kullanıcı var mı kontrol eder
 * @param {string} companyId - Şirket ID
 * @returns {Promise<boolean>} Tek kullanıcı varsa true
 */
export async function isSingleUserCompany(companyId) {
  try {
    const users = await listActiveUsers(companyId);
    return users.length <= 1;
  } catch (e) {
    logger.error('isSingleUserCompany hatası', e);
    return true; // Hata durumunda güvenli tarafta kal
  }
}

/**
 * PO (sipariş) oluşturmaya izin var mı kontrol eder
 * @param {string} companyId - Şirket ID
 * @returns {Promise<{allowed: boolean, reason?: string}>} İzin durumu ve nedeni
 */
export async function canIssuePO(companyId) {
  try {
    const policy = await getApprovalPolicy(companyId);
    
    // Tek kullanıcı kontrolü
    const isSingleUser = await isSingleUserCompany(companyId);
    if (isSingleUser) {
      return {
        allowed: false,
        reason: 'PO engellendi: Şirkette birden fazla aktif kullanıcı gereklidir. Tek kullanıcılı şirketler yalnızca teklif toplama ve mukayese yapabilir.'
      };
    }
    
    // Üst onaycı kontrolü
    if (policy.require_at_least_one_top_approver) {
      const hasTopApprover = await hasActiveTopApprover(companyId);
      if (!hasTopApprover) {
        return {
          allowed: false,
          reason: 'PO engellendi: Şirkette en az 1 üst onaycı rolüne sahip aktif kullanıcı gereklidir. (Genel Müdür, GMY, CEO, İşveren, YKB, YK Üyesi)'
        };
      }
    }
    
    return { allowed: true };
  } catch (e) {
    logger.error('canIssuePO hatası', e);
    return {
      allowed: false,
      reason: `PO kontrolü sırasında hata oluştu: ${e.message || e}`
    };
  }
}

/**
 * Kullanıcının e-imza ile teklif onaylama yetkisi var mı kontrol eder
 * @param {Object} user - Kullanıcı objesi (userData)
 * @param {Object} rolePermissions - Rol yetkileri nesnesi (settings.html'den)
 * @returns {boolean} E-imza onay yetkisi varsa true
 */
export async function canESignApprove(user, rolePermissions = {}, companyId = null) {
  try {
    const userRole = user.companyRole || user.requestedCompanyRole || '';
    
    // Şirket düzeyindeki policy'yi al
    const policy = companyId ? await getApprovalPolicy(companyId) : defaultApprovalPolicy;
    
    // Rol üst onaycı rollerinden biri mi?
    const isTopApprover = policy.top_approver_roles.includes(userRole);
    if (!isTopApprover) {
      return false;
    }
    
    // Rol yetkilerinde "Teklif Onay (İmza)" izni var mı?
    const rolePerms = rolePermissions[userRole] || {};
    const hasESignPermission = rolePerms['Teklif Onay (İmza)'] === true;
    
    return hasESignPermission;
  } catch (e) {
    logger.error('canESignApprove hatası', e);
    return false;
  }
}

/**
 * Teklifbul Rule v1.0 - Onay Limit Kontrolü
 * Kullanıcının belirli bir tutarda teklif onaylama yetkisi olup olmadığını kontrol eder
 * @param {string} userRole - Kullanıcının rolü (örn: 'buyer:genel_mudur')
 * @param {number} amount - Teklif tutarı (TL cinsinden)
 * @param {Object} approvalPolicy - Onay politikası (getApprovalPolicy'den dönen)
 * @returns {Object} { allowed: boolean, reason?: string, requiredRole?: string }
 */
export function canUserApproveAmount(userRole, amount, approvalPolicy) {
  try {
    // Sınırsız yetkiye sahip roller (CEO, İşveren, Yönetim Kurulu Başkanı, Genel Müdür)
    const unlimitedApprovalRoles = [
      'buyer:ceo',
      'buyer:isveren',
      'buyer:yonetim_kurulu_baskani',
      'buyer:genel_mudur'
    ];
    
    // Kullanıcı sınırsız yetkiye sahip rollerden birine sahipse, her tutarda onay verebilir
    if (unlimitedApprovalRoles.includes(userRole)) {
      return {
        allowed: true,
        reason: `${userRole} rolü sınırsız onay yetkisine sahiptir.`
      };
    }
    
    // Approval limits kontrolü
    const approvalLimits = approvalPolicy?.approval_limits || [];
    
    if (approvalLimits.length === 0) {
      // Limit tanımlı değilse, sınırsız yetkiye sahip roller dışında onay verilemez
      return {
        allowed: false,
        reason: 'Onay limiti tanımlanmamış. Sadece CEO, İşveren, Yönetim Kurulu Başkanı ve Genel Müdür onay verebilir.'
      };
    }
    
    // Kullanıcının rolü için en uygun limiti bul
    let userLimit = null;
    
    // Önce tam eşleşme kontrol et
    for (const limit of approvalLimits) {
      if (limit.role === userRole && limit.maxAmount !== null) {
        userLimit = limit;
        break;
      }
    }
    
    // Eğer tam eşleşme yoksa, kullanıcının rolü için limit yok demektir
    if (!userLimit) {
      return {
        allowed: false,
        reason: `${userRole} rolü için onay limiti tanımlanmamış.`,
        requiredRole: 'buyer:genel_mudur' // Varsayılan olarak Genel Müdür gerekir
      };
    }
    
    // Tutar kontrolü
    if (amount <= userLimit.maxAmount) {
      return {
        allowed: true,
        reason: `${userRole} rolü ${userLimit.maxAmount.toLocaleString('tr-TR')}₺'ye kadar onay verebilir.`
      };
    } else {
      // Üst düzey rol gerekiyor
      const unlimitedRoles = ['buyer:genel_mudur', 'buyer:ceo', 'buyer:isveren', 'buyer:yonetim_kurulu_baskani'];
      return {
        allowed: false,
        reason: `${userRole} rolü ${userLimit.maxAmount.toLocaleString('tr-TR')}₺'den fazla tutarları onaylayamaz. Üst düzey yönetici onayı gereklidir.`,
        requiredRole: unlimitedRoles[0] // Genel Müdür veya üstü gerekiyor
      };
    }
  } catch (e) {
    logger.error('canUserApproveAmount hatası', e);
    return {
      allowed: false,
      reason: `Onay kontrolü sırasında hata oluştu: ${e.message || e}`
    };
  }
}

/**
 * Teklifbul Rule v1.0 - Onay Yetkisi Kontrolü (Async - Şirket Policy'si ile)
 * Kullanıcının belirli bir tutarda teklif onaylama yetkisi olup olmadığını kontrol eder
 * @param {string} userRole - Kullanıcının rolü (örn: 'buyer:genel_mudur')
 * @param {number} amount - Teklif tutarı (TL cinsinden)
 * @param {string} companyId - Şirket ID
 * @returns {Promise<Object>} { allowed: boolean, reason?: string, requiredRole?: string }
 */
export async function checkApprovalLimit(userRole, amount, companyId) {
  try {
    const approvalPolicy = await getApprovalPolicy(companyId);
    return canUserApproveAmount(userRole, amount, approvalPolicy);
  } catch (e) {
    logger.error('checkApprovalLimit hatası', e);
    return {
      allowed: false,
      reason: `Onay limit kontrolü sırasında hata oluştu: ${e.message || e}`
    };
  }
}

/**
 * Audit kaydı oluşturur
 * @param {Object} auditData - Audit verisi
 * @returns {Promise<void>}
 */
export async function createAuditLog(auditData) {
  try {
    const { 
      entity_type, 
      entity_id, 
      action, 
      actor_user_id, 
      actor_role_key, 
      result, 
      reason, 
      metadata = {},
      ip = null
    } = auditData;
    
    await addDoc(collection(db, 'audit'), {
      entity_type,
      entity_id,
      action,
      actor_user_id,
      actor_role_key,
      result, // 'success' | 'failed' | 'blocked'
      reason: reason || null,
      metadata,
      ip,
      created_at: serverTimestamp()
    });
  } catch (e) {
    logger.error('createAuditLog hatası', e);
    // Audit kaydı hatası kritik değil, sadece logla
  }
}

