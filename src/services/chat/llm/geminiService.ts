/**
 * Gemini API 服务实现
 */

import { BROWSER_ASSISTANT_SYSTEM_PROMPT, type LlmResponse } from './llmTypes';
import { LlmService } from './llmService';
import { getGeminiTools } from './toolsDefinition';
import type { LlmSendMessageOptions } from './index';
import { 
  compressToolResult, 
  trimMessages, 
  estimateMessagesTokens,
  CONTEXT_LIMITS,
  stripOldScreenshotsGemini,
} from './contextManager';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

interface GeminiMessage {
  role: 'user' | 'model';
  parts: Array<Record<string, unknown>>;
}

export class GeminiService extends LlmService {
  // private apiKey: string;
  // private model: string;
  // private conversationHistory: Map<string, GeminiMessage[]> = new Map();

  // constructor(apiKey: string, model: string = 'gemini-2.0-flash') {
  //   this.apiKey = apiKey;
  //   this.model = model;
  // }

  // getName(): string {
  //   return 'Gemini';
  // }

  // setConfig(apiKey: string, model: string) {
  //   this.apiKey = apiKey;
  //   this.model = model;
  // }


  // async sendUserMessage(conversationId: string, userMessage: string): Promise<LlmResponse> {
  //   let history = this.conversationHistory.get(conversationId);
  //   if (!history) {
  //     history = [];
  //     this.conversationHistory.set(conversationId, history);
  //   }

  //   // 清理未完成的 function call（用户中断后可能残留）
  //   this.cleanupIncompleteFunctionCall(history);

  //   // 添加用户消息
  //   const userMsg: GeminiMessage = {
  //     role: 'user',
  //     parts: [{ text: userMessage }],
  //   };
  //   history.push(userMsg);

  //   // 上下文管理：裁剪超长历史
  //   history = this.manageContext(history);
  //   this.conversationHistory.set(conversationId, history);

  //   const skills = await SkillManager.getRelevantSkills(userMessage, 2);
  //   return this.callGemini(conversationId, history, skills);
  // }

  // /**
  //  * 管理上下文：裁剪超长历史
  //  */
  // private manageContext(history: GeminiMessage[]): GeminiMessage[] {
  //   // 裁剪超长历史
  //   let managed = trimMessages(history, CONTEXT_LIMITS.MAX_MESSAGES);
    
  //   // 检查 token 数量
  //   const tokens = estimateMessagesTokens(managed);
  //   if (tokens > CONTEXT_LIMITS.SUMMARY_THRESHOLD) {
  //     console.warn(`[GeminiService] Context too large: ~${tokens} tokens. Consider starting new conversation.`);
  //   }
    
  //   return managed;
  // }

  // /**
  //  * 清理未完成的 function call
  //  * 当用户中断任务时，可能会有 model 消息包含 functionCall 但没有对应的 functionResponse
  //  * Gemini API 要求每个 functionCall 都必须有响应
  //  */
  // private cleanupIncompleteFunctionCall(history: GeminiMessage[]): void {
  //   if (history.length === 0) return;

  //   // 检查最后一个消息
  //   const lastMsg = history[history.length - 1];
    
  //   // 如果最后一个消息是 model 消息，检查是否包含 functionCall
  //   if (lastMsg.role === 'model' && Array.isArray(lastMsg.parts)) {
  //     const hasFunctionCall = lastMsg.parts.some(
  //       (part) => 'functionCall' in part
  //     );
      
  //     if (hasFunctionCall) {
  //       // 移除这个未完成的 model 消息
  //       console.log('[GeminiService] Removing incomplete functionCall from history');
  //       history.pop();
        
  //       // 递归检查，可能有多个连续的未完成消息
  //       this.cleanupIncompleteFunctionCall(history);
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
  //   stripOldScreenshotsGemini(history);

  //   const funcName = toolUseId.split('::')[0]; // toolUseId 格式: "funcName::uuid"

  //   // 检查是否为截图结果（包含 base64 图片）
  //   if (toolResult && typeof toolResult === 'object' && 'base64' in toolResult && 'mimeType' in toolResult) {
  //     const resultMap = toolResult as { base64: string; mimeType: string };
      
  //     // 1. 先添加 function response
  //     const funcResponseMsg: GeminiMessage = {
  //       role: 'user',
  //       parts: [{
  //         functionResponse: {
  //           name: funcName,
  //           response: { result: '截图已获取，请分析图片内容' },
  //         },
  //       }],
  //     };
  //     history.push(funcResponseMsg);

  //     // 2. 添加带图片的用户消息让 Gemini 分析
  //     const resultFull = toolResult as { base64: string; mimeType: string; elements?: unknown[]; hint?: string };
  //     let screenshotText = '这是当前页面的截图，请分析页面内容、布局和可交互元素，帮助我理解和操作这个页面。';
  //     if (resultFull.elements && resultFull.elements.length > 0) {
  //       screenshotText = `这是当前页面的截图，其中可交互元素已用编号标注。\n\n元素映射表：\n${JSON.stringify(resultFull.elements)}\n\n使用 browser_click({ index: N }) 或 browser_type({ index: N, text: "..." }) 直接操作对应编号的元素。`;
  //     }
  //     const imageMsg: GeminiMessage = {
  //       role: 'user',
  //       parts: [
  //         {
  //           inlineData: {
  //             mimeType: resultMap.mimeType,
  //             data: resultMap.base64,
  //           },
  //         },
  //         {
  //           text: screenshotText,
  //         },
  //       ],
  //     };
  //     history.push(imageMsg);

  //     console.log(`[GeminiService] Sending screenshot for analysis (${resultFull.elements?.length ?? 0} labeled elements)`);
  //     return this.callGemini(conversationId, history);
  //   }

  //   // 普通工具结果 - 压缩过长的结果
  //   const compressedResult = compressToolResult(toolResult, CONTEXT_LIMITS.MAX_TOOL_RESULT_LENGTH);
    
  //   // 记录压缩情况
  //   const originalSize = JSON.stringify(toolResult).length;
  //   if (compressedResult.length < originalSize) {
  //     console.log(`[GeminiService] Compressed tool result: ${originalSize} -> ${compressedResult.length} chars`);
  //   }

  //   const funcResponseMsg: GeminiMessage = {
  //     role: 'user',
  //     parts: [{
  //       functionResponse: {
  //         name: funcName,
  //         response: { result: compressedResult },
  //       },
  //     }],
  //   };
  //   history.push(funcResponseMsg);

  //   return this.callGemini(conversationId, history);
  // }

  // private async callGemini(
  //   conversationId: string,
  //   history: GeminiMessage[],
  //   skills: Awaited<ReturnType<typeof SkillManager.getRelevantSkills>> = []
  // ): Promise<LlmResponse> {
  //   if (!this.apiKey) {
  //     return { type: 'message', content: '错误：未配置 Gemini API Key。请在设置中填写 API Key。' };
  //   }

  //   try {
  //     const requestBody = {
  //       systemInstruction: {
  //         parts: [{
  //           text: BROWSER_ASSISTANT_SYSTEM_PROMPT,
  //         }],
  //       },
  //       contents: history,
  //       tools: [
  //         ...getGeminiTools(),
  //         ...SkillManager.buildGeminiTools(skills),
  //       ],
  //       generationConfig: {
  //         maxOutputTokens: 4096,
  //         temperature: 0.7,
  //       },
  //     };

  //     const url = `${GEMINI_API_BASE}${this.model}:generateContent?key=${this.apiKey}`;

  //     const response = await fetch(url, {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify(requestBody),
  //     });

  //     const responseText = await response.text();
  //     if (!response.ok) {
  //       console.error('[GeminiService] API error:', response.status, responseText);
  //       return { type: 'message', content: `Gemini API 调用失败: ${response.status} - ${responseText}` };
  //     }

  //     const geminiResponse = JSON.parse(responseText);
  //     const candidates = geminiResponse.candidates;

  //     if (!candidates || candidates.length === 0) {
  //       return { type: 'message', content: 'Gemini 没有返回有效响应' };
  //     }

  //     const firstCandidate = candidates[0];
  //     const content = firstCandidate.content;
  //     const parts = content.parts;

  //     // 将 assistant 回复添加到历史
  //     const assistantMsg: GeminiMessage = {
  //       role: 'model',
  //       parts: parts,
  //     };
  //     history.push(assistantMsg);

  //     // 检查是否有 function call
  //     for (const part of parts) {
  //       if (part.functionCall) {
  //         const funcCall = part.functionCall;
  //         const funcName = funcCall.name;
  //         const args = funcCall.args || {};

  //         // 生成 toolUseId，格式为 "funcName::uuid"
  //         const toolUseId = `${funcName}::${this.generateUuid()}`;

  //         return {
  //           type: 'tool_use',
  //           toolUse: {
  //             id: toolUseId,
  //             name: funcName,
  //             input: args,
  //           },
  //         };
  //       }
  //     }

  //     // 普通文本回复
  //     let textContent = '';
  //     for (const part of parts) {
  //       if (part.text) {
  //         textContent += part.text;
  //       }
  //     }
  //     return { type: 'message', content: textContent };
  //   } catch (e) {
  //     console.error('[GeminiService] API call failed:', e);
  //     return { type: 'message', content: `Gemini API 调用异常: ${e instanceof Error ? e.message : String(e)}` };
  //   }
  // }

  // clearConversation(conversationId: string): void {
  //   this.conversationHistory.delete(conversationId);
  // }

  // private generateUuid(): string {
  //   return Math.random().toString(36).substring(2, 10);
  // }
}
