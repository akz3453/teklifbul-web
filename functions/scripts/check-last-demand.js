
const admin = require('firebase-admin');
const serviceAccount = require('../../serviceAccountKey.json'); // Adjust path as needed

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkLastDemand() {
    try {
        const snapshot = await db.collection('demands')
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();

        if (snapshot.empty) {
            console.log('No demands found.');
            return;
        }

        const doc = snapshot.docs[0];
        const data = doc.data();

        console.log(`Last Demand ID: ${doc.id}`);
        console.log('CreatedAt:', data.createdAt.toDate());
        console.log('Title:', data.title);
        console.log('DemandType:', data.demandType);
        console.log('SendEmailOnNotification:', data.sendEmailOnNotification);
        console.log('SupplierEmails:', JSON.stringify(data.supplierEmails, null, 2));
        console.log('SelectedSuppliers:', data.selectedSuppliers); // Check previous field too

    } catch (error) {
        console.error('Error:', error);
    }
}

checkLastDemand();
