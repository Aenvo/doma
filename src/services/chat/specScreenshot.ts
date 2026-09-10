/** UI 规格书元素截图：viewport 裁剪辅助（独立于 browser_screenshot / SoM） */

import { getContext } from "../Context";

export type ElementRectCss = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type ScriptOk<T> = T | { error: string };

function getTabById(tabId: number): Promise<any> {
  return new Promise((resolve, reject) => {
    getContext().browser.tabs.get(tabId, (t: any) => {
      if (getContext().browser.runtime.lastError) {
        reject(new Error(getContext().browser.runtime.lastError.message));
      } else {
        resolve(t);
      }
    });
  });
}

/** 高分辨率 viewport 原图（不经 browser_screenshot 的强压缩管线） */
export async function captureSpecViewportDataUrl(
  tabId: number,
): Promise<{ ok: true; dataUrl: string } | { error: string }> {
  try {
    const tab = await getTabById(tabId);
    if (!tab?.active || tab.windowId == null) {
      return { error: "spec capture requires the page tab to be active" };
    }

    const rawDataUrl = await new Promise<string>((resolve, reject) => {
      getContext().browser.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 95 }, (result: string) => {
        const lastError = getContext().browser.runtime.lastError;
        if (lastError) reject(new Error(lastError.message || "capture failed"));
        else resolve(result);
      });
    });

    if (!rawDataUrl?.startsWith("data:image/")) {
      return { error: "invalid viewport capture" };
    }

    return { ok: true, dataUrl: rawDataUrl };
  } catch (e) {
    return { error: String(e) };
  }
}

export async function scrollSelectorIntoView(
  tabId: number,
  selector: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    const results = await (getContext().browser.scripting as any).executeScript({
      target: { tabId },
      func: (sel: string) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return { error: `element not found: ${sel}` };
        const anyEl = el as HTMLElement & { scrollIntoViewIfNeeded?: () => void };
        if (typeof anyEl.scrollIntoViewIfNeeded === "function") {
          anyEl.scrollIntoViewIfNeeded();
        } else {
          el.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
        }
        return { ok: true };
      },
      args: [selector],
    });
    const res = results?.[0]?.result as ScriptOk<{ ok: true }>;
    if (!res || "error" in res) return { error: res?.error ?? "scroll failed" };
    return { ok: true };
  } catch (e) {
    return { error: String(e) };
  }
}

export async function getSelectorRect(
  tabId: number,
  selector: string,
): Promise<{ ok: true; rect: ElementRectCss } | { error: string }> {
  try {
    const results = await (getContext().browser.scripting as any).executeScript({
      target: { tabId },
      func: (sel: string) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return { error: `element not found: ${sel}` };
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return { error: "element has zero size" };
        return {
          ok: true,
          rect: { left: r.left, top: r.top, width: r.width, height: r.height },
        };
      },
      args: [selector],
    });
    const res = results?.[0]?.result as ScriptOk<{ ok: true; rect: ElementRectCss }>;
    if (!res || "error" in res) return { error: res?.error ?? "rect query failed" };
    return res;
  } catch (e) {
    return { error: String(e) };
  }
}

/** viewport 整页图裁剪到元素区域（按 img/vw 自动映射，不依赖 dpr 估算） */
export async function cropViewportRaw(
  tabId: number,
  viewportDataUrl: string,
  rect: ElementRectCss,
  padding = 0,
): Promise<{ ok: true; dataUrl: string; width: number; height: number } | { error: string }> {
  try {
    const results = await (getContext().browser.scripting as any).executeScript({
      target: { tabId },
      func: (imgDataUrl: string, r: ElementRectCss, pad: number) => {
        return new Promise<
          { ok: true; dataUrl: string; width: number; height: number } | { error: string }
        >((resolve) => {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const img = new Image();
          img.onload = () => {
            try {
              if (vw < 1 || vh < 1) {
                resolve({ error: "invalid viewport size" });
                return;
              }
              const scaleX = img.width / vw;
              const scaleY = img.height / vh;
              let sx = Math.round((r.left - pad) * scaleX);
              let sy = Math.round((r.top - pad) * scaleY);
              let sw = Math.round((r.width + pad * 2) * scaleX);
              let sh = Math.round((r.height + pad * 2) * scaleY);
              sx = Math.max(0, sx);
              sy = Math.max(0, sy);
              sw = Math.min(sw, img.width - sx);
              sh = Math.min(sh, img.height - sy);
              if (sw < 1 || sh < 1) {
                resolve({ error: "crop rect too small" });
                return;
              }
              const canvas = document.createElement("canvas");
              canvas.width = sw;
              canvas.height = sh;
              const ctx = canvas.getContext("2d");
              if (!ctx) {
                resolve({ error: "canvas context unavailable" });
                return;
              }
              ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
              resolve({
                ok: true,
                dataUrl: canvas.toDataURL("image/jpeg", 0.92),
                width: sw,
                height: sh,
              });
            } catch (e) {
              resolve({ error: String(e) });
            }
          };
          img.onerror = () => resolve({ error: "failed to load viewport image" });
          img.src = imgDataUrl;
        });
      },
      args: [viewportDataUrl, rect, padding],
    });
    const res = results?.[0]?.result as ScriptOk<{
      ok: true;
      dataUrl: string;
      width: number;
      height: number;
    }>;
    if (!res || "error" in res) return { error: res?.error ?? "crop raw script failed" };
    return res;
  } catch (e) {
    return { error: String(e) };
  }
}

/** viewport 整页图裁剪到元素区域（按 img/vw 自动映射，不依赖 dpr 估算） */
export async function cropViewportToElement(
  tabId: number,
  viewportDataUrl: string,
  rect: ElementRectCss,
  options?: {
    padding?: number;
    maxWidth?: number;
    jpegQuality?: number;
  },
): Promise<{ ok: true; dataUrl: string; width: number; height: number } | { error: string }> {
  const padding = options?.padding ?? 8;
  const maxWidth = options?.maxWidth ?? 960;
  const jpegQuality = options?.jpegQuality ?? 0.88;

  try {
    const results = await (getContext().browser.scripting as any).executeScript({
      target: { tabId },
      func: (
        imgDataUrl: string,
        r: ElementRectCss,
        pad: number,
        mw: number,
        q: number,
      ) => {
        return new Promise<
          { ok: true; dataUrl: string; width: number; height: number } | { error: string }
        >((resolve) => {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const img = new Image();
          img.onload = () => {
            try {
              if (vw < 1 || vh < 1) {
                resolve({ error: "invalid viewport size" });
                return;
              }

              const scaleX = img.width / vw;
              const scaleY = img.height / vh;

              let sx = Math.round((r.left - pad) * scaleX);
              let sy = Math.round((r.top - pad) * scaleY);
              let sw = Math.round((r.width + pad * 2) * scaleX);
              let sh = Math.round((r.height + pad * 2) * scaleY);

              sx = Math.max(0, sx);
              sy = Math.max(0, sy);
              sw = Math.min(sw, img.width - sx);
              sh = Math.min(sh, img.height - sy);

              if (sw < 1 || sh < 1) {
                resolve({ error: "crop rect too small" });
                return;
              }

              let dw = sw;
              let dh = sh;
              if (dw > mw) {
                const ratio = mw / dw;
                dw = mw;
                dh = Math.round(dh * ratio);
              }

              const canvas = document.createElement("canvas");
              canvas.width = dw;
              canvas.height = dh;
              const ctx = canvas.getContext("2d");
              if (!ctx) {
                resolve({ error: "canvas context unavailable" });
                return;
              }
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = "high";
              ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
              resolve({
                ok: true,
                dataUrl: canvas.toDataURL("image/jpeg", q),
                width: dw,
                height: dh,
              });
            } catch (e) {
              resolve({ error: String(e) });
            }
          };
          img.onerror = () => resolve({ error: "failed to load viewport image" });
          img.src = imgDataUrl;
        });
      },
      args: [viewportDataUrl, rect, padding, maxWidth, jpegQuality],
    });
    const res = results?.[0]?.result as ScriptOk<{
      ok: true;
      dataUrl: string;
      width: number;
      height: number;
    }>;
    if (!res || "error" in res) return { error: res?.error ?? "crop script failed" };
    return res;
  } catch (e) {
    return { error: String(e) };
  }
}
