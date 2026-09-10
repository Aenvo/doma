/**
 * 上下文触顶后的自动总结协议（隐藏 interactionBlock + browser_conversation_summarized）。
 */

import { getContextUsageSnapshot, resetContextUsageAndPersist } from "./llm/contextUsage";

/** 达到 limit 的该比例后，下一次用户发送改为先走总结回合 */
export const CONTEXT_SUMMARIZE_THRESHOLD_RATIO = 0.9;

export const CONTEXT_SUMMARIZE_TOOL_NAME = "browser_conversation_summarized";

/** 纯 hints、无协议子标签 → shouldHideUserBubble 不渲染 */
export const CONTEXT_SUMMARIZE_INTERACTION_BLOCK = `<interactionBlock>
# 优先使用该上下文
- 当前对话已经到达上下文上限
- 总结当前对话后调用 browser_conversation_summarized，将总结内容传入参数 summary
- 总结须保留关键结论、待办、用户约束与重要 URL/选择；不要再调用其它工具
</interactionBlock>`;

export function shouldTriggerContextSummarize(conversationId: string | null | undefined): boolean {
  const id = typeof conversationId === "string" ? conversationId.trim() : "";
  if (!id) return false;
  const snap = getContextUsageSnapshot(id);
  return snap.total >= snap.limit * CONTEXT_SUMMARIZE_THRESHOLD_RATIO;
}

export function extractSummarizedResult(result: unknown): { ok: boolean; summary: string; error?: string } {
  if (!result || typeof result !== "object") {
    return { ok: false, summary: "", error: "invalid result" };
  }
  const r = result as Record<string, unknown>;
  const summary = typeof r.summary === "string" ? r.summary.trim() : "";
  const ok = r.ok === true && summary.length > 0;
  return {
    ok,
    summary,
    error: typeof r.error === "string" ? r.error : ok ? undefined : "summary is required",
  };
}

/** 总结成功后重置用量并落盘 */
export function resetUsageAfterSummarize(conversationId: string): void {
  resetContextUsageAndPersist(conversationId);
}
