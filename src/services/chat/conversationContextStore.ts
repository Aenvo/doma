import {
  deletePersistedConversationContext,
  persistConversationContext,
} from "./conversationContextPersistence";
import { getContext } from "../Context";
import { LOCAL_USER_ID } from "../localUserId";

export interface ConversationContext {
  conversationId: string;
  tabId?: number;
  groupId?: number;
  groupColor?: string;
  groupTitle?: string;
  groupWorkingTabId?: number;
  mode: "single" | "group";
  lastUserQuestion?: string;
  tabInfo?: { url?: string; icon?: string };
  createdAt: number;
  updatedAt: number;
  groupTabs?: number[];
  appendedGroupTabs?: number[];
  removedGroupTabs?: number[];
  userId?: string;
  relayToConversationId?: string;
  thinkId?: string;
  parentConversationId?: string;
  /** 由定时消息 fire 创建的会话 */
  scheduled?: boolean;
}

/** 沿 parentConversationId 自根到当前的派生链节点 */
export type ConversationCallChainLink = {
  conversationId: string;
  tabId?: number;
  /** 0 = 根任务会话，越大越深 */
  depth: number;
};

export class ConversationContextStore {
  private readonly conversationMap = new Map<string, ConversationContext>();

  private queuePersist(ctx: ConversationContext): void {
    void persistConversationContext(ctx).catch((e) => {
      console.error("[ConversationContextStore] persist failed", e);
    });
  }

  private queueDeletePersisted(conversationId: string): void {
    void deletePersistedConversationContext(conversationId).catch((e) => {
      console.error("[ConversationContextStore] persist delete failed", e);
    });
  }

  /**
   * 从 IndexedDB 恢复时整表替换内存索引（不触发回写磁盘）。
   */
  replaceConversationMapsFromPersisted(entries: ConversationContext[]): void {
    this.conversationMap.clear();
    for (const ctx of entries) {
      if (!ctx.conversationId) continue;
      if (!ctx.userId) continue;
      if (ctx.userId !== LOCAL_USER_ID) continue;
      this.conversationMap.set(ctx.conversationId, ctx);
    }
  }

  getConversationContext(conversationId: string): ConversationContext | undefined {
    return this.conversationMap.get(conversationId);
  }

  /**
   * 沿 parentConversationId 向上追溯，返回自根到当前的调用链（depth 0 = 根）。
   */
  getConversationCallChain(conversationId: string): ConversationCallChainLink[] {
    const reversed: ConversationCallChainLink[] = [];
    const visited = new Set<string>();
    let currentId = conversationId.trim();
    if (!currentId) return [];

    while (currentId) {
      if (visited.has(currentId)) break;
      visited.add(currentId);

      const ctx = this.conversationMap.get(currentId);
      if (!ctx) break;

      reversed.push({
        conversationId: currentId,
        tabId: ctx.tabId,
        depth: 0,
      });

      const parentId = ctx.parentConversationId?.trim();
      currentId = parentId || "";
    }

    reversed.reverse();
    reversed.forEach((link, i) => {
      link.depth = i;
    });
    return reversed;
  }

  async getConversationIdByTabId(tabId: number): Promise<string | undefined> {
    for (const [convId, ctx] of this.conversationMap.entries()) {
      if (ctx.tabId === tabId) return convId;

      if (ctx.groupId != null && ctx.groupId >= 0) {
        if (ctx.groupTabs?.includes(tabId)) {
          return convId;
        }
      }
    }

    return undefined;
  }

  async getConversationIdByThinkId(thinkId: string): Promise<string | undefined> {
    for (const [convId, ctx] of this.conversationMap.entries()) {
      if (ctx.thinkId === thinkId) return convId;
    }
    return undefined;
  }

  getConversationIdByGroupId(groupId: number): string | undefined {
    for (const [convId, ctx] of this.conversationMap.entries()) {
      if (ctx.groupId === groupId) return convId;
    }
    return undefined;
  }

  getConversationIdByGroupTabId(tabId: number): string | undefined {
    for (const [convId, ctx] of this.conversationMap.entries()) {
      if (ctx.groupTabs?.includes(tabId)) {
        return convId;
      }
    }
    return undefined;
  }

  upsertConversationContext(
    patch: Partial<ConversationContext> & { conversationId: string },
  ): ConversationContext | undefined {
    const conversationId = patch.conversationId;
    if (!conversationId) throw new Error("[ConversationContext] invalid conversationId");

    const prevCtx = this.conversationMap.get(conversationId);
    if (!prevCtx) {
      patch.userId = patch.userId ?? LOCAL_USER_ID;
      patch.createdAt = patch.createdAt ?? Date.now();
      patch.updatedAt = patch.updatedAt ?? Date.now();
      this.conversationMap.set(conversationId, patch as ConversationContext);
      this.queuePersist(patch as ConversationContext);
      return patch as ConversationContext;
    }

    const updateTime = Date.now();
    let nextCtx: ConversationContext | undefined;
    if (prevCtx.mode === "single") {
      nextCtx = {
        conversationId,
        userId: patch.userId ?? prevCtx.userId,
        updatedAt: updateTime,
        createdAt: prevCtx.createdAt,
        mode: "single",
        tabId: patch.tabId ?? prevCtx.tabId,
        lastUserQuestion: patch.lastUserQuestion ?? prevCtx.lastUserQuestion,
        tabInfo: patch.tabInfo ?? prevCtx.tabInfo,
        relayToConversationId: patch.relayToConversationId ?? prevCtx.relayToConversationId,
        thinkId: patch.thinkId ?? prevCtx.thinkId,
        parentConversationId: patch.parentConversationId ?? prevCtx.parentConversationId,
        scheduled: patch.scheduled ?? prevCtx.scheduled,
      };
    } else if (prevCtx.mode === "group") {
      let groupTabs: number[] = patch.groupTabs ?? (prevCtx.groupTabs ?? []);
      if (patch.appendedGroupTabs){
        groupTabs = [...groupTabs, ...patch.appendedGroupTabs];
      }
      if (patch.removedGroupTabs){
        groupTabs = groupTabs.filter((t) => !patch.removedGroupTabs?.includes(t));
      }
      nextCtx = {
        conversationId,
        userId: patch.userId ?? prevCtx.userId,
        updatedAt: updateTime,
        createdAt: prevCtx.createdAt,
        mode: "group",
        groupId: patch.groupId ?? prevCtx.groupId,
        groupColor: patch.groupColor ?? prevCtx.groupColor,
        groupTitle: patch.groupTitle ?? prevCtx.groupTitle,
        groupWorkingTabId: patch.groupWorkingTabId ?? prevCtx.groupWorkingTabId,
        lastUserQuestion: patch.lastUserQuestion ?? prevCtx.lastUserQuestion,
        tabInfo: patch.tabInfo ?? prevCtx.tabInfo,
        groupTabs,
        relayToConversationId: patch.relayToConversationId ?? prevCtx.relayToConversationId,
        thinkId: patch.thinkId ?? prevCtx.thinkId,
        parentConversationId: patch.parentConversationId ?? prevCtx.parentConversationId,
        scheduled: patch.scheduled ?? prevCtx.scheduled,
      };
    }

    if (nextCtx) {
      this.conversationMap.set(conversationId, nextCtx);
      this.queuePersist(nextCtx);
    }

    return nextCtx;
  }

  /**
   * 新 tab 进入某个 group 时调用：将会话当前 tabId 更新为该 tab。
   */
  addTabToConversation(conversationId: string, tabId: number): ConversationContext | undefined {
    const ctx = this.conversationMap.get(conversationId);
    if (!ctx) return undefined;
    return this.upsertConversationContext({ conversationId, tabId });
  }

  async removeConversationByTabId(tabId: number): Promise<void> {
    const conversationId = await this.getConversationIdByTabId(tabId);
    if (!conversationId) return;
    this.removeConversationContext(conversationId);
  }

  removeConversationByGroupId(groupId: number): void {
    const conversationId = this.getConversationIdByGroupId(groupId);
    if (!conversationId) return;
    this.removeConversationContext(conversationId);
  }
  
  removeConversationContext(conversationId: string): void {
    this.conversationMap.delete(conversationId);
    this.queueDeletePersisted(conversationId);
  }

  updateConversationQuestion(conversationId: string, lastUserQuestion: string): void {
    const prevCtx = this.conversationMap.get(conversationId);
    if (!prevCtx) return;
    prevCtx.lastUserQuestion = lastUserQuestion.trim();
    prevCtx.updatedAt = Date.now();
    this.conversationMap.set(conversationId, prevCtx);
    this.queuePersist(prevCtx);
  }

  listConversationContexts(): ConversationContext[] {
    return Array.from(this.conversationMap.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  private static isValidTabId(tabId: unknown): tabId is number {
    return typeof tabId === "number" && Number.isFinite(tabId) && tabId > 0;
  }

  private static isValidGroupId(groupId: unknown): groupId is number {
    return typeof groupId === "number" && Number.isFinite(groupId) && groupId >= 0;
  }

  private isInvalidConversationContext(ctx: ConversationContext): boolean {
    if (!ctx.conversationId) return true;
    if (ctx.mode === "single") {
      return !ConversationContextStore.isValidTabId(ctx.tabId);
    }
    if (ctx.mode === "group") {
      return !ConversationContextStore.isValidGroupId(ctx.groupId);
    }
    return true;
  }

  pruneInvalidConversationContexts(): number {
    let removed = 0;
    for (const id of Array.from(this.conversationMap.keys())) {
      const ctx = this.conversationMap.get(id);
      if (!id || !ctx || this.isInvalidConversationContext(ctx)) {
        this.removeConversationContext(id);
        removed++;
      }
    }
    return removed;
  }
}

/** Service worker 内全局单例 */
export const conversationContextStore = new ConversationContextStore();

export function replaceConversationMapsFromPersisted(entries: ConversationContext[]): void {
  conversationContextStore.replaceConversationMapsFromPersisted(entries);
}

export function getConversationContext(conversationId: string): ConversationContext | undefined {
  return conversationContextStore.getConversationContext(conversationId);
}

export function getConversationCallChain(conversationId: string): ConversationCallChainLink[] {
  return conversationContextStore.getConversationCallChain(conversationId);
}

export async function getConversationIdByTabId(tabId: number) {
  return await conversationContextStore.getConversationIdByTabId(tabId);
}

export async function getConversationIdByThinkId(thinkId: string) {
  return await conversationContextStore.getConversationIdByThinkId(thinkId);
}

export function getConversationIdByGroupId(groupId: number): string | undefined {
  return conversationContextStore.getConversationIdByGroupId(groupId);
}

export function getConversationIdByGroupTabId(tabId: number): string | undefined {
  return conversationContextStore.getConversationIdByGroupTabId(tabId);
}

export function upsertConversationContext(
  patch: Partial<ConversationContext> & { conversationId: string },
): ConversationContext | undefined {
  return conversationContextStore.upsertConversationContext(patch);
}

export function addTabToConversation(
  conversationId: string,
  tabId: number,
): ConversationContext | undefined {
  return conversationContextStore.addTabToConversation(conversationId, tabId);
}

export function removeConversationByTabId(tabId: number): void {
  conversationContextStore.removeConversationByTabId(tabId);
}

export function removeConversationByGroupId(groupId: number): void {
  conversationContextStore.removeConversationByGroupId(groupId);
}

export function removeConversationContext(conversationId: string): void {
  conversationContextStore.removeConversationContext(conversationId);
}

export function updateConversationQuestion(conversationId: string, lastUserQuestion: string): void {
  conversationContextStore.updateConversationQuestion(conversationId, lastUserQuestion);
}

export function listConversationContexts(): ConversationContext[] {
  return conversationContextStore.listConversationContexts();
}

export function pruneInvalidConversationContexts(): number {
  return conversationContextStore.pruneInvalidConversationContexts();
}


export function generateConversationId(): string {
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}