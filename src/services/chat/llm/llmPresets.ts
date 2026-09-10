/** Open 版 BYOK 预设；Pro 不依赖本表做默认路径 */

export type OpenProviderId = 'openai' | 'qwen' | 'deepseek' | 'siliconflow';

export type LlmTransport = 'openai_compatible';

export interface OpenProviderPreset {
  id: OpenProviderId;
  label: string;
  labelZh: string;
  transport: LlmTransport;
  /** 不含 /chat/completions 的 API 根，如 https://api.deepseek.com/v1 */
  defaultBaseUrl: string;
  requireApiKey: boolean;
  /** 是否在设置里展示 / 允许改 Base URL */
  showBaseUrl: boolean;
  defaultModel: string;
  hintModels: string[];
  docsUrl?: string;
}

export const OPEN_PROVIDER_PRESETS: Record<OpenProviderId, OpenProviderPreset> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    labelZh: 'OpenAI',
    transport: 'openai_compatible',
    defaultBaseUrl: 'https://api.openai.com/v1',
    requireApiKey: true,
    showBaseUrl: false,
    defaultModel: 'gpt-4o',
    hintModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'o3-mini'],
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  qwen: {
    id: 'qwen',
    label: 'Qwen',
    labelZh: '千问',
    transport: 'openai_compatible',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    requireApiKey: true,
    showBaseUrl: false,
    defaultModel: 'qwen-plus',
    hintModels: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen3.5-plus'],
    docsUrl: 'https://dashscope.console.aliyun.com/',
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    labelZh: 'DeepSeek',
    transport: 'openai_compatible',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    requireApiKey: true,
    showBaseUrl: false,
    defaultModel: 'deepseek-chat',
    hintModels: ['deepseek-chat', 'deepseek-reasoner'],
    docsUrl: 'https://platform.deepseek.com/',
  },
  siliconflow: {
    id: 'siliconflow',
    label: 'SiliconFlow',
    labelZh: '硅基流动',
    transport: 'openai_compatible',
    defaultBaseUrl: 'https://api.siliconflow.cn/v1',
    requireApiKey: true,
    showBaseUrl: false,
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    hintModels: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-7B-Instruct'],
    docsUrl: 'https://cloud.siliconflow.cn/',
  },
};

export const OPEN_PROVIDER_IDS = Object.keys(OPEN_PROVIDER_PRESETS) as OpenProviderId[];

export function isOpenProviderId(id: string | null | undefined): id is OpenProviderId {
  return !!id && id in OPEN_PROVIDER_PRESETS;
}

/** 把用户填的 baseUrl 规范成 .../v1，再拼 chat/completions */
export function resolveChatCompletionsUrl(baseUrl: string): string {
  let u = (baseUrl || '').trim().replace(/\/+$/, '');
  if (!u) return '';
  if (u.endsWith('/chat/completions')) return u;
  if (u.endsWith('/v1')) return `${u}/chat/completions`;
  return `${u}/v1/chat/completions`;
}

export function resolveModelsListUrl(baseUrl: string): string {
  let u = (baseUrl || '').trim().replace(/\/+$/, '');
  if (!u) return '';
  if (u.endsWith('/chat/completions')) {
    u = u.slice(0, -'/chat/completions'.length);
  }
  if (u.endsWith('/v1')) return `${u}/models`;
  return `${u}/v1/models`;
}
