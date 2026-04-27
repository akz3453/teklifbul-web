// Teklifbul Rule v1.0 - Kullanıcıyı admin yapma scripti
// Kullanım: node scripts/set-admin-user.js <email>

// Teklifbul Rule v1.0 - Firebase Admin SDK ile admin yetkisi verme
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

async function setAdminUser(email) {
  try {
    console.log(`🔍 Kullanıcı aranıyor: ${email}`);
    
    const db = getAdminDb();
    
    // Önce Firestore'dan email ile kullanıcıyı bul (email field veya contactEmails array'inde)
    let usersSnapshot = await db.collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();
    
    let uid;
    if (!usersSnapshot.empty) {
      uid = usersSnapshot.docs[0].id;
      console.log(`✅ Firestore'da kullanıcı bulundu (email field): ${uid}`);
    } else {
      // contactEmails array'inde ara (array-contains kullanarak)
      console.log(`⚠️ Email field'da bulunamadı, contactEmails array'inde aranıyor...`);
      usersSnapshot = await db.collection('users')
        .where('contactEmails', 'array-contains', email)
        .limit(1)
        .get();
      
      if (!usersSnapshot.empty) {
        uid = usersSnapshot.docs[0].id;
        console.log(`✅ Firestore'da kullanıcı bulundu (contactEmails): ${uid}`);
      } else {
        // Firestore'da yoksa Firebase Auth'dan bulmayı dene
        console.log(`⚠️ Firestore'da bulunamadı, Firebase Auth'dan aranıyor...`);
        try {
          const authUser = await admin.auth().getUserByEmail(email);
          uid = authUser.uid;
          console.log(`✅ Firebase Auth'da kullanıcı bulundu: ${uid}`);
          // Firebase Auth'da bulunduysa Firestore'da da doküman oluştur
          await db.collection('users').doc(uid).set({
            email: email,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          }, { merge: true });
          console.log(`✅ Firestore'da kullanıcı dokümanı oluşturuldu`);
        } catch (authError) {
          if (authError.code === 'auth/user-not-found' || authError.code === 'auth/internal-error') {
            console.error(`❌ Kullanıcı bulunamadı: ${email}`);
            console.log('\n💡 Çözüm seçenekleri:');
            console.log('1. Kullanıcının önce sisteme kayıt olması gerekir (signup/login)');
            console.log('2. Veya Firebase Console\'dan manuel olarak kullanıcı oluşturun');
            console.log('3. Veya Firestore users koleksiyonunda email ile doküman oluşturun');
            console.log('\n⚠️  Not: Firebase Auth API izni olmadığı için direkt kullanıcı oluşturamıyoruz.');
            process.exit(1);
          }
          throw authError;
        }
      }
    }
    
    // Mevcut admin durumunu Firestore'dan kontrol et
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const isAdmin = userData?.isAdmin === true || userData?.role === 'admin';
    const isOps = userData?.isOps === true || userData?.role === 'ops';
    
    console.log(`📋 Mevcut Firestore verisi:`, userData);
    console.log(`📋 Admin durumu: ${isAdmin ? '✅ Admin' : '❌ Admin değil'}`);
    console.log(`📋 Ops durumu: ${isOps ? '✅ Ops' : '❌ Ops değil'}`);
    
    if (isAdmin || isOps) {
      console.log(`\n✅ Kullanıcı zaten admin/ops yetkisine sahip!`);
      console.log(`Kullanıcı: ${email}`);
      console.log(`UID: ${uid}`);
      return;
    }
    
    // Firestore'da admin bilgisini güncelle
    console.log(`\n🔧 Admin yetkisi Firestore'da ayarlanıyor...`);
    
    try {
      if (userDoc.exists) {
        await db.collection('users').doc(uid).update({
          isAdmin: true,
          role: 'admin',
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: 'admin-script'
        });
        console.log(`✅ Firestore users koleksiyonu güncellendi`);
      } else {
        // Kullanıcı dokümanı yoksa oluştur
        await db.collection('users').doc(uid).set({
          email: email,
          isAdmin: true,
          role: 'admin',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: 'admin-script'
        });
        console.log(`✅ Firestore'da yeni kullanıcı dokümanı oluşturuldu ve admin yapıldı`);
      }
    } catch (firestoreError) {
      console.error(`❌ Firestore güncelleme hatası:`, firestoreError.message);
      throw firestoreError;
    }
    
    // Firebase Auth custom claims'i güncellemeyi deneyelim (izin varsa)
    try {
      const authUser = await admin.auth().getUser(uid);
      const currentClaims = authUser.customClaims || {};
      const newClaims = {
        ...currentClaims,
        admin: true,
        role: 'admin'
      };
      await admin.auth().setCustomUserClaims(uid, newClaims);
      console.log(`✅ Firebase Auth custom claims güncellendi`);
    } catch (authError) {
      console.warn(`⚠️ Firebase Auth custom claims güncellenemedi (izin yok, normal):`, authError.message);
      console.log(`💡 Firestore'dan admin kontrolü yapılacak, bu yeterli olacaktır.`);
    }
    
    console.log(`\n🎉 Başarılı!`);
    console.log(`Kullanıcı: ${email}`);
    console.log(`UID: ${uid}`);
    console.log(`Admin yetkisi: ✅ Aktif`);
    console.log(`\n💡 Not: Kullanıcının yeni token alması için çıkış yapıp tekrar giriş yapması gerekebilir.`);
    
  } catch (error) {
    console.error('❌ Hata:', error);
    if (error.code) {
      console.error(`Hata kodu: ${error.code}`);
    }
    process.exit(1);
  }
}

// Script çalıştırma
const email = process.argv[2];

if (!email) {
  console.error('Kullanım: node scripts/set-admin-user.js <email>');
  console.error('Örnek: node scripts/set-admin-user.js akyildizfaruk@gmail.com');
  process.exit(1);
}

setAdminUser(email).then(() => {
  console.log('\n✅ İşlem tamamlandı');
  process.exit(0);
}).catch(error => {
  console.error('❌ İşlem başarısız:', error);
  process.exit(1);
});

