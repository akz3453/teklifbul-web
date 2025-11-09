// debug-demand-flow.js
// Talep akışını debug etmek için script

console.log("🔍 Talep Akışı Debug Başlatılıyor...");

// Test 1: Kullanıcı bilgilerini kontrol et
async function checkUserData() {
    console.log("1. 👤 Kullanıcı Bilgileri Kontrol Ediliyor...");
    
    if (!window.__auth?.currentUser) {
        console.error("❌ Kullanıcı giriş yapmamış!");
        return false;
    }
    
    const user = window.__auth.currentUser;
    console.log(`✅ Kullanıcı: ${user.email} (${user.uid})`);
    
    try {
        const { getDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
        const userDoc = await getDoc(doc(window.__db, 'users', user.uid));
        
        if (userDoc.exists()) {
            const userData = userDoc.data();
            console.log("📊 Kullanıcı Verisi:", userData);
            
            // Rolleri kontrol et
            if (userData.roles) {
                console.log(`✅ Roller: ${JSON.stringify(userData.roles)}`);
            } else {
                console.warn("⚠️ Roller tanımlanmamış!");
            }
            
            // Kategorileri kontrol et
            if (userData.categories && userData.categories.length > 0) {
                console.log(`✅ Kategoriler: ${userData.categories.join(', ')}`);
            } else {
                console.warn("⚠️ Kategoriler tanımlanmamış!");
            }
            
            return true;
        } else {
            console.error("❌ Kullanıcı users koleksiyonunda bulunamadı!");
            return false;
        }
    } catch (e) {
        console.error(`❌ Kullanıcı bilgileri alınamadı: ${e.message}`);
        return false;
    }
}

// Test 2: demandRecipients koleksiyonunu kontrol et
async function checkDemandRecipients() {
    console.log("2. 📨 demandRecipients Koleksiyonu Kontrol Ediliyor...");
    
    try {
        const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
        
        // Tüm demandRecipients kayıtlarını al
        const allRecipients = await getDocs(collection(window.__db, 'demandRecipients'));
        console.log(`📊 Toplam demandRecipients kaydı: ${allRecipients.size}`);
        
        if (allRecipients.size === 0) {
            console.warn("⚠️ Hiç demandRecipients kaydı yok! Bu yüzden gelen talepler görünmüyor.");
            return false;
        }
        
        // Kullanıcıya ait kayıtları filtrele
        const userRecipients = allRecipients.docs.filter(doc => 
            doc.data().supplierId === window.__auth.currentUser.uid
        );
        
        console.log(`📊 Kullanıcıya ait demandRecipients kaydı: ${userRecipients.length}`);
        
        if (userRecipients.length === 0) {
            console.warn("⚠️ Kullanıcıya ait demandRecipients kaydı yok!");
            return false;
        } else {
            console.log("📋 Kullanıcıya ait demandRecipients kayıtları:");
            userRecipients.forEach(doc => {
                const data = doc.data();
                console.log(`  - ID: ${doc.id}, demandId: ${data.demandId}, status: ${data.status}`);
            });
            return true;
        }
        
    } catch (e) {
        console.error(`❌ demandRecipients sorgusu başarısız: ${e.message}`);
        return false;
    }
}

// Test 3: demands koleksiyonunu kontrol et
async function checkDemands() {
    console.log("3. 📋 demands Koleksiyonu Kontrol Ediliyor...");
    
    try {
        const { collection, getDocs, query, where, getDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
        
        // Yayınlanmış talepleri al
        const publishedDemands = await getDocs(
            query(collection(window.__db, 'demands'), where('isPublished', '==', true))
        );
        
        console.log(`📊 Toplam yayınlanmış talep: ${publishedDemands.size}`);
        
        if (publishedDemands.size === 0) {
            console.warn("⚠️ Hiç yayınlanmış talep yok!");
            return false;
        }
        
        // Kullanıcının kategorilerine uygun talepleri bul
        const userDoc = await getDoc(doc(window.__db, 'users', window.__auth.currentUser.uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            const userCategories = userData.categories || [];
            
            if (userCategories.length === 0) {
                console.warn("⚠️ Kullanıcının kategorileri yok!");
                return false;
            }
            
            const matchingDemands = publishedDemands.docs.filter(doc => {
                const demand = doc.data();
                const demandCategories = demand.categories || [];
                return demandCategories.some(cat => userCategories.includes(cat));
            });
            
            console.log(`📊 Kullanıcının kategorilerine uygun talep: ${matchingDemands.length}`);
            
            if (matchingDemands.length > 0) {
                console.log("📋 Kullanıcının kategorilerine uygun talepler:");
                matchingDemands.forEach(doc => {
                    const data = doc.data();
                    console.log(`  - ID: ${doc.id}, Başlık: ${data.title}, Kategoriler: ${(data.categories || []).join(', ')}`);
                });
                return true;
            }
        }
        
        return false;
        
    } catch (e) {
        console.error(`❌ demands sorgusu başarısız: ${e.message}`);
        return false;
    }
}

// Test 4: loadIncoming fonksiyonunu simüle et
async function simulateLoadIncoming() {
    console.log("4. 🔄 loadIncoming Fonksiyonu Simülasyonu...");
    
    try {
        const { collection, query, where, getDocs, getDoc, doc, orderBy, limit } = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
        
        const user = window.__auth.currentUser;
        
        // 1. demandRecipients sorgusu
        const q = query(
            collection(window.__db, 'demandRecipients'), 
            where('supplierId', '==', user.uid), 
            orderBy('matchedAt', 'desc'), 
            limit(100)
        );
        
        console.log("🔍 demandRecipients sorgusu çalıştırılıyor...");
        const rs = await getDocs(q);
        console.log(`📊 Sorgu sonucu: ${rs.size} kayıt`);
        
        if (rs.size === 0) {
            console.warn("⚠️ demandRecipients sorgusu sonuç vermedi!");
            return false;
        }
        
        // 2. demandId'leri al
        const ids = rs.docs.map(d => d.data().demandId);
        console.log(`📊 Bulunan demandId'ler: ${ids.join(', ')}`);
        
        // 3. Her demandId için demands koleksiyonundan veri al
        const rows = [];
        for (const id of ids) {
            console.log(`🔍 demandId ${id} için demands koleksiyonu sorgulanıyor...`);
            const ds = await getDoc(doc(window.__db, 'demands', id));
            if (ds.exists()) {
                rows.push({ id: ds.id, ...ds.data() });
                console.log(`✅ demandId ${id} bulundu`);
            } else {
                console.error(`❌ demandId ${id} bulunamadı!`);
            }
        }
        
        console.log(`📊 Toplam yüklenen talep: ${rows.length}`);
        
        if (rows.length > 0) {
            console.log("📋 Yüklenen talepler:");
            rows.forEach(row => {
                console.log(`  - ID: ${row.id}, Başlık: ${row.title || 'N/A'}, Kategoriler: ${(row.categories || []).join(', ')}`);
            });
            return true;
        } else {
            console.warn("⚠️ Hiç talep yüklenemedi!");
            return false;
        }
        
    } catch (e) {
        console.error(`❌ loadIncoming simülasyonu başarısız: ${e.message}`);
        
        // Index hatası kontrolü
        if (e.message.includes('index')) {
            console.warn("🔍 Index hatası tespit edildi! Konsoldaki 'Create index' linkine tıklayın.");
        }
        return false;
    }
}

// Ana debug fonksiyonu
async function runDebug() {
    console.log("🚀 Debug başlatılıyor...");
    
    const results = {
        userData: await checkUserData(),
        demandRecipients: await checkDemandRecipients(),
        demands: await checkDemands(),
        loadIncoming: await simulateLoadIncoming()
    };
    
    console.log("📊 Debug Sonuçları:", results);
    
    // Sorun analizi
    if (!results.userData) {
        console.error("❌ SORUN: Kullanıcı verisi eksik!");
    }
    
    if (!results.demandRecipients) {
        console.error("❌ SORUN: demandRecipients kayıtları yok!");
    }
    
    if (!results.demands) {
        console.error("❌ SORUN: Yayınlanmış talepler yok!");
    }
    
    if (!results.loadIncoming) {
        console.error("❌ SORUN: loadIncoming fonksiyonu çalışmıyor!");
    }
    
    if (results.userData && results.demandRecipients && results.demands && results.loadIncoming) {
        console.log("✅ Tüm testler başarılı! Sorun başka bir yerde olabilir.");
    }
}

// Global olarak erişilebilir yap
window.runDebug = runDebug;

console.log("💡 Debug script'i yüklendi. Konsola 'runDebug()' yazarak çalıştırın.");
