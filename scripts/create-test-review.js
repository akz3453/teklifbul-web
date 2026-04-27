/**
 * Test Yorumu Oluşturma Scripti
 * Teklifbul Rule v1.0 - Test amaçlı yorum oluşturur
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
// Teklifbul Rule v1.0 - Bundle Size: Named import for tree shaking
import { config } from 'dotenv';

config();

// Firebase config
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyDxJqJqJqJqJqJqJqJqJqJqJqJqJqJqJq",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "teklifbul.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "teklifbul",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "teklifbul.appspot.com",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "636669818119",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:636669818119:web:abc123"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function createTestReview() {
  try {
    console.log('🔐 Kullanıcı girişi yapılıyor...');
    
    // Kullanıcıya giriş yap
    const userCredential = await signInWithEmailAndPassword(
      auth,
      'teklifbultedarikci1@gmail.com',
      'test123' // Şifre bilinmiyorsa, kullanıcıdan alınmalı veya başka bir yöntem kullanılmalı
    );
    
    console.log('✅ Kullanıcı girişi başarılı:', userCredential.user.email);
    
    // Kullanıcının şirket ID'sini bul
    const { doc, getDoc } = await import('firebase/firestore');
    const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
    
    if (!userDoc.exists()) {
      throw new Error('Kullanıcı bulunamadı');
    }
    
    const userData = userDoc.data();
    const companyId = userData.companyId || (userData.companies && userData.companies[0]);
    
    if (!companyId) {
      throw new Error('Kullanıcının şirketi bulunamadı');
    }
    
    console.log('📦 Şirket ID bulundu:', companyId);
    
    // Şirket bilgilerini al
    const companyDoc = await getDoc(doc(db, 'companies', companyId));
    if (!companyDoc.exists()) {
      throw new Error('Şirket bulunamadı');
    }
    
    const companyData = companyDoc.data();
    console.log('🏢 Şirket:', companyData.companyName || companyId);
    
    // Test yorumu için başka bir şirket ID'si bul (yorum yapan firma)
    // Örnek: İlk bulunan başka bir şirket
    const companiesQuery = query(collection(db, 'companies'), where('companyName', '!=', companyData.companyName || ''));
    const companiesSnapshot = await getDocs(companiesQuery);
    
    let reviewerCompanyId = null;
    if (!companiesSnapshot.empty) {
      reviewerCompanyId = companiesSnapshot.docs[0].id;
      const reviewerCompanyData = companiesSnapshot.docs[0].data();
      console.log('👤 Yorum yapan firma:', reviewerCompanyData.companyName || reviewerCompanyId);
    } else {
      // Eğer başka şirket yoksa, kendi şirketini kullan (test için)
      reviewerCompanyId = companyId;
      console.log('⚠️ Başka şirket bulunamadı, test için aynı şirket kullanılıyor');
    }
    
    // Test yorumu oluştur
    console.log('📝 Test yorumu oluşturuluyor...');
    
    const reviewData = {
      companyId: companyId, // Yorum yapılan şirket
      reviewerCompanyId: reviewerCompanyId, // Yorum yapan firma
      rating: 5,
      comment: 'Test yorumu: Bu firma ile çalışma deneyimimiz çok olumluydu. Hızlı teslimat ve kaliteli ürünler. Kesinlikle tekrar çalışırız!',
      createdAt: serverTimestamp(),
      source: 'internal',
      isTest: true // Test yorumu olduğunu belirt
    };
    
    const reviewRef = await addDoc(collection(db, 'reviews'), reviewData);
    
    console.log('✅ Test yorumu başarıyla oluşturuldu!');
    console.log('📋 Yorum ID:', reviewRef.id);
    console.log('🏢 Yorum yapılan şirket:', companyId);
    console.log('👤 Yorum yapan firma:', reviewerCompanyId);
    console.log('⭐ Puan:', reviewData.rating);
    console.log('💬 Yorum:', reviewData.comment);
    console.log('\n🎉 Artık Ayarlar > Şirket Profili sekmesinde bu yorumu görebilir ve yanıt verebilirsiniz!');
    
  } catch (error) {
    console.error('❌ Hata:', error.message);
    if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
      console.log('\n💡 Not: Şifre bilinmiyorsa, Firebase Console\'dan manuel olarak yorum oluşturabilirsiniz:');
      console.log('   - Collection: reviews');
      console.log('   - Fields: companyId, reviewerCompanyId, rating, comment, createdAt');
    }
    process.exit(1);
  }
}

createTestReview();

