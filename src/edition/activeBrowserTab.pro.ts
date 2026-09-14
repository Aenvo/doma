/**
 * Pro 默认（Chrome/Edge 侧栏）与 Open 相同。
 * Safari 页内 iframe 实现由 pro overlay 覆盖本文件（见 pro/src/edition/activeBrowserTab.pro.ts）。
 */
export {
  isSafariSidePanelShell,
  initActiveBrowserTabTracking,
  getActiveBrowserTabSync,
  resolveActiveBrowserTab,
  getCurrentTab,
  listMentionTabs,
  subscribeActiveTabChanges,
} from "./activeBrowserTab.open";
export type { BrowserTabLite, MentionTabItem } from "./activeBrowserTab.open";
