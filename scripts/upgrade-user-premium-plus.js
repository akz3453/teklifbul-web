// Teklifbul Rule v1.0 - Kullanıcıyı Premium Plus'a yükseltme scripti
// Kullanım: node scripts/upgrade-user-premium-plus.js <email>

// Teklifbul Rule v1.0 - Firebase Admin SDK ile kullanıcı yükseltme
import admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Firebase Admin initialize
if (!admin.apps.length) {
  try {
    // Service account key dosyasını bul
    const serviceAccountPaths = [
      join(__dirname, '..', 'server', 'serviceAccountKey.json'),
      join(__dirname, '..', 'serviceAccountKey.json'),
      process.env.GOOGLE_APPLICATION_CREDENTIALS,
    ].filter(Boolean);
    
    let credential = null;
    for (const path of serviceAccountPaths) {
      if (path && existsSync(path)) {
        const serviceAccount = JSON.parse(readFileSync(path, 'utf8'));
        credential = admin.credential.cert(serviceAccount);
        console.log(`✅ Service account key bulundu: ${path}`);
        break;
      }
    }
    
    if (!credential) {
      credential = admin.credential.applicationDefault();
      console.log('⚠️ Application default credentials kullanılıyor');
    }
    
    admin.initializeApp({
      credential,
      projectId: 'teklifbul'
    });
    console.log('✅ Firebase Admin SDK başlatıldı');
  } catch (err) {
    console.error('❌ Firebase Admin initialization failed:', err);
    process.exit(1);
  }
}

// Firestore helper
function getAdminDb() {
  return admin.firestore();
}

async function upgradeUserToPremiumPlus(email) {
  try {
    console.log(`🔍 Kullanıcı aranıyor: ${email}`);
    
    const db = getAdminDb();
    
    // Firestore'dan email ile kullanıcıyı bul
    const usersSnapshot = await db.collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();
    
    if (usersSnapshot.empty) {
      console.error(`❌ Kullanıcı bulunamadı: ${email}`);
      console.log('💡 İpucu: Kullanıcının email bilgisi Firestore users koleksiyonunda olmalıdır.');
      process.exit(1);
    }
    
    const userDoc = usersSnapshot.docs[0];
    const uid = userDoc.id;
    console.log(`✅ Kullanıcı bulundu: ${uid}`);
    
    // Kullanıcı dokümanını kontrol et
    const userData = userDoc.data();
    
    console.log(`📋 Mevcut plan: ${userData.planId || 'free'}`);
    
    // Premium Plus planına yükselt
    const oneYearLater = new Date();
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
    
    const updateData = {
      planId: 'premium_plus',
      isPremium: true,
      expiresAt: oneYearLater,
      ai_provider: 'gemini', // Gemini 3.0 ücretsiz hakkı varsa tercih edilir
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: 'admin-script',
    };
    
    // Firestore'da güncelle
    await db.collection('users').doc(uid).update(updateData);
    console.log(`✅ Firestore güncellendi`);
    
    // Subscription kaydı oluştur/güncelle
    const subscriptionData = {
      userId: uid,
      companyId: userData?.companyId,
      planId: 'premium_plus',
      planName: 'Premium Plus',
      status: 'active',
      startedAt: FieldValue.serverTimestamp(),
      currentPeriodEnd: oneYearLater,
      billingInterval: 'yearly',
      cancelAtPeriodEnd: false,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    };
    
    // Mevcut subscription var mı kontrol et
    const existingSubs = await db.collection('subscriptions')
      .where('userId', '==', uid)
      .where('status', '==', 'active')
      .get();
    
    if (!existingSubs.empty) {
      // Mevcut subscription'ı güncelle
      await existingSubs.docs[0].ref.update(subscriptionData);
      console.log(`✅ Mevcut subscription güncellendi`);
    } else {
      // Yeni subscription oluştur
      await db.collection('subscriptions').add(subscriptionData);
      console.log(`✅ Yeni subscription oluşturuldu`);
    }
    
    console.log(`\n🎉 Başarılı!`);
    console.log(`Kullanıcı: ${email}`);
    console.log(`UID: ${uid}`);
    console.log(`Plan: Premium Plus`);
    console.log(`Bitiş Tarihi: ${oneYearLater.toLocaleDateString('tr-TR')}`);
    console.log(`AI Provider: Gemini 3.0`);
    
  } catch (error) {
    console.error('❌ Hata:', error);
    process.exit(1);
  }
}

// Script çalıştırma
const email = process.argv[2];

if (!email) {
  console.error('Kullanım: node scripts/upgrade-user-premium-plus.js <email>');
  console.error('Örnek: node scripts/upgrade-user-premium-plus.js teklifbulalici@gmail.com');
  process.exit(1);
}

upgradeUserToPremiumPlus(email).then(() => {
  console.log('\n✅ İşlem tamamlandı');
  process.exit(0);
}).catch(error => {
  console.error('❌ İşlem başarısız:', error);
  process.exit(1);
});

