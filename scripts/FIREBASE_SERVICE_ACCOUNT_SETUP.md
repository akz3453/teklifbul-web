# Firebase Service Account Key Hazırlama Rehberi

## Adım Adım Talimatlar

### 1. Firebase Console'a Giriş Yapın
1. Tarayıcınızda https://console.firebase.google.com adresine gidin
2. Google hesabınızla giriş yapın
3. Teklifbul projenizi seçin

### 2. Project Settings'e Gidin
1. Sol üst köşedeki ⚙️ (Settings) ikonuna tıklayın
2. "Project settings" seçeneğine tıklayın

### 3. Service Accounts Sekmesine Gidin
1. Açılan sayfada üst menüden "Service accounts" sekmesine tıklayın
2. Bu sekmede Firebase Admin SDK bilgileri görünecek

### 4. Yeni Private Key Oluşturun
1. Sayfanın üst kısmında bir dil seçimi göreceksiniz (Node.js, Java, Python, Go)
2. **Node.js** seçeneğini seçin (script'imiz Node.js ile yazıldığı için)
3. Sayfanın alt kısmında "Generate new private key" butonuna tıklayın
4. Bir uyarı penceresi açılacak: "Generate new private key?"
5. "Generate key" butonuna tıklayın
6. JSON dosyası otomatik olarak indirilecek (genellikle `teklifbul-xxxxx-firebase-adminsdk-xxxxx.json` gibi bir isimle)

**Not:** Dil seçimi sadece örnek kod gösterimi içindir. İndirilen JSON dosyası her zaman aynı formattadır ve tüm dillerle çalışır. Node.js seçmeniz önerilir çünkü script'imiz Node.js ile yazılmıştır.

### 5. Dosyayı Proje Dizinine Kopyalayın
1. İndirilen JSON dosyasını bulun (genellikle Downloads klasöründe)
2. Dosyayı `C:\Users\faruk\OneDrive\Desktop\teklifbul-web\` dizinine kopyalayın
3. Dosya adını `serviceAccountKey.json` olarak değiştirin

### 6. Script'i Çalıştırın
PowerShell veya Command Prompt'ta:
```bash
cd "C:\Users\faruk\OneDrive\Desktop\teklifbul-web"
node scripts/activate-premium-user.js teklifbulalici@gmail.com monthly
```

## Alternatif Yöntem: Environment Variable

Eğer dosyayı proje dizinine koymak istemiyorsanız, environment variable kullanabilirsiniz:

### Windows PowerShell:
```powershell
# JSON dosyasının içeriğini okuyun
$jsonContent = Get-Content "C:\path\to\your\service-account-key.json" -Raw

# Environment variable olarak ayarlayın
$env:FIREBASE_SERVICE_ACCOUNT = $jsonContent

# Script'i çalıştırın
node scripts/activate-premium-user.js teklifbulalici@gmail.com monthly
```

### Windows Command Prompt (CMD):
```cmd
set FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"teklifbul",...}
node scripts/activate-premium-user.js teklifbulalici@gmail.com monthly
```

## Güvenlik Notları

⚠️ **ÖNEMLİ:**
- `serviceAccountKey.json` dosyasını **ASLA** Git'e commit etmeyin
- `.gitignore` dosyasına ekleyin: `serviceAccountKey.json`
- Bu dosya tüm Firebase projenize tam erişim sağlar
- Sadece güvenli ortamlarda kullanın

## Sorun Giderme

### "Service account bilgisi bulunamadı" Hatası
- Dosyanın `teklifbul-web` klasöründe olduğundan emin olun
- Dosya adının tam olarak `serviceAccountKey.json` olduğundan emin olun
- Dosya uzantısının `.json` olduğundan emin olun (`.json.txt` değil)

### "Permission denied" Hatası
- Firebase Console'da IAM ayarlarını kontrol edin
- Service account'un gerekli izinlere sahip olduğundan emin olun

### "Project not found" Hatası
- JSON dosyasındaki `project_id` değerini kontrol edin
- Firebase Console'da doğru projeyi seçtiğinizden emin olun

