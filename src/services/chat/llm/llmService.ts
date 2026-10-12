import type { ConversationMessage, LlmSendMessageOptions, LlmToolCallResult } from "./llmTypes";
import type { McpClient } from "@/services/mcp/mcpClient";
import { trimMessages, estimateMessagesTokens, prepareLlmHistory } from "./contextManager";
import { CONTEXT_LIMITS } from "./contextManager";
import { fetchSSE } from "../sseFetcher";
import { prepareUserSendText } from "../interactionBlockSendHints";
import { applyLlmUsage } from "./contextUsage";
import {
  buildAskPageToolBlockedPayload,
  getLastUserVisibleGoal,
  isAskBlockedPageTool,
  isAskModeRound,
} from "./askModeToolPolicy";
import {
  buildToolRecoveryNudgeMessage,
  clearTextOnlyToolRecovery,
  markTextOnlyToolRecoveryUsed,
  shouldForceToolRecovery,
} from "./textOnlyToolRecovery";

export type LlmToolChoiceMode = "auto" | "required";
import { callBrowserToolViaRuntime } from "./browserToolRuntimeClient";
import {
  HARD_TOOL_ROUND_LIMIT,
  createToolLoopState,
  finalAnswerControlInstruction,
  recordToolRound,
  type LlmRequestControl,
  type ToolLoopState,
} from "./toolLoopGuard";

export const MAX_TOOL_ROUNDS_PER_TURN = HARD_TOOL_ROUND_LIMIT;
export const MAX_EMPTY_RESPONSE_RECOVERIES = 1;
export const EMPTY_RESPONSE_RECOVERY_PROMPT =
  "The previous attempt ended without a final answer. Respond to the original user request now with a concise final answer. Do not call another tool unless it is strictly necessary.";

export class EmptyAssistantResponseError extends Error {
  constructor() {
    super("The model finished without returning a final answer");
    this.name = "EmptyAssistantResponseError";
  }
}

export class ToolRoundLimitError extends Error {
  constructor(limit = MAX_TOOL_ROUNDS_PER_TURN) {
    super(`The task exceeded the safety limit of ${limit} tool rounds`);
    this.name = "ToolRoundLimitError";
  }
}

export type LlmCallOutcome = "done" | "aborted" | "error";

export function toolErrorPayload(toolName: string, error: unknown): Record<string, unknown> {
  const message = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    error: message || `Tool ${toolName} failed`,
    tool: toolName,
  };
}

function parseToolArguments(raw: string, toolName: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("arguments must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `工具 ${toolName} 参数 JSON 无效：${msg}。` +
        "图片/文件请用 fileId 或 url，勿内联 base64；长文本请确保引号已转义。",
    );
  }
}

export class LlmService {
    protected apiKey: string;
    protected model: string;
    protected mcpClient: McpClient;
    protected conversationHistory: Map<string, ConversationMessage[]> = new Map();
    /** 下一轮 fetchOptions 使用的 tool_choice；consume 后恢复 auto */
    protected toolChoiceForNextRequest: LlmToolChoiceMode = "auto";

    constructor(apiKey: string, model: string, mcpClient: McpClient) {
        this.apiKey = apiKey;
        this.model = model;
        this.mcpClient = mcpClient;
    }

    protected consumeToolChoice(): LlmToolChoiceMode {
      const mode = this.toolChoiceForNextRequest;
      this.toolChoiceForNextRequest = "auto";
      return mode;
    }

    protected async fetchOptions(
      conversationId: string,
      userId: string,
      deviceId: string,
      site: string,
      ever: string,
      history: ConversationMessage[],
      _requestControl: LlmRequestControl = {},
    ): Promise<RequestInit> {
        return {}
    }

    protected endPoint(): string {
        return '';
    }

    withdrawLastUserMessage(conversationId: string): void {
        const history = this.conversationHistory.get(conversationId);
        if (history) {
          history.pop();
          this.conversationHistory.set(conversationId, history);
        }
    }

    withdrawTurns(conversationId: string, turnCount: number): void {
        if (turnCount <= 0) return;
        const history = this.conversationHistory.get(conversationId);
        if (!history?.length) return;

        for (let t = 0; t < turnCount; t++) {
          while (history.length > 0 && history[history.length - 1]!.role !== "user") {
            history.pop();
          }
          if (history.length > 0 && history[history.length - 1]!.role === "user") {
            history.pop();
          }
        }
        this.conversationHistory.set(conversationId, history);
    }

    /** 用侧栏剩余消息重建 LLM 上下文（删除轮次后与 UI 保持一致） */
    syncHistoryFromChatMessages(
        conversationId: string,
        messages: Array<{ role: string; content?: string | null }>,
    ): void {
        const history: ConversationMessage[] = [];
        for (const msg of messages) {
            if (msg.role !== "user" && msg.role !== "assistant") continue;
            let content = String(msg.content ?? "").trim();
            if (!content) continue;
            if (msg.role === "user") {
                content = prepareUserSendText(content);
            }
            history.push({ role: msg.role, content });
        }
        this.conversationHistory.set(conversationId, history);
    }

    async sendMessage(conversationId: string, userId: string, deviceId: string, site: string, ever: string, userMessage: string, options: LlmSendMessageOptions, signal: AbortSignal) {
        options.onConversationStart(conversationId);
        let history = this.conversationHistory.get(conversationId);
        if (!history) {
          history = [];
          this.conversationHistory.set(conversationId, history);
        }
    
        // 清理未完成的 tool_calls（用户中断后可能残留）
        this.cleanupIncompleteToolCalls(history);
        // 每个 sendMessage 回合重置 text-only 回收（含 resend）
        clearTextOnlyToolRecovery(conversationId);
    
        if (!options.skipAppendUserMessage) {
          const userMsg: ConversationMessage = {
            role: 'user',
            content: userMessage,
          };
          history.push(userMsg);
        }
    
        // // 上下文管理：裁剪超长历史
        // history = this.manageContext(history);
        // this.conversationHistory.set(conversationId, history);
    
        const msgIds: string[] = [];
        const outcome = await this.call(
          conversationId,
          userId,
          deviceId,
          site,
          ever,
          history,
          options,
          msgIds,
          signal,
        );
        if (outcome !== "error") {
          options.onConversationDone(conversationId, msgIds);
        }
    }

    protected manageContext(history: ConversationMessage[]): ConversationMessage[] {
        // 裁剪超长历史
        let managed = trimMessages(history, CONTEXT_LIMITS.MAX_MESSAGES);
        
        // 检查 token 数量
        const tokens = estimateMessagesTokens(managed);
        if (tokens > CONTEXT_LIMITS.TOKEN_WARNING) {
          console.warn(`[${this.getName()}] Context too large: ~${tokens} tokens. Consider starting new conversation.`);
        }
        
        return managed;
    }


    protected cleanupIncompleteToolCalls(history: ConversationMessage[]){

    }

    clearConversation(conversationId: string){
        this.conversationHistory.delete(conversationId);
        // Context Usage 按会话落盘，仅在删除会话时清理，不在此复位
    }

    /**
     * 上下文总结后：清空 LLM history，仅保留一条摘要用户消息。
     */
    replaceHistoryWithSummary(conversationId: string, summary: string): void {
        const text = String(summary ?? "").trim();
        const summaryText = text
          ? `[对话摘要]\n${text}`
          : `[对话摘要]\n（空摘要）`;
        this.conversationHistory.set(conversationId, [
          { role: "user", content: summaryText },
        ]);
    }

    async call( _conversationId: string,
        userId: string,
        deviceId: string,
        site: string,
        ever: string,
        history: ConversationMessage[],
        options: LlmSendMessageOptions,
        msgIds: string[],
        signal: AbortSignal,
        toolLoopState: ToolLoopState = createToolLoopState(),
        emptyResponseRecoveries = 0,
        requestControl: LlmRequestControl = {},
    ): Promise<LlmCallOutcome> {
        console.log(`Calling ${this.getName()} llm with model ${this.model}`);
        const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        try{
            msgIds.push(msgId);
            options.onMessageStart(_conversationId, msgId);
            let assistantText = '';
            let assistantReasoning = '';
            let finishReason = '';
            let sawToolCall = false;
            await prepareLlmHistory(history as Parameters<typeof prepareLlmHistory>[0], _conversationId);
            for await (const sseEvent of fetchSSE(
              this.endPoint(),
              await this.fetchOptions(
                _conversationId,
                userId,
                deviceId,
                site,
                ever,
                history,
                requestControl,
              ),
              msgId,
              signal,
            )) {
              if (sseEvent.type === 'usage' && sseEvent.usage) {
                applyLlmUsage(_conversationId, sseEvent.usage);
                console.log("[usage debug] onUsage", {
                  conversationId: _conversationId,
                  msgId: sseEvent.msgId,
                  usage: sseEvent.usage,
                });
                continue;
              }
              if (sseEvent.type === 'text') {
                assistantText += sseEvent.content;
              }
              if (sseEvent.type === 'reasoning') {
                assistantReasoning += sseEvent.content;
                options.onReasoningMessage?.(
                  _conversationId,
                  sseEvent.msgId!,
                  sseEvent.content,
                );
              }
              if (sseEvent.type === 'done' && sseEvent.finishReason) {
                finishReason = sseEvent.finishReason;
              }
              if (sseEvent.type === 'tool_call') {
                if (requestControl.disableTools) {
                  throw new ToolRoundLimitError();
                }
                sawToolCall = true;
                // assistant 的 tool_calls 消息必须在 tool result 之前加入历史
                history.push({
                  role: 'assistant',
                  content: assistantText || null,
                  ...(assistantReasoning ? { reasoning_content: assistantReasoning } : {}),
                  tool_calls: sseEvent.toolCalls!.map(tc => ({
                    id: tc.id,
                    type: tc.type,
                    function: { name: tc.function.name, arguments: tc.function.arguments },
                  })),
                } as any);

                const llmToolCallResults: LlmToolCallResult[] = [];
                for (const toolCall of sseEvent.toolCalls!) {
                  if (toolCall.type === 'function') {
                    console.log("[tool debug] onToolCallStart (llmService)", {
                      conversationId: _conversationId,
                      msgId: sseEvent.msgId,
                      callMsgId: msgId,
                      toolCallId: toolCall.id,
                      toolName: toolCall.function.name,
                    });
                    options.onToolCallStart(_conversationId, sseEvent.msgId!, toolCall);
                    let result: unknown;
                    try {
                      const toolArgs = parseToolArguments(
                        toolCall.function.arguments,
                        toolCall.function.name,
                      );
                      // 强制以当前会话为准，避免模型误把 tabId 传到 conversationId
                      toolArgs.conversationId = _conversationId;

                      // Ask 轮：页面/Tab 变更类 tool 直接拒绝（不执行），带 instruction 引导切 Agent
                      if (
                        isAskModeRound(history) &&
                        isAskBlockedPageTool(toolCall.function.name, toolArgs)
                      ) {
                        result = buildAskPageToolBlockedPayload(
                          toolCall.function.name,
                          getLastUserVisibleGoal(history),
                        );
                      } else {
                        const timeoutMs =
                          typeof toolArgs.timeoutMs === "number" && Number.isFinite(toolArgs.timeoutMs)
                            ? Math.max(1, Math.floor(toolArgs.timeoutMs))
                            : 60_000;
                        result = await callBrowserToolViaRuntime(
                          toolCall.function.name,
                          toolArgs,
                          timeoutMs,
                          signal,
                        );
                      }
                    } catch (toolError) {
                      if ((toolError as { name?: string })?.name === "AbortError" || signal.aborted) {
                        throw toolError;
                      }
                      console.warn(`[${this.getName()}] Tool call failed; returning error to model`, {
                        conversationId: _conversationId,
                        toolName: toolCall.function.name,
                        error: toolError instanceof Error ? toolError.message : String(toolError),
                      });
                      result = toolErrorPayload(toolCall.function.name, toolError);
                    }

                    try {
                      const overrideResult = await options.onToolCallOverride(
                        _conversationId,
                        sseEvent.msgId!,
                        toolCall,
                        result,
                      );
                      llmToolCallResults.push({
                        tool_call_id: toolCall.id,
                        result: overrideResult ?? result,
                        name: toolCall.function.name,
                      });
                    } finally {
                      options.onToolCallDone(_conversationId, sseEvent.msgId!, toolCall);
                    }
                  }
                }
    
                await this.processToolResults(_conversationId, llmToolCallResults, history);
                options.onMessageDone(_conversationId, msgId);
                const halt = await options.onAfterToolResults?.(
                  _conversationId,
                  llmToolCallResults,
                );
                if (halt) {
                  return "done";
                }
                const decision = recordToolRound(
                  toolLoopState,
                  sseEvent.toolCalls!,
                  llmToolCallResults,
                );
                if (decision.kind === "finalize") {
                  console.warn(`[${this.getName()}] Finalizing tool loop`, {
                    conversationId: _conversationId,
                    reason: decision.reason,
                    roundsCompleted: toolLoopState.roundsCompleted,
                    totalToolCalls: toolLoopState.totalToolCalls,
                  });
                  return await this.call(
                    _conversationId,
                    userId,
                    deviceId,
                    site,
                    ever,
                    history,
                    options,
                    msgIds,
                    signal,
                    toolLoopState,
                    emptyResponseRecoveries,
                    {
                      disableTools: true,
                      controlInstruction: finalAnswerControlInstruction(
                        toolLoopState,
                        decision.reason,
                      ),
                    },
                  );
                }
                return await this.call(
                  _conversationId,
                  userId,
                  deviceId,
                  site,
                  ever,
                  history,
                  options,
                  msgIds,
                  signal,
                  toolLoopState,
                  emptyResponseRecoveries,
                  decision.controlInstruction
                    ? { controlInstruction: decision.controlInstruction }
                    : {},
                );
              }
            }

            // 纯文本回复结束，将 assistant 消息加入历史
            if (assistantText) {
              history.push({
                role: 'assistant',
                content: assistantText,
                ...(assistantReasoning ? { reasoning_content: assistantReasoning } : {}),
              } as any);
            }

            if (!assistantText.trim() && !sawToolCall) {
              options.onMessageDone(_conversationId, msgId);
              if (
                emptyResponseRecoveries < MAX_EMPTY_RESPONSE_RECOVERIES &&
                !signal.aborted
              ) {
                console.warn(`[${this.getName()}] Empty final response; retrying once`, {
                  conversationId: _conversationId,
                  finishReason,
                  reasoningLength: assistantReasoning.length,
                });
                const recoveryMessage: ConversationMessage = {
                  role: "user",
                  content: EMPTY_RESPONSE_RECOVERY_PROMPT,
                };
                history.push(recoveryMessage);
                try {
                  return await this.call(
                    _conversationId,
                    userId,
                    deviceId,
                    site,
                    ever,
                    history,
                    options,
                    msgIds,
                    signal,
                    toolLoopState,
                    emptyResponseRecoveries + 1,
                    requestControl,
                  );
                } finally {
                  const recoveryIndex = history.indexOf(recoveryMessage);
                  if (recoveryIndex >= 0) history.splice(recoveryIndex, 1);
                }
              }
              throw new EmptyAssistantResponseError();
            }

            // text-only 回收：口头要操作却未发 tool_call → 最多强制一轮 required
            if (
              assistantText.trim() &&
              !signal.aborted &&
              !requestControl.disableTools &&
              (await shouldForceToolRecovery({
                conversationId: _conversationId,
                history,
                assistantText,
                signal,
              }))
            ) {
              markTextOnlyToolRecoveryUsed(_conversationId);
              history.push({
                role: "user",
                content: buildToolRecoveryNudgeMessage(),
              } as any);
              this.toolChoiceForNextRequest = "required";
              console.log("[tool-recovery] forcing required tool round", {
                conversationId: _conversationId,
                textPreview: assistantText.trim().slice(0, 80),
              });
              options.onMessageDone(_conversationId, msgId);
              return await this.call(
                _conversationId,
                userId,
                deviceId,
                site,
                ever,
                history,
                options,
                msgIds,
                signal,
                toolLoopState,
                emptyResponseRecoveries,
                {},
              );
            }

            // 一轮响应可能先输出进度文本，随后才发起 tool_call。只有整轮确认没有
            // 工具调用时才发布为用户可见正文，避免把临时播报持久化成聊天消息。
            if (assistantText) {
              options.onTextMessage(_conversationId, msgId, assistantText);
            }
            options.onMessageDone(_conversationId, msgId);
            return "done";
          }
          catch (e) {
            // 用户主动 abort 时，不应当作为错误噪音输出，也不应当让上层认为“崩溃”
            if ((e as any)?.name === 'AbortError' || signal?.aborted) {
              console.log(`[${this.getName()}] Request aborted`);
              return "aborted";
            }
            console.error(`[${this.getName()}] API call failed:`, e);
            await options.onMessageError(_conversationId, msgId, e as Error);
            return "error";
          }
    }

    protected async processToolResults(
      conversationId: string,
      toolResults: LlmToolCallResult[],
      history: ConversationMessage[],
    ): Promise<void> {}

    setConfig(apiKey: string, model: string) {
        this.apiKey = apiKey;
        this.model = model;
    }

    getName(): string {
        return 'unknown';
    }
}
