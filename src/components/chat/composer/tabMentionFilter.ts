import type { TabMentionMenuViewItem } from "./types";

export function filterTabMentionItems(
  items: TabMentionMenuViewItem[],
  query: string,
): TabMentionMenuViewItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => {
    const title = item.title.toLowerCase();
    const url = item.url.toLowerCase();
    return title.includes(q) || url.includes(q);
  });
}
