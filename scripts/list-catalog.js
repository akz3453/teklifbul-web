
import { getAdminDb } from '../server/utils/firestore.js';

async function listCatalog() {
    const db = await getAdminDb();
    if (!db) {
        console.error('Firestore connection failed');
        return;
    }

    const catalogRef = db.collection('ai_model_catalog');
    const snapshot = await catalogRef.get();

    console.log(`Catalog size: ${snapshot.size}`);
    snapshot.forEach(doc => {
        console.log(`- ${doc.data().provider} / ${doc.data().model}: ${doc.data().label} (Free: ${doc.data().freeEligible})`);
    });
}

listCatalog().catch(console.error);
