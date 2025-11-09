// Teklifbul Rule v1.0 - Auth Guard (Tek kaynaktan yönlendirme)
// Bu dosya tüm sayfalarda ortak olarak kullanılır
// Manuel redirect yapma - sadece guard yönlendirir

import { auth, waitAuthReady, db } from "../../firebase.js";
// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../../src/shared/log/logger.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

const LOGIN_PAGE = "./index.html";
const DASHBOARD_PAGE = "./dashboard.html";
const WAITING_PAGE = "./company-join-waiting.html";

/**
 * Ana auth guard - login ve app sayfaları için
 * onAuthStateChanged ile auth değişikliklerini dinler
 */
export async function initAuthGuard() {
  // Query flag ile otomatik yönlendirmeyi geçmek istersen (debug için)
  // NOT: skipAutoRedirect sadece ilk yüklemede geçerli, giriş sonrası yönlendirme yapılır
  const params = new URLSearchParams(location.search);
  const skipInitial = params.get("skipAutoRedirect") === "true";
  
  // 🔑 Kritik: Auth durumu kesinleşmeden karar verme
  const user = await waitAuthReady();
  
  // İlk yönlendirmeyi yap (skipAutoRedirect varsa sadece login sayfasında atla)
  if (!skipInitial || !window.location.pathname.includes("index.html")) {
    await performRedirect(user);
  } else {
    logger.info("Auth guard: skipAutoRedirect=true, ilk yönlendirme atlandı (giriş sonrası yönlendirme aktif)");
  }
  
  // Auth state değişikliklerini dinle (kullanıcı giriş/çıkış yaptığında)
  // ÖNEMLİ: skipAutoRedirect olsa bile giriş sonrası yönlendirme yapılır
  onAuthStateChanged(auth, async (newUser) => {
    // skipAutoRedirect parametresini temizle çünkü kullanıcı aktif olarak giriş yaptı
    const currentParams = new URLSearchParams(location.search);
    if (currentParams.get("skipAutoRedirect") === "true") {
      currentParams.delete("skipAutoRedirect");
      const newUrl = location.pathname + (currentParams.toString() ? '?' + currentParams.toString() : '');
      window.history.replaceState({}, '', newUrl);
    }
    await performRedirect(newUser);
  });
}

async function performRedirect(user) {
  const currentPath = window.location.pathname;
  const isLoginPage = currentPath.includes("index.html");
  const isWaitingPage = currentPath.includes("company-join-waiting.html");
  
  if (isLoginPage) {
    // Login sayfasındayım: girişliyse ana sayfaya yönlendir
    if (user) {
      logger.info("Auth guard: Kullanıcı giriş yapmış, yönlendiriliyor...");
      
      // Şirket kodlu kayıt durumunu kontrol et
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.companyJoinStatus === 'pending' || userData.companyJoinStatus === 'rejected') {
            location.replace(WAITING_PAGE);
            return;
          }
        }
      } catch (e) {
        logger.warn('User status check failed', e);
      }
      
      // Normal kullanıcılar dashboard'a
      location.replace(DASHBOARD_PAGE);
    }
  } else if (!isWaitingPage) {
    // Uygulama sayfasındayım: giriş yoksa login'e yönlendir
    if (!user) {
      logger.info("Auth guard: Kullanıcı giriş yapmamış, login'e yönlendiriliyor...");
      const returnUrl = encodeURIComponent(location.pathname + location.search);
      location.replace(`${LOGIN_PAGE}?from=${returnUrl}`);
    }
  }
}

/**
 * Profil/rol zorunlu kontrolü - onboarding için
 * Kullanıcı var ama profil yoksa onboarding'e yönlendir
 */
export async function initProfileGuard() {
  const user = await waitAuthReady();
  if (!user) return; // Login guard halleder
  
  const ONBOARD_PAGE = "./role-select.html"; // veya onboarding.html
  
  try {
    const prof = await getDoc(doc(db, "users", user.uid));
    if (!prof.exists()) {
      // Profil yok → onboarding'e yönlendir (login'e değil!)
      const currentPath = window.location.pathname;
      if (!currentPath.includes("role-select.html") && !currentPath.includes("signup.html")) {
        logger.info("Profile guard: Profil yok, onboarding'e yönlendiriliyor...");
        location.replace(ONBOARD_PAGE);
      }
    }
  } catch (e) {
    logger.warn("Profile guard check failed", e);
  }
}

/**
 * Şirket kodlu kayıt durumu kontrolü
 */
export async function initCompanyJoinGuard() {
  const user = await waitAuthReady();
  if (!user) return;
  
  try {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const currentPath = window.location.pathname;
      
      // Bekleme durumundaysa ve bekleme sayfasında değilse yönlendir
      if ((userData.companyJoinStatus === 'pending' || userData.companyJoinStatus === 'rejected') 
          && !currentPath.includes("company-join-waiting.html")) {
        logger.info("Company join guard: Bekleme durumunda, yönlendiriliyor...");
        location.replace(WAITING_PAGE);
      }
      
      // Onaylanmışsa ve bekleme sayfasındaysa dashboard'a yönlendir
      if (userData.companyJoinStatus === 'approved' && currentPath.includes("company-join-waiting.html")) {
        logger.info("Company join guard: Onaylandı, dashboard'a yönlendiriliyor...");
        location.replace(DASHBOARD_PAGE);
      }
    }
  } catch (e) {
    logger.warn("Company join guard check failed", e);
  }
}

/**
 * Tüm guard'ları başlat (sayfa yüklendiğinde)
 */
export async function initAllGuards() {
  await initAuthGuard();
  await initProfileGuard();
  await initCompanyJoinGuard();
}

