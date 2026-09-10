/**
 * 定时消息独立 IndexedDB（与 chatStorage 解耦）。
 * 侧栏与 service worker 共享同一扩展源，均可读写。
 */

/** 不重复 | 每天 | 每小时 | 每 N 分钟（N 见 intervalMinutes） */
export type ScheduledRepeat = "none" | "daily" | "hourly" | "minutes";

export type ScheduledMessageStatus = "scheduled" | "running" | "done" | "paused" | "error";

export type ScheduledMessage = {
  id: string;
  /** 到期要发送的正文；不绑定会话，触发时由 ChatPanel 决定落哪次对话 */
  text: string;
  /** 下次触发绝对时间；首跑为用户选定时间 */
  runAt: number;
  repeat: ScheduledRepeat;
  /** repeat === "minutes" 时的间隔（分钟），至少 1 */
  intervalMinutes?: number;
  status: ScheduledMessageStatus;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  lastError?: string;
  /** 某次触发实际落入的会话（由发送逻辑回写，可选） */
  lastConversationId?: string;
};

export type ScheduledRunStatus = "ok" | "error" | "cancelled";

/** 单次定时任务执行结果 */
export type ScheduledRun = {
  id: string;
  scheduledId: string;
  conversationId?: string;
  assistantMsgIds?: string[];
  resultText: string;
  status: ScheduledRunStatus;
  createdAt: number;
};

const DB_NAME = "DomA_ScheduledMessagesDB";
const DB_VERSION = 2;
const STORE = "scheduledMessages";
const RUNS_STORE = "scheduledRuns";

export const SCHEDULED_ALARM_PREFIX = "doma-sched:";

export function scheduledAlarmName(id: string): string {
  return `${SCHEDULED_ALARM_PREFIX}${id}`;
}

export function scheduledIdFromAlarmName(name: string): string | null {
  if (!name.startsWith(SCHEDULED_ALARM_PREFIX)) return null;
  const id = name.slice(SCHEDULED_ALARM_PREFIX.length).trim();
  return id || null;
}

export function newScheduledMessageId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `sched-${crypto.randomUUID()}`
    : `sched-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function newScheduledRunId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `srun-${crypto.randomUUID()}`
    : `srun-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function normalizeIntervalMinutes(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.floor(n));
}

/**
 * 推算下一次 runAt（基于本次计划触发时间 fromMs，避免闹钟迟到导致漂移）：
 * - none：不重复
 * - daily：同一时刻 +1 天
 * - hourly：fromMs + 1 小时（从用户选定时间起）
 * - minutes：fromMs + N 分钟（从用户选定时间起）
 */
export function computeNextRunAt(
  fromMs: number,
  repeat: ScheduledRepeat | string,
  intervalMinutes?: number,
): number | null {
  if (repeat === "none") return null;
  if (repeat === "daily") {
    const d = new Date(fromMs);
    d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  if (repeat === "hourly") {
    return fromMs + 60 * 60 * 1000;
  }
  if (repeat === "minutes") {
    const mins = normalizeIntervalMinutes(intervalMinutes);
    return fromMs + mins * 60 * 1000;
  }
  // 旧数据兼容
  if (repeat === "weekly") {
    const d = new Date(fromMs);
    d.setDate(d.getDate() + 7);
    return d.getTime();
  }
  if (repeat === "monthly") {
    const d = new Date(fromMs);
    d.setMonth(d.getMonth() + 1);
    return d.getTime();
  }
  return null;
}

let db: IDBDatabase | null = null;
let openPromise: Promise<IDBDatabase> | null = null;

function ensureRunsStore(idb: IDBDatabase) {
  if (idb.objectStoreNames.contains(RUNS_STORE)) return;
  const store = idb.createObjectStore(RUNS_STORE, { keyPath: "id" });
  store.createIndex("scheduledId", "scheduledId", { unique: false });
  store.createIndex("createdAt", "createdAt", { unique: false });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("scheduledMessages IDB open error"));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const idb = (event.target as IDBOpenDBRequest).result;
      if (!idb.objectStoreNames.contains(STORE)) {
        const store = idb.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("runAt", "runAt", { unique: false });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      ensureRunsStore(idb);
    };
  });
}

async function ensureDb(): Promise<IDBDatabase> {
  if (db) return db;
  if (!openPromise) {
    openPromise = openDb().then((d) => {
      db = d;
      return d;
    });
  }
  return openPromise;
}

function reqToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexedDB request error"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB transaction error"));
    tx.onabort = () => reject(tx.error ?? new Error("indexedDB transaction aborted"));
  });
}

export async function putScheduledMessage(row: ScheduledMessage): Promise<void> {
  const idb = await ensureDb();
  const tx = idb.transaction(STORE, "readwrite");
  await reqToPromise(tx.objectStore(STORE).put(row));
}

export async function getScheduledMessage(id: string): Promise<ScheduledMessage | undefined> {
  const idb = await ensureDb();
  const tx = idb.transaction(STORE, "readonly");
  const row = await reqToPromise(tx.objectStore(STORE).get(id));
  return row as ScheduledMessage | undefined;
}

export async function deleteScheduledMessage(id: string): Promise<void> {
  const idb = await ensureDb();
  const tx = idb.transaction([STORE, RUNS_STORE], "readwrite");
  const runsStore = tx.objectStore(RUNS_STORE);
  const idx = runsStore.index("scheduledId");
  const runs = (await reqToPromise(idx.getAll(id))) as ScheduledRun[];
  for (const run of runs ?? []) {
    runsStore.delete(run.id);
  }
  tx.objectStore(STORE).delete(id);
  await txDone(tx);
}

export async function listScheduledMessages(): Promise<ScheduledMessage[]> {
  const idb = await ensureDb();
  const tx = idb.transaction(STORE, "readonly");
  const rows = (await reqToPromise(tx.objectStore(STORE).getAll())) as ScheduledMessage[];
  return (rows ?? []).slice().sort((a, b) => a.runAt - b.runAt);
}

export async function patchScheduledMessage(
  id: string,
  patch: Partial<Omit<ScheduledMessage, "id" | "createdAt">>,
): Promise<ScheduledMessage | undefined> {
  const existing = await getScheduledMessage(id);
  if (!existing) return undefined;
  const next: ScheduledMessage = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  };
  await putScheduledMessage(next);
  return next;
}

const RESULT_TEXT_MAX = 100_000;

export type CreateScheduledRunInput = {
  scheduledId: string;
  conversationId?: string;
  assistantMsgIds?: string[];
  resultText: string;
  status: ScheduledRunStatus;
};

export async function createScheduledRun(input: CreateScheduledRunInput): Promise<ScheduledRun> {
  const scheduledId = String(input.scheduledId ?? "").trim();
  if (!scheduledId) {
    throw new Error("scheduledId required");
  }
  const now = Date.now();
  const resultText = String(input.resultText ?? "").slice(0, RESULT_TEXT_MAX);
  const row: ScheduledRun = {
    id: newScheduledRunId(),
    scheduledId,
    conversationId: input.conversationId?.trim() || undefined,
    assistantMsgIds: input.assistantMsgIds?.length ? [...input.assistantMsgIds] : undefined,
    resultText,
    status: input.status,
    createdAt: now,
  };
  const idb = await ensureDb();
  const tx = idb.transaction(RUNS_STORE, "readwrite");
  await reqToPromise(tx.objectStore(RUNS_STORE).put(row));
  return row;
}

export async function listScheduledRuns(scheduledId: string): Promise<ScheduledRun[]> {
  const id = String(scheduledId ?? "").trim();
  if (!id) return [];
  const idb = await ensureDb();
  const tx = idb.transaction(RUNS_STORE, "readonly");
  const rows = (await reqToPromise(
    tx.objectStore(RUNS_STORE).index("scheduledId").getAll(id),
  )) as ScheduledRun[];
  return (rows ?? []).slice().sort((a, b) => b.createdAt - a.createdAt);
}

export type CreateScheduledMessageInput = {
  text: string;
  runAt: number;
  repeat?: ScheduledRepeat;
  intervalMinutes?: number;
};

/** SW → ChatPanel 触发载荷：只传定时任务本身，不含 conversationId */
export type ScheduledFirePayload = {
  id: string;
  text: string;
  repeat: ScheduledRepeat;
  runAt: number;
};

export async function createScheduledMessage(
  input: CreateScheduledMessageInput,
): Promise<ScheduledMessage> {
  const now = Date.now();
  const repeat = input.repeat ?? "none";
  const row: ScheduledMessage = {
    id: newScheduledMessageId(),
    text: input.text,
    runAt: input.runAt,
    repeat,
    intervalMinutes: repeat === "minutes" ? normalizeIntervalMinutes(input.intervalMinutes) : undefined,
    status: "scheduled",
    createdAt: now,
    updatedAt: now,
  };
  await putScheduledMessage(row);
  return row;
}
