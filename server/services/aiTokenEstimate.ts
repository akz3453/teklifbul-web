/**
 * Conservative paid-chat token estimate (reserve amount)
 * Teklifbul Rule v1.0
 *
 * Must not under-estimate vs typical provider usage (wallet bypass).
 * OpenAI chat default max_tokens is 2048 (openaiClient).
 * Gemini client has no max cap — use a higher completion ceiling.
 */

export const PAID_CHAT_OPENAI_MAX_TOKENS = 2048;
export const PAID_CHAT_GEMINI_MAX_TOKENS = 8192;
export const ESTIMATE_CHARS_PER_TOKEN = 2;

export function paidChatCompletionCap(provider: string, maxTokens?: number): number {
  if (typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0) {
    return Math.floor(maxTokens);
  }
  const key = String(provider || '').toLowerCase();
  if (key === 'gemini' || key.startsWith('gemini')) return PAID_CHAT_GEMINI_MAX_TOKENS;
  return PAID_CHAT_OPENAI_MAX_TOKENS;
}

export function estimatePaidChatTokens(params: {
  provider: string;
  message: string;
  systemPrompt?: string;
  maxTokens?: number;
}): number {
  const completionCap = paidChatCompletionCap(params.provider, params.maxTokens);
  const charCount =
    String(params.systemPrompt || '').length + String(params.message || '').length;
  const promptEstimate = Math.ceil(charCount / ESTIMATE_CHARS_PER_TOKEN);
  const estimated = promptEstimate + completionCap;
  return Math.max(1, estimated);
}
