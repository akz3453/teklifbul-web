/**
 * Firestore Helper Utility
 * Teklifbul Rule v1.0 - DRY, Production Hardening
 *
 * Ortak Firestore bağlantı ve helper fonksiyonları
 */
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { logger } from '../../src/shared/log/logger.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
// Get current file directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
/**
 * Firebase Admin SDK lazy initialization
 * Teklifbul Rule v1.0 - Güvenli initialization
 * Priority:
 * 1. FIREBASE_SERVICE_ACCOUNT env var (JSON string)
 * 2. server/serviceAccountKey.json (local dev file)
 * 3. GOOGLE_APPLICATION_CREDENTIALS env var (file path)
 * 4. Other serviceAccountKey.json locations (fallback)
 * 5. Application Default Credentials (last resort, production)
 */
export async function getAdminDb() {
    try {
        if (getApps().length > 0) {
            return getAdminFirestore();
        }
        let credential = null;
        let credentialSource = '';
        // 1. FIREBASE_SERVICE_ACCOUNT env var (JSON string) - Highest priority
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            try {
                const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
                credential = cert(serviceAccount);
                credentialSource = 'FIREBASE_SERVICE_ACCOUNT env';
                console.log('🔐 Firebase Admin using FIREBASE_SERVICE_ACCOUNT env');
            }
            catch (err) {
                logger.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT, falling back to file', { error: err?.message });
            }
        }
        // 2. server/serviceAccountKey.json (local dev file) - Second priority
        if (!credential) {
            try {
                // __dirname is server/utils, so go up one level to server/
                const serverServiceAccountPath = join(__dirname, '..', 'serviceAccountKey.json');
                if (existsSync(serverServiceAccountPath)) {
                    const raw = readFileSync(serverServiceAccountPath, 'utf8');
                    const serviceAccount = JSON.parse(raw);
                    credential = cert(serviceAccount);
                    credentialSource = 'server/serviceAccountKey.json';
                    console.log('🔐 Firebase Admin using local serviceAccountKey.json');
                }
            }
            catch (err) {
                logger.warn('server/serviceAccountKey.json could not be loaded', { error: err?.message });
            }
        }
        // 3. GOOGLE_APPLICATION_CREDENTIALS env var (file path)
        if (!credential && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            try {
                const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
                const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'));
                credential = cert(serviceAccount);
                credentialSource = `GOOGLE_APPLICATION_CREDENTIALS: ${credPath}`;
                console.log(`🔐 Firebase Admin using GOOGLE_APPLICATION_CREDENTIALS: ${credPath}`);
            }
            catch (err) {
                logger.warn('GOOGLE_APPLICATION_CREDENTIALS file could not be loaded', { error: err?.message });
            }
        }
        // 4. Other serviceAccountKey.json locations (fallback)
        if (!credential) {
            const serviceAccountPathHints = [
                process.env.SERVICE_ACCOUNT_KEY_PATH,
                process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
                join(process.cwd(), 'serviceAccountKey.json'),
                join(process.cwd(), '..', 'serviceAccountKey.json'),
                join(process.cwd(), '..', '..', 'serviceAccountKey.json')
            ].filter(Boolean);
            for (const candidate of serviceAccountPathHints) {
                try {
                    if (existsSync(candidate)) {
                        const serviceAccount = JSON.parse(readFileSync(candidate, 'utf8'));
                        credential = cert(serviceAccount);
                        credentialSource = candidate;
                        console.log(`🔐 Firebase Admin using serviceAccountKey.json: ${candidate}`);
                        break;
                    }
                }
                catch (err) {
                    // Continue to next candidate
                }
            }
        }
        // 5. Application Default Credentials (last resort, production)
        if (!credential) {
            try {
                const { applicationDefault } = await import('firebase-admin/app');
                credential = applicationDefault();
                credentialSource = 'applicationDefault';
                console.log('⚠️ Firebase Admin using applicationDefault credentials');
            }
            catch (err) {
                logger.error('Firebase Admin SDK could not initialize with any credential source', {
                    error: err?.message,
                    triedSources: [
                        'FIREBASE_SERVICE_ACCOUNT',
                        'server/serviceAccountKey.json',
                        'GOOGLE_APPLICATION_CREDENTIALS',
                        'other serviceAccountKey.json locations',
                        'applicationDefault'
                    ]
                });
                return null;
            }
        }
        // Initialize with the credential we found
        const projectId = credential?.projectId || process.env.FIREBASE_PROJECT_ID || 'teklifbul';
        initializeApp({
            credential,
            projectId
        });
        logger.info('Firebase Admin SDK initialized', { credentialSource });
        return getAdminFirestore();
    }
    catch (error) {
        logger.error('Firebase Admin SDK initialize hatası', error);
        return null;
    }
}
/**
 * Firestore collection helper
 * Teklifbul Rule v1.0 - Güvenli collection erişimi
 */
export async function getCollection(collectionName) {
    const db = await getAdminDb();
    if (!db) {
        logger.warn(`Firestore unavailable, cannot access collection: ${collectionName}`);
        return null;
    }
    return db.collection(collectionName);
}
