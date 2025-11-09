// scripts/update-turkiye-data.js (optimized throttled version)
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const OUT_MAH = path.resolve('./public/assets/mahalle');
const OUT_SOK = path.resolve('./public/assets/sokak');
const TR_FILE = path.resolve('./public/assets/tr-il-ilce.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ensureDir(p){ if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

// ASCII-safe, uppercase, TR normalizasyonu
function slugTR(s){
  s = String(s ?? '').trim();
  const map = { 'ı':'i','İ':'i','ş':'s','Ş':'s','ğ':'g','Ğ':'g','ü':'u','Ü':'u','ö':'o','Ö':'o','ç':'c','Ç':'c' };
  s = s.replace(/[ıİşŞğĞüÜöÖçÇ]/g, ch => map[ch] || ch);
  s = s.normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, '');
  s = s.toUpperCase().replace(/\s+/g, '_');
  return s;
}

async function safeFetch(url, { retries = 3, timeout = 10000 } = {}){
  for (let i = 0; i <= retries; i++){
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeout);
    try{
      const r = await fetch(url, { signal: ac.signal, headers: { 'accept': 'application/json' } });
      clearTimeout(t);
      if (!r.ok){
        if (r.status === 404) return { data: [] };
        throw new Error(`HTTP ${r.status}`);
      }
      return await r.json();
    }catch(e){
      clearTimeout(t);
      if (i === retries){ console.warn('⚠️', url, e.message); return { data: [] }; }
      await sleep(500 * (i + 1));
    }
  }
}

function percent(i, total){ if (!total) return '0%'; const p = Math.floor((i / total) * 100); return `${p}%`; }

async function main(){
  ensureDir(OUT_MAH); ensureDir(OUT_SOK);
  if (!fs.existsSync(TR_FILE)){
    console.error('❌ İl–ilçe JSON bulunamadı:', TR_FILE);
    process.exit(1);
  }
  const trRaw = JSON.parse(fs.readFileSync(TR_FILE, 'utf8'));
  const provinces = Array.isArray(trRaw) ? trRaw : (trRaw.data || []);

  let savedProvinces = 0;
  let savedDistricts = 0;
  let savedNeighborhoodGroups = 0;
  let savedStreetFiles = 0;

  for (let pi = 0; pi < provinces.length; pi++){
    const p = provinces[pi];
    const provinceName = p.name;
    const districts = p.districts || [];
    console.log(`[İl] ${pi+1}/${provinces.length} ${provinceName} — ${districts.length} ilçe`);

    for (let di = 0; di < districts.length; di++){
      const d = districts[di];
      const districtName = d.name;
      const districtId = `${slugTR(provinceName)}__${slugTR(districtName)}`;
      console.log(`  [İlçe ${percent(di+1, districts.length)}] ${districtName}`);

      // Neighborhoods: önce cache var mı kontrol et
      let neighborhoods = [];
      const mahPath = path.join(OUT_MAH, `${districtId}.json`);
      if (fs.existsSync(mahPath)){
        try {
          const j = JSON.parse(fs.readFileSync(mahPath, 'utf8'));
          neighborhoods = Array.isArray(j.neighborhoods) ? j.neighborhoods : [];
        } catch {}
      }
      if (!neighborhoods.length){
        const nUrl = `https://api.turkiyeapi.dev/v1/neighborhoods?district=${encodeURIComponent(districtName)}`;
        const nRes = await safeFetch(nUrl);
        neighborhoods = (Array.isArray(nRes?.data) ? nRes.data : []).map(n => ({ id: slugTR(n.name), name: n.name }));
        if (neighborhoods.length){
          const payload = { districtId, districtName, neighborhoods };
          ensureDir(OUT_MAH);
          fs.writeFileSync(mahPath, JSON.stringify(payload, null, 2), 'utf8');
          savedNeighborhoodGroups++;
          console.log(`    ↳ Mahalle kaydedildi (${neighborhoods.length}) → ${path.basename(mahPath)}`);
        }
        await sleep(150);
      }

      // Streets
      for (let ni = 0; ni < neighborhoods.length; ni++){
        const n = neighborhoods[ni];
        console.log(`    [Mahalle ${percent(ni+1, neighborhoods.length)}] ${n.name}`);
        const sokFile = path.join(OUT_SOK, `${districtId}_mah-${n.id}.json`);
        if (!fs.existsSync(sokFile)){
          const sUrl = `https://api.turkiyeapi.dev/v1/streets?district=${encodeURIComponent(districtName)}&neighborhood=${encodeURIComponent(n.name)}`;
          const sRes = await safeFetch(sUrl);
          const streets = (Array.isArray(sRes?.data) ? sRes.data : []).map(s => ({ id: slugTR(s.name), name: s.name }));
          if (streets.length){
            const payload = { districtId, districtName, neighborhoodId: n.id, neighborhoodName: n.name, streets };
            ensureDir(OUT_SOK);
            fs.writeFileSync(sokFile, JSON.stringify(payload, null, 2), 'utf8');
            savedStreetFiles++;
            console.log(`      ↳ Sokak kaydedildi (${streets.length}) → ${path.basename(sokFile)}`);
          } else {
            console.log(`      ↳ Sokak bulunamadı (404 veya boş): ${n.name}`);
          }
          await sleep(150);
        }
      }

      savedDistricts++;
    }

    savedProvinces++;
    await sleep(1000); // RAM rahatlat
  }

  console.log(`\n✅ Özet`);
  console.log(`- İl: ${savedProvinces}`);
  console.log(`- İlçe: ${savedDistricts}`);
  console.log(`- Mahalle dosyası: ${savedNeighborhoodGroups}`);
  console.log(`- Sokak dosyası: ${savedStreetFiles}`);
}

main().catch(e => { console.error(e); process.exit(1); });
