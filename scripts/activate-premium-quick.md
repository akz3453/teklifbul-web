# 🚀 Premium Hesap Aktifleştirme - Hızlı Başlangıç

## ⚡ Hızlı Adımlar

### 1️⃣ Firebase Console'dan Key İndirin
1. https://console.firebase.google.com → Projenizi seçin
2. ⚙️ Settings → Project settings
3. "Service accounts" sekmesi
4. **Üstteki dil seçiminden "Node.js" seçin** (sadece örnek kod için, JSON aynı)
5. "Generate new private key" → İndirilen JSON dosyasını alın

### 2️⃣ Dosyayı Proje Dizinine Kopyalayın
```powershell
# İndirilen dosyayı şu dizine kopyalayın:
C:\Users\faruk\OneDrive\Desktop\teklifbul-web\serviceAccountKey.json
```

### 3️⃣ Script'i Çalıştırın
```powershell
cd "C:\Users\faruk\OneDrive\Desktop\teklifbul-web"
node scripts/activate-premium-user.js teklifbulalici@gmail.com monthly
```

## ✅ Başarılı Çıktı Örneği

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

## 🔒 Güvenlik
- `serviceAccountKey.json` dosyası `.gitignore`'da - Git'e commit edilmeyecek
- Bu dosya tüm Firebase projenize erişim sağlar, güvenli tutun!

