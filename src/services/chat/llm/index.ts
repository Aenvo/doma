/**
 * 按构建版别名解析到 entry.open / entry.pro。
 * 业务侧请优先：import { llmManager } from '@/services/chat/llm/entry'
 * 或继续 from '@/services/chat/llm'（本文件再导出 entry）。
 */
export {
  llmManager,
  LLM_EDITION,
  DEFAULT_MODELS,
} from '@/services/chat/llm/entry';

export type { LlmProvider, LlmResponse, LlmSendMessageOptions, LlmSendMeta } from '@/services/chat/llm/entry';

export * from './llmTypes';
export * from './llmPresets';
