# 🔒 Firebase Console'dan Function İzinleri Ayarlama

## 📋 Adım Adım Rehber

### 1️⃣ Modal'ı Kapatın

"Set up Functions" modalını görüyorsanız:
- Firebase CLI zaten kurulu (terminal komutları çalışıyor)
- Bu modal'ı **Cancel** veya **X** ile kapatabilirsiniz

---

### 2️⃣ Function'ı Bulun

1. Sol menüden **Functions** → **Functions** tıklayın (zaten oradasınız)

2. Function listesinde **exportPurchaseForm** function'ını arayın
   - Eğer listede görünmüyorsa, function deploy edilmemiş olabilir
   - O zaman önce deploy edin: `firebase deploy --only functions:excel-export`

3. Function üzerine **tıklayın** (detay sayfasına gidin)

---

### 3️⃣ Permissions Sekmesine Gidin

Function detay sayfasında:

1. Üst kısımda sekmeler görünecek:
   - **DETAILS** (varsayılan)
   - **LOGS**
   - **PERMISSIONS** ← **Buna tıklayın**

2. Veya sağ tarafta bir menü varsa:
   - **Permissions** / **IAM** seçeneğini bulun

---

### 4️⃣ Herkese Erişim Verin

**Permissions** sayfasında:

1. **"Add member"** veya **"Grant access"** butonuna tıklayın

2. **"New principals"** veya **"Principal"** alanına:
   ```
   allUsers
   ```
   yazın

3. **"Select a role"** veya **"Role"** dropdown'ından:
   ```
   Cloud Functions Invoker
   ```
   seçin

4. **"Save"** veya **"Add"** butonuna tıklayın

---

### 5️⃣ Onay Mesajı

Bir uyarı görünebilir:
> "Making your function publicly accessible"

**"Allow unauthenticated"** veya **"Allow public access"** butonuna tıklayın

---

### 6️⃣ Test Edin

1. 1-2 dakika bekleyin (IAM permission yayılımı)

2. Tarayıcıda test edin:
   ```
   https://us-central1-teklifbul.cloudfunctions.net/exportPurchaseForm
   ```

3. Beklenen sonuç:
   ```
   exportPurchaseForm OK (use POST for Excel).
   ```

✅ **403 hatası gitmeli!**

---

## 🔍 Function Bulamazsanız

Eğer function listede yoksa:

### Deploy Edin
```bash
firebase deploy --only functions:excel-export
```

Deploy başarılı olduktan sonra:
- Console'u yenileyin (F5)
- Function listede görünecek

---

## 📝 Alternatif: Google Cloud Console

Firebase Console'da permissions bulamazsanız:

1. **Google Cloud Console'a gidin:**
   - https://console.cloud.google.com
   - Proje: **teklifbul**

2. **Cloud Functions:**
   - Sol menü: **Cloud Functions**

3. **Function'ı bulun:**
   - `exportPurchaseForm`

4. **Permissions:**
   - Function üzerine tıklayın
   - **PERMISSIONS** sekmesi
   - **GRANT ACCESS**
   - `allUsers` + `Cloud Functions Invoker`
   - **SAVE**

---

## ⚠️ Önemli Notlar

- **IAM permissions** 1-2 dakika sürebilir
- Function **deploy edilmiş** olmalı
- URL **doğru** olmalı
- Tarayıcı **cache**'ini temizleyin (Ctrl+Shift+R)

---

## ✅ Başarı Kontrolü

- [ ] Function listede görünüyor
- [ ] Permissions sekmesine gidildi
- [ ] allUsers eklendi
- [ ] Cloud Functions Invoker role verildi
- [ ] 1-2 dakika beklendi
- [ ] URL test edildi → 200 OK (403 değil)

---

**Sorun Devam Ederse:** Firebase Console'da function'ın deploy durumunu kontrol edin.

