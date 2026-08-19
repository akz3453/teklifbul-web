/**
 * Request Metrics Middleware
 * Teklifbul Rule v1.0 - Observability v1
 *
 * Her request için timing ve metrik toplama
 */
import { logger } from '../../../src/shared/log/logger.js';
import { metricsStore } from '../metrics/metricsStore.js';
/**
 * Generate route key from request
 * Example: "GET /api/sales", "POST /api/invoices"
 */
function getRouteKey(req) {
    const method = req.method;
    const path = req.route?.path || req.path || req.url;
    // Normalize path (remove query params, IDs)
    // Örnek: /api/sales/abc123 -> /api/sales/:id
    let normalizedPath = path.split('?')[0]; // Remove query string
    // Replace common ID patterns with :id
    normalizedPath = normalizedPath.replace(/\/[a-f0-9]{20,}/gi, '/:id'); // Firebase doc IDs
    normalizedPath = normalizedPath.replace(/\/[0-9]+/g, '/:id'); // Numeric IDs
    return `${method} ${normalizedPath}`;
}
/**
 * Request metrics middleware
 *
 * - Measures request duration
 * - Adds X-Response-Time header
 * - Logs slow requests (> 500ms by default)
 * - Records metrics in metricsStore
 */
export function requestMetrics(req, res, next) {
    const start = process.hrtime.bigint();
    const routeKey = getRouteKey(req);
    // Teklifbul Rule v1.0 - Response time header'ı response gönderilmeden önce set et
    // finish event'inde set edemeyiz çünkü response zaten gönderilmiş olur
    const originalSend = res.send;
    res.send = function (body) {
        const durationNs = process.hrtime.bigint() - start;
        const durationMs = Number(durationNs) / 1000000;
        // Header'ı response gönderilmeden önce set et
        if (!res.headersSent) {
            res.setHeader('X-Response-Time', `${durationMs.toFixed(2)}ms`);
        }
        return originalSend.call(this, body);
    };
    // Track response finish
    res.on('finish', () => {
        const durationNs = process.hrtime.bigint() - start;
        const durationMs = Number(durationNs) / 1000000; // Convert nanoseconds to milliseconds
        // Teklifbul Rule v1.0 - Header'ı finish event'inden önce set et (response gönderilmeden)
        // finish event'i response gönderildikten sonra tetiklenir, bu yüzden header set edemeyiz
        // Header'ı middleware'de set etmek yerine sadece loglama yapıyoruz
        // Get user context (if available)
        const userId = req.user?.uid || null;
        const companyId = req.companyId || req.headers['x-company-id'] || null;
        // Record in metrics store
        // Teklifbul Rule v1.0 - Windowed Metrics v2: Timestamp ve method ekle
        metricsStore.recordRequest({
            routeKey,
            statusCode: res.statusCode,
            durationMs,
            ts: Date.now(),
            method: req.method
        });
        // Logging configuration
        const logAll = process.env.OBS_LOG_ALL === 'true';
        const slowThreshold = Number(process.env.OBS_SLOW_MS) || 500;
        // Log slow requests as warning
        if (durationMs > slowThreshold) {
            logger.warn('Slow request', {
                path: req.path,
                method: req.method,
                statusCode: res.statusCode,
                durationMs: Math.round(durationMs * 100) / 100,
                routeKey,
                userId,
                companyId
            });
        }
        else if (logAll) {
            // Log all requests in debug mode (if enabled)
            logger.info('Request', {
                path: req.path,
                method: req.method,
                statusCode: res.statusCode,
                durationMs: Math.round(durationMs * 100) / 100,
                routeKey,
                userId,
                companyId
            });
        }
    });
    next();
}
