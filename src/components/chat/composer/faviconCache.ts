/** 扩展页内把远程 favicon 缓存为 blob: URL，避免 contenteditable 重建 <img> 时反复打网 */

const objectUrlByHttpUrl = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

export function getCachedFaviconObjectUrl(httpUrl: string): string | undefined {
  return objectUrlByHttpUrl.get(httpUrl);
}

export function faviconPlaceholderSrc(): string {
  return TRANSPARENT_PIXEL;
}

/**
 * 拉取并缓存 favicon；扩展页有 host 权限时可跨域 fetch。
 * 失败返回 null（调用方可不改 src 或隐藏）。
 */
export function resolveFaviconObjectUrl(httpUrl: string): Promise<string | null> {
  const cached = objectUrlByHttpUrl.get(httpUrl);
  if (cached) return Promise.resolve(cached);

  let pending = inflight.get(httpUrl);
  if (pending) return pending;

  pending = (async () => {
    try {
      const res = await fetch(httpUrl, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        cache: "force-cache",
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob || blob.size <= 0) return null;
      const objectUrl = URL.createObjectURL(blob);
      objectUrlByHttpUrl.set(httpUrl, objectUrl);
      return objectUrl;
    } catch {
      return null;
    } finally {
      inflight.delete(httpUrl);
    }
  })();

  inflight.set(httpUrl, pending);
  return pending;
}

/** 给已插入 DOM 的 img 挂上缓存后的 blob src（仅当仍在文档中） */
export function applyFaviconToImg(img: HTMLImageElement, httpUrl: string): void {
  const cached = objectUrlByHttpUrl.get(httpUrl);
  if (cached) {
    if (img.getAttribute("src") !== cached) img.src = cached;
    return;
  }
  img.dataset.faviconHttp = httpUrl;
  if (!img.getAttribute("src")) img.src = TRANSPARENT_PIXEL;
  void resolveFaviconObjectUrl(httpUrl).then((objectUrl) => {
    if (!objectUrl || !img.isConnected) return;
    if (img.dataset.faviconHttp !== httpUrl) return;
    img.src = objectUrl;
  });
}
