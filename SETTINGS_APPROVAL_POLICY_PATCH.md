# Settings.html - Approval Policy Management Patch

## 📋 Özet
Bu patch, settings.html dosyasına "Miktar Bazlı Onay Sistemi" ve yetki kontrolü özelliklerini ekler.

## 🎯 Yapılan Değişiklikler

### 1. Miktar Bazlı Onay Sistemi UI İyileştirmeleri
- **Açıklayıcı bilgi kutusu eklendi**: Sistemin nasıl çalıştığı açıklandı
- **Özel durum uyarısı**: CEO, İşveren, Yönetim Kurulu Başkanı ve Genel Müdür rollerinin sınırsız yetkiye sahip olduğu belirtildi
- **Örnek senaryolar**: Kullanıcı dostu örnekler eklendi

### 2. Satın Alma Rolleri Eklendi
- Satın Alma Müdürü
- Satın Alma Yetkilisi
- Satın Alma Uzmanı
- Satın Alma Uzman Yardımcısı

### 3. Yetki Kontrolü Sistemi
- **Sayfa görünürlüğü**: Sadece CEO, İşveren, Yönetim Kurulu Başkanı, Genel Müdür rolleri sayfayı görebilir
- **Kayıt kontrolü**: Kayıt işlemi sırasında yetki kontrolü yapılır
- **Uyarı mesajları**: Yetkisi olmayan kullanıcılar için açıklayıcı uyarılar

### 4. Sayfa Navigasyonu ve Veri Yükleme
- **Otomatik yükleme**: Approval settings sayfasına geçildiğinde veriler otomatik yüklenir
- **Sayfa yeniden yükleme**: Kayıt sonrası limitler otomatik görünür
- **Debug log'ları**: Detaylı console log'ları eklendi

### 5. Hata Düzeltmeleri
- `db` değişkeni scope sorunu çözüldü (`window.__db` kullanımı)
- Fonksiyon tanımlama sırası düzeltildi
- `loadAndSetupApprovalPolicyManagement` fonksiyonu için fallback mekanizması eklendi

## 🔧 Teknik Detaylar

### Yeni Fonksiyonlar

#### `loadApprovalLimits(companyId, currentPolicy)`
- Approval limits'leri Firestore'dan yükler
- UI'ı günceller
- Debug log'ları içerir

#### `loadAndSetupApprovalPolicyManagement(companyId, userData)`
- Sayfa yükleme ve yetki kontrolü yapar
- Firestore'dan approval policy yükler
- UI elementlerini doldurur

#### `saveApprovalPolicy(companyId)`
- Yetki kontrolü yapar
- Form verilerini toplar
- Firestore'a kaydeder
- Audit log oluşturur
- Sayfayı yeniden yükler

### Değiştirilen Fonksiyonlar

#### `initSettingsNavigation()`
- Approval settings sayfasına geçildiğinde otomatik veri yükleme eklendi
- Fonksiyon varlık kontrolü eklendi

#### `addApprovalLimitRow(limitData)`
- Satın alma rolleri eklendi
- Daha iyi hata yönetimi

#### `setupApprovalLimitButton()`
- Duplicate event listener önleme
- Flag kontrolü eklendi

## 📝 Önemli Kod Parçaları

### Yetki Kontrolü
```javascript
const unlimitedApprovalRoles = [
  'buyer:ceo',
  'buyer:isveren',
  'buyer:yonetim_kurulu_baskani',
  'buyer:genel_mudur'
];

const hasPermission = unlimitedApprovalRoles.includes(userRole);
```

### Satın Alma Rolleri
```javascript
const allBuyerRoles = [
  // Yönetim Rolleri
  { value: 'buyer:genel_mudur', label: 'Genel Müdür' },
  { value: 'buyer:genel_mudur_yardimcisi', label: 'Genel Müdür Yardımcısı' },
  { value: 'buyer:ceo', label: 'CEO' },
  { value: 'buyer:isveren', label: 'İşveren (Şirket Sahibi)' },
  { value: 'buyer:yonetim_kurulu_baskani', label: 'Yönetim Kurulu Başkanı' },
  { value: 'buyer:yonetim_kurulu_uyesi', label: 'Yönetim Kurulu Üyesi' },
  // Satın Alma Rolleri
  { value: 'buyer:satinalma_muduru', label: 'Satın Alma Müdürü' },
  { value: 'buyer:satinalma_yetkilisi', label: 'Satın Alma Yetkilisi' },
  { value: 'buyer:satinalma_uzmani', label: 'Satın Alma Uzmanı' },
  { value: 'buyer:satinalma_uzman_yardimcisi', label: 'Satın Alma Uzman Yardımcısı' }
];
```

### Sayfa Navigasyonu İyileştirmesi
```javascript
if (targetPage === 'approval-settings') {
  setTimeout(async () => {
    try {
      const auth = window.__auth;
      const db = window.__db;
      
      if (!auth || !db) {
        console.error('❌ Auth veya DB bulunamadı');
        return;
      }
      
      const { getDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
      
      if (auth?.currentUser) {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        const userData = userDoc.exists() ? userDoc.data() : {};
        const myCompanyId = userData.companyId || userData.companies?.[0];
        
        if (myCompanyId && typeof loadAndSetupApprovalPolicyManagement === 'function') {
          await loadAndSetupApprovalPolicyManagement(myCompanyId, userData);
          if (typeof setupApprovalLimitButton === 'function') {
            setupApprovalLimitButton();
          }
        }
      }
    } catch (e) {
      console.error('❌ Approval settings yüklenirken hata:', e);
    }
  }, 100);
}
```

## 🔍 Önemli Notlar

1. **Firestore Bağlantısı**: `window.__db` ve `window.__auth` kullanılıyor
2. **Async İşlemler**: Tüm Firestore işlemleri async/await ile yapılıyor
3. **Hata Yönetimi**: Try-catch blokları ve kullanıcı dostu mesajlar
4. **Debug**: Console log'ları ile detaylı takip
5. **Teklifbul Rule v1.0**: Kod içinde yorum olarak işaretlendi

## 📦 İlgili Dosyalar

- `settings.html` - Ana dosya
- `assets/js/services/approval-guards.js` - Onay kontrol fonksiyonları (ayrı patch)

## ✅ Test Senaryoları

1. ✅ Yetkisi olan kullanıcı limit ekleyebilir
2. ✅ Yetkisi olmayan kullanıcı sayfayı göremez
3. ✅ Limitler kaydedilir ve yüklenir
4. ✅ Sayfa navigasyonu sonrası limitler görünür
5. ✅ Satın alma rolleri dropdown'da görünür

## 🚀 Deployment Notları

- Firestore'da `companies/{companyId}/approvalPolicy` yapısı kullanılıyor
- `approval_limits` array'i içinde limitler saklanıyor
- Audit log'ları `audit` koleksiyonuna yazılıyor

---

**Patch Tarihi**: 2025-01-20  
**Versiyon**: 1.0  
**Teklifbul Rule**: v1.0

