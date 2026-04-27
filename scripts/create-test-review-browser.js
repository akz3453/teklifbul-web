/**
 * Test Yorumu Oluşturma Scripti (Browser Console)
 * Teklifbul Rule v1.0 - Tarayıcı konsolunda çalıştırılır
 * 
 * Kullanım:
 * 1. Ayarlar sayfasını açın (http://localhost:5173/settings.html)
 * 2. Tarayıcı konsolunu açın (F12)
 * 3. Bu script'i yapıştırın ve Enter'a basın
 */

(async function createTestReview() {
  try {
    console.log('🧭 Test yorumu oluşturuluyor...');
    
    // Firebase modüllerini al
    const { requireAuth, db } = await import('./firebase.js');
    const { 
      collection, 
      addDoc, 
      query, 
      where, 
      getDocs, 
      doc, 
      getDoc, 
      serverTimestamp 
    } = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js');
    
    // Kullanıcı kontrolü
    const user = await requireAuth();
    if (!user) {
      console.error('❌ Kullanıcı girişi gerekli');
      return;
    }
    
    console.log('✅ Kullanıcı:', user.email);
    
    // Kullanıcının şirket ID'sini bul
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists()) {
      console.error('❌ Kullanıcı bulunamadı');
      return;
    }
    
    const userData = userDoc.data();
    const companyId = userData.companyId || (userData.companies && userData.companies[0]);
    
    if (!companyId) {
      console.error('❌ Kullanıcının şirketi bulunamadı');
      return;
    }
    
    console.log('📦 Şirket ID:', companyId);
    
    // Şirket bilgilerini al
    const companyDoc = await getDoc(doc(db, 'companies', companyId));
    if (!companyDoc.exists()) {
      console.error('❌ Şirket bulunamadı');
      return;
    }
    
    const companyData = companyDoc.data();
    console.log('🏢 Şirket:', companyData.companyName || companyId);
    
    // Yorum yapan firma ID'si bul (başka bir şirket)
    let reviewerCompanyId = null;
    let reviewerCompanyName = 'Test Firma';
    
    // Önce başka bir şirket bulmaya çalış
    const companiesQuery = query(
      collection(db, 'companies'),
      where('__name__', '!=', companyId)
    );
    
    try {
      const companiesSnapshot = await getDocs(companiesQuery);
      if (!companiesSnapshot.empty) {
        reviewerCompanyId = companiesSnapshot.docs[0].id;
        const reviewerData = companiesSnapshot.docs[0].data();
        reviewerCompanyName = reviewerData.companyName || 'Test Firma';
        console.log('👤 Yorum yapan firma:', reviewerCompanyName, '(', reviewerCompanyId, ')');
      } else {
        // Başka şirket yoksa, test için aynı şirketi kullan
        reviewerCompanyId = companyId;
        reviewerCompanyName = companyData.companyName || 'Test Firma';
        console.log('⚠️ Başka şirket bulunamadı, test için aynı şirket kullanılıyor');
      }
    } catch (e) {
      // Query hatası varsa, test için aynı şirketi kullan
      reviewerCompanyId = companyId;
      reviewerCompanyName = companyData.companyName || 'Test Firma';
      console.log('⚠️ Şirket sorgusu hatası, test için aynı şirket kullanılıyor:', e.message);
    }
    
    // Test yorumu oluştur
    console.log('📝 Test yorumu oluşturuluyor...');
    
    const reviewData = {
      companyId: companyId, // Yorum yapılan şirket (teklifbultedarikci1@gmail.com'un şirketi)
      reviewerCompanyId: reviewerCompanyId, // Yorum yapan firma
      rating: 5,
      comment: 'Test yorumu: Bu firma ile çalışma deneyimimiz çok olumluydu. Hızlı teslimat ve kaliteli ürünler. Müşteri memnuniyeti konusunda çok başarılılar. Kesinlikle tekrar çalışırız!',
      createdAt: serverTimestamp(),
      source: 'internal',
      isTest: true // Test yorumu olduğunu belirt
    };
    
    const reviewRef = await addDoc(collection(db, 'reviews'), reviewData);
    
    console.log('✅ Test yorumu başarıyla oluşturuldu!');
    console.log('📋 Yorum ID:', reviewRef.id);
    console.log('🏢 Yorum yapılan şirket:', companyData.companyName || companyId);
    console.log('👤 Yorum yapan firma:', reviewerCompanyName);
    console.log('⭐ Puan: 5/5');
    console.log('💬 Yorum:', reviewData.comment);
    console.log('\n🎉 Artık Ayarlar > Şirket Profili sekmesinde bu yorumu görebilir ve yanıt verebilirsiniz!');
    console.log('💡 Sayfayı yenileyin (F5) ve Şirket Profili sekmesine gidin.');
    
    // Toast bildirimi (eğer toast mevcut ise)
    if (typeof toast !== 'undefined') {
      toast.success('Test yorumu başarıyla oluşturuldu!');
    }
    
  } catch (error) {
    console.error('❌ Hata:', error);
    console.error('Stack:', error.stack);
    
    // Toast bildirimi (eğer toast mevcut ise)
    if (typeof toast !== 'undefined') {
      toast.error('Test yorumu oluşturulurken hata: ' + error.message);
    }
  }
})();

