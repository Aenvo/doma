/**
 * Chrome / Edge 原生 sidePanel。Safari 适配见 pro overlay 的 editionSwHooks.pro.ts。
 */
import { getContext } from "@/services/Context";
import { Storage } from "@/store/Storage";

export const SIDE_PANEL_PATH = "popup/index.html#sidepannel";

export function tabSidePanelPath(tabId: number): string {
  return `popup/index.html?domaTabId=${tabId}#sidepannel`;
}

/** Let the browser toggle the already-configured panel for the clicked tab. */
export function configureTabScopedSidePanelAction(): void {
  const sidePanel = (getContext().browser as any).sidePanel;
  if (typeof sidePanel?.setPanelBehavior !== "function") return;
  void sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: unknown) => {
    console.warn("[sidePanel] toolbar behavior setup failed", error);
  });
}

export async function configureTabSidePanel(tabId: number): Promise<void> {
  const sidePanel = (getContext().browser as any).sidePanel;
  if (!Number.isInteger(tabId) || !sidePanel?.setOptions) return;
  await sidePanel.setOptions({ tabId, path: tabSidePanelPath(tabId), enabled: true });
}

export async function configureExistingTabSidePanels(): Promise<void> {
  const browser = getContext().browser as any;
  const tabs = await browser.tabs.query({});
  await Promise.all(tabs.map((tab: { id?: number }) => {
    if (typeof tab.id !== "number") return Promise.resolve();
    return configureTabSidePanel(tab.id).catch((error: unknown) => {
      console.warn("[sidePanel] failed to configure tab panel", tab.id, error);
    });
  }));
}

export async function configureGlobalSidePanel(enabled: boolean): Promise<void> {
  const browser = getContext().browser as any;
  if (!browser.sidePanel?.setOptions) return;
  await browser.sidePanel.setOptions({
    path: SIDE_PANEL_PATH,
    enabled,
  });
}

export function registerNativeSidePanelListeners(opts: {
  onOpened: (info: { tabId?: number; windowId?: number }) => void;
  onClosed: (info: { tabId?: number; windowId?: number }) => void;
}): void {
  const browser = getContext().browser as any;
  browser.sidePanel?.onClosed?.addListener((info: { tabId?: number; windowId?: number }) => opts.onClosed(info));
  browser.sidePanel?.onOpened?.addListener((info: { tabId?: number; windowId?: number }) => opts.onOpened(info));
}

export async function openTabSidePanel(tabId: number): Promise<void> {
  const browser = getContext().browser as any;
  if (!Number.isInteger(tabId) || !browser.sidePanel?.setOptions || !browser.sidePanel?.open) return;
  await configureTabSidePanel(tabId);
  await browser.sidePanel.open({ tabId });
  void Storage.init().set("doma_agent_side_pannel_status", true);
}

export function handleBrowserActionClicked(tab: { id?: number }): void {
  if (typeof tab?.id !== "number") return;
  // Fallback for browsers where native action behavior is unavailable.
  const sidePanel = (getContext().browser as any).sidePanel;
  void sidePanel?.open?.({ tabId: tab.id }).catch((error: unknown) => {
    console.warn("[sidePanel] failed to open tab panel", tab.id, error);
  });
}

/** Pro Safari overlay 覆盖：打开页内 iframe 侧栏。Open / Chrome Pro 返回 false。 */
export async function tryEnsureEditionSidePanel(
  _opts?: { maxWaitMs?: number; intervalMs?: number },
): Promise<boolean> {
  return false;
}
