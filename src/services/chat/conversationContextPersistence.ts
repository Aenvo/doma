/**
 * ConversationContext → browser.storage.local（扩展共享，不经网页分区 IDB）。
 * 对话正文仍在 chatStorage IndexedDB。不迁移旧 DomA_ConversationContextDB。
 *
 * `await awaitConversationContextPersistenceReady(replaceConversationMapsFromPersisted)`
 * 从 storage 读出并灌入内存；每次调用都会重新执行。
 */

import { getContext } from "@/services/Context";
import type { ConversationContext } from "./conversationContextStore";

export const CONVERSATION_CONTEXT_STORAGE_KEY = "doma_conversation_contexts";

/** 串行 read-modify-write，避免多处 upsert 互相覆盖 */
let writeChain: Promise<void> = Promise.resolve();

function storageLocal(): typeof chrome.storage.local {
  return getContext().browser.storage.local as typeof chrome.storage.local;
}

function normalizeMap(raw: unknown): Record<string, ConversationContext> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, ConversationContext> = {};
  for (const [id, ctx] of Object.entries(raw as Record<string, ConversationContext>)) {
    if (!id || !ctx || typeof ctx !== "object") continue;
    if (typeof (ctx as ConversationContext).conversationId !== "string") {
      out[id] = { ...(ctx as ConversationContext), conversationId: id };
    } else {
      out[id] = ctx as ConversationContext;
    }
  }
  return out;
}

async function readAllMap(): Promise<Record<string, ConversationContext>> {
  const result = await storageLocal().get(CONVERSATION_CONTEXT_STORAGE_KEY);
  return normalizeMap(result?.[CONVERSATION_CONTEXT_STORAGE_KEY]);
}

async function writeAllMap(map: Record<string, ConversationContext>): Promise<void> {
  await storageLocal().set({ [CONVERSATION_CONTEXT_STORAGE_KEY]: map });
}

function enqueueWrite(task: () => Promise<void>): Promise<void> {
  writeChain = writeChain
    .catch(() => {
      // 保证链不断
    })
    .then(task);
  return writeChain;
}

async function getAllFromStorage(): Promise<ConversationContext[]> {
  const map = await readAllMap();
  return Object.values(map);
}

/** 按 conversationId 从 storage 读一条（不经内存 map）。 */
export async function getPersistedConversationContext(
  conversationId: string,
): Promise<ConversationContext | undefined> {
  const id = typeof conversationId === "string" ? conversationId.trim() : "";
  if (!id) return undefined;
  const map = await readAllMap();
  return map[id];
}

/**
 * 从 storage.local 读取；若传入 `applyRowsToMemory`，每次调用都会灌入内存。
 */
export async function awaitConversationContextPersistenceReady(
  applyRowsToMemory?: (rows: ConversationContext[]) => void,
): Promise<void> {
  if (!applyRowsToMemory) return;
  const rows = await getAllFromStorage();
  applyRowsToMemory(rows);
}

export async function persistConversationContext(ctx: ConversationContext): Promise<void> {
  if (!ctx?.conversationId) throw new Error("[ConversationContext] persist missing conversationId");
  return enqueueWrite(async () => {
    const map = await readAllMap();
    map[ctx.conversationId] = ctx;
    await writeAllMap(map);
  });
}

export async function deletePersistedConversationContext(conversationId: string): Promise<void> {
  const id = typeof conversationId === "string" ? conversationId.trim() : "";
  if (!id) return;
  return enqueueWrite(async () => {
    const map = await readAllMap();
    if (!(id in map)) return;
    delete map[id];
    await writeAllMap(map);
  });
}

/** 从 storage 重新灌入内存（API 名保留，兼容旧调用） */
export async function reloadConversationContextsFromDisk(
  applyRowsToMemory: (rows: ConversationContext[]) => void,
): Promise<void> {
  await awaitConversationContextPersistenceReady(applyRowsToMemory);
}
