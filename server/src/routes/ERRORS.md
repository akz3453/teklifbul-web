# 🚨 Error Catalog Documentation
## Teklifbul Rule v1.0 - Centralized Error Management

Bu dokümantasyon, backend'de kullanılan standart error response formatlarını açıklar.

---

## 📋 Error Response Format

### Success Response
```json
{
  "ok": true,
  ...
}
```

### Error Response
```json
{
  "ok": false,
  "error": "ERROR_NAME",
  "code": "ERROR_CODE",
  "message": "Kullanıcı dostu mesaj",
  "details": ["Detay 1", "Detay 2"],
  "retryAfterSec": 600
}
```

---

## 🔤 Error Names

| Error Name | HTTP Status | Açıklama |
|------------|-------------|----------|
| `VALIDATION_ERROR` | 400 | Geçersiz istek (validation hatası) |
| `FORBIDDEN` | 403 | Yetki yok |
| `NOT_FOUND` | 404 | Kaynak bulunamadı |
| `CONFLICT` | 409 | Çakışma durumu |
| `RATE_LIMITED` | 429 | Çok fazla istek |
| `PROVIDER_ERROR` | 502 | E-belge sağlayıcı hatası |
| `INTERNAL_ERROR` | 500 | Sunucu hatası |

---

## 🔢 Error Codes

| Error Code | Error Name | Açıklama |
|------------|------------|----------|
| `VALIDATION_FAILED` | `VALIDATION_ERROR` | Genel validation hatası |
| `EDOC_LOCKED_SALE` | `VALIDATION_ERROR` | E-belge kilidi: kritik alanlar değiştirilemez |
| `PERMISSION_DENIED` | `FORBIDDEN` | Yetki yok |
| `RESOURCE_NOT_FOUND` | `NOT_FOUND` | Kaynak bulunamadı |
| `CONFLICT_STATE` | `CONFLICT` | Çakışma durumu |
| `RATE_LIMIT_HIT` | `RATE_LIMITED` | Rate limit aşıldı |
| `PROVIDER_FAILED` | `PROVIDER_ERROR` | E-belge sağlayıcı hatası |
| `INTERNAL` | `INTERNAL_ERROR` | Sunucu hatası |

---

## 📝 Örnek Error Response'lar

### 1. Validation Error
```json
{
  "ok": false,
  "error": "VALIDATION_ERROR",
  "code": "VALIDATION_FAILED",
  "message": "Geçersiz istek gövdesi",
  "details": [
    "companyId: Company ID zorunludur",
    "items.0.quantity: Quantity pozitif sayı olmalıdır"
  ]
}
```

### 2. Permission Denied
```json
{
  "ok": false,
  "error": "FORBIDDEN",
  "code": "PERMISSION_DENIED",
  "message": "Bu işlem için yetkiniz yok",
  "details": ["perm: sales.create"]
}
```

### 3. E-Doc Locked Sale
```json
{
  "ok": false,
  "error": "VALIDATION_ERROR",
  "code": "EDOC_LOCKED_SALE",
  "message": "E-belge kilidi: kritik alanlar değiştirilemez",
  "details": [
    "Bu satış, GİB'e gönderilmiş/Onaylanmış e-belgeye bağlı. Kalem/tutar/vergi/adres gibi kritik alanlar değiştirilemez.",
    "Düzeltme için: ilgili faturayı/irsaliyeyi iptal edin veya iade/düzeltme belgesi süreci kullanın."
  ]
}
```

### 4. Rate Limited
```json
{
  "ok": false,
  "error": "RATE_LIMITED",
  "code": "RATE_LIMIT_HIT",
  "message": "Çok fazla istek",
  "retryAfterSec": 600
}
```

### 5. Not Found
```json
{
  "ok": false,
  "error": "NOT_FOUND",
  "code": "RESOURCE_NOT_FOUND",
  "message": "Satış bulunamadı"
}
```

### 6. Provider Error
```json
{
  "ok": false,
  "error": "PROVIDER_ERROR",
  "code": "PROVIDER_FAILED",
  "message": "E-belge sağlayıcı hatası",
  "details": ["Provider connection timeout"]
}
```

### 7. Internal Error
```json
{
  "ok": false,
  "error": "INTERNAL_ERROR",
  "code": "INTERNAL",
  "message": "Beklenmeyen hata"
}
```

---

## 🛠️ Kullanım

### Error Catalog Helper Functions

```typescript
import { Errors } from '../errors/errorCatalog.js';
import { respondError } from '../errors/respondError.js';

// Validation error
respondError(res, Errors.validation('Geçersiz istek', ['field: mesaj']));

// Permission denied
respondError(res, Errors.forbidden('Bu işlem için yetkiniz yok', 'sales.create'));

// Not found
respondError(res, Errors.notFound('Satış bulunamadı'));

// Rate limited
respondError(res, Errors.rateLimited(600));

// Provider error
respondError(res, Errors.providerError('E-belge sağlayıcı hatası', ['Connection timeout']));

// E-doc locked sale
respondError(res, Errors.edocLockedSale(
  'E-belge kilidi: kritik alanlar değiştirilemez',
  ['Detay mesajı']
));

// Internal error
respondError(res, Errors.internal('Beklenmeyen hata'));
```

### Custom Error

```typescript
import { makeError } from '../errors/errorCatalog.js';
import { respondError } from '../errors/respondError.js';

const customError = makeError({
  error: 'VALIDATION_ERROR',
  code: 'VALIDATION_FAILED',
  message: 'Özel mesaj',
  details: ['Detay 1', 'Detay 2']
});

respondError(res, customError);
```

---

## 🔄 Middleware Integration

### Validation Middleware
```typescript
// server/src/middleware/validate.ts
respondError(res, Errors.validation('Geçersiz istek gövdesi', details));
```

### Permission Middleware
```typescript
// server/middleware/requirePermission.ts
respondError(res, Errors.forbidden('Bu işlem için yetkiniz yok', permKey));
```

### Rate Limit Middleware
```typescript
// server/src/middleware/rateLimit.ts
respondError(res, Errors.rateLimited(retryAfterSec));
```

---

## 📍 Route Examples

### Sales Route - E-Doc Locked Sale
```typescript
// server/src/routes/sales.ts
if (docLinkedLock && hasCriticalFieldChanges(...)) {
  return respondError(
    res,
    Errors.edocLockedSale(
      'E-belge kilidi: kritik alanlar değiştirilemez',
      ['Detay mesajları']
    )
  );
}
```

### Invoice Route - Not Found
```typescript
// server/src/routes/invoices.ts
if (!invoiceDoc.exists) {
  return respondError(res, Errors.notFound('Fatura bulunamadı'));
}
```

### Provider Error
```typescript
// server/src/services/invoiceService.ts
try {
  await provider.sendInvoice(...);
} catch (error) {
  throw Errors.providerError('E-belge sağlayıcı hatası', [error.message]);
}
```

---

## 🎯 Best Practices

### 1. Her Zaman Error Catalog Kullan
❌ **Yanlış:**
```typescript
res.status(400).json({ ok: false, error: 'Hata' });
```

✅ **Doğru:**
```typescript
respondError(res, Errors.validation('Hata'));
```

### 2. Detaylı Mesajlar
❌ **Yanlış:**
```typescript
Errors.validation('Hata');
```

✅ **Doğru:**
```typescript
Errors.validation('Geçersiz istek', ['field: mesaj']);
```

### 3. Uygun Error Code Kullan
❌ **Yanlış:**
```typescript
Errors.validation('E-belge kilidi');
```

✅ **Doğru:**
```typescript
Errors.edocLockedSale('E-belge kilidi: kritik alanlar değiştirilemez');
```

### 4. Provider Error'da Detay Verme
❌ **Yanlış:**
```typescript
Errors.providerError('Hata', [credentials.secret]);
```

✅ **Doğru:**
```typescript
Errors.providerError('E-belge sağlayıcı hatası', ['Connection timeout']);
```

---

## 🔍 Error Code Mapping

| Senaryo | Error Name | Error Code | HTTP Status |
|---------|------------|------------|-------------|
| Zod validation hatası | `VALIDATION_ERROR` | `VALIDATION_FAILED` | 400 |
| E-belge kilidi | `VALIDATION_ERROR` | `EDOC_LOCKED_SALE` | 400 |
| Permission yok | `FORBIDDEN` | `PERMISSION_DENIED` | 403 |
| Resource bulunamadı | `NOT_FOUND` | `RESOURCE_NOT_FOUND` | 404 |
| Çakışma | `CONFLICT` | `CONFLICT_STATE` | 409 |
| Rate limit | `RATE_LIMITED` | `RATE_LIMIT_HIT` | 429 |
| Provider hatası | `PROVIDER_ERROR` | `PROVIDER_FAILED` | 502 |
| Sunucu hatası | `INTERNAL_ERROR` | `INTERNAL` | 500 |

---

## 🧪 Test Senaryoları

### Senaryo 1: Validation Error
```bash
curl -X POST http://localhost:3000/api/sales \
  -H "Content-Type: application/json" \
  -d '{"companyId": ""}'

# Response:
{
  "ok": false,
  "error": "VALIDATION_ERROR",
  "code": "VALIDATION_FAILED",
  "message": "Geçersiz istek gövdesi",
  "details": ["companyId: Company ID zorunludur"]
}
```

### Senaryo 2: Permission Denied
```bash
curl -X POST http://localhost:3000/api/sales \
  -H "Authorization: Bearer invalid_token"

# Response:
{
  "ok": false,
  "error": "FORBIDDEN",
  "code": "PERMISSION_DENIED",
  "message": "Bu işlem için yetkiniz yok",
  "details": ["perm: sales.create"]
}
```

### Senaryo 3: Rate Limited
```bash
# 5+ istek gönder (10 dakika içinde)
curl -X POST http://localhost:3000/api/invoices/123/send

# Response:
{
  "ok": false,
  "error": "RATE_LIMITED",
  "code": "RATE_LIMIT_HIT",
  "message": "Çok fazla istek",
  "retryAfterSec": 600
}
```

---

## 📊 Error Tracking

Tüm error'lar `logger` ile loglanır:
- `logger.warn()` - Validation, Permission, Rate Limit
- `logger.error()` - Provider Error, Internal Error

Error details production'da gizlenir (sadece development'ta gösterilir).

---

**Oluşturulma Tarihi:** 2025-01-XX  
**Teklifbul Rule v1.0 - Centralized Error Management**

