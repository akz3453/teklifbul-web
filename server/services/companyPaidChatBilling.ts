/**
 * Company paid /api/chat billing: reserve → provider → capture | release
 * Teklifbul Rule v1.0 — H-007A
 *
 * Provider I/O stays outside Firestore transactions.
 * Provider success never auto-releases. Capture failure keeps capture_pending.
 */

import { logger } from '../../src/shared/log/logger.js';
import { AI_ERROR_CODES } from '../constants/aiMeta.js';
import {
  AI_HOLD_BILLING_STATUS,
  AI_HOLD_PROVIDER_STATUS,
  AI_TOKEN_HOLD_STATUS,
  captureCompanyTokensTransactional,
  isHoldProviderSuccessPendingCapture,
  markCompanyAiHoldProviderOutcome,
  releaseCompanyTokensTransactional,
  reserveCompanyTokensTransactional,
  type CompanyWalletSnapshot,
} from './companyAiWalletService.js';

export type PaidChatProviderResult = {
  text: string;
  totalTokens: number;
  promptTokens?: number;
  completionTokens?: number;
};

export type CompanyPaidChatTurnOk = {
  ok: true;
  result: PaidChatProviderResult;
  wallet: CompanyWalletSnapshot;
  holdId: string;
  requestId: string;
  estimatedTokens: number;
  actualTokens: number;
  captureDeferred?: boolean;
};

export type CompanyPaidChatTurnFail = {
  ok: false;
  code: string;
  holdId?: string;
  requestId: string;
  estimatedTokens: number;
  providerError?: unknown;
};

function classifyProviderError(err: unknown): 'failure' | 'timeout' {
  const msg = String((err as { message?: string })?.message || err || '').toLowerCase();
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('etimedout')) {
    return 'timeout';
  }
  return 'failure';
}

async function captureAfterProviderSuccess(params: {
  companyId: string;
  requestId: string;
  provider: string;
  model?: string | null;
  userId: string;
  actualTokens: number;
  estimatedTokens: number;
  meta?: Record<string, unknown>;
  providerResult: PaidChatProviderResult;
  holdId: string;
}): Promise<CompanyPaidChatTurnOk> {
  const captured = await captureCompanyTokensTransactional({
    companyId: params.companyId,
    requestId: params.requestId,
    provider: params.provider,
    model: params.model,
    userId: params.userId,
    actualTokens: params.actualTokens,
    reason: 'chat',
    meta: {
      ...(params.meta || {}),
      promptTokens: params.providerResult.promptTokens,
      completionTokens: params.providerResult.completionTokens,
      totalTokens: params.actualTokens,
    },
  });
  logger.info('paid chat captured', {
    companyId: params.companyId,
    requestId: params.requestId,
    provider: params.provider,
    estimatedTokens: params.estimatedTokens,
    actualTokens: params.actualTokens,
    holdId: captured.holdId,
    holdStatus: captured.status,
    balanceTokens: captured.wallet.balanceTokens,
    reservedTokens: captured.wallet.reservedTokens,
  });
  return {
    ok: true,
    result: params.providerResult,
    wallet: captured.wallet,
    holdId: captured.holdId,
    requestId: params.requestId,
    estimatedTokens: params.estimatedTokens,
    actualTokens: params.actualTokens,
  };
}

export async function runCompanyPaidChatTurn(params: {
  companyId: string;
  userId: string;
  provider: string;
  model?: string | null;
  requestId: string;
  estimatedTokens: number;
  invokeProvider: () => Promise<PaidChatProviderResult>;
  meta?: Record<string, unknown>;
}): Promise<CompanyPaidChatTurnOk | CompanyPaidChatTurnFail> {
  const {
    companyId,
    userId,
    provider,
    model,
    requestId,
    estimatedTokens,
    invokeProvider,
    meta,
  } = params;

  logger.group('companyPaidChat:turn');
  logger.info('paid chat turn start', {
    companyId,
    requestId,
    provider,
    estimatedTokens,
  });

  let reserveResult;
  try {
    reserveResult = await reserveCompanyTokensTransactional({
      companyId,
      userId,
      provider,
      model,
      requestId,
      estimatedTokens,
      reason: 'chat',
      meta,
    });
  } catch (err: any) {
    const code = String(err?.code || '');
    logger.warn('paid chat reserve failed', {
      companyId,
      requestId,
      provider,
      estimatedTokens,
      code,
    });
    logger.end();
    if (
      code === AI_ERROR_CODES.INSUFFICIENT_TOKENS ||
      code === AI_ERROR_CODES.DAILY_CAP_REACHED ||
      code === AI_ERROR_CODES.DAILY_CAP_CHECK_FAILED
    ) {
      return { ok: false, code, requestId, estimatedTokens };
    }
    throw err;
  }

  if (reserveResult.replay) {
    const pendingCapture = isHoldProviderSuccessPendingCapture({
      status: reserveResult.status,
      billingStatus: reserveResult.billingStatus,
      providerStatus: reserveResult.providerStatus,
    });

    if (pendingCapture) {
      const actualTokens =
        reserveResult.actualTokens && reserveResult.actualTokens > 0
          ? reserveResult.actualTokens
          : estimatedTokens;
      try {
        await captureCompanyTokensTransactional({
          companyId,
          requestId,
          provider,
          model,
          userId,
          actualTokens,
          reason: 'chat',
          meta: {
            ...(meta || {}),
            totalTokens: actualTokens,
            recovered: true,
          },
        });
      } catch (captureErr: any) {
        logger.error('paid chat replay capture still failed — hold stays capture_pending', {
          companyId,
          requestId,
          holdId: reserveResult.holdId,
          error: captureErr?.message || captureErr,
        });
      }
      logger.info('paid chat idempotent replay — capture_pending, skip provider', {
        companyId,
        requestId,
        provider,
        holdId: reserveResult.holdId,
        holdStatus: reserveResult.status,
        billingStatus: reserveResult.billingStatus,
      });
      logger.end();
      return {
        ok: false,
        code: AI_ERROR_CODES.AI_REQUEST_ALREADY_PROCESSED,
        holdId: reserveResult.holdId,
        requestId,
        estimatedTokens: reserveResult.estimatedTokens,
      };
    }

    const replayCode =
      String(reserveResult.billingStatus || '') === AI_HOLD_BILLING_STATUS.NEEDS_RECONCILIATION
        ? AI_ERROR_CODES.AI_REQUEST_ALREADY_PROCESSED
        : reserveResult.status === AI_TOKEN_HOLD_STATUS.RESERVED
          ? AI_ERROR_CODES.AI_REQUEST_IN_PROGRESS
          : AI_ERROR_CODES.AI_REQUEST_ALREADY_PROCESSED;
    logger.info('paid chat idempotent replay — skip provider', {
      companyId,
      requestId,
      provider,
      estimatedTokens: reserveResult.estimatedTokens,
      holdStatus: reserveResult.status,
      holdId: reserveResult.holdId,
    });
    logger.end();
    return {
      ok: false,
      code: replayCode,
      holdId: reserveResult.holdId,
      requestId,
      estimatedTokens: reserveResult.estimatedTokens,
    };
  }

  let providerResult: PaidChatProviderResult;
  try {
    providerResult = await invokeProvider();
  } catch (providerError) {
    const providerStatus =
      classifyProviderError(providerError) === 'timeout'
        ? AI_HOLD_PROVIDER_STATUS.TIMEOUT
        : AI_HOLD_PROVIDER_STATUS.FAILURE;
    logger.warn('paid chat provider failed — releasing hold', {
      companyId,
      requestId,
      provider,
      estimatedTokens,
      holdId: reserveResult.holdId,
      holdStatus: AI_TOKEN_HOLD_STATUS.RESERVED,
      providerStatus,
    });
    try {
      await markCompanyAiHoldProviderOutcome({
        companyId,
        requestId,
        provider,
        userId,
        providerStatus,
      });
    } catch (markErr: any) {
      logger.error('paid chat provider-fail mark failed', {
        companyId,
        requestId,
        holdId: reserveResult.holdId,
        error: markErr?.message || markErr,
      });
    }
    try {
      await releaseCompanyTokensTransactional({
        companyId,
        requestId,
        provider,
        userId,
        billingStatus: AI_HOLD_BILLING_STATUS.RELEASED,
      });
    } catch (releaseErr: any) {
      logger.error('paid chat release after provider error failed', {
        companyId,
        requestId,
        holdId: reserveResult.holdId,
        error: releaseErr?.message || releaseErr,
      });
    }
    logger.end();
    return {
      ok: false,
      code: 'AI_PROVIDER_ERROR',
      holdId: reserveResult.holdId,
      requestId,
      estimatedTokens,
      providerError,
    };
  }

  const rawActual = Number(providerResult.totalTokens || 0);
  const actualTokens = rawActual > 0 ? Math.floor(rawActual) : estimatedTokens;

  try {
    await markCompanyAiHoldProviderOutcome({
      companyId,
      requestId,
      provider,
      userId,
      providerStatus: AI_HOLD_PROVIDER_STATUS.SUCCESS,
      actualTokens,
    });
  } catch (markErr: any) {
    logger.error('paid chat provider-success mark failed — hold stays reserved for recovery', {
      companyId,
      requestId,
      holdId: reserveResult.holdId,
      actualTokens,
      error: markErr?.message || markErr,
    });
  }

  try {
    const captured = await captureAfterProviderSuccess({
      companyId,
      requestId,
      provider,
      model,
      userId,
      actualTokens,
      estimatedTokens,
      meta,
      providerResult,
      holdId: reserveResult.holdId,
    });
    logger.end();
    return captured;
  } catch (captureErr: any) {
    logger.error('H-007A_AI_HOLD_CAPTURE_PENDING', {
      companyId,
      requestId,
      provider,
      estimatedTokens,
      actualTokens,
      holdId: reserveResult.holdId,
      billingStatus: AI_HOLD_BILLING_STATUS.CAPTURE_PENDING,
      holdStatus: AI_TOKEN_HOLD_STATUS.RESERVED,
      providerStatus: AI_HOLD_PROVIDER_STATUS.SUCCESS,
      error: captureErr?.message || captureErr,
    });
    logger.end();
    return {
      ok: true,
      result: providerResult,
      wallet: reserveResult.wallet,
      holdId: reserveResult.holdId,
      requestId,
      estimatedTokens,
      actualTokens,
      captureDeferred: true,
    };
  }
}
