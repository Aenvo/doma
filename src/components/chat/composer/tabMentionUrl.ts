/** 将用户输入规范化为可打开的 http(s) URL；无效则返回 null */
export function normalizeTabMentionUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProto = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

/** 地址栏展示用：host + path（不含协议） */
export function historyItemAddressBarText(url: string): string {
  try {
    const u = new URL(url);
    const path = `${u.pathname}${u.search}${u.hash}`;
    if (path === "/" || path === "") return u.host;
    return `${u.host}${path}`;
  } catch {
    return url.trim();
  }
}

export type HistoryAutocompleteMatch = {
  suffix: string;
  fullText: string;
  itemUrl: string;
  itemTitle: string;
};

/** 从历史记录中找与当前输入前缀匹配的最短一条（用于地址栏式补全） */
export function findHistoryAutocompleteMatch(
  query: string,
  items: Array<{ url: string; title: string }>,
): HistoryAutocompleteMatch | null {
  const q = query;
  if (!q) return null;
  const qLower = q.toLowerCase();

  let best: HistoryAutocompleteMatch | null = null;
  let bestLen = Infinity;

  for (const item of items) {
    const addressText = historyItemAddressBarText(item.url);
    const addressLower = addressText.toLowerCase();
    if (addressLower.startsWith(qLower) && addressText.length > q.length) {
      if (addressText.length < bestLen) {
        bestLen = addressText.length;
        best = {
          suffix: addressText.slice(q.length),
          fullText: addressText,
          itemUrl: item.url,
          itemTitle: item.title,
        };
      }
      continue;
    }
    const urlLower = item.url.toLowerCase();
    if (urlLower.startsWith(qLower) && item.url.length > q.length) {
      if (item.url.length < bestLen) {
        bestLen = item.url.length;
        best = {
          suffix: item.url.slice(q.length),
          fullText: item.url,
          itemUrl: item.url,
          itemTitle: item.title,
        };
      }
    }
  }
  return best;
}

export function tabMentionUrlDisplayTitle(url: string, title?: string): string {
  const t = title?.trim();
  if (t) return t;
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}
