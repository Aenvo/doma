/**
 * MCP 服务入口
 *
 * 浏览器工具由 SDK 的 McpServer（高层 API）统一注册与管理；直接执行仍走 browserTools。
 */

// import { createMcpServer, getMcpTools, type ToolExecutor } from './mcpServer';
// import { httpTransportManager, sseConnectionManager } from './httpTransport';
// import { runBrowserTool } from '../chat/browserTools';

// // 工具执行器适配器
// const browserToolExecutor: ToolExecutor = {
//   async execute(name: string, args: Record<string, unknown>): Promise<unknown> {
//     return runBrowserTool(name, args);
//   }
// };

// // MCP Server 实例
// let mcpServer: ReturnType<typeof createMcpServer> | null = null;

// /**
//  * 初始化 MCP Server
//  */
// export function initMcpServer() {
//   if (mcpServer) {
//     return mcpServer;
//   }
  
//   // mcpServer = createMcpServer(browserToolExecutor);
//   // console.log('[MCP] Server initialized');
  
//   return mcpServer;
// }

// /**
//  * 获取 MCP Server 实例
//  */
// export function getMcpServer() {
//   if (!mcpServer) {
//     return initMcpServer();
//   }
//   return mcpServer;
// }

// /**
//  * 获取工具列表（MCP 格式）
//  */
// export function getTools() {
//   return getMcpTools();
// }

// /**
//  * 执行工具（直接调用方式）
//  */
// export async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
//   return browserToolExecutor.execute(name, args);
// }

// // 导出传输管理器
// export { httpTransportManager, sseConnectionManager };

// // 导出类型
// export type { ToolExecutor };
