import { parseSkillMd } from './parseSkillMd';

/** 从 ```skill 围栏或完整 SKILL.md 草稿解析 Add Skill 表单初始值 */
export function parseSkillDraftForForm(markdown: string): {
  name: string;
  allowModelRoute: boolean;
  description: string;
  body: string;
} {
  const trimmed = markdown.trim();
  const parsed = parseSkillMd(trimmed);
  if (parsed) {
    return {
      name: parsed.name,
      // DomA 创建表单：默认不允许模型路由（disable-model-invocation），与空新建一致；
      // 不跟随 Agent Skills「缺省字段 = 允许调用」的惯例。
      allowModelRoute: false,
      description: parsed.description,
      body: parsed.body,
    };
  }
  return { name: '', allowModelRoute: false, description: '', body: trimmed };
}

/** 从表单字段组装标准 SKILL.md */
export function normalizeSkillName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function isValidSkillName(name: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) && name.length > 0 && name.length <= 64;
}

export function extractDescriptionFromSkillBody(body: string, fallback: string): string {
  const h1 = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (h1) return h1.slice(0, 1024);
  const line = body
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'));
  return (line ?? fallback).slice(0, 1024);
}

function formatYamlDescription(description: string): string {
  const d = description.trim().slice(0, 1024);
  if (!d) return '""';
  // 多行或含适用网站长句：用 folded block，避免丢换行
  if (d.includes('\n') || d.length > 72) {
    const indented = d
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n');
    return `>-\n${indented}`;
  }
  const escaped = d.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

export function buildSkillMdFromForm(opts: {
  name: string;
  allowModelRoute: boolean;
  body: string;
  /** 优先使用（含适用网站的 frontmatter description）；缺省再从正文 H1 推导 */
  description?: string;
}): string {
  const name = normalizeSkillName(opts.name);
  const body = opts.body.trim();
  const description = (
    opts.description?.trim() ||
    extractDescriptionFromSkillBody(body, name)
  ).slice(0, 1024);
  const lines = [
    '---',
    `name: ${name}`,
    `description: ${formatYamlDescription(description)}`,
  ];
  if (!opts.allowModelRoute) {
    lines.push('disable-model-invocation: true');
  }
  lines.push('---', '', body);
  return lines.join('\n');
}

export const DEFAULT_SKILL_BODY_TEMPLATE = `# My Skill

Describe what this skill does and when to use it.

## Instructions

- Step 1
`;

export const DOMA_SKILL_FILE_EXT = ".doma.skill";

export function buildDomaSkillFilename(skillName: string): string {
  const n = normalizeSkillName(skillName) || "skill";
  return `${n}${DOMA_SKILL_FILE_EXT}`;
}

export function buildDomaSkillFileContent(opts: {
  name: string;
  allowModelRoute: boolean;
  body: string;
  description?: string;
}): string {
  return buildSkillMdFromForm(opts);
}
