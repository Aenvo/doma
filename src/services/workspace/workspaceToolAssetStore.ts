/** Tool 产物短引用（PDF 等），避免把大 base64 塞进模型上下文 */

export type WorkspaceToolAsset = {
  id: string;
  mimeType: string;
  fileName: string;
  blob: Blob;
  conversationId?: string;
  createdAt: number;
};

const DB_NAME = "doma-workspace-tool-assets";
const DB_VERSION = 1;
const STORE = "assets";
const MAX_ASSETS = 40;
const TTL_MS = 2 * 60 * 60 * 1000; // 2h

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open error"));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id" });
        os.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB request failed"));
  });
}

export function createWorkspaceToolAssetId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `wsasset-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`
    : `wsasset-${Date.now().toString(36)}`;
}

async function pruneExpired(db: IDBDatabase): Promise<void> {
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const all = await idbReq(store.getAll() as IDBRequest<WorkspaceToolAsset[]>);
  const now = Date.now();
  const sorted = (all || []).slice().sort((a, b) => a.createdAt - b.createdAt);
  for (const row of sorted) {
    if (now - row.createdAt > TTL_MS) {
      store.delete(row.id);
    }
  }
  // 超限删最旧
  const remain = sorted.filter((r) => now - r.createdAt <= TTL_MS);
  const overflow = remain.length - MAX_ASSETS;
  if (overflow > 0) {
    for (let i = 0; i < overflow; i++) {
      store.delete(remain[i]!.id);
    }
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("prune failed"));
  });
}

export async function putWorkspaceToolAsset(input: {
  blob: Blob;
  mimeType?: string;
  fileName?: string;
  conversationId?: string;
  id?: string;
}): Promise<WorkspaceToolAsset> {
  const db = await openDb();
  try {
    await pruneExpired(db);
    const id = input.id || createWorkspaceToolAssetId();
    const row: WorkspaceToolAsset = {
      id,
      blob: input.blob,
      mimeType: input.mimeType || input.blob.type || "application/octet-stream",
      fileName: (input.fileName || "file.bin").trim() || "file.bin",
      conversationId: input.conversationId,
      createdAt: Date.now(),
    };
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(row);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("put asset failed"));
    });
    return row;
  } finally {
    db.close();
  }
}

export async function getWorkspaceToolAsset(id: string): Promise<WorkspaceToolAsset | null> {
  const key = typeof id === "string" ? id.trim() : "";
  if (!key) return null;
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    const row = await idbReq(
      tx.objectStore(STORE).get(key) as IDBRequest<WorkspaceToolAsset | undefined>,
    );
    if (!row) return null;
    if (Date.now() - row.createdAt > TTL_MS) {
      // 惰性清理
      void deleteWorkspaceToolAsset(key);
      return null;
    }
    return row;
  } finally {
    db.close();
  }
}

export async function deleteWorkspaceToolAsset(id: string): Promise<void> {
  const key = typeof id === "string" ? id.trim() : "";
  if (!key) return;
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("delete asset failed"));
    });
  } finally {
    db.close();
  }
}
