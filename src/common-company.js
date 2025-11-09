// public/common-company.js
// Teklifbul Rule v1.0 - Toast bildirim sistemi
import { db, auth } from "../firebase.js";
import { 
  doc, getDoc 
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { toast } from "../src/shared/ui/toast.js";

export async function setupHeader() {
  // Setup universal logout buttons
  function wireLogoutButtons() {
    document.querySelectorAll(".btn-logout, .logout-btn, #logoutBtn").forEach(btn => {
      btn.addEventListener("click", async () => {
        try {
          await signOut(auth);
          window.location.href = "./index.html";
        } catch (e) {
          toast.error("Çıkış yapılamadı: " + (e?.message || e));
        }
      });
    });
  }
  
  // Wire logout buttons when DOM is loaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireLogoutButtons);
  } else {
    wireLogoutButtons();
  }

  // Firma adı gösterimi kaldırıldı - sistemde hata olduğu için
}