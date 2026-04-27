# 🚀 Caching Strategy
## Teklifbul Rule v1.0 - Performance Optimization

Bu dokümantasyon, backend'de kullanılan caching mekanizmalarını açıklar.

---

## 📊 Cache Türleri

### 1. Request-Scope Cache

**Amaç:** Aynı request içinde aynı Firestore document'ini tekrar çekmeyi önler.

**Kapsam:** Tek bir HTTP request'i boyunca geçerlidir.

**Kullanım:**
```typescript
import { getFromReqCache, setInReqCache } from '../utils/requestCache.js';

// Cache'ten oku
const cached = getFromReqCache<Company>(req, CacheKeys.company(companyId));
if (cached) {
  return cached;
}

// Firestore'dan çek
const company = await db.collection('companies').doc(companyId).get();

// Cache'e kaydet
setInReqCache(req, CacheKeys.company(companyId), company);
```

**Avantajlar:**
- Aynı request içinde birden fazla permission check yapıldığında Firestore read'leri azaltır
- Özellikle middleware zincirinde (validate → rateLimit → permission → handler) çok etkili

**Örnek Senaryo:**
```
Request: POST /api/invoices/:id/send
- validate middleware: companyId çözümleme (cache miss)
- rateLimit middleware: companyId kullanımı (cache hit)
- requirePermission middleware: permission check (cache hit)
- handler: invoice send (cache hit)
```

---

### 2. TTL Cache (Time-To-Live)

**Amaç:** Kısa süreli (30-60 saniye) cache ile ardışık isteklerde hızlanma sağlar.

**Kapsam:** Process memory, tüm request'ler arasında paylaşılır.

**Default TTL:** 60 saniye (environment variable ile override edilebilir)

**Kullanım:**
```typescript
import { ttlCache, CacheKeys } from '../utils/ttlCache.js';

// Cache'ten oku
const cached = ttlCache.get<Company>(CacheKeys.company(companyId));
if (cached) {
  return cached;
}

// Firestore'dan çek
const company = await db.collection('companies').doc(companyId).get();

// Cache'e kaydet (60 saniye)
ttlCache.set(CacheKeys.company(companyId), company, 60 * 1000);
```

**Avantajlar:**
- Ardışık isteklerde Firestore read'leri azaltır
- Permission check sürelerini %30-60 azaltır
- Firestore read maliyetini düşürür

**Not:** Multi-instance deployment'da her instance kendi cache'ine sahiptir (sorun değil, amaç hız).

---

## 🔑 Cache Key'leri

### Standart Key Formatları

| Key Pattern | Örnek | TTL | Açıklama |
|-------------|-------|-----|----------|
| `company:${companyId}` | `company:abc123` | 60s | Company document |
| `membership:${companyId}:${userId}` | `membership:abc123:user456` | 30s | User membership role |
| `rolePermsTemplate` | `rolePermsTemplate` | 5min | Role permissions template JSON |
| `edocCreds:${credentialsRef}` | `edocCreds:cred789` | 30s | E-doc credentials |
| `user:${userId}` | `user:user456` | 30s | User document |

### Key Helper Functions

```typescript
import { CacheKeys } from '../utils/ttlCache.js';

const companyKey = CacheKeys.company('abc123');
const membershipKey = CacheKeys.membership('abc123', 'user456');
const credsKey = CacheKeys.edocCreds('cred789');
```

---

## ⏱️ TTL Süreleri

| Cache Key | TTL | Gerekçe |
|-----------|-----|---------|
| `company:*` | 60 saniye | Company bilgileri nadiren değişir |
| `membership:*` | 30 saniye | Role değişiklikleri daha sık olabilir |
| `rolePermsTemplate` | 5 dakika | Template dosyası restart'ta yenilenir |
| `edocCreds:*` | 30 saniye | Credentials hassas, kısa TTL |
| `user:*` | 30 saniye | User bilgileri orta sıklıkta değişir |

**Override:** `CACHE_TTL_MS` environment variable ile default TTL değiştirilebilir.

---

## 🔄 Cache Stratejisi (Multi-Layer)

### 1. Request-Scope Cache (En Hızlı)
```
Request başlangıcı → Cache boş
İlk Firestore read → Request cache'e kaydet
Sonraki aynı request içindeki okumalar → Request cache'ten dön
Request bitişi → Cache temizlenir
```

### 2. TTL Cache (Hızlı)
```
İlk request → Firestore'dan çek → TTL cache'e kaydet (60s)
Sonraki request (aynı 60s içinde) → TTL cache'ten dön
60s sonra → TTL expire → Firestore'dan tekrar çek
```

### 3. Firestore (Fallback)
```
Cache miss → Firestore'dan çek → Her iki cache'e de kaydet
```

---

## 📍 Cache Kullanım Yerleri

### 1. Permission Service (`server/src/services/permissionService.ts`)

**Cache'lenen Veriler:**
- `getUserCompanyRole()` → `membership:${companyId}:${userId}`
- `loadRolePermissionsTemplate()` → `rolePermsTemplate`

**Örnek Akış:**
```typescript
// İlk permission check
hasPermission(userId, companyId, 'sales.create', req)
  → getUserCompanyRole() → Firestore read → Cache'e kaydet

// Aynı request içinde ikinci permission check
hasPermission(userId, companyId, 'sales.edit', req)
  → getUserCompanyRole() → Request cache hit → Hızlı dönüş
```

---

### 2. E-Doc Provider (`server/src/providers/edoc/index.ts`)

**Cache'lenen Veriler:**
- Company document → `company:${companyId}` (60s)
- Credentials document → `edocCreds:${credentialsRef}` (30s)

**Örnek Akış:**
```typescript
// İlk provider çağrısı
getEdocProvider(companyId, req)
  → Company doc → Firestore read → Cache'e kaydet
  → Credentials doc → Firestore read → Cache'e kaydet

// Aynı request içinde ikinci çağrı
getEdocProvider(companyId, req)
  → Company doc → Request cache hit
  → Credentials doc → Request cache hit
```

---

## 🐛 Debug Logging

Cache hit/miss logları environment variable ile kontrol edilir:

```bash
# .env
DEBUG_CACHE=true
```

**Log Formatı:**
```javascript
logger.debug('cache hit (request)', { key: 'company:abc123' });
logger.debug('cache hit (ttl)', { key: 'membership:abc123:user456' });
logger.debug('cache miss', { key: 'company:abc123' });
```

**Not:** Production'da `DEBUG_CACHE=false` veya unset olmalı (gürültülü loglar).

---

## 📈 Performans İyileştirmeleri

### Beklenen İyileştirmeler

| Senaryo | Önce | Sonra | İyileştirme |
|---------|------|-------|--------------|
| Permission check (ilk) | ~50ms | ~50ms | - |
| Permission check (aynı request) | ~50ms | ~1ms | **%98** |
| Permission check (ardışık request, 30s içinde) | ~50ms | ~5ms | **%90** |
| E-doc provider (ilk) | ~100ms | ~100ms | - |
| E-doc provider (aynı request) | ~100ms | ~2ms | **%98** |
| E-doc provider (ardışık request, 60s içinde) | ~100ms | ~10ms | **%90** |

### Firestore Read Azalması

**Örnek Senaryo:** Bir invoice send işlemi
- **Önce:** 3-4 Firestore read (user doc, company doc, credentials doc, membership check)
- **Sonra:** 1-2 Firestore read (ilk request'te, sonraki request'lerde cache hit)

**Tahmini Azalma:** %50-70 Firestore read azalması

---

## ⚙️ Configuration

### Environment Variables

```bash
# Default TTL (milliseconds)
CACHE_TTL_MS=60000  # 60 saniye

# Debug logging
DEBUG_CACHE=true    # Development için
DEBUG_CACHE=false   # Production için (default)
```

---

## 🔧 Cache Management

### Manual Cache Clear

```typescript
import { ttlCache } from '../utils/ttlCache.js';

// Tüm cache'i temizle
ttlCache.clear();

// Belirli key'i sil
ttlCache.delete(CacheKeys.company('abc123'));

// Expired entry'leri temizle
const cleaned = ttlCache.cleanExpired();
```

### Request Cache Clear

Request cache otomatik olarak request bitişinde temizlenir. Manuel temizleme gerekmez.

---

## 🧪 Test Senaryoları

### Senaryo 1: Request-Scope Cache
```typescript
// Aynı request içinde iki permission check
const req = mockRequest();
await hasPermission(userId, companyId, 'sales.create', req); // Firestore read
await hasPermission(userId, companyId, 'sales.edit', req);     // Cache hit
```

### Senaryo 2: TTL Cache
```typescript
// İlk request
await getEdocProvider(companyId); // Firestore read

// 30 saniye sonra (aynı process)
await getEdocProvider(companyId); // TTL cache hit

// 70 saniye sonra (TTL expire)
await getEdocProvider(companyId); // Firestore read
```

---

## ⚠️ Dikkat Edilmesi Gerekenler

### 1. Cache Invalidation

- **Company bilgileri güncellendiğinde:** Cache otomatik expire olur (60s sonra)
- **Role değişikliğinde:** Cache otomatik expire olur (30s sonra)
- **Credentials güncellendiğinde:** Cache otomatik expire olur (30s sonra)

**Not:** Kritik güncellemelerde manuel cache clear gerekebilir.

### 2. Multi-Instance Deployment

TTL cache process-level'dir. Her instance kendi cache'ine sahiptir. Bu:
- ✅ Sorun değil (amaç hız, consistency değil)
- ⚠️ İlk request her instance'da cache miss olabilir

### 3. Memory Usage

TTL cache memory kullanır. Büyük dataset'lerde:
- Cache size'ı monitor edilmeli
- `ttlCache.size()` ile kontrol edilebilir
- Expired entry'ler otomatik temizlenir

---

## 📊 Monitoring

### Cache Hit Rate

```typescript
// Debug logging ile cache hit/miss oranı hesaplanabilir
// Production'da metrics toplama sistemi ile entegre edilebilir
```

### Cache Size

```typescript
const cacheSize = ttlCache.size();
logger.info('TTL cache size', { size: cacheSize });
```

---

## 🔄 Cache Flow Diagram

```
Request Start
    ↓
Permission Check
    ↓
[Request Cache] → Hit? → Return
    ↓ Miss
[TTL Cache] → Hit? → Return + Save to Request Cache
    ↓ Miss
[Firestore] → Read → Save to TTL Cache + Request Cache → Return
    ↓
Request End → Request Cache Cleared
```

---

**Oluşturulma Tarihi:** 2025-01-XX  
**Teklifbul Rule v1.0 - Performance Optimization**

