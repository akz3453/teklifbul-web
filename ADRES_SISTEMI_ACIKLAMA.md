# Teklifbul Adres Yönetimi Sistemi - Teknik Dokümantasyon

## Genel Bakış

Teklifbul web uygulamasında adres yönetimi sistemi iki ana bölümden oluşur:
1. **Ana Adres (Fatura Adresi)** - Kullanıcının varsayılan fatura adresi
2. **İlave Adresler** - Kullanıcının ekstra adresleri (ofis, depo, şube vb.)

Her iki sistem de **structured address** (yapılandırılmış adres) formatını kullanır ve Firestore'da `users` koleksiyonunda saklanır.

---

## 1. Ana Adres (Fatura Adresi) Sistemi

### Veri Yapısı

Ana adres bilgileri Firestore'da şu şekilde saklanır:

```javascript
{
  invoiceAddressParts: {
    ulke: "Türkiye",
    il: "İstanbul",
    ilce: "Beykoz",
    mahalle: "Yavuz Selim Mahalle",
    cadde: "dutdere Cadde",
    sokak: "cömert Sokak",  // ZORUNLU ALAN
    kapiNo: "7",
    daire: "1",
    postaKodu: "34830"
  },
  taxOffice: "Beykoz Vergi Dairesi"
}
```

### UI Bileşenleri

Ana adres düzenleme ekranı (`settings.html` içinde `displayMainAddress` fonksiyonu):

- **İl Dropdown**: `mainAddr_il` - Türkiye'deki 81 il listesi
- **İlçe Dropdown**: `mainAddr_ilce` - Seçilen ile göre dinamik yüklenir
- **Mahalle Dropdown**: `mainAddr_mahalle` - Seçilen ilçeye göre dinamik yüklenir (opsiyonel)
- **Sokak Input**: `mainAddr_sokak_manual` - **ZORUNLU ALAN**, kullanıcı elle yazar
- **Sokak Dropdown**: `mainAddr_sokak` - Mahalle seçilince JSON dosyasından yüklenir (opsiyonel)
- **Cadde Input**: `mainAddr_cadde`
- **Kapı No Input**: `mainAddr_kapi`
- **Daire Input**: `mainAddr_daire`
- **Posta Kodu Input**: `mainAddr_postakodu`

### Sokak Bilgisi Yönetimi

**Sokak input her zaman görünür ve zorunludur** (`mainAddr_sokak_manual`):
- Kullanıcı sokak adını elle yazabilir
- Mahalle seçilince sokak dropdown'u da yüklenir (opsiyonel)
- Sokak dropdown'dan seçim yapıldığında, seçilen değer otomatik olarak manuel input'a kopyalanır
- Kaydetme sırasında sokak bilgisi **her zaman manuel input'tan** alınır

**Kod Akışı:**
```javascript
// 1. Sokak input her zaman görünür ve aktif
sokakManualEl.style.display = '';
sokakManualEl.removeAttribute('disabled');
sokakManualEl.setAttribute('required', 'required');

// 2. Mahalle seçilince sokak dropdown'u yüklenir (opsiyonel)
mahalleSel.addEventListener('change', async () => {
  const streets = await __loadStreets(selectedIl, selectedIlce, selectedMahalle);
  if (streets.streets && streets.streets.length > 0) {
    sokakSel.style.display = '';
    __fillSelect(sokakSel, streets.streets.map(s => ({ name: s.name || s })));
  }
});

// 3. Dropdown'dan seçim yapıldığında manuel input'a kopyalanır
sokakSel.addEventListener('change', () => {
  if (sokakSel.value) {
    sokakManualEl.value = selectedOption.textContent.trim();
  }
});

// 4. Kaydetme sırasında sokak bilgisi manuel input'tan alınır
let sokak = '';
if (sokakManualEl && sokakManualEl.value) {
  sokak = sokakManualEl.value.trim();
} else if (sokakSel && sokakSel.value && sokakSel.style.display !== 'none') {
  const selectedOption = sokakSel.options[sokakSel.selectedIndex];
  sokak = selectedOption ? selectedOption.textContent.trim() : '';
}
```

### Adres Görüntüleme

Ana adres görüntüleme modunda (`displayMainAddress` fonksiyonu, `mainAddressEditMode = false`):

```javascript
const addressParts = [];
if (addressPartsData.sokak) {
  addressParts.push(`${addressPartsData.sokak}${addressPartsData.sokak.includes('Sokak') || addressPartsData.sokak.includes('Cadde') ? '' : ' Sokak'}`);
}
if (addressPartsData.cadde) {
  addressParts.push(`${addressPartsData.cadde}${addressPartsData.cadde.includes('Cadde') ? '' : ' Cadde'}`);
}
// ... diğer alanlar
```

**Sorun:** Sokak bilgisi girildiğinde, alttaki adres alanına (`mainAddressDisplay`) otomatik olarak yansımıyor. Bu, sadece düzenleme modunda (`mainAddressEditMode = true`) görüntüleniyor, ancak görüntüleme moduna geçince (`mainAddressEditMode = false`) güncellenmiş adres gösterilmiyor.

### Kaydetme İşlemi

`saveMainAddress` fonksiyonu:
1. Tüm form alanlarını okur
2. Sokak bilgisini **manuel input'tan** alır (zorunlu)
3. Validation yapar (il, ilçe, sokak zorunlu)
4. Firestore'a `invoiceAddressParts` objesi olarak kaydeder
5. Sayfayı yeniler (`displayMainAddress` çağrılır)

---

## 2. İlave Adresler Sistemi

### Veri Yapısı

İlave adresler Firestore'da şu şekilde saklanır:

```javascript
{
  additionalAddresses: [
    {
      title: "ofis",
      content: "Mahalle Mahalle - Cadde Cadde - Sokak Sokak - Kapı No: 7 - Daire: 1 - İlçe: Beykoz - İl: İstanbul - Posta Kodu: 34830 - Türkiye",
      street: "cömert Sokak",
      cadde: "dutdere Cadde",
      city: "İstanbul",
      district: "Beykoz",
      mahalle: "Yavuz Selim Mahalle",
      building: "7",
      kapi: "7",
      daire: "1",
      postakodu: "34830",
      type: "other" // "invoice", "delivery", "other"
    }
  ]
}
```

### UI Bileşenleri

İlave adres ekleme ekranı (`addAddressRow` fonksiyonu):

Her yeni adres için bir satır (`addr-row`) oluşturulur:
- **Adres Başlığı Input**: `addr-title` - Örn: "ofis", "depo", "şube"
- **İl Dropdown**: `addr-il`
- **İlçe Dropdown**: `addr-ilce`
- **Mahalle Dropdown**: `addr-mahalle` (opsiyonel)
- **Cadde Input**: `addr-cadde`
- **Sokak Dropdown**: `addr-sokak` (opsiyonel, mahalle seçilince yüklenir)
- **Sokak Manuel Input**: `addr-sokak-manual` (başlangıçta `display:none`)
- **Kapı No Input**: `addr-kapi`
- **Daire Input**: `addr-daire`
- **Posta Kodu Input**: `addr-posta`
- **Oluşturulan Adres Textarea**: `addr-composed` (readonly, otomatik oluşturulur)

### Sokak Bilgisi Yönetimi (İlave Adresler)

**Sorun:** İlave adreslerde sokak bilgisi için iki input var:
1. **Dropdown**: `addr-sokak` - Mahalle seçilince JSON dosyasından yüklenir
2. **Manuel Input**: `addr-sokak-manual` - Başlangıçta `display:none`

**Kod Akışı:**
```javascript
// Mahalle seçilince sokak dropdown'u yüklenir
mahSel.addEventListener('change', async () => {
  const data = await __loadStreets(ilSel.value, ilceSel.value, neighborhoodId);
  const streets = (data?.streets||[]).map(s=>({id:s.id ?? s.code ?? s.name, name:s.name}));
  fillSelectLocal(sokSel, streets, 'Sokak/Cadde seçiniz');
  if (streets.length > 0) {
    sokSel.style.display = '';
    if (sokManual) {
      sokManual.style.display = 'none';  // Manuel input gizlenir
      sokManual.value = '';
    }
  } else {
    sokSel.style.display = 'none';
    if (sokManual) {
      sokManual.style.display = '';  // Manuel input gösterilir
    }
  }
});

// Adres oluşturma fonksiyonu
function compose() {
  const sok = getSelText(sokSel) || (sokManual?.value?.trim() || '');  // Dropdown'dan veya manuel input'tan
  // ... diğer alanlar
  const parts = [
    sok ? `${sok} Sokak` : null,
    // ... diğer parçalar
  ].filter(Boolean);
  if (outTa) outTa.value = parts.join(' - ');  // Textarea'ya yazılır
}
```

**Sorun 1:** Kullanıcı sokak bilgisini manuel input'a yazdığında, `addr-composed` textarea'sına otomatik olarak yansımıyor. `compose()` fonksiyonu çalışmıyor veya manuel input'un event listener'ı eksik.

**Sorun 2:** İlave adreslerde sokak manuel input'u başlangıçta gizli. Kullanıcı sokak bilgisini yazmak istediğinde input görünür olmayabilir.

### Kaydetme İşlemi (İlave Adresler)

`getAdditionalAddresses` fonksiyonu tüm adres satırlarını okur:

```javascript
const sokakSelText = sokSel ? getSokakText(sokSel) : '';
const sokakManualText = (sokManual && sokManual.style.display !== 'none') ? (sokManual.value || '').trim() : '';
const sokak = sokakManualText || sokakSelText;
```

**Sorun:** `sokManual.style.display !== 'none'` kontrolü yapılıyor. Eğer manuel input gizliyse (`display:none`), değeri okunmuyor. Ancak kullanıcı sokak bilgisini yazdıysa, bu bilgi kaybolabilir.

---

## 3. Sokak JSON Dosyaları

Sokak bilgileri JSON dosyalarından yüklenir:

**Dosya Formatı:**
```
/assets/sokak/{DISTRICT_ID}_mah-{NEIGHBORHOOD_ID}.json
```

**Örnek:**
```
/assets/sokak/ISTANBUL__BEYKOZ_mah-YAVUZ_SELIM_MAHALLE.json
```

**İçerik:**
```json
{
  "streets": [
    { "id": "1", "name": "Cömert Sokak" },
    { "id": "2", "name": "Dutdere Cadde" }
  ]
}
```

**404 Hataları:**
- Eğer JSON dosyası bulunamazsa (404), sistem sessizce boş array döner
- Bu durumda kullanıcı sokak bilgisini manuel olarak yazmalıdır
- Console'da 404 hataları görülebilir ama sistem çalışmaya devam eder

---

## 4. Tespit Edilen Sorunlar

### Sorun 1: Sokak Bilgisi Alttaki Adres Alanına Yansımıyor (Ana Adres)

**Neden:**
- Düzenleme modunda (`mainAddressEditMode = true`) sokak bilgisi girildiğinde, `displayMainAddress` fonksiyonu otomatik olarak çağrılmıyor
- Adres görüntüleme moduna geçince (`mainAddressEditMode = false`), `addressParts` dizisi `userData.invoiceAddressParts`'tan okunuyor
- Ancak kullanıcı henüz kaydetmediyse, Firestore'daki eski veri gösteriliyor

**Çözüm Önerisi:**
- `mainAddr_sokak_manual` input'una `input` event listener eklenmeli
- Bu listener, sokak bilgisi değiştiğinde `displayMainAddress` fonksiyonunu çağırmalı (düzenleme modunda)
- Veya adres görüntüleme alanını (`mainAddressDisplay`) real-time güncellemeli

### Sorun 2: İlave Adreslerde Sokak Bilgisi Görünmüyor

**Neden:**
1. Sokak manuel input'u (`addr-sokak-manual`) başlangıçta gizli (`display:none`)
2. Mahalle seçilmediyse veya sokak JSON dosyası yoksa, manuel input görünür olmalı ama olmayabilir
3. `compose()` fonksiyonu manuel input'un `input` event'ini dinliyor, ancak input gizliyse çalışmayabilir

**Çözüm Önerisi:**
1. Sokak manuel input'u her zaman görünür olmalı (veya en azından dropdown yoksa görünür olmalı)
2. `compose()` fonksiyonu manuel input'un değerini her zaman kontrol etmeli (gizli olsa bile)
3. Event listener'lar input gizliyken de çalışmalı

### Sorun 3: İlave Adreslerde Kaydetme Sorunu

**Neden:**
- `getAdditionalAddresses` fonksiyonu sokak bilgisini okurken `sokManual.style.display !== 'none'` kontrolü yapıyor
- Eğer input gizliyse, değeri okunmuyor
- Ancak kullanıcı sokak bilgisini yazdıysa, bu bilgi kaybolabilir

**Çözüm Önerisi:**
- `getAdditionalAddresses` fonksiyonu sokak bilgisini okurken önce manuel input'un değerini kontrol etmeli
- Eğer manuel input'ta değer varsa, onu kullanmalı
- Dropdown'dan seçim yapıldığında, değer manuel input'a da kopyalanmalı

---

## 5. Önerilen Düzeltmeler

### Düzeltme 1: Ana Adres Sokak Bilgisi Real-time Güncelleme

```javascript
// mainAddr_sokak_manual input'una event listener ekle
sokakManualEl.addEventListener('input', () => {
  if (mainAddressEditMode) {
    // Düzenleme modunda adres görüntüleme alanını güncelle
    updateAddressPreview();
  }
});

function updateAddressPreview() {
  const sokak = sokakManualEl.value.trim();
  const cadde = document.getElementById('mainAddr_cadde')?.value || '';
  const kapiNo = document.getElementById('mainAddr_kapi')?.value || '';
  // ... diğer alanlar
  
  // Adres önizlemesini güncelle (sadece düzenleme modunda)
  // Not: Bu sadece görsel geri bildirim için, kaydetme işlemi ayrı
}
```

### Düzeltme 2: İlave Adresler Sokak Manuel Input Her Zaman Görünür

```javascript
// addAddressRow fonksiyonunda
const sokManual = row.querySelector('.addr-sokak-manual');
if (sokManual) {
  sokManual.style.display = '';  // Her zaman görünür
  sokManual.setAttribute('required', 'required');  // Zorunlu
}
```

### Düzeltme 3: İlave Adresler Kaydetme Fonksiyonu Düzeltmesi

```javascript
// getAdditionalAddresses fonksiyonunda
const sokakManualText = sokManual?.value?.trim() || '';  // Gizli olsa bile oku
const sokakSelText = sokSel ? getSokakText(sokSel) : '';
const sokak = sokakManualText || sokakSelText;  // Önce manuel input'u kontrol et
```

---

## 6. Test Senaryoları

### Senaryo 1: Ana Adres Sokak Bilgisi Girişi
1. Ayarlar → Adres Yönetimi → Ana Adres → Düzenle
2. İl, İlçe seç
3. Sokak alanına "Test Sokak" yaz
4. **Beklenen:** Alttaki adres önizleme alanına sokak bilgisi yansımalı
5. **Gerçek:** Sokak bilgisi yansımıyor (sadece kaydetme sonrası görünüyor)

### Senaryo 2: İlave Adres Sokak Bilgisi Girişi
1. Ayarlar → Adres Yönetimi → İlave Adresler → Yeni Adres Ekle
2. İl, İlçe seç
3. **Mahalle seçilmeden** sokak manuel input'una yaz
4. **Beklenen:** 
   - Sokak manuel input görünür olmalı
   - Sokak bilgisi yazıldığında "Oluşturulan Adres" textarea'sına yansımalı
5. **Gerçek:** 
   - Sokak manuel input başlangıçta gizli
   - Yazılan bilgi textarea'ya yansımıyor

### Senaryo 3: İlave Adres Kaydetme
1. İlave adres ekle
2. Sokak bilgisini manuel input'a yaz (dropdown kullanmadan)
3. Kaydet
4. **Beklenen:** Sokak bilgisi Firestore'a kaydedilmeli
5. **Gerçek:** Sokak bilgisi kaydedilmiyor (eğer input gizliyse)

---

## 7. Konsol Hataları

Console'da görülen hatalar:

1. **404 Hatası - Sokak JSON Dosyaları:**
   ```
   GET http://localhost:5173/assets/sokak/BOLU_GEREDE_mah-DAYIOGLU.json 404 (Not Found)
   GET http://localhost:5173/assets/sokak/ADANA_CUKUROVA_mah-BOZCALAR.json 404 (Not Found)
   ```
   - Bu hatalar normal (sokak JSON dosyası olmayabilir)
   - Sistem sessizce handle ediyor, ancak kullanıcı sokak bilgisini manuel yazmalı

2. **Google Maps Map ID Uyarısı:**
   ```
   The map is initialized without a valid Map ID, which will prevent use of Advanced Markers.
   ```
   - Bu uyarı kritik değil, harita çalışmaya devam eder
   - Ancak AdvancedMarkerElement kullanılamaz (eski Marker kullanılır)

---

## 8. Kod Referansları

### Ana Dosya
- `settings.html` - Adres yönetimi sayfası ve tüm JavaScript kodları

### Önemli Fonksiyonlar
- `loadAddressesPage()` - Sayfa yükleme
- `displayMainAddress(userData)` - Ana adres göster/düzenle
- `initMainAddressFields(userData)` - Ana adres form alanlarını başlat
- `saveMainAddress()` - Ana adres kaydet
- `loadAdditionalAddressesForManagement(userData)` - İlave adresleri yükle
- `addAddress()` - Yeni ilave adres ekle
- `addAddressRow({title, content, isSaved})` - Adres satırı oluştur
- `getAdditionalAddresses()` - İlave adresleri topla ve kaydet
- `__loadStreets(il, ilce, mahalle)` - Sokak JSON dosyasını yükle
- `compose()` - Adres string'ini oluştur (ilave adresler için)

### Önemli HTML Element ID'leri
- `mainAddressDisplay` - Ana adres görüntüleme alanı
- `mainAddr_sokak_manual` - Ana adres sokak manuel input
- `mainAddr_sokak` - Ana adres sokak dropdown
- `additionalAddresses` - İlave adresler container
- `addr-sokak-manual` - İlave adres sokak manuel input (class)
- `addr-sokak` - İlave adres sokak dropdown (class)
- `addr-composed` - İlave adres oluşturulan adres textarea (class)

---

## 9. Vergi Dairesi Sistemi

### Genel Bakış

Teklifbul'da vergi dairesi yönetimi **iki farklı sayfada** kullanılıyor:
1. **Genel Ayarlar Sayfası** - `taxOfficeSelect` ve `taxOffice` input'ları
2. **Ana Adres Düzenleme Sayfası** - `mainAddr_taxOfficeSelect` ve `mainAddr_taxOffice` input'ları

Her iki sistem de **il seçimine göre otomatik filtreleme** yapar ve Firestore'dan veya yerel listeden (`LOCAL_TAX_OFFICES`) vergi dairelerini yükler.

### Veri Yapısı

Vergi dairesi bilgisi Firestore'da şu şekilde saklanır:

```javascript
{
  taxOffice: "Beykoz Vergi Dairesi"  // String olarak saklanır
}
```

### Veri Kaynakları

1. **Firestore** (`taxOffices` koleksiyonu):
   - `fetchTaxOfficesFromFirestore()` fonksiyonu ile yüklenir
   - Eğer Firestore'dan veri alınamazsa, yerel liste kullanılır

2. **Yerel Liste** (`LOCAL_TAX_OFFICES`):
   - İstanbul, Ankara, İzmir ve genel vergi daireleri
   - Örnek: "Beykoz Vergi Dairesi", "Çankaya Vergi Dairesi", "Kurumlar Vergi Dairesi"

### Sistem 1: Genel Ayarlar Sayfası Vergi Dairesi

**HTML Elementleri:**
- `taxOfficeSelect` - Dropdown select (ID)
- `taxOffice` - Text input (ID)
- `refreshTaxOfficesBtn` - Yenile butonu (ID)

**Fonksiyonlar:**
- `buildTaxOfficeSelect()` - Dropdown'u doldurur
- `populateTaxOfficeSelect(list)` - Dropdown'u populate eder
- `bindTaxOfficeHandlers()` - Event listener'ları bağlar
- `fetchTaxOfficesFromFirestore()` - Firestore'dan veri çeker

**Çalışma Mantığı:**

1. **İlk Yükleme:**
   ```javascript
   await buildTaxOfficeSelect();  // Firestore'dan yükle, yoksa yerel liste
   bindTaxOfficeHandlers();  // Event listener'ları bağla
   ```

2. **İl Seçimine Göre Filtreleme:**
   ```javascript
   selIl.addEventListener('change', async () => {
     const selectedIl = pickTextOrValue(selIl);
     if (selectedIl) {
       // Firestore'dan veya yerel listeden vergi dairelerini al
       let taxOfficesList = await fetchTaxOfficesFromFirestore();
       if (!taxOfficesList || taxOfficesList.length === 0) {
         taxOfficesList = LOCAL_TAX_OFFICES;
       }
       
       // İl'e göre filtrele
       const provinceNorm = __trNorm(selectedIl);
       const filtered = taxOfficesList.filter(office => {
         const officeNorm = __trNorm(office);
         return officeNorm.includes(provinceNorm) || officeNorm.includes(provinceNorm.split(' ')[0]);
       });
       
       // Dropdown'u güncelle
       taxOfficeSelect.innerHTML = '<option value="">Vergi dairesi seçin</option><option value="custom">Elle yaz</option>';
       filtered.forEach(office => {
         const option = document.createElement('option');
         option.value = office;
         option.textContent = office;
         taxOfficeSelect.appendChild(option);
       });
       
       // Eğer hiç vergi dairesi bulunamazsa tüm listeyi göster
       if (filtered.length === 0) {
         taxOfficesList.forEach(office => {
           // Tüm listeyi ekle
         });
       }
     }
   });
   ```

3. **Dropdown Seçimi:**
   ```javascript
   taxOfficeSelect.addEventListener('change', () => {
     if (sel.value === '__MANUAL__' || sel.value === '') {
       // Elle yazma modu
       inp.removeAttribute('disabled');
       inp.placeholder = 'Vergi dairesi adını elle yazın';
       if (sel.value === '__MANUAL__') inp.value = '';
     } else {
       // Seçilen vergi dairesi
       inp.value = sel.value;
       inp.setAttribute('disabled', 'disabled');
       inp.placeholder = 'Seçilen vergi dairesi';
     }
   });
   ```

**Sorun:** İl seçimine göre filtreleme yapılıyor, ancak dropdown'daki `custom` değeri ile `__MANUAL__` değeri arasında tutarsızlık var:
- Genel Ayarlar'da: `__MANUAL__` kullanılıyor
- Ana Adres'te: `custom` kullanılıyor

### Sistem 2: Ana Adres Düzenleme Sayfası Vergi Dairesi

**HTML Elementleri:**
- `mainAddr_taxOfficeSelect` - Dropdown select (ID)
- `mainAddr_taxOffice` - Text input (ID)
- `mainAddr_refreshTaxOfficesBtn` - Yenile butonu (ID)

**Fonksiyonlar:**
- `initMainTaxOfficeSystem()` - Vergi dairesi sistemini başlatır
- `updateTaxOfficesByProvince(provinceName)` - İl'e göre filtreler ve günceller
- `fetchTaxOfficesFromFirestore()` - Firestore'dan veri çeker

**Çalışma Mantığı:**

1. **İlk Yükleme:**
   ```javascript
   await initMainTaxOfficeSystem();
   // İl seçilmişse vergi dairelerini filtrele
   const selectedIl = pickTextOrValue(ilSel);
   if (selectedIl) {
     await updateTaxOfficesByProvince(selectedIl);
   }
   ```

2. **İl Seçimine Göre Filtreleme:**
   ```javascript
   ilSel.addEventListener('change', async () => {
     const selectedIl = pickTextOrValue(ilSel);
     if (selectedIl) {
       await updateTaxOfficesByProvince(selectedIl);
     }
   });
   ```

3. **Filtreleme Fonksiyonu:**
   ```javascript
   async function updateTaxOfficesByProvince(provinceName) {
     const taxOfficeSelect = document.getElementById('mainAddr_taxOfficeSelect');
     if (!taxOfficeSelect) return;
     
     // Firestore'dan veya yerel listeden vergi dairelerini al
     let taxOfficesList = await fetchTaxOfficesFromFirestore();
     if (!taxOfficesList || taxOfficesList.length === 0) {
       taxOfficesList = LOCAL_TAX_OFFICES;
     }
     
     // İl'e göre filtrele
     const provinceNorm = __trNorm(provinceName);
     const filtered = taxOfficesList.filter(office => {
       const officeNorm = __trNorm(office);
       return officeNorm.includes(provinceNorm) || officeNorm.includes(provinceNorm.split(' ')[0]);
     });
     
     // Dropdown'u güncelle
     taxOfficeSelect.innerHTML = '<option value="">Vergi dairesi seçin</option><option value="custom">Elle yaz</option>';
     filtered.forEach(office => {
       const option = document.createElement('option');
       option.value = office;
       option.textContent = office;
       taxOfficeSelect.appendChild(option);
     });
     
     // Eğer hiç vergi dairesi bulunamazsa tüm listeyi göster
     if (filtered.length === 0) {
       taxOfficesList.forEach(office => {
         const option = document.createElement('option');
         option.value = office;
         option.textContent = office;
         taxOfficeSelect.appendChild(option);
       });
     }
   }
   ```

4. **Dropdown Seçimi:**
   ```javascript
   taxOfficeSelect.addEventListener('change', (e) => {
     if (e.target.value === 'custom') {
       // Elle yazma modu
       taxOfficeInput.style.display = '';
       taxOfficeInput.value = '';
       taxOfficeInput.focus();
     } else if (e.target.value && e.target.value !== '') {
       // Seçilen vergi dairesi
       taxOfficeInput.value = e.target.value;
     }
   });
   ```

**Sorun 1:** İl seçildiğinde vergi dairesi listesi güncelleniyor, ancak **mevcut seçili değer korunmuyor**. Eğer kullanıcı önceden bir vergi dairesi seçmişse, il değiştiğinde bu değer kayboluyor.

**Sorun 2:** `updateTaxOfficesByProvince` fonksiyonu çağrıldığında, dropdown içeriği tamamen yeniden oluşturuluyor. Ancak **mevcut input değeri korunmuyor** ve kullanıcının seçtiği vergi dairesi kaybolabilir.

**Sorun 3:** İl seçimi yapılmadan önce vergi dairesi listesi yüklenmiyor. Kullanıcı il seçmeden vergi dairesi seçmeye çalışırsa, liste boş görünebilir.

### Filtreleme Mantığı

Vergi dairesi filtresi şu şekilde çalışır:

```javascript
const provinceNorm = __trNorm(provinceName);  // "istanbul" → "istanbul"
const filtered = taxOfficesList.filter(office => {
  const officeNorm = __trNorm(office);  // "Beykoz Vergi Dairesi" → "beykoz vergi daireleri"
  return officeNorm.includes(provinceNorm) || officeNorm.includes(provinceNorm.split(' ')[0]);
});
```

**Örnek:**
- İl: "İstanbul" → `provinceNorm = "istanbul"`
- Vergi Dairesi: "Beykoz Vergi Dairesi" → `officeNorm = "beykoz vergi daireleri"`
- Kontrol: `"beykoz vergi daireleri".includes("istanbul")` → `false`

**Sorun:** İl adı ile vergi dairesi adı arasında eşleşme yapılamıyor çünkü:
- "Beykoz Vergi Dairesi" → "Beykoz" içerir, "İstanbul" içermez
- Filtreleme mantığı yanlış: İl adı ile vergi dairesi adını karşılaştırmak yerine, **ilçe adı** ile karşılaştırmalı

### Yenile Butonu

Her iki sistemde de "Yenile" butonu var:

**Genel Ayarlar:**
```javascript
refreshTaxOfficesBtn.addEventListener('click', async () => {
  await buildTaxOfficeSelect();  // Firestore'dan yeniden yükle
});
```

**Ana Adres:**
```javascript
mainAddr_refreshTaxOfficesBtn.addEventListener('click', async () => {
  // Firestore'dan yeniden yükle
  let taxOfficesList = await fetchTaxOfficesFromFirestore();
  if (!taxOfficesList || taxOfficesList.length === 0) {
    taxOfficesList = LOCAL_TAX_OFFICES;
  }
  
  // İl seçimine göre güncelle
  const selectedIl = pickTextOrValue(ilSel);
  if (selectedIl) {
    await updateTaxOfficesByProvince(selectedIl);
  } else {
    // İl seçilmemişse tüm listeyi göster
    taxOfficeSelect.innerHTML = '<option value="">Vergi dairesi seçin</option><option value="custom">Elle yaz</option>';
    taxOfficesList.forEach(office => {
      // Tüm listeyi ekle
    });
  }
});
```

### Tespit Edilen Sorunlar (Vergi Dairesi)

#### Sorun 1: İl Seçimine Göre Filtreleme Çalışmıyor

**Neden:**
- Filtreleme mantığı yanlış: İl adı ("İstanbul") ile vergi dairesi adı ("Beykoz Vergi Dairesi") karşılaştırılıyor
- "Beykoz Vergi Dairesi" içinde "İstanbul" kelimesi yok, bu yüzden filtrelenmiyor
- Doğru mantık: İlçe adı ("Beykoz") ile vergi dairesi adını karşılaştırmalı

**Çözüm Önerisi:**
```javascript
// İlçe adına göre filtreleme yapılmalı
const ilceSel = document.getElementById('mainAddr_ilce');
const selectedIlce = pickTextOrValue(ilceSel);
if (selectedIlce) {
  const ilceNorm = __trNorm(selectedIlce);
  const filtered = taxOfficesList.filter(office => {
    const officeNorm = __trNorm(office);
    return officeNorm.includes(ilceNorm);
  });
}
```

#### Sorun 2: Mevcut Seçili Değer Korunmuyor

**Neden:**
- İl veya ilçe değiştiğinde, `taxOfficeSelect.innerHTML = ''` ile dropdown temizleniyor
- Mevcut input değeri (`taxOfficeInput.value`) korunmuyor
- Kullanıcının seçtiği vergi dairesi kayboluyor

**Çözüm Önerisi:**
```javascript
// Mevcut değeri sakla
const currentValue = taxOfficeInput.value;

// Dropdown'u güncelle
taxOfficeSelect.innerHTML = '...';

// Eğer mevcut değer yeni listede varsa, seç
if (currentValue && filtered.includes(currentValue)) {
  taxOfficeSelect.value = currentValue;
  taxOfficeInput.value = currentValue;
}
```

#### Sorun 3: İl Seçilmeden Vergi Dairesi Listesi Boş

**Neden:**
- İlk yüklemede vergi dairesi listesi yüklenmiyor
- Sadece il seçildiğinde liste yükleniyor
- Kullanıcı il seçmeden vergi dairesi seçmeye çalışırsa, liste boş görünüyor

**Çözüm Önerisi:**
```javascript
// İlk yüklemede tüm listeyi göster
async function initMainTaxOfficeSystem() {
  // İl seçilmemişse tüm listeyi göster
  if (!selectedIl) {
    taxOfficeSelect.innerHTML = '<option value="">Vergi dairesi seçin</option><option value="custom">Elle yaz</option>';
    taxOfficesList.forEach(office => {
      // Tüm listeyi ekle
    });
  }
}
```

#### Sorun 4: Elle Yazma Modu Tutarsızlığı

**Neden:**
- Genel Ayarlar'da: `__MANUAL__` değeri kullanılıyor
- Ana Adres'te: `custom` değeri kullanılıyor
- Bu tutarsızlık karışıklığa neden olabilir

**Çözüm Önerisi:**
- Her iki sistemde de aynı değeri kullan: `custom` veya `__MANUAL__`
- Tercihen `custom` kullanılmalı (daha açıklayıcı)

### Önerilen Düzeltmeler (Vergi Dairesi)

#### Düzeltme 1: İlçe Bazlı Filtreleme

```javascript
async function updateTaxOfficesByProvince(provinceName, districtName = null) {
  const taxOfficeSelect = document.getElementById('mainAddr_taxOfficeSelect');
  if (!taxOfficeSelect) return;
  
  let taxOfficesList = await fetchTaxOfficesFromFirestore();
  if (!taxOfficesList || taxOfficesList.length === 0) {
    taxOfficesList = LOCAL_TAX_OFFICES;
  }
  
  // Mevcut değeri sakla
  const currentValue = document.getElementById('mainAddr_taxOffice')?.value || '';
  
  let filtered = [];
  
  // Önce ilçe bazlı filtreleme yap
  if (districtName) {
    const districtNorm = __trNorm(districtName);
    filtered = taxOfficesList.filter(office => {
      const officeNorm = __trNorm(office);
      return officeNorm.includes(districtNorm);
    });
  }
  
  // İlçe bazlı filtreleme sonuç vermezse, il bazlı filtreleme yap
  if (filtered.length === 0 && provinceName) {
    const provinceNorm = __trNorm(provinceName);
    filtered = taxOfficesList.filter(office => {
      const officeNorm = __trNorm(office);
      return officeNorm.includes(provinceNorm);
    });
  }
  
  // Dropdown'u güncelle
  taxOfficeSelect.innerHTML = '<option value="">Vergi dairesi seçin</option><option value="custom">Elle yaz</option>';
  filtered.forEach(office => {
    const option = document.createElement('option');
    option.value = office;
    option.textContent = office;
    if (office === currentValue) option.selected = true;  // Mevcut değeri koru
    taxOfficeSelect.appendChild(option);
  });
  
  // Eğer hiç vergi dairesi bulunamazsa tüm listeyi göster
  if (filtered.length === 0) {
    taxOfficesList.forEach(office => {
      const option = document.createElement('option');
      option.value = office;
      option.textContent = office;
      if (office === currentValue) option.selected = true;  // Mevcut değeri koru
      taxOfficeSelect.appendChild(option);
    });
  }
  
  // Mevcut değeri input'a geri yükle
  if (currentValue && filtered.includes(currentValue)) {
    document.getElementById('mainAddr_taxOffice').value = currentValue;
  }
}
```

#### Düzeltme 2: İlk Yüklemede Tüm Liste Göster

```javascript
async function initMainTaxOfficeSystem() {
  // İlk yüklemede tüm listeyi göster
  let taxOfficesList = await fetchTaxOfficesFromFirestore();
  if (!taxOfficesList || taxOfficesList.length === 0) {
    taxOfficesList = LOCAL_TAX_OFFICES;
  }
  
  const taxOfficeSelect = document.getElementById('mainAddr_taxOfficeSelect');
  if (taxOfficeSelect) {
    taxOfficeSelect.innerHTML = '<option value="">Vergi dairesi seçin</option><option value="custom">Elle yaz</option>';
    taxOfficesList.forEach(office => {
      const option = document.createElement('option');
      option.value = office;
      option.textContent = office;
      taxOfficeSelect.appendChild(option);
    });
  }
  
  // İl seçilmişse filtrele
  const ilSel = document.getElementById('mainAddr_il');
  const ilceSel = document.getElementById('mainAddr_ilce');
  if (ilSel && ilceSel) {
    const selectedIl = pickTextOrValue(ilSel);
    const selectedIlce = pickTextOrValue(ilceSel);
    if (selectedIl && selectedIlce) {
      await updateTaxOfficesByProvince(selectedIl, selectedIlce);
    }
  }
}
```

---

## Sonuç

Ana sorunlar:
1. **Sokak bilgisi girildiğinde alttaki adres alanına real-time yansımıyor** (ana adres)
2. **İlave adreslerde sokak manuel input başlangıçta gizli** ve event listener'lar çalışmıyor
3. **Kaydetme sırasında gizli input'un değeri okunmuyor** (ilave adresler)
4. **Vergi dairesi filtresi yanlış çalışıyor** (il adı yerine ilçe adı kullanılmalı)
5. **Vergi dairesi seçili değeri korunmuyor** (il/ilçe değiştiğinde kayboluyor)
6. **İl seçilmeden vergi dairesi listesi boş** (ilk yüklemede tüm liste gösterilmeli)

Bu sorunları çözmek için yukarıdaki önerilen düzeltmeleri uygulayın.

