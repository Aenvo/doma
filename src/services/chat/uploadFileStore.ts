export type UploadFileRecord = {
  /** short-lived id (file-...) */
  id: string;
  blob: Blob;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  createdAt: number;
  /** sidepanel 预解析的表格行（避免 service worker 加载 xlsx） */
  parsedSheets?: Array<{ name: string; rows: string[][] }>;
};

const DB_NAME = "stay-upload-files";
const DB_VERSION = 1;
const STORE = "files";

const MAX_RECORDS = 40;
const TTL_MS = 30 * 60 * 1000; // 30 minutes

type DbRow = UploadFileRecord;

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

async function pruneDb(db: IDBDatabase): Promise<void> {
  const now = Date.now();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const os = tx.objectStore(STORE);
    const idx = os.index("createdAt");
    const remaining: Array<{ id: string; createdAt: number }> = [];

    const req = idx.openCursor();
    req.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (!cursor) {
        // size cap: remove oldest extras (still within same transaction)
        if (remaining.length > MAX_RECORDS) {
          remaining.sort((a, b) => a.createdAt - b.createdAt);
          const remove = remaining.slice(0, remaining.length - MAX_RECORDS);
          for (const r of remove) os.delete(r.id);
        }
        return;
      }
      const row = cursor.value as DbRow;
      if (now - row.createdAt > TTL_MS) {
        os.delete(row.id);
      } else {
        remaining.push({ id: row.id, createdAt: row.createdAt });
      }
      cursor.continue();
    };
    req.onerror = () => reject(req.error ?? new Error("indexedDB cursor error"));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB tx error"));
  });
}

export async function putUploadFiles(
  records: Omit<UploadFileRecord, "createdAt" | "blob">[] & { blob?: never },
  blobs: { id: string; blob: Blob }[] = [],
): Promise<void> {
  const db = await openDb();
  const now = Date.now();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const os = tx.objectStore(STORE);
    const blobById = new Map(blobs.map((b) => [b.id, b.blob] as const));
    for (const r of records as any[]) {
      const blob = blobById.get(r.id);
      if (!blob) continue;
      const row: DbRow = { ...r, blob, createdAt: now };
      os.put(row);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB tx error"));
  });
  await pruneDb(db);
  db.close();
}

export async function putUploadBlobs(
  records: Array<{
    id: string;
    blob: Blob;
    name: string;
    type: string;
    size: number;
    lastModified: number;
  }>,
): Promise<void> {
  const db = await openDb();
  const now = Date.now();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const os = tx.objectStore(STORE);
    for (const r of records) {
      const row: DbRow = { ...r, createdAt: now };
      os.put(row);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB tx error"));
  });
  await pruneDb(db);
  db.close();
}

export async function getUploadFile(fileId: string): Promise<UploadFileRecord | undefined> {
  const db = await openDb();
  const row = await new Promise<DbRow | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(fileId);
    req.onsuccess = () => resolve(req.result as DbRow | undefined);
    req.onerror = () => reject(req.error ?? new Error("indexedDB get error"));
  });
  // prune lazily
  try {
    await pruneDb(db);
  } catch {
    /* ignore */
  } finally {
    db.close();
  }
  if (!row) return undefined;
  if (Date.now() - row.createdAt > TTL_MS) return undefined;
  return row;
}

export async function mergeUploadParsedSheets(
  fileId: string,
  parsedSheets: Array<{ name: string; rows: string[][] }>,
): Promise<boolean> {
  const db = await openDb();
  try {
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const os = tx.objectStore(STORE);
      const req = os.get(fileId);
      let found = false;
      req.onsuccess = () => {
        const row = req.result as DbRow | undefined;
        if (!row) return;
        found = true;
        row.parsedSheets = parsedSheets;
        os.put(row);
      };
      req.onerror = () => reject(req.error ?? new Error("indexedDB get error"));
      tx.oncomplete = () => resolve(found);
      tx.onerror = () => reject(tx.error ?? new Error("indexedDB tx error"));
    });
  } finally {
    db.close();
  }
}

export async function deleteUploadFile(fileId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(fileId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB delete error"));
  });
  db.close();
}

