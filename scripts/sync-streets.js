// scripts/sync-streets.js
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const MAH_DIR = path.resolve('./public/assets/mahalle');
const OUT_DIR = path.resolve('./public/assets/sokak');
function toId(s){ return (s||'').toString().toUpperCase().replace(/\s+/g,'_'); }
// API'den sokak çekme – kendi endpointine göre güncelle
async function fetchStreetsFromAPI({ neighborhoodName, districtName }) {
  const candidates = [
    `https://api.tamuzaornek.dev/v1/streets?neighborhood=${encodeURIComponent(neighborhoodName)}`,
    `https://api.tamuzaornek.dev/v1/streets?district=${encodeURIComponent(districtName)}&neighborhood=${encodeURIComponent(neighborhoodName)}`
  ];
  for (const url of candidates) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const { data } = await r.json();
      if (Array.isArray(data) && data.length) {
        return data.map(s => ({ id: toId(s.id || s.name), name: s.name }));
      }
    } catch {}
  }
  return [];
}
async function main(){
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const files = fs.readdirSync(MAH_DIR).filter(f => f.endsWith('.json'));
  let written = 0;
  for (const f of files) {
    const mah = JSON.parse(fs.readFileSync(path.join(MAH_DIR, f), 'utf8'));
    const { districtId, districtName, neighborhoods = [] } = mah;
    for (const n of neighborhoods) {
      const neighborhoodId = n.id;
      const neighborhoodName = n.name;
      const streets = await fetchStreetsFromAPI({ neighborhoodName, districtName });
      if (!streets.length) continue;
      const out = {
        districtId,
        districtName,
        neighborhoodId,
        neighborhoodName,
        streets
      };
      const outFile = path.join(OUT_DIR, `${districtId}_mah-${neighborhoodId}.json`);
      fs.writeFileSync(outFile, JSON.stringify(out, null, 2), 'utf8');
      written++;
      console.log('✓', path.basename(outFile), streets.length);
    }
  }
  console.log(`✅ Toplam yazılan sokak dosyası: ${written}`);
}
main().catch(e => { console.error(e); process.exit(1); });
