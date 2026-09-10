/**
 * chrome.alarms 注册/清除：侧栏与 SW 均可调用（不依赖 runtime.sendMessage）。
 */

import { getContext } from "@/services/Context";
import { scheduledAlarmName } from "./scheduledMessagesStore";

function alarmsApi(): {
  create: (name: string, info: { when: number }) => Promise<void> | void;
  clear: (name: string) => Promise<boolean> | void;
  get?: (name: string) => Promise<{ name: string; scheduledTime?: number } | undefined>;
  getAll?: () => Promise<Array<{ name: string; scheduledTime?: number }>>;
} | null {
  const browser = getContext().browser as { alarms?: any };
  return browser.alarms ?? null;
}

export async function armScheduledAlarm(row: { id: string; runAt: number }): Promise<void> {
  const alarms = alarmsApi();
  if (!alarms?.create) {
    throw new Error("chrome.alarms unavailable");
  }
  const name = scheduledAlarmName(row.id);
  const when = Math.max(row.runAt, Date.now() + 1000);
  console.log("[scheduled] arm alarm", {
    id: row.id,
    name,
    runAt: row.runAt,
    runAtIso: new Date(row.runAt).toISOString(),
    when,
    whenIso: new Date(when).toISOString(),
    delayMs: when - Date.now(),
  });
  await alarms.create(name, { when });
  try {
    const got = alarms.get ? await alarms.get(name) : undefined;
    console.log("[scheduled] arm alarm verified", {
      name,
      got,
      scheduledTimeIso:
        got?.scheduledTime != null ? new Date(got.scheduledTime).toISOString() : undefined,
    });
  } catch (e) {
    console.warn("[scheduled] arm alarm get() failed", name, e);
  }
}

export async function clearScheduledAlarm(id: string): Promise<void> {
  const alarms = alarmsApi();
  if (!alarms?.clear) return;
  const name = scheduledAlarmName(id);
  try {
    const cleared = await alarms.clear(name);
    console.log("[scheduled] clear alarm", { id, name, cleared });
  } catch (e) {
    console.warn("[scheduled] clear alarm failed", { id, name, e });
  }
}

export async function listScheduledAlarmsDebug(): Promise<
  Array<{ name: string; scheduledTime?: number; scheduledTimeIso?: string }>
> {
  const alarms = alarmsApi();
  if (!alarms?.getAll) return [];
  try {
    const all = await alarms.getAll();
    return (all ?? []).map((a) => ({
      name: a.name,
      scheduledTime: a.scheduledTime,
      scheduledTimeIso:
        a.scheduledTime != null ? new Date(a.scheduledTime).toISOString() : undefined,
    }));
  } catch (e) {
    console.warn("[scheduled] alarms.getAll failed", e);
    return [];
  }
}
