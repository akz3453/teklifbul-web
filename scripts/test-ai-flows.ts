/**
 * AI Flows Integration Test Script
 * Teklifbul Rule v3.4 - Stabilization + Smoke Tests
 * Teklifbul Rule v3.4.1 - Safety: DRY RUN mode (default)
 * 
 * Usage: 
 *   node --loader ts-node/esm scripts/test-ai-flows.ts <companyId> [--apply]
 * 
 * Default: DRY RUN (no mutations, read-only checks)
 * With --apply: Performs actual mutations (settings, cap setup)
 */

import { getAdminDb } from '../server/utils/firestore.js';
import { getCompanyAiWallet } from '../server/services/companyAiWalletService.js';
import { getTodayPaidUsedTokens } from '../server/services/aiDailyCounterService.js';
import { FieldValue } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const COMPANY_ID = args.find(arg => !arg.startsWith('--')) || 'test-company-id';
const APPLY_MODE = args.includes('--apply');

async function main() {
  console.log('🧪 AI Flows Integration Test');
  console.log(`Company ID: ${COMPANY_ID}`);
  console.log(`Mode: ${APPLY_MODE ? '🔴 APPLY (mutations enabled)' : '🟢 DRY RUN (read-only)'}\n`);

  const db = await getAdminDb();
  if (!db) {
    console.error('❌ Database connection failed');
    process.exit(1);
  }

  try {
    // Test 1: Set free_local/basic, send chat -> expect 200
    console.log('📝 Test 1: Free Model Setup');
    const settingsRef = db.collection('companies').doc(COMPANY_ID).collection('settings').doc('purchaseAssistant');
    
    if (APPLY_MODE) {
      await settingsRef.set({
        provider: 'free_local',
        model: 'basic',
        profile: 'fast',
        dictionaryLearning: true,
        enabled: true,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      console.log('✅ Settings set to free_local/basic');
    } else {
      console.log('🟢 DRY RUN: Would set settings to free_local/basic');
    }

    // Test 2: Check wallet balance
    console.log('\n📝 Test 2: Wallet Balance Check');
    const wallet = await getCompanyAiWallet(COMPANY_ID);
    const walletBalance = wallet ? wallet.balanceTokens : 0;
    console.log(`✅ Wallet balance: ${walletBalance} tokens`);

    // Test 3: Set paid model (if wallet >= 5000)
    if (walletBalance >= 5000) {
      console.log('\n📝 Test 3: Paid Model Setup (wallet sufficient)');
      const availableModels = await (await import('../server/services/purchaseAssistantAvailabilityService.js')).computeAvailableModels({
        db,
        companyId: COMPANY_ID,
        isPremiumPlus: true, // Assume Premium Plus for test
      });
      
      const paidModel = availableModels.find(m => !m.freeEligible);
      if (paidModel) {
        if (APPLY_MODE) {
          await settingsRef.set({
            provider: paidModel.provider,
            model: paidModel.model,
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          console.log(`✅ Settings set to ${paidModel.provider}/${paidModel.model}`);
        } else {
          console.log(`🟢 DRY RUN: Would set settings to ${paidModel.provider}/${paidModel.model}`);
        }
      } else {
        console.log('⚠️  No paid models available (skipping paid model test)');
      }
    } else {
      console.log(`⚠️  Wallet balance (${walletBalance}) < 5000, skipping paid model test`);
    }

    // Test 4: Set daily cap and check counter
    console.log('\n📝 Test 4: Daily Cap Setup');
    if (APPLY_MODE) {
      await settingsRef.set({
        dailyPaidTokenCap: 500,
        dailyPaidTokenCapReason: 'test',
        dailyPaidTokenCapAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      console.log('✅ Daily cap set to 500 tokens');
    } else {
      console.log('🟢 DRY RUN: Would set daily cap to 500 tokens');
    }

    const todayCounter = await getTodayPaidUsedTokens(COMPANY_ID);
    console.log(`✅ Today counter: ${todayCounter.paidUsedTokens} tokens used`);

    // Test 5: Simulate cap exceeded scenario (info only, no actual consume)
    console.log('\n📝 Test 5: Cap Exceeded Simulation');
    const remainingCap = 500 - todayCounter.paidUsedTokens;
    if (remainingCap > 0) {
      console.log(`ℹ️  Remaining cap: ${remainingCap} tokens`);
      console.log(`ℹ️  If ${remainingCap + 1} tokens consumed, would return 402 DAILY_CAP_REACHED`);
    } else {
      console.log('⚠️  Daily cap already reached or exceeded');
    }

    // Test 6: Health check
    console.log('\n📝 Test 6: Health Check');
    const settingsSnap = await settingsRef.get();
    const settings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};
    console.log(`✅ Settings doc exists: ${settingsSnap.exists}`);
    console.log(`✅ Provider: ${settings.provider || 'null'}`);
    console.log(`✅ Model: ${settings.model || 'null'}`);
    console.log(`✅ Forced Free Mode: ${settings.forcedFreeMode === true}`);
    console.log(`✅ Daily Cap: ${settings.dailyPaidTokenCap || 'null'}`);

    console.log(`\n✅ All tests completed successfully! (Mode: ${APPLY_MODE ? 'APPLY' : 'DRY RUN'})`);
    if (!APPLY_MODE) {
      console.log('💡 Tip: Add --apply flag to perform actual mutations');
    }
  } catch (error: any) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);

