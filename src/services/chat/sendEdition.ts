/**
 * Open 版：发送门闸 + HTTP 错误原样展示（无账号/会员协议）。
 */
import { llmManager } from '@/services/chat/llm/entry';
import type {
  SendEditionHooks,
  SendEditionHttpError,
  SendEditionHttpErrorCtx,
} from './sendEditionTypes';

export type {
  SendEditionGateResult,
  SendEditionHooks,
  SendEditionHttpError,
  SendEditionHttpErrorCtx,
} from './sendEditionTypes';

export const sendEdition: SendEditionHooks = {
  assertCanSend() {
    if (!llmManager.isProviderReady()) {
      return { ok: false, action: 'provider-setup' };
    }
    return { ok: true };
  },

  async handleHttpError(error: SendEditionHttpError, ctx: SendEditionHttpErrorCtx) {
    const msg = error.message?.trim() || `HTTP ${error.status}`;
    ctx.reportError(msg);
    await ctx.stopTask(msg);
  },
};
