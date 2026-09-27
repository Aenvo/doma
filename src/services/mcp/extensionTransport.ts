import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage, MessageExtraInfo } from "@modelcontextprotocol/sdk/types.js";
import { getContext } from "@/services/Context";
import { sendToSidePanel } from "@/edition/sendToSidePanel";

/**
 * MCP 扩展内传输 — 已知问题与待办
 *
 * [已做] Client 发 mcp/request：SW 挂起时 sendMessage 重试（send 本身不 await，避免阻塞 connect）
 *
 * [已做] Server 回 mcp/response 经 sendToSidePanel（Chrome runtime；Safari tabs→panelShell）。
 * LLM 工具定义现在本地读取，tools/call 走 service-worker 的
 * chat/runBrowserTool + sendResponse 同一 channel；本 transport 仅保留协议兼容。
 *
 * 相关：service-worker.ts listener(mcp/request)、llm entry onMessage(mcp/response)
 *
 * 诊断：搜控制台前缀 `[MCP-channel]`（侧栏）与 `[MCP-SW]`（service worker）。
 */

const MCP_SEND_MAX_RETRIES = 3;
const MCP_SEND_BASE_DELAY_MS = 150;
const MCP_DELIVER_SETTLE_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mcpChannelLog(level: "log" | "warn" | "error", msg: string, extra?: Record<string, unknown>) {
  const line = `[MCP-channel] ${msg}`;
  if (extra) console[level](line, extra);
  else console[level](line);
}

function summarizeJsonRpc(message: unknown): Record<string, unknown> {
  if (!message || typeof message !== "object") return { rawType: typeof message };
  const m = message as Record<string, unknown>;
  return {
    id: m.id ?? null,
    method: typeof m.method === "string" ? m.method : null,
    hasError: m.error != null,
    hasResult: m.result != null,
  };
}

function summarizePayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return { payloadType: typeof payload };
  const p = payload as Record<string, unknown>;
  return {
    origin: p.origin,
    operate: p.operate,
    jsonrpc: summarizeJsonRpc(p.jsonrpc),
  };
}

/** SW 挂起或未注册 listener 时 runtime.sendMessage 常见错误 */
function isRetriableRuntimeSendError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return (
    msg.includes("Receiving end does not exist") ||
    msg.includes("Could not establish connection") ||
    msg.includes("message port closed") ||
    msg.includes("message channel closed") ||
    msg.includes("asynchronous response by returning true") ||
    msg.includes("Extension context invalidated")
  );
}

/**
 * 仅确认消息能否投递到 SW（不等待 mcp/response）。
 * SW 的 mcp/request 历史上不调用 sendResponse；若 listener return true，Chrome 可能异步
 * 抛 channel closed。此处用 settle 竞态：timer 成功 vs callback lastError。
 */
function runtimeSendMessageDeliver(
  payload: unknown,
  meta: { attempt: number; settleMs?: number },
): Promise<void> {
  const settleMs = meta.settleMs ?? MCP_DELIVER_SETTLE_MS;
  const t0 = Date.now();
  const payloadSummary = summarizePayload(payload);

  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (winner: "timer" | "callback-ok" | "callback-error" | "throw", fn: () => void) => {
      if (settled) {
        mcpChannelLog("warn", "late settle ignored (already settled)", {
          lateWinner: winner,
          attempt: meta.attempt,
          elapsedMs: Date.now() - t0,
          ...payloadSummary,
        });
        return;
      }
      settled = true;
      clearTimeout(timer);
      mcpChannelLog(winner === "callback-error" || winner === "throw" ? "warn" : "log", "deliver settled", {
        winner,
        attempt: meta.attempt,
        elapsedMs: Date.now() - t0,
        settleMs,
        ...payloadSummary,
      });
      fn();
    };

    const timer = setTimeout(() => {
      // 无立即 lastError 且 SW 已接管 → 视为投递成功，真正响应走 mcp/response
      done("timer", resolve);
    }, settleMs);

    try {
      getContext().browser.runtime.sendMessage(payload, () => {
        const lastError = getContext().browser.runtime.lastError;
        if (lastError) {
          const errMsg = lastError.message || String(lastError);
          mcpChannelLog("warn", "sendMessage callback lastError", {
            attempt: meta.attempt,
            elapsedMs: Date.now() - t0,
            lastError: errMsg,
            ...payloadSummary,
          });
          done("callback-error", () => reject(new Error(errMsg)));
        } else {
          done("callback-ok", resolve);
        }
      });
    } catch (err) {
      mcpChannelLog("error", "sendMessage threw sync", {
        attempt: meta.attempt,
        elapsedMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
        ...payloadSummary,
      });
      done("throw", () => reject(err instanceof Error ? err : new Error(String(err))));
    }
  });
}

async function sendRuntimeMessageWithRetry(payload: unknown): Promise<void> {
  let lastErr: unknown;
  const payloadSummary = summarizePayload(payload);
  const idleHint =
    typeof (globalThis as any).__domaMcpLastDeliverAt === "number"
      ? Date.now() - (globalThis as any).__domaMcpLastDeliverAt
      : null;
  mcpChannelLog("log", "send with retry start", {
    maxAttempts: MCP_SEND_MAX_RETRIES + 1,
    msSinceLastDeliver: idleHint,
    ...payloadSummary,
  });
  console.log("[IDLE-DIAG][panel] mcp/request enqueue", {
    msSinceLastDeliver: idleHint,
    ...payloadSummary,
    t: Date.now(),
  });

  for (let attempt = 0; attempt <= MCP_SEND_MAX_RETRIES; attempt++) {
    try {
      await runtimeSendMessageDeliver(payload, { attempt: attempt + 1 });
      (globalThis as any).__domaMcpLastDeliverAt = Date.now();
      mcpChannelLog("log", "send with retry ok", {
        attempt: attempt + 1,
        ...payloadSummary,
      });
      console.log("[IDLE-DIAG][panel] mcp/request deliver OK", {
        attempt: attempt + 1,
        ...payloadSummary,
        t: Date.now(),
      });
      return;
    } catch (err) {
      lastErr = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      const canRetry = attempt < MCP_SEND_MAX_RETRIES && isRetriableRuntimeSendError(err);
      mcpChannelLog("warn", "send attempt failed", {
        attempt: attempt + 1,
        maxAttempts: MCP_SEND_MAX_RETRIES + 1,
        canRetry,
        error: errMsg,
        ...payloadSummary,
      });
      console.warn("[IDLE-DIAG][panel] mcp/request deliver FAIL", {
        attempt: attempt + 1,
        canRetry,
        error: errMsg,
        hint: canRetry
          ? "retriable — often SW suspended (Receiving end does not exist)"
          : "giving up",
        ...payloadSummary,
        t: Date.now(),
      });
      if (!canRetry) break;
      const delayMs = MCP_SEND_BASE_DELAY_MS * 2 ** attempt;
      mcpChannelLog("warn", "retry scheduled", { delayMs, nextAttempt: attempt + 2 });
      await sleep(delayMs);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function getJsonRpcRequestId(message: JSONRPCMessage): string | number | undefined {
  if ("id" in message && message.id != null) return message.id;
  return undefined;
}

function isJsonRpcRequest(
  message: JSONRPCMessage,
): message is JSONRPCMessage & { method: string; id: string | number } {
  return "method" in message && "id" in message && message.id != null;
}

export class ExtensionClientTransport implements Transport {
    async start() {
        console.log("client transport start==================");
    }

    async send(message: JSONRPCMessage){
        console.log("client transport send==================", message);
        if (isJsonRpcRequest(message) && message.method === "initialize"){
            this.onmessage({
                jsonrpc: "2.0",
                id: message.id,
                result: {
                    protocolVersion: "2024-11-05", // ✅ 必须 string
                    capabilities: {},              // ✅ 必须 object
                    serverInfo: {                  // ✅ 必须 object
                      name: "doma-browser-server",
                      version: "1.0.0"
                    }
                }
            })
        }
        else {
          // 不能 await：SW mcp/request 不走 sendResponse，await 会永久挂起；
          // MCP 响应走 mcp/response 广播。connect() 等依赖 send() 快速返回。
          const rpcSummary = summarizeJsonRpc(message);
          mcpChannelLog("log", "client enqueue mcp/request", rpcSummary);
          void sendRuntimeMessageWithRetry({
            origin: "content",
            operate: "mcp/request",
            jsonrpc: message,
          }).catch((err) => {
            const errMsg = err instanceof Error ? err.message : String(err);
            mcpChannelLog("error", "sendMessage failed after retries → emit JSON-RPC -32000", {
              error: errMsg,
              ...rpcSummary,
            });
            console.error("[MCP] sendMessage failed after retries:", err);
            const id = getJsonRpcRequestId(message);
            if (id != null) {
              this.onmessage({
                jsonrpc: "2.0",
                id,
                error: {
                  code: -32000,
                  message: errMsg,
                },
              });
            }
          });
        }
    }

    async close() {

    }

    onmessage(message: JSONRPCMessage, extra?: MessageExtraInfo) {
        console.log("client transport onmessage==================", message, extra);
    }
    
}

export class ExtensionServerTransport implements Transport {
    async start() {
        console.log("server transport start==================");
    }

    async send(message: JSONRPCMessage){
        console.log("server transport send==================", message);
        const rpcSummary = summarizeJsonRpc(message);
        try {
          await sendToSidePanel(
            {
              operate: "mcp/response",
              jsonrpc: message,
            },
            { expectResponse: false },
          );
          console.log("[MCP-SW] mcp/response via sendToSidePanel ok", rpcSummary);
        } catch (e) {
          console.error("[MCP-SW] mcp/response via sendToSidePanel threw", {
            error: e instanceof Error ? e.message : String(e),
            ...rpcSummary,
          });
        }
    }

    async close() {

    }

    onmessage(message: JSONRPCMessage, extra?: MessageExtraInfo) {
        console.log("server transport onmessage==================", message, extra);
    }
    
}
