/** spill 读写共用的 payload 结构识别（tool result 原样 spill，schema 从真实结构推断） */

export const SPILL_WRAPPED_ARRAY_KEYS = [
  "elements",
  "rows",
  "items",
  "data",
  "uniqueEmails",
  "emails",
  "results",
  "list",
  "records",
  "values",
] as const;

export type SpillPayloadSchema = {
  kind: "text" | "json-array" | "json-object" | "scalar";
  itemCount?: number;
  fields?: string[];
  /** 相对每条记录的点路径，如 result.emails；顶层 string[] 时为空 */
  arrayPath?: string;
  /** string[] 导出时的列名，默认 value */
  valueColumn?: string;
  unit: "line" | "item" | "path";
};

export type SpillArrayDiscovery = {
  arrayPath: string;
  items: unknown[];
};

export function getValueByDotPath(root: unknown, path: string): unknown {
  const parts = path.split(".").map((p) => p.trim()).filter(Boolean);
  let cur: unknown = root;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function isPreferredArrayPath(arrayPath: string): boolean {
  return SPILL_WRAPPED_ARRAY_KEYS.some((k) => arrayPath === k || arrayPath.endsWith(`.${k}`));
}

function scoreArrayCandidate(arrayPath: string, items: unknown[]): number {
  if (!items.length) return -1;
  return items.length + (isPreferredArrayPath(arrayPath) ? 1_000_000 : 0);
}

/** 收集 payload 内所有数组候选（含 execute_script 帧包装内的 result.emails） */
function collectSpillArrayCandidates(
  node: unknown,
  prefix: string,
  depth: number,
  maxDepth: number,
  out: SpillArrayDiscovery[],
): void {
  if (depth > maxDepth || node == null) return;

  if (Array.isArray(node)) {
    if (node.length > 0) {
      out.push({ arrayPath: prefix, items: node });
      for (const el of node) {
        if (el && typeof el === "object") {
          collectSpillArrayCandidates(el, prefix, depth + 1, maxDepth, out);
        }
      }
    }
    return;
  }

  if (typeof node !== "object") return;

  for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(val)) {
      out.push({ arrayPath: path, items: val });
    } else if (val && typeof val === "object") {
      collectSpillArrayCandidates(val, path, depth + 1, maxDepth, out);
    }
  }
}

export function findWrappedArray(payload: unknown): SpillArrayDiscovery | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const obj = payload as Record<string, unknown>;
  for (const key of SPILL_WRAPPED_ARRAY_KEYS) {
    const val = obj[key];
    if (Array.isArray(val) && val.length > 0) return { arrayPath: key, items: val };
  }
  return null;
}

/** 在整棵 payload 树里找最有意义的数据数组（优先更长 + emails/elements 等语义键） */
export function discoverSpillArray(payload: unknown, maxDepth = 6): SpillArrayDiscovery | null {
  const candidates: SpillArrayDiscovery[] = [];
  collectSpillArrayCandidates(payload, "", 0, maxDepth, candidates);

  let best: SpillArrayDiscovery | null = null;
  let bestScore = -1;

  const hasNestedDataArray = candidates.some(
    (c) => c.arrayPath.includes(".") && c.items.length > 1,
  );

  for (const c of candidates) {
    if (!c.items.length) continue;

    const isSingleFrameWrapper =
      c.arrayPath === "" &&
      c.items.length === 1 &&
      c.items[0] != null &&
      typeof c.items[0] === "object" &&
      !Array.isArray(c.items[0]) &&
      !isStringArray(c.items);
    if (isSingleFrameWrapper && hasNestedDataArray) continue;

    const score = scoreArrayCandidate(c.arrayPath, c.items);
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }

  return best;
}

/** 按点路径从 payload 提取数组；支持 execute_script 顶层 [{ result: { emails } }] */
export function extractArrayByPathFromPayload(root: unknown, path: string): unknown[] | null {
  const p = path.trim();
  if (!p) return null;

  if (Array.isArray(root)) {
    const merged: unknown[] = [];
    for (const el of root) {
      const val = getValueByDotPath(el, p);
      if (Array.isArray(val)) merged.push(...val);
    }
    if (merged.length > 0) return merged;

    const onRoot = getValueByDotPath(root, p);
    if (Array.isArray(onRoot)) return onRoot;
    return null;
  }

  const byDot = getValueByDotPath(root, p);
  if (Array.isArray(byDot)) return byDot;
  return null;
}

export function inferArrayFields(items: unknown[]): string[] | undefined {
  if (
    items.length > 0 &&
    items[0] &&
    typeof items[0] === "object" &&
    !Array.isArray(items[0])
  ) {
    return Object.keys(items[0] as object);
  }
  return undefined;
}

export function isStringArray(items: unknown[]): boolean {
  return items.length > 0 && items.every((x) => typeof x === "string");
}

/** stub 时从原始 tool result 推断 schema，供 spill_get / spill_produce 默认使用 */
export function inferSpillSchema(payload: unknown): SpillPayloadSchema {
  if (typeof payload === "string") {
    const lines = payload.split("\n");
    return { kind: "text", itemCount: lines.length, unit: "line" };
  }

  const discovered = discoverSpillArray(payload);
  if (discovered && discovered.items.length > 0) {
    const stringArr = isStringArray(discovered.items);
    return {
      kind: "json-array",
      itemCount: discovered.items.length,
      arrayPath: discovered.arrayPath || undefined,
      fields: stringArr ? undefined : inferArrayFields(discovered.items),
      valueColumn: stringArr ? "value" : undefined,
      unit: "item",
    };
  }

  if (Array.isArray(payload)) {
    return { kind: "json-array", itemCount: payload.length, unit: "item" };
  }
  if (payload && typeof payload === "object") {
    return { kind: "json-object", itemCount: 1, unit: "path" };
  }
  return { kind: "scalar", itemCount: 1, unit: "path" };
}

/** slice/tail/full/produce 时解析可读数组；path 可省略则用 schema.arrayPath 或自动探测 */
export function resolveSpillReadArray(
  parsed: { kind: string; value: unknown },
  path?: string,
): { arrayPath?: string; items: unknown[] } | null {
  const explicit = path?.trim();

  if (explicit) {
    const items = extractArrayByPathFromPayload(parsed.value, explicit);
    if (items) return { arrayPath: explicit, items };
    return null;
  }

  const discovered = discoverSpillArray(parsed.value);
  if (discovered) {
    return {
      arrayPath: discovered.arrayPath || undefined,
      items: discovered.items,
    };
  }

  if (parsed.kind === "json-array") {
    return { items: parsed.value as unknown[] };
  }

  return null;
}
