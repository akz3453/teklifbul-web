// migrate-demands-to-recipients.cjs
// Bu script mevcut talepleri demandRecipients koleksiyonuna ekler

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, addDoc, query, where, orderBy, limit } = require('firebase/firestore');

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAbX3UWRPpw-yo4I4HbSdTg82LxvM-fqTE",
  authDomain: "teklifbul.firebaseapp.com",
  projectId: "teklifbul",
  storageBucket: "teklifbul.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function migrateDemandsToRecipients() {
  console.log('🔄 Talepler demandRecipients koleksiyonuna ekleniyor...');
  
  try {
    // Tüm yayınlanmış talepleri al
    const demandsQuery = query(
      collection(db, 'demands'),
      where('published', '==', true),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    
    const demandsSnap = await getDocs(demandsQuery);
    console.log(`📊 Toplam ${demandsSnap.docs.length} yayınlanmış talep bulundu`);
    
    if (demandsSnap.docs.length === 0) {
      console.log('⚠️ Hiç yayınlanmış talep yok');
      return;
    }
    
    // Tüm aktif kullanıcıları al
    const usersQuery = query(
      collection(db, 'users'),
      where('isActive', '==', true)
    );
    
    const usersSnap = await getDocs(usersQuery);
    console.log(`📊 Toplam ${usersSnap.docs.length} aktif kullanıcı bulundu`);
    
    if (usersSnap.docs.length === 0) {
      console.log('⚠️ Hiç aktif kullanıcı yok');
      return;
    }
    
    let totalRecipients = 0;
    let skippedDemands = 0;
    
    // Her talep için eşleştirme yap
    for (const demandDoc of demandsSnap.docs) {
      const demandData = demandDoc.data();
      const demandId = demandDoc.id;
      const demandCategories = demandData.categories || [];
      
      console.log(`\n🔍 Talep işleniyor: ${demandData.title || 'Başlıksız'} (${demandId})`);
      console.log(`📋 Kategoriler: ${demandCategories.join(', ')}`);
      
      if (demandCategories.length === 0) {
        console.log(`⚠️ Talep ${demandId} hiç kategorisi yok, atlanıyor`);
        skippedDemands++;
        continue;
      }
      
      let matchedUsers = 0;
      
      // Her kullanıcı için kategori eşleştirmesi yap
      for (const userDoc of usersSnap.docs) {
        const userData = userDoc.data();
        const userId = userDoc.id;
        const userCategories = userData.categories || [];
        
        // Kendi talebini kendine gönderme
        if (userId === demandData.createdBy) {
          continue;
        }
        
        // Kategori eşleştirmesi kontrol et
        const hasMatchingCategory = demandCategories.some(cat => userCategories.includes(cat));
        
        if (hasMatchingCategory) {
          // Tedarikçi veya hem tedarikçi hem alıcı olan kullanıcıları dahil et
          if (userData.roles?.supplier || userData.roles?.buyer) {
            try {
              // Zaten var mı kontrol et
              const existingQuery = query(
                collection(db, 'demandRecipients'),
                where('demandId', '==', demandId),
                where('supplierId', '==', userId)
              );
              
              const existingSnap = await getDocs(existingQuery);
              
              if (existingSnap.empty) {
                // Yeni demandRecipients kaydı oluştur
                await addDoc(collection(db, 'demandRecipients'), {
                  demandId: demandId,
                  buyerId: demandData.createdBy,
                  supplierId: userId,
                  status: 'pending',
                  matchedAt: new Date(),
                  matchedCategories: demandCategories.filter(cat => userCategories.includes(cat))
                });
                
                console.log(`✅ ${userData.companyName || 'İsimsiz'} kullanıcısına eklendi`);
                matchedUsers++;
                totalRecipients++;
              } else {
                console.log(`⏭️ ${userData.companyName || 'İsimsiz'} kullanıcısı zaten var`);
              }
              
            } catch (error) {
              console.error(`❌ ${userData.companyName || 'İsimsiz'} kullanıcısı eklenemedi:`, error);
            }
          }
        }
      }
      
      console.log(`📊 Talep ${demandId} için ${matchedUsers} kullanıcı eşleştirildi`);
    }
    
    console.log(`\n📊 Migration tamamlandı:`);
    console.log(`✅ Toplam demandRecipients kaydı: ${totalRecipients}`);
    console.log(`⏭️ Atlanan talep sayısı: ${skippedDemands}`);
    console.log(`📊 İşlenen talep sayısı: ${demandsSnap.docs.length}`);
    
  } catch (error) {
    console.error('❌ Migration hatası:', error);
  }
}

// Migration'ı çalıştır
migrateDemandsToRecipients();
