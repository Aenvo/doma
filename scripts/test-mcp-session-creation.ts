// Run: node --import tsx scripts/test-mcp-session-creation.ts
// Execute actual panel functions; mock only browser, storage and model boundaries.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transform } from "esbuild";
import * as ts from "typescript";

const panel = readFileSync("src/components/chat/ChatPanel.vue", "utf8");
const start = panel.indexOf('<script setup lang="ts">') + '<script setup lang="ts">'.length;
const ast = ts.createSourceFile("ChatPanel.ts", panel.slice(start, panel.indexOf("</script>", start)), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function source(name: string): string {
  const node = ast.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(node, `actual panel function ${name} must exist`);
  return node.getText(ast);
}
async function functions(names: string[], env: Record<string, any>) {
  const js = await transform(names.map(source).join("\n"), { loader: "ts", target: "es2022" });
  return runInNewContext(`${js.code}\n({${names.join(",")}})`, env);
}
let checks = 0;
async function check(name: string, run: () => Promise<void>) {
  await run(); checks++; console.log(`PASS ${name}`);
}
function fixture() {
  const accepted: any[] = [], results: any[] = [], sends: any[] = [];
  const conversationId = { value: "selected-history" };
  const env: Record<string, any> = {
    console: { log() {}, warn() {}, error() {} }, Date, Error, conversationId,
    panelHostTabId: 7, normalizeMcpExternalSendText: (text: string) => text,
    ingestMcpAttachments: async () => [],
    formatUserMessageForModel: ({ body }: any) => body,
    t: () => "direct session fixture",
    startGroupSession: async (_tab: number, throwOnError: boolean) => {
      assert.equal(throwOnError, true);
      // A concurrent tab binding changes the panel; only the returned ID is authoritative.
      conversationId.value = "other-selected-history";
      return "new-conversation";
    },
    isConversationLoading: () => false,
    getContext: () => ({ browser: { runtime: {}, tabs: { get: async () => ({ id: 7, url: "https://example.com/", title: "Fixture" }) } } }),
    getMcpExecutionContextId: async () => "fixture-executor",
    window: { location: { href: "chrome-extension://fixture/panel" } },
    mcpTurnTargetContext: () => ({}), addMessage: async () => "fixture-user",
    reportMcpExternalAccepted: (p: any) => accepted.push(p),
    reportMcpExternalResult: (p: any) => { results.push(p); return Promise.resolve(true); },
    sendMcpBridgeRunning() {}, send2: async (_text: string, opts: any) => sends.push(opts),
  };
  return { env, accepted, results, sends };
}
const payload = { requestId: "new-request", callerAgent: "Codex", sendText: "只读中文任务\n验证新会话", targetTabId: 7 };
for (const name of ["processMcpExternalTask", "processMcpDirectSession"]) {
  await check(`${name}: binds the returned ID despite a panel switch`, async () => {
    const f = fixture();
    const api = await functions(["assertMcpSessionRequestActive", name], f.env);
    await api[name](payload);
    assert.deepEqual(f.accepted.map(p => p.conversationId), ["new-conversation"]);
    assert.equal(f.results.length, 0);
    if (name === "processMcpExternalTask") assert.equal(f.sends[0].conversationId, "new-conversation");
  });
  for (const failure of ["target validation", "creation rejection", "empty creation", "expired before creation", "expired during creation"]) {
    await check(`${name}: ${failure} cannot bind or run the selected history`, async () => {
      const f = fixture();
      const input = { ...payload } as any;
      if (failure === "target validation") input.targetTabId = 8;
      if (failure === "creation rejection") f.env.startGroupSession = async () => { throw new Error("fixture group failure"); };
      if (failure === "empty creation") f.env.startGroupSession = async () => undefined;
      if (failure === "expired before creation") {
        input.expiresAt = Date.now() - 1;
        f.env.startGroupSession = async () => { assert.fail("expired request must not create a group"); };
      }
      if (failure === "expired during creation") {
        input.expiresAt = Date.now() + 60_000;
        f.env.startGroupSession = async () => { input.expiresAt = Date.now() - 1; return "new-conversation"; };
      }
      const api = await functions(["assertMcpSessionRequestActive", name], f.env);
      await api[name](input);
      assert.equal(f.accepted.length, 0);
      assert.equal(f.sends.length, 0);
      assert.equal(f.results.length, 1);
      assert.equal(f.results[0].requestId, payload.requestId);
      assert.equal(f.results[0].status, "error");
      assert.notEqual(f.results[0].conversationId, "selected-history");
      if (failure === "creation rejection") assert.equal(f.results[0].text, "fixture group failure");
    });
  }
}
for (const name of ["processMcpExternalTask", "processMcpDirectSession"]) await check(`${name}: preparation exceptions produce a request-scoped error`, async () => {
  const f = fixture();
  f.env.normalizeMcpExternalSendText = () => { throw new Error("fixture preparation failure"); };
  const api = await functions(["assertMcpSessionRequestActive", name], f.env);
  await api[name](payload);
  assert.equal(f.results[0].text, "fixture preparation failure");
  assert.equal(f.results[0].conversationId, undefined);
  assert.equal(f.accepted.length, 0);
});
await check("queued expired tasks do not create a late group", async () => {
  const f = fixture();
  f.env.chatPanelReadyForMcp = false;
  f.env.mcpExternalTaskQueue = [];
  f.env.startGroupSession = async () => { assert.fail("expired queued request must not create a group"); };
  const api = await functions(["assertMcpSessionRequestActive", "processMcpExternalTask", "handleMcpExternalTaskMessage", "flushMcpExternalTaskQueue"], f.env);
  assert.equal(api.handleMcpExternalTaskMessage({ ...payload, expiresAt: Date.now() - 1 }).queued, true);
  api.flushMcpExternalTaskQueue();
  assert.equal(f.results[0].status, "error");
  assert.equal(f.accepted.length, 0);
});
await check("startGroupSession preserves browser errors for MCP and returns the newly created ID", async () => {
  const conversationId = { value: "selected-history" };
  let failGroup = true;
  const env = {
    console: { log() {}, warn() {}, error() {} }, Error, conversationId,
    getContext: () => ({ browser: { runtime: {}, tabs: {
      get: async () => ({ id: 7 }),
      group: (_opts: any, callback: any) => { if (failGroup) throw new Error("fixture browser group error"); callback(17); },
    } } }),
    DOMA_TAB_GROUP_COLOR: "grey", generateConversationId: () => "new-conversation",
    upsertConversationContext() {}, refreshConversationContextList: async () => {},
    loadConversation: async () => { conversationId.value = "switched-history"; },
  };
  const api = await functions(["assertMcpSessionRequestActive", "startGroupSession"], { ...env, Date });
  await assert.rejects(api.startGroupSession(7, true), /fixture browser group error/);
  assert.equal(conversationId.value, "selected-history");
  assert.equal(await api.startGroupSession(7), undefined, "manual flow still logs errors locally");
  await assert.rejects(api.startGroupSession(7, true, Date.now() - 1), /MCP 创建会话请求已超时/);
  failGroup = false;
  assert.equal(await api.startGroupSession(7, true), "new-conversation");
});
console.log(`MCP session creation: ${checks} checks passed`);
