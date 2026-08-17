import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
const firebaseConfig = {
    apiKey: "AIzaSyAbX3UWRPpw-yo4I4HbSdTg82LxvM-fqTE",
    authDomain: "teklifbul.firebaseapp.com",
    projectId: "teklifbul",
    storageBucket: "teklifbul.firebasestorage.app",
    appId: "1:636669818119:web:9085962e660831c36941a2"
};
const app = initializeApp(firebaseConfig);
const isBrowser = typeof window !== "undefined";
if (isBrowser) {
    const siteKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY;
    const skipEnforce = String(import.meta.env.VITE_APP_CHECK_ENFORCE || "").trim() === "0";
    const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    const isDevMode = import.meta.env.MODE === "development";
    const isProduction = !isLocalHost && !isDevMode;
    if (siteKey) {
        initializeAppCheck(app, {
            provider: new ReCaptchaEnterpriseProvider(siteKey),
            isTokenAutoRefreshEnabled: true,
        });
        // eslint-disable-next-line no-console -- bootstrap aşaması
        console.info("[AppCheck] ReCAPTCHA Enterprise ile App Check başlatıldı.");
    }
    else if (isProduction && !skipEnforce) {
        throw new Error("AppCheck configuration missing - cannot proceed in production");
    }
    else {
        // eslint-disable-next-line no-console -- bootstrap aşaması, logger henüz yüklenmemis olabilir
        console.warn("[AppCheck] VITE_RECAPTCHA_ENTERPRISE_SITE_KEY tanımlı değil, App Check başlatılmadı.");
    }
}
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export { app };
