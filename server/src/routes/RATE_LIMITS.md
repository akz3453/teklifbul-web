# 🚦 Rate Limiting Configuration
## Teklifbul Rule v1.0 - Critical Routes Protection

Bu dokümantasyon, backend API endpoint'lerinde uygulanan rate limiting kurallarını açıklar.

---

## 📊 Rate Limit Kategorileri

### 🔴 E-Belge Endpoint'leri (En Sıkı)

E-belge gönderim, durum sorgulama, PDF alma ve iptal işlemleri için sıkı limitler uygulanır.

| Endpoint | Method | Limit | Window | Key Prefix |
|----------|--------|-------|--------|------------|
| `/api/invoices/:id/send` | POST | 5 | 10 dakika | `edoc:send` |
| `/api/invoices/:id/status` | GET | 30 | 10 dakika | `edoc:status` |
| `/api/invoices/:id/pdf` | GET | 30 | 10 dakika | `edoc:pdf` |
| `/api/invoices/:id/cancel` | POST | 5 | 10 dakika | `edoc:cancel` |
| `/api/delivery-notes/:id/send` | POST | 5 | 10 dakika | `edoc:send` |
| `/api/delivery-notes/:id/status` | GET | 30 | 10 dakika | `edoc:status` |
| `/api/delivery-notes/:id/pdf` | GET | 30 | 10 dakika | `edoc:pdf` |
| `/api/delivery-notes/:id/cancel` | POST | 5 | 10 dakika | `edoc:cancel` |

**Gerekçe:** E-belge gönderim işlemleri maliyetli ve kritik olduğu için sıkı kontrol gereklidir.

---

### 🟡 E-Doc Settings (Orta Sıkı)

E-belge ayarları ve credentials yönetimi için orta seviye limitler.

| Endpoint | Method | Limit | Window | Key Prefix |
|----------|--------|-------|--------|------------|
| `/api/edoc/settings` | GET | 60 | 10 dakika | `edoc:settings:get` |
| `/api/edoc/settings` | PUT | 20 | 10 dakika | `edoc:settings:update` |
| `/api/edoc/credentials` | PUT | 10 | 10 dakika | `edoc:credentials:update` |

**Gerekçe:** Settings güncellemeleri sık yapılmamalı, credentials güncellemeleri daha da sıkı kontrol edilmeli.

---

### 🟢 Sale Document Creation (Orta)

Satıştan belge oluşturma işlemleri için orta seviye limitler.

| Endpoint | Method | Limit | Window | Key Prefix |
|----------|--------|-------|--------|------------|
| `/api/sales/:saleId/invoice` | POST | 20 | 10 dakika | `sale:document:creation` |
| `/api/sales/:saleId/delivery-note` | POST | 20 | 10 dakika | `sale:document:creation` |

**Gerekçe:** Belge oluşturma işlemleri normal kullanımda sık yapılmaz, ancak kötüye kullanımı engellemek için limit gerekli.

---

## 🔑 Key Generation

Rate limit key'leri şu formatta oluşturulur:

```
${keyPrefix}:${userId}:${companyId}:${ip}
```

**Örnek:**
```
edoc:send:user123:company456:192.168.1.1
```

**Notlar:**
- `userId`: JWT token'dan alınır (`req.user.uid` veya `req.user.id`)
- `companyId`: Body, query veya user context'ten alınır
- `ip`: Request IP adresi
- Eğer `userId` yoksa: `anon` kullanılır
- Eğer `companyId` yoksa: `no_company` kullanılır

---

## 📝 Error Response Format

Rate limit aşıldığında standart error formatı:

```json
{
  "ok": false,
  "error": "RATE_LIMITED",
  "message": "Çok fazla istek",
  "retryAfterSec": 600
}
```

**HTTP Status:** `429 Too Many Requests`

**Headers:**
- `RateLimit-Limit`: Maksimum istek sayısı
- `RateLimit-Remaining`: Kalan istek sayısı
- `RateLimit-Reset`: Reset zamanı (Unix timestamp)

---

## ⚙️ Environment Variables

Rate limit değerleri environment variable'lar ile override edilebilir:

| Variable | Default | Açıklama |
|----------|---------|----------|
| `RATE_LIMIT_EDOC_SEND_MAX` | 5 | E-belge gönderim limiti |
| `RATE_LIMIT_EDOC_STATUS_MAX` | 30 | E-belge durum sorgulama limiti |
| `RATE_LIMIT_EDOC_PDF_MAX` | 30 | E-belge PDF alma limiti |
| `RATE_LIMIT_EDOC_CANCEL_MAX` | 5 | E-belge iptal limiti |
| `RATE_LIMIT_EDOC_SETTINGS_GET_MAX` | 60 | Settings getirme limiti |
| `RATE_LIMIT_EDOC_SETTINGS_UPDATE_MAX` | 20 | Settings güncelleme limiti |
| `RATE_LIMIT_EDOC_CREDENTIALS_UPDATE_MAX` | 10 | Credentials güncelleme limiti |
| `RATE_LIMIT_SALE_DOCUMENT_CREATION_MAX` | 20 | Sale'dan belge oluşturma limiti |

**Örnek `.env` dosyası:**
```env
RATE_LIMIT_EDOC_SEND_MAX=10
RATE_LIMIT_EDOC_STATUS_MAX=50
```

---

## 📊 Logging

Rate limit aşıldığında şu bilgiler loglanır:

```javascript
logger.warn('Rate limit hit', {
  path: '/api/invoices/123/send',
  method: 'POST',
  userId: 'user123',
  companyId: 'company456',
  ip: '192.168.1.1',
  keyPrefix: 'edoc:send'
});
```

---

## 🔄 Middleware Sırası

Rate limit middleware'i şu sırada çalışır:

1. **Validation** (`validate`) - 400 hızlı dönsün
2. **Rate Limit** (`rateLimit`) - 429 hızlı dönsün
3. **Permission** (`requirePermission`) - 403
4. **Handler** - Business logic

**Örnek:**
```typescript
router.post('/invoices/:id/send',
  validate({ params: invoiceIdParamsSchema, body: companyIdBodySchema }),
  edocSendLimiter,
  requirePermission('einvoice.send'),
  handler
);
```

---

## 🧪 Test Senaryoları

### Senaryo 1: Rate Limit Aşımı
```bash
# 6. istek (limit: 5)
curl -X POST "http://localhost:3000/api/invoices/123/send" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"companyId": "test-company"}'
```

**Beklenen:**
- Status: 429
- Response: `{ ok: false, error: 'RATE_LIMITED', message: 'Çok fazla istek', retryAfterSec: 600 }`

### Senaryo 2: Farklı Kullanıcılar
Aynı endpoint'e farklı kullanıcılardan istek geldiğinde, her kullanıcı kendi limitine sahiptir.

### Senaryo 3: Window Reset
10 dakika sonra limit sıfırlanır ve yeni istekler kabul edilir.

---

## 📈 Monitoring

Rate limit hit'leri şu şekilde izlenebilir:

1. **Log Files:** `logger.warn('Rate limit hit', ...)` logları
2. **Metrics:** Rate limit hit sayısı ve endpoint bazlı dağılım
3. **Alerts:** Kritik endpoint'lerde rate limit aşımı için alert kurulabilir

---

## 🔧 Troubleshooting

### Problem: Rate limit çok sıkı
**Çözüm:** Environment variable ile limit artırılabilir:
```env
RATE_LIMIT_EDOC_SEND_MAX=10
```

### Problem: Rate limit çalışmıyor
**Kontrol Listesi:**
1. Middleware sırası doğru mu? (validate -> rateLimit -> permission -> handler)
2. Key generator doğru çalışıyor mu?
3. Express-rate-limit dependency yüklü mü?

### Problem: Farklı kullanıcılar aynı limiti paylaşıyor
**Kontrol:** Key generator'da `userId` doğru alınıyor mu?

---

**Oluşturulma Tarihi:** 2025-01-XX  
**Teklifbul Rule v1.0 - Rate Limiting**

