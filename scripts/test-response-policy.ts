// Run: node --import tsx scripts/test-response-policy.ts
import assert from 'node:assert/strict';
import {
  classifyEmptyResponse,
  resolveOutputTokenLimit,
} from '../src/services/chat/llm/responsePolicy.ts';

let checks = 0;
function check(name: string, run: () => void): void {
  run();
  checks++;
  console.log(`PASS ${name}`);
}

check('missing finish reason and usage retain bounded recovery compatibility', () => {
  const result = classifyEmptyResponse({});
  assert.equal(result.kind, 'unknown');
  assert.equal(result.retry, true);
  assert.ok(result.recoveryInstruction);
});

check('visible text requires no empty-response retry, including count-only input', () => {
  assert.deepEqual(classifyEmptyResponse({ text: ' final answer ' }), { kind: 'not-empty', retry: false });
  assert.deepEqual(classifyEmptyResponse({ textLength: 3 }), { kind: 'not-empty', retry: false });
  assert.equal(classifyEmptyResponse({ text: ' \n ', textLength: 3 }).retry, true);
});

check('refusal and safety reasons never trigger automatic paid recovery', () => {
  assert.equal(classifyEmptyResponse({ finishReason: 'stop', refusalDetected: true }).kind, 'blocked');
  for (const finishReason of ['content_filter', 'refusal', 'SAFETY', 'blocked', 'recitation', 'prohibited_content']) {
    const result = classifyEmptyResponse({ finishReason, streamCompleted: true, reasoningLength: 90 });
    assert.equal(result.kind, 'blocked');
    assert.equal(result.retry, false);
    assert.ok(result.errorMessage);
    assert.equal(result.recoveryInstruction, undefined);
  }
});

check('aborted and unfinished streams are not empty-response retry candidates', () => {
  assert.deepEqual(classifyEmptyResponse({ aborted: true, finishReason: 'length' }), { kind: 'aborted', retry: false });
  for (const input of [{ streamCompleted: false }, { finishReason: 'pause_turn' }]) {
    const result = classifyEmptyResponse(input);
    assert.equal(result.kind, 'incomplete'); assert.equal(result.retry, false); assert.ok(result.errorMessage);
  }
  assert.deepEqual(classifyEmptyResponse({ finishReason: 'aborted' }), { kind: 'aborted', retry: false });
});

check('length stops do not repeat the same paid request or assume which limit was hit', () => {
  for (const finishReason of ['length', 'max_tokens']) {
    const result = classifyEmptyResponse({ finishReason, reasoning: 'internal thought' });
    assert.equal(result.kind, 'token-limit');
    assert.equal(result.retry, false);
    assert.match(result.errorMessage!, /output or context token limit/);
    assert.equal(result.recoveryInstruction, undefined);
  }
});

check('reasoning evidence and completion usage remain distinct', () => {
  assert.equal(classifyEmptyResponse({ reasoningLength: 18, finishReason: 'stop' }).kind, 'reasoning-only');
  assert.equal(classifyEmptyResponse({ usage: { reasoningTokens: 3 } }).kind, 'reasoning-only');
  assert.equal(classifyEmptyResponse({ usage: { completionTokens: 3 } }).kind, 'empty-with-usage');
  assert.equal(classifyEmptyResponse({ finishReason: 'stop', usage: { completionTokens: 0 } }).kind, 'empty');
  assert.equal(classifyEmptyResponse({ finishReason: 'stop', usage: { completionTokens: Number.NaN } }).kind, 'empty');
});

check('explicit limits take precedence and use one canonical field', () => {
  assert.deepEqual(resolveOutputTokenLimit({ model: 'qwen3', extraBody: { max_tokens: 2000 } }), {
    field: 'max_tokens', value: 2000, source: 'explicit',
  });
  assert.deepEqual(resolveOutputTokenLimit({ model: 'deepseek-reasoner', extraBody: { max_completion_tokens: 3000, max_tokens: 4000 } }), {
    field: 'max_completion_tokens', value: 3000, source: 'explicit',
  });
  assert.equal(resolveOutputTokenLimit({ model: 'deepseek-reasoner', extraBody: { max_completion_tokens: 0, max_tokens: 2500 } }).value, 2500);
  assert.equal(resolveOutputTokenLimit({ model: 'plain', extraBody: { max_tokens: 2_147_483_648 } }).value, 2_147_483_648);
});

check('invalid limits cannot replace a valid default', () => {
  for (const value of [undefined, null, 0, -1, 12.5, '1024', true, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(resolveOutputTokenLimit({ model: 'plain-model', extraBody: { max_tokens: value, max_completion_tokens: value } }), {
      field: 'max_tokens', value: 4096, source: 'default',
    });
  }
});

check('explicit nonthinking mode overrides reasoning model names', () => {
  for (const model of ['qwen3', 'deepseek-reasoner', 'DeepSeek-R1', 'qwq', 'vendor-thinking']) {
    for (const extraBody of [{ enable_thinking: false }, { thinking: { type: 'disabled' } }, { reasoning_effort: 'none' }]) {
      assert.equal(resolveOutputTokenLimit({ model, extraBody }).value, 4096);
    }
  }
});

check('actual request mode overrides fallback mode and supports enabled reasoning', () => {
  assert.equal(resolveOutputTokenLimit({ model: 'plain', mode: 'thinking' }).value, 8192);
  assert.equal(resolveOutputTokenLimit({ model: 'qwen3', mode: 'non-thinking' }).value, 4096);
  assert.equal(resolveOutputTokenLimit({ model: 'qwen3', mode: 'thinking', extraBody: { enable_thinking: false } }).value, 4096);
  for (const extraBody of [{ enable_thinking: true }, { thinking: { type: 'enabled' } }, { reasoning_effort: 'high' }]) {
    assert.equal(resolveOutputTokenLimit({ model: 'plain', extraBody }).value, 8192);
  }
});

check('legacy unknown DeepSeek and Qwen3 mode budgets are preserved on any provider', () => {
  for (const provider of ['deepseek', 'qwen', 'relay', 'siliconflow', undefined]) {
    for (const model of ['deepseek-chat', 'deepseek-ai/DeepSeek-V3', 'qwen3-plus', 'vendor/r1-distill', 'qwq-32b']) {
      assert.equal(resolveOutputTokenLimit({ provider, model, extraBody: { enable_thinking: 'false', reasoning_effort: 'unknown' } }).value, 8192);
    }
  }
  assert.equal(resolveOutputTokenLimit({ model: 'ordinary' }).value, 4096);
});

console.log(`response policy: ${checks} checks passed`);
