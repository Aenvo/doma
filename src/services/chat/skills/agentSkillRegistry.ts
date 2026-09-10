import type { AgentSkill, AgentSkillCatalogEntry } from '@/types/AgentSkill';
import { parseSkillMd } from './parseSkillMd';
import { buildSkillMdFromForm, normalizeSkillName } from './skillComposer';
import {
  deleteUserSkillRecord,
  loadUserSkillRows,
  saveUserSkillRecord,
} from './userSkillStore';
import cursorSkillMd from './builtin/cursor/SKILL.md?raw';
import createSkillMd from './builtin/create-skill/SKILL.md?raw';
import createExtensionMd from './builtin/create-extension/SKILL.md?raw';

/** UI 层 i18n 覆盖（descriptionKey 存在时优先走 t()） */
const SKILL_I18N_KEYS: Record<string, string> = {
  cursor: 'chat.skills.cursor.description',
  'cursor-prompt': 'chat.skills.cursor.description',
  'create-extension': 'chat.skills.createExtension.description',
};

/** 仍加载文件/可 resolve，但不出现在 skills 列表与斜杠菜单 */
const HIDDEN_FROM_SKILL_LIST = new Set<string>(['cursor-prompt']);

const BUILTIN_SKILL_SOURCES: Array<{ raw: string; basePath: string }> = [
  { raw: createSkillMd, basePath: 'builtin/create-skill' },
  { raw: createExtensionMd, basePath: 'builtin/create-extension' },
  { raw: cursorSkillMd, basePath: 'builtin/cursor' },
];

const BUILTIN_NAMES = new Set<string>();

let cachedSkills: AgentSkill[] | undefined;
let userSkillsCache: AgentSkill[] = [];
let userSkillsLoaded = false;

function loadBuiltinSkills(): AgentSkill[] {
  const skills: AgentSkill[] = [];
  BUILTIN_NAMES.clear();
  for (const { raw, basePath } of BUILTIN_SKILL_SOURCES) {
    const parsed = parseSkillMd(raw, { source: 'builtin', basePath });
    if (parsed) {
      skills.push(parsed);
      BUILTIN_NAMES.add(parsed.name);
    }
  }
  return skills;
}

function rebuildCache(): void {
  cachedSkills = [...loadBuiltinSkills(), ...userSkillsCache];
}

export class AgentSkillRegistry {
  static async reloadUserSkills(): Promise<void> {
    const rows = await loadUserSkillRows();
    userSkillsCache = rows
      .map((row) => {
        const parsed = parseSkillMd(row.rawMd, { source: 'user' });
        if (!parsed) return null;
        return { ...parsed, id: row.id };
      })
      .filter((s): s is AgentSkill => !!s);
    userSkillsLoaded = true;
    rebuildCache();
  }

  static async ensureUserSkillsLoaded(): Promise<void> {
    if (userSkillsLoaded) return;
    await this.reloadUserSkills();
  }

  static getAllSkills(): AgentSkill[] {
    if (!cachedSkills) {
      rebuildCache();
    }
    return [...cachedSkills!];
  }

  static getSkillByName(name: string): AgentSkill | undefined {
    const id = name.trim();
    if (!id) return undefined;
    return this.getAllSkills().find((s) => s.name === id);
  }

  static getUserSkillById(id: string): AgentSkill | undefined {
    const skillId = id.trim();
    if (!skillId) return undefined;
    return userSkillsCache.find((s) => s.id === skillId);
  }

  static getUserSkillForEdit(id: string): {
    id: string;
    name: string;
    allowModelRoute: boolean;
    description: string;
    body: string;
  } | undefined {
    const skill = this.getUserSkillById(id);
    if (!skill) return undefined;
    return {
      id: skill.id,
      name: skill.name,
      allowModelRoute: !skill.disableModelInvocation,
      description: skill.description,
      body: skill.body,
    };
  }

  static getCatalogEntries(): AgentSkillCatalogEntry[] {
    return this.getAllSkills()
      .filter((skill) => !HIDDEN_FROM_SKILL_LIST.has(skill.name))
      .map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        descriptionKey: SKILL_I18N_KEYS[skill.name],
        disableModelInvocation: skill.disableModelInvocation,
        source: skill.source,
      }));
  }

  static getAutoRoutableSkills(): AgentSkill[] {
    return this.getAllSkills().filter((s) => !s.disableModelInvocation);
  }

  static invalidateCache(): void {
    cachedSkills = undefined;
  }

  static isBuiltinName(name: string): boolean {
    return BUILTIN_NAMES.has(normalizeSkillName(name));
  }

  static isBuiltinSkill(skill: AgentSkill): boolean {
    return skill.source === 'builtin';
  }

  static async saveUserSkillFromForm(opts: {
    id?: string;
    name: string;
    allowModelRoute: boolean;
    body: string;
    description?: string;
  }): Promise<{ ok: boolean; error?: string; id?: string }> {
    const normalized = normalizeSkillName(opts.name);
    if (this.isBuiltinName(normalized)) {
      return { ok: false, error: '与内置 Skill 名称冲突' };
    }

    const editingId = opts.id?.trim();
    if (editingId) {
      const existing = this.getUserSkillById(editingId);
      if (!existing) {
        return { ok: false, error: 'Skill 不存在' };
      }
    }

    const nameConflict = userSkillsCache.find(
      (s) => s.name === normalized && s.id !== editingId,
    );
    if (nameConflict) {
      return { ok: false, error: 'Skill 名称已存在' };
    }

    const rawMd = buildSkillMdFromForm({
      name: normalized,
      allowModelRoute: opts.allowModelRoute,
      body: opts.body,
      description: opts.description,
    });
    const parsed = parseSkillMd(rawMd, { source: 'user' });
    if (!parsed) {
      return { ok: false, error: 'Skill 内容无效，请检查名称与正文' };
    }

    const row = await saveUserSkillRecord(rawMd, {
      id: editingId,
      name: parsed.name,
    });
    const stored: AgentSkill = { ...parsed, id: row.id };

    const existingIdx = userSkillsCache.findIndex((s) => s.id === row.id);
    if (existingIdx >= 0) {
      userSkillsCache[existingIdx] = stored;
    } else {
      userSkillsCache.push(stored);
    }
    rebuildCache();
    return { ok: true, id: row.id };
  }

  static async deleteUserSkill(id: string): Promise<{ ok: boolean; error?: string }> {
    const skillId = id.trim();
    if (!skillId) return { ok: false, error: 'Skill id 无效' };

    const existing = this.getUserSkillById(skillId);
    if (!existing) {
      return { ok: false, error: 'Skill 不存在' };
    }

    await deleteUserSkillRecord(skillId);
    userSkillsCache = userSkillsCache.filter((s) => s.id !== skillId);
    rebuildCache();
    return { ok: true };
  }
}

export function getAgentSkillInstructions(name: string): string | undefined {
  return AgentSkillRegistry.getSkillByName(name)?.body;
}

/** 发送前从 IDB 刷新用户 skills，确保侧栏能读到最新 SKILL.md 正文 */
export async function resolveAgentSkillInstructions(name: string): Promise<string | undefined> {
  await AgentSkillRegistry.reloadUserSkills();
  return getAgentSkillInstructions(name);
}

export async function saveUserSkillFromForm(opts: {
  id?: string;
  name: string;
  allowModelRoute: boolean;
  body: string;
  description?: string;
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  await AgentSkillRegistry.ensureUserSkillsLoaded();
  return AgentSkillRegistry.saveUserSkillFromForm(opts);
}

export async function deleteUserSkill(id: string): Promise<{ ok: boolean; error?: string }> {
  await AgentSkillRegistry.ensureUserSkillsLoaded();
  return AgentSkillRegistry.deleteUserSkill(id);
}

export async function getUserSkillForEdit(id: string) {
  await AgentSkillRegistry.ensureUserSkillsLoaded();
  return AgentSkillRegistry.getUserSkillForEdit(id);
}
