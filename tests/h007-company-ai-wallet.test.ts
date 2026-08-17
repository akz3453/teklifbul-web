/**
 * H-007 company paid wallet: reserve / capture / release
 * Teklifbul Rule v1.0
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  FakeFirestore,
  holdPath,
  seedProviderWallet,
  walletPath,
} from './helpers/fake-firestore.js';

const getAdminDb = vi.fn();

vi.mock('../server/utils/firestore.js', () => ({
  getAdminDb: (...args: unknown[]) => getAdminDb(...args),
}));

vi.mock('../server/services/aiCostAccountingService.js', () => ({
  computeLedgerCostMeta: vi.fn().mockResolvedValue(null),
}));

const {
  AI_ERROR_CODES,
} = await import('../server/constants/aiMeta.js');

const {
  AI_HOLD_BILLING_STATUS,
  AI_HOLD_PROVIDER_STATUS,
  AI_TOKEN_HOLD_STATUS,
  assertWalletInvariants,
  buildAiTokenHoldId,
  captureCompanyTokensTransactional,
  getCompanyAiWallet,
  markCompanyAiHoldProviderOutcome,
  releaseCompanyTokensTransactional,
  reserveCompanyTokensTransactional,
} = await import('../server/services/companyAiWalletService.js');

const { runCompanyPaidChatTurn } = await import('../server/services/companyPaidChatBilling.js');
const { recoverStuckCompanyAiHolds } = await import('../server/services/companyAiWalletHoldRecovery.js');
const { resolveAiChatRequestId } = await import('../server/utils/aiChatRequestId.js');

const COMPANY_A = 'tax-1111111111';
const COMPANY_B = 'tax-2222222222';
const USER_A = 'user-a';
const PROVIDER = 'openai';

function expectInvariants(wallet: { balanceTokens: number; reservedTokens: number }) {
  expect(wallet.balanceTokens).toBeGreaterThanOrEqual(0);
  expect(wallet.reservedTokens).toBeGreaterThanOrEqual(0);
  expect(wallet.balanceTokens).toBeGreaterThanOrEqual(wallet.reservedTokens);
  assertWalletInvariants(wallet.balanceTokens, wallet.reservedTokens);
}

describe('H-007 company AI wallet holds', () => {
  let db: FakeFirestore;

  beforeEach(() => {
    db = new FakeFirestore();
    getAdminDb.mockReset();
    getAdminDb.mockResolvedValue(db);
  });

  test('TEST 1 — normal reserve then capture', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 5000 });
    const requestId = 'req-normal-0001';

    const reserved = await reserveCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId,
      estimatedTokens: 1000,
    });
    expect(reserved.replay).toBe(false);
    expect(reserved.wallet.reservedTokens).toBe(1000);
    expect(reserved.wallet.balanceTokens).toBe(5000);
    expectInvariants(reserved.wallet);

    const captured = await captureCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId,
      actualTokens: 700,
    });
    expect(captured.wallet.reservedTokens).toBe(0);
    expect(captured.wallet.balanceTokens).toBe(4300);
    expect(captured.actualTokens).toBe(700);
    expectInvariants(captured.wallet);
  });

  test('TEST 2 — insufficient balance does not reserve', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 500 });
    await expect(
      reserveCompanyTokensTransactional({
        companyId: COMPANY_A,
        userId: USER_A,
        provider: PROVIDER,
        requestId: 'req-low-0001',
        estimatedTokens: 1000,
      })
    ).rejects.toMatchObject({ code: AI_ERROR_CODES.INSUFFICIENT_TOKENS });

    const wallet = await getCompanyAiWallet(COMPANY_A, PROVIDER);
    expect(wallet?.balanceTokens).toBe(500);
    expect(wallet?.reservedTokens).toBe(0);
    expectInvariants(wallet!);
    expect(db.read(holdPath(COMPANY_A, buildAiTokenHoldId('req-low-0001')))).toBeUndefined();
  });

  test('TEST 3 — concurrent reserves: only one provider call', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 1000 });
    let providerCalls = 0;

    const invoke = async () => {
      providerCalls += 1;
      return { text: 'ok', totalTokens: 100 };
    };

    const [a, b] = await Promise.all([
      runCompanyPaidChatTurn({
        companyId: COMPANY_A,
        userId: USER_A,
        provider: PROVIDER,
        requestId: 'req-conc-a',
        estimatedTokens: 800,
        invokeProvider: invoke,
      }),
      runCompanyPaidChatTurn({
        companyId: COMPANY_A,
        userId: USER_A,
        provider: PROVIDER,
        requestId: 'req-conc-b',
        estimatedTokens: 800,
        invokeProvider: invoke,
      }),
    ]);

    const outcomes = [a, b];
    const ok = outcomes.filter((x) => x.ok);
    const fail = outcomes.filter((x) => !x.ok);
    expect(ok).toHaveLength(1);
    expect(fail).toHaveLength(1);
    expect(fail[0].code).toBe(AI_ERROR_CODES.INSUFFICIENT_TOKENS);
    expect(providerCalls).toBe(1);

    const wallet = await getCompanyAiWallet(COMPANY_A, PROVIDER);
    expect(wallet?.reservedTokens).toBe(0);
    expect(wallet?.balanceTokens).toBe(900);
    expectInvariants(wallet!);
  });

  test('TEST 4 — provider failure releases hold', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 5000 });
    const result = await runCompanyPaidChatTurn({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId: 'req-fail-0001',
      estimatedTokens: 1000,
      invokeProvider: async () => {
        throw new Error('provider timeout');
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('AI_PROVIDER_ERROR');

    const wallet = await getCompanyAiWallet(COMPANY_A, PROVIDER);
    expect(wallet?.balanceTokens).toBe(5000);
    expect(wallet?.reservedTokens).toBe(0);
    expectInvariants(wallet!);

    const hold = db.read(holdPath(COMPANY_A, buildAiTokenHoldId('req-fail-0001')));
    expect(hold?.status).toBe(AI_TOKEN_HOLD_STATUS.RELEASED);
  });

  test('TEST 5 — capture unused reserve returns to available', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 5000 });
    const requestId = 'req-capture-0001';
    await reserveCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId,
      estimatedTokens: 2000,
    });
    const captured = await captureCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId,
      actualTokens: 800,
    });
    expect(captured.wallet.reservedTokens).toBe(0);
    expect(captured.wallet.balanceTokens).toBe(4200);
    expectInvariants(captured.wallet);
  });

  test('TEST 6 — double capture debits once', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 5000 });
    const requestId = 'req-dbl-cap-0001';
    await reserveCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId,
      estimatedTokens: 1000,
    });
    await captureCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId,
      actualTokens: 700,
    });
    const second = await captureCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId,
      actualTokens: 700,
    });
    expect(second.wallet.balanceTokens).toBe(4300);
    expect(second.wallet.reservedTokens).toBe(0);
    expectInvariants(second.wallet);
  });

  test('TEST 7 — double release reduces reserved once', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 5000 });
    const requestId = 'req-dbl-rel-0001';
    await reserveCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId,
      estimatedTokens: 1000,
    });
    const first = await releaseCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId,
    });
    expect(first.wallet.reservedTokens).toBe(0);
    expect(first.wallet.balanceTokens).toBe(5000);

    const second = await releaseCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId,
    });
    expect(second.wallet.reservedTokens).toBe(0);
    expect(second.wallet.balanceTokens).toBe(5000);
    expectInvariants(second.wallet);
  });

  test('TEST 8 — same company + requestId does not call provider twice', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 5000 });
    let providerCalls = 0;
    const invoke = async () => {
      providerCalls += 1;
      return { text: 'hello', totalTokens: 400 };
    };

    const first = await runCompanyPaidChatTurn({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId: 'req-retry-same',
      estimatedTokens: 1000,
      invokeProvider: invoke,
    });
    const second = await runCompanyPaidChatTurn({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId: 'req-retry-same',
      estimatedTokens: 1000,
      invokeProvider: invoke,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe(AI_ERROR_CODES.AI_REQUEST_ALREADY_PROCESSED);
    expect(providerCalls).toBe(1);

    const wallet = await getCompanyAiWallet(COMPANY_A, PROVIDER);
    expect(wallet?.balanceTokens).toBe(4600);
    expect(wallet?.reservedTokens).toBe(0);
    expectInvariants(wallet!);
  });

  test('TEST 9 — same requestId is isolated per company', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 5000 });
    seedProviderWallet(db, COMPANY_B, PROVIDER, { balanceTokens: 5000 });
    const requestId = 'abc-shared-id';

    const a = await reserveCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId,
      estimatedTokens: 1000,
    });
    const b = await reserveCompanyTokensTransactional({
      companyId: COMPANY_B,
      userId: 'user-b',
      provider: PROVIDER,
      requestId,
      estimatedTokens: 1000,
    });

    expect(a.replay).toBe(false);
    expect(b.replay).toBe(false);
    expect(a.holdId).toBe(b.holdId);
    expect(a.wallet.reservedTokens).toBe(1000);
    expect(b.wallet.reservedTokens).toBe(1000);

    const holdA = db.read(holdPath(COMPANY_A, a.holdId));
    const holdB = db.read(holdPath(COMPANY_B, b.holdId));
    expect(holdA?.requestId).toBe(requestId);
    expect(holdB?.requestId).toBe(requestId);
    expect(holdA).not.toBe(holdB);
    expectInvariants(a.wallet);
    expectInvariants(b.wallet);
  });

  test('TEST 10 — missing reservedTokens on old wallet is treated as 0', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 3000 });
    const raw = db.read(walletPath(COMPANY_A, PROVIDER));
    expect(raw?.reservedTokens).toBeUndefined();

    const wallet = await getCompanyAiWallet(COMPANY_A, PROVIDER);
    expect(wallet?.reservedTokens).toBe(0);
    expectInvariants(wallet!);

    const reserved = await reserveCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId: 'req-legacy-doc',
      estimatedTokens: 500,
    });
    expect(reserved.wallet.reservedTokens).toBe(500);
    expect(reserved.wallet.balanceTokens).toBe(3000);
    expectInvariants(reserved.wallet);
  });

  test('x-request-id validation rejects unsafe ids', () => {
    expect(resolveAiChatRequestId('bad id')).toMatchObject({ ok: false });
    expect(resolveAiChatRequestId('../etc/passwd')).toMatchObject({ ok: false });
    expect(resolveAiChatRequestId('short')).toMatchObject({ ok: false });
    const ok = resolveAiChatRequestId('valid-req-01');
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.fromClient).toBe(true);
    const generated = resolveAiChatRequestId(undefined);
    expect(generated.ok).toBe(true);
    if (generated.ok) expect(generated.fromClient).toBe(false);
  });

  test('in-progress replay does not call provider', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 5000 });
    const requestId = 'req-in-flight';
    await reserveCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId,
      estimatedTokens: 1000,
    });

    let providerCalls = 0;
    const replay = await runCompanyPaidChatTurn({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId,
      estimatedTokens: 1000,
      invokeProvider: async () => {
        providerCalls += 1;
        return { text: 'nope', totalTokens: 1 };
      },
    });
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.code).toBe(AI_ERROR_CODES.AI_REQUEST_IN_PROGRESS);
    expect(providerCalls).toBe(0);
    const wallet = await getCompanyAiWallet(COMPANY_A, PROVIDER);
    expect(wallet?.reservedTokens).toBe(1000);
    expect(wallet?.balanceTokens).toBe(5000);
    expectInvariants(wallet!);
  });

  test('TEST A — provider success then capture success debits once', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 5000 });
    let providerCalls = 0;
    const result = await runCompanyPaidChatTurn({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId: 'req-a-success',
      estimatedTokens: 1000,
      invokeProvider: async () => {
        providerCalls += 1;
        return { text: 'ok', totalTokens: 700 };
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.captureDeferred).toBeFalsy();
      expect(result.actualTokens).toBe(700);
      expect(result.wallet.balanceTokens).toBe(4300);
      expect(result.wallet.reservedTokens).toBe(0);
    }
    expect(providerCalls).toBe(1);
    const hold = db.read(holdPath(COMPANY_A, buildAiTokenHoldId('req-a-success')));
    expect(hold?.status).toBe(AI_TOKEN_HOLD_STATUS.CAPTURED);
    expect(hold?.billingStatus).toBe(AI_HOLD_BILLING_STATUS.CAPTURED);
    expect(hold?.providerStatus).toBe(AI_HOLD_PROVIDER_STATUS.SUCCESS);
    expectInvariants((await getCompanyAiWallet(COMPANY_A, PROVIDER))!);
  });

  test('TEST B — provider failure releases hold', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 5000 });
    const result = await runCompanyPaidChatTurn({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId: 'req-b-fail',
      estimatedTokens: 1000,
      invokeProvider: async () => {
        throw new Error('provider timeout');
      },
    });
    expect(result.ok).toBe(false);
    const wallet = await getCompanyAiWallet(COMPANY_A, PROVIDER);
    expect(wallet?.balanceTokens).toBe(5000);
    expect(wallet?.reservedTokens).toBe(0);
    const hold = db.read(holdPath(COMPANY_A, buildAiTokenHoldId('req-b-fail')));
    expect(hold?.status).toBe(AI_TOKEN_HOLD_STATUS.RELEASED);
    expect(hold?.providerStatus).toBe(AI_HOLD_PROVIDER_STATUS.TIMEOUT);
    expect(hold?.billingStatus).toBe(AI_HOLD_BILLING_STATUS.RELEASED);
    expectInvariants(wallet!);
  });

  test('TEST C — provider success + capture failure does not release', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 5000 });
    db.failNextCapturePendingRead = true;
    const result = await runCompanyPaidChatTurn({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId: 'req-c-capture-fail',
      estimatedTokens: 1000,
      invokeProvider: async () => ({ text: 'answer', totalTokens: 800 }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.captureDeferred).toBe(true);

    const hold = db.read(holdPath(COMPANY_A, buildAiTokenHoldId('req-c-capture-fail')));
    expect(hold?.status).toBe(AI_TOKEN_HOLD_STATUS.RESERVED);
    expect(hold?.billingStatus).toBe(AI_HOLD_BILLING_STATUS.CAPTURE_PENDING);
    expect(hold?.providerStatus).toBe(AI_HOLD_PROVIDER_STATUS.SUCCESS);
    expect(hold?.actualTokens).toBe(800);

    const released = await releaseCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId: 'req-c-capture-fail',
    });
    expect(released.status).toBe(AI_TOKEN_HOLD_STATUS.RESERVED);

    const wallet = await getCompanyAiWallet(COMPANY_A, PROVIDER);
    expect(wallet?.balanceTokens).toBe(5000);
    expect(wallet?.reservedTokens).toBe(1000);
    expectInvariants(wallet!);

    const aged = { ...(hold || {}), createdAtMs: Date.now() - 10 * 60 * 1000 };
    db.write(holdPath(COMPANY_A, buildAiTokenHoldId('req-c-capture-fail')), aged);
    const recovery = await recoverStuckCompanyAiHolds({
      companyId: COMPANY_A,
      ttlMs: 60 * 1000,
    });
    expect(recovery.captured).toBe(1);
    expect(recovery.released).toBe(0);
    const after = await getCompanyAiWallet(COMPANY_A, PROVIDER);
    expect(after?.balanceTokens).toBe(4200);
    expect(after?.reservedTokens).toBe(0);
    expect(db.read(holdPath(COMPANY_A, buildAiTokenHoldId('req-c-capture-fail')))?.status).toBe(
      AI_TOKEN_HOLD_STATUS.CAPTURED
    );
    expectInvariants(after!);
  });

  test('TEST D — crash after reserve marks needs_reconciliation without release', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 5000 });
    const requestId = 'req-d-crash';
    await reserveCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId,
      estimatedTokens: 1000,
    });
    const holdId = buildAiTokenHoldId(requestId);
    const hold = db.read(holdPath(COMPANY_A, holdId)) || {};
    db.write(holdPath(COMPANY_A, holdId), { ...hold, createdAtMs: Date.now() - 10 * 60 * 1000 });

    const fresh = await recoverStuckCompanyAiHolds({
      companyId: COMPANY_A,
      ttlMs: 60 * 1000,
      nowMs: Date.now(),
    });
    expect(fresh.released).toBe(0);
    expect(fresh.captured).toBe(0);
    expect(fresh.reconciled).toBe(1);

    const wallet = await getCompanyAiWallet(COMPANY_A, PROVIDER);
    expect(wallet?.balanceTokens).toBe(5000);
    expect(wallet?.reservedTokens).toBe(1000);
    const afterHold = db.read(holdPath(COMPANY_A, holdId));
    expect(afterHold?.status).toBe(AI_TOKEN_HOLD_STATUS.RESERVED);
    expect(afterHold?.billingStatus).toBe(AI_HOLD_BILLING_STATUS.NEEDS_RECONCILIATION);
    expect(afterHold?.providerStatus).toBe(AI_HOLD_PROVIDER_STATUS.PENDING);
    expectInvariants(wallet!);
  });

  test('TEST D — in-flight reserved hold is not recovered', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 5000 });
    await reserveCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId: 'req-d-inflight',
      estimatedTokens: 1000,
    });
    const recovery = await recoverStuckCompanyAiHolds({
      companyId: COMPANY_A,
      ttlMs: 5 * 60 * 1000,
    });
    expect(recovery.released).toBe(0);
    expect(recovery.captured).toBe(0);
    const wallet = await getCompanyAiWallet(COMPANY_A, PROVIDER);
    expect(wallet?.reservedTokens).toBe(1000);
    expectInvariants(wallet!);
  });

  test('TEST E — capture retry does not debit twice', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 5000 });
    const requestId = 'req-e-cap-retry';
    await reserveCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId,
      estimatedTokens: 1000,
    });
    await captureCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId,
      actualTokens: 700,
    });
    const second = await captureCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId,
      actualTokens: 700,
    });
    expect(second.wallet.balanceTokens).toBe(4300);
    expect(second.wallet.reservedTokens).toBe(0);
    expectInvariants(second.wallet);
  });

  test('TEST F — release retry does not unlock twice', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 5000 });
    const requestId = 'req-f-rel-retry';
    await reserveCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId,
      estimatedTokens: 1000,
    });
    await releaseCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId,
    });
    const second = await releaseCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId,
    });
    expect(second.wallet.balanceTokens).toBe(5000);
    expect(second.wallet.reservedTokens).toBe(0);
    expectInvariants(second.wallet);
  });

  test('TEST G — concurrent reserve allows only one provider call', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 1000 });
    let providerCalls = 0;
    const invoke = async () => {
      providerCalls += 1;
      return { text: 'ok', totalTokens: 100 };
    };
    const [a, b] = await Promise.all([
      runCompanyPaidChatTurn({
        companyId: COMPANY_A,
        userId: USER_A,
        provider: PROVIDER,
        requestId: 'req-g-a',
        estimatedTokens: 800,
        invokeProvider: invoke,
      }),
      runCompanyPaidChatTurn({
        companyId: COMPANY_A,
        userId: USER_A,
        provider: PROVIDER,
        requestId: 'req-g-b',
        estimatedTokens: 800,
        invokeProvider: invoke,
      }),
    ]);
    const ok = [a, b].filter((x) => x.ok);
    const fail = [a, b].filter((x) => !x.ok);
    expect(ok).toHaveLength(1);
    expect(fail).toHaveLength(1);
    expect(providerCalls).toBe(1);
    expectInvariants((await getCompanyAiWallet(COMPANY_A, PROVIDER))!);
  });

  test('TEST H — same requestId retry does not call provider twice', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 5000 });
    let providerCalls = 0;
    const invoke = async () => {
      providerCalls += 1;
      return { text: 'hello', totalTokens: 400 };
    };
    const first = await runCompanyPaidChatTurn({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId: 'req-h-retry',
      estimatedTokens: 1000,
      invokeProvider: invoke,
    });
    const second = await runCompanyPaidChatTurn({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId: 'req-h-retry',
      estimatedTokens: 1000,
      invokeProvider: invoke,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe(AI_ERROR_CODES.AI_REQUEST_ALREADY_PROCESSED);
    expect(providerCalls).toBe(1);
    expectInvariants((await getCompanyAiWallet(COMPANY_A, PROVIDER))!);
  });

  test('TEST I — needs_reconciliation second sweep does not mutate wallet', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 5000 });
    const requestId = 'req-i-recon-repeat';
    await reserveCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId,
      estimatedTokens: 1000,
    });
    const holdId = buildAiTokenHoldId(requestId);
    const hold = db.read(holdPath(COMPANY_A, holdId)) || {};
    db.write(holdPath(COMPANY_A, holdId), { ...hold, createdAtMs: Date.now() - 10 * 60 * 1000 });

    const first = await recoverStuckCompanyAiHolds({
      companyId: COMPANY_A,
      ttlMs: 60 * 1000,
    });
    expect(first.reconciled).toBe(1);
    expect(first.released).toBe(0);

    const second = await recoverStuckCompanyAiHolds({
      companyId: COMPANY_A,
      ttlMs: 60 * 1000,
    });
    expect(second.reconciled).toBe(0);
    expect(second.released).toBe(0);
    expect(second.captured).toBe(0);
    expect(second.skipped).toBeGreaterThanOrEqual(1);

    const wallet = await getCompanyAiWallet(COMPANY_A, PROVIDER);
    expect(wallet?.balanceTokens).toBe(5000);
    expect(wallet?.reservedTokens).toBe(1000);
    expect(db.read(holdPath(COMPANY_A, holdId))?.status).toBe(AI_TOKEN_HOLD_STATUS.RESERVED);
    expect(db.read(holdPath(COMPANY_A, holdId))?.billingStatus).toBe(
      AI_HOLD_BILLING_STATUS.NEEDS_RECONCILIATION
    );
    expectInvariants(wallet!);
  });

  test('TEST J — needs_reconciliation replay does not call provider', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 5000 });
    const requestId = 'req-j-recon-replay';
    await reserveCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId,
      estimatedTokens: 1000,
    });
    const holdId = buildAiTokenHoldId(requestId);
    const hold = db.read(holdPath(COMPANY_A, holdId)) || {};
    db.write(holdPath(COMPANY_A, holdId), { ...hold, createdAtMs: Date.now() - 10 * 60 * 1000 });
    await recoverStuckCompanyAiHolds({ companyId: COMPANY_A, ttlMs: 60 * 1000 });

    let providerCalls = 0;
    const replay = await runCompanyPaidChatTurn({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId,
      estimatedTokens: 1000,
      invokeProvider: async () => {
        providerCalls += 1;
        return { text: 'should-not-run', totalTokens: 100 };
      },
    });
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.code).toBe(AI_ERROR_CODES.AI_REQUEST_ALREADY_PROCESSED);
    expect(providerCalls).toBe(0);
    const wallet = await getCompanyAiWallet(COMPANY_A, PROVIDER);
    expect(wallet?.reservedTokens).toBe(1000);
    expect(wallet?.balanceTokens).toBe(5000);
    expectInvariants(wallet!);
  });

  test('TEST K — marked provider failure is released by recovery', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 5000 });
    const requestId = 'req-k-fail-mark';
    await reserveCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId,
      estimatedTokens: 1000,
    });
    await markCompanyAiHoldProviderOutcome({
      companyId: COMPANY_A,
      requestId,
      provider: PROVIDER,
      userId: USER_A,
      providerStatus: AI_HOLD_PROVIDER_STATUS.FAILURE,
    });
    const holdId = buildAiTokenHoldId(requestId);
    const hold = db.read(holdPath(COMPANY_A, holdId)) || {};
    db.write(holdPath(COMPANY_A, holdId), { ...hold, createdAtMs: Date.now() - 10 * 60 * 1000 });

    const recovery = await recoverStuckCompanyAiHolds({
      companyId: COMPANY_A,
      ttlMs: 60 * 1000,
    });
    expect(recovery.released).toBe(1);
    expect(recovery.captured).toBe(0);
    expect(recovery.reconciled).toBe(0);
    const wallet = await getCompanyAiWallet(COMPANY_A, PROVIDER);
    expect(wallet?.balanceTokens).toBe(5000);
    expect(wallet?.reservedTokens).toBe(0);
    expect(db.read(holdPath(COMPANY_A, holdId))?.status).toBe(AI_TOKEN_HOLD_STATUS.RELEASED);
    expectInvariants(wallet!);
  });

  test('TEST L — marked provider timeout is released by recovery', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 5000 });
    const requestId = 'req-l-timeout-mark';
    await reserveCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId,
      estimatedTokens: 1000,
    });
    await markCompanyAiHoldProviderOutcome({
      companyId: COMPANY_A,
      requestId,
      provider: PROVIDER,
      userId: USER_A,
      providerStatus: AI_HOLD_PROVIDER_STATUS.TIMEOUT,
    });
    const holdId = buildAiTokenHoldId(requestId);
    const hold = db.read(holdPath(COMPANY_A, holdId)) || {};
    db.write(holdPath(COMPANY_A, holdId), { ...hold, createdAtMs: Date.now() - 10 * 60 * 1000 });

    const recovery = await recoverStuckCompanyAiHolds({
      companyId: COMPANY_A,
      ttlMs: 60 * 1000,
    });
    expect(recovery.released).toBe(1);
    expect(recovery.reconciled).toBe(0);
    const wallet = await getCompanyAiWallet(COMPANY_A, PROVIDER);
    expect(wallet?.reservedTokens).toBe(0);
    expect(wallet?.balanceTokens).toBe(5000);
    expect(db.read(holdPath(COMPANY_A, holdId))?.status).toBe(AI_TOKEN_HOLD_STATUS.RELEASED);
    expectInvariants(wallet!);
  });

  test('TEST M — capture_pending is captured not released', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 5000 });
    const requestId = 'req-m-cap-pending';
    await reserveCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId,
      estimatedTokens: 1000,
    });
    await markCompanyAiHoldProviderOutcome({
      companyId: COMPANY_A,
      requestId,
      provider: PROVIDER,
      userId: USER_A,
      providerStatus: AI_HOLD_PROVIDER_STATUS.SUCCESS,
      actualTokens: 800,
    });
    const holdId = buildAiTokenHoldId(requestId);
    const hold = db.read(holdPath(COMPANY_A, holdId)) || {};
    expect(hold.billingStatus).toBe(AI_HOLD_BILLING_STATUS.CAPTURE_PENDING);
    db.write(holdPath(COMPANY_A, holdId), { ...hold, createdAtMs: Date.now() - 10 * 60 * 1000 });

    const recovery = await recoverStuckCompanyAiHolds({
      companyId: COMPANY_A,
      ttlMs: 60 * 1000,
    });
    expect(recovery.captured).toBe(1);
    expect(recovery.released).toBe(0);
    const wallet = await getCompanyAiWallet(COMPANY_A, PROVIDER);
    expect(wallet?.balanceTokens).toBe(4200);
    expect(wallet?.reservedTokens).toBe(0);
    expect(db.read(holdPath(COMPANY_A, holdId))?.status).toBe(AI_TOKEN_HOLD_STATUS.CAPTURED);
    expectInvariants(wallet!);
  });

  test('TEST N — oldest reserved hold is recovered first', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 5000 });
    await reserveCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId: 'req-n-newer-capture',
      estimatedTokens: 1000,
    });
    await markCompanyAiHoldProviderOutcome({
      companyId: COMPANY_A,
      requestId: 'req-n-newer-capture',
      provider: PROVIDER,
      userId: USER_A,
      providerStatus: AI_HOLD_PROVIDER_STATUS.SUCCESS,
      actualTokens: 400,
    });
    await reserveCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId: 'req-n-older-unknown',
      estimatedTokens: 1000,
    });
    const newerId = buildAiTokenHoldId('req-n-newer-capture');
    const olderId = buildAiTokenHoldId('req-n-older-unknown');
    const newer = db.read(holdPath(COMPANY_A, newerId)) || {};
    const older = db.read(holdPath(COMPANY_A, olderId)) || {};
    db.write(holdPath(COMPANY_A, olderId), { ...older, createdAtMs: Date.now() - 20 * 60 * 1000 });
    db.write(holdPath(COMPANY_A, newerId), { ...newer, createdAtMs: Date.now() - 10 * 60 * 1000 });

    const recovery = await recoverStuckCompanyAiHolds({
      companyId: COMPANY_A,
      ttlMs: 60 * 1000,
      limit: 1,
    });
    expect(recovery.reconciled).toBe(1);
    expect(recovery.captured).toBe(0);
    expect(db.read(holdPath(COMPANY_A, olderId))?.billingStatus).toBe(
      AI_HOLD_BILLING_STATUS.NEEDS_RECONCILIATION
    );
    expect(db.read(holdPath(COMPANY_A, newerId))?.status).toBe(AI_TOKEN_HOLD_STATUS.RESERVED);
    expect(db.read(holdPath(COMPANY_A, newerId))?.billingStatus).toBe(
      AI_HOLD_BILLING_STATUS.CAPTURE_PENDING
    );
    expectInvariants((await getCompanyAiWallet(COMPANY_A, PROVIDER))!);
  });

  test('TEST O — 20 concurrent same requestId call provider once', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 5000 });
    let providerCalls = 0;
    const invoke = async () => {
      providerCalls += 1;
      return { text: 'ok', totalTokens: 250 };
    };
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        runCompanyPaidChatTurn({
          companyId: COMPANY_A,
          userId: USER_A,
          provider: PROVIDER,
          requestId: 'req-o-twenty',
          estimatedTokens: 1000,
          invokeProvider: invoke,
        })
      )
    );
    const ok = results.filter((x) => x.ok);
    const replay = results.filter((x) => !x.ok);
    expect(ok).toHaveLength(1);
    expect(replay).toHaveLength(19);
    expect(providerCalls).toBe(1);
    const wallet = await getCompanyAiWallet(COMPANY_A, PROVIDER);
    expect(wallet?.balanceTokens).toBe(4750);
    expect(wallet?.reservedTokens).toBe(0);
    expectInvariants(wallet!);
  });

  test('TEST P — concurrent capture on same hold debits once', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 5000 });
    const requestId = 'req-p-conc-capture';
    await reserveCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId,
      estimatedTokens: 1000,
    });
    const [a, b] = await Promise.all([
      captureCompanyTokensTransactional({
        companyId: COMPANY_A,
        userId: USER_A,
        provider: PROVIDER,
        requestId,
        actualTokens: 700,
      }),
      captureCompanyTokensTransactional({
        companyId: COMPANY_A,
        userId: USER_A,
        provider: PROVIDER,
        requestId,
        actualTokens: 700,
      }),
    ]);
    expect(a.wallet.balanceTokens).toBe(4300);
    expect(b.wallet.balanceTokens).toBe(4300);
    expect(a.wallet.reservedTokens).toBe(0);
    expect(b.wallet.reservedTokens).toBe(0);
    expectInvariants(a.wallet);
    expectInvariants(b.wallet);
    const wallet = await getCompanyAiWallet(COMPANY_A, PROVIDER);
    expect(wallet?.balanceTokens).toBe(4300);
    expect(wallet?.reservedTokens).toBe(0);
    expectInvariants(wallet!);
  });

  test('TEST Q — recon backlog does not starve newer failure/capture_pending', async () => {
    const reconCount = 50;
    const estimated = 100;
    const captureActual = 40;
    seedProviderWallet(db, COMPANY_A, PROVIDER, {
      balanceTokens: 20000,
    });

    const baseMs = Date.now() - 30 * 60 * 1000;
    for (let i = 0; i < reconCount; i += 1) {
      const requestId = `req-q-recon-${String(i).padStart(3, '0')}`;
      await reserveCompanyTokensTransactional({
        companyId: COMPANY_A,
        userId: USER_A,
        provider: PROVIDER,
        requestId,
        estimatedTokens: estimated,
      });
      const holdId = buildAiTokenHoldId(requestId);
      const hold = db.read(holdPath(COMPANY_A, holdId)) || {};
      db.write(holdPath(COMPANY_A, holdId), {
        ...hold,
        billingStatus: AI_HOLD_BILLING_STATUS.NEEDS_RECONCILIATION,
        createdAtMs: baseMs + i,
      });
    }

    await reserveCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId: 'req-q-newer-failure',
      estimatedTokens: estimated,
    });
    await markCompanyAiHoldProviderOutcome({
      companyId: COMPANY_A,
      requestId: 'req-q-newer-failure',
      provider: PROVIDER,
      userId: USER_A,
      providerStatus: AI_HOLD_PROVIDER_STATUS.FAILURE,
    });
    const failureId = buildAiTokenHoldId('req-q-newer-failure');
    const failureHold = db.read(holdPath(COMPANY_A, failureId)) || {};
    db.write(holdPath(COMPANY_A, failureId), {
      ...failureHold,
      createdAtMs: baseMs + reconCount + 1,
    });

    await reserveCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId: 'req-q-newer-capture',
      estimatedTokens: estimated,
    });
    await markCompanyAiHoldProviderOutcome({
      companyId: COMPANY_A,
      requestId: 'req-q-newer-capture',
      provider: PROVIDER,
      userId: USER_A,
      providerStatus: AI_HOLD_PROVIDER_STATUS.SUCCESS,
      actualTokens: captureActual,
    });
    const captureId = buildAiTokenHoldId('req-q-newer-capture');
    const captureHold = db.read(holdPath(COMPANY_A, captureId)) || {};
    db.write(holdPath(COMPANY_A, captureId), {
      ...captureHold,
      createdAtMs: baseMs + reconCount + 2,
    });

    const before = await getCompanyAiWallet(COMPANY_A, PROVIDER);
    expect(before?.reservedTokens).toBe((reconCount + 2) * estimated);
    expect(before?.balanceTokens).toBe(20000);

    const recovery = await recoverStuckCompanyAiHolds({
      companyId: COMPANY_A,
      ttlMs: 60 * 1000,
      pageSize: 50,
      maxPages: 10,
    });

    expect(recovery.pages).toBeGreaterThanOrEqual(2);
    expect(recovery.scanned).toBeGreaterThanOrEqual(reconCount + 2);
    expect(recovery.released).toBe(1);
    expect(recovery.captured).toBe(1);
    expect(recovery.reconciled).toBe(0);

    const after = await getCompanyAiWallet(COMPANY_A, PROVIDER);
    expect(after?.balanceTokens).toBe(20000 - captureActual);
    expect(after?.reservedTokens).toBe(reconCount * estimated);
    expectInvariants(after!);

    expect(db.read(holdPath(COMPANY_A, failureId))?.status).toBe(AI_TOKEN_HOLD_STATUS.RELEASED);
    expect(db.read(holdPath(COMPANY_A, captureId))?.status).toBe(AI_TOKEN_HOLD_STATUS.CAPTURED);
    const reconHold = db.read(holdPath(COMPANY_A, buildAiTokenHoldId('req-q-recon-000')));
    expect(reconHold?.status).toBe(AI_TOKEN_HOLD_STATUS.RESERVED);
    expect(reconHold?.billingStatus).toBe(AI_HOLD_BILLING_STATUS.NEEDS_RECONCILIATION);
  });

  test('TEST R — two recovery instances capture the same hold once', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 5000 });
    const requestId = 'req-r-conc-recovery-capture';
    await reserveCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId,
      estimatedTokens: 1000,
    });
    await markCompanyAiHoldProviderOutcome({
      companyId: COMPANY_A,
      requestId,
      provider: PROVIDER,
      userId: USER_A,
      providerStatus: AI_HOLD_PROVIDER_STATUS.SUCCESS,
      actualTokens: 700,
    });
    const holdId = buildAiTokenHoldId(requestId);
    const hold = db.read(holdPath(COMPANY_A, holdId)) || {};
    db.write(holdPath(COMPANY_A, holdId), {
      ...hold,
      createdAtMs: Date.now() - 10 * 60 * 1000,
    });

    const [first, second] = await Promise.all([
      recoverStuckCompanyAiHolds({ companyId: COMPANY_A, ttlMs: 60 * 1000 }),
      recoverStuckCompanyAiHolds({ companyId: COMPANY_A, ttlMs: 60 * 1000 }),
    ]);

    expect(first.captured + second.captured).toBe(1);
    expect(first.released + second.released).toBe(0);
    const wallet = await getCompanyAiWallet(COMPANY_A, PROVIDER);
    expect(wallet?.balanceTokens).toBe(4300);
    expect(wallet?.reservedTokens).toBe(0);
    expect(db.read(holdPath(COMPANY_A, holdId))?.status).toBe(AI_TOKEN_HOLD_STATUS.CAPTURED);
    expectInvariants(wallet!);
  });

  test('TEST S — two recovery instances release the same failure hold once', async () => {
    seedProviderWallet(db, COMPANY_A, PROVIDER, { balanceTokens: 5000 });
    const requestId = 'req-s-conc-recovery-release';
    await reserveCompanyTokensTransactional({
      companyId: COMPANY_A,
      userId: USER_A,
      provider: PROVIDER,
      requestId,
      estimatedTokens: 1000,
    });
    await markCompanyAiHoldProviderOutcome({
      companyId: COMPANY_A,
      requestId,
      provider: PROVIDER,
      userId: USER_A,
      providerStatus: AI_HOLD_PROVIDER_STATUS.FAILURE,
    });
    const holdId = buildAiTokenHoldId(requestId);
    const hold = db.read(holdPath(COMPANY_A, holdId)) || {};
    db.write(holdPath(COMPANY_A, holdId), {
      ...hold,
      createdAtMs: Date.now() - 10 * 60 * 1000,
    });

    const [first, second] = await Promise.all([
      recoverStuckCompanyAiHolds({ companyId: COMPANY_A, ttlMs: 60 * 1000 }),
      recoverStuckCompanyAiHolds({ companyId: COMPANY_A, ttlMs: 60 * 1000 }),
    ]);

    expect(first.released + second.released).toBe(1);
    expect(first.captured + second.captured).toBe(0);
    const wallet = await getCompanyAiWallet(COMPANY_A, PROVIDER);
    expect(wallet?.balanceTokens).toBe(5000);
    expect(wallet?.reservedTokens).toBe(0);
    expect(db.read(holdPath(COMPANY_A, holdId))?.status).toBe(AI_TOKEN_HOLD_STATUS.RELEASED);
    expectInvariants(wallet!);
  });
});
