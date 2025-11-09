# 🌐 Site Başlatma Rehberi

## 🚀 Hızlı Başlatma

### Yöntem 1: npm run dev (Önerilen)

Terminal'de şu komutu çalıştırın:
```bash
cd C:\Users\faruk\OneDrive\Desktop\teklifbul-web
npm run dev
```

Vite server otomatik olarak tarayıcıda açılacak.

### Yöntem 2: Manuel Başlatma

1. Terminal açın
2. Şu komutları çalıştırın:
   ```bash
   cd C:\Users\faruk\OneDrive\Desktop\teklifbul-web
   npx vite
   ```

---

## 📍 Site Adresleri

Server başladıktan sonra tarayıcıda şu adresleri kullanabilirsiniz:

### Ana Sayfa
```
http://localhost:5173
```

### Test Sayfaları
```
http://localhost:5173/role-select.html
http://localhost:5173/demand-new.html
```

### API Endpoints (Ayrı server)
```
http://localhost:5174/api/categories
http://localhost:5174/api/tax-offices
```

---

## ✅ Sistem Kontrolü

### 1. Vite Server (Port 5173)
```bash
# Kontrol et
curl http://localhost:5173
```

### 2. API Server (Port 5174)
```bash
# Kontrol et
curl http://localhost:5174/api/categories
```

### 3. Docker Containers
```bash
docker ps
```

---

## 🔧 Sorun Giderme

### Vite Server Başlamıyor
1. Port 5173 kullanımda mı kontrol edin:
   ```bash
   netstat -ano | findstr :5173
   ```
2. Eğer kullanımda ise, `vite.config.ts` içinde port'u değiştirin

### API Server Çalışmıyor
Yeni bir terminal açıp:
```bash
cd C:\Users\faruk\OneDrive\Desktop\teklifbul-web
npm run dev:api
```

### Docker Containers Çalışmıyor
```bash
docker-compose up -d
```

---

## 📝 Notlar

- Vite server: Port 5173 (frontend)
- API server: Port 5174 (backend)
- PostgreSQL: Port 5433
- Redis: Port 6379

---

**Son Güncelleme:** 2025-11-03

