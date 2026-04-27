import { Router } from 'express';
import { logger } from '../../src/shared/log/logger.js';

const FX_PROVIDER_URL = 'https://api.exchangerate-api.com/v4/latest/TRY';
const CACHE_TTL = 60_000; // 1 dakika

type FxPayload = {
  rates?: Record<string, number>;
  time_last_update_unix?: number;
  base?: string;
};

const router = Router();

let cachedResponse: {
  timestamp: number;
  body: { ok: boolean; base: string; usdRate: number; eurRate: number; timestamp: number };
} | null = null;

router.get('/', async (_req, res) => {
  try {
    if (cachedResponse && Date.now() - cachedResponse.timestamp < CACHE_TTL) {
      return res.json(cachedResponse.body);
    }

    try {
      const response = await fetch(FX_PROVIDER_URL, {
        headers: { 'User-Agent': 'Teklifbul-FX-Proxy/1.0' },
        cache: 'no-store'
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.warn('FX provider returned non-200', { status: response.status, body: errorText });
        return res.status(502).json({
          ok: false,
          error: 'fx_provider_error',
          status: response.status
        });
      }

      const payload = (await response.json()) as FxPayload;
      const usdRateRaw = payload.rates?.USD;
      const eurRateRaw = payload.rates?.EUR;

      if (!usdRateRaw || !eurRateRaw) {
        const details = { payload };
        logger.warn('FX payload missing expected rates', details);
        return res.status(502).json({
          ok: false,
          error: 'fx_rate_missing',
          details
        });
      }

      const usdRate = Number((1 / usdRateRaw).toFixed(4));
      const eurRate = Number((1 / eurRateRaw).toFixed(4));
      const timestamp = payload.time_last_update_unix
        ? payload.time_last_update_unix * 1000
        : Date.now();
      const base = payload.base || 'TRY';

      const body = {
        ok: true,
        base,
        usdRate,
        eurRate,
        timestamp
      };

      cachedResponse = {
        timestamp: Date.now(),
        body
      };

      res.setHeader('Cache-Control', 'public, max-age=15');
      return res.json(body);
    } catch (fetchError) {
      logger.error('FX proxy error', fetchError);
      // Teklifbul Rule v1.0 - Hata durumunda cached response varsa onu döndür
      if (cachedResponse) {
        logger.info('FX: Using cached response due to error');
        return res.json(cachedResponse.body);
      }
      // Teklifbul Rule v1.0 - Network hatalarını daha iyi handle et
      const errorMessage = fetchError instanceof Error 
        ? fetchError.message 
        : String(fetchError);
      const isNetworkError = errorMessage.includes('fetch') || 
                            errorMessage.includes('ECONNREFUSED') ||
                            errorMessage.includes('ENOTFOUND') ||
                            errorMessage.includes('timeout');
      
      return res.status(502).json({
        ok: false,
        error: isNetworkError ? 'fx_network_error' : 'fx_proxy_failed',
        message: isNetworkError 
          ? 'Döviz kuru servisine bağlanılamadı. Lütfen daha sonra tekrar deneyin.'
          : errorMessage
      });
    }
  } catch (error) {
    logger.error('FX route fatal error', error);
    // Teklifbul Rule v1.0 - Fatal hata durumunda cached response varsa onu döndür
    if (cachedResponse) {
      return res.json(cachedResponse.body);
    }
    return res.status(500).json({
      ok: false,
      error: 'fx_route_failed',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;

