// App Check env bridge
// Vite ortam değişkeninden reCAPTCHA Enterprise site key'i alır ve window/localStorage'a yazar.
const appCheckSiteKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY;

if (appCheckSiteKey) {
  if (typeof window !== "undefined") {
    (window as any).VITE_RECAPTCHA_ENTERPRISE_SITE_KEY =
      (window as any).VITE_RECAPTCHA_ENTERPRISE_SITE_KEY || appCheckSiteKey;
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("VITE_RECAPTCHA_ENTERPRISE_SITE_KEY", appCheckSiteKey);
      }
    } catch {
      // storage erişimi başarısız olabilir, sessiz geç
    }
  }
} else {
  // Build-time uyarısı: env yoksa App Check devre dışı kalır
  // eslint-disable-next-line no-console -- bootstrap aşamasında logger henüz yüklenmemis olabilir
  console.warn(
    "[AppCheck] VITE_RECAPTCHA_ENTERPRISE_SITE_KEY tanımsız. App Check çalışmayacak."
  );
}

