// Teklifbul Rule v1.0 - Excel -> JSON rol/yetki şablonu export script'i
// Kaynak: resources/templates/rol_yetki_sablonu_v3_doldurulmus.xlsx
// Çıktı: src/shared/data/rolePermissionsTemplate.json
import path from 'path';
import fs from 'fs';
import XLSX from 'xlsx';
const ROOT = process.cwd();
const EXCEL_PATH = path.resolve(ROOT, 'resources', 'templates', 'rol_yetki_sablonu_v3_doldurulmus.xlsx');
const OUTPUT_PATH = path.resolve(ROOT, 'src', 'shared', 'data', 'rolePermissionsTemplate.json');
// Hard-coded label -> permKey mapping (Excel kolon başlıkları)
const PERM_KEY_BY_LABEL = {
    'Teklif Gör': 'bids.view',
    'Teklif Oluştur': 'bids.create',
    'Teklif Düzenle': 'bids.edit',
    'Teklif Onay': 'bids.approve',
    'Teklif Karşılaştır': 'bids.compare',
    'Talep Gör': 'demands.view',
    'Şirket İçi Talep Oluştur': 'demands.internalCreate',
    'Yeni Satın Alma Talebi Oluştur': 'demands.purchaseCreate',
    'Talep Düzenle': 'demands.edit',
    'Talep Onay': 'demands.approve',
    'Stok Listesi Gör': 'stock.view',
    'Yeni Stok Aç': 'stock.create',
    'Stok Bilgisi Düzenle': 'stock.edit',
    'Stok Hareketi: Giriş': 'stock.movements.in',
    'Stok Hareketi: Çıkış': 'stock.movements.out',
    'Stok Hareketi: Transfer': 'stock.movements.transfer',
    'Stok Hareketi: Düzeltme': 'stock.movements.adjust',
    'Stok Kartı İçe Aktar': 'stock.import',
    'Toplu Fiyat Güncelle': 'stock.priceUpdate',
    'Stok Raporları': 'stock.reports',
    'Stok Eksiye Düşme Ayarı': 'stock.allowNegative',
    'Hakediş Gör': 'interim.view',
    'Hakediş İşlem': 'interim.manage',
    // Ödeme Talep (Payments)
    'Ödeme Talep Gör': 'payments.view',
    'Ödeme Talep Oluştur': 'payments.create',
    'Ödeme Talep Düzenle': 'payments.edit',
    'Ödeme Talep Onay': 'payments.approve',
    'Ödeme Talep Dışa Aktar': 'payments.export',
    // E-Fatura / E-İrsaliye
    'E-Fatura Gör': 'einvoice.view',
    'E-Fatura İşlemleri (İçe Aktar/Eşleştir)': 'einvoice.manage',
    'E-Fatura Oluştur': 'einvoice.create',
    'E-Fatura Gönder': 'einvoice.send',
    'E-Fatura Durum Sorgula': 'einvoice.status',
    'E-Fatura İptal': 'einvoice.cancel',
    'E-İrsaliye Gör': 'edespatch.view',
    'E-İrsaliye İşlemleri (İçe Aktar/Eşleştir)': 'edespatch.manage',
    'E-İrsaliye Oluştur': 'edespatch.create',
    'E-İrsaliye Gönder': 'edespatch.send',
    'E-İrsaliye Durum Sorgula': 'edespatch.status',
    'E-İrsaliye İptal': 'edespatch.cancel',
    'E-Belge Entegratör Ayarları': 'edoc.settings.manage',
    // Satışlar
    'Satış Gör': 'sales.view',
    'Satış Oluştur': 'sales.create',
    'Satış Düzenle': 'sales.edit',
    'Onay Sonrası Satış Düzenle': 'sales.edit_after_approve',
    'Satış Onay': 'sales.approve',
    'Satış İptal': 'sales.cancel',
    'Satış Arşivle': 'sales.archive',
    'Satış Sil': 'sales.delete',
    'İrsaliye Oluştur': 'sales.delivery',
    'Fatura Oluştur': 'sales.invoice',
    'Firma Bilgileri Gör': 'settings.company.view',
    'Firma Bilgileri Düzenle': 'settings.company.edit',
    'Şirket Profili Düzenle': 'settings.company.profileEdit',
    'Adres Yönetimi Gör': 'settings.address.view',
    'Adres Yönetimi Ekle': 'settings.address.create',
    'Adres Yönetimi Düzenle': 'settings.address.edit',
    'Kullanıcı İstek Onayla': 'settings.users.approveRequests',
    'Kullanıcı Rol Düzenle': 'settings.users.editRoles',
    'Onay Limiti Belirle': 'settings.approval.setLimit',
    'Premium Satın Alma': 'premium.manage',
    'AI Asistan Kullan': 'premium.ai.useAssistant',
};
// Label -> group mapping
function resolveGroup(label) {
    const l = label.toLowerCase();
    if (l.startsWith('teklif'))
        return 'Teklifler';
    if (l.startsWith('talep') || l.startsWith('şirket içi talep') || l.startsWith('yeni satın alma talebi'))
        return 'Talepler';
    if (l.startsWith('stok'))
        return 'Stok';
    if (l.startsWith('stok hareketi'))
        return 'Stok';
    if (l.startsWith('hakediş'))
        return 'Hakediş';
    // Ödeme talep ve e-fatura / e-irsaliye izinlerini Hakediş sekmesi altında grupla
    if (l.startsWith('ödeme') || l.startsWith('odeme'))
        return 'Hakediş';
    if (l.startsWith('e-fatura') || l.startsWith('efatura') || l.startsWith('fatura '))
        return 'E-Belgeler';
    if (l.startsWith('e-irsaliye') || l.startsWith('eirsaliye') || l.startsWith('irsaliye'))
        return 'E-Belgeler';
    if (l.startsWith('e-belge'))
        return 'E-Belgeler';
    if (l.startsWith('satış') || l.startsWith('satis'))
        return 'Satışlar';
    if (l.startsWith('firma') || l.startsWith('şirket profili') || l.startsWith('adres yönetimi') || l.startsWith('kullanıcı') || l.startsWith('onay limiti'))
        return 'Ayarlar & Kullanıcı Yönetimi';
    if (l.startsWith('premium') || l.startsWith('ai '))
        return 'Premium & AI';
    // Fallback
    return 'Diğer';
}
function ensureDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}
function main() {
    if (!fs.existsSync(EXCEL_PATH)) {
        console.error('Excel dosyası bulunamadı:', EXCEL_PATH);
        process.exit(1);
    }
    const wb = XLSX.readFile(EXCEL_PATH);
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
    if (!rows.length) {
        console.error('Excel sayfası boş');
        process.exit(1);
    }
    const headerRow = rows[0];
    // 0: Rol Kodu, 1: Rol Adı, 2..N: izin kolonları
    const permHeaders = headerRow.slice(2).map((v) => String(v || '').trim()).filter(Boolean);
    // permissions dizisi
    const permissions = permHeaders.map((label) => {
        const key = PERM_KEY_BY_LABEL[label] || label
            .toLowerCase()
            .replace(/[^a-z0-9]+/gi, '_')
            .replace(/^_+|_+$/g, '');
        const group = resolveGroup(label);
        return { key, label, group };
    });
    const allPermKeys = permissions.map((p) => p.key);
    // roles dizisi ve matrixDefaults
    const roles = [];
    const matrixDefaults = {};
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row.length)
            continue;
        const roleKey = String(row[0] || '').trim();
        const roleLabel = String(row[1] || '').trim() || roleKey;
        if (!roleKey)
            continue;
        roles.push({ roleKey, label: roleLabel });
        const permValues = {};
        for (let colIndex = 2; colIndex < headerRow.length; colIndex++) {
            const headerLabel = String(headerRow[colIndex] || '').trim();
            if (!headerLabel)
                continue;
            const permKey = permissions[colIndex - 2]?.key;
            const cell = (row[colIndex] ?? '').toString().trim().toUpperCase();
            let value;
            if (cell === 'EVET')
                value = true;
            else if (cell === 'HAYIR')
                value = false;
            else
                value = true; // default
            if (permKey) {
                permValues[permKey] = value;
            }
        }
        matrixDefaults[roleKey] = permValues;
    }
    const output = {
        roles,
        permissions,
        matrixDefaults,
    };
    ensureDir(OUTPUT_PATH);
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');
    console.log('rolePermissionsTemplate.json oluşturuldu:', OUTPUT_PATH);
}
main();
