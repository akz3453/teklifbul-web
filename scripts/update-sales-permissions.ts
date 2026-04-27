// Teklifbul Rule v1.0 - Sales + E-Doc Permission Mapping Update Script
// Bu script rolePermissionsTemplate.json dosyasını günceller

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const TEMPLATE_PATH = path.resolve(ROOT, 'src', 'shared', 'data', 'rolePermissionsTemplate.json');

// B) Satış yapabilir roller (en az şu permKey'leri)
const SALES_BASIC_ROLES = [
  'buyer:isveren',
  'buyer:yonetim_kurulu_baskani',
  'buyer:yonetim_kurulu_uyesi',
  'buyer:ceo',
  'buyer:genel_mudur',
  'buyer:genel_mudur_yardimcisi',
  'supplier:isveren',
  'supplier:yonetim_kurulu_baskani',
  'supplier:yonetim_kurulu_uyesi',
  'supplier:ceo',
  'supplier:genel_mudur',
  'supplier:genel_mudur_yardimcisi',
  'buyer:siparis_takip',
  'buyer:finans_sorumlusu',
  'buyer:tahsilat_yetkilisi',
  'supplier:sirket_sahibi',
  'supplier:satis_muduru',
  'supplier:satis_yoneticisi',
  'supplier:satici',
  'supplier:satis_personeli',
  'supplier:pazarlama_muduru'
];

// C) Satışı faturaya dönüştürebilecek roller
const SALES_INVOICE_ROLES = [
  'buyer:isveren',
  'buyer:yonetim_kurulu_baskani',
  'buyer:yonetim_kurulu_uyesi',
  'buyer:ceo',
  'buyer:genel_mudur',
  'buyer:genel_mudur_yardimcisi',
  'supplier:isveren',
  'supplier:yonetim_kurulu_baskani',
  'supplier:yonetim_kurulu_uyesi',
  'supplier:ceo',
  'supplier:genel_mudur',
  'supplier:genel_mudur_yardimcisi',
  'supplier:muhasebe',
  'buyer:muhasebe',
  'supplier:satis_muduru'
];

// Send yetkisi olan roller (sadece bunlar send edebilir)
const SEND_PERMISSION_ROLES = [
  'buyer:muhasebe',
  'supplier:muhasebe',
  'supplier:satis_muduru'
];

// B maddesi için permission'lar
const SALES_BASIC_PERMS = {
  'sales.view': true,
  'sales.create': true,
  'sales.edit': true,
  'sales.cancel': true,
  'sales.archive': true,
  'sales.delivery': true,
  'sales.invoice': true
};

// C maddesi için permission'lar (send hariç)
const SALES_INVOICE_PERMS = {
  'sales.invoice': true,
  'einvoice.create': true,
  'einvoice.send': false, // Varsayılan false, send permission rolleri için true yapılacak
  'einvoice.status': true,
  'einvoice.cancel': true,
  'edespatch.create': true,
  'edespatch.send': false, // Varsayılan false, send permission rolleri için true yapılacak
  'edespatch.status': true,
  'edespatch.cancel': true
};

function main() {
  console.log('📋 Sales + E-Doc Permission Mapping Update Script');
  console.log('='.repeat(60));

  if (!fs.existsSync(TEMPLATE_PATH)) {
    console.error('❌ Template dosyası bulunamadı:', TEMPLATE_PATH);
    process.exit(1);
  }

  const template = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8'));
  const matrixDefaults = template.matrixDefaults || {};

  let updatedCount = 0;

  // B maddesi: Satış yapabilir roller
  console.log('\n🔧 B) Satış yapabilir roller güncelleniyor...');
  for (const roleKey of SALES_BASIC_ROLES) {
    if (!matrixDefaults[roleKey]) {
      console.warn(`⚠️  Rol bulunamadı: ${roleKey}`);
      continue;
    }

    Object.assign(matrixDefaults[roleKey], SALES_BASIC_PERMS);
    updatedCount++;
    console.log(`  ✅ ${roleKey}`);
  }

  // C maddesi: Satışı faturaya dönüştürebilecek roller
  console.log('\n🔧 C) Satışı faturaya dönüştürebilecek roller güncelleniyor...');
  for (const roleKey of SALES_INVOICE_ROLES) {
    if (!matrixDefaults[roleKey]) {
      console.warn(`⚠️  Rol bulunamadı: ${roleKey}`);
      continue;
    }

    // Invoice permission'ları ekle
    Object.assign(matrixDefaults[roleKey], SALES_INVOICE_PERMS);

    // Send yetkisi varsa true yap
    if (SEND_PERMISSION_ROLES.includes(roleKey)) {
      matrixDefaults[roleKey]['einvoice.send'] = true;
      matrixDefaults[roleKey]['edespatch.send'] = true;
    }

    updatedCount++;
    console.log(`  ✅ ${roleKey}${SEND_PERMISSION_ROLES.includes(roleKey) ? ' (send yetkisi var)' : ''}`);
  }

  // Dosyayı kaydet
  template.matrixDefaults = matrixDefaults;
  fs.writeFileSync(TEMPLATE_PATH, JSON.stringify(template, null, 2), 'utf8');

  console.log('\n' + '='.repeat(60));
  console.log(`✅ Toplam ${updatedCount} rol güncellendi`);
  console.log(`📄 Dosya kaydedildi: ${TEMPLATE_PATH}`);
}

main();

