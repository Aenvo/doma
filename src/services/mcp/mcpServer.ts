/**
 * MCP 浏览器工具服务 - 使用官方 SDK 高层 API：`McpServer`
 * （SDK 中无名为 McpService 的类；`Server` 为底层协议类，已 deprecate 推荐用 McpServer）
 *
 * 通过 registerTool 注册工具，由 SDK 统一处理 list/call 与入参校验。
 */

import { getMcpTools } from "../chat/llm/toolsDefinition";
import { runBrowserTool } from "../chat/browserTools";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export interface ToolResult {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
  >;
}

// 工具执行器接口
export interface ToolExecutor {
  execute(name: string, args: Record<string, unknown>): Promise<unknown>;
}

/**
 * 创建由 SDK `McpServer` 管理的浏览器工具实例（底层仍持有 `server: Server` 供高级用法）
 */
export function createMcpServer(transport: Transport): Server {
  const server = new Server(
    {
      name: "doma-browser-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  //处理列出工具请求
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    console.log("list tools request==================");
    return { tools: getMcpTools() };
  });

  // 处理调用工具请求
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    console.log("call tool request==================", request);
    const { name, arguments: args } = request.params;
    
    try {
      const result = await runBrowserTool(name, args as Record<string, unknown>);
      return {
        content: [
          {
            type: "text",
            text: typeof result === 'string' ? result : `__JSON__${JSON.stringify(result)}`,

          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  server.connect(transport);

  return server;
}
