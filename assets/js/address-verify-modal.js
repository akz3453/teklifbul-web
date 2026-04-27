/**
 * Adres Doğrulama Modal Bileşeni
 * Teklifbul Rule v1.0 - OpenStreetMap (Leaflet.js) + Nominatim Geocoding
 */

import { logger } from '../../src/shared/log/logger.js';

/**
 * Nominatim Geocoding (OpenStreetMap)
 */
async function geocodeAddress(address) {
  try {
    // Cache kontrolü
    // Adres temizliği (Placeholderları ve gereksiz etiketleri kaldır)
    // Örnek input: "Yavuz Selim Mahalle - dutdere Cadde - cömert Sokak - Kartal - İl: İstanbul - Posta Kodu: 34830 - Türkiye"
    // Örnek input 2: "Yavuz Selim Mahalle - dutdere Cadde - cömert Sokak…ykoz - İl: İstanbul - Posta Kodu: 34830 - Türkiye" (Truncated)

    // Adres temizleme adımları
    let cleanAddress = address
      // Ellipsis karakterini ve çevresini temizle (…ykoz gibi bozuk kısımları at)
      .replace(/…\w*/gu, '')
      .replace(/\.\.\.\w*/g, '')
      // Placeholder ve seçiniz ifadelerini temizle
      .replace(/Sokak\/Cadde seçin[^-]*/gi, '')
      .replace(/seçiniz/gi, '')
      // "İl: İstanbul" -> "İstanbul" formatını temizle
      .replace(/İl:\s*/gi, '')
      .replace(/İlçe:\s*/gi, '')
      // Posta kodu ve diğer etiketleri temizle
      .replace(/Posta Kodu:\s*/gi, '')
      .replace(/Kapı No:\s*/gi, '')
      .replace(/Daire:\s*/gi, '')
      // Mahalle, Cadde, Sokak eklerini temizle (Sadece ismi bırak, Nominatim bazen ekleri sevmez)
      .replace(/\s+(Mahalle|Mahallesi|Mah\.|Mah)\b/gi, '')
      .replace(/\s+(Cadde|Caddesi|Cad\.|Cad)\b/gi, '')
      .replace(/\s+(Sokak|Sokağı|Sok\.|Sok)\b/gi, '')
      .replace(/\s+(Bulvar|Bulvarı|Blv\.|Blv)\b/gi, '')
      // Tireleri virgüle çevir
      .replace(/\s+-\s+/g, ', ')
      .replace(/\s-\s/g, ', ')
      // Son temizlik: Çoklu virgüller, boşluklar
      .replace(/,\s*,/g, ',')
      .replace(/\s+/g, ' ')
      .replace(/,\s+,/g, ',')
      .trim();

    // Temizlenmiş adresi logla (Debug için kritik)
    logger.info('Geocode clean address:', { original: address, cleaned: cleanAddress });

    // Eğer temizlik sonrası çok kısa kaldıysa orijinali kullan (fallback)
    if (cleanAddress.length < 5) {
      logger.warn('Adres temizlik sonrası çok kısaldı, orijinal kullanılıyor', { cleaned: cleanAddress });
      cleanAddress = address;
    }

    const cacheKey = `geocode:${encodeURIComponent(cleanAddress)}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Rate limiting için bekle (1 saniye)
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Nominatim API çağrısı
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanAddress)}&limit=1&countrycodes=tr`,
      {
        headers: {
          'User-Agent': 'Teklifbul/1.0' // Nominatim policy gereği
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Geocoding failed: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.length === 0) {
      return null;
    }

    const result = {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      display_name: data[0].display_name,
      formatted_address: data[0].display_name
    };

    // Cache'e kaydet
    sessionStorage.setItem(cacheKey, JSON.stringify(result));

    return result;
  } catch (error) {
    logger.error('Geocoding error', error);
    return null;
  }
}

/**
 * Reverse Geocoding (Koordinattan adres)
 */
async function reverseGeocode(lat, lng) {
  try {
    // Rate limiting için bekle (1 saniye)
    await new Promise(resolve => setTimeout(resolve, 1000));

    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=tr`,
      {
        headers: {
          'User-Agent': 'Teklifbul/1.0'
        }
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.display_name || null;
  } catch (error) {
    logger.error('Reverse geocoding error', error);
    return null;
  }
}

/**
 * Leaflet.js yükleme
 */
function loadLeaflet() {
  return new Promise((resolve, reject) => {
    if (window.L) {
      resolve(window.L);
      return;
    }

    // CSS zaten yüklü olmalı (HTML'de)

    // JS yükle
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => {
      if (window.L) {
        resolve(window.L);
      } else {
        reject(new Error('Leaflet.js yüklenemedi'));
      }
    };
    script.onerror = () => reject(new Error('Leaflet.js script yüklenemedi'));
    document.head.appendChild(script);
  });
}

/**
 * Adres doğrulama modalını oluşturur ve gösterir
 * @param {Object} options
 * @param {string} options.defaultAddress - Varsayılan adres
 * @param {Function} options.onConfirm - Onaylandığında çağrılır: (result) => { address, lat, lng }
 * @param {Function} options.onCancel - İptal edildiğinde çağrılır: () => {}
 */
export async function showAddressVerifyModal({ defaultAddress = '', onConfirm, onCancel }) {
  // Modal container oluştur
  const modalOverlay = document.createElement('div');
  modalOverlay.id = 'addressVerifyModal';
  modalOverlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 10000;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  `;

  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background: white;
    width: 100%;
    max-width: 800px;
    border-radius: 16px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    max-height: 90vh;
  `;

  // Header
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 20px;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: space-between;
  `;
  header.innerHTML = `
    <h3 style="margin:0; font-size:18px; font-weight:600; color:#1f2937;">📍 Harita ile Adres Doğrulama</h3>
    <button id="closeAddressModal" style="background:none; border:none; font-size:24px; cursor:pointer; color:#6b7280; padding:0; width:32px; height:32px; display:flex; align-items:center; justify-content:center;">&times;</button>
  `;

  // Body
  const body = document.createElement('div');
  body.style.cssText = `
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    flex: 1;
    overflow-y: auto;
  `;

  // Adres input
  const inputContainer = document.createElement('div');
  inputContainer.style.cssText = `
    display: flex;
    gap: 12px;
    align-items: center;
  `;

  const addressInput = document.createElement('input');
  addressInput.id = 'addressVerifyInput';
  addressInput.type = 'text';
  addressInput.placeholder = 'Adres yazın (örn: Bağdat Caddesi 123, Kadıköy, İstanbul)';
  addressInput.value = defaultAddress;
  addressInput.style.cssText = `
    flex: 1;
    min-width: 0; /* Flex item taşmasını önle */
    padding: 12px 16px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    font-size: 15px; /* Okunabilirlik için büyütüldü */
    color: #1f2937;
    background: #fff;
    transition: all 0.2s;
    height: 48px; /* Sabit yükseklik */
    box-sizing: border-box;
  `;

  // Focus efekti ekle
  addressInput.addEventListener('focus', () => {
    addressInput.style.borderColor = '#3b82f6';
    addressInput.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
  });
  addressInput.addEventListener('blur', () => {
    addressInput.style.borderColor = '#e5e7eb';
    addressInput.style.boxShadow = 'none';
  });

  const searchBtn = document.createElement('button');
  searchBtn.textContent = '🔍 Ara';
  searchBtn.style.cssText = `
    padding: 0 6px;
    height: 45px;
    width: 72px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 4px;
    font-weight: 500;
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  `;

  inputContainer.appendChild(addressInput);
  inputContainer.appendChild(searchBtn);

  // Map container
  const mapContainer = document.createElement('div');
  mapContainer.id = 'addressVerifyMap';
  mapContainer.style.cssText = `
    width: 100%;
    height: 400px;
    border-radius: 8px;
    border: 2px solid #e5e7eb;
    background: #f3f4f6;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7280;
  `;
  mapContainer.innerHTML = '<p>Harita yükleniyor...</p>';

  body.appendChild(inputContainer);
  body.appendChild(mapContainer);

  // Footer
  const footer = document.createElement('div');
  footer.style.cssText = `
    padding: 20px;
    border-top: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  `;

  const infoDiv = document.createElement('div');
  infoDiv.id = 'addressVerifyInfo';
  infoDiv.style.cssText = `
    flex: 1;
    font-size: 13px;
    color: #6b7280;
    line-height: 1.6;
  `;
  infoDiv.innerHTML = 'Adres yazın ve ara butonuna tıklayın veya haritadan bir nokta tıklayın.';

  const confirmBtn = document.createElement('button');
  confirmBtn.id = 'addressVerifyConfirm';
  confirmBtn.textContent = 'Onayla';
  confirmBtn.disabled = true;
  confirmBtn.style.cssText = `
    padding: 12px 24px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
    font-size: 14px;
    width: 248px;
  `;

  footer.appendChild(infoDiv);
  footer.appendChild(confirmBtn);

  modalContent.appendChild(header);
  modalContent.appendChild(body);
  modalContent.appendChild(footer);
  modalOverlay.appendChild(modalContent);
  document.body.appendChild(modalOverlay);

  // Seçili adres bilgisi
  let selectedAddress = null;
  let map = null;
  let marker = null;
  let L = null;

  // Leaflet.js yükleme ve harita başlatma
  try {
    L = await loadLeaflet();
    logger.info('Leaflet.js yüklendi');

    // Teklifbul Rule v1.0 - Harita container'ının varlığını ve hazır olduğunu kontrol et
    const mapContainer = document.getElementById('addressVerifyMap');
    if (!mapContainer) {
      logger.error('Harita container elementi bulunamadı');
      throw new Error('Harita container elementi bulunamadı');
    }

    // Container'ın görünür ve boyutlandırılmış olduğundan emin ol
    if (mapContainer.offsetWidth === 0 || mapContainer.offsetHeight === 0) {
      logger.warn('Harita container henüz görünür değil, kısa bir süre bekleniyor...');
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Harita oluştur (scrollWheelZoom'u devre dışı bırak - hata önleme)
    map = L.map('addressVerifyMap', {
      scrollWheelZoom: false, // Teklifbul Rule v1.0 - Scroll wheel zoom hatası önleme
      zoomControl: true,
      attributionControl: true
    }).setView([39.9255, 32.8663], 6); // Türkiye merkezi

    // Harita tamamen yüklendikten sonra scrollWheelZoom'u etkinleştir
    map.whenReady(() => {
      try {
        map.scrollWheelZoom.enable();
        logger.info('Harita hazır, scrollWheelZoom etkinleştirildi');
      } catch (e) {
        logger.warn('scrollWheelZoom etkinleştirilemedi (devam ediliyor)', e);
      }
    });

    // OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    // Marker oluştur (başlangıçta gizli)
    marker = L.marker([0, 0], { draggable: true }).addTo(map);
    marker.setOpacity(0);

    // Marker sürüklendiğinde
    marker.on('dragend', async function (e) {
      const position = marker.getLatLng();
      const address = await reverseGeocode(position.lat, position.lng);

      if (address) {
        selectedAddress = {
          address: address,
          lat: position.lat,
          lng: position.lng,
        };
        addressInput.value = address;
        updateInfo();
        confirmBtn.disabled = false;
      }
    });

    // Harita tıklama
    map.on('click', async function (e) {
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;

      marker.setLatLng([lat, lng]);
      marker.setOpacity(1);

      const address = await reverseGeocode(lat, lng);
      const displayAddress = address || `Konum (${lat.toFixed(6)}, ${lng.toFixed(6)})`;

      selectedAddress = {
        address: displayAddress,
        lat: lat,
        lng: lng,
      };

      addressInput.value = displayAddress;
      updateInfo();
      confirmBtn.disabled = false;
    });

    // Varsayılan adres varsa geocode et
    if (defaultAddress) {
      logger.info('Geocode başlatılıyor', { address: defaultAddress });
      const result = await geocodeAddress(defaultAddress);

      if (result) {
        map.setView([result.lat, result.lng], 16);
        marker.setLatLng([result.lat, result.lng]);
        marker.setOpacity(1);
        marker.bindPopup(`<strong>${defaultAddress}</strong><br>${result.display_name}`).openPopup();

        selectedAddress = {
          address: result.formatted_address || defaultAddress,
          lat: result.lat,
          lng: result.lng,
        };

        addressInput.value = result.formatted_address || defaultAddress;
        updateInfo();
        confirmBtn.disabled = false;

        logger.info('Adres doğrulandı (geocode)', {
          original: defaultAddress,
          formatted: result.formatted_address,
          lat: result.lat,
          lng: result.lng
        });
      } else {
        logger.warn('Geocode başarısız', { address: defaultAddress });
        addressInput.value = defaultAddress;
      }
    }

    function updateInfo() {
      if (selectedAddress) {
        infoDiv.innerHTML = `
          <div style="color:#10b981; font-weight:600; margin-bottom:4px;">✔ <b>${selectedAddress.address}</b></div>
          <div style="font-size:12px; color:#6b7280;">lat: ${selectedAddress.lat.toFixed(6)} · lng: ${selectedAddress.lng.toFixed(6)}</div>
        `;
      } else {
        infoDiv.innerHTML = 'Adres yazın ve ara butonuna tıklayın veya haritadan bir nokta tıklayın.';
      }
    }

    // Arama butonu
    searchBtn.addEventListener('click', async () => {
      const address = addressInput.value.trim();
      if (!address) return;

      searchBtn.disabled = true;
      searchBtn.textContent = '⏳ Aranıyor...';

      logger.info('Adres aranıyor', { address });
      const result = await geocodeAddress(address);

      if (result) {
        map.setView([result.lat, result.lng], 16);
        marker.setLatLng([result.lat, result.lng]);
        marker.setOpacity(1);
        marker.bindPopup(`<strong>${address}</strong><br>${result.display_name}`).openPopup();

        selectedAddress = {
          address: result.formatted_address || address,
          lat: result.lat,
          lng: result.lng,
        };

        addressInput.value = result.formatted_address || address;
        updateInfo();
        confirmBtn.disabled = false;
      } else {
        logger.warn('Adres bulunamadı', { address });
        infoDiv.innerHTML = `<div style="color:#ef4444;">❌ Adres bulunamadı. Haritadan bir nokta seçebilirsiniz.</div>`;
      }

      searchBtn.disabled = false;
      searchBtn.textContent = '🔍 Ara';
    });

    // Enter tuşu ile arama
    addressInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        searchBtn.click();
      }
    });

  } catch (err) {
    logger.error('Leaflet.js yükleme hatası', err);
    // Teklifbul Rule v1.0 - XSS koruma: err.message kontrol edilmeyen kaynak olabilir
    mapContainer.textContent = '';
    const p = document.createElement('p');
    p.style.color = '#ef4444';
    p.textContent = `❌ Harita yüklenemedi: ${err?.message || 'Bilinmeyen hata'}`;
    mapContainer.appendChild(p);
  }

  // Event listeners
  const closeBtn = document.getElementById('closeAddressModal');
  closeBtn.addEventListener('click', () => {
    if (map) {
      map.remove();
    }
    if (onCancel) onCancel();
    document.body.removeChild(modalOverlay);
  });

  confirmBtn.addEventListener('click', () => {
    if (selectedAddress && onConfirm) {
      if (map) {
        map.remove();
      }
      onConfirm(selectedAddress);
      document.body.removeChild(modalOverlay);
    }
  });

  // ESC tuşu ile kapatma
  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      if (map) {
        map.remove();
      }
      if (onCancel) onCancel();
      document.body.removeChild(modalOverlay);
      document.removeEventListener('keydown', handleEsc);
    }
  };
  document.addEventListener('keydown', handleEsc);

  // Overlay tıklama ile kapatma
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      if (map) {
        map.remove();
      }
      if (onCancel) onCancel();
      document.body.removeChild(modalOverlay);
      document.removeEventListener('keydown', handleEsc);
    }
  });
}
