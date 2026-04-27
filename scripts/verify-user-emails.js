/**
 * Kullanıcı Email Doğrulama Script'i
 * Teklifbul Rule v1.0 - Admin işlemleri
 * 
 * Kullanım: node scripts/verify-user-emails.js
 */

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Firebase Admin initialize
function getAdminDb() {
  if (!admin.apps.length) {
    const serviceAccountPath = path.join(__dirname, '..', 'server', 'firebase-service-account.json');
    
    if (existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'teklifbul'
      });
    } else {
      // Application default credentials kullan
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: 'teklifbul'
      });
    }
  }
  
  return admin.firestore();
}

async function verifyUserEmails(userIds) {
  const db = getAdminDb();
  
  console.log('🔧 Kullanıcı email doğrulamaları yapılıyor...\n');
  
  for (const userId of userIds) {
    try {
      console.log(`📧 Kullanıcı ID: ${userId}`);
      
      // Firestore'dan kullanıcıyı al
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.exists ? userDoc.data() : null;
      
      if (!userDoc.exists) {
        console.log(`   ⚠️  Firestore'da kullanıcı bulunamadı, Firebase Auth'dan kontrol ediliyor...`);
      } else {
        console.log(`   📋 Firestore email: ${userData?.email || 'Yok'}`);
      }
      
      // Firebase Auth'dan kullanıcıyı al (opsiyonel - permission hatası olabilir)
      let authUser = null;
      let authEmail = null;
      try {
        authUser = await admin.auth().getUser(userId);
        authEmail = authUser.email;
        console.log(`   📋 Auth email: ${authEmail || 'Yok'}`);
        console.log(`   📋 Email doğrulama durumu: ${authUser.emailVerified ? '✅ Doğrulanmış' : '❌ Doğrulanmamış'}`);
        
        // Email doğrulamasını yap (Firebase Auth'da)
        if (!authUser.emailVerified) {
          try {
            await admin.auth().updateUser(userId, {
              emailVerified: true
            });
            console.log(`   ✅ Email doğrulaması Firebase Auth'da yapıldı`);
          } catch (updateError) {
            console.log(`   ⚠️  Firebase Auth emailVerified güncellenemedi (permission hatası olabilir): ${updateError.message}`);
            // Devam et, Firestore'da güncelleme yapılacak
          }
        } else {
          console.log(`   ℹ️  Email zaten doğrulanmış (Firebase Auth)`);
        }
      } catch (authError) {
        console.log(`   ⚠️  Firebase Auth erişimi yok (permission hatası olabilir), sadece Firestore güncellenecek`);
        // Devam et, Firestore'da güncelleme yapılacak
      }
      
      // Firestore'da emailVerified alanını güncelle
      const firestoreEmail = userData?.email || authEmail;
      if (userDoc.exists) {
        const updateData = {
          emailVerified: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: 'admin-script'
        };
        
        // Email yoksa ve Auth'dan geldiyse ekle
        if (!userData?.email && authEmail) {
          updateData.email = authEmail;
        }
        
        await db.collection('users').doc(userId).update(updateData);
        console.log(`   ✅ Firestore'da emailVerified güncellendi`);
        if (updateData.email) {
          console.log(`   ✅ Firestore'da email eklendi: ${updateData.email}`);
        }
      } else {
        // Kullanıcı dokümanı yoksa oluştur
        const createData = {
          emailVerified: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: 'admin-script'
        };
        
        if (firestoreEmail) {
          createData.email = firestoreEmail;
        }
        
        await db.collection('users').doc(userId).set(createData, { merge: true });
        console.log(`   ✅ Firestore'da kullanıcı dokümanı oluşturuldu ve emailVerified ayarlandı`);
        if (createData.email) {
          console.log(`   ✅ Email eklendi: ${createData.email}`);
        }
      }
      
      console.log(`   ✅ Tamamlandı\n`);
    } catch (error) {
      console.error(`   ❌ Hata: ${error.message}\n`);
    }
  }
  
  console.log('🎉 Tüm işlemler tamamlandı!');
  process.exit(0);
}

// Script çalıştır
const userIds = [
  'usDUqJRr1fQgxMCvehacNucjoDw2',
  'KsVerlx9wOVD8tEAKCMXpXc693p1'
];

verifyUserEmails(userIds).catch(error => {
  console.error('❌ Script hatası:', error);
  process.exit(1);
});

