import { chatStorage, type StoredConversation } from "@/services/chat/chatStorage";

export interface HistoryConversationMeta {
  hostname: string;
  lastUserQuestion: string;
}

export interface HistoryConversationRow extends StoredConversation {
  hostname: string;
  lastUserQuestion: string;
}

/** 历史列表展示 / 搜索用：去掉 interactionBlock 及其内容，保留用户可见正文 */
export function stripInteractionBlocksForHistoryUi(text: string | undefined | null): string {
  if (!text) return "";
  return String(text)
    .replace(/<interactionBlock\b[^>]*>[\s\S]*?<\/interactionBlock>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractHostnameFromUrl(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

export interface HistoryDateGroup {
  dateKey: string;
  label: string;
  items: HistoryConversationRow[];
}

function toLocalDateKey(timestamp: number): string {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function enrichConversationRow(
  conv: StoredConversation,
  getMeta: (conversationId: string) => HistoryConversationMeta,
): HistoryConversationRow {
  const meta = getMeta(conv.id);
  const rawQuestion =
    meta.lastUserQuestion ||
    conv.firstUserMessage?.trim() ||
    conv.title;
  const displayQuestion = stripInteractionBlocksForHistoryUi(rawQuestion);
  return {
    ...conv,
    hostname: extractHostnameFromUrl(conv.url?.trim()) || meta.hostname,
    // 纯 interactionBlock、块外无正文时显示占位，避免列表再露出提示词
    lastUserQuestion: displayQuestion || "…",
  };
}

export function formatHistoryDateGroupLabel(
  dateKey: string,
  locale: string,
  labels: { today: string; yesterday: string },
): string {
  const date = parseDateKey(dateKey);
  const now = new Date();
  const todayKey = toLocalDateKey(now.getTime());
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = toLocalDateKey(yesterday.getTime());

  if (dateKey === todayKey) return labels.today;
  if (dateKey === yesterdayKey) return labels.yesterday;

  const isZh = locale.toLowerCase().startsWith("zh");
  if (date.getFullYear() === now.getFullYear()) {
    return isZh
      ? `${date.getMonth() + 1}月${date.getDate()}日`
      : date.toLocaleDateString(locale, { month: "long", day: "numeric" });
  }

  return isZh
    ? `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
    : date.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
}

export function groupConversationsByDate(
  conversations: StoredConversation[],
  getMeta: (conversationId: string) => HistoryConversationMeta,
  locale: string,
  labels: { today: string; yesterday: string },
): HistoryDateGroup[] {
  const rows: HistoryConversationRow[] = conversations.map((conv) =>
    enrichConversationRow(conv, getMeta),
  );

  const byDate = new Map<string, HistoryConversationRow[]>();
  for (const row of rows) {
    const key = toLocalDateKey(row.updatedAt);
    const bucket = byDate.get(key);
    if (bucket) bucket.push(row);
    else byDate.set(key, [row]);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, items]) => ({
      dateKey,
      label: formatHistoryDateGroupLabel(dateKey, locale, labels),
      items: items.sort((a, b) => b.updatedAt - a.updatedAt),
    }));
}

function conversationContextMatchesQuery(
  conv: StoredConversation,
  getMeta: (conversationId: string) => HistoryConversationMeta,
  q: string,
): boolean {
  const meta = getMeta(conv.id);
  const row = enrichConversationRow(conv, getMeta);
  const questionUi = stripInteractionBlocksForHistoryUi(meta.lastUserQuestion);
  return (
    meta.hostname.toLowerCase().includes(q) ||
    questionUi.toLowerCase().includes(q) ||
    row.lastUserQuestion.toLowerCase().includes(q) ||
    row.hostname.toLowerCase().includes(q) ||
    stripInteractionBlocksForHistoryUi(conv.firstUserMessage).toLowerCase().includes(q) ||
    stripInteractionBlocksForHistoryUi(conv.title).toLowerCase().includes(q)
  );
}

/**
 * 搜索历史会话：IndexedDB（会话元数据 + 消息正文）+ ConversationContext（hostname / lastUserQuestion）。
 * 展示与匹配均忽略 interactionBlock；落盘与加载仍是完整原文。
 */
export async function searchHistoryConversations(
  query: string,
  getMeta: (conversationId: string) => HistoryConversationMeta,
  options?: { includeMessages?: boolean },
): Promise<StoredConversation[]> {
  const q = query.trim().toLowerCase();
  if (!q) return chatStorage.getAllConversations();

  const fromDb = await chatStorage.searchConversations(query, options);
  const matchedIds = new Set(fromDb.map((c) => c.id));

  const all = await chatStorage.getAllConversations();
  const fromContext = all.filter(
    (conv) => !matchedIds.has(conv.id) && conversationContextMatchesQuery(conv, getMeta, q),
  );

  return [...fromDb, ...fromContext].sort((a, b) => b.updatedAt - a.updatedAt);
}
