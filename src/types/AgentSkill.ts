export type AgentSkillSource = 'builtin' | 'user' | 'hub';

/** 标准 Agent Skills SKILL.md 解析结果 */
export interface AgentSkill {
  /** 稳定 id：用户 skill 为 UUID，内置 skill 同 name */
  id: string;
  name: string;
  description: string;
  disableModelInvocation: boolean;
  paths?: string[];
  metadata?: Record<string, string>;
  /** frontmatter 之后的 Markdown 正文（instruction） */
  body: string;
  source: AgentSkillSource;
  /** skill 目录或虚拟根路径，供后续加载 references/scripts */
  basePath?: string;
}

/** 斜杠菜单 / catalog 条目 */
export interface AgentSkillCatalogEntry {
  /** 稳定 id（用户 skill 为 UUID，内置 skill 同 name） */
  id: string;
  /** 斜杠调用的 skill 名称 */
  name: string;
  description: string;
  descriptionKey?: string;
  disableModelInvocation: boolean;
  source: AgentSkillSource;
}
