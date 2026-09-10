/**
 * Context spill — 大 payload 外置（与 agentSessionStore 的 store 分离）。
 * tool result 原样写入；schema 在 put 时从真实结构推断并持久化，供 get/produce 默认使用。
 */

import { buildSpillPreview } from "./spillPreviewUtils";
import {
  inferSpillSchema,
  isStringArray,
  resolveSpillReadArray,
  type SpillPayloadSchema,
} from "./spillPayloadUtils";

export type ContextSpillRecord = {
  id: string;
  conversationId: string;
  source: "tool_result" | "tool_args" | "user_content";
  toolName?: string;
  payload: string;
  bytes: number;
  createdAt: number;
  /** stub 时推断的结构描述（arrayPath / fields / valueColumn） */
  schema?: SpillPayloadSchema;
};

const DB_NAME = "stay-context-spill";
const DB_VERSION = 1;
const STORE = "spills";
const ID_PREFIX = "spill-";
const MAX_SPILL_BYTES = 8 * 1024 * 1024;
const SPILL_DEFAULT_LIMIT = 50;
const SPILL_MAX_LIMIT = 500;
const SPILL_GREP_DEFAULT_CONTEXT = 80;
const SPILL_GREP_MAX_CONTEXT = 500;
const SPILL_GREP_DEFAULT_LIMIT = 20;
const SPILL_GREP_MAX_LIMIT = 100;
const SPILL_MAX_FULL_BYTES = 512 * 1024;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type SpillGrepMatch = {
  index: number;
  match: string;
  snippet: string;
};

function buildGrepSnippet(text: string, start: number, end: number, contextChars: number): string {
  const ctx = Math.min(SPILL_GREP_MAX_CONTEXT, Math.max(0, contextChars));
  const snippetStart = Math.max(0, start - ctx);
  const snippetEnd = Math.min(text.length, end + ctx);
  let snippet = text.slice(snippetStart, snippetEnd);
  if (snippetStart > 0) snippet = `...${snippet}`;
  if (snippetEnd < text.length) snippet = `${snippet}...`;
  return snippet;
}

function grepText(
  text: string,
  input: { pattern: string; contextChars?: number; limit?: number; ignoreCase?: boolean },
): {
  matches: SpillGrepMatch[];
  returned: number;
  hasMore: boolean;
} {
  const pattern = input.pattern.trim();
  if (!pattern) throw new Error("grep pattern required");

  const contextChars = Math.min(
    SPILL_GREP_MAX_CONTEXT,
    Math.max(0, Math.floor(input.contextChars ?? SPILL_GREP_DEFAULT_CONTEXT)),
  );
  const limit = Math.min(SPILL_GREP_MAX_LIMIT, Math.max(1, Math.floor(input.limit ?? SPILL_GREP_DEFAULT_LIMIT)));
  const flags = input.ignoreCase ? "gi" : "g";

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags);
  } catch {
    regex = new RegExp(escapeRegExp(pattern), flags);
  }

  const matches: SpillGrepMatch[] = [];
  let m: RegExpExecArray | null;
  regex.lastIndex = 0;

  while ((m = regex.exec(text)) !== null) {
    if (matches.length >= limit) {
      return { matches, returned: matches.length, hasMore: true };
    }
    const start = m.index;
    const end = start + m[0].length;
    matches.push({
      index: start,
      match: m[0],
      snippet: buildGrepSnippet(text, start, end, contextChars),
    });
    if (m[0].length === 0) regex.lastIndex++;
  }

  return { matches, returned: matches.length, hasMore: false };
}

export type ContextSpillReadMode = "slice" | "peek" | "tail" | "full" | "grep";

export type ContextSpillPagination = {
  total: number;
  offset: number;
  returned: number;
  hasMore: boolean;
  nextOffset: number | null;
};

function parseSpillPayload(payload: string): {
  kind: "json-array" | "json-object" | "text" | "json-scalar";
  value: unknown;
} {
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (Array.isArray(parsed)) return { kind: "json-array", value: parsed };
    if (parsed && typeof parsed === "object") return { kind: "json-object", value: parsed };
    return { kind: "json-scalar", value: parsed };
  } catch {
    return { kind: "text", value: payload };
  }
}

function spillPreviewFromPayload(payload: string, schema?: SpillPayloadSchema): { preview: unknown[]; itemCount: number; kind: string } {
  const parsed = parseSpillPayload(payload);
  if (parsed.kind === "text") {
    const { preview, itemCount } = buildSpillPreview(parsed.value as string);
    return {
      kind: "text",
      preview,
      itemCount: itemCount ?? 0,
    };
  }

  const readArray = resolveSpillReadArray(parsed, schema?.arrayPath);
  if (readArray && readArray.items.length > 0) {
    const { preview } = buildSpillPreview(readArray.items);
    return {
      kind: "json-array",
      preview,
      itemCount: readArray.items.length,
    };
  }

  if (parsed.kind === "json-array") {
    const arr = parsed.value as unknown[];
    const { preview } = buildSpillPreview(arr);
    return {
      kind: "json-array",
      preview,
      itemCount: arr.length,
    };
  }

  const { preview, itemCount } = buildSpillPreview(parsed.value);
  return {
    kind: parsed.kind,
    preview,
    itemCount: itemCount ?? 1,
  };
}

function resolveRecordSchema(record: ContextSpillRecord): SpillPayloadSchema {
  let fresh: SpillPayloadSchema;
  try {
    fresh = inferSpillSchema(JSON.parse(record.payload));
  } catch {
    fresh = inferSpillSchema(record.payload);
  }
  if (!record.schema) return fresh;
  // 旧 spill 可能缓存了帧包装数组的错误 schema（itemCount=1），优先用重新推断结果
  if (
    (fresh.itemCount ?? 0) > (record.schema.itemCount ?? 0) ||
    (fresh.arrayPath && fresh.arrayPath !== record.schema.arrayPath)
  ) {
    return fresh;
  }
  return record.schema;
}

function resolveSpillArrayPath(record: ContextSpillRecord, path?: string): string | undefined {
  const explicit = path?.trim();
  if (explicit) return explicit;
  const schema = resolveRecordSchema(record);
  return schema.arrayPath?.trim() || undefined;
}

function spillPagination(total: number, offset: number, returned: number): ContextSpillPagination {
  const hasMore = offset + returned < total;
  return {
    total,
    offset,
    returned,
    hasMore,
    nextOffset: hasMore ? offset + returned : null,
  };
}

function normalizeSpillFields(fields?: string[]): string[] | undefined {
  if (!fields?.length) return undefined;
  const out = fields.map((f) => f.trim()).filter(Boolean);
  return out.length > 0 ? out : undefined;
}

function projectSpillRows(rows: unknown[], fields?: string[]): unknown[] {
  const keys = normalizeSpillFields(fields);
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

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open error"));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id" });
        os.createIndex("conversationId", "conversationId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

export function createContextSpillId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `${ID_PREFIX}${crypto.randomUUID()}`
    : `${ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function putContextSpill(input: {
  conversationId: string;
  payload: unknown;
  source: "tool_result" | "tool_args" | "user_content";
  toolName?: string;
  schema?: SpillPayloadSchema;
}): Promise<string> {
  const conversationId = input.conversationId.trim();
  if (!conversationId) throw new Error("conversationId required");

  const rawPayload = input.payload;
  const payload =
    typeof rawPayload === "string" ? rawPayload : JSON.stringify(rawPayload ?? null);
  if (payload.length > MAX_SPILL_BYTES) {
    throw new Error(`spill payload too large (max ${MAX_SPILL_BYTES} bytes)`);
  }

  const schema = input.schema ?? inferSpillSchema(rawPayload);

  const id = createContextSpillId();
  const row: ContextSpillRecord = {
    id,
    conversationId,
    source: input.source,
    toolName: input.toolName?.trim() || undefined,
    payload,
    bytes: payload.length,
    createdAt: Date.now(),
    schema,
  };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB put error"));
  });
  db.close();
  return id;
}

export async function getContextSpill(spillRef: string): Promise<ContextSpillRecord | null> {
  const id = spillRef.trim();
  if (!id) return null;

  const db = await openDb();
  const row = await new Promise<ContextSpillRecord | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as ContextSpillRecord | undefined);
    req.onerror = () => reject(req.error ?? new Error("indexedDB get error"));
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB tx error"));
  });
  db.close();
  return row ?? null;
}

export async function readContextSpillSlice(input: {
  conversationId: string;
  spillRef: string;
  mode?: ContextSpillReadMode;
  offset?: number;
  limit?: number;
  /** json-array：只返回指定字段，减小 payload */
  fields?: string[];
  /** object 内嵌数组时的键名，如 elements；省略则自动探测 */
  path?: string;
  /** mode=grep：搜索 pattern（支持正则；非法正则则按字面量） */
  pattern?: string;
  contextChars?: number;
  ignoreCase?: boolean;
}): Promise<Record<string, unknown>> {
  const conversationId = input.conversationId.trim();
  const spillRef = input.spillRef.trim();
  const mode = input.mode ?? "slice";
  const offset = Math.max(0, Math.floor(input.offset ?? 0));
  const sliceLimit = Math.min(SPILL_MAX_LIMIT, Math.max(1, Math.floor(input.limit ?? SPILL_DEFAULT_LIMIT)));
  const grepLimit = Math.min(
    SPILL_GREP_MAX_LIMIT,
    Math.max(1, Math.floor(input.limit ?? SPILL_GREP_DEFAULT_LIMIT)),
  );
  const fields = normalizeSpillFields(input.fields);

  const record = await getContextSpill(spillRef);
  if (!record) throw new Error("spill not found");
  if (record.conversationId !== conversationId) throw new Error("spillRef belongs to another conversation");

  const schema = resolveRecordSchema(record);
  const { preview, itemCount, kind } = spillPreviewFromPayload(record.payload, schema);
  const base: Record<string, unknown> = {
    spillRef: record.id,
    source: record.source,
    toolName: record.toolName,
    bytes: record.bytes,
    kind,
    schema,
  };
  if (fields) base.fields = fields;
  const path = resolveSpillArrayPath(record, input.path);
  if (path) base.path = path;

  if (mode === "grep") {
    const pattern = input.pattern?.trim();
    if (!pattern) throw new Error("mode=grep requires pattern");
    const parsed = parseSpillPayload(record.payload);
    if (parsed.kind !== "text") {
      throw new Error("mode=grep only applies to text spills");
    }
    const text = parsed.value as string;
    const { matches, returned, hasMore } = grepText(text, {
      pattern,
      contextChars: input.contextChars,
      limit: grepLimit,
      ignoreCase: input.ignoreCase,
    });
    return {
      ok: true,
      ...base,
      pattern,
      contextChars: Math.min(
        SPILL_GREP_MAX_CONTEXT,
        Math.max(0, Math.floor(input.contextChars ?? SPILL_GREP_DEFAULT_CONTEXT)),
      ),
      matches,
      pagination: {
        total: text.length,
        offset: 0,
        returned,
        hasMore,
        nextOffset: null,
      },
      grepNote: "each match includes snippet with contextChars before/after hit; adjust pattern, contextChars, or limit",
    };
  }

  if (mode === "peek") {
    const peekPreview =
      kind === "json-array" ? projectSpillRows(preview as unknown[], fields) : preview;
    return {
      ok: true,
      ...base,
      itemCount,
      preview: peekPreview,
      previewNote: fields
        ? "peek with field projection; use mode=slice+fields to read pages"
        : "peek only; use mode=slice/tail/full to read payload",
    };
  }

  const parsed = parseSpillPayload(record.payload);

  const readArray = resolveSpillReadArray(parsed, path);

  if (mode === "full") {
    if (record.bytes > SPILL_MAX_FULL_BYTES && !fields && !readArray) {
      throw new Error(
        `spill too large for full mode (${record.bytes} bytes, max ${SPILL_MAX_FULL_BYTES}); use mode=slice with offset/limit and fields`,
      );
    }
    if (readArray) {
      const rows = projectSpillRows(readArray.items, fields);
      return {
        ok: true,
        ...base,
        itemCount: rows.length,
        rows,
        ...(readArray.arrayPath ? { path: readArray.arrayPath } : {}),
      };
    }
    if (parsed.kind === "json-array") {
      const rows = projectSpillRows(parsed.value as unknown[], fields);
      return { ok: true, ...base, itemCount: rows.length, rows };
    }
    if (parsed.kind === "text") {
      return { ok: true, ...base, itemCount, text: parsed.value };
    }
    return { ok: true, ...base, itemCount: 1, data: parsed.value };
  }

  if (readArray) {
    const arr = readArray.items;
    const effectiveOffset = mode === "tail" ? Math.max(0, arr.length - sliceLimit) : offset;
    const slice = projectSpillRows(arr.slice(effectiveOffset, effectiveOffset + sliceLimit), fields);
    const returned = slice.length;
    return {
      ok: true,
      ...base,
      rows: slice,
      ...(readArray.arrayPath ? { path: readArray.arrayPath } : {}),
      pagination: spillPagination(arr.length, effectiveOffset, returned),
    };
  }

  if (parsed.kind === "json-array") {
    const arr = parsed.value as unknown[];
    const effectiveOffset = mode === "tail" ? Math.max(0, arr.length - sliceLimit) : offset;
    const slice = projectSpillRows(arr.slice(effectiveOffset, effectiveOffset + sliceLimit), fields);
    const returned = slice.length;
    return {
      ok: true,
      ...base,
      rows: slice,
      pagination: spillPagination(arr.length, effectiveOffset, returned),
    };
  }

  if (parsed.kind === "text") {
    const lines = (parsed.value as string).split("\n");
    const effectiveOffset = mode === "tail" ? Math.max(0, lines.length - sliceLimit) : offset;
    const slice = lines.slice(effectiveOffset, effectiveOffset + sliceLimit);
    const returned = slice.length;
    return {
      ok: true,
      ...base,
      text: slice.join("\n"),
      pagination: spillPagination(lines.length, effectiveOffset, returned),
    };
  }

  if (mode === "tail" || offset > 0) {
    throw new Error("tail/slice pagination only applies to json-array or text spills");
  }

  return {
    ok: true,
    ...base,
    itemCount: 1,
    data: parsed.value,
    pagination: spillPagination(1, 0, 1),
  };
}

const SPILL_PRODUCE_MAX_DISPLAY = 2048;
const SPILL_PRODUCE_FORMATS = ["json", "csv", "markdown", "jsonl", "text"] as const;
export type ContextSpillProduceFormat = (typeof SPILL_PRODUCE_FORMATS)[number];

function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows: unknown[], fields?: string[], valueColumn = "value"): string {
  if (rows.length === 0) return "";
  const stringRows = isStringArray(rows);
  if (stringRows) {
    const col = valueColumn || "value";
    return [col, ...rows.map((r) => csvEscape(r))].join("\n");
  }
  const projected = projectSpillRows(rows, fields) as Record<string, unknown>[];
  const headers =
    normalizeSpillFields(fields) ??
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
  const projected = projectSpillRows(rows, fields) as Record<string, unknown>[];
  const headers =
    normalizeSpillFields(fields) ??
    (projected[0] && typeof projected[0] === "object" ? Object.keys(projected[0]) : ["value"]);
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const head = `| ${headers.join(" | ")} |`;
  const body = projected.map((row) => {
    if (!row || typeof row !== "object") return `| ${String(row ?? "")} |`;
    return `| ${headers.map((h) => String((row as Record<string, unknown>)[h] ?? "").replace(/\|/g, "\\|")).join(" | ")} |`;
  });
  return [head, sep, ...body].join("\n");
}

function formatSpillPayload(
  record: ContextSpillRecord,
  input: { format?: string; fields?: string[]; path?: string },
): { content: string; mimeType: string; extension: string; itemCount: number; kind: string; schema: SpillPayloadSchema; path?: string } {
  const format = (input.format?.trim().toLowerCase() || "json") as ContextSpillProduceFormat;
  const schema = resolveRecordSchema(record);
  const effectivePath = resolveSpillArrayPath(record, input.path);
  const parsed = parseSpillPayload(record.payload);
  const readArray = resolveSpillReadArray(parsed, effectivePath);
  const effectiveFields = input.fields ?? schema.fields;
  const valueColumn = schema.valueColumn ?? "value";

  if (parsed.kind === "text") {
    const text = parsed.value as string;
    switch (format) {
      case "csv":
        return {
          content: text.split("\n").map((line) => csvEscape(line.trim())).join("\n"),
          mimeType: "text/csv",
          extension: "csv",
          itemCount: text.split("\n").filter(Boolean).length,
          kind: "text",
          schema,
        };
      case "jsonl":
        return {
          content: text.split("\n").filter(Boolean).map((line) => JSON.stringify(line)).join("\n"),
          mimeType: "application/x-ndjson",
          extension: "jsonl",
          itemCount: text.split("\n").filter(Boolean).length,
          kind: "text",
          schema,
        };
      case "json":
        return {
          content: JSON.stringify(text.split("\n").filter(Boolean), null, 2),
          mimeType: "application/json",
          extension: "json",
          itemCount: text.split("\n").filter(Boolean).length,
          kind: "text",
          schema,
        };
      case "markdown":
        return {
          content: text.split("\n").filter(Boolean).map((line) => `- ${line}`).join("\n"),
          mimeType: "text/markdown",
          extension: "md",
          itemCount: text.split("\n").filter(Boolean).length,
          kind: "text",
          schema,
        };
      case "text":
      default:
        return {
          content: text,
          mimeType: "text/plain",
          extension: "txt",
          itemCount: text.split("\n").filter(Boolean).length,
          kind: "text",
          schema,
        };
    }
  }

  let rows: unknown[];
  if (readArray) {
    rows = readArray.items;
  } else if (parsed.kind === "json-array") {
    rows = parsed.value as unknown[];
  } else if (schema.kind === "json-array" && (schema.itemCount ?? 0) > 1) {
    throw new Error(
      `cannot resolve spill array (${schema.itemCount} items expected at ${schema.arrayPath ?? "auto"}); pass path matching schema.arrayPath`,
    );
  } else {
    rows = [parsed.value];
  }

  const projected = isStringArray(rows) ? rows : projectSpillRows(rows, effectiveFields);
  const itemCount = rows.length;
  const outBase = {
    itemCount,
    kind: readArray || parsed.kind === "json-array" ? "json-array" : parsed.kind,
    schema,
    path: effectivePath,
  };

  switch (format) {
    case "csv":
      return { content: rowsToCsv(projected, effectiveFields, valueColumn), mimeType: "text/csv", extension: "csv", ...outBase };
    case "markdown":
      return { content: rowsToMarkdown(projected, effectiveFields), mimeType: "text/markdown", extension: "md", ...outBase };
    case "jsonl":
      return {
        content: projected.map((r) => JSON.stringify(r)).join("\n"),
        mimeType: "application/x-ndjson",
        extension: "jsonl",
        ...outBase,
      };
    case "text":
      return {
        content: projected.map((r) => (typeof r === "string" ? r : JSON.stringify(r))).join("\n"),
        mimeType: "text/plain",
        extension: "txt",
        ...outBase,
      };
    case "json":
    default:
      return {
        content: JSON.stringify(projected, null, 2),
        mimeType: "application/json",
        extension: "json",
        ...outBase,
      };
  }
}

export async function produceContextSpill(input: {
  conversationId: string;
  spillRef: string;
  format?: string;
  fields?: string[];
  path?: string;
  delivery: "display" | "download";
  fileName?: string;
  maxDisplayChars?: number;
}): Promise<Record<string, unknown>> {
  const conversationId = input.conversationId.trim();
  const spillRef = input.spillRef.trim();
  const delivery = input.delivery === "display" ? "display" : "download";
  const maxDisplay = Math.min(
    8192,
    Math.max(200, Math.floor(input.maxDisplayChars ?? SPILL_PRODUCE_MAX_DISPLAY)),
  );

  const record = await getContextSpill(spillRef);
  if (!record) throw new Error("spill not found");
  if (record.conversationId !== conversationId) throw new Error("spillRef belongs to another conversation");

  const { content, mimeType, extension, itemCount, kind, schema, path: usedPath } = formatSpillPayload(record, {
    format: input.format,
    fields: input.fields,
    path: input.path,
  });
  const fileName =
    input.fileName?.trim() ||
    `spill-${spillRef.replace(/^spill-/, "").slice(0, 8)}.${extension}`;

  if (delivery === "download") {
    return {
      ok: true,
      delivery: "download",
      spillRef,
      fileName,
      mimeType,
      bytes: content.length,
      itemCount,
      kind,
      schema,
      ...(usedPath ? { path: usedPath } : {}),
      content,
      note: "Full payload prepared for download; do not echo content in assistant reply.",
    };
  }

  if (content.length <= maxDisplay) {
    return {
      ok: true,
      delivery: "display",
      spillRef,
      format: input.format ?? (kind === "text" ? "text" : "json"),
      bytes: content.length,
      itemCount,
      kind,
      schema,
      ...(usedPath ? { path: usedPath } : {}),
      content,
    };
  }

  return {
    ok: true,
    delivery: "display",
    spillRef,
    truncated: true,
    bytes: content.length,
    itemCount,
    kind,
    schema,
    ...(usedPath ? { path: usedPath } : {}),
    preview: content.slice(0, maxDisplay) + "...",
    note: `Content too large for display (${content.length} chars). Use delivery=download with fileName.`,
  };
}

export async function deleteContextSpillsByConversation(conversationId: string): Promise<void> {
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
