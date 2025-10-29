// migrate-bids-add-buyerid-simple.cjs
// Bu script mevcut tekliflere buyerId alanını ekler (basit versiyon)

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, updateDoc, doc, query, where } = require('firebase/firestore');

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

async function migrateBidsAddBuyerIdSimple() {
  console.log('🔄 Tekliflere buyerId alanı ekleniyor (basit versiyon)...');
  
  try {
    // Tüm teklifleri al
    const bidsSnapshot = await getDocs(collection(db, 'bids'));
    console.log(`📊 Toplam ${bidsSnapshot.docs.length} teklif bulundu`);
    
    if (bidsSnapshot.docs.length === 0) {
      console.log('⚠️ Hiç teklif yok');
      return;
    }
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const bidDoc of bidsSnapshot.docs) {
      const bidData = bidDoc.data();
      
      // Eğer buyerId zaten varsa atla
      if (bidData.buyerId) {
        console.log(`⏭️ Teklif ${bidDoc.id} zaten buyerId'ye sahip: ${bidData.buyerId}`);
        skippedCount++;
        continue;
      }
      
      // demandId'den talep bilgisini al
      if (!bidData.demandId) {
        console.log(`⚠️ Teklif ${bidDoc.id} demandId'ye sahip değil, atlanıyor`);
        skippedCount++;
        continue;
      }
      
      try {
        // Talep bilgisini al
        const demandDoc = await getDoc(doc(db, 'demands', bidData.demandId));
        
        if (!demandDoc.exists()) {
          console.log(`⚠️ Teklif ${bidDoc.id} için talep bulunamadı: ${bidData.demandId}`);
          skippedCount++;
          continue;
        }
        
        const demandData = demandDoc.data();
        const buyerId = demandData.createdBy;
        
        if (!buyerId) {
          console.log(`⚠️ Talep ${bidData.demandId} createdBy alanına sahip değil`);
          skippedCount++;
          continue;
        }
        
        // buyerId'yi ekle
        await updateDoc(doc(db, 'bids', bidDoc.id), {
          buyerId: buyerId
        });
        
        console.log(`✅ Teklif ${bidDoc.id} güncellendi - buyerId: ${buyerId}`);
        updatedCount++;
        
      } catch (error) {
        console.error(`❌ Teklif ${bidDoc.id} güncellenemedi:`, error);
        skippedCount++;
      }
    }
    
    console.log(`\n📊 Migration tamamlandı:`);
    console.log(`✅ Güncellenen: ${updatedCount}`);
    console.log(`⏭️ Atlanan: ${skippedCount}`);
    console.log(`📊 Toplam: ${bidsSnapshot.docs.length}`);
    
  } catch (error) {
    console.error('❌ Migration hatası:', error);
  }
}

// Migration'ı çalıştır
migrateBidsAddBuyerIdSimple();
