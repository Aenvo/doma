import assert from "node:assert/strict";

const saved = new Map<string, string>();
(globalThis as any).localStorage = {
  get length() { return saved.size; },
  key: (index: number) => [...saved.keys()][index] ?? null,
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => { saved.set(key, value); },
  removeItem: (key: string) => { saved.delete(key); },
};

class FakeWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;
  static sockets: FakeWebSocket[] = [];
  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: any[] = [];
  constructor(readonly url: string) {
    FakeWebSocket.sockets.push(this);
    queueMicrotask(() => { this.readyState = FakeWebSocket.OPEN; this.onopen?.(); });
  }
  send(raw: string) {
    const message = JSON.parse(raw);
    this.sent.push(message);
    if (message.type === "hello") queueMicrotask(() => this.receive({ type: "hello", role: "doma-bridge" }));
  }
  receive(message: Record<string, unknown>) { this.onmessage?.({ data: JSON.stringify(message) }); }
  acknowledgeForPanel(resultId: string, tabId: number): boolean {
    // Mirror the daemon's refusal to ACK a result received from another panel.
    if ([...this.sent].reverse().find((message) => message.type === "hello")?.tabId !== tabId) return false;
    this.receive({ type: "result_ack", resultId });
    return true;
  }
  close() { this.readyState = FakeWebSocket.CLOSED; this.onclose?.(); }
}
(globalThis as any).WebSocket = FakeWebSocket;

type BridgeClient = typeof import("../src/services/chat/mcpBridgeClient.ts");
const clients: BridgeClient[] = [];
let importId = 0;
async function loadPanel(): Promise<BridgeClient> {
  // Different module instances model independent extension frames sharing localStorage.
  const url = new URL("../src/services/chat/mcpBridgeClient.ts", import.meta.url);
  url.searchParams.set("panel", String(++importId));
  const client = await import(url.href) as BridgeClient;
  clients.push(client);
  return client;
}
const outboxPrefix = "doma:mcp:result-outbox:v2:";
const outboxIds = () => [...saved.keys()].filter((key) => key.startsWith(outboxPrefix))
  .map((key) => key.slice(outboxPrefix.length)).sort();
const outboxKey = (resultId: string) => `${outboxPrefix}${resultId}`;
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
const originalNow = Date.now;
try {
  const bridge = await loadPanel();
  bridge.startMcpBridgeClient(() => {}, [bridge.DOMA_MCP_BRIDGE_PORT]);
  await tick();
  const first = bridge.sendMcpBridgeResult({ conversationId: "conv", requestId: "turn-1", ok: true, text: "完成", status: "done" });
  await tick();
  assert.equal(bridge.getPendingMcpTerminalResultAck("turn-1", "conv"), first);
  assert.equal(bridge.getPendingMcpTerminalResultAck("turn-1", "other-conv"), undefined);
  assert.equal(bridge.getPendingMcpTerminalResultAck("other-turn", "conv"), undefined);
  assert.equal(bridge.hasPendingMcpTerminalResult("turn-1", "conv"), true);
  assert.equal(bridge.hasPendingMcpTerminalResult("turn-1", "other-conv"), false);
  assert.equal(bridge.hasPendingMcpTerminalResult("other-turn", "conv"), false);
  assert.equal(bridge.hasPendingMcpTerminalResult("", "conv"), false);
  assert.equal(bridge.hasPendingMcpTerminalResult("turn-1", "   "), false);
  const firstSocket = FakeWebSocket.sockets.at(-1)!;
  assert.equal(firstSocket.sent.filter((message) => message.type === "result").length, 1);
  let acknowledged = false;
  void first.then((value) => { acknowledged = value; });
  await tick();
  assert.equal(acknowledged, false);
  bridge.reconnectMcpBridgeClient();
  await tick();
  const secondSocket = FakeWebSocket.sockets.at(-1)!;
  assert.notEqual(secondSocket, firstSocket);
  assert.equal(secondSocket.sent.filter((message) => message.type === "result")[0].resultId, "turn-1");
  secondSocket.receive({ type: "result_ack", resultId: "turn-1" });
  assert.equal(await first, true);
  assert.deepEqual(outboxIds(), []);
  assert.equal(bridge.hasPendingMcpTerminalResult("turn-1", "conv"), false);
  assert.equal(bridge.getPendingMcpTerminalResultAck("turn-1", "conv"), undefined);

  bridge.startMcpBridgeClient(() => {}, [bridge.DOMA_MCP_BRIDGE_PORT, bridge.DOMA_CLI_BRIDGE_PORT]);
  await tick();
  secondSocket.receive({ type: "task", requestId: "turn-2", sendText: "test" });
  const cliSocket = FakeWebSocket.sockets.filter((socket) => socket.url.endsWith(":3857")).at(-1)!;
  cliSocket.receive({ type: "task", requestId: "cli-turn", sendText: "test" });
  await tick();
  assert.equal(await bridge.sendMcpBridgeResult({ requestId: "cli-turn", ok: true, text: "CLI done", status: "done" }), true);
  assert.equal(cliSocket.sent.filter((message) => message.type === "result").length, 1);
  const pending = bridge.sendMcpBridgeResult({ conversationId: "conv", requestId: "turn-2", ok: false, text: "失败", status: "error" });
  await tick();
  assert.equal(bridge.hasPendingMcpTerminalResult("turn-2", "conv"), true);
  bridge.stopMcpBridgeClient();
  assert.equal(await pending, false);
  assert.equal(bridge.hasPendingMcpTerminalResult("turn-2", "conv"), true);
  bridge.startMcpBridgeClient(() => {}, [bridge.DOMA_MCP_BRIDGE_PORT, bridge.DOMA_CLI_BRIDGE_PORT]);
  await tick();
  const restoredSocket = FakeWebSocket.sockets.filter((socket) => socket.url.endsWith(":3847")).at(-1)!;
  const restoredCliSocket = FakeWebSocket.sockets.filter((socket) => socket.url.endsWith(":3857")).at(-1)!;
  assert.equal(restoredSocket.sent.filter((message) => message.type === "result")[0].resultId, "turn-2");
  assert.equal(restoredCliSocket.sent.filter((message) => message.type === "result").length, 0);
  restoredSocket.receive({ type: "result_ack", resultId: "turn-2" });
  await tick();
  assert.deepEqual(outboxIds(), []);
  const unrouted = bridge.sendMcpBridgeResult({ requestId: "unknown-mcp-turn", ok: false, text: "失败", status: "error" });
  await tick();
  assert.equal(restoredSocket.sent.filter((message) => message.resultId === "unknown-mcp-turn").length, 1);
  assert.equal(restoredCliSocket.sent.filter((message) => message.resultId === "unknown-mcp-turn").length, 0);
  restoredSocket.receive({ type: "result_ack", resultId: "unknown-mcp-turn" });
  assert.equal(await unrouted, true);
  bridge.stopMcpBridgeClient();

  // Two live panels queue results independently. ACK of A must leave B durable.
  const panelA = await loadPanel();
  const panelB = await loadPanel();
  assert.notEqual(panelA, panelB);
  panelA.setMcpBridgePanelContext({ tabId: 11 });
  panelB.setMcpBridgePanelContext({ tabId: 22 });
  panelA.startMcpBridgeClient(() => {}, [panelA.DOMA_MCP_BRIDGE_PORT]);
  panelB.startMcpBridgeClient(() => {}, [panelB.DOMA_MCP_BRIDGE_PORT]);
  await tick();
  const socketA = FakeWebSocket.sockets.at(-2)!;
  const socketB = FakeWebSocket.sockets.at(-1)!;
  const resultA = panelA.sendMcpBridgeResult({ requestId: "panel-A", conversationId: "conv-A", ok: true, text: "A", status: "done" });
  const resultB = panelB.sendMcpBridgeResult({ requestId: "panel-B", conversationId: "conv-B", ok: true, text: "B", status: "done" });
  assert.deepEqual(outboxIds(), ["panel-A", "panel-B"]);
  const durableB = saved.get(outboxKey("panel-B"));
  assert.equal(socketB.acknowledgeForPanel("panel-A", 11), false);
  assert.deepEqual(outboxIds(), ["panel-A", "panel-B"]);
  assert.equal(socketA.acknowledgeForPanel("panel-A", 11), true);
  assert.equal(await resultA, true);
  assert.deepEqual(outboxIds(), ["panel-B"]);
  assert.equal(saved.get(outboxKey("panel-B")), durableB);

  // A changing page context must not re-key or discard its unacknowledged result.
  const resultA2 = panelA.sendMcpBridgeResult({ requestId: "panel-A-next", conversationId: "conv-A", ok: true, text: "A2", status: "done" });
  const durableA2 = saved.get(outboxKey("panel-A-next"));
  panelA.setMcpBridgePanelContext({ tabId: 33 });
  assert.deepEqual(outboxIds(), ["panel-A-next", "panel-B"]);
  assert.equal(saved.get(outboxKey("panel-A-next")), durableA2);
  panelA.reconnectMcpBridgeClient();
  await tick();
  const switchedA = FakeWebSocket.sockets.at(-1)!;
  assert.equal(switchedA.sent.some((message) => message.resultId === "panel-A-next"), true);
  assert.equal(switchedA.acknowledgeForPanel("panel-A-next", 11), false);
  assert.equal(saved.get(outboxKey("panel-A-next")), durableA2);
  panelA.setMcpBridgePanelContext({ tabId: 11 });
  assert.equal(switchedA.acknowledgeForPanel("panel-A-next", 11), true);
  assert.equal(await resultA2, true);
  assert.deepEqual(outboxIds(), ["panel-B"]);

  // Destroy both module instances, then load fresh frames as a full extension reload.
  panelA.stopMcpBridgeClient();
  panelB.stopMcpBridgeClient();
  assert.equal(await resultB, false);
  const restoredA = await loadPanel();
  const restoredB = await loadPanel();
  restoredA.setMcpBridgePanelContext({ tabId: 11 });
  restoredB.setMcpBridgePanelContext({ tabId: 22 });
  restoredA.startMcpBridgeClient(() => {}, [restoredA.DOMA_MCP_BRIDGE_PORT]);
  restoredB.startMcpBridgeClient(() => {}, [restoredB.DOMA_MCP_BRIDGE_PORT]);
  await tick();
  const reloadSocketA = FakeWebSocket.sockets.at(-2)!;
  const reloadSocketB = FakeWebSocket.sockets.at(-1)!;
  assert.equal(reloadSocketB.sent.find((message) => message.resultId === "panel-B")?.text, "B");
  assert.equal(reloadSocketA.acknowledgeForPanel("panel-B", 22), false);
  assert.equal(saved.get(outboxKey("panel-B")), durableB);
  const restoredResult = restoredB.sendMcpBridgeResult({ requestId: "panel-B", conversationId: "conv-B", ok: true, text: "unused duplicate", status: "done" });
  let restoredAcknowledged = false;
  void restoredResult.then((value) => { restoredAcknowledged = value; });
  await tick();
  assert.equal(restoredAcknowledged, false);
  assert.equal(reloadSocketB.acknowledgeForPanel("panel-B", 22), true);
  assert.equal(await restoredResult, true);
  assert.deepEqual(outboxIds(), []);
  restoredA.stopMcpBridgeClient();
  restoredB.stopMcpBridgeClient();

  // Legacy migration preserves a newer v2 record with the same result ID.
  const createdAt = originalNow();
  const legacyMessage = { type: "result", requestId: "legacy", resultId: "legacy", conversationId: "legacy-conv", ok: true, status: "done", text: "legacy" };
  const newerMessage = { ...legacyMessage, text: "newer" };
  saved.set("doma:mcp:result-outbox:v1", JSON.stringify([
    { message: legacyMessage, createdAt: createdAt - 1000, port: 3847 },
    { message: { ...legacyMessage, resultId: "old-only", requestId: "old-only" }, createdAt, port: 3847 },
  ]));
  const newerRecord = JSON.stringify({ message: newerMessage, createdAt, port: 3847 });
  saved.set(outboxKey("legacy"), newerRecord);
  const migrated = await loadPanel();
  migrated.startMcpBridgeClient(() => {}, [migrated.DOMA_MCP_BRIDGE_PORT]);
  await tick();
  const migratedSocket = FakeWebSocket.sockets.at(-1)!;
  assert.equal(saved.has("doma:mcp:result-outbox:v1"), false);
  assert.equal(saved.get(outboxKey("legacy")), newerRecord);
  assert.equal(migratedSocket.sent.find((message) => message.resultId === "legacy")?.text, "newer");
  assert.equal(migratedSocket.sent.some((message) => message.resultId === "old-only"), true);
  migratedSocket.receive({ type: "result_ack", resultId: "old-only" });
  assert.deepEqual(outboxIds(), ["legacy"]);
  migratedSocket.receive({ type: "result_ack", resultId: "legacy" });
  assert.deepEqual(outboxIds(), []);
  migrated.stopMcpBridgeClient();

  // A broken legacy snapshot cannot prevent a valid individual record from restoring.
  saved.set("doma:mcp:result-outbox:v1", "broken JSON");
  saved.set(outboxKey("legacy"), newerRecord);
  const withBrokenLegacy = await loadPanel();
  const originalWarn = console.warn;
  try {
    console.warn = () => {};
    withBrokenLegacy.startMcpBridgeClient(() => {}, [withBrokenLegacy.DOMA_MCP_BRIDGE_PORT]);
  } finally {
    console.warn = originalWarn;
  }
  await tick();
  const validSocket = FakeWebSocket.sockets.at(-1)!;
  assert.equal(validSocket.sent.find((message) => message.resultId === "legacy")?.text, "newer");
  validSocket.receive({ type: "result_ack", resultId: "legacy" });
  assert.deepEqual(outboxIds(), []);
  assert.equal(saved.get("doma:mcp:result-outbox:v1"), "broken JSON");
  saved.delete("doma:mcp:result-outbox:v1");
  withBrokenLegacy.stopMcpBridgeClient();

  // Expiry removes only the old record; a newer result remains recoverable.
  Date.now = () => createdAt;
  const expiring = await loadPanel();
  const fresh = await loadPanel();
  expiring.startMcpBridgeClient(() => {}, [expiring.DOMA_MCP_BRIDGE_PORT]);
  fresh.startMcpBridgeClient(() => {}, [fresh.DOMA_MCP_BRIDGE_PORT]);
  await tick();
  const expiredResult = expiring.sendMcpBridgeResult({ requestId: "expires", ok: true, text: "old", status: "done" });
  Date.now = () => createdAt + 29 * 60 * 1000;
  const freshResult = fresh.sendMcpBridgeResult({ requestId: "fresh", ok: true, text: "fresh", status: "done" });
  const durableFresh = saved.get(outboxKey("fresh"));
  Date.now = () => createdAt + 31 * 60 * 1000;
  expiring.reconnectMcpBridgeClient();
  await tick();
  assert.equal(await expiredResult, false);
  assert.deepEqual(outboxIds(), ["fresh"]);
  assert.equal(saved.get(outboxKey("fresh")), durableFresh);
  expiring.stopMcpBridgeClient();
  fresh.stopMcpBridgeClient();
  assert.equal(await freshResult, false);
  const afterExpiryReload = await loadPanel();
  afterExpiryReload.startMcpBridgeClient(() => {}, [afterExpiryReload.DOMA_MCP_BRIDGE_PORT]);
  await tick();
  const afterExpirySocket = FakeWebSocket.sockets.at(-1)!;
  assert.equal(afterExpirySocket.sent.some((message) => message.resultId === "fresh"), true);
  afterExpirySocket.receive({ type: "result_ack", resultId: "fresh" });
  assert.deepEqual(outboxIds(), []);

  // A reconnect advertises only the selected conversation owned by this host tab.
  const owner = await loadPanel();
  owner.setMcpBridgePanelContext({ tabId: 71, title: "page", url: "https://example.com/" });
  owner.setMcpBridgeActiveConversation("owned", { conversationId: "owned", mode: "single", tabId: 71 });
  owner.startMcpBridgeClient(() => {}, [owner.DOMA_MCP_BRIDGE_PORT]);
  await tick();
  let ownerSocket = FakeWebSocket.sockets.at(-1)!;
  const lastHello = () => ownerSocket.sent.filter((message) => message.type === "hello").at(-1)!;
  assert.equal(lastHello().activeConversationId, "owned");
  owner.setMcpBridgePanelContext({ tabId: 71, title: "updated", url: "https://example.com/new" });
  assert.equal(lastHello().activeConversationId, "owned");
  owner.reconnectMcpBridgeClient();
  await tick();
  ownerSocket = FakeWebSocket.sockets.at(-1)!;
  assert.equal(lastHello().activeConversationId, "owned");
  assert.equal(lastHello().title, "updated");

  owner.setMcpBridgeActiveConversation("other", { conversationId: "other", mode: "single", tabId: 72 });
  assert.equal(lastHello().activeConversationId, undefined);
  owner.setMcpBridgeActiveConversation("group", { conversationId: "group", mode: "group", groupId: 3, groupTabs: [71, 72] });
  assert.equal(lastHello().activeConversationId, "group");
  const removedTab = { conversationId: "group", mode: "group" as const, groupId: 3, groupTabs: [72], groupWorkingTabId: 71 };
  owner.setMcpBridgeActiveConversation("group", removedTab);
  assert.equal(lastHello().activeConversationId, undefined);
  owner.setMcpBridgeActiveConversation("group", { conversationId: "group", mode: "group", groupId: -1, groupTabs: [71] });
  assert.equal(lastHello().activeConversationId, undefined);
  owner.setMcpBridgeActiveConversation("group", { conversationId: "group", mode: "group", groupId: 1.5, groupTabs: [71] });
  assert.equal(lastHello().activeConversationId, undefined);
  owner.setMcpBridgeActiveConversation("stale", { conversationId: "owned", mode: "single", tabId: 71 });
  assert.equal(lastHello().activeConversationId, undefined);
  owner.setMcpBridgeActiveConversation("owned", { conversationId: "owned", mode: "single", tabId: 71 });
  owner.setMcpBridgeActiveConversation(undefined);
  assert.equal(lastHello().activeConversationId, undefined);
  owner.setMcpBridgeActiveConversation("owned", { conversationId: "owned", mode: "single", tabId: 71 });
  owner.setMcpBridgePanelContext({ tabId: 72 });
  assert.equal(lastHello().activeConversationId, undefined);
  owner.setMcpBridgeActiveConversation("owned", { conversationId: "owned", mode: "single", tabId: 71 });
  assert.equal(lastHello().activeConversationId, undefined);

  const unrelated = await loadPanel();
  unrelated.setMcpBridgePanelContext({ tabId: 73 });
  unrelated.startMcpBridgeClient(() => {}, [unrelated.DOMA_MCP_BRIDGE_PORT]);
  await tick();
  assert.equal(FakeWebSocket.sockets.at(-1)!.sent.find((message) => message.type === "hello").activeConversationId, undefined);
  unrelated.setMcpBridgePanelContext({});
  unrelated.setMcpBridgeActiveConversation("legacy", { conversationId: "legacy", mode: "single", tabId: 73 });
  assert.equal(FakeWebSocket.sockets.at(-1)!.sent.filter((message) => message.type === "hello").at(-1)!.activeConversationId, undefined);

  // A fresh renderer can probe durable terminal records without restoring or sending.
  const probe = await loadPanel();
  const probeCreatedAt = Date.now();
  const probeRecord = (requestId: string | undefined, conversationId: string, resultId: string, status = "done") => ({
    message: { type: "result", requestId, conversationId, resultId, status, ok: status === "done", text: "terminal" },
    createdAt: probeCreatedAt, port: 3847,
  });
  saved.set(outboxKey("independent-result-id"), JSON.stringify(probeRecord("probe-request", "probe-conv", "independent-result-id", "needs_user_input")));
  const beforeProbe = [...saved.entries()];
  const socketsBeforeProbe = FakeWebSocket.sockets.length;
  const sentBeforeProbe = FakeWebSocket.sockets.reduce((total, socket) => total + socket.sent.length, 0);
  assert.equal(probe.hasPendingMcpTerminalResult("probe-request", "probe-conv"), true);
  assert.equal(probe.hasPendingMcpTerminalResult("probe-request", "other-conv"), false);
  assert.equal(probe.hasPendingMcpTerminalResult("other-request", "probe-conv"), false);
  assert.deepEqual([...saved.entries()], beforeProbe);
  assert.equal(FakeWebSocket.sockets.length, socketsBeforeProbe);
  assert.equal(FakeWebSocket.sockets.reduce((total, socket) => total + socket.sent.length, 0), sentBeforeProbe);
  saved.delete(outboxKey("independent-result-id"));

  // Legacy data is inspected in place. A missing request ID cannot match by result ID.
  const legacyProbe = JSON.stringify([
    probeRecord(undefined, "probe-conv", "probe-request"),
    probeRecord("legacy-probe-request", "legacy-probe-conv", "legacy-probe-result", "error"),
  ]);
  saved.set("doma:mcp:result-outbox:v1", legacyProbe);
  assert.equal(probe.hasPendingMcpTerminalResult("probe-request", "probe-conv"), false);
  assert.equal(probe.hasPendingMcpTerminalResult("legacy-probe-request", "legacy-probe-conv"), true);
  assert.equal(probe.hasPendingMcpTerminalResult("legacy-probe-request", "probe-conv"), false);
  assert.equal(saved.get("doma:mcp:result-outbox:v1"), legacyProbe);
  assert.deepEqual(outboxIds(), []);
  saved.delete("doma:mcp:result-outbox:v1");

  // Invalid or expired readable records never prove an exact pending terminal.
  const wrongKeyRecord = JSON.stringify(probeRecord("probe-request", "probe-conv", "different-id"));
  saved.set(outboxKey("wrong-key"), wrongKeyRecord);
  assert.equal(probe.hasPendingMcpTerminalResult("probe-request", "probe-conv"), false);
  saved.delete(outboxKey("wrong-key"));
  saved.set(outboxKey("running-result"), JSON.stringify(probeRecord("probe-request", "probe-conv", "running-result", "running")));
  assert.equal(probe.hasPendingMcpTerminalResult("probe-request", "probe-conv"), false);
  saved.delete(outboxKey("running-result"));
  const expiredProbe = JSON.stringify({ ...probeRecord("probe-request", "probe-conv", "expired-probe"), createdAt: probeCreatedAt - 31 * 60 * 1000 });
  saved.set(outboxKey("expired-probe"), expiredProbe);
  assert.equal(probe.hasPendingMcpTerminalResult("probe-request", "probe-conv"), false);
  assert.equal(saved.get(outboxKey("expired-probe")), expiredProbe);
  saved.delete(outboxKey("expired-probe"));

  // Unreadable storage blocks recovery conservatively, without deleting evidence.
  saved.set(outboxKey("unreadable"), "broken JSON");
  assert.equal(probe.hasPendingMcpTerminalResult("probe-request", "probe-conv"), true);
  assert.equal(saved.get(outboxKey("unreadable")), "broken JSON");
  saved.delete(outboxKey("unreadable"));
  const originalGetItem = localStorage.getItem;
  try {
    localStorage.getItem = () => { throw new Error("storage unavailable"); };
    assert.equal(probe.hasPendingMcpTerminalResult("probe-request", "probe-conv"), true);
  } finally {
    localStorage.getItem = originalGetItem;
  }
  assert.equal(probe.hasPendingMcpTerminalResult("probe-request", "probe-conv"), false);

  // Receipt recovery can subscribe to a durable result before client startup,
  // then keep the exact same ACK promise after startup restores its outbox.
  for (const status of ["done", "error", "needs_user_input"]) {
    const requestId = `ack-${status}`, conversationId = "ack-conversation", resultId = `result-${status}`;
    const message = { type: "result", resultId, requestId, conversationId, status, ok: status !== "error", text: `saved ${status}` };
    const record = JSON.stringify({ message, createdAt: Date.now(), port: 3847 });
    saved.set(outboxKey(resultId), record);
    const subscribing = await loadPanel();
    const beforeSockets = FakeWebSocket.sockets.length;
    assert.equal(subscribing.getPendingMcpTerminalResultAck(requestId, "other"), undefined);
    assert.equal(subscribing.getPendingMcpTerminalResultAck("other", conversationId), undefined);
    assert.equal(subscribing.getPendingMcpTerminalResultAck("", conversationId), undefined);
    assert.equal(subscribing.getPendingMcpTerminalResultAck(requestId, "  "), undefined);
    const ack = subscribing.getPendingMcpTerminalResultAck(requestId, conversationId);
    assert.ok(ack, "durable receipt must expose its ACK promise before socket startup");
    assert.equal(FakeWebSocket.sockets.length, beforeSockets);
    assert.equal(saved.get(outboxKey(resultId)), record);
    subscribing.startMcpBridgeClient(() => {}, [subscribing.DOMA_MCP_BRIDGE_PORT]);
    await tick();
    assert.equal(subscribing.getPendingMcpTerminalResultAck(requestId, conversationId), ack);
    const ackSocket = FakeWebSocket.sockets.at(-1)!;
    assert.equal(ackSocket.sent.find((item) => item.resultId === resultId)?.text, message.text);
    let completed = false;
    void ack.then((value) => { completed = value; });
    await tick();
    assert.equal(completed, false);
    ackSocket.receive({ type: "result_ack", resultId: "wrong-result" });
    await tick();
    assert.equal(completed, false);
    assert.equal(saved.get(outboxKey(resultId)), record);
    ackSocket.receive({ type: "result_ack", resultId });
    assert.equal(await ack, true);
    assert.equal(saved.has(outboxKey(resultId)), false);
    assert.equal(subscribing.getPendingMcpTerminalResultAck(requestId, conversationId), undefined);
    subscribing.stopMcpBridgeClient();
  }

  // Unknown, malformed and non-terminal records never expose a terminal ACK.
  const unknownAck = await loadPanel();
  assert.equal(unknownAck.getPendingMcpTerminalResultAck("absent", "absent"), undefined);
  saved.set(outboxKey("broken-ack"), "broken JSON");
  assert.equal(unknownAck.getPendingMcpTerminalResultAck("broken-ack", "ack-conversation"), undefined);
  assert.equal(saved.get(outboxKey("broken-ack")), "broken JSON");
  saved.delete(outboxKey("broken-ack"));
  for (const patch of [{ status: "running" }, { text: null }, { ok: undefined }]) {
    const invalidMessage = { type: "result", resultId: "invalid-ack", requestId: "invalid-request", conversationId: "ack-conversation", status: "done", ok: true, text: "saved", ...patch };
    const invalidRecord = JSON.stringify({ message: invalidMessage, createdAt: Date.now(), port: 3847 });
    saved.set(outboxKey("invalid-ack"), invalidRecord);
    const invalidAck = await loadPanel();
    assert.equal(invalidAck.getPendingMcpTerminalResultAck("invalid-request", "ack-conversation"), undefined);
    assert.equal(saved.get(outboxKey("invalid-ack")), invalidRecord);
    invalidAck.stopMcpBridgeClient();
    saved.delete(outboxKey("invalid-ack"));
  }
  console.log("MCP result ACK, reconnect, multi-panel persistence, migration, TTL, ownership and read-only terminal recovery probe passed");
} finally {
  Date.now = originalNow;
  for (const client of clients) client.stopMcpBridgeClient();
}
