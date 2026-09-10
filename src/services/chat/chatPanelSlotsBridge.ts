/**
 * ChatPanel ↔ 版别插槽（账户/下载/首次对话等）协作桥。
 * Open 构建不注册 slots API，close/isOpen 为空操作。
 */

export type ChatPanelSlotsHost = {
  /** 关闭 history / scheduled / dbplus / mcp / settings */
  closeSharedPanels: () => void;
  afterLogin: () => void;
  afterLogout: () => void;
  /** 当前面板消息数（Pro 首次对话引导） */
  getPanelMessageCount: () => number;
  /** header onboarding 是否仍打开 */
  isOnboardingOpen: () => boolean;
  /** Pro 首次对话引导：发送预设文案 */
  sendPromptText: (text: string) => void;
};

type SlotsApi = {
  closePanels: () => void;
  isPanelOpen: () => boolean;
  afterOnboardingDone?: () => void;
};

let host: ChatPanelSlotsHost | null = null;
let slotsApi: SlotsApi | null = null;

export function registerChatPanelSlotsHost(h: ChatPanelSlotsHost | null): void {
  host = h;
}

export function registerChatPanelSlotsApi(api: SlotsApi | null): void {
  slotsApi = api;
}

export function getChatPanelSlotsHost(): ChatPanelSlotsHost | null {
  return host;
}

export function closeChatPanelSlotsPanels(): void {
  slotsApi?.closePanels();
}

export function isChatPanelSlotsPanelOpen(): boolean {
  return slotsApi?.isPanelOpen() ?? false;
}

export function requestCloseSharedHeaderPanels(): void {
  host?.closeSharedPanels();
}

export function notifyChatPanelSlotsAfterLogin(): void {
  host?.afterLogin();
}

export function notifyChatPanelSlotsAfterLogout(): void {
  host?.afterLogout();
}

export function notifyChatPanelSlotsAfterOnboardingDone(): void {
  slotsApi?.afterOnboardingDone?.();
}
