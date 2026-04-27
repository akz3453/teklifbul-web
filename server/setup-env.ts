import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

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
