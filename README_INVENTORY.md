# 📦 Teklifbul Stok Takip ve ŞMTF Sistemi

## 🎉 Proje Tamamlandı!

Kapsamlı bir stok takip ve şantiye malzeme talep yönetim sistemi başarıyla oluşturuldu.

---

## 📋 İçindekiler

1. [Hızlı Başlangıç](#hızlı-başlangıç)
2. [Modüller](#modüller)
3. [Özellikler](#özellikler)
4. [Kurulum](#kurulum)
5. [Kullanım](#kullanım)
6. [Dokümantasyon](#dokümantasyon)
7. [Test](#test)
8. [Destek](#destek)

---

## 🚀 Hızlı Başlangıç

### 3 Adımda Başlayın

1. **Firestore Rules Deploy**
   ```bash
   firebase login
   firebase deploy --only firestore:rules
   ```

2. **Sample Data Yükle**
   ```
   Tarayıcıda: test-init-stock.html
   ```

3. **Test Et**
   ```
   Tarayıcıda: test-inventory-system.html
   ```

**Detaylı rehber:** [`START_HERE.md`](./START_HERE.md)

---

## 📦 Modüller

### Stok Yönetimi
- **Stok İçe Aktar** - Excel bulk import
- **Toplu Fiyat Güncelleme** - Batch price updates

### Stok Hareketleri
- **Hareket Yönetimi** - IN/OUT/TRANSFER/ADJUST
- **Ortalama Maliyet** - Auto calculation

### Talep Yönetimi (ŞMTF/IMTF/DMTF)
- **Talep Oluştur** - Wildcard search ile
- **Talep Detayı** - Onay/Red işlemleri

### Fatura Karşılaştırma
- **Fatura Import** - Excel'den yükleme
- **Karşılaştırma** - Quote ile fark tespiti

### Raporlar
- Min stok altı ürünler
- Ortalama maliyet altında satışlar
- Lokasyon bazlı stok
- Gerçek maliyet raporları

---

## ✨ Özellikler

### 🔍 Yıldızlı Arama
```
Pattern: *ÇİM*32*KG*
Sonuç: ÇIMENTO 32 KG
```

### 🗂️ Otomatik Indexleme
- name_norm
- search_keywords
- Turkish normalization

### 💰 Ortalama Maliyet
- Weighted average
- Extra cost allocation
- Auto-update on IN

### 📑 Excel Entegrasyonu
- Import/Export
- Auto column mapping
- Validation

### 🇹🇷 Türkçe Desteği
- Full normalization
- Diacritic handling
- Case-insensitive

---

## 🛠️ Kurulum

### Gereksinimler
- Firebase project
- Firebase CLI
- Modern browser

### Adımlar

1. **Clone** repository
2. **Firebase login**
3. **Deploy** rules
4. **Init** data
5. **Test** et

Detaylar: [`DEPLOY_INVENTORY_NOW.md`](./DEPLOY_INVENTORY_NOW.md)

---

## 📖 Kullanım

### Stok İçe Aktar
```
1. pages/stock-import.html
2. Excel yükle
3. Validasyonu kontrol et
4. İçe aktar
```

### Yıldızlı Arama
```
1. pages/request-site.html
2. + Satır Ekle
3. *ÇİM*32*KG* ara
4. Bulunanı seç
```

### Stok Hareketi
```
1. pages/stock-movements.html
2. 📥 Giriş tab'ı
3. Ürün seç
4. Miktar ve maliyet gir
5. Kaydet
```

Detaylı kullanım: [`INVENTORY_SYSTEM_README.md`](./INVENTORY_SYSTEM_README.md)

---

## 📚 Dokümantasyon

### Kullanıcı Rehberleri
- [`START_HERE.md`](./START_HERE.md) - Başlangıç rehberi
- [`INVENTORY_SYSTEM_README.md`](./INVENTORY_SYSTEM_README.md) - Sistem kullanım kılavuzu
- [`DEPLOY_INVENTORY_NOW.md`](./DEPLOY_INVENTORY_NOW.md) - Deployment adımları

### Teknik Dokümantasyon
- [`INVENTORY_IMPLEMENTATION_SUMMARY.md`](./INVENTORY_IMPLEMENTATION_SUMMARY.md) - Implementasyon detayları
- [`PROJECT_COMPLETE_SUMMARY.md`](./PROJECT_COMPLETE_SUMMARY.md) - Proje özeti
- [`DEPLOYMENT_CHECKLIST.md`](./DEPLOYMENT_CHECKLIST.md) - Deployment checklist

---

## 🧪 Test

### Test Sayfası
```
URL: test-inventory-system.html
Tüm özellikleri otomatik test eder
```

### Test Senaryoları
1. ✅ Stok import validation
2. ✅ Wildcard search matching
3. ✅ Cost calculation
4. ✅ Request creation
5. ✅ Invoice comparison
6. ✅ Reports data access

---

## 🗄️ Firestore Koleksiyonları

```
stocks                          // Ürün kartları
stock_locations                 // Depo/şantiyeler
stock_movements                 // Hareketler
internal_requests               // Talepler
internal_requests/{id}/material_lines  // Talep satırları
price_updates                   // Fiyat logları
invoices                        // Fatura kayıtları
```

---

## 🔐 Güvenlik

### Firestore Rules
- ✅ Read: Authenticated
- ✅ Write: Role-based
- ✅ Owner validation

### Roller
- `admin` - Full access
- `purchasing` - Prices, requests
- `warehouse` - Movements, locations
- `site` - Create requests

---

## 📊 Mimari

- **Frontend**: Vanilla JavaScript
- **Backend**: Firebase Firestore
- **Auth**: Firebase Authentication
- **Excel**: XLSX CDN
- **UI**: Tab-based, responsive

---

## 🎯 Durum

| Bileşen | Durum |
|---------|-------|
| Kod | ✅ Tamamlandı |
| Dokümantasyon | ✅ Tamamlandı |
| Firestore Rules | ✅ Eklendi |
| Test Sayfası | ✅ Oluşturuldu |
| Init Script | ✅ Hazır |
| Deployment | ⏳ Beklemede |

---

## 🐛 Sorun Giderme

### Permission denied
**Çözüm:** Firestore rules deploy

### No data found
**Çözüm:** Init script çalıştır

### Wildcard not working
**Çözüm:** Check name_norm, search_keywords

### avgCost wrong
**Çözüm:** Verify stock_balances

Detaylar: [`DEPLOYMENT_CHECKLIST.md`](./DEPLOYMENT_CHECKLIST.md)

---

## 📞 Destek

### Yardım
1. README dosyalarını okuyun
2. Test sayfasını çalıştırın
3. Console hatalarını kontrol edin

### İletişim
- Sorular: README dosyaları
- Hatalar: Browser console
- Logs: Firestore console

---

## 🎉 Sonuç

**Sistem Hazır!** ✅

- 10 Modül
- 7 Firestore Collection
- 6 Dokümantasyon
- 1 Test Sayfası
- 0 Breaking Change

**Deployment:** ~30 dakika  
**Versiyon:** 1.0  
**Lisans:** Teklifbul Internal

---

## 📌 Sonraki Adımlar

1. [ ] Firestore rules deploy
2. [ ] Sample data init
3. [ ] Manual test
4. [ ] Production kullanımı

---

**Teklifbul Stok Takip Sistemi v1.0**  
*Full-Featured Inventory Management*

© 2025 Teklifbul - All Rights Reserved

