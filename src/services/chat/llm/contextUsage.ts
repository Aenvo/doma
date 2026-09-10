/**
 * Context Usage：
 * - System / Skills / Tools / Summarized / Conversation·Text：只展示**当前轮**（覆盖写入）
 * - Conversation·Image：按轮**累加**（原图入账后 stub 不冲销历史）
 */

import { computed, reactive, type Ref } from "vue";
import { estimateTokens } from "./contextManager";
import type { ContextWindowLimit, PersistedContextUsage } from "./contextUsageTypes";
import {
  deleteContextUsageRow,
  loadContextUsageRow,
  persistContextUsageRow,
} from "./contextUsagePersistence";

export type { ContextWindowLimit, PersistedContextUsage } from "./contextUsageTypes";

export type ContextUsageBuckets = {
  system: number;
  skills: number;
  tools: number;
  conversationText: number;
  conversationImage: number;
  summarized: number;
};

export type ContextUsageSnapshot = ContextUsageBuckets & {
  total: number;
  limit: ContextWindowLimit;
  percent: number;
};

export type LlmTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  promptTextTokens: number;
  promptImageTokens: number;
  completionTextTokens: number;
  completionImageTokens: number;
};

/** 本轮入账用的固定分项（发请求时记下，等 usage 到齐再累加） */
export type TurnUsageFixed = {
  system: number;
  skills: number;
  tools: number;
  /** 本轮 prompt 中摘要消息的估 token；无则为 0 */
  summarized: number;
};

export const CONTEXT_USAGE_LIMIT_OPTIONS: ContextWindowLimit[] = [128_000, 256_000];

const DEFAULT_LIMIT: ContextWindowLimit = 256_000;

const emptyBuckets = (): ContextUsageBuckets => ({
  system: 0,
  skills: 0,
  tools: 0,
  conversationText: 0,
  conversationImage: 0,
  summarized: 0,
});

function totalOf(b: ContextUsageBuckets): number {
  return (
    b.system +
    b.skills +
    b.tools +
    b.conversationText +
    b.conversationImage +
    b.summarized
  );
}

function toSnapshot(b: ContextUsageBuckets, limit: ContextWindowLimit): ContextUsageSnapshot {
  const total = totalOf(b);
  return {
    ...b,
    total,
    limit,
    percent: limit > 0 ? Math.min(100, (total / limit) * 100) : 0,
  };
}

type SessionState = {
  buckets: ContextUsageBuckets;
  limit: ContextWindowLimit;
  /** 最近一次发请求记下的固定分项，等 usage 消费后清除 */
  pendingFixed: TurnUsageFixed | null;
};

const sessions = new Map<string, SessionState>();

/**
 * UI 显式订阅此对象（勿只靠在普通函数里读 ref，避免部分打包场景下依赖收集失败）。
 */
export const contextUsageUi = reactive({
  version: 0,
  /** 最近一次 apply / arm 的会话 id，供 prop 为空时回退 */
  activeId: "",
});

function bump(conversationId?: string): void {
  if (conversationId) contextUsageUi.activeId = conversationId;
  contextUsageUi.version += 1;
}

const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

function schedulePersist(conversationId: string): void {
  const id = conversationId.trim();
  if (!id) return;
  const prev = persistTimers.get(id);
  if (prev) clearTimeout(prev);
  persistTimers.set(
    id,
    setTimeout(() => {
      persistTimers.delete(id);
      void persistContextUsageNow(id);
    }, 200),
  );
}

function toPersisted(s: SessionState): PersistedContextUsage {
  return {
    limit: s.limit,
    system: s.buckets.system,
    skills: s.buckets.skills,
    tools: s.buckets.tools,
    conversationText: s.buckets.conversationText,
    conversationImage: s.buckets.conversationImage,
    summarized: s.buckets.summarized,
  };
}

async function persistContextUsageNow(conversationId: string): Promise<void> {
  const s = sessions.get(conversationId);
  if (!s) return;
  try {
    await persistContextUsageRow(conversationId, toPersisted(s));
  } catch (e) {
    console.warn("[contextUsage] persist failed:", e);
  }
}

function getOrCreate(conversationId: string): SessionState {
  const id = conversationId.trim();
  let s = sessions.get(id);
  if (!s) {
    s = { buckets: emptyBuckets(), limit: DEFAULT_LIMIT, pendingFixed: null };
    sessions.set(id, s);
  }
  return s;
}

export function estimateTextTokens(text: string): number {
  return estimateTokens(text);
}

export function estimateJsonTokens(value: unknown): number {
  try {
    return estimateTokens(JSON.stringify(value));
  } catch {
    return 0;
  }
}

/** 识别 history 中的摘要消息并估 token（OpenAI 形态 content:string） */
export function estimateSummarizedInHistory(history: Array<{ role?: string; content?: unknown }>): number {
  let sum = 0;
  for (const msg of history) {
    const c = msg.content;
    const text =
      typeof c === "string"
        ? c
        : Array.isArray(c)
          ? (c as Array<{ type?: string; text?: string }>)
              .filter((p) => p?.type === "text" && typeof p.text === "string")
              .map((p) => p.text)
              .join("\n")
          : "";
    if (!text) continue;
    if (/\[对话摘要/.test(text) || /\[Conversation summary/i.test(text)) {
      sum += estimateTokens(text);
    }
  }
  return sum;
}

export function setContextUsageLimit(conversationId: string, limit: ContextWindowLimit): void {
  if (!conversationId.trim()) return;
  getOrCreate(conversationId).limit = limit;
  bump(conversationId.trim());
  schedulePersist(conversationId.trim());
}

/** 删会话：清内存 + 独立 IDB 行 */
export function resetContextUsage(conversationId: string): void {
  const id = conversationId.trim();
  if (!id) return;
  const t = persistTimers.get(id);
  if (t) {
    clearTimeout(t);
    persistTimers.delete(id);
  }
  sessions.delete(id);
  if (contextUsageUi.activeId === id) contextUsageUi.activeId = "";
  bump();
  void deleteContextUsageRow(id).catch((e) => {
    console.warn("[contextUsage] delete row failed:", e);
  });
}

/**
 * 总结成功后：清空用量并写回落盘（会话仍在，下次打开应为接近空）。
 */
export function resetContextUsageAndPersist(conversationId: string): void {
  const id = conversationId.trim();
  if (!id) return;
  const t = persistTimers.get(id);
  if (t) {
    clearTimeout(t);
    persistTimers.delete(id);
  }
  sessions.delete(id);
  getOrCreate(id); // 空 buckets
  bump(id);
  schedulePersist(id);
}

function applyHydratedData(
  conversationId: string,
  data: PersistedContextUsage | null | undefined,
): void {
  const id = conversationId.trim();
  if (!id) return;
  if (!data || typeof data !== "object") {
    sessions.delete(id);
    bump(id);
    return;
  }
  const limit: ContextWindowLimit =
    data.limit === 128_000 || data.limit === 256_000 ? data.limit : DEFAULT_LIMIT;
  const s = getOrCreate(id);
  s.limit = limit;
  s.pendingFixed = null;
  s.buckets = {
    system: numOr0(data.system),
    skills: numOr0(data.skills),
    tools: numOr0(data.tools),
    conversationText: numOr0(data.conversationText),
    conversationImage: numOr0(data.conversationImage),
    summarized: numOr0(data.summarized),
  };
  bump(id);
}

/** ChatPanel loadConversation：从独立 IDB 恢复 */
export async function hydrateContextUsageFromIdb(conversationId: string): Promise<void> {
  const id = conversationId.trim();
  if (!id) return;
  try {
    const data = await loadContextUsageRow(id);
    applyHydratedData(id, data);
  } catch (e) {
    console.warn("[contextUsage] hydrate from idb failed:", e);
    applyHydratedData(id, null);
  }
}

function numOr0(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/** 发请求前：记下本轮固定分项，usage 到达后累加 */
export function armTurnUsageFixed(conversationId: string, fixed: TurnUsageFixed): void {
  if (!conversationId.trim()) return;
  const id = conversationId.trim();
  const s = getOrCreate(id);
  s.pendingFixed = { ...fixed };
  bump(id);
}

/**
 * SSE usage 入账。
 * 固定项与 Conversation/Text、Summarized：覆盖为当轮；Image：累加。
 */
export function applyLlmUsage(conversationId: string, usage: LlmTokenUsage): void {
  const id = conversationId.trim();
  if (!id) return;
  const s = getOrCreate(id);
  const fixed = s.pendingFixed ?? { system: 0, skills: 0, tools: 0, summarized: 0 };
  s.pendingFixed = null;

  const image = (usage.promptImageTokens || 0) + (usage.completionImageTokens || 0);
  const text = usage.promptTextTokens || 0;
  const fixedSum = fixed.system + fixed.skills + fixed.tools + fixed.summarized;
  const convText = Math.max(0, text - fixedSum);
  const completionText = usage.completionTextTokens || 0;

  s.buckets.system = fixed.system;
  s.buckets.skills = fixed.skills;
  s.buckets.tools = fixed.tools;
  s.buckets.summarized = fixed.summarized;
  s.buckets.conversationText = convText + completionText;
  s.buckets.conversationImage += image;

  bump(id);
  schedulePersist(id);
}

export function getContextUsageSnapshot(conversationId: string | null | undefined): ContextUsageSnapshot {
  // 必须读 version，否则 computed/组件不会因 apply 刷新
  void contextUsageUi.version;
  // ChatPanel 无会话时圆环应清零，勿回退 activeId（否则切走后仍显示上一会话）
  const id =
    typeof conversationId === "string" && conversationId.trim()
      ? conversationId.trim()
      : "";
  if (!id) return toSnapshot(emptyBuckets(), DEFAULT_LIMIT);
  const s = sessions.get(id);
  if (!s) return toSnapshot(emptyBuckets(), DEFAULT_LIMIT);
  return toSnapshot(s.buckets, s.limit);
}

/** Vue：订阅某会话的用量快照 */
export function useContextUsage(conversationId: Ref<string | null | undefined>) {
  return computed(() => {
    void contextUsageUi.version;
    return getContextUsageSnapshot(conversationId.value);
  });
}

export function parseLlmUsageFromSse(raw: unknown): LlmTokenUsage | null {
  if (!raw || typeof raw !== "object") return null;
  const u = raw as Record<string, unknown>;
  if (typeof u.prompt_tokens !== "number") return null;
  const pd = (u.prompt_tokens_details ?? {}) as Record<string, unknown>;
  const cd = (u.completion_tokens_details ?? {}) as Record<string, unknown>;
  const promptTokens = u.prompt_tokens as number;
  const completionTokens = typeof u.completion_tokens === "number" ? u.completion_tokens : 0;
  return {
    promptTokens,
    completionTokens,
    totalTokens:
      typeof u.total_tokens === "number" ? u.total_tokens : promptTokens + completionTokens,
    promptTextTokens: typeof pd.text_tokens === "number" ? pd.text_tokens : promptTokens,
    promptImageTokens: typeof pd.image_tokens === "number" ? pd.image_tokens : 0,
    completionTextTokens:
      typeof cd.text_tokens === "number" ? cd.text_tokens : completionTokens,
    completionImageTokens: typeof cd.image_tokens === "number" ? cd.image_tokens : 0,
  };
}

export { estimateTokens };
