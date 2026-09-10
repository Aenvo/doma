/**
 * Kimi (Moonshot AI) API 服务实现
 * API 文档: https://platform.moonshot.ai/docs/api/chat
 */

import { BROWSER_ASSISTANT_SYSTEM_PROMPT, type LlmResponse } from './llmTypes';
import { LlmService } from './llmService';
import { getOpenAICompatibleTools } from './toolsDefinition'; // Kimi：OpenAI 兼容 function calling
import type { LlmSendMessageOptions } from './index';
import { 
  compressToolResult, 
  trimMessages, 
  estimateMessagesTokens,
  CONTEXT_LIMITS 
} from './contextManager';

// Kimi API URL
const KIMI_API_URL = 'https://api.moonshot.ai/v1/chat/completions';

interface KimiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | unknown[];
  name?: string;
  tool_calls?: unknown[];
  tool_call_id?: string;
}

export class KimiService extends LlmService {
  // private apiKey: string;
  // private model: string;
  // private visionModel: string = 'moonshot-v1-32k-vision-preview';
  // private conversationHistory: Map<string, KimiMessage[]> = new Map();

  // constructor(apiKey: string, model: string = 'kimi-k2-0711-preview') {
  //   this.apiKey = apiKey;
  //   this.model = model;
  // }

  // getName(): string {
  //   return 'Kimi';
  // }

  // setConfig(apiKey: string, model: string) {
  //   // 清理 API Key（去除空格和换行）
  //   this.apiKey = apiKey?.trim() || '';
  //   this.model = model;
  //   // 如果选择了 vision 模型，同时更新 visionModel
  //   if (model.includes('vision')) {
  //     this.visionModel = model;
  //   }
  //   console.log('[KimiService] Config updated, apiKey length:', this.apiKey.length, 'model:', this.model);
  // }

  // async sendMessage(conversationId: string, userMessage: string, options: LlmSendMessageOptions) {
  // }

  // async sendUserMessage(conversationId: string, userMessage: string): Promise<LlmResponse> {
  //   let history = this.conversationHistory.get(conversationId);
  //   if (!history) {
  //     history = [];
  //     this.conversationHistory.set(conversationId, history);
  //   }

  //   // 清理未完成的 tool_calls（用户中断后可能残留）
  //   this.cleanupIncompleteToolCalls(history);

  //   // 添加用户消息
  //   const userMsg: KimiMessage = {
  //     role: 'user',
  //     content: userMessage,
  //   };
  //   history.push(userMsg);

  //   // 上下文管理：裁剪超长历史
  //   history = this.manageContext(history);
  //   this.conversationHistory.set(conversationId, history);

  //   return this.callKimi(history);
  // }

  // /**
  //  * 管理上下文：裁剪超长历史
  //  */
  // private manageContext(history: KimiMessage[]): KimiMessage[] {
  //   // 裁剪超长历史
  //   let managed = trimMessages(history, CONTEXT_LIMITS.MAX_MESSAGES);
    
  //   // 检查 token 数量
  //   const tokens = estimateMessagesTokens(managed);
  //   if (tokens > CONTEXT_LIMITS.SUMMARY_THRESHOLD) {
  //     console.warn(`[KimiService] Context too large: ~${tokens} tokens. Consider starting new conversation.`);
  //   }
    
  //   return managed;
  // }

  // /**
  //  * 清理未完成的 tool_calls
  //  */
  // private cleanupIncompleteToolCalls(history: KimiMessage[]): void {
  //   if (history.length === 0) return;

  //   let lastAssistantIndex = -1;
  //   for (let i = history.length - 1; i >= 0; i--) {
  //     if (history[i].role === 'assistant') {
  //       lastAssistantIndex = i;
  //       break;
  //     }
  //   }

  //   if (lastAssistantIndex === -1) return;

  //   const lastAssistant = history[lastAssistantIndex];
    
  //   if (lastAssistant.tool_calls && lastAssistant.tool_calls.length > 0) {
  //     let hasToolResponse = false;
  //     for (let i = lastAssistantIndex + 1; i < history.length; i++) {
  //       if (history[i].role === 'tool') {
  //         hasToolResponse = true;
  //         break;
  //       }
  //     }

  //     if (!hasToolResponse) {
  //       console.log('[KimiService] Removing incomplete tool_calls from history');
  //       history.splice(lastAssistantIndex, history.length - lastAssistantIndex);
  //     }
  //   }
  // }

  // async sendToolResult(conversationId: string, toolUseId: string, toolResult: unknown): Promise<LlmResponse> {
  //   let history = this.conversationHistory.get(conversationId);
  //   if (!history) {
  //     history = [];
  //     this.conversationHistory.set(conversationId, history);
  //   }

  //   const funcName = toolUseId.split('::')[0];
  //   const callId = toolUseId.split('::')[1] || toolUseId;

  //   // 检查是否为截图结果
  //   if (toolResult && typeof toolResult === 'object' && 'base64' in toolResult && 'mimeType' in toolResult) {
  //     const resultMap = toolResult as { base64: string; mimeType: string; elements?: unknown[] };

  //     console.log(`[KimiService] Using vision model to analyze screenshot (${resultMap.elements?.length ?? 0} labeled elements)`);
  //     return this.analyzeImageWithVision(conversationId, resultMap.base64, resultMap.mimeType, history, funcName, callId, resultMap.elements);
  //   }

  //   // 普通工具结果 - 压缩过长的结果
  //   const compressedResult = compressToolResult(toolResult, CONTEXT_LIMITS.MAX_TOOL_RESULT_LENGTH);
    
  //   // 记录压缩情况
  //   const originalSize = JSON.stringify(toolResult).length;
  //   if (compressedResult.length < originalSize) {
  //     console.log(`[KimiService] Compressed tool result: ${originalSize} -> ${compressedResult.length} chars`);
  //   }

  //   const toolResultMsg: KimiMessage = {
  //     role: 'tool',
  //     name: funcName,
  //     tool_call_id: callId,
  //     content: compressedResult,
  //   };
  //   history.push(toolResultMsg);

  //   return this.callKimi(history);
  // }

  // private async analyzeImageWithVision(
  //   _conversationId: string,
  //   base64Data: string,
  //   mimeType: string,
  //   history: KimiMessage[],
  //   funcName: string,
  //   callId: string,
  //   elements?: unknown[]
  // ): Promise<LlmResponse> {
  //   try {
  //     // 先添加工具响应
  //     const toolResultMsg: KimiMessage = {
  //       role: 'tool',
  //       name: funcName,
  //       tool_call_id: callId,
  //       content: '截图已获取，正在分析图片内容...',
  //     };
  //     history.push(toolResultMsg);

  //     let analysisPrompt = '请分析这个网页截图：1) 描述当前页面状态和主要内容；2) 识别可交互元素（输入框、按钮、链接、下拉框等）及其位置特征（如文本、id、class）；3) 根据之前的任务目标，给出下一步具体操作建议，包括使用哪个工具和对应的选择器。';
  //     if (elements && elements.length > 0) {
  //       analysisPrompt = `这是当前页面的截图，其中可交互元素已用编号标注。\n\n元素映射表：\n${JSON.stringify(elements)}\n\n使用 browser_click({ index: N }) 或 browser_type({ index: N, text: "..." }) 直接操作对应编号的元素。根据之前的任务目标，给出下一步操作建议。`;
  //     }

  //     // 使用视觉模型分析
  //     const requestBody = {
  //       model: this.visionModel,
  //       messages: [
  //         {
  //           role: 'system',
  //           content: BROWSER_ASSISTANT_SYSTEM_PROMPT + '\n\n你正在分析网页截图，请仔细观察并提供精确的操作指导。',
  //         },
  //         {
  //           role: 'user',
  //           content: [
  //             {
  //               type: 'image_url',
  //               image_url: { url: `data:${mimeType};base64,${base64Data}` },
  //             },
  //             {
  //               type: 'text',
  //               text: analysisPrompt,
  //             },
  //           ],
  //         },
  //       ],
  //       temperature: 0.6,
  //       max_tokens: 2048,
  //     };

  //     const response = await fetch(KIMI_API_URL, {
  //       method: 'POST',
  //       headers: {
  //         'Content-Type': 'application/json',
  //         'Authorization': `Bearer ${this.apiKey}`,
  //       },
  //       body: JSON.stringify(requestBody),
  //     });

  //     const responseText = await response.text();
  //     if (!response.ok) {
  //       console.error('[KimiService] Vision API error:', response.status, responseText);
  //       // 降级处理
  //       const userMsg: KimiMessage = {
  //         role: 'user',
  //         content: `图片分析失败（${response.status}），已获取截图但无法分析内容。请继续执行任务。`,
  //       };
  //       history.push(userMsg);
  //       return this.callKimi(history);
  //     }

  //     const visionResponse = JSON.parse(responseText);
  //     const choices = visionResponse.choices;

  //     let analysisResult = '';
  //     if (choices && choices.length > 0) {
  //       const message = choices[0].message;
  //       if (message && message.content) {
  //         analysisResult = message.content;
  //       }
  //     }

  //     if (!analysisResult) {
  //       analysisResult = '图片分析完成，但未能提取有效内容描述。';
  //     }

  //     // 将图片分析结果作为用户消息添加
  //     const userMsg: KimiMessage = {
  //       role: 'user',
  //       content: `截图分析结果：\n${analysisResult}\n\n请根据上述分析继续执行任务。`,
  //     };
  //     history.push(userMsg);

  //     return this.callKimi(history);
  //   } catch (e) {
  //     console.error('[KimiService] Vision API call failed:', e);
  //     const userMsg: KimiMessage = {
  //       role: 'user',
  //       content: `图片分析失败：${e instanceof Error ? e.message : String(e)}。请继续执行任务。`,
  //     };
  //     history.push(userMsg);
  //     return this.callKimi(history);
  //   }
  // }

  // private async callKimi(history: KimiMessage[]): Promise<LlmResponse> {
  //   if (!this.apiKey) {
  //     return { type: 'message', content: '错误：未配置 Kimi API Key。请在设置中填写 API Key。' };
  //   }

  //   console.log('[KimiService] Calling API with model:', this.model, 'apiKey starts with:', this.apiKey.substring(0, 8) + '...');

  //   try {
  //     // 构建请求体
  //     const messages: KimiMessage[] = [
  //       {
  //         role: 'system',
  //         content: BROWSER_ASSISTANT_SYSTEM_PROMPT,
  //       },
  //       ...history,
  //     ];

  //     const requestBody: Record<string, unknown> = {
  //       model: this.model,
  //       messages,
  //       tools: getOpenAICompatibleTools(),
  //       temperature: 0.6,
  //       max_tokens: 4096,
  //     };

  //     const response = await fetch(KIMI_API_URL, {
  //       method: 'POST',
  //       headers: {
  //         'Content-Type': 'application/json',
  //         'Authorization': `Bearer ${this.apiKey}`,
  //       },
  //       body: JSON.stringify(requestBody),
  //     });

  //     const responseText = await response.text();
  //     if (!response.ok) {
  //       console.error('[KimiService] API error:', response.status, responseText);
  //       return { type: 'message', content: `Kimi API 调用失败: ${response.status} - ${responseText}` };
  //     }

  //     const kimiResponse = JSON.parse(responseText);
  //     const choices = kimiResponse.choices;

  //     if (!choices || choices.length === 0) {
  //       return { type: 'message', content: 'Kimi 没有返回有效响应' };
  //     }

  //     const firstChoice = choices[0];
  //     const message = firstChoice.message;

  //     // 将 assistant 回复添加到历史
  //     const assistantMsg: KimiMessage = {
  //       role: 'assistant',
  //     };
  //     if (message.content) {
  //       assistantMsg.content = message.content;
  //     }
  //     if (message.tool_calls) {
  //       assistantMsg.tool_calls = message.tool_calls;
  //     }
  //     history.push(assistantMsg);

  //     // 检查是否有 tool_calls
  //     const toolCalls = message.tool_calls;
  //     if (toolCalls && toolCalls.length > 0) {
  //       const toolCall = toolCalls[0];
  //       const func = toolCall.function;
  //       const funcName = func.name;
  //       const argsStr = func.arguments;

  //       let toolInput: Record<string, unknown> = {};
  //       if (argsStr) {
  //         try {
  //           toolInput = JSON.parse(argsStr);
  //         } catch (e) {
  //           console.warn('[KimiService] Failed to parse tool arguments:', argsStr);
  //         }
  //       }

  //       // 使用 Kimi 返回的 tool_call_id
  //       const toolUseId = `${funcName}::${toolCall.id || this.generateUuid()}`;

  //       return {
  //         type: 'tool_use',
  //         toolUse: {
  //           id: toolUseId,
  //           name: funcName,
  //           input: toolInput,
  //         },
  //       };
  //     }

  //     // 普通文本回复
  //     const content = message.content;
  //     if (!content) {
  //       return { type: 'message', content: '（无回复内容）' };
  //     }
  //     return { type: 'message', content: content as string };
  //   } catch (e) {
  //     console.error('[KimiService] API call failed:', e);
  //     return { type: 'message', content: `Kimi API 调用异常: ${e instanceof Error ? e.message : String(e)}` };
  //   }
  // }

  // clearConversation(conversationId: string): void {
  //   this.conversationHistory.delete(conversationId);
  // }

  // private generateUuid(): string {
  //   return Math.random().toString(36).substring(2, 10);
  // }
}
