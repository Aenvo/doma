import { getContext } from "@/services/Context";
import {
  buildDomaSkillFileContent,
  buildDomaSkillFilename,
  isValidSkillName,
  normalizeSkillName,
} from "./skillComposer";

export async function downloadDomaSkillFile(opts: {
  name: string;
  allowModelRoute: boolean;
  body: string;
  description?: string;
}): Promise<{ ok: true; fileName: string } | { ok: false; error: string }> {
  const normalized = normalizeSkillName(opts.name);
  if (!isValidSkillName(normalized)) {
    return { ok: false, error: "invalid skill name" };
  }
  if (!opts.body.trim()) {
    return { ok: false, error: "skill body is empty" };
  }

  const content = buildDomaSkillFileContent({
    name: normalized,
    allowModelRoute: opts.allowModelRoute,
    body: opts.body,
    description: opts.description,
  });
  const fileName = buildDomaSkillFilename(normalized);
  const blob = new Blob([content], { type: "application/octet-stream" });
  const blobUrl = URL.createObjectURL(blob);

  try {
    await new Promise<void>((resolve, reject) => {
      getContext().browser.downloads.download(
        { url: blobUrl, filename: fileName, saveAs: false },
        () => {
          URL.revokeObjectURL(blobUrl);
          const err = getContext().browser.runtime.lastError;
          if (err) reject(new Error(err.message));
          else resolve();
        },
      );
    });
    return { ok: true, fileName };
  } catch (e) {
    URL.revokeObjectURL(blobUrl);
    return { ok: false, error: String(e) };
  }
}
