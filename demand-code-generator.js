// demand-code-generator.js
// 10 haneli talep kodu oluşturucu (29 harf + 9 rakam)

export function generateDemandCode() {
  // 29 harf (I, O, Q hariç - karışıklık olmasın diye)
  const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  // 9 rakam (0 hariç - karışıklık olmasın diye)
  const numbers = '123456789';
  
  let code = '';
  
  // 5 harf + 5 rakam karışık şekilde
  const allChars = letters + numbers;
  
  // 10 karakter seç (karışık)
  for (let i = 0; i < 10; i++) {
    const randomIndex = Math.floor(Math.random() * allChars.length);
    code += allChars[randomIndex];
  }
  
  return code;
}

// Kod formatını kontrol et
export function validateDemandCode(code) {
  if (!code || code.length !== 10) {
    return false;
  }
  
  // Sadece harf ve rakam içermeli
  const validPattern = /^[A-Z0-9]{10}$/;
  return validPattern.test(code);
}

// Benzersiz kod oluştur (Firestore'da kontrol ederek)
export async function generateUniqueDemandCode(db) {
  let attempts = 0;
  const maxAttempts = 100;
  
  while (attempts < maxAttempts) {
    const code = generateDemandCode();
    
    try {
      // Firestore'da bu kod var mı kontrol et
      const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
      
      const q = query(collection(db, 'demands'), where('demandCode', '==', code));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        return code; // Benzersiz kod bulundu
      }
      
      attempts++;
    } catch (error) {
      console.error('Kod kontrolü hatası:', error);
      return generateDemandCode(); // Hata durumunda rastgele kod döndür
    }
  }
  
  // 100 deneme sonunda benzersiz kod bulunamadı
  throw new Error('Benzersiz talep kodu oluşturulamadı');
}
