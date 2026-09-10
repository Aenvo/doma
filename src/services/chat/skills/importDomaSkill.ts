import { DOMA_SKILL_FILE_EXT } from "./skillComposer";

export function isDomaSkillFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(DOMA_SKILL_FILE_EXT);
}

export async function readDomaSkillFileText(file: File): Promise<string | null> {
  if (!isDomaSkillFile(file)) return null;
  const text = (await file.text()).trim();
  return text || null;
}
