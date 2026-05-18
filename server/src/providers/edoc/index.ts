/**
 * E-Document Provider Factory
 * Teklifbul Rule v1.0 - Provider seçim ve yönetim
 */

import { getAdminDb } from '../../../utils/firestore.js';
import { logger } from '../../../../src/shared/log/logger.js';
import type { IEdocProvider, EdocProviderCredentials } from './types.js';
import { MockEdocProvider } from './mock.js';
import { IntegratorStubProvider } from './integratorStubProvider.js';
import { getFromReqCache, setInReqCache } from '../../utils/requestCache.js';
import { ttlCache, CacheKeys } from '../../utils/ttlCache.js';
import type { Request } from 'express';

// Provider instances cache
const providerCache = new Map<string, IEdocProvider>();

/**
 * Provider instance'ları oluştur
 */
function createProvider(providerKey: string): IEdocProvider {
  switch (providerKey) {
    case 'mock':
      return new MockEdocProvider();
    case 'integrator_x':
      return new IntegratorStubProvider('integrator_x');
    case 'integrator_y':
      return new IntegratorStubProvider('integrator_y');
    default:
      throw new Error(`Bilinmeyen provider: ${providerKey}`);
  }
}

/**
 * Provider instance'ı al (cache'den veya yeni oluştur)
 */
function getProviderInstance(providerKey: string): IEdocProvider {
  if (providerCache.has(providerKey)) {
    return providerCache.get(providerKey)!;
  }

  const provider = createProvider(providerKey);
  providerCache.set(providerKey, provider);
  return provider;
}

/**
 * Company için e-belge provider'ını al
 * Teklifbul Rule v1.0 - company.edoc.providerKey'e göre provider döndürür
 * PERFORMANCE: Request-scope + TTL cache ile Firestore read'leri azaltır
 */
export async function getEdocProvider(
  companyId: string,
  req?: Request
): Promise<{
  provider: IEdocProvider;
  credentials?: EdocProviderCredentials;
}> {
  const db = await getAdminDb();
  if (!db) {
    throw new Error('Firestore unavailable');
  }

  // Company doc'u al (cache ile)
  let company: any;
  const companyCacheKey = CacheKeys.company(companyId);
  
  // Request-scope cache kontrolü
  if (req) {
    const reqCached = getFromReqCache<any>(req, companyCacheKey);
    if (reqCached !== null) {
      if (process.env.DEBUG_CACHE === 'true') {
        logger.debug('cache hit (request)', { key: companyCacheKey });
      }
      company = reqCached;
    }
  }

  // TTL cache kontrolü
  if (!company) {
    const ttlCached = ttlCache.get<any>(companyCacheKey);
    if (ttlCached !== null) {
      if (process.env.DEBUG_CACHE === 'true') {
        logger.debug('cache hit (ttl)', { key: companyCacheKey });
      }
      company = ttlCached;
      // Request cache'e de kaydet
      if (req) {
        setInReqCache(req, companyCacheKey, company);
      }
    }
  }

  // Cache miss - Firestore'dan çek
  if (!company) {
    if (process.env.DEBUG_CACHE === 'true') {
      logger.debug('cache miss', { key: companyCacheKey });
    }

    const companyDoc = await db.collection('companies').doc(companyId).get();
    if (!companyDoc.exists) {
      throw new Error('Şirket bulunamadı');
    }

    company = companyDoc.data() as any;
    
    // Cache'e kaydet (60 saniye TTL)
    ttlCache.set(companyCacheKey, company, 60 * 1000);
    if (req) {
      setInReqCache(req, companyCacheKey, company);
    }
  }

  const providerKey = company?.edoc?.providerKey;

  if (!providerKey) {
    throw new Error('E-Belge sağlayıcısı seçilmemiş. Lütfen E-Belge Ayarları\'ndan sağlayıcı seçin.');
  }

  // Provider instance'ı al
  const provider = getProviderInstance(providerKey);

  // Credentials'ı al (varsa, cache ile)
  let credentials: EdocProviderCredentials | undefined;
  const credentialsRef = company?.edoc?.credentialsRef;

  if (credentialsRef) {
    const credsCacheKey = CacheKeys.edocCreds(credentialsRef);
    
    // Request-scope cache kontrolü
    if (req) {
      const reqCached = getFromReqCache<EdocProviderCredentials>(req, credsCacheKey);
      if (reqCached !== null) {
        if (process.env.DEBUG_CACHE === 'true') {
          logger.debug('cache hit (request)', { key: credsCacheKey });
        }
        credentials = reqCached;
      }
    }

    // TTL cache kontrolü
    if (!credentials) {
      const ttlCached = ttlCache.get<EdocProviderCredentials>(credsCacheKey);
      if (ttlCached !== null) {
        if (process.env.DEBUG_CACHE === 'true') {
          logger.debug('cache hit (ttl)', { key: credsCacheKey });
        }
        credentials = ttlCached;
        // Request cache'e de kaydet
        if (req) {
          setInReqCache(req, credsCacheKey, credentials);
        }
      }
    }

    // Cache miss - Firestore'dan çek
    if (!credentials) {
      if (process.env.DEBUG_CACHE === 'true') {
        logger.debug('cache miss', { key: credsCacheKey });
      }

      try {
        const credentialsDoc = await db.collection('company_edoc_credentials').doc(credentialsRef).get();
        if (credentialsDoc.exists) {
          const credentialsData = credentialsDoc.data();
          credentials = credentialsData?.credentials || {};
          
          // Cache'e kaydet (30 saniye TTL - credentials daha hassas)
          ttlCache.set(credsCacheKey, credentials, 30 * 1000);
          if (req) {
            setInReqCache(req, credsCacheKey, credentials);
          }
        }
      } catch (error: any) {
        logger.warn('Credentials yüklenemedi (opsiyonel)', {
          companyId,
          credentialsRef,
          error: error.message
        });
        // Credentials yoksa devam et (bazı provider'lar credentials kullanmayabilir)
      }
    }
  }

  if (process.env.DEBUG_CACHE !== 'true') {
    // Normal logging (cache debug kapalıysa)
    logger.info('E-belge provider alındı', {
      companyId,
      providerKey,
      hasCredentials: !!credentials
    });
  }

  return { provider, credentials };
}

/**
 * Provider cache'ini temizle (test için)
 */
export function clearProviderCache(): void {
  providerCache.clear();
}

