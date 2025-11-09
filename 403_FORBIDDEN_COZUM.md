# 🔒 403 Forbidden Error Çözümü

## ❌ Sorun

```
GET https://us-central1-teklifbul.cloudfunctions.net/exportPurchaseForm 403 (Forbidden)
```

**Neden:** Firebase Function herkese açık değil (IAM permissions eksik)

---

## ✅ Çözüm Yöntemleri

### Yöntem 1: Firebase CLI ile (Önerilen)

Terminal'de şu komutu çalıştırın:

```bash
firebase functions:config:set
```

**VEYA direkt IAM permission ekleyin:**

```bash
gcloud functions add-iam-policy-binding exportPurchaseForm \
  --region=us-central1 \
  --member="allUsers" \
  --role="roles/cloudfunctions.invoker" \
  --project=teklifbul
```

**Eğer gcloud kurulu değilse**, Firebase Console'dan yapın (Yöntem 2).

---

### Yöntem 2: Firebase Console'dan (Kolay)

1. **Firebase Console'a gidin:**
   - https://console.firebase.google.com
   - Proje: **teklifbul**

2. **Functions sayfasına gidin:**
   - Sol menü: **Functions** → **Functions**

3. **Function'ı bulun:**
   - `exportPurchaseForm` function'ını bulun
   - Üzerine tıklayın

4. **Permissions (İzinler) sekmesine gidin:**
   - Function detay sayfasında **Permissions** veya **IAM** sekmesi
   - **Add member** veya **Add principal** butonuna tıklayın

5. **Herkese açık yapın:**
   - **New members:** `allUsers` yazın
   - **Role:** `Cloud Functions Invoker` seçin
   - **Save** tıklayın

---

### Yöntem 3: Google Cloud Console'dan

1. **Google Cloud Console'a gidin:**
   - https://console.cloud.google.com
   - Proje: **teklifbul**

2. **Cloud Functions'a gidin:**
   - Sol menü: **Cloud Functions**

3. **Function'ı bulun:**
   - `exportPurchaseForm` function'ını bulun
   - Üzerine tıklayın

4. **Permissions sekmesine gidin:**
   - **PERMISSIONS** sekmesine tıklayın
   - **GRANT ACCESS** butonuna tıklayın

5. **Erişim verin:**
   - **New principals:** `allUsers`
   - **Select a role:** `Cloud Functions Invoker`
   - **SAVE** tıklayın

---

## 🧪 Test

İzinleri verdikten sonra:

1. Birkaç saniye bekleyin (IAM propagation zaman alır)

2. Tarayıcıda URL'i tekrar açın:
   ```
   https://us-central1-teklifbul.cloudfunctions.net/exportPurchaseForm
   ```

3. **Beklenen:**
   ```
   exportPurchaseForm OK (use POST for Excel).
   ```

4. **403 hatası gitmeli!** ✅

---

## 📝 Notlar

- IAM permission değişiklikleri **1-2 dakika** sürebilir
- Function deploy edilmiş olmalı
- URL doğru olmalı

---

## ⚠️ Güvenlik Uyarısı

**allUsers** = Herkes erişebilir (kimlik doğrulama yok)

Eğer sadece authenticated kullanıcılar erişebilsin isterseniz:
- **allUsers** yerine **allAuthenticatedUsers** kullanın
- Veya özel IAM policy oluşturun

---

**En Hızlı Çözüm:** Firebase Console → Functions → exportPurchaseForm → Permissions → allUsers ekleyin

