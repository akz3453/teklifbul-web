import { config } from 'dotenv';
import { join } from 'path';
config({ path: join(process.cwd(), '..', '.env') });
config({ path: join(process.cwd(), '.env') });

import * as admin from 'firebase-admin';

async function setAdmin() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npx ts-node server/scripts/set-admin.ts <email>');
    process.exit(1);
  }

  // Initialize Firebase Admin 
  if (!admin.apps.length) {
    admin.initializeApp();
  }

  try {
    const user = await admin.auth().getUserByEmail(email);
    
    // Add superAdmin claim while preserving existing ones
    const currentClaims = user.customClaims || {};
    await admin.auth().setCustomUserClaims(user.uid, { 
      ...currentClaims, 
      superAdmin: true 
    });
    
    console.log(`✅ Successfully granted superAdmin custom claim to ${email}`);
    console.log(`User must logout and login again for the claim to take effect.`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error granting admin:', error);
    process.exit(1);
  }
}

setAdmin();
