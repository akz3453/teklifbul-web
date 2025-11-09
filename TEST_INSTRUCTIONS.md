# 🚀 Sistem Test Talimatları

## Development Server Başlatıldı

Development server arka planda çalışıyor. Tarayıcınızda aşağıdaki adresleri ziyaret edebilirsiniz:

### 1. Ana Sayfa
- **URL**: `http://localhost:5173/`
- **Açıklama**: Ana giriş sayfası

### 2. Şirket Profil Sayfası
- **URL**: `http://localhost:5173/company-profile.html?id={ŞIRKET_ID}`
- **veya**: `http://localhost:5173/company-profile.html?code={ŞIRKET_KODU}`
- **Test Senaryoları**:
  1. **Alıcı Şirket + Yetkili Kullanıcı**:
     - Satın Alma Uzman Yardımcısı veya üzeri rol ile giriş yap
     - "Onay Mekanizması" bölümü görünür olmalı
     - Üst onaycı durumu gösterilmeli
  
  2. **Alıcı Şirket + Yetkisiz Kullanıcı**:
     - Yetkisiz rol (örn: proje_yoneticisi) ile giriş yap
     - "Onay Mekanizması" bölümü görünür OLMAMALI
  
  3. **Tedarikçi Şirket**:
     - Herhangi bir rol ile giriş yap
     - "Onay Mekanizması" bölümü görünür OLMAMALI
  
  4. **Başarılı Ticaret Geçmişi**:
     - Herhangi bir şirket profiline git
     - Onaylanan/tamamlanan teklifler varsa listelenmeli

### 3. Test Sayfası
- **URL**: `http://localhost:5173/test-approval-system.html`
- **Açıklama**: Sistemin tüm fonksiyonlarını test eder
- **Test Edilen Özellikler**:
  - Guard fonksiyonları (`hasActiveTopApprover`, `isSingleUserCompany`, `canIssuePO`, `canESignApprove`)
  - Rol yetkileri kontrolü
  - Onay mekanizması durumu
  - Ticaret geçmişi sayıları

## 🔍 Kontrol Edilecekler

### ✅ Onay Mekanizması Bölümü
- [ ] Alıcı şirketlerde görünüyor mu?
- [ ] Sadece yetkili kullanıcılar görebiliyor mu?
- [ ] Üst onaycı durumu doğru gösteriliyor mu?
- [ ] Aktif üst onaycılar listeleniyor mu?
- [ ] Onay politikası açıklaması var mı?

### ✅ Başarılı Ticaret Geçmişi Bölümü
- [ ] Tüm şirketlerde görünüyor mu?
- [ ] İş ortaklığı yapılan firmalar listeleniyor mu?
- [ ] İşlem sayıları gösteriliyor mu?
- [ ] Son işlem tarihleri gösteriliyor mu?
- [ ] Firma kartlarına tıklanabilir mi?

### ✅ Test Sayfası
- [ ] Sayfa açılıyor mu?
- [ ] Tüm testler çalışıyor mu?
- [ ] Sonuçlar doğru gösteriliyor mu?

## 🐛 Sorun Giderme

### Server Başlamadıysa
```bash
npm run dev
```

### Port Zaten Kullanılıyorsa
`vite.config.ts` dosyasında port numarasını değiştirebilirsiniz.

### Import Hataları
- `assets/js/services/approval-guards.js` dosyasının doğru export ettiğinden emin olun
- `company-profile.html` dosyasındaki import path'lerini kontrol edin

## 📝 Notlar

- Sistem hem eski `companyId` hem de yeni `companies` array yapısını destekliyor
- Kullanıcı sorguları her iki yapıyı da kontrol ediyor
- Hata durumlarında sistem güvenli tarafta kalıyor (yetki vermiyor)

## 🎯 Hızlı Test

1. Tarayıcıda `http://localhost:5173/test-approval-system.html` açın
2. Giriş yapın
3. Test sonuçlarını kontrol edin
4. Şirket profil sayfasını açın ve özellikleri test edin

**Başarılar! 🚀**

