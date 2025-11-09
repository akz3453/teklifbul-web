// header.js — tüm sayfalarda ortak: firma adı + çıkış + multi-role support
import { requireAuth, logout } from "./firebase.js";

export async function setupHeader() {
  const user = await requireAuth();

  // Firma adı gösterimi kaldırıldı - sistemde hata olduğu için

  // Çıkış
  const btn = document.getElementById("logoutBtn");
  if (btn) {
    btn.onclick = async () => {
      try { await logout(); location.href = "./index.html"; }
      catch(e){ alert("Çıkış hatası: " + (e.message || e)); }
    };
  }

  // User label
  const userLabel = document.getElementById("userLabel");
  if (userLabel) {
    userLabel.textContent = user.email || user.uid.slice(0, 10);
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
(async () => {
  try {
    await setupHeader();
  } catch (e) {
    console.error("Header setup failed:", e);
  }
})();
