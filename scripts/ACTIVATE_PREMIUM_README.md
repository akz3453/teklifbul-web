# Premium Hesap Aktifleştirme Scripti

## Kullanım

### Gereksinimler
1. Firebase Service Account Key dosyası (`serviceAccountKey.json`) veya `FIREBASE_SERVICE_ACCOUNT` environment variable
2. Node.js ve gerekli paketler yüklü olmalı

### Komut

```bash
# Aylık plan için
node scripts/activate-premium-user.js teklifbulalici@gmail.com monthly

# Yıllık plan için
node scripts/activate-premium-user.js teklifbulalici@gmail.com yearly
```

### Service Account Key Alma

1. Firebase Console'a gidin: https://console.firebase.google.com
2. Projenizi seçin
3. Project Settings > Service Accounts sekmesine gidin
4. "Generate New Private Key" butonuna tıklayın
5. İndirilen JSON dosyasını proje kök dizinine `serviceAccountKey.json` olarak kaydedin

### Alternatif: Environment Variable

```bash
# Windows PowerShell
$env:FIREBASE_SERVICE_ACCOUNT = Get-Content serviceAccountKey.json -Raw
node scripts/activate-premium-user.js teklifbulalici@gmail.com monthly

# Linux/Mac
export FIREBASE_SERVICE_ACCOUNT=$(cat serviceAccountKey.json)
node scripts/activate-premium-user.js teklifbulalici@gmail.com monthly
```

## Script Ne Yapar?

1. ✅ Email ile kullanıcıyı bulur
2. ✅ `subscriptions` koleksiyonunda aktif abonelik oluşturur/günceller
3. ✅ `users` koleksiyonunda plan bilgilerini günceller (`isPremium: true`, `planId`, `expiresAt`, vb.)
4. ✅ Audit log kaydı oluşturur
5. ✅ Detaylı özet bilgisi gösterir

## Örnek Çıktı

```
🔍 Kullanıcı aranıyor: teklifbulalici@gmail.com
✅ Kullanıcı bulundu: KsVerlx9wOVD8tEAKCMXpXc693p1
   Ad: Teklifbul Alıcı
   Email: teklifbulalici@gmail.com
   Şirket ID: uqiDIRtDDj4I5YQgFogi

📦 Premium plan aktifleştiriliyor:
   Plan: Premium Aylık
   Faturalama: monthly
   Tutar: 400 TRY

✅ Yeni abonelik oluşturuldu: abc123...
✅ Kullanıcı plan bilgileri güncellendi

📊 Özet:
   Kullanıcı ID: KsVerlx9wOVD8tEAKCMXpXc693p1
   Email: teklifbulalici@gmail.com
   Plan: Premium Aylık
   Başlangıç: 30.11.2025 06:15:00
   Bitiş: 30.12.2025 06:15:00
   Kalan Gün: 30 gün

🎉 Premium hesap başarıyla aktifleştirildi!
```

