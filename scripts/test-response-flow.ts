// Run: node --import tsx scripts/test-response-flow.ts
// Bundle the actual service and SSE implementations; mock only browser/storage dependencies.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transform } from 'esbuild';
import { finishToolCallRecord, mergeToolCallRecord, startToolCallRecord } from '../src/services/chat/toolCallDetails.ts';

const mocks: Record<string, string> = {
  contextManager: `export const CONTEXT_LIMITS={MAX_MESSAGES:40,TOKEN_WARNING:100000};
    export const trimMessages=x=>x; export const estimateMessagesTokens=()=>0;
    export const estimateTokens=x=>String(x).length; export async function prepareLlmHistory(){}
    export async function materializeToolResultContent(x){return x}`,
  contextUsagePersistence: `export async function persistContextUsageRow(){}
    export async function loadContextUsageRow(){return null} export async function deleteContextUsageRow(){}`,
  interactionBlockSendHints: `export const prepareUserSendText=x=>x;`,
  askModeToolPolicy: `export const isAskModeRound=()=>false; export const isAskBlockedPageTool=()=>false;
    export const buildAskPageToolBlockedPayload=()=>({}); export const getLastUserVisibleGoal=()=>'';`,
  textOnlyToolRecovery: `const recovered=new Set();
    export function clearTextOnlyToolRecovery(id){recovered.delete(id)}
    export function markTextOnlyToolRecoveryUsed(id){recovered.add(id)}
    export async function shouldForceToolRecovery(input){globalThis.__recoveryChecks++;return !!globalThis.__forceRecovery&&!recovered.has(input.conversationId)}
    export const buildToolRecoveryNudgeMessage=()=>'';`,
  browserToolRuntimeClient: `export async function callBrowserToolViaRuntime(){globalThis.__toolCalls++;if(globalThis.__toolError)throw globalThis.__toolError;return {ok:true,title:'fixture'}}`,
  slashSkills: `export async function buildBrowserAssistantSystemPromptParts(){return {systemContent:'',basePrompt:'',skillSection:''}}`,
};
const bundled = await build({
  stdin: { contents: `export { LlmService } from './src/services/chat/llm/llmService.ts';
    export { AnthropicClaudeService } from './src/services/chat/llm/anthropicClaudeService.ts';
    export { OpenAICompatibleService } from './src/services/chat/llm/openaiCompatibleService.ts';`, resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
  banner: { js: `import {createRequire} from 'node:module';const require=createRequire(${JSON.stringify(resolve('package.json'))});` },
  plugins: [{ name: 'isolated-browser-dependencies', setup(builder) {
    builder.onResolve({ filter: /.*/ }, (args) => {
      const name = args.path.split('/').at(-1)!.replace(/\.ts$/, '');
      return name in mocks ? { path: name, namespace: 'fixture' } : undefined;
    });
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ contents: mocks[args.path], loader: 'js' }));
  } }],
});
const services = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const encoder = new TextEncoder();
const savedFetch = globalThis.fetch;
const savedLog = console.log, savedWarn = console.warn, savedError = console.error;
let checks = 0;
const tick = () => new Promise((done) => setTimeout(done, 15));
type Kind = 'openai' | 'claude';
function frames(kind: Kind, text: string, reason = kind === 'openai' ? 'stop' : 'end_turn') {
  return kind === 'openai'
    ? `data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: reason }] })}\n\ndata: [DONE]\n\n`
    : `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } })}\n\n` +
      `event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: reason }, usage: { output_tokens: 5 } })}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n`;
}
function response(body: string) { return new Response(new ReadableStream({ start(c) { c.enqueue(encoder.encode(body)); c.close(); } })); }
function gated(kind: Kind, first: string) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const initial = kind === 'openai'
    ? `data: ${JSON.stringify({ choices: [{ delta: { content: first } }] })}\n\n`
    : `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: first } })}\n\n`;
  const body = new ReadableStream<Uint8Array>({ start(c) { controller = c; c.enqueue(encoder.encode(initial)); } });
  return { response: new Response(body), finish(tail: string) { controller.enqueue(encoder.encode(tail)); controller.close(); } };
}
function make(kind: Kind, captureDetails = false) {
  (globalThis as any).__recoveryChecks = 0;
  (globalThis as any).__toolCalls = 0;
  const Base = kind === 'openai' ? services.LlmService : services.AnthropicClaudeService;
  class FixtureService extends Base { async fetchOptions() { return {}; } getName() { return 'fixture'; } }
  const service = new FixtureService('', 'fixture', { getLlmTools: async () => [] });
  const text: string[] = [], errors: Error[] = [], history: any[] = [];
  const fullBodies: string[] = [];
  const toolRecords = new Map<string, ReturnType<typeof startToolCallRecord>>();
  const toolEvents: string[] = [], toolResults: any[] = [];
  const controller = new AbortController();
  let conversationDone = 0, messageDone = 0;
  const callbacks = { onConversationStart() {}, onConversationDone() { conversationDone++; }, onMessageStart() {}, onMessageDone() { messageDone++; }, onTextMessage(_c: string, _m: string, chunk: string) { text.push(chunk); },
    onMessageError(_c: string, _m: string, error: Error) { errors.push(error); },
    onToolCallStart(_c: string, _m: string, tool: any) {
      toolEvents.push('start'); toolRecords.set(tool.id, startToolCallRecord(tool, captureDetails));
    },
    onToolCallOverride: async (_c: string, _m: string, tool: any, result: unknown) => {
      toolEvents.push('result'); toolResults.push(result);
      toolRecords.set(tool.id, mergeToolCallRecord(toolRecords.get(tool.id), finishToolCallRecord(tool, result, captureDetails)));
      return undefined;
    },
    onToolCallDone() { toolEvents.push('done'); } };
  (callbacks as any).onTextMessageComplete = async (_c: string, _m: string, body: string) => { fullBodies.push(body); };
  const run = (disabled = false) => service.call('fixture-conversation', '', '', '', '', history, callbacks, [], controller.signal, undefined, 0, disabled ? { disableTools: true } : {});
  const send = () => service.sendMessage('fixture-conversation', '', '', '', '', 'Read the current page', callbacks, controller.signal);
  return { service, text, fullBodies, callbacks, errors, history, toolRecords, toolEvents, toolResults, controller, run, send, get conversationDone() { return conversationDone; }, get messageDone() { return messageDone; } };
}
function queue(...responses: Response[]) {
  let requests = 0;
  globalThis.fetch = async () => { requests++; assert.ok(responses.length, 'unexpected extra model request'); return responses.shift()!; };
  return () => requests;
}
async function check(name: string, run: () => Promise<void>) { await run(); checks++; savedLog(`PASS ${name}`); }
try {
  console.log = console.warn = console.error = () => {};
  for (const kind of ['openai', 'claude'] as const) {
    for (const captureDetails of [false, true]) {
      await check(`${kind}: tool failure still reaches the model with capture ${captureDetails ? 'enabled' : 'disabled'}`, async () => {
        const toolFrame = kind === 'openai'
          ? 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"browser_get_current_tab","arguments":"{\\"fixture\\":true}"}}]},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n'
          : 'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"call-1","name":"browser_get_current_tab"}}\n\nevent: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"fixture\\":true}"}}\n\nevent: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n';
        const fixture = make(kind, captureDetails);
        const requests = queue(response(toolFrame), response(frames(kind, 'The tool failed.')));
        (globalThis as any).__toolError = new Error('Fixture tool failure');
        try {
          assert.equal(await fixture.run(), 'done');
          assert.equal(requests(), 2);
          assert.equal((globalThis as any).__toolCalls, 1);
          assert.equal(fixture.errors.length, 0);
          assert.deepEqual(fixture.toolEvents, ['start', 'result', 'done']);
          assert.equal(fixture.toolResults[0].ok, false);
          assert.equal(fixture.toolResults[0].error, 'Fixture tool failure');
          assert.deepEqual(fixture.text, ['The tool failed.']);
          const saved = fixture.toolRecords.get('call-1')!;
          assert.ok(saved);
          if (captureDetails) {
            assert.equal(saved.details?.status, 'error');
            assert.equal(saved.details?.error?.value, 'Fixture tool failure');
            assert.equal((saved.details?.input?.value as any).fixture, true);
          } else {
            assert.deepEqual(saved, { id: 'call-1', name: 'browser_get_current_tab', state: 'doing' });
          }
        } finally { delete (globalThis as any).__toolError; }
      });
    }
    await check(`${kind}: final-only deltas appear before completion exactly once`, async () => {
      const source = gated(kind, 'first '), fixture = make(kind), requests = queue(source.response);
      const done = fixture.run(true); await tick();
      assert.deepEqual(fixture.text, ['first ']);
      source.finish(frames(kind, 'last')); assert.equal(await done, 'done');
      assert.equal(fixture.text.join(''), 'first last'); assert.equal(requests(), 1);
      assert.deepEqual(fixture.fullBodies, ['first last']);
    });
    await check(`${kind}: ordinary tool-enabled text remains buffered`, async () => {
      const source = gated(kind, 'first '), fixture = make(kind); queue(source.response);
      const done = fixture.run(); await tick(); assert.deepEqual(fixture.text, []);
      source.finish(frames(kind, 'last')); assert.equal(await done, 'done'); assert.deepEqual(fixture.text, ['first last']);
    });
    await check(`${kind}: late tools discard provisional text; final-only rounds reject them`, async () => {
      const toolFrame = kind === 'openai'
        ? 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"browser_get_current_tab","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n'
        : 'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"call-1","name":"browser_get_current_tab"}}\n\nevent: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{}"}}\n\nevent: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n';
      const source = gated(kind, 'Checking the page...'), fixture = make(kind);
      const requests = queue(source.response, response(frames(kind, 'Final answer')));
      const done = fixture.run(); await tick(); assert.deepEqual(fixture.text, []);
      source.finish(toolFrame); assert.equal(await done, 'done');
      assert.deepEqual(fixture.text, ['Final answer']); assert.equal(requests(), 2);
      assert.equal((globalThis as any).__toolCalls, 1);

      const forbidden = gated(kind, 'partial'), finalOnly = make(kind);
      const forbiddenRequests = queue(forbidden.response);
      const rejected = finalOnly.run(true); await tick(); forbidden.finish(toolFrame);
      assert.equal(await rejected, 'error'); assert.equal(forbiddenRequests(), 1);
      assert.equal(finalOnly.history.length, 0); assert.equal((globalThis as any).__toolCalls, 0);
    });
    await check(`${kind}: cancellation does not commit streamed partial text as completed history`, async () => {
      const source = gated(kind, 'partial'), fixture = make(kind); queue(source.response);
      const done = fixture.run(true); await tick(); fixture.controller.abort();
      assert.equal(await done, 'aborted'); assert.equal(fixture.history.length, 0); assert.equal(fixture.errors.length, 0);
      assert.deepEqual(fixture.fullBodies, []);
    });
    for (const failure of ['cancelled', 'storage-failed']) {
      await check(`${kind}: ${failure} during final persistence does not commit history or completion`, async () => {
        const fixture = make(kind), requests = queue(response(frames(kind, 'full body')));
        let release!: () => void, reject!: (error: Error) => void, outcome: string | undefined;
        const stored = new Promise<void>((done, fail) => { release = done; reject = fail; });
        (fixture.callbacks as any).onTextMessageComplete = () => stored;
        const call = fixture.service.call.bind(fixture.service);
        // Force only the request control; keep sendMessage's real completion handling.
        fixture.service.call = async (...args: any[]) => {
          args[11] = { disableTools: true };
          outcome = await call(...args);
          return outcome;
        };
        const completed = fixture.send();
        await tick();
        assert.equal(fixture.service.conversationHistory.get('fixture-conversation').filter((m: any) => m.role === 'assistant').length, 0);
        assert.equal(fixture.messageDone, 0);
        if (failure === 'cancelled') { fixture.controller.abort(); release(); }
        else reject(new Error('fixture storage failed'));
        await completed;
        assert.equal(outcome, failure === 'cancelled' ? 'aborted' : 'error');
        assert.equal(fixture.service.conversationHistory.get('fixture-conversation').filter((m: any) => m.role === 'assistant').length, 0);
        assert.equal(fixture.messageDone, 0);
        // sendMessage keeps its existing cancellation cleanup callback; it receives no committed assistant history.
        assert.equal(fixture.conversationDone, failure === 'cancelled' ? 1 : 0);
        assert.equal(fixture.errors.length, failure === 'cancelled' ? 0 : 1);
        assert.equal(requests(), 1);
      });
    }
    for (const reason of [kind === 'openai' ? 'content_filter' : 'refusal', kind === 'openai' ? 'length' : 'max_tokens', 'model_context_window_exceeded']) {
      await check(`${kind}: ${reason} avoids a second billed request`, async () => {
        const fixture = make(kind), requests = queue(response(frames(kind, '', reason)));
        assert.equal(await fixture.run(), 'error'); assert.equal(requests(), 1); assert.equal(fixture.errors.length, 1);
      });
    }
    await check(`${kind}: recoverable empty response still has one bounded retry`, async () => {
      const fixture = make(kind), requests = queue(response(frames(kind, '')), response(frames(kind, 'recovered')));
      assert.equal(await fixture.run(), 'done'); assert.equal(requests(), 2); assert.equal(fixture.text.join(''), 'recovered');
    });
    await check(`${kind}: repeated empty responses stop after two total requests`, async () => {
      const fixture = make(kind), requests = queue(response(frames(kind, '')), response(frames(kind, '')));
      assert.equal(await fixture.run(), 'error'); assert.equal(requests(), 2);
    });
    await check(`${kind}: EOF alone does not trigger an empty retry`, async () => {
      const fixture = make(kind), requests = queue(response(''));
      assert.equal(await fixture.run(), 'error'); assert.equal(requests(), 1);
    });
    await check(`${kind}: context-window truncation preserves streamed partial text as incomplete`, async () => {
      const fixture = make(kind), requests = queue(response(frames(kind, 'partial answer', 'model_context_window_exceeded')));
      assert.equal(await fixture.run(true), 'error'); assert.equal(requests(), 1);
      assert.deepEqual(fixture.text, ['partial answer']); assert.deepEqual(fixture.fullBodies, []);
      assert.equal(fixture.history.length, 0); assert.equal(fixture.messageDone, 0);
      assert.equal(fixture.errors.length, 1); assert.equal(fixture.errors[0].name, 'AssistantResponseTerminationError');
    });
    await check(`${kind}: nonempty truncation and bare EOF are errors, not successful conversations`, async () => {
      for (const body of [frames(kind, 'partial', kind === 'openai' ? 'length' : 'max_tokens'),
        frames(kind, 'partial', 'model_context_window_exceeded'),
        kind === 'openai' ? 'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'
          : 'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"partial"}}\n\n']) {
        const fixture = make(kind), requests = queue(response(body));
        await fixture.send(); assert.equal(fixture.conversationDone, 0); assert.equal(requests(), 1);
        assert.equal(fixture.errors.length, 1);
        assert.equal(fixture.errors[0].name, 'AssistantResponseTerminationError');
        assert.equal(fixture.service.conversationHistory.get('fixture-conversation').filter((m: any) => m.role === 'assistant').length, 0);
      }
    });
    await check(`${kind}: an explicit finish reason remains sufficient without an end marker`, async () => {
      const body = frames(kind, 'complete').replace(/data: \[DONE\]\n\n$/, '').replace(/event: message_stop\ndata: \{"type":"message_stop"\}\n\n$/, '');
      const fixture = make(kind); queue(response(body));
      assert.equal(await fixture.run(), 'done'); assert.deepEqual(fixture.text, ['complete']);
    });
    await check(`${kind}: incomplete or rejected tool streams execute no browser tool`, async () => {
      const toolBody = kind === 'openai'
        ? 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"browser_get_current_tab","arguments":"{}"}}]}}]}\n\n'
        : 'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"call-1","name":"browser_get_current_tab"}}\n\nevent: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{}"}}\n\n';
      for (const reason of [undefined, kind === 'openai' ? 'content_filter' : 'refusal', kind === 'openai' ? 'length' : 'max_tokens', 'model_context_window_exceeded']) {
        const fixture = make(kind); const requests = queue(response(toolBody + (reason ? frames(kind, '', reason) : '')));
        assert.equal(await fixture.run(), 'error'); assert.equal(requests(), 1);
        assert.equal((globalThis as any).__toolCalls, 0); assert.deepEqual(fixture.text, []);
      }
    });
  }
  await check('OpenAI refusal text is displayed without empty/tool recovery', async () => {
    (globalThis as any).__forceRecovery = true; (globalThis as any).__recoveryChecks = 0;
    const fixture = make('openai'); const requests = queue(response('data: {"choices":[{"delta":{"refusal":"I cannot help with that."},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));
    assert.equal(await fixture.run(), 'done'); assert.equal(requests(), 1);
    assert.equal(fixture.text.join(''), 'I cannot help with that.'); assert.equal((globalThis as any).__recoveryChecks, 0);
    (globalThis as any).__forceRecovery = false;
  });
  await check('request budgets respect explicit configuration and actual thinking mode', async () => {
    const client = { getLlmTools: async () => [] };
    for (const [model, extraBody, field, value] of [
      ['qwen3', { enable_thinking: false }, 'max_tokens', 4096],
      ['deepseek-flash', {}, 'max_tokens', 8192],
      ['deepseek-flash', { thinking: { type: 'disabled' } }, 'max_tokens', 4096],
      ['test', { max_tokens: 1234 }, 'max_tokens', 1234],
      ['test', { max_tokens: 9999, max_completion_tokens: 2048 }, 'max_completion_tokens', 2048],
      ['test', { max_tokens: -1 }, 'max_tokens', 4096],
    ] as const) {
      const service = new services.OpenAICompatibleService('', model, client, 'https://example.test', { extraBody });
      const options = await service.fetchOptions('fixture', '', '', '', '', []);
      const body = JSON.parse(options.body); assert.equal(body[field], value);
      assert.equal(body[field === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens'], undefined);
      if ('enable_thinking' in extraBody) assert.equal(body.enable_thinking, extraBody.enable_thinking);
    }
  });
  await check('DeepSeek text-only recovery keeps thinking and tool execution without a rejected required choice', async () => {
    (globalThis as any).__forceRecovery = true;
    (globalThis as any).__toolCalls = 0;
    (globalThis as any).__recoveryChecks = 0;
    const client = { getLlmTools: async () => [{ type: 'function', function: { name: 'browser_get_current_tab', parameters: { type: 'object', properties: {} } } }] };
    const service = new services.OpenAICompatibleService('', 'deepseek-flash', client, 'https://api.deepseek.com/v1', { extraBody: { thinking: { type: 'enabled' }, max_tokens: 512 } });
    const first = 'data: {"choices":[{"delta":{"reasoning_content":"fixture reasoning one","content":"Let me check the page."},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
    const tool = 'data: {"choices":[{"delta":{"reasoning_content":"fixture reasoning two","tool_calls":[{"index":0,"id":"call-compat","type":"function","function":{"name":"browser_get_current_tab","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n';
    const responses = [response(first), response(tool), response(frames('openai', 'Completed.'))];
    const bodies: any[] = [], text: string[] = [], errors: Error[] = [];
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(init!.body as string); bodies.push(body);
      assert.equal(body.tool_choice, undefined, 'thinking-mode server would reject required');
      assert.deepEqual(body.thinking, { type: 'enabled' });
      assert.equal(body.max_tokens, 512);
      assert.ok(responses.length, 'recovery must stay bounded');
      return responses.shift()!;
    };
    await service.sendMessage('deepseek-recovery-fixture', '', '', '', '', 'Read the page title', {
      onConversationStart() {}, onConversationDone() {}, onMessageStart() {}, onMessageDone() {},
      onTextMessage(_c: string, _m: string, chunk: string) { text.push(chunk); },
      onMessageError(_c: string, _m: string, error: Error) { errors.push(error); },
      onToolCallStart() {}, onToolCallOverride: async () => undefined, onToolCallDone() {},
    }, new AbortController().signal);
    assert.equal(bodies.length, 3); assert.equal(errors.length, 0);
    assert.deepEqual(text, ['Completed.']); assert.equal((globalThis as any).__toolCalls, 1);
    assert.ok(bodies[1].messages.some((message: any) => message.reasoning_content === 'fixture reasoning one'));
    assert.ok(bodies[2].messages.some((message: any) => message.reasoning_content === 'fixture reasoning two'));
    (globalThis as any).__forceRecovery = false;
  });
  await check('final response completion awaits durable full-body reconciliation', async () => {
    const fixture = make('openai'); queue(response(frames('openai', 'full body')));
    let release!: () => void, finished = false;
    const stored = new Promise<void>((done) => { release = done; });
    (fixture.callbacks as any).onTextMessageComplete = () => stored;
    const completed = fixture.run(true).then((outcome: string) => { finished = true; return outcome; });
    await tick(); assert.equal(finished, false); release(); assert.equal(await completed, 'done');
  });
  await check('actual panel reconciliation repairs a stale switched message without touching another conversation', async () => {
    const panel = readFileSync('src/components/chat/ChatPanel.vue', 'utf8');
    const start = panel.indexOf('function finalizeStreamedAssistantMessage(');
    const end = panel.indexOf('\nasync function copyToClipboard', start);
    assert.ok(start >= 0 && end > start);
    const source = (await transform(panel.slice(start, end), { loader: 'ts', target: 'es2022' })).code;
    const rows = new Map<string, any>([['message-A', { content: 'first ' }]]);
    const state: any = { conversationId: { value: 'B' }, messages: { value: [{ id: 'message-B', content: 'B stays' }] },
      messagePersistQueues: new Map(), messagePersistErrors: new Map(), sanitizeAssistantUserFacing: (x: string) => x,
      safariShellOnAssistantUpsert() {}, chatStorage: {
        async updateMessage(id: string, patch: any) { if (!rows.has(id)) return false; Object.assign(rows.get(id), patch); return true; },
        async addMessage(row: any) { rows.set(row.id, row); },
      } };
    runInNewContext(source + '\nthis.finalize = finalizeStreamedAssistantMessage;', state);
    let release!: () => void;
    state.messagePersistQueues.set('message-A', new Promise<void>((done) => { release = () => { rows.set('message-A', { content: 'incomplete chunks' }); done(); }; }));
    const final = state.finalize('A', 'message-A', 'first second final');
    state.conversationId.value = 'A'; state.messages.value = [{ id: 'message-A', content: 'stale first ' }];
    release(); await final;
    assert.equal(rows.get('message-A').content, 'first second final');
    assert.equal(state.messages.value[0].content, 'first second final');
    const originalUpdate = state.chatStorage.updateMessage;
    let releaseWrite!: () => void;
    state.chatStorage.updateMessage = async (id: string, patch: any) => {
      await new Promise<void>((done) => { releaseWrite = done; });
      return originalUpdate(id, patch);
    };
    const writing = state.finalize('A', 'message-A', 'durable full final');
    await tick();
    state.messages.value = [{ id: 'message-A', content: 'older loaded snapshot' }];
    releaseWrite(); await writing;
    assert.equal(state.messages.value[0].content, 'durable full final');
    await originalUpdate('message-A', { content: state.messages.value[0].content });
    assert.equal(rows.get('message-A').content, 'durable full final');
    state.chatStorage.updateMessage = originalUpdate;
    state.conversationId.value = 'B'; state.messages.value = [{ id: 'message-B', content: 'B stays' }];
    await state.finalize('A', 'message-A', 'complete A');
    assert.equal(state.messages.value[0].content, 'B stays'); assert.equal(rows.get('message-A').content, 'complete A');
    state.chatStorage.updateMessage = async () => { throw new Error('fixture storage failed'); };
    await assert.rejects(state.finalize('A', 'message-A', 'cannot persist'), /fixture storage failed/);
    assert.match(state.messagePersistErrors.get('message-A'), /fixture storage failed/);
  });
  savedLog(`Response service flow checks passed (${checks})`);
} finally {
  globalThis.fetch = savedFetch; console.log = savedLog; console.warn = savedWarn; console.error = savedError;
  delete (globalThis as any).__forceRecovery; delete (globalThis as any).__recoveryChecks;
  delete (globalThis as any).__toolCalls;
  delete (globalThis as any).__toolError;
}
