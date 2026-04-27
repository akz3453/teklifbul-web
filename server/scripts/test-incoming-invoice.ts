
import { checkIncomingInvoices } from '../src/services/efaturaService.js';
import { clearProviderCache } from '../src/providers/edoc/index.js';
import { logger } from '../../src/shared/log/logger.js';
import { getAdminDb } from '../utils/firestore.js';
import { FieldValue } from 'firebase-admin/firestore';

// Test ortamı için logger'ı console'a yönlendir (eğer gerekirse)
// logger.add(new transports.Console());

async function runTest() {
    console.log('🧪 Test Başlıyor: Incoming Invoices...');

    const COMPANY_ID = `test-company-${Date.now()}`;
    const USER_ID = 'test-user-1';

    const db = await getAdminDb();
    if (!db) {
        console.error('❌ Firestore bağlanamadı');
        process.exit(1);
    }

    try {
        // 0. Test şirketi oluştur
        console.log(`📝 Test şirketi oluşturuluyor: ${COMPANY_ID}`);
        await db.collection('companies').doc(COMPANY_ID).set({
            name: 'Test Şirketi A.Ş.',
            taxNumber: '1111111111',
            taxOffice: 'Test VD',
            edoc: {
                providerKey: 'mock',
                sender: {
                    vkn: '1111111111',
                    title: 'Test Şirketi A.Ş.'
                }
            },
            createdAt: FieldValue.serverTimestamp()
        });

        // Cache temizle
        clearProviderCache();

        // 1. Gelen faturaları kontrol et
        console.log('🔄 checkIncomingInvoices çalıştırılıyor...');
        const result = await checkIncomingInvoices(COMPANY_ID, USER_ID);

        console.log('✅ İşlem Tamamlandı.');
        console.log(`📊 İşlenen Fatura Sayısı: ${result.processedCount}`);

        if (result.errors.length > 0) {
            console.warn('⚠️ Hatalar:', result.errors);
        } else {
            console.log('✨ Hiç hata yok.');
        }

        // Stok hareketlerini kontrol et
        console.log('📦 Stok hareketleri kontrol ediliyor...');
        const movementsQuery = await db.collection('stock_movements')
            .where('companyId', '==', COMPANY_ID)
            .where('subType', '==', 'PURCHASE')
            .get();

        console.log(`📦 Bulunan stok hareketi sayısı: ${movementsQuery.size}`);
        movementsQuery.forEach(doc => {
            console.log(` - Movement: ${doc.id}, SKU: ${doc.data().sku}, Qty: ${doc.data().qty}`);
        });

    } catch (error) {
        console.error('❌ Test Hatası:', error);
    } finally {
        // Temizlik
        console.log('🧹 Temizlik yapılıyor...');
        await db.collection('companies').doc(COMPANY_ID).delete();

        // Stokları ve hareketleri de temizleyebiliriz ama görmek için kalsın şimdilik
        // await db.collection('stock_movements').where('companyId', '==', COMPANY_ID).get().then(...)

        console.log('👋 Test Bitti.');
        process.exit(0);
    }
}

runTest();
