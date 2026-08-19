/**
 * Teklifbul Rule v1.0 — CRITICAL/HIGH tenant isolation Firestore rules
 */
import { describe, test, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rulesContent = readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8');

const COMPANY_A = 'company-a';
const COMPANY_B = 'company-b';
const OWNER_A = 'owner-a';
const USER_A = 'user-a';
const USER_B = 'user-b';
const ATTACKER = 'attacker-1';

let testEnv;

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'companies', COMPANY_A), {
      ownerId: OWNER_A,
      ownerUid: OWNER_A,
      name: 'A Ltd',
      planId: 'premium_monthly',
      isPremium: true,
      isBuyer: true,
    });
    await setDoc(doc(db, 'companies', COMPANY_B), {
      ownerId: USER_B,
      ownerUid: USER_B,
      name: 'B Ltd',
      planId: 'premium_monthly',
      isPremium: true,
      isSupplier: true,
    });
    await setDoc(doc(db, 'companyCodes', 'CODEA'), {
      companyId: COMPANY_A,
      name: 'A Ltd',
      ownerId: OWNER_A,
    });
    await setDoc(doc(db, 'users', OWNER_A), {
      email: 'ownera@test.com',
      companyId: COMPANY_A,
      activeCompanyId: COMPANY_A,
      companyJoinStatus: 'accepted',
    });
    await setDoc(doc(db, 'users', USER_A), {
      email: 'usera@test.com',
      companyId: COMPANY_A,
      activeCompanyId: COMPANY_A,
      companies: [COMPANY_A],
      companyJoinStatus: 'accepted',
    });
    await setDoc(doc(db, 'users', USER_B), {
      email: 'userb@test.com',
      companyId: COMPANY_B,
      activeCompanyId: COMPANY_B,
      companies: [COMPANY_B],
      companyJoinStatus: 'accepted',
    });
    await setDoc(doc(db, 'companies', COMPANY_A, 'members', USER_A), {
      userId: USER_A,
      status: 'accepted',
    });
    await setDoc(doc(db, 'companies', COMPANY_B, 'members', USER_B), {
      userId: USER_B,
      status: 'accepted',
    });
    await setDoc(doc(db, 'stocks', 'stock-a'), {
      companyId: COMPANY_A,
      name: 'Stock A',
      sku: 'A-1',
    });
    await setDoc(doc(db, 'stocks', 'stock-b'), {
      companyId: COMPANY_B,
      name: 'Stock B',
      sku: 'B-1',
    });
    await setDoc(doc(db, 'sales', 'sale-b'), { companyId: COMPANY_B, total: 100 });
    await setDoc(doc(db, 'invoices', 'inv-b'), { companyId: COMPANY_B, amount: 50 });
    await setDoc(doc(db, 'customers', 'cust-b'), { companyId: COMPANY_B, name: 'Cust B' });
    await setDoc(doc(db, 'demands', 'demand-b'), {
      creatorCompanyId: COMPANY_B,
      createdBy: USER_B,
      isPublished: false,
      title: 'Secret RFQ',
    });
    await setDoc(doc(db, 'bids', 'bid-b'), {
      buyerCompanyId: COMPANY_B,
      supplierCompanyId: COMPANY_B,
      supplierId: USER_B,
      buyerId: USER_B,
      demandId: 'demand-b',
      price: 999,
      amount: 999,
      quantity: 10,
      paymentTerms: 'net-30',
      status: 'sent',
    });
    await setDoc(doc(db, 'public_listings', 'listing-b'), {
      companyId: COMPANY_B,
      buyerCompanyId: COMPANY_B,
      status: 'active',
      title: 'Listing B',
    });
    await setDoc(doc(db, 'companies', COMPANY_B, 'settings', 'purchaseAssistant'), {
      enabled: true,
      dailyPaidTokenCap: 1000,
    });
    await setDoc(doc(db, 'companies', COMPANY_B, 'aiDailyCounters', '2026-08-14'), {
      paidUsedTokens: 80,
    });
    await setDoc(doc(db, 'companies', COMPANY_B, 'wallets', 'ai'), {
      balanceTokens: 5000,
    });
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'teklifbul-tenant-isolation',
    firestore: {
      rules: rulesContent,
      host: 'localhost',
      port: 8080,
    },
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seed();
});

describe('CRITICAL-001 company spoof', () => {
  test('Test 1: new user cannot write companies[] / activeCompanyId victim', async () => {
    const ctx = testEnv.authenticatedContext(ATTACKER);
    const ref = doc(ctx.firestore(), 'users', ATTACKER);
    await assertFails(setDoc(ref, {
      email: 'att@test.com',
      companies: [COMPANY_B],
      activeCompanyId: COMPANY_B,
    }));
  });

  test('Test 2: new user cannot write companyId + accepted', async () => {
    const ctx = testEnv.authenticatedContext(ATTACKER);
    const ref = doc(ctx.firestore(), 'users', ATTACKER);
    await assertFails(setDoc(ref, {
      email: 'att@test.com',
      companyId: COMPANY_B,
      companyJoinStatus: 'accepted',
    }));
  });

  test('new user can create solo/pending profile', async () => {
    const ctx = testEnv.authenticatedContext(ATTACKER);
    const ref = doc(ctx.firestore(), 'users', ATTACKER);
    await assertSucceeds(setDoc(ref, {
      email: 'att@test.com',
      companyJoinStatus: 'pending',
    }));
  });

  test('founder can bind owned company on user create', async () => {
    const founder = 'founder-1';
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'companies', 'company-new'), {
        ownerId: founder,
        ownerUid: founder,
        name: 'New Co',
      });
    });
    const ctx = testEnv.authenticatedContext(founder);
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'users', founder), {
      email: 'f@test.com',
      companyId: 'company-new',
      activeCompanyId: 'company-new',
      companies: ['company-new'],
      companyJoinStatus: 'accepted',
      roles: ['buyer'],
    }));
  });

  test('founder cannot bind victim company via companies[] while claiming own company', async () => {
    const founder = 'founder-2';
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'companies', 'company-own'), {
        ownerId: founder,
        ownerUid: founder,
        name: 'Own Co',
      });
    });
    const ctx = testEnv.authenticatedContext(founder);
    await assertFails(setDoc(doc(ctx.firestore(), 'users', founder), {
      email: 'f2@test.com',
      companyId: 'company-own',
      activeCompanyId: COMPANY_B,
      companies: [COMPANY_B],
      companyJoinStatus: 'accepted',
    }));
  });

  test('solo update cannot inject companies[]', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'users', ATTACKER), {
        email: 'att@test.com',
        companyId: 'solo-att',
      });
    });
    const ctx = testEnv.authenticatedContext(ATTACKER);
    await assertFails(updateDoc(doc(ctx.firestore(), 'users', ATTACKER), {
      companies: [COMPANY_B],
      activeCompanyId: COMPANY_B,
    }));
  });
});

describe('CRITICAL-002 owner victim rewrite', () => {
  test('Test 5: owner A cannot bind accepted user B to company A', async () => {
    const owner = testEnv.authenticatedContext(OWNER_A);
    await assertFails(updateDoc(doc(owner.firestore(), 'users', USER_B), {
      companyId: COMPANY_A,
      companyJoinStatus: 'accepted',
      activeCompanyId: COMPANY_A,
    }));
  });

  test('owner A cannot bind a user with no pending join', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'users', 'stranger'), {
        email: 's@test.com',
        companyId: 'solo-s',
      });
    });
    const owner = testEnv.authenticatedContext(OWNER_A);
    await assertFails(updateDoc(doc(owner.firestore(), 'users', 'stranger'), {
      companyId: COMPANY_A,
      companyJoinStatus: 'accepted',
    }));
  });

  test('owner A can approve a pending member of A', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'users', 'joiner'), {
        email: 'j@test.com',
        companyJoinStatus: 'pending',
        companyCode: 'CODEA',
      });
      await setDoc(doc(admin.firestore(), 'companies', COMPANY_A, 'pendingMembers', 'joiner'), {
        userId: 'joiner',
        status: 'pending',
      });
    });
    const owner = testEnv.authenticatedContext(OWNER_A);
    await assertSucceeds(updateDoc(doc(owner.firestore(), 'users', 'joiner'), {
      companyId: COMPANY_A,
      activeCompanyId: COMPANY_A,
      companies: [COMPANY_A],
      companyJoinStatus: 'accepted',
    }));
  });
});

describe('Test 4 data isolation via client SDK', () => {
  test('user A cannot read company B stocks/sales/invoices/customers/unpublished demand', async () => {
    const ctx = testEnv.authenticatedContext(USER_A);
    const db = ctx.firestore();
    await assertFails(getDoc(doc(db, 'stocks', 'stock-b')));
    await assertFails(getDoc(doc(db, 'sales', 'sale-b')));
    await assertFails(getDoc(doc(db, 'invoices', 'inv-b')));
    await assertFails(getDoc(doc(db, 'customers', 'cust-b')));
    await assertFails(getDoc(doc(db, 'demands', 'demand-b')));
    await assertFails(getDoc(doc(db, 'companies', COMPANY_B, 'wallets', 'ai')));
    await assertFails(getDoc(doc(db, 'companies', COMPANY_B, 'settings', 'purchaseAssistant')));
    await assertFails(getDoc(doc(db, 'companies', COMPANY_B, 'aiDailyCounters', '2026-08-14')));
    await assertFails(getDoc(doc(db, 'bids', 'bid-b')));
    await assertFails(updateDoc(doc(db, 'stocks', 'stock-b'), { name: 'hacked' }));
  });

  test('user A can read own company stock', async () => {
    const ctx = testEnv.authenticatedContext(USER_A);
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'stocks', 'stock-a')));
  });

  test('attacker with spoofed user fields still cannot query victim stocks', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'users', ATTACKER), {
        email: 'att@test.com',
        companyId: 'solo-att',
        companies: [COMPANY_B],
        activeCompanyId: COMPANY_B,
      });
    });
    const ctx = testEnv.authenticatedContext(ATTACKER);
    await assertFails(getDoc(doc(ctx.firestore(), 'stocks', 'stock-b')));
  });
});

describe('HIGH-001 public_listings takeover', () => {
  test('user A cannot reassign listing B companyId', async () => {
    const ctx = testEnv.authenticatedContext(USER_A);
    await assertFails(updateDoc(doc(ctx.firestore(), 'public_listings', 'listing-b'), {
      companyId: COMPANY_A,
      buyerCompanyId: COMPANY_A,
      title: 'stolen',
    }));
  });
});

describe('HIGH-003 bid price tampering', () => {
  test('buyer of A cannot change price of bid belonging to B', async () => {
    const ctx = testEnv.authenticatedContext(USER_A);
    await assertFails(updateDoc(doc(ctx.firestore(), 'bids', 'bid-b'), {
      price: 1,
      amount: 1,
    }));
  });

  test('buyer of B cannot change commercial fields on own incoming bid', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'bids', 'bid-in-b'), {
        buyerCompanyId: COMPANY_B,
        supplierCompanyId: COMPANY_A,
        supplierId: USER_A,
        buyerId: USER_B,
        demandId: 'demand-b',
        price: 500,
        status: 'sent',
      });
    });
    const buyer = testEnv.authenticatedContext(USER_B);
    await assertFails(updateDoc(doc(buyer.firestore(), 'bids', 'bid-in-b'), {
      price: 1,
      quantity: 999,
      paymentTerms: 'hacked',
    }));
  });

  test('buyer of B can update status only', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'bids', 'bid-in-b2'), {
        buyerCompanyId: COMPANY_B,
        supplierCompanyId: COMPANY_A,
        supplierId: USER_A,
        buyerId: USER_B,
        demandId: 'demand-b',
        price: 500,
        status: 'sent',
      });
    });
    const buyer = testEnv.authenticatedContext(USER_B);
    await assertSucceeds(updateDoc(doc(buyer.firestore(), 'bids', 'bid-in-b2'), {
      status: 'accepted',
    }));
  });
});

describe('HIGH-004 companyCodes', () => {
  test('non-owner cannot create code for victim company', async () => {
    const ctx = testEnv.authenticatedContext(USER_A);
    await assertFails(setDoc(doc(ctx.firestore(), 'companyCodes', 'PHISH'), {
      companyId: COMPANY_B,
      name: 'B Ltd',
      ownerId: USER_A,
    }));
  });

  test('owner cannot retarget companyId on update', async () => {
    const owner = testEnv.authenticatedContext(OWNER_A);
    await assertFails(updateDoc(doc(owner.firestore(), 'companyCodes', 'CODEA'), {
      companyId: COMPANY_B,
    }));
  });
});

describe('HIGH-005/006 AI counters and caps', () => {
  test('owner cannot reset aiDailyCounters', async () => {
    const ownerB = testEnv.authenticatedContext(USER_B);
    await assertFails(updateDoc(
      doc(ownerB.firestore(), 'companies', COMPANY_B, 'aiDailyCounters', '2026-08-14'),
      { paidUsedTokens: 0 }
    ));
  });

  test('owner cannot change dailyPaidTokenCap on settings', async () => {
    const ownerB = testEnv.authenticatedContext(USER_B);
    await assertFails(updateDoc(
      doc(ownerB.firestore(), 'companies', COMPANY_B, 'settings', 'purchaseAssistant'),
      { dailyPaidTokenCap: 999999 }
    ));
  });

  test('owner can update non-cap settings fields', async () => {
    const ownerB = testEnv.authenticatedContext(USER_B);
    await assertSucceeds(updateDoc(
      doc(ownerB.firestore(), 'companies', COMPANY_B, 'settings', 'purchaseAssistant'),
      { customInstructions: 'be brief' }
    ));
  });
});

describe('join self-onboard and members SoT', () => {
  test('pending user cannot self-accept without approved pendingMembers', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'users', 'joiner-2'), {
        email: 'j2@test.com',
        companyJoinStatus: 'pending',
        companyCode: 'CODEA',
      });
    });
    const joiner = testEnv.authenticatedContext('joiner-2');
    await assertFails(updateDoc(doc(joiner.firestore(), 'users', 'joiner-2'), {
      companyId: COMPANY_A,
      activeCompanyId: COMPANY_A,
      companies: [COMPANY_A],
      companyJoinStatus: 'accepted',
    }));
  });

  test('pending user can self-accept after owner-accepted pendingMembers', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'users', 'joiner-3'), {
        email: 'j3@test.com',
        companyJoinStatus: 'pending',
        companyCode: 'CODEA',
      });
      await setDoc(doc(admin.firestore(), 'companies', COMPANY_A, 'pendingMembers', 'joiner-3'), {
        userId: 'joiner-3',
        status: 'accepted',
        approvedRole: 'buyer:satinalma_yetkilisi',
      });
    });
    const joiner = testEnv.authenticatedContext('joiner-3');
    await assertSucceeds(updateDoc(doc(joiner.firestore(), 'users', 'joiner-3'), {
      companyId: COMPANY_A,
      activeCompanyId: COMPANY_A,
      companies: [COMPANY_A],
      companyJoinStatus: 'accepted',
      companyRoleKey: 'buyer:satinalma_yetkilisi',
    }));
  });

  test('self-accept cannot assign genel_mudur when approvedRole is satinalma', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'users', 'joiner-esc'), {
        email: 'esc@test.com',
        companyJoinStatus: 'pending',
        companyCode: 'CODEA',
      });
      await setDoc(doc(admin.firestore(), 'companies', COMPANY_A, 'pendingMembers', 'joiner-esc'), {
        userId: 'joiner-esc',
        status: 'accepted',
        approvedRole: 'buyer:satinalma_yetkilisi',
      });
    });
    const joiner = testEnv.authenticatedContext('joiner-esc');
    await assertFails(updateDoc(doc(joiner.firestore(), 'users', 'joiner-esc'), {
      companyId: COMPANY_A,
      activeCompanyId: COMPANY_A,
      companies: [COMPANY_A],
      companyJoinStatus: 'accepted',
      companyRoleKey: 'buyer:genel_mudur',
    }));
  });

  test('accepted member cannot self-promote to admin', async () => {
    const member = testEnv.authenticatedContext(USER_A);
    await assertFails(updateDoc(doc(member.firestore(), 'users', USER_A), {
      companyRoleKey: 'admin',
      companyRole: 'admin',
    }));
  });

  test('supplier cannot self-promote to owner', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'users', 'supplier-m'), {
        email: 'supm@test.com',
        companyId: COMPANY_B,
        activeCompanyId: COMPANY_B,
        companies: [COMPANY_B],
        companyJoinStatus: 'accepted',
        companyRoleKey: 'supplier:saha_satis',
        companyRoleType: 'supplier',
      });
    });
    const supplier = testEnv.authenticatedContext('supplier-m');
    await assertFails(updateDoc(doc(supplier.firestore(), 'users', 'supplier-m'), {
      companyRoleKey: 'owner',
      companyRole: 'owner',
    }));
  });

  test('member cannot self-promote to genel_mudur', async () => {
    const member = testEnv.authenticatedContext(USER_A);
    await assertFails(updateDoc(doc(member.firestore(), 'users', USER_A), {
      companyRoleKey: 'buyer:genel_mudur',
    }));
  });

  test('self-accept cannot set companyRole genel_mudur when approvedRole is satinalma', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'users', 'joiner-role'), {
        email: 'jr@test.com',
        companyJoinStatus: 'pending',
        companyCode: 'CODEA',
      });
      await setDoc(doc(admin.firestore(), 'companies', COMPANY_A, 'pendingMembers', 'joiner-role'), {
        userId: 'joiner-role',
        status: 'accepted',
        approvedRole: 'buyer:satinalma_yetkilisi',
      });
    });
    const joiner = testEnv.authenticatedContext('joiner-role');
    await assertFails(updateDoc(doc(joiner.firestore(), 'users', 'joiner-role'), {
      companyId: COMPANY_A,
      activeCompanyId: COMPANY_A,
      companies: [COMPANY_A],
      companyJoinStatus: 'accepted',
      companyRoleKey: 'buyer:satinalma_yetkilisi',
      companyRoleType: 'buyer',
      companyRole: 'genel_mudur',
    }));
  });

  test('owner can write pendingMembers approvedRole', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'companies', COMPANY_A, 'pendingMembers', 'joiner-owner-role'), {
        userId: 'joiner-owner-role',
        status: 'pending',
      });
    });
    const owner = testEnv.authenticatedContext(OWNER_A);
    await assertSucceeds(updateDoc(doc(owner.firestore(), 'companies', COMPANY_A, 'pendingMembers', 'joiner-owner-role'), {
      approvedRole: 'buyer:satinalma_yetkilisi',
      status: 'accepted',
    }));
  });

  test('outsider cannot change another company member role', async () => {
    const attacker = testEnv.authenticatedContext(ATTACKER);
    await assertFails(updateDoc(doc(attacker.firestore(), 'users', USER_A), {
      companyRoleKey: 'buyer:genel_mudur',
    }));
    await assertFails(updateDoc(doc(attacker.firestore(), 'companies', COMPANY_A, 'members', USER_A), {
      approvedRole: 'owner',
    }));
  });

  test('self-accept can set only the owner-approved role', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'users', 'joiner-ok'), {
        email: 'ok@test.com',
        companyJoinStatus: 'pending',
        companyCode: 'CODEA',
      });
      await setDoc(doc(admin.firestore(), 'companies', COMPANY_A, 'pendingMembers', 'joiner-ok'), {
        userId: 'joiner-ok',
        status: 'accepted',
        approvedRole: 'buyer:satinalma_yetkilisi',
      });
    });
    const joiner = testEnv.authenticatedContext('joiner-ok');
    await assertSucceeds(updateDoc(doc(joiner.firestore(), 'users', 'joiner-ok'), {
      companyId: COMPANY_A,
      activeCompanyId: COMPANY_A,
      companies: [COMPANY_A],
      companyJoinStatus: 'accepted',
      companyRoleKey: 'buyer:satinalma_yetkilisi',
    }));
  });

  test('member cannot rewrite premiumExpiresAt', async () => {
    const member = testEnv.authenticatedContext(USER_A);
    await assertFails(updateDoc(doc(member.firestore(), 'companies', COMPANY_A), {
      premiumExpiresAt: new Date('2099-01-01'),
    }));
  });

  test('isPremium flag without paid planId is not premium for stock create', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'companies', 'free-flag'), {
        ownerId: USER_A,
        ownerUid: USER_A,
        isPremium: true,
        planId: 'free',
      });
      await setDoc(doc(admin.firestore(), 'users', USER_A), {
        companyId: 'free-flag',
        activeCompanyId: 'free-flag',
        companies: ['free-flag'],
        companyJoinStatus: 'accepted',
      }, { merge: true });
      await setDoc(doc(admin.firestore(), 'companies', 'free-flag', 'members', USER_A), {
        userId: USER_A,
        status: 'accepted',
      });
    });
    const member = testEnv.authenticatedContext(USER_A);
    await assertFails(setDoc(doc(member.firestore(), 'stocks', 'stock-free-flag'), {
      companyId: 'free-flag',
      name: 'Nope',
      sku: 'X',
    }));
  });

  test('user cannot create own pendingMembers as accepted', async () => {
    const attacker = testEnv.authenticatedContext(ATTACKER);
    await assertFails(setDoc(doc(attacker.firestore(), 'companies', COMPANY_A, 'pendingMembers', ATTACKER), {
      userId: ATTACKER,
      status: 'accepted',
    }));
  });

  test('joiner can create own pendingMembers as pending', async () => {
    const joiner = testEnv.authenticatedContext('self-join');
    await assertSucceeds(setDoc(doc(joiner.firestore(), 'companies', COMPANY_A, 'pendingMembers', 'self-join'), {
      userId: 'self-join',
      status: 'pending',
    }));
  });

  test('owner can create members after pendingMembers accepted', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'companies', COMPANY_A, 'pendingMembers', 'joiner-4'), {
        userId: 'joiner-4',
        status: 'accepted',
      });
    });
    const owner = testEnv.authenticatedContext(OWNER_A);
    await assertSucceeds(setDoc(doc(owner.firestore(), 'companies', COMPANY_A, 'members', 'joiner-4'), {
      userId: 'joiner-4',
      status: 'accepted',
    }));
  });

  test('non-owner cannot create members for company A', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'companies', COMPANY_A, 'pendingMembers', USER_B), {
        userId: USER_B,
        status: 'accepted',
      });
    });
    const other = testEnv.authenticatedContext(USER_B);
    await assertFails(setDoc(doc(other.firestore(), 'companies', COMPANY_A, 'members', USER_B), {
      userId: USER_B,
      status: 'accepted',
    }));
  });
});

describe('HIGH/MEDIUM leftover: PII, unpublished bid, pending company get', () => {
  test('accepted user cannot read buyer PII via leftover supplierCategoryIds', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'users', 'buyer-pii'), {
        email: 'secret-buyer@test.com',
        companyId: COMPANY_A,
        companyJoinStatus: 'accepted',
        isSupplier: false,
        supplierCategoryIds: ['cement'],
      });
    });
    const ctx = testEnv.authenticatedContext(USER_B);
    await assertFails(getDoc(doc(ctx.firestore(), 'users', 'buyer-pii')));
  });

  test('accepted user cannot read another company supplier users doc (PII)', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'users', 'supplier-pub'), {
        email: 'sup@test.com',
        companyId: COMPANY_B,
        companyJoinStatus: 'accepted',
        isSupplier: true,
        isActive: true,
        supplierCategoryIds: ['cement'],
      });
      await setDoc(doc(admin.firestore(), 'publicProfiles', 'supplier-pub'), {
        displayName: 'Sup Ltd',
        companyName: 'Sup Ltd',
        isSupplier: true,
        isActive: true,
      });
    });
    const ctx = testEnv.authenticatedContext(USER_A);
    await assertFails(getDoc(doc(ctx.firestore(), 'users', 'supplier-pub')));
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'publicProfiles', 'supplier-pub')));
  });

  test('accepted user cannot list all active suppliers (PII harvest)', async () => {
    const ctx = testEnv.authenticatedContext(USER_A);
    const q = query(
      collection(ctx.firestore(), 'users'),
      where('isSupplier', '==', true),
      where('isActive', '==', true)
    );
    await assertFails(getDocs(q));
  });

  test('supplier cannot create bid on unpublished demand', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'demands', 'demand-draft-a'), {
        creatorCompanyId: COMPANY_A,
        createdBy: USER_A,
        isPublished: false,
        title: 'Draft RFQ',
      });
    });
    const supplier = testEnv.authenticatedContext(USER_B);
    await assertFails(setDoc(doc(supplier.firestore(), 'bids', 'bid-on-draft'), {
      demandId: 'demand-draft-a',
      supplierId: USER_B,
      supplierCompanyId: COMPANY_B,
      buyerCompanyId: COMPANY_A,
      buyerId: USER_A,
      supplierVisibility: 'named',
      price: 10,
      status: 'sent',
    }));
  });

  test('pending user cannot get another buyer/supplier company', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'users', 'pending-reader'), {
        email: 'p@test.com',
        companyJoinStatus: 'pending',
        companyCode: 'CODEA',
      });
    });
    const pending = testEnv.authenticatedContext('pending-reader');
    await assertFails(getDoc(doc(pending.firestore(), 'companies', COMPANY_B)));
  });

  test('cannot create internal_request already APPROVED', async () => {
    const ctx = testEnv.authenticatedContext(USER_A);
    await assertFails(setDoc(doc(ctx.firestore(), 'internal_requests', 'ir-spoof'), {
      companyId: COMPANY_A,
      createdBy: USER_A,
      status: 'APPROVED',
      title: 'spoof',
    }));
  });

  test('member can create internal_request as DRAFT', async () => {
    const ctx = testEnv.authenticatedContext(USER_A);
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'internal_requests', 'ir-draft'), {
      companyId: COMPANY_A,
      createdBy: USER_A,
      status: 'DRAFT',
      title: 'ok',
    }));
  });

  test('cannot create internalDemand with completed status', async () => {
    const ctx = testEnv.authenticatedContext(USER_A);
    await assertFails(setDoc(doc(ctx.firestore(), 'internalDemands', 'id-spoof'), {
      companyId: COMPANY_A,
      createdBy: USER_A,
      status: 'completed',
      title: 'spoof',
    }));
  });

  test('client cannot set internal_request to APPROVED', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'internal_requests', 'ir-sent'), {
        companyId: COMPANY_A,
        createdBy: USER_A,
        status: 'SENT',
        title: 'sent',
      });
    });
    const ctx = testEnv.authenticatedContext(USER_A);
    await assertFails(updateDoc(doc(ctx.firestore(), 'internal_requests', 'ir-sent'), {
      status: 'APPROVED',
    }));
    await assertSucceeds(updateDoc(doc(ctx.firestore(), 'internal_requests', 'ir-sent'), {
      status: 'cancelled',
    }));
  });

  test('free company cannot create invoice', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'companies', 'company-free'), {
        ownerId: 'user-free',
        name: 'Free Ltd',
        isPremium: false,
      });
      await setDoc(doc(admin.firestore(), 'users', 'user-free'), {
        email: 'free@test.com',
        companyId: 'company-free',
        activeCompanyId: 'company-free',
        companyJoinStatus: 'accepted',
      });
    });
    const ctx = testEnv.authenticatedContext('user-free');
    await assertFails(setDoc(doc(ctx.firestore(), 'invoices', 'inv-free'), {
      companyId: 'company-free',
      createdBy: 'user-free',
    }));
  });

  test('premium member can create invoice', async () => {
    const ctx = testEnv.authenticatedContext(USER_A);
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'invoices', 'inv-prem'), {
      companyId: COMPANY_A,
      createdBy: USER_A,
    }));
  });
});

describe('PHASE 1 C-002R pending poach + members update', () => {
  test('TEST 1: owner A cannot plant pendingMembers for user pending at company B', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'users', 'pending-at-b'), {
        email: 'pendb@test.com',
        companyId: COMPANY_B,
        companyJoinStatus: 'pending',
      });
    });
    const owner = testEnv.authenticatedContext(OWNER_A);
    await assertFails(setDoc(doc(owner.firestore(), 'companies', COMPANY_A, 'pendingMembers', 'pending-at-b'), {
      userId: 'pending-at-b',
      status: 'pending',
    }));
  });

  test('TEST 2: valid pending join then owner approve is allowed', async () => {
    const joinerId = 'joiner-valid-a';
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'users', joinerId), {
        email: 'joinera@test.com',
        companyJoinStatus: 'pending',
        companyCode: 'CODEA',
      });
    });
    const joiner = testEnv.authenticatedContext(joinerId);
    await assertSucceeds(setDoc(doc(joiner.firestore(), 'companies', COMPANY_A, 'pendingMembers', joinerId), {
      userId: joinerId,
      status: 'pending',
    }));
    const owner = testEnv.authenticatedContext(OWNER_A);
    await assertSucceeds(updateDoc(doc(owner.firestore(), 'companies', COMPANY_A, 'pendingMembers', joinerId), {
      status: 'accepted',
    }));
    await assertSucceeds(setDoc(doc(owner.firestore(), 'companies', COMPANY_A, 'members', joinerId), {
      userId: joinerId,
      status: 'accepted',
    }));
  });

  test('owner can create pendingMembers only when user has pending join for that company', async () => {
    const joinerId = 'joiner-code-a';
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'users', joinerId), {
        email: 'joiner-code@test.com',
        companyJoinStatus: 'pending',
        companyCode: 'CODEA',
      });
    });
    const owner = testEnv.authenticatedContext(OWNER_A);
    await assertSucceeds(setDoc(doc(owner.firestore(), 'companies', COMPANY_A, 'pendingMembers', joinerId), {
      userId: joinerId,
      status: 'accepted',
    }));
  });

  test('TEST 3: owner A cannot pull accepted member of company B', async () => {
    const owner = testEnv.authenticatedContext(OWNER_A);
    await assertFails(setDoc(doc(owner.firestore(), 'companies', COMPANY_A, 'pendingMembers', USER_B), {
      userId: USER_B,
      status: 'accepted',
    }));
    await assertFails(updateDoc(doc(owner.firestore(), 'users', USER_B), {
      companyId: COMPANY_A,
      companies: [COMPANY_A],
      activeCompanyId: COMPANY_A,
      companyJoinStatus: 'accepted',
    }));
  });

  test('TEST 4: member cannot set own members.role to admin', async () => {
    const member = testEnv.authenticatedContext(USER_A);
    await assertFails(updateDoc(doc(member.firestore(), 'companies', COMPANY_A, 'members', USER_A), {
      role: 'admin',
    }));
  });

  test('TEST 5: member cannot change members.companyId', async () => {
    const member = testEnv.authenticatedContext(USER_A);
    await assertFails(updateDoc(doc(member.firestore(), 'companies', COMPANY_A, 'members', USER_A), {
      companyId: COMPANY_B,
    }));
  });

  test('TEST 6: member cannot change members.status', async () => {
    const member = testEnv.authenticatedContext(USER_A);
    await assertFails(updateDoc(doc(member.firestore(), 'companies', COMPANY_A, 'members', USER_A), {
      status: 'admin',
    }));
  });

  test('owner cannot set members.role to superAdmin', async () => {
    const owner = testEnv.authenticatedContext(OWNER_A);
    await assertFails(updateDoc(doc(owner.firestore(), 'companies', COMPANY_A, 'members', USER_A), {
      role: 'superAdmin',
    }));
  });

  test('owner can approve members.status accepted without identity rewrite', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'companies', COMPANY_A, 'members', 'temp-member'), {
        userId: 'temp-member',
        status: 'pending',
      });
    });
    const owner = testEnv.authenticatedContext(OWNER_A);
    await assertSucceeds(updateDoc(doc(owner.firestore(), 'companies', COMPANY_A, 'members', 'temp-member'), {
      status: 'accepted',
    }));
  });
});

describe('bids list queries (dashboard outgoing)', () => {
  test('supplier B can list own bids by supplierId', async () => {
    const ctx = testEnv.authenticatedContext(USER_B);
    const q = query(collection(ctx.firestore(), 'bids'), where('supplierId', '==', USER_B));
    await assertSucceeds(getDocs(q));
  });

  test('supplier B can list own bids by supplierCompanyId', async () => {
    const ctx = testEnv.authenticatedContext(USER_B);
    const q = query(collection(ctx.firestore(), 'bids'), where('supplierCompanyId', '==', COMPANY_B));
    await assertSucceeds(getDocs(q));
  });

  test('user A cannot list company B bids by supplierCompanyId', async () => {
    const ctx = testEnv.authenticatedContext(USER_A);
    const q = query(collection(ctx.firestore(), 'bids'), where('supplierCompanyId', '==', COMPANY_B));
    await assertFails(getDocs(q));
  });

  test('tax- company member can list bids by supplierCompanyId', async () => {
    const taxCompany = 'tax-0450650024';
    const taxUser = 'tax-user-1';
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      const db = admin.firestore();
      await setDoc(doc(db, 'companies', taxCompany), {
        ownerId: taxUser,
        name: 'Tax Co',
      });
      await setDoc(doc(db, 'users', taxUser), {
        email: 'tax@test.com',
        companyId: taxCompany,
        activeCompanyId: 'solo-tax-user-1',
        companies: [taxCompany],
        companyJoinStatus: 'accepted',
      });
      await setDoc(doc(db, 'companies', taxCompany, 'members', taxUser), {
        userId: taxUser,
        status: 'accepted',
      });
      await setDoc(doc(db, 'bids', 'bid-tax'), {
        buyerCompanyId: COMPANY_A,
        supplierCompanyId: taxCompany,
        supplierId: taxUser,
        buyerId: OWNER_A,
        demandId: 'demand-a',
        status: 'sent',
      });
    });
    const ctx = testEnv.authenticatedContext(taxUser);
    const q = query(collection(ctx.firestore(), 'bids'), where('supplierCompanyId', '==', taxCompany));
    await assertSucceeds(getDocs(q));
  });
});
