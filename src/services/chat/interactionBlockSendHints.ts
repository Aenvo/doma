import { getChatComposerMode } from "./chatComposerMode";

export const INTERACTION_BLOCK_PRIORITY_HINT = "# 最优先使用以下上下文";

/**
 * Agent 模式：纯文字发送时写入 interactionBlock 的提示。
 */
export const AGENT_PLAIN_TEXT_SEND_HINTS: string[] = [
  // 在此填写 Agent 模式提示，例如：
  // "- 直接理解用户意图并执行，可按需调用工具",
];

/**
 * Ask 模式：纯文字发送时写入 interactionBlock 的提示（偏解答，弱执行）。
 */
export const ASK_PLAIN_TEXT_SEND_HINTS: string[] = [
  // 在此填写 Ask 模式提示
  `
  1. 询问错误或者失败原因
    - 查找后续提到的操作/问题的原因
    - 找到原因后不要自己操作网页或者调用任何工具
    - 只需要列出的这么做的原因，如果有原始数据可以一并给出
  2. 询问解决方案
    - 分析后续提到的问题
    - 分析能否通过现有的工具来解决
    - 给出现有工具的解决方案，不要实际操作网页或者调用任何工具，可以提示用户手动切换到Agent模式开始执行
  <ask/>
  `
];

/**
 * Plan 模式：纯文字发送时写入 interactionBlock 的提示（规划优先）。
 * UI 暂隐藏 Plan，保留配置以便恢复。
 */
export const PLAN_PLAIN_TEXT_SEND_HINTS: string[] = [
  `
  1. 禁止调用任何tool,
  2. 制定计划
    - 2.1 调用 browser_screenshot 获取页面信息
    - 2.2 根据收集到的信息，调用 browser_plan_questions({questionList: [...]}) 向用户提问获取更多信息来帮助生成操作清单
    - 2.3 基于所有信息生成操作清单并必须调用 browser_plan({planName,stepList: [...]})
    - 2.4 只有在 browser_plan 调用成功后，才能解除限制并执行后续操作
  `,
];

/** @deprecated 请用 AGENT_ / ASK_ / PLAN_；保留以免外部引用断裂，实际以 resolvePlainTextSendHints 为准 */
export const PLAIN_TEXT_SEND_HINTS: string[] = PLAN_PLAIN_TEXT_SEND_HINTS;

/**
 * 消息已含 interactionBlock（附件 / 选区 / toolInput / 斜杠命令 / skill / @tab 等）时，
 * 向每个 interactionBlock 内额外注入的提示（在此填写）。
 * 会插在「# 最优先使用以下上下文」之后、块内原有内容之前。
 */
export const RICH_CONTEXT_EXTRA_HINTS: string[] = [
  // 示例："- 结合 interactionBlock 内上下文与用户补充文字执行",
];

/**
 * 定时任务触发发送时写入 interactionBlock 的说明（与 `<scheduled>id</scheduled>` 一起注入）。
 * 在此增删条目即可调整模型行为。
 */
export const SCHEDULED_SEND_HINTS: string[] = [
  `
  `,
];

export const BROWSER_PLAN_TITLE_I18N_KEY = "chat.plan.title";
export const BROWSER_PLAN_TITLE_WITH_NAME_I18N_KEY = "chat.plan.titleWithName";

/** 步骤条标题：有 planName 时为「Plan of {name}」/「{name} 计划」 */
export function formatBrowserPlanBarTitle(
  planName: string | undefined,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  const name = planName?.trim();
  if (name) return t(BROWSER_PLAN_TITLE_WITH_NAME_I18N_KEY, { name });
  return t(BROWSER_PLAN_TITLE_I18N_KEY);
}

/** 按当前全局 Agent/Ask/Plan 模式取纯文字发送 hints */
export function resolvePlainTextSendHints(): string[] {
  const mode = getChatComposerMode();
  if (mode === "plan") return PLAN_PLAIN_TEXT_SEND_HINTS;
  if (mode === "ask") return ASK_PLAIN_TEXT_SEND_HINTS;
  return AGENT_PLAIN_TEXT_SEND_HINTS;
}

const INTERACTION_BLOCK_RE = /<interactionBlock>([\s\S]*?)<\/interactionBlock>/gi;

function injectExtraHintsIntoBlockInner(inner: string): string {
  const extra = RICH_CONTEXT_EXTRA_HINTS.map((line) => line.trim()).filter(Boolean);
  if (!extra.length) return inner;

  const trimmed = inner.trim();
  if (trimmed.startsWith(INTERACTION_BLOCK_PRIORITY_HINT)) {
    const after = trimmed.slice(INTERACTION_BLOCK_PRIORITY_HINT.length).replace(/^\n/, "");
    return [INTERACTION_BLOCK_PRIORITY_HINT, ...extra, after].filter((line) => line !== "").join("\n");
  }
  return [...extra, trimmed].join("\n");
}

function enrichExistingInteractionBlocks(sendText: string): string {
  return sendText.replace(INTERACTION_BLOCK_RE, (_match, inner: string) => {
    let enriched = injectExtraHintsIntoBlockInner(inner);
    // Ask 模式：保证块内有 <ask/>，供气泡淡绿样式检测
    // MCP 外部任务块（仅 mcpCall）不注入 ask，避免样式/语义混淆
    const isMcpOnly =
      /<mcpCall\b[^>]*>[\s\S]*?<\/mcpCall>/i.test(enriched) &&
      !/<(attachedFiles|primarySubject|toolInput|command|skill|prompt|tab|quotedUserMessage|bot)\b/i.test(
        enriched,
      );
    if (
      !isMcpOnly &&
      getChatComposerMode() === "ask" &&
      !/<ask\s*\/?>/i.test(enriched)
    ) {
      enriched = `${enriched.trim()}\n<ask/>`;
    }
    return `<interactionBlock>\n${enriched}\n</interactionBlock>`;
  });
}

function buildPlainTextSendText(userText: string): string {
  const body = userText.trim();
  const hints = resolvePlainTextSendHints().map((line) => line.trim()).filter(Boolean);
  if (hints.length === 0) return body;

  const blockInner = [INTERACTION_BLOCK_PRIORITY_HINT, ...hints].join("\n");
  const block = `<interactionBlock>\n${blockInner}\n</interactionBlock>`;
  return body ? `${block}\n${body}` : block;
}

/**
 * 发送给模型前统一处理用户消息：
 * - 无 interactionBlock → hints 包进 interactionBlock，用户正文留在外面
 * - 已有 interactionBlock → 每个块注入 RICH_CONTEXT_EXTRA_HINTS
 */
export function prepareUserSendText(rawSendText: string): string {
  const s = String(rawSendText ?? "");
  if (!s.trim()) return s;
  if (/<interactionBlock>/i.test(s)) {
    return enrichExistingInteractionBlocks(s);
  }
  return buildPlainTextSendText(s);
}
