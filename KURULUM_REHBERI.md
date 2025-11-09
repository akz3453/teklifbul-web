# 📦 Teklifbul Kurulum Rehberi

**Windows için PostgreSQL ve Redis Kurulumu**

## 🚀 Yöntem 1: Docker ile (ÖNERİLEN - En Kolay)

### Adım 1: Docker Desktop Kurulumu

1. **Docker Desktop İndir:**
   - https://www.docker.com/products/docker-desktop
   - Windows için installer'ı indirin

2. **Kurulum:**
   - İndirilen `.exe` dosyasını çalıştırın
   - Kurulum sihirbazını takip edin
   - Bilgisayarı yeniden başlatın (gerekirse)

3. **Docker Desktop'ı Başlat:**
   - Başlat menüsünden "Docker Desktop"ı açın
   - Sistem tepsinde Docker ikonunun yeşil olmasını bekleyin

### Adım 2: Container'ları Başlat

Proje klasöründe PowerShell'de:

```powershell
# Docker Compose ile container'ları başlat
docker compose up -d

# veya (eski Docker sürümleri için)
docker-compose up -d
```

### Adım 3: Bağlantı Kontrolü

```powershell
# Container'ları kontrol et
docker ps

# PostgreSQL hazır mı?
docker exec teklifbul-postgres pg_isready -U postgres

# Redis hazır mı?
docker exec teklifbul-redis redis-cli ping
```

### Adım 4: Migration ve Seed

```powershell
# Migration'ları çalıştır
npm run migrate:categories
npm run migrate:tax-offices

# Seed data yükle
npm run seed:categories

# Test et
npm run test:connections
npm run test:category-system
```

---

## 🛠️ Yöntem 2: Native Windows Kurulumu (Docker Olmadan)

### PostgreSQL Kurulumu

1. **İndir:**
   - https://www.postgresql.org/download/windows/
   - "Download the installer" butonuna tıklayın

2. **Kurulum:**
   - İndirilen `.exe` dosyasını çalıştırın
   - Kurulum sırasında:
     - **Port:** 5432 (varsayılan)
     - **Şifre belirleyin:** (örnek: `postgres123`)
     - **Locale:** Türkçe (opsiyonel)

3. **Veritabanı Oluştur:**
   - PostgreSQL'in yüklediği "SQL Shell (psql)" veya "pgAdmin"i açın
   - Aşağıdaki komutu çalıştırın:
   ```sql
   CREATE DATABASE teklifbul;
   ```

### Redis Kurulumu (Opsiyonel)

**Seçenek 1: Memurai (Windows için Redis)**
- https://www.memurai.com/get-memurai
- Ücretsiz Windows versiyonunu indirin ve kurun

**Seçenek 2: WSL ile Redis**
- WSL (Windows Subsystem for Linux) kurun
- WSL içinde: `sudo apt-get install redis-server`
- `redis-server` komutu ile başlatın

**Seçenek 3: Cache'i Devre Dışı Bırak**
- `.env` dosyasına ekleyin: `CACHE_DISABLED=1`
- Redis olmadan da sistem çalışır

### .env Dosyası Ayarları

Proje klasöründe `.env` dosyası oluşturun veya güncelleyin:

```env
# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=teklifbul
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres123

# Redis (Opsiyonel)
REDIS_HOST=localhost
REDIS_PORT=6379
# CACHE_DISABLED=1  # Redis kullanmayacaksanız bu satırı açın

# API
API_PORT=5174
```

### Migration ve Seed

```powershell
npm run migrate:categories
npm run migrate:tax-offices
npm run seed:categories
npm run test:connections
```

---

## ✅ Kurulum Kontrolü

### Bağlantı Testi

```powershell
npm run test:connections
```

**Beklenen çıktı:**
```
✅ PostgreSQL: Connected
✅ Redis: Connected
```

### API Testleri

```powershell
# Kategori sistemi
npm run test:category-system

# Vergi daireleri
npm run test:tax-offices-api
```

---

## 🔧 Sorun Giderme

### PostgreSQL bağlantı hatası

1. PostgreSQL servisinin çalıştığını kontrol edin:
   ```powershell
   Get-Service postgresql*
   ```
   
2. Servis durmuşsa başlatın:
   ```powershell
   Start-Service postgresql-x64-15  # Versiyon numaranız farklı olabilir
   ```

3. `.env` dosyasındaki bilgileri kontrol edin

4. Port 5432'nin başka bir uygulama tarafından kullanılmadığından emin olun

### Redis bağlantı hatası

1. Redis servisinin çalıştığını kontrol edin
2. Cache'i devre dışı bırakmak için `.env`'e `CACHE_DISABLED=1` ekleyin
3. Redis opsiyonel, sistem cache olmadan da çalışır

### Docker hatası

1. Docker Desktop'ın çalıştığından emin olun
2. WSL 2 backend kullanıyorsanız WSL 2'nin kurulu olduğundan emin olun
3. Bilgisayarı yeniden başlatmayı deneyin

---

## 📝 Özet

**Docker ile (Önerilen):**
1. Docker Desktop kur
2. `docker compose up -d`
3. Migration ve seed çalıştır

**Native ile:**
1. PostgreSQL kur
2. Veritabanı oluştur
3. `.env` dosyasını ayarla
4. Migration ve seed çalıştır

Her iki yöntemde de son adım:
```powershell
npm run migrate:categories
npm run migrate:tax-offices
npm run seed:categories
npm run test:connections
```

---

## 🎯 Sonraki Adımlar

Kurulum tamamlandıktan sonra:

1. ✅ Migration'lar çalıştırıldı
2. ✅ Seed data yüklendi
3. ✅ Testler başarılı

**Sistem hazır!** 🚀

API server'ı başlatmak için:
```powershell
npm run dev:api
```

Frontend'i başlatmak için:
```powershell
npm run dev
```

