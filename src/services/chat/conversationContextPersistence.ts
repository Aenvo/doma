/**
 * Service worker 内 IndexedDB：持久化 ConversationContext（独立库名，与侧栏 chatStorage 解耦）。
 *
 * 调用 `await awaitConversationContextPersistenceReady(replaceConversationMapsFromPersisted)`
 * 会从磁盘读取并灌入内存；每次调用都会重新执行。
 */

import type { ConversationContext } from "./conversationContextStore";

const DB_NAME = "DomA_ConversationContextDB";
const DB_VERSION = 1;
const STORE = "contexts";

let db: IDBDatabase | null = null;
let openPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const idb = (event.target as IDBOpenDBRequest).result;
      if (!idb.objectStoreNames.contains(STORE)) {
        idb.createObjectStore(STORE, { keyPath: "conversationId" });
      }
    };
  });
}

async function ensureDb(): Promise<IDBDatabase> {
  if (db) return db;
  if (!openPromise) {
    openPromise = openDb().then((d) => {
      db = d;
      return d;
    });
  }
  return openPromise;
}

async function getAllFromDisk(): Promise<ConversationContext[]> {
  const idb = await ensureDb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result as ConversationContext[]) ?? []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 打开 IndexedDB；若传入 `applyRowsToMemory`，每次调用都会从磁盘重新灌入内存。
 */
export async function awaitConversationContextPersistenceReady(
  applyRowsToMemory?: (rows: ConversationContext[]) => void,
): Promise<void> {
  await ensureDb();
  if (!applyRowsToMemory) return;
  const rows = await getAllFromDisk();
  applyRowsToMemory(rows);
}

export async function persistConversationContext(ctx: ConversationContext): Promise<void> {
  const idb = await ensureDb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, "readwrite");
    const request = tx.objectStore(STORE).put(ctx);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deletePersistedConversationContext(conversationId: string): Promise<void> {
  const idb = await ensureDb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, "readwrite");
    const request = tx.objectStore(STORE).delete(conversationId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/** 从磁盘重新灌入内存（与 awaitConversationContextPersistenceReady 行为一致） */
export async function reloadConversationContextsFromDisk(
  applyRowsToMemory: (rows: ConversationContext[]) => void,
): Promise<void> {
  await awaitConversationContextPersistenceReady(applyRowsToMemory);
}
