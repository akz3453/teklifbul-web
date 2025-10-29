ÇALIŞTIRMA
1) Bu klasörde Terminal/PowerShell aç:
   python -m http.server 5500
   (alternatif: npx serve -p 5500)

2) Tarayıcı:
   http://localhost:5500/index.html       (giriş)
   http://localhost:5500/signup.html      (kayıt)
   http://localhost:5500/demands.html     (talepleri listele)
   http://localhost:5500/demand-new.html  (talep oluştur)
   demand-new sonrası detay sayfasına yönlenir ve teklif verilebilir.

Notlar:
- Authentication > Sign-in method > Email/Password = Enabled olmalı.
- Firestore koleksiyonları ilk yazışta otomatik oluşur.
- Hata görürsen F12 > Console'daki mesajı takip et.
