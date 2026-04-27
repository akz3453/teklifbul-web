/**
 * Permission Service
 * Teklifbul Rule v1.0 - Backend Permission Guard
 * 
 * Kullanıcının rolüne göre permission'ları resolve eder
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../../src/shared/log/logger.js';
import type { AuthenticatedRequest } from '../../middleware/auth.js';
import { getFromReqCache, setInReqCache } from '../utils/requestCache.js';
import { ttlCache, CacheKeys } from '../utils/ttlCache.js';
// Teklifbul Rule v1.0 - users/{uid} cache
import { getCachedUserDoc } from '../utils/userDocCache.js';
import type { Request } from 'express';
import { existsSync } from 'fs';

// ES modules için __dirname (server/src/services/ konumundan)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Role permissions template cache (process-level, already cached)
let rolePermissionsTemplate: any = null;

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
    // Server tarafından erişilebilir path - Teklifbul Rule v1.0 - Fix: Root dizinden path oluştur
    // process.cwd() genelde server/ dizininde, root'a çıkmak için .. kullan
    // Alternatif: __dirname'den root'a çık (TypeScript compile sonrası dist/ altında olabilir)
    const rootDir = process.cwd().endsWith('server') 
      ? join(process.cwd(), '..')
      : process.cwd();
    const templatePath = join(rootDir, 'src', 'shared', 'data', 'rolePermissionsTemplate.json');
    const templateContent = readFileSync(templatePath, 'utf8');
    rolePermissionsTemplate = JSON.parse(templateContent);
    
    // TTL cache'e kaydet (5 dakika, file değişirse restart gerekir)
    ttlCache.set(cacheKey, rolePermissionsTemplate, 5 * 60 * 1000);
    
    logger.info('Role permissions template yüklendi');
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
      // solo- ile başlıyorsa, activeCompanyId ile eşleşmeli
      companyMatches = userActiveCompanyId === companyId;
    } else {
      // Normal companyId ise, companyId ile eşleşmeli (activeCompanyId fallback)
      companyMatches = userCompanyId === companyId || 
                       (userActiveCompanyId && !userActiveCompanyId.startsWith('solo-') && userActiveCompanyId === companyId);
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

    // Role bilgisini al (companyRoleKey veya companyRole)
    // Teklifbul Rule v1.0 - Rol formatı: "buyer:isveren" veya "isveren" (eski format)
    let roleCode = userData?.companyRoleKey || null;
    
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
      return false;
    }

    // Kullanıcının rolünü al (cache ile)
    const roleCode = await getUserCompanyRole(userId, companyId, req);
    if (!roleCode) {
      logger.warn('hasPermission: Role not found', { userId, companyId, permKey });
      return false;
    }

    // Role'un permission matrix'ini al
    const rolePermissions = template.matrixDefaults[roleCode];
    if (!rolePermissions) {
      logger.warn('hasPermission: Role permissions not found', {
        userId,
        companyId,
        roleCode,
        permKey,
        availableRoles: Object.keys(template.matrixDefaults).slice(0, 10) // İlk 10 rolü göster
      });
      return false;
    }

    // Permission kontrolü
    const hasPerm = rolePermissions[permKey] === true;
    
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
 * Şirket bazlı companyId çözümleme helper'ı
 * Teklifbul Rule v1.0 - Shared company ID resolution
 */
function resolveSharedCompanyId(userData: any): string | null {
  const cid = userData?.companyId;
  const aid = userData?.activeCompanyId;
  const arr0 = Array.isArray(userData?.companies) && userData.companies.length ? userData.companies[0] : null;

  // Prefer explicit companyId if present and not a solo/tax doc
  if (cid && typeof cid === "string" && !cid.startsWith("solo-") && !cid.startsWith("tax-")) return cid;

  // If activeCompanyId is solo-* but companyId exists, still use companyId
  if (aid && typeof aid === "string" && aid.startsWith("solo-") && cid) return cid;

  // Otherwise fallback
  return aid || cid || arr0;
}

/**
 * Request'ten companyId'yi alır (body, query veya user'dan)
 * Teklifbul Rule v1.0 - GÜVENLİK: x-company-id header doğrulaması eklendi
 */
export async function getCompanyIdFromRequest(req: AuthenticatedRequest): Promise<string | null> {
  const userId = req.user?.uid;
  if (!userId) return null;

  // Önce kullanıcının gerçek companyId'sini al (cache ile)
  let userCompanyId: string | null = null;
  try {
    const userDoc = await getCachedUserDoc(userId, req);
    if (userDoc.exists && userDoc.data) {
      userCompanyId = resolveSharedCompanyId(userDoc.data);
    }
  } catch (error) {
    logger.warn('getCompanyIdFromRequest: User doc fetch error', error);
  }

  // x-company-id header'ından al (doğrulama ile)
  const headerCompanyId = req.headers['x-company-id'];
  if (headerCompanyId && typeof headerCompanyId === 'string') {
    // GÜVENLİK: Header'daki companyId kullanıcının gerçek companyId'si ile eşleşmeli
    if (userCompanyId && headerCompanyId !== userCompanyId) {
      logger.warn('GÜVENLİK UYARISI: x-company-id header kullanıcının companyId\'si ile eşleşmiyor', {
        userId,
        headerCompanyId,
        userCompanyId,
        path: req.path
      });
      // Header'daki companyId güvenilir değil, kullanıcının gerçek companyId'sini kullan
      // return null; // Veya hata fırlat
    } else {
      // Header doğru, kullan
      return headerCompanyId;
    }
  }

  // Body'den al (doğrulama ile)
  if ((req.body as any)?.companyId) {
    const bodyCompanyId = (req.body as any).companyId;
    // GÜVENLİK: Body'deki companyId kullanıcının gerçek companyId'si ile eşleşmeli
    if (userCompanyId && bodyCompanyId !== userCompanyId) {
      logger.warn('GÜVENLİK UYARISI: Body companyId kullanıcının companyId\'si ile eşleşmiyor', {
        userId,
        bodyCompanyId,
        userCompanyId,
        path: req.path
      });
      return null; // Güvenilir değil
    }
    return bodyCompanyId;
  }

  // Query'den al (doğrulama ile)
  if (req.query?.companyId) {
    const queryCompanyId = Array.isArray(req.query.companyId)
      ? (req.query.companyId[0] as string)
      : (req.query.companyId as string);
    if (queryCompanyId) {
      // GÜVENLİK: Query'deki companyId kullanıcının gerçek companyId'si ile eşleşmeli
      if (userCompanyId && queryCompanyId !== userCompanyId) {
        logger.warn('GÜVENLİK UYARISI: Query companyId kullanıcının companyId\'si ile eşleşmiyor', {
          userId,
          queryCompanyId,
          userCompanyId,
          path: req.path
        });
        return null; // Güvenilir değil
      }
      return queryCompanyId;
    }
  }

  // User'dan al (fallback) - En güvenli yöntem
  return userCompanyId;
}

/**
 * @deprecated Use getCompanyIdFromRequest instead (async version with validation)
 * Request'ten companyId'yi alır (body, query veya user'dan) - Eski versiyon (güvenlik açığı var)
 */
export function getCompanyIdFromRequestSync(req: AuthenticatedRequest): string | null {
  // x-company-id header'ından al (öncelikli)
  const headerCompanyId = req.headers['x-company-id'];
  if (headerCompanyId && typeof headerCompanyId === 'string') {
    return headerCompanyId;
  }

  // Body'den al
  if ((req.body as any)?.companyId) {
    return (req.body as any).companyId;
  }

  // Query'den al
  if (req.query?.companyId) {
    const companyId = Array.isArray(req.query.companyId)
      ? (req.query.companyId[0] as string)
      : (req.query.companyId as string);
    return companyId || null;
  }

  // User'dan al (fallback) - Teklifbul Rule v1.0 - companyId öncelikli, activeCompanyId fallback
  if (req.user?.activeCompanyId) {
    return (req.user.activeCompanyId as string) || null;
  }

  return null;
}

