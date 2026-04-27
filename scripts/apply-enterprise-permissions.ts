import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const TEMPLATE_PATH = path.resolve(ROOT, 'src', 'shared', 'data', 'rolePermissionsTemplate.json');

function isManagement(roleKey: string) {
  return [
    'isveren', 'ceo', 'yonetim_kurulu_baskani', 'yonetim_kurulu_uyesi', 'genel_mudur', 'genel_mudur_yardimcisi', 'sirket_sahibi'
  ].some(k => roleKey.includes(k));
}

function isAccounting(roleKey: string) {
  return roleKey.includes('muhasebe') || roleKey.includes('finans_sorumlusu') || roleKey.includes('tahsilat');
}

function isWarehouse(roleKey: string) {
  return roleKey.includes('depo') || roleKey.includes('stok') || roleKey.includes('lojistik');
}

function isPurchasing(roleKey: string) {
  return roleKey.includes('satinalma');
}

function isSales(roleKey: string) {
  return roleKey.includes('satis') || roleKey.includes('satici') || roleKey.includes('pazarlama');
}

function main() {
  console.log('🔒 Applying Enterprise+ SaaS Permissions to Template...');
  
  const template = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8'));
  const matrix = template.matrixDefaults || {};
  let changed = 0;

  for (const roleKey of Object.keys(matrix)) {
    const role = matrix[roleKey];
    const m = isManagement(roleKey);
    const a = isAccounting(roleKey);
    const w = isWarehouse(roleKey);
    const p = isPurchasing(roleKey);
    const s = isSales(roleKey);

    // 1. Fiyat Düzenleme (Price Editing)
    // Sadece Yönetici, Satınalma ve Muhasebe fiyat düzenleyebilir.
    role['stock.priceUpdate'] = m || p || a;

    // 2. Stok Çıkışı ve İrsaliye
    // Sadece Depo ve Yöneticiler İrsaliye kesip stok çıkışı yapabilir. Muhasebe ve Satınalma stoktan düşemez.
    role['stock.movements.out'] = m || w;
    role['stock.movements.transfer'] = m || w;
    role['edespatch.manage'] = m || w;
    role['edespatch.view'] = m || w || a || s; 

    // 3. Stok Girişi
    // Sadece Depo, Yöneticiler ve Satınalma.
    role['stock.movements.in'] = m || w || p;

    // 4. Hakediş ve Kasa Ödeme Ayrımı
    // Kasayı sadece Muhasebe ve Yönetim görür/yönetir. Satınalma sadece ödeme talebi girebilir.
    role['cash.view'] = m || a;
    role['cash.create'] = m || a;
    role['cash.edit'] = m || a;
    role['cash.delete'] = m; // Delete sadece yönetim

    role['payments.create'] = m || a || p; // Satınalma talep yaratabilir
    role['payments.approve'] = m || a; // Muhasebe veya Yönetim fiili onaylar

    // 5. Hard Deletions. (Yalnızca yönetim)
    const deleteKeys = [
      'sales.delete', 'bids.delete', 'stock.delete', 'demands.delete'
    ];
    deleteKeys.forEach(k => {
      // Assuming keys exist, forcefully disable if not management
      role[k] = m;
    });

    changed++;
  }

  fs.writeFileSync(TEMPLATE_PATH, JSON.stringify(template, null, 2), 'utf8');
  console.log(`✅ Basariyla ${changed} rol Enterprise standardina guncellendi.`);
}

main();
