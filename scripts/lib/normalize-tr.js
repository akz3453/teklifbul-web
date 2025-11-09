export function normalizeTR(input) {
  const s = String(input ?? '').normalize('NFD')
    .replace(/ı/g,'i').replace(/İ/g,'I')
    .replace(/[şŞ]/g,'s').replace(/[ğĞ]/g,'g')
    .replace(/[üÜ]/g,'u').replace(/[öÖ]/g,'o')
    .replace(/[çÇ]/g,'c')
    .replace(/\p{Diacritic}/gu,'')
    .toLowerCase()
    .trim()
    .replace(/\s+/g,' ');
  return s;
}

export function slugTR(input){
  return normalizeTR(input)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g,'_')
    .replace(/^_|_$/g,'');
}

export function parseDateSmart(v){
  if(!v) return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0,10);
  const s = String(v).trim();
  // yyyy-mm-dd
  const m1 = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m1) {
    const d = new Date(Number(m1[1]), Number(m1[2]) - 1, Number(m1[3]));
    if (!isNaN(d)) return d.toISOString().slice(0,10);
  }
  // dd.mm.yyyy or dd/mm/yyyy
  const m2 = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m2){
    const d = new Date(Number(m2[3]), Number(m2[2]) - 1, Number(m2[1]));
    if (!isNaN(d)) return d.toISOString().slice(0,10);
  }
  return null;
}


