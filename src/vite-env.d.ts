// Teklifbul Rule v1.0 - Vite environment type augmentation
//
// Bu ambient declaration hem Vite (frontend build) hem de server tsconfig
// tarafindan goruldugunde `import.meta.env` tipi calisir. Sunucu build'inde
// `import.meta.env` runtime'da `undefined` olur (server kodumuz isBrowser
// kontrolu ile bunu yakalar); ama TypeScript hatasi olusmasin diye tip
// burada zenginlestirilir.

interface ImportMetaEnv {
  readonly VITE_RECAPTCHA_ENTERPRISE_SITE_KEY?: string;
  /** "1" = AppCheck key zorunlu; "0" veya boş = key yokken skip (geçici test) */
  readonly VITE_APP_CHECK_ENFORCE?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly MODE?: string;
  readonly DEV?: boolean;
  readonly PROD?: boolean;
  readonly SSR?: boolean;
  // Diger VITE_* anahtarlari da otomatik destekli
  readonly [key: `VITE_${string}`]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

interface Window {
  Capacitor?: CapacitorGlobal;
}
