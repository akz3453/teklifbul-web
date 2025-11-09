// scripts/fetch-streets-beykoz.cjs
// Fetch streets for all neighborhoods of ISTANBUL__BEYKOZ and save to public/assets/sokak/
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const MAHALLE_FILE = path.resolve('./public/assets/mahalle/ISTANBUL__BEYKOZ.json');
const OUT_DIR = path.resolve('./public/assets/sokak');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function slugTR(s){
  const map = { 'ı':'i','İ':'i','ş':'s','Ş':'s','ğ':'g','Ğ':'g','ü':'u','Ü':'u','ö':'o','Ö':'o','ç':'c','Ç':'c' };
  s = String(s ?? '').trim();
  s = s.replace(/[ıİşŞğĞüÜöÖçÇ]/g, ch => map[ch]);
  s = s.replace(/\s+/g, '_').replace(/[^\w]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g,'');
  return s.toUpperCase();
}

async function safeFetchJSON(url){
  try{
    const r = await fetch(url, { headers: { 'accept':'application/json' } });
    if (!r.ok) return { data: [] };
    return await r.json();
  }catch(e){ return { data: [] }; }
}

async function main(){
  if (!fs.existsSync(MAHALLE_FILE)){
    console.error('Mahalle dosyası yok:', MAHALLE_FILE);
    process.exit(1);
  }
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const j = JSON.parse(fs.readFileSync(MAHALLE_FILE, 'utf8'));
  const provinceName = 'İstanbul';
  const districtName = 'Beykoz';
  const districtId = 'ISTANBUL__BEYKOZ';
  const neighborhoods = Array.isArray(j.neighborhoods) ? j.neighborhoods : [];
  let saved = 0, empty = 0;
  for (const n of neighborhoods){
    const nId = n.id || slugTR(n.name);
    const outFile = path.join(OUT_DIR, `${districtId}_mah-${nId}.json`);
    if (fs.existsSync(outFile)) continue;
    const url = `https://api.turkiyeapi.dev/v1/streets?district=${encodeURIComponent(districtName)}&neighborhood=${encodeURIComponent(n.name)}`;
    const { data } = await safeFetchJSON(url);
    const streets = (Array.isArray(data)? data:[]).map(s=>({ id: slugTR(s.name), name: s.name }));
    if (streets.length){
      const payload = { districtId, districtName, neighborhoodId: nId, neighborhoodName: n.name, streets };
      fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf8');
      saved++;
      console.log('✅ yazıldı:', path.basename(outFile), `(${streets.length})`);
    } else {
      empty++;
      console.log('⚠️ boş:', n.name);
    }
    await sleep(150);
  }
  console.log(`\nBitti. Kaydedilen mahalle dosyası: ${saved}, boş: ${empty}`);
}

main().catch(e=>{ console.error(e); process.exit(1); });


