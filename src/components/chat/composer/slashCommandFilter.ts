import type { SlashCommandMenuViewItem } from "./types";

export function filterSlashCommandItems(
  items: SlashCommandMenuViewItem[],
  query: string,
): SlashCommandMenuViewItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => {
    const id = item.id.toLowerCase();
    const skillName = (item.skillName ?? "").toLowerCase();
    const label = item.label.toLowerCase();
    const description = item.description.toLowerCase();
    return id.includes(q) || skillName.includes(q) || label.includes(q) || description.includes(q);
  });
}
