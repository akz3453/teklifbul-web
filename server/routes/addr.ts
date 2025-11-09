/**
 * Adres API Routes
 * Teklifbul Rule v1.0 - ID tabanlı adres sistemi
 */

import { Router, Request, Response } from 'express';

// Node.js 18+ built-in fetch (native)
// Eğer eski Node.js kullanıyorsanız: npm install node-fetch@2

const router = Router();

/**
 * Retry mekanizması ile fetch
 * @param url - Fetch edilecek URL
 * @param tries - Maksimum deneme sayısı (default: 3)
 * @returns Response
 */
async function fetchWithRetry(url: string, tries = 3): Promise<any> {
  let lastErr: Error | null = null;
  
  for (let i = 0; i < tries; i++) {
    try {
      // AbortController ile timeout (Node.js 18+)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      const res = await fetch(url, { 
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Teklifbul/1.0'
        }
      } as any);
      
      clearTimeout(timeoutId);
      
      if (res.ok) {
        return await res.json();
      }
      
      lastErr = new Error(`${res.status} ${res.statusText}`);
    } catch (e: any) {
      lastErr = e;
    }
    
    // Exponential backoff: 250ms, 500ms, 1000ms
    if (i < tries - 1) {
      await new Promise(resolve => setTimeout(resolve, 250 * Math.pow(2, i)));
    }
  }
  
  throw lastErr || new Error('Fetch failed after retries');
}

/**
 * GET /api/addr/streets?neighborhoodId=#
 * TürkiyeAPI'den sokak listesini getir (retry'li, CORS güvenli)
 */
router.get('/streets', async (req: Request, res: Response) => {
  try {
    const neighborhoodId = req.query.neighborhoodId;
    
    if (!neighborhoodId) {
      return res.status(400).json({ error: 'neighborhoodId required' });
    }
    
    const neighborhoodIdNum = Number(neighborhoodId);
    
    if (isNaN(neighborhoodIdNum) || neighborhoodIdNum <= 0) {
      return res.status(400).json({ error: 'Invalid neighborhoodId' });
    }
    
    // TürkiyeAPI endpoint: /v1/streets?neighborhoodId={id}
    const apiUrl = `https://api.turkiyeapi.dev/v1/streets?neighborhoodId=${neighborhoodIdNum}`;
    
    try {
      const data = await fetchWithRetry(apiUrl);
      
      // TürkiyeAPI response formatı: { data: [...], meta: {...} }
      const streets = Array.isArray(data?.data) ? data.data : [];
      
      // Sokak formatını normalize et: { id, name, postalCode? }
      const normalizedStreets = streets.map((s: any) => ({
        id: s.id || s.neighborhoodId || null,
        name: s.name || '',
        postalCode: s.postalCode || s.postal_code || null
      })).filter((s: any) => s.name); // Boş isimleri filtrele
      
      return res.json({ 
        ok: true,
        data: normalizedStreets 
      });
    } catch (apiError: any) {
      console.warn('[addr] TürkiyeAPI streets fetch failed', { 
        neighborhoodId: neighborhoodIdNum, 
        error: apiError.message || String(apiError) 
      });
      
      // Hata durumunda boş array döndür (UI free-text'e düşsün)
      return res.json({ 
        ok: false,
        data: [] 
      });
    }
  } catch (e: any) {
    console.error('[addr] /streets endpoint error:', e);
    return res.status(500).json({ 
      ok: false,
      error: 'Internal server error',
      data: [] 
    });
  }
});

/**
 * GET /api/addr/resolve-ids?provinceName=...&districtName=...&neighborhoodName=...
 * İl/İlçe/Mahalle isimlerinden ID'leri çözümle
 */
router.get('/resolve-ids', async (req: Request, res: Response) => {
  try {
    const { provinceName, districtName, neighborhoodName } = req.query;
    
    if (!provinceName || !districtName || !neighborhoodName) {
      return res.status(400).json({ error: 'provinceName, districtName, neighborhoodName required' });
    }
    
    const baseUrl = 'https://api.turkiyeapi.dev/v1';
    
    try {
      // 1. İl ID'sini bul
      const provinceRes = await fetchWithRetry(
        `${baseUrl}/provinces?name=${encodeURIComponent(String(provinceName))}`
      );
      const provinceId = provinceRes?.data?.[0]?.id;
      
      if (!provinceId) {
        return res.json({ ok: false, error: 'Province not found', data: null });
      }
      
      // 2. İlçe ID'sini bul
      const districtRes = await fetchWithRetry(
        `${baseUrl}/districts?provinceId=${provinceId}`
      );
      const districts = Array.isArray(districtRes?.data) ? districtRes.data : [];
      
      // Normalize edilmiş karşılaştırma
      const normalize = (s: string) => s.toLowerCase().replace(/[ıİşŞğĞüÜöÖçÇ]/g, (m) => {
        const map: Record<string, string> = { 'ı': 'i', 'İ': 'i', 'ş': 's', 'Ş': 's', 'ğ': 'g', 'Ğ': 'g', 'ü': 'u', 'Ü': 'u', 'ö': 'o', 'Ö': 'o', 'ç': 'c', 'Ç': 'c' };
        return map[m] || m;
      });
      
      const normalizedDistrictName = normalize(String(districtName));
      const district = districts.find((d: any) => normalize(d.name) === normalizedDistrictName);
      
      if (!district) {
        return res.json({ ok: false, error: 'District not found', data: { provinceId } });
      }
      
      const districtId = district.id;
      
      // 3. Mahalle ID'sini bul
      const neighborhoodRes = await fetchWithRetry(
        `${baseUrl}/neighborhoods?districtId=${districtId}`
      );
      const neighborhoods = Array.isArray(neighborhoodRes?.data) ? neighborhoodRes.data : [];
      
      const normalizedNeighborhoodName = normalize(String(neighborhoodName));
      const neighborhood = neighborhoods.find((n: any) => normalize(n.name) === normalizedNeighborhoodName);
      
      if (!neighborhood) {
        return res.json({ ok: false, error: 'Neighborhood not found', data: { provinceId, districtId } });
      }
      
      const neighborhoodId = neighborhood.id;
      const defaultPostalCode = neighborhood.postalCode || neighborhood.postal_code || null;
      
      return res.json({
        ok: true,
        data: {
          provinceId,
          districtId,
          neighborhoodId,
          defaultPostalCode
        }
      });
    } catch (apiError: any) {
      console.warn('[addr] TürkiyeAPI resolve-ids failed', { 
        provinceName, 
        districtName, 
        neighborhoodName,
        error: apiError.message || String(apiError) 
      });
      
      return res.status(500).json({ 
        ok: false,
        error: 'API request failed',
        data: null 
      });
    }
  } catch (e: any) {
    console.error('[addr] /resolve-ids endpoint error:', e);
    return res.status(500).json({ 
      ok: false,
      error: 'Internal server error',
      data: null 
    });
  }
});

export default router;

