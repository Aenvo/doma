/** 生成扩展文件资产（IndexedDB），随会话删除清理 */

export type ExtensionAssetRecord = {
  id: string;
  conversationId: string;
  /** 扩展包逻辑名（同一次 save 共用） */
  packageName: string;
  path: string;
  mimeType: string;
  blob: Blob;
  createdAt: number;
};

const DB_NAME = "stay-extension-assets";
const DB_VERSION = 1;
const STORE = "assets";
const MAX_PER_CONVERSATION = 80;

type DbRow = ExtensionAssetRecord;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open error"));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id" });
        os.createIndex("conversationId", "conversationId", { unique: false });
        os.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

export function createExtensionAssetId(): string {
  return `ext-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export async function countExtensionAssetsByConversation(conversationId: string): Promise<number> {
  const db = await openDb();
  try {
    return await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const idx = tx.objectStore(STORE).index("conversationId");
      const req = idx.count(IDBKeyRange.only(conversationId));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("indexedDB count error"));
    });
  } finally {
    db.close();
  }
}

async function listExtensionAssetsByConversation(
  conversationId: string,
): Promise<ExtensionAssetRecord[]> {
  const db = await openDb();
  try {
    return await new Promise<ExtensionAssetRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const idx = tx.objectStore(STORE).index("conversationId");
      const req = idx.getAll(IDBKeyRange.only(conversationId));
      req.onsuccess = () => resolve((req.result as ExtensionAssetRecord[]) ?? []);
      req.onerror = () => reject(req.error ?? new Error("indexedDB getAll error"));
    });
  } finally {
    db.close();
  }
}

/** 同会话超限时按 createdAt FIFO 删最早的，腾出 needSlots 个名额 */
async function evictOldestExtensionAssets(
  conversationId: string,
  needSlots: number,
): Promise<void> {
  if (needSlots <= 0) return;
  const rows = await listExtensionAssetsByConversation(conversationId);
  if (rows.length + needSlots <= MAX_PER_CONVERSATION) return;

  const overflow = rows.length + needSlots - MAX_PER_CONVERSATION;
  const victims = [...rows]
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .slice(0, overflow);
  if (!victims.length) return;

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const os = tx.objectStore(STORE);
    for (const v of victims) os.delete(v.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB evict error"));
  });
  db.close();
}

export async function putExtensionAsset(
  input: Omit<ExtensionAssetRecord, "createdAt">,
): Promise<void> {
  await evictOldestExtensionAssets(input.conversationId, 1);

  const db = await openDb();
  const row: DbRow = { ...input, createdAt: Date.now() };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB put error"));
  });
  db.close();
}

export async function getExtensionAsset(id: string): Promise<ExtensionAssetRecord | undefined> {
  const db = await openDb();
  try {
    return await new Promise<ExtensionAssetRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as ExtensionAssetRecord | undefined);
      req.onerror = () => reject(req.error ?? new Error("indexedDB get error"));
    });
  } finally {
    db.close();
  }
}

export async function deleteExtensionAssetsByConversation(conversationId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const os = tx.objectStore(STORE);
    const idx = os.index("conversationId");
    const req = idx.openCursor(IDBKeyRange.only(conversationId));
    req.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (!cursor) return;
      os.delete(cursor.primaryKey);
      cursor.continue();
    };
    req.onerror = () => reject(req.error ?? new Error("indexedDB cursor error"));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB tx error"));
  });
  db.close();
}
