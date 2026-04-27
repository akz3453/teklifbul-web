/**
 * AI Stabilization Check Script
 * Teklifbul Rule v3.20 - Single command system health check (PROD-safe, DRY RUN)
 * 
 * Usage:
 *   node --loader ts-node/esm scripts/ai-stabilization-check.ts <companyId> [--verbose]
 * 
 * Purpose: Check system health with zero mutations (read-only)
 */

import { getAdminDb } from '../server/utils/firestore.js';
import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const COMPANY_ID = args.find(arg => !arg.startsWith('--')) || null;
const VERBOSE = args.includes('--verbose');

// Validation
if (!COMPANY_ID) {
  console.error('❌ Error: companyId is required');
  console.error('Usage: node --loader ts-node/esm scripts/ai-stabilization-check.ts <companyId> [--verbose]');
  process.exit(1);
}

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    let credential: admin.credential.Credential | null = null;
    
    // Try FIREBASE_SERVICE_ACCOUNT env var
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        credential = admin.credential.cert(serviceAccount);
        console.log('🔐 Using FIREBASE_SERVICE_ACCOUNT env');
      } catch (err) {
        console.warn('⚠️  Failed to parse FIREBASE_SERVICE_ACCOUNT, trying file...');
      }
    }
    
    // Try serviceAccountKey.json files
    if (!credential) {
      const serviceAccountPaths = [
        join(__dirname, '..', 'server', 'serviceAccountKey.json'),
        join(__dirname, '..', 'serviceAccountKey.json'),
      ];
      
      for (const path of serviceAccountPaths) {
        if (existsSync(path)) {
          try {
            const serviceAccount = JSON.parse(readFileSync(path, 'utf8'));
            credential = admin.credential.cert(serviceAccount);
            console.log(`🔐 Using serviceAccountKey.json: ${path}`);
            break;
          } catch (err) {
            // Continue to next path
          }
        }
      }
    }
    
    // Fallback to application default credentials
    if (!credential) {
      credential = admin.credential.applicationDefault();
      console.log('🔐 Using application default credentials');
    }
    
    admin.initializeApp({
      credential,
    });
    
    console.log('✅ Firebase Admin initialized\n');
  } catch (err: any) {
    console.error('❌ Firebase Admin initialization failed:', err.message);
    process.exit(1);
  }
}

// Direct service calls (no API token needed, using Firestore directly)
// Teklifbul Rule v3.20 - Script uses services directly for simplicity

// Check results
interface CheckResult {
  name: string;
  status: '✅' | '⚠️' | '❌';
  message: string;
  data?: any;
}

const results: CheckResult[] = [];

function addResult(name: string, status: '✅' | '⚠️' | '❌', message: string, data?: any) {
  results.push({ name, status, message, data });
  console.log(`${status} ${name}: ${message}`);
  if (VERBOSE && data) {
    console.log(`   Details:`, JSON.stringify(data, null, 2));
  }
}

/**
 * S1: AI Health Check
 */
async function checkAiHealth(): Promise<void> {
  try {
    const db = await getAdminDb();
    if (!db) {
      throw new Error('Database connection failed');
    }
    
    const { getCompanyAiWallet } = await import('../server/services/companyAiWalletService.js');
    const { getTodayPaidUsedTokens } = await import('../server/services/aiDailyCounterService.js');
    const { computeAvailableModels } = await import('../server/services/purchaseAssistantAvailabilityService.js');
    
    // Load settings
    const settingsRef = db.collection('companies').doc(COMPANY_ID!).collection('settings').doc('purchaseAssistant');
    const settingsSnap = await settingsRef.get();
    const hasSettings = settingsSnap.exists;
    const settings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};
    
    // Load company
    const companyRef = db.collection('companies').doc(COMPANY_ID!);
    const companySnap = await companyRef.get();
    const companyData = companySnap.exists ? companySnap.data() : {};
    const planId = companyData?.planId || companyData?.plan || 'free';
    const isPremiumPlus = planId.includes('premium_plus');
    
    const provider = settings.provider || 'none';
    const model = settings.model || 'none';
    const forcedFree = settings.forcedFreeMode === true;
    const dailyCap = typeof settings.dailyPaidTokenCap === 'number' ? settings.dailyPaidTokenCap : null;
    
    // Today counter
    const todayCounter = await getTodayPaidUsedTokens(COMPANY_ID!);
    const todayUsed = todayCounter.paidUsedTokens || 0;
    
    // Wallet balance
    const wallet = await getCompanyAiWallet(COMPANY_ID!);
    const walletBalance = wallet ? wallet.balanceTokens : 0;
    
    // Available models
    const availableModels = await computeAvailableModels({
      db,
      companyId: COMPANY_ID!,
      isPremiumPlus,
    });
    const availableModelsCount = availableModels.length;
    
    let status: '✅' | '⚠️' | '❌' = '✅';
    let message = '';
    
    if (!hasSettings) {
      status = '⚠️';
      message = 'Settings doc missing';
    } else if (forcedFree) {
      status = '⚠️';
      message = `Forced free mode ON (${provider}/${model})`;
    } else if (walletBalance === 0 && provider !== 'free_local') {
      status = '⚠️';
      message = `Wallet empty (${provider}/${model})`;
    } else {
      message = `${provider}/${model}, wallet: ${walletBalance}, cap: ${dailyCap || 'none'}, today: ${todayUsed}`;
    }
    
    const data = {
      hasSettingsDoc: hasSettings,
      provider,
      model,
      forcedFreeMode: forcedFree,
      dailyPaidTokenCap: dailyCap,
      todayCounterPaidUsed: todayUsed,
      walletBalanceTokens: walletBalance,
      availableModelsCount,
      planId,
      isPremiumPlus,
    };
    
    addResult('S1: AI Health', status, message, VERBOSE ? data : undefined);
  } catch (err: any) {
    addResult('S1: AI Health', '❌', `Error: ${err.message}`);
  }
}

/**
 * S2: Entitlements Check
 */
async function checkEntitlements(): Promise<void> {
  try {
    const { getCompanyEntitlements } = await import('../server/services/aiEntitlementService.js');
    const entitlements = await getCompanyEntitlements(COMPANY_ID!);
    
    const providers = Array.from(entitlements.entries()).map(([key, val]) => ({
      providerKey: key,
      providerWide: val.isProviderWide,
      allowedModels: val.allowedModels,
      allowedModelPrefixes: val.allowedModelPrefixes,
      allowedTiers: val.allowedTiers,
    }));
    
    const providerCount = providers.length;
    
    let status: '✅' | '⚠️' | '❌' = '✅';
    let message = '';
    
    if (providerCount === 0) {
      status = '⚠️';
      message = 'No entitlements found';
    } else {
      const providerSummary = providers.map((p: any) => {
        const type = p.providerWide ? 'provider-wide' : `${p.allowedModels.length} models`;
        return `${p.providerKey} (${type})`;
      }).join(', ');
      message = `${providerCount} provider(s): ${providerSummary}`;
    }
    
    const data = {
      companyId: COMPANY_ID!,
      providers,
      env: {
        legacyProviderWide: process.env.TB_LEGACY_ENTITLEMENT_PROVIDER_WIDE !== 'false',
      },
    };
    
    addResult('S2: Entitlements', status, message, VERBOSE ? data : undefined);
  } catch (err: any) {
    addResult('S2: Entitlements', '❌', `Error: ${err.message}`);
  }
}

/**
 * S3: Restore-Paid Status Check
 */
async function checkRestorePaidStatus(): Promise<void> {
  try {
    const db = await getAdminDb();
    if (!db) {
      throw new Error('Database connection failed');
    }
    
    const { computeRestorePaidStatus } = await import('../server/services/restorePaidStatusHelper.js');
    
    // Load settings
    const settingsRef = db.collection('companies').doc(COMPANY_ID!).collection('settings').doc('purchaseAssistant');
    const settingsSnap = await settingsRef.get();
    const settings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};
    
    // Load company
    const companyRef = db.collection('companies').doc(COMPANY_ID!);
    const companySnap = await companyRef.get();
    const companyData = companySnap.exists ? companySnap.data() : {};
    const planId = companyData?.planId || companyData?.plan || 'free';
    
    const data = await computeRestorePaidStatus({
      db,
      companyId: COMPANY_ID!,
      userId: null,
      settings,
      planId,
    });
    
    const reason = data.reason || 'UNKNOWN';
    const canRestore = data.canRestore === true;
    const suggestedPaid = data.suggestedPaid || null;
    
    let status: '✅' | '⚠️' | '❌' = '✅';
    let message = '';
    
    if (reason === 'NO_FUNDS_FOR_PAID' || reason === 'NOT_ENTITLED') {
      status = '⚠️';
      message = `Cannot restore: ${reason}`;
    } else if (canRestore && suggestedPaid) {
      message = `Can restore to ${suggestedPaid.provider}/${suggestedPaid.model} (${suggestedPaid.providerKey || 'unknown'})`;
    } else {
      message = `Status: ${reason}`;
    }
    
    addResult('S3: Restore-Paid Status', status, message, VERBOSE ? data : undefined);
  } catch (err: any) {
    addResult('S3: Restore-Paid Status', '❌', `Error: ${err.message}`);
  }
}

/**
 * S4: Daily Counter Check
 */
async function checkDailyCounter(): Promise<void> {
  try {
    const db = await getAdminDb();
    if (!db) {
      throw new Error('Database connection failed');
    }
    
    const { getTodayPaidUsedTokens } = await import('../server/services/aiDailyCounterService.js');
    
    // Load settings
    const settingsRef = db.collection('companies').doc(COMPANY_ID!).collection('settings').doc('purchaseAssistant');
    const settingsSnap = await settingsRef.get();
    const settings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};
    
    const todayCounter = await getTodayPaidUsedTokens(COMPANY_ID!);
    const todayUsed = todayCounter.paidUsedTokens || 0;
    const dailyCap = typeof settings.dailyPaidTokenCap === 'number' ? settings.dailyPaidTokenCap : null;
    
    let status: '✅' | '⚠️' | '❌' = '✅';
    let message = '';
    
    if (dailyCap === null) {
      status = '⚠️';
      message = `No daily cap set (used: ${todayUsed})`;
    } else {
      const percentUsed = dailyCap > 0 ? ((todayUsed / dailyCap) * 100).toFixed(1) : '0.0';
      if (parseFloat(percentUsed) >= 90) {
        status = '⚠️';
        message = `Daily cap near limit: ${todayUsed}/${dailyCap} (${percentUsed}%)`;
      } else {
        message = `Daily usage: ${todayUsed}/${dailyCap} (${percentUsed}%)`;
      }
    }
    
    addResult('S4: Daily Counter', status, message);
  } catch (err: any) {
    addResult('S4: Daily Counter', '❌', `Error: ${err.message}`);
  }
}

/**
 * S5: Kill-Switch Status Check
 */
async function checkKillSwitch(): Promise<void> {
  try {
    const db = await getAdminDb();
    if (!db) {
      throw new Error('Database connection failed');
    }
    
    // Global controls
    const globalControlsRef = db.collection('system_settings').doc('aiControls');
    const globalSnap = await globalControlsRef.get();
    const globalData = globalSnap.exists ? globalSnap.data() : {};
    
    const panicMode = globalData?.panicMode === true;
    const globalDisabled = globalData?.globalAiDisabled === true;
    
    // Company controls
    const companyControlsRef = db.collection('companies').doc(COMPANY_ID!).collection('settings').doc('aiControls');
    const companySnap = await companyControlsRef.get();
    const companyData = companySnap.exists ? companySnap.data() : {};
    const companyDisabled = companyData?.companyAiDisabled === true;
    
    let status: '✅' | '⚠️' | '❌' = '✅';
    let message = '';
    
    if (panicMode) {
      status = '❌';
      message = 'PANIC MODE: AI disabled globally';
    } else if (globalDisabled) {
      status = '❌';
      message = 'GLOBAL DISABLE: AI disabled globally';
    } else if (companyDisabled) {
      status = '⚠️';
      message = 'COMPANY DISABLE: AI disabled for this company';
    } else {
      message = 'AI enabled (no kill-switch active)';
    }
    
    addResult('S5: Kill-Switch', status, message, VERBOSE ? { panicMode, globalDisabled, companyDisabled } : undefined);
  } catch (err: any) {
    addResult('S5: Kill-Switch', '❌', `Error: ${err.message}`);
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🔍 AI Stabilization Check (v3.20)');
  console.log('='.repeat(80));
  console.log(`Company ID: ${COMPANY_ID}`);
  console.log(`Mode: 🟢 READ-ONLY (zero mutations)`);
  console.log('='.repeat(80) + '\n');
  
  try {
    // Run checks (using services directly, no API token needed)
    console.log('📊 Running health checks...\n');
    
    await checkAiHealth();
    await checkEntitlements();
    await checkRestorePaidStatus();
    await checkDailyCounter();
    await checkKillSwitch();
    
    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 CHECK SUMMARY');
    console.log('='.repeat(80) + '\n');
    
    const passed = results.filter(r => r.status === '✅').length;
    const warnings = results.filter(r => r.status === '⚠️').length;
    const failed = results.filter(r => r.status === '❌').length;
    
    console.log(`✅ Passed: ${passed}`);
    console.log(`⚠️  Warnings: ${warnings}`);
    console.log(`❌ Failed: ${failed}\n`);
    
    // Exit code
    if (failed > 0) {
      process.exit(1);
    } else if (warnings > 0) {
      process.exit(0); // Warnings are OK
    } else {
      process.exit(0);
    }
    
  } catch (err: any) {
    console.error('\n❌ Fatal error:', err.message);
    if (VERBOSE) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

// Run
main().catch(e => {
  console.error('Unhandled error:', e);
  process.exit(1);
});

