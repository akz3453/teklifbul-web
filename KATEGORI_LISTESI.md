# 📋 Sistemdeki Kategoriler

## 📊 Özet

**Toplam Kategori Sayısı:** 27 kategori  
**Aktif Kategori:** 27 kategori (hepsi aktif)  
**Kullanım:** Hem tedarikçiler hem de alıcılar için ortak kategori listesi

---

## 📝 Kategori Listesi (27 Adet)

### Endüstriyel Grubu (10 kategori)
1. **Sac/Metal** - `CAT.SACMETAL`
2. **Makine-İmalat** - `CAT.MAKINEIMALAT`
3. **Hırdavat** - `CAT.HIRDAVAT`
4. **Kimyasal** - `CAT.KIMYASAL`
5. **Boya** - `CAT.BOYA`
6. **Plastik** - `CAT.PLASTIK`
7. **Otomotiv Yan Sanayi** - `CAT.OTOMOTIVYS`
8. **Kaynak & Sarf** - `CAT.KAYNAK`
9. **Rulman & Güç Aktarım** - `CAT.RULMAN`

### Elektrik-ELK Grubu (5 kategori)
10. **Elektrik** - `CAT.ELEKTRIK`
11. **Elektronik** - `CAT.ELEKTRONIK`
12. **Aydınlatma** - `CAT.AYDINLATMA`
13. **Alçak/Orta Gerilim** - `CAT.AGMG`
14. **Otomasyon (PLC/SCADA)** - `CAT.OTOMASYON`

### Genel Grubu (4 kategori)
15. **Ambalaj** - `CAT.AMBALAJ`
16. **Mobilya** - `CAT.MOBILYA`
17. **Temizlik** - `CAT.TEMIZLIK`
18. **Gıda** - `CAT.GIDA`

### İnşaat Grubu (1 kategori)
19. **İnşaat Malzemeleri** - `CAT.INSAAT`

### İSG Grubu (1 kategori)
20. **İş Güvenliği** - `CAT.ISG`

### MEP Grubu (2 kategori)
21. **HVAC** - `CAT.HVAC`
22. **Yangın Güvenliği** - `CAT.YANGIN`

### Hizmet Grubu (3 kategori)
23. **Hizmet** - `CAT.HIZMET`
24. **Lojistik** - `CAT.LOJISTIK`
25. **Ekipman Kiralama** - `CAT.KIRALAMA`

---

## 🎯 Kullanım

### Tedarikçiler için:
- Hesap Ayarları → Tedarikçi Kategorileri bölümünden seçim yapılır
- Seçilen kategoriler `supplierCategoryIds` alanına kaydedilir (ID formatında)
- Bu kategorilerdeki talepler tedarikçiye gösterilir

### Alıcılar için:
- Yeni Talep oluşturma ekranında kategoriler seçilir
- Seçilen kategoriler `categoryIds` alanına kaydedilir (ID formatında)
- Talepler bu kategorilere göre tedarikçilere eşleştirilir

---

## 📊 Grup Dağılımı

- **Endüstriyel:** 10 kategori
- **Elektrik-ELK:** 5 kategori
- **Genel:** 4 kategori
- **Hizmet:** 3 kategori
- **MEP:** 2 kategori
- **İnşaat:** 1 kategori
- **İSG:** 1 kategori

**Toplam:** 27 kategori

---

## 💡 Notlar

- Tüm kategoriler hem tedarikçi hem de alıcı tarafından kullanılabilir
- Kategori ID'leri kalıcıdır (`CAT.XXX` formatı)
- Kategori isimleri Türkçe karakterleri destekler
- Slug formatları URL/arama için kullanılır, eşleşmede kullanılmaz

---

**Son Güncelleme:** 2025-11-02

