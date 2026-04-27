// header.js — tüm sayfalarda ortak: firma adı + çıkış + multi-role support
// Teklifbul Rule v1.0 - Header MUST NOT perform authentication or redirect logic
// Header should only display user info IF user is already authenticated
// Redirect logic MUST be handled ONLY by auth-guard.js
import { auth, logout } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
// Teklifbul Rule v1.0 - Toast Bildirim Sistemi
import { toast } from "./src/shared/ui/toast.js";

export async function setupHeader() {
  // Teklifbul Rule v1.0 - requireAuth() kaldırıldı, redirect yapmıyoruz
  // Sadece mevcut kullanıcıyı al, yoksa auth state değişikliğini bekle (redirect yapmadan)
  let user = auth.currentUser;
  
  if (!user) {
    // Auth state henüz yüklenmemiş, bekle (ama redirect yapma)
    user = await new Promise((resolve) => {
      const unsub = onAuthStateChanged(auth, (u) => {
        unsub(); // İlk değişiklikten sonra unsubscribe
        resolve(u || null);
      });
      
      // Safety timeout - 5 saniye sonra unsubscribe
      setTimeout(() => {
        try {
          unsub();
        } catch (_e) {
          // Ignore
        }
        resolve(auth.currentUser || null);
      }, 5000);
    });
  }

  // Firma adı gösterimi kaldırıldı - sistemde hata olduğu için

  // Çıkış - Teklifbul Rule v1.0 - Sadece logout handler'da redirect yapılabilir
  const btn = document.getElementById("logoutBtn");
  if (btn) {
    btn.onclick = async () => {
      try { 
        await logout(); 
        // Logout sonrası redirect yapılabilir (tek istisna)
        location.href = "./index.html"; 
      }
      catch(e){ toast.error("Çıkış hatası: " + (e.message || e)); }
    };
  }

  // User label - sadece kullanıcı varsa göster
  if (user) {
    const userLabel = document.getElementById("userLabel");
    if (userLabel) {
      userLabel.textContent = user.email || user.uid.slice(0, 10);
    }
  }

  // Clock
  const clockEl = document.getElementById("clock");
  if (clockEl) {
    function tick() {
      const d = new Date();
      clockEl.textContent = d.toLocaleString("tr-TR");
    }
    tick();
    setInterval(tick, 1000);
  }
}

// Auto-setup if script is loaded directly
// Teklifbul Rule v1.0 - Header does NOT run before auth-guard.js
// Wait for auth state to be ready (but do NOT redirect)
(async () => {
  try {
    // Auth state yüklenmesini bekle (redirect yapmadan)
    if (!auth.currentUser) {
      await new Promise((resolve) => {
        const unsub = onAuthStateChanged(auth, () => {
          unsub();
          resolve();
        });
        // Safety timeout
        setTimeout(() => {
          try { unsub(); } catch (_e) {}
          resolve();
        }, 5000);
      });
    }
    
    await setupHeader();
  } catch (e) {
    // Teklifbul Rule v1.0 - Structured Logging
    // logger import'u yoksa sessizce geç (circular dependency önlemek için)
    if (typeof logger !== 'undefined') {
      logger.error("Header setup failed", e);
    } else {
      console.error("Header setup failed:", e);
    }
  }
})();
