// scripts/build-il-ilce.js
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const SRC = path.resolve(__dirname, '../data/il_ilce_alanlari.xlsx');
const OUT = path.resolve(__dirname, '../public/assets/tr-il-ilce.json');

function slugTR(s) {
  const map = { 'ı':'I','i':'İ','ş':'Ş','ğ':'Ğ','ü':'Ü','ö':'Ö','ç':'Ç' };
  s = String(s ?? '').trim();
  s = s.replace(/[ıişğüöç]/g, ch => map[ch]);     // TR upper
  s = s.replace(/\s+/g, '_');                      // space -> _
  s = s.replace(/[^\wÇĞİÖŞÜ]/g, '_');              // keep word chars
  s = s.replace(/_+/g, '_');
  return s.toUpperCase();
}

function toTitle(s){
  s = String(s ?? '').trim();
  if (/^[^a-zçğıöşü]+$/.test(s)) {
    return s.toLocaleLowerCase('tr')
      .split(/\s+/).map(w => w.charAt(0).toLocaleUpperCase('tr') + w.slice(1)).join(' ');
  }
  return s;
}

(function build(){
  if (!fs.existsSync(SRC)) {
    console.error('Excel bulunamadı:', SRC);
    process.exit(1);
  }
  const wb = xlsx.readFile(SRC);
  const ws = wb.Sheets['Sayfa1'] || wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, raw: false });

  const data = [];
  let current = null;
  const isProvinceHeader = (r) => {
    const [a,b,c] = r;
    if (c == null || String(c).trim() === '' || String(c).trim() === 'İL / İLÇE') return false;
    return (a == null || String(a).trim()==='') && (b == null || String(b).trim()==='');
  };

  for (const r of rows) {
    const [a,b,c] = r;
    if (isProvinceHeader(r)) {
      const ilName = String(c).trim();
      current = { id: slugTR(ilName), name: toTitle(ilName), districts: [] };
      data.push(current);
    } else if (current && c != null && String(c).trim() !== '') {
      const ilceName = String(c).trim();
      if ((a != null || b != null) && !/^İL\s*\/\s*İLÇE$/i.test(ilceName)) {
        current.districts.push({
          id: `${current.id}__${slugTR(ilceName)}`,
          name: toTitle(ilceName)
        });
      }
    }
  }

  data.sort((p,q)=>p.name.localeCompare(q.name,'tr'));
  data.forEach(p=>p.districts.sort((x,y)=>x.name.localeCompare(y.name,'tr')));

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ data }, null, 2), 'utf8');
  console.log(`✅ Yazıldı: ${OUT}  | İl: ${data.length}  | Örnek ilçe sayısı: ${data[0]?.districts?.length||0}`);
})();


