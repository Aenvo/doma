import { getPersistedConversationContext } from "./conversationContextPersistence";
import type { ConversationContext } from "./conversationContextStore";

type CloseRequest = { requestId: string; conversationId: string; completionToken: string; bridgePort: number };
type CloseResult = { requestId: string; conversationId: string; ok: boolean; text: string; status: "done" | "error" };
type CloseBrowser = {
  runtime: { id: string; getURL: (path: string) => string };
  tabs: { query: (filter: Record<string, unknown>) => Promise<Array<{ id?: number }>>; remove: (ids: number[]) => Promise<void> };
};
const inFlight = new Map<string, { identity: string; promise: Promise<CloseResult> }>();

/** A one-operation socket; it never registers as a side panel or receives browser tasks. */
function openCompletionChannel(request: CloseRequest): Promise<{ ready: CloseResult | undefined; deliver: (result: CloseResult) => Promise<boolean>; close: () => void }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${request.bridgePort}/close-result`);
    let settled = false;
    let deliverAck: ((value: boolean) => void) | undefined;
    const handshakeTimer = setTimeout(() => fail(new Error("关闭回执通道连接超时")), 8000);
    const keepAlive = setInterval(() => {
      try { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "keepalive" })); }
      catch { fail(new Error("关闭回执通道已断开")); }
    }, 10_000);
    const close = () => { clearTimeout(handshakeTimer); clearInterval(keepAlive); socket.close(); };
    const fail = (error: Error) => {
      if (!settled) { settled = true; close(); reject(error); }
      else deliverAck?.(false);
    };
    socket.onopen = () => {
      try { socket.send(JSON.stringify({ type: "close_claim", ...request })); }
      catch { fail(new Error("关闭回执通道连接失败")); }
    };
    socket.onerror = () => fail(new Error("关闭回执通道连接失败"));
    socket.onclose = () => { clearInterval(keepAlive); fail(new Error("关闭回执通道已断开")); };
    socket.onmessage = (event) => {
      let message: Record<string, unknown>;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.type === "close_rejected") { fail(new Error("关闭请求身份校验失败")); return; }
      if (!settled && message.type === "close_ready" && message.requestId === request.requestId && message.conversationId === request.conversationId) {
        if (!["running", "pending", "done", "error", "needs_user_input"].includes(String(message.status))) return;
        settled = true;
        clearTimeout(handshakeTimer);
        const terminal = message.status !== "running" && message.status !== "pending";
        resolve({
          ready: terminal ? { requestId: request.requestId, conversationId: request.conversationId,
            status: message.status === "done" ? "done" : "error", ok: message.status === "done" && message.ok === true,
            text: String(message.text || "关闭请求已结束") } : undefined,
          close,
          deliver: (result) => new Promise<boolean>((done) => {
            const timer = setTimeout(() => finish(false), 5000);
            const retry = setInterval(send, 800);
            function finish(value: boolean) { clearTimeout(timer); clearInterval(retry); deliverAck = undefined; done(value); }
            function send() {
              if (socket.readyState !== WebSocket.OPEN) { finish(false); return; }
              try { socket.send(JSON.stringify({ type: "result", resultId: request.requestId, ...result })); }
              catch { finish(false); }
            }
            deliverAck = finish;
            send();
          }),
        });
      } else if (message.type === "result_ack" && message.resultId === request.requestId) deliverAck?.(true);
    };
  });
}

/** Execution and receipt live in the SW, so removing the originating tab cannot destroy them. */
export async function closeMcpConversationInWorker(
  browser: CloseBrowser,
  raw: unknown,
  sender: { id?: string; url?: string },
  readContext: (id: string) => Promise<ConversationContext | undefined> = getPersistedConversationContext,
): Promise<CloseResult> {
  const request = raw as CloseRequest;
  if (!request || typeof request.requestId !== "string" || !request.requestId.trim()
      || typeof request.conversationId !== "string" || !request.conversationId.trim()
      || typeof request.completionToken !== "string" || !/^[0-9a-f]{32}$/.test(request.completionToken)
      || request.bridgePort !== 3847) throw new Error("请更新 MCP 配套程序后再关闭会话");
  const url = new URL(sender.url || "");
  const expected = new URL(browser.runtime.getURL("popup/index.html"));
  const hostTabId = Number(url.searchParams.get("domaTabId"));
  if (sender.id !== browser.runtime.id || url.protocol !== expected.protocol || url.host !== expected.host || url.pathname !== expected.pathname
      || url.hash !== "#sidepannel" || !Number.isInteger(hostTabId) || hostTabId <= 0) throw new Error("关闭请求必须来自当前扩展侧栏");
  const identity = JSON.stringify([request.conversationId, request.completionToken, request.bridgePort, hostTabId]);
  const existing = inFlight.get(request.requestId);
  if (existing) {
    if (existing.identity !== identity) throw new Error("关闭请求身份不一致");
    return existing.promise;
  }
  const promise = (async (): Promise<CloseResult> => {
    const context = await readContext(request.conversationId);
    if (!context || context.conversationId !== request.conversationId || !(context.mode === "single"
        ? context.tabId === hostTabId : context.mode === "group" && context.groupTabs?.includes(hostTabId)
          && Number.isInteger(context.groupId) && context.groupId! >= 0)) throw new Error("会话不属于当前侧栏标签");
    let channel = await openCompletionChannel(request);
    try {
      if (channel.ready) return channel.ready;
      let result: CloseResult;
      try {
        const targets = context.mode === "single" ? [hostTabId] :
          (await browser.tabs.query({ groupId: context.groupId })).map((tab) => tab.id).filter((id): id is number => Number.isInteger(id) && id! > 0);
        if (!targets.includes(hostTabId)) throw new Error("会话标签组已改变，请重新核实");
        await browser.tabs.remove(targets);
        const remaining = await browser.tabs.query({});
        if (remaining.some((tab) => tab.id != null && targets.includes(tab.id))) throw new Error("部分会话标签未关闭");
        result = { requestId: request.requestId, conversationId: request.conversationId, status: "done", ok: true,
          text: `会话已关闭（conversationId=${request.conversationId}）` };
      } catch (error) {
        result = { requestId: request.requestId, conversationId: request.conversationId, status: "error", ok: false,
          text: error instanceof Error ? error.message : String(error) };
      }
      if (!await channel.deliver(result)) {
        // Retry only delivery. The destructive action is never replayed.
        channel.close();
        channel = await openCompletionChannel(request);
        if (channel.ready) return channel.ready;
        if (!await channel.deliver(result)) throw new Error("关闭结果回传未获确认，请核实浏览器状态");
      }
      return result;
    } finally { channel.close(); }
  })();
  inFlight.set(request.requestId, { identity, promise });
  try { return await promise; }
  finally { if (inFlight.get(request.requestId)?.promise === promise) inFlight.delete(request.requestId); }
}
