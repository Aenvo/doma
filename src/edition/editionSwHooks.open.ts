/**
 * Open 版别 SW 钩子：无 RuleTag reload / userScripts / 下载器 / 广告 / 视频 sniff。
 * Pro 真实现见 editionSwHooks.pro.ts。
 */
import type { ServiceWorkerBackgroundContext } from '@/pro/types';
import type { EditionSwMessageHandler } from './editionSwHooksTypes';

export const tryHandleEditionSwMessage: EditionSwMessageHandler = () => false;

export async function registerEditionEarly(
  _ctx: ServiceWorkerBackgroundContext,
): Promise<void> {
  // noop
}

export async function initEditionBackground(
  _ctx: ServiceWorkerBackgroundContext,
): Promise<void> {
  // noop
}

export function registerEditionTabListeners(): void {
  // noop
}

export {
  configureGlobalSidePanel,
  registerNativeSidePanelListeners,
  handleBrowserActionClicked,
  tryEnsureEditionSidePanel,
} from "./chromeSidePanel";
