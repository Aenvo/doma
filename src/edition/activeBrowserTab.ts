/** 默认 re-export Pro；IDE 跳转以 tsconfig.edition.json 为准（sync:edition-ts） */
export {
  isSafariSidePanelShell,
  requestCloseSidePanelShell,
  initActiveBrowserTabTracking,
  getActiveBrowserTabSync,
  resolveActiveBrowserTab,
  getCurrentTab,
  listMentionTabs,
  subscribeActiveTabChanges,
} from "./activeBrowserTab.pro";
export type { BrowserTabLite, MentionTabItem } from "./activeBrowserTab.pro";
