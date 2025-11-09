# 🌐 Sistem Ağ Trafiğine Açma Rehberi

**Tarih:** 2025-01-21  
**Durum:** Sunucu olmadan sistemi ağ trafiğine açma

---

## 📋 GEREKLİ BİLEŞENLER

### 1. 🖥️ Sunucu/VPS (Zorunlu)

**Seçenekler:**

#### A) VPS (Virtual Private Server) - Önerilen
- **DigitalOcean**: $6-12/ay (1GB RAM, 1 CPU)
- **Linode**: $5-10/ay
- **Vultr**: $6-12/ay
- **Hetzner**: €4-8/ay (en uygun)
- **AWS EC2**: $10-20/ay (t2.micro free tier var ama sınırlı)

**Minimum Gereksinimler:**
- CPU: 1-2 core
- RAM: 2GB (4GB önerilir)
- Disk: 20GB SSD
- İşletim Sistemi: Ubuntu 22.04 LTS (önerilir)

#### B) Dedicated Server (Yüksek trafik için)
- **Hetzner**: €30-50/ay
- **OVH**: €30-60/ay
- **Online.net**: €20-40/ay

#### C) Bulut Platform (Serverless - Sadece Frontend için)
- **Vercel**: Ücretsiz (frontend için)
- **Netlify**: Ücretsiz (frontend için)
- **Firebase Hosting**: Ücretsiz (zaten kullanıyorsunuz)

**Not:** Backend API ve PostgreSQL için VPS gerekli!

---

### 2. 🌍 Domain Name (Opsiyonel ama Önerilir)

**Seçenekler:**
- **Namecheap**: $10-15/yıl (.com)
- **GoDaddy**: $12-20/yıl (.com)
- **Cloudflare**: $8-12/yıl (.com) - En uygun
- **Türkiye**: $20-50/yıl (.com.tr)

**Alternatif:** IP adresi ile erişim (profesyonel görünmez)

---

### 3. 🔒 SSL Sertifikası (Zorunlu - HTTPS için)

**Ücretsiz Seçenekler:**
- **Let's Encrypt**: Tamamen ücretsiz (önerilir)
- **Cloudflare SSL**: Ücretsiz (domain Cloudflare'de ise)

**Kurulum:** Nginx ile otomatik kurulum (aşağıda)

---

### 4. 🔧 Reverse Proxy (Nginx) - Önerilir

**Neden Gerekli:**
- SSL/HTTPS yönetimi
- Port yönlendirme (80 → 5173, 443 → 5173)
- Load balancing
- Güvenlik (rate limiting, DDoS koruması)

**Kurulum:** Ubuntu'da `apt install nginx`

---

### 5. 🔐 Güvenlik Önlemleri

**Zorunlu:**
- Firewall (UFW) yapılandırması
- SSH key authentication
- PostgreSQL ve Redis'in sadece localhost'tan erişilebilir olması
- API authentication/rate limiting
- Fail2ban (brute force koruması)

---

## 💰 MALİYET TAHMİNİ

### Minimum Kurulum (Küçük Trafik)
| Bileşen | Maliyet | Not |
|---------|---------|-----|
| VPS (Hetzner) | €4-8/ay (~$5-10) | 2GB RAM, 1 CPU |
| Domain | $10/yıl (~$1/ay) | Opsiyonel |
| SSL | Ücretsiz | Let's Encrypt |
| **TOPLAM** | **~$6-11/ay** | **Yıllık: ~$70-130** |

### Orta Ölçekli (Orta Trafik)
| Bileşen | Maliyet | Not |
|---------|---------|-----|
| VPS (DigitalOcean) | $12-24/ay | 4GB RAM, 2 CPU |
| Domain | $10/yıl (~$1/ay) | Opsiyonel |
| SSL | Ücretsiz | Let's Encrypt |
| **TOPLAM** | **~$13-25/ay** | **Yıllık: ~$150-300** |

### Yüksek Trafik
| Bileşen | Maliyet | Not |
|---------|---------|-----|
| VPS/Dedicated | $30-60/ay | 8GB+ RAM, 4+ CPU |
| Domain | $10/yıl (~$1/ay) | Opsiyonel |
| SSL | Ücretsiz | Let's Encrypt |
| **TOPLAM** | **~$31-61/ay** | **Yıllık: ~$370-730** |

---

## 🚀 KURULUM ADIMLARI

### Adım 1: VPS Kiralama ve Kurulum

1. **Hetzner Cloud** (önerilir - en uygun):
   - https://www.hetzner.com/cloud
   - Hesap oluştur
   - "Create Server" → Ubuntu 22.04 LTS
   - Location: Nuremberg (Almanya) veya Helsinki (Finlandiya)
   - Type: CX11 (2GB RAM, 1 CPU) - €4.15/ay

2. **SSH ile Bağlan:**
   ```bash
   ssh root@<VPS_IP_ADRESI>
   ```

### Adım 2: Sistem Güncellemeleri

```bash
# Sistem güncelle
apt update && apt upgrade -y

# Temel araçlar
apt install -y curl wget git build-essential
```

### Adım 3: Node.js Kurulumu

```bash
# Node.js 20.x kurulumu
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Kontrol
node --version  # v20.x.x olmalı
npm --version
```

### Adım 4: PostgreSQL Kurulumu

```bash
# PostgreSQL kurulumu
apt install -y postgresql postgresql-contrib

# PostgreSQL başlat
systemctl start postgresql
systemctl enable postgresql

# Veritabanı oluştur
sudo -u postgres psql -c "CREATE DATABASE teklifbul;"
sudo -u postgres psql -c "CREATE USER teklifbul WITH PASSWORD 'GÜÇLÜ_ŞİFRE_BURAYA';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE teklifbul TO teklifbul;"
```

**Güvenlik:** PostgreSQL sadece localhost'tan erişilebilir olmalı:
```bash
# /etc/postgresql/15/main/postgresql.conf
listen_addresses = 'localhost'

# /etc/postgresql/15/main/pg_hba.conf
# Sadece localhost bağlantılarına izin ver
```

### Adım 5: Redis Kurulumu

```bash
# Redis kurulumu
apt install -y redis-server

# Redis başlat
systemctl start redis-server
systemctl enable redis-server

# Güvenlik: Sadece localhost
# /etc/redis/redis.conf
bind 127.0.0.1
```

### Adım 6: Proje Kurulumu

```bash
# Proje klasörü oluştur
mkdir -p /var/www/teklifbul
cd /var/www/teklifbul

# Git ile projeyi çek (veya SCP ile yükle)
git clone <REPO_URL> .

# Dependencies kur
npm install

# .env dosyası oluştur
nano .env
```

**.env dosyası:**
```env
# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=teklifbul
POSTGRES_USER=teklifbul
POSTGRES_PASSWORD=GÜÇLÜ_ŞİFRE_BURAYA

# Redis
REDIS_URL=redis://127.0.0.1:6379
CACHE_DISABLED=0

# API
API_PORT=5174
NODE_ENV=production

# Firebase (mevcut ayarlarınız)
FIREBASE_API_KEY=...
FIREBASE_AUTH_DOMAIN=...
# ... diğer Firebase ayarları
```

### Adım 7: Migration ve Seed

```bash
# Migration'ları çalıştır
npm run migrate:categories
npm run migrate:tax-offices

# Seed data
npm run seed:categories
```

### Adım 8: PM2 ile Process Management

```bash
# PM2 kurulumu
npm install -g pm2

# Frontend build
npm run build

# API server'ı PM2 ile başlat
pm2 start server/src/index.ts --name "teklifbul-api" --interpreter tsx

# PM2 otomatik başlatma
pm2 startup
pm2 save
```

### Adım 9: Nginx Kurulumu ve Yapılandırma

```bash
# Nginx kurulumu
apt install -y nginx

# Nginx yapılandırması
nano /etc/nginx/sites-available/teklifbul
```

**Nginx Config:**
```nginx
server {
    listen 80;
    server_name teklifbul.com www.teklifbul.com;  # Domain yoksa IP kullan

    # Frontend (Vite build)
    location / {
        root /var/www/teklifbul/dist;
        try_files $uri $uri/ /index.html;
    }

    # API Proxy
    location /api {
        proxy_pass http://localhost:5174;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static files
    location /assets {
        root /var/www/teklifbul/dist;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
# Nginx'i aktif et
ln -s /etc/nginx/sites-available/teklifbul /etc/nginx/sites-enabled/
nginx -t  # Test
systemctl restart nginx
```

### Adım 10: SSL Sertifikası (Let's Encrypt)

```bash
# Certbot kurulumu
apt install -y certbot python3-certbot-nginx

# SSL sertifikası al (domain varsa)
certbot --nginx -d teklifbul.com -d www.teklifbul.com

# Otomatik yenileme
certbot renew --dry-run
```

**Not:** Domain yoksa SSL olmadan HTTP kullanılabilir (güvenli değil).

### Adım 11: Firewall Yapılandırması

```bash
# UFW kurulumu
apt install -y ufw

# Firewall kuralları
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw enable

# Kontrol
ufw status
```

### Adım 12: Güvenlik Önlemleri

```bash
# Fail2ban (brute force koruması)
apt install -y fail2ban
systemctl enable fail2ban
systemctl start fail2ban

# SSH key authentication (şifre yerine)
# Kendi bilgisayarınızda:
ssh-keygen -t rsa -b 4096
ssh-copy-id root@<VPS_IP>

# VPS'de SSH şifre girişini kapat:
# /etc/ssh/sshd_config
# PasswordAuthentication no
```

---

## 🔄 GÜNCELLEME VE BAKIM

### Kod Güncelleme

```bash
# VPS'de
cd /var/www/teklifbul
git pull
npm install
npm run build
pm2 restart teklifbul-api
```

### Log Kontrolü

```bash
# PM2 logları
pm2 logs teklifbul-api

# Nginx logları
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# PostgreSQL logları
tail -f /var/log/postgresql/postgresql-15-main.log
```

---

## ⚠️ ÖNEMLİ NOTLAR

### 1. PostgreSQL ve Redis Güvenliği
- **ASLA** PostgreSQL ve Redis'i dışarıya açmayın!
- Sadece localhost'tan erişilebilir olmalı
- API server üzerinden erişim sağlanmalı

### 2. API Güvenliği
- API endpoint'lerine authentication ekleyin
- Rate limiting uygulayın
- CORS ayarlarını sınırlayın

### 3. Backup
```bash
# PostgreSQL backup (cron ile)
0 2 * * * pg_dump -U teklifbul teklifbul > /backup/teklifbul_$(date +\%Y\%m\%d).sql
```

### 4. Monitoring
- PM2 monitoring: `pm2 monit`
- Server monitoring: htop, iotop
- Uptime monitoring: UptimeRobot (ücretsiz)

---

## 🎯 HIZLI BAŞLANGIÇ (Özet)

1. **VPS Kiralama** (Hetzner: €4/ay)
2. **SSH ile Bağlan**
3. **Node.js, PostgreSQL, Redis Kur**
4. **Projeyi Yükle ve Kur**
5. **PM2 ile API Başlat**
6. **Nginx Yapılandır**
7. **SSL Sertifikası Al** (domain varsa)
8. **Firewall Aktif Et**

**Toplam Süre:** 2-3 saat (ilk kurulum)

**Aylık Maliyet:** ~$6-11 (minimum)

---

## 📞 DESTEK

Sorun yaşarsanız:
- Hetzner dokümantasyonu: https://docs.hetzner.com/
- DigitalOcean tutorials: https://www.digitalocean.com/community/tags/nginx
- Let's Encrypt dokümantasyonu: https://letsencrypt.org/docs/

---

**Teklifbul Rule v1.0** - Güvenlik önceliklidir, production'da mutlaka SSL kullanın!

