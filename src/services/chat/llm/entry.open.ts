/**
 * Open 版 LLM 入口：仅 BYOK，不 import DomAService。
 *
 * 模型可用性由「提供商拉取 → Switch 启用」决定；
 * 顶部可用列表 = enabledModels；当前对话用 activeProvider + activeModel。
 */
import type { LlmSendMessageOptions, LlmSendMeta } from './llmTypes';
import { LlmService } from './llmService';
import type { McpClient } from '@/services/mcp/mcpClient';
import {
  OpenAICompatibleService,
  fetchOpenAiCompatibleModels,
} from './openaiCompatibleService';
import { AnthropicClaudeService } from './anthropicClaudeService';
import { fetchAnthropicModels } from '../anthropicSseFetcher';
import { createMCPClient } from '@/services/mcp/mcpClient';
import { ExtensionClientTransport } from '@/services/mcp/extensionTransport';
import { getContext } from '@/services/Context';
import {
  OPEN_PROVIDER_IDS,
  OPEN_PROVIDER_PRESETS,
  isOpenProviderId,
  type OpenProviderId,
} from './llmPresets';

export type { OpenProviderId } from './llmPresets';
export { OPEN_PROVIDER_PRESETS, OPEN_PROVIDER_IDS, isOpenProviderId } from './llmPresets';
export { DEFAULT_MODELS } from './llmTypes';
export type { LlmProvider, LlmResponse, LlmSendMessageOptions, LlmSendMeta } from './llmTypes';

const STORAGE_KEY = 'doma_open_llm_config';

export interface EnabledModelRef {
  provider: OpenProviderId;
  model: string;
}

export interface OpenStoredConfig {
  /** 当前选用的提供商 */
  provider: OpenProviderId | null;
  /** 当前选用的模型名 */
  activeModel: string | null;
  /** 已添加过的提供商（有配置入口） */
  configuredProviders: OpenProviderId[];
  apiKeys: Partial<Record<OpenProviderId, string>>;
  baseUrls: Partial<Record<OpenProviderId, string>>;
  /** 各提供商拉取到的全量模型 */
  fetchedModels: Partial<Record<OpenProviderId, string[]>>;
  /** Switch 打开后进入「可用」列表的模型 */
  enabledModels: EnabledModelRef[];
  /** @deprecated 兼容旧字段，读入后迁移到 activeModel */
  models?: Partial<Record<OpenProviderId, string>>;
  customModels?: Partial<Record<OpenProviderId, string[]>>;
}

function emptyConfig(): OpenStoredConfig {
  return {
    provider: null,
    activeModel: null,
    configuredProviders: [],
    apiKeys: {},
    baseUrls: {},
    fetchedModels: {},
    enabledModels: [],
  };
}

class OpenLlmManager {
  private services: Map<OpenProviderId, LlmService> = new Map();
  private currentProvider: OpenProviderId | null = null;
  private config: OpenStoredConfig = emptyConfig();

  constructor(mcpClient: McpClient) {
    for (const id of OPEN_PROVIDER_IDS) {
      const preset = OPEN_PROVIDER_PRESETS[id];
      if (preset.transport === 'anthropic_messages') {
        this.services.set(
          id,
          new AnthropicClaudeService(
            '',
            preset.defaultModel,
            mcpClient,
            preset.defaultBaseUrl,
          ),
        );
      } else {
        this.services.set(
          id,
          new OpenAICompatibleService('', preset.defaultModel, mcpClient, preset.defaultBaseUrl, {
            name: preset.label,
            extraBody: id === 'qwen' ? { enable_thinking: false } : undefined,
          }),
        );
      }
    }

    getContext().browser.runtime.onMessage.addListener((message: any) => {
      if (message.operate === 'mcp/response') {
        mcpClient.transport?.onmessage!(message.jsonrpc);
      }
    });
  }

  async loadConfig(): Promise<OpenStoredConfig> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      if (result[STORAGE_KEY]) {
        const stored = result[STORAGE_KEY] as OpenStoredConfig;
        const migrated = this.migrateStored(stored);
        this.config = migrated;
        if (isOpenProviderId(this.config.provider) && this.config.activeModel) {
          this.currentProvider = this.config.provider;
        } else {
          this.currentProvider = null;
          this.config.provider = null;
          this.config.activeModel = null;
        }
        this.updateServicesConfig();
      }
    } catch (e) {
      console.error('[OpenLlmManager] Failed to load config:', e);
    }
    return this.config;
  }

  private migrateStored(stored: OpenStoredConfig): OpenStoredConfig {
    const base = emptyConfig();
    const configured = Array.isArray(stored.configuredProviders)
      ? stored.configuredProviders.filter(isOpenProviderId)
      : [];
    // 旧版：有 apiKey 的也算已配置
    for (const id of OPEN_PROVIDER_IDS) {
      if ((stored.apiKeys?.[id] || '').trim() && !configured.includes(id)) {
        configured.push(id);
      }
    }
    let enabled = Array.isArray(stored.enabledModels)
      ? stored.enabledModels.filter(
          (m) => m && isOpenProviderId(m.provider) && typeof m.model === 'string' && m.model.trim(),
        )
      : [];
    // 旧版：models[provider] 当作已启用 + 当前模型
    if (!enabled.length && stored.models) {
      for (const id of OPEN_PROVIDER_IDS) {
        const m = stored.models[id]?.trim();
        if (m) enabled.push({ provider: id, model: m });
      }
    }
    let provider = isOpenProviderId(stored.provider) ? stored.provider : null;
    let activeModel =
      typeof stored.activeModel === 'string' && stored.activeModel.trim()
        ? stored.activeModel.trim()
        : null;
    if (!activeModel && provider && stored.models?.[provider]) {
      activeModel = stored.models[provider]!.trim() || null;
    }
    if (provider && activeModel) {
      const ok = enabled.some((e) => e.provider === provider && e.model === activeModel);
      if (!ok) {
        enabled = [...enabled, { provider, model: activeModel }];
      }
    }
    return {
      ...base,
      provider,
      activeModel,
      configuredProviders: configured,
      apiKeys: { ...(stored.apiKeys || {}) },
      baseUrls: { ...(stored.baseUrls || {}) },
      fetchedModels: { ...(stored.fetchedModels || {}) },
      enabledModels: enabled,
    };
  }

  private effectiveBaseUrl(id: OpenProviderId): string {
    const preset = OPEN_PROVIDER_PRESETS[id];
    return (this.config.baseUrls[id] || '').trim() || preset.defaultBaseUrl;
  }

  private updateServicesConfig(): void {
    for (const id of OPEN_PROVIDER_IDS) {
      const service = this.services.get(id);
      if (!service) continue;
      const apiKey = this.config.apiKeys[id] || '';
      const model =
        (this.config.provider === id ? this.config.activeModel : null) ||
        OPEN_PROVIDER_PRESETS[id].defaultModel ||
        '';
      const baseUrl = this.effectiveBaseUrl(id);
      if (service instanceof OpenAICompatibleService) {
        service.setConfig(apiKey, model || OPEN_PROVIDER_PRESETS[id].defaultModel, baseUrl);
      } else if (service instanceof AnthropicClaudeService) {
        service.setConfig(apiKey, model || OPEN_PROVIDER_PRESETS[id].defaultModel, baseUrl);
      } else {
        service.setConfig(apiKey, model || OPEN_PROVIDER_PRESETS[id].defaultModel);
      }
    }
  }

  async saveConfig(partial: Partial<OpenStoredConfig>): Promise<void> {
    this.config = {
      provider: partial.provider !== undefined ? partial.provider : this.config.provider,
      activeModel:
        partial.activeModel !== undefined ? partial.activeModel : this.config.activeModel,
      configuredProviders:
        partial.configuredProviders !== undefined
          ? partial.configuredProviders
          : this.config.configuredProviders,
      apiKeys: { ...this.config.apiKeys, ...(partial.apiKeys || {}) },
      baseUrls: { ...this.config.baseUrls, ...(partial.baseUrls || {}) },
      fetchedModels: { ...this.config.fetchedModels, ...(partial.fetchedModels || {}) },
      enabledModels:
        partial.enabledModels !== undefined
          ? partial.enabledModels
          : this.config.enabledModels,
    };
    if (partial.provider !== undefined) {
      this.currentProvider = isOpenProviderId(partial.provider) ? partial.provider : null;
    }
    this.updateServicesConfig();
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: this.config });
    } catch (e) {
      console.error('[OpenLlmManager] Failed to save config:', e);
    }
  }

  getConfig(): OpenStoredConfig {
    return this.config;
  }

  getCurrentProvider(): OpenProviderId | null {
    return this.currentProvider;
  }

  getEnabledModels(): EnabledModelRef[] {
    return [...this.config.enabledModels];
  }

  getConfiguredProviders(): OpenProviderId[] {
    return [...this.config.configuredProviders];
  }

  isModelEnabled(provider: OpenProviderId, model: string): boolean {
    return this.config.enabledModels.some(
      (e) => e.provider === provider && e.model === model,
    );
  }

  async setModelEnabled(
    provider: OpenProviderId,
    model: string,
    enabled: boolean,
  ): Promise<void> {
    const name = model.trim();
    if (!name) return;
    let list = [...this.config.enabledModels];
    const idx = list.findIndex((e) => e.provider === provider && e.model === name);
    if (enabled && idx < 0) {
      list.push({ provider, model: name });
    } else if (!enabled && idx >= 0) {
      list.splice(idx, 1);
    }
    const patch: Partial<OpenStoredConfig> = { enabledModels: list };
    // 关掉当前选用的模型时清空 active
    if (
      !enabled &&
      this.config.provider === provider &&
      this.config.activeModel === name
    ) {
      patch.provider = null;
      patch.activeModel = null;
    }
    // 打开且尚无当前模型时，自动选用
    if (enabled && !this.config.activeModel) {
      patch.provider = provider;
      patch.activeModel = name;
    }
    await this.saveConfig(patch);
  }

  async selectEnabledModel(provider: OpenProviderId, model: string): Promise<void> {
    if (!this.isModelEnabled(provider, model)) {
      await this.setModelEnabled(provider, model, true);
    }
    await this.saveConfig({ provider, activeModel: model });
  }

  async addConfiguredProvider(provider: OpenProviderId): Promise<void> {
    if (!this.config.configuredProviders.includes(provider)) {
      await this.saveConfig({
        configuredProviders: [...this.config.configuredProviders, provider],
      });
    }
  }

  async removeConfiguredProvider(provider: OpenProviderId): Promise<void> {
    const apiKeys = { ...this.config.apiKeys };
    delete apiKeys[provider];
    const baseUrls = { ...this.config.baseUrls };
    delete baseUrls[provider];
    const fetchedModels = { ...this.config.fetchedModels };
    delete fetchedModels[provider];

    this.config = {
      ...this.config,
      configuredProviders: this.config.configuredProviders.filter((p) => p !== provider),
      enabledModels: this.config.enabledModels.filter((e) => e.provider !== provider),
      apiKeys,
      baseUrls,
      fetchedModels,
      ...(this.config.provider === provider
        ? { provider: null, activeModel: null }
        : {}),
    };
    if (this.config.provider === null) {
      this.currentProvider = null;
    }
    this.updateServicesConfig();
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: this.config });
    } catch (e) {
      console.error('[OpenLlmManager] Failed to save config:', e);
    }
  }

  isProviderReady(): boolean {
    const id = this.currentProvider;
    const model = this.config.activeModel?.trim();
    if (!isOpenProviderId(id) || !model) return false;
    if (!this.isModelEnabled(id, model)) return false;
    const preset = OPEN_PROVIDER_PRESETS[id];
    const key = (this.config.apiKeys[id] || '').trim();
    if (preset.requireApiKey && !key) return false;
    if (preset.showBaseUrl && !this.effectiveBaseUrl(id)) return false;
    return true;
  }

  getModelButtonLabel(): string {
    if (!this.isProviderReady()) return '';
    return this.config.activeModel || '';
  }

  getAvailableModels(provider?: OpenProviderId | null): string[] {
    const id = provider ?? this.currentProvider;
    if (!isOpenProviderId(id)) return [];
    return [...(this.config.fetchedModels[id] || [])];
  }

  async fetchModelsForProvider(provider: OpenProviderId): Promise<string[]> {
    const preset = OPEN_PROVIDER_PRESETS[provider];
    const apiKey = this.config.apiKeys[provider] || '';
    const baseUrl = this.effectiveBaseUrl(provider);
    if (preset.requireApiKey && !apiKey.trim()) {
      throw new Error('请先填写 API Key');
    }
    if (preset.showBaseUrl && !baseUrl.trim()) {
      throw new Error('请先填写 Base URL');
    }
    let list: string[] = [];
    try {
      if (preset.transport === 'anthropic_messages') {
        list = await fetchAnthropicModels(baseUrl, apiKey);
      } else {
        list = await fetchOpenAiCompatibleModels(baseUrl, apiKey);
      }
    } catch (e) {
      // Anthropic / 部分网关拉列表失败时回落到 hint，仍可手填
      if (preset.hintModels.length) {
        console.warn('[OpenLlmManager] fetch models failed, using hints', e);
        list = [...preset.hintModels];
      } else {
        throw e;
      }
    }
    // 刷新时保留已启用但不在远端列表中的手填模型；Anthropic 额外保留 hint
    const keep = this.config.enabledModels
      .filter((e) => e.provider === provider)
      .map((e) => e.model);
    const hints =
      preset.transport === 'anthropic_messages' ? preset.hintModels : [];
    const merged = Array.from(new Set([...list, ...keep, ...hints]));
    await this.saveConfig({
      fetchedModels: { ...this.config.fetchedModels, [provider]: merged },
    });
    return merged;
  }

  /** 手填模型名：并入 fetchedModels 并启用 */
  async addCustomModel(provider: OpenProviderId, model: string): Promise<string> {
    const name = model.trim();
    if (!name) return '';
    const prev = this.config.fetchedModels[provider] || [];
    const next = prev.includes(name) ? prev : [...prev, name];
    await this.saveConfig({
      fetchedModels: { ...this.config.fetchedModels, [provider]: next },
    });
    await this.setModelEnabled(provider, name, true);
    return name;
  }

  getCurrentService(): LlmService | undefined {
    if (!this.currentProvider) return undefined;
    return this.services.get(this.currentProvider);
  }

  async sendMessage(
    conversationId: string,
    userMessage: string,
    options: LlmSendMessageOptions,
    signal: AbortSignal,
    _meta?: LlmSendMeta,
  ) {
    if (!this.isProviderReady()) {
      return { type: 'message' as const, content: '错误：请先配置并启用至少一个模型' };
    }
    const service = this.getCurrentService();
    if (!service) {
      return { type: 'message' as const, content: `错误：未找到 ${this.currentProvider} 服务` };
    }
    // BYOK：不传 Pro 身份头；底层签名仍兼容旧 LlmService
    service.sendMessage?.(conversationId, '', '', '', '', userMessage, options, signal);
  }

  withdrawLastUserMessage(conversationId: string): void {
    this.getCurrentService()?.withdrawLastUserMessage(conversationId);
  }

  withdrawTurns(conversationId: string, turnCount: number): void {
    this.getCurrentService()?.withdrawTurns(conversationId, turnCount);
  }

  syncConversationHistory(
    conversationId: string,
    messages: Array<{ role: string; content?: string | null }>,
  ): void {
    this.getCurrentService()?.syncHistoryFromChatMessages(conversationId, messages);
  }

  replaceHistoryWithSummary(conversationId: string, summary: string): void {
    this.getCurrentService()?.replaceHistoryWithSummary(conversationId, summary);
  }

  clearConversation(conversationId: string): void {
    this.getCurrentService()?.clearConversation(conversationId);
  }

  setProvider(provider: OpenProviderId | null): void {
    this.currentProvider = provider;
    this.config.provider = provider;
  }
}

export const llmManager = new OpenLlmManager(
  await createMCPClient(new ExtensionClientTransport()),
);

export const LLM_EDITION = 'open' as const;
