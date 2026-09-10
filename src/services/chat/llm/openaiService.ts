/**
 * OpenAI API 服务实现
 * 支持 OpenAI 官方 API 及任何 OpenAI 兼容接口（如 Azure OpenAI、各类代理）
 */

import { BROWSER_ASSISTANT_SYSTEM_PROMPT, type LlmResponse } from './llmTypes';
import { LlmService } from './llmService';
import { getOpenAICompatibleTools } from './toolsDefinition'; // OpenAI 兼容 function calling 格式
import { 
  compressToolResult, 
  trimMessages, 
  estimateMessagesTokens,
  CONTEXT_LIMITS,
  stripOldScreenshots,
} from './contextManager';

const DEFAULT_OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | unknown[];
  name?: string;
  tool_calls?: unknown[];
  tool_call_id?: string;
}

export class OpenAIService extends LlmService {
  // private apiKey: string;
  // private model: string;
  // private baseUrl: string;
  // private conversationHistory: Map<string, OpenAIMessage[]> = new Map();

  // constructor(apiKey: string, model: string = 'gpt-4o', baseUrl?: string) {
  //   this.apiKey = apiKey;
  //   this.model = model;
  //   this.baseUrl = baseUrl || DEFAULT_OPENAI_API_URL;
  // }

  // getName(): string {
  //   return 'OpenAI';
  // }

  // setConfig(apiKey: string, model: string, baseUrl?: string) {
  //   this.apiKey = apiKey?.trim() || '';
  //   this.model = model;
  //   if (baseUrl) {
  //     this.baseUrl = baseUrl.replace(/\/+$/, '');
  //     if (!this.baseUrl.endsWith('/v1/chat/completions')) {
  //       // 允许直接传 /v1/chat/completions 或 /v1 或裸地址
  //       if (this.baseUrl.endsWith('/v1')) {
  //         this.baseUrl += '/chat/completions';
  //       } else {
  //         this.baseUrl += '/v1/chat/completions';
  //       }
  //     }
  //   } else {
  //     this.baseUrl = DEFAULT_OPENAI_API_URL;
  //   }
  // }

  // getBaseUrl(): string {
  //   return this.baseUrl;
  // }

  // async sendUserMessage(conversationId: string, userMessage: string): Promise<LlmResponse> {
  //   let history = this.conversationHistory.get(conversationId);
  //   if (!history) {
  //     history = [];
  //     this.conversationHistory.set(conversationId, history);
  //   }

  //   this.cleanupIncompleteToolCalls(history);

  //   const userMsg: OpenAIMessage = {
  //     role: 'user',
  //     content: userMessage,
  //   };
  //   history.push(userMsg);

  //   history = this.manageContext(history);
  //   this.conversationHistory.set(conversationId, history);

  //   const skills = await SkillManager.getRelevantSkills(userMessage, 2);
  //   return this.callAPI(conversationId, history, skills);
  // }

  // private manageContext(history: OpenAIMessage[]): OpenAIMessage[] {
  //   let managed = trimMessages(history, CONTEXT_LIMITS.MAX_MESSAGES);
    
  //   const tokens = estimateMessagesTokens(managed);
  //   if (tokens > CONTEXT_LIMITS.SUMMARY_THRESHOLD) {
  //     console.warn(`[OpenAIService] Context too large: ~${tokens} tokens.`);
  //   }
    
  //   return managed;
  // }

  // private cleanupIncompleteToolCalls(history: OpenAIMessage[]): void {
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
  //       console.log('[OpenAIService] Removing incomplete tool_calls from history');
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

  //   // LLM 已看过旧截图，清除图片数据节省 token
  //   stripOldScreenshots(history);

  //   const funcName = toolUseId.split('::')[0];
  //   const callId = toolUseId.split('::')[1] || toolUseId;

  //   // 截图结果
  //   if (toolResult && typeof toolResult === 'object' && 'base64' in toolResult && 'mimeType' in toolResult) {
  //     const resultMap = toolResult as { base64: string; mimeType: string; elements?: unknown[]; hint?: string };
      
  //     const toolResultMsg: OpenAIMessage = {
  //       role: 'tool',
  //       tool_call_id: callId,
  //       content: '截图已获取，正在分析...',
  //     };
  //     history.push(toolResultMsg);

  //     let screenshotText = '请分析这个网页截图，描述你看到的主要内容、页面布局和可交互的元素。结合之前的任务目标给出操作建议。';
  //     if (resultMap.elements && resultMap.elements.length > 0) {
  //       screenshotText = `这是当前页面的截图，其中可交互元素已用编号标注。\n\n元素映射表：\n${JSON.stringify(resultMap.elements)}\n\n使用 browser_click({ index: N }) 或 browser_type({ index: N, text: "..." }) 直接操作对应编号的元素。`;
  //     }

  //     const imageMsg: OpenAIMessage = {
  //       role: 'user',
  //       content: [
  //         {
  //           type: 'image_url',
  //           image_url: { url: `data:${resultMap.mimeType};base64,${resultMap.base64}` },
  //         },
  //         {
  //           type: 'text',
  //           text: screenshotText,
  //         },
  //       ],
  //     };
  //     history.push(imageMsg);

  //     return this.callAPI(conversationId, history);
  //   }

  //   // 普通工具结果
  //   const compressedResult = compressToolResult(toolResult, CONTEXT_LIMITS.MAX_TOOL_RESULT_LENGTH);
    
  //   const originalSize = JSON.stringify(toolResult).length;
  //   if (compressedResult.length < originalSize) {
  //     console.log(`[OpenAIService] Compressed tool result: ${originalSize} -> ${compressedResult.length} chars`);
  //   }

  //   const toolResultMsg: OpenAIMessage = {
  //     role: 'tool',
  //     name: funcName,
  //     tool_call_id: callId,
  //     content: compressedResult,
  //   };
  //   history.push(toolResultMsg);

  //   return this.callAPI(conversationId, history);
  // }

  // private async callAPI(
  //   _conversationId: string,
  //   history: OpenAIMessage[],
  //   skills: Awaited<ReturnType<typeof SkillManager.getRelevantSkills>> = []
  // ): Promise<LlmResponse> {
  //   if (!this.apiKey) {
  //     return { type: 'message', content: '错误：未配置 OpenAI API Key。请在设置中填写 API Key。' };
  //   }

  //   try {
  //     const messages: OpenAIMessage[] = [
  //       {
  //         role: 'system',
  //         content: BROWSER_ASSISTANT_SYSTEM_PROMPT,
  //       },
  //       ...history,
  //     ];

  //     const requestBody = {
  //       model: this.model,
  //       messages,
  //       tools: [
  //         ...getOpenAICompatibleTools(),
  //         ...SkillManager.buildOpenAITools(skills),
  //       ],
  //       max_tokens: 4096,
  //     };

  //     const response = await fetch(this.baseUrl, {
  //       method: 'POST',
  //       headers: {
  //         'Content-Type': 'application/json',
  //         'Authorization': `Bearer ${this.apiKey}`,
  //       },
  //       body: JSON.stringify(requestBody),
  //     });

  //     const responseText = await response.text();
  //     if (!response.ok) {
  //       console.error('[OpenAIService] API error:', response.status, responseText);
  //       return { type: 'message', content: `OpenAI API 调用失败: ${response.status} - ${responseText}` };
  //     }

  //     const apiResponse = JSON.parse(responseText);
  //     const choices = apiResponse.choices;

  //     if (!choices || choices.length === 0) {
  //       return { type: 'message', content: 'OpenAI 没有返回有效响应' };
  //     }

  //     const firstChoice = choices[0];
  //     const message = firstChoice.message;

  //     // 将 assistant 回复添加到历史
  //     const assistantMsg: OpenAIMessage = {
  //       role: 'assistant',
  //     };
  //     if (message.content) {
  //       assistantMsg.content = message.content;
  //     }
  //     if (message.tool_calls) {
  //       assistantMsg.tool_calls = message.tool_calls;
  //     }
  //     history.push(assistantMsg);

  //     // 检查 tool_calls
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
  //           console.warn('[OpenAIService] Failed to parse tool arguments:', argsStr);
  //         }
  //       }

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
  //     console.error('[OpenAIService] API call failed:', e);
  //     return { type: 'message', content: `OpenAI API 调用异常: ${e instanceof Error ? e.message : String(e)}` };
  //   }
  // }

  // clearConversation(conversationId: string): void {
  //   this.conversationHistory.delete(conversationId);
  // }

  // private generateUuid(): string {
  //   return Math.random().toString(36).substring(2, 10);
  // }
}
