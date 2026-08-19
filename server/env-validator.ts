/**
 * Teklifbul Rule v1.0 - Startup Environment Validator
 *
 * Sunucu baslangicinda zorunlu env degiskenlerini kontrol eder.
 * Production'da kritik env eksikse fail-fast davranis sergiler.
 *
 * Kullanim:
 *   import { validateEnv } from './env-validator.js';
 *   validateEnv();
 */

interface EnvSpec {
  name: string;
  description: string;
  /** Hangi NODE_ENV'lerde zorunlu (default: ['production']) */
  requiredIn?: string[];
  /** Sadece uyarsin, fail-fast yapma */
  warnOnly?: boolean;
  /** Alternatif env'lerden biri varsa zorunlu sayilmaz */
  alternativeOf?: string[];
}

const ENV_SPECS: EnvSpec[] = [
  // === Firebase Admin SDK (alternative paths) ===
  {
    name: 'FIREBASE_SERVICE_ACCOUNT',
    description: 'Firebase Admin SDK service account JSON (string)',
    requiredIn: ['production'],
    alternativeOf: ['GOOGLE_APPLICATION_CREDENTIALS'],
  },
  {
    name: 'GOOGLE_APPLICATION_CREDENTIALS',
    description: 'Service account JSON dosya yolu',
    requiredIn: ['production'],
    alternativeOf: ['FIREBASE_SERVICE_ACCOUNT'],
  },

  // === Application URLs ===
  {
    name: 'ALLOWED_ORIGINS',
    description: 'CORS whitelist (virgulle ayrilmis canli domain listesi)',
    requiredIn: ['production'],
  },
  {
    name: 'APP_URL',
    description: 'Frontend canonical URL (email link, redirect)',
    requiredIn: ['production'],
  },

  // === AI Providers (en az biri) ===
  {
    name: 'GROQ_API_KEY',
    description: 'Groq API anahtari',
    requiredIn: ['production'],
    alternativeOf: ['OPENAI_API_KEY', 'GEMINI_API_KEY'],
  },
  {
    name: 'OPENAI_API_KEY',
    description: 'OpenAI API anahtari',
    warnOnly: true,
  },
  {
    name: 'GEMINI_API_KEY',
    description: 'Google Gemini API anahtari',
    warnOnly: true,
  },

  // === Security secrets ===
  {
    name: 'PAYMENT_WEBHOOK_SECRET',
    description: 'Odeme webhook HMAC secret (production zorunlu)',
    requiredIn: ['production'],
  },

  // === Observability ===
  {
    name: 'SENTRY_DSN',
    description: 'Sentry DSN (production izleme icin)',
    warnOnly: true,
    requiredIn: ['production'],
  },

  // === Admin ===
  {
    name: 'ADMIN_EMAILS',
    description: 'Super admin email listesi',
    warnOnly: true,
    requiredIn: ['production'],
  },

  // === reCAPTCHA ===
  {
    name: 'VITE_RECAPTCHA_ENTERPRISE_SITE_KEY',
    description: 'reCAPTCHA Enterprise site key (frontend AppCheck)',
    warnOnly: true,
    requiredIn: ['production'],
  },

  // === Email (Resend) ===
  // Teklifbul Rule v1.0 - Email gonderimi opsiyonel ama production'da uyari yapalim
  {
    name: 'RESEND_API_KEY',
    description: 'Resend API key (talep / teklif email bildirimleri icin)',
    warnOnly: true,
    requiredIn: ['production'],
  },

  // === Google Maps (frontend) ===
  {
    name: 'VITE_GOOGLE_MAPS_API_KEY',
    description: 'Google Maps JS API anahtari (HTTP referrer ile kisitlanmali)',
    warnOnly: true,
    requiredIn: ['production'],
  },
];

interface ValidationResult {
  ok: boolean;
  missing: EnvSpec[];
  warnings: EnvSpec[];
}

/** Cloud Run / Cloud Functions Gen2 — metadata ADC kullanır, SA dosyası gerekmez. */
function isGcpServerless(): boolean {
  return Boolean(
    process.env.K_SERVICE ||
      process.env.FUNCTION_TARGET ||
      process.env.FUNCTION_NAME ||
      process.env.CLOUD_RUN_JOB
  );
}

/**
 * Env degiskenlerini kontrol eder ve sonuc rapor eder.
 * Production'da kritik (warnOnly olmayan) eksik varsa process.exit(1) cagirir.
 */
export function validateEnv(opts?: { exitOnFatal?: boolean }): ValidationResult {
  const exitOnFatal = opts?.exitOnFatal ?? true;
  const nodeEnv = process.env.NODE_ENV || 'development';
  const onGcp = isGcpServerless();
  const missing: EnvSpec[] = [];
  const warnings: EnvSpec[] = [];

  // Cloud Functions: uygulama kodunda fallback var; eksik secret'lar API'yi tamamen düşürmesin.
  const gcpWarnOnlyNames = new Set([
    'ALLOWED_ORIGINS',
    'APP_URL',
    'GROQ_API_KEY',
    'PAYMENT_WEBHOOK_SECRET',
  ]);

  for (const spec of ENV_SPECS) {
    const requiredIn = spec.requiredIn || ['production'];
    if (!requiredIn.includes(nodeEnv)) continue;

    // Teklifbul Rule v1.0 - GCP'de ADC (metadata) yeterli; SA dosya/env zorunlu değil
    if (
      onGcp &&
      (spec.name === 'FIREBASE_SERVICE_ACCOUNT' ||
        spec.name === 'GOOGLE_APPLICATION_CREDENTIALS')
    ) {
      continue;
    }

    const value = process.env[spec.name];
    if (value && value.trim()) continue;

    // Alternatif env varsa atla
    if (spec.alternativeOf && spec.alternativeOf.length > 0) {
      const hasAlternative = spec.alternativeOf.some((alt) => {
        const altVal = process.env[alt];
        return altVal && altVal.trim();
      });
      if (hasAlternative) continue;
    }

    const treatAsWarn = Boolean(spec.warnOnly || (onGcp && gcpWarnOnlyNames.has(spec.name)));
    if (treatAsWarn) {
      warnings.push(spec);
    } else {
      missing.push(spec);
    }
  }

  // Raporla
  if (missing.length > 0 || warnings.length > 0) {
    console.info('');
    console.info('=== Teklifbul Env Validation Report ===');
    console.info(`NODE_ENV: ${nodeEnv}`);

    if (warnings.length > 0) {
      console.warn(`[ENV] ${warnings.length} uyari:`);
      warnings.forEach((spec) => {
        const altInfo = spec.alternativeOf ? ` (alternatifler: ${spec.alternativeOf.join(', ')})` : '';
        console.warn(`  - ${spec.name}: ${spec.description}${altInfo}`);
      });
    }

    if (missing.length > 0) {
      console.error(`[ENV] ${missing.length} kritik env degiskeni eksik:`);
      missing.forEach((spec) => {
        const altInfo = spec.alternativeOf ? ` (alternatifler: ${spec.alternativeOf.join(', ')})` : '';
        console.error(`  - ${spec.name}: ${spec.description}${altInfo}`);
      });

      if (exitOnFatal && nodeEnv === 'production') {
        console.error('[ENV] Production modunda kritik env eksik. Sunucu kapatiliyor.');
        process.exit(1);
      }
    }

    console.info('=======================================');
    console.info('');
  } else {
    console.info(`[ENV] ${nodeEnv} ortami icin tum zorunlu env degiskenleri tamam.`);
  }

  return {
    ok: missing.length === 0,
    missing,
    warnings,
  };
}
