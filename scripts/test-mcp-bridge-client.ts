import assert from "node:assert/strict";

const saved = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => { saved.set(key, value); },
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
  close() { this.readyState = FakeWebSocket.CLOSED; this.onclose?.(); }
}
(globalThis as any).WebSocket = FakeWebSocket;

const bridge = await import("../src/services/chat/mcpBridgeClient.ts");
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
bridge.startMcpBridgeClient(() => {}, [bridge.DOMA_MCP_BRIDGE_PORT]);
await tick();
const first = bridge.sendMcpBridgeResult({ conversationId: "conv", requestId: "turn-1", ok: true, text: "完成", status: "done" });
await tick();
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
assert.equal(JSON.parse(saved.get("doma:mcp:result-outbox:v1") || "[]").length, 0);

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
bridge.stopMcpBridgeClient();
assert.equal(await pending, false);
bridge.startMcpBridgeClient(() => {}, [bridge.DOMA_MCP_BRIDGE_PORT, bridge.DOMA_CLI_BRIDGE_PORT]);
await tick();
const restoredSocket = FakeWebSocket.sockets.filter((socket) => socket.url.endsWith(":3847")).at(-1)!;
const restoredCliSocket = FakeWebSocket.sockets.filter((socket) => socket.url.endsWith(":3857")).at(-1)!;
assert.equal(restoredSocket.sent.filter((message) => message.type === "result")[0].resultId, "turn-2");
assert.equal(restoredCliSocket.sent.filter((message) => message.type === "result").length, 0);
restoredSocket.receive({ type: "result_ack", resultId: "turn-2" });
await tick();
assert.equal(JSON.parse(saved.get("doma:mcp:result-outbox:v1") || "[]").length, 0);
const unrouted = bridge.sendMcpBridgeResult({ requestId: "unknown-mcp-turn", ok: false, text: "失败", status: "error" });
await tick();
assert.equal(restoredSocket.sent.filter((message) => message.resultId === "unknown-mcp-turn").length, 1);
assert.equal(restoredCliSocket.sent.filter((message) => message.resultId === "unknown-mcp-turn").length, 0);
restoredSocket.receive({ type: "result_ack", resultId: "unknown-mcp-turn" });
assert.equal(await unrouted, true);
bridge.stopMcpBridgeClient();
console.log("MCP result acknowledgement and reconnect passed");
