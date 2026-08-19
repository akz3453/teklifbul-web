/**
 * Teklifbul Rule v1.0 - Firebase TOTP MFA'yı proje seviyesinde etkinleştirir.
 *
 * Önkoşul: Firebase Authentication with Identity Platform (Blaze + Identity Platform)
 * Kullanım:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/enable-totp-mfa.mjs
 * veya:
 *   node scripts/enable-totp-mfa.mjs ./path/to/serviceAccount.json
 */
import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const require = createRequire(import.meta.url);

function loadServiceAccount() {
  const argPath = process.argv[2];
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const candidates = [argPath, envPath, './serviceAccount.json', './service-account.json']
    .filter(Boolean)
    .map((p) => resolve(String(p)));

  for (const p of candidates) {
    if (existsSync(p)) {
      return { path: p, json: JSON.parse(readFileSync(p, 'utf8')) };
    }
  }
  throw new Error(
    'Service account bulunamadı. Örnek: node scripts/enable-totp-mfa.mjs ./serviceAccount.json'
  );
}

async function main() {
  const { path, json } = loadServiceAccount();
  const admin = require('firebase-admin');

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(json),
      projectId: json.project_id,
    });
  }

  const auth = admin.auth();
  console.log('Proje:', json.project_id);
  console.log('Service account:', path);
  console.log('TOTP MFA etkinleştiriliyor...');

  await auth.projectConfigManager().updateProjectConfig({
    multiFactorConfig: {
      providerConfigs: [
        {
          state: 'ENABLED',
          totpProviderConfig: {
            adjacentIntervals: 5,
          },
        },
      ],
    },
  });

  console.log('OK: TOTP MFA provider ENABLED (adjacentIntervals=5)');
  console.log('Not: Identity Platform yoksa bu komut hata verebilir; Console’dan yükseltme gerekir.');
}

main().catch((err) => {
  console.error('FAILED:', err?.message || err);
  if (String(err?.message || '').includes('IDENTITY_PLATFORM') || String(err?.code || '').includes('IDENTITY')) {
    console.error('→ Firebase Console → Authentication → Upgrade to Identity Platform');
  }
  process.exit(1);
});
