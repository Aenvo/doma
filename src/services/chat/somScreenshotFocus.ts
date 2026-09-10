/** SoM focused screenshot profiles（som-focus-conservative-v1） */

import type { ElementRectCss } from "./specScreenshot";

export const SOM_FOCUS_CHANGELOG_TAG = "som-focus-conservative-v1";

export type SomScreenshotCompressProfile = {
  downscale: number;
  maxWidth: number;
  jpegQuality: number;
};

export type SomFocusedProfile = SomScreenshotCompressProfile & {
  minAreaRatio: number;
  maxAreaRatio: number;
  padding: number;
  budgetRatio: number;
  minQuality: number;
};

export type SomScreenshotFocusInput = {
  sec?: string;
  somIndex?: number;
  selector?: string;
  padding?: number;
};

export const SOM_SCREENSHOT_PROFILES = {
  full: {
    downscale: 2,
    maxWidth: 800,
    jpegQuality: 0.4,
  } satisfies SomScreenshotCompressProfile,
  focused: {
    conservative: {
      minAreaRatio: 0.35,
      maxAreaRatio: 0.75,
      padding: 48,
      downscale: 2,
      maxWidth: 900,
      jpegQuality: 0.5,
      budgetRatio: 0.75,
      minQuality: 0.45,
    } satisfies SomFocusedProfile,
  },
} as const;

export type SomFocusedProfileName = keyof typeof SOM_SCREENSHOT_PROFILES.focused;

export const DEFAULT_FOCUSED_PROFILE: SomFocusedProfileName = "conservative";

export function getFocusedProfile(name?: string): SomFocusedProfile {
  const key = (name && name in SOM_SCREENSHOT_PROFILES.focused
    ? name
    : DEFAULT_FOCUSED_PROFILE) as SomFocusedProfileName;
  return SOM_SCREENSHOT_PROFILES.focused[key];
}

export function estimateOutputDimensions(
  vw: number,
  vh: number,
  profile: SomScreenshotCompressProfile,
): { width: number; height: number; pixels: number } {
  let w = Math.round(vw / profile.downscale);
  let h = Math.round(vh / profile.downscale);
  if (w > profile.maxWidth) {
    const ratio = profile.maxWidth / w;
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }
  return { width: w, height: h, pixels: w * h };
}

/** 粗估 JPEG base64 字符数（用于 focused budget 校验） */
export function estimateBase64Chars(
  pixels: number,
  jpegQuality: number,
): number {
  const bytesPerPixel = 0.06 + jpegQuality * 0.12;
  return Math.round(pixels * bytesPerPixel * 1.37);
}

export function rectsIntersect(
  a: ElementRectCss,
  b: ElementRectCss,
): boolean {
  return (
    a.left < b.left + b.width
    && a.left + a.width > b.left
    && a.top < b.top + b.height
    && a.top + a.height > b.top
  );
}

export function elementRecordToRect(entry: Record<string, unknown>): ElementRectCss | null {
  const rc = entry.rc;
  if (!Array.isArray(rc) || rc.length < 4) return null;
  const [left, top, width, height] = rc as number[];
  if (width < 1 || height < 1) return null;
  return { left, top, width, height };
}

export function filterElementsByFocusRect(
  elements: unknown[],
  focusRect: ElementRectCss,
): { filtered: unknown[]; total: number } {
  const total = elements.length;
  const filtered = elements
    .filter((raw) => {
      const entry = raw as Record<string, unknown>;
      const rect = elementRecordToRect(entry);
      if (!rect) return true;
      return rectsIntersect(rect, focusRect);
    })
    .map((raw) => {
      const entry = { ...(raw as Record<string, unknown>) };
      delete entry.rc;
      return entry;
    });
  return { filtered, total };
}

export function indicesMatchingSec(elements: unknown[], sec: string): number[] {
  const needle = sec.trim().toLowerCase();
  if (!needle) return [];
  return elements
    .map((raw) => raw as Record<string, unknown>)
    .filter((e) => {
      const s = typeof e.sec === "string" ? e.sec.trim().toLowerCase() : "";
      return s === needle || s.includes(needle) || needle.includes(s);
    })
    .map((e) => Number(e.i))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export function buildFocusRectPageFunc(
  focus: SomScreenshotFocusInput,
  somIndices: number[],
  profile: SomFocusedProfile,
): () => ElementRectCss | { error: string } {
  return () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vw < 1 || vh < 1) return { error: "invalid viewport" };

    const pad = typeof focus.padding === "number" ? focus.padding : profile.padding;
    const minArea = profile.minAreaRatio * vw * vh;
    const maxArea = profile.maxAreaRatio * vw * vh;

    const unionFromElements = (indices: number[]): ElementRectCss | null => {
      let left = Infinity;
      let top = Infinity;
      let right = -Infinity;
      let bottom = -Infinity;
      for (const idx of indices) {
        const el = document.querySelector(`[data-som-idx="${idx}"]`) as HTMLElement | null;
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        left = Math.min(left, r.left);
        top = Math.min(top, r.top);
        right = Math.max(right, r.right);
        bottom = Math.max(bottom, r.bottom);
      }
      if (!Number.isFinite(left)) return null;
      return { left, top, width: right - left, height: bottom - top };
    };

    let seed: ElementRectCss | null = null;

    if (typeof focus.selector === "string" && focus.selector.trim()) {
      const el = document.querySelector(focus.selector.trim()) as HTMLElement | null;
      if (!el) return { error: `selector not found: ${focus.selector}` };
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return { error: "selector element has zero size" };
      seed = { left: r.left, top: r.top, width: r.width, height: r.height };
    } else if (typeof focus.somIndex === "number" && focus.somIndex > 0) {
      seed = unionFromElements([focus.somIndex]);
      if (!seed) return { error: `somIndex ${focus.somIndex} not found on page` };
    } else if (somIndices.length > 0) {
      seed = unionFromElements(somIndices);
      if (!seed) return { error: "no elements matched focus.sec on page" };
    } else {
      return { error: "focus requires sec, somIndex, or selector" };
    }

    let rect: ElementRectCss = {
      left: seed.left - pad,
      top: seed.top - pad,
      width: seed.width + pad * 2,
      height: seed.height + pad * 2,
    };

    const clamp = (r: ElementRectCss): ElementRectCss => {
      let left = Math.max(0, r.left);
      let top = Math.max(0, r.top);
      let width = Math.min(vw - left, r.width);
      let height = Math.min(vh - top, r.height);
      if (width < 1) width = Math.min(vw, 1);
      if (height < 1) height = Math.min(vh, 1);
      return { left, top, width, height };
    };

    rect = clamp(rect);
    let area = rect.width * rect.height;

    let guard = 0;
    while (area < minArea && area < maxArea && guard < 40) {
      guard++;
      const growX = Math.max(8, vw * 0.04);
      const growY = Math.max(8, vh * 0.04);
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let newW = Math.min(vw, rect.width + growX * 2);
      let newH = Math.min(vh, rect.height + growY * 2);
      rect = clamp({
        left: cx - newW / 2,
        top: cy - newH / 2,
        width: newW,
        height: newH,
      });
      const nextArea = rect.width * rect.height;
      if (nextArea <= area) break;
      area = nextArea;
    }

    if (area > maxArea) {
      const scale = Math.sqrt(maxArea / area);
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const newW = rect.width * scale;
      const newH = rect.height * scale;
      rect = clamp({
        left: cx - newW / 2,
        top: cy - newH / 2,
        width: newW,
        height: newH,
      });
    }

    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  };
}
