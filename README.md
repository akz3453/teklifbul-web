# Teklifbul - Supplier Matching and Publish System

This project implements a complete supplier matching and publish functionality for the Teklifbul platform.

## 📁 Category Groups

Kategori Grupları özelliği, kullanıcıların kendi kategori setlerini oluşturup tekrar kullanabilmesini sağlar.

### Veri Modeli

- **Koleksiyon**: `users/{uid}/categoryGroups/{groupId}`
- **Alanlar**:
  - `name`: string (grup adı)
  - `categories`: string[] (slug formatında kategori listesi)
  - `createdAt`: timestamp
  - `updatedAt`: timestamp

### Özellikler

- **Grup Oluşturma**: 2 adımlı modal ile grup adı ve kategori seçimi
- **Grup Yönetimi**: Düzenleme, silme, yeniden adlandırma
- **Otomatik Uygulama**: Grup seçildiğinde talep formundaki kategori chip'leri otomatik dolar
- **Slug Normalizasyonu**: Kategoriler tutarlı slug formatında saklanır
- **Kullanıcı İzolasyonu**: Her kullanıcı sadece kendi gruplarını görebilir/düzenleyebilir

### Kullanım

1. **Talep Oluştur** sayfasında "Kategori Grupları" bölümünde
2. **Grup Seç** dropdown'ından mevcut grupları seçin
3. **Grup Yönet** butonu ile yeni grup oluşturun veya mevcut grupları düzenleyin
4. Grup seçildiğinde kategori chip'leri otomatik olarak dolar

### Güvenlik

- Kullanıcılar sadece kendi gruplarına erişebilir
- Firestore güvenlik kuralları ile korunur
- Kategori slug'ları tutarlılık için normalize edilir

## 🔢 SATFK System

The system uses a canonical ID format for demands:
- **Format**: `SATFK-YYYYMMDD-XXXX`
- **SATFK**: Satın Alma Talep Formu Kodu (fixed prefix)
- **YYYYMMDD**: Demand creation date (local date)
- **XXXX**: Per-day incremental counter in Base36 (upper-case), zero-padded to 3-4 chars

Examples: `SATFK-20251024-001`, `SATFK-20251024-00A`, `SATFK-20251024-00C9`

### Key Features:
- **Auto-generated**: SATFK is automatically created by Cloud Functions when a demand is created
- **Immutable**: Once set, SATFK cannot be changed (enforced by Firestore rules)
- **Searchable**: Exact search by SATFK in all listing pages
- **Export-friendly**: All exported files are prefixed with SATFK

## 🚀 Running Instructions

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start Development Server**
   ```bash
   npm run dev
   ```

3. **Build for Production**
   ```bash
   npm run build
   ```

## 📋 Index Requirements

The application requires the following Firestore composite indexes:

### Main Demands Query
- Collection: `demands`
- Fields (in order):
  1. `isPublished` (ASC)
  2. `visibility` (ASC)
  3. `createdAt` (DESC)

### Category Filter Query
- Collection: `demands`
- Fields (in order):
  1. `categories` (ARRAY_CONTAINS)
  2. `isPublished` (ASC)
  3. `visibility` (ASC)
  4. `createdAt` (DESC)

To create these indexes:
1. Deploy the `firestore.indexes.json` file
2. Or create them manually in the Firebase Console

## 🔗 Publish Flow

### 1. Demand Creation
- Users create demands in `demand-new.html`
- Categories are normalized to slug format (e.g., "Elektrik Kablo" → "elektrik-kablo")
- Demand is saved with `isPublished` and `visibility` fields

### 2. Supplier Matching
When a demand is published:
1. System extracts category tags from the demand
2. Queries suppliers with matching categories using `array-contains-any`
3. Updates demand's `viewerIds` with matching supplier UIDs
4. Logs unmatched demands to `unmatchedDemands` collection for analysis

### 3. Access Control
- Public published demands (`isPublished=true`, `visibility=public`) are visible to all authenticated users
- Private/draft demands are only visible to the owner and admins
- Firestore security rules enforce these access controls

## 🛠️ Maintenance Scripts

### Backfill Script
Run `enhanced-backfill.js` to ensure data consistency:
```bash
node enhanced-backfill.js
```

This script:
- Normalizes category formats to slug format
- Ensures supplier records have correct fields
- Updates existing demands with proper category formatting

### Test Script
Run `test-supplier-matching-final.js` to verify functionality:
```bash
node test-supplier-matching-final.js
```

This script:
- Tests supplier queries with various category combinations
- Verifies slug conversion
- Simulates demand creation matching

## 📁 Key Files

- `main-demands.html` - Main demand listing with published public demands
- `demand-detail.html` - Demand detail with authorization logic
- `demand-new.html` - Demand creation with supplier matching
- `firestore.rules` - Security rules for demand access control
- `firestore.indexes.json` - Required composite indexes
- `enhanced-backfill.js` - Data consistency script
- `test-supplier-matching-final.js` - Verification script

## 🔒 Security

The system implements role-based access control:
- Owners can view/edit their own demands
- Admins have full access
- Public published demands are visible to all authenticated users
- Private demands are restricted to owners and admins

---

Cloud Agent PR Test: This line was added to verify PR creation.