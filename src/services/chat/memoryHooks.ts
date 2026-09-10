/**
 * Memory 业务钩子（检索 / 拼装）。
 * 存储 API 见 memoryStore；工具栏写入在 ChatPanel.onSaveTurnMemoryClick。
 * 不向模型暴露 tool。
 * 发送路径同时可注入「当前激活标签页」名片（与记忆并列进 interactionBlock）。
 */

import {
  formatActiveTabForInteractionBlock,
  type ActiveTabBlock,
} from "@/components/chat/chatTypes";
import {
  memoryList,
  memoryTouchLastUsed,
  type MemoryItem,
} from "./memoryStore";

export type ActiveTabContext = ActiveTabBlock;

export type MemoryRetrieveContext = {
  /** 用户本轮可见正文（建议已去掉 interactionBlock） */
  userText: string;
  conversationId?: string;
  /** 当前站点 hostname，用于 scope 匹配 */
  siteHost?: string;
  /** 发送时浏览器当前激活标签页（名片注入，不依赖记忆命中） */
  activeTab?: ActiveTabContext;
};

const RETRIEVE_MAX_ITEMS = 5;

/**
 * 本地检索：用用户正文匹配 aliases / key / content，再按 scope 加权取 top-k。
 */
export async function retrieveMemoriesForUserTurn(
  ctx: MemoryRetrieveContext,
): Promise<MemoryItem[]> {
  const userText = String(ctx.userText ?? "").trim();
  if (!userText) return [];

  const scope = ctx.siteHost ? `site:${ctx.siteHost}` : undefined;
  let all: MemoryItem[] = [];
  try {
    all = await memoryList({ scope, limit: 200 });
  } catch (e) {
    console.warn("[memory] memoryList failed:", e);
    return [];
  }
  if (!all.length) return [];

  const hay = userText.toLowerCase();
  const scored = all
    .map((item) => ({ item, score: scoreMemoryAgainstText(item, hay, ctx.siteHost) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.item.updatedAt - a.item.updatedAt);

  return scored.slice(0, RETRIEVE_MAX_ITEMS).map((x) => x.item);
}

/** aliases 命中权重最高，其次 key，再次 content 子串；有文本命中后再加 scope 加权 */
function scoreMemoryAgainstText(
  item: MemoryItem,
  hayLower: string,
  siteHost?: string,
): number {
  let score = 0;

  for (const raw of item.aliases ?? []) {
    const a = String(raw).trim().toLowerCase();
    if (a.length >= 2 && hayLower.includes(a)) score += 5;
  }

  const key = String(item.key ?? "").trim().toLowerCase();
  if (key && hayLower.includes(key)) score += 3;
  // key 最后一段（如 open_tab_policy）也试一下
  const keyTail = key.includes(".") ? key.slice(key.lastIndexOf(".") + 1) : "";
  if (keyTail.length >= 3 && hayLower.includes(keyTail)) score += 2;

  const content = String(item.content ?? "").trim().toLowerCase();
  if (content.length >= 4 && hayLower.includes(content)) {
    score += 2;
  } else if (content) {
    for (const tok of content.split(/[\s,，、;；|/]+/).filter((t) => t.length >= 2)) {
      if (hayLower.includes(tok)) score += 1;
    }
  }

  // 无文本命中则不计分（避免 global +0.2 把无关记忆全部捞出）
  if (score <= 0) return 0;

  if (siteHost && item.scope === `site:${siteHost}`) score += 1.5;
  else if (item.scope === "global") score += 0.2;

  return score;
}

/**
 * TODO: 把命中记忆格式化成可写入 interactionBlock 的片段。
 * 默认格式便于模型与本地忽略渲染。
 */
export function formatMemoriesForInteractionBlock(items: MemoryItem[]): string {
  if (!items.length) return "";
  const lines = items.map((m) => {
    const key = escapeAttr(m.key);
    const body = m.content.trim();
    return `<memory key="${key}">${body}</memory>`;
  });
  return lines.join("\n");
}

/**
 * 将片段拼进用户发送文本（优先写入已有 interactionBlock，否则新建一块）。
 */
export function appendSnippetsToSendText(rawSendText: string, snippets: string[]): string {
  const snippet = snippets.map((s) => String(s ?? "").trim()).filter(Boolean).join("\n");
  if (!snippet) return rawSendText;

  const s = String(rawSendText ?? "");
  if (!s.trim()) {
    return `<interactionBlock>\n# 最优先使用以下上下文\n${snippet}\n</interactionBlock>`;
  }

  if (/<interactionBlock>/i.test(s)) {
    return s.replace(
      /<interactionBlock>([\s\S]*?)<\/interactionBlock>/i,
      (_m, inner: string) => {
        const trimmed = String(inner).trim();
        return `<interactionBlock>\n${trimmed}\n${snippet}\n</interactionBlock>`;
      },
    );
  }

  return `<interactionBlock>\n# 最优先使用以下上下文\n${snippet}\n</interactionBlock>\n${s}`;
}

/**
 * 将记忆片段拼进用户发送文本（优先写入已有 interactionBlock，否则新建一块）。
 * 检索结果为空时原样返回。
 *
 * TODO: 可按产品需要改注入位置 / 标签形态。
 */
export function appendRetrievedMemoriesToSendText(
  rawSendText: string,
  memories: MemoryItem[],
): string {
  const snippet = formatMemoriesForInteractionBlock(memories);
  if (!snippet) return rawSendText;
  return appendSnippetsToSendText(rawSendText, [snippet]);
}

/**
 * 发送路径入口：激活 tab 名片 + 记忆检索 → 拼装。
 * ChatPanel.send2 在 prepareUserSendText 之前调用。
 * 有 activeTab 时即使无记忆命中也会注入。
 */
export async function enrichUserSendTextWithMemories(
  rawSendText: string,
  ctx: Omit<MemoryRetrieveContext, "userText"> & { userText?: string },
): Promise<string> {
  const userText =
    (ctx.userText ?? stripInteractionBlocksForMatch(rawSendText)).trim() ||
    stripInteractionBlocksForMatch(rawSendText);

  const snippets: string[] = [];

  // <doma/> 为系统自动续跑，勿再注入 activeTab（会把「当前激活页」和来源页搅在一起）
  const skipActiveTab = hasDomaAutoTag(rawSendText);
  if (!skipActiveTab) {
    const tabSnippet = formatActiveTabForInteractionBlock(ctx.activeTab);
    if (tabSnippet) snippets.push(tabSnippet);
  }

  let hits: MemoryItem[] = [];
  try {
    hits = await retrieveMemoriesForUserTurn({
      userText,
      conversationId: ctx.conversationId,
      siteHost: ctx.siteHost,
      activeTab: ctx.activeTab,
    });
  } catch (e) {
    console.warn("[memory] retrieveMemoriesForUserTurn failed:", e);
  }

  if (hits.length) {
    try {
      void memoryTouchLastUsed(hits.map((h) => h.id));
    } catch {
      /* ignore */
    }
    const memSnippet = formatMemoriesForInteractionBlock(hits);
    if (memSnippet) snippets.push(memSnippet);
  }

  if (!snippets.length) return rawSendText;
  return appendSnippetsToSendText(rawSendText, snippets);
}

function stripInteractionBlocksForMatch(text: string): string {
  return String(text ?? "")
    .replace(/<interactionBlock\b[^>]*>[\s\S]*?<\/interactionBlock>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasDomaAutoTag(text: string): boolean {
  return /<doma\s*\/?>/i.test(String(text ?? ""));
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
