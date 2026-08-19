/**
 * Firebase Storage Helper Utility
 * Teklifbul Rule v1.0 - DRY, Production Hardening
 * 
 * Firebase Admin Storage bağlantı ve helper fonksiyonları
 */

import { getStorage } from 'firebase-admin/storage';
import { getApps } from 'firebase-admin/app';
import { logger } from '../../src/shared/log/logger.js';

/**
 * Firebase Admin Storage bucket'ını al
 * Teklifbul Rule v1.0 - Güvenli initialization
 */
export async function getAdminStorage(): Promise<any | null> {
  try {
    if (getApps().length === 0) {
      logger.warn('Firebase Admin SDK initialize edilmemiş, Storage kullanılamaz');
      return null;
    }

    const storage = getStorage();
    const bucket = storage.bucket();
    
    return bucket;
  } catch (error: any) {
    logger.error('Firebase Admin Storage initialize hatası', error);
    return null;
  }
}

/**
 * Dosya yükleme helper fonksiyonu
 * Teklifbul Rule v1.0 - Güvenli dosya yükleme
 */
export async function uploadFile(
  bucket: any,
  filePath: string,
  fileBuffer: Buffer,
  contentType: string,
  metadata?: Record<string, string>
): Promise<string> {
  try {
    const file = bucket.file(filePath);
    
    await file.save(fileBuffer, {
      metadata: {
        contentType,
        metadata: metadata || {},
      },
    });

    const expiresMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: expiresMs,
    });
    return signedUrl;
  } catch (error: any) {
    logger.error('Dosya yükleme hatası', error);
    throw new Error(`Dosya yüklenemedi: ${error.message}`);
  }
}

/**
 * Dosya silme helper fonksiyonu
 * Teklifbul Rule v1.0 - Güvenli dosya silme
 */
export async function deleteFile(bucket: any, filePath: string): Promise<void> {
  try {
    const file = bucket.file(filePath);
    await file.delete();
  } catch (error: any) {
    logger.error('Dosya silme hatası', error);
    throw new Error(`Dosya silinemedi: ${error.message}`);
  }
}

/**
 * Dosya URL'ini al
 * Teklifbul Rule v1.0 - Güvenli URL oluşturma
 */
export async function getFileUrl(bucket: any, filePath: string): Promise<string> {
  try {
    const file = bucket.file(filePath);
    const [exists] = await file.exists();
    
    if (!exists) {
      throw new Error('Dosya bulunamadı');
    }

    const expiresMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: expiresMs,
    });
    return signedUrl;
  } catch (error: any) {
    logger.error('Dosya URL alma hatası', error);
    throw new Error(`Dosya URL'i alınamadı: ${error.message}`);
  }
}

