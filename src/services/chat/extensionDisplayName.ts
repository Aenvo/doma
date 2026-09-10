/** 扩展包 slug（文件名 / 资产 packageName）：小写连字符 */
export function toExtensionPackageSlug(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

const CREATED_BY_DOMA_SUFFIX = " - Created by DomA";

function titleCaseToken(token: string): string {
  if (!token) return token;
  // 纯中文等非拉丁：原样
  if (!/[a-z]/i.test(token)) return token;
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

/**
 * 扩展展示标题：多词用空格（不用 -），末尾固定「 - Created by DomA」
 * 例：tab-deduplicator → Tab Deduplicator - Created by DomA
 */
export function toExtensionDisplayTitle(raw: string): string {
  let base = String(raw ?? "").trim();
  if (!base) base = "Extension";
  // 去掉已有后缀，避免重复追加
  base = base.replace(/\s*-\s*Created by DomA\s*$/i, "").trim();
  base = base
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  base = base
    .split(" ")
    .filter(Boolean)
    .map(titleCaseToken)
    .join(" ");
  if (!base) base = "Extension";
  return `${base}${CREATED_BY_DOMA_SUFFIX}`;
}

/** 写入 manifest.name / action.default_title */
export function injectManifestDisplayTitle(manifestJson: string, displayTitle: string): string {
  const parsed = JSON.parse(manifestJson) as Record<string, unknown>;
  parsed.name = displayTitle;
  const action =
    parsed.action && typeof parsed.action === "object" && !Array.isArray(parsed.action)
      ? { ...(parsed.action as Record<string, unknown>) }
      : {};
  action.default_title = displayTitle;
  parsed.action = action;
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

const POPUP_CREATED_BY_MARK = "data-doma-created-by";
const POPUP_CREATED_BY_HTML = `<div ${POPUP_CREATED_BY_MARK} style="display:block;width:100%;box-sizing:border-box;margin-top:12px;padding:8px 8px 4px;text-align:center;font-size:11px;line-height:1.3;color:rgba(47,49,52,0.45);user-select:none;">Created by DomA</div>`;

/** 去掉模型手写的 Created by DomA 节点，只保留工具注入的一版 */
function stripPopupCreatedByNoise(html: string): string {
  let out = html;
  // 工具已注入的标记节点
  out = out.replace(
    new RegExp(`<[^>]+\\s${POPUP_CREATED_BY_MARK}\\b[^>]*>[\\s\\S]*?<\\/[^>]+>`, "gi"),
    "",
  );
  // 常见手写：div/p/footer/span 内仅含该文案
  out = out.replace(
    /<(div|p|footer|span|small)\b[^>]*>\s*Created\s+by\s+DomA\s*<\/\1>/gi,
    "",
  );
  return out;
}

/**
 * 有 popup.html 时由保存工具统一注入底部居中「Created by DomA」。
 * 先清掉已有同文案，再写入一版，避免模型手写导致双行。
 */
export function injectPopupCreatedByFooter(html: string): string {
  let out = String(html ?? "");
  if (!out.trim()) return out;
  out = stripPopupCreatedByNoise(out);

  if (/<\/body>/i.test(out)) {
    return out.replace(/<\/body>/i, `${POPUP_CREATED_BY_HTML}</body>`);
  }
  return `${out.trimEnd()}\n${POPUP_CREATED_BY_HTML}`;
}
