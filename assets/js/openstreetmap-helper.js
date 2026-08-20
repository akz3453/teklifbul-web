/**
 * OpenStreetMap Helper (Leaflet.js)
 * Teklifbul Rule v1.0
 * 
 * Google Maps alternatifi - $0 maliyet
 */

// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../shared/log/logger.js';

/**
 * Nominatim Geocoding (OpenStreetMap)
 * Rate limit: 1 request/second
 */
/**
 * Nominatim Geocoding (OpenStreetMap)
 * Rate limit: 1 request/second (in-tab mutex + session last-hit)
 */
const NOMINATIM_MIN_GAP_MS = 1100;
const NOMINATIM_LAST_KEY = 'nominatim:lastAt';
let nominatimQueue = Promise.resolve();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttleNominatim() {
  const last = Number(sessionStorage.getItem(NOMINATIM_LAST_KEY) || 0);
  const wait = Math.max(0, NOMINATIM_MIN_GAP_MS - (Date.now() - last));
  if (wait > 0) await sleep(wait);
  sessionStorage.setItem(NOMINATIM_LAST_KEY, String(Date.now()));
}

async function geocodeAddress(address) {
  try {
    const cacheKey = `geocode:${encodeURIComponent(address)}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const run = nominatimQueue.then(async () => {
      await throttleNominatim();
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
        {
          headers: {
            'User-Agent': 'Teklifbul/1.0'
          }
        }
      );
      if (!response.ok) {
        throw new Error(`Geocoding failed: ${response.statusText}`);
      }
      return response.json();
    });
    nominatimQueue = run.catch(() => {});
    const data = await run;

    if (!data || data.length === 0) {
      return null;
    }

    const result = {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      display_name: data[0].display_name
    };
    sessionStorage.setItem(cacheKey, JSON.stringify(result));
    return result;
  } catch (error) {
    logger.error('Geocoding error', error);
    return null;
  }
}

/**
 * OpenStreetMap haritası oluştur
 */
function createOpenStreetMap(containerId, options = {}) {
  const {
    lat = 41.0082, // İstanbul default
    lng = 28.9784,
    zoom = 13,
    address = null
  } = options;
  
  const container = document.getElementById(containerId);
  if (!container) {
    logger.error(`Map container not found`, { containerId });
    return null;
  }
  
  // Container'ı temizle
  container.innerHTML = '';
  
  // Harita oluştur
  const map = L.map(containerId).setView([lat, lng], zoom);
  
  // OpenStreetMap tile layer
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);
  
  let marker = null;
  
  // Adres varsa geocoding yap
  if (address) {
    geocodeAddress(address).then(result => {
      if (result) {
        map.setView([result.lat, result.lng], zoom);
        marker = L.marker([result.lat, result.lng])
          .addTo(map)
          .bindPopup(`<strong>${address}</strong><br>${result.display_name}`)
          .openPopup();
      } else {
        // Default: İstanbul
        map.setView([41.0082, 28.9784], 10);
      }
    });
  } else {
    // Koordinat varsa direkt marker ekle
    marker = L.marker([lat, lng])
      .addTo(map)
      .bindPopup(address || 'Konum');
  }
  
  return {
    map,
    marker,
    setAddress: async (newAddress) => {
      const result = await geocodeAddress(newAddress);
      if (result) {
        map.setView([result.lat, result.lng], zoom);
        if (marker) {
          marker.setLatLng([result.lat, result.lng]);
          marker.setPopupContent(`<strong>${newAddress}</strong><br>${result.display_name}`);
        } else {
          marker = L.marker([result.lat, result.lng])
            .addTo(map)
            .bindPopup(`<strong>${newAddress}</strong><br>${result.display_name}`)
            .openPopup();
        }
      }
    },
    setLocation: (newLat, newLng) => {
      map.setView([newLat, newLng], zoom);
      if (marker) {
        marker.setLatLng([newLat, newLng]);
      } else {
        marker = L.marker([newLat, newLng])
          .addTo(map)
          .bindPopup('Konum');
      }
    }
  };
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { geocodeAddress, createOpenStreetMap };
}

