# 📊 Observability Documentation
## Teklifbul Rule v1.0 - Observability v1

Bu dokümantasyon, sistem gözlem katmanını (observability) açıklar.

---

## 🎯 Amaç

Production'da "sistem nasıl gidiyor"u görebilmek için temel gözlem katmanı:
- Health check endpoint
- Request timing ve metrik toplama
- In-memory metrics store
- Metrics endpoint (JSON format)

---

## 📍 Endpoints

### 1. GET /health

Health check endpoint - uptime, version, environment bilgisi.

**Response (200):**
```json
{
  "ok": true,
  "status": "ok",
  "service": "teklifbul-api",
  "version": "1.0.0",
  "environment": "production",
  "uptimeSec": 3600,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Kullanım:**
- Load balancer health check
- Monitoring system ping
- Uptime tracking

---

### 2. GET /metrics

Request metrics snapshot (JSON format).

**Security (Two-Layer Protection):**
1. **ENV Gate**: Varsayılan olarak **kapalı**
   - Açmak için: `ENABLE_METRICS=true` environment variable
   - Eğer `ENABLE_METRICS !== 'true'` → 404 NOT_FOUND
2. **Permission Gate**: `admin.metrics.view` permission gerekli
   - Sadece admin rollere verilir (isveren, ceo, genel_mudur)
   - Eğer permission yok → 403 FORBIDDEN

**Response (200):**
```json
{
  "ok": true,
  "uptimeSec": 3600,
  "totalRequests": 12345,
  "statusCounts": {
    "200": 12000,
    "400": 100,
    "404": 200,
    "500": 45
  },
  "topRoutesByCount": [
    { "route": "GET /api/sales", "count": 5000 },
    { "route": "POST /api/invoices", "count": 3000 }
  ],
  "slowRoutesByP95": [
    { "route": "POST /api/export/purchase-form", "p95Ms": 1250.5, "count": 50 },
    { "route": "GET /api/sales", "p95Ms": 450.2, "count": 5000 }
  ],
  "routeStats": {
    "GET /api/sales": {
      "count": 5000,
      "avgMs": 120.5,
      "p50Ms": 95.0,
      "p95Ms": 450.2,
      "p99Ms": 800.0,
      "maxMs": 1200.0
    }
  },
  "windows": {
    "5m": {
      "total": 150,
      "statusCounts": {
        "200": 145,
        "400": 3,
        "500": 2
      },
      "errorRate5xx": 1.33,
      "topRoutesByCount": [
        { "route": "GET /api/sales", "count": 80 },
        { "route": "POST /api/invoices", "count": 50 }
      ],
      "slowRoutesByP95": [
        { "route": "POST /api/export/purchase-form", "p95Ms": 1250.5, "count": 5 },
        { "route": "GET /api/sales", "p95Ms": 450.2, "count": 80 }
      ],
      "durationPercentiles": {
        "p50": 95.0,
        "p95": 450.2,
        "p99": 800.0
      }
    },
    "15m": {
      "total": 450,
      "statusCounts": {
        "200": 435,
        "400": 10,
        "500": 5
      },
      "errorRate5xx": 1.11,
      "topRoutesByCount": [
        { "route": "GET /api/sales", "count": 240 },
        { "route": "POST /api/invoices", "count": 150 }
      ],
      "slowRoutesByP95": [
        { "route": "POST /api/export/purchase-form", "p95Ms": 1250.5, "count": 15 },
        { "route": "GET /api/sales", "p95Ms": 450.2, "count": 240 }
      ],
      "durationPercentiles": {
        "p50": 95.0,
        "p95": 450.2,
        "p99": 800.0
      }
    }
  }
}
```

**Kullanım:**
- Performance monitoring
- Slow endpoint detection
- Request pattern analysis

**Açma:**
```bash
# .env veya environment variable
ENABLE_METRICS=true
```

**Permission:**
- `admin.metrics.view` permission gerekli
- Sadece şu rollere verilir:
  - `buyer:isveren`, `supplier:isveren`
  - `buyer:ceo`, `supplier:ceo`
  - `buyer:genel_mudur`, `supplier:genel_mudur`

---

## 🔧 Middleware

### Request Metrics Middleware

Her request için:
- Duration ölçümü
- `X-Response-Time` header ekleme
- Slow request logging (> 500ms default)
- Metrics store'a kayıt

**X-Response-Time Header:**
```
X-Response-Time: 12.34ms
```

**Logging:**
- `durationMs > 500ms` (default) → `logger.warn`
- `OBS_LOG_ALL=true` → Tüm requestler `logger.info`
- Diğerleri → Loglanmaz (gürültü önleme)

**Environment Variables:**
```bash
# Tüm requestleri logla (dev için)
OBS_LOG_ALL=true

# Slow request threshold (ms)
OBS_SLOW_MS=500
```

---

## 📊 Metrics Store

In-memory metrics store:
- **Counters**: Total requests, status counts, route counts
- **Durations**: Route başına son 200 sample (ring buffer)
- **Percentiles**: p50, p95, p99 hesaplama
- **Windowed Metrics (v2)**: Global event ring buffer (max 10.000 event)

**Memory Management:**
- Route başına max 200 sample (ring buffer)
- Global event buffer: max 10.000 event (config: `OBS_EVENTS_MAX`)
- Eski sample'lar otomatik silinir (FIFO)

**Windowed Metrics:**
- Her request event'i timestamp ile kaydedilir
- `getWindowSnapshot(windowMs)` ile zaman pencereli metrikler hesaplanır
- 5 dakika (300.000ms) ve 15 dakika (900.000ms) pencereleri desteklenir

**Route Key Format:**
```
METHOD /api/path
```

Örnek:
- `GET /api/sales`
- `POST /api/invoices`
- `GET /api/sales/:id` (normalized)

---

## 🚀 Entegrasyon

### server/index.ts

```typescript
// 1. Import
import healthRouter from './src/routes/health';
import metricsRouter from './src/routes/metrics';
import { requestMetrics } from './src/middleware/requestMetrics';

// 2. Request metrics middleware (router'lardan önce)
app.use(requestMetrics);

// 3. Health ve metrics endpoints
app.use('/health', healthRouter);
app.use('/metrics', metricsRouter);
```

**Sıralama:**
1. CORS
2. Compression
3. JSON parser
4. **Request metrics middleware** ← Burada
5. Routes...

---

## 📝 Örnekler

### Health Check
```bash
curl http://localhost:5174/health
```

### Metrics (ENABLE_METRICS=true gerekli)
```bash
curl http://localhost:5174/metrics
```

### Slow Request Detection
```bash
# OBS_SLOW_MS=1000 ile 1 saniyeden yavaş requestler loglanır
OBS_SLOW_MS=1000 npm run dev:api
```

---

## ⏱️ Windowed Metrics (v2)

### Zaman Pencereli Metrikler

Sistem, son 5 dakika ve son 15 dakika içindeki metrikleri ayrı ayrı hesaplar:

**5 Dakika Penceresi (`windows.5m`):**
- Son 5 dakika içindeki tüm request'ler
- Kısa vadeli trend analizi
- Anlık performans sorunlarını tespit

**15 Dakika Penceresi (`windows.15m`):**
- Son 15 dakika içindeki tüm request'ler
- Orta vadeli trend analizi
- Daha stabil metrikler

**Örnek Kullanım:**
```json
{
  "windows": {
    "5m": {
      "total": 150,
      "errorRate5xx": 1.33,
      "topRoutesByCount": [...],
      "slowRoutesByP95": [...],
      "durationPercentiles": { "p50": 95.0, "p95": 450.2, "p99": 800.0 }
    },
    "15m": {
      "total": 450,
      "errorRate5xx": 1.11,
      "topRoutesByCount": [...],
      "slowRoutesByP95": [...],
      "durationPercentiles": { "p50": 95.0, "p95": 450.2, "p99": 800.0 }
    }
  }
}
```

**Configuration:**
- `OBS_EVENTS_MAX`: Global event buffer maksimum boyutu (default: 10000)
- Daha uzun pencereler için artırılabilir (memory trade-off)

---

## 🔒 Güvenlik

1. **Metrics Endpoint (Two-Layer Protection):**
   - **Layer 1 - ENV Gate**: Varsayılan: Kapalı (`ENABLE_METRICS !== 'true'`)
     - Production'da açmak için explicit env variable gerekir
     - Eğer kapalıysa → 404 NOT_FOUND (error catalog format)
   - **Layer 2 - Permission Gate**: `admin.metrics.view` permission gerekli
     - Sadece admin rollere verilir (isveren, ceo, genel_mudur)
     - Eğer permission yok → 403 FORBIDDEN (error catalog format)
   - **Middleware Order**: `verifyToken` → `requirePermission('admin.metrics.view')` → handler

2. **Request Metrics:**
   - Tüm request'lerde çalışır
   - User/company ID'ler loglanır (sadece varsa)
   - Sensitive data loglanmaz

---

## 🎯 Best Practices

### 1. Production'da Metrics Açma
```bash
# .env.production
ENABLE_METRICS=true
```

**Not:** `ENABLE_METRICS=true` olsa bile, sadece `admin.metrics.view` permission'ı olan kullanıcılar erişebilir.

### 2. Permission Kontrolü
- Permission: `admin.metrics.view`
- Roller: `buyer:isveren`, `supplier:isveren`, `buyer:ceo`, `supplier:ceo`, `buyer:genel_mudur`, `supplier:genel_mudur`
- Diğer tüm rollerde `false` (varsayılan)

### 3. Slow Request Monitoring
```bash
# 500ms'den yavaş requestler otomatik warn loglanır
# Custom threshold için:
OBS_SLOW_MS=1000
```

### 4. Development Debugging
```bash
# Tüm requestleri logla
OBS_LOG_ALL=true
```

### 5. Health Check Integration
- Load balancer health check: `GET /health`
- Monitoring system: `GET /health` (her 30 saniyede bir)

---

## 📈 Metrics Interpretation

### Top Routes by Count
En çok çağrılan endpoint'ler. Cache veya optimization için adaylar.

### Slow Routes by P95
P95 percentile'e göre en yavaş endpoint'ler. Performance optimization için adaylar.

### Route Stats
- **avgMs**: Ortalama response time
- **p50Ms**: Median (50th percentile)
- **p95Ms**: 95% of requests faster than this
- **p99Ms**: 99% of requests faster than this
- **maxMs**: Maximum observed duration

---

## 🔄 Future Enhancements

1. **Firestore Ping** (health check):
   ```typescript
   // HEALTH_CHECK_FIRESTORE=true ile aktif
   ```

2. **Admin Permission** (metrics endpoint):
   ```typescript
   // requireAdmin middleware eklenebilir
   ```

3. **Prometheus Format**:
   ```typescript
   // GET /metrics/prometheus endpoint
   ```

4. **Export to External**:
   ```typescript
   // Metrics export to Datadog/New Relic
   ```

---

## 📚 Related Documentation

- [ERRORS.md](./ERRORS.md) - Error catalog
- [COMPRESSION.md](./COMPRESSION.md) - Response compression
- [RATE_LIMITS.md](./RATE_LIMITS.md) - Rate limiting

---

**Teklifbul Rule v1.0 - Observability v1**
*Minimum kod, maksimum fayda*

