// Run: TSX_DISABLE_CACHE=1 node --import tsx scripts/test-tool-loop-guard.ts
import assert from 'node:assert/strict';
import {
  createToolLoopState,
  finalAnswerControlInstruction,
  recordToolRound,
  HARD_TOOL_ROUND_LIMIT,
  SOFT_TOOL_ROUND_LIMIT,
  STALL_FINALIZE_REPEAT_COUNT,
  STALL_WARNING_REPEAT_COUNT,
} from '../src/services/chat/llm/toolLoopGuard.ts';

let checks = 0;
function check(name: string, run: () => void): void {
  run();
  checks++;
  console.log(`PASS ${name}`);
}

function round(
  state: ReturnType<typeof createToolLoopState>,
  result: unknown,
  args = '{}',
  name = 'browser_execute_script',
) {
  return recordToolRound(state, [{ function: { name, arguments: args } }], [
    { name, tool_call_id: 'test-call', result },
  ]);
}

function assertProgress(resultForRound: (index: number) => unknown, argsForRound?: (index: number) => string) {
  const state = createToolLoopState();
  for (let index = 0; index < STALL_FINALIZE_REPEAT_COUNT + 2; index++) {
    assert.equal(round(state, resultForRound(index), argsForRound?.(index)).kind, 'continue');
    assert.equal(state.repeatedRoundCount, 1);
  }
}

check('genuine repetitions warn at three and stop at six', () => {
  const state = createToolLoopState();
  for (let index = 1; index <= STALL_FINALIZE_REPEAT_COUNT; index++) {
    const decision = round(state, { text: 'unchanged' });
    if (index < STALL_FINALIZE_REPEAT_COUNT) assert.equal(decision.kind, 'continue');
    if (index === STALL_WARNING_REPEAT_COUNT) {
      assert.equal(decision.kind, 'continue');
      assert.match(decision.controlInstruction ?? '', /without observable progress/);
    }
    if (index === STALL_FINALIZE_REPEAT_COUNT) assert.deepEqual(decision, { kind: 'finalize', reason: 'stalled' });
  }
});

check('equal-length changes after a long text prefix are progress', () => {
  assertProgress((index) => ({ text: `${'same-prefix-'.repeat(100)}${index}` }));
});

check('changes in the twenty-fifth array item are progress', () => {
  assertProgress((index) => [...Array(24).fill('same'), { value: index }]);
});

check('changes deeper than six levels are progress', () => {
  assertProgress((index) => {
    let result: unknown = { value: index };
    for (let depth = 0; depth < 20; depth++) result = { next: result };
    return result;
  });
});

check('equal-length binary changes are progress', () => {
  assertProgress((index) => ({ base64: `${'A'.repeat(1_024)}${index}` }));
});

check('argument key order and root conversation identity do not create progress', () => {
  const state = createToolLoopState();
  for (let index = 0; index < STALL_FINALIZE_REPEAT_COUNT; index++) {
    const args = index % 2 === 0
      ? `{"conversationId":"first-${index}","selector":"article","options":{"b":2,"a":1}}`
      : `{"options":{"a":1,"b":2},"selector":"article","conversationId":"second-${index}"}`;
    const decision = round(state, { text: 'unchanged' }, args);
    if (index === STALL_FINALIZE_REPEAT_COUNT - 1) assert.deepEqual(decision, { kind: 'finalize', reason: 'stalled' });
  }
});

check('argument changes retain progress, including a nested conversationId', () => {
  assertProgress(() => ({ text: 'unchanged' }), (index) =>
    JSON.stringify({ query: { conversationId: `referenced-${index}` } }),
  );
});

check('invalid JSON arguments retain equal-length tail changes', () => {
  assertProgress(() => 'same', (index) => `${'unparsed '.repeat(100)}${index}`);
});

check('timestamps and duration noise do not prevent stopping', () => {
  const state = createToolLoopState();
  for (let index = 0; index < STALL_FINALIZE_REPEAT_COUNT; index++) {
    const decision = round(state, {
      timestamp: index,
      startedAt: index,
      finishedAt: index,
      endedAt: index,
      elapsedMs: index,
      durationMs: index,
      page: { text: 'unchanged', timestamp: index },
    });
    if (index === STALL_FINALIZE_REPEAT_COUNT - 1) assert.deepEqual(decision, { kind: 'finalize', reason: 'stalled' });
  }
});

check('result key order does not create progress', () => {
  const state = createToolLoopState();
  for (let index = 0; index < STALL_FINALIZE_REPEAT_COUNT; index++) {
    const result = index % 2 === 0 ? { a: 1, b: { c: 2, d: 3 } } : { b: { d: 3, c: 2 }, a: 1 };
    const decision = round(state, result);
    if (index === STALL_FINALIZE_REPEAT_COUNT - 1) assert.deepEqual(decision, { kind: 'finalize', reason: 'stalled' });
  }
});

check('cyclic results are safe and preserve changes outside the cycle', () => {
  const state = createToolLoopState();
  const result: Record<string, unknown> = { text: 'same' };
  result.self = result;
  for (let index = 0; index < STALL_FINALIZE_REPEAT_COUNT; index++) {
    const decision = round(state, result);
    if (index === STALL_FINALIZE_REPEAT_COUNT - 1) assert.deepEqual(decision, { kind: 'finalize', reason: 'stalled' });
  }
  result.text = 'changed';
  assert.equal(round(state, result).kind, 'continue');
  assert.equal(state.repeatedRoundCount, 1);
});

check('shared references and duplicated JSON content have the same fingerprint', () => {
  const state = createToolLoopState();
  const item = { text: 'same' };
  round(state, { first: item, second: item });
  round(state, { first: { text: 'same' }, second: { text: 'same' } });
  assert.equal(state.repeatedRoundCount, 2);
});

check('partial oversized fingerprints do not falsely prove a stall', () => {
  const state = createToolLoopState();
  const result = Array(100_001).fill(null);
  for (let index = 0; index < STALL_FINALIZE_REPEAT_COUNT; index++) {
    assert.equal(round(state, result).kind, 'continue');
    assert.equal(state.repeatedRoundCount, 0);
  }
  state.roundsCompleted = HARD_TOOL_ROUND_LIMIT - 1;
  assert.deepEqual(round(state, result), { kind: 'finalize', reason: 'hard-limit' });
});

check('an exceptional non-JSON payload keeps the total budget without crashing', () => {
  const state = createToolLoopState();
  const result = Object.defineProperty({}, 'text', {
    enumerable: true,
    get() { throw new Error('unreadable test payload'); },
  });
  assert.equal(round(state, result).kind, 'continue');
  assert.equal(state.repeatedRoundCount, 0);
  state.roundsCompleted = HARD_TOOL_ROUND_LIMIT - 1;
  assert.deepEqual(round(state, result), { kind: 'finalize', reason: 'hard-limit' });
});

check('a page loading status does not grant an asynchronous polling allowance', () => {
  const state = createToolLoopState();
  for (let index = 0; index < STALL_FINALIZE_REPEAT_COUNT; index++) {
    const decision = round(state, { status: 'running', text: 'loading' }, '{}', 'browser_get_elements');
    if (index === STALL_FINALIZE_REPEAT_COUNT - 1) assert.deepEqual(decision, { kind: 'finalize', reason: 'stalled' });
  }
});

check('genuine progress still warns at thirty-two and reaches the hard budget at sixty-four', () => {
  const state = createToolLoopState();
  for (let index = 1; index <= HARD_TOOL_ROUND_LIMIT; index++) {
    const decision = round(state, { result: index });
    if (index < HARD_TOOL_ROUND_LIMIT) assert.equal(decision.kind, 'continue');
    if (index === SOFT_TOOL_ROUND_LIMIT) {
      assert.equal(decision.kind, 'continue');
      assert.match(decision.controlInstruction ?? '', /Preserve budget for the final answer/);
    }
    if (index === HARD_TOOL_ROUND_LIMIT) assert.deepEqual(decision, { kind: 'finalize', reason: 'hard-limit' });
  }
  assert.equal(state.totalToolCalls, HARD_TOOL_ROUND_LIMIT);
});

check('final control preserves partial findings and explains continuation in the same conversation', () => {
  const instruction = finalAnswerControlInstruction(createToolLoopState(), 'hard-limit');
  assert.match(instruction, /Never invent missing evidence/);
  assert.match(instruction, /continue it in this conversation/);
  assert.match(instruction, /do not claim that further work has been scheduled or already executed/);
});

console.log(`All ${checks} tool-loop checks passed.`);
