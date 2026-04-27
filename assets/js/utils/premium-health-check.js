/**
 * Premium Health Check Helper
 * Teklifbul Rule v1.0 - Dev-only health check for premium-required routes
 * 
 * Kullanım (dev-only):
 *   import { checkPremiumRoutes } from './assets/js/utils/premium-health-check.js';
 *   if (import.meta.env.DEV) {
 *     checkPremiumRoutes();
 *   }
 */

import { authFetch } from './api-helpers.js';
import { logger } from '../../../src/shared/log/logger.js';

/**
 * Premium gerektiren route'ları test et
 * Teklifbul Rule v1.0 - Sadece dev ortamında çalışır
 */
export async function checkPremiumRoutes() {
  // Production'da çalıştırma
  if (import.meta.env.MODE === 'production' || import.meta.env.PROD) {
    return;
  }

  logger.group('Premium Routes Health Check');
  
  const routes = [
    { 
      name: 'Template', 
      url: '/api/template', 
      method: 'GET',
      requiresParam: false 
    },
    { 
      name: 'Import (dry-run)', 
      url: '/api/import', 
      method: 'POST',
      requiresParam: true, // Dry-run parametresi gerekebilir
      body: { dryRun: true }
    },
    { 
      name: 'Waybills (example)', 
      url: '/api/waybills/EXAMPLE_DEMAND_ID', 
      method: 'GET',
      requiresParam: true // Demand ID gerekli
    }
  ];

  const results = [];

  for (const route of routes) {
    try {
      if (route.requiresParam && route.url.includes('EXAMPLE')) {
        results.push({
          name: route.name,
          status: 'SKIP',
          message: 'Parametre gerektiriyor (örnek ID ile test edilemez)'
        });
        continue;
      }

      const response = await authFetch(route.url, {
        method: route.method,
        body: route.body ? JSON.stringify(route.body) : undefined
      });

      const statusText = response.status === 200 ? '✅ OK' :
                        response.status === 401 ? '🔒 UNAUTHORIZED' :
                        response.status === 402 ? '💰 PAYMENT_REQUIRED' :
                        response.status === 403 ? '🚫 FORBIDDEN' :
                        `⚠️ ${response.status}`;

      results.push({
        name: route.name,
        status: response.status,
        statusText,
        url: route.url
      });

      logger.info(`${route.name}: ${statusText}`, { status: response.status, url: route.url });
    } catch (error) {
      results.push({
        name: route.name,
        status: 'ERROR',
        message: error.message || 'Unknown error',
        url: route.url
      });
      logger.warn(`${route.name}: Error`, { error: error.message, url: route.url });
    }
  }

  // Sonuçları özetle
  logger.info('Health Check Summary', { 
    total: results.length,
    results: results.map(r => ({ name: r.name, status: r.status || r.statusText }))
  });

  logger.end();

  return results;
}

/**
 * Health check'i otomatik çalıştır (sadece dev'de)
 */
if (import.meta.env.DEV && typeof window !== 'undefined') {
  // Sayfa yüklendiğinde otomatik çalıştır (opsiyonel - yorum satırından çıkarılabilir)
  // window.addEventListener('load', () => {
  //   checkPremiumRoutes();
  // });
}

