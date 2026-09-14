/**
 * Chrome / Edge 原生 sidePanel。Safari 适配见 pro overlay 的 editionSwHooks.pro.ts。
 */
import { getContext } from "@/services/Context";
import { Storage } from "@/store/Storage";

export const SIDE_PANEL_PATH = "popup/index.html#sidepannel";

export async function configureGlobalSidePanel(enabled: boolean): Promise<void> {
  const browser = getContext().browser as any;
  if (!browser.sidePanel?.setOptions) return;
  await browser.sidePanel.setOptions({
    path: SIDE_PANEL_PATH,
    enabled,
  });
}

export function registerNativeSidePanelListeners(opts: {
  onOpened: () => void;
  onClosed: () => void;
}): void {
  const browser = getContext().browser as any;
  if (!browser.sidePanel?.onClosed) return;
  browser.sidePanel.onClosed.addListener(() => opts.onClosed());
  browser.sidePanel.onOpened.addListener(() => opts.onOpened());
}

export function handleBrowserActionClicked(
  tab: { windowId?: number },
  state: {
    showSidePanel: boolean;
    setShowSidePanel: (open: boolean) => void;
  },
): void {
  const browser = getContext().browser as any;
  if (!browser.sidePanel?.setOptions) return;
  if (state.showSidePanel) {
    browser.sidePanel.setOptions({
      path: SIDE_PANEL_PATH,
      enabled: false,
    });
    state.setShowSidePanel(false);
    void Storage.init().set("doma_agent_side_pannel_status", false);
  } else {
    browser.sidePanel.setOptions({
      path: SIDE_PANEL_PATH,
      enabled: true,
    });
    const windowId = tab?.windowId;
    if (windowId != null && browser.sidePanel.open) {
      void browser.sidePanel.open({ windowId });
    }
    state.setShowSidePanel(true);
    void Storage.init().set("doma_agent_side_pannel_status", true);
  }
}

/** Pro Safari overlay 覆盖：打开页内 iframe 侧栏。Open / Chrome Pro 返回 false。 */
export async function tryEnsureEditionSidePanel(
  _opts?: { maxWaitMs?: number; intervalMs?: number },
): Promise<boolean> {
  return false;
}
