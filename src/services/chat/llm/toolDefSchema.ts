/** 共享 Tool 定义 schema（core / Pro 插槽共用） */

export interface ToolProperty {
  type: string;
  description: string;
  items?: { type: string };
}

export interface ToolDef {
  name: string;
  description: string;
  properties: Record<string, ToolProperty>;
  required?: string[];
}

export const CONVERSATION_ID_PROPERTY: ToolProperty = {
  type: 'string',
  description: '会话 ID。工具会通过该 ID 映射到对应的 tab/group 上下文。',
};

export function p(type: string, description: string): ToolProperty {
  return { type, description };
}

export function pArray(itemType: string, description: string): ToolProperty {
  return { type: 'array', description, items: { type: itemType } };
}
