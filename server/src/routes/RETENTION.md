# 🗄️ Retention & Soft Delete Policy
## Teklifbul Rule v1.0 - No Hard Delete for Audit Entities

Bu dokümantasyon, backend'de kullanılan retention ve soft delete policy'yi açıklar.

---

## 📋 Genel Bakış

### Amaç

Denetim kritik entity'lerde **hard delete'i kaldırmak**, yerine:
- **Soft delete** (isDeleted, deletedAt, deletedBy)
- **Archive** (isArchived zaten var)
- **Retention**: Belirli kayıtlar asla silinmez (sale_revisions gibi)
- **API'da delete endpoint'leri davranışı standardize**

### Kapsam

**Minimum Kapsam:**
- `sales`
- `invoices`
- `delivery_notes`
- `sale_revisions`

---

## 🚫 Hard Delete Yasak Entity'ler

### 1. sale_revisions

**Kural:** HARD DELETE YOK (zaten yok). İleride de eklenmesin.

**Gerekçe:**
- Audit trail için kritik
- Onay sonrası düzenleme geçmişi
- Yasal uyumluluk

**Uygulama:**
- `sale_revisions` koleksiyonunda delete endpoint'i yok
- İleride eklenmemeli

---

## 🗑️ Soft Delete Alanları

### Ortak Soft Delete Alanları (Doc Level)

Aşağıdaki koleksiyonlara alan eklenir:
- `sales`
- `invoices`
- `delivery_notes`

**Fields:**
```typescript
{
  isDeleted: boolean;        // default: false
  deletedAt?: Timestamp;     // Silme zamanı
  deletedBy?: {              // Silen kullanıcı
    userId: string;
    email?: string | null;
    displayName?: string | null;
  }
}
```

**Not:** Firestore schema migration gerekmeyebilir; yoksa default `false` kabul et.

---

## 📍 Sales Delete Endpoint

### DELETE /api/sales/:id

**Permission:** `sales.delete` (kalsın)

**Yeni Davranış:**

1. **Sale bulunamazsa:**
   - `NOT_FOUND` (error catalog)
   - `code: 'RESOURCE_NOT_FOUND'`

2. **Idempotent:**
   - Eğer sale zaten `isDeleted: true` ise
   - `ok: true` dön (hata yok)

3. **E-belge bağlı satışlar:**
   - Eğer sale'a bağlı invoice/delivery varsa:
     - Eğer herhangi biri `sent` veya `accepted` ise:
       - `CONFLICT` dön:
         ```json
         {
           "ok": false,
           "error": "CONFLICT",
           "code": "CONFLICT_STATE",
           "message": "E-belgeye bağlı satış silinemez; arşivleyin veya iptal/iade süreci kullanın."
         }
         ```
     - Aksi halde soft delete serbest

4. **Soft delete set:**
   ```typescript
   {
     isDeleted: true,
     deletedAt: FieldValue.serverTimestamp(),
     deletedBy: {
       userId: currentUserId,
       email: userEmail,
       displayName: userDisplayName
     },
     isArchived: true,  // Opsiyonel (eğer zaten archived değilse)
     archivedAt: FieldValue.serverTimestamp(),
     archivedBy: currentUserId
   }
   ```

5. **Revision yaz:**
   - `sale_revisions`'a bir kayıt daha ekle:
     ```typescript
     {
       reason: 'SOFT_DELETE',  // Sistem reason (editReason gibi değil)
       diff: {
         changedFields: ['isDeleted', 'isArchived'],
         before: { isDeleted: false, isArchived: false },
         after: { isDeleted: true, isArchived: true }
       }
     }
     ```

---

## 🔍 List/Query Filtreleri

### Sales List Endpoint

**GET /api/sales**

**Default Filtre:**
- `isDeleted != true` filtrele
- Silinmiş kayıtlar görünmez

**Admin Opsiyonu:**
- Query param: `includeDeleted=true`
- Silinmiş kayıtları da getir

**Örnek:**
```typescript
// Default (silinmişler hariç)
GET /api/sales

// Admin (silinmişler dahil)
GET /api/sales?includeDeleted=true
```

### Invoices/Delivery Notes List

**Varsa list endpoint'leri:**
- `isDeleted != true` filtrele (default)
- Admin için `includeDeleted=true` opsiyonu

---

## 🎨 UI Davranışı

### Sale Detail

**"Sil" Butonu:**
- Soft delete sonrası:
  - Redirect (sales list'e)
  - Toast: "Satış silindi"

### Listeler

**Default:**
- Silinmiş kayıtlar görünmez
- `isDeleted: true` filtreleme aktif

**Admin Ekranı (Opsiyonel):**
- "Silinmişleri göster" toggle
- `includeDeleted=true` query param ile

---

## ⚠️ Conflict Kuralları

### E-Belge Bağlı Satışlar

**Kural:** Eğer sale'a bağlı invoice veya delivery note varsa ve herhangi biri `sent` veya `accepted` durumundaysa, satış silinemez.

**Kontrol Akışı:**
```
1. Sale'ın invoiceIds ve deliveryNoteIds'lerini al
2. Her invoice için:
   - status === 'sent' veya 'accepted' ise → CONFLICT
3. Her delivery note için:
   - status === 'sent' veya 'accepted' ise → CONFLICT
4. Hiçbiri sent/accepted değilse → Soft delete serbest
```

**Alternatifler:**
- **Arşivle:** `POST /api/sales/:id/archive`
- **İptal:** `POST /api/sales/:id/cancel`
- **İade/Düzeltme:** İlgili fatura/irsaliyeyi iptal et

---

## 🔄 Restore Endpoint

### POST /api/sales/:id/restore

**Permission:** `sales.delete` (ileride `sales.restore` ayrılabilir)

**Davranış:**

1. **Sale bulunamazsa:**
   - `NOT_FOUND` (error catalog)
   - `code: 'RESOURCE_NOT_FOUND'`

2. **Idempotent:**
   - Eğer sale `isDeleted !== true` ise
   - `ok: true, message: "Satış zaten aktif"` dön

3. **E-belge bağlı satışlar:**
   - Eğer sale'a bağlı invoice/delivery varsa:
     - Eğer herhangi biri `sent` veya `accepted` ise:
       - `CONFLICT` dön:
         ```json
         {
           "ok": false,
           "error": "CONFLICT",
           "code": "CONFLICT_STATE",
           "message": "E-belgeye bağlı satış geri yüklenemez; iptal/iade süreci gereklidir."
         }
         ```
     - Aksi halde restore serbest

4. **Restore işlemi:**
   ```typescript
   {
     isDeleted: false,
     deletedAt: FieldValue.delete(),  // null
     deletedBy: FieldValue.delete(),  // null
     isArchived: false,                // Opsiyonel ama önerilir
     archivedAt: FieldValue.delete(),
     archivedBy: FieldValue.delete()
   }
   ```

5. **Revision yaz:**
   - `sale_revisions`'a bir kayıt daha ekle:
     ```typescript
     {
       reason: 'RESTORE',
       diff: {
         changedFields: ['isDeleted', 'deletedAt', 'deletedBy', 'isArchived'],
         before: {
           isDeleted: true,
           deletedAt: Timestamp(...),
           deletedBy: { userId, email, displayName },
           isArchived: true
         },
         after: {
           isDeleted: false,
           deletedAt: null,
           deletedBy: null,
           isArchived: false
         }
       }
     }
     ```

**Response:**
```json
{
  "ok": true,
  "message": "Satış geri yüklendi"
}
```

### Test Senaryosu

```bash
# Restore request
POST /api/sales/abc123/restore
Body: { "companyId": "company1" }

# Response (success):
{
  "ok": true,
  "message": "Satış geri yüklendi"
}

# Response (idempotent):
{
  "ok": true,
  "message": "Satış zaten aktif"
}

# Response (conflict):
{
  "ok": false,
  "error": "CONFLICT",
  "code": "CONFLICT_STATE",
  "message": "E-belgeye bağlı satış geri yüklenemez; iptal/iade süreci gereklidir."
}
```

---

## 📊 Entity Bazlı Kurallar

### 1. sales

| Durum | Soft Delete | Hard Delete | Not |
|-------|-------------|-------------|-----|
| Draft | ✅ Serbest | ❌ Yasak | - |
| Pending Approval | ✅ Serbest | ❌ Yasak | - |
| Approved | ✅ Serbest (e-belge yoksa) | ❌ Yasak | E-belge varsa CONFLICT |
| E-belge Bağlı | ❌ CONFLICT | ❌ Yasak | Arşivle veya iptal |

### 2. invoices

| Durum | Soft Delete | Hard Delete | Not |
|-------|-------------|-------------|-----|
| Draft | ✅ Serbest | ❌ Yasak | - |
| Ready | ✅ Serbest | ❌ Yasak | - |
| Sent | ❌ Cancel kullan | ❌ Yasak | Cancel endpoint'i var |
| Accepted | ❌ Cancel kullan | ❌ Yasak | Cancel endpoint'i var |

**Not:** Invoice'lar için `cancel` endpoint'i kullanılmalı, soft delete değil.

### 3. delivery_notes

| Durum | Soft Delete | Hard Delete | Not |
|-------|-------------|-------------|-----|
| Draft | ✅ Serbest | ❌ Yasak | - |
| Ready | ✅ Serbest | ❌ Yasak | - |
| Sent | ❌ Cancel kullan | ❌ Yasak | Cancel endpoint'i var |
| Accepted | ❌ Cancel kullan | ❌ Yasak | Cancel endpoint'i var |

**Not:** Delivery note'lar için `cancel` endpoint'i kullanılmalı, soft delete değil.

### 4. sale_revisions

| Durum | Soft Delete | Hard Delete | Not |
|-------|-------------|-------------|-----|
| Herhangi | ❌ Yok | ❌ YASAK | Audit trail için kritik |

---

## 🔍 Firestore Index Gereksinimleri

### Composite Index'ler

**Sales List Query:**
```
companyId (ASC) + isDeleted (ASC) + createdAt (DESC)
companyId (ASC) + isArchived (ASC) + createdAt (DESC)
companyId (ASC) + isDeleted (ASC) + isArchived (ASC) + createdAt (DESC)
```

**Not:** Firestore'da `!= true` kontrolü için composite index gerekebilir. Alternatif olarak client-side filtreleme kullanılabilir.

---

## 🧪 Test Senaryoları

### Senaryo 1: Normal Soft Delete

```bash
# Draft satış sil
DELETE /api/sales/abc123
Body: { "companyId": "company1" }

# Response:
{
  "ok": true,
  "message": "Satış silindi"
}

# Sale document:
{
  "isDeleted": true,
  "deletedAt": Timestamp(...),
  "deletedBy": { "userId": "user1", ... }
}
```

### Senaryo 2: E-Belge Bağlı Satış

```bash
# Sent invoice'a bağlı satış sil
DELETE /api/sales/abc123
Body: { "companyId": "company1" }

# Response:
{
  "ok": false,
  "error": "CONFLICT",
  "code": "CONFLICT_STATE",
  "message": "E-belgeye bağlı satış silinemez; arşivleyin veya iptal/iade süreci kullanın."
}
```

### Senaryo 3: Idempotent Delete

```bash
# Zaten silinmiş satış sil
DELETE /api/sales/abc123
Body: { "companyId": "company1" }

# Response:
{
  "ok": true,
  "message": "Satış zaten silinmiş"
}
```

### Senaryo 4: List Filtreleme

```bash
# Default (silinmişler hariç)
GET /api/sales

# Admin (silinmişler dahil)
GET /api/sales?includeDeleted=true
```

---

## 📈 Audit Trail

### Soft Delete Revision

Her soft delete işlemi için `sale_revisions` koleksiyonuna kayıt eklenir:

```typescript
{
  saleId: "abc123",
  reason: "SOFT_DELETE",
  diff: {
    changedFields: ["isDeleted", "isArchived"],
    before: { isDeleted: false, isArchived: false },
    after: { isDeleted: true, isArchived: true }
  },
  editedBy: {
    userId: "user1",
    email: "user@example.com",
    displayName: "John Doe"
  },
  editedAt: Timestamp(...)
}
```

---

## 🎯 Best Practices

### 1. Hard Delete Kullanma

❌ **Yanlış:**
```typescript
await saleRef.delete(); // Hard delete
```

✅ **Doğru:**
```typescript
await saleRef.update({
  isDeleted: true,
  deletedAt: FieldValue.serverTimestamp(),
  deletedBy: { userId, email, displayName }
});
```

### 2. Conflict Kontrolü

❌ **Yanlış:**
```typescript
// E-belge kontrolü yok
await saleRef.update({ isDeleted: true });
```

✅ **Doğru:**
```typescript
// E-belge kontrolü var
if (hasLinkedEdoc(sale)) {
  return respondError(res, Errors.conflict('E-belgeye bağlı satış silinemez'));
}
await saleRef.update({ isDeleted: true });
```

### 3. List Filtreleme

❌ **Yanlış:**
```typescript
// Silinmiş kayıtlar da getiriliyor
const sales = await db.collection('sales').get();
```

✅ **Doğru:**
```typescript
// Silinmiş kayıtlar filtreleniyor
const sales = await db.collection('sales')
  .where('isDeleted', '!=', true)
  .get();
```

---

## 🔧 Migration Notları

### Mevcut Veriler

**Mevcut sales/invoices/delivery_notes:**
- `isDeleted` field'ı yoksa → default `false` kabul et
- Hard delete yapılmış kayıtlar → Geri getirilemez (zaten silinmiş)

**Yeni Kayıtlar:**
- Soft delete alanları otomatik set edilir
- Hard delete yapılmaz

---

## 📚 İlgili Dokümantasyon

- [Error Catalog](./ERRORS.md) - Conflict error formatı
- [Sale Revisions](./saleRevisionService.ts) - Revision tracking
- [Audit Service](./auditService.ts) - Audit logging

---

**Oluşturulma Tarihi:** 2025-01-XX  
**Teklifbul Rule v1.0 - Retention + Soft Delete Policy**

