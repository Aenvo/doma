const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parseScalarValue(raw: string): string | boolean {
  const v = raw.trim();
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  return v;
}

function parseFoldedBlock(lines: string[], startIndex: number): { value: string; nextIndex: number } {
  const first = lines[startIndex] ?? '';
  const folded = first.replace(/^[\w-]+:\s*>-?\s*$/, '').trim();
  const chunks: string[] = [];
  if (folded) chunks.push(folded);

  let i = startIndex + 1;
  for (; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!/^\s/.test(line) && line.trim() !== '') break;
    chunks.push(line.replace(/^\s{2,}/, '').trimEnd());
  }
  return { value: chunks.join('\n').trim(), nextIndex: i };
}

/** 解析 SKILL.md 的 YAML frontmatter（支持标准 Agent Skills 常用字段） */
export function parseSkillMdFrontmatter(raw: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const lines = raw.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const foldedMatch = line.match(/^([\w-]+):\s*>-?\s*$/);
    if (foldedMatch) {
      const { value, nextIndex } = parseFoldedBlock(lines, i);
      out[foldedMatch[1]!] = value;
      i = nextIndex;
      continue;
    }

    const listMatch = line.match(/^([\w-]+):\s*$/);
    if (listMatch) {
      const key = listMatch[1]!;
      const items: string[] = [];
      i += 1;
      while (i < lines.length) {
        const itemLine = lines[i] ?? '';
        const itemMatch = itemLine.match(/^\s*-\s+(.+)$/);
        if (!itemMatch) break;
        items.push(parseScalarValue(itemMatch[1]!) as string);
        i += 1;
      }
      out[key] = items;
      continue;
    }

    const kvMatch = line.match(/^([\w-]+):\s*(.+)$/);
    if (kvMatch) {
      out[kvMatch[1]!] = parseScalarValue(kvMatch[2]!);
      i += 1;
      continue;
    }

    i += 1;
  }

  return out;
}

export function splitSkillMd(content: string): { frontmatterRaw: string; body: string } | null {
  const m = content.match(FRONTMATTER_RE);
  if (!m) return null;
  return { frontmatterRaw: m[1] ?? '', body: (m[2] ?? '').trimStart() };
}

export function parseSkillMd(
  content: string,
  opts?: { source?: import('@/types/AgentSkill').AgentSkillSource; basePath?: string },
): import('@/types/AgentSkill').AgentSkill | null {
  const split = splitSkillMd(content);
  if (!split) return null;

  const fm = parseSkillMdFrontmatter(split.frontmatterRaw);
  const name = String(fm.name ?? '').trim();
  const description = String(fm.description ?? '').trim();
  if (!name || !description) return null;

  const pathsRaw = fm.paths;
  let paths: string[] | undefined;
  if (Array.isArray(pathsRaw)) {
    paths = pathsRaw.map((p) => String(p).trim()).filter(Boolean);
  } else if (typeof pathsRaw === 'string' && pathsRaw.trim()) {
    paths = pathsRaw.split(',').map((p) => p.trim()).filter(Boolean);
  }

  const metadataRaw = fm.metadata;
  let metadata: Record<string, string> | undefined;
  if (metadataRaw && typeof metadataRaw === 'object' && !Array.isArray(metadataRaw)) {
    metadata = Object.fromEntries(
      Object.entries(metadataRaw as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
    );
  }

  return {
    id: name,
    name,
    description,
    disableModelInvocation: fm['disable-model-invocation'] === true,
    paths,
    metadata,
    body: split.body.trim(),
    source: opts?.source ?? 'builtin',
    basePath: opts?.basePath,
  };
}
