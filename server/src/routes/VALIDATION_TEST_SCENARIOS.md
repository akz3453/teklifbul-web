# 🔍 Zod Validation Test Senaryoları
## Teklifbul Rule v1.0 - Backend Input Validation

Bu dosya, Zod validation middleware'inin test senaryolarını içerir.
Manuel test için curl komutları ve beklenen sonuçlar.

---

## 📋 Test Senaryoları

### 1. Missing ID Parameter
**Endpoint:** `GET /api/invoices/:id`  
**Test:**
```bash
curl -X GET "http://localhost:3000/api/invoices/" \
  -H "Authorization: Bearer YOUR_TOKEN"
```
**Beklenen:**
- Status: 404 (route bulunamadı) veya 400 (validation error)
- Response: `{ ok: false, error: 'VALIDATION_ERROR', details: ['id: Required'], code: 'VALIDATION_FAILED' }`

---

### 2. Invalid Provider Key
**Endpoint:** `PUT /api/edoc/settings`  
**Test:**
```bash
curl -X PUT "http://localhost:3000/api/edoc/settings" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "test-company-id",
    "edoc": {
      "providerKey": "invalid_provider"
    }
  }'
```
**Beklenen:**
- Status: 400
- Response: `{ ok: false, error: 'VALIDATION_ERROR', details: ['edoc.providerKey: Invalid enum value. Expected "mock" | "integrator_x" | "integrator_y" | null'], code: 'VALIDATION_FAILED' }`

---

### 3. Invalid VKN Length
**Endpoint:** `PUT /api/edoc/settings`  
**Test:**
```bash
curl -X PUT "http://localhost:3000/api/edoc/settings" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "test-company-id",
    "edoc": {
      "providerKey": "mock",
      "sender": {
        "vkn": "12345",
        "title": "Test Şirket",
        "taxOffice": "Test Vergi Dairesi",
        "address": {
          "line1": "Test Adres",
          "city": "İstanbul",
          "district": "Kadıköy"
        }
      }
    }
  }'
```
**Beklenen:**
- Status: 400
- Response: `{ ok: false, error: 'VALIDATION_ERROR', details: ['edoc.sender.vkn: VKN 10 veya 11 haneli olmalıdır'], code: 'VALIDATION_FAILED' }`

---

### 4. Empty Credentials Object
**Endpoint:** `PUT /api/edoc/credentials`  
**Test:**
```bash
curl -X PUT "http://localhost:3000/api/edoc/credentials" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "test-company-id",
    "providerKey": "mock",
    "credentials": {}
  }'
```
**Beklenen:**
- Status: 400
- Response: `{ ok: false, error: 'VALIDATION_ERROR', details: ['credentials: Credentials boş olamaz, en az bir alan içermelidir'], code: 'VALIDATION_FAILED' }`

---

### 5. Missing shipToAddress.line1
**Endpoint:** `POST /api/sales/:saleId/delivery-note`  
**Test:**
```bash
curl -X POST "http://localhost:3000/api/sales/test-sale-id/delivery-note" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "test-company-id",
    "shipToAddress": {
      "city": "İstanbul",
      "district": "Kadıköy"
    }
  }'
```
**Beklenen:**
- Status: 400
- Response: `{ ok: false, error: 'VALIDATION_ERROR', details: ['shipToAddress.line1: Required'], code: 'VALIDATION_FAILED' }`

---

### 6. CompanyId as Number (Type Error)
**Endpoint:** `GET /api/edoc/settings?companyId=...`  
**Test:**
```bash
curl -X GET "http://localhost:3000/api/edoc/settings?companyId=12345" \
  -H "Authorization: Bearer YOUR_TOKEN"
```
**Not:** Query string'de number gönderilemez (her zaman string), ancak body'de test edilebilir:
```bash
curl -X PUT "http://localhost:3000/api/edoc/settings" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": 12345,
    "edoc": {
      "providerKey": "mock"
    }
  }'
```
**Beklenen:**
- Status: 400
- Response: `{ ok: false, error: 'VALIDATION_ERROR', details: ['companyId: Expected string, received number'], code: 'VALIDATION_FAILED' }`

---

## ✅ Başarılı Senaryolar

### 7. Valid Invoice ID
**Endpoint:** `GET /api/invoices/:id`  
**Test:**
```bash
curl -X GET "http://localhost:3000/api/invoices/valid-invoice-id" \
  -H "Authorization: Bearer YOUR_TOKEN"
```
**Beklenen:**
- Status: 200 veya 403/404 (permission/resource kontrolü sonrası)
- Validation geçer, handler çalışır

---

### 8. Valid E-Doc Settings
**Endpoint:** `PUT /api/edoc/settings`  
**Test:**
```bash
curl -X PUT "http://localhost:3000/api/edoc/settings" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "test-company-id",
    "edoc": {
      "providerKey": "mock",
      "sender": {
        "vkn": "1234567890",
        "title": "Test Şirket A.Ş.",
        "taxOffice": "Kadıköy Vergi Dairesi",
        "address": {
          "line1": "Test Mahallesi Test Sokak No:1",
          "line2": "Daire 2",
          "city": "İstanbul",
          "district": "Kadıköy",
          "postalCode": "34000",
          "country": "TR"
        }
      },
      "defaults": {
        "invoiceTypeDefault": "e_fatura",
        "scenarioDefault": "TEMEL"
      }
    }
  }'
```
**Beklenen:**
- Status: 200 (veya permission kontrolü sonrası)
- Validation geçer, handler çalışır

---

## 📝 Notlar

- Tüm testlerde `YOUR_TOKEN` yerine geçerli bir JWT token kullanılmalıdır
- `test-company-id` yerine geçerli bir company ID kullanılmalıdır
- Validation middleware, permission middleware'den **ÖNCE** çalışır (400 hızlı dönsün)
- Error formatı standart: `{ ok: false, error: 'VALIDATION_ERROR', details: [...], code: 'VALIDATION_FAILED' }`

---

**Oluşturulma Tarihi:** 2025-01-XX  
**Teklifbul Rule v1.0 - Backend Input Validation**

