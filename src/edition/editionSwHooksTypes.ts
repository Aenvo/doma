import type { ServiceWorkerBackgroundContext } from '@/pro/types';

/** 版别 SW 消息：已处理返回 true（共用 listener 不再往下匹配） */
export type EditionSwMessageHandler = (
  request: { origin?: string; operate?: string; [key: string]: unknown },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sender: any,
  sendResponse: (response?: unknown) => void,
) => boolean;

export type EditionSwHooksApi = {
  tryHandleMessage: EditionSwMessageHandler;
  initBackground: (ctx: ServiceWorkerBackgroundContext) => Promise<void>;
  registerTabListeners: () => void;
};
