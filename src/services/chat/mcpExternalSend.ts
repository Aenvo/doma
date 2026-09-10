/**
 * MCP 外部任务 → DomA send2 文案
 *
 * 约定格式（instruction 必须在 interactionBlock 外，才会进用户气泡正文）：
 *
 * ```
 * <interactionBlock>
 * ## attachedFiles
 * ...
 * <attachedFiles>...</attachedFiles>
 * </interactionBlock>
 * <interactionBlock>
 * <mcpCall>Cursor</mcpCall>
 * </interactionBlock>
 * 打开百度…
 * ```
 *
 * 规范化时必须保留 attachedFiles 等富上下文块，只重建 mcpCall 块。
 */

import { extractMcpCallLabel } from "@/components/chat/chatTypes";

/** 需保留的富上下文子标签（与 interactionBlockSendHints 白名单对齐） */
const RICH_INNER_RE =
  /<(attachedFiles|primarySubject|toolInput|command|skill|prompt|tab|bot)\b/i;

export function formatMcpCallTag(callerAgent: string): string {
  const label = String(callerAgent ?? "").trim() || "MCP";
  const escaped = label
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<mcpCall>${escaped}</mcpCall>`;
}

/** 组装：块内仅 mcpCall(名字)，块外为对方下发的 instruction */
export function buildMcpExternalSendText(task: string, callerAgent?: string): string {
  const body = String(task ?? "").trim();
  const tag = formatMcpCallTag(callerAgent || "MCP");
  if (!body) {
    return `<interactionBlock>\n${tag}\n</interactionBlock>`;
  }
  return `<interactionBlock>\n${tag}\n</interactionBlock>\n${body}`;
}

/**
 * 规范化入站文案：保证 mcpCall 只包 Agent 名，instruction 在 block 外。
 * 保留 attachedFiles 等富上下文 interactionBlock，避免 send2 再次 normalize 时丢掉附件。
 */
export function normalizeMcpExternalSendText(
  raw: string,
  fallbackCaller?: string,
): string {
  const s = String(raw ?? "").trim();
  if (!s) {
    return buildMcpExternalSendText("", fallbackCaller);
  }

  const label =
    extractMcpCallLabel(s) ||
    (typeof fallbackCaller === "string" && fallbackCaller.trim()
      ? fallbackCaller.trim()
      : "MCP");

  const preservedBlocks: string[] = [];
  const withoutBlocks = s.replace(
    /<interactionBlock>([\s\S]*?)<\/interactionBlock>/gi,
    (_match, inner: string) => {
      if (RICH_INNER_RE.test(inner)) {
        preservedBlocks.push(`<interactionBlock>\n${String(inner).trim()}\n</interactionBlock>`);
      }
      return "\n";
    },
  );

  let body = withoutBlocks.replace(/\n{3,}/g, "\n\n").trim();
  if (!body) {
    // 正文被误放进 block：去掉块与标记后剩余当作 instruction
    body = s
      .replace(/<\/?interactionBlock>/gi, "")
      .replace(/<mcpCall\b[^>]*>[\s\S]*?<\/mcpCall>/gi, "")
      .replace(/<ask\s*\/?>/gi, "")
      .replace(/<doma\s*\/?>/gi, "")
      .replace(/<attachedFiles>[\s\S]*?<\/attachedFiles>/gi, "")
      .replace(/<primarySubject\b[^>]*>[\s\S]*?<\/primarySubject>/gi, "")
      .replace(/<toolInput>[\s\S]*?<\/toolInput>/gi, "")
      .replace(/^#\s*最优先使用以下上下文\s*/gm, "")
      .replace(/^##\s*attachedFiles[\s\S]*?(?=^##|\z)/gim, "")
      .trim();
  }

  const mcpPart = buildMcpExternalSendText(body, label);
  if (!preservedBlocks.length) return mcpPart;
  return `${preservedBlocks.join("\n")}\n${mcpPart}`;
}
