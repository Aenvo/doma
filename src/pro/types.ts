/** Minimal background context passed to Pro plugins during SW init */
export interface ServiceWorkerBackgroundContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listener: (request: any, sender: any, sendResponse: (response?: unknown) => void) => boolean | void;
}

export type ProHeaderAction = 'videoDownloader';

export interface ProUiFlags {
  videoDownloader: boolean;
  /** Pro：侧栏登录 / 账户面板；Open：无登录 */
  accountLogin: boolean;
}

export interface VideoDownloaderPlugin {
  readonly id: 'videoDownloader';
  initBackground(ctx: ServiceWorkerBackgroundContext): Promise<void> | void;
  isUiEnabled(): boolean;
  downloadVideos(args: Record<string, unknown>): Promise<unknown>;
  onTabActivated?(tabId: number): Promise<void> | void;
  onTabUpdated?(
    tabId: number,
    changeInfo: Record<string, unknown>,
    tab: Record<string, unknown>,
  ): Promise<void> | void;
  handleDownloaderAgent?(
    request: Record<string, unknown>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sender: any,
    sendResponse: (response?: unknown) => void,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extensionContext: any,
  ): void;
}

export interface AdBlockerPlugin {
  readonly id: 'adBlocker';
  initBackground(ctx: ServiceWorkerBackgroundContext): Promise<void> | void;
  blockAd(args: Record<string, unknown>): Promise<unknown>;
  unblockAd(args: Record<string, unknown>): Promise<unknown>;
  activateHost?(tabId: number, topHost: string): void;
}

export interface DomAProPlugins {
  videoDownloader?: VideoDownloaderPlugin;
  adBlocker?: AdBlockerPlugin;
}

export type ProPluginId = keyof DomAProPlugins;
