# 🚀 Docker Desktop Kurulduktan Sonra Yapılacaklar

## ⚡ Otomatik Kurulum (ÖNERİLEN)

Docker Desktop kurulduktan ve **bilgisayar yeniden başlatıldıktan** sonra:

```powershell
cd C:\Users\faruk\OneDrive\Desktop\teklifbul-web
npm run setup:docker
```

Bu script otomatik olarak:
1. ✅ Docker kontrolü yapar
2. ✅ Container'ları başlatır
3. ✅ Migration'ları çalıştırır
4. ✅ Seed data'yı yükler
5. ✅ Test eder

## 📋 Manuel Kurulum (Alternatif)

Eğer otomatik script çalışmazsa:

```powershell
# 1. Container'ları başlat
docker compose up -d

# 2. Bekle (15 saniye)
Start-Sleep -Seconds 15

# 3. Migration'lar
npm run migrate:categories
npm run migrate:tax-offices

# 4. Seed
npm run seed:categories

# 5. Test
npm run test:connections
```

## ✅ Kontrol

```powershell
# Bağlantıları test et
npm run test:connections

# Kategori sistemini test et
npm run test:category-system

# Vergi daireleri API'sini test et
npm run test:tax-offices-api
```

## 🎯 Beklenen Sonuç

Tüm testler **✅** olduğunda sistem hazır!

```
✅ PostgreSQL: Connected
✅ Redis: Connected (veya opsiyonel)
✅ Categories API: Working
✅ Tax Offices API: Working
```

---

**💡 İpucu:** Docker Desktop'ı başlattıktan sonra sistem tepsinde Docker ikonunun yeşil olmasını bekleyin!

