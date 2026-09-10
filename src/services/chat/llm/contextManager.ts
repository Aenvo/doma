/**
 * 上下文管理器 - 管理对话历史，防止 Token 溢出
 *
 * 借鉴 Claude Code 的多级压缩管道：
 *   1. 三级工具结果压缩：最近完整 → 中间压缩 → 最旧折叠为摘要
 *   2. 截图过期清理：只保留最新截图的图片数据
 *   3. 条数裁剪：硬限制消息条数，保证 tool_use/tool_result 配对
 *   4. Token 预算裁剪：当估算 token 超标时继续缩减
 */

import { putContextSpill } from "../contextSpillStore";
import { buildSpillPreview } from "../spillPreviewUtils";
import { getValueByDotPath, inferSpillSchema, type SpillPayloadSchema } from "../spillPayloadUtils";

// ─────────── 配置常量 ───────────

export const CONTEXT_LIMITS = {
  /** 最大消息条数 */
  MAX_MESSAGES: 40,

  /** 新鲜工具结果的最大字符数（入库时截断） */
  MAX_TOOL_RESULT_LENGTH: 50000,

  /** 中等压缩：保留关键信息 */
  MEDIUM_COMPRESS_LENGTH: 2000,

  /** 折叠摘要：只保留一行描述 */
  COLLAPSE_LENGTH: 200,

  /** 保留最近 N 条消息完整数据（不压缩工具结果） */
  RECENT_FULL_COUNT: 6,

  /** 中等压缩的消息数（在 RECENT_FULL_COUNT 之前） */
  MEDIUM_COMPRESS_COUNT: 10,

  /** 触发 autocompact 的 token 阈值 */
  AUTOCOMPACT_THRESHOLD: 50000,

  /** autocompact 保留最近 N 条完整消息 */
  AUTOCOMPACT_KEEP_RECENT: 10,

  /** 触发 token 预算裁剪的阈值（autocompact 之后的硬上限） */
  TOKEN_BUDGET: 80000,

  /** 触发警告的阈值 */
  TOKEN_WARNING: 100000,
};

// ─────────── 消息格式类型 ───────────

export type MessageFormat = 'claude' | 'openai' | 'gemini';

// ─────────── Token 估算 ───────────

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 2.5);
}

export function estimateMessagesTokens(messages: unknown[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateTokens(JSON.stringify(msg));
  }
  return total;
}

// ─────────── 工具结果压缩（三级） ───────────

/**
 * 压缩工具结果到指定长度。
 * 先尝试智能压缩（移除 base64/HTML/长数组），最后截断。
 */
export function compressToolResult(result: unknown, maxLength: number = CONTEXT_LIMITS.MAX_TOOL_RESULT_LENGTH): string {
  if (result == null) return 'null';

  const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
  if (resultStr.length <= maxLength) return resultStr;

  if (typeof result === 'object' && result !== null) {
    const obj = result as Record<string, unknown>;

    if ('base64' in obj) {
      const compressed = { ...obj, base64: '[image data omitted]' };
      const s = JSON.stringify(compressed);
      if (s.length <= maxLength) return s;
    }

    if ('html' in obj && typeof obj.html === 'string') {
      const compressed = { ...obj, html: `[HTML ${obj.html.length} chars omitted]` };
      const s = JSON.stringify(compressed);
      if (s.length <= maxLength) return s;
    }

    if ('elements' in obj && Array.isArray(obj.elements)) {
      const elems = obj.elements as unknown[];
      if (elems.length > 10) {
        const compressed = { ...obj, elements: elems.slice(0, 10), _note: `[10 of ${elems.length}]` };
        const s = JSON.stringify(compressed);
        if (s.length <= maxLength) return s;
      }
    }

    if ('caption' in obj && obj.caption !== VIDEO_CAPTION_PLACEHOLDER) {
      const captionStr = typeof obj.caption === 'string' ? obj.caption : JSON.stringify(obj.caption);
      if (captionStr.length > 500) {
        const compressed = {
          ...obj,
          caption: VIDEO_CAPTION_PLACEHOLDER,
          _captionChars: captionStr.length,
        };
        const s = JSON.stringify(compressed);
        if (s.length <= maxLength) return s;
      }
    }
  }

  return resultStr.slice(0, maxLength - 60) + `\n... [truncated, total ${resultStr.length} chars]`;
}

/**
 * 将工具结果折叠为一行摘要（最激进的压缩）
 */
function collapseToolResult(result: string): string {
  const maxLen = CONTEXT_LIMITS.COLLAPSE_LENGTH;
  if (result.length <= maxLen) return result;

  // 提取开头的关键信息作为摘要
  const firstLine = result.split('\n')[0] || '';
  const preview = firstLine.length > maxLen
    ? firstLine.slice(0, maxLen - 30)
    : result.slice(0, maxLen - 30);
  return `${preview}... [collapsed, ${result.length} chars]`;
}

// ─────────── 三级压缩（按消息位置分级） ───────────

/**
 * Claude 格式：压缩 user 消息中的 tool_result blocks
 */
function compressClaudeToolResults<T extends { role: string; content?: unknown }>(
  messages: T[],
  tier: 'medium' | 'collapse',
): T[] {
  const maxLen = tier === 'medium' ? CONTEXT_LIMITS.MEDIUM_COMPRESS_LENGTH : CONTEXT_LIMITS.COLLAPSE_LENGTH;
  const compressFn = tier === 'collapse' ? collapseToolResult : (s: string) => compressToolResult(s, maxLen);

  return messages.map(msg => {
    if (msg.role !== 'user' || !Array.isArray(msg.content)) return msg;

    const newContent = (msg.content as Record<string, unknown>[]).map(block => {
      if (block.type !== 'tool_result' || !block.content) return block;
      const contentStr = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
      if (contentStr.length <= maxLen) return block;
      return { ...block, content: compressFn(contentStr) };
    });

    return { ...msg, content: newContent };
  });
}

/**
 * OpenAI/Qwen/Kimi 格式：压缩 role=tool 消息的 content
 */
function compressOpenAIToolResults<T extends { role: string; content?: unknown }>(
  messages: T[],
  tier: 'medium' | 'collapse',
): T[] {
  const maxLen = tier === 'medium' ? CONTEXT_LIMITS.MEDIUM_COMPRESS_LENGTH : CONTEXT_LIMITS.COLLAPSE_LENGTH;
  const compressFn = tier === 'collapse' ? collapseToolResult : (s: string) => compressToolResult(s, maxLen);

  return messages.map(msg => {
    if (msg.role !== 'tool' || typeof msg.content !== 'string') return msg;
    if (msg.content.length <= maxLen) return msg;
    return { ...msg, content: compressFn(msg.content) };
  });
}

/**
 * Gemini 格式：压缩 functionResponse 中的 result
 */
function compressGeminiToolResults<T extends { role: string; parts?: unknown[] }>(
  messages: T[],
  tier: 'medium' | 'collapse',
): T[] {
  const maxLen = tier === 'medium' ? CONTEXT_LIMITS.MEDIUM_COMPRESS_LENGTH : CONTEXT_LIMITS.COLLAPSE_LENGTH;
  const compressFn = tier === 'collapse' ? collapseToolResult : (s: string) => compressToolResult(s, maxLen);

  return messages.map(msg => {
    if (msg.role !== 'user' || !Array.isArray(msg.parts)) return msg;

    let changed = false;
    const newParts = msg.parts.map((part: any) => {
      if (!part?.functionResponse?.response?.result) return part;
      const resultStr = typeof part.functionResponse.response.result === 'string'
        ? part.functionResponse.response.result
        : JSON.stringify(part.functionResponse.response.result);
      if (resultStr.length <= maxLen) return part;
      changed = true;
      return {
        ...part,
        functionResponse: {
          ...part.functionResponse,
          response: { result: compressFn(resultStr) },
        },
      };
    });

    return changed ? { ...msg, parts: newParts } : msg;
  });
}

/**
 * 对消息数组执行三级压缩。
 * - 最近 recentFull 条：不压缩
 * - 中间 mediumCompress 条：中等压缩 (2000 chars)
 * - 更早的：折叠为摘要 (200 chars)
 */
function tieredToolResultCompression<T extends { role: string; content?: unknown; parts?: unknown[] }>(
  messages: T[],
  format: MessageFormat,
): T[] {
  const { RECENT_FULL_COUNT, MEDIUM_COMPRESS_COUNT } = CONTEXT_LIMITS;

  if (messages.length <= RECENT_FULL_COUNT) return messages;

  const mediumBoundary = messages.length - RECENT_FULL_COUNT;
  const collapseBoundary = Math.max(0, mediumBoundary - MEDIUM_COMPRESS_COUNT);

  // 三段切分
  const collapseSlice = messages.slice(0, collapseBoundary);
  const mediumSlice = messages.slice(collapseBoundary, mediumBoundary);
  const recentSlice = messages.slice(mediumBoundary);

  let compressedCollapse: T[];
  let compressedMedium: T[];

  switch (format) {
    case 'claude':
      compressedCollapse = compressClaudeToolResults(collapseSlice, 'collapse') as T[];
      compressedMedium = compressClaudeToolResults(mediumSlice, 'medium') as T[];
      break;
    case 'openai':
      compressedCollapse = compressOpenAIToolResults(collapseSlice, 'collapse') as T[];
      compressedMedium = compressOpenAIToolResults(mediumSlice, 'medium') as T[];
      break;
    case 'gemini':
      compressedCollapse = compressGeminiToolResults(collapseSlice, 'collapse') as T[];
      compressedMedium = compressGeminiToolResults(mediumSlice, 'medium') as T[];
      break;
  }

  return [...compressedCollapse, ...compressedMedium, ...recentSlice];
}

// ─────────── 截图 / 字幕清理 ───────────

export const SCREENSHOT_IMAGE_EXPIRED = "[screenshot expired]";

function isScreenshotExpiredText(text: string): boolean {
  const t = text.trim();
  return t === SCREENSHOT_IMAGE_EXPIRED || t === "[screenshot SoM expired]";
}

/** 历史上下文中已解析字幕的占位符（与截图过期占位同类） */
export const VIDEO_CAPTION_PLACEHOLDER = '[video caption already parsed]';

function collapseVideoCaptionInToolContent(content: string): string {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object' && 'caption' in parsed && parsed.caption !== VIDEO_CAPTION_PLACEHOLDER) {
      return JSON.stringify({
        ...parsed,
        caption: VIDEO_CAPTION_PLACEHOLDER,
      });
    }
  } catch {
    // not JSON tool content
  }
  return content;
}

/** OpenAI/Qwen：将历史 tool 消息里的完整字幕替换为占位符 */
export function stripOldVideoCaptionsOpenAI(
  history: Array<{ role: string; content?: unknown }>,
  preserveFromIndex = history.length,
): void {
  for (let i = 0; i < history.length && i < preserveFromIndex; i++) {
    const msg = history[i];
    if (msg.role === 'tool' && typeof msg.content === 'string') {
      msg.content = collapseVideoCaptionInToolContent(msg.content);
    }
  }
}

/** Claude：user 消息中的 tool_result 块 */
export function stripOldVideoCaptionsClaude(history: Array<{ role: string; content: unknown }>): void {
  for (const msg of history) {
    if (msg.role !== 'user' || !Array.isArray(msg.content)) continue;
    for (const block of msg.content as Record<string, unknown>[]) {
      if (block.type !== 'tool_result' || typeof block.content !== 'string') continue;
      block.content = collapseVideoCaptionInToolContent(block.content);
    }
  }
}

/** Gemini：functionResponse 结果 */
export function stripOldVideoCaptionsGemini(history: Array<{ role: string; parts?: unknown[] }>): void {
  for (const msg of history) {
    if (msg.role !== 'user' || !Array.isArray(msg.parts)) continue;
    for (const part of msg.parts as Array<Record<string, unknown>>) {
      const fnResp = part?.functionResponse as Record<string, unknown> | undefined;
      const response = fnResp?.response as Record<string, unknown> | undefined;
      const result = response?.result;
      if (typeof result !== 'string') continue;
      const collapsed = collapseVideoCaptionInToolContent(result);
      if (collapsed !== result && fnResp && response) {
        response.result = collapsed;
      }
    }
  }
}

export function stripOldScreenshotsClaude(history: Array<{ role: string; content: unknown }>): void {
  for (const msg of history) {
    if (msg.role !== 'user' || !Array.isArray(msg.content)) continue;
    for (const block of msg.content as Record<string, unknown>[]) {
      if (block.type !== 'tool_result' || !Array.isArray(block.content)) continue;
      const contents = block.content as Array<Record<string, unknown>>;
      if (contents.some(c => c.type === 'image')) {
        block.content = SCREENSHOT_IMAGE_EXPIRED;
      }
    }
  }
}

export function stripOldScreenshotsGemini(history: Array<{ role: string; parts?: unknown[] }>): void {
  for (const msg of history) {
    if (msg.role !== 'user' || !Array.isArray(msg.parts)) continue;
    if (msg.parts.some((p: any) => p?.inlineData)) {
      msg.parts = msg.parts.map((p: any) =>
        p?.inlineData ? { text: SCREENSHOT_IMAGE_EXPIRED } : p
      );
    }
  }
}

export function stripOldScreenshots(
  history: Array<{ role: string; content?: unknown; captureTab?: boolean }>,
  preserveFromIndex = history.length,
): void {
  for (let i = 0; i < history.length && i < preserveFromIndex; i++) {
    const msg = history[i];
    if (msg.role !== 'user' || msg.captureTab !== true || !Array.isArray(msg.content)) continue;
    const contents = msg.content as Array<Record<string, unknown>>;
    if (contents.some(c => c.type === 'image_url')) {
      msg.content = contents.map((c) =>
        c.type === "image_url"
          ? { type: "image_url", image_url: { url: SCREENSHOT_IMAGE_EXPIRED } }
          : c,
      );
    }
  }
}

// ─────────── History stub（大 payload spill + stub: true） ───────────

/** 历史轮 stub 阈值（prepareLlmHistory / stubHistory） */
export const STUB_SPILL_MIN_CHARS = 2048;

/** 当前轮 tool result 写入 history 时的 spill 阈值（更大，便于本轮直接读全量） */
export const CURRENT_ROUND_SPILL_MIN_CHARS = 5 * 1024;

export type ExpireKind = "screenshot" | "caption";

export type LlmHistoryMsg = {
  role: string;
  content?: unknown;
  tool_calls?: unknown[];
  expiredInNextRound?: boolean;
  expireKind?: ExpireKind;
  fileId?: string;
};

/** 历史轮：expiredInNextRound 消息替换为轻量占位（不占 spill） */
export function applyExpiration(history: LlmHistoryMsg[], pendingFromIndex: number): void {
  for (let i = 0; i < history.length && i < pendingFromIndex; i++) {
    const msg = history[i];
    if (!msg.expiredInNextRound) continue;

    if (msg.expireKind === "screenshot" && msg.role === "user") {
      if (typeof msg.content === "string" && isScreenshotExpiredText(msg.content)) continue;
      msg.content = SCREENSHOT_IMAGE_EXPIRED;
      continue;
    }

    if (msg.expireKind === "caption" && msg.role === "tool" && typeof msg.content === "string") {
      msg.content = collapseVideoCaptionInToolContent(msg.content);
    }
  }
}

function inferPayloadSchema(payload: unknown): SpillPayloadSchema {
  return inferSpillSchema(payload);
}

function previewFromPayload(
  payload: unknown,
  schema?: SpillPayloadSchema,
): { preview: unknown[]; itemCount?: number } {
  if (schema?.arrayPath && payload && typeof payload === "object" && !Array.isArray(payload)) {
    const items = getValueByDotPath(payload, schema.arrayPath);
    if (Array.isArray(items)) return buildSpillPreview(items);
  }
  return buildSpillPreview(payload);
}

function buildSpillQueryHints(
  schema: SpillPayloadSchema,
  toolName?: string,
): HistoryStubRecord["query"] {
  const modes: Array<"slice" | "tail" | "peek" | "full" | "grep"> = [
    "slice",
    "tail",
    "peek",
    "full",
    "grep",
  ];
  const produceBase = {
    produceTool: "browser_spill_produce" as const,
    produceFormats: ["json", "csv", "markdown", "jsonl", "text"],
  };
  if (schema.kind === "json-array" && schema.valueColumn && !schema.fields?.length) {
    const sliceExample: Record<string, unknown> = { mode: "slice", offset: 0, limit: 50 };
    const produceExample: Record<string, unknown> = {
      delivery: "download",
      format: "csv",
      fileName: "export.csv",
    };
    if (schema.arrayPath) {
      sliceExample.path = schema.arrayPath;
      produceExample.path = schema.arrayPath;
    }
    return {
      tool: "browser_spill_get",
      ...produceBase,
      modes,
      defaultLimit: 50,
      valueColumn: schema.valueColumn,
      examples: [sliceExample, { mode: "peek" }],
      produceExamples: [
        produceExample,
        { delivery: "download", format: "text", fileName: "export.txt", ...(schema.arrayPath ? { path: schema.arrayPath } : {}) },
      ],
    };
  }
  if (schema.kind === "json-array" && schema.fields?.length) {
    const sampleFields = schema.fields.filter((f) => !["active", "windowId", "index"].includes(f));
    const fieldsForExample = (sampleFields.length > 0 ? sampleFields : schema.fields).slice(0, 4);
    const sliceExample: Record<string, unknown> = {
      mode: "slice",
      offset: 0,
      limit: 50,
      fields: fieldsForExample,
    };
    if (schema.arrayPath) sliceExample.path = schema.arrayPath;
    const produceExample: Record<string, unknown> = {
      delivery: "download",
      format: "csv",
      fileName: "export.csv",
      fields: fieldsForExample,
    };
    if (schema.arrayPath) produceExample.path = schema.arrayPath;
    return {
      tool: "browser_spill_get",
      ...produceBase,
      modes,
      defaultLimit: 50,
      fields: schema.fields,
      examples: [sliceExample, { mode: "peek" }],
      produceExamples: [produceExample, { delivery: "display", format: "json", fields: fieldsForExample }],
    };
  }
  if (schema.kind === "json-array" && schema.arrayPath) {
    return {
      tool: "browser_spill_get",
      ...produceBase,
      modes,
      defaultLimit: 50,
      examples: [
        { mode: "slice", path: schema.arrayPath, offset: 0, limit: 50 },
        { mode: "peek" },
      ],
      produceExamples: [
        { delivery: "download", format: "csv", path: schema.arrayPath, fileName: "export.csv" },
        { delivery: "display", format: "json", path: schema.arrayPath },
      ],
    };
  }
  if (schema.kind === "json-array") {
    return {
      tool: "browser_spill_get",
      ...produceBase,
      modes,
      defaultLimit: 50,
      examples: [{ mode: "slice", offset: 0, limit: 50 }, { mode: "peek" }],
      produceExamples: [
        { delivery: "download", format: "csv", fileName: "export.csv" },
        { delivery: "display", format: "json" },
      ],
    };
  }
  if (schema.kind === "text") {
    const isPageContent = toolName === "browser_get_page_content";
    return {
      tool: "browser_spill_get",
      ...produceBase,
      modes,
      defaultLimit: 50,
      examples: isPageContent
        ? [
            { mode: "grep", pattern: "<keyword>", contextChars: 80, limit: 10 },
            { mode: "peek" },
          ]
        : [
            { mode: "grep", pattern: "<keyword>", contextChars: 80, limit: 10 },
            { mode: "slice", offset: 0, limit: 50 },
          ],
      produceExamples: [
        { delivery: "download", format: "text", fileName: "export.txt" },
        { delivery: "download", format: "csv", fileName: "export.csv" },
      ],
    };
  }
  return {
    tool: "browser_spill_get",
    ...produceBase,
    modes,
    defaultLimit: 50,
    examples: [{ mode: "slice", offset: 0, limit: 50 }],
    produceExamples: [{ delivery: "download", format: "json", fileName: "export.json" }],
  };
}
const TOOL_ARGS_BULK_KEYS = ["rows", "text", "data", "fileInfoList", "script"] as const;

export type HistoryStubRecord = {
  stub: true;
  spillRef: string;
  itemCount?: number;
  bytes?: number;
  preview?: unknown[];
  schema?: ReturnType<typeof inferPayloadSchema>;
  query?: {
    tool: "browser_spill_get";
    produceTool?: "browser_spill_produce";
    produceFormats?: string[];
    modes: Array<"slice" | "tail" | "peek" | "full" | "grep">;
    defaultLimit: number;
    fields?: string[];
    valueColumn?: string;
    examples?: unknown[];
    produceExamples?: unknown[];
  };
  note?: string;
  ok?: boolean;
  [key: string]: unknown;
};

function isStubRecord(value: unknown): value is HistoryStubRecord {
  return !!value && typeof value === "object" && (value as HistoryStubRecord).stub === true;
}

function isVideoCaptionPayload(obj: Record<string, unknown>): boolean {
  return "caption" in obj;
}

function buildStubNote(
  schema: ReturnType<typeof inferPayloadSchema>,
  bytes: number,
): string {
  const size = `${bytes} bytes`;
  if (schema.kind === "text") {
    return `Full text (${size}) stored in spill; preview is a sample only — not truncated. Use browser_spill_get (grep) to search, or browser_spill_produce delivery=download to export without loading into chat.`;
  }
  if (schema.kind === "json-array" && schema.arrayPath) {
    return `Full payload (${size}) stored in spill; ${schema.itemCount ?? 0} items at $.${schema.arrayPath}. preview is a sample. Use browser_spill_get slice for paging, or browser_spill_produce delivery=download to export.`;
  }
  if (schema.kind === "json-array" && schema.fields?.length) {
    return `Full payload (${size}) stored in spill; ${schema.itemCount ?? 0} items. Use browser_spill_get slice+fields to page, or browser_spill_produce delivery=download to export (e.g. csv).`;
  }
  return `Full payload (${size}) stored in spill; preview is a sample only. Use browser_spill_get with spillRef, or browser_spill_produce delivery=download to export.`;
}

async function spillToStub(input: {
  conversationId: string;
  payload: unknown;
  source: "tool_result" | "tool_args" | "user_content";
  toolName?: string;
}): Promise<HistoryStubRecord> {
  const schema = inferPayloadSchema(input.payload);
  const spillRef = await putContextSpill({
    conversationId: input.conversationId,
    payload: input.payload,
    source: input.source,
    toolName: input.toolName,
    schema,
  });
  const bytes =
    typeof input.payload === "string" ? input.payload.length : JSON.stringify(input.payload ?? null).length;
  const { preview, itemCount: previewItemCount } = previewFromPayload(input.payload, schema);
  const itemCount = schema.itemCount ?? previewItemCount;
  const queryHints = buildSpillQueryHints(schema, input.toolName);
  const note = buildStubNote(schema, bytes);
  return {
    stub: true,
    spillRef,
    bytes,
    itemCount,
    preview,
    schema,
    query: queryHints,
    note,
  };
}

/** 当前轮全量返回、历史轮再 stub 的 tool（如 spill 读回） */
export const TOOL_RESULT_PASSTHROUGH_CURRENT_ROUND = new Set([
  "browser_spill_get",
]);

function serializeToolResultRaw(result: unknown): string {
  if (typeof result === "string") return result;
  if (result === undefined) return "";
  return JSON.stringify(result);
}

/** 含 interactionBlock 的内容不做当前轮 stub（保留完整上下文给模型） */
function containsInteractionBlockTag(text: string): boolean {
  return /<interactionBlock[\s>]/i.test(text);
}

/** 当前轮 tool result：≤ CURRENT_ROUND_SPILL_MIN_CHARS 原样；> 阈值 spill + stub JSON */
export async function materializeToolResultContent(
  conversationId: string,
  result: unknown,
  options?: { toolName?: string },
): Promise<string> {
  const cid = conversationId.trim();
  if (!cid) throw new Error("conversationId required");

  if (options?.toolName && TOOL_RESULT_PASSTHROUGH_CURRENT_ROUND.has(options.toolName)) {
    return serializeToolResultRaw(result);
  }

  const raw = serializeToolResultRaw(result);
  if (containsInteractionBlockTag(raw)) {
    return raw;
  }

  const minChars = CURRENT_ROUND_SPILL_MIN_CHARS;

  if (typeof result === "string") {
    if (result.length <= minChars) return result;
    const stub = await spillToStub({
      conversationId: cid,
      payload: result,
      source: "tool_result",
      toolName: options?.toolName,
    });
    if (options?.toolName === "browser_get_page_content") {
      console.log("[DOMA_PAGE] get_page_content:spill-stub", {
        conversationId: cid,
        textLen: result.length,
        spillRef: stub.spillRef,
        bytes: stub.bytes,
      });
    }
    return JSON.stringify(stub);
  }

  if (result === undefined) return "";
  if (raw.length <= minChars) return raw;

  const stub = await spillToStub({
    conversationId: cid,
    payload: result,
    source: "tool_result",
    toolName: options?.toolName,
  });
  return JSON.stringify(stub);
}

async function maybeStubToolArgs(
  conversationId: string,
  args: Record<string, unknown>,
  toolName?: string,
): Promise<Record<string, unknown> | null> {
  if (isStubRecord(args)) return null;

  const argsSize = JSON.stringify(args).length;
  if (argsSize < STUB_SPILL_MIN_CHARS) return null;

  let changed = false;
  const next: Record<string, unknown> = { ...args };

  for (const key of TOOL_ARGS_BULK_KEYS) {
    if (!(key in next)) continue;
    const val = next[key];
    const serialized = typeof val === "string" ? val : JSON.stringify(val ?? null);
    if (serialized.length < STUB_SPILL_MIN_CHARS) continue;

    const stubField = await spillToStub({
      conversationId,
      payload: val,
      source: "tool_args",
      toolName,
    });
    next[`${key}SpillRef`] = stubField.spillRef;
    if (stubField.itemCount != null) next[`${key}Count`] = stubField.itemCount;
    delete next[key];
    changed = true;
  }

  if (changed) {
    next.stub = true;
    return next;
  }

  // 无单独 bulk 字段但整体超长：整包 spill（与 tool 名称无关）
  const stub = await spillToStub({
    conversationId,
    payload: args,
    source: "tool_args",
    toolName,
  });
  return {
    stub: true,
    spillRef: stub.spillRef,
    bytes: stub.bytes,
    itemCount: stub.itemCount,
    preview: stub.preview,
    note: stub.note,
  };
}

async function maybeStubStringContent(
  conversationId: string,
  content: string,
  source: "tool_result" | "user_content",
): Promise<string | null> {
  if (source === "tool_result") {
    if (content === "截图已获取，正在分析...") return null;
    if (content.includes(SCREENSHOT_IMAGE_EXPIRED)) return null;
  } else if (isScreenshotExpiredText(content)) {
    return null;
  }

  let parsed: Record<string, unknown> | null = null;
  try {
    const p = JSON.parse(content) as unknown;
    if (p && typeof p === "object" && !Array.isArray(p)) {
      parsed = p as Record<string, unknown>;
    }
  } catch {
    // plain text
  }

  if (parsed) {
    if (isStubRecord(parsed)) return null;
    if (source === "tool_result" && isVideoCaptionPayload(parsed)) return null;

    const serialized = JSON.stringify(parsed);
    if (serialized.length < STUB_SPILL_MIN_CHARS) return null;

    const stub = await spillToStub({
      conversationId,
      payload: parsed,
      source,
      toolName: typeof parsed.toolName === "string" ? parsed.toolName : undefined,
    });
    return JSON.stringify(stub);
  }

  if (content.length < STUB_SPILL_MIN_CHARS) return null;
  const stub = await spillToStub({
    conversationId,
    payload: content,
    source,
  });
  return JSON.stringify(stub);
}

async function maybeStubToolResultContent(
  conversationId: string,
  content: string,
): Promise<string | null> {
  return maybeStubStringContent(conversationId, content, "tool_result");
}

// expiredInNextRound 截图保留 image_url；带 fileId 的历史 image_url → fileId stub

function buildFileIdImagePlaceholder(msg: LlmHistoryMsg): string {
  const fileId = typeof msg.fileId === "string" ? msg.fileId.trim() : "";
  let name: string | undefined;
  let imageRecognition = false;
  if (Array.isArray(msg.content)) {
    for (const block of msg.content as Record<string, unknown>[]) {
      if (block.type === "text" && typeof block.text === "string") {
        if (block.text.includes("请识别这张图片")) {
          imageRecognition = true;
          name = "image";
        } else {
          name = block.text;
        }
        break;
      }
    }
  }
  const note = imageRecognition
    ? "Image offloaded. Use browser_skill_image_recognition({ fileId }) if needed."
    : "File offloaded. Use browser_get_upload_file({ fileId }) to read; browser_skill_image_recognition({ fileId }) for image recognition.";
  return JSON.stringify({
    stub: true,
    kind: "file",
    fileId,
    name,
    note,
  });
}

async function maybeStubUserMessage(
  conversationId: string,
  msg: LlmHistoryMsg,
): Promise<void> {
  if (msg.expiredInNextRound && msg.expireKind === "screenshot") return;

  const content = msg.content;
  if (content == null) return;

  if (typeof content === "string") {
    const next = await maybeStubStringContent(conversationId, content, "user_content");
    if (next) msg.content = next;
    return;
  }

  if (!Array.isArray(content)) return;

  let changed = false;
  const nextBlocks: unknown[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") {
      nextBlocks.push(block);
      continue;
    }
    const b = block as Record<string, unknown>;
    if (b.type === "image_url") {
      if (msg.expiredInNextRound === true) {
        nextBlocks.push(block);
      } else {
        const fileId = typeof msg.fileId === "string" ? msg.fileId.trim() : "";
        if (fileId) {
          nextBlocks.push({ type: "text", text: buildFileIdImagePlaceholder(msg) });
          changed = true;
        } else {
          nextBlocks.push(block);
        }
      }
      continue;
    }
    if (b.type === "text" && typeof b.text === "string") {
      const nextText = await maybeStubStringContent(conversationId, b.text, "user_content");
      if (nextText) {
        nextBlocks.push({ type: "text", text: nextText });
        changed = true;
      } else {
        nextBlocks.push(block);
      }
      continue;
    }
    nextBlocks.push(block);
  }
  if (changed) msg.content = nextBlocks;
}

function userMessageHasImageUrl(msg: LlmHistoryMsg): boolean {
  if (!Array.isArray(msg.content)) return false;
  return (msg.content as Record<string, unknown>[]).some((b) => b.type === "image_url");
}

function assistantHasToolCalls(msg: LlmHistoryMsg): boolean {
  return (
    msg.role === "assistant" &&
    Array.isArray(msg.tool_calls) &&
    msg.tool_calls.length > 0
  );
}

/**
 * 末尾 pending 不参与 stub：当前轮发起 user + 本轮 assistant(tool_calls) + tool 链 + 可选截图 user(image)。
 * 历史轮（含带 interactionBlock 的 user）在 i < preserveFromIndex 时会被 stub。
 */
export function getPendingFromIndex(history: LlmHistoryMsg[]): number {
  let trailing = 0;
  let i = history.length - 1;

  // 截图回合：tool 之后追加的 user(image_url)
  if (i >= 0 && history[i].role === "user" && userMessageHasImageUrl(history[i])) {
    trailing++;
    i--;
  }

  // 本轮 tool result 链
  while (i >= 0 && history[i].role === "tool") {
    trailing++;
    i--;
  }

  // 与 tool 配对的 assistant tool_calls（可多轮 tool loop）
  while (i >= 0 && assistantHasToolCalls(history[i])) {
    trailing++;
    i--;
    while (i >= 0 && history[i].role === "tool") {
      trailing++;
      i--;
    }
  }

  // 本轮发起 user（纯文字 / interactionBlock / toolInput 等）
  if (i >= 0 && history[i].role === "user") {
    trailing++;
  }

  return history.length - trailing;
}

/**
 * 发 LLM 请求前：历史轮 expire + stub（pending 后缀保留给当前轮）。
 */
export async function prepareLlmHistory(
  history: LlmHistoryMsg[],
  conversationId: string,
): Promise<void> {
  const pendingFrom = getPendingFromIndex(history);
  applyExpiration(history, pendingFrom);
  await stubHistory(history, conversationId, pendingFrom);
}

/**
 * 扫描 LLM history：已 stub: true 跳过；expiredInNextRound 走 applyExpiration。
 * user / tool result / assistant arguments 超过 STUB_SPILL_MIN_CHARS（2048）则 spill。
 * 历史轮 fileId image_url → fileId stub；截图 expiredInNextRound 走 expire。
 * store（browser_store_*）是模型主动落盘，靠 storeId；spill 只管 context 里过大的 payload。
 */
export async function stubHistory(
  history: LlmHistoryMsg[],
  conversationId: string,
  preserveFromIndex = history.length,
): Promise<void> {
  const cid = conversationId.trim();
  if (!cid || history.length === 0) return;

  for (let i = 0; i < history.length; i++) {
    if (i >= preserveFromIndex) continue;
    const msg = history[i];
    if (msg.role === "user") {
      await maybeStubUserMessage(cid, msg);
      continue;
    }

    if (msg.role === "assistant" && Array.isArray(msg.tool_calls)) {
      for (const rawTc of msg.tool_calls) {
        const tc = rawTc as { function?: { name?: string; arguments?: string } };
        const argsStr = tc.function?.arguments;
        if (!argsStr) continue;
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(argsStr) as Record<string, unknown>;
        } catch {
          continue;
        }
        const stubbed = await maybeStubToolArgs(cid, args, tc.function?.name);
        if (stubbed && tc.function) {
          tc.function.arguments = JSON.stringify(stubbed);
        }
      }
      continue;
    }

    if (msg.role === "tool" && typeof msg.content === "string") {
      const next = await maybeStubToolResultContent(cid, msg.content);
      if (next) msg.content = next;
    }
  }
}

// ─────────── 消息裁剪 ───────────

/**
 * 裁剪到指定条数，保证 tool_use/tool_result 配对完整
 */
export function trimMessages<T extends { role: string; content?: unknown }>(
  messages: T[],
  maxCount: number = CONTEXT_LIMITS.MAX_MESSAGES,
): T[] {
  if (messages.length <= maxCount) return messages;

  let trimmed = messages.slice(-maxCount);

  // 确保第一条是 user 消息
  while (trimmed.length > 0 && trimmed[0].role !== 'user') {
    trimmed.shift();
  }

  // 移除孤立的 tool_result（Claude 格式）
  while (trimmed.length > 0) {
    const first = trimmed[0];
    if (first.role === 'user' && hasToolResult(first.content)) {
      trimmed.shift();
    } else {
      break;
    }
  }

  // 移除孤立的 tool 消息（OpenAI 格式）
  while (trimmed.length > 0 && trimmed[0].role === 'tool') {
    trimmed.shift();
  }

  return trimmed;
}

/**
 * Token 预算裁剪：从前面移除消息直到 token 预算满足
 */
function trimByTokenBudget<T extends { role: string; content?: unknown }>(
  messages: T[],
  budget: number,
): T[] {
  let tokens = estimateMessagesTokens(messages);
  if (tokens <= budget) return messages;

  const result = [...messages];

  // 从前面移除最旧的消息，每次移除后重新检查
  while (result.length > 2 && tokens > budget) {
    const removed = result.shift()!;
    tokens -= estimateTokens(JSON.stringify(removed));

    // 移除后确保不以 tool/tool_result 开头
    while (result.length > 0) {
      if (result[0].role === 'tool') {
        tokens -= estimateTokens(JSON.stringify(result[0]));
        result.shift();
      } else if (result[0].role === 'user' && hasToolResult(result[0].content)) {
        tokens -= estimateTokens(JSON.stringify(result[0]));
        result.shift();
      } else if (result[0].role !== 'user') {
        tokens -= estimateTokens(JSON.stringify(result[0]));
        result.shift();
      } else {
        break;
      }
    }
  }

  if (result.length < messages.length) {
    console.log(`[ContextManager] Token budget trim: ${messages.length} → ${result.length} msgs (~${tokens} tokens)`);
  }

  return result;
}

function hasToolResult(content: unknown): boolean {
  if (!content || !Array.isArray(content)) return false;
  return content.some((block: unknown) => {
    if (typeof block === 'object' && block !== null) {
      return (block as Record<string, unknown>).type === 'tool_result';
    }
    return false;
  });
}

// ─────────── Autocompact（自动摘要压缩） ───────────

/**
 * Summarizer 回调类型：接受需要摘要的文本，返回摘要结果。
 * 由各 LLM Service 提供具体实现（调用自己的 API）。
 * 返回 null 表示摘要失败，管道会 fallback 到 token budget 裁剪。
 */
export type Summarizer = (textToSummarize: string) => Promise<string | null>;

const AUTOCOMPACT_SUMMARY_PROMPT = `请总结以下浏览器自动化对话的关键信息。保留：
1. 用户的最终目标
2. 已完成的关键操作和结果（按时间顺序）
3. 当前页面状态
4. 遇到的错误或重要发现

对话内容：
`;

/**
 * 将旧消息序列化为可读文本，用于生成摘要。
 */
function serializeMessagesForSummary(messages: unknown[]): string {
  return messages.map((msg: unknown) => {
    const m = msg as { role: string; content?: unknown; parts?: unknown[] };
    let text: string;
    if (typeof m.content === 'string') {
      text = m.content;
    } else if (Array.isArray(m.parts)) {
      text = m.parts.map((p: any) => p?.text || p?.functionCall?.name || p?.functionResponse?.name || '').filter(Boolean).join(' | ');
    } else if (Array.isArray(m.content)) {
      text = (m.content as any[]).map(b => {
        if (b.type === 'text') return b.text;
        if (b.type === 'tool_use') return `[tool: ${b.name}]`;
        if (b.type === 'tool_result') return `[result: ${typeof b.content === 'string' ? b.content.slice(0, 100) : '...'}]`;
        return '';
      }).filter(Boolean).join(' | ');
    } else {
      text = JSON.stringify(m.content).slice(0, 200);
    }
    // 每条消息最多 300 字符
    if (text.length > 300) text = text.slice(0, 300) + '...';
    return `[${m.role}] ${text}`;
  }).join('\n');
}

/**
 * Autocompact：当 token 超过阈值时，用 LLM 生成旧消息的摘要，
 * 替换为一条摘要消息 + 保留最近的完整消息。
 */
async function autocompact<T extends { role: string; content?: unknown; parts?: unknown[] }>(
  messages: T[],
  format: MessageFormat,
  summarizer: Summarizer,
  serviceName: string,
): Promise<T[]> {
  const tokens = estimateMessagesTokens(messages);
  if (tokens <= CONTEXT_LIMITS.AUTOCOMPACT_THRESHOLD) return messages;

  const keepCount = Math.min(CONTEXT_LIMITS.AUTOCOMPACT_KEEP_RECENT, messages.length - 1);
  if (keepCount <= 0) return messages;

  const splitIdx = messages.length - keepCount;
  const oldMessages = messages.slice(0, splitIdx);
  const recentMessages = messages.slice(splitIdx);

  // 序列化旧消息为可读文本
  const serialized = serializeMessagesForSummary(oldMessages);
  // 防止摘要提示自身过大（最多 ~12000 字符 ≈ 5000 tokens 的输入）
  const summaryInput = serialized.length > 12000
    ? serialized.slice(0, 12000) + '\n... [earlier messages omitted]'
    : serialized;

  const prompt = AUTOCOMPACT_SUMMARY_PROMPT + summaryInput + '\n\n请用简洁的中文总结（不超过 500 字）：';

  console.log(`[${serviceName}] Autocompact triggered: ~${tokens} tokens, summarizing ${oldMessages.length} old messages`);

  try {
    const summary = await summarizer(prompt);
    if (!summary) {
      console.warn(`[${serviceName}] Autocompact: summarizer returned null, falling back`);
      return messages;
    }

    // 构建摘要消息（格式取决于 LLM 类型）
    let summaryMsg: T;
    const summaryText = `[对话摘要 - 已压缩 ${oldMessages.length} 条历史消息]\n${summary}`;

    switch (format) {
      case 'claude':
        summaryMsg = { role: 'user', content: [{ type: 'text', text: summaryText }] } as T;
        break;
      case 'openai':
        summaryMsg = { role: 'user', content: summaryText } as T;
        break;
      case 'gemini':
        summaryMsg = { role: 'user', parts: [{ text: summaryText }] } as T;
        break;
    }

    const compacted = [summaryMsg, ...recentMessages];
    const newTokens = estimateMessagesTokens(compacted);
    console.log(`[${serviceName}] Autocompact done: ${messages.length} → ${compacted.length} msgs, ~${tokens} → ~${newTokens} tokens`);

    return compacted;
  } catch (e) {
    console.error(`[${serviceName}] Autocompact failed:`, e);
    return messages;
  }
}

// ─────────── 统一管道 ───────────

/**
 * 统一上下文压缩管道。所有 LLM Service 共用此入口。
 *
 * 管道步骤：
 *   1. 三级工具结果压缩（折叠 / 中压 / 完整）
 *   2. 条数裁剪
 *   3. Autocompact（可选，用模型生成摘要替换旧历史）
 *   4. Token 预算裁剪（兜底硬限制）
 *   5. 输出 token 统计日志
 *
 * @param summarizer 可选，由 Service 提供的摘要生成回调。
 *                   传入后才会启用 autocompact 步骤。
 */
export async function runContextPipeline<T extends { role: string; content?: unknown; parts?: unknown[] }>(
  messages: T[],
  format: MessageFormat,
  serviceName: string,
  summarizer?: Summarizer,
): Promise<T[]> {
  // Step 1: 三级工具结果压缩
  let managed = tieredToolResultCompression(messages, format);

  // Step 2: 条数裁剪
  managed = trimMessages(managed, CONTEXT_LIMITS.MAX_MESSAGES);

  // Step 3: Autocompact（用模型生成摘要）
  if (summarizer) {
    managed = await autocompact(managed, format, summarizer, serviceName);
  }

  // Step 4: Token 预算裁剪（兜底）
  managed = trimByTokenBudget(managed, CONTEXT_LIMITS.TOKEN_BUDGET);

  // Step 5: 日志
  const tokens = estimateMessagesTokens(managed);
  if (tokens > CONTEXT_LIMITS.TOKEN_WARNING) {
    console.warn(`[${serviceName}] Context large after pipeline: ~${tokens} tokens, ${managed.length} msgs`);
  }

  return managed;
}

// ─────────── 旧版兼容导出 ───────────

/**
 * @deprecated 使用 runContextPipeline 替代
 */
export function compressHistoryToolResults<T extends { role: string; content: unknown }>(
  messages: T[],
  keepRecentCount: number = 6,
): T[] {
  if (messages.length <= keepRecentCount) return messages;

  const compressBefore = messages.length - keepRecentCount;
  const result: T[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (i >= compressBefore) {
      result.push(msg);
      continue;
    }
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      const compressedContent = msg.content.map((block: unknown) => {
        if (typeof block === 'object' && block !== null) {
          const b = block as Record<string, unknown>;
          if (b.type === 'tool_result' && b.content) {
            return { ...b, content: compressToolResult(b.content, 500) };
          }
        }
        return block;
      });
      result.push({ ...msg, content: compressedContent });
    } else {
      result.push(msg);
    }
  }
  return result;
}

/**
 * @deprecated 使用 runContextPipeline 的 token budget 替代
 */
export function needsCompression(messages: unknown[]): boolean {
  return estimateMessagesTokens(messages) > CONTEXT_LIMITS.TOKEN_WARNING;
}

export function getSummaryPrompt(messages: unknown[]): string {
  const conversationText = messages.map((msg: unknown) => {
    const m = msg as { role: string; content: unknown };
    const content = typeof m.content === 'string'
      ? m.content
      : JSON.stringify(m.content).slice(0, 500);
    return `${m.role}: ${content}`;
  }).join('\n');

  return `请总结以下对话中的关键信息，包括：
1. 用户的目标和意图
2. 已完成的操作和结果
3. 当前任务进度
4. 重要的数据和发现

对话内容：
${conversationText}

请用简洁的中文总结（不超过 500 字）：`;
}

export function createCompressedContext<T extends { role: string; content: unknown }>(
  summary: string,
  recentMessages: T[],
): T[] {
  const summaryMessage = {
    role: 'user',
    content: [{ type: 'text', text: `[对话摘要]\n${summary}\n\n请继续之前的任务。` }],
  } as T;
  return [summaryMessage, ...recentMessages];
}
