# 🏛️ Vergi Daireleri ETL Rehberi

## 📋 Durum

- ✅ **Tablo hazır:** `tax_offices` tablosu migration ile oluşturuldu
- ✅ **ETL script hazır:** `src/modules/taxOffices/etl-tax-offices.ts`
- ❌ **PDF dosyası yok:** GİB PDF'i indirilmemiş
- ❌ **Veri yok:** Tablo boş (0 kayıt)

---

## 🎯 Ne Bekleniyor?

ETL script'i çalıştırmak için **GİB (Gelir İdaresi Başkanlığı) vergi daireleri listesi PDF dosyası** gerekiyor.

### GİB PDF'i Nasıl Bulunur?

1. **GİB Resmi Sitesi:** https://www.gib.gov.tr
2. **Arama:** "Vergi Daireleri Listesi" veya "Muhasebe Birim Kodu"
3. **İndir:** En güncel PDF dosyasını indirin

**Alternatif:** GİB API'si varsa kullanılabilir (PDF parse yerine direkt API)

---

## 🚀 ETL Script Nasıl Çalışır?

### 1. PDF Dosyasını Hazırlayın

```bash
# data/ klasörüne PDF'i koyun
mkdir -p data
# GİB PDF'ini data/gib_tax_offices.pdf olarak kaydedin
```

### 2. ETL Script'i Çalıştırın

```bash
npm run etl:tax-offices --input=./data/gib_tax_offices.pdf
```

### 3. Sonuç Kontrolü

```bash
# Veritabanında kayıt sayısını kontrol edin
docker exec teklifbul-postgres psql -U postgres -d teklifbul -c "SELECT COUNT(*) FROM tax_offices;"
```

---

## 📝 Beklenen PDF Formatı

ETL script şu formatları destekler:

### Format 1: Pipe-separated (|)
```
ANKARA|Polatlı|Polatlı Vergi Dairesi|12345|VD
ANKARA|Ayaş|Ayaş Vergi Dairesi|12346|VD
```

### Format 2: Tab-separated
```
ANKARA    Polatlı    Polatlı Vergi Dairesi    12345    VD
```

### Format 3: İl başlığı + İlçe listesi
```
ANKARA
Polatlı|Polatlı Vergi Dairesi|12345|VD
Ayaş|Ayaş Vergi Dairesi|12346|VD
```

**Önemli:** Her satırda 5 haneli `office_code` olmalı (örn: `12345`)

---

## ⚠️ Eğer PDF Formatı Farklıysa

ETL script'i PDF formatınıza göre özelleştirmeniz gerekebilir:

```typescript
// src/modules/taxOffices/etl-tax-offices.ts
// parsePdfToOffices fonksiyonunu PDF formatınıza göre düzenleyin
```

---

## 🔄 Alternatif: Test Verisi ile Deneme

Eğer gerçek GİB PDF'i yoksa, test verisi oluşturabiliriz:

```bash
# Test verisi oluştur (örnek)
echo "ANKARA|Polatlı|Polatlı Vergi Dairesi|12345|VD" > data/test_tax_offices.txt
# ETL script'i txt formatı için güncellemek gerekir
```

---

## ✅ ETL Tamamlandıktan Sonra

1. **API Test:**
   ```bash
   npm run test:tax-offices-api
   ```

2. **Frontend Test:**
   - `role-select.html` açın
   - İl seçin → Vergi dairesi listesi dolsun

3. **Cron Job Kurulumu:**
   - Haftalık otomatik güncelleme için cron job ekleyin

---

## 📌 Notlar

- **Güncellik:** GİB PDF'i düzenli güncellenir, haftalık cron job önerilir
- **Format Değişikliği:** GİB format değiştirirse ETL script güncellenmeli
- **Performans:** 1000+ vergi dairesi için parse süresi ~30 saniye olabilir

---

**Son Güncelleme:** 2025-11-03

