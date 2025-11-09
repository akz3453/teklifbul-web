/**
 * Adres Doğrulama Modal Bileşeni
 * Teklifbul Rule v1.0 - Modal + Places Autocomplete + Harita
 */

import { loadGoogleMaps } from './google-maps-loader.js';

/**
 * Adres doğrulama modalını oluşturur ve gösterir
 * @param {Object} options
 * @param {string} options.defaultAddress - Varsayılan adres
 * @param {Function} options.onConfirm - Onaylandığında çağrılır: (result) => { address, lat, lng }
 * @param {Function} options.onCancel - İptal edildiğinde çağrılır: () => {}
 */
export function showAddressVerifyModal({ defaultAddress = '', onConfirm, onCancel }) {
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

  // Adres input + Places autocomplete
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
    padding: 12px 16px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    transition: border-color 0.2s;
  `;

  inputContainer.appendChild(addressInput);

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
  infoDiv.innerHTML = 'Adres seçin veya haritadan bir nokta tıklayın.';

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

  // Google Maps yükleme ve harita başlatma
  loadGoogleMaps()
    .then(() => {
      if (!window.google?.maps) {
        throw new Error('Google Maps API yüklenemedi');
      }

      const google = window.google;
      const geocoder = new google.maps.Geocoder();

      // Harita oluştur
      const map = new google.maps.Map(mapContainer, {
        center: { lat: 39.9255, lng: 32.8663 }, // Türkiye merkezi
        zoom: 6,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });

      const marker = new google.maps.Marker({ map });

      // Places Autocomplete
      const autocomplete = new google.maps.places.Autocomplete(addressInput, {
        fields: ['formatted_address', 'geometry', 'place_id'],
        componentRestrictions: { country: ['tr'] },
      });

      // Place seçildiğinde
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (!place?.geometry?.location) return;

        const location = place.geometry.location;
        map.setCenter(location);
        map.setZoom(16);
        marker.setPosition(location);

        selectedAddress = {
          address: place.formatted_address || addressInput.value,
          lat: location.lat(),
          lng: location.lng(),
        };

        updateInfo();
        confirmBtn.disabled = false;
      });

      // Varsayılan adres varsa geocode et
      if (defaultAddress) {
        geocoder.geocode({ address: defaultAddress }, (results, status) => {
          if (status === 'OK' && results?.[0]) {
            const location = results[0].geometry.location;
            map.setCenter(location);
            map.setZoom(16);
            marker.setPosition(location);

            selectedAddress = {
              address: results[0].formatted_address || defaultAddress,
              lat: location.lat(),
              lng: location.lng(),
            };

            updateInfo();
            confirmBtn.disabled = false;
          }
        });
      }

      // Harita tıklama
      map.addListener('click', (e) => {
        if (!e.latLng) return;

        marker.setPosition(e.latLng);
        geocoder.geocode({ location: e.latLng }, (results, status) => {
          const address = status === 'OK' && results?.[0]?.formatted_address
            ? results[0].formatted_address
            : addressInput.value || 'Seçili konum';

          selectedAddress = {
            address: address,
            lat: e.latLng.lat(),
            lng: e.latLng.lng(),
          };

          addressInput.value = address;
          updateInfo();
          confirmBtn.disabled = false;
        });
      });

      function updateInfo() {
        if (selectedAddress) {
          infoDiv.innerHTML = `
            <div style="color:#10b981; font-weight:600; margin-bottom:4px;">✔ <b>${selectedAddress.address}</b></div>
            <div style="font-size:12px; color:#6b7280;">lat: ${selectedAddress.lat.toFixed(6)} · lng: ${selectedAddress.lng.toFixed(6)}</div>
          `;
        } else {
          infoDiv.innerHTML = 'Adres seçin veya haritadan bir nokta tıklayın.';
        }
      }
    })
    .catch((err) => {
      logger.error('Google Maps yükleme hatası', err);
      mapContainer.innerHTML = `<p style="color:#ef4444;">❌ Harita yüklenemedi: ${err.message}</p>`;
    });

  // Event listeners
  const closeBtn = document.getElementById('closeAddressModal');
  closeBtn.addEventListener('click', () => {
    if (onCancel) onCancel();
    document.body.removeChild(modalOverlay);
  });

  confirmBtn.addEventListener('click', () => {
    if (selectedAddress && onConfirm) {
      onConfirm(selectedAddress);
      document.body.removeChild(modalOverlay);
    }
  });

  // ESC tuşu ile kapatma
  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      if (onCancel) onCancel();
      document.body.removeChild(modalOverlay);
      document.removeEventListener('keydown', handleEsc);
    }
  };
  document.addEventListener('keydown', handleEsc);

  // Overlay tıklama ile kapatma (modal içeriğine tıklamada kapanmaz)
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      if (onCancel) onCancel();
      document.body.removeChild(modalOverlay);
      document.removeEventListener('keydown', handleEsc);
    }
  });
}

