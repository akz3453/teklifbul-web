# ⚡ Hızlı Kurulum

## 🐳 Docker ile (1 Dakika)

```powershell
# 1. Docker Desktop'ı indirin ve kurun (ilk kez)
# https://www.docker.com/products/docker-desktop

# 2. Docker Desktop'ı başlatın

# 3. Bu komutları çalıştırın:
cd C:\Users\faruk\OneDrive\Desktop\teklifbul-web
docker compose up -d
Start-Sleep -Seconds 10
npm run migrate:categories
npm run migrate:tax-offices
npm run seed:categories
npm run test:connections
```

## 📦 Manuel Kurulum (Docker Yoksa)

### 1. PostgreSQL Kur
1. İndir: https://www.postgresql.org/download/windows/
2. Kur (şifre: `postgres123`)
3. Veritabanı oluştur: `CREATE DATABASE teklifbul;`

### 2. .env Dosyası
`.env` dosyası zaten oluşturuldu. Şifreniz farklıysa güncelleyin.

### 3. Migration & Seed
```powershell
npm run migrate:categories
npm run migrate:tax-offices
npm run seed:categories
npm run test:connections
```

## ✅ Kontrol
```powershell
npm run test:connections
npm run test:category-system
```

**Tüm testler ✅ ise kurulum başarılı!**
