const DB_NAME = 'doma-user-skills';
const DB_VERSION = 2;
const STORE = 'skills';

export type UserSkillDbRow = {
  id: string;
  name: string;
  rawMd: string;
  updatedAt: number;
};

function generateSkillId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `skill-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open error'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (db.objectStoreNames.contains(STORE)) {
        db.deleteObjectStore(STORE);
      }
      const os = db.createObjectStore(STORE, { keyPath: 'id' });
      os.createIndex('name', 'name', { unique: true });
      os.createIndex('updatedAt', 'updatedAt', { unique: false });
    };
    req.onsuccess = () => resolve(req.result);
  });
}

export async function loadUserSkillRows(): Promise<UserSkillDbRow[]> {
  const db = await openDb();
  try {
    return await new Promise<UserSkillDbRow[]>((resolve, reject) => {
      const rows: UserSkillDbRow[] = [];
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).openCursor();
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cursor) {
          resolve(rows);
          return;
        }
        const row = cursor.value as UserSkillDbRow;
        if (row?.id && typeof row.rawMd === 'string') {
          rows.push(row);
        }
        cursor.continue();
      };
      req.onerror = () => reject(req.error ?? new Error('indexedDB cursor error'));
    });
  } finally {
    db.close();
  }
}

export async function getUserSkillRecord(id: string): Promise<UserSkillDbRow | undefined> {
  const db = await openDb();
  try {
    return await new Promise<UserSkillDbRow | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as UserSkillDbRow | undefined);
      req.onerror = () => reject(req.error ?? new Error('indexedDB get error'));
    });
  } finally {
    db.close();
  }
}

export async function saveUserSkillRecord(
  rawMd: string,
  opts?: { id?: string; name?: string },
): Promise<UserSkillDbRow> {
  const db = await openDb();
  const id = opts?.id?.trim() || generateSkillId();
  const row: UserSkillDbRow = {
    id,
    name: opts?.name?.trim() || id,
    rawMd,
    updatedAt: Date.now(),
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(row);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('indexedDB put error'));
    });
    return row;
  } finally {
    db.close();
  }
}

export async function deleteUserSkillRecord(id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('indexedDB delete error'));
    });
  } finally {
    db.close();
  }
}
