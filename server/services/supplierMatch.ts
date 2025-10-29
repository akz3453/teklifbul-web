import { categoriesForItems } from './category';

export async function matchSuppliers(items:any[]){
  const cats = categoriesForItems(items);
  // TODO: DB’den kategori etiketine göre firma listesi çek
  return cats.map((c,i)=>({
    category: c,
    suppliers: [
      { id: `sup-${i+1}-A`, title: `${c} A.Ş.` },
      { id: `sup-${i+1}-B`, title: `${c} Tic.` },
      { id: `sup-${i+1}-C`, title: `${c} Ltd.` }
    ]
  }));
}


