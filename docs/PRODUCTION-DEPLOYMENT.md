# Production Deployment Guide
## Tax Offices Index Optimization & Migration

**Teklifbul Rule v1.0** - Production deployment rehberi

---

## 🚀 Production Çalıştırma Sırası

### 1) Index Deploy (Zaten yaptıysanız atlayın)

```bash
firebase deploy --only firestore:indexes
```

**Kabul Kriteri:**
- Exit code 0
- "Deployed" mesajı görünmeli
- Log: `logs/deploy-indexes-YYYYMMDD-HHMMSS.log`

---

### 2) Kimlik Ayarlama (Tek yöntem seçin)

#### Yöntem A: Environment Variable (Önerilen - Production)

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/secure/path/serviceAccountKey.json"
```

#### Yöntem B: Flag ile (Alternatif)

```bash
# Flag ile direkt belirt
tsx scripts/migrate-tax-offices-add-lower-fields.ts \
  --credentials=/secure/path/key.json \
  --batch=1000
```

**Güvenlik Notları:**
- ✅ Service account key dosyası `.gitignore`'da olmalı
- ✅ Path masking aktif (loglarda tam path gösterilmez)
- ✅ Production'da environment variable tercih edilir

---

### 3) Dry-Run (Son Bir Prova)

```bash
# Environment variable ile
tsx scripts/migrate-tax-offices-add-lower-fields.ts --dry-run

# veya flag ile
tsx scripts/migrate-tax-offices-add-lower-fields.ts \
  --credentials=/secure/path/key.json \
  --dry-run
```

**Beklenen Çıktı:**
- `[DRY-RUN] X (yazilmadi)` mesajları
- `expectedWrites` sayısı
- Exit code 0
- **Yazma yapılmamalı** (sadece sayım)

---

### 4) Migration (Akşam Saatleri Önerilir)

```bash
# Environment variable ile
tsx scripts/migrate-tax-offices-add-lower-fields.ts --batch=1000

# veya flag ile
tsx scripts/migrate-tax-offices-add-lower-fields.ts \
  --credentials=/secure/path/key.json \
  --batch=1000
```

**Beklenen Çıktı:**
- `[MIG] X/Y (%Z)` formatında ilerleme
- `Progress` logları (processed, total, percentage)
- `Batch islendi` mesajları
- Exit code 0
- Log: `logs/migration-tax-offices-YYYYMMDD-HHMMSS.log`

**Quota Sorunlarında:**
- Batch size'ı düşürün: `--batch=500`
- Exponential backoff otomatik devreye girer
- Retry mekanizması aktif (max 5 deneme)

---

### 5) Smoke Test

```bash
tsx scripts/smoke-tax-offices.ts
```

**Beklenen Çıktı:**
- Case-insensitive sorgular çalışıyor
- `✅ Index'li sorgu kullanıldı` mesajı
- `⚠️ Index bulunamadı, fallback kullanılıyor` mesajı **GÖRÜNMEMELİ**
- Exit code 0
- Log: `logs/smoke-tax-offices-YYYYMMDD-HHMMSS.log`

---

## ✅ Kabul Kriterleri

### Migration
- ✅ Exit code 0
- ✅ `[MIG] X/Y (%Z)` formatında ilerleme görüldü
- ✅ Loglar `logs/` altında oluşturuldu
- ✅ Toplam süre, yazılan/güncellenen kayıt sayıları loglandı

### Smoke Test
- ✅ Case-insensitive sorgular çalışıyor
- ✅ Index'li yol kullanılıyor (fallback=false)
- ✅ Türkçe karakter normalizasyonu çalışıyor
- ✅ Exit code 0

---

## 🔄 Otomasyon (Opsiyonel)

Tüm adımları tek komutla çalıştırmak için:

```powershell
# Windows
.\scripts\deploy-and-migrate.ps1 -SkipPR

# PR'ları da açmak için
.\scripts\deploy-and-migrate.ps1
```

**Not:** Otomasyon script'i `serviceAccountKey.json` dosyasını bekler. Production'da environment variable kullanıyorsanız, script'i güncelleyin veya manuel adımları takip edin.

---

## 🛡️ Güvenlik Kontrol Listesi

- [ ] Service account key dosyası `.gitignore`'da
- [ ] Production'da environment variable kullanılıyor
- [ ] Path masking aktif (loglarda tam path yok)
- [ ] Log dosyaları güvenli yerde saklanıyor
- [ ] Service account key'ler repo'ya commit edilmedi

---

## 📊 Monitoring

### Log Dosyaları

Tüm loglar `logs/` klasöründe timestamp ile saklanır:

- `deploy-indexes-YYYYMMDD-HHMMSS.log` - Index deploy çıktısı
- `migration-tax-offices-YYYYMMDD-HHMMSS.log` - Migration çıktısı
- `smoke-tax-offices-YYYYMMDD-HHMMSS.log` - Smoke test çıktısı

### Önemli Metrikler

Migration loglarında şunları kontrol edin:
- `processed`: İşlenen toplam kayıt sayısı
- `updated`: Güncellenen kayıt sayısı
- `skipped`: Atlanan kayıt sayısı (zaten güncel)
- `duration`: Toplam süre (ms)
- Retry sayıları (quota sorunlarında)

---

## 🔙 Geri Dönüş Planı

### Sorun Durumunda

1. **Index sorunu:**
   - Fallback sorgu otomatik devreye girer
   - `getTaxOffices` fonksiyonu client-side filtering yapar
   - Performans düşer ama sistem çalışır

2. **Migration sorunu:**
   - Migration idempotent (tekrar çalıştırılabilir)
   - Sadece eksik/hatalı kayıtlar güncellenir
   - Quota sorununda batch size düşürülür

3. **Quota sorunu:**
   - Exponential backoff + retry otomatik devrede
   - Batch size manuel düşürülebilir (`--batch=500`)
   - Akşam saatlerinde tekrar deneyin

---

## 📝 Notlar

- **Trafik:** Migration'ı trafiğin az olduğu saatlerde çalıştırın (akşam önerilir)
- **Batch Size:** Varsayılan 1000, quota sorunlarında 500'e düşürün
- **Dry-Run:** Her zaman önce dry-run yapın
- **Backup:** Kritik veriler için backup alın (Firestore export)

---

**Son Güncelleme:** 2025-01-20  
**Güncelleyen:** Auto (Cursor AI)

