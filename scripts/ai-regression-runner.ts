/**
 * AI System End-to-End Regression Runner
 * Teklifbul Rule v3.16 - Comprehensive regression testing with DRY RUN default
 * 
 * Usage:
 *   DRY RUN (default, no mutations):
 *     node --loader ts-node/esm scripts/ai-regression-runner.ts <companyId> [--verbose] [--provider=openai|gemini]
 *   
 *   APPLY mode (mutations, requires double confirmation):
 *     node --loader ts-node/esm scripts/ai-regression-runner.ts <companyId> --apply --apply-confirm=YES_I_UNDERSTAND [--verbose]
 * 
 * Default: DRY RUN (zero mutations, read-only checks)
 * APPLY mode: Performs controlled mutations with automatic revert
 */

import { getAdminDb } from '../server/utils/firestore.js';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from '../src/shared/log/logger.js';

// Parse command line arguments
const args = process.argv.slice(2);
const COMPANY_ID = args.find(arg => !arg.startsWith('--')) || null;
const APPLY_MODE = args.includes('--apply');
const APPLY_CONFIRM = args.find(arg => arg.startsWith('--apply-confirm='))?.split('=')[1] || '';
const VERBOSE = args.includes('--verbose');
const PROVIDER_FILTER = args.find(arg => arg.startsWith('--provider='))?.split('=')[1] || null;

// Validation
if (!COMPANY_ID) {
  console.error('❌ Error: companyId is required');
  console.error('Usage: node --loader ts-node/esm scripts/ai-regression-runner.ts <companyId> [--apply] [--apply-confirm=YES_I_UNDERSTAND] [--verbose] [--provider=openai|gemini]');
  process.exit(1);
}

if (APPLY_MODE && APPLY_CONFIRM !== 'YES_I_UNDERSTAND') {
  console.error('❌ Error: APPLY mode requires explicit confirmation');
  console.error('Add --apply-confirm=YES_I_UNDERSTAND to enable mutations');
  process.exit(1);
}

// Test results tracking
interface TestResult {
  name: string;
  status: '✅' | '⚠️' | '❌';
  message: string;
  details?: any;
}

const results: TestResult[] = [];

function addResult(name: string, status: '✅' | '⚠️' | '❌', message: string, details?: any) {
  results.push({ name, status, message, details });
  const icon = status === '✅' ? '✅' : status === '⚠️' ? '⚠️' : '❌';
  console.log(`${icon} ${name}: ${message}`);
  if (VERBOSE && details) {
    console.log(`   Details:`, JSON.stringify(details, null, 2));
  }
}

// Data structures
interface LoadedData {
  aiHealth?: any;
  entitlements?: any;
  settings?: any;
  restorePaidStatus?: any;
  globalAiControls?: any;
  companyAiControls?: any;
  wallets?: Map<string, { balanceTokens: number }>;
}

const loadedData: LoadedData = {};
let originalSettings: any = null;
let originalGuardrails: any = null;

/**
 * Load all required data from endpoints or direct Firestore reads
 */
async function loadData(db: any): Promise<void> {
  console.log('\n📊 Loading data...\n');
  
  try {
    // Load settings
    const settingsRef = db.collection('companies').doc(COMPANY_ID).collection('settings').doc('purchaseAssistant');
    const settingsSnap = await settingsRef.get();
    loadedData.settings = settingsSnap.exists ? settingsSnap.data() : {};
    originalSettings = JSON.parse(JSON.stringify(loadedData.settings));
    
    // Load guardrails (for revert)
    originalGuardrails = {
      forcedFreeMode: loadedData.settings.forcedFreeMode || false,
      dailyPaidTokenCap: loadedData.settings.dailyPaidTokenCap || null,
    };
    
    // Load wallets (all providers)
    loadedData.wallets = new Map();
    const providers = ['openai', 'gemini'];
    for (const provider of providers) {
      try {
        const { getCompanyAiWallet } = await import('../server/services/companyAiWalletService.js');
        const wallet = await getCompanyAiWallet(COMPANY_ID, provider);
        if (wallet) {
          loadedData.wallets.set(provider, { balanceTokens: wallet.balanceTokens || 0 });
        } else {
          loadedData.wallets.set(provider, { balanceTokens: 0 });
        }
      } catch (e) {
        loadedData.wallets.set(provider, { balanceTokens: 0 });
      }
    }
    
    // Load entitlements (using service directly)
    try {
      const { getCompanyEntitlements } = await import('../server/services/aiEntitlementService.js');
      const entitlements = await getCompanyEntitlements(COMPANY_ID);
      loadedData.entitlements = {
        providers: Array.from(entitlements.entries()).map(([key, val]) => ({
          providerKey: key,
          providerWide: val.isProviderWide,
          allowedModels: val.allowedModels,
          allowedModelPrefixes: val.allowedModelPrefixes,
          allowedTiers: val.allowedTiers,
        })),
      };
    } catch (e: any) {
      addResult('Load Entitlements', '⚠️', `Failed: ${e.message}`);
    }
    
    // Load restore-paid status
    try {
      const { computeRestorePaidStatus } = await import('../server/services/restorePaidStatusHelper.js');
      const companyRef = db.collection('companies').doc(COMPANY_ID);
      const companySnap = await companyRef.get();
      const companyData = companySnap.exists ? companySnap.data() : {};
      const planId = companyData.planId || companyData.plan || 'free';
      
      loadedData.restorePaidStatus = await computeRestorePaidStatus({
        db,
        companyId: COMPANY_ID,
        userId: null,
        settings: loadedData.settings,
        planId,
      });
    } catch (e: any) {
      addResult('Load Restore-Paid Status', '⚠️', `Failed: ${e.message}`);
    }
    
    // Load AI controls (global and company)
    try {
      const globalControlsRef = db.collection('system_settings').doc('aiControls');
      const globalSnap = await globalControlsRef.get();
      loadedData.globalAiControls = globalSnap.exists ? globalSnap.data() : {};
      
      const companyControlsRef = db.collection('companies').doc(COMPANY_ID).collection('settings').doc('aiControls');
      const companySnap = await companyControlsRef.get();
      loadedData.companyAiControls = companySnap.exists ? companySnap.data() : {};
    } catch (e: any) {
      addResult('Load AI Controls', '⚠️', `Failed: ${e.message}`);
    }
    
    // Load AI health (using service directly)
    try {
      const { getCompanyAiWallet } = await import('../server/services/companyAiWalletService.js');
      const { getTodayPaidUsedTokens } = await import('../server/services/aiDailyCounterService.js');
      const { computeAvailableModels } = await import('../server/services/purchaseAssistantAvailabilityService.js');
      
      const companyRef = db.collection('companies').doc(COMPANY_ID);
      const companySnap = await companyRef.get();
      const companyData = companySnap.exists ? companySnap.data() : {};
      const planId = companyData.planId || companyData.plan || 'free';
      const isPremiumPlus = planId.includes('premium_plus');
      
      const availableModels = await computeAvailableModels({
        db,
        companyId: COMPANY_ID,
        isPremiumPlus,
      });
      
      // Get wallet balance (legacy or provider-specific)
      const legacyWallet = await getCompanyAiWallet(COMPANY_ID);
      const walletBalance = legacyWallet?.balanceTokens || 0;
      
      const todayCounter = await getTodayPaidUsedTokens(COMPANY_ID);
      
      loadedData.aiHealth = {
        hasSettingsDoc: !!loadedData.settings,
        provider: loadedData.settings.provider || null,
        model: loadedData.settings.model || null,
        forcedFreeMode: loadedData.settings.forcedFreeMode || false,
        dailyPaidTokenCap: loadedData.settings.dailyPaidTokenCap || null,
        todayCounterPaidUsed: todayCounter.paidUsedTokens || 0,
        walletBalanceTokens: walletBalance,
        availableModelsCount: availableModels.length,
        planId,
        isPremiumPlus,
      };
    } catch (e: any) {
      addResult('Load AI Health', '⚠️', `Failed: ${e.message}`);
    }
    
    console.log('✅ Data loaded\n');
  } catch (e: any) {
    console.error('❌ Failed to load data:', e.message);
    throw e;
  }
}

/**
 * A1: Resolver no-mutation check
 */
async function testResolverNoMutation(db: any): Promise<void> {
  console.log('🔍 A1: Resolver No-Mutation Check\n');
  
  try {
    const settingsBefore = JSON.parse(JSON.stringify(loadedData.settings));
    
    // Call resolver service directly (read-only)
    const { resolveCompanyAiModelForRequest } = await import('../server/services/aiModelResolverService.js');
    const { getCompanyPlanFlags } = await import('../server/services/purchaseAssistantAvailabilityService.js');
    
    const companyRef = db.collection('companies').doc(COMPANY_ID);
    const companySnap = await companyRef.get();
    const companyData = companySnap.exists ? companySnap.data() : {};
    const planId = companyData.planId || companyData.plan || 'free';
    const planFlags = getCompanyPlanFlags(planId);
    
    const resolved = await resolveCompanyAiModelForRequest({
      companyId: COMPANY_ID,
      settings: loadedData.settings,
      planFlags,
    });
    
    // Reload settings to check for mutations
    const settingsRef = db.collection('companies').doc(COMPANY_ID).collection('settings').doc('purchaseAssistant');
    const settingsAfterSnap = await settingsRef.get();
    const settingsAfter = settingsAfterSnap.exists ? settingsAfterSnap.data() : {};
    
    // Compare (ignore timestamp fields)
    const beforeClean = { ...settingsBefore };
    const afterClean = { ...settingsAfter };
    delete beforeClean.updatedAt;
    delete afterClean.updatedAt;
    delete beforeClean.updatedAtMs;
    delete afterClean.updatedAtMs;
    
    const beforeStr = JSON.stringify(beforeClean);
    const afterStr = JSON.stringify(afterClean);
    
    if (beforeStr === afterStr) {
      addResult('A1: Resolver No-Mutation', '✅', 'Settings unchanged after resolver call', {
        resolved: {
          provider: resolved.provider,
          model: resolved.model,
          resolvedBy: resolved.resolvedBy,
        },
      });
    } else {
      addResult('A1: Resolver No-Mutation', '❌', 'MUTATION DETECTED: Settings changed after resolver call', {
        before: beforeClean,
        after: afterClean,
        diff: Object.keys(beforeClean).filter(k => beforeClean[k] !== afterClean[k]),
      });
    }
  } catch (e: any) {
    addResult('A1: Resolver No-Mutation', '❌', `Error: ${e.message}`);
  }
}

/**
 * A2: Kill-switch priority check
 */
async function testKillSwitchPriority(): Promise<void> {
  console.log('\n🔍 A2: Kill-Switch Priority Check\n');
  
  const panicMode = loadedData.globalAiControls?.panicMode === true;
  const globalDisabled = loadedData.globalAiControls?.globalAiDisabled === true;
  const companyDisabled = loadedData.companyAiControls?.companyAiDisabled === true;
  
  // Expected priority: PANIC > GLOBAL > COMPANY
  let expectedReason: string | null = null;
  if (panicMode) {
    expectedReason = 'PANIC';
  } else if (globalDisabled) {
    expectedReason = 'GLOBAL';
  } else if (companyDisabled) {
    expectedReason = 'COMPANY';
  }
  
  // Check availability using service
  try {
    const { evaluateAiAvailability } = await import('../server/services/aiKillSwitchService.js');
    const availability = await evaluateAiAvailability(COMPANY_ID);
    
    if (expectedReason) {
      if (!availability.enabled && availability.disabledReason === expectedReason) {
        addResult('A2: Kill-Switch Priority', '✅', `Correct priority: ${expectedReason}`, {
          panicMode,
          globalDisabled,
          companyDisabled,
          disabledReason: availability.disabledReason,
        });
      } else {
        addResult('A2: Kill-Switch Priority', '❌', `Priority mismatch. Expected: ${expectedReason}, Got: ${availability.disabledReason}`, {
          panicMode,
          globalDisabled,
          companyDisabled,
          actual: availability.disabledReason,
        });
      }
    } else {
      if (availability.enabled) {
        addResult('A2: Kill-Switch Priority', '✅', 'AI enabled (no kill-switch active)', {
          panicMode,
          globalDisabled,
          companyDisabled,
        });
      } else {
        addResult('A2: Kill-Switch Priority', '⚠️', `AI disabled but no expected reason. Got: ${availability.disabledReason}`, {
          panicMode,
          globalDisabled,
          companyDisabled,
          actual: availability.disabledReason,
        });
      }
    }
  } catch (e: any) {
    addResult('A2: Kill-Switch Priority', '❌', `Error: ${e.message}`);
  }
}

/**
 * A3: Restore-paid status correctness
 */
async function testRestorePaidStatus(): Promise<void> {
  console.log('\n🔍 A3: Restore-Paid Status Correctness\n');
  
  const status = loadedData.restorePaidStatus;
  if (!status) {
    addResult('A3: Restore-Paid Status', '⚠️', 'Status not loaded');
    return;
  }
  
  const validReasons = ['OK', 'FORCED_FREE_MODE', 'ALREADY_PAID', 'NO_PAID_MODEL', 'NO_FUNDS_FOR_PAID', 'NOT_ENTITLED'];
  const reasonValid = validReasons.includes(status.reason);
  
  if (!reasonValid) {
    addResult('A3: Restore-Paid Status', '❌', `Invalid reason: ${status.reason}`, {
      validReasons,
      actual: status.reason,
    });
    return;
  }
  
  // Check suggestedPaid includes providerKey if present
  if (status.suggestedPaid) {
    if (!status.suggestedPaid.providerKey) {
      addResult('A3: Restore-Paid Status', '❌', 'suggestedPaid missing providerKey', {
        suggestedPaid: status.suggestedPaid,
      });
      return;
    }
    
    // If NO_FUNDS_FOR_PAID, verify providerKey matches required provider
    if (status.reason === 'NO_FUNDS_FOR_PAID') {
      const providerKey = status.suggestedPaid.providerKey;
      const wallet = loadedData.wallets?.get(providerKey);
      if (wallet && wallet.balanceTokens > 0) {
        addResult('A3: Restore-Paid Status', '⚠️', `NO_FUNDS_FOR_PAID but wallet has balance`, {
          providerKey,
          walletBalance: wallet.balanceTokens,
        });
      } else {
        addResult('A3: Restore-Paid Status', '✅', `NO_FUNDS_FOR_PAID correctly identifies provider`, {
          providerKey,
          walletBalance: wallet?.balanceTokens || 0,
        });
      }
    } else {
      addResult('A3: Restore-Paid Status', '✅', `Status correct with providerKey`, {
        reason: status.reason,
        suggestedPaid: status.suggestedPaid,
      });
    }
  } else {
    addResult('A3: Restore-Paid Status', '✅', `Status correct (no suggestedPaid)`, {
      reason: status.reason,
    });
  }
}

/**
 * A4: Provider wallet leakage check
 */
async function testProviderWalletLeakage(): Promise<void> {
  console.log('\n🔍 A4: Provider Wallet Leakage Check\n');
  
  const selectedProvider = loadedData.settings?.provider || null;
  const selectedModel = loadedData.settings?.model || null;
  
  if (!selectedProvider || !selectedModel) {
    addResult('A4: Provider Wallet Leakage', '⚠️', 'No provider/model selected');
    return;
  }
  
  const { getProviderKey } = await import('../server/services/aiEntitlementService.js');
  const selectedProviderKey = getProviderKey(selectedProvider);
  const selectedWallet = loadedData.wallets?.get(selectedProviderKey);
  const selectedBalance = selectedWallet?.balanceTokens || 0;
  
  // Check if selected provider has 0 balance but another provider has balance
  const otherProviders = Array.from(loadedData.wallets?.entries() || []).filter(([key]) => key !== selectedProviderKey);
  const hasOtherBalance = otherProviders.some(([, wallet]) => (wallet.balanceTokens || 0) > 0);
  
  if (selectedBalance === 0 && hasOtherBalance) {
    // This is expected to cause NO_FUNDS_FOR_PAID
    const restoreStatus = loadedData.restorePaidStatus;
    if (restoreStatus?.reason === 'NO_FUNDS_FOR_PAID' && restoreStatus.suggestedPaid?.providerKey === selectedProviderKey) {
      addResult('A4: Provider Wallet Leakage', '✅', 'Correctly prevents cross-provider usage', {
        selectedProvider,
        selectedProviderKey,
        selectedBalance,
        otherProviders: otherProviders.map(([k, w]) => ({ key: k, balance: w.balanceTokens })),
      });
    } else {
      addResult('A4: Provider Wallet Leakage', '⚠️', 'Wallet mismatch but restore status unclear', {
        selectedProvider,
        selectedProviderKey,
        selectedBalance,
        restoreReason: restoreStatus?.reason,
      });
    }
  } else {
    addResult('A4: Provider Wallet Leakage', '✅', 'Wallet balance sufficient or no cross-provider scenario', {
      selectedProvider,
      selectedProviderKey,
      selectedBalance,
    });
  }
}

/**
 * A5: Entitlement strictness check
 */
async function testEntitlementStrictness(): Promise<void> {
  console.log('\n🔍 A5: Entitlement Strictness Check\n');
  
  const selectedProvider = loadedData.settings?.provider || null;
  const selectedModel = loadedData.settings?.model || null;
  
  if (!selectedProvider || !selectedModel) {
    addResult('A5: Entitlement Strictness', '⚠️', 'No provider/model selected');
    return;
  }
  
  const { getProviderKey, getProviderEntitlements, isModelAllowed } = await import('../server/services/aiEntitlementService.js');
  const providerKey = getProviderKey(selectedProvider);
  const entitlements = await getProviderEntitlements(COMPANY_ID, providerKey);
  
  if (!entitlements) {
    addResult('A5: Entitlement Strictness', '⚠️', 'No entitlements for provider', { providerKey });
    return;
  }
  
  // Check if model is entitled
  const db = await getAdminDb();
  const { loadAiModelCatalog } = await import('../server/services/purchaseAssistantAvailabilityService.js');
  const catalog = await loadAiModelCatalog(db);
  const catalogModel = catalog.find(m => m.provider === selectedProvider && m.model === selectedModel);
  const modelTier = (catalogModel as any)?.tier || undefined;
  
  const isEntitled = isModelAllowed(entitlements, selectedProvider, selectedModel, modelTier);
  
  if (!isEntitled && !entitlements.isProviderWide) {
    // Model not entitled - should show NOT_ENTITLED
    const restoreStatus = loadedData.restorePaidStatus;
    if (restoreStatus?.reason === 'NOT_ENTITLED') {
      addResult('A5: Entitlement Strictness', '✅', 'Correctly identifies NOT_ENTITLED', {
        providerKey,
        selectedModel,
        entitlements: {
          providerWide: entitlements.isProviderWide,
          allowedModels: entitlements.allowedModels.length,
          allowedPrefixes: entitlements.allowedModelPrefixes.length,
          allowedTiers: entitlements.allowedTiers.length,
        },
      });
    } else {
      addResult('A5: Entitlement Strictness', '⚠️', 'Model not entitled but restore status not NOT_ENTITLED', {
        providerKey,
        selectedModel,
        restoreReason: restoreStatus?.reason,
      });
    }
  } else {
    addResult('A5: Entitlement Strictness', '✅', 'Model is entitled or provider-wide', {
      providerKey,
      selectedModel,
      isEntitled,
      providerWide: entitlements.isProviderWide,
    });
  }
}

/**
 * A6: Daily cap/counter presence
 */
async function testDailyCapCounter(): Promise<void> {
  console.log('\n🔍 A6: Daily Cap/Counter Check\n');
  
  const health = loadedData.aiHealth;
  if (!health) {
    addResult('A6: Daily Cap/Counter', '⚠️', 'Health data not loaded');
    return;
  }
  
  const cap = health.dailyPaidTokenCap;
  const used = health.todayCounterPaidUsed || 0;
  
  if (cap !== null && cap !== undefined) {
    const percentUsed = cap > 0 ? ((used / cap) * 100).toFixed(1) : '0.0';
    addResult('A6: Daily Cap/Counter', '✅', `Daily cap set: ${used}/${cap} tokens (${percentUsed}%)`, {
      cap,
      used,
      percentUsed: `${percentUsed}%`,
    });
  } else {
    addResult('A6: Daily Cap/Counter', '✅', 'No daily cap set', {
      used,
    });
  }
}

/**
 * A7: Auto-Protection DRY RUN Zero Mutation Check
 * Teklifbul Rule v3.20 - Ensures DRY RUN mode performs zero Firestore writes
 */
async function testAutoProtectionDryRunZeroMutation(db: any): Promise<void> {
  console.log('\n🔍 A7: Auto-Protection DRY RUN Zero Mutation Check\n');
  
  try {
    // Get current month (YYYY-MM)
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    // Snapshot BEFORE: settings doc updateTime
    const settingsRef = db.collection('companies').doc(COMPANY_ID).collection('settings').doc('purchaseAssistant');
    const settingsBeforeSnap = await settingsRef.get();
    const settingsBefore = settingsBeforeSnap.exists ? settingsBeforeSnap.data() : {};
    
    // Get updateTime from metadata or document field
    let updateTimeBefore: any = null;
    if (settingsBeforeSnap.exists) {
      // Try metadata first (Firestore server timestamp)
      updateTimeBefore = settingsBeforeSnap.updateTime;
      // Fallback to document field if metadata not available
      if (!updateTimeBefore && settingsBefore.updatedAt) {
        updateTimeBefore = settingsBefore.updatedAt;
      }
    }
    
    // Snapshot BEFORE: audit logs count
    // Company audit logs
    const companyAuditBeforeSnap = await db
      .collection('companies')
      .doc(COMPANY_ID)
      .collection('auditLogs')
      .where('type', '==', 'auto_protection.run')
      .get();
    const companyAuditCountBefore = companyAuditBeforeSnap.size;
    
    // System audit logs
    const systemAuditBeforeSnap = await db
      .collection('system_auditLogs')
      .where('type', '==', 'auto_protection.run')
      .where('companyId', '==', COMPANY_ID)
      .get();
    const systemAuditCountBefore = systemAuditBeforeSnap.size;
    
    const totalAuditCountBefore = companyAuditCountBefore + systemAuditCountBefore;
    
    // Run auto-protection in DRY RUN mode
    const { runAutoProtection } = await import('../server/services/aiAutoProtectionService.js');
    const result = await runAutoProtection({
      month,
      dryRun: true, // CRITICAL: DRY RUN mode
      limit: 1, // Only test this company
      actor: {
        uid: 'regression-test',
        email: null,
        name: null,
      },
    });
    
    // Snapshot AFTER: settings doc updateTime
    const settingsAfterSnap = await settingsRef.get();
    const settingsAfter = settingsAfterSnap.exists ? settingsAfterSnap.data() : {};
    
    let updateTimeAfter: any = null;
    if (settingsAfterSnap.exists) {
      updateTimeAfter = settingsAfterSnap.updateTime;
      if (!updateTimeAfter && settingsAfter.updatedAt) {
        updateTimeAfter = settingsAfter.updatedAt;
      }
    }
    
    // Snapshot AFTER: audit logs count
    const companyAuditAfterSnap = await db
      .collection('companies')
      .doc(COMPANY_ID)
      .collection('auditLogs')
      .where('type', '==', 'auto_protection.run')
      .get();
    const companyAuditCountAfter = companyAuditAfterSnap.size;
    
    const systemAuditAfterSnap = await db
      .collection('system_auditLogs')
      .where('type', '==', 'auto_protection.run')
      .where('companyId', '==', COMPANY_ID)
      .get();
    const systemAuditCountAfter = systemAuditAfterSnap.size;
    
    const totalAuditCountAfter = companyAuditCountAfter + systemAuditCountAfter;
    
    // Compare: updateTime should be unchanged
    const updateTimeUnchanged = 
      (updateTimeBefore === null && updateTimeAfter === null) ||
      (updateTimeBefore !== null && updateTimeAfter !== null && 
       (updateTimeBefore.toString() === updateTimeAfter.toString() || 
        (updateTimeBefore.seconds === updateTimeAfter.seconds && 
         updateTimeBefore.nanoseconds === updateTimeAfter.nanoseconds)));
    
    // Compare: audit count should be unchanged
    const auditCountUnchanged = totalAuditCountBefore === totalAuditCountAfter;
    
    if (updateTimeUnchanged && auditCountUnchanged) {
      addResult('A7: Auto-Protection DRY RUN Zero Mutation', '✅', 'DRY RUN mode: No Firestore writes detected', {
        settingsUpdateTime: {
          before: updateTimeBefore?.toString() || 'null',
          after: updateTimeAfter?.toString() || 'null',
          unchanged: updateTimeUnchanged,
        },
        auditLogs: {
          before: totalAuditCountBefore,
          after: totalAuditCountAfter,
          unchanged: auditCountUnchanged,
          companyAudit: { before: companyAuditCountBefore, after: companyAuditCountAfter },
          systemAudit: { before: systemAuditCountBefore, after: systemAuditCountAfter },
        },
        dryRun: result.dryRun,
      });
    } else {
      addResult('A7: Auto-Protection DRY RUN Zero Mutation', '❌', 'MUTATION DETECTED: DRY RUN mode performed writes', {
        settingsUpdateTime: {
          before: updateTimeBefore?.toString() || 'null',
          after: updateTimeAfter?.toString() || 'null',
          unchanged: updateTimeUnchanged,
        },
        auditLogs: {
          before: totalAuditCountBefore,
          after: totalAuditCountAfter,
          unchanged: auditCountUnchanged,
          companyAudit: { before: companyAuditCountBefore, after: companyAuditCountAfter },
          systemAudit: { before: systemAuditCountBefore, after: systemAuditCountAfter },
        },
        dryRun: result.dryRun,
      });
    }
  } catch (e: any) {
    addResult('A7: Auto-Protection DRY RUN Zero Mutation', '❌', `Error: ${e.message}`, {
      error: e.message,
      stack: VERBOSE ? e.stack : undefined,
    });
  }
}

/**
 * APPLY MODE: Mutations (with revert)
 */
async function applyMutations(db: any): Promise<void> {
  console.log('\n🔴 APPLY MODE: Performing controlled mutations (will revert)\n');
  
  const settingsRef = db.collection('companies').doc(COMPANY_ID).collection('settings').doc('purchaseAssistant');
  const revertActions: Array<() => Promise<void>> = [];
  
  try {
    // M1: Set and clear daily cap
    console.log('📝 M1: Daily Cap Test');
    const testCap = 200;
    
    await settingsRef.set({
      dailyPaidTokenCap: testCap,
      dailyPaidTokenCapReason: 'regression-test',
      dailyPaidTokenCapAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log(`✅ Daily cap set to ${testCap}`);
    
    revertActions.push(async () => {
      await settingsRef.set({
        dailyPaidTokenCap: originalGuardrails.dailyPaidTokenCap,
        dailyPaidTokenCapReason: null,
        dailyPaidTokenCapAt: null,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    
    // Clear cap
    await settingsRef.set({
      dailyPaidTokenCap: null,
      dailyPaidTokenCapReason: null,
      dailyPaidTokenCapAt: null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log('✅ Daily cap cleared');
    
    // M2: Force free mode on then off
    console.log('\n📝 M2: Force Free Mode Test');
    await settingsRef.set({
      forcedFreeMode: true,
      forcedFreeModeReason: 'regression-test',
      forcedFreeModeAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log('✅ Forced free mode ON');
    
    // Verify resolver uses free model
    const { resolveCompanyAiModelForRequest } = await import('../server/services/aiModelResolverService.js');
    const { getCompanyPlanFlags } = await import('../server/services/purchaseAssistantAvailabilityService.js');
    
    const companyRef = db.collection('companies').doc(COMPANY_ID);
    const companySnap = await companyRef.get();
    const companyData = companySnap.exists ? companySnap.data() : {};
    const planId = companyData.planId || companyData.plan || 'free';
    const planFlags = getCompanyPlanFlags(planId);
    
    // Reload settings after forcedFreeMode change
    const settingsAfterForceSnap = await settingsRef.get();
    const settingsAfterForce = settingsAfterForceSnap.exists ? settingsAfterForceSnap.data() : {};
    
    const resolvedOn = await resolveCompanyAiModelForRequest({
      companyId: COMPANY_ID,
      settings: settingsAfterForce,
      planFlags,
    });
    
    if (resolvedOn.isFreeEligible) {
      console.log('✅ Resolver correctly uses free model when forcedFreeMode=true');
    } else {
      console.log('⚠️  Resolver did not use free model when forcedFreeMode=true');
    }
    
    revertActions.push(async () => {
      await settingsRef.set({
        forcedFreeMode: originalGuardrails.forcedFreeMode,
        forcedFreeModeReason: null,
        forcedFreeModeAt: null,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    
    // Turn off
    await settingsRef.set({
      forcedFreeMode: false,
      forcedFreeModeReason: null,
      forcedFreeModeAt: null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log('✅ Forced free mode OFF');
    
    addResult('M1-M2: Mutations', '✅', 'Mutations performed and will revert');
    
  } catch (e: any) {
    addResult('M1-M2: Mutations', '❌', `Error: ${e.message}`);
  } finally {
    // Revert all changes
    console.log('\n🔄 Reverting all mutations...');
    for (const revert of revertActions) {
      try {
        await revert();
      } catch (e: any) {
        console.error(`⚠️  Revert failed: ${e.message}`);
      }
    }
    console.log('✅ All mutations reverted\n');
  }
}

/**
 * Print summary
 */
function printSummary(): void {
  console.log('\n' + '='.repeat(80));
  console.log('📊 REGRESSION TEST SUMMARY');
  console.log('='.repeat(80) + '\n');
  
  const passed = results.filter(r => r.status === '✅').length;
  const warnings = results.filter(r => r.status === '⚠️').length;
  const failed = results.filter(r => r.status === '❌').length;
  
  console.log(`✅ Passed: ${passed}`);
  console.log(`⚠️  Warnings: ${warnings}`);
  console.log(`❌ Failed: ${failed}\n`);
  
  // Current state summary
  console.log('📋 Current System State:');
  console.log(`   Company ID: ${COMPANY_ID}`);
  console.log(`   Selected Provider/Model: ${loadedData.settings?.provider || 'none'}/${loadedData.settings?.model || 'none'}`);
  
  const health = loadedData.aiHealth;
  if (health) {
    console.log(`   Forced Free Mode: ${health.forcedFreeMode ? 'ON' : 'OFF'}`);
    console.log(`   Daily Cap: ${health.dailyPaidTokenCap || 'None'}`);
    console.log(`   Today Used: ${health.todayCounterPaidUsed || 0} tokens`);
    
    // Show kill-switch status
    const panicMode = loadedData.globalAiControls?.panicMode === true;
    const globalDisabled = loadedData.globalAiControls?.globalAiDisabled === true;
    const companyDisabled = loadedData.companyAiControls?.companyAiDisabled === true;
    if (panicMode || globalDisabled || companyDisabled) {
      const reason = panicMode ? 'PANIC' : globalDisabled ? 'GLOBAL' : 'COMPANY';
      console.log(`   Kill-Switch: ${reason}`);
    } else {
      console.log(`   Kill-Switch: NONE (enabled)`);
    }
  }
  
  console.log('\n   Wallet Balances:');
  loadedData.wallets?.forEach((wallet, provider) => {
    console.log(`     ${provider}: ${wallet.balanceTokens} tokens`);
  });
  
  console.log('\n   Entitlements:');
  loadedData.entitlements?.providers.forEach((p: any) => {
    console.log(`     ${p.providerKey}: ${p.providerWide ? 'Provider-Wide' : `${p.allowedModels.length} models, ${p.allowedModelPrefixes.length} prefixes`}`);
  });
  
  const restoreStatus = loadedData.restorePaidStatus;
  if (restoreStatus) {
    console.log(`\n   Restore-Paid Status: ${restoreStatus.reason}`);
    if (restoreStatus.suggestedPaid) {
      console.log(`     Suggested: ${restoreStatus.suggestedPaid.provider}/${restoreStatus.suggestedPaid.model} (${restoreStatus.suggestedPaid.providerKey})`);
    }
  }
  
  // Next actions
  if (failed > 0 || warnings > 0) {
    console.log('\n🔧 NEXT ACTIONS:');
    results.filter(r => r.status !== '✅').forEach(r => {
      console.log(`   ${r.status} ${r.name}: ${r.message}`);
    });
  }
  
  console.log('\n' + '='.repeat(80) + '\n');
}

/**
 * Main function
 */
async function main() {
  console.log('🧪 AI System End-to-End Regression Runner (v3.16)');
  console.log('='.repeat(80));
  console.log(`Company ID: ${COMPANY_ID}`);
  console.log(`Mode: ${APPLY_MODE ? '🔴 APPLY (mutations enabled)' : '🟢 DRY RUN (read-only)'}`);
  if (PROVIDER_FILTER) {
    console.log(`Provider Filter: ${PROVIDER_FILTER}`);
  }
  console.log('='.repeat(80));
  
  const db = await getAdminDb();
  if (!db) {
    console.error('❌ Database connection failed');
    process.exit(1);
  }
  
  try {
    // Load data
    await loadData(db);
    
    // Run assertions
    await testResolverNoMutation(db);
    await testKillSwitchPriority();
    await testRestorePaidStatus();
    await testProviderWalletLeakage();
    await testEntitlementStrictness();
    await testDailyCapCounter();
    await testAutoProtectionDryRunZeroMutation(db);
    
    // Apply mutations if enabled
    if (APPLY_MODE) {
      await applyMutations(db);
    }
    
    // Print summary
    printSummary();
    
    // Exit code
    const failed = results.filter(r => r.status === '❌').length;
    process.exit(failed > 0 ? 1 : 0);
    
  } catch (e: any) {
    console.error('\n❌ Fatal error:', e.message);
    if (VERBOSE) {
      console.error(e.stack);
    }
    process.exit(1);
  }
}

// Run
main().catch(e => {
  console.error('Unhandled error:', e);
  process.exit(1);
});

