/**
 * 侧栏 IndexedDB：按 conversationId 持久化 Context Usage。
 * 仅 popup/ChatPanel 使用，与 chatStorage / SW 解耦。
 */

import type { PersistedContextUsage } from "./contextUsageTypes";

const DB_NAME = "DomA_ContextUsageDB";
const DB_VERSION = 1;
const STORE = "usage";

export type StoredContextUsageRow = PersistedContextUsage & {
  conversationId: string;
};

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

export async function persistContextUsageRow(
  conversationId: string,
  data: PersistedContextUsage,
): Promise<void> {
  const id = conversationId.trim();
  if (!id) return;
  const idb = await ensureDb();
  const row: StoredContextUsageRow = { conversationId: id, ...data };
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, "readwrite");
    const request = tx.objectStore(STORE).put(row);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function loadContextUsageRow(
  conversationId: string,
): Promise<PersistedContextUsage | null> {
  const id = conversationId.trim();
  if (!id) return null;
  const idb = await ensureDb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(id);
    request.onsuccess = () => {
      const row = request.result as StoredContextUsageRow | undefined;
      if (!row || typeof row !== "object") {
        resolve(null);
        return;
      }
      const { conversationId: _cid, ...rest } = row;
      resolve(rest);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteContextUsageRow(conversationId: string): Promise<void> {
  const id = conversationId.trim();
  if (!id) return;
  const idb = await ensureDb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, "readwrite");
    const request = tx.objectStore(STORE).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
