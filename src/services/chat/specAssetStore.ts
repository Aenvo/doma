/** UI 规格书截图资产（IndexedDB），随会话删除清理 */

export type SpecAssetRecord = {
  id: string;
  conversationId: string;
  componentId?: string;
  state: string;
  mimeType: string;
  blob: Blob;
  width?: number;
  height?: number;
  createdAt: number;
};

const DB_NAME = "stay-spec-assets";
const DB_VERSION = 1;
const STORE = "assets";
const MAX_PER_CONVERSATION = 24;

type DbRow = SpecAssetRecord;

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

export function createSpecAssetId(): string {
  return `spec-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("invalid data url");
  const binary = atob(m[2]!);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

export async function countSpecAssetsByConversation(conversationId: string): Promise<number> {
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

export async function putSpecAsset(
  input: Omit<SpecAssetRecord, "createdAt">,
): Promise<void> {
  const count = await countSpecAssetsByConversation(input.conversationId);
  if (count >= MAX_PER_CONVERSATION) {
    throw new Error(`spec asset limit reached (${MAX_PER_CONVERSATION} per conversation)`);
  }

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

export async function getSpecAsset(id: string): Promise<SpecAssetRecord | undefined> {
  const db = await openDb();
  try {
    return await new Promise<SpecAssetRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as SpecAssetRecord | undefined);
      req.onerror = () => reject(req.error ?? new Error("indexedDB get error"));
    });
  } finally {
    db.close();
  }
}

export async function getSpecAssetDataUrl(id: string): Promise<string | undefined> {
  const record = await getSpecAsset(id);
  if (!record) return undefined;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("read blob failed"));
    reader.readAsDataURL(record.blob);
  });
}

export async function deleteSpecAssetsByConversation(conversationId: string): Promise<void> {
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
