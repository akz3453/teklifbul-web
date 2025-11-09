# Performans Optimizasyonu - Teklifbul Rule v1.0

## Sorun
- Çok fazla Firestore channel request'i (Network tab'da görünen)
- `firebase.js` dosyası her sayfada yükleniyor (22.1 kB)
- Listener'lar temizlenmiyor, sayfa değişimlerinde birikiyor

## Çözümler

### 1. Listener Manager Sistemi
- `assets/js/firebase/listener-manager.js` eklendi
- Tüm listener'lar merkezi olarak yönetiliyor
- Sayfa unload'da otomatik cleanup

### 2. Header.js Optimizasyonu
- Auth listener hemen cleanup ediliyor
- 5 saniye sonra safety cleanup

### 3. Company Join Waiting Optimizasyonu
- Listener register ediliyor
- Page unload'da cleanup

## Kullanım

### Listener Kaydetme
```javascript
import { registerListener, cleanupAllListeners } from "./assets/js/firebase/listener-manager.js";

const unsubscribe = onSnapshot(doc(db, 'collection', 'id'), (snap) => {
  // ...
});

registerListener('unique-id', unsubscribe);
```

### Manuel Cleanup
```javascript
import { unregisterListener } from "./assets/js/firebase/listener-manager.js";

unregisterListener('unique-id');
```

### Debugging
```javascript
// Konsolda aktif listener sayısını görmek için:
window.__listenerManager.getCount()

// Tüm listener'ları listelemek için:
window.__listenerManager.list()

// Tüm listener'ları temizlemek için:
window.__listenerManager.cleanup()
```

## Best Practices

1. **Her listener'ı register edin** - Otomatik cleanup için
2. **Sayfa değişimlerinde cleanup yapın** - beforeunload event'i
3. **Gereksiz listener'ları kaldırın** - Sadece ihtiyaç duyulan veriler için
4. **getDoc kullanın** - Tek seferlik veri için (onSnapshot yerine)
5. **watchAuth listener'larını cleanup edin** - onAuthStateChanged da bir listener

## Channel Request Nedir?

`/Listen/channel` request'i Firestore'un **real-time listener** bağlantısıdır. Her `onSnapshot()` çağrısı:
- Bir WebChannel connection açar
- Persistent bağlantı tutar (sürekli açık)
- Veri değişikliklerini real-time dinler

**Sorun**: 
- Her listener bir channel request oluşturur
- Sayfa değişimlerinde listener'lar kapanmazsa birikir
- Çok fazla channel request = performans sorunu

**Çözüm**:
- Listener'ları register edin (listener-manager.js ile)
- Sayfa unload'da cleanup yapın
- Gereksiz listener'ları kaldırın

## Performans Metrikleri

### Öncesi
- 30+ channel request
- 6.5 MB transfer
- 31.54 s load time

### Sonrası (Beklenen)
- 5-10 channel request
- 2-3 MB transfer
- 10-15 s load time

