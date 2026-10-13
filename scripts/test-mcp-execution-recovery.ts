// Run: node --import tsx scripts/test-mcp-execution-recovery.ts
// Exercise actual panel functions and atomic storage methods; only browser/IDB boundaries are mocked.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transform } from "esbuild";
import * as ts from "typescript";
import { assembleMcpTurnResult } from "../src/services/chat/mcpResult.ts";
import { cloneTurnActivityTrace, finishTurnActivityTrace } from "../src/services/chat/activityTrace.ts";
import { decideMcpExecutionRecovery, getMcpExecutionContextState } from "../src/services/chat/mcpExecutionIdentity.ts";

const panelText = readFileSync("src/components/chat/ChatPanel.vue", "utf8");
const scriptStart = panelText.indexOf('<script setup lang="ts">');
const scriptEnd = panelText.indexOf("</script>", scriptStart);
assert.ok(scriptStart >= 0 && scriptEnd > scriptStart, "actual panel script must exist");
const panelAst = ts.createSourceFile("ChatPanel.ts", panelText.slice(scriptStart + '<script setup lang="ts">'.length, scriptEnd), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function panelFunction(name: string): string {
  const node = panelAst.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(node, `actual panel function ${name} must exist`);
  return node.getText(panelAst);
}
function panelVariable(name: string): string {
  const node = panelAst.statements.find((node): node is ts.VariableStatement => ts.isVariableStatement(node) &&
    node.declarationList.declarations.some((decl) => ts.isIdentifier(decl.name) && decl.name.text === name));
  assert.ok(node, `actual panel variable ${name} must exist`);
  return node.getText(panelAst);
}
const panelCode = (await transform([
  panelVariable("recoveringMcpConversations"), panelVariable("MCP_INTERRUPTED_NOTICE"),
  panelFunction("queueInterruptedMcpTurnResult"), panelFunction("recoverInterruptedMcpTurn"),
  "this.recover = recoverInterruptedMcpTurn; this.queueResult = queueInterruptedMcpTurnResult; this.recovering = recoveringMcpConversations;",
].join("\n"), { loader: "ts", target: "es2022" })).code;
const displayCode = (await transform([
  panelFunction("isMcpTurnExecutionUnverified"), panelFunction("isMcpItemExecutionUnverified"), panelFunction("mcpItemActivityTrace"),
  "this.turnUnverified = isMcpTurnExecutionUnverified; this.itemUnverified = isMcpItemExecutionUnverified; this.itemTrace = mcpItemActivityTrace;",
].join("\n"), { loader: "ts", target: "es2022" })).code;

const storageAst = ts.createSourceFile("chatStorage.ts", readFileSync("src/services/chat/chatStorage.ts", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const storageClass = storageAst.statements.find((node): node is ts.ClassDeclaration => ts.isClassDeclaration(node) && node.name?.text === "ChatStorageService");
assert.ok(storageClass, "actual storage class must exist");
const storageMethods = ["markMcpTurnInterrupted", "clearMcpTurnInterruptionResult"].map((name) => {
  const method = storageClass.members.find((node): node is ts.MethodDeclaration => ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name);
  assert.ok(method, `actual atomic storage method ${name} must exist`);
  return method.getText(storageAst);
});
const storageCode = (await transform(`class ActualStorage { ${storageMethods.join("\n")} } this.ActualStorage = ActualStorage;`, { loader: "ts", target: "es2022" })).code;

const cid = "conversation-1", rid = "request-1", ownerId = "owner-context-1", hostTab = 17;
const copy = <T>(value: T): T => structuredClone(value);
const runningUser = (patch: any = {}) => ({
  id: "user-1", conversationId: cid, role: "user", content: "public request", timestamp: 1,
  toolInput: { callerAgent: "fixture", mcpTurn: { status: "running", requestId: rid, executionContextId: ownerId, requestConversationId: cid } },
  ...patch,
});
function turn(row: any): any { return row.toolInput.mcpTurn; }
const publicOutput = () => ({ id: "answer-1", conversationId: cid, role: "assistant", content: "已保存的正文 https://example.com/source", timestamp: 2 });

function makeStorage(initialRows: any[]) {
  const rows = new Map<string, any>(initialRows.map((row) => [row.id, copy(row)]));
  const fixture: any = { rows, writes: 0, transactions: 0, beforeRead: undefined, failTransaction: false };
  const db = { transaction(name: string, mode: string) {
    assert.equal(name, "messages"); assert.equal(mode, "readwrite"); fixture.transactions++;
    const tx: any = { error: null };
    const staged = new Map<string, any>();
    const store = {
      get(id: string) {
        const request: any = {};
        queueMicrotask(() => {
          try {
            fixture.beforeRead?.();
            request.result = rows.has(id) ? copy(rows.get(id)) : undefined;
            request.onsuccess?.();
            if (fixture.failTransaction) throw new Error("fixture transaction aborted");
            for (const [id, row] of staged) { rows.set(id, row); fixture.writes++; }
            tx.oncomplete?.();
          } catch (error) { tx.error = error; tx.onabort?.(); }
        });
        return request;
      },
      put(row: any) { staged.set(row.id, copy(row)); return {}; },
    };
    tx.objectStore = (storeName: string) => { assert.equal(storeName, "messages"); return store; };
    return tx;
  } };
  const state: any = { STORE_MESSAGES: "messages" };
  runInNewContext(storageCode, state);
  const storage = new state.ActualStorage();
  storage.ensureDb = async () => db;
  storage.getMessagesByConversation = async (convId: string) => [...rows.values()].filter((row) => row.conversationId === convId).sort((a, b) => a.timestamp - b.timestamp).map(copy);
  storage.getMessage = async (id: string) => rows.has(id) ? copy(rows.get(id)) : undefined;
  storage.updateMessage = async (id: string, patch: any) => { if (!rows.has(id)) return false; rows.set(id, { ...rows.get(id), ...copy(patch) }); return true; };
  return { ...fixture, fixture, storage, rows };
}

function makePanel(initialRows = [runningUser()]) {
  const db = makeStorage(initialRows);
  const fixture: any = { loading: false, ownerContexts: [], ownerQueryError: undefined, beforeOwnerReply: undefined,
    ownerQueries: 0, reports: [], outbox: new Set<string>(), warnings: [], clearCalls: [], context: { conversationId: cid, mode: "single", tabId: hostTab },
    ack: () => Promise.resolve(true) };
  const runtime = { async getContexts(filter: any) {
    fixture.ownerQueries++; assert.deepEqual(filter, { contextIds: [ownerId] });
    await fixture.beforeOwnerReply?.();
    if (fixture.ownerQueryError) throw fixture.ownerQueryError;
    return fixture.ownerContexts;
  } };
  const state: any = {
    panelHostTabId: hostTab, conversationId: { value: cid }, chatStorage: db.storage,
    abortControllersByConversation: new Map(),
    getConversationContext: (convId: string) => convId === fixture.context?.conversationId ? fixture.context : undefined,
    getContext: () => ({ browser: { runtime } }),
    isConversationLoading: () => fixture.loading,
    hasPendingMcpTerminalResult: (requestId: string, convId: string) => fixture.outbox.has(`${requestId}:${convId}`),
    reportMcpExternalResult: (payload: any) => { fixture.reports.push(copy(payload)); return fixture.ack(); },
    clearDoingToolCallsInIdb: async (ids: string[]) => { fixture.clearCalls.push([...ids]); },
    getMcpExecutionContextState, decideMcpExecutionRecovery, assembleMcpTurnResult,
    cloneTurnActivityTrace, finishTurnActivityTrace,
    console: { warn: (...args: any[]) => fixture.warnings.push(args) },
  };
  runInNewContext(panelCode, state);
  return { state, fixture, db, recover: () => state.recover(cid), queue: (user: any, output: any[]) => state.queueResult(user, output) };
}

function makeDisplay(initialRows = [runningUser()]) {
  const fixture = { loading: false };
  const state: any = {
    messages: { value: copy(initialRows) }, conversationId: { value: cid },
    mcpDisplayTurns: { value: { owners: new Map([["answer-1", "user-1"]]) } },
    abortControllersByConversation: new Map(), isConversationLoading: () => fixture.loading,
    cloneTurnActivityTrace, finishTurnActivityTrace,
  };
  runInNewContext(displayCode, state);
  return { state, fixture };
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("recovery incorrectly waited for bridge ACK")), 1000); })]); }
  finally { if (timeout) clearTimeout(timeout); }
}
let checks = 0;
async function check(name: string, run: () => void | Promise<void>) { await run(); checks++; console.log(`PASS ${name}`); }

await check("browser-proven missing owner marks error durably and queues the precise public result", async () => {
  const panel = makePanel([runningUser(), publicOutput()]);
  panel.fixture.ack = () => new Promise(() => {});
  await bounded(panel.recover());
  const row = panel.db.rows.get("user-1");
  assert.equal(turn(row).status, "error"); assert.equal(turn(row).interruptionResultPending, true);
  assert.equal(panel.fixture.reports.length, 1);
  const result = panel.fixture.reports[0];
  assert.equal(result.conversationId, cid); assert.equal(result.requestId, rid); assert.equal(result.status, "error"); assert.equal(result.ok, false);
  assert.match(result.text, /上一轮执行中断/); assert.match(result.text, /已保存的正文/);
  assert.deepEqual(result.sources, ["https://example.com/source"]);
  assert.equal(panel.state.recovering.size, 0);
});

await check("present or unknown owner never terminates a running task", async () => {
  for (const mode of ["present", "api-error", "malformed"]) {
    const panel = makePanel();
    if (mode === "present") panel.fixture.ownerContexts = [{ contextId: ownerId, contextType: "SIDE_PANEL" }];
    if (mode === "api-error") panel.fixture.ownerQueryError = new Error("unsupported API");
    if (mode === "malformed") panel.fixture.ownerContexts = null;
    await panel.recover(); assert.equal(turn(panel.db.rows.get("user-1")).status, "running");
    assert.equal(panel.db.fixture.writes, 0); assert.equal(panel.fixture.reports.length, 0);
  }
});

await check("controller, loading, terminal outbox and mismatched panel ownership preserve the task", async () => {
  for (const blocker of ["controller", "loading", "outbox", "wrong-tab", "unknown-context"]) {
    const panel = makePanel();
    if (blocker === "controller") panel.state.abortControllersByConversation.set(cid, new AbortController());
    if (blocker === "loading") panel.fixture.loading = true;
    if (blocker === "outbox") panel.fixture.outbox.add(`${rid}:${cid}`);
    if (blocker === "wrong-tab") panel.state.panelHostTabId = hostTab + 1;
    if (blocker === "unknown-context") panel.fixture.context = undefined;
    await panel.recover(); assert.equal(panel.fixture.ownerQueries, 0);
    assert.equal(panel.db.fixture.writes, 0); assert.equal(panel.fixture.reports.length, 0);
  }
});

await check("legacy identities, migrated conversation rows and latest ordinary users are not repaired", async () => {
  for (const patch of [{ requestId: undefined }, { executionContextId: undefined }, { requestConversationId: undefined }, { requestConversationId: "old-conversation" }]) {
    const user = runningUser(); Object.assign(turn(user), patch);
    const panel = makePanel([user]); await panel.recover();
    assert.equal(panel.fixture.ownerQueries, 0); assert.equal(panel.fixture.reports.length, 0); assert.equal(panel.db.fixture.writes, 0);
  }
  const migrated = runningUser({ conversationId: "migrated" });
  const migratedPanel = makePanel([migrated]);
  migratedPanel.fixture.context = { conversationId: "migrated", mode: "single", tabId: hostTab };
  await migratedPanel.state.recover("migrated");
  assert.equal(migratedPanel.fixture.reports.length, 0); assert.equal(migratedPanel.db.fixture.writes, 0);
  assert.equal(migratedPanel.fixture.ownerQueries, 0);
  const newer = { ...runningUser({ id: "user-2", timestamp: 3 }), toolInput: undefined };
  const panel = makePanel([runningUser(), publicOutput(), newer]); await panel.recover();
  assert.equal(turn(panel.db.rows.get("user-1")).status, "running"); assert.equal(panel.fixture.ownerQueries, 0);
  const abandoned = runningUser(); Object.assign(turn(abandoned), { status: "error", interruptionResultPending: true });
  const newerPanel = makePanel([abandoned, publicOutput(), newer]); await newerPanel.recover();
  assert.equal(newerPanel.fixture.reports.length, 0); assert.equal(turn(newerPanel.db.rows.get("user-1")).interruptionResultPending, true);
});

await check("new user, terminal result, controller and outbox arriving during the browser query win", async () => {
  for (const arrival of ["new-user", "new-request", "terminal", "controller", "loading", "outbox", "migration"]) {
    const panel = makePanel();
    panel.fixture.beforeOwnerReply = () => {
      if (arrival === "new-user") panel.db.rows.set("new-user", runningUser({ id: "new-user", timestamp: 4 }));
      if (arrival === "new-request") turn(panel.db.rows.get("user-1")).requestId = "new-request";
      if (arrival === "terminal") turn(panel.db.rows.get("user-1")).status = "done";
      if (arrival === "controller") panel.state.abortControllersByConversation.set(cid, new AbortController());
      if (arrival === "loading") panel.fixture.loading = true;
      if (arrival === "outbox") panel.fixture.outbox.add(`${rid}:${cid}`);
      if (arrival === "migration") panel.db.rows.get("user-1").conversationId = "migrated";
    };
    await panel.recover(); assert.equal(panel.fixture.reports.length, 0); assert.equal(panel.db.fixture.writes, 0);
    assert.notEqual(turn(panel.db.rows.get("user-1")).status, "error");
  }
});

await check("parallel recovery calls share one running check without duplicate interruption results", async () => {
  const panel = makePanel(); let release!: () => void;
  panel.fixture.beforeOwnerReply = () => new Promise<void>((done) => { release = done; });
  const first = panel.recover(); await settle();
  await panel.recover(); assert.equal(panel.fixture.ownerQueries, 1);
  release(); await first; await settle(); assert.equal(panel.fixture.reports.length, 1);
});

await check("partial result assembly excludes process reasoning, tool payloads and user text", async () => {
  const panel = makePanel(); panel.fixture.ack = () => new Promise(() => {});
  const hidden = [
    { id: "private-process", role: "assistant", isProcess: true, content: "private reasoning secret", customUi: { type: "THINKING", payload: { text: "hidden thinking" } } },
    { id: "private-tool", role: "assistant", isProcess: true, content: "tool-private base64", toolCalls: [{ result: "tool result secret" }] },
    { id: "private-user", role: "user", content: "user message secret" },
    { id: "artifact", role: "assistant", content: "", customUi: { type: "FILE_CARD", payload: { fileName: "report.pdf", url: "https://example.com/report.pdf", dataBase64: "binary secret" } } },
  ];
  panel.queue(runningUser(), [publicOutput(), ...hidden]);
  assert.equal(panel.fixture.reports.length, 1);
  const result = panel.fixture.reports[0];
  assert.match(result.text, /已保存的正文/); assert.doesNotMatch(JSON.stringify(result), /private reasoning|hidden thinking|base64|tool result secret|user message secret|binary secret/);
  assert.deepEqual(result.artifacts, [{ type: "FILE_CARD", title: "report.pdf", url: "https://example.com/report.pdf" }]);
});

await check("trace persistence failure still queues the terminal result and retains durable pending receipt", async () => {
  const output = { ...publicOutput(), activityTrace: { id: "trace", status: "running", phase: "thinking", startedAt: 1, expanded: false, items: [] } };
  const panel = makePanel([runningUser(), output]); panel.fixture.ack = () => new Promise(() => {});
  panel.db.storage.updateMessage = async () => { throw new Error("fixture trace write failed"); };
  await bounded(panel.recover()); assert.equal(panel.fixture.reports.length, 1);
  assert.equal(turn(panel.db.rows.get("user-1")).interruptionResultPending, true);
  assert.equal(panel.state.recovering.size, 0); assert.equal(panel.fixture.warnings.length, 1);
});

await check("ACK success clears only the durable interruption receipt; false or rejected ACK preserves it", async () => {
  for (const ack of ["success", "not-acknowledged", "rejected"]) {
    const panel = makePanel();
    panel.fixture.ack = () => ack === "rejected" ? Promise.reject(new Error("bridge unavailable")) : Promise.resolve(ack === "success");
    await panel.recover(); await settle();
    assert.equal(turn(panel.db.rows.get("user-1")).interruptionResultPending, ack !== "success");
    assert.equal(turn(panel.db.rows.get("user-1")).status, "error");
  }
});

await check("destroyed renderer between atomic mark and outbox queue is repaired on the next load", async () => {
  const abandoned = makeStorage([runningUser(), publicOutput()]);
  assert.equal(await abandoned.storage.markMcpTurnInterrupted("user-1", rid, ownerId, "saved interruption"), true);
  const reloaded = makePanel([...abandoned.rows.values()]);
  reloaded.fixture.ownerQueryError = new Error("owner API now unavailable");
  reloaded.fixture.ack = () => new Promise(() => {});
  await bounded(reloaded.recover());
  assert.equal(reloaded.fixture.ownerQueries, 0); assert.equal(reloaded.fixture.reports.length, 1);
  assert.match(reloaded.fixture.reports[0].text, /已保存的正文/);
  assert.equal(turn(reloaded.db.rows.get("user-1")).interruptionResultPending, true);
  reloaded.fixture.outbox.add(`${rid}:${cid}`); await reloaded.recover();
  assert.equal(reloaded.fixture.reports.length, 1);
});

await check("atomic mark preserves terminal, wrong request/context/conversation and assistant rows", async () => {
  for (const failure of ["terminal", "wrong-rid", "wrong-owner", "wrong-cid", "assistant", "missing"]) {
    const user = runningUser();
    if (failure === "terminal") turn(user).status = "done";
    if (failure === "wrong-rid") turn(user).requestId = "another-request";
    if (failure === "wrong-owner") turn(user).executionContextId = "another-owner";
    if (failure === "wrong-cid") user.conversationId = "migrated";
    if (failure === "assistant") user.role = "assistant";
    const db = makeStorage(failure === "missing" ? [] : [user]);
    const before = [...db.rows.entries()].map(copy);
    assert.equal(await db.storage.markMcpTurnInterrupted("user-1", rid, ownerId, "notice"), false);
    assert.equal(db.fixture.writes, 0); assert.deepEqual([...db.rows.entries()], before);
  }
});

await check("atomic mark reads the current terminal state within the same IDB transaction", async () => {
  const db = makeStorage([runningUser()]);
  db.fixture.beforeRead = () => { turn(db.rows.get("user-1")).status = "done"; };
  assert.equal(await db.storage.markMcpTurnInterrupted("user-1", rid, ownerId, "notice"), false);
  assert.equal(turn(db.rows.get("user-1")).status, "done"); assert.equal(db.fixture.writes, 0);
});

await check("atomic mark transaction failure does not leave a false error receipt", async () => {
  const db = makeStorage([runningUser()]); db.fixture.failTransaction = true;
  await assert.rejects(db.storage.markMcpTurnInterrupted("user-1", rid, ownerId, "notice"), /fixture transaction aborted/);
  assert.equal(turn(db.rows.get("user-1")).status, "running"); assert.equal(db.fixture.writes, 0);
});

await check("ACK receipt clearing is atomic and preserves changed identities, terminal states and migrated rows", async () => {
  for (const failure of ["none", "wrong-rid", "wrong-cid", "wrong-meta-cid", "assistant", "new-running", "already-clear"]) {
    const user = runningUser(); Object.assign(turn(user), { status: "error", interruptionResultPending: true });
    if (failure === "wrong-rid") turn(user).requestId = "new-request";
    if (failure === "wrong-cid") user.conversationId = "migrated";
    if (failure === "wrong-meta-cid") turn(user).requestConversationId = "other";
    if (failure === "assistant") user.role = "assistant";
    if (failure === "new-running") turn(user).status = "running";
    if (failure === "already-clear") turn(user).interruptionResultPending = false;
    const db = makeStorage([user]); const before = copy(user);
    await db.storage.clearMcpTurnInterruptionResult("user-1", rid, cid);
    if (failure === "none") {
      assert.equal(turn(db.rows.get("user-1")).interruptionResultPending, false); assert.equal(db.fixture.writes, 1);
    } else { assert.deepEqual(db.rows.get("user-1"), before); assert.equal(db.fixture.writes, 0); }
  }
});

await check("latest locally running MCP owner remains verified; missing execution is shown as unverified", () => {
  const display = makeDisplay(); const user = display.state.messages.value[0];
  assert.equal(display.state.turnUnverified(user), true); assert.equal(display.state.itemUnverified("answer-1"), true);
  display.fixture.loading = true;
  assert.equal(display.state.turnUnverified(user), false); assert.equal(display.state.itemUnverified("answer-1"), false);
  display.fixture.loading = false; display.state.abortControllersByConversation.set(cid, new AbortController());
  assert.equal(display.state.turnUnverified(user), false); assert.equal(display.state.itemUnverified("answer-1"), false);
});

await check("a new controller never verifies a historical running MCP owner", () => {
  const display = makeDisplay([runningUser(), publicOutput(), runningUser({ id: "user-2", timestamp: 3 })]);
  display.fixture.loading = true; display.state.abortControllersByConversation.set(cid, new AbortController());
  display.state.mcpDisplayTurns.value.owners.set("answer-2", "user-2");
  assert.equal(display.state.turnUnverified(display.state.messages.value[0]), true);
  assert.equal(display.state.itemUnverified("answer-1"), true);
  assert.equal(display.state.turnUnverified(display.state.messages.value[2]), false);
  assert.equal(display.state.itemUnverified("answer-2"), false);
});

await check("terminal and unmapped owners are not shown as unverified execution", () => {
  for (const status of ["done", "error", "needs_user_input"]) {
    const user = runningUser(); turn(user).status = status;
    const display = makeDisplay([user]);
    assert.equal(display.state.turnUnverified(display.state.messages.value[0]), false);
    assert.equal(display.state.itemUnverified("answer-1"), false);
    assert.equal(display.state.itemUnverified("unmapped-item"), false);
    assert.equal(display.state.turnUnverified(undefined), false);
  }
});

await check("an error owner renders a cloned error trace while preserving the stored running original", () => {
  const user = runningUser(); turn(user).status = "error";
  const display = makeDisplay([user]);
  const storedTrace = { id: "trace-1", status: "running", phase: "working", startedAt: 1, expanded: true,
    items: [{ id: "tool-1", kind: "tool", text: "public tool label", status: "running" },
      { id: "tool-2", kind: "tool", text: "finished tool", status: "completed" }] };
  const before = copy(storedTrace);
  const rendered = display.state.itemTrace("answer-1", storedTrace);
  assert.notEqual(rendered, storedTrace); assert.notEqual(rendered.items, storedTrace.items);
  assert.equal(rendered.status, "error"); assert.equal(rendered.items[0].status, "error");
  assert.equal(rendered.items[1].status, "completed"); assert.equal(rendered.expanded, false);
  assert.ok(Number.isFinite(rendered.finishedAt)); assert.deepEqual(storedTrace, before);
});

await check("normal activity traces retain their original identity and completed traces remain unchanged", () => {
  const trace = { id: "trace-1", status: "running", phase: "thinking", startedAt: 1, expanded: false, items: [] };
  for (const status of ["running", "done", "needs_user_input"]) {
    const user = runningUser(); turn(user).status = status;
    const display = makeDisplay([user]);
    assert.equal(display.state.itemTrace("answer-1", trace), trace);
  }
  const user = runningUser(); turn(user).status = "error";
  const display = makeDisplay([user]);
  assert.equal(display.state.itemTrace("unmapped-item", trace), trace);
  for (const status of ["completed", "stopped", "error"]) {
    const terminalTrace = { ...trace, status };
    assert.equal(display.state.itemTrace("answer-1", terminalTrace), terminalTrace);
  }
});

console.log(`MCP execution recovery: ${checks} checks passed`);
