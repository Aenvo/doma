export interface EmptyResponseInput {
  finishReason?: string;
  text?: string;
  reasoning?: string;
  /** When strings are omitted, pass the lengths of their trimmed contents. */
  textLength?: number;
  reasoningLength?: number;
  usage?: { completionTokens?: number; reasoningTokens?: number };
  streamCompleted?: boolean;
  aborted?: boolean;
  refusalDetected?: boolean;
}

export interface EmptyResponseDecision {
  kind:
    | 'not-empty'
    | 'aborted'
    | 'blocked'
    | 'incomplete'
    | 'token-limit'
    | 'reasoning-only'
    | 'empty-with-usage'
    | 'empty'
    | 'unknown';
  /** The caller still limits recovery to one request per user turn. */
  retry: boolean;
  recoveryInstruction?: string;
  errorMessage?: string;
}

const BLOCKED_FINISH_REASONS = new Set([
  'content_filter',
  'content_filtered',
  'refusal',
  'safety',
  'blocked',
  'recitation',
  'prohibited_content',
  'sensitive',
]);

const EMPTY_RESPONSE_INSTRUCTION =
  'The previous attempt ended without a final answer. Respond to the original user request now with a concise final answer. Do not call another tool unless it is strictly necessary.';

function positiveCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

/** Classify an empty no-tool response without changing budget or reasoning mode. */
export function classifyEmptyResponse(input: EmptyResponseInput): EmptyResponseDecision {
  if (input.aborted) return { kind: 'aborted', retry: false };
  const textLength = typeof input.text === 'string'
    ? input.text.trim().length
    : positiveCount(input.textLength);
  if (textLength > 0) return { kind: 'not-empty', retry: false };

  const finishReason = (input.finishReason || '').trim().toLowerCase();
  if (input.refusalDetected || BLOCKED_FINISH_REASONS.has(finishReason)) {
    return {
      kind: 'blocked',
      retry: false,
      errorMessage: 'The model refused or filtered the response without returning an answer. Automatic retry was skipped.',
    };
  }
  if (input.streamCompleted === false) return {
    kind: 'incomplete', retry: false,
    errorMessage: 'The response stream ended without a confirmed final answer. Automatic retry was skipped.',
  };
  if (finishReason === 'pause_turn' || finishReason === 'interrupted') {
    return { kind: 'incomplete', retry: false, errorMessage: 'The model interrupted the response before returning a final answer.' };
  }
  if (['abort', 'aborted', 'cancelled', 'canceled'].includes(finishReason)) {
    return { kind: 'aborted', retry: false };
  }
  if (finishReason === 'length' || finishReason === 'max_tokens') {
    return {
      kind: 'token-limit',
      retry: false,
      // A length stop may reflect the context limit, not just max_tokens.
      errorMessage: 'The model reached an output or context token limit before returning a final answer. Automatic retry with the same limit was skipped.',
    };
  }

  const reasoningLength = typeof input.reasoning === 'string'
    ? input.reasoning.trim().length
    : positiveCount(input.reasoningLength);
  const kind = reasoningLength > 0 || positiveCount(input.usage?.reasoningTokens) > 0
    ? 'reasoning-only'
    : positiveCount(input.usage?.completionTokens) > 0
      ? 'empty-with-usage'
      : ['stop', 'end_turn', 'stop_sequence'].includes(finishReason)
        ? 'empty'
        : 'unknown';
  return { kind, retry: true, recoveryInstruction: EMPTY_RESPONSE_INSTRUCTION };
}

export type ReasoningMode = 'thinking' | 'non-thinking' | 'unknown';

export interface OutputTokenLimitInput {
  provider?: string;
  model: string;
  mode?: ReasoningMode;
  extraBody?: Record<string, unknown>;
}

export interface OutputTokenLimit {
  field: 'max_tokens' | 'max_completion_tokens';
  value: number;
  source: 'explicit' | 'mode' | 'model' | 'default';
}

function validTokenLimit(value: unknown): value is number {
  // Each provider enforces its own model limit; preserve valid user budgets.
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function reasoningModeFromBody(extraBody?: Record<string, unknown>): ReasoningMode {
  if (typeof extraBody?.enable_thinking === 'boolean') {
    return extraBody.enable_thinking ? 'thinking' : 'non-thinking';
  }
  const thinking = extraBody?.thinking;
  if (thinking && typeof thinking === 'object' && !Array.isArray(thinking)) {
    const type = (thinking as Record<string, unknown>).type;
    if (type === 'disabled') return 'non-thinking';
    if (type === 'enabled' || type === 'adaptive') return 'thinking';
  }
  const effort = extraBody?.reasoning_effort;
  if (effort === 'none' || effort === 'disabled') return 'non-thinking';
  if (typeof effort === 'string' && ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) {
    return 'thinking';
  }
  return 'unknown';
}

/** Select one budget field; callers remove both original fields before applying it. */
export function resolveOutputTokenLimit(input: OutputTokenLimitInput): OutputTokenLimit {
  for (const field of ['max_completion_tokens', 'max_tokens'] as const) {
    const value = input.extraBody?.[field];
    if (validTokenLimit(value)) {
      return { field, value, source: 'explicit' };
    }
  }
  const bodyMode = reasoningModeFromBody(input.extraBody);
  const mode = bodyMode !== 'unknown' ? bodyMode : input.mode;
  if (mode === 'thinking' || mode === 'non-thinking') {
    return { field: 'max_tokens', value: mode === 'thinking' ? 8192 : 4096, source: 'mode' };
  }
  const model = input.model.toLowerCase();
  // Preserve existing unknown-mode DeepSeek/Qwen3 budgets on compatible relays.
  const reasoningModel = /(deepseek|reasoner|(?:^|[-_/])r1(?:$|[-_/])|thinking|qwq|qwen3)/.test(model);
  return {
    field: 'max_tokens',
    value: reasoningModel ? 8192 : 4096,
    source: reasoningModel ? 'model' : 'default',
  };
}
