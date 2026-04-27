
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = join(__dirname, '../server/firebase-service-account.json');

let serviceAccount;
try {
    serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
} catch (error) {
    console.error('Service account key not found. Please ensure service-account-key.json exists in root.');
    process.exit(1);
}

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'cY4X1GMQqHaTpQC18d0e'; // User's company ID from logs

async function fixCompanySettings() {
    console.log(`Fixing settings for company: ${COMPANY_ID}`);

    try {
        const companyRef = db.collection('companies').doc(COMPANY_ID);
        const doc = await companyRef.get();

        if (!doc.exists) {
            console.error('Company not found!');
            return;
        }

        const currentData = doc.data();
        console.log('Current e-doc settings:', currentData.edoc);

        // Mock e-doc sender data for testing
        const edocUpdate = {
            edoc: {
                ...currentData.edoc,
                sender: {
                    vkn: '1234567890',
                    title: 'Test Şirket A.Ş.',
                    alias: 'urn:mail:defaultpk',
                    taxOffice: 'Maslak Vergi Dairesi',
                    address: {
                        line1: 'Maslak Mah. Büyükdere Cad.',
                        line2: 'No: 123',
                        city: 'İstanbul',
                        district: 'Sarıyer',
                        country: 'Türkiye',
                        postalCode: '34398'
                    }
                },
                providerKey: 'mock-provider',
                defaults: {
                    invoiceTypeDefault: 'SATIS',
                    scenarioDefault: 'TEMELFATURA'
                }
            }
        };

        await companyRef.update(edocUpdate);
        console.log('✅ Company e-doc settings updated successfully!');

    } catch (error) {
        console.error('Error updating company:', error);
    }
}

fixCompanySettings();
