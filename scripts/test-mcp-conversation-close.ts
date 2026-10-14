import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { build, transform } from "esbuild";
import * as ts from "typescript";

const token = "a".repeat(32), cid = "fixture-close", host = 17;
const sender = { id: "fixture-extension", url: "chrome-extension://fixture-extension/popup/index.html?domaTabId=17#sidepannel" };
let mode: { reject?: boolean; terminal?: boolean; disconnect?: boolean; finishBeforeDisconnect?: boolean } = {};
class Socket {
  static OPEN = 1; static CONNECTING = 0; static CLOSED = 3; static all: Socket[] = [];
  readyState = Socket.CONNECTING; onopen: any; onmessage: any; onclose: any; onerror: any; sent: any[] = [];
  constructor(readonly url: string) { Socket.all.push(this); queueMicrotask(() => { this.readyState = Socket.OPEN; this.onopen?.(); }); }
  receive(message: any) { this.onmessage?.({ data: JSON.stringify(message) }); }
  send(raw: string) {
    const message = JSON.parse(raw); this.sent.push(message);
    if (message.type === "close_claim") queueMicrotask(() => this.receive(mode.reject ? { type: "close_rejected" } :
      { ...message, status: mode.terminal ? "done" : "running", ok: !!mode.terminal, text: "previous completion", type: "close_ready" }));
    if (message.type === "result") {
      if (mode.disconnect) { mode.disconnect = false; if (mode.finishBeforeDisconnect) mode.terminal = true; this.close(); }
      else queueMicrotask(() => { this.receive({ type: "result_ack", resultId: "wrong" }); this.receive({ type: "result_ack", resultId: message.resultId }); });
    }
  }
  close() { if (this.readyState === Socket.CLOSED) return; this.readyState = Socket.CLOSED; this.onclose?.(); }
}
(globalThis as any).WebSocket = Socket;
// Import the actual worker helper without initializing browser Context in Node.
const bundled = await build({
  stdin: { contents: readFileSync("src/services/chat/mcpConversationClose.ts", "utf8"), resolveDir: process.cwd() + "/src/services/chat", loader: "ts" },
  bundle: true, write: false, format: "esm", platform: "node", plugins: [{ name: "context-fixture", setup(builder) {
    builder.onResolve({ filter: /conversationContextPersistence$/ }, () => ({ path: "context", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export async function getPersistedConversationContext() { throw new Error('use fixture context'); }" }));
  } }],
});
const { closeMcpConversationInWorker } = await import("data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].text).toString("base64"));
let sequence = 0, checks = 0;
function fixture(kind = "group") {
  mode = {}; Socket.all = [];
  const request = { requestId: `close-${++sequence}`, conversationId: cid, completionToken: token, bridgePort: 3847 };
  const state = { removed: [] as number[][], live: [{ id: host }, { id: 18 }], failRemove: false, retain: false, panelGone: false };
  const browser = { runtime: { id: sender.id, getURL: (path: string) => `chrome-extension://${sender.id}/${path}` }, tabs: {
    query: async () => [...state.live],
    remove: async (ids: number[]) => { state.removed.push(ids); if (state.failRemove) throw new Error("fixture removal rejected"); state.panelGone = ids.includes(host); if (!state.retain) state.live = state.live.filter((tab) => !ids.includes(tab.id)); },
  } };
  const context: any = { conversationId: cid, mode: kind, tabId: host, groupId: 4, groupTabs: [host, 18] };
  const run = () => closeMcpConversationInWorker(browser, request, sender, async () => context);
  return { state, browser, request, context, run };
}
async function check(name: string, run: () => Promise<void>) { await run(); checks++; console.log(`PASS ${name}`); }
for (const kind of ["group", "single"]) await check(`${kind}: destroyed panel cannot destroy SW result delivery`, async () => {
  const f = fixture(kind); const result = await f.run();
  assert.equal(f.state.panelGone, true); assert.equal(result.ok, true);
  assert.deepEqual(f.state.removed, [kind === "group" ? [host, 18] : [host]]);
  assert.equal(Socket.all.length, 1); assert.ok(Socket.all[0].url.endsWith("/close-result"));
  assert.equal(Socket.all[0].sent.some((message) => message.type === "hello"), false);
  assert.equal(Socket.all[0].sent.find((message) => message.type === "result").status, "done");
});
await check("rejected capability causes no tab deletion", async () => {
  const f = fixture(); mode.reject = true; await assert.rejects(f.run(), /校验失败/); assert.deepEqual(f.state.removed, []);
});
await check("removal failure and surviving targets send errors", async () => {
  for (const failure of ["failRemove", "retain"] as const) {
    const f = fixture(); f.state[failure] = true; const result = await f.run();
    assert.equal(result.status, "error"); assert.equal(result.ok, false);
    assert.equal(Socket.all[0].sent.find((message) => message.type === "result").status, "error");
  }
});
await check("reconnect retries only receipt, never deletion", async () => {
  const f = fixture(); mode.disconnect = true; const result = await f.run();
  assert.equal(result.status, "done"); assert.equal(Socket.all.length, 2); assert.equal(f.state.removed.length, 1);
  assert.deepEqual(Socket.all[0].sent.find((message) => message.type === "result"), Socket.all[1].sent.find((message) => message.type === "result"));
});
await check("lost ACK after daemon commit uses the terminal snapshot without resending or deleting", async () => {
  const f = fixture(); mode.disconnect = true; mode.finishBeforeDisconnect = true;
  const result = await f.run();
  assert.equal(result.status, "done"); assert.equal(result.ok, true); assert.equal(f.state.removed.length, 1);
  assert.equal(Socket.all.length, 2); assert.equal(Socket.all[1].sent.some((message) => message.type === "result"), false);
});
await check("completed request and duplicate live requests never repeat deletion", async () => {
  const completed = fixture(); mode.terminal = true; assert.equal((await completed.run()).ok, true); assert.deepEqual(completed.state.removed, []);
  const pending = fixture(); const results = await Promise.all([pending.run(), pending.run()]);
  assert.deepEqual(results[0], results[1]); assert.equal(pending.state.removed.length, 1); assert.equal(Socket.all.length, 1);
});
await check("sender, route, group ownership and request mismatches fail before deletion", async () => {
  for (const altered of ["sender", "url", "port", "token", "context", "group"]) {
    const f = fixture(); const source = { ...sender };
    if (altered === "sender") source.id = "other";
    if (altered === "url") source.url = source.url.replace("fixture-extension", "other");
    if (altered === "port") f.request.bridgePort = 3857;
    if (altered === "token") f.request.completionToken = "bad";
    if (altered === "context") f.context.conversationId = "other";
    if (altered === "group") f.context.groupTabs = [18];
    await assert.rejects(closeMcpConversationInWorker(f.browser, f.request, source, async () => f.context));
    assert.deepEqual(f.state.removed, []); assert.equal(Socket.all.length, 0);
  }
});
await check("actual panel delegates to SW and never sends success after its renderer disappears", async () => {
  const f = fixture(); const text = readFileSync("src/components/chat/ChatPanel.vue", "utf8");
  const start = text.indexOf('<script setup lang="ts">') + '<script setup lang="ts">'.length;
  const ast = ts.createSourceFile("panel.ts", text.slice(start, text.indexOf("</script>", start)), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const node = ast.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "processMcpExternalClose")!;
  const code = (await transform(node.getText(ast) + "\nthis.close = processMcpExternalClose;", { loader: "ts", target: "es2022" })).code;
  const reports: any[] = [];
  let completed!: () => void; const finished = new Promise<void>((done) => { completed = done; });
  const panel: any = { console: { log() {} }, reportMcpExternalAccepted() {}, reportMcpExternalResult: (result: any) => reports.push(result),
    isConversationLoading: () => false, abortControllersByConversation: new Map(), awaitConversationContextPersist: async () => {},
    getContext: () => ({ browser: { runtime: { sendMessage: (message: any) => {
      assert.equal(message.operate, "chat/closeMcpConversation");
      void closeMcpConversationInWorker(f.browser, message.payload, sender, async () => f.context).then(() => completed());
      return new Promise(() => {}); // The originating renderer is destroyed during remove.
    } } } }) };
  runInNewContext(code, panel); void panel.close({ ...f.request, targetConversationId: cid, callerAgent: "fixture" });
  await finished; assert.equal(f.state.panelGone, true); assert.deepEqual(reports, []);
  assert.equal(Socket.all[0].sent.find((message) => message.type === "result").status, "done");
});
console.log(`MCP worker close: ${checks} checks passed`);
