/**
 * Service worker 侧：定时消息 alarm 注册 / 触发 / 确保侧栏打开。
 */

import { getContext } from "@/services/Context";
import { Storage } from "@/store/Storage";
import {
  computeNextRunAt,
  getScheduledMessage,
  listScheduledMessages,
  patchScheduledMessage,
  scheduledAlarmName,
  scheduledIdFromAlarmName,
  type ScheduledFirePayload,
  type ScheduledMessage,
} from "./scheduledMessagesStore";
import {
  armScheduledAlarm,
  clearScheduledAlarm,
  listScheduledAlarmsDebug,
} from "./scheduledMessagesAlarms";

export type { ScheduledFirePayload };
export { armScheduledAlarm, clearScheduledAlarm };

const SIDE_PANEL_PATH = "popup/index.html#sidepannel";
const PING_OPERATE = "chat/scheduledPing";
const FIRE_OPERATE = "chat/scheduledFire";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pingSidePanel(): Promise<boolean> {
  const browser = getContext().browser as any;
  try {
    const res = await browser.runtime.sendMessage({
      origin: "background",
      operate: PING_OPERATE,
    });
    const ok = !!(res && (res.ok === true || res.success === true));
    console.log("[scheduled] ping sidepanel", { ok, res });
    return ok;
  } catch (e) {
    console.log("[scheduled] ping sidepanel failed", e);
    return false;
  }
}

async function openSidePanel(): Promise<void> {
  const browser = getContext().browser as any;
  if (!browser.sidePanel?.setOptions) {
    console.warn("[scheduled] sidePanel.setOptions missing");
    return;
  }

  console.log("[scheduled] opening side panel…");
  await browser.sidePanel.setOptions({
    path: SIDE_PANEL_PATH,
    enabled: true,
  });

  let windowId: number | undefined;
  try {
    const win = await browser.windows.getLastFocused();
    if (win?.id != null) windowId = win.id;
  } catch {
    // ignore
  }

  if (windowId != null && browser.sidePanel.open) {
    try {
      await browser.sidePanel.open({ windowId });
      console.log("[scheduled] sidePanel.open ok", { windowId });
    } catch (e) {
      console.warn("[scheduled] sidePanel.open failed", e);
    }
  } else {
    console.warn("[scheduled] no windowId for sidePanel.open", { windowId });
  }

  try {
    await Storage.init().set("doma_agent_side_pannel_status", true);
  } catch {
    // ignore
  }
}

/** 侧栏已开则直接可用；否则打开并短轮询 ping，直到就绪或超时 */
export async function ensureSidePanelReady(opts?: {
  maxWaitMs?: number;
  intervalMs?: number;
}): Promise<boolean> {
  if (await pingSidePanel()) return true;

  await openSidePanel();

  const maxWaitMs = opts?.maxWaitMs ?? 8000;
  const intervalMs = opts?.intervalMs ?? 250;
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await sleep(intervalMs);
    if (await pingSidePanel()) return true;
  }
  console.warn("[scheduled] side panel not ready after wait", { maxWaitMs });
  return false;
}

async function deliverFire(row: ScheduledMessage): Promise<boolean> {
  console.log("[scheduled] deliverFire start", {
    id: row.id,
    runAt: row.runAt,
    textLen: row.text?.length ?? 0,
  });
  const ready = await ensureSidePanelReady();
  if (!ready) {
    console.warn("[scheduled] side panel not ready, fire aborted", row.id);
    await patchScheduledMessage(row.id, {
      status: "error",
      lastError: "side panel not ready",
    });
    return false;
  }

  const payload: ScheduledFirePayload = {
    id: row.id,
    text: row.text,
    repeat: row.repeat,
    runAt: row.runAt,
  };

  const browser = getContext().browser as any;
  try {
    const res = await browser.runtime.sendMessage({
      origin: "background",
      operate: FIRE_OPERATE,
      payload,
    });
    const ok = !!(res && (res.ok === true || res.success === true));
    console.log("[scheduled] deliverFire sendMessage result", { id: row.id, ok, res });
    return ok;
  } catch (e) {
    console.warn("[scheduled] fire message failed", row.id, e);
    await patchScheduledMessage(row.id, {
      status: "error",
      lastError: String(e),
    });
    return false;
  }
}

/** alarm 到期：投递到 ChatPanel，并推进重复周期 / 标记完成 */
export async function handleScheduledAlarm(alarmName: string): Promise<void> {
  console.log("[scheduled] onAlarm", {
    alarmName,
    now: Date.now(),
    nowIso: new Date().toISOString(),
  });
  const id = scheduledIdFromAlarmName(alarmName);
  if (!id) {
    console.log("[scheduled] onAlarm ignored (not scheduled prefix)", alarmName);
    return;
  }

  const row = await getScheduledMessage(id);
  if (!row) {
    console.warn("[scheduled] onAlarm: row missing in IDB", id);
    await clearScheduledAlarm(id);
    return;
  }
  console.log("[scheduled] onAlarm row", {
    id: row.id,
    status: row.status,
    runAt: row.runAt,
    runAtIso: new Date(row.runAt).toISOString(),
    repeat: row.repeat,
  });
  if (row.status === "paused" || row.status === "done") {
    console.log("[scheduled] onAlarm skip by status", row.status);
    return;
  }

  const now = Date.now();
  await patchScheduledMessage(id, {
    status: "running",
    lastRunAt: now,
    lastError: undefined,
  });

  const delivered = await deliverFire(row);
  console.log("[scheduled] onAlarm delivered", { id, delivered });

  const nextRunAt = computeNextRunAt(row.runAt, row.repeat, row.intervalMinutes);
  if (nextRunAt != null) {
    const next = await patchScheduledMessage(id, {
      status: "scheduled",
      runAt: nextRunAt,
      lastError: delivered ? undefined : "fire delivery failed; rescheduled",
    });
    if (next) {
      await armScheduledAlarm(next);
    }
    return;
  }

  await patchScheduledMessage(id, {
    status: delivered ? "done" : "error",
    lastError: delivered ? undefined : "fire delivery failed",
  });
  await clearScheduledAlarm(id);
}

/** 扩展重载后 alarms 会丢：SW 启动时按 IDB 重新 arm */
export async function rehydratePendingScheduledAlarms(): Promise<void> {
  try {
    const rows = await listScheduledMessages();
    const pending = rows.filter((r) => r.status === "scheduled" || r.status === "error");
    const existing = await listScheduledAlarmsDebug();
    console.log("[scheduled] rehydrate start", {
      pendingCount: pending.length,
      existingAlarms: existing,
    });
    for (const row of pending) {
      if (row.runAt <= Date.now()) {
        console.log("[scheduled] rehydrate overdue → fire now", row.id, row.runAt);
        await handleScheduledAlarm(scheduledAlarmName(row.id));
        continue;
      }
      await armScheduledAlarm(row);
    }
    console.log("[scheduled] rehydrate done", await listScheduledAlarmsDebug());
  } catch (e) {
    console.error("[scheduled] rehydrate failed", e);
  }
}

export function registerScheduledAlarmsListener(): void {
  const browser = getContext().browser as any;
  if (!browser.alarms?.onAlarm) {
    console.warn("[scheduled] alarms API missing");
    return;
  }
  browser.alarms.onAlarm.addListener((alarm: { name?: string }) => {
    const name = typeof alarm?.name === "string" ? alarm.name : "";
    console.log("[scheduled] alarms.onAlarm raw", alarm);
    if (!scheduledIdFromAlarmName(name)) return;
    void handleScheduledAlarm(name);
  });
  console.log("[scheduled] alarms.onAlarm listener registered");
  void rehydratePendingScheduledAlarms();
}
