/**
 * Google Maps API Loader
 * Teklifbul Rule v1.0 - Modüler yükleme
 */

// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../../src/shared/log/logger.js';

let mapsPromise = null;
let mapsLoaded = false;

/**
 * Google Maps API'yi yükler (tek sefer)
 * @returns {Promise<void>}
 */
export function loadGoogleMaps() {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  // Zaten yüklüyse direkt dön
  if (window.google?.maps) {
    mapsLoaded = true;
    return Promise.resolve();
  }

  // Yükleme devam ediyorsa bekle
  if (mapsPromise) {
    return mapsPromise;
  }

  // Teklifbul Rule v1.0 - Google Maps key, build-time inject veya window config'den okunur.
  // Kaynaklar: window.__APP_CONFIG__.googleMapsApiKey (recommended) > import.meta.env.VITE_GOOGLE_MAPS_API_KEY > process env (yalnizca dev tarafinda).
  // Anahtar Google Cloud Console'da HTTP referrer ile kisitlanmis olmalidir.
  const key =
    (typeof window !== 'undefined' && window.__APP_CONFIG__ && window.__APP_CONFIG__.googleMapsApiKey) ||
    (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_GOOGLE_MAPS_API_KEY) ||
    '';

  if (!key) {
    logger.warn('Google Maps API key tanimli degil; harita ozellikleri devre disi');
    return Promise.reject(new Error('Google Maps API key bulunamadi'));
  }

  mapsPromise = new Promise((resolve, reject) => {
    // Unique callback fonksiyonu
    const callbackName = 'initGoogleMaps_' + Math.random().toString(36).slice(2);
    
    window[callbackName] = () => {
      mapsLoaded = true;
      logger.info('Google Maps API yüklendi');
      delete window[callbackName];
      resolve();
    };

    const script = document.createElement('script');
    // Teklifbul Rule v1.0 - Google Maps API best practice loading
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&callback=${callbackName}&loading=async`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      delete window[callbackName];
      reject(new Error('Google Maps JS yüklenemedi'));
    };

    document.head.appendChild(script);
  });

  return mapsPromise;
}

/**
 * Google Maps'in yüklenip yüklenmediğini kontrol eder
 * @returns {boolean}
 */
export function isGoogleMapsLoaded() {
  return mapsLoaded && window.google?.maps !== undefined;
}

