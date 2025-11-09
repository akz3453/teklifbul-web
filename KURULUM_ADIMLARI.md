# 📋 Kurulum Adımları - ÖZET

## ✅ Hazır Olanlar

1. ✅ `.env` dosyası oluşturuldu
2. ✅ `docker-compose.yml` hazır
3. ✅ Kurulum scriptleri hazır
4. ✅ Dokümantasyon hazır

## 🔧 YAPILACAK: PostgreSQL Kurulumu

### Yöntem A: Docker (Önerilen)

```powershell
# 1. Docker Desktop kur (ilk kez):
#    https://www.docker.com/products/docker-desktop

# 2. Docker Desktop'ı başlat

# 3. Container'ları başlat:
docker compose up -d

# 4. Bekle (10 saniye)
Start-Sleep -Seconds 10

# 5. Migration ve seed:
npm run migrate:categories
npm run migrate:tax-offices
npm run seed:categories

# 6. Test:
npm run test:connections
```

### Yöntem B: Native PostgreSQL

```powershell
# 1. PostgreSQL indir ve kur:
#    https://www.postgresql.org/download/windows/
#    Şifre: postgres123

# 2. Veritabanı oluştur (pgAdmin veya psql):
#    CREATE DATABASE teklifbul;

# 3. .env dosyasındaki şifreyi güncelle (eğer farklıysa)

# 4. Migration ve seed:
npm run migrate:categories
npm run migrate:tax-offices
npm run seed:categories

# 5. Test:
npm run test:connections
```

## 🎯 Sonuç

Tüm testler ✅ olduğunda sistem hazır!

```powershell
npm run test:connections
npm run test:category-system
```

