/**
 * MCP HTTP 传输层实现
 * 
 * 功能：
 * - SSE 断线恢复（EventStore + Last-Event-ID）
 * - JSON-RPC 批量消息
 * - Task 消息队列
 */

import type { JSONRPCMessage, JSONRPCRequest, JSONRPCResponse } from "@modelcontextprotocol/sdk/types.js";

// 事件存储（用于 SSE 断线恢复）
interface StoredEvent {
  id: string;
  data: string;
  timestamp: number;
}

// 消息队列项
interface QueuedMessage {
  id: string;
  message: JSONRPCMessage;
  timestamp: number;
  retries: number;
}

/**
 * HTTP 传输管理器
 */
export class HttpTransportManager {
  private eventStore: Map<string, StoredEvent> = new Map();
  private messageQueue: Map<string, QueuedMessage> = new Map();
  private eventCounter = 0;
  private maxEventStoreSize = 1000;
  private maxRetries = 3;
  private eventStoreMaxAge = 5 * 60 * 1000; // 5 分钟

  /**
   * 存储事件（用于 SSE 断线恢复）
   */
  storeEvent(data: string): string {
    const id = `evt-${++this.eventCounter}-${Date.now()}`;
    
    this.eventStore.set(id, {
      id,
      data,
      timestamp: Date.now(),
    });

    // 清理过旧的事件
    this.cleanupOldEvents();

    return id;
  }

  /**
   * 获取指定 ID 之后的所有事件（断线恢复）
   */
  getEventsSince(lastEventId: string | null): StoredEvent[] {
    if (!lastEventId) {
      return [];
    }

    const events: StoredEvent[] = [];
    let found = false;

    for (const [id, event] of this.eventStore) {
      if (found) {
        events.push(event);
      } else if (id === lastEventId) {
        found = true;
      }
    }

    return events;
  }

  /**
   * 清理过旧的事件
   */
  private cleanupOldEvents(): void {
    const now = Date.now();
    const idsToDelete: string[] = [];

    for (const [id, event] of this.eventStore) {
      if (now - event.timestamp > this.eventStoreMaxAge) {
        idsToDelete.push(id);
      }
    }

    for (const id of idsToDelete) {
      this.eventStore.delete(id);
    }

    // 如果还是太大，删除最旧的
    if (this.eventStore.size > this.maxEventStoreSize) {
      const toDelete = this.eventStore.size - this.maxEventStoreSize;
      let deleted = 0;
      for (const id of this.eventStore.keys()) {
        if (deleted >= toDelete) break;
        this.eventStore.delete(id);
        deleted++;
      }
    }
  }

  /**
   * 添加消息到队列
   */
  enqueueMessage(message: JSONRPCMessage): string {
    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    this.messageQueue.set(id, {
      id,
      message,
      timestamp: Date.now(),
      retries: 0,
    });

    return id;
  }

  /**
   * 获取待发送的消息
   */
  getPendingMessages(): QueuedMessage[] {
    return Array.from(this.messageQueue.values());
  }

  /**
   * 确认消息已送达
   */
  acknowledgeMessage(id: string): void {
    this.messageQueue.delete(id);
  }

  /**
   * 标记消息发送失败，增加重试计数
   */
  markMessageFailed(id: string): boolean {
    const msg = this.messageQueue.get(id);
    if (!msg) return false;

    msg.retries++;
    if (msg.retries >= this.maxRetries) {
      this.messageQueue.delete(id);
      console.error(`[HttpTransport] Message ${id} failed after ${this.maxRetries} retries`);
      return false;
    }

    return true;
  }

  /**
   * 处理批量请求
   */
  async processBatchRequest(
    requests: JSONRPCRequest[],
    handler: (req: JSONRPCRequest) => Promise<JSONRPCResponse>
  ): Promise<JSONRPCResponse[]> {
    // 并行处理所有请求
    const results = await Promise.all(
      requests.map(async (req) => {
        try {
          return await handler(req);
        } catch (error) {
          return {
            jsonrpc: "2.0" as const,
            id: req.id,
            error: {
              code: -32603,
              message: error instanceof Error ? error.message : String(error),
            },
          };
        }
      })
    );

    return results;
  }
}

/**
 * SSE 连接管理器
 */
export class SseConnectionManager {
  private connections: Map<string, {
    send: (data: string, eventId?: string) => void;
    lastEventId: string | null;
    createdAt: number;
  }> = new Map();

  private transportManager: HttpTransportManager;

  constructor(transportManager: HttpTransportManager) {
    this.transportManager = transportManager;
  }

  /**
   * 注册新的 SSE 连接
   */
  registerConnection(
    connectionId: string,
    sender: (data: string, eventId?: string) => void,
    lastEventId: string | null
  ): void {
    this.connections.set(connectionId, {
      send: sender,
      lastEventId,
      createdAt: Date.now(),
    });

    // 如果有 lastEventId，发送断线期间的事件
    if (lastEventId) {
      const missedEvents = this.transportManager.getEventsSince(lastEventId);
      console.log(`[SSE] Connection ${connectionId} reconnected, sending ${missedEvents.length} missed events`);
      
      for (const event of missedEvents) {
        sender(event.data, event.id);
      }
    }
  }

  /**
   * 移除 SSE 连接
   */
  removeConnection(connectionId: string): void {
    this.connections.delete(connectionId);
  }

  /**
   * 向所有连接广播消息
   */
  broadcast(data: string): void {
    const eventId = this.transportManager.storeEvent(data);
    
    for (const [id, conn] of this.connections) {
      try {
        conn.send(data, eventId);
      } catch (error) {
        console.error(`[SSE] Failed to send to connection ${id}:`, error);
        this.removeConnection(id);
      }
    }
  }

  /**
   * 向指定连接发送消息
   */
  sendTo(connectionId: string, data: string): boolean {
    const conn = this.connections.get(connectionId);
    if (!conn) return false;

    try {
      const eventId = this.transportManager.storeEvent(data);
      conn.send(data, eventId);
      return true;
    } catch (error) {
      console.error(`[SSE] Failed to send to connection ${connectionId}:`, error);
      this.removeConnection(connectionId);
      return false;
    }
  }

  /**
   * 获取活跃连接数
   */
  getActiveConnectionCount(): number {
    return this.connections.size;
  }
}

// 导出单例
export const httpTransportManager = new HttpTransportManager();
export const sseConnectionManager = new SseConnectionManager(httpTransportManager);
