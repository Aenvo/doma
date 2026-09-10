/**
 * 阿里云通义千问 API 服务实现
 */

import {
  BROWSER_ASSISTANT_SYSTEM_PROMPT,
  type ConversationMessage,
  type LlmToolCallResult,
} from './llmTypes';
import { LlmService } from './llmService';
import {
  materializeToolResultContent,
} from './contextManager';
import { buildBrowserAssistantSystemPromptParts } from '../slashSkills';
import { formatSomScreenshotContext } from '../somElementsSchema';
import {
  armTurnUsageFixed,
  estimateJsonTokens,
  estimateSummarizedInHistory,
  estimateTextTokens,
} from './contextUsage';

// 阿里云 DashScope API - 兼容 OpenAI 格式
const QWEN_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

interface QwenMessage extends ConversationMessage {
  name?: string;
  tool_calls?: unknown[];
  tool_call_id?: string;
  expiredInNextRound?: boolean;
  expireKind?: 'screenshot' | 'caption';
  fileId?: string;
}

export class QwenService extends LlmService {
  getName(): string {
    return 'Qwen';
  }

  async fetchOptions(
    conversationId: string,
    userId: string,
    deviceId: string,
    site: string,
    _ever: string,
    history: QwenMessage[],
  ): Promise<RequestInit> {
    const { systemContent, basePrompt, skillSection } =
      await buildBrowserAssistantSystemPromptParts(BROWSER_ASSISTANT_SYSTEM_PROMPT);
    const tools = [...(await this.mcpClient.getLlmTools())];
    armTurnUsageFixed(conversationId, {
      system: estimateTextTokens(basePrompt),
      skills: estimateTextTokens(skillSection),
      tools: estimateJsonTokens(tools),
      summarized: estimateSummarizedInHistory(history),
    });
    const messages: QwenMessage[] = [
      {
        role: 'system',
        content: systemContent,
      },
      ...history,
    ];

    const requestBody = {
      model: this.model,
      messages,
      tools,
      max_tokens: 4096,
      stream: true,
      enable_thinking: false,
    };

    return {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    };
  }

  endPoint(): string {
    return QWEN_API_URL;
  }

  async requestBody(
    history: QwenMessage[],
  ): Promise<unknown> {
    const { systemContent } =
      await buildBrowserAssistantSystemPromptParts(BROWSER_ASSISTANT_SYSTEM_PROMPT);
    const messages: QwenMessage[] = [
      {
        role: 'system',
        content: systemContent,
      },
      ...history,
    ];

    return {
      model: this.model,
      messages,
      tools: [...(await this.mcpClient.getLlmTools())],
      max_tokens: 4096,
      stream: true,
      enable_thinking: false,
    };
  }

  async processToolResults(
    conversationId: string,
    toolResults: LlmToolCallResult[],
    history: QwenMessage[],
  ) {
    // 与 call() 共用同一引用；若中间 sync 换过 Map，抢回权威数组
    this.conversationHistory.set(conversationId, history);

    // prepareLlmHistory 在 call() 发请求前统一处理 strip/stub

    for (const toolResult of toolResults) {
      const result = toolResult.result as any;
        if (result && typeof result === 'object' && 'base64' in result && 'mimeType' in result && 'captureTab' in result && result.captureTab === true) {
            const resultMap = result as {
              base64: string;
              mimeType: string;
              elements?: unknown[];
              hint?: string;
              areas?: unknown[];
            };
  
            console.log(
              `[QwenService] Processing screenshot with current model: ${this.model} (${resultMap.elements?.length ?? 0} labeled elements)`
            );
  
            // 先添加工具响应
            const toolResultMsg: QwenMessage = {
              role: 'tool',
              tool_call_id: toolResult.tool_call_id,
              content: '截图已获取，正在分析...',
            };
            history.push(toolResultMsg);
  
            let screenshotText =
              '请分析这个网页截图，描述你看到的主要内容、页面布局和可交互的元素。结合之前的任务目标给出操作建议。';
            if (resultMap.elements && resultMap.elements.length > 0) {
              screenshotText = formatSomScreenshotContext(resultMap.elements, {
                hint: resultMap.hint,
                areas: resultMap.areas,
              });
            } else if (resultMap.hint?.trim()) {
              screenshotText = `${screenshotText}\n${resultMap.hint.trim()}`;
            }
  
            const imageMsg: QwenMessage = {
              role: 'user',
              expiredInNextRound: true,
              expireKind: 'screenshot',
              content: [
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${resultMap.mimeType};base64,${resultMap.base64}`,
                  },
                },
                {
                  type: 'text',
                  text: screenshotText,
                },
              ],
            };
            history.push(imageMsg);
          
        } else if (
          toolResult.name === 'browser_get_video_caption'
          && result
          && typeof result === 'object'
          && (result as { ok?: boolean }).ok === true
          && 'caption' in (result as object)
        ) {
          // 字幕完整 payload 本轮写入；下轮 applyExpiration 替换为占位符
          const toolResultMsg: QwenMessage = {
            role: 'tool',
            tool_call_id: toolResult.tool_call_id,
            expiredInNextRound: true,
            expireKind: 'caption',
            content: JSON.stringify(result),
          };
          history.push(toolResultMsg);
        }
        else if (result && typeof result === 'object' && 'kind' in result && result.kind === 'binary' && 'type' in result && result.type === 'file') {
          const imageMsg: QwenMessage = {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:${result.mimeType};base64,${result.base64}`,
                },
              },
              {
                type: 'text',
                text: result.name,
              },
            ],
            fileId: typeof result.fileId === "string" ? result.fileId : undefined,
          };
          history.push(imageMsg);
        }
        else if (result && typeof result === 'object' && 'imageRecognition' in result && result.imageRecognition === true) {
          const imageMsg: QwenMessage = {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: result.imageUrl,
                },
              },
              {
                type: 'text',
                text: '请识别这张图片',
              },
            ],
            fileId: typeof result.fileId === "string" ? result.fileId : undefined,
          };
          history.push(imageMsg);
        }
        else {
          const content = await materializeToolResultContent(conversationId, result, {
            toolName: toolResult.name,
          });
          const toolResultMsg: QwenMessage = {
            role: 'tool',
            tool_call_id: toolResult.tool_call_id,
            content,
          };
          history.push(toolResultMsg);
        }
    }
  }

  /**
   * 清理未完成的 tool_calls
   * 当用户中断任务时，可能会有 assistant 消息包含 tool_calls 但没有对应的 tool response
   * Qwen API 要求每个 tool_call 都必须有响应
   */
  protected cleanupIncompleteToolCalls(history: QwenMessage[]): void {
    if (history.length === 0) return;

    // 从后往前检查，找到最后一个 assistant 消息
    let lastAssistantIndex = -1;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'assistant') {
        lastAssistantIndex = i;
        break;
      }
    }

    if (lastAssistantIndex === -1) return;

    const lastAssistant = history[lastAssistantIndex];

    // 如果最后一个 assistant 消息有 tool_calls
    if (lastAssistant.tool_calls && lastAssistant.tool_calls.length > 0) {
      // 检查后面是否有对应的 tool response
      let hasToolResponse = false;
      for (let i = lastAssistantIndex + 1; i < history.length; i++) {
        if (history[i].role === 'tool') {
          hasToolResponse = true;
          break;
        }
      }

      // 如果没有 tool response，移除这个 assistant 消息
      if (!hasToolResponse) {
        console.log('[QwenService] Removing incomplete tool_calls from history');
        history.splice(lastAssistantIndex, history.length - lastAssistantIndex);
      }
    }
  }

  clearConversation(conversationId: string): void {
    this.conversationHistory.delete(conversationId);
  }

  private generateUuid(): string {
    return Math.random().toString(36).substring(2, 10);
  }
}
