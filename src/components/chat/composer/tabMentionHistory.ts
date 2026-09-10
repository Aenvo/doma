import { getContext } from "@/services/Context";

export type TabMentionHistoryItem = {
  url: string;
  title: string;
  lastVisitTime?: number;
  source?: "history" | "bookmark";
};

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

async function searchBrowsingHistory(
  query: string,
  maxResults: number,
): Promise<TabMentionHistoryItem[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const history = getContext().browser.history;
    if (!history?.search) return [];
    const items = await history.search({
      text: q,
      maxResults,
      startTime: 0,
    });
    const out: TabMentionHistoryItem[] = [];
    for (const item of items) {
      const url = typeof item.url === "string" ? item.url.trim() : "";
      if (!url || !isHttpUrl(url)) continue;
      out.push({
        url,
        title: typeof item.title === "string" && item.title.trim() ? item.title.trim() : url,
        lastVisitTime: typeof item.lastVisitTime === "number" ? item.lastVisitTime : undefined,
        source: "history",
      });
      if (out.length >= maxResults) break;
    }
    return out;
  } catch {
    return [];
  }
}

async function searchBookmarkUrls(
  query: string,
  maxResults: number,
): Promise<TabMentionHistoryItem[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const bookmarks = getContext().browser.bookmarks;
    if (!bookmarks?.search) return [];
    const nodes = await bookmarks.search({ query: q });
    const out: TabMentionHistoryItem[] = [];
    for (const node of nodes) {
      const url = typeof node.url === "string" ? node.url.trim() : "";
      if (!url || !isHttpUrl(url)) continue;
      out.push({
        url,
        title: typeof node.title === "string" && node.title.trim() ? node.title.trim() : url,
        source: "bookmark",
      });
      if (out.length >= maxResults) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Open new tab 地址栏：同时匹配浏览历史与书签 */
export async function searchTabMentionHistory(
  query: string,
  maxResults = 8,
): Promise<TabMentionHistoryItem[]> {
  const q = query.trim();
  if (!q) return [];

  const fetchLimit = Math.max(maxResults, 8);
  const [historyItems, bookmarkItems] = await Promise.all([
    searchBrowsingHistory(q, fetchLimit),
    searchBookmarkUrls(q, fetchLimit),
  ]);

  const seen = new Set<string>();
  const out: TabMentionHistoryItem[] = [];

  for (const item of historyItems) {
    const key = item.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= maxResults) return out;
  }

  for (const item of bookmarkItems) {
    const key = item.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= maxResults) break;
  }

  return out;
}
