import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { type Tool } from "@modelcontextprotocol/sdk/types.js";
export class McpClient extends Client {
    private llmTools: any[] | undefined = undefined
 
    async getLlmTools(){
     if (this.llmTools) return this.llmTools;
     this.llmTools = (await this.listTools()).tools.map(tool => ({
         type: "function",
         function: {
             name: tool.name,
             description: tool.description,
             parameters: tool.inputSchema
         }
       }));
     return this.llmTools;
    }

    /** 工具定义变更后可调用，下次 getLlmTools 会重新 listTools */
    invalidateLlmToolsCache(): void {
      this.llmTools = undefined;
    }
 }
 
 export async function createMCPClient(transport: Transport) {

     const client = new McpClient({
       name: "doma-client",
       version: "1.0.0",
     });

   
     await client.connect(transport);
     return client;
 }