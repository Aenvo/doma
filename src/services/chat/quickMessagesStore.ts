import { isProEdition } from "@/config/buildEdition";
import { getContext } from "@/services/Context";
import { Storage } from "@/store/Storage";

export const QUICK_MESSAGES_STORAGE_KEY = "doma_quick_messages_v1";

export type QuickMessageDefaultKey =
  | "summarize"
  | "advanceNextStep"
  | "downloadVideo"
  | "blockAds";

export type QuickMessageItem = {
  id: string;
  /** default → resolve via i18n; custom → use text */
  kind: "default" | "custom";
  defaultKey?: QuickMessageDefaultKey;
  text?: string;
};

const OPEN_DEFAULT_ITEMS: QuickMessageItem[] = [
  { id: "default-summarize", kind: "default", defaultKey: "summarize" },
  { id: "default-advance-next-step", kind: "default", defaultKey: "advanceNextStep" },
];

/** 仅 Pro：下载视频 / 屏蔽广告 */
const PRO_ONLY_DEFAULT_ITEMS: QuickMessageItem[] = [
  { id: "default-download-video", kind: "default", defaultKey: "downloadVideo" },
  { id: "default-block-ads", kind: "default", defaultKey: "blockAds" },
];

function getDefaultItems(): QuickMessageItem[] {
  return isProEdition()
    ? [...OPEN_DEFAULT_ITEMS, ...PRO_ONLY_DEFAULT_ITEMS]
    : OPEN_DEFAULT_ITEMS.map((x) => ({ ...x }));
}

function getDefaultKeys(): Set<QuickMessageDefaultKey> {
  const keys: QuickMessageDefaultKey[] = ["summarize", "advanceNextStep"];
  if (isProEdition()) {
    keys.push("downloadVideo", "blockAds");
  }
  return new Set(keys);
}

function isValidItem(v: unknown): v is QuickMessageItem {
  if (!v || typeof v !== "object") return false;
  const o = v as QuickMessageItem;
  if (typeof o.id !== "string" || !o.id) return false;
  if (o.kind === "default") {
    return !!o.defaultKey && getDefaultKeys().has(o.defaultKey);
  }
  if (o.kind === "custom") {
    return typeof o.text === "string" && o.text.trim().length > 0;
  }
  return false;
}

function toPlainItems(items: QuickMessageItem[]): QuickMessageItem[] {
  // chrome.storage 不能可靠序列化 Vue Proxy，必须先打成纯对象
  return JSON.parse(JSON.stringify(items)) as QuickMessageItem[];
}

function storageLocalGet(key: string): Promise<unknown> {
  const browser = getContext().browser;
  return new Promise((resolve) => {
    try {
      browser.storage.local.get(key, (result: Record<string, unknown>) => {
        if (browser.runtime?.lastError) {
          console.warn("[quickMessages] storage.get error:", browser.runtime.lastError);
          resolve(null);
          return;
        }
        resolve(result?.[key] ?? null);
      });
    } catch (e) {
      console.warn("[quickMessages] storage.get threw:", e);
      resolve(null);
    }
  });
}

function storageLocalSet(key: string, value: unknown): Promise<void> {
  const browser = getContext().browser;
  return new Promise((resolve, reject) => {
    try {
      browser.storage.local.set({ [key]: value }, () => {
        if (browser.runtime?.lastError) {
          reject(new Error(browser.runtime.lastError.message));
          return;
        }
        // 同步 Storage 单例缓存，避免同页读到旧 cache
        try {
          Storage.init().cache[key] = value;
        } catch {
          /* ignore */
        }
        resolve();
      });
    } catch (e) {
      reject(e);
    }
  });
}

export function getDefaultQuickMessages(): QuickMessageItem[] {
  return getDefaultItems().map((x) => ({ ...x }));
}

/** 把缺失的内置快捷消息按默认顺序插回（已有用户 storage 也能看到新增项） */
function mergeMissingDefaultItems(items: QuickMessageItem[]): QuickMessageItem[] {
  const defaults = getDefaultItems();
  const next = items.map((x) => ({ ...x }));
  const hasKey = (key: QuickMessageDefaultKey) =>
    next.some((i) => i.kind === "default" && i.defaultKey === key);

  for (const def of defaults) {
    if (!def.defaultKey || hasKey(def.defaultKey)) continue;
    const defIndex = defaults.findIndex((d) => d.defaultKey === def.defaultKey);
    let insertAt = next.length;
    for (let i = defIndex - 1; i >= 0; i--) {
      const prevKey = defaults[i]?.defaultKey;
      if (!prevKey) continue;
      const prevIdx = next.findIndex((it) => it.kind === "default" && it.defaultKey === prevKey);
      if (prevIdx >= 0) {
        insertAt = prevIdx + 1;
        break;
      }
    }
    next.splice(insertAt, 0, { ...def });
  }
  return next;
}

export async function loadQuickMessages(): Promise<QuickMessageItem[]> {
  const raw = await storageLocalGet(QUICK_MESSAGES_STORAGE_KEY);
  if (!Array.isArray(raw) || raw.length === 0) {
    const seeded = getDefaultQuickMessages();
    await saveQuickMessages(seeded);
    return seeded;
  }
  const items = raw.filter(isValidItem);
  if (items.length === 0) {
    const seeded = getDefaultQuickMessages();
    await saveQuickMessages(seeded);
    return seeded;
  }
  const merged = mergeMissingDefaultItems(items.map((x) => ({ ...x })));
  if (merged.length !== items.length || items.length !== raw.length) {
    await saveQuickMessages(merged);
  }
  return merged;
}

export async function saveQuickMessages(items: QuickMessageItem[]): Promise<void> {
  const plain = toPlainItems(items);
  await storageLocalSet(QUICK_MESSAGES_STORAGE_KEY, plain);
}

export function newCustomQuickMessageId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `qm-${crypto.randomUUID()}`
    : `qm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Resolve displayed label / send base for an item */
export function resolveQuickMessageLabel(
  item: QuickMessageItem,
  t: (key: string) => string,
): string {
  if (item.kind === "default" && item.defaultKey) {
    return t(`chat.quickMessages.defaults.${item.defaultKey}`);
  }
  return (item.text || "").trim();
}

/**
 * Split on first `/` for optional branch UI.
 * left/right are the segments; hasSlash false → treat whole as plain.
 */
export function splitQuickMessageSlash(label: string): {
  hasSlash: boolean;
  left: string;
  right: string;
} {
  const idx = label.indexOf("/");
  if (idx < 0) {
    return { hasSlash: false, left: label, right: "" };
  }
  return {
    hasSlash: true,
    left: label.slice(0, idx),
    right: label.slice(idx + 1),
  };
}

/** Click left → left only; click right → left + right (no slash). */
export function resolveQuickMessageSendText(
  label: string,
  side: "left" | "right" | "whole",
): string {
  const { hasSlash, left, right } = splitQuickMessageSlash(label);
  if (!hasSlash || side === "whole") return label;
  if (side === "left") return left;
  return `${left}${right}`;
}
