/**
 * OpenStreetMap Component (Leaflet.js)
 * Teklifbul Rule v1.0
 * 
 * Google Maps alternatifi - $0 maliyet, sınırsız kullanım
 */

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Leaflet default icon sorunu için fix
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapProps {
  address: string;
  lat?: number;
  lng?: number;
  height?: string;
  zoom?: number;
  showMarker?: boolean;
  className?: string;
}

interface GeocodeResult {
  lat: string;
  lon: string;
  display_name: string;
}

/**
 * Nominatim Geocoding API (OpenStreetMap)
 * Rate limit: 1 request/second
 */
async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  try {
    // Cache kontrolü
    const cacheKey = `geocode:${encodeURIComponent(address)}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Nominatim API çağrısı
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
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
    
    const result: GeocodeResult = {
      lat: data[0].lat,
      lon: data[0].lon,
      display_name: data[0].display_name
    };
    
    // Cache'e kaydet (session storage - sayfa kapanana kadar)
    sessionStorage.setItem(cacheKey, JSON.stringify(result));
    
    // Rate limiting için bekle (1 saniye)
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return result;
  } catch (error) {
    console.error('❌ Geocoding error:', error);
    return null;
  }
}

export function Map({ 
  address, 
  lat, 
  lng, 
  height = '400px', 
  zoom = 13,
  showMarker = true,
  className = ''
}: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (!mapRef.current) return;
    
    // Harita oluştur
    const map = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: true
    });
    
    // OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      tileSize: 256
    }).addTo(map);
    
    mapInstanceRef.current = map;
    
    // Koordinat varsa direkt göster
    if (lat && lng) {
      map.setView([lat, lng], zoom);
      
      if (showMarker) {
        L.marker([lat, lng])
          .addTo(map)
          .bindPopup(address)
          .openPopup();
      }
      
      setLoading(false);
    } else if (address) {
      // Geocoding yap
      setLoading(true);
      geocodeAddress(address)
        .then(result => {
          if (result) {
            const latNum = parseFloat(result.lat);
            const lngNum = parseFloat(result.lon);
            
            map.setView([latNum, lngNum], zoom);
            
            if (showMarker) {
              L.marker([latNum, lngNum])
                .addTo(map)
                .bindPopup(`<strong>${address}</strong><br>${result.display_name}`)
                .openPopup();
            }
            
            setLoading(false);
          } else {
            // Default: İstanbul
            map.setView([41.0082, 28.9784], 10);
            setError('Adres bulunamadı');
            setLoading(false);
          }
        })
        .catch(err => {
          console.error('Geocoding error:', err);
          // Default: İstanbul
          map.setView([41.0082, 28.9784], 10);
          setError('Harita yüklenemedi');
          setLoading(false);
        });
    } else {
      // Default: İstanbul
      map.setView([41.0082, 28.9784], 10);
      setLoading(false);
    }
    
    return () => {
      map.remove();
    };
  }, [address, lat, lng, zoom, showMarker]);
  
  return (
    <div className={`map-container ${className}`} style={{ position: 'relative', width: '100%', height }}>
      {loading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1000,
          background: 'white',
          padding: '10px 20px',
          borderRadius: '4px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
        }}>
          Harita yükleniyor...
        </div>
      )}
      {error && (
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          zIndex: 1000,
          background: '#fee',
          color: '#c33',
          padding: '8px 16px',
          borderRadius: '4px',
          fontSize: '14px'
        }}>
          ⚠️ {error}
        </div>
      )}
      <div ref={mapRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />
    </div>
  );
}

/**
 * Standalone HTML/JS kullanımı için
 */
export function initMap(elementId: string, address: string, lat?: number, lng?: number) {
  const mapElement = document.getElementById(elementId);
  if (!mapElement) {
    console.error(`Map element not found: ${elementId}`);
    return;
  }
  
  const map = L.map(elementId);
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);
  
  if (lat && lng) {
    map.setView([lat, lng], 13);
    L.marker([lat, lng])
      .addTo(map)
      .bindPopup(address)
      .openPopup();
  } else if (address) {
    geocodeAddress(address).then(result => {
      if (result) {
        const latNum = parseFloat(result.lat);
        const lngNum = parseFloat(result.lon);
        map.setView([latNum, lngNum], 13);
        L.marker([latNum, lngNum])
          .addTo(map)
          .bindPopup(`<strong>${address}</strong><br>${result.display_name}`)
          .openPopup();
      }
    });
  }
  
  return map;
}

