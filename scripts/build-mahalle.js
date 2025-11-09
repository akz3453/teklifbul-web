/* eslint-disable @typescript-eslint/no-require-imports */
// scripts/build-mahalle.js
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const SRC = path.resolve(__dirname, '../data/Mahalle_Listesi.xls');
const OUTDIR = path.resolve(__dirname, '../public/assets/mahalle/');

function slugTR(s) {
  return String(s ?? '')
    .trim()
    .replace(/[ıİ]/g, 'I')
    .replace(/[şŞ]/g, 'S')
    .replace(/[ğĞ]/g, 'G')
    .replace(/[üÜ]/g, 'U')
    .replace(/[öÖ]/g, 'O')
    .replace(/[çÇ]/g, 'C')
    .replace(/\s+/g, '_')
    .replace(/[^\w]/g, '')
    .toUpperCase();
}

function toTitle(s){
  s = String(s ?? '').trim();
  return s.charAt(0).toLocaleUpperCase('tr') + s.slice(1).toLocaleLowerCase('tr');
}

(function build(){
  if (!fs.existsSync(SRC)) {
    console.error('Excel bulunamadı:', SRC);
    process.exit(1);
  }
  const wb = xlsx.readFile(SRC);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, raw: false });

  // ['il', 'ilce', 'mahalle']
  const header = rows[0].map(h => (h || '').toLowerCase());
  const ilIdx = header.indexOf('il');
  const ilceIdx = header.indexOf('ilce');
  const mahalleIdx = header.indexOf('mahalle');
  if (ilIdx < 0 || ilceIdx < 0 || mahalleIdx < 0)
    throw new Error('Excel başlıkları beklenmiyor!');

  const mahByDistrict = {};

  for (const r of rows.slice(1)) {
    const il = r[ilIdx], ilce = r[ilceIdx], mahalle = r[mahalleIdx];
    if (!(il && ilce && mahalle)) continue;
    const districtId = slugTR(il) + '__' + slugTR(ilce);
    if (!mahByDistrict[districtId]) {
      mahByDistrict[districtId] = {
        districtId,
        districtName: toTitle(ilce),
        neighborhoods: []
      };
    }
    mahByDistrict[districtId].neighborhoods.push({
      id: slugTR(mahalle),
      name: toTitle(mahalle)
    });
  }

  fs.mkdirSync(OUTDIR, { recursive: true });
  for (const districtId in mahByDistrict) {
    const entry = mahByDistrict[districtId];
    const outPath = path.join(OUTDIR, `${districtId}.json`);
    fs.writeFileSync(outPath, JSON.stringify(entry, null, 2), 'utf8');
    console.log(`✅ ${outPath} (${entry.neighborhoods.length}) mahalle`);
  }
})();
