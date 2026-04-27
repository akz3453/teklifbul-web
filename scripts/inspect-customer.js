
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
    console.error('Service account key not found.');
    process.exit(1);
}

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();
const CUSTOMER_ID = 'FyvHjOKwBx4qJ8K15Mwi';

async function inspectCustomer() {
    console.log(`Inspecting customer: ${CUSTOMER_ID}`);
    try {
        const doc = await db.collection('customers').doc(CUSTOMER_ID).get();
        if (!doc.exists) {
            console.error('Customer not found!');
            return;
        }
        const data = doc.data();
        console.log('Customer Data:', JSON.stringify(data, null, 2));
        console.log('Company ID:', data.companyId);

        if (!data.companyId) {
            console.log('❌ MISSING COMPANY ID');
        } else {
            console.log('✅ Has Company ID');
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

inspectCustomer();
