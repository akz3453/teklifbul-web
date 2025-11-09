# 🗄️ PostgreSQL ve Redis Kurulum Kılavuzu

## Test Sonuçları

**Mevcut Durum:**
- ❌ PostgreSQL: Bağlantı yok (ECONNREFUSED)
- ❌ Redis: Bağlantı yok (ECONNREFUSED)

---

## 📦 Hızlı Kurulum

### Seçenek 1: Docker (Önerilen - En Kolay)

#### PostgreSQL
```powershell
docker run -d --name postgres-teklifbul `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=teklifbul `
  -p 5432:5432 `
  postgres:15-alpine
```

#### Redis
```powershell
docker run -d --name redis-teklifbul `
  -p 6379:6379 `
  redis:7-alpine
```

**Kontrol:**
```powershell
docker logs postgres-teklifbul
docker logs redis-teklifbul
```

---

### Seçenek 2: WSL (Ubuntu) ile

```powershell
# WSL kurulumu (ilk kezse)
wsl --install -d Ubuntu

# WSL içinde:
sudo apt update
sudo apt install -y postgresql postgresql-contrib redis-server

# PostgreSQL başlat
sudo service postgresql start
sudo -u postgres psql -c "CREATE DATABASE teklifbul;"

# Redis başlat
sudo service redis-server start
redis-cli ping  # PONG dönmeli
```

---

### Seçenek 3: Windows Native

#### PostgreSQL
1. İndir: https://www.postgresql.org/download/windows/
2. Kurulum sırasında şifre belirle
3. Veritabanı oluştur:
   ```sql
   CREATE DATABASE teklifbul;
   ```

#### Redis (Memurai - Redis Uyumlu)
1. İndir: https://www.memurai.com/
2. Kur ve başlat
3. Port 6379'da dinlemeye başlar

---

## ⚙️ Environment Variables (.env)

Proje kök dizininde `.env` dosyası oluşturun:

```env
# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=teklifbul
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres  # Docker için 'postgres', kendi kurulumunuz için kendi şifreniz

# Redis
REDIS_URL=redis://127.0.0.1:6379

# Cache Control (geliştirme için)
CACHE_DISABLED=0  # 1 yaparak cache'i kapatabilirsiniz

# API
API_PORT=5174
NODE_ENV=development
```

**Not:** `.env` dosyasını `.gitignore`'a ekleyin!

---

## 🧪 Test

### 1. Bağlantı Testi
```powershell
npm run test:connections
```

### 2. Migration Çalıştırma
```powershell
# Kategori tabloları
npm run migrate:categories

# Vergi daireleri tabloları
npm run migrate:tax-offices
```

### 3. Seed Data
```powershell
npm run seed:categories
```

### 4. API Testi
```powershell
# Server'ı başlat (başka terminal)
npm run dev:api

# API testi (başka terminal)
npm run test:categories-api
```

---

## 🔧 Geliştirme Modu (Cache Olmadan)

Eğer Redis kurmak istemiyorsanız, geçici olarak cache'i devre dışı bırakabilirsiniz:

`.env` dosyasına:
```env
CACHE_DISABLED=1
```

Bu durumda:
- ✅ API'ler çalışır
- ✅ Database işlemleri normal
- ❌ Cache kullanılmaz (performans biraz düşebilir)

---

## 📝 Sonraki Adımlar

1. ✅ PostgreSQL ve Redis kurulumu
2. ✅ `.env` dosyası oluşturma
3. ✅ `npm run test:connections` ile test
4. ✅ `npm run migrate:categories` ile tabloları oluştur
5. ✅ `npm run seed:categories` ile veri yükle
6. ✅ `npm run dev:api` ile server'ı başlat
7. ✅ API endpoint'lerini test et

---

## 🆘 Sorun Giderme

### PostgreSQL bağlantı hatası
- PostgreSQL servisi çalışıyor mu? (`docker ps` veya Windows Services)
- Port 5432 açık mı? (`netstat -an | findstr 5432`)
- Şifre doğru mu? (`.env` dosyasındaki `POSTGRES_PASSWORD`)

### Redis bağlantı hatası
- Redis servisi çalışıyor mu? (`docker ps` veya `redis-cli ping`)
- Port 6379 açık mı? (`netstat -an | findstr 6379`)
- `CACHE_DISABLED=1` ile geçici olarak devre dışı bırakabilirsiniz

---

**Teklifbul Rule v1.0** - Tüm bağlantılar opsiyonel, uygulama cache olmadan da çalışır.

