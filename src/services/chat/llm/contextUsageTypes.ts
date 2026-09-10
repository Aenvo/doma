/**
 * Context Usage 持久化类型（无 Vue；仅侧栏 IDB 使用）。
 */

export type ContextWindowLimit = 128_000 | 256_000;

export type PersistedContextUsage = {
  limit: ContextWindowLimit;
  system: number;
  skills: number;
  tools: number;
  conversationText: number;
  conversationImage: number;
  summarized: number;
};
