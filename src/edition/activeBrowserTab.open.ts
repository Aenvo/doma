/**
 * Open / Chrome 侧栏：用 windows / tabs API 取当前页。
 * Safari 页内 iframe 适配见 activeBrowserTab.pro.ts（由 pro overlay 覆盖）。
 */
import { getContext } from "@/services/Context";

export type BrowserTabLite = {
  id?: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
};

export type MentionTabItem = {
  tabId: number;
  title: string;
  url: string;
  favIconUrl?: string;
  active?: boolean;
  windowId?: number;
};

/** 是否为 Safari 页内扩展壳（Open 恒为 false） */
export function isSafariSidePanelShell(): boolean {
  return false;
}

/** Safari 页内壳关闭侧栏；Open / Chrome sidePanel 无操作 */
export async function requestCloseSidePanelShell(): Promise<boolean> {
  return false;
}

/** ChatPanel 启动时建立宿主 tab 跟踪；Open 无额外逻辑 */
export function initActiveBrowserTabTracking(
  _onUpdate?: (tab: BrowserTabLite) => void,
): () => void {
  return () => {};
}

export function getActiveBrowserTabSync(): BrowserTabLite | undefined {
  return undefined;
}

export async function resolveActiveBrowserTab(): Promise<BrowserTabLite | undefined> {
  try {
    const w = await getContext().browser.windows.getLastFocused({ populate: true });
    return w.tabs?.find((t: { active?: boolean }) => t.active) as BrowserTabLite | undefined;
  } catch {
    return undefined;
  }
}

export function getCurrentTab(
  callback: (url: string | null, tabId: number | null) => void,
  currentWindow: boolean = true,
): void {
  const query: { active: boolean; currentWindow?: boolean } = { active: true };
  if (currentWindow) query.currentWindow = currentWindow;
  getContext().browser.tabs.query(query, (tabs: Array<{ url?: string; id?: number }>) => {
    callback(tabs.length ? tabs[0].url ?? null : null, tabs.length ? tabs[0].id ?? null : null);
  });
}

export async function listMentionTabs(): Promise<MentionTabItem[]> {
  const tabs = (await getContext().browser.tabs.query({ currentWindow: true })) as Array<{
    id?: number;
    title?: string;
    url?: string;
    favIconUrl?: string;
    active?: boolean;
    windowId?: number;
    index?: number;
  }>;
  return tabs
    .filter((tab) => typeof tab.id === "number")
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((tab) => ({
      tabId: tab.id as number,
      title: typeof tab.title === "string" ? tab.title : "",
      url: typeof tab.url === "string" ? tab.url : "",
      favIconUrl: typeof tab.favIconUrl === "string" ? tab.favIconUrl : undefined,
      active: tab.active === true,
      windowId: typeof tab.windowId === "number" ? tab.windowId : undefined,
    }));
}

/** Picker：订阅当前页变化；返回 teardown */
export function subscribeActiveTabChanges(onChange: () => void): () => void {
  const browser = getContext().browser;
  const onActivated = () => onChange();
  const onUpdated = () => onChange();
  browser.tabs.onActivated.addListener(onActivated);
  browser.tabs.onUpdated.addListener(onUpdated);
  return () => {
    try {
      browser.tabs.onActivated.removeListener(onActivated);
    } catch {
      /* ignore */
    }
    try {
      browser.tabs.onUpdated.removeListener(onUpdated);
    } catch {
      /* ignore */
    }
  };
}
