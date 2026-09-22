import type { LlmToolCallResult } from './llmTypes';

export const SOFT_TOOL_ROUND_LIMIT = 32;
export const HARD_TOOL_ROUND_LIMIT = 64;
export const STALL_WARNING_REPEAT_COUNT = 3;
export const STALL_FINALIZE_REPEAT_COUNT = 6;
export const DOM_SCRIPT_BATCH_WARNING_INTERVAL = 8;

export interface LlmRequestControl {
  /** Omit model-visible tools for a final answer-only request. */
  disableTools?: boolean;
  /** Ephemeral runtime instruction appended to the system prompt for this request only. */
  controlInstruction?: string;
}

export interface ToolLoopState {
  roundsCompleted: number;
  totalToolCalls: number;
  lastRoundFingerprint?: string;
  repeatedRoundCount: number;
  warnedStallFingerprint?: string;
  softLimitWarned: boolean;
  consecutiveDomScriptRounds: number;
  lastDomScriptWarningCount: number;
}

export type ToolLoopDecision =
  | { kind: 'continue'; controlInstruction?: string }
  | { kind: 'finalize'; reason: 'hard-limit' | 'stalled' };

type ToolCallLike = {
  function: {
    name: string;
    arguments: string;
  };
};

const NOISY_KEYS = new Set([
  'timestamp',
  'startedAt',
  'finishedAt',
  'endedAt',
  'elapsedMs',
  'durationMs',
]);

function normalizeForFingerprint(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    if (value.length <= 512) return value;
    return `${value.slice(0, 256)}...[length:${value.length}]`;
  }
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    const normalized = value
      .slice(0, 24)
      .map((item) => normalizeForFingerprint(item, depth + 1, seen));
    if (value.length > 24) normalized.push(`[remaining:${value.length - 24}]`);
    return normalized;
  }

  if (depth >= 6) return '[max-depth]';
  const source = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    if (NOISY_KEYS.has(key)) continue;
    const item = source[key];
    if (key === 'base64' && typeof item === 'string') {
      normalized[key] = `[binary:${item.length}]`;
      continue;
    }
    normalized[key] = normalizeForFingerprint(item, depth + 1, seen);
  }
  return normalized;
}

function parseArgumentsForFingerprint(raw: string): unknown {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const args = { ...(parsed as Record<string, unknown>) };
      delete args.conversationId;
      return args;
    }
    return parsed;
  } catch {
    return raw;
  }
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createToolLoopState(): ToolLoopState {
  return {
    roundsCompleted: 0,
    totalToolCalls: 0,
    repeatedRoundCount: 0,
    softLimitWarned: false,
    consecutiveDomScriptRounds: 0,
    lastDomScriptWarningCount: 0,
  };
}

export function recordToolRound(
  state: ToolLoopState,
  toolCalls: ToolCallLike[],
  results: LlmToolCallResult[],
): ToolLoopDecision {
  const fingerprintInput = {
    calls: toolCalls.map((toolCall) => ({
      name: toolCall.function.name,
      arguments: parseArgumentsForFingerprint(toolCall.function.arguments),
    })),
    results: results.map((result) => ({
      name: result.name,
      result: normalizeForFingerprint(result.result),
    })),
  };
  const fingerprint = fnv1a(JSON.stringify(fingerprintInput));

  state.roundsCompleted += 1;
  state.totalToolCalls += toolCalls.length;
  const executeScriptOnly = toolCalls.length > 0
    && toolCalls.every((toolCall) => toolCall.function.name === 'browser_execute_script');
  if (executeScriptOnly) {
    state.consecutiveDomScriptRounds += 1;
  } else {
    state.consecutiveDomScriptRounds = 0;
    state.lastDomScriptWarningCount = 0;
  }
  if (state.lastRoundFingerprint === fingerprint) {
    state.repeatedRoundCount += 1;
  } else {
    state.lastRoundFingerprint = fingerprint;
    state.repeatedRoundCount = 1;
    state.warnedStallFingerprint = undefined;
  }

  if (state.repeatedRoundCount >= STALL_FINALIZE_REPEAT_COUNT) {
    return { kind: 'finalize', reason: 'stalled' };
  }
  if (state.roundsCompleted >= HARD_TOOL_ROUND_LIMIT) {
    return { kind: 'finalize', reason: 'hard-limit' };
  }

  const controls: string[] = [];
  if (
    state.consecutiveDomScriptRounds >= DOM_SCRIPT_BATCH_WARNING_INTERVAL
    && state.consecutiveDomScriptRounds - state.lastDomScriptWarningCount
      >= DOM_SCRIPT_BATCH_WARNING_INTERVAL
  ) {
    state.lastDomScriptWarningCount = state.consecutiveDomScriptRounds;
    controls.push(
      `You have used browser_execute_script for ${state.consecutiveDomScriptRounds} consecutive rounds. Batch the remaining deterministic read-only DOM checks into one bounded script where possible, avoid repeating evidence already collected, and move to the final answer as soon as the essential evidence is complete.`,
    );
  }
  if (
    state.repeatedRoundCount >= STALL_WARNING_REPEAT_COUNT &&
    state.warnedStallFingerprint !== fingerprint
  ) {
    state.warnedStallFingerprint = fingerprint;
    controls.push(
      'The last tool round repeated without observable progress. Re-plan now. Do not repeat the same tool call with unchanged arguments and results. Prefer a bounded batch read when the task is read-only.',
    );
  }
  if (
    state.roundsCompleted >= SOFT_TOOL_ROUND_LIMIT &&
    !state.softLimitWarned
  ) {
    state.softLimitWarned = true;
    controls.push(
      `You have completed ${state.roundsCompleted} tool rounds. Preserve budget for the final answer. Continue only for missing essential evidence, combine deterministic read-only DOM work into a small number of bounded script calls, and then answer the original request.`,
    );
  }

  return controls.length > 0
    ? { kind: 'continue', controlInstruction: controls.join('\n') }
    : { kind: 'continue' };
}

export function finalAnswerControlInstruction(
  state: ToolLoopState,
  reason: 'hard-limit' | 'stalled',
): string {
  const reasonText = reason === 'stalled'
    ? 'Repeated tool rounds stopped making observable progress.'
    : `The execution budget of ${HARD_TOOL_ROUND_LIMIT} tool rounds has been reached.`;
  return `${reasonText} The run completed ${state.roundsCompleted} tool rounds and ${state.totalToolCalls} tool calls.
Do not call any more tools. Answer the original user request now using the evidence already collected. Clearly distinguish confirmed findings, incomplete items, and limitations. Never invent missing evidence. Even if the task is incomplete, return the most useful partial result instead of an execution error.`;
}

export function appendRuntimeControl(
  systemContent: string,
  control?: LlmRequestControl,
): string {
  const instruction = control?.controlInstruction?.trim();
  if (!instruction) return systemContent;
  return `${systemContent}\n\n# Runtime execution control\n${instruction}`;
}
