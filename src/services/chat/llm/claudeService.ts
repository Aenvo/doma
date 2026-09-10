/**
 * Claude API 服务实现
 */

import { BROWSER_ASSISTANT_SYSTEM_PROMPT, type LlmResponse } from './llmTypes';
import { LlmService } from './llmService';
import { getClaudeTools } from './toolsDefinition';
import type { LlmSendMessageOptions } from './index';
import { 
  compressToolResult, 
  compressHistoryToolResults, 
  trimMessages, 
  estimateMessagesTokens,
  CONTEXT_LIMITS,
  stripOldScreenshotsClaude,
} from './contextManager';

const DEFAULT_CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: unknown;
}

export class ClaudeService extends LlmService {
  // private apiKey: string;
  // private model: string;
  // private baseUrl: string;
  // private conversationHistory: Map<string, ClaudeMessage[]> = new Map();

  // constructor(apiKey: string, model: string = 'claude-sonnet-4-20250514', baseUrl?: string) {
  //   this.apiKey = apiKey;
  //   this.model = model;
  //   this.baseUrl = baseUrl || DEFAULT_CLAUDE_API_URL;
  // }

  // getName(): string {
  //   return 'Claude';
  // }

  // setConfig(apiKey: string, model: string, baseUrl?: string) {
  //   this.apiKey = apiKey;
  //   this.model = model;
  //   if (baseUrl) {
  //     // 确保 URL 格式正确（移除尾部斜杠，添加路径）
  //     this.baseUrl = baseUrl.replace(/\/+$/, '');
  //     if (!this.baseUrl.endsWith('/v1/messages')) {
  //       this.baseUrl = this.baseUrl + '/v1/messages';
  //     }
  //   } else {
  //     this.baseUrl = DEFAULT_CLAUDE_API_URL;
  //   }
  // }

  // getBaseUrl(): string {
  //   return this.baseUrl;
  // }

  // async sendMessage(conversationId: string, userMessage: string, options: LlmSendMessageOptions) {
    
  // }

  // async sendUserMessage(conversationId: string, userMessage: string): Promise<LlmResponse> {
  //   let history = this.conversationHistory.get(conversationId);
  //   if (!history) {
  //     history = [];
  //     this.conversationHistory.set(conversationId, history);
  //   }

  //   // 清理未完成的 tool_use（用户中断后可能残留）
  //   this.cleanupIncompleteToolUse(history);

  //   // 添加用户消息
  //   const userMsg: ClaudeMessage = {
  //     role: 'user',
  //     content: [{ type: 'text', text: userMessage }],
  //   };
  //   history.push(userMsg);

  //   // 上下文管理：压缩和裁剪
  //   history = this.manageContext(history);
  //   this.conversationHistory.set(conversationId, history);

  //   const skills = await SkillManager.getRelevantSkills(userMessage, 2);
  //   return this.callClaude(conversationId, history, skills);
  // }

  // /**
  //  * 管理上下文：压缩旧的工具结果，裁剪超长历史
  //  */
  // private manageContext(history: ClaudeMessage[]): ClaudeMessage[] {
  //   // 1. 压缩旧的工具结果
  //   let managed = compressHistoryToolResults(history, 8);
    
  //   // 2. 裁剪超长历史
  //   managed = trimMessages(managed, CONTEXT_LIMITS.MAX_MESSAGES);
    
  //   // 3. 验证 tool_use/tool_result 配对完整性
  //   managed = this.validateToolPairs(managed);
    
  //   // 4. 检查 token 数量
  //   const tokens = estimateMessagesTokens(managed);
  //   if (tokens > CONTEXT_LIMITS.SUMMARY_THRESHOLD) {
  //     console.warn(`[ClaudeService] Context too large: ~${tokens} tokens. Consider starting new conversation.`);
  //   }
    
  //   return managed;
  // }

  // /**
  //  * 验证并修复 tool_use/tool_result 配对
  //  * 确保每个 tool_result 都有对应的 tool_use
  //  */
  // private validateToolPairs(history: ClaudeMessage[]): ClaudeMessage[] {
  //   if (history.length === 0) return history;
    
  //   // 第一遍：收集所有 tool_use id 和 tool_result id
  //   const toolUseIds = new Set<string>();
  //   const toolResultIds = new Set<string>();
  //   for (const msg of history) {
  //     if (!Array.isArray(msg.content)) continue;
  //     for (const block of msg.content) {
  //       if (typeof block !== 'object' || block === null) continue;
  //       const b = block as Record<string, unknown>;
  //       if (b.type === 'tool_use' && b.id) toolUseIds.add(b.id as string);
  //       if (b.type === 'tool_result' && b.tool_use_id) toolResultIds.add(b.tool_use_id as string);
  //     }
  //   }
    
  //   // 第二遍：过滤掉孤立的 tool_result 和孤立的 tool_use
  //   const validated: ClaudeMessage[] = [];
  //   for (const msg of history) {
  //     if (!Array.isArray(msg.content)) {
  //       validated.push(msg);
  //       continue;
  //     }
      
  //     const filteredContent = msg.content.filter((block: unknown) => {
  //       if (typeof block !== 'object' || block === null) return true;
  //       const b = block as Record<string, unknown>;
        
  //       // 孤立的 tool_result：对应的 tool_use 不在历史中
  //       if (b.type === 'tool_result' && b.tool_use_id) {
  //         const hasMatch = toolUseIds.has(b.tool_use_id as string);
  //         if (!hasMatch) console.log(`[ClaudeService] Removing orphan tool_result: ${b.tool_use_id}`);
  //         return hasMatch;
  //       }
        
  //       // 孤立的 tool_use：对应的 tool_result 不在历史中
  //       if (b.type === 'tool_use' && b.id) {
  //         const hasResult = toolResultIds.has(b.id as string);
  //         if (!hasResult) console.log(`[ClaudeService] Removing orphan tool_use: ${b.id}`);
  //         return hasResult;
  //       }
        
  //       return true;
  //     });
      
  //     if (filteredContent.length > 0) {
  //       validated.push({ ...msg, content: filteredContent });
  //     }
  //   }
    
  //   return validated;
  // }

  // /**
  //  * 清理未完成的 tool_use
  //  * 当用户中断任务时，可能会有 assistant 消息包含 tool_use 但没有对应的 tool_result
  //  * Claude API 要求每个 tool_use 都必须有响应
  //  */
  // private cleanupIncompleteToolUse(history: ClaudeMessage[]): void {
  //   if (history.length === 0) return;

  //   // 检查最后一个消息
  //   const lastMsg = history[history.length - 1];
    
  //   // 如果最后一个消息是 assistant 消息，检查是否包含 tool_use
  //   if (lastMsg.role === 'assistant' && Array.isArray(lastMsg.content)) {
  //     const hasToolUse = lastMsg.content.some(
  //       (block: unknown) => typeof block === 'object' && block !== null && (block as Record<string, unknown>).type === 'tool_use'
  //     );
      
  //     if (hasToolUse) {
  //       // 移除这个未完成的 assistant 消息
  //       console.log('[ClaudeService] Removing incomplete tool_use from history');
  //       history.pop();
        
  //       // 递归检查，可能有多个连续的未完成消息
  //       this.cleanupIncompleteToolUse(history);
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
  //   stripOldScreenshotsClaude(history);

  //   const toolResultMsg: ClaudeMessage = {
  //     role: 'user',
  //     content: [] as unknown[],
  //   };

  //   const resultBlock: Record<string, unknown> = {
  //     type: 'tool_result',
  //     tool_use_id: toolUseId,
  //   };

  //   // 检查是否为截图结果（包含 base64 图片）
  //   if (toolResult && typeof toolResult === 'object' && 'base64' in toolResult && 'mimeType' in toolResult) {
  //     const resultMap = toolResult as { base64: string; mimeType: string; elements?: unknown[]; hint?: string };
      
  //     // 构建 SoM 元素映射描述（如果有标注）
  //     let screenshotText = '这是当前页面的截图。';
  //     if (resultMap.elements && resultMap.elements.length > 0) {
  //       screenshotText = `这是当前页面的截图，其中可交互元素已用编号标注。\n\n元素映射表：\n${JSON.stringify(resultMap.elements)}\n\n使用 browser_click({ index: N }) 或 browser_type({ index: N, text: "..." }) 直接操作对应编号的元素。`;
  //     }

  //     const toolResultContent = [
  //       {
  //         type: 'image',
  //         source: {
  //           type: 'base64',
  //           media_type: resultMap.mimeType,
  //           data: resultMap.base64,
  //         },
  //       },
  //       {
  //         type: 'text',
  //         text: screenshotText,
  //       },
  //     ];
  //     resultBlock.content = toolResultContent;
  //     console.log(`[ClaudeService] Sending screenshot for analysis (${resultMap.elements?.length ?? 0} labeled elements)`);
  //   } else {
  //     // 普通工具结果 - 压缩过长的结果
  //     const compressedResult = compressToolResult(toolResult, CONTEXT_LIMITS.MAX_TOOL_RESULT_LENGTH);
  //     resultBlock.content = compressedResult;
      
  //     // 记录压缩情况
  //     const originalSize = JSON.stringify(toolResult).length;
  //     if (compressedResult.length < originalSize) {
  //       console.log(`[ClaudeService] Compressed tool result: ${originalSize} -> ${compressedResult.length} chars`);
  //     }
  //   }

  //   (toolResultMsg.content as unknown[]).push(resultBlock);
  //   history.push(toolResultMsg);

  //   return this.callClaude(conversationId, history);
  // }

  // private async callClaude(
  //   conversationId: string,
  //   history: ClaudeMessage[],
  //   skills: Awaited<ReturnType<typeof SkillManager.getRelevantSkills>> = []
  // ): Promise<LlmResponse> {
  //   if (!this.apiKey) {
  //     return { type: 'message', content: '错误：未配置 Claude API Key。请在设置中填写 API Key。' };
  //   }

  //   try {
  //     const requestBody = {
  //       model: this.model,
  //       max_tokens: 4096,
  //       system: BROWSER_ASSISTANT_SYSTEM_PROMPT,
  //       messages: history,
  //       tools: [
  //         ...getClaudeTools(),
  //         ...SkillManager.buildClaudeTools(skills),
  //       ],
  //     };

  //     const response = await fetch(this.baseUrl, {
  //       method: 'POST',
  //       headers: {
  //         'Content-Type': 'application/json',
  //         'x-api-key': this.apiKey,
  //         'anthropic-version': ANTHROPIC_VERSION,
  //         'anthropic-dangerous-direct-browser-access': 'true',
  //       },
  //       body: JSON.stringify(requestBody),
  //     });

  //     const responseText = await response.text();
  //     if (!response.ok) {
  //       console.error('[ClaudeService] API error:', response.status, responseText);
  //       return { type: 'message', content: `Claude API 调用失败: ${response.status}` };
  //     }

  //     const claudeResponse = JSON.parse(responseText);
  //     const contentArray = claudeResponse.content;

  //     // 检查是否有 tool_use
  //     const stopReason = claudeResponse.stop_reason;
  //     if (stopReason === 'tool_use') {
  //       // 找到第一个 tool_use block
  //       const firstToolUse = contentArray.find((b: any) => b.type === 'tool_use');
  //       if (firstToolUse) {
  //         // 只保留第一个 tool_use，移除其余的，避免缺少 tool_result 的配对错误
  //         const cleanedContent = contentArray.filter((b: any) =>
  //           b.type !== 'tool_use' || b.id === firstToolUse.id
  //         );
          
  //         const assistantMsg: ClaudeMessage = {
  //           role: 'assistant',
  //           content: cleanedContent,
  //         };
  //         history.push(assistantMsg);
          
  //         return {
  //           type: 'tool_use',
  //           toolUse: {
  //             id: firstToolUse.id,
  //             name: firstToolUse.name,
  //             input: firstToolUse.input || {},
  //           },
  //         };
  //       }
  //     }
      
  //     // 非 tool_use 响应，完整保存
  //     const assistantMsg: ClaudeMessage = {
  //       role: 'assistant',
  //       content: contentArray,
  //     };
  //     history.push(assistantMsg);

  //     // 普通文本回复
  //     let textContent = '';
  //     for (const block of contentArray) {
  //       if (block.type === 'text') {
  //         textContent += block.text;
  //       }
  //     }
  //     return { type: 'message', content: textContent };
  //   } catch (e) {
  //     console.error('[ClaudeService] API call failed:', e);
  //     return { type: 'message', content: `Claude API 调用异常: ${e instanceof Error ? e.message : String(e)}` };
  //   }
  // }

  // clearConversation(conversationId: string): void {
  //   this.conversationHistory.delete(conversationId);
  // }
}
