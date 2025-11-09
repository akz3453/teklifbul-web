// utils/slug-tr.js
export function slugTR(s) {
  const map = { 'ı':'i','İ':'i','ş':'s','Ş':'s','ğ':'g','Ğ':'g','ü':'u','Ü':'u','ö':'o','Ö':'o','ç':'c','Ç':'c' };
  s = String(s ?? '').trim();
  s = s.replace(/[ıİşŞğĞüÜöÖçÇ]/g, ch => map[ch]);
  s = s.replace(/\s+/g, '_').replace(/[^\w]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g,'');
  return s.toUpperCase();
}


