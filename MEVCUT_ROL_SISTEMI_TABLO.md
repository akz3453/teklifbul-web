# TEKLİFBUL - MEVCUT ROL SİSTEMİ TABLOSU

## 📋 Genel Bakış

**Kullanıcı:** `teklifbulalici@gmail.com`  
**Şirket Durumu:** Hem Alıcı (Buyer) hem Tedarikçi (Supplier) rolüne sahip  
**Sorun:** Miktar Bazlı Onay Sistemi'nde sadece genel yönetim rolleri görünüyor, alıcı/tedarikçi özel rolleri görünmüyor.

---

## 🎯 ROL KATEGORİLERİ

### 1️⃣ SABİT YÖNETİM ROLLERİ (Her Zaman Gösterilir)
Bu roller hem alıcı hem tedarikçi şirketlerde ortak olarak kullanılır ve **öncelik sırasına göre** sıralanır:

| Öncelik | Rol Kodu | Türkçe Adı | Alıcı/Tedarikçi | Not |
|---------|----------|------------|-----------------|-----|
| 1 | `buyer:isveren` / `supplier:isveren` | İşveren (Şirket Sahibi) | Her İkisi | 1 ve 2 eşit, aynı kişi olabilir |
| 2 | `buyer:yonetim_kurulu_baskani` / `supplier:yonetim_kurulu_baskani` | Yönetim Kurulu Başkanı | Her İkisi | 1 ve 2 eşit, aynı kişi olabilir |
| 3 | `buyer:yonetim_kurulu_uyesi` / `supplier:yonetim_kurulu_uyesi` | Yönetim Kurulu Üyesi | Her İkisi | |
| 4 | `buyer:ceo` / `supplier:ceo` | CEO | Her İkisi | |
| 5 | `buyer:genel_mudur` / `supplier:genel_mudur` | Genel Müdür | Her İkisi | |
| 6 | `buyer:genel_mudur_yardimcisi` / `supplier:genel_mudur_yardimcisi` | Genel Müdür Yardımcısı | Her İkisi | |

**Öncelik 7+:** Dinamik roller (alıcı/tedarikçi özel rolleri)

---

### 2️⃣ ALICI (BUYER) ÖZEL ROLLERİ
Bu roller **sadece alıcı şirketlerde** görünür ve şirket kullanıcılarının `companyRole` alanından dinamik olarak alınır.

| Rol Kodu | Türkçe Adı | Varsayılan Listede | Mevcut Durum | Not |
|----------|------------|-------------------|--------------|-----|
| `buyer:satinalma_uzman_yardimcisi` | Satın Alma Uzman Yardımcısı | ✅ | ❌ Görünmüyor | Varsayılan listede var |
| `buyer:satinalma_uzmani` | Satın Alma Uzmanı | ✅ | ❌ Görünmüyor | Varsayılan listede var |
| `buyer:satinalma_yetkilisi` | Satın Alma Yetkilisi | ✅ | ❌ Görünmüyor | Varsayılan listede var |
| `buyer:satinalma_muduru` | Satın Alma Müdürü | ✅ | ❌ Görünmüyor | Varsayılan listede var |
| `buyer:santiye_yetkilisi` | Şantiye Yetkilisi | ❌ | ❌ Görünmüyor | Varsayılan listede YOK |
| `buyer:stok_depo` | Stok / Depo Yetkilisi | ❌ | ❌ Görünmüyor | Varsayılan listede YOK |
| `buyer:muhasebe` | Muhasebe | ❌ | ❌ Görünmüyor | Varsayılan listede YOK |
| `buyer:alici` | Alıcı | ❌ | ❌ Görünmüyor | Varsayılan listede YOK |
| `buyer:proje_yoneticisi` | Proje Yöneticisi | ❌ | ❌ Görünmüyor | Varsayılan listede YOK |

**Varsayılan Liste:** `getCompanyUserRoles` fonksiyonunda, eğer şirket kullanıcılarında rol yoksa kullanılan varsayılan roller:
```javascript
const defaultBuyerRoles = [
  'buyer:satinalma_uzman_yardimcisi',
  'buyer:satinalma_uzmani',
  'buyer:satinalma_yetkilisi',
  'buyer:satinalma_muduru'
];
```

---

### 3️⃣ TEDARİKÇİ (SUPPLIER) ÖZEL ROLLERİ
Bu roller **sadece tedarikçi şirketlerde** görünür ve şirket kullanıcılarının `companyRole` alanından dinamik olarak alınır.

| Rol Kodu | Türkçe Adı | Varsayılan Listede | Mevcut Durum | Not |
|----------|------------|-------------------|--------------|-----|
| `supplier:satici` | Satıcı | ✅ | ❌ Görünmüyor | Varsayılan listede var |
| `supplier:satis_muduru` | Satış Müdürü | ✅ | ❌ Görünmüyor | Varsayılan listede var |
| `supplier:satis_yoneticisi` | Satış Yöneticisi | ✅ | ❌ Görünmüyor | Varsayılan listede var |
| `supplier:pazarlama_muduru` | Pazarlama Müdürü | ✅ | ❌ Görünmüyor | Varsayılan listede var |
| `supplier:satis_personeli` | Satış Personeli | ❌ | ❌ Görünmüyor | Varsayılan listede YOK |
| `supplier:sirket_sahibi` | Şirket Sahibi | ❌ | ❌ Görünmüyor | Varsayılan listede YOK |

**Varsayılan Liste:** `getCompanyUserRoles` fonksiyonunda, eğer şirket kullanıcılarında rol yoksa kullanılan varsayılan roller:
```javascript
const defaultSupplierRoles = [
  'supplier:satici',
  'supplier:satis_muduru',
  'supplier:satis_yoneticisi',
  'supplier:pazarlama_muduru'
];
```

---

## 🔍 MEVCUT SİSTEM MANTIĞI

### `getCompanyUserRoles` Fonksiyonu Nasıl Çalışıyor?

1. **Şirket Durumunu Kontrol Eder:**
   - `companyData.roles` array'inden `buyer` veya `supplier` kontrolü yapar
   - `hasBuyer` ve `hasSupplier` boolean değerlerini belirler

2. **Şirket Kullanıcılarını Alır:**
   - `users` collection'ından `companyId` ile sorgular
   - Her kullanıcının `companyRole` veya `requestedCompanyRole` alanını kontrol eder

3. **Rolleri Toplar:**
   - Eğer kullanıcının `companyRole` alanı `buyer:` ile başlıyorsa → `buyerRolesSet`'e ekler
   - Eğer kullanıcının `companyRole` alanı `supplier:` ile başlıyorsa → `supplierRolesSet`'e ekler

4. **Varsayılan Rolleri Kullanır:**
   - Eğer `buyerRolesSet` boşsa ve `hasBuyer === true` ise → varsayılan buyer rolleri ekler
   - Eğer `supplierRolesSet` boşsa ve `hasSupplier === true` ise → varsayılan supplier rolleri ekler

### `addApprovalLimitRow` Fonksiyonu Nasıl Çalışıyor?

1. **Sabit Yönetim Rollerini Ekler:**
   - İşveren, YKB Başkanı, YKB Üyesi, CEO, GM, GM Yardımcısı

2. **Dinamik Rolleri Ekler:**
   - `getCompanyUserRoles(companyId)` çağrılır
   - Eğer `hasBuyer === true` → buyer rolleri eklenir
   - Eğer `hasSupplier === true` VE `hasBuyer === true` → supplier rolleri de eklenir
   - Eğer `hasSupplier === true` VE `hasBuyer === false` → sadece supplier rolleri eklenir

---

## ❌ SORUN ANALİZİ

### Problem 1: Varsayılan Roller Eksik
**Mevcut Varsayılan Buyer Rolleri:**
- ✅ `buyer:satinalma_uzman_yardimcisi`
- ✅ `buyer:satinalma_uzmani`
- ✅ `buyer:satinalma_yetkilisi`
- ✅ `buyer:satinalma_muduru`
- ❌ `buyer:santiye_yetkilisi` (EKSİK)
- ❌ `buyer:stok_depo` (EKSİK)
- ❌ `buyer:muhasebe` (EKSİK)
- ❌ `buyer:alici` (EKSİK)
- ❌ `buyer:proje_yoneticisi` (EKSİK)

**Mevcut Varsayılan Supplier Rolleri:**
- ✅ `supplier:satici`
- ✅ `supplier:satis_muduru`
- ✅ `supplier:satis_yoneticisi`
- ✅ `supplier:pazarlama_muduru`
- ❌ `supplier:satis_personeli` (EKSİK)
- ❌ `supplier:sirket_sahibi` (EKSİK)

### Problem 2: Kullanıcı Rolleri Firestore'dan Alınamıyor
- `getCompanyUserRoles` fonksiyonu sadece `companyRole` alanından rolleri alıyor
- Eğer kullanıcıların `companyRole` alanı boş veya eksikse, varsayılan rollere düşüyor
- Ancak varsayılan roller de eksik olduğu için, sadece sabit yönetim rolleri görünüyor

### Problem 3: `getRoleLabel` Fonksiyonu Eksik Rolleri İçermiyor
- `getRoleLabel` fonksiyonunda eksik roller için label tanımı yok
- Bu yüzden eksik roller görünse bile doğru Türkçe adlarıyla görünmüyor

---

## ✅ ÇÖZÜM ÖNERİLERİ

### 1. Varsayılan Rolleri Genişlet
`getCompanyUserRoles` fonksiyonundaki varsayılan rolleri tüm sistemde tanımlı rolleri içerecek şekilde güncelle.

### 2. `getRoleLabel` Fonksiyonunu Genişlet
Eksik roller için Türkçe label'lar ekle.

### 3. Kullanıcı Rollerini Daha İyi Topla
- `companyRole` alanına ek olarak `requestedCompanyRole` ve diğer rol alanlarını da kontrol et
- Şirket belgesindeki `buyerRoles` ve `supplierRoles` array'lerini de kontrol et

---

## 📊 ÖZET TABLO

| Kategori | Toplam Rol | Varsayılan Listede | Görünmesi Gereken | Şu An Görünen |
|----------|------------|-------------------|-------------------|---------------|
| **Sabit Yönetim Rolleri** | 6 | ✅ | ✅ | ✅ |
| **Alıcı Özel Rolleri** | 9 | 4 | ✅ | ❌ |
| **Tedarikçi Özel Rolleri** | 6 | 4 | ✅ | ❌ |
| **TOPLAM** | **21** | **14** | **21** | **6** |

---

## 🔧 DÜZELTME GEREKLİ ALANLAR

1. ✅ `getCompanyUserRoles` - Varsayılan rolleri genişlet
2. ✅ `getRoleLabel` - Eksik roller için label ekle
3. ✅ `addApprovalLimitRow` - Dinamik rol ekleme mantığını kontrol et
4. ✅ Şirket kullanıcılarının `companyRole` alanlarını kontrol et

---

**Hazırlanma Tarihi:** 2025-01-XX  
**Hazırlayan:** Cursor AI Assistant  
**Kullanıcı:** teklifbulalici@gmail.com  
**Şirket:** Hem Alıcı hem Tedarikçi

