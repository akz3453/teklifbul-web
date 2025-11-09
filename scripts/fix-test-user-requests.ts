/**
 * teklifbulalici@gmail.com kullanıcısının şirketi için
 * bekleyen isteklerdeki eksik bilgileri düzelt ve test amaçlı doldur
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

async function fixTestUserRequests() {
  try {
    console.log('🔧 teklifbulalici@gmail.com şirketi için bekleyen istekler düzeltiliyor...\n');

    // Önce kullanıcıyı bul - email ile sorgu çalışmıyorsa tüm kullanıcıları kontrol et
    let userDoc = null;
    let userData = null;
    let companyId = null;
    
    try {
      const usersQuery = query(
        collection(db, 'users'),
        where('email', '==', 'teklifbulalici@gmail.com')
      );
      
      const usersSnapshot = await getDocs(usersQuery);
      
      if (!usersSnapshot.empty) {
        userDoc = usersSnapshot.docs[0];
        userData = userDoc.data();
        companyId = userData.companyId || (userData.companies && userData.companies[0]);
      }
    } catch (emailQueryError) {
      console.warn('⚠️ Email sorgusu başarısız, tüm kullanıcılar kontrol ediliyor...');
      
      // Tüm kullanıcıları çek ve email ile filtrele
      const allUsersSnapshot = await getDocs(collection(db, 'users'));
      for (const docSnap of allUsersSnapshot.docs) {
        const data = docSnap.data();
        if (data.email === 'teklifbulalici@gmail.com') {
          userDoc = docSnap;
          userData = data;
          companyId = data.companyId || (data.companies && data.companies[0]);
          break;
        }
      }
    }
    
    if (!userDoc || !userData) {
      console.log('❌ teklifbulalici@gmail.com kullanıcısı bulunamadı.');
      return;
    }
    
    if (!companyId) {
      console.log('❌ Şirket bilgisi bulunamadı.');
      return;
    }
    
    if (!companyId) {
      console.log('❌ Şirket bilgisi bulunamadı.');
      return;
    }
    
    console.log(`✅ Kullanıcı bulundu: ${userDoc.id}`);
    console.log(`✅ Şirket ID: ${companyId}\n`);
    
    // Şirket bilgilerini al
    const companyDoc = await getDoc(doc(db, 'companies', companyId));
    if (!companyDoc.exists()) {
      console.log('❌ Şirket bulunamadı.');
      return;
    }
    
    const companyData = companyDoc.data();
    const companyCode = companyData.code;
    
    if (!companyCode) {
      console.log('❌ Şirket kodu bulunamadı.');
      return;
    }
    
    console.log(`✅ Şirket kodu: ${companyCode}\n`);
    
    // Bu şirkete ait bekleyen istekleri bul
    const requestsQuery = query(
      collection(db, 'companyJoinRequests'),
      where('companyCode', '==', companyCode),
      where('status', '==', 'pending')
    );
    
    const requestsSnapshot = await getDocs(requestsQuery);
    
    if (requestsSnapshot.empty) {
      console.log('✅ Bekleyen istek bulunamadı.');
      return;
    }
    
    console.log(`📋 Toplam ${requestsSnapshot.size} bekleyen istek bulundu.\n`);
    
    let fixedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    // Test amaçlı email listesi (sırayla kullanılacak)
    const testEmails = [
      'test1@example.com',
      'test2@example.com',
      'test3@example.com',
      'test4@example.com',
      'test5@example.com',
      'test6@example.com',
      'test7@example.com',
      'test8@example.com',
      'test9@example.com',
      'test10@example.com'
    ];
    
    let emailIndex = 0;
    
    for (const requestDoc of requestsSnapshot.docs) {
      const requestId = requestDoc.id;
      const requestData = requestDoc.data();
      
      try {
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
            const userDocForRequest = await getDoc(doc(db, 'users', userId));
            if (userDocForRequest.exists()) {
              const userDataForRequest = userDocForRequest.data();
              
              // Email eksikse kullanıcıdan al veya test email kullan
              if (!userEmail || userEmail === 'E-posta bulunamadı') {
                const userEmailFromDoc = userDataForRequest.email || userDataForRequest.userEmail;
                if (userEmailFromDoc) {
                  updateData.userEmail = userEmailFromDoc;
                  userEmail = userEmailFromDoc;
                  needsUpdate = true;
                  console.log(`✅ ${requestId}: Email kullanıcıdan alındı: ${userEmailFromDoc}`);
                } else if (emailIndex < testEmails.length) {
                  // Test amaçlı email kullan
                  updateData.userEmail = testEmails[emailIndex];
                  userEmail = testEmails[emailIndex];
                  emailIndex++;
                  needsUpdate = true;
                  console.log(`✅ ${requestId}: Test email eklendi: ${testEmails[emailIndex - 1]}`);
                }
              }
              
              // Display name eksikse kullanıcıdan al veya test name oluştur
              if (!userDisplayName) {
                const userDisplayNameFromDoc = userDataForRequest.displayName || userDataForRequest.name;
                if (userDisplayNameFromDoc) {
                  updateData.userDisplayName = userDisplayNameFromDoc;
                  userDisplayName = userDisplayNameFromDoc;
                  needsUpdate = true;
                  console.log(`✅ ${requestId}: Display name kullanıcıdan alındı: ${userDisplayNameFromDoc}`);
                } else {
                  // Test amaçlı display name oluştur
                  const testName = `Test Kullanıcı ${emailIndex}`;
                  updateData.userDisplayName = testName;
                  userDisplayName = testName;
                  needsUpdate = true;
                  console.log(`✅ ${requestId}: Test display name eklendi: ${testName}`);
                }
              }
            } else {
              console.warn(`⚠️ ${requestId}: Kullanıcı bulunamadı (userId: ${userId})`);
              // Kullanıcı yoksa test email ve name ekle
              if (!userEmail || userEmail === 'E-posta bulunamadı') {
                if (emailIndex < testEmails.length) {
                  updateData.userEmail = testEmails[emailIndex];
                  emailIndex++;
                  needsUpdate = true;
                  console.log(`✅ ${requestId}: Test email eklendi (kullanıcı yok): ${testEmails[emailIndex - 1]}`);
                }
              }
              if (!userDisplayName) {
                const testName = `Test Kullanıcı ${emailIndex}`;
                updateData.userDisplayName = testName;
                needsUpdate = true;
                console.log(`✅ ${requestId}: Test display name eklendi (kullanıcı yok): ${testName}`);
              }
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
        
        // companyCode eksikse ekle
        if (!requestData.companyCode) {
          updateData.companyCode = companyCode;
          needsUpdate = true;
          console.log(`✅ ${requestId}: companyCode eklendi: ${companyCode}`);
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
fixTestUserRequests()
  .then(() => {
    console.log('\n✅ İşlem tamamlandı!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script hatası:', error);
    process.exit(1);
  });

