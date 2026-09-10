import { getContext } from '../Context';
import { AgentSkillRegistry, resolveAgentSkillInstructions } from './skills/agentSkillRegistry';
import { getEditionSystemPromptExtra } from '@/services/chat/llm/editionSystemPrompt';

export type SlashSkillDef = {
  /** 稳定 id（用户 skill 为 UUID，内置 skill 同 name） */
  id: string;
  /** 斜杠调用的 skill 名称 */
  name: string;
  descriptionKey?: string;
  description?: string;
  source?: 'builtin' | 'user' | 'hub';
};

const INTERACTION_BLOCK_PRIORITY_HINT = '# 最优先使用以下上下文';

function wrapSkillInteractionBlock(skillId: string, instructions: string): string {
  const lines = [
    INTERACTION_BLOCK_PRIORITY_HINT,
    instructions.trim(),
    `<skill>${skillId}</skill>`,
  ];
  return `<interactionBlock>\n${lines.join('\n')}\n</interactionBlock>`;
}

/** 将 skill 包进 interactionBlock，trailing 为去掉 skill chip 后的其余消息片段序列化结果 */
export async function buildSlashSkillSendText(skillId: string, trailing: string): Promise<string> {
  const id = skillId.trim();
  const instructions = await resolveAgentSkillInstructions(id);
  if (!instructions) {
    return `<interactionBlock>\n<skill>${id}</skill>\n</interactionBlock>${trailing}`;
  }
  return `${wrapSkillInteractionBlock(id, instructions)}${trailing}`;
}

export async function fetchSlashSkills(): Promise<SlashSkillDef[]> {
  await AgentSkillRegistry.ensureUserSkillsLoaded();
  const fallback: SlashSkillDef[] = AgentSkillRegistry.getCatalogEntries().map((entry) => ({
    id: entry.id,
    name: entry.name,
    descriptionKey: entry.descriptionKey,
    description: entry.description,
    source: entry.source,
  }));

  try {
    const res = (await getContext().browser.runtime.sendMessage({
      operate: 'chat/getSkills',
    })) as { success?: boolean; skills?: SlashSkillDef[] } | undefined;
    if (res?.success && Array.isArray(res.skills)) {
      return res.skills.filter(
        (s) => typeof s.id === 'string' && s.id.trim() && typeof s.name === 'string' && s.name.trim(),
      );
    }
  } catch {
    // background unavailable
  }
  return fallback;
}

export function slashSkillLabel(id: string): string {
  return id.startsWith('/') ? id : `/${id}`;
}

/** 构建 system 侧 skill catalog（仅 metadata，不含正文） */
export function formatSkillCatalogForSystem(
  skills: ReturnType<typeof AgentSkillRegistry.getAutoRoutableSkills>,
): string {
  if (!skills.length) return '';
  const lines = skills.map((s) => `- ${s.name}: ${s.description}`);
  return ['## Available skills', ...lines].join('\n');
}

const AGENT_SKILL_ROUTING_SECTION = `## Agent Skills 路由规则

下方 Available skills 列出可由你自动调用的 Agent Skill（仅 name 与 description，不含完整工作流）。

当用户任务与某条 skill 的 description 匹配（含任务类型、适用网站描述）时：

1. **必须先**调用 browser_invoke_agent_skill({ "skill_name": "<name>" }) 加载该 skill 的完整 instructions。
2. 读取 tool 返回的 instructions 后，**严格按其中工作流**执行，再调用 browser_* 等工具。
3. **禁止**在未 invoke 的情况下，仅凭 description 猜测并执行 skill 内步骤。
4. 若无任何 skill 匹配，按通用浏览器助手规则处理，不要 invoke。

Available skills 中的 name 即 skill_name 参数（如 book-12306）。`;

export type BrowserAssistantSystemPromptParts = {
  /** 最终写入 messages[0] 的完整 system */
  systemContent: string;
  basePrompt: string;
  /** 路由规则 + catalog；无可路由 skill 时为空串 */
  skillSection: string;
};

/** 拆分 base 与 Skills 段，便于 Context Usage 分桶 */
export async function buildBrowserAssistantSystemPromptParts(
  basePrompt: string,
): Promise<BrowserAssistantSystemPromptParts> {
  const editionExtra = getEditionSystemPromptExtra().trim();
  const effectiveBase = editionExtra ? `${basePrompt}\n\n${editionExtra}` : basePrompt;

  await AgentSkillRegistry.ensureUserSkillsLoaded();
  const catalog = formatSkillCatalogForSystem(AgentSkillRegistry.getAutoRoutableSkills());
  if (!catalog) {
    return { systemContent: effectiveBase, basePrompt: effectiveBase, skillSection: '' };
  }
  const skillSection = `${AGENT_SKILL_ROUTING_SECTION}\n\n${catalog}`;
  return {
    systemContent: `${effectiveBase}\n\n${skillSection}`,
    basePrompt: effectiveBase,
    skillSection,
  };
}

/** 在 base system prompt 后追加 Agent Skill 路由规则与 catalog（无可路由 skill 时不追加） */
export async function buildBrowserAssistantSystemPrompt(basePrompt: string): Promise<string> {
  const { systemContent } = await buildBrowserAssistantSystemPromptParts(basePrompt);
  return systemContent;
}
