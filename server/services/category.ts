const RULES: Record<string,string[]> = {
  'Elektrik Malzemeleri': ['kablo','priz','sigorta','pano','kontaktör','şalter','led','ampul','aydınlatma'],
  'El Aletleri': ['matkap','şarjlı','testere','taşlama','kumpas','pense','çekiç'],
  'Ofis Sarf': ['kağıt','toner','kartuş','zımba','dosya','kalem'],
  'BT Donanım': ['laptop','sunucu','ssd','ram','switch','router','modem','monitor','ekran'],
  'Hırdavat': ['vida','civata','somun','pul','rondela']
};
export function categorizeItemName(name:string=''){
  const t = (name||'').toLowerCase();
  for (const [cat,keys] of Object.entries(RULES)){
    if (keys.some(k => t.includes(k))) return cat;
  }
  return 'Genel';
}
export function categoriesForItems(items:any[]){
  const set = new Set<string>();
  items.forEach(it => set.add(categorizeItemName(it.itemName)));
  return Array.from(set);
}


