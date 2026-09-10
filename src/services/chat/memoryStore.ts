/**
 * 用户长期 Memory（偏好 / 短事实）— IndexedDB。
 * 不暴露给模型 tool；由 UI / 发送钩子调用。
 */

import { LOCAL_USER_ID } from "../localUserId";

const DB_NAME = "doma-user-memory";
const DB_VERSION = 1;
const STORE = "memories";

/** 受控 key 列表；后续直接往数组追加即可 */
export const MEMORY_KEYS = [
  "locale",
  "reply_style",
  "browser.open_tab_policy",
  "browser.confirm_before_submit",
  "user.timezone",
  "user.diet",
] as const;

export type BuiltinMemoryKey = (typeof MEMORY_KEYS)[number];

export type MemoryCategory =
  | "preference"
  | "profile"
  | "constraint"
  | "site_habit"
  | "other";

export type MemorySource = "explicit" | "implicit" | "auto" | "imported" | "ui";

export type MemoryItem = {
  id: string;
  userId: string;
  category: MemoryCategory;
  /** 稳定槽位名；同 userId+key upsert */
  key: string;
  content: string;
  /** 检索用同义词；注入 prompt 时可不带 */
  aliases: string[];
  source: MemorySource;
  confidence: number;
  /** global 或 site:hostname */
  scope: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
};

export type MemoryWriteInput = {
  key: string;
  content: string;
  category?: MemoryCategory;
  source?: MemorySource;
  confidence?: number;
  scope?: string;
  aliases?: string[];
  /** 若传入且属于当前用户，则更新该 id */
  id?: string;
};

export type MemoryUpdateInput = {
  id?: string;
  key?: string;
  content?: string;
  category?: MemoryCategory;
  confidence?: number;
  scope?: string;
  aliases?: string[];
};

const MAX_CONTENT_LEN = 200;
const KEY_RE = /^[a-z][a-z0-9_.]*$/i;
const SITE_KEY_RE = /^site\.[a-z0-9.-]+\.[a-z0-9_]+$/i;

/** 内置 key → 默认 aliases（写入时未传 aliases 则合并） */
export const MEMORY_KEY_DEFAULT_ALIASES: Partial<Record<BuiltinMemoryKey, string[]>> = {
  locale: ["简体", "中文", "汉语", "English", "语言"],
  reply_style: ["语气", "风格", "简短", "详细"],
  "browser.open_tab_policy": ["新开标签", "新标签", "开标签", "new tab"],
  "browser.confirm_before_submit": ["提交前确认", "确认提交"],
  "user.timezone": ["时区", "timezone"],
  "user.diet": ["素食", "饮食", "过敏"],
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open error"));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id" });
        os.createIndex("userId", "userId", { unique: false });
        os.createIndex("userId_key", ["userId", "key"], { unique: true });
        os.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

function currentUserId(): string {
  return LOCAL_USER_ID;
}

export function createMemoryId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `mem-${crypto.randomUUID()}`
    : `mem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isBuiltinMemoryKey(key: string): key is BuiltinMemoryKey {
  return (MEMORY_KEYS as readonly string[]).includes(key);
}

export function isAllowedMemoryKey(key: string): boolean {
  const k = key.trim();
  if (!k) return false;
  if (isBuiltinMemoryKey(k)) return true;
  if (SITE_KEY_RE.test(k)) return true;
  return KEY_RE.test(k) && k.length <= 64;
}

function normalizeContent(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}

function normalizeAliases(aliases: string[] | undefined, key: string): string[] {
  const fromInput = (aliases ?? []).map((a) => a.trim()).filter(Boolean);
  const defaults =
    isBuiltinMemoryKey(key) ? MEMORY_KEY_DEFAULT_ALIASES[key] ?? [] : [];
  return Array.from(new Set([...defaults, ...fromInput]));
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb request failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("idb tx failed"));
    tx.onabort = () => reject(tx.error ?? new Error("idb tx aborted"));
  });
}

async function getByUserKey(userId: string, key: string): Promise<MemoryItem | undefined> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const idx = tx.objectStore(STORE).index("userId_key");
  const row = await idbReq<MemoryItem | undefined>(idx.get([userId, key]));
  await txDone(tx);
  return row;
}

async function getById(id: string): Promise<MemoryItem | undefined> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const row = await idbReq<MemoryItem | undefined>(tx.objectStore(STORE).get(id));
  await txDone(tx);
  return row;
}

/** 按 key upsert */
export async function memoryWrite(input: MemoryWriteInput): Promise<MemoryItem> {
  const userId = currentUserId();
  const key = input.key.trim();
  const content = normalizeContent(input.content);

  if (!isAllowedMemoryKey(key)) {
    throw new Error(`memory_write: invalid key "${key}"`);
  }
  if (!content) {
    throw new Error("memory_write: content required");
  }
  if (content.length > MAX_CONTENT_LEN) {
    throw new Error(`memory_write: content max ${MAX_CONTENT_LEN} chars`);
  }

  const now = Date.now();
  const existingByKey = await getByUserKey(userId, key);
  let existingById: MemoryItem | undefined;
  if (input.id?.trim()) {
    existingById = await getById(input.id.trim());
    if (existingById && existingById.userId !== userId) {
      throw new Error("memory_write: id not owned by current user");
    }
  }

  const base = existingById ?? existingByKey;
  const item: MemoryItem = {
    id: base?.id ?? createMemoryId(),
    userId,
    key,
    content,
    aliases: normalizeAliases(input.aliases ?? base?.aliases, key),
    category: input.category ?? base?.category ?? "preference",
    source: input.source ?? base?.source ?? "ui",
    confidence:
      typeof input.confidence === "number"
        ? Math.min(1, Math.max(0, input.confidence))
        : (base?.confidence ?? 1),
    scope: (input.scope ?? base?.scope ?? "global").trim() || "global",
    createdAt: base?.createdAt ?? now,
    updatedAt: now,
    lastUsedAt: base?.lastUsedAt,
  };

  if (existingByKey && existingByKey.id !== item.id) {
    await memoryForget({ id: existingByKey.id });
  }

  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(item);
  await txDone(tx);
  return item;
}

export async function memoryUpdate(input: MemoryUpdateInput): Promise<MemoryItem> {
  const userId = currentUserId();
  const id = input.id?.trim();
  const key = input.key?.trim();
  if (!id && !key) {
    throw new Error("memory_update: id or key required");
  }

  let item = id ? await getById(id) : undefined;
  if (!item && key) {
    item = await getByUserKey(userId, key);
  }
  if (!item || item.userId !== userId) {
    throw new Error("memory_update: not found");
  }

  const nextContent =
    input.content !== undefined ? normalizeContent(input.content) : item.content;
  if (!nextContent) {
    throw new Error("memory_update: content empty");
  }
  if (nextContent.length > MAX_CONTENT_LEN) {
    throw new Error(`memory_update: content max ${MAX_CONTENT_LEN} chars`);
  }

  const nextKey = key && key !== item.key ? key : item.key;
  if (nextKey !== item.key) {
    if (!isAllowedMemoryKey(nextKey)) {
      throw new Error(`memory_update: invalid key "${nextKey}"`);
    }
    const clash = await getByUserKey(userId, nextKey);
    if (clash && clash.id !== item.id) {
      await memoryForget({ id: clash.id });
    }
  }

  const updated: MemoryItem = {
    ...item,
    key: nextKey,
    content: nextContent,
    aliases:
      input.aliases !== undefined
        ? normalizeAliases(input.aliases, nextKey)
        : item.aliases?.length
          ? item.aliases
          : normalizeAliases(undefined, nextKey),
    category: input.category ?? item.category,
    confidence:
      typeof input.confidence === "number"
        ? Math.min(1, Math.max(0, input.confidence))
        : item.confidence,
    scope: input.scope !== undefined ? input.scope.trim() || "global" : item.scope,
    updatedAt: Date.now(),
  };

  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(updated);
  await txDone(tx);
  return updated;
}

export async function memoryForget(input: {
  id?: string;
  key?: string;
}): Promise<{ ok: true; forgotten: string[] }> {
  const userId = currentUserId();
  const id = input.id?.trim();
  const key = input.key?.trim();
  if (!id && !key) {
    throw new Error("memory_forget: id or key required");
  }

  const forgotten: string[] = [];
  const targets: MemoryItem[] = [];

  if (id) {
    const row = await getById(id);
    if (row && row.userId === userId) targets.push(row);
  }
  if (key) {
    const row = await getByUserKey(userId, key);
    if (row && !targets.some((t) => t.id === row.id)) targets.push(row);
  }

  if (!targets.length) {
    return { ok: true, forgotten };
  }

  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  for (const row of targets) {
    store.delete(row.id);
    forgotten.push(row.key);
  }
  await txDone(tx);
  return { ok: true, forgotten };
}

export async function memoryList(opts?: {
  scope?: string;
  limit?: number;
}): Promise<MemoryItem[]> {
  const userId = currentUserId();
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const idx = tx.objectStore(STORE).index("userId");
  const rows = (await idbReq<MemoryItem[]>(idx.getAll(userId))) ?? [];
  await txDone(tx);

  let list = rows.filter((r) => r.userId === userId);
  if (opts?.scope) {
    const scope = opts.scope.trim();
    list = list.filter((r) => r.scope === scope || r.scope === "global");
  }
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  const limit = opts?.limit;
  if (typeof limit === "number" && limit >= 0) {
    list = list.slice(0, limit);
  }
  return list;
}

export async function memoryGet(opts: {
  id?: string;
  key?: string;
}): Promise<MemoryItem | undefined> {
  const userId = currentUserId();
  if (opts.id?.trim()) {
    const row = await getById(opts.id.trim());
    return row?.userId === userId ? row : undefined;
  }
  if (opts.key?.trim()) {
    return getByUserKey(userId, opts.key.trim());
  }
  return undefined;
}

export async function memoryTouchLastUsed(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const userId = currentUserId();
  const now = Date.now();
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  for (const id of ids) {
    const row = await idbReq<MemoryItem | undefined>(store.get(id));
    if (row && row.userId === userId) {
      store.put({ ...row, lastUsedAt: now });
    }
  }
  await txDone(tx);
}
