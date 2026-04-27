// Teklifbul Rule v1.0
/**
 * Belirtilen email adresine veya User UID'ye sahip kullanıcının premium hesabını aktifleştirir.
 * Çalıştırma:
 *   node scripts/activate-premium-user.js teklifbulalici@gmail.com
 *   node scripts/activate-premium-user.js KsVerlx9wOVD8tEAKCMXpXc693p1
 * 
 * Veya aylık/yıllık plan seçimi:
 *   node scripts/activate-premium-user.js teklifbulalici@gmail.com monthly
 *   node scripts/activate-premium-user.js KsVerlx9wOVD8tEAKCMXpXc693p1 yearly
 */

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dayjs from 'dayjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function initAdmin() {
  if (admin.apps.length) return;
  let credentials;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    const candidate = join(__dirname, '..', 'serviceAccountKey.json');
    if (!existsSync(candidate)) {
      throw new Error('Service account bilgisi bulunamadı. FIREBASE_SERVICE_ACCOUNT veya serviceAccountKey.json sağlayın.');
    }
    credentials = JSON.parse(readFileSync(candidate, 'utf8'));
  }
  admin.initializeApp({
    credential: admin.credential.cert(credentials),
    projectId: credentials.project_id
  });
}

// Plan tanımları (planCatalog.ts ile uyumlu)
const PLAN_DEFINITIONS = {
  premium_monthly: {
    id: 'premium_monthly',
    name: 'Premium Aylık',
    billingInterval: 'monthly',
    intervalDays: 30,
    amount: 400,
    currency: 'TRY'
  },
  premium_yearly: {
    id: 'premium_yearly',
    name: 'Premium Yıllık',
    billingInterval: 'yearly',
    intervalDays: 365,
    amount: 4400,
    currency: 'TRY'
  }
};

async function activatePremiumForUser(identifier, billingInterval = 'monthly') {
  initAdmin();
  const db = admin.firestore();
  
  console.log(`🔍 Kullanıcı aranıyor: ${identifier}`);
  
  let userId = null;
  let userData = null;
  let userDocRef = null;
  
  // 1. Önce UID olarak kontrol et (Firebase UID'ler genellikle 28 karakter)
  if (identifier.length >= 20 && identifier.length <= 30 && !identifier.includes('@')) {
    console.log(`   UID olarak algılandı, Firestore'da aranıyor...`);
    const userDoc = await db.collection('users').doc(identifier).get();
    if (userDoc.exists) {
      userId = identifier;
      userData = userDoc.data();
      userDocRef = userDoc.ref;
      console.log(`   ✅ UID ile kullanıcı bulundu: ${userId}`);
    } else {
      // UID ile bulunamadı, yeni doküman oluştur
      console.log(`   ⚠️  UID ile Firestore'da bulunamadı, yeni doküman oluşturuluyor...`);
      userId = identifier;
      userData = {
        email: 'N/A', // Email bilinmiyor, sonra güncellenebilir
        name: 'N/A',
        createdAt: new Date()
      };
      await db.collection('users').doc(userId).set(userData);
      userDocRef = db.collection('users').doc(userId);
      console.log(`   ✅ Yeni kullanıcı dokümanı oluşturuldu: ${userId}`);
    }
  } else {
    // Email olarak işle
    const normalizedEmail = identifier.toLowerCase().trim();
    
    // 2. Firestore'da email ile ara
    let usersSnapshot = await db.collection('users')
      .where('email', '==', normalizedEmail)
      .limit(1)
      .get();
    
    // 3. Eğer bulunamazsa, case-insensitive arama yap
    if (usersSnapshot.empty) {
      console.log(`   Tam eşleşme bulunamadı, case-insensitive arama yapılıyor...`);
      const allUsersSnapshot = await db.collection('users').get();
      const matchingUsers = allUsersSnapshot.docs.filter(doc => {
        const userEmail = doc.data().email;
        return userEmail && userEmail.toLowerCase().trim() === normalizedEmail;
      });
      
      if (matchingUsers.length > 0) {
        userDocRef = matchingUsers[0].ref;
        userId = matchingUsers[0].id;
        userData = matchingUsers[0].data();
      }
    } else {
      userDocRef = usersSnapshot.docs[0].ref;
      userId = usersSnapshot.docs[0].id;
      userData = usersSnapshot.docs[0].data();
    }
    
    // 4. Eğer hala bulunamadıysa, hata ver
    if (!userId) {
      console.error(`❌ Kullanıcı bulunamadı: ${identifier}`);
      console.error(`\n💡 İpucu:`);
      console.error(`   - Email adresinin doğru yazıldığından emin olun`);
      console.error(`   - User UID ile deneyin: node scripts/activate-premium-user.js <UID> monthly`);
      console.error(`   - Mevcut kullanıcıları görmek için:`);
      console.error(`     node scripts/list-users-by-email.js ""`);
      process.exit(1);
    }
  }
  
  console.log(`✅ Kullanıcı bulundu: ${userId}`);
  console.log(`   Ad: ${userData.name || userData.displayName || 'N/A'}`);
  console.log(`   Email: ${userData.email || email}`);
  console.log(`   Şirket ID: ${userData.companyId || 'N/A'}`);
  
  // Plan seçimi
  const planId = billingInterval === 'yearly' ? 'premium_yearly' : 'premium_monthly';
  const planDefinition = PLAN_DEFINITIONS[planId];
  
  if (!planDefinition) {
    console.error(`❌ Geçersiz plan: ${planId}`);
    process.exit(1);
  }
  
  console.log(`\n📦 Premium plan aktifleştiriliyor:`);
  console.log(`   Plan: ${planDefinition.name}`);
  console.log(`   Faturalama: ${planDefinition.billingInterval}`);
  console.log(`   Tutar: ${planDefinition.amount} ${planDefinition.currency}`);
  
  const now = new Date();
  const currentPeriodEnd = dayjs(now).add(planDefinition.intervalDays, 'day').toDate();
  
  // Mevcut aktif aboneliği kontrol et
  const existingSubs = await db.collection('subscriptions')
    .where('userId', '==', userId)
    .where('status', 'in', ['active', 'trialing'])
    .limit(1)
    .get();
  
  let subscriptionRef;
  if (!existingSubs.empty) {
    // Mevcut aboneliği güncelle
    subscriptionRef = existingSubs.docs[0].ref;
    await subscriptionRef.set({
      planId: planDefinition.id,
      planName: planDefinition.name,
      status: 'active',
      startedAt: now,
      currentPeriodEnd: currentPeriodEnd,
      billingInterval: planDefinition.billingInterval,
      cancelAtPeriodEnd: false,
      updatedAt: now
    }, { merge: true });
    console.log(`\n✅ Mevcut abonelik güncellendi: ${subscriptionRef.id}`);
  } else {
    // Yeni abonelik oluştur
    subscriptionRef = await db.collection('subscriptions').add({
      userId: userId,
      companyId: userData.companyId || null,
      planId: planDefinition.id,
      planName: planDefinition.name,
      status: 'active',
      startedAt: now,
      currentPeriodEnd: currentPeriodEnd,
      billingInterval: planDefinition.billingInterval,
      cancelAtPeriodEnd: false,
      paymentProviderSubscriptionId: `manual-${userId}-${Date.now()}`,
      createdAt: now,
      updatedAt: now
    });
    console.log(`\n✅ Yeni abonelik oluşturuldu: ${subscriptionRef.id}`);
  }
  
  // Kullanıcı plan bilgilerini güncelle (email'i de güncelle eğer identifier email ise)
  // TODO: In the future, consider storing expiresAt as Firestore Timestamp instead of ISO string
  // for better type consistency with subscriptions.currentPeriodEnd
  const updateData = {
    planId: planDefinition.id,
    planName: planDefinition.name,
    billingInterval: planDefinition.billingInterval,
    isPremium: true,
    startedAt: now.toISOString(),
    expiresAt: currentPeriodEnd.toISOString(), // Currently stored as ISO string, normalized in subscriptionService
    cancelAtPeriodEnd: false,
    currentSubscriptionId: subscriptionRef.id,
    updatedAt: now
  };
  
  // Eğer identifier bir email ise ve mevcut email UID gibi görünüyorsa, email'i güncelle
  if (identifier.includes('@') && userData.email && userData.email === userId) {
    updateData.email = identifier.toLowerCase().trim();
    console.log(`   📧 Email güncellendi: ${updateData.email}`);
  }
  
  await db.collection('users').doc(userId).set(updateData, { merge: true });
  
  console.log(`\n✅ Kullanıcı plan bilgileri güncellendi`);
  
  // Audit log ekle
  await db.collection('audit_logs').add({
    userId: userId,
    type: 'subscription_activated_manual',
    meta: {
      planId: planDefinition.id,
      planName: planDefinition.name,
      billingInterval: planDefinition.billingInterval,
      startedAt: now.toISOString(),
      currentPeriodEnd: currentPeriodEnd.toISOString(),
      activatedBy: 'admin_script'
    },
    createdAt: now
  });
  
  console.log(`\n📊 Özet:`);
  console.log(`   Kullanıcı ID: ${userId}`);
  console.log(`   Email: ${email}`);
  console.log(`   Plan: ${planDefinition.name}`);
  console.log(`   Başlangıç: ${now.toLocaleString('tr-TR')}`);
  console.log(`   Bitiş: ${currentPeriodEnd.toLocaleString('tr-TR')}`);
  console.log(`   Kalan Gün: ${dayjs(currentPeriodEnd).diff(now, 'day')} gün`);
  console.log(`\n🎉 Premium hesap başarıyla aktifleştirildi!`);
  
  process.exit(0);
}

// Komut satırı argümanlarını al
const email = process.argv[2];
const billingInterval = process.argv[3] || 'monthly';

if (!email) {
  console.error('❌ Kullanım: node scripts/activate-premium-user.js <email> [monthly|yearly]');
  console.error('   Örnek: node scripts/activate-premium-user.js teklifbulalici@gmail.com monthly');
  process.exit(1);
}

if (billingInterval !== 'monthly' && billingInterval !== 'yearly') {
  console.error('❌ Geçersiz faturalama aralığı. monthly veya yearly olmalı.');
  process.exit(1);
}

activatePremiumForUser(email, billingInterval).catch((err) => {
  console.error('❌ Premium aktifleştirme hatası:', err);
  process.exit(1);
});

