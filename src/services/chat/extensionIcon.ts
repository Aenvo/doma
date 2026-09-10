import domaIconSvg from "@/assets/images/doma-icon.svg?raw";
import { getEditionBrandPrimary } from "@/config/buildEdition";

/** 与 variable.less --stay-primary 一致（仅用于首字母着色；Open logo 青蓝另见 --stay-logo） */
export const STAY_PRIMARY = getEditionBrandPrimary();

/** 与 DomA desktop manifest icons 对齐：48 / 96 / 128 / 256 */
export const EXTENSION_ICON_SIZES = [48, 96, 128, 256] as const;

export type ExtensionIconSize = (typeof EXTENSION_ICON_SIZES)[number];

export function extensionInitialLetter(name: string): string {
  const raw = String(name ?? "").trim();
  const alnum = raw.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "");
  const ch = (alnum[0] || raw[0] || "D").toString();
  if (/[a-z]/.test(ch)) return ch.toUpperCase();
  return ch.slice(0, 1);
}

/**
 * doma-icon.svg 内嵌透明 PNG；SW 里对整份 SVG 做 createImageBitmap 常失败。
 * 抽出 data URL 直接解码，不改动 SVG 文件。
 */
function extractEmbeddedPngDataUrl(svg: string): string | null {
  const m =
    /(?:xlink:href|href)\s*=\s*"(data:image\/png;base64,[^"]+)"/i.exec(svg) ||
    /(?:xlink:href|href)\s*=\s*'(data:image\/png;base64,[^']+)'/i.exec(svg);
  return m?.[1] ?? null;
}

async function loadDomaLogoBitmap(): Promise<ImageBitmap | null> {
  try {
    const dataUrl = extractEmbeddedPngDataUrl(domaIconSvg);
    if (!dataUrl) {
      console.warn("[extensionIcon] no embedded png in doma-icon.svg");
      return null;
    }
    const res = await fetch(dataUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await createImageBitmap(blob);
  } catch (e) {
    console.warn("[extensionIcon] load doma logo failed", e);
    return null;
  }
}

async function renderIconPng(
  size: number,
  letter: string,
  logo: ImageBitmap | null,
): Promise<Blob> {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("OffscreenCanvas 2d unavailable");

  // 透明底
  ctx.clearRect(0, 0, size, size);

  // 首字母：stay-primary；略偏左上，避免与右下角 logo 重叠
  ctx.fillStyle = STAY_PRIMARY;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const fontSize = Math.max(11, Math.round(size * 0.82));
  ctx.font = `700 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.fillText(letter.slice(0, 1), size * 0.38, size * 0.4);

  // DomA logo：原样叠右下角
  if (logo) {
    const logoSize = Math.max(8, Math.round(size * 0.52));
    const pad = Math.max(0, Math.round(size * 0.02));
    const lx = size - pad - logoSize;
    const ly = size - pad - logoSize;
    ctx.drawImage(logo, lx, ly, logoSize, logoSize);
  } else {
    console.warn("[extensionIcon] logo missing, letter-only icon");
  }

  return canvas.convertToBlob({ type: "image/png" });
}

export type GeneratedExtensionIcons = {
  files: Array<{ path: string; blob: Blob }>;
  iconsField: Record<string, string>;
  actionDefaultIcon: Record<string, string>;
};

/** 生成默认扩展图标：透明底 + stay-primary 首字母 + 右下角原样 DomA logo */
export async function generateDefaultExtensionIcons(
  packageName: string,
): Promise<GeneratedExtensionIcons | null> {
  if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") {
    console.warn("[extensionIcon] OffscreenCanvas/createImageBitmap unavailable");
    return null;
  }

  const letter = extensionInitialLetter(packageName);
  const logo = await loadDomaLogoBitmap();
  const files: Array<{ path: string; blob: Blob }> = [];
  const iconsField: Record<string, string> = {};
  const actionDefaultIcon: Record<string, string> = {};

  for (const size of EXTENSION_ICON_SIZES) {
    const path = `icons/icon-${size}.png`;
    const blob = await renderIconPng(size, letter, logo);
    files.push({ path, blob });
    iconsField[String(size)] = path;
    actionDefaultIcon[String(size)] = path;
  }

  return { files, iconsField, actionDefaultIcon };
}

export function packageHasIconFiles(paths: Iterable<string>): boolean {
  for (const p of paths) {
    if (/(^|\/)icons?\//i.test(p) && /\.png$/i.test(p)) return true;
    if (/(^|\/)icon[-_]?\d+\.png$/i.test(p)) return true;
  }
  return false;
}

export function injectManifestIcons(
  manifestJson: string,
  iconsField: Record<string, string>,
  actionDefaultIcon: Record<string, string>,
): string {
  const parsed = JSON.parse(manifestJson) as Record<string, unknown>;
  parsed.icons = iconsField;
  const action =
    parsed.action && typeof parsed.action === "object" && !Array.isArray(parsed.action)
      ? { ...(parsed.action as Record<string, unknown>) }
      : {};
  action.default_icon = actionDefaultIcon;
  if (!action.default_title && typeof parsed.name === "string") {
    action.default_title = parsed.name;
  }
  parsed.action = action;
  return `${JSON.stringify(parsed, null, 2)}\n`;
}
