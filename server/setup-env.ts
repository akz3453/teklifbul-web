import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { validateEnv } from './env-validator.js';
import { CAPACITOR_ORIGINS } from './constants/allowed-origins.js';

// ES modules için __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Firebase credentials'ı en başta set et (firebase-admin import'larından ÖNCE)
 * Bu, Firebase Admin SDK'nın applicationDefault() mekanizmasını kullanmasını sağlar
 */
export function ensureGoogleCredentials() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // console.info('[GCP] GOOGLE_APPLICATION_CREDENTIALS is already set');
    return;
  }

  // server/firebase-service-account.json dosyasını kontrol et (index.ts ile aynı dizinde olması beklenir)
  // v1.0 - Use serviceAccountKey.json as prioritized in firestore.ts
  const candidates = [
    path.join(__dirname, 'serviceAccountKey.json'),
    path.join(__dirname, 'firebase-service-account.json')
  ];

  for (const saPath of candidates) {
    if (fs.existsSync(saPath)) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = saPath;
      console.info(`[GCP] Using local service account file: ${path.basename(saPath)}`);
      return;
    }
  }

  console.warn('[GCP] No GOOGLE_APPLICATION_CREDENTIALS and no service account files found in server directory.');
}

// Hemen çalıştır
ensureGoogleCredentials();

// Teklifbul Rule v1.0 - Cloud Run/Functions'ta kanonik URL/CORS fallback (env yoksa)
const onGcp = Boolean(
  process.env.K_SERVICE || process.env.FUNCTION_TARGET || process.env.FUNCTION_NAME
);
if (onGcp) {
  if (!process.env.APP_URL?.trim()) {
    process.env.APP_URL = 'https://teklifbul.web.app';
  }
  if (!process.env.ALLOWED_ORIGINS?.trim() && !process.env.CORS_ALLOWED_ORIGINS?.trim()) {
    process.env.ALLOWED_ORIGINS = [
      'https://teklifbul.web.app',
      'https://teklifbul.firebaseapp.com',
      'https://nefisoft.com',
      'https://www.nefisoft.com',
      ...CAPACITOR_ORIGINS,
    ].join(',');
  }
}

// Gen2 Cloud Run (K_SERVICE): NODE_ENV boş kalırsa mock ödeme / e-fatura açılır
if (process.env.K_SERVICE && process.env.NODE_ENV !== 'test') {
  process.env.NODE_ENV = 'production';
  if (!process.env.APP_VERSION?.trim()) {
    process.env.APP_VERSION = '1.0.1';
  }
}

// Teklifbul Rule v1.0 - Production env validasyonu (kritik eksikse exit)
validateEnv();
