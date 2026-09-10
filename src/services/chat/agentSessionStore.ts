/**
 * Agent 中间过程数据（按 conversationId 隔离）。
 * 对话删除时通过 deleteAgentSessionStoresByConversation 一并清理。
 */

export type AgentSessionStoreRecord = {
  id: string;
  conversationId: string;
  /** json array | json object | text */
  kind: "json" | "text";
  payload: string;
  itemCount: number;
  bytes: number;
  desc?: string;
  createdAt: number;
  updatedAt: number;
};

export type AgentSessionStoreSchema = {
  kind: "text" | "json-array" | "json-object";
  itemCount: number;
  fields?: string[];
  unit: "line" | "item";
};

export type AgentSessionStoreProduceQuery = {
  tool: "browser_store_produce";
  formats: string[];
  examples: unknown[];
};

export type AgentSessionStoreStub = {
  ok: true;
  stored: true;
  storeId: string;
  conversationId: string;
  kind: "json" | "text";
  bytes: number;
  itemCount: number;
  preview: unknown[];
  previewNote: string;
  schema?: AgentSessionStoreSchema;
  query?: AgentSessionStoreProduceQuery;
};

const DB_NAME = "stay-agent-session-store";
const DB_VERSION = 1;
const STORE = "stores";
const ID_PREFIX = "store-";
const MAX_PREVIEW_ITEMS = 3;
const MAX_PREVIEW_CHARS = 300;
const MAX_STORES_PER_CONVERSATION = 32;
const MAX_STORE_BYTES = 8 * 1024 * 1024;

type DbRow = AgentSessionStoreRecord;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open error"));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id" });
        os.createIndex("conversationId", "conversationId", { unique: false });
        os.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

export function createAgentSessionStoreId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `${ID_PREFIX}${crypto.randomUUID()}`
    : `${ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizePayloadInput(data: unknown): { kind: "json" | "text"; payload: string; itemCount: number; bytes: number } {
  if (typeof data === "string") {
    const payload = data;
    const lines = payload.split("\n").filter((l) => l.trim().length > 0);
    return { kind: "text", payload, itemCount: lines.length || (payload.trim() ? 1 : 0), bytes: payload.length };
  }
  const payload = JSON.stringify(data ?? null);
  const itemCount = Array.isArray(data) ? data.length : 1;
  return { kind: "json", payload, itemCount, bytes: payload.length };
}

function buildPreview(record: Pick<AgentSessionStoreRecord, "kind" | "payload" | "itemCount">, scope: "all" | "lastBatch", lastBatchCount?: number): { preview: unknown[]; previewNote: string } {
  if (record.itemCount <= 0) {
    return { preview: [], previewNote: "empty" };
  }

  if (record.kind === "text") {
    const text = record.payload.trim();
    const slice = text.length > MAX_PREVIEW_CHARS ? `${text.slice(0, MAX_PREVIEW_CHARS)}...` : text;
    return { preview: [slice], previewNote: `text preview, ${record.itemCount} line(s)` };
  }

  try {
    const parsed = JSON.parse(record.payload) as unknown;
    if (Array.isArray(parsed)) {
      const count = scope === "lastBatch" && lastBatchCount != null ? lastBatchCount : parsed.length;
      const start = scope === "lastBatch" && lastBatchCount != null ? Math.max(0, parsed.length - lastBatchCount) : 0;
      const sample = parsed.slice(start, start + MAX_PREVIEW_ITEMS);
      const note =
        scope === "lastBatch" && lastBatchCount != null
          ? `first ${sample.length} of last batch (${count} item(s))`
          : `first ${sample.length} of ${parsed.length}`;
      return { preview: sample, previewNote: note };
    }
    return { preview: [parsed], previewNote: "json object preview" };
  } catch {
    const slice = record.payload.slice(0, MAX_PREVIEW_CHARS);
    return { preview: [slice], previewNote: "raw json preview" };
  }
}

function toStub(record: AgentSessionStoreRecord, scope: "all" | "lastBatch" = "all", lastBatchCount?: number): AgentSessionStoreStub {
  const { preview, previewNote } = buildPreview(record, scope, lastBatchCount);
  return {
    ok: true,
    stored: true,
    storeId: record.id,
    conversationId: record.conversationId,
    kind: record.kind,
    bytes: record.bytes,
    itemCount: record.itemCount,
    preview,
    previewNote,
  };
}

async function countByConversation(conversationId: string): Promise<number> {
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

export async function getAgentSessionStore(id: string): Promise<AgentSessionStoreRecord | undefined> {
  const db = await openDb();
  try {
    return await new Promise<AgentSessionStoreRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as AgentSessionStoreRecord | undefined);
      req.onerror = () => reject(req.error ?? new Error("indexedDB get error"));
    });
  } finally {
    db.close();
  }
}

export async function putAgentSessionStore(input: {
  conversationId: string;
  data: unknown;
  storeId?: string;
  desc?: string;
}): Promise<AgentSessionStoreStub> {
  const conversationId = input.conversationId.trim();
  if (!conversationId) throw new Error("conversationId required");

  const id = input.storeId?.startsWith(ID_PREFIX) ? input.storeId : createAgentSessionStoreId();
  const existing = input.storeId ? await getAgentSessionStore(id) : undefined;
  if (existing && existing.conversationId !== conversationId) {
    throw new Error("storeId belongs to another conversation");
  }
  if (!existing) {
    const n = await countByConversation(conversationId);
    if (n >= MAX_STORES_PER_CONVERSATION) {
      throw new Error(`store limit reached (${MAX_STORES_PER_CONVERSATION} per conversation)`);
    }
  }

  const normalized = normalizePayloadInput(input.data);
  if (normalized.bytes > MAX_STORE_BYTES) {
    throw new Error(`store payload too large (max ${MAX_STORE_BYTES} bytes)`);
  }

  const now = Date.now();
  const row: DbRow = {
    id,
    conversationId,
    kind: normalized.kind,
    payload: normalized.payload,
    itemCount: normalized.itemCount,
    bytes: normalized.bytes,
    desc: input.desc?.trim() || existing?.desc,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB put error"));
  });
  db.close();

  const schema = inferStoreSchema(row);
  return { ...toStub(row), schema, query: buildStoreProduceQuery(schema) };
}

export async function appendAgentSessionStore(input: {
  conversationId: string;
  storeId: string;
  data: unknown;
}): Promise<AgentSessionStoreStub & { appended: number }> {
  const conversationId = input.conversationId.trim();
  const storeId = input.storeId.trim();
  const record = await getAgentSessionStore(storeId);
  if (!record) throw new Error("store not found");
  if (record.conversationId !== conversationId) throw new Error("storeId belongs to another conversation");

  const incoming = normalizePayloadInput(input.data);
  let nextKind = record.kind;
  let nextPayload = record.payload;
  let appended = 0;

  if (record.kind === "json" && incoming.kind === "json") {
    const base = JSON.parse(record.payload) as unknown;
    const add = JSON.parse(incoming.payload) as unknown;
    if (Array.isArray(base) && Array.isArray(add)) {
      appended = add.length;
      nextPayload = JSON.stringify([...base, ...add]);
    } else if (Array.isArray(base)) {
      appended = 1;
      nextPayload = JSON.stringify([...base, add]);
    } else {
      appended = 1;
      nextPayload = JSON.stringify([base, add]);
    }
    nextKind = "json";
  } else {
    appended = incoming.itemCount || 1;
    nextKind = "text";
    nextPayload = record.payload ? `${record.payload}\n${incoming.payload}` : incoming.payload;
  }

  const bytes = nextPayload.length;
  if (bytes > MAX_STORE_BYTES) throw new Error(`store payload too large (max ${MAX_STORE_BYTES} bytes)`);

  const updated: DbRow = {
    ...record,
    kind: nextKind,
    payload: nextPayload,
    itemCount: record.itemCount + appended,
    bytes,
    updatedAt: Date.now(),
  };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(updated);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB put error"));
  });
  db.close();

  const appendedSchema = inferStoreSchema(updated);
  return { ...toStub(updated, "lastBatch", appended), appended, schema: appendedSchema, query: buildStoreProduceQuery(appendedSchema) };
}

export async function readAgentSessionStoreSlice(input: {
  conversationId: string;
  storeId: string;
  offset?: number;
  limit?: number;
}): Promise<{
  ok: true;
  storeId: string;
  kind: "json" | "text";
  rows?: unknown[];
  text?: string;
  pagination: { total: number; offset: number; returned: number; hasMore: boolean; nextOffset: number | null };
}> {
  const conversationId = input.conversationId.trim();
  const storeId = input.storeId.trim();
  const offset = Math.max(0, Math.floor(input.offset ?? 0));
  const limit = Math.min(500, Math.max(1, Math.floor(input.limit ?? 50)));

  const record = await getAgentSessionStore(storeId);
  if (!record) throw new Error("store not found");
  if (record.conversationId !== conversationId) throw new Error("storeId belongs to another conversation");

  if (record.kind === "text") {
    const lines = record.payload.split("\n");
    const slice = lines.slice(offset, offset + limit);
    const returned = slice.length;
    const total = lines.length;
    const hasMore = offset + returned < total;
    return {
      ok: true,
      storeId,
      kind: "text",
      text: slice.join("\n"),
      pagination: {
        total,
        offset,
        returned,
        hasMore,
        nextOffset: hasMore ? offset + returned : null,
      },
    };
  }

  const parsed = JSON.parse(record.payload) as unknown;
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  const slice = arr.slice(offset, offset + limit);
  const returned = slice.length;
  const total = arr.length;
  const hasMore = offset + returned < total;
  return {
    ok: true,
    storeId,
    kind: "json",
    rows: slice,
    pagination: {
      total,
      offset,
      returned,
      hasMore,
      nextOffset: hasMore ? offset + returned : null,
    },
  };
}

const STORE_PRODUCE_MAX_DISPLAY = 2048;
const STORE_PRODUCE_FORMATS = ["json", "csv", "markdown", "jsonl", "text"] as const;
export type AgentSessionStoreProduceFormat = (typeof STORE_PRODUCE_FORMATS)[number];

function inferStoreSchema(record: AgentSessionStoreRecord): AgentSessionStoreSchema {
  if (record.kind === "text") {
    return { kind: "text", itemCount: record.itemCount, unit: "line" };
  }
  try {
    const parsed = JSON.parse(record.payload) as unknown;
    if (Array.isArray(parsed)) {
      const fields =
        parsed.length > 0 && parsed[0] && typeof parsed[0] === "object" && !Array.isArray(parsed[0])
          ? Object.keys(parsed[0] as object)
          : undefined;
      return { kind: "json-array", itemCount: parsed.length, fields, unit: "item" };
    }
    return { kind: "json-object", itemCount: 1, unit: "item" };
  } catch {
    return { kind: "text", itemCount: record.itemCount, unit: "line" };
  }
}

function buildStoreProduceQuery(schema: AgentSessionStoreSchema): AgentSessionStoreProduceQuery {
  const example: Record<string, unknown> = {
    delivery: "download",
    fileName: "export.csv",
  };
  if (schema.kind === "json-array" && schema.fields?.length) {
    example.format = "csv";
    example.fields = schema.fields.slice(0, 6);
  } else if (schema.kind === "text") {
    example.format = "text";
  } else {
    example.format = "json";
  }
  return {
    tool: "browser_store_produce" as const,
    formats: [...STORE_PRODUCE_FORMATS],
    examples: [example, { ...example, delivery: "display", format: example.format }],
  };
}

function normalizeStoreFields(fields?: string[]): string[] | undefined {
  if (!fields?.length) return undefined;
  const out = fields.map((f) => f.trim()).filter(Boolean);
  return out.length > 0 ? out : undefined;
}

function projectStoreRows(rows: unknown[], fields?: string[]): unknown[] {
  const keys = normalizeStoreFields(fields);
  if (!keys) return rows;
  return rows.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return row;
    const src = row as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      if (k in src) out[k] = src[k];
    }
    return out;
  });
}

function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows: unknown[], fields?: string[]): string {
  if (rows.length === 0) return "";
  const projected = projectStoreRows(rows, fields) as Record<string, unknown>[];
  const headers =
    normalizeStoreFields(fields) ??
    (projected[0] && typeof projected[0] === "object" ? Object.keys(projected[0]) : ["value"]);
  const lines = [headers.join(",")];
  for (const row of projected) {
    if (!row || typeof row !== "object") {
      lines.push(csvEscape(row));
      continue;
    }
    lines.push(headers.map((h) => csvEscape((row as Record<string, unknown>)[h])).join(","));
  }
  return lines.join("\n");
}

function rowsToMarkdown(rows: unknown[], fields?: string[]): string {
  if (rows.length === 0) return "";
  const projected = projectStoreRows(rows, fields) as Record<string, unknown>[];
  const headers =
    normalizeStoreFields(fields) ??
    (projected[0] && typeof projected[0] === "object" ? Object.keys(projected[0]) : ["value"]);
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const head = `| ${headers.join(" | ")} |`;
  const body = projected.map((row) => {
    if (!row || typeof row !== "object") return `| ${String(row ?? "")} |`;
    return `| ${headers.map((h) => String((row as Record<string, unknown>)[h] ?? "").replace(/\|/g, "\\|")).join(" | ")} |`;
  });
  return [head, sep, ...body].join("\n");
}

function formatStorePayload(
  record: AgentSessionStoreRecord,
  input: { format?: string; fields?: string[] },
): { content: string; mimeType: string; extension: string } {
  const format = (input.format?.trim().toLowerCase() || (record.kind === "text" ? "text" : "json")) as AgentSessionStoreProduceFormat;

  if (record.kind === "text") {
    return { content: record.payload, mimeType: "text/plain", extension: "txt" };
  }

  const parsed = JSON.parse(record.payload) as unknown;
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const projected = projectStoreRows(rows, input.fields);

  switch (format) {
    case "csv":
      return { content: rowsToCsv(projected, input.fields), mimeType: "text/csv", extension: "csv" };
    case "markdown":
      return { content: rowsToMarkdown(projected, input.fields), mimeType: "text/markdown", extension: "md" };
    case "jsonl":
      return {
        content: projected.map((r) => JSON.stringify(r)).join("\n"),
        mimeType: "application/x-ndjson",
        extension: "jsonl",
      };
    case "text":
      return {
        content: projected.map((r) => (typeof r === "string" ? r : JSON.stringify(r))).join("\n"),
        mimeType: "text/plain",
        extension: "txt",
      };
    case "json":
    default:
      return {
        content: JSON.stringify(projected, null, 2),
        mimeType: "application/json",
        extension: "json",
      };
  }
}

export async function produceAgentSessionStore(input: {
  conversationId: string;
  storeId: string;
  format?: string;
  fields?: string[];
  delivery: "display" | "download";
  fileName?: string;
  maxDisplayChars?: number;
}): Promise<Record<string, unknown>> {
  const conversationId = input.conversationId.trim();
  const storeId = input.storeId.trim();
  const delivery = input.delivery === "display" ? "display" : "download";
  const maxDisplay = Math.min(
    8192,
    Math.max(200, Math.floor(input.maxDisplayChars ?? STORE_PRODUCE_MAX_DISPLAY)),
  );

  const record = await getAgentSessionStore(storeId);
  if (!record) throw new Error("store not found");
  if (record.conversationId !== conversationId) throw new Error("storeId belongs to another conversation");

  const { content, mimeType, extension } = formatStorePayload(record, {
    format: input.format,
    fields: input.fields,
  });
  const fileName =
    input.fileName?.trim() ||
    `store-${storeId.replace(/^store-/, "").slice(0, 8)}.${extension}`;

  if (delivery === "download") {
    return {
      ok: true,
      delivery: "download",
      storeId,
      fileName,
      mimeType,
      bytes: content.length,
      itemCount: record.itemCount,
      content,
      note: "Full payload prepared for download; do not echo content in assistant reply.",
    };
  }

  if (content.length <= maxDisplay) {
    return {
      ok: true,
      delivery: "display",
      storeId,
      format: input.format ?? (record.kind === "text" ? "text" : "json"),
      bytes: content.length,
      itemCount: record.itemCount,
      content,
    };
  }

  return {
    ok: true,
    delivery: "display",
    storeId,
    truncated: true,
    bytes: content.length,
    itemCount: record.itemCount,
    preview: content.slice(0, maxDisplay) + "...",
    note: `Content too large for display (${content.length} chars). Use delivery=download with fileName.`,
  };
}

export async function deleteAgentSessionStoresByConversation(conversationId: string): Promise<void> {
  const cid = conversationId.trim();
  if (!cid) return;

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const os = tx.objectStore(STORE);
    const idx = os.index("conversationId");
    const req = idx.openCursor(IDBKeyRange.only(cid));
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
