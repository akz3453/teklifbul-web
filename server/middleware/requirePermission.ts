/**
 * Permission Middleware
 * Teklifbul Rule v1.0 - Backend Permission Guard
 * 
 * Route'lara permission kontrolü ekler
 */

import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth.js';
import { hasPermission, getCompanyIdFromRequest } from '../src/services/permissionService.js';
import { logger } from '../../src/shared/log/logger.js';
import { Errors } from '../src/errors/errorCatalog.js';
import { respondError } from '../src/errors/respondError.js';
// Teklifbul Rule v1.0 - Ardisik middleware/route handler cagrilarinda
// users/{uid} cekiminin tek seferde yapilmasi icin request-scope cache
import { getCachedUserDoc } from '../src/utils/userDocCache.js';

/**
 * Tek bir permission gerektiren middleware
 */
export function requirePermission(permKey: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.uid;
      if (!userId) {
        logger.warn('requirePermission: Unauthorized', { permKey, path: req.path });
        return respondError(
          res,
          Errors.forbidden('Kimlik doğrulama gerekli', permKey),
          401 // Override: 401 for auth required
        );
      }

      // CompanyId'yi al (async version with validation)
      let companyId = await getCompanyIdFromRequest(req);

      // Eger request'te yoksa, user doc'tan al (fallback) - cache ile
      if (!companyId) {
        const userDoc = await getCachedUserDoc(userId, req);
        if (userDoc.exists && userDoc.data) {
          companyId = userDoc.data.companyId || userDoc.data.activeCompanyId || null;
        }
      }

      if (!companyId) {
        logger.warn('requirePermission: Company ID not found', {
          userId,
          permKey,
          path: req.path
        });
        return respondError(
          res,
          Errors.forbidden('Sirket bilgisi bulunamadi', permKey)
        );
      }

      // Permission kontrolu (request cache ile)
      const hasPerm = await hasPermission(userId, companyId, permKey, req);

      if (!hasPerm) {
        // Kullanıcının rolünü al (cache ile, daha açıklayıcı hata mesajı için)
        let userRole = null;
        const userDoc = await getCachedUserDoc(userId, req);
        if (userDoc.exists && userDoc.data) {
          userRole = userDoc.data.companyRoleKey || userDoc.data.companyRole || 'bilinmiyor';
        }

        logger.warn('requirePermission: Permission denied', {
          userId,
          companyId,
          permKey,
          userRole,
          path: req.path,
          method: req.method
        });
        return respondError(
          res,
          Errors.forbidden(
            `Bu işlem için yetkiniz yok. Gerekli yetki: ${permKey}. Rolünüz: ${userRole || 'belirlenemedi'}. Lütfen yöneticinizle iletişime geçin.`,
            permKey
          )
        );
      }

      // Permission var, devam et
      next();
    } catch (error: any) {
      logger.error('requirePermission: Error', error);
      return respondError(
        res,
        Errors.internal('Yetki kontrolü sırasında hata oluştu')
      );
    }
  };
}

/**
 * Birden fazla permission'dan en az birini gerektiren middleware
 */
export function requireAnyPermission(permKeys: string[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.uid;
      if (!userId) {
        logger.warn('requireAnyPermission: Unauthorized', { permKeys, path: req.path });
        return respondError(
          res,
          Errors.forbidden('Kimlik doğrulama gerekli', permKeys.join(', ')),
          401 // Override: 401 for auth required
        );
      }

      // CompanyId'yi al (async version with validation)
      let companyId = await getCompanyIdFromRequest(req);

      // Eğer request'te yoksa, user doc'tan al (fallback) - cache ile
      if (!companyId) {
        const userDoc = await getCachedUserDoc(userId, req);
        if (userDoc.exists && userDoc.data) {
          companyId = userDoc.data.companyId || userDoc.data.activeCompanyId || null;
        }
      }

      if (!companyId) {
        logger.warn('requireAnyPermission: Company ID not found', {
          userId,
          permKeys,
          path: req.path
        });
        return respondError(
          res,
          Errors.forbidden('Şirket bilgisi bulunamadı')
        );
      }

      // Permission kontrolü (en az biri olmalı, request cache ile)
      const { hasAnyPermission } = await import('../src/services/permissionService.js');
      const hasPerm = await hasAnyPermission(userId, companyId, permKeys, req);

      if (!hasPerm) {
        logger.warn('requireAnyPermission: Permission denied', {
          userId,
          companyId,
          permKeys,
          path: req.path,
          method: req.method
        });
        return respondError(
          res,
          Errors.forbidden('Bu işlem için yetkiniz yok', permKeys.join(', '))
        );
      }

      // Permission var, devam et
      next();
    } catch (error: any) {
      logger.error('requireAnyPermission: Error', error);
      return respondError(
        res,
        Errors.internal('Yetki kontrolü sırasında hata oluştu')
      );
    }
  };
}

