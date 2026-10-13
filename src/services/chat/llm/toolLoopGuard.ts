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

function parseArgumentsForFingerprint(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

type FingerprintOptions = {
  ignoreTimeNoise?: boolean;
  ignoreRootConversationId?: boolean;
};

type FingerprintFrame =
  | { kind: 'value'; value: unknown; root?: boolean }
  | { kind: 'array'; value: unknown[]; index: number }
  | { kind: 'object'; value: Record<string, unknown>; keys: string[]; index: number };

// Bound object traversal without truncating strings, arrays or ordinary deep results.
// If an exceptional result exceeds this bound, only the total round budget applies:
// an incomplete fingerprint is insufficient evidence that the tool has stalled.
const MAX_FINGERPRINT_VALUES = 100_000;

function createRoundFingerprint() {
  let hash = 0x811c9dc5;
  let secondHash = 0x9e3779b9;
  let remainingValues = MAX_FINGERPRINT_VALUES;
  let complete = true;

  const write = (input: string) => {
    for (let i = 0; i < input.length; i++) {
      const code = input.charCodeAt(i);
      hash = Math.imul(hash ^ code, 0x01000193);
      secondHash = Math.imul(secondHash ^ code, 0x01000193);
    }
  };
  const writeString = (input: string) => {
    write(`s${input.length}:`);
    write(input);
  };

  const append = (value: unknown, options: FingerprintOptions = {}) => {
    const ancestors = new WeakSet<object>();
    const stack: FingerprintFrame[] = [{ kind: 'value', value, root: true }];
    try {
      while (stack.length > 0 && complete) {
        const frame = stack[stack.length - 1];
        if (frame.kind !== 'value') {
          if (frame.kind === 'array') {
            if (frame.index >= frame.value.length) {
              write(']');
              ancestors.delete(frame.value);
              stack.pop();
            } else {
              stack.push({ kind: 'value', value: frame.value[frame.index++] });
            }
          } else if (frame.index >= frame.keys.length) {
            write('}');
            ancestors.delete(frame.value);
            stack.pop();
          } else {
            const key = frame.keys[frame.index++];
            writeString(key);
            stack.push({ kind: 'value', value: frame.value[key] });
          }
          continue;
        }

        stack.pop();
        if (remainingValues-- <= 0) {
          complete = false;
          break;
        }
        const item = frame.value;
        if (item === null) {
          write('null;');
        } else if (typeof item === 'string') {
          writeString(item);
        } else if (typeof item !== 'object') {
          write(`${typeof item}:${String(item)};`);
        } else if (ancestors.has(item)) {
          write('circular;');
        } else {
          ancestors.add(item);
          if (Array.isArray(item)) {
            write('[');
            stack.push({ kind: 'array', value: item, index: 0 });
          } else {
            const keys = Object.keys(item).filter((key) =>
              !(options.ignoreTimeNoise && NOISY_KEYS.has(key))
              && !(frame.root && options.ignoreRootConversationId && key === 'conversationId'),
            );
            if (keys.length > remainingValues) {
              complete = false;
              break;
            }
            keys.sort();
            write('{');
            stack.push({ kind: 'object', value: item as Record<string, unknown>, keys, index: 0 });
          }
        }
      }
    } catch {
      // A non-JSON tool payload (for example a throwing getter) must not break the run.
      complete = false;
    }
  };

  return {
    append,
    finish: () => ({
      complete,
      fingerprint: `${(hash >>> 0).toString(16).padStart(8, '0')}${(secondHash >>> 0).toString(16).padStart(8, '0')}`,
    }),
  };
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
  const roundFingerprint = createRoundFingerprint();
  roundFingerprint.append(toolCalls.length);
  for (const toolCall of toolCalls) {
    roundFingerprint.append(toolCall.function.name);
    roundFingerprint.append(parseArgumentsForFingerprint(toolCall.function.arguments), {
      ignoreRootConversationId: true,
    });
  }
  roundFingerprint.append(results.length);
  for (const result of results) {
    roundFingerprint.append(result.name);
    roundFingerprint.append(result.result, { ignoreTimeNoise: true });
  }
  const { fingerprint, complete } = roundFingerprint.finish();

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
  if (!complete) {
    state.lastRoundFingerprint = undefined;
    state.repeatedRoundCount = 0;
    state.warnedStallFingerprint = undefined;
  } else if (state.lastRoundFingerprint === fingerprint) {
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
Do not call any more tools. Answer the original user request now using the evidence already collected. Clearly distinguish confirmed findings, incomplete items, and limitations. Never invent missing evidence. Even if the task is incomplete, return the most useful partial result instead of an execution error. State the remaining work clearly and explain that the user can continue it in this conversation; do not claim that further work has been scheduled or already executed.`;
}

export function appendRuntimeControl(
  systemContent: string,
  control?: LlmRequestControl,
): string {
  const instruction = control?.controlInstruction?.trim();
  if (!instruction) return systemContent;
  return `${systemContent}\n\n# Runtime execution control\n${instruction}`;
}
