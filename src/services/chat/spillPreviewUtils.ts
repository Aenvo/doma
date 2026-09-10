/** stub / spill peek 用的 preview 截断，避免大字段原样进入 history */

export const SPILL_PREVIEW_ITEMS = 2;
export const SPILL_PREVIEW_CHARS = 200;
/** 纯文本 payload 的 preview 长度 */
export const SPILL_PREVIEW_TEXT_CHARS = 800;
export const SPILL_PREVIEW_MAX_BYTES = 1024;

export function truncatePreviewString(s: string, max = SPILL_PREVIEW_CHARS): string {
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

export function shrinkPreviewValue(value: unknown, depth = 0): unknown {
  if (depth > 3) return "…";
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return truncatePreviewString(value);
  if (Array.isArray(value)) {
    return value.slice(0, SPILL_PREVIEW_ITEMS).map((item) => shrinkPreviewValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) {
      if (typeof v === "string" && v.length > SPILL_PREVIEW_CHARS) {
        out[k] = truncatePreviewString(v);
      } else {
        out[k] = shrinkPreviewValue(v, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

export function capPreviewArray(preview: unknown[]): unknown[] {
  try {
    const json = JSON.stringify(preview);
    if (json.length <= SPILL_PREVIEW_MAX_BYTES) return preview;
    const first = preview[0];
    if (typeof first === "string") {
      return [truncatePreviewString(first, Math.min(SPILL_PREVIEW_CHARS, SPILL_PREVIEW_MAX_BYTES - 20))];
    }
    return [{ previewTruncated: true, bytes: json.length }];
  } catch {
    return [{ previewTruncated: true }];
  }
}

export function buildSpillPreview(payload: unknown): { preview: unknown[]; itemCount?: number } {
  if (typeof payload === "string") {
    const lines = payload.split("\n").filter((l) => l.trim().length > 0);
    return {
      preview: capPreviewArray([truncatePreviewString(payload, SPILL_PREVIEW_TEXT_CHARS)]),
      itemCount: lines.length || (payload.trim() ? 1 : 0),
    };
  }
  if (Array.isArray(payload)) {
    const preview = payload.slice(0, SPILL_PREVIEW_ITEMS).map((item) => shrinkPreviewValue(item));
    return { preview: capPreviewArray(preview), itemCount: payload.length };
  }
  return { preview: capPreviewArray([shrinkPreviewValue(payload)]), itemCount: 1 };
}
