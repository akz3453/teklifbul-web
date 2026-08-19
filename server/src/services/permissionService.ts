/**
 * Permission Service
 * Teklifbul Rule v1.0 - Backend Permission Guard
 * 
 * Kullanıcının rolüne göre permission'ları resolve eder
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { logger } from '../../../src/shared/log/logger.js';
import type { AuthenticatedRequest } from '../../middleware/auth.js';
import { getFromReqCache, setInReqCache } from '../utils/requestCache.js';
import { ttlCache, CacheKeys } from '../utils/ttlCache.js';
// Teklifbul Rule v1.0 - users/{uid} cache
import { getCachedUserDoc } from '../utils/userDocCache.js';
import type { Request } from 'express';
import { getAdminDb } from '../../utils/firestore.js';
import {
  resolveTrustedCompanyIdAsync,
  userBelongsToCompanyAsync,
} from '../../utils/companyAccess.js';

// ES modules için __dirname (server/src/services/ konumundan)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Role permissions template cache (process-level, already cached)
let rolePermissionsTemplate: any = null;

/**
 * Template JSON aday yolları — Cloud Functions cwd/packaging farklılıklarına dayanıklı
 * Teklifbul Rule v1.0
 */
function resolveRolePermissionsTemplatePath(): string | null {
  const candidates = [
    // Derlenmiş dist: functions/dist/server/src/services → ../../../../src/shared/data
    join(__dirname, '../../../../src/shared/data/rolePermissionsTemplate.json'),
    // Repo kökü / local api
    join(process.cwd(), 'src', 'shared', 'data', 'rolePermissionsTemplate.json'),
    join(process.cwd(), '..', 'src', 'shared', 'data', 'rolePermissionsTemplate.json'),
    // functions paketinde file:.. bağımlılığı
    join(process.cwd(), 'node_modules', 'teklifbul-web', 'src', 'shared', 'data', 'rolePermissionsTemplate.json'),
    join(process.cwd(), '..', 'node_modules', 'teklifbul-web', 'src', 'shared', 'data', 'rolePermissionsTemplate.json'),
  ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Role permissions template'i yükler (lazy loading + TTL cache)
 * Teklifbul Rule v1.0 - Process-level cache
 */
function loadRolePermissionsTemplate(): any {
  // Process-level cache (zaten var, korunuyor)
  if (rolePermissionsTemplate) {
    return rolePermissionsTemplate;
  }

  // TTL cache kontrolü (opsiyonel, file system read zaten hızlı)
  const cacheKey = CacheKeys.rolePermsTemplate();
  const cached = ttlCache.get<any>(cacheKey);
  if (cached) {
    rolePermissionsTemplate = cached;
    if (process.env.DEBUG_CACHE === 'true') {
      logger.debug('cache hit', { key: cacheKey });
    }
    return cached;
  }

  try {
    // 1) createRequire ile paket içinden (en güvenilir Cloud Functions yolu)
    try {
      const fromPkg = require('teklifbul-web/src/shared/data/rolePermissionsTemplate.json');
      if (fromPkg?.matrixDefaults) {
        rolePermissionsTemplate = fromPkg;
        ttlCache.set(cacheKey, rolePermissionsTemplate, 5 * 60 * 1000);
        logger.info('Role permissions template yüklendi (package require)');
        return rolePermissionsTemplate;
      }
    } catch {
      // package resolve başarısız olabilir; dosya yollarına düş
    }

    const templatePath = resolveRolePermissionsTemplatePath();
    if (!templatePath) {
      logger.error('Role permissions template bulunamadı (tüm aday yollar denendi)');
      return null;
    }

    const templateContent = readFileSync(templatePath, 'utf8');
    rolePermissionsTemplate = JSON.parse(templateContent);

    // TTL cache'e kaydet (5 dakika, file değişirse restart gerekir)
    ttlCache.set(cacheKey, rolePermissionsTemplate, 5 * 60 * 1000);

    logger.info('Role permissions template yüklendi', { templatePath });
    return rolePermissionsTemplate;
  } catch (error: any) {
    logger.error('Role permissions template yüklenemedi', error);
    return null;
  }
}

/**
 * Kullanıcının company membership rolünü alır
 * Teklifbul Rule v1.0 - Request-scope + TTL cache
 */
async function getUserCompanyRole(
  userId: string,
  companyId: string,
  req?: Request
): Promise<string | null> {
  try {
    // Request-scope cache kontrolü
    if (req) {
      const cacheKey = CacheKeys.membership(companyId, userId);
      const cached = getFromReqCache<string>(req, cacheKey);
      if (cached !== null) {
        if (process.env.DEBUG_CACHE === 'true') {
          logger.debug('cache hit (request)', { key: cacheKey });
        }
        return cached;
      }
    }

    // TTL cache kontrolü
    const ttlCacheKey = CacheKeys.membership(companyId, userId);
    const ttlCached = ttlCache.get<string>(ttlCacheKey);
    if (ttlCached !== null) {
      if (process.env.DEBUG_CACHE === 'true') {
        logger.debug('cache hit (ttl)', { key: ttlCacheKey });
      }
      // Request cache'e de kaydet
      if (req) {
        setInReqCache(req, CacheKeys.membership(companyId, userId), ttlCached);
      }
      return ttlCached;
    }

    // Cache miss - Firestore'dan çek
    if (process.env.DEBUG_CACHE === 'true') {
      logger.debug('cache miss', { key: ttlCacheKey });
    }

    // Teklifbul Rule v1.0 - cached user doc (req-scope + 30s TTL)
    const userDoc = await getCachedUserDoc(userId, req);
    if (!userDoc.exists || !userDoc.data) {
      logger.warn('getUserCompanyRole: User not found', { userId });
      return null;
    }

    const userData = userDoc.data;
    const userCompanyId = userData?.companyId;
    const userActiveCompanyId = userData?.activeCompanyId;

    // Company kontrolü - Teklifbul Rule v1.0 - solo- ile başlayan activeCompanyId desteği
    // 1. Eğer requested companyId normal ise (solo- ile başlamıyorsa), userCompanyId ile eşleşmeli
    // 2. Eğer requested companyId solo- ile başlıyorsa, userActiveCompanyId ile eşleşmeli
    // 3. Her iki durumda da, eğer userCompanyId yoksa userActiveCompanyId kullanılabilir
    let companyMatches = false;
    
    if (companyId.startsWith('solo-')) {
      companyMatches = userActiveCompanyId === companyId;
    } else {
      companyMatches = await userBelongsToCompanyAsync(userData, companyId, userId);
    }

    if (!companyMatches) {
      logger.warn('getUserCompanyRole: Company mismatch', {
        userId,
        userCompanyId,
        userActiveCompanyId,
        requestedCompanyId: companyId,
        isSoloRequest: companyId.startsWith('solo-'),
        companyIdMatch: userCompanyId === companyId,
        activeCompanyIdMatch: userActiveCompanyId === companyId
      });
      return null;
    }

    // Rol SoT: companies/{id}/members/{uid}.approvedRole — user.companyRoleKey self-write olmasın
    let roleCode: string | null = null;
    try {
      const db = await getAdminDb();
      if (db && !companyId.startsWith('solo-')) {
        const memberSnap = await db.collection('companies').doc(companyId).collection('members').doc(userId).get();
        if (memberSnap.exists) {
          const memberData = memberSnap.data() || {};
          roleCode = memberData.approvedRole || memberData.companyRoleKey || null;
        }
      }
    } catch (memberErr) {
      logger.warn('getUserCompanyRole: members SoT okunamadı, user fallback', memberErr);
    }

    if (!roleCode) {
      roleCode = userData?.companyRoleKey || null;
    }
    
    // Eğer companyRoleKey yoksa, companyRole ve companyRoleType'dan oluştur
    if (!roleCode && userData?.companyRole && userData?.companyRoleType) {
      roleCode = `${userData.companyRoleType}:${userData.companyRole}`;
      logger.info('getUserCompanyRole: Role companyRole ve companyRoleType\'dan oluşturuldu', {
        userId,
        companyRole: userData.companyRole,
        companyRoleType: userData.companyRoleType,
        finalRoleCode: roleCode
      });
    } else if (!roleCode && userData?.companyRole) {
      // Fallback: Sadece companyRole varsa, varsayılan olarak buyer kabul et
      // (Eski veriler için)
      const roleType = userData?.companyRoleType || 'buyer';
      roleCode = `${roleType}:${userData.companyRole}`;
      logger.info('getUserCompanyRole: Role sadece companyRole\'den oluşturuldu (fallback)', {
        userId,
        companyRole: userData.companyRole,
        roleType,
        finalRoleCode: roleCode
      });
    }
    
    // Eğer roleCode hala null ise, logla
    if (!roleCode) {
      logger.warn('getUserCompanyRole: Role bulunamadı', {
        userId,
        companyId,
        userDataKeys: Object.keys(userData || {}),
        companyRoleKey: userData?.companyRoleKey,
        companyRole: userData?.companyRole,
        companyRoleType: userData?.companyRoleType
      });
    }
    
    // Cache'e kaydet
    if (roleCode) {
      // TTL cache (30 saniye)
      ttlCache.set(ttlCacheKey, roleCode, 30 * 1000);
      // Request cache
      if (req) {
        setInReqCache(req, CacheKeys.membership(companyId, userId), roleCode);
      }
    }
    
    return roleCode;
  } catch (error: any) {
    logger.error('getUserCompanyRole: Error', error);
    return null;
  }
}

/**
 * Teklifbul Rule v1.0 — işveren / üst yönetim satış okuma fallback
 */
function isIsverenRole(roleCode: string | null | undefined): boolean {
  if (!roleCode || typeof roleCode !== 'string') return false;
  const r = roleCode.toLowerCase();
  return (
    r === 'isveren' ||
    r.endsWith(':isveren') ||
    r.includes('yonetim_kurulu') ||
    r.endsWith(':ceo') ||
    r.includes('genel_mudur') ||
    r.includes('sirket_sahibi')
  );
}

function isSalesReadPerm(permKey: string): boolean {
  return permKey === 'sales.view' || permKey === 'sales.create' || permKey === 'sales.edit';
}

/**
 * Kullanıcının belirli bir permission'a sahip olup olmadığını kontrol eder
 * Teklifbul Rule v1.0 - Request-scope cache desteği
 */
export async function hasPermission(
  userId: string,
  companyId: string,
  permKey: string,
  req?: Request
): Promise<boolean> {
  try {
    const template = loadRolePermissionsTemplate();
    if (!template || !template.matrixDefaults) {
      logger.warn('hasPermission: Template not loaded', { userId, companyId, permKey });
      const roleCodeFallback = await getUserCompanyRole(userId, companyId, req);
      if (isIsverenRole(roleCodeFallback) && isSalesReadPerm(permKey)) {
        logger.warn('hasPermission: isveren sales fallback (template missing)', {
          roleCode: roleCodeFallback,
          permKey
        });
        return true;
      }
      return false;
    }

    // Kullanıcının rolünü al (cache ile)
    const roleCode = await getUserCompanyRole(userId, companyId, req);
    if (!roleCode) {
      logger.warn('hasPermission: Role not found', { userId, companyId, permKey });
      return false;
    }

    // Role'un permission matrix'ini al
    let rolePermissions = template.matrixDefaults[roleCode];
    if (!rolePermissions) {
      // Eski format: "isveren" → buyer:isveren dene
      const legacyKey = roleCode.includes(':') ? null : `buyer:${roleCode}`;
      if (legacyKey && template.matrixDefaults[legacyKey]) {
        rolePermissions = template.matrixDefaults[legacyKey];
      }
    }
    if (!rolePermissions) {
      logger.warn('hasPermission: Role permissions not found', {
        userId,
        companyId,
        roleCode,
        permKey,
        availableRoles: Object.keys(template.matrixDefaults).slice(0, 10) // İlk 10 rolü göster
      });
      // Teklifbul Rule v1.0 — işveren için kritik satış okuma fallback (template eksik anahtar)
      if (isIsverenRole(roleCode) && isSalesReadPerm(permKey)) {
        logger.warn('hasPermission: isveren sales fallback (role matrix missing)', { roleCode, permKey });
        return true;
      }
      return false;
    }

    // Permission kontrolü
    let hasPerm = rolePermissions[permKey] === true;

    // Template eskiyse / sales.* eksikse işveren yine de satış görebilsin
    if (!hasPerm && isIsverenRole(roleCode) && isSalesReadPerm(permKey)) {
      logger.warn('hasPermission: isveren sales fallback (perm missing in matrix)', { roleCode, permKey });
      hasPerm = true;
    }
    
    // Teklifbul Rule v1.0 - Permission kontrolü başarısız olursa detaylı log
    if (!hasPerm) {
      logger.warn('hasPermission: Permission denied', {
        userId,
        companyId,
        roleCode,
        permKey,
        permissionValue: rolePermissions[permKey],
        availablePermissions: Object.keys(rolePermissions).filter(k => rolePermissions[k] === true).slice(0, 10)
      });
    }
    
    // Debug logging (sadece env flag ile)
    if (process.env.DEBUG_PERMISSIONS === 'true') {
      logger.group('Permission Check');
      logger.info('Permission check result', {
        userId,
        companyId,
        roleCode,
        permKey,
        hasPermission: hasPerm
      });
      logger.end();
    }

    return hasPerm;
  } catch (error: any) {
    logger.error('hasPermission: Error', error);
    return false;
  }
}

/**
 * Kullanıcının belirli permission'lardan en az birine sahip olup olmadığını kontrol eder
 * Teklifbul Rule v1.0 - Request-scope cache desteği
 */
export async function hasAnyPermission(
  userId: string,
  companyId: string,
  permKeys: string[],
  req?: Request
): Promise<boolean> {
  if (permKeys.length === 0) {
    return false;
  }

  for (const permKey of permKeys) {
    if (await hasPermission(userId, companyId, permKey, req)) {
      return true;
    }
  }

  return false;
}

/**
 * Request'ten trusted companyId alır.
 * Teklifbul Rule v1.0 — Header/body/query spoof → null (fail-closed); membership zorunlu.
 */
export async function getCompanyIdFromRequest(req: AuthenticatedRequest): Promise<string | null> {
  const userId = req.user?.uid;
  if (!userId) return null;

  let userData: any = null;
  try {
    const userDoc = await getCachedUserDoc(userId, req);
    if (userDoc.exists && userDoc.data) {
      userData = userDoc.data;
    }
  } catch (error) {
    logger.warn('getCompanyIdFromRequest: User doc fetch error', error);
  }

  if (!userData) return null;

  const headerRaw = req.headers['x-company-id'];
  const headerCompanyId = typeof headerRaw === 'string' ? headerRaw : undefined;

  // Header varsa: membership zorunlu, spoof → null
  if (headerCompanyId && headerCompanyId.trim()) {
    return resolveTrustedCompanyIdAsync(userData, headerCompanyId, {
      userId,
      path: req.path,
    });
  }

  // Body / query adayı — yalnızca üyelik varsa kabul
  const bodyCompanyId =
    req.body && typeof (req.body as any).companyId === 'string'
      ? String((req.body as any).companyId).trim()
      : '';
  const queryRaw = req.query?.companyId;
  const queryCompanyId = Array.isArray(queryRaw)
    ? String(queryRaw[0] || '').trim()
    : typeof queryRaw === 'string'
      ? queryRaw.trim()
      : '';

  const candidate = bodyCompanyId || queryCompanyId;
  if (candidate) {
    if (await userBelongsToCompanyAsync(userData, candidate, userId)) {
      return candidate;
    }
    logger.warn('GÜVENLİK: body/query companyId spoof engellendi', {
      userId,
      candidate,
      path: req.path,
    });
    return null;
  }

  return resolveTrustedCompanyIdAsync(userData, null, { userId, path: req.path });
}

/**
 * @deprecated Fail-closed. Use getCompanyIdFromRequest (async, membership-checked).
 */
export function getCompanyIdFromRequestSync(_req: AuthenticatedRequest): string | null {
  return null;
}

