/** doma://video/seek?seconds=125&videoUuid=optional */

export interface DomaVideoSeekTarget {
  seconds: number;
  videoUuid?: string;
}

export function formatVideoSeekTime(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function buildDomaVideoSeekHref(seconds: number, videoUuid?: string): string {
  const sec = Math.max(0, Math.floor(seconds));
  const params = new URLSearchParams({ seconds: String(sec) });
  if (videoUuid?.trim()) params.set("videoUuid", videoUuid.trim());
  return `doma://video/seek?${params.toString()}`;
}

/** 从点击目标解析 doma:// 链接（▶ 按钮、data-doma-href、裸 a[href^=doma:]） */
export function resolveDomaHrefFromClickTarget(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest(
    ".chat-doma-link, .chat-video-seek-btn, [data-doma-href], a[href^='doma://'], a[href^='DOMA://']",
  ) as HTMLElement | null;
  if (!el) return null;

  const fromDataset = el.dataset.domaHref?.trim() ?? "";
  const fromAnchor =
    el instanceof HTMLAnchorElement ? el.getAttribute("href")?.trim() ?? "" : "";
  const href = fromDataset || fromAnchor;
  if (!href || !/^doma:\/\//i.test(href) || /[\[\]()]/.test(href)) return null;
  return href;
}

export function parseDomaVideoSeekHref(href: string): DomaVideoSeekTarget | null {
  const raw = href.trim();
  if (!/^doma:\/\//i.test(raw)) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "doma:") return null;

    const path = url.pathname.replace(/^\/+/, "");
    const isSeekPath =
      path === "video/seek" ||
      path === "seek" ||
      (url.hostname === "video" && path === "seek");
    if (!isSeekPath) return null;

    const seconds = Number(url.searchParams.get("seconds"));
    if (!Number.isFinite(seconds) || seconds < 0) return null;

    const videoUuid = url.searchParams.get("videoUuid")?.trim() || undefined;
    return { seconds: Math.floor(seconds), videoUuid };
  } catch {
    return null;
  }
}
