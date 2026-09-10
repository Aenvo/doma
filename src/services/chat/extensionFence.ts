/** ```extension 瘦围栏：name / description / extensionId / assets */

export type ExtensionFenceAsset = {
  id: string;
  path: string;
};

export type ExtensionFencePayload = {
  name: string;
  description: string;
  extensionId: string;
  assets: ExtensionFenceAsset[];
};

export function buildExtensionFenceMarkdown(payload: ExtensionFencePayload): string {
  const body = JSON.stringify(
    {
      name: payload.name,
      description: payload.description,
      extensionId: payload.extensionId,
      assets: payload.assets,
    },
    null,
    2,
  );
  return `\`\`\`extension\n${body}\n\`\`\``;
}

export function parseExtensionFencePayload(raw: string): ExtensionFencePayload | null {
  const cleaned = String(raw ?? "").trim();
  if (!cleaned) return null;

  let jsonText = cleaned;
  const fence = /^```(?:extension)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/i.exec(cleaned);
  if (fence) jsonText = fence[1]!.trim();

  try {
    const obj = JSON.parse(jsonText) as Record<string, unknown>;
    const name = String(obj.name ?? "").trim();
    const description = String(obj.description ?? "").trim();
    const extensionId = String(obj.extensionId ?? "").trim();
    const assetsRaw = Array.isArray(obj.assets) ? obj.assets : [];
    const assets: ExtensionFenceAsset[] = [];
    for (const a of assetsRaw) {
      if (!a || typeof a !== "object") continue;
      const id = String((a as { id?: unknown }).id ?? "").trim();
      const path = String((a as { path?: unknown }).path ?? "").trim();
      if (id && path) assets.push({ id, path });
    }
    if (!name || !assets.length) return null;
    return { name, description, extensionId, assets };
  } catch {
    return null;
  }
}
