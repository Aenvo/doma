// Run: node --import tsx scripts/test-mcp-execution-identity.ts
import assert from "node:assert/strict";
import {
  decideMcpExecutionRecovery,
  getMcpExecutionContextId,
  getMcpExecutionContextState,
  type McpRuntimeContexts,
} from "../src/services/chat/mcpExecutionIdentity.ts";

const documentUrl = "chrome-extension://fixture/sidepanel.html?window=1#chat";
const ownerContextId = "owner-context-1";
const owner = { contextId: ownerContextId, contextType: "SIDE_PANEL", documentUrl };
let checks = 0;
async function check(name: string, run: () => void | Promise<void>): Promise<void> {
  await run();
  checks++;
  console.log(`PASS ${name}`);
}
const runtimeReturning = (value: unknown): McpRuntimeContexts => ({ getContexts: async () => value });

await check("own identity uses the exact URL and side-panel filter with the runtime receiver", async () => {
  const runtime: McpRuntimeContexts = {
    async getContexts(filter) {
      assert.equal(this, runtime);
      assert.deepEqual(filter, { contextTypes: ["SIDE_PANEL"], documentUrls: [documentUrl] });
      return [owner];
    },
  };
  assert.equal(await getMcpExecutionContextId(runtime, documentUrl), ownerContextId);
});

await check("same document URL in multiple renderers cannot identify this renderer", async () => {
  assert.equal(await getMcpExecutionContextId(runtimeReturning([owner, { ...owner, contextId: "owner-2" }]), documentUrl), undefined);
  assert.equal(await getMcpExecutionContextId(runtimeReturning([owner, owner]), documentUrl), undefined);
  assert.equal(await getMcpExecutionContextId(runtimeReturning([]), documentUrl), undefined);
});

await check("malformed own-context responses and mismatched filters remain unidentified", async () => {
  for (const value of [null, {}, [null], [[]], [{ ...owner, contextType: "TAB" }],
    [{ ...owner, documentUrl: documentUrl.replace("#chat", "#other") }],
    [{ ...owner, contextId: "" }], [{ ...owner, contextId: " padded " }]]) {
    assert.equal(await getMcpExecutionContextId(runtimeReturning(value), documentUrl), undefined);
  }
});

await check("invalid document URLs never query the browser", async () => {
  let queries = 0;
  const runtime: McpRuntimeContexts = { async getContexts() { queries++; return [owner]; } };
  for (const url of [undefined, null, "", " sidepanel.html ", "sidepanel.html", 7]) {
    assert.equal(await getMcpExecutionContextId(runtime, url), undefined);
  }
  assert.equal(queries, 0);
});

await check("unsupported and rejected APIs cannot prove absence or establish identity", async () => {
  const failing: McpRuntimeContexts = { getContexts: async () => { throw new Error("unsupported"); } };
  for (const runtime of [undefined, null, {}, failing]) {
    assert.equal(await getMcpExecutionContextId(runtime, documentUrl), undefined);
    assert.equal(await getMcpExecutionContextState(runtime, ownerContextId), "unknown");
  }
});

await check("owner lookup uses only the precise browser context identity", async () => {
  const runtime: McpRuntimeContexts = {
    async getContexts(filter) {
      assert.equal(this, runtime);
      assert.deepEqual(filter, { contextIds: [ownerContextId] });
      return [owner];
    },
  };
  assert.equal(await getMcpExecutionContextState(runtime, ownerContextId), "present");
  assert.equal(await getMcpExecutionContextState(runtimeReturning([]), ownerContextId), "missing");
});

await check("malformed owner queries never convert ambiguous responses to missing", async () => {
  for (const value of [undefined, null, {}, [null], [[]], [owner, owner],
    [{ ...owner, contextId: "someone-else" }], [{ ...owner, contextType: "OFFSCREEN_DOCUMENT" }]]) {
    assert.equal(await getMcpExecutionContextState(runtimeReturning(value), ownerContextId), "unknown");
  }
  let queries = 0;
  const runtime: McpRuntimeContexts = { async getContexts() { queries++; return []; } };
  for (const id of [undefined, null, "", " ", " owner ", "owner\n", 7]) {
    assert.equal(await getMcpExecutionContextState(runtime, id), "unknown");
  }
  assert.equal(queries, 0);
});

const running = {
  status: "running", requestId: "request-1", ownerContextId,
  hasController: false, hasPendingTerminalResult: false, ownerContextState: "missing" as const,
};

await check("only precise running identity and successful missing proof allow interruption", () => {
  assert.equal(decideMcpExecutionRecovery(running), "interrupted");
  assert.equal(decideMcpExecutionRecovery({ ...running, ownerContextState: "unknown" }), "unknown");
});

await check("live or frozen browser owner remains preserved despite a lost bridge", async () => {
  // A frozen context is still enumerated; no socket or wall-clock input can override it.
  const state = await getMcpExecutionContextState(runtimeReturning([owner]), ownerContextId);
  assert.equal(decideMcpExecutionRecovery({ ...running, ownerContextState: state }), "preserve");
});

await check("current execution and queued terminal delivery take precedence over missing owner", () => {
  assert.equal(decideMcpExecutionRecovery({ ...running, hasController: true }), "preserve");
  assert.equal(decideMcpExecutionRecovery({ ...running, hasPendingTerminalResult: true }), "preserve");
  assert.equal(decideMcpExecutionRecovery({ ...running, requestId: undefined, ownerContextId: undefined, hasPendingTerminalResult: true }), "preserve");
});

await check("legacy identities and unknown absence of controllers or outbox remain unknown", () => {
  for (const requestId of [undefined, null, "", "request 1", 7]) {
    assert.equal(decideMcpExecutionRecovery({ ...running, requestId }), "unknown");
  }
  for (const ownerContextId of [undefined, null, "", "owner\n", 7]) {
    assert.equal(decideMcpExecutionRecovery({ ...running, ownerContextId }), "unknown");
  }
  assert.equal(decideMcpExecutionRecovery({ ...running, hasController: undefined }), "unknown");
  assert.equal(decideMcpExecutionRecovery({ ...running, hasPendingTerminalResult: undefined }), "unknown");
});

await check("already terminal turns are preserved and malformed statuses are not interrupted", () => {
  for (const status of ["done", "error", "needs_user_input"]) {
    assert.equal(decideMcpExecutionRecovery({ ...running, status }), "preserve");
  }
  for (const status of [undefined, null, "", "pending", "running ", true]) {
    assert.equal(decideMcpExecutionRecovery({ ...running, status }), "unknown");
  }
});

console.log(`MCP execution identity: ${checks} checks passed`);
