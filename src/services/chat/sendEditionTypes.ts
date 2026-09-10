/** ChatPanel send2 调用的 edition 门闸结果 */
export type SendEditionGateResult =
  | { ok: true }
  | { ok: false; action: 'provider-setup' };

/** LLM 回调里的 HTTP 错误（与 sseFetcher.HttpError 字段对齐） */
export type SendEditionHttpError = {
  status: number;
  message: string;
};

/**
 * Shared Open/Pro hooks injected into the panel.
 * Edition-specific auth / membership UI lives in the overlay sendEdition module when present.
 */
export type SendEditionHttpErrorCtx = {
  conversationId: string;
  msgId: string;
  t: (key: string) => string;
  /** MCP + 定时结果上报 */
  reportError: (text: string) => void;
  stopTask: (message?: string) => void | Promise<void>;
};

export interface SendEditionHooks {
  assertCanSend: () => SendEditionGateResult | Promise<SendEditionGateResult>;
  /** HTTP 错误：决策 + 执行都在 edition 内；Open 原样展示 message */
  handleHttpError: (
    error: SendEditionHttpError,
    ctx: SendEditionHttpErrorCtx,
  ) => void | Promise<void>;
}

/** sendEdition.pro logout 后通知侧栏刷新 userInfo */
export const CHAT_SYNC_USER_INFO_EVENT = 'chat/sync-user-info';
