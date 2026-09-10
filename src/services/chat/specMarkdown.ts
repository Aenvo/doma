import { getSpecAssetDataUrl } from "./specAssetStore";

const DOMA_SPEC_IMAGE_RE = /!\[([^\]]*)\]\(doma-spec:([a-zA-Z0-9_-]+)\)/g;

/** Copy 时将 doma-spec 引用展开为内嵌 base64 Markdown */
export async function expandDomSpecInMarkdown(markdown: string): Promise<string> {
  const matches = [...markdown.matchAll(DOMA_SPEC_IMAGE_RE)];
  if (!matches.length) return markdown;

  const cache = new Map<string, string>();
  for (const m of matches) {
    const id = m[2]!;
    if (cache.has(id)) continue;
    const dataUrl = await getSpecAssetDataUrl(id);
    if (dataUrl) cache.set(id, dataUrl);
  }

  if (!cache.size) return markdown;

  return markdown.replace(DOMA_SPEC_IMAGE_RE, (full, alt: string, id: string) => {
    const dataUrl = cache.get(id);
    if (!dataUrl) return full;
    return `![${alt}](${dataUrl})`;
  });
}
