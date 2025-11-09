# ✅ Onay Mekanizması Yönetimi - Uygulama Özeti

## 📋 Yapılan Değişiklikler

### 1. Yüklenici Rolü Kaldırıldı ✅
- **Dosyalar**: `settings.html`, `role-permissions-management.html`
- **Kaldırılan**: `buyer:yuklenici` rolü tüm roller listesinden ve yetki tanımlarından kaldırıldı
- **Etkilenen Bölümler**:
  - `defaultBuyerRoles` array'inden kaldırıldı
  - `rolePermissions` object'inden kaldırıldı
  - Şirket rolü seçim dropdown'larından kaldırıldı

### 2. Onay Mekanizması Yönetimi Ekranı Eklendi ✅
- **Dosya**: `settings.html`
- **Konum**: "Şirket Kullanıcıları Yönetimi" bölümünden sonra
- **Görünürlük**: Sadece "Onay Politikası Yönetimi" yetkisine sahip kullanıcılar için
- **Yetkili Roller**:
  - `buyer:genel_mudur` (Genel Müdür)
  - `buyer:ceo` (CEO)
  - `buyer:isveren` (İşveren - Şirket Sahibi)
  - `buyer:yonetim_kurulu_baskani` (Yönetim Kurulu Başkanı)
  - `buyer:yonetim_kurulu_uyesi` (Yönetim Kurulu Üyesi)

### 3. Yönetilebilir Ayarlar

#### Temel Onay Politikası
- ✅ **En az bir üst onaycı zorunlu**: Checkbox
- ✅ **Sıkı üst onay zorunluluğu**: Checkbox (opsiyonel)

#### Üst Onaycı Rolleri
- ✅ Checkbox listesi ile seçilebilir roller:
  - Genel Müdür
  - Genel Müdür Yardımcısı
  - CEO
  - İşveren (Şirket Sahibi)
  - Yönetim Kurulu Başkanı
  - Yönetim Kurulu Üyesi

#### Son Onaycı Rolleri (Opsiyonel)
- ✅ Checkbox listesi ile seçilebilir roller
- ✅ Belirli işlemler için sadece bu rollere sahip kullanıcılar son onay verebilir

#### Hatırlatma Saatleri
- ✅ Text input (virgülle ayrılmış saatler)
- ✅ Örnek: "24, 48, 72" → 24 saat, 48 saat ve 72 saat sonra hatırlatma

### 4. Veri Saklama
- **Firestore Yapısı**: `companies/{companyId}.approvalPolicy`
```javascript
{
  require_at_least_one_top_approver: boolean,
  top_approver_roles: string[],
  reminder_hours: number[],
  strict_top_required: boolean,
  allowed_final_approver_roles: string[],
  updatedAt: Timestamp,
  updatedBy: string (userId)
}
```

### 5. Guard Fonksiyonları Güncellendi ✅
- **Dosya**: `assets/js/services/approval-guards.js`
- **Yeni Fonksiyon**: `getApprovalPolicy(companyId)`
  - Şirket düzeyindeki `approvalPolicy`'yi getirir
  - Yoksa global `defaultApprovalPolicy`'yi kullanır
- **Güncellenen Fonksiyonlar**:
  - `hasActiveTopApprover(companyId)`: Şirket düzeyindeki policy'yi kullanır
  - `canIssuePO(companyId)`: Şirket düzeyindeki policy'yi kullanır
  - `canESignApprove(user, rolePermissions, companyId)`: Şirket düzeyindeki policy'yi kullanır (async)

### 6. Audit Logging ✅
- **Action**: `APPROVAL_POLICY_UPDATED`
- **Entity Type**: `company`
- **Metadata**: `{ approvalPolicy }`
- Her değişiklik audit log'a kaydedilir

## 🎯 Kullanım

### Onay Mekanizmasını Düzenleme
1. **Giriş**: `settings.html` sayfasına git
2. **Yetki Kontrolü**: "Onay Politikası Yönetimi" yetkisine sahip bir rol ile giriş yap
3. **Bölüm**: "Onay Mekanizması Yönetimi" bölümü görünür olacak
4. **Düzenleme**:
   - Checkbox'ları işaretleyerek/kaldırarak ayarları değiştir
   - Hatırlatma saatlerini virgülle ayırarak girin
   - Üst onaycı ve son onaycı rollerini seçin
5. **Kaydetme**: "💾 Onay Politikasını Kaydet" butonuna tıklayın
6. **Onay**: Başarılı kayıt mesajı gösterilir ve audit log'a kaydedilir

## 🔍 Erişim Kontrolü

### Hangi Kullanıcılar Görebilir?
- Sadece **"Onay Politikası Yönetimi"** yetkisine sahip kullanıcılar
- Bu yetki şu rollerde `true`:
  - `buyer:genel_mudur`
  - `buyer:ceo`
  - `buyer:isveren`
  - `buyer:yonetim_kurulu_baskani`
  - `buyer:yonetim_kurulu_uyesi`

### Görünürlük
- Yetkisiz kullanıcılar için bölüm **görünmez**
- JavaScript kontrolü ile dinamik olarak gösterilir/gizlenir

## 📝 Notlar

### Şirket Düzeyi vs Global Policy
- Her şirket kendi `approvalPolicy`'sine sahip olabilir
- Şirket düzeyinde policy yoksa global `defaultApprovalPolicy` kullanılır
- Şirket policy'si global policy'nin üzerine yazar (merge)

### Backward Compatibility
- Eski kodlar `approvalPolicy` export'unu kullanmaya devam edebilir
- Yeni kodlar `getApprovalPolicy(companyId)` kullanmalı

### Test Senaryoları
1. **Yetkili Kullanıcı**: Onay mekanizması yönetimi bölümü görünür olmalı
2. **Yetkisiz Kullanıcı**: Bölüm görünmez olmalı
3. **Kaydetme**: Ayarlar Firestore'a kaydedilmeli
4. **Audit Log**: Her değişiklik audit'e yazılmalı
5. **Guard Fonksiyonları**: Şirket düzeyindeki policy'yi kullanmalı

## ✅ Sistem Durumu

- ✅ Yüklenici rolü kaldırıldı
- ✅ Onay mekanizması yönetimi UI'ı eklendi
- ✅ Firestore entegrasyonu yapıldı
- ✅ Guard fonksiyonları güncellendi
- ✅ Audit logging eklendi
- ✅ Linter hataları yok

**Sistem hazır! 🎉**

