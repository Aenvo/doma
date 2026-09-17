/**
 * Open / 非 Safari：无页内小把手播报。ChatPanel 可无条件调用，此处恒为 noop。
 * 真正的收起+把手镜像仅 Pro+Safari（safariShellChat.pro.ts）。
 */

/** 用户发送：Safari 收起侧栏；Open 无操作 */
export function safariShellOnUserSend(_conversationId: string, _userText?: string): void {}

/**
 * Assistant 气泡更新：把手镜像正文。
 * text = 该 msgId 当前全文；toolName 仅作脚注，不覆盖正文。
 */
export function safariShellOnAssistantUpsert(
  _conversationId: string,
  _msgId: string,
  _text: string,
  _toolName?: string,
): void {}

/** 一轮结束：把手展示本轮汇总正文 */
export function safariShellOnTurnDone(
  _conversationId: string,
  _fullText: string,
  _lastMsgId?: string,
): void {}

/** 用户停止任务 */
export function safariShellOnStop(_conversationId: string, _message?: string): void {}
