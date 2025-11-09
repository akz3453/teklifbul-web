// scripts/build-mahalle.js
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const SRC = path.resolve(__dirname, '../data/Mahalle_Listesi.xls');
const OUTDIR = path.resolve(__dirname, '../public/assets/mahalle/');

function slugTR(s) {
  // TR büyük harf ve diakritikleri koru; boşlukları _ yap; TR harf aralığını koru
  s = String(s ?? '').trim();
  const map = { 'ı':'I','i':'İ','ş':'Ş','ğ':'Ğ','ü':'Ü','ö':'Ö','ç':'Ç' };
  s = s.replace(/[ıişğüöç]/g, ch => map[ch]);
  s = s.toLocaleUpperCase('tr');
  s = s.replace(/\s+/g, '_');
  s = s.replace(/[^\wÇĞİÖŞÜ]/g, '_');
  s = s.replace(/_+/g, '_');
  return s;
}

function toTitle(s){
  s = String(s ?? '').trim();
  if (!s) return '';
  const parts = s.toLocaleLowerCase('tr').split(/\s+/);
  return parts.map(w => (w.charAt(0).toLocaleUpperCase('tr') + w.slice(1))).join(' ');
}

(function build(){
  if (!fs.existsSync(SRC)) {
    console.error('Excel bulunamadı:', SRC);
    process.exit(1);
  }
  const wb = xlsx.readFile(SRC);
  const ws = wb.Sheets[wb.SheetNames[0]];
  // Obje modunda oku: {'MAHALLE ADI': ..., 'MAHALLENİN BAĞLILIK BİLGİSİ': 'İL -> İLÇE -> ...'}
  const rows = xlsx.utils.sheet_to_json(ws, { raw: false });

  const mahByDistrict = {};
  for (const row of rows) {
    const mahalle = row['MAHALLE ADI'];
    const baglilik = row['MAHALLENİN BAĞLILIK BİLGİSİ'];
    if (!(mahalle && baglilik)) continue;
    const parts = String(baglilik).split('->').map(s => String(s || '').trim());
    const il = parts[0] || '';
    const ilce = parts[1] || '';
    if (!il || !ilce) continue;

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
  let count = 0;
  for (const districtId in mahByDistrict) {
    const entry = mahByDistrict[districtId];
    const outPath = path.join(OUTDIR, `${districtId}.json`);
    fs.writeFileSync(outPath, JSON.stringify(entry, null, 2), 'utf8');
    count++;
    if (count % 200 === 0) console.log('✅ yazıldı:', path.basename(outPath));
  }
  console.log(`✅ Toplam ilçe dosyası: ${count}`);
})();
