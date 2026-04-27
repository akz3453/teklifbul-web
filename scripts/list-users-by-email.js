// Teklifbul Rule v1.0
/**
 * Email ile kullanıcı arama ve listeleme scripti
 * Çalıştırma:
 *   node scripts/list-users-by-email.js teklifbulalici
 *   node scripts/list-users-by-email.js teklifbulalici@gmail.com
 */

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

async function searchUsers(searchTerm) {
  initAdmin();
  const db = admin.firestore();
  
  console.log(`🔍 Kullanıcılar aranıyor: "${searchTerm}"\n`);
  
  // Tüm kullanıcıları al
  const allUsersSnapshot = await db.collection('users').get();
  
  const searchLower = searchTerm.toLowerCase().trim();
  const matchingUsers = [];
  
  allUsersSnapshot.docs.forEach(doc => {
    const userData = doc.data();
    const email = (userData.email || '').toLowerCase();
    const name = (userData.name || userData.displayName || '').toLowerCase();
    const userId = doc.id;
    
    // Email veya isimde arama terimi var mı?
    if (email.includes(searchLower) || name.includes(searchLower) || userId.includes(searchLower)) {
      matchingUsers.push({
        id: userId,
        email: userData.email || 'N/A',
        name: userData.name || userData.displayName || 'N/A',
        companyId: userData.companyId || 'N/A',
        isPremium: userData.isPremium || false,
        planId: userData.planId || 'free',
        ...userData
      });
    }
  });
  
  if (matchingUsers.length === 0) {
    console.log(`❌ Hiç kullanıcı bulunamadı: "${searchTerm}"\n`);
    console.log(`💡 Tüm kullanıcıları görmek için:`);
    console.log(`   node scripts/list-users-by-email.js ""`);
    process.exit(1);
  }
  
  console.log(`✅ ${matchingUsers.length} kullanıcı bulundu:\n`);
  matchingUsers.forEach((user, index) => {
    console.log(`${index + 1}. ${user.name}`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Şirket ID: ${user.companyId}`);
    console.log(`   Plan: ${user.planId} (Premium: ${user.isPremium ? 'Evet' : 'Hayır'})`);
    if (user.expiresAt) {
      console.log(`   Bitiş Tarihi: ${user.expiresAt}`);
    }
    console.log('');
  });
  
  // Eğer tek bir kullanıcı bulunduysa, premium aktifleştirme komutunu göster
  if (matchingUsers.length === 1) {
    const user = matchingUsers[0];
    console.log(`\n🚀 Bu kullanıcı için premium aktifleştirmek için:`);
    console.log(`   node scripts/activate-premium-user.js ${user.email} monthly`);
  }
  
  process.exit(0);
}

const searchTerm = process.argv[2] || '';

if (!searchTerm) {
  console.log('📋 Tüm kullanıcılar listeleniyor...\n');
}

searchUsers(searchTerm).catch((err) => {
  console.error('❌ Kullanıcı arama hatası:', err);
  process.exit(1);
});

