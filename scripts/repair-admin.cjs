const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const saPath = 'c:/dev/teklifbul-web/server/firebase-service-account.json';

if (!fs.existsSync(saPath)) {
  console.error('Service account not found at:', saPath);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(saPath)
});

async function run() {
  const email = 'akyildizfaruk@gmail.com';
  console.log(`Setting admin for: ${email}...`);
  
  const user = await admin.auth().getUserByEmail(email);
  console.log(`User found: ${user.uid}`);
  
  const currentClaims = user.customClaims || {};
  await admin.auth().setCustomUserClaims(user.uid, { 
    ...currentClaims, 
    superAdmin: true,
    isAdmin: true // Also set this claim just in case
  });
  console.log('✅ Custom claims updated.');
  
  // Also set as admin in Firestore with high quotas
  await admin.firestore().collection('users').doc(user.uid).set({
    isAdmin: true,
    role: 'admin',
    isPremium: true,
    plan: 'premium_admin',
    billingInterval: 'yearly',
    roles: ['admin', 'buyer', 'supplier', 'both'],
    ai_provider: 'gemini',
    gemini_free_tokens: 1000000,
    gemini_extra_tokens: 1000000,
    openai_tokens: 1000000
  }, { merge: true });

  // Also update the company plan for the admin's company
  const userData = (await admin.firestore().collection('users').doc(user.uid).get()).data();
  const companyId = userData.companyId || userData.activeCompanyId;
  
  if (companyId) {
    console.log(`Updating company plan for: ${companyId}`);
    await admin.firestore().collection('companies').doc(companyId).set({
      planId: 'premium_plus_yearly',
      planSource: 'admin_repair',
      isPremium: true,
      expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000))
    }, { merge: true });
    console.log('✅ Company plan updated.');
  }

  console.log('✅ Firestore document updated.');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
