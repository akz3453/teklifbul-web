# 🗜️ Response Compression
## Teklifbul Rule v1.0 - API Response Compression (gzip/br)

Bu dokümantasyon, backend'de kullanılan response compression mekanizmasını açıklar.

---

## 📊 Neden Compression?

### Performans İyileştirmeleri

**Büyük JSON Response'lar:**
- Sales listeleri (100+ satır)
- Invoice/Delivery snapshot'ları (detaylı item listeleri)
- Customer listeleri
- Audit log'ları

**Beklenen İyileştirmeler:**
- **Network trafiği:** %60-80 azalma
- **Sayfa yükleme süresi:** %30-50 iyileştirme
- **Bandwidth maliyeti:** Önemli ölçüde azalma

### Örnek Senaryo

**Önce (uncompressed):**
```
GET /api/sales
Response Size: 500 KB
Transfer Time: ~2 saniye (3G)
```

**Sonra (compressed):**
```
GET /api/sales
Response Size: 150 KB (gzip)
Transfer Time: ~0.6 saniye (3G)
```

**Kazanç:** %70 daha az veri, %70 daha hızlı transfer

---

## ⚙️ Configuration

### Threshold

```typescript
threshold: 1024 // 1KB
```

**Açıklama:**
- 1KB'dan küçük response'lar sıkıştırılmaz
- Küçük response'larda compression overhead'i faydadan fazla olabilir
- Healthcheck, status endpoint'leri gibi küçük response'lar için sorun değil

### Filter

```typescript
filter: (req, res) => {
  // Default compression filter
  const shouldCompress = compression.filter(req, res);
  
  if (!shouldCompress) {
    return false;
  }
  
  // PDF endpoint'lerini hariç tut
  const path = req.path || '';
  if (path.endsWith('/pdf')) {
    return false;
  }
  
  return true;
}
```

**Hariç Tutulan Endpoint'ler:**
- `/api/invoices/:id/pdf` → PDF stream (ileride)
- `/api/delivery-notes/:id/pdf` → PDF stream (ileride)
- Diğer binary/stream endpoint'leri

**Not:** Şu anda PDF endpoint'leri `pdfUrl` döndürüyor (stream yok), ama ileride stream edilecekse güvenli olması için şimdiden hariç tutuldu.

---

## 🔍 Compression Algorithm

### Otomatik Seçim

Compression middleware, client'ın `Accept-Encoding` header'ına göre otomatik olarak en iyi algoritmayı seçer:

1. **Brotli (br)** - En iyi compression ratio (modern browser'lar)
2. **Gzip** - Yaygın destek, iyi compression ratio
3. **Deflate** - Eski browser'lar için fallback

**Örnek Request:**
```http
GET /api/sales HTTP/1.1
Accept-Encoding: gzip, br, deflate
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Encoding: gzip
Content-Type: application/json
...
```

---

## 📍 Compression Middleware Yeri

**Dosya:** `server/index.ts`

**Sıralama:**
```typescript
app.use(helmet());        // Security headers
app.use(cors());          // CORS
app.use(compression());   // Compression (CORS'tan sonra, JSON parser'dan önce)
app.use(express.json());  // JSON parser
```

**Neden bu sırada?**
- Compression, response body'yi sıkıştırır
- JSON parser'dan önce olmalı (response body henüz oluşmamış)
- CORS'tan sonra olmalı (CORS header'ları compression'dan etkilenmemeli)

---

## 🧪 Test Senaryoları

### Senaryo 1: Compression Kontrolü

```bash
# gzip compression test
curl -H "Accept-Encoding: gzip" -I http://localhost:5174/api/sales

# Response headers:
# Content-Encoding: gzip
# Content-Type: application/json
```

### Senaryo 2: Brotli Compression

```bash
# brotli compression test
curl -H "Accept-Encoding: br" -I http://localhost:5174/api/sales

# Response headers:
# Content-Encoding: br
# Content-Type: application/json
```

### Senaryo 3: Compression Olmadan

```bash
# compression olmadan
curl -I http://localhost:5174/api/sales

# Response headers:
# Content-Type: application/json
# (Content-Encoding header'ı yok)
```

### Senaryo 4: Küçük Response (Threshold Altı)

```bash
# Healthcheck endpoint (küçük response)
curl -H "Accept-Encoding: gzip" -I http://localhost:5174/api/health

# Response headers:
# Content-Type: application/json
# (Content-Encoding header'ı yok - threshold altı)
```

### Senaryo 5: PDF Endpoint (Hariç)

```bash
# PDF endpoint (compression kapalı)
curl -H "Accept-Encoding: gzip" -I http://localhost:5174/api/invoices/123/pdf

# Response headers:
# Content-Type: application/pdf
# (Content-Encoding header'ı yok - filter ile hariç)
```

---

## 📊 Compression Ratio Örnekleri

### Senaryo 1: Sales List (100 satır)

| Durum | Size | Compression | Ratio |
|-------|------|-------------|-------|
| Uncompressed | 450 KB | - | - |
| Gzip | 120 KB | 73% | 3.75x |
| Brotli | 95 KB | 79% | 4.74x |

### Senaryo 2: Invoice Detail (Snapshot)

| Durum | Size | Compression | Ratio |
|-------|------|-------------|-------|
| Uncompressed | 85 KB | - | - |
| Gzip | 25 KB | 71% | 3.4x |
| Brotli | 20 KB | 76% | 4.25x |

### Senaryo 3: Customer List (50 müşteri)

| Durum | Size | Compression | Ratio |
|-------|------|-------------|-------|
| Uncompressed | 180 KB | - | - |
| Gzip | 50 KB | 72% | 3.6x |
| Brotli | 40 KB | 78% | 4.5x |

---

## ⚠️ Dikkat Edilmesi Gerekenler

### 1. CPU Kullanımı

Compression CPU kullanır. Büyük response'larda:
- **Gzip:** Düşük CPU overhead
- **Brotli:** Biraz daha yüksek CPU overhead (ama daha iyi compression)

**Not:** Modern server'larda CPU overhead genellikle network kazancından daha az önemli.

### 2. Memory Kullanımı

Compression buffer'ları memory kullanır. Çok büyük response'larda (10MB+):
- Memory kullanımı artabilir
- Şu anki limit: `express.json({ limit: '10mb' })`

**Çözüm:** Büyük response'lar için pagination kullan.

### 3. Binary/Stream Response'lar

PDF, image, video gibi binary response'lar:
- Zaten sıkıştırılmış (PDF, JPEG, MP4)
- Compression gereksiz ve zararlı olabilir
- Filter ile hariç tutuldu

### 4. Real-time/WebSocket

WebSocket connection'lar:
- Compression middleware WebSocket'i etkilemez
- WebSocket kendi compression mekanizmasına sahip

---

## 🔧 Environment Variables

Şu anda environment variable ile override yok, ama eklenebilir:

```bash
# .env (opsiyonel, gelecekte)
COMPRESSION_THRESHOLD=1024
COMPRESSION_DISABLE=false
```

---

## 📈 Monitoring

### Compression Ratio Tracking

```typescript
// Middleware'de compression ratio loglanabilir
app.use(compression({
  threshold: 1024,
  filter: (req, res) => { ... },
  // Custom callback (opsiyonel)
  onCompress: (req, res, originalSize, compressedSize) => {
    const ratio = ((originalSize - compressedSize) / originalSize * 100).toFixed(2);
    logger.debug('Compression ratio', {
      path: req.path,
      originalSize,
      compressedSize,
      ratio: `${ratio}%`
    });
  }
}));
```

**Not:** Şu anda `onCompress` callback'i yok (compression paketi desteklemiyor), ama custom middleware ile eklenebilir.

---

## 🧪 Test Komutları

### 1. Compression Header Kontrolü

```bash
# gzip
curl -H "Accept-Encoding: gzip" -I http://localhost:5174/api/sales | grep -i "content-encoding"

# brotli
curl -H "Accept-Encoding: br" -I http://localhost:5174/api/sales | grep -i "content-encoding"
```

### 2. Response Size Karşılaştırma

```bash
# Uncompressed size
curl -s http://localhost:5174/api/sales | wc -c

# Compressed size (gzip)
curl -s -H "Accept-Encoding: gzip" --compressed http://localhost:5174/api/sales | wc -c
```

### 3. Browser DevTools

**Chrome DevTools → Network Tab:**
- Response size (uncompressed)
- Transferred size (compressed)
- Compression ratio gösterilir

---

## 🔄 Compression Flow

```
Request
  ↓
Accept-Encoding: gzip, br
  ↓
Compression Middleware
  ↓
Response Body Oluşturuluyor
  ↓
Compression Filter Kontrolü
  ├─ Threshold altı? → Skip compression
  ├─ PDF endpoint? → Skip compression
  └─ Diğer → Compress
  ↓
Content-Encoding: gzip/br Header Ekle
  ↓
Response Gönderiliyor
```

---

## 📊 Performance Metrics

### Beklenen İyileştirmeler

| Metric | Önce | Sonra | İyileştirme |
|--------|------|-------|-------------|
| Sales list (100 items) | 450 KB | 120 KB (gzip) | **73% azalma** |
| Invoice detail | 85 KB | 25 KB (gzip) | **71% azalma** |
| Transfer time (3G) | ~2s | ~0.6s | **70% hızlanma** |
| Bandwidth cost | 100% | 30% | **70% tasarruf** |

---

## 🎯 Best Practices

### 1. Threshold Ayarlama

✅ **Doğru:**
```typescript
threshold: 1024 // 1KB
```

❌ **Yanlış:**
```typescript
threshold: 0 // Tüm response'ları sıkıştır (overhead)
threshold: 10000 // Çok yüksek (büyük response'lar sıkıştırılmaz)
```

### 2. Filter Kullanımı

✅ **Doğru:**
```typescript
if (path.endsWith('/pdf')) return false; // Binary hariç
```

❌ **Yanlış:**
```typescript
// Filter yok → Tüm response'lar sıkıştırılır (binary'ler bozulabilir)
```

### 3. Middleware Sırası

✅ **Doğru:**
```typescript
app.use(cors());
app.use(compression()); // CORS'tan sonra
app.use(express.json());
```

❌ **Yanlış:**
```typescript
app.use(express.json());
app.use(compression()); // JSON parser'dan sonra (çok geç)
```

---

## 🔍 Debugging

### Compression Çalışmıyor?

1. **Accept-Encoding header kontrolü:**
   ```bash
   curl -H "Accept-Encoding: gzip" -I http://localhost:5174/api/sales
   ```

2. **Response size kontrolü:**
   - Threshold altı mı?
   - Filter ile hariç tutulmuş mu?

3. **Middleware sırası:**
   - Compression, JSON parser'dan önce mi?

4. **Content-Type kontrolü:**
   - JSON response mu?
   - Binary response mu?

---

## 📚 Kaynaklar

- [Express Compression Middleware](https://github.com/expressjs/compression)
- [HTTP Compression](https://developer.mozilla.org/en-US/docs/Web/HTTP/Compression)
- [Brotli Compression](https://github.com/google/brotli)

---

**Oluşturulma Tarihi:** 2025-01-XX  
**Teklifbul Rule v1.0 - Response Compression**

