/**
 * Bekleyen şirket katılım isteklerini düzelt
 * - userId eksik olan kayıtları düzeltir
 * - requesterUserId varsa userId'ye kopyalar
 * - Eksik bilgileri doldurur
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, updateDoc, doc, getDoc } from 'firebase/firestore';
import * as dotenv from 'dotenv';

dotenv.config();

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function fixCompanyJoinRequests() {
  try {
    console.log('🔧 Bekleyen şirket katılım istekleri düzeltiliyor...\n');

    // Tüm bekleyen istekleri bul (status kontrolü olmadan, tüm kayıtları çek)
    // Bazı kayıtlarda status alanı olmayabilir veya farklı formatta olabilir
    const requestsRef = collection(db, 'companyJoinRequests');
    const requestsSnapshot = await getDocs(requestsRef);

    if (requestsSnapshot.empty) {
      console.log('✅ Bekleyen istek bulunamadı.');
      return;
    }

    console.log(`📋 Toplam ${requestsSnapshot.size} bekleyen istek bulundu.\n`);

    let fixedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const requestDoc of requestsSnapshot.docs) {
      const requestId = requestDoc.id;
      const requestData = requestDoc.data();

      try {
        // Status kontrolü - pending olmayanları atla
        const status = requestData.status;
        if (status && status !== 'pending') {
          console.log(`ℹ️ ${requestId}: Status '${status}', atlanıyor`);
          continue;
        }

        // userId kontrolü
        let userId = requestData.userId;
        let needsUpdate = false;
        const updateData: any = {};

        // Eğer userId yoksa, requesterUserId'yi kullan
        if (!userId || typeof userId !== 'string' || userId.trim() === '') {
          if (requestData.requesterUserId && typeof requestData.requesterUserId === 'string') {
            userId = requestData.requesterUserId;
            updateData.userId = userId;
            needsUpdate = true;
            console.log(`✅ ${requestId}: requesterUserId → userId kopyalandı: ${userId}`);
          } else {
            console.warn(`⚠️ ${requestId}: userId ve requesterUserId bulunamadı, atlanıyor`);
            skippedCount++;
            continue;
          }
        }

        // Kullanıcı bilgilerini kontrol et ve eksikleri doldur
        let userEmail = requestData.userEmail;
        let userDisplayName = requestData.userDisplayName || requestData.displayName;

        if (userId) {
          try {
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              
              // Email eksikse kullanıcıdan al
              if (!userEmail || userEmail === 'E-posta bulunamadı') {
                const userEmailFromDoc = userData.email || userData.userEmail;
                if (userEmailFromDoc) {
                  updateData.userEmail = userEmailFromDoc;
                  userEmail = userEmailFromDoc;
                  needsUpdate = true;
                  console.log(`✅ ${requestId}: Email düzeltildi: ${userEmailFromDoc}`);
                }
              }

              // Display name eksikse kullanıcıdan al
              if (!userDisplayName) {
                const userDisplayNameFromDoc = userData.displayName || userData.name;
                if (userDisplayNameFromDoc) {
                  updateData.userDisplayName = userDisplayNameFromDoc;
                  userDisplayName = userDisplayNameFromDoc;
                  needsUpdate = true;
                  console.log(`✅ ${requestId}: Display name düzeltildi: ${userDisplayNameFromDoc}`);
                }
              }
            } else {
              console.warn(`⚠️ ${requestId}: Kullanıcı bulunamadı (userId: ${userId})`);
            }
          } catch (userError) {
            console.warn(`⚠️ ${requestId}: Kullanıcı bilgileri alınırken hata:`, userError);
          }
        }

        // Rol bilgilerini kontrol et
        let requestedRole = requestData.requestedRole;
        let requestedCompanyRole = requestData.requestedCompanyRole;

        // Eğer requestedRole yoksa, role objesinden çıkar
        if (!requestedRole && requestData.role) {
          if (typeof requestData.role === 'string') {
            requestedRole = requestData.role;
            updateData.requestedRole = requestedRole;
            needsUpdate = true;
            console.log(`✅ ${requestId}: requestedRole düzeltildi: ${requestedRole}`);
          } else if (typeof requestData.role === 'object') {
            // Role objesi varsa, buyer veya supplier kontrolü yap
            const roleObj = requestData.role;
            if (roleObj.supplier) {
              requestedRole = 'supplier';
            } else if (roleObj.buyer) {
              requestedRole = 'buyer';
            } else {
              requestedRole = 'buyer'; // Varsayılan
            }
            updateData.requestedRole = requestedRole;
            needsUpdate = true;
            console.log(`✅ ${requestId}: requestedRole objeden çıkarıldı: ${requestedRole}`);
          }
        }

        // requestedCompanyRole eksikse, requestedRole'dan oluştur
        if (!requestedCompanyRole && requestedRole) {
          // Basit format (supplier/buyer) ise, detaylı formata çevir
          if (requestedRole === 'supplier') {
            requestedCompanyRole = 'supplier:tedarikci';
          } else if (requestedRole === 'buyer') {
            requestedCompanyRole = 'buyer:satinalma_yetkilisi';
          } else {
            requestedCompanyRole = requestedRole;
          }
          updateData.requestedCompanyRole = requestedCompanyRole;
          needsUpdate = true;
          console.log(`✅ ${requestId}: requestedCompanyRole oluşturuldu: ${requestedCompanyRole}`);
        }

        // companyCode eksikse, companyId'den şirket bilgilerini al
        if (!requestData.companyCode && requestData.companyId) {
          try {
            const companyDoc = await getDoc(doc(db, 'companies', requestData.companyId));
            if (companyDoc.exists()) {
              const companyData = companyDoc.data();
              if (companyData.code) {
                updateData.companyCode = companyData.code;
                needsUpdate = true;
                console.log(`✅ ${requestId}: companyCode düzeltildi: ${companyData.code}`);
              }
            }
          } catch (companyError) {
            console.warn(`⚠️ ${requestId}: Şirket bilgileri alınırken hata:`, companyError);
          }
        }

        // Güncelleme yap
        if (needsUpdate) {
          await updateDoc(doc(db, 'companyJoinRequests', requestId), updateData);
          fixedCount++;
          console.log(`✅ ${requestId}: Kayıt düzeltildi\n`);
        } else {
          console.log(`ℹ️ ${requestId}: Düzeltme gerekmiyor\n`);
        }

      } catch (error) {
        console.error(`❌ ${requestId}: Hata:`, error);
        errorCount++;
      }
    }

    console.log('\n📊 ÖZET:');
    console.log(`✅ Düzeltilen: ${fixedCount}`);
    console.log(`⚠️ Atlanan: ${skippedCount}`);
    console.log(`❌ Hata: ${errorCount}`);
    console.log(`📋 Toplam: ${requestsSnapshot.size}`);

  } catch (error) {
    console.error('❌ Genel hata:', error);
    process.exit(1);
  }
}

// Script'i çalıştır
fixCompanyJoinRequests()
  .then(() => {
    console.log('\n✅ İşlem tamamlandı!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script hatası:', error);
    process.exit(1);
  });

