import type {
  ActivityTraceItem,
  ActivityTracePhase,
  TurnActivityTrace,
} from "@/components/chat/chatTypes";

type Translate = (key: string, named?: Record<string, unknown>) => string;

type ToolCallLike = {
  id?: unknown;
  function?: {
    name?: unknown;
    arguments?: unknown;
  };
};

const MAX_ACTIVITY_TRACE_ITEMS = 8;

export function cloneTurnActivityTrace(trace: TurnActivityTrace): TurnActivityTrace {
  return JSON.parse(JSON.stringify(trace)) as TurnActivityTrace;
}

export function createTurnActivityTrace(msgId: string): TurnActivityTrace {
  return {
    id: `trace-${msgId}`,
    status: "running",
    phase: "thinking",
    startedAt: Date.now(),
    expanded: false,
    items: [],
  };
}

export function reopenTurnActivityTrace(
  trace: TurnActivityTrace,
  phase: ActivityTracePhase = "thinking",
): void {
  if (trace.status === "completed") {
    trace.status = "running";
    trace.finishedAt = undefined;
    trace.expanded = true;
  }
  trace.phase = phase;
}

function parseToolArgs(toolCall: ToolCallLike): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(toolCall.function?.arguments ?? "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function toolKind(name: string): { kind: ActivityTraceItem["kind"]; phase: ActivityTracePhase } {
  const normalized = name.toLowerCase();
  if (normalized.includes("search") || normalized.includes("find")) {
    return { kind: "search", phase: "searching" };
  }
  if (
    normalized === "browser_execute_script" ||
    (normalized.startsWith("browser_") &&
    /(navigate|page|element|tab|screenshot|capture|content|scroll|click)/.test(normalized)
    )
  ) {
    return { kind: "browse", phase: "browsing" };
  }
  return { kind: "tool", phase: "working" };
}

function toolLabel(name: string): string {
  return name.replace(/^browser_/, "").replace(/_/g, " ");
}

function safeUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function activityUrl(args: Record<string, unknown>, result?: unknown): string | undefined {
  const resultRecord = result && typeof result === "object" && !Array.isArray(result)
    ? result as Record<string, unknown>
    : undefined;
  return safeUrl(resultRecord?.url)
    ?? safeUrl(resultRecord?.currentUrl)
    ?? safeUrl(args.url);
}

function searchCount(result: unknown): number | undefined {
  if (!result || typeof result !== "object" || Array.isArray(result)) return undefined;
  const record = result as Record<string, unknown>;
  if (typeof record.count === "number" && Number.isFinite(record.count)) {
    return Math.max(0, Math.floor(record.count));
  }
  for (const key of ["results", "items", "pages"]) {
    if (Array.isArray(record[key])) return record[key].length;
  }
  return undefined;
}

function trimTraceItems(trace: TurnActivityTrace): void {
  while (trace.items.length > MAX_ACTIVITY_TRACE_ITEMS) {
    const removableIndex = trace.items.findIndex((entry) => entry.status !== "running");
    if (removableIndex === -1) return;
    const [removed] = trace.items.splice(removableIndex, 1);
    trace.omittedCount = (trace.omittedCount ?? 0) + Math.max(1, removed?.count ?? 1);
  }
}

function toolStartText(
  name: string,
  args: Record<string, unknown>,
  kind: ActivityTraceItem["kind"],
  t: Translate,
): string {
  if (kind === "search") {
    const query = [args.query, args.q, args.keyword, args.searchTerm]
      .find((value) => typeof value === "string" && value.trim()) as string | undefined;
    return query
      ? t("chat.activity.searchingFor", { query: query.trim() })
      : t("chat.activity.searching");
  }
  if (name === "browser_navigate") return t("chat.activity.browsingPage");
  if (kind === "browse") return t("chat.activity.readingPage");
  return t("chat.activity.toolRunning", { name: toolLabel(name) });
}

function toolDoneText(
  name: string,
  kind: ActivityTraceItem["kind"],
  result: unknown,
  failed: boolean,
  t: Translate,
): string {
  if (failed) return t("chat.activity.toolFailed", { name: toolLabel(name) });
  if (kind === "search") {
    const count = searchCount(result);
    return count == null
      ? t("chat.activity.searchCompleted")
      : t("chat.activity.searchCompletedWithCount", { count });
  }
  if (name === "browser_navigate") return t("chat.activity.pageOpened");
  if (kind === "browse") return t("chat.activity.pageRead");
  return t("chat.activity.toolCompleted", { name: toolLabel(name) });
}

export function startToolInTrace(
  trace: TurnActivityTrace,
  toolCall: ToolCallLike,
  t: Translate,
): void {
  reopenTurnActivityTrace(trace);
  for (const entry of trace.items) {
    if (entry.status === "running") entry.status = "completed";
  }
  const name = String(toolCall.function?.name ?? "tool");
  const args = parseToolArgs(toolCall);
  const { kind, phase } = toolKind(name);
  trace.phase = phase;
  const url = activityUrl(args);
  const lastItem = trace.items[trace.items.length - 1];
  const canAggregate = !!lastItem
    && lastItem.toolName === name
    && lastItem.status !== "error"
    && (
      name === "browser_execute_script"
      || (kind === "tool" && lastItem.kind === "tool")
    );
  if (canAggregate) {
    lastItem.toolCallId = String(toolCall.id ?? "");
    lastItem.count = Math.max(1, lastItem.count ?? 1) + 1;
    lastItem.text = toolStartText(name, args, kind, t);
    lastItem.status = "running";
    lastItem.url = url ?? lastItem.url;
    return;
  }
  const item: ActivityTraceItem = {
    id: `${trace.id}-tool-${String(toolCall.id ?? trace.items.length)}`,
    toolCallId: String(toolCall.id ?? ""),
    kind,
    text: toolStartText(name, args, kind, t),
    status: "running",
    toolName: name,
    count: 1,
    ...(url ? { url } : {}),
  };
  const existingIndex = trace.items.findIndex(
    (entry) => entry.toolCallId && entry.toolCallId === item.toolCallId,
  );
  if (existingIndex === -1) trace.items.push(item);
  else trace.items[existingIndex] = item;
  trimTraceItems(trace);
}

export function completeToolInTrace(
  trace: TurnActivityTrace,
  toolCall: ToolCallLike,
  result: unknown,
  t: Translate,
): boolean {
  const toolCallId = String(toolCall.id ?? "");
  const item = trace.items.find((entry) => entry.toolCallId === toolCallId);
  if (!item) return false;
  if (result === undefined && item.status !== "running") return false;
  const name = String(toolCall.function?.name ?? "tool");
  const args = parseToolArgs(toolCall);
  const resultRecord = result && typeof result === "object" && !Array.isArray(result)
    ? result as Record<string, unknown>
    : undefined;
  const failed = resultRecord?.ok === false || resultRecord?.error != null;
  item.status = failed ? "error" : "completed";
  item.text = toolDoneText(name, item.kind, result, failed, t);
  item.url = activityUrl(args, result) ?? item.url;
  return true;
}

export function completeTraceBeforeAnswer(trace: TurnActivityTrace): boolean {
  if (trace.status !== "running") return false;
  trace.status = "completed";
  trace.finishedAt = Date.now();
  trace.expanded = false;
  for (const item of trace.items) {
    if (item.status === "running") item.status = "completed";
  }
  return true;
}

export function finishTurnActivityTrace(
  trace: TurnActivityTrace,
  status: "completed" | "stopped" | "error",
): void {
  if (trace.status !== "error" && trace.status !== "stopped") {
    trace.status = status;
  }
  trace.finishedAt ??= Date.now();
  trace.expanded = false;
  for (const item of trace.items) {
    if (item.status === "running") {
      item.status = trace.status === "error" ? "error" : "completed";
    }
  }
}
