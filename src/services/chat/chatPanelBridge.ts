import { getContext } from '@/services/Context';

/** 向侧栏 ChatPanel 查询 conversationId 绑定的 tabId */
export async function getTabIdByConversationId(conversationId: string): Promise<number | undefined> {
  const id = typeof conversationId === 'string' ? conversationId.trim() : '';
  if (!id) return undefined;
  try {
    const res = (await getContext().browser.runtime.sendMessage({
      origin: 'background',
      operate: 'chat/getTabIdByConversationId',
      conversationId: id,
    })) as { tabId?: number } | undefined;
    const tabId = res?.tabId;
    return typeof tabId === 'number' && Number.isFinite(tabId) ? tabId : undefined;
  } catch {
    return undefined;
  }
}
